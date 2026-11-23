"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test');
const A=require('./room-archive'),D=require('./catan-cities-data');
async function measureDialogs(page){
 return page.evaluate(async()=>{
  const frames=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))),times=[];
  for(let i=0;i<8;i++){
   const start=performance.now();
   CatanCitiesUI.showInfo('merchant');
   await frames();times.push(performance.now()-start);
   document.querySelector('.cities-dialog[open]').close();await frames();
  }
  return {max:Math.round(Math.max(...times)),average:Math.round(times.reduce((a,b)=>a+b)/times.length)};
 });
}
async function checkHelp(page,source){
 const before=await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]);
 await page.locator(source).click();const dialog=page.locator('#citiesInfoDialog[open]');await dialog.waitFor();
 assert.match(await dialog.textContent(),/Merchant card/);assert.match(await dialog.textContent(),/2:1/);
 assert.equal(await dialog.locator('[data-play]').count(),0);
 assert.equal(await dialog.evaluate(d=>getComputedStyle(d,'::backdrop').backdropFilter),'none');
 assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1;}));
 await page.screenshot({path:path.join(__dirname,`test-results/catan-merchant-help-${page.viewportSize().width}.png`)});
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]),before);
}
const merchantCards=page=>page.locator('#citiesPanel [data-card="merchant"]');
const cardDialog=page=>page.locator('dialog.cities-dialog:has([data-play])');
async function checkCardHelp(page,playable){
 const before=await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]);
 const card=merchantCards(page).first();assert(await card.isEnabled());await card.click();
 const dialog=cardDialog(page);await dialog.waitFor({state:'visible'});
 assert.match(await dialog.locator('h2').textContent(),/商人.*Merchant/);
 assert.match(await dialog.locator('.cities-confirm-details').textContent(),/2:1/);
 assert.equal(await dialog.locator('[data-play]').isEnabled(),playable);
 assert(await dialog.locator('.cities-info-list > li').count()>=2);
 assert(await dialog.evaluate(dialog=>{const r=dialog.getBoundingClientRect(),close=dialog.querySelector('[data-close]').getBoundingClientRect();return dialog.scrollWidth<=dialog.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&close.bottom<=innerHeight;}));
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]),before,'viewing or cancelling Merchant never consumes it');
}
async function checkPlacement(context,port,errors){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 const saved=A.decode(fixture(),['catan']).room,g=saved.game,deck=g.cities.decks[D.cards.merchant[0]];
 deck.splice(deck.indexOf('merchant'),1);g.cities.players[0].cards.push({key:'merchant',id:++g.cities.sequence});g.cities.merchant.owner=1;
 await importRoom(page,A.encode('catan',saved));
 const resources=await page.evaluate(()=>room.game.players.map(p=>p.resources));
 const scores=await page.evaluate(()=>room.game.players.map(p=>p.score));
 for(const [index,width] of [1600,320].entries()){
  await page.setViewportSize({width,height:900});assert.equal(await merchantCards(page).count(),2-index);
  assert.equal(await page.locator('#actions [data-action="merchant"]').count(),0,'Merchant belongs in the progress hand, not the build controls');
  const card=merchantCards(page).first();assert(await card.isEnabled());
  assert.equal(await card.locator('use[href="catan-progress-art.svg#merchant"]').count(),1);
  assert.match(await card.textContent(),/贸易|Trade/);
  assert(await card.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1;}),'merchant card must fit the hand');
  await page.locator('.cities-progress').screenshot({path:path.join(__dirname,`test-results/catan-merchant-hand-${width}.png`)});
  await checkCardHelp(page,true);
  const before=await page.evaluate(()=>actionRequests.length);
  await card.click();assert.equal(await page.evaluate(()=>actionRequests.length),before,'opening the hand card only shows its description');
  await cardDialog(page).locator('[data-play]').evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='merchant');
  assert.equal(await page.evaluate(()=>actionRequests.length),before+1);assert.equal(await page.locator('.cities-dialog[open]').count(),0);
  assert.equal(await page.evaluate(()=>room.game.citiesKnights.players[0].cards.filter(c=>c.key==='merchant').length),1-index);
  assert.equal(await merchantCards(page).count(),1-index);
  assert.match(await page.locator('#turnPrompt').textContent(),/Choose a hex beside your building/);
  if(index===0){
   await checkCardHelp(page,false);
   await merchantCards(page).first().click();await cardDialog(page).locator('[data-play]').evaluate(button=>button.click());
   assert.equal(await page.evaluate(()=>actionRequests.length),before+1,'cannot play another Merchant while choosing its hex');await page.keyboard.press('Escape');
  }
  await checkHelp(page,'#board [data-cities-info="merchant"]');
  const targets=page.locator('#board [data-ck-choice^="tile:"]');assert(await targets.count()>0);
  const target=targets.nth(index),tile=Number((await target.getAttribute('data-ck-choice')).split(':')[1]);
  if(width===320)await target.press('Enter');else await target.evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  await page.waitForFunction(()=>room.game.phase==='main');
  assert.equal(await page.evaluate(()=>actionRequests.length),before+2);assert.equal(await page.locator('.cities-dialog[open]').count(),0);
  assert.deepEqual(await page.evaluate(()=>room.game.citiesKnights.merchant),{owner:0,tile});
  assert.deepEqual(await page.evaluate(()=>room.game.players.map(p=>p.resources)),resources);
  assert.deepEqual(await page.evaluate(()=>room.game.players.map(p=>p.score)),[scores[0]+1,scores[1]-1,scores[2]]);
  assert.equal(await page.locator('#board [data-ck-choice]').count(),0);
 }
 assert.equal(await merchantCards(page).count(),0);assert.equal(await page.locator('#actions [data-action="merchant"]').count(),0);
 await checkHelp(page,'#board [data-cities-info="merchant"]');assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log('Merchant: hand-only cards, confirmation, read-only pre-roll/while placing, two-card inventory, no double spending, desktop/mobile OK');
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let browser,backend='';server.stderr.on('data',c=>backend+=c);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:2});
  await context.addInitScript(()=>{
   localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];
   const Native=WebSocket;window.WebSocket=class extends Native{
    constructor(...args){super(...args);window.sock=this;this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.room=d;if(d.type==='error')window.serverError=d.message;});}
    send(data){const d=JSON.parse(data);if(d.type==='action')actionRequests.push(d.action);super.send(data);}
   };
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
  await importRoom(page,fixture(false,false,{rolled:false}));
  const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const timing=await measureDialogs(page);console.log('Merchant info timing (ms, 4x CPU, 2x pixels)',timing);
  assert(timing.max<1000,'merchant help must not stall the main thread');
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  assert.equal(await page.locator('#actions [data-action="merchant"],#actions .cities-action-info[data-cities-info="merchant"]').count(),0);
  assert.equal(await merchantCards(page).count(),1);
  for(const width of [1600,390,320]){
   await page.setViewportSize({width,height:900});await checkCardHelp(page,false);await checkHelp(page,'#board [data-cities-info="merchant"]');
  }
  await checkPlacement(context,port,errors);
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.serverError||''),'');assert.equal(backend,'');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
