"use strict";
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), http = require("node:http");
const { once } = require("node:events"), E = require("./catan-engine"), { attachCatan } = require("./catan-server");
let playwright;
try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
process.env.CATAN_BOT_DELAY = "600000";
const server = http.createServer((req, res) => {
  const file = path.join(__dirname, new URL(req.url, "http://localhost").pathname);
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.setHeader("Content-Type", ({ ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
});
const catan = attachCatan(server);
server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
const seeded = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
function finish(g, rng = seeded(72)) {
  for (let i = 0; g.phase !== "over" && i < 14000; i++) {
    const id = E.requiredActors(g)[0]; E.act(g, id, E.chooseBotAction(g, id, rng), rng);
  }
  assert.equal(g.phase, "over");
}

const diceHistogram=rolls=>{const counts=Array(11).fill(0);rolls.forEach(([a,b])=>counts[a+b-2]++);return counts;};
const addHist=(...rows)=>Array.from({length:11},(_,i)=>rows.reduce((n,row)=>n+row[i],0));
function recordedDiceGame(mapId,names,kind){
  const g=E.createGame(names,seeded(72),mapId),normal=[[1,2],[3,4],[5,6],[3,4]],alchemy=[[6,6],[1,1],[3,4]];
  let random=[],fixed=[],unknown=[];
  const roll=(pair,isAlchemy)=>{
    g.turn++;g.phase='roll';g.current=0;g.rolled=false;g.dice=[];g.cities.queue=[];
    if(isAlchemy){
      const deck=g.cities.decks[0],at=deck.indexOf('alchemy');assert(at>=0);deck.splice(at,1);
      const card={id:++g.cities.sequence,key:'alchemy'};g.cities.players[0].cards.push(card);
      E.act(g,0,{type:'ck',choice:`play:${card.id}`},()=>.6);
      E.act(g,0,{type:'ck',choice:`dice:${pair[0]}:${pair[1]}`},()=>.6);
    }
    const values=pair.map(n=>(n-.5)/6);E.act(g,0,{type:'roll'},()=>isAlchemy?.6:values.length?values.shift():.6);
    assert.deepEqual(g.dice,pair);assert.equal(g.phase,'main');
  };
  if(kind==='mixed'){random=normal;fixed=alchemy;}
  if(kind==='all-alchemy')fixed=alchemy;
  if(kind==='no-alchemy')random=normal;
  if(kind.startsWith('legacy')){
    for(const pair of normal.slice(0,2))roll(pair,false);
    for(const pair of alchemy.slice(0,2))roll(pair,true);
    unknown=[...normal.slice(0,2),...alchemy.slice(0,2)];
    g.statistics.version=2;delete g.statistics.diceRandom;delete g.statistics.diceAlchemy;delete g.statistics.diceUnknown;
    if(kind==='legacy-partial'){random=normal.slice(2);fixed=alchemy.slice(2);}
  }
  for(const pair of random)roll(pair,false);for(const pair of fixed)roll(pair,true);
  g.phase='over';g.winner=0;
  const expected={random:diceHistogram(random),alchemy:diceHistogram(fixed),unknown:diceHistogram(unknown)};
  expected.all=addHist(expected.random,expected.alchemy,expected.unknown);
  assert.deepEqual(g.statistics.dice,expected.all,'Actual engine roll records match the controlled samples');
  return{g,expected};
}
async function assertDiceSeries(page,key,counts){
  const series=page.locator(`[data-dice-series="${key}"]`),total=E.sum(counts);assert.equal(await series.count(),1);
  assert.equal(Number(await series.getAttribute('data-dice-total')),total,`${key}: independent sample count`);
  const columns=await series.locator('[data-dice-sum]').evaluateAll(nodes=>nodes.map(n=>({sum:Number(n.dataset.diceSum),count:Number(n.dataset.diceCount),expected:Number(n.dataset.diceExpected),bar:parseFloat(n.querySelector('.stats-dice-bar').style.height),line:parseFloat(n.querySelector('.stats-dice-track i').style.bottom)})));
  assert.equal(columns.length,11);const scale=Math.max(1,...counts,total/6);
  columns.forEach((c,i)=>{
    const chance=(6-Math.abs(5-i))/36;assert.equal(c.sum,i+2);assert.equal(c.count,counts[i]);assert(Math.abs(c.expected-total*chance)<1e-8,`${key} sum ${i+2}: expected count uses this sample N`);
    assert(Math.abs(c.bar-counts[i]/scale*100)<1e-4);assert(Math.abs(c.line-total*chance/scale*100)<1e-4);
  });
  const table=series.locator('.stats-data');await table.locator('summary').press('Enter');assert(await table.evaluate(e=>e.open));
  const headers=await table.locator('thead th').allTextContents();assert.equal(headers.length,5);assert.match(headers[2],/占比|Actual/);assert.match(headers[3],/理论次数|Expected.*count/i);assert.match(headers[4],/理论概率|Expected.*%/);
  const rows=await table.locator('tbody tr').evaluateAll(nodes=>nodes.map(n=>[...n.children].map(c=>c.textContent.trim())));assert.equal(rows.length,11);
  rows.forEach((row,i)=>{
    const chance=(6-Math.abs(5-i))/36;assert.equal(Number(row[0]),i+2);assert.equal(Number(row[1]),counts[i]);
    assert.equal(parseFloat(row[2]),Number((total?counts[i]/total*100:0).toFixed(1)),`${key}: percentages use independent sample count`);
    assert(Math.abs(Number(row[3])-total*chance)<=.051,`${key}: expected table count`);assert.equal(parseFloat(row[4]),Number((chance*100).toFixed(1)));
  });
  await table.locator('summary').press('Enter');assert.equal(await table.evaluate(e=>e.open),false);
}
async function checkAlchemyDiceUI(host,send){
  const reports=[];
  for(const mapId of ['cities','cities-shores-1']){
    await host.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
    await send(host,{type:'create',name:'Alice',seats:3,mapId});await host.locator('#lobby').waitFor();const code=await host.locator('#copyCode').textContent();
    await send(host,{type:'fillBots'});await host.waitForFunction(()=>testState.seats.length===3);await send(host,{type:'start'});await host.locator('#game').waitFor();
    const room=catan.rooms.get(code);clearTimeout(room.timer);
    for(const kind of ['mixed','all-alchemy','no-alchemy','zero','legacy-unknown','legacy-partial']){
      await host.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
      const {g,expected}=recordedDiceGame(mapId,room.seats.map(p=>p.name),kind);g.revision=room.game.revision+1;room.game=g;
      await send(host,{type:'chat',text:''});await host.waitForFunction(id=>testState.game.statistics?.id===id,g.statistics.id);await host.locator('#statisticsDialog[open]').waitFor();
      const recorded=await host.evaluate(()=>testState.game.statistics);assert.deepEqual(recorded.dice,expected.all);
      assert.deepEqual(recorded.diceRandom,expected.random);assert.deepEqual(recorded.diceAlchemy,expected.alchemy);assert.deepEqual(recorded.diceUnknown,expected.unknown);
      for(const [width,height] of [[1440,1000],[320,568]]){
        await host.setViewportSize({width,height});await host.locator('#statsTab-scores').focus();await host.keyboard.press('ArrowRight');assert.equal(await host.locator('#statsTab-dice').getAttribute('aria-selected'),'true');
        const before=await host.evaluate(()=>JSON.stringify(statsTestSent));
        assert.equal(await host.locator('[data-dice-series]').count(),2,`${mapId}/${kind}: two separate series`);
        await assertDiceSeries(host,'all',expected.all);
        if(kind==='legacy-unknown'){
          const random=host.locator('[data-dice-series="random"]');assert.equal(await random.locator('.stats-dice-column').count(),0,'Unknown historical source must not fabricate a zero random histogram');
          assert.equal(await random.locator('.stats-data').count(),0,'Unknown historical source must not fabricate a random data table');
          assert.match(await random.innerText(),/无法|不能|cannot|unknown/i);
        }else await assertDiceSeries(host,'random',expected.random);
        const note=host.locator('[data-dice-source-note]');
        if(kind.startsWith('legacy')){assert(await note.count()>0);assert.match(await note.innerText(),/来源|source/i);assert.match(await note.innerText(),/4/);if(kind==='legacy-partial')assert.match(await host.locator('[data-dice-series="random"]').innerText(),/已记录|recorded/i);}
        if(kind==='all-alchemy'||kind==='zero')assert.match(await host.locator('[data-dice-series="random"]').innerText(),/没有|尚无|未|[Nn]o|0/);
        assert(await host.evaluate(()=>{const d=document.querySelector('#statisticsDialog'),b=document.querySelector('#statisticsBody'),r=d.getBoundingClientRect();return b.scrollWidth<=b.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1;}),`${mapId}/${kind} charts fit ${width}px`);
        if(kind==='mixed'||kind==='legacy-unknown'||kind==='legacy-partial'){
          await host.locator('#statisticsBody').evaluate(e=>e.scrollTop=0);await host.locator('#statisticsDialog').screenshot({path:`test-results/catan-stats-dice-${mapId}-${kind}-${width}.png`,animations:'disabled'});
          if(kind==='mixed'||kind==='legacy-unknown'){
            await host.locator('[data-dice-series="random"]').evaluate(s=>{const b=document.querySelector('#statisticsBody');b.scrollTop+=s.getBoundingClientRect().top-b.getBoundingClientRect().top;});await host.locator('#statisticsDialog').screenshot({path:`test-results/catan-stats-dice-${mapId}-${kind==='mixed'?'random':'unknown-note'}-${width}.png`,animations:'disabled'});
          }
        }
        await host.locator('#statisticsBody').focus();await host.keyboard.press('End');
        assert(await host.locator('[data-close="statisticsDialog"]').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'Close button remains visible after scrolling both charts');
        await host.keyboard.press('Escape');assert.equal(await host.locator('#statisticsDialog').isVisible(),false);await host.locator('#matchStatistics').press('Enter');await host.locator('#statisticsDialog[open]').waitFor();
        assert.equal(await host.evaluate(()=>JSON.stringify(statsTestSent)),before,'Chart reading, tables, tabs and reopening send no gameplay messages');
        reports.push({mapId,kind,width,total:E.sum(expected.all),random:E.sum(expected.random),alchemy:E.sum(expected.alchemy),unknown:E.sum(expected.unknown)});
        await host.locator('#statsTab-scores').click();
      }
    }
  }
  fs.writeFileSync('test-results/catan-stats-dice-matrix.json',JSON.stringify(reports,null,2));
}

(async () => {
  let browser;
  try {
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    fs.mkdirSync("test-results", { recursive: true });
    const pages = [], errors = [];
    for (let i = 0; i < 2; i++) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await context.addInitScript(() => {
        localStorage.setItem("catan-music-enabled", "false"); window.statsTestSent = [];
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          send(data) { window.statsTestSent.push(JSON.parse(data)); return super.send(data); }
          constructor(...args) {
            super(...args); window.testSocket = this;
            this.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.type === "state") window.testState = m; });
          }
        };
      });
      const page = await context.newPage(); pages.push(page);
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/catan.html`);
      await page.waitForFunction(() => window.testSocket?.readyState === 1);
    }
    const [host, guest] = pages;
    const send = (page, data) => page.evaluate(data => testSocket.send(JSON.stringify(data)), data);
    await send(host, { type: "create", name: "Alice", seats: 6, mapId: "base" }); await host.locator("#lobby").waitFor();
    const code = await host.locator("#copyCode").textContent();
    await send(guest, { type: "join", name: "Bob", code }); await guest.locator("#lobby").waitFor();
    await send(host, { type: "fillBots" }); await host.waitForFunction(() => testState.seats.length === 6);
    await send(host, { type: "start" }); await host.locator("#game").waitFor();
    const room = catan.rooms.get(code), g = room.game; clearTimeout(room.timer);
    const sync = async () => {
      const revision = ++room.game.revision; await send(host, { type: "chat", text: "" });
      for (const page of pages) await page.waitForFunction(r => testState.game.revision === r, revision);
    };
    assert.equal(await host.evaluate(() => testState.game.statistics), null);
    assert.equal(await guest.evaluate(() => testState.game.statistics), null);
    assert.equal(await host.locator("#matchStatistics").isVisible(), false);
    for (const page of pages) await page.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
    finish(g); await sync();
    for (const page of pages) {
      await page.locator("#statisticsDialog[open]").waitFor();
      assert.equal(await page.locator("#statsScorePlot path.stats-line-outline").count(), 6);
      assert.equal(await page.locator("#statsPointValues>div").count(), 6);
      assert.ok((await page.locator("#statisticsSummary").textContent()).includes(g.players[g.winner].name));
    }
    assert.deepEqual(await host.evaluate(() => testState.game.statistics), await guest.evaluate(() => testState.game.statistics));
    await host.locator("#statsTurn").fill("1");
    assert.match(await host.locator("#statsTurnLabel").textContent(), /Turn 1/);
    assert.deepEqual(await host.locator("#statsPointValues>div>b").allTextContents(), g.statistics.history[1].scores.map(n => `${n} VP`));
    await host.locator('[data-stats-player="0"]').uncheck();
    assert.equal(await host.locator("#statsScorePlot path.stats-line-outline").count(), 5);
    await host.locator('[data-stats-player="0"]').check();
    await host.locator("#statsTab-scores").focus(); await host.keyboard.press("ArrowRight");
    assert.equal(await host.locator("#statsTab-dice").getAttribute("aria-selected"), "true");
    assert.deepEqual((await host.locator(".stats-dice-column>strong").allTextContents()).map(Number), g.statistics.dice);
    assert.equal(await host.locator('[data-dice-series]').count(),1,'Base mode retains one dice chart');
    await assertDiceSeries(host,'all',g.statistics.dice);
    await host.locator("#statsTab-resources").click();
    assert.equal(await host.locator(".stats-bar-row").count(), 6);
    assert.match(await host.locator(".stats-footnote").textContent(), /Excludes starting cards/);
    await host.locator("#statsTab-builds").click();
    assert.match(await host.locator(".stats-footnote").textContent(), /Cities count upgrades/);
    await host.locator("#statsTab-robbed").click();
    assert.deepEqual(await host.locator("[data-robbed-total]").allTextContents(), g.statistics.players.map(p => `${p.robbed.theft} 次 / times`));
    assert.ok(g.statistics.players.some(p => p.robbed.theft > 0), "The completed game includes actual theft");
    assert.match(await host.locator(".stats-footnote").textContent(), /discarding on seven, Monopoly/);
    await host.locator(".stats-data summary").click();
    assert.equal(await host.locator(".stats-data tbody tr").count(), 6);
    await host.locator("#statsTab-scores").focus(); await host.keyboard.press("End");
    assert.equal(await host.locator("#statsTab-robbed").getAttribute("aria-selected"), "true");
    for (const [width, height] of [[1440, 1000], [390, 844], [320, 568], [844, 390]]) {
      await host.setViewportSize({ width, height });
      for (const tab of ["scores", "dice", "resources", "builds", "robbed"]) {
        await host.locator(`#statsTab-${tab}`).click();
        assert.equal(await host.evaluate(() => {
          const d = document.getElementById("statisticsDialog"), b = document.getElementById("statisticsBody");
          const rect = d.getBoundingClientRect(), heading = d.querySelector(".dialog-heading").getBoundingClientRect();
          const tabsFit = [...d.querySelectorAll('[role="tab"]')].every(t => t.scrollWidth <= t.clientWidth + 1);
          return tabsFit && b.scrollWidth <= b.clientWidth + 1 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && heading.top >= rect.top;
        }), true, `Statistics fit ${width}x${height}: ${tab}`);
        await host.locator("#statisticsDialog").screenshot({ path: `test-results/catan-stats-${tab}-${width}.png`, animations: "disabled" });
      }
    }
    await host.setViewportSize({ width: 1440, height: 1000 });
    await host.locator("#statsTab-scores").click();
    await host.locator(".stats-data summary").click();
    assert.equal(await host.locator(".stats-data tbody tr").count(), g.statistics.history.length);
    await host.locator('[data-close="statisticsDialog"]').click(); await sync();
    assert.equal(await host.locator("#statisticsDialog").isVisible(), false, "Room updates do not reopen dismissed stats");
    await host.locator("#matchStatistics").click(); await host.locator("#statisticsDialog[open]").waitFor();
    const history = structuredClone(g.statistics);
    await host.reload(); await host.locator("#statisticsDialog[open]").waitFor();
    assert.deepEqual(await host.evaluate(() => testState.game.statistics), history, "Reconnect preserves complete statistics");
    await host.keyboard.press("Escape");
    await host.locator("#rematch").click();
    await host.waitForFunction(() => testState.game.phase === "setupSettlement");
    await guest.waitForFunction(() => testState.game.phase === "setupSettlement");
    assert.equal(await guest.locator("#statisticsDialog").isVisible(), false);
    assert.equal(await host.evaluate(() => testState.game.statistics), null);
    assert.notEqual(room.game.statistics.id, history.id);
    assert.equal(E.sum(room.game.statistics.dice), 0);
    assert.ok(room.game.statistics.players.every(p => p.robbed.theft === 0 && p.robbed.raid === 0));
    // An already-open rules dialog is never replaced; stats wait for its dismissal.
    await host.locator("#gameBaseRules").click();
    await host.locator("#helpDialog[open]").waitFor();
    finish(room.game, seeded(39)); await sync();
    assert.equal(await host.locator("#statisticsDialog").isVisible(), false);
    await host.locator('[data-close="helpDialog"]').click();
    await host.locator("#statisticsDialog[open]").waitFor();
    await guest.locator("#statisticsDialog[open]").waitFor();
    room.game.statistics.version = 1;
    room.game.statistics.players.forEach(p => delete p.robbed);
    await sync(); await host.locator("#statsTab-robbed").click();
    assert.match(await host.locator("#statisticsBody").textContent(), /not recorded for this match/);
    assert.equal(await host.locator("[data-robbed-total]").count(), 0, "Missing historical data is not shown as zero");

    // A controlled finished Pirate Islands match covers the separate raid series and zero counts.
    await send(host, { type: "create", name: "Alice", seats: 4, mapId: "pirates" });
    await host.locator("#lobby").waitFor();
    const pirateCode = await host.locator("#copyCode").textContent();
    await send(host, { type: "fillBots" }); await host.waitForFunction(() => testState.seats.length === 4);
    await send(host, { type: "start" }); await host.locator("#game").waitFor();
    await host.evaluate(() => document.querySelectorAll("dialog[open]").forEach(d => d.close()));
    const pirateRoom = catan.rooms.get(pirateCode), pirate = pirateRoom.game; clearTimeout(pirateRoom.timer);
    pirate.phase = "over"; pirate.winner = 0;
    pirate.statistics.players[0].robbed = { theft: 2, raid: 1 };
    pirate.statistics.players[2].robbed = { theft: 0, raid: 2 };
    const syncPirates = async () => {
      const revision = ++pirate.revision; await send(host, { type: "chat", text: "" });
      await host.waitForFunction(r => testState.game.revision === r, revision);
    };
    await syncPirates(); await host.locator("#statisticsDialog[open]").waitFor();
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      await host.setViewportSize({ width, height }); await host.locator("#statsTab-robbed").click();
      assert.deepEqual(await host.locator("[data-robbed-total]").allTextContents(), [3, 0, 2, 0].map(n => `${n} 次 / times`));
      assert.match(await host.locator(".stats-footnote").textContent(), /even if several cards are lost/);
      assert.equal(await host.locator(".stats-bar-track>span").count(), 3);
      await host.locator("#statisticsDialog").screenshot({ path: `test-results/catan-stats-robbed-pirates-${width}.png`, animations: "disabled" });
    }
    pirate.statistics.players.forEach(p => { p.robbed = { theft: 0, raid: 0 }; });
    await syncPirates(); await host.locator("#statsTab-robbed").click();
    assert.deepEqual(await host.locator("[data-robbed-total]").allTextContents(), Array(4).fill("0 次 / times"));
    assert.equal(await host.locator(".stats-bar-track>span").count(), 0);
    await checkAlchemyDiceUI(host,send);
    assert.deepEqual(errors, []);
    console.log("Catan stats UI passed: two clients, all five charts, six seats, desktop/mobile/landscape, keyboard, tables, privacy, reconnect, rematch, legacy and zero robbery counts, pirate raids, deferred auto-open, separate Alchemy/random sample counts and expected distributions, legacy unknown/partial samples.");
  } finally {
    await browser?.close();
    for (const room of catan.rooms.values()) clearTimeout(room.timer);
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
