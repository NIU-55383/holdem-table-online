"use strict";
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),{once}=require('node:events'),{spawn}=require('node:child_process');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const {fixture,importRoom}=require('./catan-cities-ui-test'),A=require('./room-archive'),D=require('./catan-cities-data'),E=require('./catan-engine');
function rollFixture(){const saved=A.decode(fixture(false,false,{rolled:false}),['catan']).room,g=saved.game;g.cities.alchemy=[1,2];for(const card of g.cities.players[0].cards.splice(1))g.cities.decks[D.cards[card.key][0]].push(card.key);g.cities.players.slice(1).forEach(p=>p.levels[0]=0);g.board.vertices.filter(v=>v.owner!==0&&v.metropolis===0).forEach(v=>delete v.metropolis);return A.encode('catan',saved);}
async function installMonitor(page){
 await page.evaluate(()=>{
  window.renderWatch={report:[]};
  window.startRenderWatch=(name,exclude=[])=>{
   const card=room.game.citiesKnights.players[room.you].cards.find(c=>c.key==='engineering');
   const selectors={headerSettings:'#audioSettings svg',headerRules:'#helpButton svg',board:'#board > svg',terrain:'#board .hex-tile .hex-land',knight:'#board .cities-knight-piece use',wood:'#resources [data-resource="0"] svg',coin:'#resources [data-resource="7"] svg',road:'#actions [data-action="road"] svg',knightAction:'#actions [data-cities-info="knight"] svg',scienceAction:'#actions [data-cities-info="science"] svg',progress:`#citiesPanel [data-card-id="${card.id}"] .cities-card-art`,progressHelp:'#citiesPanel [data-progress-catalog] svg'};
   for(const key of exclude)delete selectors[key];
   const roots={header:document.querySelector('.island-header'),board:document.querySelector('#board'),resources:document.querySelector('#resources'),actions:document.querySelector('#actions'),cities:document.querySelector('#citiesPanel')};
   const nodes=Object.fromEntries(Object.entries(selectors).map(([key,selector])=>[key,document.querySelector(selector)]));
   const geometry=Object.values(nodes).flatMap(node=>node?[...(node.matches('use')?[node]:[]),...node.querySelectorAll('use')].filter(use=>!use.getAttribute('href')?.startsWith('#')):[]);
   const m=renderWatch.current={name,selectors,nodes,geometry,frames:0,blankFrames:0,missingFrames:0,retainedRemovals:[],removed:{header:0,board:0,resources:0,actions:0,cities:0},active:true};
   m.observer=new MutationObserver(records=>{for(const record of records){const region=Object.keys(roots).find(key=>roots[key].contains(record.target));if(!region)continue;for(const node of record.removedNodes)if(node.nodeType===1){m.removed[region]+=(node.matches('svg,use')?1:0)+node.querySelectorAll('svg,use').length;for(const [key,kept] of Object.entries(m.nodes))if(kept&&(node===kept||node.contains(kept)))m.retainedRemovals.push(key);}}});
   for(const root of Object.values(roots))m.observer.observe(root,{childList:true,subtree:true});
   const frame=()=>{if(!m.active)return;m.frames++;if(Object.values(m.nodes).some(node=>!node?.isConnected))m.missingFrames++;if(m.geometry.some(node=>{if(!node.isConnected)return false;const box=node.getBBox();return !box.width||!box.height;}))m.blankFrames++;requestAnimationFrame(frame);};requestAnimationFrame(frame);
  };
  window.finishRenderWatch=async()=>{const m=renderWatch.current;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));m.active=false;m.observer.disconnect();const result={name:m.name,frames:m.frames,blankFrames:m.blankFrames,missingFrames:m.missingFrames,retainedRemovals:m.retainedRemovals,removed:m.removed,stable:Object.fromEntries(Object.entries(m.nodes).map(([key,node])=>[key,!!node&&node===document.querySelector(m.selectors[key])&&node.isConnected]))};renderWatch.report.push(result);return result;};
 });
}
async function readyIcons(page){await page.waitForFunction(()=>[...document.querySelectorAll('#board .cities-knight-piece use,#resources use,#actions use,#citiesPanel use')].every(use=>{const box=use.getBBox();return box.width>0&&box.height>0;}));}
async function watch(page,name,run,exclude=[]){
 await readyIcons(page);await page.evaluate(({name,exclude})=>startRenderWatch(name,exclude),{name,exclude});await run();const report=await page.evaluate(()=>finishRenderWatch());
 assert(Object.values(report.stable).every(Boolean),`${name}: unchanged icon nodes replaced: ${JSON.stringify(report)}`);assert.deepEqual(report.retainedRemovals,[],`${name}: retained icons must not be detached/reinserted`);assert.equal(report.missingFrames,0,`${name}: retained icons detached during a frame`);assert.equal(report.blankFrames,0,`${name}: retained external SVG icons had empty geometry`);return report;
}
async function checkHand(page){assert.deepEqual(await page.locator('#resources [data-resource]').evaluateAll(nodes=>{const counts=Array(8).fill(0);nodes.forEach(node=>counts[Number(node.dataset.resource)]++);return counts;}),await page.evaluate(()=>room.game.players[room.you].resources),'rendered hand must match all eight actual resource/commodity counts');}
async function makePage(browser,port,width,errors,archive=fixture()){
 const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===320});await context.addInitScript(()=>{
  localStorage.setItem('catan-music-enabled','false');window.actionRequests=[];window.stateMessages=0;const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.sock=this;this.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.type==='state'){window.room=d;window.stateMessages++;}if(d.type==='error')window.serverError=d.message;});}send(data){const d=JSON.parse(data);if(d.type==='action')actionRequests.push(d.action);super.send(data);}};
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.stack||error.message));page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});await page.goto(`http://127.0.0.1:${port}/catan.html?edition=cities`);await page.waitForFunction(()=>window.sock?.readyState===1);await importRoom(page,archive);await installMonitor(page);await readyIcons(page);return{page,context};
}
async function checkMain(browser,port,width,errors){
 const {page,context}=await makePage(browser,port,width,errors),reports=[];
 try{
  await checkHand(page);const beforeRead=await page.evaluate(()=>({revision:room.game.revision,requests:actionRequests.length}));
  reports.push(await watch(page,'chat broadcast',async()=>{const messages=await page.evaluate(()=>{const n=stateMessages;sock.send(JSON.stringify({type:'chat',text:'Stable render regression'}));return n;});await page.waitForFunction(n=>stateMessages>n,messages);}));
  reports.push(await watch(page,'profile broadcast',async()=>{const messages=await page.evaluate(()=>{const n=stateMessages;sock.send(JSON.stringify({type:'profile',avatar:{kind:'emoji',value:'🌟'}}));return n;});await page.waitForFunction(n=>stateMessages>n,messages);}));
  assert.deepEqual(await page.evaluate(()=>({revision:room.game.revision,requests:actionRequests.length})),beforeRead);
  reports.push(await watch(page,'local knight mode',()=>page.click('[data-action="moveKnight"]')));assert(await page.locator('.cities-knight-move-target').count()>0);assert(await page.locator('[data-action="moveKnight"]').evaluate(button=>button.classList.contains('selected')));
  const paper=await page.evaluate(()=>room.game.players[room.you].resources[5]);
  reports.push(await watch(page,'science upgrade',async()=>{await page.click('[data-action="improve0"]');await page.locator('#citiesConfirm [data-play]').click();await page.waitForFunction(()=>room.game.citiesKnights.players[room.you].levels[0]===3);}));
  assert.equal(await page.evaluate(()=>room.game.players[room.you].resources[5]),paper-3);assert.equal(await page.locator('#resources [data-resource="5"]').count(),0);assert.match(await page.locator('#citiesStatus .cities-player').first().locator('.cities-level').first().innerText(),/3/);await checkHand(page);
  const beforeTrade=await page.evaluate(()=>({resources:room.game.players[room.you].resources,revision:room.game.revision}));
  reports.push(await watch(page,'commodity trade',async()=>{await page.evaluate(()=>sock.send(JSON.stringify({type:'action',action:{type:'bankTrade',give:7,get:0}})));await page.waitForFunction(revision=>room.game.revision>revision,beforeTrade.revision);}));
  assert.equal(await page.locator('#resources [data-resource="7"]').count(),beforeTrade.resources[7]-2);assert.equal(await page.locator('#resources [data-resource="0"]').count(),beforeTrade.resources[0]+1);await checkHand(page);
  const beforeCards=await page.evaluate(()=>room.game.citiesKnights.players[room.you].cards.length);
  reports.push(await watch(page,'play one progress card',async()=>{await page.locator('[data-card="crane"]').click();await page.locator('#citiesConfirm [data-play]').click();await page.waitForFunction(()=>!room.game.citiesKnights.players[room.you].cards.some(c=>c.key==='crane'));}));
  assert.equal(await page.locator('#citiesPanel [data-card]').count(),beforeCards-1);assert.equal(await page.locator('[data-card="crane"]').count(),0);assert.equal(await page.locator('[data-card="engineering"]').getAttribute('data-ready'),'true');
  await page.click('[data-action="moveKnight"]');const source=page.locator('.cities-knight-move-target').first(),from=Number((await source.getAttribute('data-ck-choice')).split(':')[1]);await source.press('Enter');await page.waitForFunction(()=>room.game.citiesKnights.choice?.kind==='moveKnight');
  const destination=page.locator('[data-ck-choice^="v:"]').first(),to=Number((await destination.getAttribute('data-ck-choice')).split(':')[1]);
  reports.push(await watch(page,'move knight updates board',async()=>{await destination.press('Enter');await page.waitForFunction(()=>room.game.phase==='main');},['knight']));
  assert(await page.evaluate(({from,to})=>!room.game.board.vertices[from].knight&&room.game.board.vertices[to].knight?.owner===room.you&&!room.game.board.vertices[to].knight.active,{from,to}));
  const target=await page.evaluate(to=>room.game.board.vertices[to],to);assert(await page.locator('#board .cities-knight-piece').evaluateAll((nodes,v)=>nodes.some(node=>Number(node.querySelector('circle').getAttribute('cx'))===v.x),target));
  assert.equal(await page.evaluate(()=>window.serverError||''),'');await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(__dirname,`test-results/catan-render-stable-${width}.png`)});console.log(`${width}px stable render: chat/profile/local mode/upgrade/trade/card use/knight move passed`);return reports.map(report=>({width,...report}));
 }finally{await context.close();}
}
async function checkRoll(browser,port,width,errors){
 const {page,context}=await makePage(browser,port,width,errors,rollFixture());
 try{
  assert.equal(await page.locator('[data-card="engineering"]').getAttribute('data-ready'),'false');
  const report=await watch(page,'roll dice',async()=>{await page.click('[data-action="roll"]');await page.waitForFunction(()=>room.game.dice.length===2&&room.game.phase==='main');});
  assert.deepEqual(await page.evaluate(()=>room.game.dice),[1,2]);assert.deepEqual(await page.locator('#dice > .die').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-label'))),['1','2']);assert.equal(await page.locator('[data-action="roll"]').count(),0);assert(await page.locator('[data-action="end"]').isEnabled());assert.equal(await page.locator('[data-card="engineering"]').getAttribute('data-ready'),'true');await checkHand(page);
  assert.equal(await page.locator('#board .hex-tile.producing').count(),await page.evaluate(()=>room.game.board.tiles.filter(tile=>tile.number===3&&tile.id!==room.game.board.robber).length));assert.equal(await page.evaluate(()=>window.serverError||''),'');console.log(`${width}px roll: unchanged icons retained while dice/production/hand/card availability update`);return{width,...report};
 }finally{await context.close();}
}
async function checkBaseDevelopment(browser,port,errors){
 let seed=37;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),game=E.createGame(['Human','Bot A','Bot B'],random,'base');
 while(game.phase.startsWith('setup'))E.act(game,game.current,E.chooseBotAction(game,game.current,random),random);
 game.current=0;game.phase='main';game.rolled=true;game.dice=[3,2];
 for(const type of ['plenty','monopoly']){const index=game.deck.indexOf(type);assert(index>=0);game.deck.splice(index,1);game.players[0].development.push({type,turn:0});}
 const archive=A.encode('catan',{mapId:'base',layout:'default',thieves:'both',maxPlayers:3,seats:game.players.map((player,index)=>({name:player.name,position:index})),game});
 const {page,context}=await makePage(browser,port,1440,errors,archive);
 try{
  assert(await page.locator('[data-dev="plenty"]').isEnabled());assert(await page.locator('[data-dev="monopoly"]').isEnabled());assert.equal(await page.locator('[data-dev="monopoly"]').getAttribute('data-dev-index'),'1');
  const before=await page.evaluate(()=>{
   const button=document.querySelector('[data-dev="monopoly"]'),svg=button.querySelector('svg'),use=svg.querySelector('use');window.baseCardWatch={button,svg,use,removed:0,blank:0,active:true};
   const m=baseCardWatch;m.observer=new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node.nodeType===1&&[button,svg,use].some(kept=>node===kept||node.contains(kept)))m.removed++;});m.observer.observe(document.querySelector('#development'),{childList:true,subtree:true});
   const frame=()=>{if(!m.active)return;const box=use.getBBox();if(!button.isConnected||!box.width||!box.height)m.blank++;requestAnimationFrame(frame);};requestAnimationFrame(frame);
   return{requests:actionRequests.length,resources:room.game.players[room.you].resources};
  });
  await page.locator('[data-dev="plenty"]').click();await page.waitForFunction(()=>room.game.phase==='plenty');assert.equal(await page.locator('[data-dev="plenty"]').count(),0);assert(await page.locator('[data-dev="monopoly"]').isDisabled());assert.equal(await page.locator('[data-dev="monopoly"]').getAttribute('data-dev-index'),'0');
  await page.locator('[data-special="plenty"]').click();await page.locator('[data-add-resource="0"]').click();await page.locator('[data-add-resource="1"]').click();await page.click('#confirmResources');await page.waitForFunction(()=>room.game.phase==='main');
  assert.deepEqual(await page.evaluate(()=>room.game.players[room.you].development.map(card=>card.type)),['monopoly']);assert(await page.locator('[data-dev="monopoly"]').isDisabled(),'a second development card cannot be used in the same turn');assert.match(await page.locator('[data-dev="monopoly"]').innerText(),/垄断|Monopoly/);
  assert.deepEqual(await page.evaluate(()=>room.game.players[room.you].resources),before.resources.map((n,r)=>n+(r<2?1:0)));assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+2);await page.locator('[data-dev="monopoly"]').evaluate(button=>button.click());assert.equal(await page.evaluate(()=>actionRequests.length),before.requests+2);
  const report=await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const m=baseCardWatch;m.active=false;m.observer.disconnect();const button=document.querySelector('[data-dev="monopoly"]');return{name:'base development removal',width:1440,stable:button===m.button&&button.querySelector('svg')===m.svg&&button.querySelector('use')===m.use,retainedRemovals:m.removed,blankFrames:m.blank};});
  assert.equal(report.stable,true,'removing the first card retains the second button/svg/use despite its index changing');assert.equal(report.retainedRemovals,0);assert.equal(report.blankFrames,0);assert.equal(await page.evaluate(()=>window.serverError||''),'');console.log('Base development removal: Plenty fully used; Monopoly button/SVG/use retained, index 1 to 0, correctly disabled for this turn');return report;
 }finally{await context.close();}
}
async function main(){
 const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
 const server=spawn(process.execPath,[require.resolve('./server')],{windowsHide:true,env:{...process.env,PORT:String(port),LOCAL_ONLY:'1',AUTO_OPEN:'0',CATAN_BOT_DELAY:'600000'},stdio:['ignore','pipe','pipe']});let browser,backend='';const errors=[],reports=[],baseOnly=process.argv.includes('--base-only');server.stderr.on('data',chunk=>backend+=chunk);
 try{await once(server.stdout,'data');browser=await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});if(!baseOnly)for(const width of [1440,320]){reports.push(...await checkMain(browser,port,width,errors));reports.push(await checkRoll(browser,port,width,errors));}reports.push(await checkBaseDevelopment(browser,port,errors));assert.deepEqual(errors,[]);assert.equal(backend,'');fs.writeFileSync(path.join(__dirname,baseOnly?'test-results/catan-render-base-stability.json':'test-results/catan-render-stability.json'),JSON.stringify(reports,null,2));console.log('Catan stable rendering passed: retained icons never detach or have empty geometry; real game changes remain visible.');}
 catch(error){console.error('Browser/server errors',errors,backend);throw error;}finally{await browser?.close();if(server.exitCode===null){const ended=once(server,'exit');server.kill();await ended;}}
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
