"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test');
const A=require('./room-archive'),D=require('./catan-cities-data');
function alchemyFixture(rolled){
 const saved=A.decode(fixture(false,false,{rolled}),['catan']).room,g=saved.game;
 for(const card of g.cities.players[0].cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 for(const key of ['alchemy','engineering']){
  const deck=g.cities.decks[D.cards[key][0]];deck.splice(deck.indexOf(key),1);g.cities.players[0].cards.push({key,id:++g.cities.sequence});
 }
 // Keep event rolls free of unrelated progress-card choices in this regression.
 g.cities.players[0].levels=[0,0,0];g.cities.players[2].levels=[0,0,0];
 return A.encode('catan',saved);
}
const cardDialog=page=>page.locator('dialog.cities-dialog:has([data-play])');
const snapshot=page=>page.evaluate(()=>({game:JSON.stringify(room.game),requests:actionRequests.length}));
async function openCard(page,key){
 await page.locator(`[data-card="${key}"]`).click();await cardDialog(page).waitFor({state:'visible'});
 assert.match(await cardDialog(page).locator('h2').textContent(),key==='alchemy'?/Alchemy/:/Engineering/);
}
async function cancelCard(page,key,method,playable){
 const before=await snapshot(page);await openCard(page,key);const dialog=cardDialog(page);
 assert.equal(await dialog.locator('[data-play]').isEnabled(),playable);
 assert(await dialog.locator('.cities-confirm-details .cities-info-list > li').count()>=1,'card instructions use bullet points');
 assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
 if(method==='Escape')await page.keyboard.press('Escape');
 else if(method==='Enter')await dialog.locator('[data-close]').press('Enter');
 else if(method==='tap')await dialog.locator('[data-close]').tap();
 else await dialog.locator('[data-close]').click();
 assert.equal(await dialog.evaluate(d=>d.open),false,`${key}: ${method} must close the card dialog`);
 assert.deepEqual(await snapshot(page),before,'viewing/cancelling must not send an action, consume a card or mutate the game');
}
async function checkMain(context,port,width,errors){
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 await importRoom(page,alchemyFixture(true));
 const beforeAudio=await snapshot(page);await page.locator('#audioSettings').click();
 const audioDialog=page.locator('#audioSettingsDialog');await audioDialog.waitFor({state:'visible'});
 await audioDialog.locator('.icon-button[data-close="audioSettingsDialog"]').click();
 assert.equal(await audioDialog.evaluate(d=>d.open),false,'named static dialog close handlers must remain functional');
 assert.deepEqual(await snapshot(page),beforeAudio);
 for(const method of [width===320?'tap':'click','Escape','Enter',width===320?'tap':'click'])await cancelCard(page,'alchemy',method,false);
 await cancelCard(page,'engineering',width===320?'tap':'click',true);
 await cancelCard(page,'alchemy','Escape',false);
 await cancelCard(page,'engineering','Enter',true);
 await openCard(page,'alchemy');
 await cardDialog(page).screenshot({path:path.join(__dirname,`test-results/catan-alchemy-main-${width}.png`)});
 await cardDialog(page).locator('[data-close]').click();
 const before=await page.evaluate(()=>({requests:actionRequests.length,current:room.game.current,turn:room.game.turn}));
 await page.locator('#actions [data-action="end"]').click();
 await page.waitForFunction(before=>room.game.turn>before.turn&&room.game.current!==before.current,before);
 assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+1,'the normal turn must continue after closing Alchemy');
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log(`Alchemy main phase: ${width}px unavailable card closes by pointer, keyboard and Escape; repeated cancellation preserves state and turn continues`);
}
async function checkRoll(context,port,width,errors){
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 await importRoom(page,alchemyFixture(false));
 await cancelCard(page,'alchemy',width===320?'tap':'click',true);
 await cancelCard(page,'alchemy','Escape',true);
 await cancelCard(page,'engineering','Enter',false);
 await cancelCard(page,'alchemy','Enter',true);
 const before=await page.evaluate(()=>actionRequests.length);
 await openCard(page,'alchemy');await cardDialog(page).locator('[data-play]').click();
 await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='alchemy');
 assert.equal(await cardDialog(page).evaluate(d=>d.open),false);
 assert.equal(await page.evaluate(()=>actionRequests.length),before+1);
 assert.equal(await page.locator('#citiesPanel [data-choice^="dice:"]').count(),36);
 assert.equal(await page.evaluate(()=>room.game.citiesKnights.players[0].cards.filter(c=>c.key==='alchemy').length),0,'Alchemy is consumed exactly once on Play');
 await page.locator('#citiesPanel [data-choice="dice:3:3"]').press('Enter');
 await page.waitForFunction(()=>room.game.phase==='roll');
 assert.equal(await page.evaluate(()=>actionRequests.length),before+2);
 await page.locator('#actions [data-action="roll"]').click();
 await page.waitForFunction(()=>room.game.dice.length===2);
 assert.deepEqual(await page.evaluate(()=>room.game.dice),[3,3]);
 assert.equal(await page.evaluate(()=>actionRequests.length),before+3);
 assert.equal(await page.evaluate(()=>window.serverError||''),'');
 await page.locator("#dice").screenshot({path:path.join(__dirname,`test-results/catan-alchemy-rolled-${width}.png`)});
 await page.close();console.log(`Alchemy roll phase: ${width}px cancel is harmless; Play consumes once, exposes 36 choices, and rolls the selected dice`);
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let browser,backend='';server.stderr.on('data',c=>backend+=c);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  for(const width of [1440,320]){
   const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===320});
   await context.addInitScript(()=>{
    localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];
    const Native=WebSocket;window.WebSocket=class extends Native{
     constructor(...args){super(...args);window.sock=this;this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.room=d;if(d.type==='error')window.serverError=d.message;});}
     send(data){const d=JSON.parse(data);if(d.type==='action')actionRequests.push(d.action);super.send(data);}
    };
   });
   await checkMain(context,port,width,errors);await checkRoll(context,port,width,errors);await context.close();
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');
  console.log('Alchemy card dialog regression passed: main/roll phases, desktop/mobile, close/Escape/keyboard, no cancellation mutations, selected dice preserved');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
