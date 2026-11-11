"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), { once } = require("node:events");
const { attachBridge } = require("./bridge-server"), E = require("./bridge-engine");
const { Score } = require("./vendor/bridge-core");
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
  async function checkTrumpLayout(label) {
    assert.equal(await page.locator(".table-trump").isVisible(), true, label);
    const layout = await page.evaluate(() => {
      const trump = document.querySelector(".table-trump"), t = trump.getBoundingClientRect();
      const table = document.querySelector("#table").getBoundingClientRect();
      const occupied = [...document.querySelectorAll(".played, .seat")].map((el) => el.getBoundingClientRect());
      const contract = document.querySelector("#contractPanel").getBoundingClientRect(), auction = document.querySelector("#biddingPanel").getBoundingClientRect();
      return { overlap: occupied.some((r) => Math.min(t.right, r.right) > Math.max(t.left, r.left) && Math.min(t.bottom, r.bottom) > Math.max(t.top, r.top)),
        centered: Math.abs(t.left + t.width / 2 - table.left - table.width / 2) < 1 && Math.abs(t.top + t.height / 2 - table.top - table.height / 2) < 1,
        clipped: trump.scrollWidth > trump.clientWidth || document.documentElement.scrollWidth > innerWidth + 1,
        contractFirst: contract.bottom <= auction.top };
    });
    assert.deepEqual(layout, { overlap: false, centered: true, clipped: false, contractFirst: true }, label);
  }
  async function checkScoreLayout(label) {
    const layout = await page.evaluate(() => {
      const d = document.querySelector("#scoreDialog"), b = document.querySelector("#scoreDetails"), r = d.getBoundingClientRect();
      const heading = d.querySelector(".dialog-heading").getBoundingClientRect(), close = d.querySelector("button").getBoundingClientRect();
      b.scrollTop = b.scrollHeight;
      const h = d.querySelector(".dialog-heading").getBoundingClientRect(), c = d.querySelector("button").getBoundingClientRect();
      return { bounded: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
        clipped: d.scrollWidth > d.clientWidth + 1 || b.scrollWidth > b.clientWidth + 1,
        fixedHeading: h.top === heading.top && c.top === close.top && c.bottom <= innerHeight && c.right <= innerWidth,
        scrollable: b.scrollHeight <= b.clientHeight || b.scrollTop > 0 };
    });
    assert.deepEqual(layout, { bounded: true, clipped: false, fixedHeading: true, scrollable: true }, label);
    await page.locator("#scoreDetails").evaluate((el) => el.scrollTop = 0);
  }
  try {
    await page.goto(url + "/bridge.html"); await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Connected"));
    assert.equal(await page.locator('[id*="lesson" i], [id*="tutorial" i], [src*="bridge-lesson"], [href*="bridge-lesson"]').count(), 0);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
      assert.equal(await page.locator("#rulesBtn").isVisible(), true);
      await page.click("#rulesBtn");
      assert.match(await page.locator("#rulesDialog").innerText(), /桥牌规则[\s\S]*Bridge Rules/);
      await page.click('[data-close="rulesDialog"]');
      await page.screenshot({ path: path.join(dir, `bridge-entry-rules-only-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.fill("#playerName", "Alice"); await page.click("#createBtn"); await page.waitForFunction(() => window.testState?.seats.length === 1);
    await page.click("#fillBtn"); await page.waitForFunction(() => window.testState?.seats.length === 4);
    await page.screenshot({ path: path.join(dir, "bridge-lobby-desktop.png"), fullPage: true });
    assert.equal(await page.locator("#lobbySeats [data-social-target]").count(), 3);
    await page.click("#lobbySeats [data-social-target]");
    await page.locator(".reaction-options button").first().click(); await page.waitForSelector(".avatar-reaction");
    await page.click("#startBtn"); await page.waitForFunction(() => window.testState?.game?.phase === "auction");
    assert.equal(await page.locator(".table-trump").count(), 0);
    assert.equal(await page.locator("#contractPanel").isVisible(), false);
    assert.equal(await page.evaluate(() => Object.hasOwn(window.testState, "lesson")), false);
    assert.equal(await page.locator("#handPanel .playing-card").count(), 13);
    await page.locator('[data-call="1NT"]').click(); await page.waitForFunction(() => window.testState.game.auction.length === 1);
    assert.match(await page.locator("#auction").innerText(), /1NT/);
    const room = [...api.rooms.values()][0];
    for (let i = 0; i < 3; i++) E.act(room.game, E.controller(room.game), { type: "call", call: "P" });
    api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "play");
    assert.match(await page.locator(".table-trump").innerText(), /本局无将[\s\S]*No trump[\s\S]*NT/);
    await checkTrumpLayout("no trump before the opening lead");
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
      await checkTrumpLayout(`no trump with four played cards at ${width}`);
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
    const beforeScore = JSON.stringify({ revision: room.game.revision, scores: room.scores, hands: room.game.hands });
    const resultScore = page.locator("#resultPanel .score-link");
    assert.equal(await resultScore.locator("span").textContent(), `+${Math.abs(room.game.result.score)}`);
    await resultScore.focus(); await page.keyboard.press("Enter");
    assert.equal(await page.locator("#scoreDialog").isVisible(), true);
    assert.match(await page.locator("#scoreDetails").innerText(), /定约[\s\S]*Contract[\s\S]*局况[\s\S]*Vulnerability/);
    await page.keyboard.press("Escape");
    assert.equal(await resultScore.evaluate((el) => document.activeElement === el), true);
    assert.equal(JSON.stringify({ revision: room.game.revision, scores: room.scores, hands: room.game.hands }), beforeScore);
    await page.click("#reviewBtn"); assert.equal(await page.locator(".review-hands .playing-card").count(), 52);
    await page.screenshot({ path: path.join(dir, "bridge-result.png"), fullPage: true });
    await page.click("#nextBtn"); await page.waitForFunction(() => window.testState.game.board === 2);
    await page.reload(); await page.waitForFunction(() => window.testState?.game?.board === 2); assert.equal(await page.locator("#handPanel .playing-card").count(), 13);
    assert.equal(await page.locator(".table-trump").count(), 0);
    assert.equal(await page.locator("#contractPanel").isVisible(), false);
    // History fixtures exercise explanation without affecting the live board.
    const scoreCases = [
      { name: "120", contract: { level: 2, strain: "NT", declarer: "N" }, vulnerability: "NvNv", tricksTaken: 8, score: 120, formula: "70 + 50 = 120", rows: ["contract", "bonus"] },
      { name: "doubled", contract: { level: 2, strain: "H", declarer: "E", doubled: true }, vulnerability: "NvV", tricksTaken: 9, score: -870, formula: "120 + 500 + 50 + 200 = 870", rows: ["contract", "bonus", "double-bonus", "overtricks"] },
      { name: "slam", contract: { level: 7, strain: "NT", declarer: "N" }, vulnerability: "VV", tricksTaken: 13, score: 2220, formula: "220 + 500 + 1500 = 2220", rows: ["contract", "bonus", "slam"] },
      { name: "redoubled-down", contract: { level: 4, strain: "S", declarer: "E", redoubled: true }, vulnerability: "NvNv", tricksTaken: 6, score: 1600, formula: "200 + 800 + 600 = 1600", rows: ["undertrick-first", "undertrick-2-3", "undertrick-4-plus"] },
      { name: "down", contract: { level: 4, strain: "S", declarer: "N" }, vulnerability: "VNv", tricksTaken: 8, score: -200, formula: "200 = 200", rows: ["undertricks"] },
      { name: "passout", contract: "Passout", vulnerability: "NvNv", tricksTaken: 0, score: 0, rows: [] },
    ];
    for (const sample of scoreCases) {
      assert.equal(Score.calculate(sample.contract, sample.vulnerability, sample.tricksTaken).score, sample.score);
      room.scores = [{ board: 1, contract: sample.contract, vulnerability: sample.vulnerability, tricksTaken: sample.tricksTaken, score: sample.score, result: sample.contract === "Passout" ? 0 : sample.tricksTaken - 6 - sample.contract.level }];
      api.broadcast(room);
      await page.waitForFunction((score) => window.testState.scores[0].score === score, sample.score);
      if (sample.name === "120") {
        await page.reload(); await page.waitForFunction(() => window.testState?.scores[0]?.score === 120);
      }
      const before = JSON.stringify({ revision: room.game.revision, scores: room.scores, hands: room.game.hands });
      const team = sample.score < 0 ? 1 : 0, button = page.locator(`#scores [data-score-board="1"][data-score-team="${team}"]`);
      for (const [width, height] of [[1440, 1100], [390, 844], [320, 640], [740, 420]]) {
        await page.setViewportSize({ width, height }); await button.click();
        assert.equal(await page.locator(".score-award strong").textContent(), `+${Math.abs(sample.score)}`);
        assert.deepEqual(await page.locator("[data-score-item]").evaluateAll((els) => els.map((el) => el.dataset.scoreItem)), sample.rows);
        if (sample.formula) assert.equal(await page.locator(".score-sum strong").textContent(), sample.formula);
        else assert.match(await page.locator("#scoreDetails").innerText(), /双方得 0 分[\s\S]*both sides score 0/);
        if (sample.name.includes("down")) assert.match(await page.locator("#scoreDetails").innerText(), /定约未完成[\s\S]*Only the defenders/);
        await checkScoreLayout(`${sample.name} score at ${width}x${height}`);
        if (["120", "doubled", "redoubled-down"].includes(sample.name)) await page.screenshot({ path: path.join(dir, `bridge-score-${sample.name}-${width}.png`) });
        await page.click('[data-close="scoreDialog"]');
      }
      await page.locator(`#scores [data-score-board="1"][data-score-team="${1 - team}"]`).click();
      assert.equal(await page.locator(".score-award strong").textContent(), "+0");
      await page.keyboard.press("Escape");
      assert.equal(JSON.stringify({ revision: room.game.revision, scores: room.scores, hands: room.game.hands }), before);
    }
    room.scores = []; api.broadcast(room);
    await page.setViewportSize({ width: 1440, height: 1100 });
    for (const [strain, name, symbol] of [["S", "黑桃 / Spades", "♠"], ["H", "红桃 / Hearts", "♥"], ["D", "方块 / Diamonds", "♦"], ["C", "梅花 / Clubs", "♣"]]) {
      room.game = E.createGame(room.seats.map((s) => s.name), 3);
      for (const call of [`1${strain}`, "P", "P", "P"]) E.act(room.game, E.controller(room.game), { type: "call", call });
      api.broadcast(room); await page.waitForFunction((s) => window.testState.game.contract?.strain === s, strain);
      assert.equal(await page.locator(".table-trump").getAttribute("aria-label"), `本局将牌 / Trump: ${name}`);
      assert.equal(await page.locator(".table-trump strong").textContent(), symbol);
      assert.equal(await page.locator(".table-trump.trump-red").count(), ["H", "D"].includes(strain) ? 1 : 0);
      for (let i = 0; i < 4; i++) E.act(room.game, E.controller(room.game), { type: "play", card: E.legalCards(room.game)[0] });
      api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "trick");
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
        await checkTrumpLayout(`${strain} with four cards at ${width}`);
        await page.screenshot({ path: path.join(dir, `bridge-trump-${strain}-${width}.png`), fullPage: true });
      }
      E.advanceTrick(room.game); api.broadcast(room); await page.waitForFunction(() => window.testState.game.phase === "play");
      await checkTrumpLayout(`${strain} after collecting the trick`);
    }
    room.game = E.createGame(room.seats.map((s) => s.name), 4);
    for (let i = 0; i < 4; i++) E.act(room.game, E.controller(room.game), { type: "call", call: "P" });
    api.broadcast(room); await page.waitForFunction(() => window.testState.game.contract === "Passout");
    assert.equal(await page.locator(".table-trump").count(), 0);
    assert.equal(await page.locator("#contractPanel").isVisible(), false);
    assert.equal(await page.locator('[id*="lesson" i], [id*="tutorial" i]').count(), 0);
    assert.equal(await page.evaluate(() => Object.hasOwn(window.testState, "lesson")), false);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log("Bridge browser checks passed: clickable score calculations (made, doubled, slam, down, passout), history/reconnect, keyboard and mobile/landscape dialogs; persistent trump/NT, contract above auction, no overlap, no teaching UI, rules, avatars, reactions, dummy, cards, audio and reconnect.");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
