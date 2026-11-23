"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test');
const A=require('./room-archive'),D=require('./catan-cities-data');
const specialCards=['printing','constitution'];
const ordinaryCards=Object.keys(D.cards).filter(key=>!specialCards.includes(key));
const orderedCards=['alchemy','irrigation',...ordinaryCards.filter(key=>!['alchemy','irrigation'].includes(key))];
const packs=Array.from({length:Math.ceil(orderedCards.length/4)},(_,i)=>orderedCards.slice(i*4,i*4+4));
function cardFixture(keys,rolled){
 const saved=A.decode(fixture(false,false,{rolled}),['catan']).room,g=saved.game;
 for(const card of g.cities.players[0].cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 for(const key of keys){
  const deck=g.cities.decks[D.cards[key][0]],index=deck.indexOf(key);assert(index>=0,key);deck.splice(index,1);
  if(['printing','constitution'].includes(key))g.cities.players[0].revealed.push(key);
  else g.cities.players[0].cards.push({key,id:++g.cities.sequence});
 }
 assert(g.cities.players[0].cards.length<=4,'regression fixture must respect the progress-card hand limit');
 return A.encode('catan',saved);
}
const cardDialog=page=>page.locator('dialog.cities-dialog:has([data-play])');
const snapshot=page=>page.evaluate(()=>({game:JSON.stringify(room.game),requests:actionRequests.length}));
async function openRoom(context,port,keys,rolled,errors){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 await importRoom(page,cardFixture(keys,rolled));return page;
}
async function closeDialog(page,dialog,method){
 if(method==='Escape')await page.keyboard.press('Escape');
 else if(method==='tap')await dialog.locator('.dialog-heading [data-close]').tap();
 else await dialog.locator('.dialog-heading [data-close]').click();
 assert.equal(await dialog.evaluate(d=>d.open),false,`${method} must close the dialog`);
}
async function checkCard(page,key,method){
 const before=await snapshot(page);
 const playable=await page.evaluate(key=>{
  const card=room.game.citiesKnights.players[room.you].cards.find(card=>card.key===key);
  return room.game.legal.citiesKnights.some(option=>option.key===`play:${card.id}`);
 },key);
 await page.locator(`[data-card="${key}"]`).click();const dialog=cardDialog(page);await dialog.waitFor({state:'visible'});
 assert.equal(await dialog.locator('h2').textContent(),D.cards[key].slice(2,4).join(' / '));
 assert.equal(await dialog.locator('[data-play]').isEnabled(),playable,`${key} availability must match the engine`);
 const body=dialog.locator('.cities-confirm-details'),bullets=body.locator('.cities-info-list > li');
 assert(await body.isVisible(),`${key} explanation is visible`);assert(await bullets.count()>=1,`${key} uses bullet points`);
 assert(await bullets.evaluateAll(items=>items.every(item=>item.querySelector('strong')&&item.querySelector('small')?.textContent.trim())),`${key} bullets are bilingual`);
 const closeTop=await dialog.locator('[data-close]').evaluate(el=>el.getBoundingClientRect().top);
 await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});assert(await body.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<=2),`${key}: last bullet is reachable`);
 assert.equal(await dialog.locator('[data-close]').evaluate(el=>el.getBoundingClientRect().top),closeTop,`${key}: close button stays visible while scrolling`);

 assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),`${key} dialog must fit the viewport`);
 await closeDialog(page,dialog,method);
 assert.deepEqual(await snapshot(page),before,`${key}: cancelling must not consume a card, send an action or change the game`);
}
async function checkRapidSwitch(context,port,width,rolled,errors){
 const page=await openRoom(context,port,['alchemy','irrigation'],rolled,errors),before=await snapshot(page);
 const playable=rolled?'irrigation':'alchemy',readOnly=rolled?'alchemy':'irrigation';
 const switched=await page.evaluate(async({playable,readOnly})=>{
  const card=key=>document.querySelector(`[data-card="${key}"]`),dialog=document.querySelector('dialog.cities-dialog:has([data-play])');
  card(playable).click();dialog.querySelector('[data-close]').click();card(readOnly).click();
  const immediate=dialog.querySelector('[data-play]').disabled;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return{immediate,settled:dialog.querySelector('[data-play]').disabled,handlerCleared:dialog.querySelector('[data-play]').onclick===null,open:dialog.open};
 },{playable,readOnly});
 assert.deepEqual(switched,{immediate:true,settled:true,handlerCleared:true,open:true},'a late close event must not enable the newly opened unavailable card');
 await cardDialog(page).locator('[data-play]').evaluate(b=>b.click());assert.deepEqual(await snapshot(page),before,'unavailable card must never submit a previous card handler');
 const enabled=await page.evaluate(playable=>{
  const dialog=document.querySelector('dialog.cities-dialog:has([data-play])');dialog.querySelector('[data-close]').click();document.querySelector(`[data-card="${playable}"]`).click();return !dialog.querySelector('[data-play]').disabled;
 },playable);
 assert.equal(enabled,true,'opening a playable card must immediately reset its disabled state');
 await closeDialog(page,cardDialog(page),width===320?'tap':'click');assert.deepEqual(await snapshot(page),before);
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();console.log(`Rapid card switching: ${width}px ${rolled?'main':'roll'} phase old close events cannot enable a read-only card or retain an old Play action`);
}
async function checkMatrix(context,port,width,rolled,errors){
 const tested=[];
 for(const keys of packs){
  const page=await openRoom(context,port,keys,rolled,errors);
  for(const key of keys){
   for(let cycle=0;cycle<2;cycle++)for(const method of [width===320?'tap':'click','Escape'])await checkCard(page,key,method);
   tested.push(key);
  }
  if(keys.includes('irrigation')){
   await page.locator('[data-card="irrigation"]').click();await cardDialog(page).screenshot({path:path.join(__dirname,`test-results/catan-irrigation-${rolled?'main':'roll'}-${width}.png`)});await closeDialog(page,cardDialog(page),width===320?'tap':'click');
   const before=await page.evaluate(()=>({requests:actionRequests.length,turn:room.game.turn,current:room.game.current}));
   await page.locator(`#actions [data-action="${rolled?'end':'roll'}"]`).click();
   if(rolled)await page.waitForFunction(before=>room.game.turn>before.turn&&room.game.current!==before.current,before);
   else await page.waitForFunction(()=>room.game.dice.length===2&&room.game.phase!=='roll');
   assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+1,'normal play must resume after viewing Irrigation');
  }
  assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 }
 assert.deepEqual(tested.slice().sort(),ordinaryCards.slice().sort());
 console.log(`Progress cards: ${tested.length} types, ${rolled?'main':'roll'} phase, ${width}px, two pointer/Escape cycles each; state and inventory unchanged`);
}
async function checkSpecialCards(context,port,width,rolled,errors){
 const page=await openRoom(context,port,specialCards,rolled,errors),before=await snapshot(page);
 assert.equal(await page.locator('[data-card="printing"],[data-card="constitution"]').count(),0,'VP cards are revealed immediately');
 for(let cycle=0;cycle<2;cycle++)for(const method of [width===320?'tap':'click','Escape']){
  await page.locator('#board [data-cities-info="merchant"]').click();const dialog=page.locator('#citiesInfoDialog');await dialog.waitFor({state:'visible'});
  assert.match(await dialog.textContent(),/Merchant/);assert.equal(await dialog.locator('[data-play]').count(),0);await closeDialog(page,dialog,method);assert.deepEqual(await snapshot(page),before);
  await page.locator('#gameBaseRules').click();const rules=page.locator('#citiesRules');await rules.waitFor({state:'visible'});
  for(const key of ['printing','constitution']){
   const entry=rules.locator('.cities-rule-cards [data-progress-card]').filter({has:page.locator('h4',{hasText:D.cards[key][3]})});
   assert.equal(await entry.count(),1);assert.match(await entry.textContent(),/1 VP/);assert(await entry.locator('ul.cities-info-list > li').count()>=1);await entry.scrollIntoViewIfNeeded();
  }
  await closeDialog(page,rules,method);assert.deepEqual(await snapshot(page),before);
 }
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log(`Special cards: Merchant help, Printing/Constitution rules, ${rolled?'main':'roll'} phase, ${width}px close without changing state`);
}
async function main(){
 assert.equal(ordinaryCards.length+specialCards.length,Object.keys(D.cards).length);
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let browser,backend='';server.stderr.on('data',chunk=>backend+=chunk);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  for(const width of [1440,320]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});
   await context.addInitScript(()=>{
    localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];
    const Native=WebSocket;window.WebSocket=class extends Native{
     constructor(...args){super(...args);window.sock=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.room=data;if(data.type==='error')window.serverError=data.message;});}
     send(data){const message=JSON.parse(data);if(message.type==='action')actionRequests.push(message.action);super.send(data);}
    };
   });
   for(const rolled of [false,true])await checkRapidSwitch(context,port,width,rolled,errors);
   for(const rolled of [false,true]){await checkMatrix(context,port,width,rolled,errors);await checkSpecialCards(context,port,width,rolled,errors);}
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log(`All ${Object.keys(D.cards).length} progress-card types passed desktop/mobile before/after-roll dialog regressions`);
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
