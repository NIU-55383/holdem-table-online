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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.addInitScript(() => {
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
    assert.equal(await page.locator('#catan-scenario-art-fortress path').last().getAttribute("fill"), "currentColor", "Fortress flags inherit their owner's color");
    const emit = data => page.evaluate(data => window.testSocket.emit(data), data);
    const show = (g, you = 0, patch = {}) => emit(room(g, you, patch));
    const last = () => page.evaluate(() => window.sent.at(-1));
    const fixtures = {};
    for (const map of ["tribes", "cloth", "pirates", "wonders", "new-world"]) for (const n of [3, 4]) {
      await emit({ type: "left" });
      await page.locator('[data-edition="seafarers"]').click();
      await page.locator("#mapChoice").selectOption(map);
      assert.match(await page.locator(`#mapChoice option[value="${map}"]`).textContent(), /3–4/);
      assert.equal(await page.locator("#playerCountChoice").isVisible(), true);
      await page.locator(`[data-seats="${n}"]`).click();
      await page.locator("#name").fill("Alice");
      if (map === "new-world") await page.locator('[data-thieves="pirate"]').click();
      if (map === "pirates") assert.match(await page.locator('[data-layout="random"]').textContent(), /Random harbors/);
      await page.locator("#create").click();
      assert.equal((await last()).mapId, map); assert.equal((await last()).seats, n);
      if (map === "new-world") assert.equal((await last()).thieves, "pirate");
      assert.equal(await page.locator("dialog[open]").count(), 0, "rules are manual only");
      const g = create(map, n); await show(g);
      if (map === "new-world") { assert.equal(g.phase, "scenarioChoice"); assert.match(await page.locator("#scenarioPanel").textContent(), /Initial Harbors/); assert.equal(g.scenario.harborRemaining, 10); }
      const action = E.chooseBotAction(g, E.requiredActors(g)[0] ?? g.current);
      const selector = action.type === "placeHarbor" ? `[data-edge="${action.edge}"]` : `[data-vertex="${action.vertex}"]`;
      await page.locator(`#board ${selector}`).click();
      assert.deepEqual((await last()).action, action.type === "settlement" ? { type: "settlement", vertex: action.vertex } : action);
      E.act(g, E.requiredActors(g)[0] ?? g.current, action, seeded(11));
      setup(g); await show(g);
      assert.equal(await page.locator("#game").getAttribute("data-phase"), "main");
      assert.equal(await page.locator('#actions [data-action="road"]').count(), 1);
      if (n === 3) fixtures[map] = structuredClone(g);
    }
    // Special victory conditions are complete sentences, not an overflowing score suffix.
    for (const map of ["wonders", "pirates", "tribes"]) {
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
      for (const width of [320, 390, 740, 741, 980, 1440]) {
        await page.setViewportSize({ width, height: width > 740 ? 1000 : 844 });
        const fits = await page.locator("#victoryTarget").evaluate(el => {
          const r = el.getBoundingClientRect(), toolbar = el.parentElement.getBoundingClientRect(), board = document.querySelector("#boardViewport").getBoundingClientRect();
          const children = [...el.querySelectorAll("p, strong, small, .victory-target-heading")].filter(n => n.getBoundingClientRect().width);
          return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= toolbar.top && r.bottom <= toolbar.bottom + 1 && r.bottom <= board.top + 1
            && el.scrollWidth <= el.clientWidth + 1 && children.every(n => { const b = n.getBoundingClientRect(); return b.left >= r.left && b.right <= r.right + 1 && b.top >= r.top && b.bottom <= r.bottom + 1 && n.scrollWidth <= n.clientWidth + 1; });
        });
        assert.equal(fits, true, `${map} target fits above the map at ${width}px: ${fits ? "" : JSON.stringify(await page.locator("#victoryTarget").evaluate(el => [el.parentElement, el, document.querySelector("#boardViewport"), ...el.querySelectorAll("p, strong, small, .victory-target-heading")].map(n => ({ tag: n.id || n.className || n.tagName, box: n.getBoundingClientRect().toJSON(), scroll: n.scrollWidth, client: n.clientWidth }))))}`);
        if (map === "wonders") {
          const blocks = await page.locator("#scenarioVictoryConditions > p").evaluateAll(nodes => nodes.map(n => ({ top: n.getBoundingClientRect().top, bottom: n.getBoundingClientRect().bottom })));
          assert.ok(blocks.every((b, i) => !i || b.top >= blocks[i - 1].bottom), "Each condition has its own non-overlapping row");
          await page.locator(".board-toolbar").screenshot({ path: path.join(__dirname, "test-results", `wonder-victory-conditions-${width}.png`) });
        }
      }
    }
    // Foreign terrain is not a resource reward; gift inspection never plays a turn.
    await show(fixtures.tribes);
    assert.equal(await page.locator("#board .foreign-island use").count(), 0, "No resource icons in foreign island centers");
    assert.equal(await page.locator('#board [data-scenario-info="harbor"]').count(), 6);
    assert.equal(await page.locator('#board [data-scenario-info="harbor"] use[href$="ship"]').count(), 0, "Generic harbors are not drawn as ships");
    assert.equal(await page.locator('#board [data-scenario-info="harbor"][data-resource="-1"]').textContent().then(t => t.includes("3:1")), true);
    const beforeInspect = await page.evaluate(() => window.sent.length);
    for (const type of ["foreign", "vp", "development", "pirate"]) {
      const marker = page.locator(`#board [data-scenario-info="${type}"]`).first();
      await marker.focus(); await page.keyboard.press("Enter");
      assert.equal(await page.locator("#scenarioInfoDialog").isVisible(), true, `${type} opens by keyboard`);
      assert.match(await page.locator("#scenarioInfoContent").textContent(), /不会领取礼物/);
      if (type === "foreign") assert.match(await page.locator("#scenarioInfoContent").textContent(), /不生产木材/);
      if (type === "pirate") assert.match(await page.locator("#scenarioInfoContent").textContent(), /不属于任何玩家/);
      await page.keyboard.press("Escape");
    }
    for (const r of [-1, 0, 1, 2, 3, 4]) {
      await page.locator(`#board [data-scenario-info="harbor"][data-resource="${r}"]`).click();
      assert.match(await page.locator("#scenarioInfoTitle").textContent(), r < 0 ? /3:1/ : /2:1/);
      assert.match(await page.locator("#scenarioInfoContent").textContent(), /不是资源卡/);
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
    }
    await page.locator("#gameMapRules").click();
    const harborRule = page.locator("#sailingContent > p").filter({ hasText: "六个海港礼物" });
    assert.match(await harborRule.textContent(), /没有合法位置则暂存/);
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
    const warship = structuredClone(fixtures.pirates);
    warship.players[0].development = [{ type: "knight", turn: 0 }, { type: "knight", turn: 0 }, { type: "plenty", turn: 0 }];
    const starter = warship.board.edges[warship.scenario.pirateSeats[0].ship];
    const openEnd = starter.a === warship.scenario.pirateSeats[0].home ? starter.b : starter.a;
    const nextShip = warship.board.edges.find(e => e.owner < 0 && (e.a === openEnd || e.b === openEnd) && e.tiles.some(i => warship.board.tiles[i].resource === -2));
    assert.ok(nextShip); Object.assign(nextShip, { owner: 0, kind: "ship", builtTurn: 0 });
    await show(warship);
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
