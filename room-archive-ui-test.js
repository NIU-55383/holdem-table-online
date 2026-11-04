"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { spawn } = require("node:child_process"), { once } = require("node:events");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const probe = http.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = probe.address().port; await new Promise(r => probe.close(r));
  const server = spawn(process.execPath, [require.resolve("./server")], { windowsHide: true, env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0", CATAN_BOT_DELAY: "600000", BRIDGE_BOT_DELAY: "600000", MILLION_BOT_DELAY: "600000", TRUTH_BOT_DELAY: "600000" }, stdio: ["ignore", "pipe", "pipe"] });
  let backendErrors = "", browser; server.stderr.on("data", c => { backendErrors += c; });
  const errors = [], result = path.join(__dirname, "test-results"); fs.mkdirSync(result, { recursive: true });
  try {
    await once(server.stdout, "data");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    for (const kind of ["catan", "bridge", "gomoku", "xiangqi", "truth", "million", "poker"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
      await context.addInitScript(() => {
        localStorage.setItem("catan-music-enabled", "false"); const Native = WebSocket;
        window.WebSocket = class extends Native { constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", e => {
          const data = JSON.parse(e.data); if (data.type === "state") window.testState = data.room || data;
          if (data.type === "archiveLobby") window.testLobby = data;
          if (data.type === "left") window.testState = null;
          if (data.type === "error") window.testError = data.message;
        }); } };
      });
      const page = await context.newPage(); page.on("pageerror", e => errors.push(`${kind}: ${e.message}`));
      const duel = ["gomoku", "xiangqi"].includes(kind), file = kind === "poker" ? "index.html?game=poker" : duel ? `duel.html?game=${kind}` : `${kind}.html`;
      await page.goto(`http://127.0.0.1:${port}/${file}`);
      if (kind === "truth") await page.click('[data-mode="online"]');
      await page.waitForFunction(() => window.testSocket?.readyState === 1);
      const name = kind === "catan" ? "#name" : kind === "poker" ? "#onlineNameInput" : "#playerName";
      await page.fill(name, "Archive Tester");
      const send = data => page.evaluate(d => testSocket.send(JSON.stringify(d)), data);
      await send({ type: "create", name: "Archive Tester", kind, difficulty: "easy", side: 0, ai: duel, maxPlayers: 3, seats: 3, capacity: 3, boards: 4 });
      await page.waitForFunction(() => Boolean(window.testState));
      if (!duel) { await send({ type: "fillBots" }); await page.waitForFunction(() => testState.control.seats.length >= 3); await send({ type: "start" }); }
      await page.waitForFunction(() => testState.control.started);
      for (let i = 0; i < 4; i++) { if (await page.locator("dialog[open]").count()) await page.keyboard.press("Escape"); }
      await page.locator("[data-room-manage]").click();
      await page.locator('[data-room-action="archiveSave"]').click();
      const downloaded = page.waitForEvent("download"); await page.locator('[data-archive="prepare"]').click();
      const download = await downloaded, saved = path.join(result, `archive-${kind}.json`); await download.saveAs(saved);
      const archive = JSON.parse(fs.readFileSync(saved, "utf8")); assert.equal(archive.game, kind);
      await page.waitForFunction(() => testState.control.archive.saving);
      await page.locator('[data-archive="commit"]').click();
      await page.waitForFunction(() => !window.testState);
      await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(saved);
      await page.locator('[data-archive-seat="0"]').waitFor();
      const code = await page.evaluate(() => testLobby.code); assert.ok(code);
      assert.equal(await page.locator(".archive-dialog .playing-card, .archive-dialog .resource-card").count(), 0);
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await page.locator(".archive-dialog").boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
        assert.ok(await page.locator(".archive-dialog").evaluate(d => d.scrollWidth <= d.clientWidth + 1));
        await page.screenshot({ path: path.join(result, `archive-${kind}-${width}.png`) });
      }
      await page.locator('[data-archive-seat="0"]').click();
      await page.waitForFunction(() => window.testState?.control?.archive?.restoring);
      await page.locator("[data-room-manage]").click();
      while (await page.locator('[data-room-action="fillBot"]').count()) {
        const before = await page.locator('[data-room-action="fillBot"]').count(); await page.locator('[data-room-action="fillBot"]').first().click();
        await page.waitForFunction(n => document.querySelectorAll('[data-room-action="fillBot"]').length < n, before);
      }
      assert.equal(await page.evaluate(() => testState.control.paused), true);
      await page.locator('[data-room-action="archiveContinue"]').click(); await page.waitForFunction(() => !testState.control.paused);
      await context.close(); console.log(`${kind}: browser save/download/restore/seat/resume, desktop + mobile OK`);
    }
    const localContext = await browser.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true });
    const local = await localContext.newPage(); local.on("pageerror", e => errors.push(`truth local: ${e.message}`));
    await local.goto(`http://127.0.0.1:${port}/truth.html`);
    await local.selectOption("#setupPlayers", "3"); await local.fill("#localNames", "Alice\nBob\nCarol"); await local.click("#createBtn");
    await local.locator("#localSaveButton").click();
    const localDownload = local.waitForEvent("download"); await local.locator('[data-archive="prepare"]').click();
    const savedLocal = path.join(result, "archive-truth-local.json"); await (await localDownload).saveAs(savedLocal);
    assert.equal(JSON.parse(fs.readFileSync(savedLocal, "utf8")).progress.playerCount, 3);
    await local.locator('[data-archive="commit"]').click(); await local.locator("#setup").waitFor();
    await local.click('[data-mode="online"]'); await local.fill("#playerName", "Alice");
    await local.waitForFunction(() => document.getElementById("connection").textContent.includes("Connected"));
    await local.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(savedLocal);
    await local.locator('[data-archive-seat="0"]').waitFor();
    assert.equal(await local.locator("[data-archive-seat]").count(), 3);
    await localContext.close(); console.log("truth local: save, clear occupants and import as an online room OK");
    assert.deepEqual(errors, []); assert.equal(backendErrors, "");
  } finally { await browser?.close(); server.kill(); await once(server, "exit"); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
