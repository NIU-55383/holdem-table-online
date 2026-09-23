"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), E = require("./catan-engine");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY = "600000";
let catan;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/catan-preview") {
    const id = url.searchParams.get("map") || "base";
    const key = id === "base" && Number(url.searchParams.get("players")) > 4 ? "base:5-6" : id;
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(catan.previews.get(key))); return;
  }
  const file = path.join(__dirname, url.pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
catan = require("./catan-server").attachCatan(server);
server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));

(async () => {
  let browser;
  const errors = [];
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync("test-results", { recursive: true });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const send = (page, data) => page.evaluate(data => testSocket.send(JSON.stringify(data)), data);
    const closeDialogs = page => page.evaluate(() => document.querySelectorAll("dialog[open]").forEach(el => el.close()));
    async function page() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        localStorage.setItem("catan-music-enabled", "false");
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) {
            super(...args); window.testSocket = this;
            this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") window.testState = m; });
          }
        };
      });
      const p = await context.newPage(); p.on("pageerror", e => errors.push(e.message));
      await p.goto(`${origin}/catan.html`); await p.waitForFunction(() => window.testSocket?.readyState === 1);
      await closeDialogs(p); return p;
    }
    for (const n of [5, 6]) {
      const host = await page(), guest = await page();
      await host.locator(`[data-seats="${n}"]`).click();
      await host.waitForFunction(() => document.querySelectorAll("#previewBoard .hex-tile").length === 30);
      assert.equal(await host.locator("#previewBoard .harbor-pier").count(), 11);
      await host.locator("#baseRules").click();
      assert.match(await host.locator("#helpTitle").textContent(), /5–6/);
      assert.match(await host.locator("#rulesResourceSupply").textContent(), /24/);
      assert.match(await host.locator("#rulesDevelopmentSupply").textContent(), /34/);
      assert.equal(await host.locator("#rulesPairedTurn").isVisible(), true);
      assert.match(await host.locator("#rulesDevelopment").textContent(), /Knight × 20/);
      await host.locator("#helpAcknowledge").click();
      await host.locator('[data-seats="4"]').click();
      await host.waitForFunction(() => document.querySelectorAll("#previewBoard .hex-tile").length === 19);
      await host.locator("#baseRules").click();
      assert.equal(await host.locator("#rulesPairedTurn").isVisible(), false);
      assert.match(await host.locator("#rulesDevelopmentSupply").textContent(), /25/);
      await host.locator("#helpAcknowledge").click();
      await host.locator(`[data-seats="${n}"]`).click();
      await host.locator('[data-edition="seafarers"]').click(); await closeDialogs(host);
      assert.equal(await host.locator('[data-seats="5"]').isVisible(), false);
      assert.equal(await host.locator('[data-seats="6"]').isVisible(), false);
      await host.locator('[data-edition="base"]').click(); await closeDialogs(host);
      await host.locator(`[data-seats="${n}"]`).click();
      await host.locator("#name").fill("主行动玩家 Host"); await host.locator("#create").click();
      await host.locator("#lobby").waitFor(); await closeDialogs(host);
      const code = await host.locator("#copyCode").textContent();
      await send(guest, { type: "join", code, name: "补充建造玩家 Guest" });
      await guest.locator("#lobby").waitFor(); await closeDialogs(guest);
      await send(guest, { type: "chooseSeat", position: 3 });
      await guest.waitForFunction(() => testState.seats[testState.you].position === 3);
      await host.locator("#fillBots").click(); await host.waitForFunction(n => testState.seats.length === n, n);
      assert.equal(await host.locator("#lobbySeats .lobby-seat").count(), n);
      for (const width of [320, 390, 1440]) {
        await host.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        assert.equal(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Lobby ${n}/${width}`);
      }
      await host.locator("#start").click(); await host.locator("#game").waitFor();
      await guest.locator("#game").waitFor();
      assert.equal(await host.locator("#board .hex-tile").count(), 30);
      assert.equal(await host.locator("#pairedTurnBanner").isVisible(), false);
      const room = catan.rooms.get(code), g = room.game; clearTimeout(room.timer);
      await host.locator("#board [data-vertex]").first().click();
      await host.waitForFunction(() => testState.game.phase === "setupRoad");
      await host.locator("#board [data-edge]").first().click();
      await host.waitForFunction(() => testState.game.current === 1);
      while (g.phase.startsWith("setup")) E.act(g, g.current, E.chooseBotAction(g, g.current));
      g.players.forEach(p => { p.resources = [4, 2, 2, 2, 2]; });
      g.players[0].resources[0] = 0; g.players[3].resources[0] = 8;
      g.bank = E.RES.map((_, r) => 24 - g.players.reduce((sum, p) => sum + p.resources[r], 0));
      E.act(g, 0, { type: "roll" }, () => 0.05);
      async function sync() {
        const rev = ++g.revision; await send(host, { type: "chat", text: "" });
        for (const p of [host, guest]) await p.waitForFunction(rev => testState.game.revision === rev, rev);
        clearTimeout(room.timer);
      }
      await sync(); await host.locator("#pairedTurnBanner").waitFor();
      assert.equal(await host.locator("#players tr").count(), n);
      assert.equal(await host.evaluate(n => new Set(CatanBoard.COLORS.slice(0, n)).size, n), n);
      assert.match(await host.locator("#pairedTurnBanner .active").textContent(), /Host/);
      await host.locator('[data-action="trade"]').click();
      assert.equal(await host.locator('[data-trade-mode="players"]').isEnabled(), true);
      await host.locator('#tradeDialog [data-close]').first().click();
      await guest.evaluate(() => document.getElementById("dice").classList.remove("rolling"));
      await host.locator('[data-action="end"]').click(); await guest.waitForFunction(() => testState.game.pairedTurn.part === 2);
      assert.equal(await guest.locator("#dice").evaluate(el => el.classList.contains("rolling")), false, "Paired turn does not roll again");
      assert.match(await guest.locator("#pairedTurnBanner .active").textContent(), /Guest/);
      assert.match(await guest.locator("#phaseLabel").textContent(), /补充建造/);
      assert.equal(await guest.locator('[data-action="roll"]').count(), 0);
      assert.match(await guest.locator('[data-action="end"]').textContent(), /End Paired Build/);
      await guest.locator('[data-action="trade"]').click();
      assert.equal(await guest.locator('[data-trade-mode="players"]').isDisabled(), true);
      assert.equal(await guest.locator("#bankTradeFields").isVisible(), true);
      const rev = g.revision;
      await guest.locator("#tradeGive").selectOption("0"); await guest.locator("#tradeGet").selectOption("1");
      await guest.locator("#confirmTrade").click(); await guest.waitForFunction(rev => testState.game.revision > rev, rev);
      const roads = g.board.edges.filter(e => e.owner === 3).length;
      await guest.locator('[data-action="road"]').click(); await guest.locator("#board [data-edge]").first().click();
      await guest.waitForFunction(count => testState.game.board.edges.filter(e => e.owner === 3).length > count, roads);
      await guest.locator("#gameBaseRules").click();
      for (const width of [320, 390, 1440]) {
        await guest.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        assert.equal(await guest.locator("#helpDialog").evaluate(el => {
          const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth;
        }), true, `Rules ${n}/${width}`);
      }
      await guest.locator("#helpAcknowledge").click();
      for (const width of [320, 390, 1440]) {
        await guest.setViewportSize({ width, height: width === 1440 ? 1000 : 844 }); await guest.evaluate(() => scrollTo(0, 0));
        await guest.waitForFunction(desktop => document.querySelector(".player-overview").parentElement.classList.contains("board-section") === desktop, width > 740);
        assert.equal(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Game ${n}/${width}`);
        assert.equal(await guest.locator("#pairedTurnBanner").evaluate(el => el.scrollWidth <= el.clientWidth), true, "Banner wraps");
        assert.equal(await guest.locator("#board svg").evaluate(svg => {
          const b = svg.getBBox(), v = svg.viewBox.baseVal;
          return b.x >= v.x - 1 && b.y >= v.y - 1 && b.x + b.width <= v.x + v.width + 1 && b.y + b.height <= v.y + v.height + 1;
        }), true, "Full island and harbors stay inside viewBox");
        assert.equal(await guest.locator(".player-overview").evaluate(el => el.parentElement.classList.contains("board-section")), width > 740);
        await guest.screenshot({ path: `test-results/catan-${n}-players-${width}.png`, fullPage: true, animations: "disabled" });
      }
      await guest.reload(); await guest.locator("#game").waitFor(); await closeDialogs(guest);
      assert.match(await guest.locator("#phaseLabel").textContent(), /补充建造/);
      await guest.locator('[data-action="end"]').click(); await host.waitForFunction(() => testState.game.current === 1 && testState.game.phase === "roll");
      clearTimeout(room.timer); await host.context().close(); await guest.context().close();
      console.log(`${n}-player preview, rules, paired bank trade/build, reconnect and three viewport sizes passed`);
    }
    assert.deepEqual(errors, []); console.log("Catan 5-6 player browser checks passed");
  } finally {
    for (const room of catan.rooms.values()) clearTimeout(room.timer);
    await browser?.close(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
