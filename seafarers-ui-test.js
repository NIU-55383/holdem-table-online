"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), E = require("./catan-engine"), Maps = require("./catan-maps"), { attachCatan } = require("./catan-server");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY = "25";
const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/catan-preview") { const map=url.searchParams.get("map")||"base", key=map+(map!=="base"&&url.searchParams.get("layout")==="random"?":random":""); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(catan.previews.get(key))); return; }
  const file = path.join(__dirname, url.pathname);
  if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css" })[path.extname(file)] || "text/plain");
  fs.createReadStream(file).pipe(res);
});
const catan = attachCatan(server);
server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
(async () => {
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native { constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "state") window.testState = m; }); } };
    });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    async function checkRuleDialog(p, id, label) {
      const contentId = id === "helpDialog" ? "helpContent" : "sailingContent";
      const footerId = id === "helpDialog" ? "helpAcknowledge" : "sailingAcknowledge";
      const dialog = p.locator(`#${id}`), content = p.locator(`#${contentId}`);
      await dialog.waitFor();
      await content.evaluate((el) => { el.scrollTop = 0; });
      const layout = await dialog.evaluate((modal, { contentId, footerId }) => {
        const content = document.getElementById(contentId), box = modal.getBoundingClientRect(), body = content.getBoundingClientRect();
        const heading = modal.querySelector(".dialog-heading").getBoundingClientRect(), footer = document.getElementById(footerId).getBoundingClientRect();
        const close = modal.querySelector("[data-close]").getBoundingClientRect();
        const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
        let node, clippedText = false;
        while ((node = walker.nextNode())) {
          if (!node.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(node);
          if ([...range.getClientRects()].some((r) => r.width && (r.left < body.left - 1 || r.right > body.right + 1))) clippedText = true;
        }
        return {
          fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
          ordered: heading.bottom <= body.top && body.bottom <= footer.top && footer.bottom <= box.bottom,
          overflow: content.scrollWidth > content.clientWidth || modal.scrollWidth > modal.clientWidth,
          controls: close.width >= 43.99 && close.height >= 43.99 && footer.height >= 43.99 && close.right <= box.right,
          clippedText, bodyHeight: body.height
        };
      }, { contentId, footerId });
      assert.equal(layout.fits, true, `${label}: whole rules dialog stays within the phone viewport`);
      assert.equal(layout.ordered, true, `${label}: heading, scroll area and footer must not overlap`);
      assert.equal(layout.overflow, false, `${label}: no horizontal clipping or scrolling`);
      assert.equal(layout.clippedText, false, `${label}: every bilingual text line wraps within the scroll area`);
      assert.equal(layout.controls, true, `${label}: touch controls remain at least 44px`); assert.ok(layout.bodyHeight >= 40);
      await p.screenshot({ path: `test-results/rules-${label}-top.png` });
      await content.evaluate((el) => { el.scrollTop = el.scrollHeight; });
      assert.equal(await content.evaluate((el) => {
        const body = el.getBoundingClientRect(), last = el.lastElementChild.getBoundingClientRect();
        return last.top >= body.top && last.bottom <= body.bottom + 1;
      }), true, `${label}: the final rulebook link can be scrolled fully into view`);
      await p.screenshot({ path: `test-results/rules-${label}-bottom.png` });
      await content.evaluate((el) => { el.scrollTop = 0; });
    }
    // Real mobile emulation catches fixed-width dialogs that desktop resize checks miss.
    const phoneContext = await browser.newContext({ viewport: { width: 393, height: 735 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
    const phone = await phoneContext.newPage(); phone.on("pageerror", (e) => errors.push(e.message));
    await phone.goto(`http://127.0.0.1:${server.address().port}/catan.html?edition=seafarers`);
    assert.equal(await phone.locator("dialog[open]").count(), 0, "Entering Seafarers never opens rules automatically");
    await phone.locator("#seafarerRules").click();
    await phone.locator("#sailingDialog").waitFor();
    for (const [width, height] of [[393,735], [320,568], [844,390], [1440,1000]]) {
      await phone.setViewportSize({ width, height });
      await checkRuleDialog(phone, "sailingDialog", `seafarers-${width}`);
    }
    await phone.setViewportSize({ width: 393, height: 735 });
    const body = await phone.locator("#sailingContent").boundingBox(), touch = await phoneContext.newCDPSession(phone);
    const x = body.x + body.width / 2, y = body.y + body.height - 25;
    await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let n = 1; n <= 10; n++) await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - n * 12 }] });
    await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await phone.waitForFunction(() => document.getElementById("sailingContent").scrollTop > 0);
    await touch.detach();
    await phone.locator("#sailingAcknowledge").click();
    assert.equal(await phone.locator("dialog[open]").count(), 0, "Closing general rules does not open map rules");
    await phone.locator("#mapRules").click();
    await phone.locator("#sailingContent .map-rules-preview svg").waitFor();
    await phone.locator("#sailingAcknowledge").click();
    for (const map of Maps.maps) {
      await phone.locator("#mapChoice").selectOption(map.id);
      assert.equal(await phone.locator("dialog[open]").count(), 0, "Changing map leaves rules closed");
      await phone.locator("#mapRules").click();
      await phone.locator("#sailingContent .map-rules-preview svg").waitFor();
      for (const [width, height] of [[320,568], [393,735], [844,390]]) {
        await phone.setViewportSize({ width, height });
        await checkRuleDialog(phone, "sailingDialog", `${map.id}-${width}`);
      }
      await phone.locator("#sailingAcknowledge").click();
    }
    await phone.locator('[data-edition="base"]').click();
    assert.equal(await phone.locator("dialog[open]").count(), 0);
    await phone.locator("#baseRules").click();
    for (const [width, height] of [[320,568], [393,735], [844,390]]) {
      await phone.setViewportSize({ width, height });
      await checkRuleDialog(phone, "helpDialog", `base-${width}`);
    }
    await phone.locator('[data-close="helpDialog"]').click();
    assert.equal(await phone.locator("#helpDialog").isVisible(), false);
    await phoneContext.close();
    async function checkRuleToolbar(p, expected, name, width, target = 10) {
      await checkVictoryTarget(p, target, `${name}-${width}`);
      assert.deepEqual(await p.locator(".game-rule-links > button:visible").evaluateAll((buttons) => buttons.map((b) => b.id)), expected);
      assert.equal(await p.locator(".game-topbar").evaluate((bar) => {
        const bounds = bar.getBoundingClientRect();
        const children = [...bar.children].map((el) => el.getBoundingClientRect());
        const buttons = [...bar.querySelectorAll("button")].filter((el) => !el.hidden);
        return children.every((a, i) => a.left >= bounds.left && a.right <= bounds.right + 1 && a.top >= bounds.top && a.bottom <= bounds.bottom + 1
          && children.every((b, j) => i === j || a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1))
          && buttons.every((b) => b.scrollWidth <= b.clientWidth && b.scrollHeight <= b.clientHeight);
      }), true, "Toolbar groups and labels must not overlap or clip");
      assert.equal(await p.locator(".game-rule-links > button:visible").evaluateAll((buttons) => {
        const first = buttons[0].getBoundingClientRect();
        return buttons.every((button) => Math.abs(button.getBoundingClientRect().top - first.top) < 1);
      }), true, "Rule entry points stay together on one row");
      assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await p.locator(".game-topbar").screenshot({ path: `test-results/${name}-rule-toolbar-${width}.png` });
    }
    async function checkVictoryTarget(p, target, label) {
      assert.equal(await p.locator("#victoryTargetValue").textContent(), String(target));
      assert.match(await p.locator("#victoryTarget").textContent(), /胜利目标 \/ Target/);
      assert.equal(await p.locator("#victoryTarget svg").count(), 1);
      assert.equal(await p.locator("#victoryTarget").evaluate(el => {
        const r = el.getBoundingClientRect(), board = document.querySelector("#boardViewport").getBoundingClientRect();
        const phase = document.querySelector("#phaseLabel").getBoundingClientRect();
        return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= board.top + 1 && (phase.width === 0 || phase.right <= r.left) && el.scrollWidth <= el.clientWidth;
      }), true, "Victory target fits above the board, clear of stage text and map");
      await p.locator(".board-toolbar").screenshot({path:`test-results/victory-target-${label}.png`});
    }
    async function checkPlayerSummary(p, game, name, width) {
      const seafarers = Boolean(game.board.islands), visible = E.publicGame(game, 0);
      assert.equal(await p.locator("#islandPointsHeading").isVisible(), seafarers);
      assert.equal(await p.locator("#players .island-points").count(), seafarers ? game.players.length : 0);
      assert.equal(await p.locator("#longestRouteHeading").getAttribute("title"), seafarers ? "最长商路 / Longest Route" : "最长道路 / Longest Road");
      for (const player of visible.players) {
        const row = p.locator(`#players [data-player-id="${player.id}"]`);
        assert.equal(Number(await row.locator(".longest-count b").textContent()), visible.roadLengths[player.id]);
        assert.equal(await row.locator(".longest-count").evaluate((el) => el.classList.contains("route-holder")), game.longest === player.id);
        assert.equal(Number(await row.locator(".road-count b").first().textContent()), player.roads);
        assert.equal(Number(await row.locator(".summary-meta b").textContent()), player.score);
        if (seafarers) {
          assert.equal(Number(await row.locator(".island-points b").textContent()), player.islandPoints);
          assert.equal(Number(await row.locator(".ship-count b").textContent()), player.ships);
          assert.equal(await row.locator(".island-points").evaluate((el) => el.nextElementSibling.classList.contains("resource-count")), true);
        }
      }
      const layout = await p.locator(".player-summary").evaluate((table) => {
        const failures = [];
        for (const cell of table.querySelectorAll("th, td")) {
          if (cell.hidden) continue;
          if (cell.scrollWidth > cell.clientWidth + 1) failures.push(`overflow ${cell.className || cell.textContent}`);
          const bounds = cell.getBoundingClientRect();
          for (const el of cell.querySelectorAll("b, small, svg")) {
            const rect = el.getBoundingClientRect();
            if (rect.width && (rect.left < bounds.left - 1 || rect.right > bounds.right + 1)) failures.push(`outside ${el.textContent || el.tagName}`);
          }
        }
        return failures;
      });
      assert.deepEqual(layout, [], `${name} player summary must fit at ${width}px`);
      await p.locator(".player-overview").screenshot({ path: `test-results/${name}-player-summary-${width}.png` });
    }
    async function recreateBeforeFirstSettlement(p, edition, ruleButtons) {
      await p.locator('#game[data-phase="setupSettlement"]').waitFor();
      await p.locator("#game [data-leave]").click();
      await p.locator("#confirmLeave").click();
      await p.locator("#setup").waitFor({ state: "visible" });
      await p.locator("#create").click();
      await p.locator("#lobby").waitFor({ state: "visible" });
      assert.equal(await p.locator("dialog[open]").count(), 0, "New rooms do not force rules reading");
      const room = catan.rooms.get(await p.locator("#copyCode").textContent());
      await p.locator("#fillBots").click(); await p.locator("#start:not([disabled])").click();
      await p.locator('#game[data-phase="setupSettlement"]').waitFor();
      assert.equal(room.game.current, 0);
      for (const button of ruleButtons) {
        await p.locator(`#${button}`).click();
        await p.locator(button === "gameBaseRules" ? "#helpAcknowledge" : "#sailingAcknowledge").click();
      }
      const legal = E.legal(room.game, 0).settlements;
      assert.ok(legal.length > 0);
      assert.equal(await p.locator("#board [data-vertex]").count(), legal.length, `${edition}: all initial settlement targets must be clickable after reading rules in a new room, without reloading`);
      return room;
    }
    const baseContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const base = await baseContext.newPage();
    base.on("pageerror", (e) => errors.push(e.message));
    await base.goto(`http://127.0.0.1:${server.address().port}/catan.html`);
    await base.getByText("已连接 / Connected", { exact: true }).waitFor();
    assert.equal(await base.locator("#baseRules").isVisible(), true);
    assert.equal(await base.locator("#seafarerSetup").isVisible(), false);
    for (const [width, height] of [[320,568], [390,844], [1440,1000]]) {
      await base.setViewportSize({ width, height });
      await base.locator("#baseRules").click();
      assert.match(await base.locator("#helpTitle").textContent(), /基础版规则.*Base Game Rules/);
      assert.match(await base.locator("#rulesVictory").textContent(), /10 victory points/);
      assert.match(await base.locator("#rulesVictoryCard").textContent(), /10 points/);
      assert.equal(await base.locator("#buildingCosts .cost-row").count(), 4);
      assert.equal(await base.locator('[data-cost="ship"]').count(), 0);
      assert.equal(await base.locator("#rulesDevelopment > div").count(), 5);
      assert.match(await base.locator("#helpContent").textContent(), /5 settlements, 4 cities and 15 roads/);
      assert.match(await base.locator("#helpContent").textContent(), /14 Knights, 5 Victory Points, 2 Road Building, 2 Monopoly and 2 Year of Plenty/);
      assert.match(await base.locator("#helpContent").textContent(), /before or after rolling/);
      assert.deepEqual(await base.locator("#buildingCosts .cost-resources").evaluateAll((rows) => rows.map((r) => r.children.length)), [2,4,5,3]);
      const framed = await base.evaluate(() => {
        const modal = document.getElementById("helpDialog"), content = document.getElementById("helpContent");
        const box = modal.getBoundingClientRect(), body = content.getBoundingClientRect();
        const heading = modal.querySelector(".dialog-heading").getBoundingClientRect(), footer = document.getElementById("helpAcknowledge").getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
          && heading.bottom <= body.top && body.bottom <= footer.top && footer.bottom <= box.bottom
          && content.scrollWidth <= content.clientWidth && content.scrollHeight > content.clientHeight;
      });
      assert.equal(framed, true, `Rules fit at ${width}px, with a scrolling body and visible controls`);
      await base.screenshot({ path: `test-results/catan-base-rules-${width}.png` });
      await base.locator("#rulesDevelopment").scrollIntoViewIfNeeded();
      await base.screenshot({ path: `test-results/catan-base-development-${width}.png` });
      await base.locator("#helpContent > .rules-link").scrollIntoViewIfNeeded();
      await base.locator("#helpAcknowledge").click();
      await base.locator("#helpButton").click();
      assert.equal(await base.locator("#helpContent").evaluate((el) => el.scrollTop), 0);
      await base.keyboard.press("Escape");
      assert.equal(await base.locator("#helpDialog").isVisible(), false);
    }
    // Switching editions keeps their distinct rule entry points and supports rereading.
    await base.locator('[data-edition="seafarers"]').click();
    assert.equal(await base.locator("dialog[open]").count(), 0);
    assert.equal(await base.locator("#baseRules").isVisible(), false);
    await base.locator('[data-edition="base"]').click();
    assert.equal(await base.locator("dialog[open]").count(), 0);
    await base.locator("#baseRules").click();
    await base.locator("#helpDialog").waitFor({ state: "visible" });
    await base.locator('[data-close="helpDialog"]').click();
    await base.locator("#name").fill("Reader"); await base.locator("#create").click();
    await base.locator("#lobby").waitFor({ state: "visible" });
    await base.locator("#lobbyMapRules").click();
    await base.locator("#helpAcknowledge").click();
    const baseRoom = catan.rooms.get(await base.locator("#copyCode").textContent());
    await base.locator("#fillBots").click(); await base.locator("#start:not([disabled])").click();
    await base.locator("#board [data-vertex]").first().waitFor();
    const baseRevision = baseRoom.game.revision;
    for (const width of [320,390,1440]) {
      await base.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await checkRuleToolbar(base, ["gameBaseRules"], "base", width);
      await base.locator("#gameBaseRules").click();
      assert.match(await base.locator("#helpTitle").textContent(), /Base Game Rules/);
      await base.locator("#helpAcknowledge").click();
      await checkPlayerSummary(base, baseRoom.game, "base", width);
    }
    await base.locator('[data-action="help"]').click(); await base.locator("#helpAcknowledge").click();
    assert.equal(baseRoom.game.revision, baseRevision, "Reading rules must not change the game");
    const nextBase = await recreateBeforeFirstSettlement(base, "base", ["gameBaseRules"]);
    const firstBaseSite = await base.locator("#board [data-vertex]").first().getAttribute("data-vertex");
    await base.locator(`#board [data-vertex="${firstBaseSite}"]`).click();
    await base.locator('#game[data-phase="setupRoad"]').waitFor();
    assert.equal(nextBase.game.board.vertices[Number(firstBaseSite)].owner, 0);
    await baseContext.close(); clearTimeout(baseRoom.timer);
    await page.goto(`http://127.0.0.1:${server.address().port}/catan.html?edition=seafarers`);
    await page.getByText("已连接 / Connected", { exact: true }).waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.locator("#seafarerRules").click();
    await page.locator("#sailingTitle").getByText("航海家规则", { exact: false }).waitFor();
    await page.locator("#sailingAcknowledge").click();
    await page.locator("#mapRules").click();
    await page.locator("#sailingTitle").getByText("扬帆出海1", { exact: false }).waitFor();
    await page.locator("#sailingAcknowledge").click();
    for (const map of Maps.maps) {
      await page.locator("#mapChoice").selectOption(map.id);
      assert.equal(await page.locator("dialog[open]").count(), 0);
      for (const layout of ["default", "random"]) {
        await page.locator(`#layoutChoice [data-layout="${layout}"]`).click();
        await page.waitForFunction(({id,count,layout}) => document.getElementById("previewBoard").dataset.map === id && document.getElementById("previewBoard").dataset.layout === layout && document.querySelectorAll("#previewBoard .hex-tile").length === count, {id:map.id,count:map.tiles.length,layout});
        assert.equal(await page.locator("#previewBoard .fog-tile").count(),map.family==="fog"?12:0);
        for(const width of [320,390,1440]) {
          await page.setViewportSize({width,height:width===1440?1000:844});
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          assert.equal(await page.locator("#layoutChoice button").evaluateAll((buttons)=>buttons.every((b)=>b.scrollWidth<=b.clientWidth)),true);
          await page.locator("#previewBoard").screenshot({path:`test-results/seafarers-${map.id}-${layout}-${width}.png`});
        }
      }
    }
    await page.setViewportSize({width:390,height:844});await page.locator('#layoutChoice [data-layout="default"]').click();
    await page.locator("#mapChoice").selectOption("shores-2");
    await page.locator("#name").fill("Captain"); await page.locator("#create").click();
    await page.locator("#lobby").waitFor({ state: "visible" });
    assert.equal(await page.locator("dialog[open]").count(), 0);
    const code = await page.locator("#copyCode").textContent();
    let room = catan.rooms.get(code);
    assert.equal(room.mapId, "shores-2"); assert.equal(room.maxPlayers, 4);
    await page.locator("#fillBots").click(); await page.locator("#start:not([disabled])").click();
    await page.locator("#board [data-vertex]").first().waitFor();
    room = await recreateBeforeFirstSettlement(page, "seafarers", ["gameMapRules", "gameBaseRules", "gameSailingRules"]);
    const g = room.game;
    // Pick an actual coastal site; initial ships should not require a confirmation click.
    const site = E.legal(g, 0).settlements.find((vId) => {
      const old = g.setupVertex; g.setupVertex = vId; const ok = E.shipSites(g,0,true).length; g.setupVertex = old; return ok;
    });
    await page.locator(`#board [data-vertex="${site}"]`).tap();
    await page.locator('[data-action="ship"]:not([disabled])').click();
    await page.locator("#board [data-edge]").first().click();
    assert.equal(g.board.edges.filter((e) => e.owner === 0 && e.kind === "ship").length, 1);
    assert.equal(await page.locator("#selection").isVisible(), false);
    await page.waitForFunction(() => window.testState?.game?.current === 0 && window.testState.game.phase === "setupSettlement");
    await page.locator("#board [data-vertex]").first().click(); await page.locator("#board [data-edge]").first().click();
    await page.locator('#game[data-phase="roll"]').waitFor();
    async function sync() {
      const revision = ++g.revision;
      await page.evaluate(() => window.testSocket.send(JSON.stringify({ type: "chat", text: "" })));
      await page.waitForFunction((r) => window.testState.game.revision === r, revision);
    }
    const beforeRoadCard = structuredClone(g);
    g.deck.splice(g.deck.indexOf("roads"), 1); g.players[0].development.push({ type: "roads", turn: 0 });
    for (const phase of ["roll", "main"]) {
      g.phase = phase; g.rolled = phase === "main"; await sync();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('[data-dev="roads"]').click();
      await page.locator("[data-cancel-development]").waitFor();
      await page.locator('[data-action="ship"]').click();
      assert.ok(await page.locator("#board [data-edge]").count() > 0);
      assert.equal(E.legal(g, 0).cancelDevelopment, true, "Switching to ships is not a placement");
      if (phase === "roll") {
        await page.reload(); await page.locator("[data-cancel-development]").waitFor();
        assert.equal(await page.locator("dialog[open]").count(), 0, "Reconnecting does not interrupt play with rules");
        assert.equal(await page.evaluate(() => window.testState.game.legal.cancelDevelopment), true, "Reconnecting preserves a pending cancellation");
      }
      await page.locator("[data-cancel-development]").scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-results/seafarers-roads-cancel-${phase}.png` });
      await page.locator("[data-cancel-development]").click();
      await page.locator(`#game[data-phase="${phase}"]`).waitFor();
      assert.equal(g.players[0].development.at(-1).type, "roads");
      assert.equal(g.developmentPlayed, false);
      assert.equal(await page.locator("#board [data-edge]").count(), 0);
    }
    await page.locator('[data-dev="roads"]').click(); await page.locator("[data-cancel-development]").waitFor();
    await page.locator('[data-action="ship"]').click();
    const firstShip = Number(await page.locator("#board [data-edge]").first().getAttribute("data-edge"));
    await page.locator(`#board [data-edge="${firstShip}"]`).click();
    await page.waitForFunction((edge) => window.testState.game.board.edges[edge].owner === 0, firstShip);
    assert.equal(await page.locator("[data-cancel-development]").count(), 0, "The first ship commits the card");
    assert.equal(E.legal(g, 0).cancelDevelopment, false);
    Object.assign(g, beforeRoadCard, { revision: g.revision + 1 }); await sync();
    const originalDiscoveries = g.players[0].discovered;
    g.players[0].discovered = [1, 2]; await sync();
    for (const width of [320,390,1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      const beforeRules = g.revision;
      await checkRuleToolbar(page, ["gameMapRules", "gameBaseRules", "gameSailingRules"], "seafarers", width, g.target);
      await page.locator("#gameMapRules").click();
      assert.match(await page.locator("#sailingTitle").textContent(), /New Shores 2/);
      await page.locator("#sailingAcknowledge").click();
      await page.locator("#gameBaseRules").click();
      assert.match(await page.locator("#helpTitle").textContent(), /Core Rules/);
      assert.match(await page.locator("#rulesVictory").textContent(), /14 victory points/);
      await page.locator("#helpAcknowledge").click();
      await page.locator("#gameSailingRules").click();
      assert.match(await page.locator("#sailingTitle").textContent(), /Seafarers Rules/);
      await page.locator("#sailingAcknowledge").click();
      assert.equal(g.revision, beforeRules, "All three rule entry points leave the game unchanged");
      await checkPlayerSummary(page, g, "seafarers", width);
      await page.screenshot({ path: `test-results/seafarers-game-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "No horizontal page overflow");
      const geometry = await page.locator("#board svg").evaluate((svg) => {
        const box = svg.viewBox.baseVal;
        return [...svg.querySelectorAll(".hex-tile > polygon:first-of-type")].every((p) => {
          const r = p.getBBox(); return r.x >= box.x && r.y >= box.y && r.x+r.width <= box.x+box.width && r.y+r.height <= box.y+box.height;
        });
      }); assert.equal(geometry, true, "All hexes inside the board viewBox");
    }
    g.players[0].discovered = originalDiscoveries; await sync();
    await page.locator('[data-action="help"]').click();
    assert.match(await page.locator("#helpTitle").textContent(), /Core Rules/);
    assert.match(await page.locator("#rulesVictory").textContent(), /14 victory points/);
    assert.match(await page.locator("#rulesVictoryCard").textContent(), /14 points/);
    assert.equal(await page.locator('[data-cost="ship"]').count(), 1);
    assert.equal(await page.locator("#rulesShipSupply").isVisible(), true);
    await page.locator("#helpAcknowledge").click();
    // Host can reconnect, keeping chosen map, permissions, seat and private hand.
    const avatar = room.seats[0].avatar;
    await page.reload(); await page.waitForFunction(() => window.testState?.game?.phase === "roll");
    assert.equal(await page.locator("dialog[open]").count(), 0, "Reconnecting keeps rules closed");
    assert.equal(await page.locator("#supplyDetails").evaluate(el => el.open), true, "Bank is expanded after reconnecting");
    await page.locator('#game[data-phase="roll"]').waitFor();
    assert.equal(room.mapId, "shores-2"); assert.deepEqual(room.seats[0].avatar, avatar);
    await checkRuleToolbar(page, ["gameMapRules", "gameBaseRules", "gameSailingRules"], "seafarers-reconnect", 1440, g.target);
    assert.equal(await page.evaluate(() => window.testState.host === window.testState.you), true);
    assert.equal(await page.evaluate(() => window.testState.game.players[1].resources), null);
    // Pirate target circles, and ship-owner stealing by clicking highlighted ships.
    g.phase = "robber"; g.current = 0; g.resumePhase = "roll"; await sync();
    await page.locator('[data-thief="pirate"]').click();
    assert.equal(await page.locator("#board [data-tile]").count(), E.legal(g,0).pirate.length);
    const sea = g.board.tiles.find((t) => t.resource === -2 && t.id !== g.board.pirate && !t.frame);
    const edges = g.board.edges.filter((e) => e.tiles.includes(sea.id));
    for (let i = 0; i < 2; i++) { Object.assign(edges[i*2], { owner: i+1, kind: "ship" }); g.players[i+1].resources = [2,0,0,0,0]; }
    await page.locator(`#board [data-tile="${sea.id}"]`).click(); await page.locator("#confirmBuild").click();
    await page.locator("#board .built-ship.steal-target").first().waitFor();
    await page.screenshot({ path: "test-results/seafarers-pirate-steal.png", fullPage: true });
    await page.locator('#board .built-ship[data-victim="1"]').first().click();
    await page.locator('#game[data-phase="roll"]').waitFor();
    // Gold must be selectable by a non-current human, and the action must resume the same turn.
    g.current = 1; g.phase = "gold"; g.goldQueue = [{ id: 0, count: 8 }]; g.goldResume = "main";
    room.seats[1].bot = false; room.seats[1].auto = false; room.seats[1].disconnectedAt = Date.now();
    const originalBank = [...g.bank]; g.bank = [2,0,5,5,5]; await sync();
    const addGold = (r) => page.locator(`[data-add-resource="${r}"]`);
    const selectedGold = () => page.locator("#resourceSelected [data-remove-resource]").evaluateAll((cards) => cards.map((card) => Number(card.dataset.removeResource)));
    for (const [width, height] of [[320,568], [390,844], [1440,1000]]) {
      await page.setViewportSize({ width, height });
      await page.locator('[data-special="gold"]').click();
      assert.equal(await page.locator('#resourceDialog input[type="number"]').count(), 0, "Gold resources are picked as cards, not numbers");
      assert.deepEqual(await selectedGold(), [], "Every new gold selection starts empty");
      assert.equal(await page.locator("#confirmResources").isDisabled(), true);
      assert.equal(await addGold(1).isDisabled(), true, "Empty supply cannot be selected");
      await addGold(0).tap(); await addGold(0).tap();
      assert.equal(await addGold(0).isDisabled(), true, "Cannot choose more than the bank holds");
      await page.locator('[data-remove-resource="0"]').first().tap();
      assert.equal(await addGold(0).isDisabled(), false);
      await addGold(0).tap();
      for (let n = 0; n < 5; n++) await addGold(2).tap();
      assert.equal(await page.locator("#confirmResources").isDisabled(), true, "Still need one more resource");
      await addGold(3).tap();
      assert.deepEqual(await selectedGold(), [0,0,2,2,2,2,2,3]);
      assert.equal(await page.locator("#confirmResources").isEnabled(), true);
      assert.equal(await page.locator("#resourceSupply button:not(:disabled)").count(), 0, "No adding beyond the awarded count");
      await page.locator('[data-remove-resource="0"]').first().tap();
      assert.equal(await page.locator("#confirmResources").isDisabled(), true, "Removing a card updates confirmation immediately");
      await addGold(3).tap();
      const layout = await page.locator("#resourceDialog").evaluate((dialog) => {
        const box = dialog.getBoundingClientRect(), choices = document.getElementById("resourceChoices").getBoundingClientRect();
        const hint = document.getElementById("resourceHint").getBoundingClientRect(), confirm = document.getElementById("confirmResources").getBoundingClientRect();
        const cards = [...document.querySelectorAll("#resourceSelected button")].map((el) => el.getBoundingClientRect());
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
          && choices.bottom <= hint.top && hint.bottom <= confirm.top && confirm.bottom <= box.bottom
          && dialog.scrollWidth <= dialog.clientWidth
          && [...dialog.querySelectorAll(".trade-resource-add")].every((el) => el.clientWidth >= 44 && el.scrollWidth <= el.clientWidth)
          && cards.every((a, i) => cards.every((b, j) => i === j || a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top));
      });
      assert.equal(layout, true, `Gold picker and confirmation fit at ${width}px`);
      if (width < 400) assert.ok(await page.locator("#resourceSelected button").evaluateAll((cards) => new Set(cards.map((card) => Math.round(card.getBoundingClientRect().top))).size > 1), "Selected gold resources wrap on phones");
      await page.screenshot({ path: `test-results/seafarers-gold-picker-${width}.png` });
      await page.locator('[data-close="resourceDialog"]').click();
    }
    await page.locator('[data-special="gold"]').click();
    assert.deepEqual(await selectedGold(), []);
    await addGold(0).click(); await addGold(0).click();
    g.bank[0] = 1; await sync();
    assert.deepEqual(await selectedGold(), [0], "Supply changes reconcile an open draft");
    assert.equal(await addGold(0).isDisabled(), true);
    assert.match(await page.locator("#resourceError").textContent(), /Available resources changed/);
    g.goldQueue[0].count = 1; await sync();
    assert.equal(await page.locator("#confirmResources").isEnabled(), true, "A one-card award uses the same picker");
    await page.locator('[data-close="resourceDialog"]').click();
    g.bank = originalBank; g.goldQueue[0].count = 2; await sync();
    await page.locator('[data-special="gold"]').click();
    assert.deepEqual(await selectedGold(), []);
    const previousResources = [...g.players[0].resources], previousStock = g.bank[0];
    await addGold(0).focus(); await page.keyboard.press("Space"); await addGold(0).click();
    await page.locator("#confirmResources").click();
    await page.locator('#game[data-phase="main"]').waitFor(); assert.equal(g.current,1);
    assert.deepEqual(g.players[0].resources, previousResources.map((n, r) => n + (r === 0 ? 2 : 0)));
    assert.equal(g.bank[0], previousStock - 2);
    assert.equal(await page.locator("#resourceDialog").isVisible(), false);
    // A selectable old ship, then its destination, performs one move without a build modal.
    g.current = 0; g.turn += 2; g.shipMoved = false;
    g.board.edges.forEach((e) => { e.owner = -1; delete e.kind; }); g.board.vertices.forEach((v) => { v.owner = -1; v.level = 0; });
    const coast = g.board.vertices.find((v) => v.tiles.some((t) => g.board.tiles[t].resource !== -2) && v.edges.some((e) => g.board.edges[e].tiles.some((t) => g.board.tiles[t].resource === -2) && !g.board.edges[e].tiles.includes(g.board.pirate)));
    coast.owner = 0; coast.level = 1;
    const edge = E.shipSites(g,0)[0]; Object.assign(g.board.edges[edge], { owner: 0, kind: "ship", builtTurn: 0 });
    assert.ok(E.movableShips(g,0).includes(edge)); await sync();
    await page.locator('[data-action="moveShip"]:not([disabled])').click(); await page.locator(`#board .built-ship[data-edge="${edge}"]`).click();
    await page.locator("#board .board-target[data-edge]").first().click();
    await page.waitForFunction(() => window.testState.game.legal.moveShips.length === 0);
    assert.equal(g.shipMoved,true);
    // A long shipping route plus an isolated road must not display their sum as the longest route.
    g.board.edges.forEach((e) => { e.owner = -1; delete e.kind; });
    function shippingPath(vId, vertices = [vId], route = []) {
      if (route.length === 10) return { vertices, route };
      for (const edgeId of g.board.vertices[vId].edges) {
        const e = g.board.edges[edgeId], next = e.a === vId ? e.b : e.a;
        if (vertices.includes(next) || e.tiles.includes(g.board.pirate) || !e.tiles.some((t) => g.board.tiles[t].resource === -2)) continue;
        const found = shippingPath(next, [...vertices, next], [...route, edgeId]);
        if (found) return found;
      }
    }
    const shipping = shippingPath(coast.id); assert.ok(shipping);
    shipping.route.forEach((id) => Object.assign(g.board.edges[id], { owner: 0, kind: "ship" }));
    const isolated = g.board.edges.find((e) => !shipping.vertices.includes(e.a) && !shipping.vertices.includes(e.b) && e.tiles.some((t) => g.board.tiles[t].resource >= 0));
    Object.assign(isolated, { owner: 0, kind: "road" });
    g.players[0].discovered = [1, 2]; g.players[0].resources = [4,3,2,1,2];
    E.updateAwards(g); assert.equal(g.roadLengths[0], 10); assert.equal(g.longest, 0);
    await sync();
    for (const width of [320,390,1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await checkPlayerSummary(page, g, "seafarers-long-route", width);
    }
    for(const map of Maps.maps.slice(0, 8)) {
      const p=await context.newPage();p.on("pageerror",(e)=>errors.push(e.message));
      await p.goto(`http://127.0.0.1:${server.address().port}/catan.html`);
      await p.getByText("已连接 / Connected",{exact:true}).waitFor();
      await p.locator('[data-edition="seafarers"]').click();
      assert.equal(await p.locator("dialog[open]").count(), 0);
      await p.locator("#mapChoice").selectOption(map.id);
      await p.locator('#layoutChoice [data-layout="random"]').click();await p.locator("#name").fill("Explorer");
      await p.locator("#create").click();await p.locator("#lobby").waitFor();
      assert.equal(await p.locator("dialog[open]").count(), 0);
      await p.locator("#lobbyMapRules").click();
      if (["fog", "desert"].includes(map.family)) assert.match(await p.locator("#sailingContent").textContent(),map.family==="fog"?/No island bonus VP/:/four foreign territories/);
      assert.match(await p.locator("#sailingContent").textContent(),/Random/);
      await p.locator("#sailingAcknowledge").click();
      const newRoom=catan.rooms.get(await p.locator("#copyCode").textContent());
      const boardBefore=structuredClone(newRoom.previewBoard);
      await p.locator("#fillBots").click();await p.locator("#start:not([disabled])").click();
      await p.locator("#board [data-vertex]").first().waitFor();
      assert.equal(newRoom.layout,"random");assert.deepEqual(newRoom.game.board,boardBefore);
      await p.locator("#gameMapRules").click();await p.locator("#sailingAcknowledge").click();
      assert.equal(await p.locator("#board [data-vertex]").count(),E.legal(newRoom.game,0).settlements.length);
      assert.equal(await p.locator("#board .fog-tile").count(),map.family==="fog"?12:0);
      for(const width of [320,390,1440]) {
        await p.setViewportSize({width,height:width===1440?1000:844});
        await checkVictoryTarget(p,map.target,`${map.id}-${width}`);
        await p.locator("#boardViewport").screenshot({path:`test-results/${map.id}-random-game-${width}.png`});
        assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      }
      await p.setViewportSize({width:390,height:844});
      await p.locator("#board [data-vertex]").first().tap();await p.locator('#game[data-phase="setupRoad"]').waitFor();
      assert.equal(newRoom.game.board.vertices.filter((v)=>v.owner===0).length,1);
      await p.close();clearTimeout(newRoom.timer);
    }
    assert.deepEqual(errors, []);
    console.log("CATAN browser checks passed: mobile rules wrap and touch-scroll to the end with fixed controls, all registered map rules in portrait/landscape, first-seat setup, both map layouts, ships, pirate, gold, reconnect.");
    await context.close();
  } finally { await browser?.close(); catan.rooms.forEach((r) => clearTimeout(r.timer)); server.close(); server.emit("close"); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
