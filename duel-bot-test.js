"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), crypto = require("node:crypto");
const E = require("./duel-engine"), { startSearch, positionCommand, gomokuPosition, THINK_MS } = require("./duel-bot");
const { assembleNetwork, hashFile, localLinuxBinary } = require("./engine-setup");
const supported = ["win32", "linux"].includes(process.platform) && process.arch === "x64";
async function native(game, level = "easy") {
  const before = JSON.stringify(E.snapshot(game));
  const result = await startSearch(E.snapshot(game), level, { requireNative: true }).done;
  assert.equal(JSON.stringify(E.snapshot(game)), before, "Search must not mutate game state");
  assert.equal(result.engine, game.type === "gomoku" ? "rapfi" : "pikafish");
  assert.equal(result.fallback, false);
  assert.ok(E.legal(game).some(m => m.to === result.move.to && m.from === result.move.from));
  return result;
}
function position(fen) {
  const g = E.createGame("xiangqi");
  assert.equal(g.chess.load(fen), true);
  g.current = g.chess.turn() === "r" ? 0 : 1;
  return g;
}
test("Rapfi: every difficulty wins or blocks a forced five, for both colors", { skip: !supported, timeout: 45000 }, async () => {
  for (const level of E.LEVELS) for (const current of [0, 1]) for (const side of [current, 1 - current]) {
    const g = E.createGame("gomoku");
    [108, 109, 110, 111].forEach(i => g.board[i] = side);
    g.board[107] = 1 - side; g.current = current;
    assert.equal((await native(g, level)).move.to, 112);
  }
});
test("Rapfi: creates a double-four, handles edges and freestyle overlines", { skip: !supported, timeout: 20000 }, async () => {
  const fork = E.createGame("gomoku");
  [110, 111, 113, 82, 97, 127].forEach(i => fork.board[i] = 0);
  [0, 1, 15, 16, 30, 46].forEach(i => fork.board[i] = 1);
  assert.equal((await native(fork, "normal")).move.to, 112);
  for (const stones of [[0, 1, 2, 3], [105, 106, 107, 109, 110]]) {
    const g = E.createGame("gomoku"); stones.forEach(i => g.board[i] = 0);
    const result = await native(g); E.move(g, 0, result.move);
    assert.equal(g.winner, 0);
  }
});
test("Rapfi: empty-board first move is centered", { skip: !supported, timeout: 10000 }, async () => {
  assert.equal((await native(E.createGame("gomoku"))).move.to, 112);
});
test("Rapfi: chronological BOARD preserves actual colors and side-to-move, not row order", { skip: !supported, timeout: 10000 }, async () => {
  const g = E.createGame("gomoku");
  for (const to of [108, 30, 109, 31, 110, 32, 111, 33]) E.move(g, g.current, { to });
  const board = gomokuPosition(E.snapshot(g));
  assert.equal(board.split("\n")[0], "3,7,1");
  assert.equal(board.split("\n").at(-1), "3,2,2");
  assert.equal(board.includes("-1,-1"), false);
  const result = await native(g); E.move(g, 0, result.move);
  assert.equal(g.winner, 0, "Win our own four instead of blocking the opponent's four");
  const synthetic = E.createGame("gomoku");
  synthetic.board[0] = 1; synthetic.board[112] = 0;
  assert.equal(gomokuPosition(E.snapshot(synthetic)).split("\n").at(-1), "-1,-1,2");
});
test("Pikafish: every difficulty captures a hanging rook and recognizes a winning finish", { skip: !supported, timeout: 20000 }, async () => {
  for (const level of E.LEVELS) {
    const g = position("4k4/9/9/9/r3p4/9/9/9/9/R3K4 r - - 0 1");
    assert.deepEqual((await native(g, level)).move, { from: E.index("a0"), to: E.index("a5") });
  }
  const mate = position("4k4/3R5/5R3/9/4P4/9/9/9/9/4K4 r - - 0 1");
  E.move(mate, 0, (await native(mate)).move);
  assert.equal(mate.phase, "over"); assert.equal(mate.winner, 0);
  const black = position("r3k4/9/9/9/R3p4/9/9/9/9/4K4 b - - 0 1");
  assert.equal((await native(black)).move.to, E.index("a5"));
});
test("Pikafish: search uses full move history and legal replies after undo", { skip: !supported, timeout: 15000 }, async () => {
  const g = E.createGame("xiangqi");
  E.move(g, 0, { from: E.index("b2"), to: E.index("e2") });
  assert.equal(positionCommand(E.snapshot(g)), "position startpos moves b2e2");
  E.move(g, 1, (await native(g)).move);
  assert.match(positionCommand(E.snapshot(g)), /^position startpos moves b2e2 [a-i]\d[a-i]\d$/);
  E.undo(g, 2);
  assert.equal(positionCommand(E.snapshot(g)), "position startpos");
  const opening = await native(g, "normal");
  assert.ok(opening.depth >= 6, `Opening search depth: ${opening.depth}`);
  assert.ok(opening.nodes > 1000);
  const custom = position("4k4/9/9/9/r3p4/9/9/9/9/R3K4 r - - 0 1");
  assert.match(positionCommand(E.snapshot(custom)), /^position fen .* w - - 0 1$/);
});
test("Native cancellation resolves only after the child closes; a fresh search still works", { skip: !supported, timeout: 15000 }, async () => {
  for (const type of E.TYPES) {
    const g = E.createGame(type); if (type === "gomoku") E.move(g, 0, { to: 112 });
    const search = startSearch(E.snapshot(g), "hard", { requireNative: true });
    await new Promise(r => setTimeout(r, 80));
    const t = Date.now(); search.cancel(); search.cancel();
    assert.equal(await search.done, null);
    assert.ok(Date.now() - t < 2000);
    await native(g);
  }
});
test("Emergency JS fallback remains cancellable and legal", { timeout: 10000 }, async () => {
  for (const type of E.TYPES) {
    const g = E.createGame(type), result = await startSearch(E.snapshot(g), "easy", { native: false }).done;
    assert.equal(result.fallback, true);
    assert.ok(E.legal(g).some(m => m.to === result.move.to && m.from === result.move.from));
    const search = startSearch(E.snapshot(g), "hard", { native: false }); search.cancel();
    assert.equal(await search.done, null);
  }
  assert.ok(THINK_MS.easy < THINK_MS.normal && THINK_MS.normal < THINK_MS.hard);
});
test("Offline model assembly verifies parts, repairs corrupt output and rejects corrupt input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "duel-model-test-"));
  const digest = x => crypto.createHash("sha256").update(x).digest("hex");
  const network = { file: "model", sha256: digest("firstsecond"), parts: { part1: digest("first"), part2: digest("second") } };
  try {
    fs.writeFileSync(path.join(dir, "part1"), "first"); fs.writeFileSync(path.join(dir, "part2"), "second");
    assembleNetwork(dir, network); assert.equal(hashFile(path.join(dir, "model")), network.sha256);
    fs.writeFileSync(path.join(dir, "model"), "broken"); assembleNetwork(dir, network);
    assert.equal(hashFile(path.join(dir, "model")), network.sha256);
    fs.unlinkSync(path.join(dir, "model")); fs.writeFileSync(path.join(dir, "part2"), "bad");
    assert.throws(() => assembleNetwork(dir, network), /checksum mismatch/);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["part1", "part2"]);
  } finally { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
});

