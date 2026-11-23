"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture}=require('./catan-cities-ui-test'),A=require('./room-archive'),D=require('./catan-cities-data');
const branchNames=['science','trade','politics'];
const sampleCards=['engineering','harbor','espionage','merchant'];
function catalogFixture(empty=false){
 const saved=A.decode(fixture(),['catan']).room,g=saved.game;
 for(const card of g.cities.players[0].cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 if(!empty)for(const key of sampleCards){const deck=g.cities.decks[D.cards[key][0]],at=deck.indexOf(key);assert(at>=0);deck.splice(at,1);g.cities.players[0].cards.push({key,id:++g.cities.sequence});}
 return A.encode('catan',saved);
}
const snapshot=page=>page.evaluate(()=>({game:JSON.stringify(room.game),requests:actionRequests.length}));
const dialog=page=>page.locator('#citiesRules');
const trigger=page=>page.locator('#citiesPanel [data-progress-catalog]');
async function closeDialogs(page){for(let n=0;n<6;n++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');}
async function openRoom(context,port,errors,empty=false){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 await page.fill('#name','Catalog');await page.evaluate(archive=>sock.send(JSON.stringify({type:'archiveImport',archive,name:'Catalog'})),catalogFixture(empty));
 await page.locator('[data-archive-seat="0"]').click();await page.waitForFunction(()=>window.room?.game);await closeDialogs(page);
 return page;
}
async function resumeRoom(page){
 await page.click('[data-room-manage]');while(await page.locator('[data-room-action="fillBot"]').count()){const count=await page.locator('[data-room-action="fillBot"]').count();await page.locator('[data-room-action="fillBot"]').first().click();await page.waitForFunction(count=>document.querySelectorAll('[data-room-action="fillBot"]').length<count,count);}
 await page.locator('[data-room-action="archiveContinue"]').click();await page.waitForFunction(()=>!room.control.paused);await page.keyboard.press('Escape');
}
async function bounds(target){
 assert(await target.evaluate(el=>{const r=el.getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1;}),'content must fit the viewport without horizontal clipping');
}
async function dialogBounds(page){
 await bounds(dialog(page));assert(await dialog(page).evaluate(el=>{const r=el.getBoundingClientRect(),c=el.querySelector('[data-close]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1&&c.top>=0&&c.bottom<=innerHeight+1;}),'reader and close button stay on screen');
}
function isCategoryColor(value,branch){
 const [r,g,b]=value.match(/[\d.]+/g).slice(0,3).map(Number);
 if(branch===0)return Math.min(r,g,b)>=225&&Math.max(r,g,b)-Math.min(r,g,b)<=25;
 if(branch===1)return r>210&&g>180&&r>b+20&&g>b;
 return b>r+10&&b>180;
}
async function checkHandCardStyle(page,key){
 const card=page.locator(`.cities-progress [data-card="${key}"]`),branch=D.cards[key][0];
 const ready=await card.evaluate(el=>!room.control.paused&&room.game.legal.citiesKnights.some(o=>o.key===`play:${el.dataset.cardId}`));
 assert.equal(await card.getAttribute('data-ready'),String(ready),'readiness matches the legal card action');
 const background=await card.evaluate(el=>getComputedStyle(el).backgroundColor);
 if(ready)assert(isCategoryColor(background,branch),`${key} Ready card keeps its category color`);
 else {const rgb=background.match(/[\d.]+/g).slice(0,3).map(Number);assert(Math.max(...rgb)-Math.min(...rgb)<=8&&Math.min(...rgb)>=180,`${key} unavailable card has a neutral gray background: ${background}`);assert(await card.isEnabled(),'unavailable cards remain clickable for their rules');}
 await bounds(card);return ready;
}
async function checkPausedHand(page){
 for(const key of sampleCards)assert.equal(await checkHandCardStyle(page,key),false);
 const before=await snapshot(page);await page.locator('.cities-progress [data-card="harbor"]').click();
 const info=page.locator('#citiesCardInfoDialog');await info.waitFor({state:'visible'});
 assert.equal(await info.locator('[data-play]').count(),0);assert(await info.locator('[data-rules-body] .cities-info-list > li').count()>0);
 assert.equal(await page.locator('#citiesConfirm').isVisible(),false);await page.keyboard.press('Escape');
 assert.deepEqual(await snapshot(page),before,'gray-card help is read-only while paused');
}
async function checkCatalog(page,width,{screenshot=false}={}){
 const current=dialog(page),body=current.locator('[data-rules-body]'),groups=current.locator('.cities-rule-cards > [data-progress-branch]');
 assert(await current.evaluate(el=>el.classList.contains('bg-rules-dialog')),'catalog uses the shared rules reader');
 assert.equal(await groups.count(),3,'catalog has exactly Science, Trade and Politics groups');
 assert.deepEqual(await current.locator('[data-progress-jump]').evaluateAll(buttons=>buttons.map(button=>button.dataset.progressJump)),branchNames,'category navigation covers all three groups');
 const allKeys=[];
 for(let branch=0;branch<3;branch++){
  const group=groups.nth(branch),key=branchNames[branch],cards=group.locator('[data-progress-card]');
  assert.equal(await group.getAttribute('data-progress-branch'),key);
  const groupText=await group.textContent();assert(groupText.includes(D.branches[branch][0]));assert(groupText.includes(D.branches[branch][1]));
  const expected=Object.entries(D.cards).filter(([,card])=>card[0]===branch).map(([key])=>key);
  assert.deepEqual(await cards.evaluateAll(cards=>cards.map(card=>card.dataset.progressCard)),expected,'all cards appear once in their true branch');
  assert.equal(expected.reduce((sum,key)=>sum+D.cards[key][1],0),18,'each branch contains 18 physical cards');
  for(const key of expected){
   const entry=group.locator(`[data-progress-card="${key}"]`),text=await entry.textContent();allKeys.push(key);
   assert(text.includes(D.cards[key][2]));assert(text.includes(D.cards[key][3]));assert(text.includes(D.branches[branch][0]));assert(text.includes(D.branches[branch][1]));
   assert.equal(await entry.locator('svg.cities-card-art use').getAttribute('href'),`catan-progress-art.svg#${key}`);
   assert(await entry.locator('ul.cities-info-list > li').count()>=1,'card rules stay in bullets');
   await bounds(entry);
   assert(await entry.locator('svg.cities-card-art').evaluate(svg=>{const r=svg.getBoundingClientRect(),drawing=svg.getBBox();return r.width>=24&&r.height>=24&&drawing.width>0&&drawing.height>0;}),'each card has a loaded, visible illustration');
   const background=await entry.evaluate(el=>getComputedStyle(el).backgroundColor);
   assert(isCategoryColor(background,branch),`${key} has the requested white/yellow/blue branch background: ${background}`);
  }
  if(screenshot){const jump=current.locator(`[data-progress-jump="${key}"]`);if(width===320)await jump.tap();else await jump.press('Enter');assert(await group.locator('h3').evaluate(el=>document.activeElement===el),'category navigation moves keyboard focus to the group heading');assert(await group.evaluate(el=>{const body=el.closest('[data-rules-body]');return Math.abs(el.getBoundingClientRect().top-body.getBoundingClientRect().top)<=2;}),'category navigation scrolls directly to its heading');await current.screenshot({path:path.join(__dirname,`test-results/catan-progress-catalog-${key}-${width}.png`)});}
 }
 assert.equal(new Set(allKeys).size,25);
 const closeTop=await current.locator('[data-close]').evaluate(el=>el.getBoundingClientRect().top);
 await body.evaluate(el=>{el.scrollTop=el.scrollHeight;});assert(await body.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop)<=2),'last card is reachable');
 assert.equal(await current.locator('[data-close]').evaluate(el=>el.getBoundingClientRect().top),closeTop,'close button remains fixed');await dialogBounds(page);
}
async function checkHelp(page,width,{screenshot=false}={}){
 const before=await snapshot(page);assert(await trigger(page).isEnabled());assert.match(await trigger(page).getAttribute('aria-label'),/进步卡|Progress/i);
 if(width===320)await trigger(page).tap();else await trigger(page).press('Enter');await dialog(page).waitFor({state:'visible'});
 assert.match(await dialog(page).locator('h2').textContent(),/进步卡/);assert.match(await dialog(page).locator('h2').textContent(),/Progress/i);
 assert(await dialog(page).locator('[data-rules-body]').evaluate(el=>el.scrollTop===0),'card help opens directly at the catalog');
 await checkCatalog(page,width,{screenshot});
 if(width===320)await dialog(page).locator('[data-close]').tap();else await page.keyboard.press('Escape');assert.equal(await dialog(page).evaluate(el=>el.open),false);assert.deepEqual(await snapshot(page),before,'catalog viewing/closing changes no cards, turn or game state');
}
async function checkHand(page,width){
 const heading=page.locator('#citiesPanel .cities-progress-heading');assert.match(await heading.textContent(),/进步卡/);assert.match(await heading.textContent(),/Progress cards/i);
 await bounds(heading);const cards=page.locator('.cities-progress [data-card]');
 const expected=sampleCards;assert.deepEqual((await cards.evaluateAll(cards=>cards.map(card=>card.dataset.card))).sort(),expected.slice().sort());
 for(const key of expected){
  const card=page.locator(`.cities-progress [data-card="${key}"]`),branch=D.cards[key][0],text=await card.textContent();
  assert(text.includes(D.branches[branch][0]));assert(text.includes(D.branches[branch][1]));assert.equal(await card.locator('svg.cities-card-art use').getAttribute('href'),`catan-progress-art.svg#${key}`);
  await checkHandCardStyle(page,key);
 }
 assert.equal(await page.locator('#actions [data-action="merchant"]').count(),0,'merchant is a progress card, not a duplicated main action');
 await heading.scrollIntoViewIfNeeded();await page.locator('#citiesPanel').screenshot({path:path.join(__dirname,`test-results/catan-progress-hand-${width}.png`)});
 const before=await snapshot(page);await page.locator('.cities-progress [data-card="engineering"]').click();const confirmation=page.locator('dialog.cities-dialog:has([data-play])');await confirmation.waitFor({state:'visible'});
 assert(await confirmation.locator('[data-play]').isEnabled());assert.match(await confirmation.locator('h2').textContent(),/Engineering/);await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before,'illustrated card still opens the existing confirmation safely');
}
async function checkMerchantUse(page){
 const before=await snapshot(page),card=page.locator('.cities-progress [data-card="merchant"]'),confirmation=page.locator('dialog.cities-dialog:has([data-play])');
 await card.click();await confirmation.waitFor({state:'visible'});assert(await confirmation.locator('[data-play]').isEnabled());await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before,'cancel merchant use preserves the card');
 const resources=await page.evaluate(()=>room.game.players[0].resources);await card.click();await confirmation.locator('[data-play]').click();await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='merchant');
 assert.equal(await page.locator('.cities-progress [data-card="merchant"]').count(),0,'playing merchant consumes exactly its card');assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+1);
 const target=page.locator('#board [data-ck-choice^="tile:"]').first(),tile=Number((await target.getAttribute('data-ck-choice')).split(':')[1]);await target.press('Enter');await page.waitForFunction(tile=>room.game.phase==='main'&&room.game.citiesKnights.merchant.tile===tile,tile);
 assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+2);assert.deepEqual(await page.evaluate(()=>room.game.players[0].resources),resources,'merchant placement does not charge resources');assert.equal(await page.locator('dialog.cities-dialog[open]').count(),0);
}
async function checkFullRules(page,width){
 const before=await snapshot(page);await page.locator('#gameBaseRules').click();await dialog(page).waitFor({state:'visible'});
 assert.equal(await dialog(page).locator('#citiesBuildingCosts').count(),1,'normal rules still include build costs after catalog-only help');assert.equal(await dialog(page).locator('[data-cities-rule]').count(),D.ruleSections.length);
 await checkCatalog(page,width);await page.keyboard.press('Escape');assert.deepEqual(await snapshot(page),before);
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let browser,backend='';server.stderr.on('data',chunk=>backend+=chunk);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  for(const width of [1440,320]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});await context.addInitScript(()=>{localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.sock=this;this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.room=data;if(data.type==='error')window.serverError=data.message;});}send(data){const message=JSON.parse(data);if(message.type==='action')actionRequests.push(message.action);super.send(data);}};});
   const page=await openRoom(context,port,errors);assert(await page.evaluate(()=>room.control.paused));await checkPausedHand(page);await checkHelp(page,width);await resumeRoom(page);await checkHand(page,width);await checkHelp(page,width,{screenshot:true});await checkFullRules(page,width);await checkMerchantUse(page);assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
   const empty=await openRoom(context,port,errors,true);assert.equal(await empty.locator('.cities-progress [data-card]').count(),0);await checkHelp(empty,width);assert.match(await empty.locator('#citiesPanel').textContent(),/暂无|没有|No progress/i);await empty.close();await context.close();
   console.log(`Progress catalog ${width}px: 3 branches, 25 distinct illustrations, category backgrounds/labels, keyboard/touch help, paused/empty hands and unchanged game state`);
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log('Progress-card catalog and hand presentation passed desktop/mobile regression');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={catalogFixture};
