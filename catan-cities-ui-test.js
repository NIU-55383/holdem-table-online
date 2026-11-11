"use strict";
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const E=require('./catan-engine'),A=require('./room-archive'),D=require('./catan-cities-data');
function fixture(finished=false,pillage=false,{event='science',rolled=true}={}){
 let seed=47;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const g=E.createGame(['Human','Bot A','Bot B'],random,'cities');while(g.phase.startsWith('setup'))E.act(g,g.current,E.chooseBotAction(g,g.current,random),random);g.phase='main';
 for(let r=0;r<8;r++){const n=3-g.players[0].resources[r];g.players[0].resources[r]+=n;g.bank[r]-=n;}
 g.cities.players[0].levels=[2,3,3];g.cities.ship=4;g.cities.event=event;g.dice=rolled?[3,2]:[];g.rolled=rolled;if(!rolled)g.phase='roll';
 g.board.vertices.find(v=>v.owner===0&&v.level===1).level=2;
 for(const key of ['engineering','merchant','invention','crane','smithing']){const deck=g.cities.decks[D.cards[key][0]];deck.splice(deck.indexOf(key),1);g.cities.players[0].cards.push({key,id:++g.cities.sequence});}
 const extension=v=>v.edges.map(i=>g.board.edges[i]).find(e=>e.owner<0&&g.board.vertices[e.a===v.id?e.b:e.a].owner<0);
 const v=g.board.vertices.find(v=>v.owner<0&&v.edges.some(e=>g.board.edges[e].owner===0)&&extension(v));v.knight={owner:0,rank:2,active:true,activated:0,promoted:-1};extension(v).owner=0;
 g.cities.merchant={owner:0,tile:g.board.tiles.find(t=>t.resource>=0&&t.vertices.some(i=>g.board.vertices[i].owner===0)).id};
 const metropolis=g.board.vertices.find(v=>v.owner===1&&v.level===2);metropolis.metropolis=0;metropolis.wall=true;g.cities.players[1].levels[0]=4;
 if(pillage){g.phase='ckChoice';g.cities.ship=0;g.cities.attacked=true;g.cities.queue=[{kind:'pillage',player:0}];g.board.vertices.filter(v=>v.knight).forEach(v=>v.knight.active=false);g.board.vertices.filter(v=>v.owner===0&&v.level===2).forEach(v=>v.wall=true);}
 if(finished){g.cities.players[0].defenders=10;g.statistics.players[0].production[5]=2;g.statistics.players[0].production[6]=1;g.statistics.players[0].production[7]=3;E.act(g,0,{type:'bankTrade',give:6,get:0});assert.equal(g.phase,'over');return E.publicGame(g,0);}
 return A.encode('catan',{mapId:'cities',layout:'default',thieves:'both',maxPlayers:3,seats:g.players.map((p,i)=>({name:p.name,position:i})),game:g});
}
async function importRoom(page,archive){
 await page.fill('#name','Test');await page.evaluate(archive=>sock.send(JSON.stringify({type:'archiveImport',archive,name:'Test'})),archive);await page.locator('[data-archive-seat="0"]').waitFor();await page.click('[data-archive-seat="0"]');await page.waitForFunction(()=>window.room?.game);
 for(let i=0;i<5;i++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
 await page.click('[data-room-manage]');while(await page.locator('[data-room-action="fillBot"]').count()){const n=await page.locator('[data-room-action="fillBot"]').count();await page.locator('[data-room-action="fillBot"]').first().click();await page.waitForFunction(n=>document.querySelectorAll('[data-room-action="fillBot"]').length<n,n);}
 await page.click('[data-room-action="archiveContinue"]');await page.waitForFunction(()=>!room.control.paused);await page.keyboard.press('Escape');
}
function costFixture(mapId,phase){
 const g=E.createGame(['Human','Bot A','Bot B'],undefined,mapId);
 if(phase==='setupRoad')E.act(g,g.current,E.chooseBotAction(g,g.current));
 else if(phase!=='setupSettlement'){
  while(g.phase.startsWith('setup'))E.act(g,g.current,E.chooseBotAction(g,g.current));g.phase=phase==='freeRoads'?'main':phase;
  if(phase==='freeRoads'){g.deck.splice(g.deck.indexOf('roads'),1);g.players[0].development.push({type:'roads',turn:0});E.act(g,0,{type:'playDevelopment',card:'roads'});assert.equal(E.legal(g,0).cancelDevelopment,true);}
 }
 return A.encode('catan',{mapId,layout:'default',thieves:'both',maxPlayers:3,seats:g.players.map((p,i)=>({name:p.name,position:i})),game:g});
}
async function checkCosts(page,cities,ship){
 await checkActionIconStates(page);
 const button=page.locator('#actions [data-action="help"]');assert(await button.isVisible());assert(await button.isEnabled());assert(await button.evaluate(b=>b.scrollWidth<=b.clientWidth+1));
 const before=await page.evaluate(()=>[room.game.revision,actionRequests.length]);await button.click();
 const dialog=page.locator(cities?'#citiesRules':'#helpDialog');await dialog.waitFor({state:'visible'});const costs=dialog.locator(cities?'#citiesBuildingCosts':'#buildingCosts');
 assert(await dialog.locator('[data-rules-body]').evaluate(body=>body.scrollTop===0&&body.firstElementChild.matches('#citiesBuildingCosts,section:has(#buildingCosts)')));
 assert.match(await dialog.locator('h2').textContent(),/建造费用/);
 assert.equal(await costs.locator('.cost-row').count(),cities?10:ship?5:4);
 assert(await costs.locator('.cost-row').first().evaluate(el=>{const r=el.getBoundingClientRect(),d=el.closest('dialog').getBoundingClientRect();return r.top>=d.top&&r.bottom<d.bottom;}));
 assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 if(cities){assert.equal(await costs.locator('[data-cost="wall"] svg').count(),2);assert.equal(await costs.locator('[data-cost="recruit"] svg').count(),2);assert.equal(await costs.locator('[data-cost="activate"] svg').count(),1);assert.equal(await costs.locator('[data-cost="science"] use').getAttribute('href'),'catan-cities-art.svg#paper');assert.equal(await costs.locator('[data-cost="development"]').count(),0);}
 if(ship)assert.equal(await costs.locator('[data-cost="ship"] svg').count(),2);
 if(cities){await costs.locator('[data-cities-info="paper"]').click();await page.locator('#citiesInfoDialog[open]').waitFor();assert.match(await page.locator('#citiesInfoDialog').textContent(),/forest/);await page.keyboard.press('Escape');assert(await dialog.isVisible());}
 await page.screenshot({path:path.join(__dirname,`test-results/catan-build-costs-${cities?'cities':ship?'seafarers':'base'}-${page.viewportSize().width}.png`)});
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
 if(!cities){
  await page.click('#gameBaseRules');await dialog.waitFor({state:'visible'});
  assert(await dialog.locator('[data-rules-body]').evaluate(body=>body.scrollTop===0&&!body.firstElementChild.contains(document.getElementById('buildingCosts'))));
  assert.equal(await dialog.locator('#buildingCosts').count(),1);assert(await dialog.locator('#rulesPairedTurn').evaluate(s=>s.nextElementSibling.contains(document.getElementById('buildingCosts'))));
  await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
 }
}
async function checkFleet(page){
 const before=await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]);
 const fleet=page.locator('#citiesFleet');assert(await fleet.isVisible());
 assert(await fleet.evaluate(el=>el.nextElementSibling.id==='boardViewport'&&el.parentElement.classList.contains('board-section')));
 assert.equal(await fleet.locator('[data-step]').count(),8);assert.equal(await fleet.locator('use').getAttribute('href'),'catan-cities-art.svg#barbarians');
 for(const ship of [0,1,4,6]){
  await page.evaluate(ship=>{const r=structuredClone(room);r.game.citiesKnights.ship=ship;r.game.citiesKnights.choice=null;testCities.render(r);},ship);
  assert.equal(await fleet.getAttribute('data-position'),String(ship));assert.match(await fleet.textContent(),new RegExp(`${7-ship} 格`));assert.equal(await fleet.getAttribute('data-urgent'),String(ship>=5));assert.equal(await fleet.locator('.current').getAttribute('data-step'),String(ship));
 }
 await fleet.scrollIntoViewIfNeeded();await page.waitForTimeout(500);
 assert(await fleet.evaluate(el=>{const r=el.getBoundingClientRect(),ship=el.querySelector('.cities-fleet-ship').getBoundingClientRect(),route=el.querySelector('.cities-fleet-route').getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&ship.left>=r.left&&ship.right<=r.right&&Math.abs(ship.x+ship.width/2-(route.x+route.width*6.5/8))<2;}));
 await fleet.screenshot({path:path.join(__dirname,`test-results/catan-barbarian-fleet-${page.viewportSize().width}.png`)});
 if(page.viewportSize().width===1440)await fleet.press('Enter');else await fleet.locator('svg.cities-fleet-ship').click();
 const dialog=page.locator('#citiesInfoDialog[open]');await dialog.waitFor();const text=await dialog.textContent();assert.match(text,/事件骰/);assert.match(text,/7 advances/);assert.match(text,/sum of all active knights/);assert.match(text,/city and loses its wall/);assert.equal(await dialog.locator('[data-play]').count(),0);assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));await page.keyboard.press('Escape');
 for(const kind of ['pillage','reward']){
  await page.evaluate(kind=>{const r=structuredClone(room);r.game.citiesKnights.ship=0;r.game.citiesKnights.choice={kind,player:1};testCities.render(r);},kind);
  assert.equal(await fleet.getAttribute('data-position'),'7');assert.match(await fleet.textContent(),/正在结算/);assert(!/7 advances until/.test(await fleet.textContent()));
 }
 await page.evaluate(()=>{const r=structuredClone(room);r.game.citiesKnights.ship=0;r.game.citiesKnights.choice=null;r.game.citiesKnights.attacked=true;testCities.render(r);});assert.equal(await fleet.getAttribute('data-position'),'0');assert.match(await fleet.textContent(),/7 advances until attack/);
 await page.evaluate(()=>{const r=structuredClone(room);delete r.game.citiesKnights;testCities.render(r);});assert(await fleet.isHidden());
 await page.evaluate(()=>testCities.render(room));assert(await fleet.isVisible());assert.deepEqual(await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]),before);
}
async function checkEventDie(page,event){
 const dice=page.locator('#dice'),button=dice.locator('.cities-event-die');assert.equal(await dice.locator('.die').count(),3);assert.equal(await button.getAttribute('data-event'),event);
 assert.match(await button.getAttribute('aria-label'),/事件骰 \/ Event die/);
 if(event){assert.equal(await button.locator('use').getAttribute('href'),`catan-cities-art.svg#${event==='ship'?'barbarians':'metropolis'}`);assert.match(await button.textContent(),new RegExp(({ship:'Ship',science:'Science',trade:'Trade',politics:'Politics'})[event]));}
 else{assert.equal(await button.locator('svg').count(),0);assert.match(await button.textContent(),/\?/);assert.match(await button.getAttribute('aria-label'),/Not rolled/);}
 await dice.scrollIntoViewIfNeeded();await page.waitForTimeout(450);
 assert(await dice.evaluate(el=>{const bounds=el.getBoundingClientRect(),banner=el.closest('.turn-banner').getBoundingClientRect(),prompt=document.getElementById('turnPrompt'),faces=[...el.querySelectorAll('.die')].map(d=>d.getBoundingClientRect());return bounds.right<=banner.right&&bounds.left>=prompt.getBoundingClientRect().right&&prompt.scrollWidth<=prompt.clientWidth+1&&faces.every(f=>Math.abs(f.top-faces[0].top)<1);}));
 await page.locator('.turn-banner').screenshot({path:path.join(__dirname,`test-results/catan-event-die-${event||'unrolled'}-${page.viewportSize().width}.png`)});
 const before=await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]);if(page.viewportSize().width===1440)await button.press('Enter');else await button.click();
 const dialog=page.locator('#citiesInfoDialog[open]');await dialog.waitFor();const text=await dialog.textContent();assert.match(text,event==='ship'?/7 advances/:event?/red die/:/three faces|Three faces/);assert.match(text,event==='ship'?/蛮族/:event?/红骰/:/事件骰/);assert.equal(await dialog.locator('[data-play]').count(),0);assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[JSON.stringify(room),actionRequests.length]),before);
}
async function checkActionIconStates(page){
 const states=await page.locator('#actions [data-action]').evaluateAll(buttons=>buttons.flatMap(button=>{
  const item=button.closest('.cities-action-item'),icon=item?.querySelector('.cities-action-info svg')||button.querySelector('svg');
  if(!icon)return [];
  const unavailable=button.disabled||button.classList.contains('build-unavailable'),style=getComputedStyle(icon),info=item?.querySelector('.cities-action-info'),help=item?.querySelector('.cities-action-help');
  return [{action:button.dataset.action,unavailable,filter:style.filter,opacity:style.opacity,separate:!!item,infoEnabled:!info?.disabled,helpEnabled:!help?.disabled,helpOpacity:help?getComputedStyle(help).opacity:'1'}];
 }));
 for(const state of states){
  assert.equal(state.filter,state.unavailable?'grayscale(1)':'none',`${state.action}: icon follows action availability`);
  if(state.separate){assert.equal(Number(state.opacity),state.unavailable ? 0.4 : 1);assert(state.infoEnabled);assert(state.helpEnabled);assert.equal(Number(state.helpOpacity),1);}
 }
}
async function checkKnightHelp(page){
 const before=await page.evaluate(()=>[room.game.revision,actionRequests.length]);
 await page.locator('#board [data-cities-info="knight"]').first().click();
 const dialog=page.locator('#citiesInfoDialog[open]');await dialog.waitFor();
 const body=dialog.locator('.cities-info-body');assert.equal(await body.locator('p').count(),3);
 const text=await body.textContent();
 for(const detail of ['另一端已经连着','不能跳过骑士凭空新起一段路','即使都是自己的也不行','already connects','cannot share an intersection'])assert(text.includes(detail),detail);
 assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));
 await body.evaluate(el=>el.scrollTop=el.scrollHeight);
 assert(await body.locator('p').last().evaluate(el=>{const r=el.getBoundingClientRect(),b=el.parentElement.getBoundingClientRect();return r.bottom<=b.bottom+1;}));
 await page.screenshot({path:path.join(__dirname,`test-results/catan-knight-help-${page.viewportSize().width}.png`)});
 await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
}
async function checkMapWalls(page){
 const walls=await page.evaluate(()=>room.game.board.vertices.filter(v=>v.wall).map(v=>v.id));
 assert.equal(await page.locator('#board .cities-map-wall').count(),walls.length);
 for(const id of walls){
  const wall=page.locator(`#board [data-wall-vertex="${id}"]`);
  assert.equal(await wall.getAttribute('data-cities-info'),'wall');assert.equal(await wall.getAttribute('tabindex'),'0');
  assert.equal(await wall.locator('use').getAttribute('href'),'catan-cities-art.svg#wall-map');
  assert.equal(await wall.locator('rect').getAttribute('fill'),'transparent');
 }
 const metropolis=page.locator('#board [data-cities-info="metropolis"]');
 assert(await metropolis.evaluate(el=>el.nextElementSibling.matches('.cities-map-wall')));
 const wall=page.locator('#board .cities-map-wall').first();
 await wall.evaluate(el=>el.scrollIntoView({block:'center',inline:'center',behavior:'instant'}));
 const clip=await wall.evaluate(el=>{
  const r=el.getBoundingClientRect(),scale=r.width/44;
  const x=Math.max(0,Math.floor(r.x-48*scale)),y=Math.max(0,Math.floor(r.y-65*scale));
  return {x,y,width:Math.min(innerWidth-x,140*scale),height:Math.min(innerHeight-y,120*scale)};
 });
 await page.screenshot({path:path.join(__dirname,`test-results/catan-map-wall-${page.viewportSize().width}.png`),clip});
 const before=await page.evaluate(()=>[room.game.revision,actionRequests.length]);
 await wall.press('Enter');await page.locator('#citiesInfoDialog[open]').waitFor();
 assert.match(await page.locator('#citiesInfoDialog').textContent(),/City wall/);await page.keyboard.press('Escape');
 assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
}
async function checkImprovementIcons(page){
 const rows=page.locator('.cities-player'),levels=await page.evaluate(()=>room.game.citiesKnights.players.map(p=>p.levels));
 for(const [b,name] of ['science','trade','politics'].entries()){
  const href=`catan-cities-art.svg#${name}`;
  assert.equal(await page.locator(`#actions .cities-action-info[data-cities-info="${name}"] use`).getAttribute('href'),href);
  for(let i=0;i<levels.length;i++){
   const cell=rows.nth(i).locator('.cities-level').nth(b),level=levels[i][b];
   assert.equal(await cell.locator('use').getAttribute('href'),href);
   assert.equal(await cell.locator('b').textContent(),`${level}级`);assert.equal(await cell.locator('small').textContent(),`Lv ${level}`);
   assert.match(await cell.getAttribute('aria-label'),new RegExp(`level: ${level} / 5`));
  }
 }
 assert.equal(await page.locator('#board [data-cities-info="merchant"] use').getAttribute('href'),'catan-cities-art.svg#merchant');
 assert.equal(await page.locator('#bank [data-cities-info="coin"] use').getAttribute('href'),'catan-cities-art.svg#coin');
 assert.equal(await page.locator('#bank [data-cities-info="cloth"] use').getAttribute('href'),'#catan-scenario-art-cloth');
 assert(await page.evaluate(()=>CatanCitiesUI.art('cloth','sample')===CatanScenarioUI.art('cloth','sample')));
 assert(await rows.evaluateAll(rows=>rows.every(row=>{
  const bounds=row.getBoundingClientRect(),cells=[...row.children].map(c=>c.getBoundingClientRect());
  return row.scrollWidth<=row.clientWidth+1&&cells.every((c,i)=>c.left>=bounds.left&&c.right<=bounds.right+1&&(!i||c.left>=cells[i-1].right))&&[...row.querySelectorAll('.cities-level')].every(c=>c.scrollWidth<=c.clientWidth+1);
 })),`Improvement rows fit at ${page.viewportSize().width}px`);
 await page.locator('.cities-status').screenshot({path:path.join(__dirname,`test-results/catan-improvement-levels-${page.viewportSize().width}.png`)});
 if(page.viewportSize().width===1440)await page.locator('#board [data-cities-info="merchant"]').screenshot({path:path.join(__dirname,'test-results/catan-merchant-token.png')});
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});
 let backend='',browser;server.stderr.on('data',c=>backend+=c);const errors=[];
 try{
  await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addInitScript(()=>{localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.sock=this;this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state')window.room=d;if(d.type==='error')window.serverError=d.message;});}send(data){const d=JSON.parse(data);if(d.type==='action')window.actionRequests.push(d.action);super.send(data);}};});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await page.addInitScript(()=>{for(const [name,handle] of [['CatanStatistics','testStats'],['CatanCitiesUI','testCities']]){let api;Object.defineProperty(window,name,{get:()=>api,set(value){api=value;const mount=api.mount;api.mount=(...args)=>window[handle]=mount(...args);}});}});
  await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);
  await page.locator('#previewBoard svg').waitFor();assert.equal(await page.locator('[data-edition="cities"]').getAttribute('class'),'selected');assert(await page.locator('[data-seats="6"]').isHidden());
  await page.click('#baseRules');await page.locator('#citiesRules[open]').waitFor();assert.equal(await page.locator('#citiesRules .cities-rule-cards section').count(),Object.keys(D.cards).length);assert(await page.locator('#citiesRules').evaluate(d=>d.classList.contains('bg-rules-dialog')));await page.keyboard.press('Escape');
  await importRoom(page,fixture());
  await page.locator('#citiesPanel').waitFor();assert.equal(await page.locator('.cities-progress button').count(),4);assert.equal(await page.locator('#bank .bank-item').count(),8);assert(await page.locator('[data-action="buyDevelopment"]').count()===0);
  assert.match(await page.locator('#players tr').first().locator('.development-count').getAttribute('aria-label'),/Progress cards: 5/);
  assert.match(await page.locator('#players tr').first().locator('.knight-count').textContent(),/2/);
  assert.deepEqual(await page.locator('#actions [data-action]').evaluateAll(bs=>bs.slice(0,13).map(b=>b.dataset.action)),['road','settlement','city','wall','recruitKnight','activateKnight','promoteKnight','moveKnight','improve0','improve1','improve2','merchant','trade']);
  assert.equal(await page.locator('#citiesPanel [data-group="recruit"],#citiesPanel [data-group="activate"],#citiesPanel [data-group="promote"],#citiesPanel [data-group="improvement"],#citiesPanel [data-group="move"]').count(),0);
  const wall=page.locator('#actions [data-action="wall"]');assert(await wall.isEnabled());assert.match(await wall.getAttribute('title'),/2 砖/);assert.equal(await page.locator('#actions [data-cities-info="wall"] use').getAttribute('href'),'catan-cities-art.svg#wall');assert.equal(await page.locator('#citiesPanel [data-group="wall"]').count(),0);
  await checkActionIconStates(page);
  await wall.click();assert.equal(await page.locator('[data-ck-choice^="wall:"]').count(),2);assert.match(await wall.getAttribute('class'),/selected/);
  await page.click('[data-action="road"]');assert.equal(await page.locator('[data-ck-choice]').count(),0);assert(!/selected/.test(await wall.getAttribute('class')));
  await wall.click();assert.equal(await page.locator('#actions .selected').count(),1);
  const beforeWall=await page.evaluate(()=>actionRequests.length);
  await page.locator('[data-ck-choice^="wall:"]').first().evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  await page.waitForFunction(()=>room.game.board.vertices.filter(v=>v.owner===0&&v.wall).length===1);
  assert.equal(await page.evaluate(()=>actionRequests.length),beforeWall+1);assert.equal(await page.evaluate(()=>room.game.players[0].resources[1]),1);assert.equal(await page.locator('.cities-dialog[open]').count(),0);assert(await wall.isDisabled());assert.equal(await page.locator('[data-ck-choice]').count(),0);assert(!/selected/.test(await wall.getAttribute('class')));
  await checkActionIconStates(page);
  await page.click('[data-action="improve0"]');await page.locator('.cities-dialog [data-play]').click();await page.waitForFunction(()=>room.game.citiesKnights.players[0].levels[0]===3);
  await page.click('[data-card="engineering"]');assert.match(await page.locator('.cities-dialog p').textContent(),/wall/);await page.locator('.cities-dialog [data-play]').click();await page.waitForFunction(()=>room.game.phase==='ckChoice');assert.equal(await page.locator('[data-ck-choice]').count(),1);await page.locator('[data-ck-choice]').first().press('Enter');await page.waitForFunction(()=>room.game.board.vertices.filter(v=>v.owner===0&&v.wall).length===2);assert.equal(await page.locator('.cities-dialog[open]').count(),0);assert.equal(await page.evaluate(()=>room.game.players[0].resources[1]),1);
  await page.click('[data-action="moveKnight"]');assert.match(await page.locator('#turnPrompt').textContent(),/Choose a highlighted knight/);
  const moving=page.locator('.cities-knight-move-target').first(),moveKey=await moving.getAttribute('data-ck-choice'),from=Number(moveKey.split(':')[1]);const beforeMove=await page.evaluate(()=>({board:room.game.board,resources:room.game.players[0].resources}));
  await moving.click();await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='moveKnight');assert.equal(await page.locator('.cities-dialog[open]').count(),0);assert.match(await page.locator('#turnPrompt').textContent(),/Choose the knight's destination/);
  await page.locator('.cities-knight-selected').click();await page.waitForFunction(()=>room.game.phase==='main');assert.deepEqual(await page.evaluate(()=>room.game.board),beforeMove.board);
  await page.click('[data-action="moveKnight"]');await page.locator(`[data-ck-choice="${moveKey}"]`).click();await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='moveKnight');
  const destination=page.locator('[data-ck-choice^="v:"]').first(),to=Number((await destination.getAttribute('data-ck-choice')).split(':')[1]);await destination.press('Enter');await page.waitForFunction(()=>room.game.phase==='main');
  assert.equal(await page.locator('.cities-dialog[open]').count(),0);assert(await page.evaluate(({from,to})=>!room.game.board.vertices[from].knight&&room.game.board.vertices[to].knight.owner===0&&!room.game.board.vertices[to].knight.active,{from,to}));assert.deepEqual(await page.evaluate(()=>room.game.players[0].resources),beforeMove.resources);
  let knightVertex=null;
  for(const group of ['recruit','activate','promote']){
   if(group==='activate')await page.setViewportSize({width:390,height:844});
   await page.click(`[data-action="${group}Knight"]`);
   const target=knightVertex===null?page.locator(`[data-ck-choice^="${group}:"]`).first():page.locator(`[data-ck-choice="${group}:${knightVertex}"]`);
   const choice=await target.getAttribute('data-ck-choice');knightVertex=Number(choice.split(':')[1]);
   const before=await page.evaluate(()=>({revision:room.game.revision,requests:actionRequests.length,resources:room.game.players[0].resources}));
   const expected=[...before.resources];for(const r of group==='activate'?[3]:[2,4])expected[r]--;
   if(group==='activate')await target.press(' ');
   else await target.evaluate(el=>{el.dispatchEvent(new MouseEvent('click',{bubbles:true}));el.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
   await page.waitForFunction(revision=>room.game.revision>revision,before.revision);
   assert.equal(await page.locator('.cities-dialog[open]').count(),0);assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+1);assert.deepEqual(await page.evaluate(()=>room.game.players[0].resources),expected);
   const knight=await page.evaluate(v=>room.game.board.vertices[v].knight,knightVertex);assert.equal(knight.owner,0);assert.equal(knight.rank,group==='promote'?2:1);assert.equal(knight.active,group!=='recruit');
  }
  await page.setViewportSize({width:1440,height:1000});
  const beforeSmith=await page.evaluate(()=>room.game.players[0].resources);
  await page.click('[data-card="smithing"]');await page.locator('.cities-dialog [data-play]').click();await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='smithing');
  await page.locator('[data-ck-choice]').first().click();await page.waitForFunction(()=>room.game.board.vertices.some(v=>v.knight?.owner===0&&v.knight.rank===3));assert.equal(await page.locator('.cities-dialog[open]').count(),0);await page.locator('[data-choice="done"]').click();await page.waitForFunction(()=>room.game.phase==='main');assert.deepEqual(await page.evaluate(()=>room.game.players[0].resources),beforeSmith);
  await page.click('[data-action="trade"]');assert.equal(await page.locator('#tradeGive option:not([disabled])').count(),8);await page.keyboard.press('Escape');
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await checkCosts(page,true,false);await checkFleet(page);await checkEventDie(page,'science');
   for(const [name,text] of [['paper','forest'],['cloth','pasture'],['coin','mountain'],['knight','barbarians'],['merchant','2:1'],['wall','discarding'],['metropolis','4 total'],['science','Aqueduct'],['trade','2 identical commodities'],['politics','mighty']]){
    const before=await page.evaluate(()=>[room.game.revision,actionRequests.length]);
    const target=page.locator(`${['merchant','wall','metropolis'].includes(name)?'#board':['paper','cloth','coin'].includes(name)?'#bank':'#actions'} [data-cities-info="${name}"]`).first();assert.equal(await target.evaluate(el=>getComputedStyle(el).cursor),'help');if(['merchant','wall','metropolis'].includes(name))await target.click();else await target.press('Enter');
    const dialog=page.locator('#citiesInfoDialog[open]');await dialog.waitFor();assert.match(await dialog.textContent(),new RegExp(text));assert.equal(await dialog.locator('[data-play]').count(),0);assert(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
   }
   assert.equal(await page.locator('#actions .cities-action-help svg').count(),4);
   assert(await page.locator('#actions .cities-improvement-item [data-action]').evaluateAll(bs=>bs.every(b=>b.scrollWidth<=b.clientWidth+1)));
   await page.locator('#actions').screenshot({path:path.join(__dirname,`test-results/catan-improvement-help-${width}.png`)});
   await checkImprovementIcons(page);await checkMapWalls(page);await checkKnightHelp(page);
   for(const selector of ['#board [data-cities-info="knight"]','#resources [data-cities-info="cloth"]','#bank [data-cities-info="coin"]','#citiesPanel [data-cities-info="science"]','#actions [data-cities-info="wall"]']){
    const before=await page.evaluate(()=>[room.game.revision,actionRequests.length]);await page.locator(selector).first().click();await page.locator('#citiesInfoDialog[open]').waitFor();assert(await page.locator('#citiesInfoDialog').evaluate(d=>{const r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}));await page.keyboard.press('Escape');assert.deepEqual(await page.evaluate(()=>[room.game.revision,actionRequests.length]),before);
   }
   await page.screenshot({path:path.join(__dirname,`test-results/catan-cities-${width}.png`),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await wall.evaluate(b=>b.scrollWidth<=b.clientWidth+1));await page.click('#gameBaseRules');await page.locator('#citiesRules[open]').waitFor();assert(await page.locator('#citiesRules').evaluate(d=>d.scrollWidth<=d.clientWidth+1));const before=await page.evaluate(()=>room.game.revision);await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>room.game.revision),before);
  }
  for(const [event,rolled] of [['ship',true],['trade',true],['politics',true],['science',false]]){
   const dicePage=await context.newPage();dicePage.on('pageerror',e=>errors.push(e.message));await dicePage.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await dicePage.waitForFunction(()=>window.sock?.readyState===1);await importRoom(dicePage,fixture(false,false,{event,rolled}));
   for(const width of [1440,390,320]){await dicePage.setViewportSize({width,height:900});await checkEventDie(dicePage,rolled?event:'');}
   if(!rolled){await dicePage.click('#actions [data-action="roll"]');await dicePage.waitForFunction(()=>room.game.dice.length===2);for(let i=0;i<5;i++)if(await dicePage.locator('dialog[open]').count())await dicePage.keyboard.press('Escape');await checkEventDie(dicePage,await dicePage.evaluate(()=>room.game.citiesKnights.event));}
   assert.equal(await dicePage.evaluate(()=>window.serverError||''),'');await dicePage.close();
  }
  const audio=await context.request.get(`http://127.0.0.1:${port}/audio/peritune-strategy.mp3`);assert.equal(audio.status(),200);assert((await audio.body()).length>100000);
  await page.evaluate(game=>testStats.sync({code:'FINISHED',game}),fixture(true));await page.locator('#statisticsDialog[open]').waitFor();
  await page.click('#statsTab-resources');assert.equal(await page.locator('.stats-bar-legend > span').count(),8);assert.match(await page.locator('#statisticsBody').textContent(),/Coin/);
  await page.screenshot({path:path.join(__dirname,'test-results/catan-cities-statistics.png'),fullPage:true});await page.keyboard.press('Escape');
  const raid=await context.newPage();raid.on('pageerror',e=>errors.push(e.message));await raid.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await raid.waitForFunction(()=>window.sock?.readyState===1);await importRoom(raid,fixture(false,true));
  assert.equal(await raid.locator('[data-ck-choice]').count(),2);assert(await raid.locator('[data-action="wall"]').isDisabled());assert.equal(await raid.locator('#citiesFleet').getAttribute('data-position'),'7');assert.match(await raid.locator('#citiesFleet').textContent(),/resolving/);
  const target=raid.locator('[data-ck-choice]').first();assert.equal(await target.getAttribute('aria-label'),'降为村庄 / Downgrade');const choice=await target.getAttribute('data-ck-choice');const site=Number(choice.split(':')[1]);const resources=await raid.evaluate(()=>room.game.players[0].resources);
  await target.click();await raid.waitForFunction(site=>room.game.board.vertices[site].level===1,site);assert.equal(await raid.locator('.cities-dialog[open]').count(),0);assert.equal(await raid.evaluate(()=>actionRequests.length),1);assert.equal(await raid.evaluate(site=>!!room.game.board.vertices[site].wall,site),false);assert.equal(await raid.locator(`[data-wall-vertex="${site}"]`).count(),0);assert.deepEqual(await raid.evaluate(()=>room.game.players[0].resources),resources);assert.equal(await raid.evaluate(()=>room.game.phase),'main');assert.equal(await raid.evaluate(()=>window.serverError||''),'');await raid.close();
  for(const mapId of ['base','shores-1'])for(const phase of ['setupSettlement','setupRoad','main','robber','freeRoads']){
   const costsPage=await context.newPage();costsPage.on('pageerror',e=>errors.push(e.message));await costsPage.goto(`http://127.0.0.1:${port}/catan.html`);await costsPage.waitForFunction(()=>window.sock?.readyState===1);await importRoom(costsPage,costFixture(mapId,phase));
   for(const width of [1440,390,320]){await costsPage.setViewportSize({width,height:900});await checkCosts(costsPage,false,mapId!=='base');if(mapId!=='base'&&['setupRoad','freeRoads'].includes(phase)){assert(await costsPage.locator('#actions [data-action="road"]').isVisible());assert(await costsPage.locator('#actions [data-action="ship"]').isVisible());}}
   assert(await costsPage.locator('#citiesFleet').isHidden());assert.equal(await costsPage.locator('#dice .die').count(),2);assert.equal(await costsPage.locator('#dice .cities-event-die').count(),0);assert.equal(await costsPage.evaluate(()=>window.serverError||''),'');await costsPage.close();
  }
  assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>window.serverError||''),'');assert.equal(backend,'');console.log('Cities & Knights: direct recruit/activate/promote, free promotion, walls and downgrade OK; all editions: desktop/mobile costs first, normal rules restored and no game mutations OK');
 }finally{await browser?.close();server.kill();await once(server,'exit');}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,importRoom};
