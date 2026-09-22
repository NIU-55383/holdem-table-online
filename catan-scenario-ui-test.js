"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const E = require("./catan-engine"), Maps = require("./catan-maps");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
const read = file => fs.readFileSync(path.join(__dirname, file), "utf8");
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const names = ["Alice", "Bob", "Connie", "David"];
const create = (map, n = 3) => E.createGame(names.slice(0, n), seeded(37), map, "default");
function setup(g) {
  for (let i = 0; i < 120 && g.phase !== "roll"; i++) {
    const actor = E.requiredActors(g)[0] ?? g.current;
    E.act(g, actor, E.chooseBotAction(g, actor), seeded(i + 7));
  }
  assert.equal(g.phase, "roll", `${g.mapId} completes setup`);
  g.phase = "main"; g.turn = 1; g.current = 0; return g;
}
function room(g, you = 0, patch = {}) {
  return { type: "state", code: `T${g.mapId}`, mapId: g.mapId, layout: g.layout, you, host: 0, maxPlayers: g.players.length, seatSelection: true,
    seats: g.players.map(p => ({ name: p.name, socialId: `test-person-${p.id}`, position: p.id, connected: true, bot: false, auto: false })),
    chat: [], game: E.publicGame(g, you), ...patch };
}
test("all remaining scenarios create for 3/4 players; choice controls and art fit phones", { timeout: 180000 }, async () => {
  fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true }), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
      localStorage.setItem("catan-music-enabled", "false");
      window.sent = [];
      window.WebSocket = class extends EventTarget {
        static OPEN = 1;
        constructor() { super(); this.readyState = 1; window.testSocket = this; setTimeout(() => this.dispatchEvent(new Event("open")), 0); }
        send(raw) { window.sent.push(JSON.parse(raw)); }
        close() { this.readyState = 3; }
        emit(data) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) })); }
      };
    });
    await page.route("http://catan.test/**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/catan-preview") {
        const id = url.searchParams.get("map") || "base";
        return route.fulfill({ json: E.makeBoard(seeded(37), id, url.searchParams.get("layout") || "default") });
      }
      const file = url.pathname.slice(1), contentType = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" }[path.extname(file)];
      return route.fulfill({ body: fs.readFileSync(path.join(__dirname, file)), contentType });
    });
    await page.goto("http://catan.test/catan.html");
    const spriteMatch = await page.evaluate(sourceText => {
      const source = new DOMParser().parseFromString(sourceText, "image/svg+xml");
      const canonical = node => [node.tagName, [...node.attributes].map(a => [a.name, a.name === "id" ? a.value.replace(/^catan-scenario-art-/, "") : a.value]).sort(), [...node.children].map(canonical)];
      return JSON.stringify([...source.querySelectorAll("symbol")].map(canonical)) === JSON.stringify([...document.querySelectorAll("#catanScenarioSprite symbol")].map(canonical));
    }, read("catan-scenario-art.svg"));
    assert.equal(spriteMatch, true, "Inline scenario symbols exactly match source vectors");
    const playerColors = await page.evaluate(() => window.CatanBoard.COLORS);
    const warshipPixels = await page.evaluate(async colors => {
      const symbol = document.getElementById("catan-scenario-art-warship");
      const samples = [];
      for (const color of colors) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 48 48"><defs>${symbol.outerHTML}</defs><use href="#${symbol.id}" style="color:${color}"/></svg>`;
        const img = new Image(); img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; await img.decode();
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 192;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        const rgb = (x, y) => [...ctx.getImageData(x * 4, y * 4, 1, 1).data].slice(0, 3);
        samples.push({ color, leftSail: rgb(18, 23), rightSail: rgb(30, 25), hull: rgb(20, 37), emblem: rgb(32, 18) });
      }
      return samples;
    }, playerColors);
    for (const sample of warshipPixels) {
      const expected = sample.color.slice(1).match(/../g).map(value => parseInt(value, 16));
      assert.deepEqual(sample.leftSail, expected, `${sample.color}: left sail uses owner's color`);
      assert.deepEqual(sample.rightSail, expected, `${sample.color}: right sail uses owner's color`);
      assert.deepEqual(sample.hull, expected, `${sample.color}: hull matches sails`);
      assert.deepEqual(sample.emblem, [255, 220, 121], "Gold warship emblem stays unchanged");
    }
    const artPage = await browser.newPage({ viewport: { width: 560, height: 320 }, deviceScaleFactor: 2 });
    try {
      const sizes = [14, 24, 48, 128];
      const swatches = sizes.map(size => `<div><svg width="${size}" height="${size}" viewBox="0 0 48 48"><use href="#cloth"/></svg><small>${size}px</small></div>`).join("");
      await artPage.setContent(`<style>body{margin:0;font:12px Arial;color:#315564}section{display:flex;align-items:center;justify-content:space-around;height:160px;background:#edf6ef}section+section{background:#196e8d;color:white}section div{display:flex;align-items:center;gap:8px}small{font-size:11px}</style>${read("catan-scenario-art.svg").replace('<svg xmlns=', '<svg width="0" height="0" style="position:absolute" xmlns=')}<section>${swatches}</section><section>${swatches}</section>`);
      const pixels = await artPage.evaluate(async () => {
        const symbol = document.getElementById("cloth");
        const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">${symbol.innerHTML}</svg>`;
        const img = new Image();
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
        await img.decode();
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 48;
        const ctx = canvas.getContext("2d"); ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, 48, 48).data;
        let visible = 0, boundary = 0;
        for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) if (data[(y * 48 + x) * 4 + 3]) {
          visible++;
          if (x === 0 || y === 0 || x === 47 || y === 47) boundary++;
        }
        return { visible, boundary };
      });
      assert.ok(pixels.visible > 700, "Cloth artwork has a readable filled silhouette");
      assert.equal(pixels.boundary, 0, "Cloth artwork is not clipped by its viewBox");
      await artPage.screenshot({ path: path.join(__dirname, "test-results/cloth-art-sizes.png") });
      const warshipSwatches = playerColors.map(color => `<div style="color:${color}"><svg width="88" height="88" viewBox="0 0 48 48"><use href="#warship"/></svg></div>`).join("");
      await artPage.setContent(`<style>body{margin:0}section{display:flex;align-items:center;justify-content:space-around;height:160px;background:#edf6ef}section+section{background:#196e8d}</style>${read("catan-scenario-art.svg").replace('<svg xmlns=', '<svg width="0" height="0" style="position:absolute" xmlns=')}<section>${warshipSwatches}</section><section>${warshipSwatches}</section>`);
      await artPage.screenshot({ path: path.join(__dirname, "test-results/warship-player-colors.png") });
    } finally { await artPage.close(); }
    assert.equal(await page.locator('#catan-scenario-art-fortress path').last().getAttribute("fill"), "currentColor", "Fortress flags inherit their owner's color");
    const emit = data => page.evaluate(data => window.testSocket.emit(data), data);
    const show = async (g, you = 0, patch = {}) => {
      await emit(room(g, you, patch));
      if (await page.locator("#sailingDialog").isVisible()) await page.locator("#sailingAcknowledge").click();
    };
    const last = () => page.evaluate(() => window.sent.at(-1));
    const introGame = create("pirates"), introRoom = { ...room(introGame), code: "INTRO", game: null, previewBoard: introGame.board };
    await emit(introRoom);
    assert.match(await page.locator("#sailingTitle").textContent(), /海盗巢穴.*The Pirate Islands/);
    assert.equal(await page.locator("#sailingContent .map-rules-preview svg").count(), 1);
    await page.locator("#sailingContent").evaluate(el => { el.scrollTop = 200; });
    const introScroll = await page.locator("#sailingContent").evaluate(el => el.scrollTop);
    await emit({ ...introRoom, chat: [{ name: "Alice", text: "Hello" }] });
    assert.equal(await page.locator("#sailingContent").evaluate(el => el.scrollTop), introScroll, "Room updates do not reset reading position");
    await page.keyboard.press("Escape");
    await emit({ type: "welcome", token: "intro-test" }); await emit(introRoom);
    assert.equal(await page.locator("dialog[open]").count(), 0, "Reconnect does not repeat the introduction");
    await emit({ ...room(introGame), code: "INTRO" });
    assert.equal(await page.locator("dialog[open]").count(), 0, "Starting the same room does not repeat the introduction");
    await page.locator("#audioSettings").click();
    const nextIntro = { ...room(create("cloth")), code: "NEXT-INTRO" };
    await emit(nextIntro);
    assert.equal(await page.locator("dialog[open]").count(), 1, "Map introductions wait behind another dialog");
    assert.equal(await page.locator("#sailingDialog").isVisible(), false);
    await page.locator('#audioSettingsDialog > [data-close]').click();
    await page.locator("#sailingDialog").waitFor();
    assert.match(await page.locator("#sailingTitle").textContent(), /Cloth for Catan/);
    await page.locator("#sailingAcknowledge").click();
    await page.reload(); await page.waitForFunction(() => window.testSocket?.readyState === 1);
    await emit(nextIntro);
    assert.equal(await page.locator("dialog[open]").count(), 0, "Reload remembers the current room introduction");
    await emit({ type: "left" }); await emit(nextIntro);
    assert.equal(await page.locator("#sailingDialog").isVisible(), true, "An explicit new entry shows the introduction again");
    await page.locator("#sailingAcknowledge").click();
    const actionCount = () => page.evaluate(() => window.sent.filter(message => message.type === "action").length);
    for (const [map, type] of [["base", "robber"], ["shores-2", "robber"], ["shores-2", "pirate"]]) {
      for (const input of ["click", "Enter", "Space"]) {
        const g = create(map, 4); g.phase = "robber"; g.resumePhase = "main";
        await page.setViewportSize({ width: input === "click" ? 1440 : 390, height: 900 });
        await show(g);
        if (type === "pirate") await page.locator('[data-thief="pirate"]').click();
        const tile = E.legal(g, 0)[type][0], target = page.locator(`#board [data-tile="${tile}"]`);
        assert.match(await target.getAttribute("aria-label"), type === "pirate" ? /Move pirate/ : /Move robber/);
        const before = await actionCount();
        await page.locator("#board .hex-tile:not([data-tile])").first().click({ force: true });
        assert.equal(await actionCount(), before, "Non-target tiles cannot move either piece");
        if (input === "click") await target.click();
        else { await target.focus(); await page.keyboard.press(input); }
        assert.equal(await actionCount(), before + 1, `${map}/${type}/${input}: destination submits immediately`);
        assert.deepEqual((await last()).action, { type, tile });
        assert.equal(await page.locator("#selection").isVisible(), false, "No destination confirmation is shown");
        await target.dispatchEvent("click");
        assert.equal(await actionCount(), before + 1, "Repeated clicks while pending cannot send twice");
        E.act(g, 0, (await last()).action, seeded(9)); await show(g);
        assert.equal(g.board[type], tile);
        assert.equal(g.phase, "main", "No victims resumes the turn without another click");
      }
      const g = create(map, 4); g.phase = "robber"; g.resumePhase = "main";
      const tile = E.legal(g, 0)[type][0];
      const sites = type === "pirate" ? g.board.edges.filter(edge => edge.tiles.includes(tile)) : g.board.tiles[tile].vertices.map(id => g.board.vertices[id]);
      for (const [index, owner] of [[0, 1], [2, 2]]) {
        Object.assign(sites[index], type === "pirate" ? { owner, kind: "ship" } : { owner, level: 1 });
        g.players[owner].resources = [2, 0, 0, 0, 0];
      }
      await show(g);
      if (type === "pirate") await page.locator('[data-thief="pirate"]').click();
      await page.locator(`#board [data-tile="${tile}"]`).click();
      E.act(g, 0, (await last()).action, seeded(9));
      const afterMove = await actionCount(); await show(g);
      assert.equal(g.phase, "steal", "Multiple opponents still require a victim choice");
      assert.equal(await actionCount(), afterMove);
      assert.equal(await page.locator("#selection").isVisible(), false);
      await page.locator('#board [data-victim="1"]').first().click();
      assert.deepEqual((await last()).action, { type: "steal", victim: 1 });
      E.act(g, 0, (await last()).action, seeded(9)); await show(g);
      assert.equal(g.phase, "main");

      g.phase = "robber"; await show(g, 1);
      assert.equal(await page.locator("#board [data-tile]").count(), 0, "Other players cannot move the piece");
      await show(g, 0, { control: { code: `T${map}`, you: "test-person-0", host: "test-person-0", seats: [], paused: true, now: Date.now() } });
      assert.equal(await page.locator("#board [data-tile]").count(), 0, "Paused rooms cannot move either piece");
      await show(g);
      if (type === "pirate") await page.locator('[data-thief="pirate"]').click();
      await page.evaluate(() => { window.testSocket.readyState = 3; });
      const beforeDisconnectClick = await actionCount();
      await page.locator("#board [data-tile]").first().click();
      assert.equal(await actionCount(), beforeDisconnectClick, "Disconnected destinations cannot submit");
      assert.equal(await page.locator("#selection").isVisible(), false);
      await page.evaluate(() => { window.testSocket.readyState = 1; });
    }
    const fixtures = {};
    for (const map of ["tribes", "cloth", "pirates", "wonders", "new-world"]) for (const n of [3, 4]) {
      await emit({ type: "left" });
      await page.locator('[data-edition="seafarers"]').click();
      await page.locator("#mapChoice").selectOption(map);
      if (map === "pirates") assert.match(await page.locator("#mapSummary").textContent(), /10 分 \+ 解放要塞 \/ 10 VP \+ Liberate your fortress/);
      assert.match(await page.locator(`#mapChoice option[value="${map}"]`).textContent(), /3–4/);
      assert.equal(await page.locator("#playerCountChoice").isVisible(), true);
      await page.locator(`[data-seats="${n}"]`).click();
      await page.locator("#name").fill("Alice");
      if (map === "new-world") await page.locator('[data-thieves="pirate"]').click();
      if (map === "pirates") {
        assert.match(await page.locator('[data-layout="random"]').textContent(), /Random harbors/);
        for (const type of ["outpost", "fortress"]) {
          await page.locator(`#previewBoard [data-scenario-info="${type}"][data-owner="0"]`).click();
          assert.match(await page.locator("#scenarioInfoTitle").textContent(), /红色.*1 号位.*Red.*Seat 1/);
          await page.locator("#scenarioInfoDialog > [data-close]").click();
        }
      }
      if (map === "wonders") {
        for (const type of ["wonder-warning", "wonder-bridge", "wonder-wall"]) {
          const marker = page.locator(`#previewBoard [data-scenario-info="${type}"]`).first();
          await marker.focus(); await page.keyboard.press("Enter");
          assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), true, `${type} is explained in the lobby preview`);
          await page.locator("#scenarioInfoDialog > [data-close]").click();
        }
      }
      await page.locator("#create").click();
      assert.equal((await last()).mapId, map); assert.equal((await last()).seats, n);
      if (map === "new-world") assert.equal((await last()).thieves, "pirate");
      assert.equal(await page.locator("dialog[open]").count(), 0, "A create request alone does not show an introduction before server confirmation");
      const g = create(map, n); await show(g);
      if (map === "new-world") { assert.equal(g.phase, "scenarioChoice"); assert.match(await page.locator("#scenarioPanel").textContent(), /Initial Harbors/); assert.equal(g.scenario.harborRemaining, 10); }
      const action = E.chooseBotAction(g, E.requiredActors(g)[0] ?? g.current);
      const selector = action.type === "placeHarbor" ? `[data-edge="${action.edge}"]` : `[data-vertex="${action.vertex}"]`;
      await page.locator(`#board ${selector}`).click();
      assert.deepEqual((await last()).action, action.type === "settlement" ? { type: "settlement", vertex: action.vertex } : action);
      E.act(g, E.requiredActors(g)[0] ?? g.current, action, seeded(11));
      setup(g); await show(g);
      assert.equal(await page.locator("#game").getAttribute("data-phase"), "main");
      const routeCells = page.locator("#players .longest-count");
      if (Maps.get(map)?.scenario?.longestRoute === false) {
        assert.deepEqual(await routeCells.locator("b").allTextContents(), Array(n).fill("不可用"));
        assert.deepEqual(await routeCells.locator("small").allTextContents(), Array(n).fill("Not available"));
        assert.equal(await page.locator("#players .route-holder").count(), 0);
        assert.match(await routeCells.first().getAttribute("aria-label"), /不可用 \/ Not available/);
      } else {
        assert.deepEqual(await routeCells.locator("b").allTextContents(), g.roadLengths.map(String));
        assert.equal(await page.locator("#players .route-unavailable").count(), 0);
      }
      assert.deepEqual(await page.locator("#players .road-count > span:first-child b").allTextContents(), E.publicGame(g, 0).players.map(p => String(p.roads)));
      assert.deepEqual(await page.locator("#players .ship-count b").allTextContents(), E.publicGame(g, 0).players.map(p => String(p.ships)));
      assert.equal(await page.locator('#actions [data-action="road"]').count(), 1);
      if (map === "pirates") {
        g.scenario.pirateSeats.forEach(seat => { g.board.edges[seat.ship].warship = true; }); await show(g);
        const colors = await page.locator('#board .built-warship use').evaluateAll(nodes => nodes.map(node => node.style.color));
        const expectedColors = await page.evaluate(owners => owners.map(owner => { const node = document.createElement("span"); node.style.color = window.CatanBoard.COLORS[owner]; return node.style.color; }), g.board.edges.filter(edge => edge.warship).map(edge => edge.owner));
        assert.deepEqual(colors, expectedColors, "Each on-board warship passes its owner's color to the artwork");
        g.scenario.pirateSeats.forEach(seat => { delete g.board.edges[seat.ship].warship; }); await show(g);
        await page.locator("#gameBaseRules").click();
        const inventory = await page.locator("#rulesDevelopment").textContent();
        assert.match(inventory, new RegExp(`战舰 × ${n === 3 ? 14 : 19}`));
        assert.doesNotMatch(inventory, /胜利点|hidden victory point/);
        assert.match(await page.locator("#rulesVictoryCard").textContent(), /没有直接加分的发展卡.*3 players.*4 players/s);
        assert.match(await page.locator("#rulesVictoryCard").textContent(), /四人局保留这 5 张，但都当战舰卡使用，不加分/);
        assert.match(await page.locator("#rulesScenarioNote").textContent(), /要塞收复前不能升级城市.*2 麦子 \+ 3 矿石.*4 座城市.*cannot be upgraded before liberation.*2 grain \+ 3 ore/s);
        await page.locator("#helpAcknowledge").click();
      }
      if (n === 3) fixtures[map] = structuredClone(g);
    }
    // Base and the earlier sailing maps keep their numeric route lengths.
    for (const map of [{ id: "base", players: 3 }, ...Maps.maps.filter(map => !fixtures[map.id])]) {
      const g = setup(create(map.id, map.players));
      await show(g);
      assert.deepEqual(await page.locator("#players .longest-count b").allTextContents(), g.roadLengths.map(String), `${map.id} keeps numeric route lengths`);
      assert.equal(await page.locator("#players .route-unavailable").count(), 0);
    }
    // Future maps use the same metadata flag, without adding another map-name exception.
    await page.evaluate(() => { window.CatanMaps.get("wonders").scenario.longestRoute = false; });
    try {
      await show(fixtures.wonders);
      assert.deepEqual(await page.locator("#players .longest-count b").allTextContents(), Array(3).fill("不可用"));
      assert.deepEqual(await page.locator("#players .longest-count small").allTextContents(), Array(3).fill("Not available"));
      assert.equal(await page.locator("#players .route-holder").count(), 0);
    } finally { await page.evaluate(() => { delete window.CatanMaps.get("wonders").scenario.longestRoute; }); }
    await show(fixtures.wonders);
    assert.deepEqual(await page.locator("#players .longest-count b").allTextContents(), fixtures.wonders.roadLengths.map(String));
    // Special victory conditions are complete sentences, not an overflowing score suffix.
    for (const map of ["wonders", "pirates", "cloth", "tribes"]) {
      await show(fixtures[map]);
      const special = map !== "tribes";
      assert.equal(await page.locator("#victoryTargetScore").isVisible(), !special);
      assert.equal(await page.locator("#scenarioVictoryConditions").isVisible(), special);
      if (map === "wonders") {
        assert.match(await page.locator("#scenarioVictoryConditions").textContent(), /自己的回合，满足以下任意一项/);
        assert.deepEqual(await page.locator("#scenarioVictoryConditions strong").allTextContents(), ["奇观建满全部 4 个阶段", "至少 10 分，且奇观阶段数超过所有对手"]);
        assert.doesNotMatch(await page.locator("#victoryTarget").textContent(), /领先 \/ lead|VP \+/);
      }
      if (map === "pirates") assert.match(await page.locator("#scenarioVictoryConditions").textContent(), /必须同时满足.*至少 10 分，并收复自己的海盗要塞/s);
      if (map === "cloth") {
        assert.deepEqual(await page.locator("#scenarioVictoryConditions strong").allTextContents(), ["自己的回合达 14 分", "或有布村落仅剩 3 个：分高者胜，同分比布匹"]);
        assert.equal(await page.locator("#scenarioVictoryConditions small").first().textContent(), "Reach 14 VP on your turn");
        assert.match(await page.locator("#scenarioVictoryConditions").textContent(), /only 3 villages have cloth: most VP wins; ties go to most cloth/);
      }
      for (const width of [320, 390, 740, 741, 980, 1440]) {
        await page.setViewportSize({ width, height: width > 740 ? 1000 : 844 });
        const fits = await page.locator("#victoryTarget").evaluate(el => {
          const r = el.getBoundingClientRect(), toolbar = el.parentElement.getBoundingClientRect(), board = document.querySelector("#boardViewport").getBoundingClientRect();
          const children = [...el.querySelectorAll("p, strong, small, .victory-target-heading")].filter(n => n.getBoundingClientRect().width);
          return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= toolbar.top && r.bottom <= toolbar.bottom + 1 && r.bottom <= board.top + 1
            && el.scrollWidth <= el.clientWidth + 1 && children.every(n => { const b = n.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right + 1 && b.top >= r.top && b.bottom <= r.bottom + 1 && n.scrollWidth <= n.clientWidth + 1; });
        });
        assert.equal(fits, true, `${map} target fits above the map at ${width}px: ${fits ? "" : JSON.stringify(await page.locator("#victoryTarget").evaluate(el => [el.parentElement, el, document.querySelector("#boardViewport"), ...el.querySelectorAll("p, strong, small, .victory-target-heading")].map(n => ({ tag: n.id || n.className || n.tagName, box: n.getBoundingClientRect().toJSON(), scroll: n.scrollWidth, client: n.clientWidth }))))}`);
        if (map === "wonders" || map === "cloth") {
          const blocks = await page.locator("#scenarioVictoryConditions > p").evaluateAll(nodes => nodes.map(n => ({ top: n.getBoundingClientRect().top, bottom: n.getBoundingClientRect().bottom })));
          assert.ok(blocks.every((b, i) => !i || b.top >= blocks[i - 1].bottom), "Each condition has its own non-overlapping row");
          await page.locator(".board-toolbar").screenshot({ path: path.join(__dirname, "test-results", `${map === "wonders" ? "wonder" : map}-victory-conditions-${width}.png`) });
        }
        if (Maps.get(map)?.scenario?.longestRoute === false) {
          const fits = await page.locator("#players .route-unavailable").evaluateAll(cells => cells.every(cell => {
            const box = cell.getBoundingClientRect();
            return cell.scrollWidth <= cell.clientWidth + 1 && [...cell.children].every(child => {
              const r = child.getBoundingClientRect();
              return r.left >= box.left && r.right <= box.right + 1 && r.top >= box.top && r.bottom <= box.bottom + 1 && child.scrollWidth <= child.clientWidth + 1;
            });
          }));
          assert.equal(fits, true, `${map} unavailable labels fit each player cell at ${width}px`);
          await page.locator(".player-overview").screenshot({ path: path.join(__dirname, "test-results", `${map}-player-routes-${width}.png`) });
        }
      }
    }
    // Desert artwork is presentation-only; both map layouts keep their original rules data.
    for (const layout of ["default", "random"]) for (const n of [3, 4]) {
      const g = E.createGame(names.slice(0, n), seeded(37), "tribes", layout);
      for (const preview of [false, true]) {
        const result = await page.evaluate(({ board, scenario, preview }) => {
          const original = JSON.stringify(board), host = document.createElement("div");
          host.innerHTML = CatanBoard.render(board, { scenario, preview });
          const islands = [...host.querySelectorAll(".foreign-island")];
          return {
            unchanged: JSON.stringify(board) === original,
            islands: islands.length,
            text: islands.flatMap(el => [...el.querySelectorAll("text")]).length,
            fills: [...new Set(islands.map(el => el.querySelector(".hex-land").getAttribute("fill")))],
            icons: islands.flatMap(el => [...el.querySelectorAll("use")].map(node => node.getAttribute("href"))),
            trophies: host.querySelectorAll('[data-scenario-info="vp"] use[href$="dev-vp"]').length,
            vpText: host.querySelectorAll('[data-scenario-info="vp"] text').length,
            cards: host.querySelectorAll('[data-scenario-info="development"] use[href$="development"]').length,
          };
        }, { board: g.board, scenario: g.scenario, preview });
        assert.equal(result.unchanged, true);
        assert.equal(result.islands, 12, `${layout}/${n}/${preview}: all foreign tiles use desert art`);
        assert.equal(result.text, 0);
        assert.deepEqual(result.fills, ["#dece96"]);
        assert.ok(result.icons.length >= 11 && result.icons.every(href => href === "#catan-art-desert"));
        assert.equal(result.trophies, 8);
        assert.equal(result.vpText, 0);
        assert.equal(result.cards, 4);
      }
    }
    for (const layout of ["default", "random"]) for (const n of [3, 4]) {
      const g = E.createGame(names.slice(0, n), seeded(37), "cloth", layout);
      for (const preview of [false, true]) {
        const rendered = await page.evaluate(({ board, scenario, preview }) => {
          const before = JSON.stringify(board), host = document.createElement("div");
          host.innerHTML = window.CatanBoard.render(board, { scenario, preview });
          const islands = [...host.querySelectorAll(".cloth-island")];
          return {
            unchanged: JSON.stringify(board) === before,
            islands: islands.length,
            fills: [...new Set(islands.map(el => el.querySelector(".hex-land").getAttribute("fill")))],
            icons: islands.flatMap(el => [...el.querySelectorAll("use")].map(node => node.getAttribute("href"))),
            gold: host.querySelectorAll('use[href$="gold"]').length,
            villages: host.querySelectorAll(".cloth-village").length,
            cloth: host.querySelectorAll('.cloth-village use[href$="cloth"]').length,
          };
        }, { board: g.board, scenario: g.scenario, preview });
        assert.equal(rendered.unchanged, true);
        assert.equal(rendered.islands, 4);
        assert.deepEqual(rendered.fills, ["#dece96"]);
        assert.deepEqual(rendered.icons, Array(4).fill("#catan-art-desert"));
        assert.equal(rendered.gold, 0);
        assert.equal(rendered.villages, 8);
        assert.equal(rendered.cloth, 8);
      }
    }
    await show(fixtures.cloth);
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator("#board").screenshot({ path: path.join(__dirname, "test-results", `cloth-desert-board-${width}.png`) });
    }
    // Pirate landmarks explain ownership and rules without issuing gameplay actions.
    for (const n of [3, 4]) {
      const g = setup(create("pirates", n));
      g.scenario.pirateSeats[0].strength = 1;
      g.scenario.pirateSeats[1].strength = 2;
      await show(g);
      const before = await page.evaluate(() => window.sent.length);
      assert.equal(await page.locator('#board [data-scenario-info="outpost"]').count(), n);
      assert.equal(await page.locator('#board [data-scenario-info="fortress"]').count(), n);
      for (const type of ["outpost", "fortress"]) for (let owner = 0; owner < n; owner++) {
        const marker = page.locator(`#board [data-scenario-info="${type}"][data-owner="${owner}"]`);
        assert.equal(await marker.getAttribute("role"), "button");
        await marker.focus(); await page.keyboard.press(owner % 2 ? "Space" : "Enter");
        assert.match(await page.locator("#scenarioInfoTitle").textContent(), new RegExp(`${owner + 1} 号位.*Seat ${owner + 1}`));
        const content = await page.locator("#scenarioInfoContent").textContent();
        if (type === "fortress") {
          assert.ok(content.includes(`当前为 ${g.scenario.pirateSeats[owner].strength}/3`));
          assert.match(content, /战舰数大于骰点.*相等.*小于.*进攻后立即结束回合/s);
          assert.match(content, /自己的回合达到 10 分/);
        } else {
          assert.match(content, /初始村庄不能放在这里/);
          assert.match(content, /通常费用建村、升级城市/);
          assert.match(content, /全程不能分叉/);
        }
        const symbolColor = await page.locator("#scenarioInfoContent .scenario-info-symbol").evaluate(el => el.style.color);
        assert.equal(await page.locator("#scenarioInfoContent .scenario-info-symbol svg").evaluate(el => getComputedStyle(el).color), symbolColor, "The explanation artwork uses the player's color");
        assert.equal(symbolColor, await marker.evaluate(el => {
          const node = document.createElement("span"); node.style.color = window.CatanBoard.COLORS[Number(el.dataset.owner)]; return node.style.color;
        }));
        await page.keyboard.press("Escape");
      }
      // Removing an earlier fortress must not change the remaining seat labels.
      Object.assign(g.scenario.pirateSeats[0], { liberated: true, strength: 0 });
      Object.assign(g.board.vertices[g.scenario.pirateSeats[0].fortress], { owner: 0, level: 1 });
      await show(g);
      assert.equal(await page.locator('#board .pirate-fortress[data-owner="0"]').count(), 0);
      for (const child of ["use", "text"]) {
        await page.locator(`#board .pirate-fortress[data-owner="1"] ${child}`).click();
        assert.match(await page.locator("#scenarioInfoTitle").textContent(), /蓝色.*2 号位.*Blue.*Seat 2/);
        assert.match(await page.locator("#scenarioInfoContent").textContent(), /当前为 2\/3/);
        await page.locator("#scenarioInfoDialog > [data-close]").click();
      }
      await page.locator("#gameMapRules").click();
      const pirateRules = await page.locator("#sailingContent > p").allTextContents();
      for (const expected of [
        /进攻要塞：.*3 → 2 → 1 → 0.*赢三次收复.*three wins liberate it/s,
        /战舰：.*全部战舰.*每艘 1 战力，普通船 0.*1 strength each, normal ships 0/s,
        /海盗巡航：.*3 和 5.*走 3 格.*lower die/s,
        /海盗巡航：.*最后停下.*村庄或城市.*船只和沿途建筑不触发.*not ships or buildings passed en route/s,
        /战舰：.*1 羊毛 \+ 1 麦子 \+ 1 矿石.*随机发展卡.*Buy a random development card/s,
        /遭遇海盗：.*4 艘战舰.*3／4／5.*赢／平／输.*win\/tie\/loss/s,
        /遭遇海盗：.*银行任选 1 张.*相等无事.*随机交回 1 张.*每座城市 1 张.*no ships, buildings or fortress defenses/s,
        /掷到 7：.*先巡航、结算袭击.*超过 7 张.*向下取整.*随机偷 1 张.*海盗不再移动.*No second pirate move/s,
        /进攻要塞：.*另掷 1 颗骰子.*4 舰对 3 点.*rolling 1 new die/s,
        /进攻要塞：.*防御不减.*立即结束回合.*rebuild a broken line/s,
        /牌堆与出牌：.*三人局移除全部 5 张.*四人局保留这 5 张但改作战舰.*没有加分卡.*Neither deck scores VP/s,
        /收复、升级与获胜：.*收复前.*不能升级.*2 麦子 \+ 3 矿石.*cannot upgrade.*2 grain \+ 3 ore/s,
      ]) assert.ok(pirateRules.some(p => expected.test(p)), `Pirate map rules explain ${expected}`);
      await page.locator('#sailingContent .pirate-outpost[data-owner="1"]').click();
      assert.match(await page.locator("#scenarioInfoTitle").textContent(), /蓝色补给点/);
      await page.locator("#scenarioInfoDialog > [data-close]").click();
      assert.equal(await page.locator("#sailingDialog").isVisible(), true);
      await page.locator('#sailingContent .pirate-fortress[data-owner="1"]').click();
      assert.match(await page.locator("#scenarioInfoContent").textContent(), /当前为 2\/3/);
      await page.locator("#scenarioInfoDialog > [data-close]").click();
      await page.locator("#sailingAcknowledge").click();
      assert.equal(await page.evaluate(() => window.sent.length), before, "Landmark help and map previews are read-only");
    }
    await show(fixtures.pirates);
    for (const [width, height] of [[320, 740], [390, 844], [740, 320], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      for (const type of ["outpost", "fortress", "pirate-fleet"]) {
        const marker = page.locator(`#board [data-scenario-info="${type}"]${type === "pirate-fleet" ? "" : '[data-owner="0"]'}`);
        await marker.focus(); await page.keyboard.press("Enter");
        if (type === "pirate-fleet") {
          assert.match(await page.locator("#scenarioInfoContent").textContent(), /停下的海洋格旁的村庄或城市.*更多.*相等.*更少.*总点数为 7.*获得战舰.*道路不算/s);
        }
        const box = await page.locator("#scenarioInfoDialog").boundingBox(), close = await page.locator("#scenarioInfoDialog > [data-close]").boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1, `${type} dialog fits ${width}x${height}`);
        assert.ok(close.y >= 0 && close.y + close.height <= height, "Close remains visible");
        assert.equal(await page.locator("#scenarioInfoContent").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await page.screenshot({ path: path.join(__dirname, "test-results", `pirate-${type}-help-${width}.png`) });
        await page.locator("#scenarioInfoContent").evaluate(el => { el.scrollTop = el.scrollHeight; });
        assert.equal(await page.locator("#scenarioInfoContent").evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2), true);
        await page.locator("#scenarioInfoDialog > [data-close]").click();
      }
      await page.locator("#gameMapRules").click();
      const rulesBox = await page.locator("#sailingDialog").boundingBox(), rulesClose = await page.locator("#sailingAcknowledge").boundingBox();
      assert.ok(rulesBox.x >= 0 && rulesBox.x + rulesBox.width <= width + 1 && rulesBox.y >= 0 && rulesBox.y + rulesBox.height <= height + 1, `Pirate rules fit ${width}x${height}`);
      assert.ok(rulesClose.y >= 0 && rulesClose.y + rulesClose.height <= height, "Rules close button stays visible");
      assert.equal(await page.locator("#sailingContent").evaluate(el => el.scrollWidth <= el.clientWidth + 1 && [...el.querySelectorAll("p, small")].every(p => p.scrollWidth <= p.clientWidth + 1)), true, "Bilingual pirate rules wrap within the dialog");
      await page.locator("#sailingContent > p").filter({ hasText: "遭遇海盗：" }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(__dirname, "test-results", `pirate-rules-raid-${width}.png`) });
      await page.locator("#sailingContent").evaluate(el => { el.scrollTop = el.scrollHeight; });
      assert.equal(await page.locator("#sailingContent").evaluate(el => Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 2), true, "The full rules remain reachable");
      await page.locator("#sailingAcknowledge").click();
    }
    // A mistaken island road is a reversible placement, never a refundable purchase.
    const roadGame = structuredClone(fixtures.pirates), landing = roadGame.scenario.pirateSeats[0].landing;
    Object.assign(roadGame.board.vertices[landing], { owner: 0, level: 1 });
    roadGame.players[0].resources = [5, 5, 5, 0, 0];
    const islandEdge = E.legal(roadGame, 0).scenario.warnIslandRoads[0];
    assert.ok(Number.isInteger(islandEdge));
    await show(roadGame);
    for (const [width, height] of [[320, 740], [390, 844], [740, 320], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#actions [data-action="road"]').click();
      const count = await page.evaluate(() => window.sent.length);
      await page.locator(`#board [data-edge="${islandEdge}"]`).click();
      assert.equal(await page.locator("#islandRoadDialog").isVisible(), true);
      assert.match(await page.locator("#islandRoadDescription").textContent(), /只有船只通往要塞才能进攻，在此建造道路没有任何收益.*Only a continuous line of ships/s);
      assert.equal(await page.evaluate(() => window.sent.length), count);
      const box = await page.locator("#islandRoadDialog").boundingBox(), button = await page.locator("#confirmIslandRoad").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= height + 1);
      assert.ok(button.y >= 0 && button.y + button.height <= height + 1, "Confirmation stays visible");
      assert.equal(await page.locator("#islandRoadDescription").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
      await page.screenshot({ path: path.join(__dirname, "test-results", `pirate-road-warning-${width}.png`) });
      await page.keyboard.press("Escape");
      assert.equal(await page.evaluate(() => window.sent.length), count, "Cancel never builds a road");
    }
    await page.locator(`#board [data-edge="${islandEdge}"]`).click();
    await page.locator("#confirmIslandRoad").click();
    assert.deepEqual((await last()).action, { type: "road", edge: islandEdge });
    E.act(roadGame, 0, (await last()).action); await show(roadGame);
    const beforeRemoval = [...roadGame.players[0].resources];
    const removeRoad = page.locator(`#board [data-remove-road="${islandEdge}"]`);
    await removeRoad.focus(); await page.keyboard.press("Space");
    assert.match(await page.locator("#islandRoadDescription").textContent(), /不退任何资源、发展卡或免费建造次数.*No resources/s);
    const removalCount = await page.evaluate(() => window.sent.length);
    await page.locator('#islandRoadDialog .secondary').click();
    assert.equal(await page.evaluate(() => window.sent.length), removalCount);
    for (const invalidation of ["revision", "pause", "replacement", "disconnect"]) {
      await show(roadGame); await removeRoad.click();
      if (invalidation === "revision") { roadGame.revision++; await show(roadGame); }
      if (invalidation === "pause") await show(roadGame, 0, { control: { code: "Tpirates", you: "test-person-0", host: "test-person-0", seats: [], paused: true, now: Date.now() } });
      if (invalidation === "replacement") { const data = room(roadGame); data.seats[0].socialId = "replacement"; await emit(data); }
      if (invalidation === "disconnect") await page.evaluate(() => { window.testSocket.readyState = 3; window.testSocket.dispatchEvent(new CloseEvent("close", { code: 4001 })); });
      assert.equal(await page.locator("#islandRoadDialog").isVisible(), false, `${invalidation} invalidates confirmation`);
      if (invalidation === "disconnect") await page.evaluate(() => { window.testSocket.readyState = 1; window.testSocket.dispatchEvent(new Event("open")); });
    }
    await show(roadGame, 1);
    assert.equal(await page.locator("#board [data-remove-road]").count(), 0, "Opponents cannot remove this road");
    await show(roadGame); await removeRoad.click();
    await page.screenshot({ path: path.join(__dirname, "test-results/pirate-road-removal-desktop.png") });
    await page.locator("#confirmIslandRoad").click();
    assert.deepEqual((await last()).action, { type: "removeIslandRoad", edge: islandEdge });
    E.act(roadGame, 0, (await last()).action); await show(roadGame);
    assert.deepEqual(roadGame.players[0].resources, beforeRemoval);
    assert.equal(await page.locator("#board [data-remove-road]").count(), 0);
    const outpostGame = structuredClone(fixtures.pirates), outpost = outpostGame.scenario.pirateSeats[0].landing;
    Object.assign(outpostGame.board.edges[outpostGame.board.vertices[outpost].edges[0]], { owner: 0, kind: "ship", builtTurn: 0 });
    outpostGame.players[0].resources = [1, 1, 1, 1, 0];
    assert.ok(E.legal(outpostGame, 0).settlements.includes(outpost));
    await show(outpostGame);
    await page.locator('#board .pirate-outpost[data-owner="0"]').click();
    await page.locator("#scenarioInfoDialog > [data-close]").click();
    await page.locator('#actions [data-action="settlement"]').click();
    await page.locator(`#board [data-vertex="${outpost}"]`).click();
    assert.deepEqual((await last()).action, { type: "settlement", vertex: outpost }, "Building at an outpost still places a settlement");
    assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), false);
    E.act(outpostGame, 0, (await last()).action); await show(outpostGame);
    assert.equal(await page.locator('#board .pirate-outpost[data-owner="0"]').count(), 0, "The settled outpost becomes a house");
    // Gift inspection remains available and never plays a turn.
    await show(fixtures.tribes);
    assert.equal(await page.locator("#board .foreign-island text").count(), 0, "No labels on foreign island tiles");
    assert.equal(await page.locator('#board .foreign-island use:not([href$="desert"])').count(), 0);
    assert.equal(await page.locator("#board .foreign-island .hex-land").first().evaluate(el => getComputedStyle(el).fillOpacity), "1", "Use the normal desert texture without fading");
    assert.equal(await page.locator('#board [data-scenario-info="vp"] use[href$="dev-vp"]').count(), 8);
    assert.equal(await page.locator('#board [data-scenario-info="harbor"]').count(), 6);
    assert.equal(await page.locator('#board [data-scenario-info="harbor"] use[href$="ship"]').count(), 0, "Generic harbors are not drawn as ships");
    assert.equal(await page.locator('#board [data-scenario-info="harbor"][data-resource="-1"]').textContent().then(t => t.includes("3:1")), true);
    const beforeInspect = await page.evaluate(() => window.sent.length);
    for (const type of ["foreign", "vp", "development", "pirate"]) {
      const marker = page.locator(`#board [data-scenario-info="${type}"]`).first();
      await marker.focus(); await page.keyboard.press("Enter");
      assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), true, `${type} opens by keyboard`);
      assert.doesNotMatch(await page.locator("#scenarioInfoContent").textContent(), /此窗口只解释|不是资源卡|not resource cards|This description does not/);
      if (type === "foreign") assert.match(await page.locator("#scenarioInfoContent").textContent(), /奖杯可领取 1 胜利点/);
      if (type === "pirate") assert.match(await page.locator("#scenarioInfoContent").textContent(), /黑旗船是海盗棋子/);
      await page.keyboard.press("Escape");
    }
    for (const r of [-1, 0, 1, 2, 3, 4]) {
      await page.locator(`#board [data-scenario-info="harbor"][data-resource="${r}"]`).click();
      assert.match(await page.locator("#scenarioInfoTitle").textContent(), r < 0 ? /3:1/ : /2:1/);
      assert.match(await page.locator("#scenarioInfoContent").textContent(), /即可领取礼物/);
      assert.doesNotMatch(await page.locator("#scenarioInfoContent").textContent(), /不是资源卡|not resource cards/);
      assert.match(await page.locator("#scenarioInfoContent").textContent(), /不能与现有港口重合或共用交叉点/);
      await page.locator("#scenarioInfoDialog > [data-close]").click();
    }
    assert.equal(await page.evaluate(() => window.sent.length), beforeInspect, "Every explanation is read-only");
    for (const [width, height] of [[320, 740], [390, 844], [740, 320], [1440, 1000]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#board [data-scenario-info="harbor"][data-resource="0"]').click();
      const box = await page.locator("#scenarioInfoDialog").boundingBox(), close = await page.locator("#scenarioInfoDialog > [data-close]").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= height + 1, `Gift dialog fits ${width}x${height}`);
      assert.ok(close.y >= 0 && close.y + close.height <= height, "Close stays visible in landscape");
      assert.equal(await page.locator("#scenarioInfoContent").evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
      await page.locator("#scenarioInfoContent").evaluate(n => { n.scrollTop = n.scrollHeight; });
      assert.equal(await page.locator("#scenarioInfoContent").evaluate(n => Math.abs(n.scrollHeight - n.clientHeight - n.scrollTop) < 2), true);
      await page.screenshot({ path: path.join(__dirname, "test-results", `tribe-gift-help-${width}.png`) });
      await page.locator("#scenarioInfoDialog > [data-close]").click();
      const overlaps = await page.locator('#board .scenario-gift [data-scenario-info]').evaluateAll(nodes => nodes.flatMap((a, i) => nodes.slice(i + 1).filter(b => {
        const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();
        return Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2;
      }).map(b => `${a.parentElement.dataset.gift}/${b.parentElement.dataset.gift}`)));
      assert.deepEqual(overlaps, [], `Gift badges do not overlap at ${width}`);
      await page.locator("#board").screenshot({ path: path.join(__dirname, "test-results", `tribe-desert-board-${width}.png`) });
    }
    await page.locator("#gameMapRules").click();
    const harborRule = page.locator("#sailingContent > p").filter({ hasText: "六个海港礼物" });
    assert.match(await harborRule.textContent(), /没有合法位置则暂存/);
    assert.doesNotMatch(await page.locator("#sailingContent").textContent(), /领取的是可搬回主岛的海港|not resource cards or a ship/);
    assert.equal(await page.locator("#sailingContent .foreign-island text").count(), 0);
    assert.equal(await page.locator('#sailingContent [data-scenario-info="vp"] use[href$="dev-vp"]').count(), 8);
    await page.locator('#sailingContent [data-scenario-info="harbor"]').first().click();
    assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), true, "Map-rule preview is inspectable too");
    await page.locator("#scenarioInfoDialog > [data-close]").click();
    assert.equal(await page.locator("#sailingDialog").isVisible(), true);
    await page.locator("#sailingAcknowledge").click();
    // The offset information badge must not intercept actual ship placement.
    const giftGame = structuredClone(fixtures.tribes), gift = giftGame.scenario.gifts.find(g => g.kind === "harbor" && g.resource === 0);
    giftGame.board.pirate = -1;
    const giftEdge = giftGame.board.edges[gift.edge], approach = giftGame.board.vertices[giftEdge.a].edges.find(i => i !== gift.edge);
    Object.assign(giftGame.board.edges[approach], { owner: 0, kind: "ship", builtTurn: 0 });
    giftGame.players[0].resources = [2, 0, 2, 0, 0];
    assert.ok(E.legal(giftGame, 0).ships.includes(gift.edge));
    await show(giftGame); await page.locator('#actions [data-action="ship"]').click();
    await page.locator('#board [data-scenario-info="harbor"][data-resource="0"]').click();
    const beforeQueued = await page.evaluate(() => window.sent.length);
    await page.locator(`#board [data-edge="${gift.edge}"]`).dispatchEvent("click");
    assert.equal(await page.evaluate(() => window.sent.length), beforeQueued, "An open description blocks queued actions");
    await page.locator("#scenarioInfoDialog > [data-close]").click();
    await page.locator(`#board [data-edge="${gift.edge}"]`).click();
    assert.deepEqual((await last()).action, { type: "ship", edge: gift.edge });
    E.act(giftGame, 0, (await last()).action); await show(giftGame);
    assert.equal(gift.claimedBy, 0);
    assert.equal(await page.locator(`#board [data-gift="${gift.id}"]`).count(), 0, "Claimed gift disappears");
    assert.equal(await page.locator(`#scenarioPanel [data-harbor="${gift.id}"]`).count(), 1);
    // The last harbor must not turn a rapid second click into a settlement.
    const world = create("new-world");
    for (let i = 0; i < 9; i++) {
      const actor = E.requiredActors(world)[0];
      E.act(world, actor, E.chooseBotAction(world, actor), seeded(91 + i));
    }
    await show(world);
    const lastHarbor = E.chooseBotAction(world, E.requiredActors(world)[0]);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false);
    await page.locator(`#board [data-edge="${lastHarbor.edge}"]`).click();
    assert.deepEqual((await last()).action, lastHarbor);
    E.act(world, 0, lastHarbor); await show(world);
    assert.equal(world.phase, "setupSettlement");
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), true);
    assert.match(await page.locator("#harborSetupTitle").textContent(), /现在开始建村庄/);
    assert.match(await page.locator("#harborSetupActor").textContent(), /Alice/);
    const vertex = E.legal(world, 0).settlements[0], sentBeforeNotice = await page.evaluate(() => window.sent.length);
    await page.locator(`#board [data-vertex="${vertex}"]`).dispatchEvent("click");
    assert.equal(await page.evaluate(() => window.sent.length), sentBeforeNotice, "An unacknowledged phase notice blocks even a queued board click");
    await show(world, 0, { chat: [{ name: "Bob", text: "ready", playerId: 1 }] });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width < 740 ? 740 : 1000 });
      const metrics = await page.locator("#harborSetupDialog").evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, ...Object.fromEntries(["left", "right", "top", "bottom"].map(k => [k, el.getBoundingClientRect()[k]])) }));
      assert.ok(metrics.scroll <= metrics.width + 1 && metrics.left >= 0 && metrics.right <= width && metrics.top >= 0 && metrics.bottom <= (width < 740 ? 740 : 1000), `Phase notice fits ${width}px`);
      await page.screenshot({ path: path.join(__dirname, "test-results", `harbor-transition-${width}.png`) });
    }
    await page.setViewportSize({ width: 740, height: 320 });
    const shortNotice = await page.locator("#acknowledgeHarborSetup").boundingBox();
    assert.ok(shortNotice.y >= 0 && shortNotice.y + shortNotice.height <= 320, "Acknowledgement stays visible in phone landscape");
    await page.screenshot({ path: path.join(__dirname, "test-results", "harbor-transition-landscape.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("#acknowledgeHarborSetup").click();
    assert.equal(await page.evaluate(() => window.sent.length), sentBeforeNotice, "Acknowledging never places a piece");
    await show(world);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false, "Duplicate states do not repeat the notice");
    assert.equal(await page.locator("#harborSetupBanner").isVisible(), true);
    await page.locator(`#board [data-vertex="${vertex}"]`).click();
    assert.deepEqual((await last()).action, { type: "settlement", vertex });
    E.act(world, 0, (await last()).action); await show(world);
    assert.match(await page.locator("#harborSetupPhase").textContent(), /放置道路或船/);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false);
    await emit({ type: "welcome", token: "reconnect-test" }); await show(world);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false, "Reconnecting after acknowledgement does not repeat it");
    setup(world); await show(world);
    assert.equal(await page.locator("#harborSetupBanner").isVisible(), false);
    const rematch = create("new-world"); await show(rematch);
    while (rematch.scenario.harborDraft) { const actor = E.requiredActors(rematch)[0]; E.act(rematch, actor, E.chooseBotAction(rematch, actor)); }
    await show(rematch);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), true, "Rematching in the same seat shows the new transition");
    await page.locator("#acknowledgeHarborSetup").click();
    await show(rematch, 1);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), true, "Waiting players also see the new-game transition");
    assert.match(await page.locator("#harborSetupActor").textContent(), /Alice/);
    await page.keyboard.press("Escape"); await show(rematch, 1);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false, "Keyboard acknowledgement is remembered");
    await emit({ type: "left" }); await show(rematch);
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), true, "Joining during initial placement catches up on the stage");
    await emit({ type: "left" });
    assert.equal(await page.locator("#harborSetupDialog").isVisible(), false, "Leaving clears the notice");
    await page.setViewportSize({ width: 390, height: 844 });
    // Resource rewards can belong to someone other than the turn owner.
    const pirate = structuredClone(fixtures.pirates);
    pirate.phase = "scenarioChoice"; pirate.scenario.pending = { actor: 1, kind: "pirateReward", number: 6 }; pirate.scenario.actor = 1;
    await show(pirate, 1);
    await page.locator('[data-special="pirateReward"]').click();
    assert.equal(await page.locator('#resourceDialog input[type="number"]').count(), 0);
    assert.equal(await page.locator("#confirmResources").isDisabled(), true);
    await page.locator('[data-add-resource="2"]').click(); await page.locator("#confirmResources").click();
    assert.deepEqual((await last()).action, { type: "pirateReward", resource: 2 });
    E.act(structuredClone(pirate), 1, (await last()).action, seeded(3));
    // Collected harbors choose an actual coast edge, never a numeric field.
    const tribe = structuredClone(fixtures.tribes); tribe.board.ports = [];
    tribe.players[0].harbors = [{ id: "collected-test", resource: 1 }];
    const coast = tribe.board.edges.find(e => e.tiles.some(i => tribe.board.tiles[i].resource >= -1) && (e.tiles.length === 1 || e.tiles.some(i => tribe.board.tiles[i].resource === -2)));
    Object.assign(tribe.board.vertices[coast.a], { owner: 0, level: 1 });
    await show(tribe); await page.locator('[data-harbor="collected-test"]').click();
    const edge = E.legal(tribe, 0).scenario.placeHarbors[0].edges[0];
    await page.locator(`#board [data-edge="${edge}"]`).click();
    assert.deepEqual((await last()).action, { type: "placeHarbor", harbor: "collected-test", edge });
    E.act(tribe, 0, (await last()).action); await show(tribe);
    assert.equal(await page.locator('[data-harbor="collected-test"]').count(), 0);
    // Both pirate loot choices send an explicit, validated loot kind.
    for (const loot of ["cloth", "resource"]) {
      const cloth = structuredClone(fixtures.cloth); cloth.phase = "steal"; cloth.thief = "pirate"; cloth.victims = [1]; cloth.resumePhase = "main";
      cloth.players[1].cloth = 2; cloth.players[1].resources = [1, 0, 0, 0, 0];
      await show(cloth);
      await page.locator(`[data-loot="${loot}"]`).click();
      assert.deepEqual((await last()).action, { type: "steal", victim: 1, loot });
      E.act(cloth, 0, (await last()).action, seeded(2));
    }
    const wonderMarkers = [
      ["wonder-warning", "感叹号：初始村庄禁放点", /第一座和第二座村庄.*Neither of your two starting settlements.*开局后/s, 4],
      ["wonder-bridge", "紫色方块：大桥施工点", /任一紫色方块.*大桥的施工条件.*预留 1 艘.*四个阶段.*out of four/s, 2],
      ["wonder-wall", "棕色方块：长城施工点", /任一棕色方块.*长城的施工条件.*预留 1 艘.*四个阶段.*out of four/s, 5]
    ];
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 844 }); await show(fixtures.wonders);
      for (const [type, title, details, count] of wonderMarkers) {
        const markers = page.locator(`#board [data-scenario-info="${type}"]`), before = await actionCount();
        assert.equal(await markers.count(), count);
        assert.equal(await markers.first().getAttribute("role"), "button");
        if (width === 390) await markers.first().tap();
        else await markers.first().click();
        assert.ok((await page.locator("#scenarioInfoTitle").textContent()).includes(title));
        assert.match(await page.locator("#scenarioInfoContent").textContent(), details);
        const box = await page.locator("#scenarioInfoDialog").boundingBox();
        assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= width + 1 && box.y + box.height <= 845);
        assert.equal(await page.locator("#scenarioInfoContent").evaluate(el => el.scrollWidth <= el.clientWidth + 1), true);
        await page.screenshot({ path: path.join(__dirname, `test-results/${type}-help-${width}.png`) });
        await page.keyboard.press("Escape");
        await markers.first().focus(); await page.keyboard.press("Space");
        assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), true, "Markers also open with the keyboard");
        await page.locator("#scenarioInfoDialog > [data-close]").click();
        assert.equal(await actionCount(), before, "Inspecting a wonder marker never submits a game action");
      }
    }
    await page.locator("#gameMapRules").click();
    for (const [type, title] of wonderMarkers) {
      await page.locator(`#sailingContent [data-scenario-info="${type}"]`).first().click();
      assert.ok((await page.locator("#scenarioInfoTitle").textContent()).includes(title));
      await page.locator("#scenarioInfoDialog > [data-close]").click();
      assert.equal(await page.locator("#sailingDialog").isVisible(), true, "Closing marker details returns to map rules");
    }
    await page.locator("#sailingAcknowledge").click();
    for (const [type] of wonderMarkers) {
      const build = create("wonders"); build.phase = "main"; build.players[0].resources = [4, 4, 4, 4, 4];
      const sites = build.scenario.wonderSites;
      const vertex = type === "wonder-bridge" ? sites.bridge[0] : type === "wonder-wall" ? sites.wall[0]
        : sites.setupForbidden.find(id => !sites.bridge.includes(id) && !sites.wall.includes(id));
      Object.assign(build.board.edges[build.board.vertices[vertex].edges[0]], { owner: 0, kind: "road" });
      assert.ok(E.legal(build, 0).settlements.includes(vertex));
      await show(build); await page.locator('[data-action="settlement"]').click();
      await page.locator(`#board [data-vertex="${vertex}"]`).click();
      assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), false, "An active build target takes priority over the marker below it");
      assert.deepEqual((await last()).action, { type: "settlement", vertex });
      E.act(build, 0, (await last()).action); await show(build);
      assert.equal(build.board.vertices[vertex].owner, 0);
    }
    const wonder = structuredClone(fixtures.wonders);
    Object.assign(wonder.board.vertices[wonder.scenario.wonderSites.bridge[0]], { owner: 0, level: 1 });
    wonder.players[0].resources = [6, 6, 6, 6, 6];
    await show(wonder);
    assert.equal(await page.locator(".wonder-card").count(), 5);
    assert.match(await page.locator(".wonder-build-rule").textContent(), /每付一次费用，建成一个阶段.*不是分数或选项/);
    assert.equal(await page.locator(".wonder-cost-label").count(), 5);
    assert.match(await page.locator('.wonder-card[data-wonder="bridge"] .wonder-cost').textContent(), /建 1 个阶段，支付/);
    assert.deepEqual(await page.locator('.wonder-card[data-wonder="bridge"] .wonder-resource').evaluateAll(nodes => nodes.map(n => n.getAttribute("aria-label"))), ["3 木材 / Lumber", "1 羊毛 / Wool", "1 麦子 / Grain"]);
    assert.match(await page.locator('.wonder-card[data-wonder="bridge"] .wonder-cost-repeat').textContent(), /四个阶段费用相同，每次都要支付/);
    assert.equal(await page.locator('.wonder-stages .next-stage').count(), 0, "Unclaimed wonders have no active next stage");
    assert.equal(await page.locator('.wonder-card[data-wonder="bridge"] button').isEnabled(), true);
    await page.locator('.wonder-card[data-wonder="bridge"] button').click();
    assert.deepEqual((await last()).action, { type: "chooseWonder", wonder: "bridge" });
    E.act(wonder, 0, (await last()).action); await show(wonder);
    assert.equal(await page.locator('.own-wonder .wonder-ship-marker').count(), 1);
    assert.match(await page.locator('.own-wonder .wonder-ship-marker').getAttribute("aria-label"), /Alice.*Reserved ship 1/);
    assert.equal(await page.locator('.own-wonder .wonder-ship-marker').evaluate(n => getComputedStyle(n).color), "rgb(241, 109, 102)");
    assert.match(await page.locator('.own-wonder .wonder-progress-label').textContent(), /已完成 0\/4/);
    assert.equal(await page.locator('.own-wonder .next-stage b').textContent(), "1");
    assert.match(await page.locator('[data-scenario-action="buildWonder"]').textContent(), /支付资源，建第 1 阶段/);
    const beforeStageClick = await page.evaluate(() => window.sent.length);
    await page.locator('.own-wonder .wonder-stages li').nth(3).click();
    assert.equal(await page.evaluate(() => window.sent.length), beforeStageClick, "Stage boxes display progress, not selectable build actions");
    const beforeStageCost = [...wonder.players[0].resources];
    await page.locator('[data-scenario-action="buildWonder"]').click();
    assert.deepEqual((await last()).action, { type: "buildWonder" });
    E.act(wonder, 0, (await last()).action); await show(wonder);
    assert.equal(await page.locator('.own-wonder .wonder-stages .complete').count(), 1);
    assert.deepEqual(wonder.players[0].resources, beforeStageCost.map((n, r) => n - wonder.scenario.wonderCards.find(c => c.id === "bridge").cost[r]), "One payment completes exactly one stage");
    assert.match(await page.locator('.own-wonder .wonder-progress-label').textContent(), /已完成 1\/4/);
    assert.equal(await page.locator('.own-wonder .next-stage b').textContent(), "2");
    assert.match(await page.locator('[data-scenario-action="buildWonder"]').textContent(), /支付资源，建第 2 阶段/);
    const wonderFinished = structuredClone(wonder); wonderFinished.players[0].resources = [12, 12, 12, 12, 12];
    await show(wonderFinished);
    for (const stage of [2, 3, 4]) {
      await page.locator('[data-scenario-action="buildWonder"]').click();
      assert.deepEqual((await last()).action, { type: "buildWonder" });
      E.act(wonderFinished, 0, (await last()).action); await show(wonderFinished);
      assert.equal(await page.locator('.own-wonder .wonder-stages .complete').count(), stage);
      assert.match(await page.locator('.own-wonder .wonder-progress-label').textContent(), new RegExp(`已完成 ${stage}/4`));
      if (stage < 4) assert.equal(await page.locator('.own-wonder .next-stage b').textContent(), String(stage + 1));
    }
    assert.equal(await page.locator('.own-wonder .next-stage').count(), 0);
    assert.match(await page.locator('[data-scenario-action="buildWonder"]').textContent(), /奇观已建成/);
    assert.equal(await page.locator('[data-scenario-action="buildWonder"]').isDisabled(), true);
    wonder.players[0].resources = [0, 0, 0, 0, 0]; await show(wonder);
    assert.equal(await page.locator('[data-scenario-action="buildWonder"]').isDisabled(), true);
    await show(wonder, 1); assert.equal(await page.locator('.wonder-card button:not(:disabled)').count(), 0);
    // A wonder's marker uses a physical ship, without inflating the board ship count.
    const fullShips = structuredClone(fixtures.wonders);
    Object.assign(fullShips.board.vertices[fullShips.scenario.wonderSites.bridge[0]], { owner: 0, level: 1 });
    fullShips.players[0].resources = [6, 6, 6, 6, 6];
    fullShips.board.edges.filter(e => e.owner === 0 && e.kind === "ship").forEach(e => { e.owner = -1; delete e.kind; });
    const stock = fullShips.board.edges.filter(e => e.owner < 0 && e.tiles.some(i => fullShips.board.tiles[i].resource === -2)).slice(0, 15);
    assert.equal(stock.length, 15); stock.forEach(e => Object.assign(e, { owner: 0, kind: "ship", builtTurn: 0 }));
    await show(fullShips);
    const exhaustedClaim = page.locator('.wonder-card[data-wonder="bridge"] button');
    assert.equal(await exhaustedClaim.isEnabled(), false);
    assert.match(await exhaustedClaim.textContent(), /需要库存船.*Ship required/);
    assert.equal(await exhaustedClaim.getAttribute("title"), E.legal(fullShips, 0).buildBlocked.chooseWonder);
    stock[14].owner = -1; delete stock[14].kind; await show(fullShips);
    assert.equal(await exhaustedClaim.isEnabled(), true);
    await exhaustedClaim.click(); E.act(fullShips, 0, (await last()).action); await show(fullShips);
    const reserved = E.publicGame(fullShips, 0).players[0];
    assert.equal(reserved.ships, 14); assert.equal(reserved.reservedShips, 1); assert.equal(reserved.availableShips, 0);
    assert.equal(E.legal(fullShips, 0).ships.length, 0);
    assert.equal(await page.locator('.own-wonder .wonder-ship-marker').count(), 1);
    await page.locator('#actions [data-action="ship"]').click();
    assert.equal(await page.locator("#buildNotice").textContent(), E.legal(fullShips, 0).buildBlocked.ship);
    assert.equal(await page.locator("#buildNotice").isVisible(), true);
    // A reached fortress enables attack, and the action ends the turn in the engine.
    const attack = structuredClone(fixtures.pirates), homeShip = attack.board.edges[attack.scenario.pirateSeats[0].ship];
    attack.scenario.pirateSeats[0].fortress = homeShip.a === attack.scenario.pirateSeats[0].home ? homeShip.b : homeShip.a;
    homeShip.warship = true; await show(attack);
    assert.equal(await page.locator('[data-scenario-action="attackFortress"]').isEnabled(), true);
    await page.locator('[data-scenario-action="attackFortress"]').click();
    assert.deepEqual((await last()).action, { type: "attackFortress" });
    E.act(attack, 0, (await last()).action, () => .99); assert.notEqual(attack.current, 0);
    await show(attack);
    assert.match(await page.locator("#pirateBattle").textContent(), /另掷一颗骰子：6/);
    assert.match(await page.locator("#pirateBattle").textContent(), /战舰 1 < 要塞骰点 6/);
    assert.match(await page.locator("#pirateBattle").textContent(), /损失最近的 1 艘船，防御仍为 3\/3/);
    assert.match(await page.locator("#pirateBattle").textContent(), /本回合结束/);
    // Raid feedback is based on the server's pre-loss snapshot, with no reconnect replay.
    const raid = structuredClone(fixtures.pirates), patrol = raid.scenario.piratePath;
    raid.board.vertices.forEach(v => Object.assign(v, { owner: -1, level: 0 }));
    raid.board.edges.forEach(e => { e.owner = -1; delete e.kind; delete e.warship; });
    raid.phase = "roll"; raid.current = 0; raid.board.pirate = patrol[0];
    const stop = raid.board.tiles[patrol[3]];
    Object.assign(raid.board.vertices[stop.vertices[0]], { owner: 0, level: 1 });
    Object.assign(raid.board.vertices.find(v => !stop.vertices.includes(v.id)), { owner: 0, level: 2 });
    raid.board.edges.slice(0, 2).forEach(e => Object.assign(e, { owner: 0, kind: "ship", warship: true }));
    raid.players.forEach((p, i) => { p.resources = i ? [1, 0, 0, 0, 0] : [4, 4, 0, 0, 0]; });
    raid.bank = [13, 15, 19, 19, 19];
    await show(raid);
    const raidDice = [.4, .6]; E.act(raid, 0, { type: "roll" }, () => raidDice.shift() ?? 0);
    await show(raid);
    const battle = page.locator("#pirateBattle");
    assert.equal(await battle.isVisible(), true); assert.equal(await battle.locator("li").count(), 3);
    assert.match(await battle.textContent(), /骰子 3 \+ 4，取较小的 3：顺时针走 3 格/);
    assert.match(await battle.textContent(), /Alice 的沿岸建筑遭袭：战舰 2 < 海盗 3/);
    assert.match(await battle.textContent(), /随机失去 2 张资源（1 \+ 1 座城市）/);
    assert.match(await battle.textContent(), /随后结算 7.*海盗不再移动/s);
    assert.match(await page.locator("#notice").textContent(), /战舰 2 < 海盗 3.*随机失去 2 张/);
    await page.evaluate(() => { window.battleNode = document.querySelector("#pirateBattle ol"); document.querySelector("#notice").hidden = true; });
    await show(raid, 0, { chat: [{ name: "Bob", text: "hi" }] });
    assert.equal(await page.evaluate(() => window.battleNode === document.querySelector("#pirateBattle ol")), true, "Chat cannot restart battle feedback");
    assert.equal(await page.locator("#notice").isVisible(), false);
    await emit({ type: "welcome", token: "test-token" }); await show(raid);
    assert.equal(await battle.evaluate(n => n.classList.contains("battle-arrival")), false, "Reconnecting shows the report without replaying it");
    assert.equal(await page.locator("#notice").isVisible(), false);
    await battle.locator("summary").click(); await show(raid);
    assert.equal(await battle.evaluate(n => n.open), false, "Repeated state preserves a collapsed report");
    raid.scenario.battle.id++; await show(raid);
    assert.equal(await battle.evaluate(n => n.open), true, "A new raid reopens feedback even when its outcome is identical");
    assert.equal(await page.locator("#notice").isVisible(), true);
    await page.evaluate(() => { document.querySelector("#notice").hidden = true; });
    for (const width of [320, 390, 740, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await battle.scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Raid fits ${width}`);
      assert.equal(await battle.locator("li").evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth + 1)), true, `Battle steps fit ${width}`);
      await battle.screenshot({ path: path.join(__dirname, `test-results/pirate-raid-${width}.png`), animations: "disabled" });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await battle.locator("li").first().evaluate(n => getComputedStyle(n).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const result of ["tie", "win", "clear", "loss"]) {
      const variant = structuredClone(raid);
      Object.assign(variant.scenario.battle, { id: raid.scenario.battle.id + 1, result, strength: result === "win" ? 4 : result === "tie" ? 3 : 0, actor: result === "clear" ? null : 0, reward: "pending", lost: 0 });
      await show(variant);
      const text = await battle.textContent();
      assert.match(text, { tie: /战力相等：不损失，也不领奖励/, win: /击退海盗：请选择 1 张银行资源/, clear: /没有村庄或城市，无人遭袭/, loss: /失去 0 张资源.*手牌不足/s }[result]);
    }
    await show(raid, 1); await page.evaluate(() => { document.querySelector("#notice").hidden = true; });
    raid.scenario.battle.id += 2; await show(raid, 1);
    assert.equal(await page.locator("#notice").isVisible(), false, "An observer sees the report without a personal loss alert");
    const warship = structuredClone(fixtures.pirates);
    warship.players[0].development = [{ type: "knight", turn: 0 }, { type: "knight", turn: 0 }, { type: "plenty", turn: 0 }];
    const starter = warship.board.edges[warship.scenario.pirateSeats[0].ship];
    const openEnd = starter.a === warship.scenario.pirateSeats[0].home ? starter.b : starter.a;
    const nextShip = warship.board.edges.find(e => e.owner < 0 && (e.a === openEnd || e.b === openEnd) && e.tiles.some(i => warship.board.tiles[i].resource === -2));
    assert.ok(nextShip); Object.assign(nextShip, { owner: 0, kind: "ship", builtTurn: 0 });
    await show(warship);
    assert.equal(await battle.isVisible(), false, "A fresh game has no stale battle report");
    assert.match(await page.locator(".warship-guide").textContent(), /1 羊毛 \+ 1 麦子 \+ 1 矿石/);
    assert.match(await page.locator(".warship-guide").textContent(), /每艘战舰 = 1 战力/);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const guide = page.locator(".warship-guide");
      assert.equal(await guide.evaluate(n => n.scrollWidth <= n.clientWidth + 1), true, `Warship guide fits ${width}`);
      await guide.screenshot({ path: path.join(__dirname, `test-results/warship-guide-${width}.png`) });
    }
    const sentBeforeHelp = await page.evaluate(() => window.sent.length);
    await page.locator('[data-scenario-info="warship"]').click();
    assert.match(await page.locator("#scenarioInfoContent").textContent(), /随机抽到骑士.*并不是每次购买/s);
    assert.match(await page.locator("#scenarioInfoContent").textContent(), /下一个自己的回合.*最靠近主岛.*没有普通船/s);
    assert.equal(await page.evaluate(() => window.sent.length), sentBeforeHelp, "Warship help does not send a game action");
    await page.locator('#scenarioInfoDialog [data-close]').first().click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.match(await page.locator('[data-dev="knight"]').first().textContent(), /战舰.*Warship/);
    await page.locator('[data-dev="knight"]').first().click();
    assert.deepEqual((await last()).action, { type: "playDevelopment", card: "knight" });
    E.act(warship, 0, (await last()).action); assert.ok(warship.board.edges.some(e => e.owner === 0 && e.warship));
    await show(warship);
    assert.ok(warship.board.edges.some(e => e.owner === 0 && e.kind === "ship" && !e.warship));
    assert.equal(await page.locator('[data-dev="knight"]').isDisabled(), true, "A second Warship is blocked even with a normal ship to convert");
    assert.equal(await page.locator('[data-dev="plenty"]').isDisabled(), true, "Warship consumes the normal development-card allowance");
    await page.locator("#gameBaseRules").click();
    assert.match(await page.locator("#rulesScenarioNote").textContent(), /one action development card per turn/);
    assert.doesNotMatch(await page.locator("#rulesScenarioNote").textContent(), /Multiple old Warships/);
    await page.locator("#helpAcknowledge").click();
    // Pirate Islands seven can steal from any opponent, including remote buildings.
    const seven = structuredClone(fixtures.pirates); seven.phase = "roll";
    seven.players.forEach((p, id) => { p.resources = id ? [3, 0, 0, 0, 0] : [0, 0, 0, 0, 0]; });
    seven.bank = [13, 19, 19, 19, 19];
    const rolls = [.4, .6]; E.act(seven, 0, { type: "roll" }, () => rolls.length ? rolls.shift() : .1);
    assert.equal(seven.phase, "steal"); assert.equal(seven.thief, "pirate");
    const pirateTile = seven.board.tiles[seven.board.pirate];
    const remote = seven.board.vertices.find(v => seven.victims.includes(v.owner) && !pirateTile.vertices.includes(v.id));
    assert.ok(remote, "A legal victim has a building away from the pirate");
    await show(seven);
    assert.match(await page.locator("#turnPrompt").textContent(), /任意对手.*any opponent/);
    await page.locator(`#board [data-steal-vertex="${remote.id}"][data-victim="${remote.owner}"]`).click();
    assert.deepEqual((await last()).action, { type: "steal", victim: remote.owner, loot: "resource" });
    E.act(seven, 0, (await last()).action, () => .1);
    assert.equal(E.sum(seven.players[0].resources), 1); assert.equal(seven.phase, "main");
    // Gold's existing prominent alert and icon picker remain intact.
    const gold = structuredClone(fixtures.tribes); gold.phase = "gold"; gold.goldQueue = [{ id: 0, count: 2 }];
    await show(gold); assert.equal(await page.locator("#goldChoiceAlert").isVisible(), true);
    await page.locator("#chooseGold").click(); await page.locator('[data-add-resource="0"]').click(); await page.locator('[data-add-resource="1"]').click();
    await page.locator("#confirmResources").click(); assert.deepEqual((await last()).action, { type: "gold", resources: [1, 1, 0, 0, 0] });
    // Visual/layout contracts include inline assets, compact cards and rule counts.
    fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      await show(wonder);
      await page.locator("#scenarioWonders").scrollIntoViewIfNeeded();
      const overflow = await page.evaluate(() => [...document.querySelectorAll("body *")].filter(n => !n.closest("svg") && n.getBoundingClientRect().width && n.getBoundingClientRect().right > innerWidth + 1).map(n => `${n.tagName}#${n.id}.${n.className} ${n.getBoundingClientRect().right}`).slice(0, 15));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${width}: no page overflow: ${overflow.join("; ")}`);
      const boxes = await page.locator(".wonder-art use").evaluateAll(nodes => nodes.map(node => { const b = node.getBBox(); return [node.getAttribute("href"), b.width, b.height]; }));
      assert.equal(boxes.length, 5); boxes.forEach(([href, w, h]) => { assert.ok(href.startsWith("#catan-scenario-art-")); assert.ok(w > 50 && h > 40); });
      assert.equal(await page.locator(".wonder-card").evaluateAll(nodes => nodes.every(n => n.scrollWidth <= n.clientWidth + 1)), true);
      assert.equal(await page.locator(".wonder-stages li").evaluateAll(nodes => nodes.every(n => [...n.children].every(child => { const b = child.getBoundingClientRect(), p = n.getBoundingClientRect(); return b.left >= p.left && b.right <= p.right + 1 && b.top >= p.top && b.bottom <= p.bottom; }))), true, `Stage numbers and status labels fit ${width}px`);
      assert.equal(await page.locator(".wonder-card").evaluateAll(nodes => nodes.every(n => {
        const parts = [".wonder-cost", ".wonder-cost-repeat", ".wonder-progress-label", ".wonder-stages", ".wonder-owner", "button"].map(selector => n.querySelector(selector).getBoundingClientRect());
        return parts.every((b, i) => !i || b.top >= parts[i - 1].bottom - 1);
      })), true, `Cost, progress and action never overlap at ${width}px`);
      await page.locator("#scenarioWonders").screenshot({ path: path.join(__dirname, `test-results/scenario-wonders-${width}.png`) });
      await page.locator('.wonder-card[data-wonder="bridge"]').screenshot({ path: path.join(__dirname, `test-results/wonder-card-explained-${width}.png`) });
      await page.locator("#gameBaseRules").click();
      for (const text of ["Knight × 14", "Victory Point × 5", "Road Building × 2", "Year of Plenty × 2", "Monopoly × 2"]) assert.ok((await page.locator("#rulesDevelopment").textContent()).includes(text));
      assert.match(await page.locator("#rulesVictory").textContent(), /stage 4/);
      assert.match(await page.locator("#rulesScenarioNote").textContent(), /claiming requires an available ship/);
      await page.locator("#helpAcknowledge").click();
      await show(pirate, 1); await page.locator('[data-special="pirateReward"]').click();
      assert.equal(await page.locator("#resourceDialog").evaluate(n => n.scrollWidth <= n.clientWidth + 1), true);
      await page.locator('#resourceDialog [data-close]').click();
      for (const map of ["tribes", "cloth", "pirates", "new-world"]) {
        const g = map === "new-world" ? create(map) : fixtures[map]; await show(g);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${map} fits ${width}`);
        if (width < 400) await page.screenshot({ path: path.join(__dirname, `test-results/scenario-${map}-${width}.png`), fullPage: true });
      }
    }
    // One live player table moves with the desktop breakpoint, preserving interactions.
    await page.evaluate(() => { window.playerTableNode = document.querySelector(".player-overview"); });
    for (const map of ["base", "tribes", "wonders"]) {
      const g = map === "base" ? setup(E.createGame(names, seeded(25))) : fixtures[map];
      await show(g);
      for (const width of [1440, 980, 741, 740, 390, 320, 1440]) {
        await page.setViewportSize({ width, height: width > 740 ? 1000 : 844 });
        await page.waitForFunction(desktop => document.querySelector(".player-overview").parentElement.matches(desktop ? ".board-section" : ".play-sidebar"), width > 740);
        const layout = await page.evaluate(() => {
          const overview = document.querySelector(".player-overview"), box = overview.getBoundingClientRect(), turn = document.querySelector(".turn-banner").getBoundingClientRect(), sidebar = document.querySelector(".play-sidebar").getBoundingClientRect();
          return { same: overview === window.playerTableNode, count: document.querySelectorAll(".player-overview").length, belowTurn: box.top >= turn.bottom, aboveWonders: overview.nextElementSibling?.id === "scenarioWonders", beforeBank: overview.nextElementSibling?.id === "supplyDetails", leftOfSidebar: box.right <= sidebar.left, fits: box.left >= 0 && box.right <= innerWidth && overview.scrollWidth <= overview.clientWidth + 1 };
        });
        assert.equal(layout.same, true, "Resizing reuses the existing table"); assert.equal(layout.count, 1); assert.equal(layout.fits, true, `${map}/${width} player table fits`);
        if (width > 740) { assert.equal(layout.belowTurn, true); assert.equal(layout.aboveWonders, true); assert.equal(layout.leftOfSidebar, true); }
        else assert.equal(layout.beforeBank, true, "Phone keeps the original sidebar order");
        assert.equal(await page.locator("#players > tr").count(), g.players.length);
        if ([1440, 390].includes(width)) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({ path: path.join(__dirname, `test-results/player-layout-${map}-${width}.png`), fullPage: true });
        }
      }
    }
    await show(fixtures.tribes);
    await show(fixtures.tribes, 0, { chat: [{ id: "layout-chat", name: "Bob", text: "hello", playerId: 1 }] });
    assert.equal(await page.locator('#players [data-chat-bubble="1"]').isVisible(), true);
    await page.locator('#players [data-social-id="test-person-1"]').click();
    assert.equal(await page.locator(".reaction-menu").isVisible(), true);
    await page.locator('[data-reaction="flowers"]').click();
    assert.deepEqual(await last(), { type: "reaction", target: "test-person-1", kind: "flowers" });
    await page.locator("#players [data-edit-avatar]").click();
    assert.equal(await page.locator("#avatarDialog").isVisible(), true);
    await page.locator("#avatarDialog [data-avatar-close]").first().click();
    const shared = structuredClone(fixtures.cloth); shared.phase = "over"; shared.winner = 0; shared.winners = [0, 1]; await show(shared);
    assert.match(await page.locator("#winnerText").textContent(), /Alice.*Bob.*win together/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
