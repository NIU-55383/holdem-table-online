"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { once } = require("node:events"), { spawn } = require("node:child_process");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = probe.address().port; await new Promise((resolve) => probe.close(resolve));
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let browser, logs = ""; child.stdout.on("data", (c) => logs += c); child.stderr.on("data", (c) => logs += c);
  const base = `http://127.0.0.1:${port}`, errors = [], out = path.join(__dirname, "test-results");
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) { try { ready = (await fetch(base + "/index.html")).ok; } catch {} if (ready) break; await new Promise((r) => setTimeout(r, 100)); }
    assert(ready, logs);
    browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" });
    fs.mkdirSync(out, { recursive: true });
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.rulesSent = []; const Native = WebSocket;
      window.WebSocket = class extends Native { send(data) { window.rulesSent.push(data); return super.send(data); } };
    });
    const page = await ctx.newPage(); page.on("pageerror", (e) => errors.push(e.message));
    const cases = [
      { game: "poker", url: "/index.html", button: '[data-rules-game="poker"]', dialog: "#gameRulesDialog", title: "Texas Hold'em Rules" },
      { game: "gomoku", url: "/duel.html?game=gomoku", button: "#rulesBtn", dialog: "#gameRulesDialog", title: "Gomoku Rules" },
      { game: "xiangqi", url: "/duel.html?game=xiangqi", button: "#rulesBtn", dialog: "#gameRulesDialog", title: "Xiangqi Rules" },
      { game: "bridge", url: "/bridge.html", button: "#rulesBtn", dialog: "#rulesDialog", title: "Bridge Rules" },
      { game: "catan", url: "/catan.html", button: "#helpButton", dialog: "#helpDialog", title: "Base Game Rules" },
      { game: "seafarers", url: "/catan.html?edition=seafarers", button: "#seafarerRules", dialog: "#sailingDialog", title: "Seafarers" },
      { game: "map", url: "/catan.html?edition=seafarers", button: "#mapRules", dialog: "#sailingDialog", title: "" }
    ];
    for (const spec of cases) {
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base + spec.url);
      if (spec.game === "poker") await page.click('[data-view-target="online"]');
      await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach((d) => d.close()));
      for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [740, 320]]) {
        await page.setViewportSize({ width, height });
        const before = await page.evaluate(() => window.rulesSent.length);
        await page.locator(spec.button).click(); const dialog = page.locator(spec.dialog); await dialog.waitFor({ state: "visible" });
        assert((await dialog.locator("h2").innerText()).includes(spec.title));
        const stats = await dialog.evaluate((d) => {
          const b = d.getBoundingClientRect(), body = d.querySelector(".bg-rules-body"), s = getComputedStyle(d);
          return { bounds: b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1,
            overflow: body.scrollWidth > body.clientWidth + 1 || d.scrollWidth > d.clientWidth + 1, font: getComputedStyle(body).fontSize, background: s.backgroundColor,
            heading: getComputedStyle(d.querySelector("h2")).fontSize, radius: s.borderRadius, bodyHeight: body.clientHeight };
        });
        assert(stats.bounds && !stats.overflow && stats.bodyHeight > 80, `${spec.game} ${width}: ${JSON.stringify(stats)}`);
        assert.equal(stats.font, "14px"); assert.equal(stats.background, "rgb(255, 255, 255)"); assert.equal(stats.heading, "21px"); assert.equal(stats.radius, "8px");
        await page.screenshot({ path: path.join(out, `rules-${spec.game}-${width}.png`) });
        await dialog.locator(".bg-rules-body").evaluate((el) => el.scrollTop = el.scrollHeight);
        const lastVisible = await dialog.evaluate((d) => {
          const body = d.querySelector(".bg-rules-body"), b = body.getBoundingClientRect(), last = body.lastElementChild.getBoundingClientRect(), close = d.querySelector(".dialog-heading button").getBoundingClientRect();
          return last.bottom <= b.bottom + 1 && close.top >= 0 && close.bottom <= innerHeight && body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
        });
        assert(lastVisible, `${spec.game}: end of rules and close remain visible at ${width}`);
        await page.keyboard.press("Escape"); assert.equal(await dialog.isVisible(), false);
        assert.equal(await page.evaluate(() => window.rulesSent.length), before, "reading rules must not send game actions");
        await page.locator(spec.button).focus(); await page.keyboard.press("Enter"); await dialog.waitFor({ state: "visible" });
        await dialog.locator(".dialog-heading button").click();
        assert.equal(await page.locator(spec.button).evaluate((el) => document.activeElement === el), true, "focus returns to Rules entry");
      }
    }
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + "/index.html");
    await page.click('[data-view-target="online"]');
    await page.evaluate(() => document.querySelector(".hand-rank-open").click());
    assert.equal(await page.locator('#gameRulesDialog [data-rule-section="rankings"] li').count(), 10);
    assert(await page.locator("#gameRulesDialog .bg-rules-body").evaluate((el) => el.scrollTop > 0));
    assert.deepEqual(errors, []); console.log("Shared rules browser checks passed: all five games, Seafarers/map rules, four viewports, end scrolling, keyboard, focus, rankings and no gameplay messages.");
  } finally {
    await browser?.close(); const closed = once(child, "exit"); child.kill(); await closed;
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
