"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),vm=require("node:vm"),E=require("./catan-engine"),Maps=require("./catan-maps"),Score=require("./catan-score");
const rng=(seed=31)=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
function game(map="base",n=Maps.get(map)?.players||3){return E.createGame(Array.from({length:n},(_,i)=>`Player ${i}`),rng(),map);}
function rows(g,viewer=0,id=0){const view=E.publicGame(g,viewer),p=view.players[id],before=JSON.stringify(view),result=Score.breakdown(view,p);assert.equal(JSON.stringify(view),before,"breakdown is pure");assert.equal(result.total,p.score);assert.equal(result.items.reduce((n,item)=>n+item.points,0),p.score,`${g.mapId} player ${id} visible to ${viewer}`);assert(result.items.every(item=>item.points>0&&item.zh&&item.en));assert.equal(new Set(result.items.map(item=>item.key)).size,result.items.length);assert.equal(result.otherPoints+result.bonusPoints,p.score);return result;}
const points=(r,key)=>r.items.find(item=>item.key===key)?.points||0;
function board(g){g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;delete v.fallen;delete v.metropolis;});return g.board.vertices;}
function vp(g,id,n){for(let i=0;i<n;i++){g.deck.splice(g.deck.indexOf("vp"),1);g.players[id].development.push({type:"vp",turn:0});}}

test("UMD exposes the same pure API in a browser without engine dependencies",()=>{const context={};vm.runInNewContext(fs.readFileSync(require.resolve("./catan-score"),"utf8"),context);assert.equal(typeof context.CatanScore.breakdown,"function");const g=E.publicGame(game(),0);assert.equal(context.CatanScore.breakdown(g,g.players[0]).total,0);});

test("all published modes, base extensions and Cities counts match real public snapshots through legal actions",()=>{
 const cases=[['base',3],['base',5],['base',6],['cities',3],['cities',4],...Maps.allMaps.map(map=>[map.id,map.players])];
 for(const [map,n] of cases){const g=game(map,n),random=rng(83);for(let step=0;step<100&&g.phase!=="over";step++){if(step%10===0)for(let id=0;id<n;id++)rows(g,0,id);const id=E.requiredActors(g)[0],a=E.chooseBotAction(g,id,random);assert(a,`${map} ${g.phase}`);E.act(g,id,a,random);}for(let id=0;id<n;id++)rows(g,0,id);}
});

test("base score lists buildings, held awards and visible VP cards; tied metrics never award extra points",()=>{
 const g=game(),vs=board(g);vs[0].owner=0;vs[0].level=1;vs[1].owner=0;vs[1].level=1;vs[2].owner=0;vs[2].level=2;g.longest=0;g.largest=0;g.roadLengths=[7,7,9];g.players[0].knights=3;g.players[1].knights=4;vp(g,0,2);
 const r=rows(g);assert.deepEqual(r.items.map(item=>[item.key,item.points]),[["settlements",2],["cities",2],["longestRoad",2],["largestArmy",2],["developmentVP",2]]);assert.equal(r.total,10);assert.equal(r.bonusPoints,2);assert.equal(r.publicOnly,false);assert.match(r.items.find(i=>i.key==='settlements').zh,/2 座 × 1/);assert.match(r.items.find(i=>i.key==='cities').zh,/1 座 × 2/);assert.equal(points(rows(g,0,1),'largestArmy'),0);
});

test("hidden opponent VP cards and their count are never inferred; game over reveals them through publicGame",()=>{
 const g=game(),vs=board(g);Object.assign(vs[0],{owner:1,level:1});vp(g,1,2);g.players[1].development.push({type:'knight',turn:0});
 const hidden=rows(g,0,1);assert.equal(hidden.cardPoints,null);assert.equal(hidden.publicOnly,true);assert.equal(hidden.total,1);assert.equal(points(hidden,'developmentVP'),0);assert.equal(hidden.items.some(i=>/card|卡/.test(i.en+' '+i.zh)),false);
 const own=rows(g,1,1);assert.equal(own.cardPoints,2);assert.equal(own.total,3);assert.equal(own.publicOnly,false);
 const publicView=E.publicGame(g,0),before=Score.breakdown(publicView,publicView.players[1]);publicView.players[1].developmentCount=999;assert.deepEqual(Score.breakdown(publicView,publicView.players[1]),before,'hidden card count does not affect breakdown');
 g.phase='over';g.winner=1;const over=rows(g,0,1);assert.equal(over.cardPoints,2);assert.equal(over.publicOnly,false);assert.equal(over.total,3);
});

test("Cities counts metropolis bases once and adds public card, merchant and defender points separately",()=>{
 const g=game('cities'),vs=board(g);Object.assign(vs[0],{owner:0,level:1});Object.assign(vs[1],{owner:0,level:2,metropolis:0});Object.assign(vs[2],{owner:0,level:2,metropolis:1});Object.assign(vs[3],{owner:0,level:2});
 g.cities.players[0].revealed=['printing','constitution'];g.cities.players[0].defenders=3;g.cities.merchant={owner:0,tile:0};g.longest=0;
 const r=rows(g,1,0);assert.equal(points(r,'settlements'),1);assert.equal(points(r,'cities'),6);assert.equal(points(r,'metropolis'),4);assert.equal(points(r,'merchant'),1);assert.equal(points(r,'defenders'),3);assert.equal(points(r,'progressPrinting'),1);assert.equal(points(r,'progressConstitution'),1);assert.equal(r.total,19);assert.equal(r.cardPoints,2);assert.equal(r.bonusPoints,5);assert.equal(r.publicOnly,false);assert.match(r.items.find(i=>i.key==='cities').zh,/包括都会/);assert.match(r.items.find(i=>i.key==='metropolis').zh,/额外|本身/);
});

