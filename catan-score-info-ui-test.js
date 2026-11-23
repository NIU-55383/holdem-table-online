"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('./catan-engine'),Maps=require('./catan-maps');
let pw;try{pw=require('playwright');}catch{pw=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
const seeded=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const allCases=[{mapId:'base',count:3},{mapId:'base',count:6},{mapId:'cities',count:3},...Maps.allMaps.map(map=>({mapId:map.id,count:map.minPlayers||map.players}))];
const captureMaps=new Set(['base','cities','cities-shores-1','tribes','cloth','pirates','wonders','new-world']);
function fixture(mapId,count=3){
  const names=['Alice <b>','David','Colin','Dora','Erin','Finn'].slice(0,count),g=E.createGame(names,seeded(37),mapId);
  Object.assign(g,{phase:'main',current:0,turn:3,rolled:true,dice:[2,3]});
  g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;delete v.metropolis;delete v.knight;});
  g.board.edges.forEach(e=>e.owner=-1);
  if(g.scenario){g.scenario.pending=null;g.scenario.actor=null;}
  const forbidden=new Set((g.scenario?.pirateSeats||[]).map(s=>s.fortress));
  const land=g.board.vertices.filter(v=>!forbidden.has(v.id)&&v.tiles.some(i=>g.board.tiles[i].resource>=-1));
  [[0,1],[0,1],[0,2],[0,2],[1,1],[1,2]].forEach(([owner,level],i)=>Object.assign(land[i],{owner,level}));
  if(!['cloth','pirates'].includes(g.scenario?.kind)){g.longest=0;g.roadLengths[0]=6;}
  if(!g.cities&&g.scenario?.kind!=='pirates'){g.largest=0;g.players[0].knights=3;}
  if(g.cities){
    const own=g.cities.players[0];own.levels=[4,0,0];own.defenders=2;own.revealed=['printing','constitution'];
    g.cities.players[1].defenders=1;land[2].metropolis=0;
    g.cities.merchant={owner:0,tile:g.board.tiles.find(t=>t.resource>=0&&t.resource<5).id};
  }else if(g.scenario?.kind!=='pirates'){
    g.players[0].development.push({type:'vp',turn:0});
    g.players[1].development.push({type:'vp',turn:0},{type:'vp',turn:0});
  }
  const map=Maps.get(mapId);
  if(map?.bonusPoints&&!['wonders'].includes(g.scenario?.kind)){g.players[0].discovered=[900,901];g.players[1].discovered=[902];}
  if(g.scenario?.kind==='tribes'){g.players[0].scenarioPoints=3;g.players[1].scenarioPoints=1;}
  if(g.scenario?.kind==='cloth'){g.players[0].cloth=5;g.players[1].cloth=3;}
  if(g.scenario?.kind==='wonders'){g.players[0].scenarioPoints=2;g.players[1].scenarioPoints=1;g.players[0].wonder={id:g.scenario.wonderCards[0].id,stage:3};}
  if(g.scenario?.kind==='pirates'){
    const s=g.scenario.pirateSeats[0];s.liberated=true;s.strength=0;Object.assign(g.board.vertices[s.fortress],{owner:0,level:1});
  }
  return g;
}
function snapshot(g,you=0){return{type:'state',code:`SCORE-${g.mapId}-${g.players.length}`,mapId:g.mapId,layout:g.layout,you,host:0,maxPlayers:g.players.length,chat:[],seats:g.players.map(p=>({name:p.name,socialId:`score-${p.id}`,position:p.id,connected:true,bot:false,auto:false})),game:E.publicGame(g,you)};}
function expected(g,id,you=0){
  const p=g.players[id],own=g.board.vertices.filter(v=>v.owner===id),out={};
  const add=(key,n)=>{if(n)out[key]=n;};
  add('settlements',own.filter(v=>v.level===1).length);add('cities',own.filter(v=>v.level===2).length*2);
  add('longestRoad',g.longest===id?2:0);add('largestArmy',g.largest===id?2:0);
  add('islands',p.discovered.length*(g.scenario?.kind==='new-world'?1:2));
  if(g.scenario?.kind==='tribes')add('tribes',p.scenarioPoints);
  if(g.scenario?.kind==='cloth')add('cloth',Math.floor(p.cloth/2));
  if(g.scenario?.kind==='wonders')add('wondersSettlements',p.scenarioPoints);
  if(g.cities){
    add('metropolis',own.filter(v=>v.level===2&&v.metropolis!=null).length*2);add('merchant',g.cities.merchant?.owner===id?1:0);
    add('progressPrinting',g.cities.players[id].revealed.filter(k=>k==='printing').length);add('progressConstitution',g.cities.players[id].revealed.filter(k=>k==='constitution').length);
    add('defenders',g.cities.players[id].defenders);
  }else if(id===you||g.phase==='over')add('developmentVP',p.development.filter(c=>c.type==='vp').length);
  assert.equal(Object.values(out).reduce((a,b)=>a+b,0),E.score(g,id,id===you||g.phase==='over'),'Fixture breakdown must independently match the engine');
  return out;
}
async function assertBreakdown(page,g,id,you=0){
  const dialog=page.locator('#scoreInfoDialog');await dialog.waitFor({state:'visible'});
  assert.match(await page.locator('#scoreInfoTitle').innerText(),/得分明细[\s\S]*Score breakdown/);
  const actual=await dialog.locator('[data-score-source]').evaluateAll(nodes=>nodes.map(n=>({key:n.dataset.scoreSource,points:Number(n.dataset.scorePoints),tag:n.tagName,parent:n.parentElement.tagName,en:n.querySelector('small')?.textContent,zh:[...n.childNodes].filter(c=>c.nodeType===3).map(c=>c.textContent).join(''),text:n.textContent})));
  assert.deepEqual(Object.fromEntries(actual.map(i=>[i.key,i.points])),expected(g,id,you),`${g.mapId} seat ${id}: every source is listed exactly once`);
  assert.equal(new Set(actual.map(i=>i.key)).size,actual.length,'No duplicate sources');
  assert(actual.every(i=>i.tag==='LI'&&['UL','OL'].includes(i.parent)&&i.points>0&&/[A-Za-z]/.test(i.en||'')&&/[\u3400-\u9fff]/.test(i.text)), 'All positive sources are readable bilingual bullet points');
  const total=E.publicGame(g,you).players[id].score;
  assert.equal(Number(await dialog.locator('[data-score-total]').getAttribute('data-score-total')),total);
  assert.equal(actual.reduce((n,i)=>n+i.points,0),total,'All visible sources add to the displayed total');
  const publicOnly=!g.cities&&id!==you&&g.phase!=='over';
  assert.equal(await dialog.locator('[data-score-total]').getAttribute('data-score-visibility'),publicOnly?'public':'total');
  if(publicOnly){assert.equal(await dialog.locator('[data-score-source="developmentVP"]').count(),0);assert.match(await dialog.innerText(),/公开[\s\S]*[Pp]ublic/);}
  assert.equal(await dialog.locator('[data-rule-section="saves"]').count(),0);
  assert(!/其他得分|other sources/i.test(await dialog.innerText()),'The complete breakdown does not hide sources in an other-points subtotal');
  if(id===0)assert((await dialog.innerText()).includes('Alice <b>'),'Player names stay escaped');
  assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),'Dialog stays within the viewport');
  return actual;
}
async function closeDialogs(page){for(let i=0;i<6;i++){if(!await page.locator('dialog[open]').count())return;await page.keyboard.press('Escape');}}
test('all Catan score sources are complete, private, live and readable on desktop and mobile',{timeout:240000},async()=>{
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],reports=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem('catan-music-enabled','false');window.sent=[];window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;window.testSocket=this;setTimeout(()=>this.dispatchEvent(new Event('open')),0);}send(data){window.sent.push(JSON.parse(data));}close(){this.readyState=3;}emit(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}};});
    await page.route('http://catan.test/**',route=>{const url=new URL(route.request().url());if(url.pathname==='/api/catan-preview')return route.fulfill({json:E.makeBoard(seeded(37),url.searchParams.get('map')||'base')});const file=path.join(__dirname,url.pathname.slice(1));if(!fs.existsSync(file))return route.fulfill({status:404,body:''});return route.fulfill({body:fs.readFileSync(file),contentType:{'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream'});});
    await page.goto('http://catan.test/catan.html');await page.evaluate(()=>testSocket.emit({type:'welcome',token:'score-test'}));
    const emit=async(g,you=0)=>page.evaluate(data=>testSocket.emit(data),snapshot(g,you));
    for(const {mapId,count} of allCases){
      const g=fixture(mapId,count);await emit(g);await closeDialogs(page);
      assert.equal(await page.locator('#players [data-score-info]').count(),count,`${mapId}: every player has a score entry, including zero bonuses`);
      for(const width of [1440,320]){
        await page.setViewportSize({width,height:width===320?568:1000});
        for(const id of [0,1,2]){
          const before=await page.evaluate(()=>JSON.stringify(sent)),button=page.locator(`#players [data-score-info="${id}"]`);
          assert.equal(await button.locator('svg').count(),1);assert.equal(await button.evaluate(el=>getComputedStyle(el).cursor),'help');
          if(width===1440)await button.press(id===1?' ':'Enter');else await button.click();
          const actual=await assertBreakdown(page,g,id);
          if(mapId==='cities'||mapId.startsWith('cities-')){
            assert.equal(await page.locator('[data-score-source="largestArmy"]').count(),0,'Cities & Knights has no Largest Army award');
            if(id===0){assert.equal(actual.find(i=>i.key==='cities').points,4);assert.equal(actual.find(i=>i.key==='metropolis').points,2);}
          }
          if(mapId==='cloth')assert.equal(await page.locator('[data-score-source="longestRoad"]').count(),0,'Cloth scenario disables Longest Route');
          if(mapId==='pirates'){
            assert.equal(await page.locator('[data-score-source="longestRoad"],[data-score-source="largestArmy"],[data-score-source="developmentVP"]').count(),0);
            if(id===0){assert.equal(actual.find(i=>i.key==='settlements').points,3,'Liberated fortress is counted once as a settlement');assert.match(await page.locator('[data-score-source="settlements"]').innerText(),/要塞|[Ff]ortress/);}
          }
          if(mapId==='new-world'&&id===0)assert.equal(actual.find(i=>i.key==='islands').points,2,'New World grants one point per island');
          if(mapId==='wonders'&&id===0)assert.equal(actual.find(i=>i.key==='wondersSettlements').points,2,'Wonder stages do not add victory points');
          if(id===0&&captureMaps.has(mapId)&&count===3)await page.locator('#scoreInfoDialog').screenshot({path:path.join(__dirname,`test-results/catan-score-info-${mapId}-${width}.png`)});
          await page.keyboard.press('Escape');await page.locator('#scoreInfoDialog').waitFor({state:'hidden'});
          assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before,'Reading and closing score details sends no game or profile action');
        }
        assert(await page.locator('#players .summary-meta').evaluateAll(nodes=>nodes.every(el=>{const r=el.closest('th').getBoundingClientRect();return [...el.children].every(c=>c.getBoundingClientRect().right<=r.right+1)&&el.scrollWidth<=el.clientWidth+1;})),`${mapId}/${count}: score entries fit at ${width}px`);
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${mapId}: no horizontal page overflow`);
        reports.push({mapId,count,width,playersChecked:3});
      }
    }
    // A long combined breakdown scrolls independently, and both keyboard close and live score changes work.
    const live=fixture('cities-shores-1');await emit(live);await closeDialogs(page);await page.setViewportSize({width:320,height:568});
    const sentBefore=await page.evaluate(()=>JSON.stringify(sent));await page.locator('[data-score-info="0"]').press('Enter');await assertBreakdown(page,live,0);
    const details=page.locator('#scoreDefenderRules');assert.equal(await details.count(),1);await details.locator('summary').press('Enter');assert(await details.evaluate(d=>d.open));
    const body=page.locator('#scoreInfoContent');await body.focus();await page.keyboard.press('End');await page.waitForFunction(()=>{const el=document.querySelector('#scoreInfoContent');return el.scrollTop>0;});
    const scroll=await body.evaluate(e=>e.scrollTop);assert(scroll>0);const close=page.locator('#scoreInfoDialog [data-close]');assert(await close.isVisible());assert(await close.evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));
    await page.locator('#scoreInfoDialog').screenshot({path:path.join(__dirname,'test-results/catan-score-info-scrolled-320.png')});
    await emit(live);assert(await page.locator('#scoreInfoDialog').isVisible());
    live.cities.players[0].defenders++;live.cities.merchant.owner=1;live.longest=1;live.revision++;await emit(live);await assertBreakdown(page,live,0);
    assert.equal(await page.locator('[data-score-source="merchant"],[data-score-source="longestRoad"]').count(),0,'Lost awards disappear immediately');
    assert.equal(await page.locator('[data-score-source="defenders"]').getAttribute('data-score-points'),'3');
    await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>JSON.stringify(sent)),sentBefore);
    // Opponent information uses the server's private view, then becomes complete when the game is over.
    const base=fixture('base');await emit(base);await closeDialogs(page);await page.locator('[data-score-info="1"]').click();await assertBreakdown(page,base,1);
    base.phase='over';base.winner=0;base.revision++;await emit(base);await assertBreakdown(page,base,1);
    assert.equal(await page.locator('[data-score-source="developmentVP"]').getAttribute('data-score-points'),'2');
    await page.keyboard.press('Escape');await emit(fixture('cities'));await closeDialogs(page);await page.locator('[data-score-info="0"]').click();await emit(fixture('base'));
    assert.equal(await page.locator('#scoreInfoDialog').isVisible(),false,'Changing rooms cannot leave another room score details open');
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,'test-results/catan-score-info-matrix.json'),JSON.stringify(reports,null,2));
    console.log(`Score breakdown: ${allCases.length} map/player variants x 1440/320, all sources, public/hidden/revealed VP, zero score, live updates, scroll, keyboard and read-only behavior passed.`);
  }finally{await browser.close();}
});
