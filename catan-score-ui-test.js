"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), E = require("./catan-engine"), { attachCatan } = require("./catan-server");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY = "600000";
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, new URL(req.url, "http://localhost").pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
const catan = attachCatan(server);
server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
(async () => {
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync("test-results", { recursive: true });
    const pages = [], errors = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        localStorage.setItem("catan-music-enabled", "false"); window.scoreTestSent = [];
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          send(data) { window.scoreTestSent.push(JSON.parse(data)); return super.send(data); }
          constructor(...args) {
            super(...args); window.testSocket = this;
            this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") window.testState = m; });
          }
        };
      });
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/catan.html`);
      await page.waitForFunction(() => window.testSocket?.readyState === 1);
    }
    const [host, guest] = pages;
    const send = (page, data) => page.evaluate(data => testSocket.send(JSON.stringify(data)), data);
    await send(host, { type: "create", name: "Alice", seats: 3, mapId: "base" }); await host.locator("#lobby").waitFor();
    const code = await host.locator("#copyCode").textContent();
    await send(guest, { type: "join", name: "Bob", code }); await guest.locator("#lobby").waitFor();
    await send(host, { type: "fillBots" }); await host.waitForFunction(() => testState.seats.length === 3);
    await send(host, { type: "start" }); await host.locator("#game").waitFor();
    const room = catan.rooms.get(code), g = room.game; clearTimeout(room.timer);
    while (!g.turn) E.act(g, g.current, E.chooseBotAction(g, g.current));
    g.phase = "main"; g.current = 0; g.rolled = true; g.target = 99;
    g.board.vertices.forEach(v => { v.owner = -1; v.level = 0; });
    g.board.vertices.slice(0, 4).forEach(v => { v.owner = 0; v.level = 2; });
    g.board.vertices.slice(4, 6).forEach(v => { v.owner = 1; v.level = 1; });
    const giveCard = (id, type) => {
      g.deck.splice(g.deck.indexOf(type), 1);
      g.players[id].development.push({ type, turn: g.turn });
    };
    giveCard(0, "vp"); giveCard(0, "knight"); giveCard(1, "vp");
    const sync = async () => {
      const revision = ++g.revision; await send(host, { type: "chat", text: "" });
      for (const page of pages) await page.waitForFunction(r => testState.game.revision === r, revision);
    };
    const score = (page, id) => page.locator(`#players [data-player-id="${id}"] .summary-meta b`).textContent();
    const checkBreakdown = async (page, id, points, visibility) => {
      for (let i=0;i<6;i++) if (await page.locator('dialog[open]').count()) await page.keyboard.press('Escape');
      const before=await page.evaluate(()=>JSON.stringify(scoreTestSent));
      assert.equal(await page.locator('#players [data-score-info]').count(),3);
      await page.locator(`#players [data-score-info="${id}"]`).press('Enter');
      const dialog=page.locator('#scoreInfoDialog');await dialog.waitFor({state:'visible'});
      const actual=await dialog.locator('[data-score-source]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.dataset.scoreSource,Number(n.dataset.scorePoints)])));
      assert.deepEqual(actual,points,'Real server score detail sources match the visible private state');
      assert.equal(Number(await dialog.locator('[data-score-total]').getAttribute('data-score-total')),Object.values(points).reduce((a,b)=>a+b,0));
      assert.equal(await dialog.locator('[data-score-total]').getAttribute('data-score-visibility'),visibility);
      await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
      assert.equal(await page.evaluate(()=>JSON.stringify(scoreTestSent)),before,'Opening and closing real-room scores sends nothing');
    };
    await sync();
    await checkBreakdown(host,0,{cities:8,developmentVP:1},'total');
    await checkBreakdown(guest,0,{cities:8},'public');
    await checkBreakdown(host,2,{},'public');
    assert.equal(await score(host, 0), "8+1");
    assert.equal(await score(guest, 0), "8", "Opponents see only public points");
    assert.equal(await score(host, 1), "2");
    assert.equal(await score(guest, 1), "2+1", "Each player sees their own card points");
    assert.equal(await guest.evaluate(() => testState.game.players[0].development), null);
    // Buying a VP card counts immediately, even though it was bought this turn.
    g.deck.push(g.deck.splice(g.deck.indexOf("vp"), 1)[0]);
    g.players[0].resources = [0, 0, 1, 1, 1]; await sync();
    await host.locator('[data-action="buyDevelopment"]').click();
    await host.waitForFunction(() => testState.game.players[0].score === 10);
    assert.equal(await score(host, 0), "8+2");
    await guest.waitForFunction(() => testState.game.players[0].developmentCount === 3);
    assert.equal(await score(guest, 0), "8");
    const boughtTitle=await host.locator('#players [data-player-id="0"] .summary-meta').getAttribute("title");
    assert.match(boughtTitle,/总分 10.*Total: 10 VP/);assert.match(boughtTitle,/Cities: 4 × 2 VP = 8 VP/);assert.match(boughtTitle,/Victory point development cards: 2 × 1 VP = 2 VP/);
    await checkBreakdown(host,0,{cities:8,developmentVP:2},'total');await checkBreakdown(guest,0,{cities:8},'public');
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568]]) {
      await host.setViewportSize({ width, height });
      await host.locator("#players").scrollIntoViewIfNeeded();
      assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await host.locator("#players .summary-meta").evaluateAll(elements => elements.every(el => {
        const box = el.getBoundingClientRect(), score = el.querySelector("b").getBoundingClientRect();
        return el.scrollWidth <= el.clientWidth && score.left >= box.left && score.right <= box.right && score.top >= box.top && score.bottom <= box.bottom;
      })), true, `Scores fit at ${width}px`);
      await host.screenshot({ path: `test-results/catan-score-${width}.png`, animations: "disabled" });
    }
    await host.reload(); await host.locator("#game").waitFor();
    assert.equal(await score(host, 0), "8+2", "The breakdown survives reconnect");
    await checkBreakdown(host,0,{cities:8,developmentVP:2},'total');
    g.phase = "over"; g.winner = 0; await sync();
    for (const page of pages) {
      assert.equal(await score(page, 0), "8+2");
      assert.equal(await score(page, 1), "2+1");
      assert.equal(await score(page, 2), "0", "Zero bonuses never add +0");
    }
    await checkBreakdown(guest,0,{cities:8,developmentVP:2},'total');
    await checkBreakdown(host,1,{settlements:2,developmentVP:1},'total');
    const revision = g.revision;
    Object.assign(g, E.createGame(room.seats.map(p => p.name), undefined, "tribes"));
    room.mapId = "tribes"; g.revision = revision; g.phase = "main"; g.turn = 1; g.current = 0; g.target = 99;
    g.board.vertices.forEach(v => { v.owner = -1; v.level = 0; });
    g.board.vertices.slice(0, 3).forEach(v => { v.owner = 0; v.level = 2; });
    g.board.vertices.slice(3, 5).forEach(v => { v.owner = 1; v.level = 2; });
    giveCard(0, "vp"); g.players[0].scenarioPoints = 2; g.players[1].scenarioPoints = 1;
    await sync();
    assert.equal(await score(host, 0), "6+3", "Hidden VP cards and tribe tokens share the bonus subtotal");
    assert.equal(await score(guest, 0), "6+2", "Public tribe tokens remain visible without leaking VP cards");
    assert.equal(await score(host, 1), "4+1"); assert.equal(await score(guest, 1), "4+1");
    assert.match(await guest.locator('#players [data-player-id="0"] .summary-meta').getAttribute("title"), /Tribe victory point tokens: 2 × 1 VP = 2 VP.*Hidden VP cards excluded/);
    assert.equal(await guest.evaluate(() => testState.game.players[0].development), null);
    await checkBreakdown(host,0,{cities:6,tribes:2,developmentVP:1},'total');
    await checkBreakdown(guest,0,{cities:6,tribes:2},'public');
    for (const page of pages) await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
    for (const width of [390, 1440]) {
      await host.setViewportSize({ width, height: 1000 }); await host.locator("#players").scrollIntoViewIfNeeded();
      assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await host.screenshot({ path: `test-results/catan-tribe-score-${width}.png`, animations: "disabled" });
    }
    g.players[0].development = []; g.players[0].scenarioPoints = 0; await sync();
    assert.equal(await score(host, 0), "6", "No cards or tribe tokens means one plain score");
    g.phase = "over"; g.winner = 1; await sync();
    for (const page of pages) assert.equal(await score(page, 1), "4+1", "Revealing hands never double-counts tribe tokens");
    assert.deepEqual(errors, []);
    console.log("Catan score UI: own/public/revealed scores, tribe tokens, zero bonuses, purchase, reconnect and desktop/mobile layouts passed.");
  } finally {
    await browser?.close();
    for (const room of catan.rooms.values()) clearTimeout(room.timer);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
