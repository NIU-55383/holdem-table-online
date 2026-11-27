"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), net = require("node:net");
const { once } = require("node:events"), { spawn } = require("node:child_process");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
async function main() {
  const probe=net.createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,["server.js"],{cwd:__dirname,windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:"1",AUTO_OPEN:"0"},stdio:["ignore","pipe","pipe"]});
  let browser,logs="";child.stdout.on("data",c=>logs+=c);child.stderr.on("data",c=>logs+=c);
  const base=`http://127.0.0.1:${port}`,errors=[];
  try {
    let ready=false;for(let i=0;i<100;i++){try{ready=(await fetch(base+"/coup.html")).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready,logs);
    browser=await playwright.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"});
    const pages=[];
    for(const player of ["Ada","Bob"]){
      const context=await browser.newContext({viewport:{width:1440,height:1000}});
      await context.addInitScript(()=>{const Native=WebSocket;window.sent=[];window.coupSnapshot=null;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener("message",e=>{try{const m=JSON.parse(e.data);if(m.type==="state")window.coupSnapshot=m;}catch{}});}send(data){window.sent.push(JSON.parse(data));return super.send(data);}};});
      const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));pages.push(page);await page.goto(base+"/coup.html");await page.locator("#createBtn").waitFor();await page.waitForFunction(()=>!document.querySelector("#createBtn").disabled);await page.fill("#playerName",player);
    }
    const [ada,bob]=pages;
    await ada.locator('[data-rules-game="coup"]').first().click();await ada.locator("#gameRulesDialog").waitFor({state:"visible"});await ada.keyboard.press("Escape");
    await ada.selectOption("#capacity","2");await ada.click("#createBtn");await ada.locator("#room").waitFor({state:"visible"});
    const code=await ada.locator("#roomCode").textContent();await bob.fill("#roomInput",code);await bob.locator("#joinForm button").click();await bob.locator("#room").waitFor({state:"visible"});await bob.click('[data-do="ready"]');await ada.locator('[data-do="start"]').click();
    for(const page of pages){await page.waitForFunction(()=>!!window.coupSnapshot?.game);assert.equal(await page.locator(".private-hand .role-card").count(),2);assert.equal(await page.locator(".coup-avatar").count(),2);assert.equal(await page.locator('.presence-dot[data-connected="true"]').count(),2);assert.equal(await page.locator(".mini-card.back").count(),2);}
    await ada.evaluate(()=>{window.keptAvatar=document.querySelector(".coup-avatar");});
    await ada.click('[data-action="income"]');await ada.click('[data-do="confirm-action"]');await ada.waitForFunction(()=>window.coupSnapshot.game.current===1);
    assert(await ada.evaluate(()=>window.keptAvatar===document.querySelector(".coup-avatar")),"unrelated updates must preserve avatar DOM");
    await bob.click('[data-action="income"]');await bob.click('[data-do="confirm-action"]');await ada.waitForFunction(()=>window.coupSnapshot.game.current===0&&window.coupSnapshot.game.phase==="turn");
    // Exchanging is a legal bluff. Passing allows its private selection UI to resolve.
    await ada.click('[data-action="exchange"]');await ada.click('[data-do="confirm-action"]');await bob.locator('[data-do="pass"]').click();await ada.waitForFunction(()=>window.coupSnapshot.game.phase==="exchange");
    assert.equal(await ada.locator(".hand-cards [data-card]").count(),4);assert.equal(await bob.locator(".hand-cards [data-card]").count(),0);assert.equal(await bob.locator(".private-hand .role-card").count(),2);
    const choices=ada.locator(".hand-cards [data-card]");await choices.nth(0).click();await choices.nth(1).click();assert.equal(await ada.locator('[data-card][aria-pressed="true"]').count(),2);await ada.click('[data-do="confirm-cards"]');await bob.waitForFunction(()=>window.coupSnapshot.game.phase==="turn"&&window.coupSnapshot.game.current===1);
    // Seat zero is a valid target, including DOM data-target="0".
    await bob.click('[data-action="steal"]');await bob.click('[data-target="0"]');await ada.locator('[data-do="pass"]').click();await ada.waitForFunction(()=>window.coupSnapshot.game.phase==="block");await ada.locator('[data-do="pass"]').click();await bob.waitForFunction(()=>window.coupSnapshot.game.phase==="turn");
    const targetCommand=await bob.evaluate(()=>window.sent.find(m=>m.type==="action"&&m.action?.action==="steal"));assert.equal(targetCommand.action.targetId,0);
    for(const [width,height] of [[1440,1000],[390,844],[320,740],[740,320]]){
      await ada.setViewportSize({width,height});await ada.waitForTimeout(40);assert(await ada.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}`);
      assert(await ada.locator(".coup-avatar").first().isVisible(),"mobile avatars stay available");
      assert(await ada.locator('.seat-row').first().evaluate(row=>Math.abs(row.firstElementChild.getBoundingClientRect().width-row.getBoundingClientRect().width)<2),"a two-player row uses its available width");
      await ada.locator('[data-rules-game="coup"]').first().click();await ada.locator("#gameRulesDialog").waitFor({state:"visible"});await ada.keyboard.press("Escape");
    }
    await ada.setViewportSize({width:1440,height:1000});await ada.locator('[data-social-target]').first().click();await ada.locator(".reaction-menu").waitFor({state:"visible"});assert.equal(await ada.locator(".reaction-options button").count(),6);await ada.locator('[data-reaction-close]').click();
    await ada.locator('#table [data-edit-avatar]').click();await ada.locator(".avatar-dialog").waitFor({state:"visible"});await ada.keyboard.press("Escape");
    const out=path.join(__dirname,"test-results");fs.mkdirSync(out,{recursive:true});await ada.screenshot({path:path.join(out,"coup-desktop.png"),fullPage:true});await ada.setViewportSize({width:390,height:844});await ada.screenshot({path:path.join(out,"coup-mobile.png"),fullPage:true});
    await ada.setViewportSize({width:1440,height:1000});
    // Both host controls require a concrete, cancellable confirmation.
    const revision=await ada.evaluate(()=>window.coupSnapshot.game.revision);
    await ada.click('[data-do="end-game"]');await ada.locator('#confirmDialog').waitFor({state:'visible'});await ada.click('#cancelConfirm');
    await ada.click('[data-do="restart-game"]');await ada.click('#cancelConfirm');
    assert.equal(await ada.evaluate(()=>window.sent.filter(m=>['endGame','restart'].includes(m.type)).length),0);
    assert.equal(await ada.evaluate(()=>window.coupSnapshot.game.revision),revision);
    await ada.click('[data-do="end-game"]');await ada.click('#confirmAction');await ada.waitForFunction(()=>window.coupSnapshot.game.endReason==='hostEnded');
    assert.equal(await ada.evaluate(()=>window.coupSnapshot.game.winner),null);assert.match(await ada.locator('#roomTitle').textContent(),/本局已结束/);assert.doesNotMatch(await ada.locator('#controls').textContent(),/Player wins|胜利/);
    await ada.click('[data-do="restart-game"]');await ada.click('#confirmAction');await ada.waitForFunction(()=>!window.coupSnapshot.game);assert.equal(await ada.locator('#roomCode').textContent(),code);
    await ada.selectOption('#roomCapacity','6');await ada.waitForFunction(()=>window.coupSnapshot.capacity===6);await ada.click('[data-do="fillBots"]');await ada.waitForFunction(()=>window.coupSnapshot.seats.length===6);
    // Lobby removal must name the bot twice, and either step may be cancelled.
    const remove=ada.locator('[data-remove]').first(),target=await remove.getAttribute('data-remove');
    const targetName=await ada.evaluate(id=>window.coupSnapshot.seats.find(s=>s.socialId===id).name,target);
    await remove.click();await ada.locator('.removal-confirm-dialog').waitFor({state:'visible'});assert.equal(await ada.locator('.removal-name').textContent(),targetName);await ada.click('[data-room-action="cancelKick"]');
    assert.equal(await ada.evaluate(()=>window.coupSnapshot.seats.length),6);
    await remove.click();await ada.click('[data-room-action="confirmKick"]');assert.equal(await ada.locator('.removal-name').textContent(),targetName);await ada.click('[data-room-action="cancelKick"]');
    assert.equal(await ada.evaluate(()=>window.sent.filter(m=>m.type==='removeBot').length),0);
    await remove.click();await ada.click('[data-room-action="confirmKick"]');await ada.click('[data-room-action="executeKick"]');await ada.waitForFunction(()=>window.coupSnapshot.seats.length===5);
    assert.equal(await ada.evaluate(()=>window.sent.filter(m=>m.type==='removeBot').length),1);
    await ada.click('[data-do="fillBots"]');await ada.waitForFunction(()=>window.coupSnapshot.seats.length===6);await bob.click('[data-do="ready"]');await ada.click('[data-do="start"]');await ada.waitForFunction(()=>window.coupSnapshot.game?.players.length===6);
    assert.equal(await ada.locator('.coup-avatar').count(),6);
    for(const [width,height] of [[1440,1000],[390,844],[320,740],[740,320]]){
      await ada.setViewportSize({width,height});await ada.waitForTimeout(40);
      assert(await ada.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`six-player horizontal overflow at ${width}`);
      assert(await ada.locator('.seat').evaluateAll(seats=>seats.every(s=>s.scrollWidth<=s.clientWidth+1)),`seat contents overflow at ${width}`);
      assert(await ada.locator('.seat-row').first().evaluate(row=>getComputedStyle(row).gridTemplateColumns.split(' ').length===3),"six players use three columns per row");
    }
    await ada.setViewportSize({width:1440,height:1000});await ada.screenshot({path:path.join(out,'coup-six-desktop.png'),fullPage:true});await ada.setViewportSize({width:390,height:844});await ada.screenshot({path:path.join(out,'coup-six-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log("Coup UI passed: private hands, exchange, seat-zero target, stable avatars, shared rules/reactions/editor, 2/6-player layouts at 4 viewports, host end/restart confirmations, two-step bot removal.");
  } finally {await browser?.close();child.kill();await once(child,"exit").catch(()=>{});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
