"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), { once } = require("node:events");
const { attachBridge } = require("./bridge-server");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml" };
  const server = http.createServer((req, res) => {
    const file = path.resolve(__dirname, "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname));
    if (!file.startsWith(__dirname + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader("Content-Type", mime[path.extname(file)] || "application/octet-stream"); fs.createReadStream(file).pipe(res);
  });
  const api = attachBridge(server); server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
  const dir = path.join(__dirname, "test-results"); fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  await context.addInitScript(() => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native { constructor(...args) { super(...args); this.addEventListener("message", (e) => { const d = JSON.parse(e.data); if (d.type === "state") window.testState = d; }); } };
  });
  const page = await context.newPage(), errors = [], failed = [];
  page.on("pageerror", (e) => errors.push(e.message)); page.on("requestfailed", (r) => failed.push(r.url()));
  const revision = () => page.evaluate(() => window.testState.game.revision);
  async function changed(before) { await page.waitForFunction((n) => window.testState?.game.revision > n, before); }
  async function bounds(selector) {
    assert(await page.locator(selector).evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1; }), `${selector} out of bounds`);
  }
  async function step() {
    const state = await page.evaluate(() => window.testState), n = state.game.revision;
    if (state.lesson.canContinue) await page.click('[data-lesson-command="continue"]');
    else {
      const action = state.lesson.recommendation;
      await page.click('[data-lesson-command="locate"]');
      if (action.type === "call") await page.click(`[data-call="${action.call}"]`);
      else {
        assert.equal(await page.locator(".playing-card.selected:not(:disabled)").getAttribute("data-card"), String(action.card));
        assert.match(await page.locator(".lesson-card-advice").innerText(), /Your choice/);
        await page.click("[data-play]");
      }
    }
    await changed(n);
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/bridge.html`);
    await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Connected"));
    for (const [width, height] of [[320, 780], [390, 844], [844, 390], [900, 900], [1440, 1050]]) {
      await page.setViewportSize({ width, height }); await page.click("#tutorialBtn");
      for (let i = 0; i < 5; i++) {
        await bounds("#lessonIntro");
        assert(await page.locator("#lessonIntroBody [lang=en]").count() > 0);
        assert(await page.locator("#lessonForward").isVisible());
        await page.locator("#lessonIntroBody").evaluate((el) => el.scrollTop = el.scrollHeight);
        await bounds("#lessonIntro .dialog-heading"); await bounds(".lesson-intro-footer");
        if (i === 1) {
          await page.click('[data-lesson-quiz="13"]'); assert.match(await page.locator("#lessonQuizFeedback").innerText(), /Compare/);
          await page.click('[data-lesson-quiz="2"]'); assert.match(await page.locator("#lessonQuizFeedback").innerText(), /Yes/);
        }
        if (i === 2) {
          await page.selectOption("#lessonLevel", "4"); await page.selectOption("#lessonStrain", "♥");
          assert.match(await page.locator("#lessonContractDemo").innerText(), /6 \+ 4 = 10/);
          await page.selectOption("#lessonLevel", "3"); await page.selectOption("#lessonStrain", "NT");
        }
        if ([0, 2].includes(i)) {
          await page.locator("#lessonIntroBody").evaluate((el) => el.scrollTop = 0);
          await page.screenshot({ path: path.join(dir, `bridge-lesson-intro-${i}-${width}.png`) });
        }
        if (i < 4) await page.click("#lessonForward");
      }
      await page.keyboard.press("Escape"); assert.equal(await page.locator("#lessonIntro").isVisible(), false);
    }
    await page.fill("#playerName", "Beginner"); await page.click("#tutorialBtn");
    for (let i = 0; i < 5; i++) await page.click("#lessonForward");
    await page.waitForFunction(() => window.testState?.lesson);
    assert.equal(await page.locator("#roomTools").isVisible(), false);
    assert.equal(await page.locator("#copyBtn").isVisible(), false);
    const initial = await revision(); await page.click('[data-call="1C"]');
    await page.waitForFunction(() => document.querySelector("#error").textContent.includes("1NT")); assert.equal(await revision(), initial);
    while (await page.evaluate(() => window.testState.game.phase === "auction")) await step();
    assert.equal(await page.locator("#dummyPanel").isVisible(), false);
    await step(); assert.equal(await page.locator("#dummyPanel").isVisible(), true);
    assert.match(await page.locator("#lessonCoach").innerText(), /six total/);
    const paused = await revision(); await page.waitForTimeout(1700); assert.equal(await revision(), paused);
    for (const [width, height] of [[320, 780], [390, 844], [900, 900], [1440, 1050]]) {
      await page.setViewportSize({ width, height });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
      await page.locator("#lessonAdvanced").evaluate((el) => el.open = true);
      assert.equal(await page.locator(".lesson-counts tbody tr").count(), 4);
      await page.screenshot({ path: path.join(dir, `bridge-lesson-play-${width}.png`), fullPage: true });
    }
    await page.reload(); await page.waitForFunction((n) => window.testState?.game.revision === n && window.testState.lesson, paused);
    const room = [...api.rooms.values()][0]; assert.equal(room.timer, null);
    await page.click('[data-lesson-command="restart"]'); await page.click('[data-close="lessonRestartDialog"]'); assert.equal(await revision(), paused);
    await page.setViewportSize({ width: 390, height: 844 });
    let steps = 0;
    while (await page.evaluate(() => window.testState.game.phase !== "over")) { assert(++steps < 80); await step(); }
    assert.equal(await page.evaluate(() => window.testState.game.tricks.length), 13);
    assert.match(await page.locator("#lessonCoach").innerText(), /400/);
    await page.click("#reviewBtn"); assert.equal(await page.locator(".review-hands .playing-card").count(), 52);
    await page.screenshot({ path: path.join(dir, "bridge-lesson-complete-mobile.png"), fullPage: true });
    const end = await revision(); await page.locator('[data-lesson-command="restart"]').first().click(); await page.click('[data-lesson-command="confirmRestart"]'); await changed(end);
    assert.equal(await page.evaluate(() => window.testState.game.phase), "auction"); assert.equal(await page.locator("#resultPanel").isVisible(), false);
    await page.click("#leaveBtn"); assert.match(await page.locator("#confirmDialog").innerText(), /practice attempt/); await page.click("#confirmLeave");
    await page.waitForFunction(() => !document.body.classList.contains("bridge-teaching"));
    await page.click("#createBtn"); await page.waitForFunction(() => window.testState?.lesson === null);
    assert.equal(await page.locator("#roomTools").isVisible(), true);
    assert.equal(await page.locator("#lessonCoach").isVisible(), false);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    console.log("Bridge lesson UI passed: five bilingual illustrated steps, quiz, contract explorer, 13 tricks via real UI on mobile, privacy, manual pacing, reconnect, review, restart, and normal rooms.");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
