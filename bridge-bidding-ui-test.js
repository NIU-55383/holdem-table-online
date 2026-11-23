"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), { once } = require("node:events");
const { attachBridge } = require("./bridge-server"), E = require("./bridge-engine");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
const ownHand = [0, 2, 5, 12, 14, 15, 24, 26, 31, 38, 45, 48, 51]; // 15 HCP, 4-3-3-3.
function handPoints(hand) { return hand.reduce((n, c) => n + Math.max(0, 4 - c % 13), 0); }
function deal(room, revision) {
  const game = E.createGame(room.seats.map(p => p.name));
  const rest = Array.from({ length: 52 }, (_, i) => i).filter(c => !ownHand.includes(c));
  game.hands = [ownHand.slice(), rest.slice(0, 13), rest.slice(13, 26), rest.slice(26)];
  game.originalHands = game.hands.map(h => h.slice()); game.revision = revision; room.game = game;
}
async function main() {
  process.env.BRIDGE_BOT_DELAY = "600000";
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const file = path.resolve(__dirname, "." + decodeURIComponent(pathname === "/" ? "/bridge.html" : pathname));
    if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream"); fs.createReadStream(file).pipe(res);
  });
  const api = attachBridge(server); server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const url = `http://127.0.0.1:${server.address().port}/bridge.html`, errors = [], failed = [], dir = path.join(__dirname, "test-results"); fs.mkdirSync(dir, { recursive: true });
  async function player(name) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await context.addInitScript(() => {
      const Native = window.WebSocket; window.testSent = [];
      window.WebSocket = class extends Native {
        constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", e => { const d = JSON.parse(e.data); if (d.type === "state") window.testState = d; if (d.type === "left") window.testState = null; }); }
        send(raw) { window.testSent.push(JSON.parse(raw)); super.send(raw); }
      };
    });
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); page.on("requestfailed", r => failed.push(r.url()));
    await page.goto(url); await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Connected"));
    await page.fill("#playerName", name); return page;
  }
  async function sent(page, data) { await page.evaluate(d => window.testSocket.send(JSON.stringify(d)), data); }
  async function guide(page, trigger, room) {
    const before = room ? JSON.stringify({ game: room.game, seats: room.seats.map(p => p.token), setting: room.biddingHints }) : null;
    const sends = await page.evaluate(() => window.testSent.length);
    await page.locator(trigger).first().focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#rulesDialog").isVisible(), true);
    assert.equal(await page.locator("#biddingGuide").isVisible(), true);
    assert.match(await page.locator("#biddingGuide").innerText(), /A[\s\S]*4[\s\S]*K[\s\S]*3[\s\S]*Q[\s\S]*2[\s\S]*J[\s\S]*1/);
    assert(await page.locator("#biddingGuide li").count() > 0, "Guide uses bullet points");
    if (room?.game) await page.screenshot({ path: path.join(dir, `bridge-bidding-guide-${page.viewportSize().width}.png`) });
    const bounds = await page.evaluate(() => {
      const d = document.querySelector("#rulesDialog"), r = d.getBoundingClientRect(), body = d.querySelector("[data-rules-body]"), heading = d.querySelector(".dialog-heading");
      const initial = heading.getBoundingClientRect().top; body.scrollTop = body.scrollHeight;
      return { bounded: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        clipped: d.scrollWidth > d.clientWidth + 1 || body.scrollWidth > body.clientWidth + 1,
        sticky: heading.getBoundingClientRect().top === initial };
    });
    assert.deepEqual(bounds, { bounded: true, clipped: false, sticky: true });
    await page.keyboard.press("Escape"); assert.equal(await page.locator("#rulesDialog").isVisible(), false);
    assert.equal(await page.locator(trigger).first().evaluate(el => document.activeElement === el), true, "Guide restores keyboard focus");
    assert.equal(await page.evaluate(() => window.testSent.length), sends, "Reading guide sends no request");
    if (room) assert.equal(JSON.stringify({ game: room.game, seats: room.seats.map(p => p.token), setting: room.biddingHints }), before);
  }
  try {
    const alice = await player("Alice"), bob = await player("Bob");
    assert.equal(await alice.locator("#biddingHintsCreate").isChecked(), false);
    await guide(alice, "#setup [data-bidding-guide]");
    assert.equal(await alice.locator("#biddingHintsCreate").isChecked(), false);
    await alice.click("#createBtn"); await alice.waitForFunction(() => window.testState?.seats.length === 1);
    const code = await alice.evaluate(() => window.testState.code), room = api.rooms.get(code);
    assert.equal(room.biddingHints, false);
    await bob.fill("#roomInput", code); await bob.locator("#joinForm button").click(); await bob.waitForFunction(() => window.testState?.seats.length === 2);
    assert.equal(await bob.locator("#biddingHintsLobby").isDisabled(), true);
    await alice.check("#biddingHintsLobby"); await bob.waitForFunction(() => window.testState?.biddingHints === true);
    assert.equal(await bob.locator("#biddingHintsLobby").isChecked(), true);
    await alice.uncheck("#biddingHintsLobby"); await bob.waitForFunction(() => window.testState?.biddingHints === false);
    await alice.check("#biddingHintsLobby"); await alice.waitForFunction(() => window.testState?.biddingHints === true);
    await guide(alice, "#lobby [data-bidding-guide]", room);
    await alice.click("#fillBtn"); await alice.waitForFunction(() => window.testState.seats.length === 4);
    await alice.click("#startBtn"); await alice.waitForFunction(() => window.testState.game?.phase === "auction");
    deal(room, 20); api.broadcast(room); await alice.waitForFunction(() => window.testState.game?.revision === 20); await bob.waitForFunction(() => window.testState.game?.revision === 20);
    assert.equal(await alice.locator("#biddingHintPanel").isVisible(), true);
    assert.match(await alice.locator("#handHcp").innerText(), /15/);
    assert.match(await alice.locator(".hcp-breakdown").innerText(), /A[\s\S]*K[\s\S]*Q[\s\S]*J/);
    assert.match(await alice.locator(".hint-shape").innerText(), /4[\s\S]*3[\s\S]*3[\s\S]*3/);
    assert.match(await alice.locator("#bidRecommendation").innerText(), /1\s*NT/);
    assert.equal(await alice.locator("#biddingHintPanel [data-call], #bidRecommendation button").count(), 0, "Hints cannot submit bids");
    assert.match(await bob.locator("#handHcp").innerText(), new RegExp(String(handPoints(room.game.hands[1]))));
    assert.equal(await bob.locator("#bidRecommendation").isVisible(), false, "Off-turn player has no specific call");
    for (const page of [alice, bob]) {
      const own = await page.evaluate(() => ({ you: window.testState.you, hands: window.testState.game.hands }));
      own.hands.forEach((h, seat) => assert.equal(h === null, seat !== own.you, "Auction projects only this player's cards"));
    }
    for (const width of [1440, 320]) {
      await alice.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      assert(await alice.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No page overflow at ${width}`);
      const clipped = await alice.locator("#biddingHintPanel").evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(clipped, false, `Hint panel fits at ${width}`);
      await guide(alice, "#biddingHintPanel [data-bidding-guide]", room);
      await alice.locator("#biddingHintPanel").scrollIntoViewIfNeeded();
      await alice.screenshot({ path: path.join(dir, `bridge-bidding-hints-${width}.png`), fullPage: true });
    }
    // An invalid in-game toggle cannot change the setting.
    await sent(alice, { type: "biddingHints", enabled: false });
    await alice.waitForFunction(() => document.querySelector("#error").textContent.length > 0);
    assert.equal(room.biddingHints, true);
    // A vacancy pauses the hand; descriptive points remain, but no actionable call is shown.
    const bot = await alice.evaluate(() => window.testState.seats.find(p => p.bot).socialId);
    await sent(alice, { type: "roomControl", action: "kick", target: bot }); await alice.waitForFunction(() => window.testState.control.paused);
    assert.equal(await alice.locator("#bidRecommendation").isVisible(), false);
    assert.match(await alice.locator("#handHcp").innerText(), /15/);
    const vacancy = await alice.evaluate(() => window.testState.seats.find(p => p.vacant).socialId);
    await sent(alice, { type: "roomControl", action: "fillBot", target: vacancy }); await alice.waitForFunction(() => !window.testState.control.paused);
    await alice.reload(); await alice.waitForFunction(() => window.testState?.game?.revision === 20);
    assert.equal(await alice.locator("#biddingHintPanel").isVisible(), true); assert.match(await alice.locator("#handHcp").innerText(), /15/);
    await alice.locator('[data-call="1NT"]').click(); await alice.waitForFunction(() => window.testState.game.auction.length === 1);
    assert.equal(await alice.locator("#bidRecommendation").isVisible(), false);
    for (let i = 0; i < 3; i++) E.act(room.game, E.controller(room.game), { type: "call", call: "P" }); api.broadcast(room);
    await alice.waitForFunction(() => window.testState.game.phase === "play"); assert.equal(await alice.locator("#biddingHintPanel").isVisible(), false);
    await sent(alice, { type: "leave" }); await alice.waitForFunction(() => !window.testState);
    assert.equal(await alice.locator("#biddingHintPanel").isVisible(), false);
    // Default-off games never show hints, and the create-room checkbox can opt a fresh room in.
    const charlie = await player("Charlie"); await charlie.click("#createBtn"); await charlie.waitForFunction(() => window.testState?.seats.length === 1);
    await charlie.click("#fillBtn"); await charlie.waitForFunction(() => window.testState.seats.length === 4); await charlie.click("#startBtn"); await charlie.waitForFunction(() => window.testState.game?.phase === "auction");
    assert.equal(await charlie.locator("#biddingHintPanel").isVisible(), false);
    await sent(charlie, { type: "leave" }); await charlie.waitForFunction(() => !window.testState);
    await charlie.check("#biddingHintsCreate"); await charlie.click("#createBtn"); await charlie.waitForFunction(() => window.testState?.biddingHints === true);
    await charlie.click("#fillBtn"); await charlie.waitForFunction(() => window.testState.seats.length === 4); await charlie.click("#startBtn"); await charlie.waitForFunction(() => window.testState.game?.phase === "auction");
    assert.equal(await charlie.locator("#biddingHintPanel").isVisible(), true);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log("Bridge bidding hints browser checks passed: opt-in creation/lobby, host-only settings, own HCP and shape, legal opening, off-turn/pause/play clearing, private hands, reconnect, read-only guide, keyboard and 320px/1440px layout.");
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