test("fallen cities score one settlement point despite still occupying a city piece",()=>{
 const g=game('cities'),vs=board(g);Object.assign(vs[0],{owner:0,level:1,fallen:true});const view=E.publicGame(g,0);assert.equal(view.players[0].cities,1);assert.equal(view.players[0].settlements,0);const r=rows(g);assert.equal(points(r,'settlements'),1);assert.equal(points(r,'cities'),0);assert.match(r.items[0].zh,/降级/);
});

test("Seafarers and combined modes itemize held Longest Trade Route and island bonuses without counting map markers twice",()=>{
 for(const map of ['shores-1','islands-1','desert-1','cities-shores-1','cities-desert-1']){const g=game(map),vs=board(g);Object.assign(vs[0],{owner:0,level:1,islandBonus:2});Object.assign(vs[1],{owner:0,level:2,islandBonus:2});g.players[0].discovered=[1,2];g.longest=0;const r=rows(g);assert.equal(points(r,'islands'),4);assert.equal(points(r,'longestRoad'),2);assert.match(r.items.find(i=>i.key==='longestRoad').zh,/商路/);assert.match(r.items.find(i=>i.key==='islands').zh,/2 处 × 2/);}
});

test("tribe tokens are a separate visible bonus even while development VP stays private",()=>{
 const g=game('tribes',3);g.players[1].scenarioPoints=3;vp(g,1,1);const r=rows(g,0,1);assert.equal(points(r,'tribes'),3);assert.equal(r.bonusPoints,3);assert.equal(r.tribePoints,3);assert.equal(r.cardPoints,null);assert.equal(r.publicOnly,true);
});

test("cloth pairs score one point, the odd cloth adds nothing, and no fictitious route or pirate bonus appears",()=>{
 const g=game('cloth',3);g.players[0].cloth=5;g.largest=0;const r=rows(g);assert.equal(points(r,'cloth'),2);assert.equal(points(r,'longestRoad'),0);assert.equal(points(r,'largestArmy'),2);assert.match(r.items.find(i=>i.key==='cloth').zh,/剩下 1 匹暂不计分/);g.players[0].cloth=1;assert.equal(points(rows(g),'cloth'),0);
});

test("pirate fortresses reserve a piece before liberation, then count only as their actual settlement or city",()=>{
 const g=game('pirates',3),seat=g.scenario.pirateSeats[0],initial=rows(g),publicInitial=E.publicGame(g,0);assert.equal(publicInitial.players[0].settlements,2);assert.equal(points(initial,'settlements'),1);assert.equal(initial.total,1);
 seat.liberated=true;seat.strength=0;Object.assign(g.board.vertices[seat.fortress],{owner:0,level:1});let r=rows(g);assert.equal(points(r,'settlements'),2);assert.equal(r.total,2);assert.match(r.items[0].zh,/收复/);assert.equal(r.items.some(i=>/pirate|fortress/i.test(i.key)),false);
 g.board.vertices[seat.fortress].level=2;r=rows(g);assert.equal(points(r,'settlements'),1);assert.equal(points(r,'cities'),2);assert.equal(r.total,3);assert.match(r.items.find(i=>i.key==='cities').zh,/收复后升级/);
});

test("wonders award outside settlements but no points for construction stages; New World uses one point per new island",()=>{
 const g=game('wonders',3),vs=board(g);Object.assign(vs[0],{owner:0,level:2,islandBonus:1});Object.assign(vs[1],{owner:0,level:1,islandBonus:1});g.players[0].scenarioPoints=2;g.players[0].wonder={id:0,stage:4};const r=rows(g);assert.equal(points(r,'wondersSettlements'),2);assert.equal(r.total,5);assert.equal(r.items.some(i=>i.key==='wonderStages'),false);
 const world=game('new-world',3);world.players[0].discovered=[1,2,3];const w=rows(world);assert.equal(points(w,'islands'),3);assert.match(w.items.find(i=>i.key==='islands').zh,/3 处 × 1/);
});

test("only explicit score fields produce rows; unexplained totals never become a residual Other category",()=>{
 const g=game('new-world',3);g.players[0].scenarioPoints=2;const r=rows(g);assert.equal(points(r,'scenarioRewards'),2);
 const view=E.publicGame(g,0),p=view.players[0],known=Score.breakdown(view,p);p.score+=7;const mismatch=Score.breakdown(view,p);assert.equal(mismatch.total,known.total+7);assert.deepEqual(mismatch.items,known.items);assert.equal(mismatch.otherPoints,known.otherPoints);assert(!mismatch.items.some(i=>/other|unknown/i.test(i.key)));
});


test("accepted legacy Cities saves with base VP cards match own, opponent and revealed game-over snapshots",()=>{
 const g=game('cities'),city=g.cities.players[0],deck=g.cities.decks[0];deck.splice(deck.indexOf('printing'),1);city.revealed.push('printing');g.players[0].development.push({type:'vp',turn:0});
 require('./catan-cities').validate(g);
 const own=rows(g,0,0);assert.equal(own.total,2);assert.equal(points(own,'progressPrinting'),1);assert.equal(points(own,'developmentVP'),1);assert.equal(own.cardPoints,1);assert.equal(own.bonusPoints,1);assert.equal(own.otherPoints,1);
 const opponent=rows(g,1,0);assert.equal(opponent.total,1);assert.equal(points(opponent,'progressPrinting'),1);assert.equal(points(opponent,'developmentVP'),0);assert.equal(opponent.otherPoints,0);
 g.phase='over';g.winner=0;const over=rows(g,1,0);assert.equal(over.total,2);assert.equal(points(over,'developmentVP'),1);assert.equal(over.bonusPoints,1);assert.equal(over.otherPoints,1);
});
