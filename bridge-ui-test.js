"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), { once } = require("node:events");
const { attachBridge } = require("./bridge-server"), E = require("./bridge-engine");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  process.env.BRIDGE_BOT_DELAY = "60000";
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost"), file = path.resolve(__dirname, "." + decodeURIComponent(url.pathname === "/" ? "/bridge.html" : url.pathname));
    if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream"); fs.createReadStream(file).pipe(res);
  });
  const api = attachBridge(server); server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const errors = [], failed = [], dir = path.join(__dirname, "test-results"); fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native { constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.type === "state") window.testState = d; }); } };
  });
  const page = await context.newPage(); page.on("pageerror", (e) => errors.push(e.message)); page.on("requestfailed", (r) => failed.push(r.url()));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    await page.goto(url + "/bridge.html"); await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Connected"));
    await page.fill("#playerName", "Alice"); await page.click("#createBtn"); await page.waitForFunction(() => window.testState?.seats.length === 1);
    await page.click("#fillBtn"); await page.waitForFunction(() => window.testState?.seats.length === 4);
    await page.screenshot({ path: path.join(dir, "bridge-lobby-desktop.png"), fullPage: true });
    assert.equal(await page.locator("#lobbySeats [data-social-target]").count(), 3);
    await page.click("#lobbySeats [data-social-target]");
    await page.locator(".reaction-options button").first().click(); await page.waitForSelector(".avatar-reaction");
    await page.click("#startBtn"); await page.waitForFunction(() => window.testState?.game?.phase === "auction");
    assert.equal(await page.locator("#handPanel .playing-card").count(), 13);
    await page.locator('[data-call="1NT"]').click(); await page.waitForFunction(() => window.testState.game.auction.length === 1);
    assert.match(await page.locator("#auction").innerText(), /1NT/);
    const room = [...api.rooms.values()][0];
    for (let i = 0; i < 3; i++) E.act(room.game, E.controller(room.game), { type: "call", call: "P" });
    api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "play");
    assert.equal(await page.locator("#dummyPanel").isVisible(), false);
    E.act(room.game, 1, { type: "play", card: E.legalCards(room.game)[0] }); api.broadcast(room);
    await page.waitForFunction(() => window.testState.game.dummyVisible && window.testState.game.controller === 0);
    assert.equal(await page.locator("#dummyPanel .playing-card").count(), 13);
    await page.locator("#dummyPanel .playable").first().click(); assert.equal(room.game.hands[2].length, 13);
    await page.locator("#dummyPanel [data-play]").click(); await page.waitForFunction(() => window.testState.game.counts[2] === 12);
    for (let i = 0; i < 2; i++) E.act(room.game, E.controller(room.game), E.chooseBotAction(room.game, E.controller(room.game)));
    api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "trick");
    await page.screenshot({ path: path.join(dir, "bridge-play-desktop.png"), fullPage: true });
    for (const width of [390, 320, 768, 900, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      await page.screenshot({ path: path.join(dir, `bridge-play-${width}.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `page overflows at ${width}`);
      const overlaps = await page.evaluate(() => { const seats = [...document.querySelectorAll(".seat")].map((n) => n.getBoundingClientRect()), cards = [...document.querySelectorAll(".played")].map((n) => n.getBoundingClientRect()); return seats.some((s) => cards.some((c) => Math.min(s.right, c.right) > Math.max(s.left, c.left) && Math.min(s.bottom, c.bottom) > Math.max(s.top, c.top))); });
      assert.equal(overlaps, false, `seat overlaps trick at ${width}`);
      await page.click("#rulesBtn");
      assert(await page.evaluate(() => { const d = document.querySelector("#rulesDialog"), b = d.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight + 1 && d.scrollWidth <= d.clientWidth; }), `rules bounds at ${width}`);
      await page.locator(".rules").evaluate((el) => el.scrollTop = el.scrollHeight);
      assert(await page.locator(".rule-source").isVisible());
      await page.screenshot({ path: path.join(dir, `bridge-rules-${width}.png`) });
      await page.click('[data-close="rulesDialog"]');
      await page.screenshot({ path: path.join(dir, `bridge-play-${width}.png`), fullPage: true });
    }
    await page.click("#settingsBtn"); await page.locator("#volume").fill("25"); assert.equal(await page.locator("#volumeValue").textContent(), "25%");
    await page.check("#mute"); await page.click('[data-close="settingsDialog"]'); assert.match(await page.locator("#soundBtn").getAttribute("aria-label"), /Unmute/);
    const savedHands = JSON.stringify(room.game.hands);
    await page.click("[data-room-manage]"); await page.locator('[data-room-action="kick"]').first().click();
    assert.equal(await page.locator('[data-room-action="executeKick"]').count(), 0);
    await page.click('[data-room-action="confirmKick"]'); assert.equal(room.seats.some((p) => p.vacant), false);
    await page.click('[data-room-action="cancelKick"]'); assert.equal(room.seats.some((p) => p.vacant), false);
    await page.locator('[data-room-action="kick"]').first().click(); await page.click('[data-room-action="confirmKick"]'); await page.click('[data-room-action="executeKick"]');
    await page.waitForFunction(() => window.testState.control.paused); assert.equal(room.timer, null); assert.equal(JSON.stringify(room.game.hands), savedHands);
    await page.click('[data-room-action="fillBot"]'); await page.waitForFunction(() => !window.testState.control.paused); await page.click("[data-room-close]");
    while (room.game.phase !== "over") { if (room.game.phase === "trick") E.advanceTrick(room.game); else E.act(room.game, E.controller(room.game), E.chooseBotAction(room.game, E.controller(room.game))); }
    api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "over");
    await page.click("#reviewBtn"); assert.equal(await page.locator(".review-hands .playing-card").count(), 52);
    await page.screenshot({ path: path.join(dir, "bridge-result.png"), fullPage: true });
    await page.click("#nextBtn"); await page.waitForFunction(() => window.testState.game.board === 2);
    await page.reload(); await page.waitForFunction(() => window.testState?.game?.board === 2); assert.equal(await page.locator("#handPanel .playing-card").count(), 13);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log("Bridge browser checks passed: desktop/mobile, rules, avatars, reactions, auction, dummy, cards, scores, audio and reconnect.");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
