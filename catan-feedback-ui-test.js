"use strict";
const assert=require("node:assert/strict"), fs=require("node:fs"), path=require("node:path"), http=require("node:http");
const {once}=require("node:events"), E=require("./catan-engine"), {attachCatan}=require("./catan-server");
let playwright; try { playwright=require("playwright"); } catch { playwright=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY="600000";
let catan;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/api/catan-preview") { res.setHeader("Content-Type","application/json"); res.end(JSON.stringify(catan.previews.get(url.searchParams.get("map")||"base"))); return; }
  const file=path.join(__dirname,url.pathname);
  if(!fs.existsSync(file)||!fs.statSync(file).isFile()) { res.writeHead(404);res.end();return; }
  res.setHeader("Content-Type",({".html":"text/html",".css":"text/css",".js":"text/javascript",".svg":"image/svg+xml"})[path.extname(file)]||"text/plain"); fs.createReadStream(file).pipe(res);
});
catan=attachCatan(server); server.on("upgrade",(req,socket,head)=>catan.upgrade(req,socket,head));
(async()=>{
  let browser;
  try {
    server.listen(0,"127.0.0.1");await once(server,"listening");
    browser=await playwright.chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
    fs.mkdirSync("test-results",{recursive:true});
    const contexts=[], pages=[], errors=[];
    for(let n=0;n<2;n++) {
      const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}); contexts.push(context);
      await context.addInitScript(()=>{
        const Native=window.WebSocket;
        window.WebSocket=class extends Native { constructor(...args) { super(...args);window.testSocket=this;this.addEventListener("message",e=>{const m=JSON.parse(e.data);if(m.type==="state")window.testState=m;}); } };
        let api;
        Object.defineProperty(window,"CatanAudio",{get:()=>api,set(value){
          api=value;const create=api.create;
          api.create=()=>{const player=create(),play=player.play;window.testAudio=player;window.testSounds=[];player.play=kind=>{const audible=play(kind);window.testSounds.push({kind,audible});return audible;};return player;};
        }});
      });
      const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));pages.push(page);
      await page.goto(`http://127.0.0.1:${server.address().port}/catan.html?edition=seafarers`);
      await page.waitForFunction(()=>window.testSocket?.readyState===1);
      assert.equal(await page.locator("dialog[open]").count(),0);
      assert.equal(await page.locator("#soundToggle svg").count(),1);
    }
    const [host,guest]=pages;
    const send=(page,data)=>page.evaluate(data=>testSocket.send(JSON.stringify(data)),data);
    await send(host,{type:"create",name:"Captain",seats:3,mapId:"shores-1"});await host.locator("#lobby").waitFor();
    const code=await host.locator("#copyCode").textContent();
    await send(guest,{type:"join",name:"Reader",code});await guest.locator("#lobby").waitFor();
    await send(host,{type:"fillBots"});await host.waitForFunction(()=>testState.seats.length===3);
    await send(host,{type:"start"});await host.locator("#game").waitFor();
    const room=catan.rooms.get(code),g=room.game;clearTimeout(room.timer);
    while(!g.turn) {const id=g.phase==="gold"?g.goldQueue[0].id:g.current;E.act(g,id,E.chooseBotAction(g,id));}
    g.phase="main";g.current=0;g.rolled=true;g.players.forEach(p=>{p.resources=[3,3,3,3,3];});g.bank=[10,10,10,10,10];
    async function sync() { const revision=++g.revision;await send(host,{type:"chat",text:""});for(const p of pages)await p.waitForFunction(r=>testState.game.revision===r,revision); }
    await sync();
    // User gestures unlock audio. Never auto-play a history backlog on first load.
    await guest.bringToFront();await guest.locator("#helpButton").click();await guest.locator("#sailingAcknowledge").click();
    await guest.waitForTimeout(150);await guest.evaluate(()=>{testSounds=[];});
    const count=(p,kind)=>p.evaluate(kind=>testSounds.filter(s=>s.kind===kind).length,kind);
    async function offer(to=null) { const old=g.revision;await send(host,{type:"action",action:{type:"offerTrade",give:[1,0,0,0,0],want:[0,1,0,0,0],to}});await guest.waitForFunction(r=>testState.game.revision>r,old); }
    await offer(1);await guest.locator("#incomingTradeAlert").waitFor();
    assert.equal(await count(guest,"trade"),1);assert.equal(await count(host,"trade"),0,"Offer sender is not notified");
    assert.equal(await guest.evaluate(()=>testSounds.find(s=>s.kind==="trade").audible),true,"Unlocked trade chime plays");
    assert.equal(await guest.locator("#tradeOffer").evaluate(el=>el.classList.contains("incoming-offer")),true);
    await send(host,{type:"chat",text:"Still the same offer"});await guest.waitForFunction(()=>testState.chat.at(-1)?.text==="Still the same offer");
    assert.equal(await count(guest,"trade"),1,"Chat and unchanged state do not replay the alert");
    for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]) {
      await guest.setViewportSize({width,height});await guest.evaluate(()=>scrollTo(0,0));
      assert.equal(await guest.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No overflow at ${width}px`);
      assert.equal(await guest.locator("#incomingTradeAlert").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight&&r.height<120&&el.scrollWidth<=el.clientWidth;}),true);
      assert.equal(await guest.locator(".island-header").evaluate(el=>{
        const boxes=[...el.children].map(el=>el.getBoundingClientRect());
        return boxes.every((r,i)=>r.left>=0&&r.right<=innerWidth&&boxes.every((b,j)=>i===j||r.right<=b.left+1||b.right<=r.left+1));
      }),true,"Header controls do not overlap");
      await guest.screenshot({path:`test-results/catan-trade-alert-${width}.png`,animations:"disabled"});
    }
    await guest.setViewportSize({width:390,height:844});await guest.locator("#viewIncomingTrade").click();
    assert.equal(await guest.locator("#incomingTradeAlert").isVisible(),false);
    assert.equal(await guest.locator("#tradeOffer").evaluate(el=>document.activeElement===el),true);
    await guest.locator('[data-offer="rejectTrade"]').click();await guest.waitForFunction(()=>testState.game.trade.rejected.includes(1));
    assert.equal(await guest.locator("#incomingTradeAlert").isVisible(),false);
    await offer(2);assert.equal(await guest.locator("#incomingTradeAlert").isVisible(),false);assert.equal(await count(guest,"trade"),1);
    await offer();await guest.locator("#incomingTradeAlert").waitFor();assert.equal(await count(guest,"trade"),2);
    // Mute applies to both semantic effects and quiet button clicks, and persists after reload.
    await guest.locator("#soundToggle").click();assert.equal(await guest.locator("#soundToggle").getAttribute("aria-pressed"),"false");
    await offer(1);assert.equal(await guest.evaluate(()=>testSounds.filter(s=>s.kind==="trade").at(-1).audible),false);
    await guest.reload();await guest.locator("#game").waitFor();await guest.locator("#incomingTradeAlert").waitFor();
    assert.equal(await guest.locator("#soundToggle").getAttribute("aria-pressed"),"false");assert.equal(await count(guest,"trade"),0,"Reconnecting does not replay old chimes");
    await guest.locator("#soundToggle").click();await guest.waitForTimeout(100);await offer(1);
    assert.equal(await guest.evaluate(()=>testSounds.filter(s=>s.kind==="trade").at(-1).audible),true);
    await guest.locator("#viewIncomingTrade").click();await guest.locator('[data-offer="acceptTrade"]').click();
    await guest.waitForFunction(()=>!testState.game.trade);assert.equal(await count(guest,"exchange"),1);
    assert.equal(await guest.locator("#incomingTradeAlert").isVisible(),false);
    // A real winning action is heard once; rereading the resulting state is silent.
    g.phase="gold";g.goldResume="main";g.goldQueue=[{id:1,count:2},{id:0,count:1}];await sync();
    await guest.locator("#goldChoiceAlert").waitFor();
    assert.equal(await host.locator("#goldChoiceAlert").isVisible(),false);
    assert.equal(await count(guest,"gold"),1);assert.equal(await count(host,"gold"),0);
    assert.equal(await guest.evaluate(()=>testSounds.find(s=>s.kind==="gold").audible),true);
    await sync();assert.equal(await count(guest,"gold"),1,"Repeated states never replay gold chimes");
    for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]) {
      await guest.setViewportSize({width,height});await guest.evaluate(()=>scrollTo(0,0));
      assert.equal(await guest.locator("#goldChoiceAlert").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&el.scrollWidth<=el.clientWidth;}),true);
      assert.equal(await guest.locator('.gold-choice-button').evaluate(el=>el.getBoundingClientRect().height<100&&el.scrollWidth<=el.clientWidth&&el.querySelector('svg').getBoundingClientRect().width===32),true,"Gold action stays compact with a small illustration");
      await guest.screenshot({path:`test-results/catan-gold-alert-${width}.png`,animations:"disabled"});
    }
    await guest.setViewportSize({width:390,height:844});await guest.locator("#chooseGold").click();
    await guest.locator("#resourceDialog").waitFor();assert.equal(await guest.locator("#goldChoiceAlert").isVisible(),false);
    await guest.locator('[data-close="resourceDialog"]').click();await guest.locator("#goldChoiceAlert").waitFor();
    await guest.reload();await guest.locator("#goldChoiceAlert").waitFor();assert.equal(await count(guest,"gold"),0,"Reconnect displays pending choices without replaying old sound");
    await guest.locator("#chooseGold").click();
    await guest.locator('[data-add-resource="0"]').click();await guest.locator('[data-add-resource="1"]').click();
    await guest.locator("#confirmResources").click();await host.locator("#goldChoiceAlert").waitFor();
    assert.equal(await count(host,"gold"),1,"Next recipient is notified, even without rolling the dice");
    assert.equal(await guest.locator("#goldChoiceAlert").isVisible(),false);
    await host.locator("#chooseGold").click();await host.locator('[data-add-resource="2"]').click();await host.locator("#confirmResources").click();
    await guest.waitForFunction(()=>testState.game.phase==="main");
    await guest.locator("#soundToggle").click();
    g.phase="gold";g.goldQueue=[{id:1,count:1}];await sync();
    assert.equal(await guest.evaluate(()=>testSounds.filter(s=>s.kind==="gold").at(-1).audible),false,"Gold obeys mute");
    await guest.locator("#chooseGold").click();await guest.locator('[data-add-resource="0"]').click();await guest.locator("#confirmResources").click();
    await guest.waitForFunction(()=>testState.game.phase==="main");await guest.locator("#soundToggle").click();
    // Full piece supplies stay clickable for an explanation, never for an illegal build.
    const originalBoard=structuredClone(g.board), originalTarget=g.target;g.target=99;
    g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});g.board.edges.forEach(e=>{e.owner=-1;});
    g.board.vertices.slice(0,5).forEach(v=>{v.owner=0;v.level=1;});g.board.vertices.slice(5,9).forEach(v=>{v.owner=0;v.level=2;});
    g.board.edges.slice(0,15).forEach(e=>{e.owner=0;e.kind="road";});g.board.edges.slice(15,30).forEach(e=>{e.owner=0;e.kind="ship";});
    await sync();const cappedRevision=g.revision;
    for(const [type,reason] of [["settlement","All 5 settlements"],["city","All 4 cities"],["road","All 15 roads"],["ship","All 15 ships"]]) {
      await host.locator(`[data-action="${type}"]`).click();await host.locator("#buildNotice").waitFor();
      assert.ok((await host.locator("#buildNotice").textContent()).includes(reason));assert.equal(g.revision,cappedRevision);
      assert.equal(await host.locator("#buildNotice").evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight+1&&el.scrollWidth<=el.clientWidth;}),true);
    }
    await host.locator('[data-action="settlement"]').focus();await host.keyboard.press("Enter");
    assert.ok((await host.locator("#buildNotice").textContent()).includes("All 5 settlements"));
    await host.screenshot({path:"test-results/catan-build-limit-390.png",animations:"disabled"});
    g.board=originalBoard;g.target=originalTarget;await sync();assert.equal(await host.locator("#buildNotice").isVisible(),false);
    g.phase="roll";g.rolled=false;g.target=2;await sync();
    await send(host,{type:"action",action:{type:"roll"}});await guest.locator("#victory").waitFor();
    assert.equal(await count(guest,"victory"),1);await sync();assert.equal(await count(guest,"victory"),1);
    // Render every recipe offline and measure non-silence, clipping and distinct waveforms.
    const rendered=await guest.evaluate(async()=>{
      const stats=[];
      for(const [kind,duration] of Object.entries(CatanAudio.durations)) {
        const ctx=new OfflineAudioContext(1,Math.ceil((duration+.08)*44100),44100);
        CatanAudio.synthesize(ctx,ctx.destination,kind,0);const buffer=await ctx.startRendering(),data=buffer.getChannelData(0);
        let peak=0,energy=0,hash=0;
        for(let i=0;i<data.length;i++){peak=Math.max(peak,Math.abs(data[i]));energy+=data[i]*data[i];hash=(Math.imul(hash,31)+Math.round(data[i]*100000))|0;}
        stats.push({kind,peak,rms:Math.sqrt(energy/data.length),hash,duration});
      }
      return stats;
    });
    for(const s of rendered) {assert.ok(s.rms>.001,`${s.kind} is audible`);assert.ok(s.peak<.98&&Number.isFinite(s.peak),`${s.kind} does not clip`);}
    assert.equal(new Set(rendered.map(s=>s.hash)).size,rendered.length,"Every sound has a distinct waveform");
    fs.writeFileSync("test-results/catan-audio-measurements.json",JSON.stringify(rendered,null,2));
    await guest.emulateMedia({reducedMotion:"reduce"});
    assert.equal(await guest.locator("#incomingTradeAlert").evaluate(el=>getComputedStyle(el).animationName),"none");
    assert.deepEqual(errors,[]);console.log("PASS trade/gold targeting, mobile alerts, building limit explanations, sound delivery, mute, reconnect deduplication, victory, and 17 distinct non-clipping audio recipes");
    for(const context of contexts)await context.close();
  } finally { await browser?.close();for(const room of catan.rooms.values())clearTimeout(room.timer);server.close();server.emit("close"); }
})().catch(error=>{console.error(error);process.exitCode=1;});
