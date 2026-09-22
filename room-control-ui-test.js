"use strict";
const assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs");
const { spawn } = require("node:child_process"), { once } = require("node:events");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
(async () => {
  const port = 18943, errors = [], contexts = [];
  const server = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: String(port), AUTO_OPEN: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const send = (p, data) => p.evaluate(m => testSocket.send(JSON.stringify(m)), data);
  const close = p => p.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
  async function bounds(p, selector) {
    assert.equal(await p.locator(selector).evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && el.scrollWidth <= el.clientWidth + 1;
    }), true, `${selector} must fit the viewport without horizontal clipping`);
  }
  try {
    await once(server.stdout, "data");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync("test-results", { recursive: true });
    for (const kind of ["catan", "poker", "gomoku", "xiangqi", "richman"]) {
      const duel = ["gomoku", "xiangqi"].includes(kind), pages = [];
      for (let i = 0; i < 2; i++) {
        const context = await browser.newContext({ viewport: { width: i ? 1440 : 390, height: i ? 1000 : 844 }, hasTouch: !i }); contexts.push(context);
        await context.addInitScript(() => {
          const Native = window.WebSocket;
          window.testRemovals = [];
          window.WebSocket = class extends Native {
            constructor(...args) { super(...args); window.testSocket = this; this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") { window.testMessage = m; window.testState = m.room || m; } if (m.type === "left") window.testLeft = true; }); }
            send(raw) { const m=JSON.parse(raw); if(m.action==="kick"||m.type==="removeBot"||(m.type==="bots"&&m.remove!==undefined)) testRemovals.push(m); super.send(raw); }
          };
        });
        const p = await context.newPage(); pages.push(p); p.on("pageerror", e => errors.push(`${kind}: ${e.message}`));
        const file = kind === "poker" ? "index.html?game=poker" : kind === "catan" ? "catan.html" : kind === "richman" ? "richman.html" : `duel.html?game=${kind}`;
        await p.goto(`http://127.0.0.1:${port}/${file}`);
        await p.waitForFunction(() => window.testSocket?.readyState === WebSocket.OPEN); await close(p);
      }
      const [a, b] = pages;
      await send(a, { type: "create", kind, name: "Alice", seats: 3, maxPlayers: 3, players: 3, funds: 50000, days: 30, difficulty: "easy", side: 0 });
      await a.waitForFunction(() => window.testState?.control);
      const code = await a.evaluate(() => testState.code);
      await send(b, { type: "join", code, name: "Bob" }); await b.waitForFunction(() => window.testState?.control);
      await a.waitForFunction(() => testState.control.seats.some(s => s?.name === "Bob"));
      await close(a); await close(b);
      await a.locator("[data-room-manage]").click();
      assert.equal(await a.locator('[data-room-idle-auto]').isChecked(),false,"Idle auto-play defaults off in every lobby");
      await b.locator('[data-room-manage]').click();
      assert.equal(await b.locator('[data-room-idle-auto]').isDisabled(),true,"Guests can see but cannot change room policy");
      await a.locator('[data-room-idle-auto]').check();
      await b.waitForFunction(()=>testState.control.idleAuto===true);
      assert.equal(await b.locator('[data-room-idle-auto]').isChecked(),true);
      await a.locator('[data-room-action="transfer"]').click();
      await b.locator('[data-room-action="accept"]').waitFor();
      assert.equal(await a.evaluate(() => testState.control.host === testState.control.you), true);
      await b.locator('[data-room-action="accept"]').click();
      await b.waitForFunction(() => testState.control.host === testState.control.you);
      assert.equal(await b.locator('[data-room-idle-auto]').isEnabled(),true,"New host controls the existing room policy");
      assert.equal(await a.locator('[data-room-idle-auto]').isDisabled(),true,"Former host loses permission");
      await b.locator('[data-room-idle-auto]').uncheck();
      await a.waitForFunction(()=>testState.control.idleAuto===false);
      await b.locator('[data-room-action="transfer"]').click();
      await a.locator('[data-room-action="accept"]').click();
      await a.waitForFunction(() => testState.control.host === testState.control.you);
      await close(a); await close(b);
      async function confirmBoth(openRemoval, name, cancelChecks=false) {
        const before=await a.evaluate(()=>testRemovals.length);
        if(cancelChecks) {
          await openRemoval(); await a.locator('[data-room-action="cancelKick"]').click();
          await a.locator('.removal-confirm-dialog').waitFor({state:"hidden"});
          await openRemoval(); await a.locator('[data-room-action="confirmKick"]').click();
          await a.locator('[data-room-action="cancelKick"]').click();
          await a.locator('.removal-confirm-dialog').waitFor({state:"hidden"});
          assert.equal(await a.evaluate(()=>testRemovals.length),before,"Cancel at either step sends nothing");
        }
        await openRemoval();
        assert.ok((await a.locator('.removal-confirm-dialog').textContent()).includes(name));
        await bounds(a,'.removal-confirm-dialog');
        await a.locator('[data-room-action="confirmKick"]').click();
        assert.equal(await a.evaluate(()=>testRemovals.length),before,"First confirmation must not remove anyone");
        assert.equal(await a.evaluate(()=>document.activeElement?.dataset.roomAction),"cancelKick","Final step focuses Cancel");
        await bounds(a,'.removal-confirm-dialog');
        await a.screenshot({path:`test-results/room-double-confirm-${kind}.png`});
        await a.locator('[data-room-action="executeKick"]').click();
        await a.locator('.removal-confirm-dialog').waitFor({state:"hidden"});
        assert.equal(await a.evaluate(()=>testRemovals.length),before+1,"Exactly one removal after two confirmations");
      }
      if (!duel) {
        const addBots=async()=>{await send(a,{type:kind==="richman"?"bots":"fillBots",fill:true});await a.waitForFunction(()=>testState.control.seats.filter(Boolean).length===3);};
        await addBots();
        const name=await a.evaluate(()=>testState.control.seats.find(s=>s?.bot).name);
        const selector=kind==="catan"?"#removeBot":kind==="poker"?"#removeOnlineBotBtn":"[data-remove-bot]";
        await confirmBoth(()=>a.locator(selector).click(),name,true);
        await a.waitForFunction(()=>!testState.control.seats.some(s=>s?.bot));
        await addBots();
      }
      if (kind === "poker") await send(a, { type: "toggleAutoNext", enabled: false });
      if (duel || kind === "richman") { await send(b, { type: "ready", ready: true }); await a.waitForFunction(() => testState.seats.every(s => s?.ready)); }
      await send(a, { type: "start" }); await a.waitForFunction(() => testState.control.started); await close(a); await close(b);
      await a.locator('[data-room-manage]').click();
      for(const change of ["host","target"]) {
        const saved=await a.evaluate(()=>structuredClone(testMessage)),before=await a.evaluate(()=>testRemovals.length);
        await a.locator('.room-control-seat').filter({hasText:"Bob"}).locator('[data-room-action="kick"]').click();
        await a.locator('[data-room-action="confirmKick"]').click();
        await a.evaluate(change=>{
          const m=structuredClone(testMessage),c=(m.room||m).control,target=c.seats.find(s=>s?.name==="Bob");
          if(change==="host")c.host=target.id;else target.id="replacement-seat";
          testSocket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(m)}));
        },change);
        await a.locator('.removal-confirm-dialog').waitFor({state:"hidden"});
        assert.equal(await a.evaluate(()=>testRemovals.length),before,"Stale confirmation closes without removing anyone");
        await a.evaluate(m=>testSocket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(m)})),saved);
      }
      await close(a);
      async function kickBob() {
        await a.locator("[data-room-manage]").click();
        await confirmBoth(()=>a.locator('.room-control-seat').filter({hasText:"Bob"}).locator('[data-room-action="kick"]').click(),"Bob",true);
        await a.waitForFunction(() => testState.control.paused);
      }
      await kickBob(); await b.waitForFunction(() => window.testLeft);
      for (const width of [320, 390, 1440]) {
        await a.setViewportSize({ width, height: width === 320 ? 640 : 844 });
        await bounds(a, ".room-control-dialog[open]");
        await a.screenshot({ path: `test-results/room-control-${kind}-${width}.png` });
      }
      // The removed human explicitly joins via the normal room-code form, not an auto-reconnect.
      if (kind === "catan") { await b.locator("#name").fill("Bob"); await b.locator("#code").fill(code); await b.locator("#join").click(); }
      else if (kind === "poker") { await b.locator("#onlineNameInput").fill("Bob"); await b.locator("#onlineRoomCodeInput").fill(code); await b.locator("#joinOnlineRoomBtn").click(); }
      else { await b.locator("#playerName").fill("Bob"); await b.locator("#roomInput").fill(code); await b.locator("#joinForm button").click(); }
      await a.waitForFunction(() => !testState.control.paused);
      await close(a); await close(b); await kickBob();
      await a.locator('[data-room-action="fillBot"]').click();
      await a.waitForFunction(() => !testState.control.paused);
      const bot=await a.evaluate(()=>testState.control.seats.find(s=>s?.bot));
      await a.setViewportSize({width:320,height:640});
      await confirmBoth(()=>a.locator(`[data-control-seat="${bot.index}"] [data-room-action="kick"]`).click(),bot.name,true);
      await a.waitForFunction(()=>testState.control.paused);
      await a.locator('[data-room-action="fillBot"]').click();
      await a.waitForFunction(()=>!testState.control.paused); await close(a);
      await a.setViewportSize({ width: 390, height: 844 });
      await a.locator('[data-room-manage]').click();
      assert.equal(await a.locator('[data-room-idle-auto]').isChecked(),false);
      await a.locator('[data-room-action="auto"]').click();
      await a.waitForFunction(()=>testState.control.auto);
      await a.locator('[data-room-action="auto"]').click();
      await a.waitForFunction(()=>!testState.control.auto);
      assert.equal(await a.evaluate(()=>testState.control.warning),null,"Stopping manual auto does not start a default deadline");
      await bounds(a,'.room-control-dialog[open]');
      await a.screenshot({path:`test-results/room-auto-opt-in-${kind}-390.png`});
      await a.locator('[data-room-idle-auto]').check();
      await a.waitForFunction(()=>testState.control.idleAuto);
      await a.locator('[data-room-idle-auto]').uncheck();
      await a.waitForFunction(()=>!testState.control.idleAuto);
      await close(a);
      // Ignore even a stale deadline when the personal option is off.
      await a.evaluate(()=>{
        const m=structuredClone(testMessage),c=(m.room||m).control,now=Date.now();
        c.now=now;c.auto=false;c.idleAuto=false;c.warning={warnAt:now-1,deadline:now+15000};
        testSocket.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(m)}));
      });
      assert.equal(await a.locator('.idle-warning').isVisible(),false);
      await a.locator('[data-room-manage]').click();
      await a.locator('[data-room-idle-auto]').check();
      await a.waitForFunction(()=>testState.control.idleAuto);await close(a);
      // Server deadline behavior is covered by room-control-test; exercise the shared UI at the warning boundary.
      await a.evaluate(() => {
        const m = structuredClone(testMessage), c = (m.room || m).control, now = Date.now();
        c.now = now; c.auto = false; c.idleAuto = true; c.warning = { warnAt: now - 1, deadline: now + 15000 };
        testSocket.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(m) }));
      });
      await a.locator(".idle-warning[open]").waitFor(); await bounds(a, ".idle-warning");
      const seconds = Number(await a.locator("[data-idle-seconds]").textContent()); assert.ok(seconds > 0 && seconds <= 15);
      await a.screenshot({ path: `test-results/room-idle-${kind}-390.png` });
      await a.locator(".idle-warning [data-room-stay]").click();
      await a.locator(".idle-warning").waitFor({ state: "hidden" });
      console.log(`${kind}: consent, removal, explicit rejoin, bot replacement, mobile dialog bounds and idle warning passed`);
      await a.context().close(); await b.context().close();
    }
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); server.kill(); await once(server, "exit"); }
})().catch(e => { console.error(e); process.exitCode = 1; });
