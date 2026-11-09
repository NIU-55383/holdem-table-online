"use strict";
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), E = require('./catan-engine');
let pw;try { pw = require('playwright'); } catch { pw = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')); }
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
function fixture(mapId) {
  const random = seeded(37), g = E.createGame(['Alice <b>', 'David', 'Colin'], random, mapId);
  while (g.phase.startsWith('setup')) E.act(g, g.current, E.chooseBotAction(g, g.current), random);
  g.phase = 'main';
  if (mapId === 'cities') {
    g.cities.players[0].defenders = 1;
    g.cities.players[1].defenders = 1;
    g.cities.players[1].revealed = ['constitution'];
  } else {
    g.players[0].development.push({type:'vp',turn:0});
    g.players[1].development.push({type:'vp',turn:0},{type:'vp',turn:0});
    if (mapId === 'tribes') { g.players[0].scenarioPoints = 2; g.players[1].scenarioPoints = 1; }
  }
  return g;
}
function snapshot(g) {
  return {type:'state',code:`SCORE-${g.mapId}`,mapId:g.mapId,layout:g.layout,you:0,host:0,maxPlayers:3,chat:[],
    seats:g.players.map(p=>({name:p.name,socialId:`score-${p.id}`,position:p.id,connected:true,bot:false,auto:false})),game:E.publicGame(g,0)};
}
test('score questions explain visible bonuses without revealing hidden VP cards', {timeout:90000}, async () => {
  fs.mkdirSync(path.join(__dirname,'test-results'),{recursive:true});
  const browser = await pw.chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      localStorage.setItem('catan-music-enabled','false');window.sent=[];
      window.WebSocket=class extends EventTarget {
        static OPEN=1;
        constructor(){super();this.readyState=1;window.testSocket=this;setTimeout(()=>this.dispatchEvent(new Event('open')),0);}
        send(data){window.sent.push(JSON.parse(data));}close(){this.readyState=3;}
        emit(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
      };
    });
    await page.route('http://catan.test/**',route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/catan-preview')return route.fulfill({json:E.makeBoard(seeded(37),url.searchParams.get('map')||'base')});
      const file=url.pathname.slice(1),contentType={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'}[path.extname(file)];
      return route.fulfill({body:fs.readFileSync(path.join(__dirname,file)),contentType});
    });
    await page.goto('http://catan.test/catan.html');
    await page.evaluate(()=>testSocket.emit({type:'welcome',token:'score-test'}));
    const emit=async g=>{await page.evaluate(data=>testSocket.emit(data),snapshot(g));};
    for(const mapId of ['cities','base','tribes']) {
      const g=fixture(mapId);await emit(g);
      for(let i=0;i<5;i++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
      assert.equal(await page.locator('#players [data-score-info]').count(),mapId==='base'?1:2);
      assert.equal(await page.locator('#players [data-player-id="2"] [data-score-info]').count(),0);
      for(const width of [1440,390,320]) {
        await page.setViewportSize({width,height:900});
        for(const id of mapId==='base'?[0]:[0,1]) {
          const button=page.locator(`#players [data-score-info="${id}"]`);
          assert.equal(await button.locator('svg').count(),1);assert.equal(await button.evaluate(el=>getComputedStyle(el).cursor),'help');
          const sent=await page.evaluate(()=>JSON.stringify(window.sent));
          if(width===1440)await button.press('Enter');else await button.click();
          const dialog=page.locator('#scoreInfoDialog');await dialog.waitFor({state:'visible'});
          const text=await dialog.textContent();
          assert.match(text,/加分说明/);assert.match(text,/Bonus points/);assert.match(text,/不用再加一次/);assert.match(text,/do not add it again/);
          assert.equal(await dialog.locator('[data-rule-section="saves"]').count(),0);
          const bonus=mapId==='cities'?id+1:mapId==='base'?1:id===0?3:1,score=E.publicGame(g,0).players[id].score;
          assert(text.includes(`${score-bonus} + ${bonus} = ${score}`));
          if(mapId==='cities') {assert.match(text,/Defender of Catan awards: 1 VP/);if(id===1)assert.match(text,/progress cards: 1 VP/);}
          else if(id===0)assert.match(text,/development cards: 1 VP/);
          if(mapId==='tribes')assert(text.includes(`Tribe victory point tokens: ${id===0?2:1} VP`));
          if(mapId==='tribes'&&id===1){assert.match(text,/hidden victory point cards are not included/);assert(!text.includes('development cards: 2'));}
          if(id===0){assert(text.includes('Alice <b>'));assert.equal(await dialog.locator('b').count(),0);}
          assert(await dialog.evaluate(d=>{const r=d.getBoundingClientRect();return d.scrollWidth<=d.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}));
          if(id===0)await dialog.screenshot({path:path.join(__dirname,`test-results/catan-score-info-${mapId}-${width}.png`)});
          await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
          assert.equal(await page.evaluate(()=>JSON.stringify(window.sent)),sent,'Reading score help sends no game or profile actions');
        }
        const fits=await page.locator('#players .summary-meta').evaluateAll(nodes=>nodes.every(el=>{
          const r=el.closest('th').getBoundingClientRect();return [...el.children].every(child=>child.getBoundingClientRect().right<=r.right+1)&&el.scrollWidth<=el.clientWidth+1;
        }));
        await page.locator('.player-overview').screenshot({path:path.join(__dirname,`test-results/catan-score-players-${mapId}-${width}.png`)});
        assert(fits,`${mapId}: score and question fit their column at ${width}px`);
      }
      if(mapId==='cities') {
        await page.locator('[data-score-info="0"]').press(' ');
        g.cities.players[0].defenders=2;g.revision++;await emit(g);
        assert.match(await page.locator('#scoreInfoContent').textContent(),/Defender of Catan awards: 2 VP/);
        await page.keyboard.press('Escape');
      }
      if(mapId==='base') {
        g.phase='over';g.winner=0;g.revision++;await emit(g);
        for(let i=0;i<5;i++)if(await page.locator('dialog[open]').count())await page.keyboard.press('Escape');
        await page.locator('[data-score-info="1"]').click();assert.match(await page.locator('#scoreInfoContent').textContent(),/development cards: 2 VP/);
        await page.keyboard.press('Escape');
      }
    }
    assert.deepEqual(errors,[]);
  } finally {await browser.close();}
});
