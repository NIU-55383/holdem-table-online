"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { once } = require("node:events"), { spawn } = require("node:child_process");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const probe = net.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const child = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0", MILLION_BOT_DELAY: "35" }, stdio: ["ignore", "pipe", "pipe"] });
  let browser, logs = ""; child.stdout.on("data", c => logs += c); child.stderr.on("data", c => logs += c);
  const base = `http://127.0.0.1:${port}`, errors = [], out = path.join(__dirname, "test-results");
  try {
    let ready = false;
    for (let n = 0; n < 100; n++) { try { ready = (await fetch(base + "/million.html")).ok; } catch {} if (ready) break; await new Promise(r => setTimeout(r, 100)); }
    assert(ready, logs);
    browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe" }); fs.mkdirSync(out, { recursive: true });
    const pages = [];
    for (const name of ["Alice", "Bob", "Cindy", "David"]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        window.millionStates = []; window.millionEvents = []; window.millionSent = [];
        const Native = WebSocket;
        window.WebSocket = class extends Native {
          constructor(...args) { super(...args); window.millionSocket = this; this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") { window.millionState = m; window.millionStates.push(m); } else window.millionEvents.push(m); }); }
          send(data) { window.millionSent.push(JSON.parse(data)); return super.send(data); }
        };
      });
      const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message)); await page.goto(base + "/million.html"); await page.waitForFunction(() => document.getElementById("connection").textContent.includes("Connected")); await page.fill("#playerName", name); pages.push(page);
    }
    const page = pages[0];
    const colors = await page.locator("#roleGallery .role-card").evaluateAll(els => els.map(el => getComputedStyle(el).borderTopColor));
    assert.deepEqual(colors, ["rgb(92, 207, 127)", "rgb(239, 107, 107)", "rgb(79, 179, 232)", "rgb(180, 142, 242)", "rgb(230, 180, 80)"]);
    const reference = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await reference.goto(base + "/bridge.html");
    const palette = p => p.evaluate(() => {
      const root = getComputedStyle(document.documentElement), button = getComputedStyle(document.querySelector(".primary"));
      return { scheme: root.colorScheme, page: root.backgroundColor, ink: root.color, font: root.fontFamily, header: getComputedStyle(document.querySelector("header")).backgroundColor, action: button.backgroundColor, actionText: button.color };
    });
    assert.deepEqual(await palette(page), await palette(reference), "Million shares the club's Bridge palette");
    assert.equal(await page.locator("#roleGallery .role-card").first().evaluate(el => getComputedStyle(el).color), "rgb(36, 62, 54)");
    assert.equal(await page.locator("#playerName").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    await reference.goto(base + "/index.html");
    await reference.locator(".million-art img").waitFor();
    assert(await reference.locator(".million-art img").evaluate(img => img.complete && img.naturalWidth > 0));
    assert.equal(await reference.locator(".million-game .club-play").evaluate(el => getComputedStyle(el).color), "rgb(42, 118, 92)");
    await reference.locator(".million-game").screenshot({ path: path.join(out, "million-club-tile.png") });
    await reference.close();
    await page.screenshot({ path: path.join(out, "million-entry-1440.png"), fullPage: true });
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert(await page.evaluate(() => document.getElementById("setup").getBoundingClientRect().top < document.querySelector(".heist-table").getBoundingClientRect().top));
      await page.screenshot({ path: path.join(out, `million-entry-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click("#rulesBtn"); await page.locator("#gameRulesDialog").waitFor({ state: "visible" }); assert.match(await page.locator("#gameRulesDialog").innerText(), /Millions of Dollars/); await page.keyboard.press("Escape");
    for (const width of [1440, 390, 320, 740]) {
      await page.setViewportSize({ width, height: width === 740 ? 390 : 900 });
      await page.locator('#roleGallery [data-rules-section="role-snitch"]').click();
      const section = page.locator('[data-rule-section="role-snitch"]');
      assert.match(await section.innerText(), /必须.*不能选择不点名/);
      assert.match(await section.innerText(), /\$3M/);
      assert(await section.evaluate(el => el.getBoundingClientRect().top >= 0));
      assert(await page.locator("#gameRulesDialog").evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      await page.screenshot({ path: path.join(out, `million-snitch-rules-${width}.png`) });
      await page.keyboard.press("Escape");
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.click("#createBtn"); await page.waitForFunction(() => window.millionState?.code);
    const code = await page.evaluate(() => window.millionState.code);
    for (const other of pages.slice(1)) { await other.fill("#roomInput", code); await other.click("#joinForm button"); await other.waitForFunction(() => window.millionState?.code); }
    await page.waitForFunction(() => window.millionState?.seats.length === 4); await page.click("#startBtn"); await page.waitForFunction(() => window.millionState?.game?.phase === "planning");
    const roles = ["driver", "driver", "crook", "brute"];
    for (let i = 0; i < 4; i++) { await pages[i].click(`[data-pick="${roles[i]}"]`); await pages[i].click("#lockRoles"); await pages[i].waitForFunction(() => window.millionState.game.players[window.millionState.you].locked); }
    await page.waitForFunction(() => window.millionState.game.phase === "negotiation");
    assert.equal(await page.locator("#publicRoles .role-tag").count(), 3);
    const hidden = await page.evaluate(() => window.millionState.game.players.slice(1).every(p => p.slots.every(s => s.role === null))); assert(hidden);
    await page.locator("#actionPanel details").first().locator("summary").click(); await page.selectOption('[data-k="paySlot"]', "1:0"); await page.fill('[data-k="payAmount"]', "100"); await page.click("#payOffer");
    await pages[1].waitForFunction(() => window.millionState.game.offers.some(o => o.status === "pending")); await pages[1].click('[data-response][data-accept="true"]'); await pages[1].click("#confirmAction");
    await page.waitForFunction(() => window.millionState.game.players[1].slots[0].withdrawn);
    assert.equal(await page.evaluate(() => window.millionState.game.players[1].cash), 600);
    assert.equal(await page.evaluate(() => window.millionState.game.players[1].slots[0].role), null);
    assert.equal(await pages[1].locator("#chatText").isDisabled(), true);
    for (const i of [0, 2, 3]) { await pages[i].click("#readyHeist"); await pages[i].waitForFunction(() => window.millionState.game.players[window.millionState.you].ready || window.millionState.game.phase !== "negotiation"); }
    await page.waitForFunction(() => window.millionState.game.phase === "results");
    assert.match(await page.locator("#actionPanel").innerText(), /Round 1/); assert.equal(await page.evaluate(() => window.millionState.game.history[0].players[1].slots[0].role), "driver");
    assert.equal(await page.locator(".full-ledger").getAttribute("open"), null);
    await page.locator(".full-ledger summary").click(); assert(await page.locator(".full-ledger ol").isVisible()); await page.locator(".full-ledger summary").click();
    await page.screenshot({ path: path.join(out, "million-results-1440.png"), fullPage: true });
    const leader = await page.evaluate(() => window.millionState.game.leader); await pages[leader].click("#nextRound"); await page.waitForFunction(() => window.millionState.game.round === 2);
    const socialId = await page.evaluate(() => window.millionState.seats[1].socialId);
    await page.locator(`[data-social-id="${socialId}"]`).click();
    const reaction = page.locator('[data-reaction="heart"]'); await reaction.waitFor({ state: "visible" }); await reaction.click();
    await pages[1].waitForFunction(() => window.millionEvents.some(e => e.type === "reaction" && e.kind === "heart"));
    const beforeReload = await page.evaluate(() => ({ code: window.millionState.code, host: window.millionState.host, you: window.millionState.you, revision: window.millionState.game.revision, avatar: window.millionState.seats[0].avatar }));
    await page.reload(); await page.waitForFunction(() => window.millionState?.game?.round === 2);
    assert.equal(await page.locator("#players .hidden-role").first().evaluate(el => getComputedStyle(el).color), "rgb(81, 104, 92)");
    assert.equal(await page.locator("#roleGallery .inactive").first().evaluate(el => getComputedStyle(el).opacity), "1", "Unavailable role rules stay readable");
    assert.deepEqual(await page.evaluate(() => ({ code: window.millionState.code, host: window.millionState.host, you: window.millionState.you, revision: window.millionState.game.revision, avatar: window.millionState.seats[0].avatar })), beforeReload);
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [740, 390]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `overflow at ${width}`);
      assert(await page.locator('[data-pick="driver"]').isVisible());
      await page.screenshot({ path: path.join(out, `million-planning-${width}.png`), fullPage: true });
      await page.click("#rulesBtn"); await page.locator("#gameRulesDialog").waitFor({ state: "visible" });
      assert(await page.locator("#gameRulesDialog").evaluate(d => { const b = d.getBoundingClientRect(); return b.left >= 0 && b.top >= 0 && b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1; })); await page.keyboard.press("Escape");
    }
    await page.click("#settingsBtn"); await page.locator("#volume").fill("25"); assert.equal(await page.locator("#volumeValue").innerText(), "25%");
    assert.equal(await page.locator("#soundDialog").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)");
    await page.screenshot({ path: path.join(out, "million-audio-settings.png") }); await page.keyboard.press("Escape");
    const solo = await browser.newPage({ viewport: { width: 390, height: 844 } }); solo.on("pageerror", e => errors.push(e.message)); await solo.goto(base + "/million.html"); await solo.waitForFunction(() => !document.getElementById("createBtn").disabled); await solo.fill("#playerName", "Solo"); await solo.selectOption("#capacity", "3"); await solo.click("#createBtn"); await solo.locator("#fillBotsBtn").waitFor({ state: "visible" }); await solo.click("#fillBotsBtn"); await solo.click("#startBtn"); await solo.locator('[data-pick="driver"]').waitFor({ state: "visible" }); await solo.click('[data-pick="driver"]'); assert(await solo.locator("#lockRoles").isDisabled()); await solo.click('[data-pick="brute"]'); assert(await solo.locator("#lockRoles").isEnabled()); await solo.screenshot({ path: path.join(out, "million-three-player-390.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (let i = 0; i < 4; i++) { await pages[i].click(`[data-pick="${roles[i]}"]`); await pages[i].click("#lockRoles"); await pages[i].waitForFunction(() => window.millionState.game.players[window.millionState.you].locked); }
    await page.waitForFunction(() => window.millionState.game.phase === "negotiation");
    await page.locator("#actionPanel details").nth(1).locator("summary").click(); await page.fill('[data-k="transferAmount"]', "100"); await page.click("#transferBtn");
    assert(await page.locator("#confirmDialog").isVisible());
    await page.evaluate(() => window.millionSocket.send(JSON.stringify({ type: "roomControl", action: "kick", target: window.millionState.seats[1].socialId })));
    await page.waitForFunction(() => window.millionState.control.paused);
    await page.locator("#confirmDialog").waitFor({ state: "hidden" });
    assert.equal(await page.evaluate(() => window.millionSent.filter(m => m.action?.type === "transfer").length), 0);
    assert.deepEqual(errors, []); console.log("Million browser checks passed: exact five colors, mobile entry, four humans, secret roles, binding deal, silent withdrawal, settlement ledger, round-end disclosure, next round, social, reconnect, three-player roles, stale payment confirmation, audio and four viewports.");
  } finally { await browser?.close(); const exited = once(child, "exit"); child.kill(); await exited; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
