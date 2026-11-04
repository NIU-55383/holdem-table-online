"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), E = require("./catan-engine"), Social = require("./game-social"), { attachCatan } = require("./catan-server");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY = "600000";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/catan-preview") {
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(catan.preview)); return;
  }
  const file = path.join(__dirname, url.pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
const catan = attachCatan(server);
server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
async function main() {
  let browser;
  const errors = [];
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
    async function context() {
      const c = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await c.addInitScript(() => {
        localStorage.setItem("catan-music-enabled", "false");
        const Native = WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) {
            super(...args); window.testSocket = this;
            this.addEventListener("message", e => {
              const m = JSON.parse(e.data);
              if (m.type === "state") window.testState = m;
              if (m.type === "welcome") window.testWelcome = true;
              if (m.type === "error") window.testError = m.message;
            });
          }
        };
      });
      return c;
    }
    async function page(c) {
      const p = await c.newPage(); p.on("pageerror", e => errors.push(e.message));
      await p.goto(base + "/catan.html"); await p.waitForFunction(() => testWelcome);
      return p;
    }
    const send = (p, data) => p.evaluate(d => testSocket.send(JSON.stringify(d)), data);
    async function until(check) {
      for (let i = 0; i < 100; i++) { if (check()) return; await new Promise(r => setTimeout(r, 30)); }
      assert(check(), "Server condition timed out");
    }
    const own = await context(), other = await context();
    let host = await page(own);
    const guest = await page(other);
    await send(host, { type: "create", name: "Alice", seats: 3 });
    await host.locator("#lobby").waitFor();
    const code = await host.locator("#copyCode").textContent(), room = catan.rooms.get(code);
    await send(guest, { type: "join", name: "Bob", code }); await guest.locator("#lobby").waitFor();
    await send(host, { type: "chooseSeat", position: 2 });
    await host.waitForFunction(() => testState.seats[testState.you].position === 2);
    await send(host, { type: "fillBots" }); await host.waitForFunction(() => testState.seats.length === 3);
    await send(host, { type: "start" }); await host.locator("#game").waitFor();
    const g = room.game, owner = room.host, index = room.seats.findIndex(p => p.token === owner), socialId = Social.publicId(room.seats[index]);
    clearTimeout(room.timer);
    while (!g.turn) E.act(g, g.current, E.chooseBotAction(g, g.current));
    g.phase = "main"; g.current = index; g.rolled = true;
    g.players[index].resources = [2, 3, 1, 4, 2];
    g.players[index].development.push({ type: "vp", turn: 0 });
    await send(host, { type: "chat", text: "" });
    await host.waitForFunction(() => testState.game.phase === "main");
    const assets = JSON.stringify(g), saved = await host.evaluate(() => JSON.parse(localStorage.getItem("catan-saved-rooms")));
    assert.equal(saved[0].code, code); assert.equal(saved[0].token, owner);
    assert.equal(index, 2, "Host is person-bound, not seat zero");
    await host.close(); await until(() => !room.seats[index].ws);
    host = await page(own);
    assert.equal(await host.evaluate(() => Boolean(window.testState)), false, "A fresh tab never takes a seat automatically");
    for (const width of [1440, 390, 320]) {
      await host.setViewportSize({ width, height: 900 }); await host.locator("#resumeRoom").scrollIntoViewIfNeeded();
      assert(await host.locator("#resumeRoom").isVisible());
      assert(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await host.screenshot({ path: path.join(__dirname, "test-results", `catan-rejoin-${width}.png`) });
    }
    await host.fill("#name", "Alice"); await host.fill("#code", code); await host.click("#join");
    await host.locator("#game").waitFor();
    assert.equal(room.host, owner); assert.equal(room.seats.length, 3); assert.equal(Social.publicId(room.seats[index]), socialId);
    assert.equal(JSON.stringify(g), assets, "Closing and reopening preserves every game asset");
    assert.equal(await host.evaluate(() => testState.you === testState.host), true);
    const stranger = await page(await context());
    await stranger.fill("#name", "Alice"); await stranger.fill("#code", code); await stranger.click("#join");
    await stranger.waitForFunction(() => window.testError?.includes("Room is full"));
    assert.equal(await stranger.locator("#game").isVisible(), false, "Same name is not proof of seat ownership");
    await stranger.evaluate(code => localStorage.setItem("catan-saved-rooms", JSON.stringify([{code, name:"Alice", token:"a".repeat(48), updated:Date.now()}])), code);
    await stranger.reload(); await stranger.waitForFunction(() => testWelcome); await stranger.click("#resumeRoom");
    await stranger.waitForFunction(() => document.getElementById("notice").textContent.includes("Could not restore"));
    assert.equal(await stranger.locator("#game").isVisible(), false, "A forged saved token cannot recover another person's seat");
    assert.equal(room.host, owner); assert.equal(room.seats.length, 3);
    await stranger.close();
    await host.close(); await until(() => !room.seats[index].ws);
    room.roomControl.hostOffline.since = Date.now() - 300001;
    await until(() => room.host !== owner);
    host = await page(own); await host.click("#resumeRoom"); await host.locator("#game").waitFor();
    assert.equal(await host.evaluate(() => testState.you === testState.host), false, "Late return does not reclaim host");
    assert.equal(JSON.stringify(g), assets);
    // A kicked offline person's saved credential may authenticate, but must never auto-fill the vacancy.
    await host.close(); await until(() => !room.seats[index].ws);
    await send(guest, { type: "roomControl", action: "kick", target: socialId });
    await guest.waitForFunction(() => testState.control.paused);
    host = await page(own); await host.click("#resumeRoom");
    await host.waitForFunction(() => document.getElementById("notice").textContent.includes("Could not restore"));
    assert(room.seats[index].vacant); assert.equal(await host.locator("#game").isVisible(), false);
    assert.equal(await host.locator("#resumeRoom").isVisible(), false);
    await host.fill("#name", "Alice"); await host.fill("#code", code); await host.click("#join");
    await host.locator("#game").waitFor(); assert(!room.seats[index].vacant);
    assert.notEqual(Social.publicId(room.seats[index]), socialId); assert.deepEqual(g.players[index].resources, [2, 3, 1, 4, 2]);
    const second = await page(own); await second.click("#resumeRoom"); await second.locator("#game").waitFor();
    await host.waitForFunction(() => document.getElementById("connection").textContent.includes("Connected elsewhere"));
    await new Promise(r => setTimeout(r, 2100));
    assert.equal(await second.evaluate(() => testSocket.readyState), 1, "Replaced tab does not steal the session back");
    await host.close(); host = second;
    // Losing the server-side room must remove the stale board after reconnect.
    catan.rooms.delete(code); room.seats[index].ws.close();
    await host.waitForFunction(() => document.getElementById("notice").textContent.includes("Could not restore"));
    assert.equal(await host.locator("#game").isVisible(), false); assert.equal(await host.locator("#setup").isVisible(), true);
    assert.equal(await host.locator("#resumeRoom").isVisible(), false);
    await host.screenshot({ path: path.join(__dirname, "test-results", "catan-room-expired.png") });
    await send(host, { type: "create", name: "Alice", seats: 3 }); await host.locator("#lobby").waitFor();
    await send(host, { type: "leave" }); await host.locator("#setup").waitFor();
    assert.equal(await host.locator("#resumeRoom").isVisible(), false, "Explicit leave clears saved return");
    assert.deepEqual(errors, []);
    console.log("Catan reconnect: closed-tab recovery, full rooms, assets, private cards, host grace/succession, same-name rejection, offline removal, explicit refill, duplicate tabs, expired rooms and mobile layouts passed.");
  } finally {
    await browser?.close();
    for (const room of catan.rooms.values()) clearTimeout(room.timer);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
