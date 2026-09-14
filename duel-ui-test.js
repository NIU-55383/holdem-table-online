"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http"), { once } = require("node:events");
const { attachDuel } = require("./duel-server");
let playwright; try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright")); }
const server = http.createServer((req,res)=>{
  const u = new URL(req.url,"http://localhost"), file=path.join(__dirname,u.pathname);
  if(u.pathname==="/api/catan-preview"){res.setHeader("Content-Type","application/json");res.end(JSON.stringify(require("./catan-engine").makeBoard()));return;}
  if(!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  res.setHeader("Content-Type",({".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain");fs.createReadStream(file).pipe(res);
});
const duel=attachDuel(server);server.on("upgrade",duel.upgrade);
(async()=>{
  let browser;
  try {
    server.listen(0,"127.0.0.1");await once(server,"listening");const base=`http://127.0.0.1:${server.address().port}`;
    browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    fs.mkdirSync(path.join(__dirname,"test-results"),{recursive:true});const errors=[];
    async function player(kind,name){const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await ctx.addInitScript(()=>{const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.type==="state")window.testState=m;});}};});const page=await ctx.newPage();page.on("pageerror",e=>errors.push(e.message));await page.goto(`${base}/duel.html?game=${kind}`);await page.getByText("已连接 / Connected",{exact:true}).waitFor();await page.locator("#playerName").fill(name);return{ctx,page};}
    for(const kind of ["gomoku","xiangqi"]){
      const {ctx,page}=await player(kind,"Connie");
      assert.equal(await page.locator("#roomInput").getAttribute("placeholder"),"房间号 / Room code");
      for(const width of [320,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`test-results/${kind}-setup-${width}.png`,fullPage:true});}
      await page.setViewportSize({width:390,height:844});await page.locator("#rulesBtn").click();await page.locator("#rulesDialog[open]").waitFor();await page.locator('[data-close="rulesDialog"]').click();
      await page.locator("#difficulty").selectOption("hard");await page.locator("#createBtn").click();await page.waitForFunction(()=>window.testState?.game);
      if(kind==="gomoku")await page.locator('[data-cell="112"]').click();
      else{await page.locator('[data-cell="64"]').click();assert.ok(await page.locator(".move-target").count()>0);await page.locator('[data-cell="67"]').click();}
      await page.waitForFunction(()=>window.testState.game.moves.length===2,{},{timeout:10000});
      for(const width of [320,390,1440]){
        await page.setViewportSize({width,height:width===1440?1000:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
        const b=await page.locator("#board").boundingBox();assert.ok(b.width>200&&b.height>200);
        assert.equal(await page.locator("#you .presence-dot").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(36, 151, 107)");
        await page.screenshot({path:`test-results/${kind}-game-${width}.png`,fullPage:true});
      }
      await page.locator("#undoBtn").click();await page.waitForFunction(()=>window.testState.game.moves.length===0);
      await page.reload();await page.waitForFunction(()=>window.testState?.game?.moves.length===0);
      assert.match(await page.locator("#you").textContent(),/Connie/);
      await page.locator("#resignBtn").click();await page.locator("#confirmYes").click();await page.waitForFunction(()=>window.testState.game.phase==="over");const winner=await page.evaluate(()=>window.testState.seats[window.testState.game.winner].name);assert.ok((await page.locator("#status").textContent()).includes(`${winner} wins`));
      await page.locator("#rematchBtn").click();await page.waitForFunction(()=>window.testState.game.phase==="playing"&&window.testState.you===1);await ctx.close();
    }
    const a=await player("gomoku","Angela"), b=await player("gomoku","William");
    await a.page.locator('[name=mode][value=friend]').check();await a.page.locator("#createBtn").click();await a.page.locator("#roomCode").waitFor();const code=await a.page.locator("#roomCode").textContent();
    await b.page.locator("#roomInput").fill(code);await b.page.locator('#joinForm button').click();await b.page.locator("#readyBtn").waitFor();assert.equal(await b.page.locator("#roomCode").textContent(),code);await b.page.locator("#readyBtn").click();await a.page.locator("#startBtn:not([disabled])").click();
    await a.page.locator('[data-cell="112"]').click();await b.page.waitForFunction(()=>window.testState.game.moves.length===1);await b.page.locator('[data-cell="113"]').click();await a.page.waitForFunction(()=>window.testState.game.moves.length===2);
    await a.page.locator("#chatText").fill("Hello 棋友");await a.page.locator('#chatForm button').click();await b.page.locator(".player-chat").waitFor();assert.equal(await b.page.locator(".player-chat").textContent(),"Hello 棋友");
    await b.page.locator("#you [data-edit-avatar]").click();await b.page.locator("#avatarEmoji").fill("😀");await b.page.locator("#avatarSave").click();await a.page.waitForFunction(()=>window.testState.seats[1].avatar?.value==="😀");
    await b.ctx.close();await a.page.waitForFunction(()=>window.testState.seats[1].connected===false);assert.equal(await a.page.locator("#opponent .presence-dot").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(146, 153, 157)");
    const room=duel.rooms.get(code);assert.equal(room.game.moves.length,2);await a.ctx.close();
    const xHost=await player("xiangqi","Colin"), xGuest=await player("xiangqi","Zoey");
    await xHost.page.locator('[name=mode][value=friend]').check();await xHost.page.locator("#createBtn").click();await xHost.page.locator("#roomCode").waitFor();
    const xCode=await xHost.page.locator("#roomCode").textContent();
    await xGuest.page.locator("#roomInput").fill(xCode);await xGuest.page.locator('#joinForm button').click();await xGuest.page.locator("#readyBtn").waitFor();
    assert.equal(await xGuest.page.locator("#roomCode").textContent(),xCode,"The displayed Xiangqi code can be entered as-is, without another prefix");
    assert.equal(await xGuest.page.evaluate(()=>window.testState.kind),"xiangqi");
    await xGuest.ctx.close();await xHost.ctx.close();
    const hub=await browser.newPage({viewport:{width:390,height:844}});await hub.goto(`${base}/index.html`);assert.equal(await hub.locator(".club-game").count(),5);await hub.screenshot({path:"test-results/club-five-games-mobile.png",fullPage:true});assert.equal(await hub.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);console.log("PASS: two games, direct room-code joining, all mobile/desktop layouts, AI, moves, undo, rematch, live chat/avatar/presence, reconnect and club links");
  } finally {await browser?.close();server.close();server.emit("close");}
})().catch(e=>{console.error(e);process.exitCode=1;});
