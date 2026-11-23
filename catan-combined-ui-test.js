"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),http=require("node:http"),{once}=require("node:events"),{spawn}=require("node:child_process");
let pw;try{pw=require("playwright");}catch{pw=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright"));}
const E=require("./catan-engine"),A=require("./room-archive"),D=require("./catan-cities-data");
const maps=["cities-shores-1","cities-shores-2","cities-desert-1","cities-desert-2"];
function fixture({gold=false,mapId=maps[0],attacked=false,seaKnight=true}={}){
 let seed=19;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const g=E.createGame(["Test","Bot A","Bot B"],rng,mapId);
 while(g.phase.startsWith("setup")){
  const l=E.legal(g,g.current);
  if(g.phase==="setupSettlement"){
   const vertex=l.settlements.find(id=>g.board.vertices[id].edges.some(e=>g.board.edges[e].tiles.some(t=>g.board.tiles[t].resource<=-2)))??l.settlements[0];
   E.act(g,g.current,{type:"settlement",vertex},rng);
  }else E.act(g,g.current,l.ships.length?{type:"ship",edge:l.ships[0]}:{type:"road",edge:l.roads[0]},rng);
 }
 assert(g.cities&&g.board.islands);assert.equal(g.target,16);
 for(const p of g.players){const own=g.board.vertices.filter(v=>v.owner===p.id);assert.equal(own.filter(v=>v.level===1).length,1);assert.equal(own.filter(v=>v.level===2).length,1);assert.equal(p.resources.length,8);assert.equal(p.resources.slice(5).reduce((a,b)=>a+b,0),0);}
 g.current=0;g.phase="main";g.rolled=true;g.dice=[3,2];
 for(let r=0;r<8;r++){const n=10-g.players[0].resources[r];g.players[0].resources[r]+=n;g.bank[r]-=n;}
 if(seaKnight){
 let sea;
 const distances=g.board.vertices.map(()=>Infinity),queue=[];
 for(const v of g.board.vertices)if(v.tiles.length>=2&&v.tiles.every(t=>g.board.tiles[t].resource===-2)){distances[v.id]=0;queue.push(v.id);}
 while(queue.length){const id=queue.shift();for(const edgeId of g.board.vertices[id].edges){const e=g.board.edges[edgeId];if(e.owner>0||!e.tiles.some(t=>g.board.tiles[t].resource===-2))continue;const next=e.a===id?e.b:e.a;if(g.board.vertices[next].owner>0||distances[next]<=distances[id]+1)continue;distances[next]=distances[id]+1;queue.push(next);}}
 for(let i=0;i<8;i++){
  sea=g.board.vertices.find(v=>v.owner<0&&!v.knight&&v.tiles.length>=2&&v.tiles.every(t=>g.board.tiles[t].resource===-2)&&v.edges.some(e=>g.board.edges[e].owner===0&&g.board.edges[e].kind==="ship"));
  if(sea)break;
  const edges=E.legal(g,0).ships;if(!edges.length)break;
  const edge=edges.sort((a,b)=>Math.min(distances[g.board.edges[a].a],distances[g.board.edges[a].b])-Math.min(distances[g.board.edges[b].a],distances[g.board.edges[b].b]))[0];
  E.act(g,0,{type:"ship",edge},rng);
 }
 assert(sea,"fixture needs a sea intersection on an owned shipping route");
 E.act(g,0,{type:"ck",choice:`recruit:${sea.id}`},rng);
 }
 if(attacked){g.cities.attacked=true;g.board.robber=g.cities.thiefStart.robber;g.board.pirate=g.cities.thiefStart.pirate;}
 for(const key of ["roads","diplomacy"]){const deck=g.cities.decks[D.cards[key][0]],index=deck.indexOf(key);assert(index>=0);deck.splice(index,1);g.cities.players[0].cards.push({key,id:++g.cities.sequence});}
 if(gold){g.phase="gold";g.goldQueue=[{id:0,count:2}];g.goldResume="main";g.cities.productionBefore=g.players.map(p=>p.resources.reduce((a,b)=>a+b,0));}
 return A.encode("catan",{mapId:g.mapId,layout:"default",thieves:"both",maxPlayers:3,seats:g.players.map((p,i)=>({name:p.name,position:i})),game:g});
}
async function importRoom(page,archive){
 await page.fill("#name","Test");await page.evaluate(archive=>sock.send(JSON.stringify({type:"archiveImport",archive,name:"Test"})),archive);
 await page.locator('[data-archive-seat="0"]').waitFor();await page.click('[data-archive-seat="0"]');await page.waitForFunction(()=>window.room?.game);
 for(let i=0;i<5;i++)if(await page.locator("dialog[open]").count())await page.keyboard.press("Escape");
 await page.click("[data-room-manage]");
 while(await page.locator('[data-room-action="fillBot"]').count()){const n=await page.locator('[data-room-action="fillBot"]').count();await page.locator('[data-room-action="fillBot"]').first().click();await page.waitForFunction(n=>document.querySelectorAll('[data-room-action="fillBot"]').length<n,n);}
 await page.click('[data-room-action="archiveContinue"]');await page.waitForFunction(()=>!room.control.paused);await page.keyboard.press("Escape");
}
async function checkDialog(page,trigger,id,{combined=false}={}){
 const before=await page.evaluate(()=>[window.room?.game?.revision,window.sent.filter(x=>x.type==="action").length]);
 await page.locator(trigger).click();const dialog=page.locator(id);await dialog.waitFor({state:"visible"});
 const body=dialog.locator("[data-rules-body]");assert(await body.locator("li").count()>3);
 if(combined){assert.equal(await body.locator('[data-cities-rule="combined"]').count(),1);assert.match(await body.locator('[data-cities-rule="setup"]').innerText(),/16/);assert.doesNotMatch(await body.locator('[data-cities-rule="setup"]').innerText(),/13\s*(分|VP)/);}
 assert(await dialog.evaluate(d=>{const b=d.getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=innerWidth+1&&b.bottom<=innerHeight+1&&d.scrollWidth<=d.clientWidth+1;}));
 const top=await dialog.locator(".dialog-heading").evaluate(el=>el.getBoundingClientRect().top);
 await body.evaluate(el=>el.scrollTop=el.scrollHeight);assert.equal(await dialog.locator(".dialog-heading").evaluate(el=>el.getBoundingClientRect().top),top);
 await body.evaluate(el=>el.scrollTop=0);
 await page.screenshot({path:path.join(__dirname,"test-results",`catan-combined-${id.slice(1)}-${page.viewportSize().width}.png`)});
 await page.keyboard.press("Escape");assert(await dialog.isHidden());
 assert.deepEqual(await page.evaluate(()=>[window.room?.game?.revision,window.sent.filter(x=>x.type==="action").length]),before,"Reading rules never mutates the game");
}
async function main(){
 const probe=http.createServer();probe.listen(0,"127.0.0.1");await once(probe,"listening");const port=probe.address().port;await new Promise(r=>probe.close(r));
 const child=spawn(process.execPath,[require.resolve("./server")],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:"1",AUTO_OPEN:"0",CATAN_BOT_DELAY:"600000"},stdio:["ignore","pipe","pipe"]});
 let browser,logs="";child.stderr.on("data",c=>logs+=c);child.stdout.on("data",c=>logs+=c);const errors=[],base=`http://127.0.0.1:${port}`;
 try{
  let ready=false;for(let i=0;i<80;i++){try{ready=(await fetch(base+"/health")).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,100));}assert(ready,logs);
  browser=await pw.chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe"});fs.mkdirSync(path.join(__dirname,"test-results"),{recursive:true});
  async function pageAt(){const context=await browser.newContext({viewport:{width:1440,height:1100}});await context.addInitScript(()=>{localStorage.setItem("catan-music-enabled","false");window.sent=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.sock=this;this.addEventListener("message",e=>{const d=JSON.parse(e.data);if(d.type==="state")window.room=d;if(d.type==="error")window.serverError=d.message;});}send(data){window.sent.push(JSON.parse(data));super.send(data);}};});const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));page.on("response",r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});await page.goto(base+"/catan.html?edition=combined");await page.waitForFunction(()=>window.sock?.readyState===1);await page.locator("#previewBoard svg").waitFor();return page;}
  const setup=await pageAt();assert.match(await setup.locator('[data-edition="combined"]').getAttribute("class"),/selected/);assert.match(await setup.locator("#editionTitle").innerText(),/城市.*骑士.*航海|Cities.*Knights.*Seafarers/);assert(await setup.locator("#combinedSetupNote").isVisible());assert.match(await setup.locator("#combinedSetupNote").innerText(),/16/);
  assert.deepEqual(await setup.locator("#mapChoice option").evaluateAll(ns=>ns.map(n=>n.value)),maps);
  for(const map of maps)for(const layout of ["default","random"]){await setup.selectOption("#mapChoice",map);await setup.locator(`button[data-layout="${layout}"]`).click();await setup.waitForFunction(({map,layout})=>document.querySelector("#previewBoard").dataset.map===map&&document.querySelector("#previewBoard").dataset.layout===layout,{map,layout});assert.match(await setup.locator("#mapSummary").innerText(),/16/);}
  for(const width of [1440,320]){await setup.setViewportSize({width,height:width===1440?1100:844});assert(await setup.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await checkDialog(setup,"#baseRules","#citiesRules",{combined:true});await checkDialog(setup,"#seafarerRules","#sailingDialog");await checkDialog(setup,"#mapRules","#sailingDialog");await setup.screenshot({path:path.join(__dirname,"test-results",`catan-combined-setup-${width}.png`),fullPage:true});}
  await setup.click('[data-edition="seafarers"]');assert.equal(await setup.locator("#mapChoice option").count(),13);assert((await setup.locator("#mapChoice option").evaluateAll(ns=>ns.map(n=>n.value))).every(id=>!id.startsWith("cities-")));assert(await setup.locator("#combinedSetupNote").isHidden());
  await setup.click('[data-edition="cities"]');await setup.click("#baseRules");assert.equal(await setup.locator('[data-cities-rule="combined"]').count(),0);assert.match(await setup.locator('[data-cities-rule="setup"]').innerText(),/13/);await setup.keyboard.press("Escape");
  await setup.click('[data-edition="combined"]');await setup.selectOption("#mapChoice",maps[0]);await setup.click('button[data-layout="default"]');await setup.fill("#name","Test");await setup.click("#create");await setup.locator("#lobby").waitFor({state:"visible"});if(await setup.locator("dialog[open]").count())await setup.keyboard.press("Escape");await setup.click("#fillBots");await setup.waitForFunction(()=>room.seats.length===3);await setup.click("#start");await setup.waitForFunction(()=>room.game?.phase==="setupSettlement");
  assert.deepEqual(await setup.evaluate(()=>[room.game.target,!!room.game.board.islands,!!room.game.citiesKnights,room.game.players[room.you].resources.length]),[16,true,true,8]);
  const page=await pageAt();await importRoom(page,fixture());await page.locator("#citiesPanel").waitFor();assert.equal(await page.locator("#bank .bank-item").count(),8);assert(await page.locator('[data-action="ship"]').isEnabled());assert(await page.locator('[data-action="city"]').isEnabled());assert.equal(await page.locator('[data-action="buyDevelopment"]').count(),0);
  assert.match(await page.locator('[data-action="improve1"]').innerText(),/贸易升级/);assert.match(await page.locator('[data-action="trade"]').innerText(),/资源交易/);
  const seaKnights=await page.evaluate(()=>room.game.board.vertices.filter(v=>v.knight&&v.tiles.every(t=>room.game.board.tiles[t].resource===-2)).length);assert(seaKnights>=1);assert(await page.locator('#board [data-cities-info="knight"]').count()>=seaKnights);
  assert.match(await page.locator("#citiesFleet").innerText(),/首次入侵前.*海盗/);
  for(const width of [1440,320]){await page.setViewportSize({width,height:width===1440?1100:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await checkDialog(page,"#gameBaseRules","#citiesRules",{combined:true});await checkDialog(page,"#gameSailingRules","#sailingDialog");await page.screenshot({path:path.join(__dirname,"test-results",`catan-combined-game-${width}.png`),fullPage:true});}
  const beforeCities=await page.evaluate(()=>room.game.board.vertices.filter(v=>v.owner===room.you&&v.level===2).length);await page.click('[data-action="city"]');await page.locator('#board .board-target[data-vertex]').first().click();await page.waitForFunction(n=>room.game.board.vertices.filter(v=>v.owner===room.you&&v.level===2).length===n+1,beforeCities);
  const beforeShips=await page.evaluate(()=>room.game.board.edges.filter(e=>e.owner===room.you&&e.kind==="ship").length);await page.click('[data-action="ship"]');await page.locator('#board .board-target[data-edge]').first().click();await page.waitForFunction(n=>room.game.board.edges.filter(e=>e.owner===room.you&&e.kind==="ship").length===n+1,beforeShips);
  await page.reload();await page.waitForFunction(()=>room?.game?.mapId==="cities-shores-1");assert.equal(await page.evaluate(()=>room.game.target),16);await checkDialog(page,"#gameBaseRules","#citiesRules",{combined:true});
  const gold=await pageAt();await importRoom(gold,fixture({gold:true}));await gold.waitForFunction(()=>room.game.phase==="gold");if(!await gold.locator("#resourceDialog").isVisible())await gold.click("#chooseGold");assert.equal(await gold.locator("#resourceSupply [data-add-resource]").count(),5);assert.deepEqual(await gold.locator("#resourceSupply [data-add-resource]").evaluateAll(ns=>ns.map(n=>Number(n.dataset.addResource))),[0,1,2,3,4]);
  await gold.setViewportSize({width:320,height:844});assert(await gold.locator("#resourceDialog").evaluate(d=>d.scrollWidth<=d.clientWidth+1));await gold.locator('[data-add-resource="0"]').click();await gold.locator('[data-add-resource="1"]').click();await gold.click("#confirmResources");await gold.waitForFunction(()=>room.game.phase==="main");assert.equal(await gold.evaluate(()=>room.game.players[room.you].resources.length),8);
  for(const attacked of [false,true]){
   const desert=await pageAt();await importRoom(desert,fixture({mapId:maps[2],attacked,seaKnight:false}));
   assert(await desert.evaluate(()=>!!room.game.board.pirateStart),"Desert uses the off-board pirate starting position");
   assert.equal(await desert.locator("#board .pirate-piece").count(),attacked?1:0,"Pirate appears only after the first invasion");
   await desert.click("#gameMapRules");await desert.locator("#sailingDialog").waitFor({state:"visible"});
   assert.equal(await desert.locator("#sailingDialog .pirate-piece").count(),attacked?1:0,"Rules board preview also respects the first invasion");await desert.keyboard.press("Escape");
  }
  assert.deepEqual(errors,[]);console.log("Combined mode browser checks passed: four recommended maps/default+random, old modes, creation, city+ship setup/action, sea knights, eight materials, five gold choices, 16 VP rules, private saves/reload, desktop/mobile and no rule-reading actions.");
 }finally{await browser?.close();const ended=once(child,"exit");child.kill();await ended;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
