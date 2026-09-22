"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { spawn } = require("node:child_process"), { once } = require("node:events");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
const origin = process.env.TEST_ORIGIN || "http://127.0.0.1:18764";
(async () => {
  let browser, testServer;
  const errors = []; fs.mkdirSync("test-results", { recursive: true });
  try {
    if (!process.env.TEST_ORIGIN) {
      testServer = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: "18764", AUTO_OPEN: "0" }, stdio: ["ignore", "pipe", "pipe"] });
      await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(Error("Test server timeout")), 8000); testServer.stdout.once("data", () => { clearTimeout(timer); resolve(); }); testServer.once("error", reject); testServer.stderr.once("data", (e) => { clearTimeout(timer); reject(Error(String(e))); }); });
    }
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    for (const kind of ["catan", "poker", "gomoku", "xiangqi", "richman"]) {
      const contexts = [], pages = [];
      for (let i = 0; i < 2; i++) {
        const context = await browser.newContext({ viewport: { width: i ? 1440 : 390, height: i ? 1000 : 844 }, hasTouch: !i }); contexts.push(context);
        await context.addInitScript(() => {
          localStorage.setItem("catan-music-enabled", "false");
          window.testSounds = [];
          let audioApi;
          Object.defineProperty(window, "BoardGameAudio", { configurable: true, get: () => audioApi, set(value) {
            audioApi = value; const create = value.create;
            value.create = (...args) => {
              const audio = create(...args), play = audio.play;
              audio.play = kind => { const audible = play(kind); window.testSounds.push({ kind, audible, volume: audio.volume }); return audible; };
              return audio;
            };
          } });
          const Native = window.WebSocket;
          window.WebSocket = class extends Native { constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.type === "state") window.testState = m.room || m; (window.testEvents ||= []).push(m); }); } };
        });
        const page = await context.newPage(); page.on("pageerror", (e) => errors.push(`${kind}: ${e.message}`)); pages.push(page);
        await page.goto(`${origin}/${kind === "catan" ? "catan.html" : kind === "poker" ? "index.html?game=poker" : kind === "richman" ? "richman.html" : `duel.html?game=${kind}`}`);
        await page.waitForFunction(() => window.testSocket?.readyState === WebSocket.OPEN);
      }
      const [a, b] = pages;
      const send = (page, data) => page.evaluate((m) => testSocket.send(JSON.stringify(m)), data);
      if (kind === "catan") {
        await a.locator(".piece-skin-settings summary").click();
        for (const [id, art] of [["smile", "robber-hood"], ["angry", "robber-bandana"]]) {
          assert.equal(await a.locator(`[data-skin-kind="robber"][data-skin="${id}"] use`).getAttribute("href"), `#catan-art-${art}`);
        }
        await a.locator('[data-skin-kind="robber"][data-skin="angry"]').click();
        assert.equal(await a.locator('[data-skin="angry"]').getAttribute("aria-pressed"), "true");
        await a.locator("#name").fill("Alice"); await a.locator('[data-seats="3"]').click(); await a.locator("#create").click();
      } else await send(a, { type: "create", kind, name: "Alice", maxPlayers: 3, players: 3, funds: 50000, days: 30, difficulty: "easy", side: 0 });
      await a.waitForFunction(() => window.testState?.code);
      const code = await a.evaluate(() => testState.code);
      await send(b, { type: "join", code, name: "Bob" }); await b.waitForFunction(() => window.testState?.code);
      await a.waitForFunction(() => (testState.seats || testState.players).filter(Boolean).length >= 2);
      if (kind === "poker") { await send(a, { type: "start" }); await a.waitForFunction(() => testState.status !== "lobby"); }
      else if (kind !== "catan") {
        await send(b, { type: "ready", ready: true });
        if (kind === "richman") await send(a, { type: "bots", fill: true });
        await a.waitForFunction(() => testState.seats.every((p) => p?.ready));
        await send(a, { type: "start" }); await a.waitForFunction(() => testState.game);
      }
      for (const p of pages) {
        await p.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
        await p.mouse.click(4, 4);
      }
      const target = await b.evaluate(() => (testState.seats || testState.players).find((p) => p?.name === "Bob").socialId);
      async function visibleAvatar(p, id) {
        const list = p.locator(`[data-social-id="${id}"]`);
        for (let i = 0; i < await list.count(); i++) if (await list.nth(i).isVisible()) return list.nth(i);
        throw Error(`${kind}: no visible avatar ${id}`);
      }
      const avatar = await visibleAvatar(a, target); await avatar.scrollIntoViewIfNeeded(); await avatar.click();
      await a.locator(".reaction-menu").waitFor();
      const bounds = await a.locator(".reaction-menu").boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
      assert.equal(await a.locator(".reaction-options button").count(), 6);
      assert.equal(await a.locator('[data-reaction-sound] svg').count(), 1, "Reaction mute control uses a real icon");
      await a.screenshot({ path: `test-results/social-menu-${kind}-390.png` });
      await a.locator('[data-reaction="flowers"]').click();
      await b.locator('[data-reaction-kind="flowers"]').waitFor(); await a.locator('[data-reaction-kind="flowers"]').waitFor();
      for (const p of pages) {
        const sounds = await p.evaluate(() => testSounds.filter(s => s.kind === "reaction-flowers"));
        assert.equal(sounds.length, 1, `${kind}: a confirmed reaction sounds once per client`);
        assert.equal(sounds[0].audible, true, `${kind}: unlocked sender and receiver hear the reaction`);
        await p.evaluate(() => {
          const event = testEvents.find(e => e.type === "reaction");
          testSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(event) }));
          testSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ ...event, id: "wrong-room", room: "OTHER" }) }));
        });
        assert.equal(await p.evaluate(() => testSounds.filter(s => s.kind === "reaction-flowers").length), 1, "Duplicate and foreign-room reactions stay silent");
      }
      assert.ok((await b.locator(".avatar-reaction").getAttribute("aria-label")).includes("Alice → Bob"));
      await a.screenshot({ path: `test-results/social-${kind}-390.png` });
      await b.locator(".avatar-reaction").waitFor({ state: "detached" });
      if (kind === "catan") {
        await a.locator("#audioSettings").click();
        await a.locator("#sfxVolume").evaluate(el => { el.value = "25"; el.dispatchEvent(new Event("input", { bubbles: true })); });
        await a.locator('#audioSettingsDialog > [data-close]').click();
      }
      await (await visibleAvatar(a, target)).click();
      await a.locator("[data-reaction-sound]").click();
      assert.equal(await a.locator("[data-reaction-sound]").getAttribute("aria-pressed"), "false");
      if (kind === "catan") assert.equal(await a.locator("#soundToggle").getAttribute("aria-pressed"), "false", "CATAN and reaction mute controls share one setting");
      await a.locator('[data-reaction="heart"]').click();
      await b.locator('[data-reaction-kind="heart"]').waitFor(); await a.locator('[data-reaction-kind="heart"]').waitFor();
      assert.equal(await a.evaluate(() => testSounds.find(s => s.kind === "reaction-heart").audible), false, "Muted reactions remain visible but silent");
      assert.equal(await b.evaluate(() => testSounds.find(s => s.kind === "reaction-heart").audible), true, "Mute is a personal setting, not a room setting");
      await (await visibleAvatar(a, target)).click(); await a.locator("[data-reaction-sound]").click();
      await a.locator("[data-reaction-close]").click();
      await b.locator(".avatar-reaction").waitFor({ state: "detached" });
      if (kind === "catan") {
        await (await visibleAvatar(a, target)).click(); await a.locator('[data-reaction="cheers"]').click();
        await a.locator('[data-reaction-kind="cheers"]').waitFor();
        assert.deepEqual(await a.evaluate(() => testSounds.find(s => s.kind === "reaction-cheers")), { kind: "reaction-cheers", audible: true, volume: .25 }, "Reaction audio follows CATAN's effects volume");
      }
      const own = await a.evaluate(() => (testState.seats || testState.players).find((p) => p?.name === "Alice").socialId);
      const ownAvatar = await visibleAvatar(a, own); await ownAvatar.click(); await a.locator("#avatarDialog[open]").waitFor();
      await a.locator("#avatarDialog [data-avatar-close]").first().click();
      if (kind === "catan") {
        assert.equal(await a.evaluate(() => testState.skins.robber), "angry");
        await send(a, { type: "fillBots" }); await a.waitForFunction(() => testState.seats.length === 3);
        await send(a, { type: "start" }); await a.waitForFunction(() => testState.game);
        await a.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
        assert.equal(await a.locator("#board .robber-piece use").getAttribute("href"), "#catan-art-robber-bandana");
        assert.equal(await a.locator("#board .robber-piece .piece-emoji").count(), 0);
        for (const width of [320, 390, 1440]) {
          await a.setViewportSize({ width, height: 1000 });
          await send(b, { type: "chat", text: "Hi" });
          const bubble = a.locator('[data-chat-bubble="1"]'); await bubble.waitFor({ state: "visible" }); await bubble.scrollIntoViewIfNeeded();
          await a.waitForFunction(() => document.querySelector('[data-chat-bubble="1"]').textContent === "Hi");
          const short = await bubble.boundingBox(); assert.ok(short.width < 70, `Short message must shrink: ${short.width}`);
          await send(b, { type: "chat", text: "This is a longer message! ".repeat(6) });
          await a.waitForFunction(() => document.querySelector('[data-chat-bubble="1"]').textContent.startsWith("This"));
          const long = await bubble.boundingBox(); assert.ok(long.width > short.width && long.width <= 201); assert.ok(long.height <= 47);
          assert.equal(await a.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
          await a.locator(".player-overview").screenshot({ path: `test-results/social-bubble-${width}.png` });
        }
        await a.setViewportSize({ width: 390, height: 844 });
        await (await visibleAvatar(a, target)).click(); await a.locator('[data-reaction="splash"]').click();
        await b.locator('[data-reaction-kind="splash"]').waitFor();
        assert.equal(await a.evaluate(() => testState.game.phase), "setupSettlement", "Social action does not consume the game turn");
      }
      console.log(`${kind}: shared menu, mobile bounds, room delivery, reaction audio, mute, deduplication, animation expiry, own avatar editor passed`);
      for (const context of contexts) await context.close();
    }
    const extra = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
    const p = await extra.newPage(); p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(`${origin}/catan.html?edition=seafarers`);
    assert.equal(await p.locator("dialog[open]").count(), 0, "Rules are opened manually");
    await p.locator(".piece-skin-settings summary").click();
    await p.locator('[data-skin-kind="pirate"][data-skin="flag"]').click();
    await p.locator('[data-skin-kind="robber"][data-skin="smile"]').click();
    await p.waitForFunction(() => document.querySelector("#previewBoard .pirate-piece .piece-emoji")?.textContent === "\uD83C\uDFF4\u200D\u2620\uFE0F");
    await p.locator("#name").fill("Skins"); await p.locator("#create").click();
    await p.locator("#lobby").waitFor({ state: "visible" });
    await p.locator("#sailingAcknowledge").click();
    const guestContext = await browser.newContext({viewport:{width:390,height:844}});
    const guest = await guestContext.newPage(); guest.on("pageerror", e => errors.push(e.message));
    await guest.goto(`${origin}/catan.html`);
    await guest.locator("#name").fill("Guest"); await guest.locator("#code").fill(await p.locator("#copyCode").textContent());
    await guest.locator("#join").click(); await guest.locator("#lobby").waitFor({state:"visible"});
    assert.equal(await guest.locator("#sailingDialog").isVisible(), true, "Joining a friend's Seafarers room introduces its map");
    await guest.locator("#sailingAcknowledge").click();
    assert.equal(await guest.locator("dialog[open]").count(), 0);
    await p.locator("#fillBots").click(); await p.locator("#start").click(); await p.locator("#board .pirate-piece .piece-emoji").waitFor();
    assert.equal(await p.locator("#board .robber-piece use").getAttribute("href"), "#catan-art-robber-hood");
    assert.equal(await p.locator("#board .robber-piece .piece-emoji").count(), 0);
    await p.locator(".board-section").screenshot({ path: "test-results/social-skins-board.png" });
    const bot = p.locator("#players [data-social-target]").first(); await bot.scrollIntoViewIfNeeded(); await bot.focus(); await p.keyboard.press("Enter");
    await p.locator(".reaction-menu").waitFor(); await p.keyboard.press("Escape"); assert.equal(await p.locator(".reaction-menu").count(), 0);
    await bot.click(); await p.locator('[data-reaction="luck"]').click(); await p.locator(".avatar-reaction").waitFor(); await p.locator(".avatar-reaction").waitFor({ state: "detached" });
    await guestContext.close();
    await p.goto(`${origin}/index.html`); await p.evaluate(() => setView("game")); await p.locator("#startGameBtn").click();
    await p.locator("#pokerRoom [data-social-target]").first().click(); await p.locator('[data-reaction="heart"]').click(); await p.locator(".avatar-reaction").waitFor();
    await extra.close();
    assert.deepEqual(errors, []); console.log("All social UI checks passed, including skins, bots, keyboard, reduced motion and local poker");
  } finally { await browser?.close(); if (testServer?.exitCode === null) { testServer.kill(); await once(testServer, "exit"); } }
})().catch((e) => { console.error(e); process.exitCode = 1; });
