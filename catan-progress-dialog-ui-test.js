"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test');
const A=require('./room-archive'),D=require('./catan-cities-data');
const specialCards=['printing','constitution'];
const ordinaryCards=Object.keys(D.cards).filter(key=>!specialCards.includes(key));
const orderedCards=['alchemy','irrigation',...ordinaryCards.filter(key=>!['alchemy','irrigation'].includes(key))];
const packs=Array.from({length:Math.ceil(orderedCards.length/4)},(_,i)=>orderedCards.slice(i*4,i*4+4));
function cardFixture(keys,rolled,{outsideTurn=false,walledCities=false,rollToReady=false}={}){
 const saved=A.decode(fixture(false,false,{rolled}),['catan']).room,g=saved.game;
 for(const card of g.cities.players[0].cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 for(const key of keys){
  const deck=g.cities.decks[D.cards[key][0]],index=deck.indexOf(key);assert(index>=0,key);deck.splice(index,1);
  if(['printing','constitution'].includes(key))g.cities.players[0].revealed.push(key);
  else g.cities.players[0].cards.push({key,id:++g.cities.sequence});
 }
 if(outsideTurn)g.current=1;
 if(walledCities)g.board.vertices.filter(v=>v.owner===0&&v.level===2).forEach(v=>v.wall=true);
 if(rollToReady){g.cities.alchemy=[1,2];g.cities.players.slice(1).forEach(p=>p.levels[0]=0);g.board.vertices.filter(v=>v.metropolis===0&&v.owner!==0).forEach(v=>delete v.metropolis);}
 assert(g.cities.players[0].cards.length<=4,'regression fixture must respect the progress-card hand limit');
 return A.encode('catan',saved);
}
const cardDialog=page=>page.locator('#citiesConfirm');
const infoDialog=page=>page.locator('#citiesCardInfoDialog');
const activeCardDialog=page=>page.locator('#citiesConfirm[open],#citiesCardInfoDialog[open]');
const snapshot=page=>page.evaluate(()=>({game:JSON.stringify(room.game),requests:actionRequests.length}));
async function openRoom(context,port,keys,rolled,errors,options={}){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);try{await page.waitForFunction(()=>window.sock?.readyState===1);}catch(error){console.error('Page startup diagnostics',keys,rolled,errors,await page.evaluate(()=>({socket:window.sock?.readyState,connection:document.querySelector('#connection')?.textContent})));throw error;}
 await importRoom(page,cardFixture(keys,rolled,options));return page;
}
async function closeDialog(page,dialog,method){
 const element=await dialog.elementHandle();
 if(method==='Escape')await page.keyboard.press('Escape');
 else if(method==='tap')await dialog.locator('.dialog-heading [data-close]').tap();
 else await dialog.locator('.dialog-heading [data-close]').click();
 assert.equal(await element.evaluate(d=>d.open),false,`${method} must close the dialog`);await element.dispose();
}
async function checkCard(page,key,method,reason){
 const before=await snapshot(page);
 const playable=await page.evaluate(key=>{
  const card=room.game.citiesKnights.players[room.you].cards.find(card=>card.key===key);
  return room.game.legal.citiesKnights.some(option=>option.key===`play:${card.id}`);
 },key);
 const button=page.locator(`[data-card="${key}"]`);
 assert.equal(await button.getAttribute('data-ready'),String(playable),`${key} readiness follows the engine`);
 assert.equal(await button.locator('.cities-card-unavailable').count(),playable?0:1);
 const appearance=await button.locator(':scope > .cities-card-art').evaluate(el=>({filter:getComputedStyle(el).filter,opacity:Number(getComputedStyle(el).opacity)}));
 assert.equal(appearance.filter,playable?'none':'grayscale(1)',`${key} art is gray only while unavailable`);assert.equal(appearance.opacity,playable?1:.5);
 assert(await button.isEnabled(),'an unavailable card remains accessible for reading');
 assert.equal(await button.locator('.cities-card-help').count(),playable?0:1);
 assert.equal(await button.locator('.cities-card-ready').count(),playable?1:0);
 await button.click();const dialog=playable?cardDialog(page):infoDialog(page);await dialog.waitFor({state:'visible'});
 assert.equal(await activeCardDialog(page).count(),1,'only the correct card dialog opens');
 assert.equal(await dialog.locator('h2').textContent(),D.cards[key].slice(2,4).join(' / '));
 if(playable)assert(await dialog.locator('[data-play]').isEnabled());
 else{
  assert.equal(await dialog.getAttribute('data-rules-dialog'),'');
  assert.equal(await dialog.locator('[data-play]').count(),0,'read-only card help contains no Play action');
  const why=dialog.locator('.cities-card-unavailable-reason');assert(await why.isVisible());
  const text=await why.innerText();assert.match(text,/\p{Script=Han}/u);assert.match(text,/[A-Za-z]{3}/,'unavailability reason is bilingual');if(reason)assert.match(text,reason);
 }
 const body=dialog.locator(playable?'.cities-confirm-details':'[data-rules-body]'),bullets=body.locator('.cities-info-list > li');
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
 await page.locator('#citiesPanel').screenshot({path:path.join(__dirname,`test-results/catan-progress-availability-${rolled?'main':'roll'}-${width}.png`)});
 const switched=await page.evaluate(async({playable,readOnly})=>{
  const card=key=>document.querySelector(`[data-card="${key}"]`),confirm=document.querySelector('#citiesConfirm');
  card(playable).click();const oldPlay=confirm.querySelector('[data-play]');confirm.querySelector('[data-close]').click();card(readOnly).click();
  const info=document.querySelector('#citiesCardInfoDialog'),immediate={info:info.open,confirm:confirm.open,actions:info.querySelectorAll('[data-play]').length};
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));oldPlay.click();
  return{immediate,settled:{info:info.open,confirm:confirm.open,actions:info.querySelectorAll('[data-play]').length}};
 },{playable,readOnly});
 assert.deepEqual(switched,{immediate:{info:true,confirm:false,actions:0},settled:{info:true,confirm:false,actions:0}},'late close events cannot turn help into a playable card');
 assert.deepEqual(await snapshot(page),before,'a stale hidden Play button cannot submit the previous card');
 const enabled=await page.evaluate(playable=>{
  document.querySelector('#citiesCardInfoDialog [data-close]').click();document.querySelector(`[data-card="${playable}"]`).click();return !document.querySelector('#citiesConfirm [data-play]').disabled;
 },playable);
 assert.equal(enabled,true,'opening a Ready card must immediately enable its current Play action');
 await closeDialog(page,cardDialog(page),width===320?'tap':'click');assert.deepEqual(await snapshot(page),before);
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();console.log(`Rapid card switching: ${width}px ${rolled?'main':'roll'} phase keeps help separate and prevents stale Play actions`);
}
async function checkUnavailableContexts(context,port,width,errors){
 const cases=[
  {keys:['irrigation'],rolled:false,reason:/掷骰|骰子|结算/},
  {keys:['alchemy'],rolled:true,reason:/掷骰|骰子/},
  {keys:['irrigation','alchemy'],rolled:true,options:{outsideTurn:true},reason:/回合/},
  {keys:['engineering'],rolled:true,options:{walledCities:true},reason:/城墙/},
  {keys:['taxation'],rolled:true,reason:/入侵|强盗/}
 ];
 for(const item of cases){const page=await openRoom(context,port,item.keys,item.rolled,errors,item.options);for(const key of item.keys){assert.equal(await page.locator(`[data-card="${key}"]`).getAttribute('data-ready'),'false');await checkCard(page,key,width===320?'tap':'click',item.reason);}assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();}
 console.log(`Unavailable reasons: ${width}px before roll, after roll, another player's turn, all cities walled and first invasion`);
}
async function checkReadOnlyUpdates(context,port,width,errors){
 const page=await openRoom(context,port,['irrigation'],false,errors),before=await snapshot(page);
 await page.locator('[data-card="irrigation"]').click();const dialog=infoDialog(page);await dialog.waitFor({state:'visible'});
 const body=dialog.locator('[data-rules-body]');await body.evaluate(el=>el.scrollTop=el.scrollHeight);const scroll=await body.evaluate(el=>el.scrollTop);
 for(const message of [{type:'chat',text:'Reading card help regression'},{type:'profile',avatar:{kind:'emoji',value:'🌟'}}]){
  const updates=await page.evaluate(message=>{const n=stateMessages;sock.send(JSON.stringify(message));return n;},message);await page.waitForFunction(n=>stateMessages>n,updates);
  assert(await dialog.isVisible(),'non-game updates must keep card help open');assert.equal(await body.evaluate(el=>el.scrollTop),scroll,'reading position survives non-game updates');assert.deepEqual(await snapshot(page),before);
 }
 await dialog.screenshot({path:path.join(__dirname,`test-results/catan-progress-readonly-${width}.png`)});await closeDialog(page,dialog,width===320?'tap':'click');assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log(`Read-only help: ${width}px chat/profile broadcasts preserve dialog, reading position and game state`);
}
async function checkBecomesReady(context,port,width,errors){
 const page=await openRoom(context,port,['irrigation'],false,errors,{rollToReady:true});
 const cardId=await page.locator('[data-card="irrigation"]').getAttribute('data-card-id'),card=page.locator(`[data-card-id="${cardId}"]`);
 await card.click();const dialog=infoDialog(page);await dialog.waitFor({state:'visible'});const before=await page.evaluate(()=>actionRequests.length);
 await page.evaluate(()=>sock.send(JSON.stringify({type:'action',action:{type:'roll'}})));await page.waitForFunction(()=>room.game.phase==='main');
 assert.equal(await card.getAttribute('data-ready'),'true');assert(await dialog.isVisible(),'game state changes must not dismiss read-only card help');assert.match(await dialog.locator('.cities-card-unavailable-reason').innerText(),/现在可用/);assert.match(await dialog.locator('.cities-card-unavailable-reason').innerText(),/Now ready/);assert.equal(await dialog.locator('[data-play]').count(),0,'becoming Ready does not insert a Play button into help');assert.equal(await page.evaluate(()=>actionRequests.length),before+1,'only the deliberate roll is sent');
 await closeDialog(page,dialog,width===320?'tap':'click');await card.click();await cardDialog(page).waitFor({state:'visible'});assert(await cardDialog(page).locator('[data-play]').isEnabled());await closeDialog(page,cardDialog(page),'Escape');assert.equal(await page.evaluate(()=>actionRequests.length),before+1);assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log(`Availability update: ${width}px a real roll makes the card Ready while its explanation remains read-only`);
}
async function checkReadyPlay(context,port,width,errors){
 for(const rolled of [false,true]){
  const key=rolled?'irrigation':'alchemy',page=await openRoom(context,port,[key],rolled,errors);
  const before=await page.evaluate(()=>({requests:actionRequests.length,grain:room.game.players[room.you].resources[3],gain:Math.min(room.game.bank[3],room.game.board.tiles.filter(t=>t.resource===3&&t.vertices.some(i=>room.game.board.vertices[i].owner===room.you)).length*2)}));
  assert.equal(await page.locator(`[data-card="${key}"]`).getAttribute('data-ready'),'true');await page.locator(`[data-card="${key}"]`).click();await cardDialog(page).waitFor({state:'visible'});assert.equal(await infoDialog(page).count()?await infoDialog(page).isVisible():false,false);
  await cardDialog(page).locator('[data-play]').click();await page.waitForFunction(key=>!room.game.citiesKnights.players[room.you].cards.some(c=>c.key===key),key);assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+1);
  if(rolled){assert.equal(await page.evaluate(()=>room.game.phase),'main');assert.equal(await page.evaluate(()=>room.game.players[room.you].resources[3]),before.grain+before.gain);}
  else{await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='alchemy');await page.locator("[data-cities-picker]").click();await page.locator('[data-die-color="yellow"][data-face="3"]').click();await page.locator('[data-die-color="red"][data-face="4"]').click();await page.locator("#citiesChoiceConfirm").click();await page.waitForFunction(()=>room.game.phase==='roll');assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+2);}
  assert(await cardDialog(page).isHidden());assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 }
 console.log(`Ready cards: ${width}px Alchemy reaches dice selection; Irrigation consumes exactly one card and grants the correct grain`);
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
   await page.locator('[data-card="irrigation"]').click();await activeCardDialog(page).screenshot({path:path.join(__dirname,`test-results/catan-irrigation-${rolled?'main':'roll'}-${width}.png`)});await closeDialog(page,activeCardDialog(page),width===320?'tap':'click');
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
    localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];window.stateMessages=0;
    const Native=WebSocket;window.WebSocket=class extends Native{
     constructor(...args){super(...args);window.sock=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state'){window.room=data;window.stateMessages++;}if(data.type==='error')window.serverError=data.message;});}
     send(data){const message=JSON.parse(data);if(message.type==='action')actionRequests.push(message.action);super.send(data);}
    };
   });
   await checkUnavailableContexts(context,port,width,errors);await checkReadOnlyUpdates(context,port,width,errors);await checkBecomesReady(context,port,width,errors);await checkReadyPlay(context,port,width,errors);
   for(const rolled of [false,true])await checkRapidSwitch(context,port,width,rolled,errors);
   for(const rolled of [false,true]){await checkMatrix(context,port,width,rolled,errors);await checkSpecialCards(context,port,width,rolled,errors);}
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log(`All ${Object.keys(D.cards).length} progress-card types passed desktop/mobile before/after-roll dialog regressions`);
 }catch(error){console.error('Browser/server errors',errors,backend);throw error;}finally{await browser?.close();if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
