"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http");
const {once}=require("node:events"),{spawn}=require("node:child_process");
let PW;try{PW=require("playwright");}catch{PW=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright"));}
async function main(){
  const probe=http.createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=probe.address().port;await new Promise(r=>probe.close(r));
  const server=spawn(process.execPath,[require.resolve("./server")],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:"1",AUTO_OPEN:"0",TRUTH_BOT_DELAY:"60000"},stdio:["ignore","pipe","pipe"]});
  let browser;const errors=[],out=path.join(__dirname,"test-results");server.stderr.on("data",e=>errors.push(String(e)));fs.mkdirSync(out,{recursive:true});
  try{
    await once(server.stdout,"data");browser=await PW.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"});
    async function page(file="truth.html"){
      const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:"reduce"});
      await ctx.addInitScript(()=>{window.testSent=[];window.testEvents=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener("message",e=>{const d=JSON.parse(e.data);testEvents.push(d);if(d.type==="state")window.testState=d;});}send(d){testSent.push(JSON.parse(d));super.send(d);}};});
      const p=await ctx.newPage();p.on("pageerror",e=>errors.push(e.message));p.setDefaultTimeout(10000);await p.goto(`http://127.0.0.1:${port}/${file}`);return p;
    }
    async function layout(p,label){for(const width of [1440,390,320,740]){await p.setViewportSize({width,height:width===740?360:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label} overflow ${width}`);await p.screenshot({path:path.join(out,`${label}-${width}.png`),fullPage:true});}await p.setViewportSize({width:390,height:844});}
    const p=await page(),local=()=>p.evaluate(()=>JSON.parse(sessionStorage.getItem("boardclub-truth-local")));
    assert.equal(await p.locator("#setupPlayers option").count(),7);
    for(const level of ["chill","heat","wild","unmasked","showdown"]){await p.locator(`[data-level="${level}"]`).focus();await p.keyboard.press("Enter");assert.equal(await p.locator(`[data-level="${level}"]`).getAttribute("aria-pressed"),"true");}
    await layout(p,"truth-new-setup");
    assert.equal(await p.locator("#rounds").count(),0);
    await p.selectOption("#setupPlayers","2");await p.fill("#localNames","Alice\nBob");await p.selectOption("#selection","chain");await p.selectOption("#skipLimit","1");await p.click("#createBtn");
    assert.equal((await local()).game.stage,"choose");assert.equal(await p.locator("#diceScene").isVisible(),false);
    const target=(await local()).game.target;await p.click('[data-play="choose"][data-kind="dare"]');
    await p.click('[data-play="reroll"]');await p.click('[data-play="reroll"]');assert(await p.locator('[data-play="reroll"]').isDisabled());
    await p.fill("#customPrompt","Our custom dare");await p.click('[data-play="ask"]');assert.equal(await p.locator("#promptZh").textContent(),"Our custom dare");await p.click('[data-play="skip"]');
    assert.equal((await local()).game.asker,target);assert.equal((await local()).game.skipsUsed[target],1);
    const saved=await local();await p.reload();assert.deepEqual(await local(),saved);
    await p.click('[data-play="choose"][data-kind="truth"]');await p.click('[data-play="ask"]');await p.click('[data-play="complete"]');
    await p.click('[data-play="choose"][data-kind="truth"]');await p.click('[data-play="ask"]');assert(await p.locator('[data-play="skip"]').isDisabled());await layout(p,"truth-no-skips");await p.click('[data-play="complete"]');assert.equal((await local()).game.phase,"playing");
    const progress=await local();
    await p.evaluate(()=>{const key="boardclub-truth-local",s=JSON.parse(sessionStorage.getItem(key));s.rounds=3;Object.assign(s.game,{rounds:3,round:3,phase:"over",stage:"roll",asker:-1,target:-1,kind:null,prompt:null,winners:[0]});sessionStorage.setItem(key,JSON.stringify(s));});
    await p.reload();assert.equal((await local()).game.phase,"playing");assert.equal((await local()).game.round,4);assert.deepEqual((await local()).game.skipsUsed,progress.game.skipsUsed);assert.deepEqual((await local()).game.scores,progress.game.scores);
    for(let i=0;i<10;i++){await p.click('[data-play="choose"][data-kind="truth"]');await p.click('[data-play="ask"]');await p.click('[data-play="complete"]');}
    assert.equal((await local()).game.round,14);assert.equal((await local()).game.phase,"playing");assert.equal(await p.locator('[data-play="restart"]').count(),0);assert.match(await p.locator("#roundLabel").textContent(),/Question 14/);
    await p.click("#leaveBtn");await p.click("#confirmLeave");assert.equal(await local(),null);await p.click('[data-category="truth"]');await p.selectOption("#selection","together");await p.click("#createBtn");
    assert.equal((await local()).game.stage,"challenge");assert.equal(await p.locator('[data-play="complete"]').count(),2);
    await p.click('[data-play="reroll"]');await p.fill("#customPrompt","What made you happy today?");await p.click('[data-play="ask"]');
    await p.click('[data-play="complete"][data-actor="1"]');assert.equal((await local()).game.round,1);assert(await p.locator('[data-play="complete"][data-actor="1"]').isDisabled());assert.equal(await p.locator('[data-play="reroll"]').count(),0);
    await p.click('[data-play="complete"][data-actor="0"]');assert.equal((await local()).game.round,2);await layout(p,"truth-together");
    const before=await local();await p.click("#rulesBtn");assert.match(await p.locator("#gameRulesDialog").textContent(),/two replacements per round/);await p.keyboard.press("Escape");assert.deepEqual(await local(),before);assert.equal(await p.evaluate(()=>testSent.length),0);
    await p.context().close();console.log("Truth local: settings, custom/two replacements, skip budget, chain, together, refresh and layouts OK");
    for(const selection of ["random","chain","together"]){
      const a=await page(),b=await page(),players=[a,b];
      for(const [q,name]of[[a,"Laura"],[b,"Colin"]]){await q.click('[data-mode="online"]');await q.waitForFunction(()=>testEvents.some(e=>e.type==="welcome"));await q.fill("#playerName",name);}
      await a.selectOption("#setupPlayers","2");await a.click('[data-category="truth"]');await a.selectOption("#selection",selection);await a.selectOption("#skipLimit","1");await a.click("#createBtn");await a.waitForFunction(()=>window.testState?.code);
      await b.fill("#roomInput",await a.evaluate(()=>testState.code));await b.click("#joinForm button");await b.click("#readyBtn");await a.click("#startBtn:not([disabled])");for(const q of players)await q.waitForFunction(()=>window.testState?.game?.version===3);
      const g=await a.evaluate(()=>testState.game);
      if(selection==="together"){assert.equal(await a.locator("#promptZh").textContent(),await b.locator("#promptZh").textContent());await b.click('[data-play="complete"]');await a.waitForFunction(()=>testState.game.responses[1]==="complete");assert(await b.locator('[data-play="complete"]').isDisabled());await a.click('[data-play="complete"]');}
      else{const asker=players[g.asker],answer=players[g.target];assert.equal(await answer.locator('#playActions button:not([disabled])').count(),0);await asker.fill("#customPrompt","An online question");await asker.click('[data-play="ask"]');await answer.click('[data-play="skip"]:not([disabled])');}
      await a.waitForFunction(()=>testState.game.round===2);if(selection==="chain")assert.equal(await a.evaluate(()=>testState.game.asker),g.target);
      const stored=await a.evaluate(()=>testState.game);await a.reload();await a.waitForFunction(()=>window.testState?.game?.round===2);assert.deepEqual(await a.evaluate(()=>testState.game),stored);
      for(let round=3;round<=11;round++){
        const current=await a.evaluate(()=>testState.game);
        if(selection==="together"){await a.click('[data-play="complete"]');await b.waitForFunction(()=>testState.game.responses[0]==="complete");await b.click('[data-play="complete"]');}
        else {await players[current.asker].click('[data-play="ask"]');await players[current.target].click('[data-play="complete"]:not([disabled])');}
        for(const q of players)await q.waitForFunction(n=>testState.game.round===n,round);
      }
      assert.equal(await a.evaluate(()=>testState.game.phase),"playing");await layout(a,`truth-online-${selection}`);await a.context().close();await b.context().close();
    }
    console.log("Truth online: random, chain, together, own-response controls and reconnect OK");
    for(const kind of ["gomoku","xiangqi"]){
      const q=await page(`duel.html?game=${kind}`),key=`boardclub-${kind}-local`;
      await q.fill("#playerName","North");await q.check('[name="mode"][value="local"]');await q.fill("#secondName","South");await q.click("#createBtn");await q.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)||"null")?.game?.phase==="playing",key);
      const game=()=>q.evaluate(k=>JSON.parse(sessionStorage.getItem(k)).game,key);
      async function move(){const g=await game(),m=g.legal[0];if(kind==="xiangqi")await q.click(`[data-cell="${m.from}"]`);await q.click(`[data-cell="${m.to}"]`);await q.waitForFunction(([k,n])=>JSON.parse(sessionStorage.getItem(k)).game.moves.length===n,[key,g.moves.length+1]);}
      await move();await move();const initial=await game();await q.reload();await q.locator("#undoBtn:not([disabled])").waitFor();assert.deepEqual((await game()).board,initial.board);
      await q.context().setOffline(true);await move();await q.click("#undoBtn");await q.click("#confirmYes");await q.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)).game.moves.length===2,key);
      assert.equal(await q.locator("#you .presence-dot").evaluate(e=>getComputedStyle(e).backgroundColor),"rgb(36, 151, 107)");await q.click("#flipBtn");await layout(q,`${kind}-local`);
      await q.click("#drawBtn");await q.click("#confirmYes");await q.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)).game.phase==="over",key);assert.match(await q.locator("#status").textContent(),/Draw/);
      await q.context().setOffline(false);await q.click("#rematchBtn");await q.click("#confirmYes");await q.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)).game.phase==="playing",key);assert.equal((await game()).moves.length,0);
      await move();await q.click("#resignBtn");await q.click("#confirmYes");await q.waitForFunction(k=>JSON.parse(sessionStorage.getItem(k)).game.phase==="over",key);assert.match(await q.locator("#status").textContent(),/South.*wins/);
      await q.click("#localSaveButton");const download=q.waitForEvent("download");await q.click('[data-archive="prepare"]');const file=await download,filePath=path.join(out,`${kind}-local-save.json`);await file.saveAs(filePath);assert.equal(JSON.parse(fs.readFileSync(filePath)).game,kind);await q.click('[data-archive="commit"]');assert.equal(await q.evaluate(k=>sessionStorage.getItem(k),key),null);
      assert.equal(await q.evaluate(()=>testSent.filter(m=>["create","move","action"].includes(m.type)).length),0);await q.context().close();console.log(`${kind}: local offline moves, undo, draw, rematch, save and layouts OK`);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();const stopped=server.exitCode===null?once(server,"exit"):Promise.resolve();server.kill();await stopped;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
