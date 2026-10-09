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
  async function handsBeforeCoach() {
    assert(await page.evaluate(() => {
      const coach = document.querySelector("#lessonCoach"), hands = [...document.querySelectorAll("#handPanel:not([hidden]), #dummyPanel:not([hidden])")];
      return hands.length > 0 && hands.every((hand) => hand.getBoundingClientRect().bottom <= coach.getBoundingClientRect().top && (hand.compareDocumentPosition(coach) & Node.DOCUMENT_POSITION_FOLLOWING));
    }), "Visible hands precede lesson text visually and in keyboard/reading order");
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
    await handsBeforeCoach();
    if (await page.evaluate(() => window.testState.game.phase !== "over")) {
      assert(await page.evaluate(() => {
        const hand = document.querySelector("#dummyPanel:not([hidden]), #handPanel:not([hidden])"), bounds = hand.getBoundingClientRect();
        const card = hand.querySelector(".playing-card")?.getBoundingClientRect();
        return bounds.top >= -1 && (!card || card.bottom <= innerHeight) && hand.contains(document.activeElement);
      }), "Advancing starts at the hands rather than scrolling them above the viewport");
    }
  }
  try {
    await page.goto(`http://127.0.0.1:${server.address().port}/bridge.html`);
    await page.waitForFunction(() => document.querySelector("#connection").textContent.includes("Connected"));
    for (const [width, height] of [[320, 780], [390, 844], [844, 390], [900, 900], [1440, 1050]]) {
      await page.setViewportSize({ width, height }); await page.click("#tutorialBtn");
      for (let i = 0; i < 9; i++) {
        await bounds("#lessonIntro");
        await bounds("#lessonIntroBody");
        assert.equal(await page.locator(".lesson-page-label").innerText(), `${i + 1} / 9`);
        assert(await page.locator("#lessonIntroBody [lang=en]").count() > 0);
        assert(await page.locator("#lessonForward").isVisible());
        await page.locator("#lessonIntroBody").evaluate((el) => el.scrollTop = el.scrollHeight);
        await bounds("#lessonIntro .dialog-heading"); await bounds(".lesson-intro-footer");
        if (i === 1) {
          assert.equal(await page.locator(".lesson-trick-compass .playing-card").count(), 4);
          await page.click('[data-lesson-quiz="13"]'); assert.match(await page.locator("#lessonQuizFeedback").innerText(), /South wins/);
          await page.click('[data-lesson-quiz="0"]'); assert.match(await page.locator("#lessonQuizFeedback").innerText(), /Yes, South's ♠A wins/);
          await page.click("#lessonBack"); await page.click("#lessonForward");
          assert.equal(await page.locator('[data-lesson-quiz="0"]').getAttribute("aria-pressed"), "true");
        }
        if (i === 2) {
          assert.match(await page.locator("#lessonIntroBody").innerText(), /♥2 > ♠A/);
          assert.match(await page.locator("#lessonIntroBody").innerText(), /no higher trump/);
        }
        if (i === 3) {
          assert.equal(await page.locator(".lesson-reference tbody tr").count(), 7);
          await page.selectOption("#lessonLevel", "4"); await page.selectOption("#lessonStrain", "♥");
          assert.match(await page.locator("#lessonContractDemo").innerText(), /6 \+ 4 = 10/);
          await page.selectOption("#lessonLevel", "7"); await page.selectOption("#lessonStrain", "NT");
          assert.match(await page.locator("#lessonContractDemo").innerText(), /6 \+ 7 = 13/);
          assert.equal(await page.locator(".lesson-trick-meter .promised").count(), 7);
          await page.selectOption("#lessonLevel", "3"); await page.selectOption("#lessonStrain", "NT");
        }
        if ([5, 6].includes(i)) {
          assert.equal(await page.locator(".lesson-hand-example .playing-card").count(), 13);
          assert.deepEqual(await page.locator(".lesson-suit-row").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll(".rank")].map((el) => el.textContent).join(" "))), ["A K 7 3", "Q J 8 4", "A 9 5", "K 6"]);
          const points = await page.locator(".lesson-hand-example .rank").evaluateAll((ranks) => ranks.reduce((sum, el) => sum + ({ A: 4, K: 3, Q: 2, J: 1 }[el.textContent] || 0), 0));
          assert.equal(points, 17);
        }
        if (i === 6) {
          assert(await page.locator("#lessonCheckBid").isDisabled());
          for (const [call, explanation] of [["1S", /four spades/], ["1H", /four hearts/], ["2NT", /20–21/], ["1NT", /Correct: 1NT/]]) {
            await page.locator(`input[name="lesson-opening"][value="${call}"]`).check();
            assert.equal(await page.locator("#lessonBidFeedback").innerText(), "");
            await page.click("#lessonCheckBid");
            assert.match(await page.locator("#lessonBidFeedback").innerText(), explanation);
            await bounds("#lessonIntro .dialog-heading"); await bounds(".lesson-intro-footer");
          }
          await page.click("#lessonBack"); await page.click("#lessonForward");
          assert(await page.locator('input[value="1NT"]').isChecked());
          assert.match(await page.locator("#lessonBidFeedback").innerText(), /Correct: 1NT/);
        }
        if (i === 7) {
          assert.equal(await page.locator(".lesson-fit-cards .playing-card").count(), 8);
          assert.deepEqual(await page.locator(".lesson-fit-cards").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll(".rank")].map((el) => el.textContent).join(" "))), ["A K 9 7 4", "Q 8 3"]);
          assert.deepEqual(await page.locator(".lesson-fit-auction tbody tr").evaluateAll((rows) => rows.map((row) => [...row.cells].map((cell) => cell.textContent))), [["1♥", "Pass", "2♥", "Pass"], ["4♥", "Pass", "Pass", "Pass"]]);
          const content = await page.locator("#lessonIntroBody").innerText();
          for (const term of ["Strength", "Distribution", "Fit", "Support points", "Forcing Pass", "Disclosure", "must bid on or double"]) assert(content.includes(term), term);
          assert.equal(await page.locator("#lessonResponseExercise .playing-card").count(), 13);
          assert.deepEqual(await page.locator("#lessonResponseExercise .lesson-suit-row").evaluateAll((rows) => rows.map((row) => [...row.querySelectorAll(".rank")].map((el) => el.textContent).join(" "))), ["K 8 5", "Q 9 6", "J 7 4 2", "9 5 3"]);
          assert.equal(await page.locator("#lessonResponseExercise .rank").evaluateAll((ranks) => ranks.reduce((sum, el) => sum + ({ A: 4, K: 3, Q: 2, J: 1 }[el.textContent] || 0), 0)), 6);
          assert(await page.locator("#lessonCheckResponse").isDisabled());
          assert.equal(await page.locator('input[name="lesson-response"]:checked').count(), 0);
          for (const [call, explanation] of [["P", /enough to support/], ["2S", /only three spades/], ["4H", /does not yet justify game/], ["2H", /Correct: 2♥/]]) {
            const option = page.locator(`input[name="lesson-response"][value="${call}"]`);
            await option.focus(); await page.keyboard.press("Space");
            assert(await option.isChecked());
            assert.equal(await page.locator("#lessonResponseFeedback").innerText(), "");
            await page.click("#lessonCheckResponse");
            assert.match(await page.locator("#lessonResponseFeedback").innerText(), explanation);
            await bounds("#lessonIntro .dialog-heading"); await bounds(".lesson-intro-footer");
          }
          await page.click("#lessonBack");
          assert(await page.locator('input[name="lesson-opening"][value="1NT"]').isChecked());
          assert.match(await page.locator("#lessonBidFeedback").innerText(), /Correct: 1NT/);
          await page.click("#lessonForward");
          assert(await page.locator('input[name="lesson-response"][value="2H"]').isChecked());
          assert.match(await page.locator("#lessonResponseFeedback").innerText(), /Correct: 2♥/);
          for (const [selector, label] of [[".lesson-fit-example", "fit"], [".lesson-fit-auction", "auction"], ["#lessonResponseExercise", "response"]]) {
            await page.locator(selector).evaluate((el) => document.querySelector("#lessonIntroBody").scrollTop = el.offsetTop - 10);
            await page.screenshot({ path: path.join(dir, `bridge-lesson-information-${label}-${width}.png`) });
          }
        }
        if (i === 8) {
          assert.equal(await page.locator(".lesson-reference tbody tr").count(), 31);
          assert.match(await page.locator("#lessonIntroBody").innerText(), /different deal: you sit North/);
          assert.match(await page.locator("#lessonIntroBody").innerText(), /16-HCP, 3-3-3-4/);
        }
        if ([0, 1, 3, 5, 6].includes(i)) {
          await page.locator("#lessonIntroBody").evaluate((el) => el.scrollTop = 0);
          await page.screenshot({ path: path.join(dir, `bridge-lesson-intro-${i}-${width}.png`) });
        }
        const clipped = await page.locator("#lessonIntroBody").evaluate((el) => {
          const bounds = el.getBoundingClientRect();
          return [...el.querySelectorAll("*")].filter((child) => { const r = child.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.left < bounds.left - 1 || r.right > bounds.right + 1); }).map((child) => child.outerHTML.slice(0, 180));
        });
        assert.deepEqual(clipped, [], `Lesson ${i + 1} clips content at ${width}`);
        if (i < 8) await page.click("#lessonForward");
      }
      await page.keyboard.press("Escape"); assert.equal(await page.locator("#lessonIntro").isVisible(), false);
    }
    await page.fill("#playerName", "Beginner"); await page.click("#tutorialBtn");
    for (let i = 0; i < 9; i++) await page.click("#lessonForward");
    await page.waitForFunction(() => window.testState?.lesson);
    assert.equal(await page.locator("#roomTools").isVisible(), false);
    assert.equal(await page.locator("#copyBtn").isVisible(), false);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 }); await handsBeforeCoach();
      await page.locator("#handPanel").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: path.join(dir, `bridge-lesson-hand-first-${width}.png`) });
    }
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
      await handsBeforeCoach();
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
    console.log("Bridge lesson UI passed: eight bilingual lessons and glossary, 17-HCP opening and 6-HCP response quizzes, bidding information and eight-card fit, trick quiz, contract explorer, responsive diagrams, hands before explanations, 13 tricks via real UI on mobile, privacy, manual pacing, reconnect, review, restart, and normal rooms.");
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
