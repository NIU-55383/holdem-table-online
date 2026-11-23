"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test');
const A=require('./room-archive'),D=require('./catan-cities-data');
const branches=['science','trade','politics'];
const cases=[
 {name:'politics-first',branch:2,from:0,metropolis:'none'},
 {name:'science-free',branch:0,from:0,crane:true,metropolis:'none',execute:true},
 {name:'science-ability',branch:0,from:2,metropolis:'none'},
 {name:'trade-ability',branch:1,from:2,metropolis:'none',execute:true},
 {name:'politics-ability',branch:2,from:2,metropolis:'none'},
 {name:'trade-claim',branch:1,from:3,metropolis:'claim',execute:true},
 {name:'science-no-metropolis',branch:0,from:3,metropolis:'none',owner:1,ownerLevel:4},
 {name:'science-take',branch:0,from:4,metropolis:'take',owner:1,ownerLevel:4},
 {name:'politics-secure',branch:2,from:4,metropolis:'secure',owner:0,ownerLevel:4}
];
function improvementFixture(example={branch:0,from:2,metropolis:'none'}){
 const saved=A.decode(fixture(),['catan']).room,g=saved.game;
 for(const card of g.cities.players[0].cards.splice(0))g.cities.decks[D.cards[card.key][0]].push(card.key);
 g.cities.players.forEach(player=>player.levels=[0,0,0]);g.board.vertices.forEach(vertex=>delete vertex.metropolis);
 g.cities.players[0].levels[example.branch]=example.from;g.cities.crane=example.crane?1:0;
 for(let resource=5;resource<8;resource++){const delta=6-g.players[0].resources[resource];g.players[0].resources[resource]+=delta;g.bank[resource]-=delta;}
 if(example.owner!==undefined){
  g.cities.players[example.owner].levels[example.branch]=example.ownerLevel;
  g.board.vertices.find(vertex=>vertex.owner===example.owner&&vertex.level===2).metropolis=example.branch;
 }
 return A.encode('catan',saved);
}
const confirmation=page=>page.locator('dialog.cities-dialog:has([data-play])');
const snapshot=page=>page.evaluate(()=>({game:JSON.stringify(room.game),requests:actionRequests.length}));
async function openRoom(context,port,example,errors){
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
 await importRoom(page,improvementFixture(example));return page;
}
async function checkBounds(dialog){
 assert(await dialog.evaluate(dialog=>{
  const bounds=dialog.getBoundingClientRect(),close=dialog.querySelector('[data-close]').getBoundingClientRect();
  return dialog.scrollWidth<=dialog.clientWidth+1&&bounds.left>=0&&bounds.right<=innerWidth+1&&bounds.top>=0&&bounds.bottom<=innerHeight+1&&close.top>=0&&close.bottom<=innerHeight+1;
 }),'dialog and close button must remain within the viewport');
}
async function checkScroll(dialog,body){
 await body.evaluate(body=>{body.scrollTop=body.scrollHeight;});
 assert(await body.evaluate(body=>Math.abs(body.scrollHeight-body.clientHeight-body.scrollTop)<=2),'long details must scroll to the bottom');
 await checkBounds(dialog);await body.evaluate(body=>{body.scrollTop=0;});
}
async function checkDescriptions(context,port,width,errors){
 const page=await openRoom(context,port,undefined,errors),before=await snapshot(page);
 for(const [index,name] of branches.entries()){
  const opener=page.locator(`#actions .cities-action-info[data-cities-info="${name}"]`);
  if(width===320)await opener.tap();else await opener.press('Enter');
  const dialog=page.locator('#citiesInfoDialog'),body=dialog.locator('.cities-info-body');await dialog.waitFor({state:'visible'});
  const text=await body.textContent();assert.match(await dialog.locator('h2').textContent(),new RegExp(D.branches[index][0]));
  assert(await body.locator('.cities-info-list > li').count()>=6,'improvement rules must be broken into bullets');
  assert(await body.locator('.cities-info-list > li').evaluateAll(items=>items.every(item=>item.querySelector('small'))),'each rule bullet needs its English counterpart');
  const rows=body.locator('table.cities-draw-table tbody tr');assert.equal(await rows.count(),6,'list every level from zero through five');
  for(let level=0;level<=5;level++){
   const cells=rows.nth(level).locator('th,td');assert.match(await cells.first().textContent(),new RegExp(String(level)));
   const dice=await cells.last().textContent();
   if(level===0)assert.match(dice,/不抽|不能|no|none/i);
   else assert.equal(dice.trim(),Array.from({length:level+1},(_,index)=>index+1).join('、'),'each level must show the exact eligible red-die faces');
  }
  assert.match(text,/红骰/);assert.match(text,/事件骰/);assert.match(text,/黄骰|总和/);
  assert.match(text,/任何|别人|无论|所有玩家/);
  assert.match(text,/起重机/);assert.match(text,/都会/);assert.match(text,/5|五/);
  assert.match(text,index===0?/水渠/:index===1?/2:1/:/三级骑士/);
  assert.match(text,index===0?/Aqueduct/:index===1?/2 identical commodities/:/mighty/);
  await checkBounds(dialog);await checkScroll(dialog,body);
  await dialog.screenshot({path:path.join(__dirname,`test-results/catan-improvement-info-${name}-${width}.png`)});
  if(width===320)await dialog.locator('[data-close]').tap();else await page.keyboard.press('Escape');
  assert.deepEqual(await snapshot(page),before,'reading improvement rules must not change the game');
 }
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
 console.log(`Improvement explanations: all three branches, six explicit dice levels, bilingual bullets and mobile scrolling at ${width}px`);
}
async function checkConfirmation(context,port,width,example,errors){
 const page=await openRoom(context,port,example,errors),branch=example.branch,to=example.from+1;
 const metadata=await page.evaluate(branch=>room.game.legal.citiesKnights.find(option=>option.key===`upgrade:${branch}`).improvement,branch);
 assert.deepEqual(metadata,{branch,from:example.from,to,cost:to-(example.crane?1:0),discount:example.crane?1:0,metropolis:example.metropolis});
 const before=await snapshot(page),opener=page.locator(`#actions [data-action="improve${branch}"]`);
 await opener.click();const dialog=confirmation(page);await dialog.waitFor({state:'visible'});
 assert(await dialog.evaluate(dialog=>dialog.classList.contains('is-improvement')));
 const title=await dialog.locator('h2').textContent();assert.match(title,new RegExp(D.branches[branch][0]));
 assert.match(title,new RegExp(`${example.from}\\s*级`));assert.match(title,new RegExp(`${to}\\s*级`));
 const body=dialog.locator('.cities-confirm-details'),text=await body.textContent();
 assert(await body.locator('.cities-info-list > li').count()>=2);
 assert.match(text,new RegExp(['纸','布','币'][branch]));assert.match(text,/红骰/);
 if(example.crane){assert.match(text,/起重机/);assert.match(text,/免费/);}else assert.match(await body.locator('li').first().textContent(),new RegExp(`本次支付\\s*${metadata.cost}\\s*张${['纸','布','币'][branch]}`));
 assert(text.includes(`1–${to+1}`),'confirmation must show the expanded red-die range');
 if(example.from)assert(text.includes(`1–${example.from+1}`),'confirmation must show the prior red-die range');else assert.match(text,/不能抽牌/);
 if(to===3)assert.match(text,branch===0?/水渠/:branch===1?/2:1/:/三级骑士/);
 if(example.metropolis==='claim')assert.match(text,/都会/);
 if(example.metropolis==='take')assert.match(text,/夺|对方|对手/);
 if(example.metropolis==='secure')assert.match(text,/保住|锁定|抢不走/);
 if(to>=4&&example.metropolis==='none')assert.match(text,/不会|不获得|没有|不能/);
 assert.match(await dialog.locator('[data-play]').textContent(),/确认升级/);
 await checkBounds(dialog);await checkScroll(dialog,body);
 await dialog.screenshot({path:path.join(__dirname,`test-results/catan-improvement-confirm-${example.name}-${width}.png`)});
 if(width===320)await dialog.locator('[data-close]').tap();else await page.keyboard.press('Escape');
 assert.deepEqual(await snapshot(page),before,'cancelling an improvement must not pay or change its level');
 if(example.execute){
  const original=await page.evaluate(()=>({resources:room.game.players[0].resources,requests:actionRequests.length,bank:room.game.bank}));
  await opener.click();await dialog.locator('[data-play]').click();
  await page.waitForFunction(({branch,to})=>room.game.citiesKnights.players[0].levels[branch]===to,{branch,to});
  assert.equal(await page.evaluate(()=>actionRequests.length),original.requests+1);
  assert.equal(await page.evaluate(branch=>room.game.players[0].resources[5+branch],branch),original.resources[5+branch]-metadata.cost);
  assert.equal(await page.evaluate(branch=>room.game.bank[5+branch],branch),original.bank[5+branch]+metadata.cost);
  assert.equal(await dialog.evaluate(dialog=>dialog.open),false);
  if(example.crane)assert.equal(await page.evaluate(branch=>room.game.legal.citiesKnights.find(option=>option.key===`upgrade:${branch}`).improvement.discount,branch),0,'Crane discount is consumed only once');
  if(example.metropolis==='claim'){
   await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='metropolis');
   await page.locator('#board [data-ck-choice]').first().press('Enter');await dialog.waitFor({state:'visible'});
   assert.equal(await dialog.locator('.cities-confirm-details').isVisible(),false,'city placement must restore the ordinary confirmation layout');
   await dialog.locator('[data-play]').click();await page.waitForFunction(()=>room.game.phase==='main');
   assert(await page.evaluate(branch=>room.game.board.vertices.some(vertex=>vertex.owner===0&&vertex.metropolis===branch),branch));
  }
 }
 assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.close();
}
async function main(){
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
   await checkDescriptions(context,port,width,errors);
   for(const example of cases)await checkConfirmation(context,port,width,example,errors);
   await context.close();
  }
  assert.deepEqual(errors,[]);assert.equal(backend,'');console.log('Improvement dialogs: desktop/mobile explanations, real upgrade costs, free Crane, level-three abilities and accurate metropolis outcomes passed');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
