"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture}=require('./catan-cities-ui-test'),E=require('./catan-engine'),A=require('./room-archive'),D=require('./catan-cities-data');
const metadataFields=['reason','source','total','initialCount','sourceScore','playerScore'];
function hand(g,id,cards){cards.forEach((n,r)=>{g.bank[r]-=n-g.players[id].resources[r];g.players[id].resources[r]=n;});}
function grant(g,id,key){const deck=g.cities.decks[D.cards[key][0]],at=deck.indexOf(key);assert(at>=0);deck.splice(at,1);const card={key,id:++g.cities.sequence};g.cities.players[id].cards.push(card);return card;}
function choiceFixture(kind,{short=false,legacy=false,legacyShort=false,allResources=false,many=false}={}){
 const saved=A.decode(fixture(),['catan']).room,g=saved.game;
 for(const player of g.cities.players)for(const card of player.cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 g.players.forEach((player,id)=>hand(g,id,Array(8).fill(0)));
 hand(g,0,many?[8,8,8,8,8,4,4,4]:allResources?Array(8).fill(2):short?[0,0,0,0,0,0,0,1]:[0,0,2,4,0,0,0,3]);hand(g,1,[2,0,0,0,0,0,0,0]);
 g.current=1;g.phase='main';g.cities.queue=[];g.cities.after='main';g.cities.rollTotal=null;
 if(kind==='wedding')g.cities.players[0].defenders=1;
 if(['aqueduct','takeCards','takeProgress'].includes(kind)){
  g.current=0;
  if(kind==='aqueduct'){g.phase='ckChoice';g.cities.queue=[{kind:'aqueduct',player:0}];}
  else{
   hand(g,1,short?[1,0,0,0,0,0,0,0]:Array(8).fill(1));g.cities.players[1].defenders=2;
   if(kind==='takeProgress')for(const key of ['mining','crane','merchant'])grant(g,1,key);
   const card=grant(g,0,kind==='takeCards'?'guild':'espionage');E.act(g,0,{type:'ck',choice:`play:${card.id}`});E.act(g,0,{type:'ck',choice:'player:1'});
  }
  assert.equal(g.cities.queue[0].kind,kind);assert.equal(g.cities.queue[0].player,0);
 }else if(kind==='progressLimit'){
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
 if(legacyShort){hand(g,0,[0,0,0,0,0,0,0,1]);g.cities.queue[0].count=2;metadataFields.forEach(key=>delete g.cities.queue[0][key]);}
 if(legacy){
  E.act(g,0,{type:'ck',choice:E.legal(g,0).citiesKnights[0].key});
  metadataFields.forEach(key=>delete g.cities.queue[0][key]);
 }
 return A.encode('catan',saved);
}
const contextPanel=page=>page.locator('#citiesPanel .cities-choice');
const picker=page=>page.locator('#citiesSelectionDialog');
const available=page=>page.locator('#citiesSelectionAvailable');
const chosen=page=>page.locator('#citiesSelectionChosen');
const confirm=page=>page.locator('#citiesSelectionConfirm');
const state=page=>page.evaluate(()=>({choice:room.game.citiesKnights.choice,selection:room.game.citiesKnights.selection,hand:room.game.players[0].resources,counts:room.game.players.map(player=>player.resourceCount),bank:room.game.bank,revision:room.game.revision,requests:actionRequests.length,progress:room.game.citiesKnights.players[0].count,cards:room.game.citiesKnights.players[0].cards,progressCounts:room.game.citiesKnights.players.map(p=>p.count)}));
async function makeContext(browser,width){
 const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});
 await context.addInitScript(()=>{
  localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];window.stateMessages=0;const Native=WebSocket;
  window.WebSocket=class extends Native{
   constructor(...args){super(...args);window.sock=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state'){window.room=data;window.stateMessages++;}if(data.type==='error')window.serverError=data.message;if(data.type==='archiveExported')window.exportedArchive=data.archive;});}
   send(data){const message=JSON.parse(data);if(message.type==='action')actionRequests.push(message.action);super.send(data);}
  };
 });return context;
}
async function pageAt(context,port,errors){const page=await context.newPage();page.on('pageerror',error=>{const detail=error.stack||error.message;if(!errors.includes(detail)){errors.push(detail);console.error('Browser exception',detail);}});await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);return page;}
async function closeDialogs(page){for(let n=0;n<6;n++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}
async function joinArchive(browser,port,width,archive,errors){
 const context=await makeContext(browser,width),page=await pageAt(context,port,errors);
 await page.fill('#name','TEN');await page.evaluate(archive=>sock.send(JSON.stringify({type:'archiveImport',archive,name:'TEN'})),archive);
 await page.locator('[data-archive-seat="0"]').click();await page.waitForFunction(()=>window.room?.game);await closeDialogs(page);
 const code=await page.evaluate(()=>room.code),observerContext=await makeContext(browser,width),observer=await pageAt(observerContext,port,errors);
 await observer.fill('#name','Sender <b>');await observer.evaluate(code=>sock.send(JSON.stringify({type:'join',code,name:'Sender <b>'})),code);
 await observer.locator('[data-archive-seat="1"]').click();await observer.waitForFunction(()=>window.room?.game);await closeDialogs(observer);
 const before=await state(page),button=contextPanel(page).locator('[data-cities-select]');assert.equal(await button.count(),1);assert(await button.isDisabled(),'paused imported choices cannot be opened');await button.evaluate(button=>button.click());assert.deepEqual(await state(page),before);assert(await picker(page).isHidden());
 await page.click('[data-room-manage]');await page.locator('[data-room-action="fillBot"]').click();await page.waitForFunction(()=>room.seats.every(seat=>!seat.vacant));
 await page.locator('[data-room-action="archiveContinue"]').click();await page.waitForFunction(()=>!room.control.paused);await page.keyboard.press('Escape');await observer.waitForFunction(()=>!room.control.paused);
 return{page,observer,context,observerContext,close:async()=>{await context.close();await observerContext.close();}};
}
async function openPicker(page){await contextPanel(page).locator('[data-cities-select]').click();await picker(page).waitFor({state:'visible'});}
async function checkWaiting(observer,expected){
 assert.equal(await contextPanel(observer).locator('[data-cities-select]').count(),0,"waiting players cannot select another player's cards");
 assert.equal(await contextPanel(observer).locator('.cities-choice-list button').count(),0,'old immediate resource controls stay hidden');
 assert.equal(await observer.evaluate(()=>room.game.citiesKnights.selection??null),null,'selection inventory is private to the required actor');
 const text=await contextPanel(observer).innerText();assert(text.includes('TEN'));if(expected)assert.match(text,new RegExp(expected));
}
async function fits(page,{scroll=false}={}){
 const dialog=picker(page);assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),'selection dialog must fit the viewport');
 const heading=dialog.locator('.dialog-heading'),top=await heading.evaluate(el=>el.getBoundingClientRect().top);
 for(const list of [available(page),chosen(page)]){assert(await list.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await list.evaluate(el=>el.scrollTop=el.scrollHeight);assert(await list.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<=2));}
 if(scroll&&page.viewportSize().width===320)assert(await available(page).evaluate(el=>el.scrollHeight>el.clientHeight),'large mobile hands scroll within the picker');
 assert.equal(await heading.evaluate(el=>el.getBoundingClientRect().top),top,'heading remains visible while card lists scroll');await available(page).evaluate(el=>el.scrollTop=0);await chosen(page).evaluate(el=>el.scrollTop=0);
 assert(await confirm(page).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),'confirmation stays within the mobile screen');
 const reason=await page.locator('#citiesSelectionReason').innerText();assert.match(reason,/\p{Script=Han}/u);assert.match(reason,/[A-Za-z]{3}/);assert(reason.length<1000,'reason is concise rather than a full rules chapter');
}
async function selectResource(page,r){await available(page).locator(`[data-select-resource="${r}"]`).first().click();}
async function selectedResources(page){return chosen(page).locator('[data-unselect-resource]').evaluateAll(buttons=>{const result=Array(8).fill(0);for(const button of buttons)result[Number(button.dataset.unselectResource)]++;return result;});}
async function checkDraft(page,before,{cards=false}={}){
 assert(await confirm(page).isDisabled(),'not enough selected cards disables confirmation');await confirm(page).evaluate(button=>button.click());assert.deepEqual(await state(page),before,'clicking an incomplete confirmation sends nothing');
 const option=available(page).locator(cards?'[data-select-card]':'[data-select-resource]').first(),key=await option.getAttribute(cards?'data-select-card':'data-select-resource');
 const observing=await page.evaluate(({cards,key})=>{
  const attr=cards?'data-select-card':'data-select-resource',list=document.getElementById('citiesSelectionAvailable');
  const node=[...list.querySelectorAll(`[${attr}]`)].find(button=>button.getAttribute(attr)!==key);if(!node)return false;
  const svg=node.querySelector('svg'),use=svg?.querySelector('use');if(!svg)throw Error('selection card must show an SVG icon');
  const check={node,svg,use,attr,key:node.getAttribute(attr),detached:false};
  check.observer=new MutationObserver(records=>{if(records.some(record=>[...record.removedNodes].some(removed=>removed===node||removed.contains(node)||removed===svg||removed.contains(svg))))check.detached=true;});
  check.observer.observe(document.body,{childList:true,subtree:true});window.selectionNodeCheck=check;return true;
 },{cards,key});
 await option.click();
 if(observing){const retained=await page.evaluate(()=>{const check=window.selectionNodeCheck;check.observer.disconnect();const live=[...document.querySelectorAll(`#citiesSelectionAvailable [${check.attr}]`)].find(node=>node.getAttribute(check.attr)===check.key);const result={button:live===check.node,svg:live?.querySelector('svg')===check.svg,use:live?.querySelector('svg use')===check.use,detached:check.detached};delete window.selectionNodeCheck;return result;});assert.deepEqual(retained,{button:true,svg:true,use:true,detached:false},'choosing an earlier card preserves the later unselected card and its SVG/use without detaching them');}
 assert.deepEqual(await state(page),before,'selecting only changes the local draft');
 if(before.selection.required>1)assert(await confirm(page).isDisabled());
 await chosen(page).locator(cards?`[data-unselect-card="${key}"]`:`[data-unselect-resource="${key}"]`).first().click();assert.equal(await chosen(page).locator('button').count(),0);assert(await page.evaluate(()=>document.activeElement?.matches('#citiesSelectionAvailable button:not(:disabled)')),'removing the last selected card returns keyboard focus to available cards');assert(await confirm(page).isDisabled());assert.deepEqual(await state(page),before,'unselecting never transfers cards');
 await available(page).locator(cards?'[data-select-card]':'[data-select-resource]').first().click();await picker(page).locator('[data-close]').click();assert(await picker(page).isHidden());assert.deepEqual(await state(page),before,'closing an edited picker cancels the draft');
 await openPicker(page);assert.equal(await chosen(page).locator('button').count(),0,'reopening starts an empty draft');await available(page).locator(cards?'[data-select-card]':'[data-select-resource]').first().click();await page.keyboard.press('Escape');assert(await picker(page).isHidden());assert.deepEqual(await state(page),before,'Escape does not give up a card');await openPicker(page);
}
async function fillSelection(page,required,{allResources=false,cards=false}={}){
 if(allResources){for(let r=0;r<8;r++)await selectResource(page,r);}
 else for(let i=0;i<required;i++)await available(page).locator(cards?'[data-select-card]:not(:disabled)':'[data-select-resource]:not(:disabled)').first().click();
 assert.match(await page.locator('#citiesSelectionHint').innerText(),new RegExp(`${required}\\s*/\\s*${required}`));assert(await confirm(page).isEnabled());
}
async function submitSelection(page,before,{cards=false}={}){
 const picked=cards?await chosen(page).locator('[data-unselect-card]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.unselectCard))):await selectedResources(page);
 await confirm(page).evaluate(button=>{button.click();button.click();});await page.waitForFunction(revision=>room.game.revision>revision,before.revision);
 const after=await state(page);assert.equal(after.requests,before.requests+1,'double confirmation sends one atomic action');assert.equal(after.revision,before.revision+1,'all selected cards settle in one game revision');assert(await picker(page).isHidden());
 const action=await page.evaluate(()=>actionRequests.at(-1));assert.equal(action.type,'ckSelect');assert.equal(action.revision,before.revision);assert.deepEqual(action[cards?'cards':'resources'],picked);assert.equal(await page.evaluate(()=>window.serverError||''),'');return{after,picked};
}
async function checkGive(browser,port,width,kind,errors,options={}){
 const saved=await joinArchive(browser,port,width,choiceFixture(kind,options),errors),{page,observer}=saved;
 try{
  const before=await state(page),q=before.choice,required=before.selection.required,reason=D.cards[kind][2];assert.equal(q.reason,kind);assert.equal(q.source,1);assert.equal(before.selection.kind,'give');assert.equal(required,Math.min(q.count,before.hand.reduce((a,b)=>a+b,0)));
  const text=await contextPanel(page).innerText();assert(text.includes(reason));assert(text.includes(String(required)));assert.equal(await contextPanel(page).locator('.cities-choice-list [data-choice]').count(),0);
  await checkWaiting(observer,reason);await openPicker(page);assert((await page.locator('#citiesSelectionReason').innerText()).includes('Sender <b>'));assert.equal(await page.locator('#citiesSelectionReason b').count(),0,'names are escaped');await checkDraft(page,before);await fits(page,{scroll:options.many});
  if(options.allResources)assert.deepEqual(await available(page).locator('[data-select-resource]').evaluateAll(buttons=>[...new Set(buttons.map(button=>Number(button.dataset.selectResource)))].sort()),[0,1,2,3,4,5,6,7]);
  if(options.legacyShort){assert.equal(q.count,2);assert.equal(required,1);assert.match(await contextPanel(page).locator('h3').innerText(),/还需.*1\s*张/);assert.match(await page.locator('#citiesSelectionReason').innerText(),/还需.*1\s*张/);assert.doesNotMatch(await page.locator('#citiesSelectionReason').innerText(),/还需.*2\s*张/);}
  await fillSelection(page,required,{allResources:options.allResources});assert.deepEqual(await state(page),before);await fits(page);
  if(!options.short&&!options.legacy&&!options.many&&!options.legacyShort)await picker(page).screenshot({path:path.join(__dirname,`test-results/catan-select-${kind}-${options.allResources?'eight-':''}${width}.png`)});
  const {after,picked}=await submitSelection(page,before);for(let r=0;r<8;r++){assert.equal(after.hand[r],before.hand[r]-picked[r]);if(kind==='sabotage')assert.equal(after.bank[r],before.bank[r]+picked[r]);}
  assert.equal(after.counts[0],before.counts[0]-required);if(kind==='wedding')assert.equal(after.counts[1],before.counts[1]+required);assert.equal(after.choice,null,'one confirmation completes the obligation');assert.equal(await observer.evaluate(()=>window.serverError||''),'');
  console.log(`Atomic ${kind}: ${width}px ${JSON.stringify(options)}, draft/cancel/quantity/privacy and one confirmed transfer passed`);
 }finally{await saved.close();}
}
async function checkOtherChoice(browser,port,width,kind,errors,{short=false}={}){
 const saved=await joinArchive(browser,port,width,choiceFixture(kind,{short}),errors),{page,observer}=saved;
 try{
  const before=await state(page),isCard=['progressLimit','takeProgress'].includes(kind),required=before.selection.required;await checkWaiting(observer);await openPicker(page);await checkDraft(page,before,{cards:isCard});await fits(page);
  if(kind==='harbor')assert.deepEqual(await available(page).locator('[data-select-resource]').evaluateAll(buttons=>[...new Set(buttons.map(button=>Number(button.dataset.selectResource)))].sort()),[5,6,7]);
  if(kind==='aqueduct')assert.deepEqual(await available(page).locator('[data-select-resource]').evaluateAll(buttons=>[...new Set(buttons.map(button=>Number(button.dataset.selectResource)))].sort()),[0,1,2,3,4]);
  if(kind==='progressLimit'){assert.equal(before.progress,5);assert.equal(await available(page).locator('[data-select-card]').count(),5);assert(await available(page).locator('svg').count()>=5);}
  await fillSelection(page,required,{cards:isCard});await picker(page).screenshot({path:path.join(__dirname,`test-results/catan-select-${kind}-${width}.png`)});const {after,picked}=await submitSelection(page,before,{cards:isCard});assert.equal(after.choice,null);
  if(kind==='harbor'){const r=picked.findIndex(n=>n);assert.equal(after.hand[r],before.hand[r]-1);assert.equal(after.hand[0],before.hand[0]+1);}
  else if(kind==='progressLimit'){assert.equal(after.progress,4);assert.deepEqual(after.cards.map(c=>c.id).sort((a,b)=>a-b),before.cards.map(c=>c.id).filter(id=>!picked.includes(id)).sort((a,b)=>a-b));}
  else if(kind==='takeProgress'){assert.equal(after.progress,before.progress+1);assert.equal(after.progressCounts[1],before.progressCounts[1]-1);assert(after.cards.some(c=>c.id===picked[0]));}
  else for(let r=0;r<8;r++){assert.equal(after.hand[r],before.hand[r]+picked[r]);if(kind==='aqueduct')assert.equal(after.bank[r],before.bank[r]-picked[r]);}
  if(kind==='takeCards')assert.equal(after.counts[1],before.counts[1]-required);console.log(`Atomic ${kind}: ${width}px${short?' short target':''}, choose/unchoose/cancel and one confirmed action passed`);
 }finally{await saved.close();}
}
async function checkStaleDrafts(browser,port,width,errors){
 const saved=await joinArchive(browser,port,width,choiceFixture('sabotage'),errors),{page}=saved;
 try{
  const before=await state(page);await openPicker(page);await selectResource(page,2);
  const update=await page.evaluate(()=>{const n=stateMessages;sock.send(JSON.stringify({type:'chat',text:'Selection draft stays local'}));return n;});await page.waitForFunction(n=>stateMessages>n,update);assert(await picker(page).isVisible());assert.equal(await chosen(page).locator('button').count(),1);assert.deepEqual(await state(page),before,'same-revision chat preserves the draft without transferring');
  await page.evaluate(()=>sock.send(JSON.stringify({type:'action',action:{type:'ck',choice:'r:2'}})));await page.waitForFunction(rev=>room.game.revision>rev,before.revision);assert(await picker(page).isHidden(),'new game revision invalidates the old draft');const changed=await state(page);await confirm(page).evaluate(button=>button.click());assert.deepEqual(await state(page),changed,'an old hidden confirmation never submits');
  await openPicker(page);assert.equal(await chosen(page).locator('button').count(),0);assert.equal(changed.choice.count,before.choice.count-1);await fillSelection(page,changed.choice.count);
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('board-archive-save',{detail:{leave:true}})));await page.locator('.archive-dialog [data-archive="prepare"]').click();await page.waitForFunction(()=>room.control.paused);assert(await picker(page).isHidden(),'pausing closes an in-flight selection');await confirm(page).evaluate(button=>button.click());assert.deepEqual(await state(page),changed,'paused draft cannot send');await page.locator('.archive-dialog footer [data-archive="cancel"]').click();await page.waitForFunction(()=>!room.control.paused);
  await openPicker(page);assert.equal(await chosen(page).locator('button').count(),0);await fillSelection(page,changed.choice.count);const disconnectedAt=await page.evaluate(()=>{const n=stateMessages;sock.close();return n;});await page.waitForFunction(()=>sock.readyState!==1);await picker(page).waitFor({state:'hidden'});assert(await picker(page).isHidden(),'disconnect invalidates the draft');await confirm(page).evaluate(button=>button.click());assert.equal((await state(page)).requests,changed.requests);
  await page.waitForFunction(n=>sock.readyState===1&&stateMessages>n&&room.seats[room.you].connected,disconnectedAt);await openPicker(page);assert.equal(await chosen(page).locator('button').count(),0,'reconnect starts with no pending selection');await picker(page).locator('[data-close]').click();assert.deepEqual(await state(page),changed);
  await page.evaluate(()=>sock.send(JSON.stringify({type:'archiveExport'})));await page.waitForFunction(()=>window.exportedArchive);const archive=await page.evaluate(()=>exportedArchive),restored=await joinArchive(browser,port,width,archive,errors);
  try{assert.deepEqual((await state(restored.page)).choice,changed.choice,'save restores the outstanding count and cause, never the unconfirmed draft');await openPicker(restored.page);assert.equal(await chosen(restored.page).locator('button').count(),0);}finally{await restored.close();}
  assert.equal(await page.evaluate(()=>window.serverError||''),'');console.log(`Stale drafts: ${width}px chat/revision/pause/reconnect/archive cannot cause an unintended transfer`);
 }finally{await saved.close();}
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
   await checkGive(browser,port,width,'wedding',errors,{legacyShort:true});
   await checkGive(browser,port,width,'sabotage',errors,{allResources:true});
   if(width===320)await checkGive(browser,port,width,'sabotage',errors,{many:true});
   for(const kind of ['harbor','progressLimit','aqueduct','takeCards','takeProgress'])await checkOtherChoice(browser,port,width,kind,errors);
   await checkOtherChoice(browser,port,width,'takeCards',errors,{short:true});await checkStaleDrafts(browser,port,width,errors);
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log('Catan atomic card selection passed: six choice kinds, local drafts, cancellation, exact counts, eight materials, private waiting views, stale-state protection, saves and desktop/mobile layouts');
 }catch(error){console.error('Browser/server errors',errors,backend);throw error;}finally{await browser?.close();if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={choiceFixture};
