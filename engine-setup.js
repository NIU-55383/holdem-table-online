"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const manifest = require("./vendor/engines/manifest.json");
const root = path.join(__dirname, "vendor", "engines"), prepared = new Map();

function hashFile(file) {
  const hash = crypto.createHash("sha256"), buffer = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, "r");
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
}
function verify(file, hash) {
  if (hashFile(file) !== hash) throw Error(`Engine checksum mismatch: ${path.basename(file)}`);
}
function assembleNetwork(dir, network) {
  const target = path.join(dir, network.file);
  if (fs.existsSync(target) && hashFile(target) === network.sha256) return;
  const temp = `${target}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  const fd = fs.openSync(temp, "wx");
  try {
    for (const [part, hash] of Object.entries(network.parts)) {
      const data = fs.readFileSync(path.join(dir, part));
      if (crypto.createHash("sha256").update(data).digest("hex") !== hash) throw Error(`Engine checksum mismatch: ${part}`);
      let offset = 0;
      while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset);
    }
  } catch (error) { fs.closeSync(fd); fs.unlinkSync(temp); throw error; }
  fs.closeSync(fd);
  try { verify(temp, network.sha256); fs.renameSync(temp, target); }
  finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
function localLinuxBinary(dir, entry) {
  if (!entry.linuxBuild) return null;
  const binary = path.join(dir, "pikafish-linux-local"), stamp = path.join(dir, "linux-build.json");
  if (!fs.existsSync(binary) || !fs.existsSync(stamp)) return null;
  const record = JSON.parse(fs.readFileSync(stamp, "utf8"));
  if (record.source !== entry.linuxBuild.sha256 || record.recipe !== entry.linuxBuild.recipe) return null;
  verify(binary, record.sha256);
  return binary;
}
function probeUci(executable, dir) {
  const result = spawnSync(executable, [], { cwd: dir, input: "uci\nquit\n", encoding: "utf8", timeout: 10000, windowsHide: true });
  return result.status === 0 && /(?:^|\n)uciok\r?\n/.test(result.stdout || "");
}
function setupLinux() {
  const entry = manifest.pikafish, dir = path.join(root, "pikafish"), upstream = path.join(dir, entry.executables.linux);
  verify(upstream, entry.files[entry.executables.linux]); fs.chmodSync(upstream, 0o755);
  const existing = localLinuxBinary(dir, entry);
  if (existing && probeUci(existing, dir) || !existing && probeUci(upstream, dir)) return;
  const archive = path.join(dir, entry.linuxBuild.archive);
  verify(archive, entry.linuxBuild.sha256);
  assembleNetwork(dir, entry.network);
  const build = fs.mkdtempSync(path.join(dir, ".build-"));
  console.log("Building pinned Pikafish source for this Linux runtime (one compiler job)...");
  execFileSync("tar", ["-xzf", archive, "--strip-components=1", "-C", build], { stdio: "inherit" });
  const src = path.join(build, "src");
  // Upstream's net target skips downloading when this already-verified file exists.
  fs.copyFileSync(path.join(dir, entry.network.file), path.join(src, "pikafish.nnue"));
  execFileSync("make", ["-j1", "build", "ARCH=x86-64-sse41-popcnt", "COMP=gcc", "EXE=pikafish-local",
    `GIT_SHA=${entry.linuxBuild.commit}`, `GIT_DATE=${entry.linuxBuild.date}`, "GIT_DIFFINDEX="], { cwd: src, stdio: "inherit", timeout: 1200000 });
  const binary = path.join(dir, "pikafish-linux-local");
  fs.copyFileSync(path.join(src, "pikafish-local"), binary); fs.chmodSync(binary, 0o755);
  if (!probeUci(binary, dir)) throw Error("Locally compiled Pikafish failed the UCI startup check");
  fs.writeFileSync(path.join(dir, "linux-build.json"), JSON.stringify({ source: entry.linuxBuild.sha256, recipe: entry.linuxBuild.recipe, sha256: hashFile(binary) }, null, 2));
}
function prepare(name) {
  if (prepared.has(name)) return prepared.get(name);
  const entry = manifest[name];
  if (!entry || process.arch !== "x64" || !entry.executables[process.platform]) throw Error(`Native engine unavailable on ${process.platform}/${process.arch}`);
  const dir = path.join(root, name), binary = entry.executables[process.platform];
  for (const [file, hash] of Object.entries(entry.files)) {
    if (Object.values(entry.executables).includes(file) && file !== binary) continue;
    verify(path.join(dir, file), hash);
  }
  if (entry.network) assembleNetwork(dir, entry.network);
  const executable = process.platform === "linux" && localLinuxBinary(dir, entry) || path.join(dir, binary);
  if (process.platform !== "win32") fs.chmodSync(executable, 0o755);
  const info = { name, version: entry.version, dir, executable };
  prepared.set(name, info);
  return info;
}
module.exports = { prepare, hashFile, assembleNetwork, localLinuxBinary };
if (require.main === module) (async () => {
  if (process.arch !== "x64" || !["win32", "linux"].includes(process.platform)) {
    console.warn(`No bundled native engine for ${process.platform}/${process.arch}; emergency JavaScript AI will be used.`);
    return;
  }
  if (process.platform === "linux") setupLinux();
  for (const name of Object.keys(manifest)) {
    const engine = prepare(name);
    console.log(`${name} ${engine.version}: verified and ready (${process.platform}/${process.arch})`);
  }
  const E = require("./duel-engine"), { startSearch } = require("./duel-bot");
  for (const type of E.TYPES) {
    const game = E.createGame(type);
    if (type === "gomoku") E.move(game, 0, { to: 112 });
    const result = await startSearch(E.snapshot(game), "easy", { requireNative: true }).done;
    console.log(`${result.engine}: native search OK (depth ${result.depth})`);
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
