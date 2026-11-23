"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture}=require('./catan-cities-ui-test'),E=require('./catan-engine'),A=require('./room-archive'),D=require('./catan-cities-data');
const metadataFields=['reason','source','total','initialCount','sourceScore','playerScore'];
function hand(g,id,cards){cards.forEach((n,r)=>{g.bank[r]-=n-g.players[id].resources[r];g.players[id].resources[r]=n;});}
function grant(g,id,key){const deck=g.cities.decks[D.cards[key][0]],at=deck.indexOf(key);assert(at>=0);deck.splice(at,1);const card={key,id:++g.cities.sequence};g.cities.players[id].cards.push(card);return card;}
function choiceFixture(kind,{short=false,legacy=false}={}){
 const saved=A.decode(fixture(),['catan']).room,g=saved.game;
 for(const player of g.cities.players)for(const card of player.cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 g.players.forEach((player,id)=>hand(g,id,Array(8).fill(0)));
 hand(g,0,short?[0,0,0,0,0,0,0,1]:[0,0,2,4,0,0,0,3]);hand(g,1,[2,0,0,0,0,0,0,0]);
 g.current=1;g.phase='main';g.cities.queue=[];g.cities.after='main';g.cities.rollTotal=null;
 if(kind==='wedding')g.cities.players[0].defenders=1;
 if(kind==='progressLimit'){
  for(const key of ['crane','medicine','mining','invention'])grant(g,0,key);
  g.cities.players.forEach(player=>player.levels=[0,0,0]);g.cities.players[0].levels=[1,0,0];g.board.vertices.forEach(vertex=>delete vertex.metropolis);
  const deck=g.cities.decks[0],at=deck.findIndex(key=>key!=='printing');[deck[0],deck[at]]=[deck[at],deck[0]];
  g.phase='roll';g.rolled=false;g.dice=[];const rolls=[.4,0,.5];E.act(g,1,{type:'roll'},()=>rolls.shift());
  assert.equal(g.cities.queue[0].kind,'discardProgress');assert.equal(g.cities.queue[0].player,0);
 }else{
  if(kind==='harbor')hand(g,0,[0,0,0,0,0,1,1,1]);
  const card=grant(g,1,kind);E.act(g,1,{type:'ck',choice:`play:${card.id}`});
  if(kind==='harbor')E.act(g,1,{type:'ck',choice:'harbor:0:0'});
  assert.equal(g.cities.queue[0].kind,kind==='harbor'?'harborPay':'give');assert.equal(g.cities.queue[0].player,0);
 }
 if(legacy){
  E.act(g,0,{type:'ck',choice:E.legal(g,0).citiesKnights[0].key});
  metadataFields.forEach(key=>delete g.cities.queue[0][key]);
 }
 return A.encode('catan',saved);
}
const contextPanel=page=>page.locator('#citiesPanel .cities-choice');
const body=page=>contextPanel(page).locator('.cities-choice-context');
const state=page=>page.evaluate(()=>({choice:room.game.citiesKnights.choice,hand:room.game.players[0].resources,counts:room.game.players.map(player=>player.resourceCount),bank:room.game.bank,revision:room.game.revision,requests:actionRequests.length,progress:room.game.citiesKnights.players[0].count}));
async function makeContext(browser,width){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});
 await context.addInitScript(()=>{
  localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];const Native=WebSocket;
  window.WebSocket=class extends Native{
   constructor(...args){super(...args);window.sock=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.room=data;if(data.type==='error')window.serverError=data.message;if(data.type==='archiveExported')window.exportedArchive=data.archive;});}
   send(data){const message=JSON.parse(data);if(message.type==='action')actionRequests.push(message.action);super.send(data);}
  };
 });return context;
}
async function pageAt(context,port,errors){const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);return page;}
async function closeDialogs(page){for(let n=0;n<6;n++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}
async function joinArchive(browser,port,width,archive,errors){
 const context=await makeContext(browser,width),page=await pageAt(context,port,errors);
 await page.fill('#name','TEN');await page.evaluate(archive=>sock.send(JSON.stringify({type:'archiveImport',archive,name:'TEN'})),archive);
 await page.locator('[data-archive-seat="0"]').click();await page.waitForFunction(()=>window.room?.game);await closeDialogs(page);
 const code=await page.evaluate(()=>room.code),observerContext=await makeContext(browser,width),observer=await pageAt(observerContext,port,errors);
 await observer.fill('#name','Sender <b>');await observer.evaluate(code=>sock.send(JSON.stringify({type:'join',code,name:'Sender <b>'})),code);
 await observer.locator('[data-archive-seat="1"]').click();await observer.waitForFunction(()=>window.room?.game);await closeDialogs(observer);
 const before=await state(page),buttons=contextPanel(page).locator('.cities-choice-list button');assert(await buttons.count()>0);assert(await buttons.evaluateAll(buttons=>buttons.every(button=>button.disabled)),'paused imported choices must be disabled');
 await buttons.first().evaluate(button=>button.click());assert.deepEqual(await state(page),before,'reading/clicking a paused choice cannot submit');
 await page.click('[data-room-manage]');await page.locator('[data-room-action="fillBot"]').click();await page.waitForFunction(()=>room.seats.every(seat=>!seat.vacant));
 await page.locator('[data-room-action="archiveContinue"]').click();await page.waitForFunction(()=>!room.control.paused);await page.keyboard.press('Escape');await observer.waitForFunction(()=>!room.control.paused);
 return{page,observer,context,observerContext,close:async()=>{await context.close();await observerContext.close();}};
}
async function fits(page){
 const panel=contextPanel(page);await panel.scrollIntoViewIfNeeded();
 assert(await panel.evaluate(panel=>{const r=panel.getBoundingClientRect();return panel.scrollWidth<=panel.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1;}),'choice explanation must fit the screen width');
 assert(await body(page).locator('ul > li').count()>=2,'choice explanation must be divided into useful bullet points');
 assert(await body(page).locator('li').evaluateAll(items=>items.every(item=>item.querySelector('small')?.textContent.trim())),'each bullet needs English');
}
async function checkWaiting(observer,expected){
 assert.equal(await contextPanel(observer).locator('.cities-choice-list button').count(),0,'waiting players must not receive another player\'s resource controls');
 const text=await body(observer).textContent();assert(text.includes('TEN'));assert.match(text,new RegExp(expected));
}
async function checkGive(browser,port,width,kind,errors,{short=false,legacy=false}={}){
 const room=await joinArchive(browser,port,width,choiceFixture(kind,{short,legacy}),errors),{page,observer}=room;
 try{
  const before=await state(page),q=before.choice,reason=D.cards[kind][2],total=kind==='wedding'?(short?1:2):4;
  assert.equal(q.reason,kind);assert.equal(q.source,1);assert.equal(q.to,kind==='wedding'?1:-1);
  if(legacy)assert.equal(q.total,undefined);else{assert.equal(q.total,total);assert.equal(q.initialCount,short?1:9);}
  const text=await body(page).textContent(),compact=text.replace(/\s/g,'');assert(text.includes(reason));assert(text.includes('Sender <b>'));assert.equal(await body(page).locator('b').count(),0,'names are escaped, never markup');
  assert(compact.includes(`${q.count}张`),'show the remaining card count');
  assert.match(await contextPanel(page).locator('h3').textContent(),new RegExp(String(q.count)));
  assert.match(await page.locator('#turnPrompt').textContent(),new RegExp(reason));assert.match(await page.locator('#turnPrompt').textContent(),new RegExp(String(q.count)));
  if(kind==='wedding'){assert.match(text,/高于|更高|比.*高/);assert.match(text,/交给|给.*Sender/);if(short)assert.match(text,/不足|只有|仅|全部/);}
  else{assert.match(text,/不低于|大于或等于|相同|不低/);assert.match(text,/一半|半数/);assert.match(text,/向下取整/);assert.match(text,/银行/);if(!legacy){assert(compact.includes('9'));assert(compact.includes('4张'));}}
  if(!legacy)assert(compact.includes(`${total}张`),'show the original total separately from the remaining amount');
  else assert(!/原本|一共|总共|共需/.test(compact),'legacy snapshots with unknown original count must not invent it');
  await fits(page);await checkWaiting(observer,reason);
  if(!short&&!legacy)await contextPanel(page).screenshot({path:path.join(__dirname,`test-results/catan-give-${kind}-${width}.png`)});
  const first=contextPanel(page).locator('.cities-choice-list button').first(),resource=Number((await first.getAttribute('data-choice')).split(':')[1]);
  await first.evaluate(button=>{button.click();button.click();});await page.waitForFunction(revision=>room.game.revision>revision,before.revision);
  const after=await state(page);assert.equal(after.requests,before.requests+1,'rapid duplicate click sends exactly one action');assert.equal(after.hand[resource],before.hand[resource]-1);assert.equal(after.counts[0],before.counts[0]-1);
  if(kind==='wedding')assert.equal(after.counts[1],before.counts[1]+1);else assert.equal(after.bank[resource],before.bank[resource]+1);
  if(q.count>1){
   assert.equal(after.choice.count,q.count-1);assert.equal(after.choice.total,q.total);assert((await body(page).textContent()).replace(/\s/g,'').includes(`${q.count-1}张`));
   if(width===1440&&!legacy){
    const choice=after.choice;await page.reload();await page.waitForFunction(()=>window.room?.game?.citiesKnights?.choice);await closeDialogs(page);assert.deepEqual((await state(page)).choice,choice,'reconnect preserves original total and remaining obligation');
    await page.evaluate(()=>sock.send(JSON.stringify({type:'archiveExport'})));await page.waitForFunction(()=>window.exportedArchive);
    const exported=await page.evaluate(()=>exportedArchive),restored=await joinArchive(browser,port,width,exported,errors);
    try{assert.deepEqual((await state(restored.page)).choice,choice,'mid-choice archive import preserves cause and progress');assert.match(await body(restored.page).textContent(),new RegExp(reason));await fits(restored.page);}finally{await restored.close();}
   }
   while((await state(page)).choice?.kind==='give'&&(await state(page)).choice.player===0){const revision=(await state(page)).revision;await contextPanel(page).locator('.cities-choice-list button').first().click();await page.waitForFunction(revision=>room.game.revision>revision,revision);}
  }
  assert.equal((await state(page)).choice,null,'the prompt disappears once the required count has been given');assert.equal(await page.evaluate(()=>window.serverError||''),'');assert.equal(await observer.evaluate(()=>window.serverError||''),'');
  console.log(`Give prompt ${kind}: ${width}px${short?' short hand':''}${legacy?' legacy':''}, cause/recipient/counts, exactly-once transfer and waiting view passed`);
 }finally{await room.close();}
}
async function checkOtherChoice(browser,port,width,kind,errors){
 const room=await joinArchive(browser,port,width,choiceFixture(kind),errors),{page,observer}=room;
 try{
  const before=await state(page),q=before.choice,text=await body(page).textContent();assert.equal(q.reason,kind);assert.equal(q.count,1);assert(text.replace(/\s/g,'').includes('1张'));
  if(kind==='harbor'){assert.match(text,/商业港/);assert.match(text,/木材|木/);assert.match(text,/商品/);assert(text.includes('Sender <b>'));assert.deepEqual(await contextPanel(page).locator('.cities-choice-list button').evaluateAll(buttons=>buttons.map(button=>button.dataset.choice)),['r:5','r:6','r:7']);}
  else{assert.match(text,/进步卡/);assert.match(text,/4/);assert.match(text,/5/);assert.equal(before.progress,5);}
  await fits(page);await checkWaiting(observer,kind==='harbor'?'商业港':'进步卡');
  const option=contextPanel(page).locator('.cities-choice-list button').first(),resource=Number((await option.getAttribute('data-choice')).split(':')[1]);await option.click();await page.waitForFunction(revision=>room.game.revision>revision,before.revision);
  const after=await state(page);assert.equal(after.requests,before.requests+1);assert.equal(after.choice,null);
  if(kind==='harbor'){assert.equal(after.hand[resource],before.hand[resource]-1);assert.equal(after.hand[0],before.hand[0]+1);}else assert.equal(after.progress,4);
  assert.equal(await page.evaluate(()=>window.serverError||''),'');console.log(`Related prompt ${kind}: ${width}px explanation and exact exchange/discard passed`);
 }finally{await room.close();}
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let backend='',browser;server.stderr.on('data',chunk=>backend+=chunk);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  for(const width of [1440,320]){
   for(const kind of ['wedding','sabotage'])await checkGive(browser,port,width,kind,errors);
   await checkGive(browser,port,width,'wedding',errors,{short:true});
   for(const kind of ['wedding','sabotage'])await checkGive(browser,port,width,kind,errors,{legacy:true});
   for(const kind of ['harbor','progressLimit'])await checkOtherChoice(browser,port,width,kind,errors);
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log('Catan required-card explanations passed: causes, exact remaining counts, privacy, reconnects, saves, desktop and mobile');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={choiceFixture};