test("Both platform binaries, source archive and split network match pinned checksums", () => {
  const manifest = require("./vendor/engines/manifest.json");
  for (const [name, entry] of Object.entries(manifest)) {
    const dir = path.join(__dirname, "vendor", "engines", name);
    for (const [file, hash] of Object.entries(entry.files)) assert.equal(hashFile(path.join(dir, file)), hash, file);
    if (entry.linuxBuild) assert.equal(hashFile(path.join(dir, entry.linuxBuild.archive)), entry.linuxBuild.sha256);
    if (entry.network) {
      const combined = crypto.createHash("sha256");
      for (const [file, hash] of Object.entries(entry.network.parts)) {
        assert.equal(hashFile(path.join(dir, file)), hash, file);
        combined.update(fs.readFileSync(path.join(dir, file)));
      }
      assert.equal(combined.digest("hex"), entry.network.sha256);
    }
  }
});
test("Cached Linux build requires matching source, recipe and output hashes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "duel-linux-test-"));
  const entry = { linuxBuild: { sha256: "source-hash", recipe: "recipe-v1" } };
  try {
    assert.equal(localLinuxBinary(dir, entry), null);
    const binary = path.join(dir, "pikafish-linux-local"); fs.writeFileSync(binary, "test binary");
    const stamp = { source: "old", recipe: "recipe-v1", sha256: hashFile(binary) };
    const save = () => fs.writeFileSync(path.join(dir, "linux-build.json"), JSON.stringify(stamp));
    save(); assert.equal(localLinuxBinary(dir, entry), null);
    stamp.source = entry.linuxBuild.sha256; save(); assert.equal(localLinuxBinary(dir, entry), binary);
    fs.writeFileSync(binary, "changed"); assert.throws(() => localLinuxBinary(dir, entry), /checksum/);
  } finally { for (const file of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, file)); fs.rmdirSync(dir); }
});
