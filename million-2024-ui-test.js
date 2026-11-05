"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { once } = require("node:events"), { spawn } = require("node:child_process");
let PW; try { PW = require("playwright"); } catch { PW = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise(r => probe.close(r));
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true,
    env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0", MILLION_BOT_DELAY: "60" }, stdio: ["ignore", "pipe", "pipe"] });
  const base = `http://127.0.0.1:${port}`, out = path.join(__dirname, "test-results"), errors = [];
  let browser, logs = ""; child.stdout.on("data", d => logs += d); child.stderr.on("data", d => logs += d);
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) { try { ready = (await fetch(base + "/million.html")).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    assert(ready, logs); fs.mkdirSync(out, { recursive: true });
    browser = await PW.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    async function player(name, width = 1440) {
      const c = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
      await c.addInitScript(() => {
        window.events = []; const Native = WebSocket;
        window.WebSocket = class extends Native { constructor(...args) { super(...args); window.sock = this;
          this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") window.state = m; else { window.events.push(m); if (m.type === "left") window.state = null; if (m.type === "archiveLobby") window.archiveLobby = m; } }); } };
      });
      const p = await c.newPage(); p.on("pageerror", e => errors.push(e.message));
      await p.goto(base + "/million.html"); await p.waitForFunction(() => !document.getElementById("createBtn").disabled);
      await p.fill("#playerName", name); return p;
    }
    const page = await player("Alice"), pages = [page];
    await page.check('#edition input[value="2024"]');
    assert.equal(await page.locator("#createSettings").isVisible(), false);
    assert.equal(await page.locator('#capacity option[value="9"]').count(), 1);
    assert.equal(await page.locator("#roleGallery .role-card").count(), 6);
    assert.match(await page.locator("#goalLabel").innerText(), /50M/);
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [740, 390]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `entry overflow ${width}`);
      await page.screenshot({ path: path.join(out, `million-2024-entry-${width}.png`), fullPage: true });
      await page.locator('#roleGallery [data-rules-section="role-acrobat"]').click();
      await page.locator("#gameRulesDialog").waitFor({ state: "visible" });
      assert.match(await page.locator('[data-rule-section="role-acrobat"]').innerText(), /500.*5M/s);
      assert(await page.locator("#gameRulesDialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: path.join(out, `million-2024-rules-${width}.png`) });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.selectOption("#capacity", "6"); await page.click("#createBtn");
    await page.waitForFunction(() => window.state?.edition === "2024");
    const code = await page.evaluate(() => state.code);
    for (const name of ["Bob", "Cindy", "David", "Emma", "Frank"]) {
      const p = await player(name); await p.fill("#roomInput", code); await p.click("#joinForm button");
      await p.waitForFunction(() => window.state?.code); pages.push(p);
    }
    await page.waitForFunction(() => state.seats.length === 6);
    assert.equal(await pages[1].locator('#roomEdition input').count(), 0);
    await page.click("#startBtn"); await page.waitForFunction(() => state.game?.phase === "planning");
    const roles = ["tech", "acrobat", "brute", "mentalist", "driver", "brute"];
    for (let i = 0; i < pages.length; i++) {
      await pages[i].click(`[data-pick="${roles[i]}"]`); await pages[i].click("#lockRoles");
      await pages[i].waitForFunction(() => state.game.players[state.you].locked);
    }
    await page.waitForFunction(() => state.game.phase === "claims");
    for (let n = 0; n < 6; n++) {
      const actor = await page.evaluate(() => state.game.claimActor), p = pages[actor];
      await p.locator('[data-k="claim0"]').waitFor({ state: "visible" });
      await p.selectOption('[data-k="claim0"]', actor === 0 ? "driver" : roles[actor]); await p.click("#submitClaims");
      await page.waitForFunction(n => state.game.claims.filter(Boolean).length > n, n);
    }
    await page.waitForFunction(() => state.game.phase === "negotiation");
    assert.equal(await page.locator("#readyHeist").count(), 0);
    assert.equal(await pages[1].evaluate(() => state.game.players[0].slots[0].role), null);
    assert.deepEqual(await pages[1].evaluate(() => state.game.claims[0]), ["driver"]);
    assert.match(await page.locator("#messages").innerText(), /声称/);
    await page.screenshot({ path: path.join(out, "million-2024-negotiation-1440.png"), fullPage: true });
    const leader = await page.evaluate(() => state.game.leader);
    await pages[leader].click("#callVote");
    for (const i of [0, 1, 2, 3, 4, 5].filter(i => i !== leader).slice(0, 2)) {
      await pages[i].locator('[data-vote="yes"]').waitFor({ state: "visible" }); await pages[i].click('[data-vote="yes"]');
    }
    await page.waitForFunction(() => state.game.phase === "snitch");
    await page.click('[data-name-role="acrobat"]'); await page.click("#confirmAction");
    await pages[3].locator('[data-steal="0:0"]').waitFor({ state: "visible" });
    await pages[3].screenshot({ path: path.join(out, "million-2024-mentalist-1440.png"), fullPage: true });
    await pages[3].click('[data-steal="0:0"]'); await page.waitForFunction(() => state.game.phase === "results");
    assert.match(await page.locator("#actionPanel").innerText(), /Reserve top-up/);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `result overflow ${width}`);
      await page.screenshot({ path: path.join(out, `million-2024-results-${width}.png`), fullPage: true });
    }
    const before = await page.evaluate(() => ({ edition: state.edition, revision: state.game.revision, you: state.you }));
    await page.reload(); await page.waitForFunction(() => window.state?.game?.phase === "results");
    assert.deepEqual(await page.evaluate(() => ({ edition: state.edition, revision: state.game.revision, you: state.you })), before);
    await page.locator('[data-room-manage]').click(); await page.locator('[data-room-action="archiveSave"]').click();
    const downloaded = page.waitForEvent("download"); await page.locator('[data-archive="prepare"]').click();
    const savePath = path.join(out, "archive-million-2024.json"); await (await downloaded).saveAs(savePath);
    const saved = JSON.parse(fs.readFileSync(savePath, "utf8")); assert.equal(saved.progress.edition, "2024");
    await page.locator('[data-archive="commit"]').click(); await page.waitForFunction(() => !window.state);
    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(savePath);
    await page.locator('[data-archive-seat="0"]').waitFor();
    assert.equal(await page.locator('[data-archive-seat]').count(), 6);
    assert.equal(await page.locator('.archive-dialog .role-card').count(), 0);
    assert(await page.locator('.archive-dialog').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    await page.screenshot({ path: path.join(out, "million-2024-archive-320.png") });
    await page.locator('[data-archive-seat="0"]').click();
    await page.waitForFunction(() => state?.control.archive.restoring);
    assert.equal(await page.evaluate(() => state.edition), "2024");
    assert.deepEqual(await page.evaluate(() => state.game.players.map(p => p.cash)), saved.progress.players.map(p => p.cash));
    assert.equal(await page.evaluate(() => state.control.paused), true);
    await page.locator('[data-room-manage]').click();
    while (await page.locator('[data-room-action="fillBot"]').count()) {
      const n = await page.locator('[data-room-action="fillBot"]').count(); await page.locator('[data-room-action="fillBot"]').first().click();
      await page.waitForFunction(n => document.querySelectorAll('[data-room-action="fillBot"]').length < n, n);
    }
    await page.locator('[data-room-action="archiveContinue"]').click(); await page.waitForFunction(() => !state.control.paused);
    const solo = await player("Solo", 390);
    await solo.check('#edition input[value="2024"]'); await solo.selectOption("#capacity", "9"); await solo.click("#createBtn");
    await solo.locator("#fillBotsBtn").waitFor({ state: "visible" }); await solo.click("#fillBotsBtn");
    await solo.waitForFunction(() => state.seats.length === 9); await solo.click("#startBtn");
    await solo.locator('[data-pick="brain"]').waitFor({ state: "visible" }); await solo.click('[data-pick="brain"]'); await solo.click("#lockRoles");
    await solo.locator('[data-k="claim0"]').waitFor({ state: "visible" }); await solo.selectOption('[data-k="claim0"]', "driver"); await solo.click("#submitClaims");
    await solo.waitForFunction(() => state.chat.some(m => state.seats[m.playerId]?.bot && /claim|I am/.test(m.text)));
    assert(await solo.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await solo.screenshot({ path: path.join(out, "million-2024-nine-bots-390.png"), fullPage: true });
    assert.deepEqual(errors, []); console.log("2024 browser checks passed: edition selectors, six roles, bilingual rules, declarations/bluffs/privacy, majority vote, Tech, Mentalist, payouts, reconnect, save/import/seat/resume, nine-player bots and desktop/mobile layouts.");
  } finally { await browser?.close(); const exited = once(child, "exit"); child.kill(); await exited; }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
