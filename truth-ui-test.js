"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { once } = require("node:events"), { spawn } = require("node:child_process");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }

async function main() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true,
    env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0", TRUTH_BOT_DELAY: "60000" }, stdio: ["ignore", "pipe", "pipe"] });
  let browser, logs = ""; child.stdout.on("data", chunk => logs += chunk); child.stderr.on("data", chunk => logs += chunk);
  const origin = `http://127.0.0.1:${port}`, errors = [], out = path.join(__dirname, "test-results");
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) { try { ready = (await fetch(origin + "/truth.html")).ok; } catch {} if (ready) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert(ready, logs); fs.mkdirSync(out, { recursive: true });
    browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    async function client() {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
      await context.addInitScript(() => {
        window.testEvents = []; window.testSent = []; window.testSounds = [];
        const Native = WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", event => { const data = JSON.parse(event.data); testEvents.push(data); if (data.type === "state") window.testState = data; }); }
          send(data) { testSent.push(JSON.parse(data)); super.send(data); }
        };
        let audioApi;
        Object.defineProperty(window, "BoardGameAudio", { configurable: true, get: () => audioApi, set(value) {
          audioApi = value; const create = value.create;
          value.create = (...args) => { const audio = create(...args), play = audio.play; audio.play = kind => { const audible = play(kind); testSounds.push({ kind, audible }); return audible; }; return audio; };
        } });
        // Inject only the engine's supported RNG argument, leaving all actions and scoring real.
        let engine;
        Object.defineProperty(window, "TruthEngine", { configurable: true, get: () => engine, set(value) {
          engine = { ...value, act(game, actor, action) { return value.act(game, actor, action, () => window.testRandoms?.shift() ?? .1); } };
        } });
      });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on("pageerror", error => errors.push(error.message));
      await page.goto(origin + "/truth.html");
      return { context, page };
    }
    async function layout(page, stage) {
      for (const [width, height] of [[1440, 1000], [900, 900], [390, 844], [320, 740], [740, 320]]) {
        await page.setViewportSize({ width, height });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${stage}: horizontal overflow at ${width}×${height}`);
        assert(await page.locator(".play-table").isVisible());
        await page.screenshot({ path: path.join(out, `truth-${stage}-${width}x${height}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    async function rules(page) {
      const before = await page.evaluate(() => ({ sent: testSent.length, local: sessionStorage.getItem("boardclub-truth-local") }));
      await page.locator("#rulesBtn").click(); const dialog = page.locator("#gameRulesDialog"); await dialog.waitFor();
      assert.match(await dialog.locator("h2").textContent(), /Truth or Dare Rules/);
      await dialog.locator(".bg-rules-body").evaluate(el => el.scrollTop = el.scrollHeight);
      assert(await dialog.evaluate(el => { const r = el.getBoundingClientRect(), b = el.querySelector(".bg-rules-body"); return r.left >= 0 && r.right <= innerWidth + 1 && b.scrollWidth <= b.clientWidth + 1 && b.scrollTop + b.clientHeight >= b.scrollHeight - 1; }));
      await page.keyboard.press("Escape"); assert.equal(await dialog.isVisible(), false);
      assert.equal(await page.locator("#rulesBtn").evaluate(el => document.activeElement === el), true);
      assert.deepEqual(await page.evaluate(() => ({ sent: testSent.length, local: sessionStorage.getItem("boardclub-truth-local") })), before, "rules must not change or send game state");
    }
    async function levels(page) {
      const keys = ["chill", "heat", "wild", "unmasked", "showdown"], names = ["轻松", "心跳", "爆场", "失守", "摊牌"];
      const group = page.getByRole("group", { name: "刺激等级 / Intensity" });
      assert.equal(await group.getByRole("button").count(), 5);
      assert.deepEqual(await page.evaluate(() => ({ truths: TruthData.PROMPTS.filter(p => p.kind === "truth").length, dares: TruthData.PROMPTS.filter(p => p.kind === "dare").length })), { truths: 150, dares: 100 });
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [index, key] of keys.entries()) {
          const button = group.locator('[data-level="' + key + '"]');
          await button.focus(); await page.keyboard.press(index % 2 ? "Space" : "Enter");
          assert.equal(await button.getAttribute("aria-pressed"), "true");
          assert.equal(await group.locator('[aria-pressed="true"]').count(), 1);
          assert.match(await button.textContent(), new RegExp("LV\\.\\s*" + (index + 1)));
          assert((await button.textContent()).includes(names[index]));
          assert.match(await button.textContent(), new RegExp(key, "i"));
          assert.match(await page.locator("#levelDescription .level-count").textContent(), /真心话 30 题.*大冒险 20 题.*30 Truth.*20 Dare/);
          const box = await button.boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width + 1 && box.width >= 44 && box.height >= 44, key + " remains readable and operable at " + width);
          assert.equal(await button.evaluate(el => el.scrollWidth > el.clientWidth + 1), false, key + " label fits");
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, key + " selection does not overflow at " + width);
        }
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const local = await client(), p = local.page;
    const localState = () => p.evaluate(() => JSON.parse(sessionStorage.getItem("boardclub-truth-local")));
    async function localRoll(face) {
      const before = (await localState()).game.revision;
      await p.evaluate(value => window.testRandoms = [(value - .5) / 6, .1], face);
      await p.locator('[data-play="roll"]:not([disabled])').click();
      await p.waitForFunction(revision => JSON.parse(sessionStorage.getItem("boardclub-truth-local")).game.revision === revision + 1, before);
    }
    async function localChoose(kind) {
      await p.locator('[data-play="choose"][data-kind="' + kind + '"]:not([disabled])').click();
      await p.locator('[data-play="ask"]:not([disabled])').waitFor();
      assert.equal((await localState()).game.kind, kind);
    }
    async function localAsk(custom) {
      if (custom) await p.locator("#customPrompt").fill(custom);
      await p.locator('[data-play="ask"]:not([disabled])').click();
      await p.locator('[data-play="complete"]:not([disabled])').waitFor();
      assert.equal((await localState()).game.current, (await localState()).game.target);
      if (custom) assert.equal(await p.locator("#promptZh").textContent(), custom);
    }
    await levels(p); await layout(p, "setup"); await rules(p);
    await p.locator("#localNames").fill("Alice\nBob\nCarol"); await p.locator("#rounds").selectOption("3"); await p.locator('[data-level="unmasked"]').click(); await p.locator('[data-category="mixed"]').click(); await p.locator("#createBtn").click();
    assert.equal((await localState()).game.mode, "mixed"); assert.equal(await p.locator("#players .player-row").count(), 3);
    assert.equal(await p.locator("#players .presence-dot").first().evaluate(el => getComputedStyle(el).backgroundColor), "rgb(36, 151, 107)");
    for (const face of [2, 2, 2]) await localRoll(face);
    assert.equal((await localState()).game.tie.role, "all"); assert.deepEqual((await localState()).game.tie.candidates, [0, 1, 2]);
    for (const face of [6, 6, 1]) await localRoll(face);
    assert.equal((await localState()).game.tie.role, "high"); assert.deepEqual((await localState()).game.tie.candidates, [0, 1]);
    for (const face of [2, 5]) await localRoll(face);
    assert.equal((await localState()).game.asker, 1); assert.equal((await localState()).game.target, 2); assert.equal((await localState()).game.current, 1);
    await localChoose("dare");
    assert.match((await localState()).game.prompt.id, /^unmasked-dare-/);
    assert.match(await p.locator("#roomSettings").textContent(), /失守/);
    const previousPrompt = (await localState()).game.prompt.id;
    await p.locator('[data-play="reroll"]').click();
    assert.notEqual((await localState()).game.prompt.id, previousPrompt); assert.equal((await localState()).game.turns, 0); assert.deepEqual((await localState()).game.scores, [0, 0, 0]);
    const custom = "用电影预告片的语气介绍今晚这桌朋友。";
    await p.locator("#customPrompt").fill(custom); await layout(p, "prepare"); await rules(p);
    await localAsk(custom); await layout(p, "challenge");
    await p.locator('[data-play="complete"]').click(); assert.deepEqual((await localState()).game.scores, [0, 0, 1]);
    assert.equal((await localState()).game.round, 2); assert.equal((await localState()).game.turns, 1);
    const retained = await localState(); await p.reload(); assert.deepEqual(await localState(), retained, "refresh retains contest scores, IDs, history and next roller");
    for (const face of [6, 1, 1]) await localRoll(face);
    assert.equal((await localState()).game.tie.role, "low"); assert.deepEqual((await localState()).game.tie.candidates, [1, 2]);
    for (const face of [5, 2]) await localRoll(face);
    assert.equal((await localState()).game.asker, 0); assert.equal((await localState()).game.target, 2);
    await localChoose("truth"); await localAsk(); await p.locator('[data-play="skip"]').click(); assert.deepEqual((await localState()).game.scores, [0, 0, 1]);
    for (const face of [6, 3, 1]) await localRoll(face);
    await localChoose("truth"); await localAsk(); await p.locator('[data-play="complete"]').click();
    assert.equal((await localState()).game.phase, "over"); assert.equal((await localState()).game.turns, 3); assert.deepEqual((await localState()).game.scores, [0, 0, 2]);
    assert.match(await p.locator("#promptZh").textContent(), /Carol 胜利/); assert.match(await p.locator("#promptEn").textContent(), /Carol wins/);
    await layout(p, "winner"); await p.locator('[data-play="restart"]').click(); assert.deepEqual((await localState()).game.scores, [0, 0, 0]); assert.equal((await localState()).game.turns, 0);
    for (const [category, level] of [["truth", "unmasked"], ["dare", "showdown"]]) {
      await p.locator("#leaveBtn").click(); await p.locator("#confirmLeave").click(); await p.locator("#localNames").fill("Alice\nBob"); await p.locator('[data-category="' + category + '"]').click(); await p.locator('[data-level="' + level + '"]').click(); await p.locator("#createBtn").click();
      await localRoll(1); await localRoll(6);
      assert.equal((await localState()).game.level, level);
      assert.match((await localState()).game.prompt.id, new RegExp("^" + level + "-" + category + "-"));
      assert.equal((await localState()).game.mode, category); assert.equal((await localState()).game.stage, "prepare"); assert.equal((await localState()).game.kind, category);
      assert.equal(await p.locator('[data-play="choose"]').count(), 0, "fixed modes never offer the other category");
      assert.equal((await localState()).game.asker, 1); assert.equal((await localState()).game.target, 0);
      await localAsk(); await p.locator('[data-play="skip"]').click();
    }
    await local.context.close();
    console.log("PASS: five keyboard-accessible levels at desktop/320px, 150 truths, both new local tiers, all/high/low tie rerolls, three categories, highest asks lowest, custom/free prompts, contest scores, refresh, winner/restart and responsive rules");

    const a = await client(), b = await client();
    for (const [c, name] of [[a, "Laura"], [b, "Colin"]]) {
      await c.page.locator('[data-mode="online"]').click(); await c.page.waitForFunction(() => testEvents.some(e => e.type === "welcome")); await c.page.locator("#playerName").fill(name);
    }
    await a.page.locator('[data-level="showdown"]').click();
    await a.page.locator("#rounds").selectOption("3"); await a.page.locator("#createBtn").click(); await a.page.waitForFunction(() => window.testState?.code);
    const code = await a.page.evaluate(() => testState.code);
    assert.equal(await a.page.evaluate(() => testState.level), "showdown");
    assert.match(await a.page.locator("#roomSettings").textContent(), /摊牌/);
    await a.page.locator("#addBotBtn").click(); await a.page.waitForFunction(() => testState.seats.some(seat => seat.bot));
    const bot = await a.page.evaluate(() => testState.seats.find(seat => seat.bot));
    const removeButton = a.page.locator(`[data-remove-bot="${bot.socialId}"]`), removal = a.page.locator(".removal-confirm-dialog");
    for (const step of [1, 2]) {
      await removeButton.click(); await removal.waitFor(); assert.equal(await removal.locator(".removal-name").textContent(), bot.name);
      if (step === 2) { await removal.locator('[data-room-action="confirmKick"]').click(); assert.match(await removal.locator("h2").textContent(), /2\/2/); }
      await removal.locator('[data-room-action="cancelKick"]').click();
      assert.equal(await a.page.evaluate(id => testState.seats.some(seat => seat.socialId === id), bot.socialId), true, `cancel step ${step} keeps the same bot`);
      assert.equal(await a.page.evaluate(() => testSent.filter(message => message.type === "removeBot").length), 0);
    }
    await removeButton.click(); await removal.locator('[data-room-action="confirmKick"]').click();
    assert.equal(await removal.locator(".removal-name").textContent(), bot.name); await removal.locator('[data-room-action="executeKick"]').click();
    await a.page.waitForFunction(id => !testState.seats.some(seat => seat.socialId === id), bot.socialId);
    assert.deepEqual(await a.page.evaluate(() => testSent.filter(message => message.type === "removeBot")), [{ type: "removeBot", target: bot.socialId }], "two confirmations remove exactly the named public ID");
    await b.page.locator("#roomInput").fill(code); await b.page.locator("#joinForm button").click();
    await b.page.waitForFunction(() => testState?.seats?.length === 2); await a.page.waitForFunction(() => testState?.seats?.length === 2);
    assert.equal(await a.page.locator("#startBtn").isDisabled(), true); await b.page.locator("#readyBtn").click(); await a.page.locator("#startBtn:not([disabled])").click();
    for (const c of [a, b]) await c.page.waitForFunction(() => window.testState?.game?.stage === "roll");
    assert.equal(await b.page.locator('#playActions button:not([disabled])').count(), 0, "other players cannot act");
    await a.page.locator("[data-room-manage]").click(); assert.equal(await a.page.locator("[data-room-idle-auto]").isChecked(), false); await a.page.locator("[data-room-close]").click();
    await rules(a.page);
    const ownId = await a.page.evaluate(() => testState.seats[testState.you].socialId), targetId = await b.page.evaluate(() => testState.seats[testState.you].socialId);
    await a.page.locator(`[data-social-id="${ownId}"]`).click(); await a.page.locator("#avatarDialog[open]").waitFor(); await a.page.locator("#avatarEmoji").fill("🌟"); await a.page.locator("#avatarSave").click();
    await b.page.waitForFunction(() => testState.seats[0].avatar?.value === "🌟");
    await a.page.locator(`[data-social-id="${targetId}"]`).click(); await a.page.locator(".reaction-menu").waitFor(); assert.equal(await a.page.locator(".reaction-options button").count(), 6);
    const menu = await a.page.locator(".reaction-menu").boundingBox(); assert(menu.x >= 0 && menu.x + menu.width <= 391 && menu.y >= 0 && menu.y + menu.height <= 845);
    const revision = await a.page.evaluate(() => testState.game.revision);
    await a.page.locator('[data-reaction="flowers"]').click();
    for (const c of [a, b]) {
      await c.page.locator('[data-reaction-kind="flowers"]').waitFor();
      assert.equal(await c.page.evaluate(() => testSounds.filter(s => s.kind === "reaction-flowers").length), 1, "one sound for one confirmed reaction");
      await c.page.evaluate(() => { const event = testEvents.find(e => e.type === "reaction"); testSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) })); testSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ ...event, id: "foreign-ui-check", room: "FOREIGN" }) })); });
      assert.equal(await c.page.evaluate(() => testSounds.filter(s => s.kind === "reaction-flowers").length), 1, "duplicate and foreign events stay silent");
      assert.equal(await c.page.evaluate(() => testState.game.revision), revision, "reactions leave game revision unchanged");
    }
    await b.page.locator("#chatText").fill("Hi Laura"); await b.page.locator("#chatForm button").click(); await a.page.locator(".player-chat").waitFor();
    assert.equal(await a.page.locator(".player-chat").textContent(), "Hi Laura");
    assert((await a.page.locator(".player-chat").boundingBox()).width < (await a.page.locator(".player-row").nth(1).boundingBox()).width);
    async function onlineContest(kind, outcome, custom, players = [a, b]) {
      const first = players[0], before = await first.page.evaluate(() => testState.game.turns);
      let rolls = 0;
      while (await first.page.evaluate(() => testState.game.stage === "roll")) {
        assert(++rolls < 100, "random rolls eventually resolve both roles");
        const current = await first.page.evaluate(() => testState.game.current), actor = players[current], other = players[1 - current];
        const revision = await actor.page.evaluate(() => testState.game.revision);
        assert.equal(await other.page.locator('#playActions button:not([disabled])').count(), 0, "only the required roller can roll");
        await actor.page.locator('[data-play="roll"]:not([disabled])').click();
        for (const c of players) await c.page.waitForFunction(value => testState.game.revision === value + 1, revision);
      }
      const askerIndex = await first.page.evaluate(() => testState.game.asker), targetIndex = await first.page.evaluate(() => testState.game.target);
      assert.notEqual(askerIndex, targetIndex);
      const asker = players[askerIndex], target = players[targetIndex];
      assert.equal(await target.page.locator('#playActions button:not([disabled])').count(), 0, "lowest roller waits while highest chooses");
      if (await asker.page.evaluate(() => testState.game.stage === "choose")) await asker.page.locator('[data-play="choose"][data-kind="' + kind + '"]:not([disabled])').click();
      await asker.page.locator('[data-play="ask"]:not([disabled])').waitFor();
      const promptId = await asker.page.evaluate(() => testState.game.prompt.id), selectedLevel = await asker.page.evaluate(() => testState.game.level);
      assert.match(promptId, new RegExp("^" + selectedLevel + "-" + kind + "-"));
      await asker.page.locator('[data-play="reroll"]').click(); await asker.page.waitForFunction(id => testState.game.prompt.id !== id, promptId);
      assert.equal(await asker.page.evaluate(() => testState.game.turns), before, "free prompt redraw does not consume a contest");
      if (custom) await asker.page.locator("#customPrompt").fill(custom);
      await asker.page.locator('[data-play="ask"]:not([disabled])').click(); await target.page.locator('[data-play="complete"]:not([disabled])').waitFor();
      assert.equal(await asker.page.locator('#playActions button:not([disabled])').count(), 0, "highest roller cannot confirm the target's completion");
      if (custom) { assert.equal(await target.page.locator("#promptZh").textContent(), custom); assert.equal(await asker.page.locator("#promptZh").textContent(), custom); }
      await target.page.locator('[data-play="' + outcome + '"]').click();
      for (const c of players) await c.page.waitForFunction(n => testState.game.turns === n + 1, before);
      return targetIndex;
    }
    const scoredTarget = await onlineContest("truth", "complete", "哪次误会后来成了你们最常讲的笑话？");
    await onlineContest("dare", "skip");
    const expectedScores = [0, 0]; expectedScores[scoredTarget] = 1;
    assert.deepEqual(await a.page.evaluate(() => testState.game.scores), expectedScores);
    const saved = await a.page.evaluate(() => ({ code: testState.code, game: testState.game, id: testState.seats[0].socialId, count: testState.seats.length }));
    assert.equal(new URL(a.page.url()).searchParams.get("room"), code);
    await a.page.reload(); await a.page.waitForFunction(() => window.testState?.game?.turns === 2);
    assert.deepEqual(await a.page.evaluate(() => ({ code: testState.code, game: testState.game, id: testState.seats[0].socialId, count: testState.seats.length })), saved, "refresh automatically rejoins the same room and identity without adding a seat");
    assert.equal(await a.page.evaluate(() => testState.host), 0, "refresh retains host within grace period");
    await layout(a.page, "online");
    await b.context.close(); await a.page.waitForFunction(() => testState.seats[1].connected === false);
    assert.equal(await a.page.locator(`#players [data-social-id="${targetId}"] .presence-dot`).evaluate(el => getComputedStyle(el).backgroundColor), "rgb(146, 153, 157)");
    assert.equal(await a.page.evaluate(() => testState.game.turns), 2, "disconnect does not skip a human turn");
    await a.context.close();
    const c = await client(), d = await client();
    for (const [player, name] of [[c, "Mina"], [d, "Jules"]]) {
      await player.page.locator('[data-mode="online"]').click(); await player.page.waitForFunction(() => testEvents.some(e => e.type === "welcome")); await player.page.locator("#playerName").fill(name);
    }
    await c.page.locator('[data-level="unmasked"]').click(); await c.page.locator('[data-category="truth"]').click(); await c.page.locator("#createBtn").click();
    await c.page.waitForFunction(() => window.testState?.code);
    const unmaskedCode = await c.page.evaluate(() => testState.code);
    await d.page.locator("#roomInput").fill(unmaskedCode); await d.page.locator("#joinForm button").click();
    for (const player of [c, d]) await player.page.waitForFunction(() => testState?.seats?.length === 2);
    await d.page.locator("#readyBtn").click(); await c.page.locator("#startBtn:not([disabled])").click();
    for (const player of [c, d]) await player.page.waitForFunction(() => testState?.game?.stage === "roll");
    assert.equal(await c.page.evaluate(() => testState.game.level), "unmasked");
    assert.match(await c.page.locator("#roomSettings").textContent(), /失守/);
    await onlineContest("truth", "skip", undefined, [c, d]);
    await c.context.close(); await d.context.close();
    const hub = await browser.newPage(); await hub.goto(origin + "/index.html"); assert.equal(await hub.locator(".club-game").count(), 6); assert.equal(await hub.locator(".truth-game").getAttribute("href"), "truth.html");
    for (const width of [320, 390, 900, 1440]) { await hub.setViewportSize({ width, height: 900 }); assert.equal(await hub.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `lobby overflow at ${width}`); }
    assert.deepEqual(errors, []); console.log("PASS: both new online tiers and correct prompt pools, online everyone rolls, highest custom asks, lowest responds, turn permissions, shared social/room controls, reconnect, responsive layout and lobby");
  } finally {
    await browser?.close(); const closed = child.exitCode === null ? once(child, "exit") : Promise.resolve(); child.kill(); await closed;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
