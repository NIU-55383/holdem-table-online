"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),E=require("./catan-engine"),C=require("./catan-cities"),D=require("./catan-cities-data"),A=require("./room-archive");
function rng(seed=47){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function setup(n=3,seed=47){const g=E.createGame(Array.from({length:n},(_,i)=>`P${i}`),rng(seed),"cities");while(g.phase.startsWith("setup")){const id=g.current;E.act(g,id,E.chooseBotAction(g,id));}return g;}
function hand(g,id,r,n){const delta=n-g.players[id].resources[r];assert(g.bank[r]>=delta);g.bank[r]-=delta;g.players[id].resources[r]=n;}
function grant(g,id,key){const b=D.cards[key][0],i=g.cities.decks[b].indexOf(key);assert(i>=0);g.cities.decks[b].splice(i,1);const card={key,id:++g.cities.sequence};g.cities.players[id].cards.push(card);return card;}
function play(g,id,key){const card=grant(g,id,key);E.act(g,id,{type:"ck",choice:`play:${card.id}`});}
function choose(g,match=()=>true){const id=E.requiredActors(g)[0],o=E.legal(g,id).citiesKnights.find(match);assert(o,`choice missing ${JSON.stringify(g.cities.queue)}`);E.act(g,id,{type:"ck",choice:o.key});}
function finishChoices(g){for(let i=0;g.phase==='ckChoice'&&i<100;i++)choose(g);assert.notEqual(g.phase,'ckChoice');}
function archive(g){const r={mapId:'cities',layout:'default',maxPlayers:g.players.length,thieves:'both',seats:g.players.map((p,i)=>({position:i,name:p.name,token:`secret${i}`})),game:g};return A.decode(A.encode('catan',r),['catan']).room.game;}
test('official setup, supply, 54 progress cards, privacy and piece counts',()=>{const g=setup();assert.equal(g.target,13);assert.equal(g.board.robber,-1);assert.equal(g.deck.length,0);assert.deepEqual(g.cities.decks.map(d=>d.length),[18,18,18]);for(const p of g.players){assert.equal(E.score(g,p.id),3);assert.equal(C.cities(g,p.id).length,1);assert.equal(p.resources.length,8);assert.equal(p.resources.slice(5).reduce((a,b)=>a+b),0);}grant(g,1,'crane');const view=E.publicGame(g,0);assert.equal(view.citiesKnights.players[1].cards,null);C.validate(g);assert.deepEqual(archive(g).cities,g.cities);});
test('cities produce resource + commodity while hills and fields remain double',()=>{const g=setup();g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});for(const r of [0,1,2,3,4]){const t=g.board.tiles.find(t=>t.resource===r);g.board.tiles.forEach(x=>{x.number=2;});t.number=6;const v=g.board.vertices[t.vertices[0]];v.owner=0;v.level=2;const before=[...g.players[0].resources];E.produce(g,6);assert.equal(g.players[0].resources[r]-before[r],[1,3].includes(r)?2:1);const commodity={0:5,2:6,4:7}[r];if(commodity)assert.equal(g.players[0].resources[commodity]-before[commodity],1);v.owner=-1;v.level=0;}C.validate(g);});
test('seven before first invasion discards but does not move robber; walls raise threshold',()=>{const g=setup();for(let r=0;r<8;r++)hand(g,0,r,1);const city=C.cities(g,0)[0];city.wall=true;let seq=[0,5/6,3/6];E.act(g,0,{type:'roll'},()=>seq.shift());assert.equal(g.phase,'main');assert.equal(g.board.robber,-1);assert.deepEqual(g.discard,{});delete city.wall;g.phase='roll';seq=[0,5/6,3/6];E.act(g,0,{type:'roll'},()=>seq.shift());assert.equal(g.discard[0],4);E.act(g,0,{type:'discard',resources:[1,1,1,1,0,0,0,0]});assert.equal(g.phase,'main');});
test('colored event uses red die, enforces off-turn progress cap before production',()=>{const g=setup();g.cities.players[1].levels[0]=1;for(const k of ['crane','medicine','mining','invention'])grant(g,1,k);const deck=g.cities.decks[0],top=deck.findIndex(k=>k!=='printing');[deck[0],deck[top]]=[deck[top],deck[0]];let seq=[.5,0,.5];E.act(g,0,{type:'roll'},()=>seq.shift());assert.equal(g.phase,'ckChoice');assert.equal(g.cities.queue[0].kind,'discardProgress');assert.deepEqual(E.requiredActors(g),[1]);assert.equal(E.publicGame(g,0).legal.citiesKnights.length,0);choose(g);assert.equal(g.cities.players[1].cards.length,4);assert.equal(g.phase,'main');C.validate(g);});
test('barbarian failure downgrades lowest contributors, deactivates knights and introduces robber',()=>{const g=setup();g.cities.ship=6;let seq=[0,0,0];E.act(g,0,{type:'roll'},()=>seq.shift());assert.equal(g.phase,'ckChoice');assert.equal(g.cities.queue[0].kind,'pillage');const restored=archive(g);assert.deepEqual(restored.cities.queue,g.cities.queue);finishChoices(g);assert.equal(g.board.vertices.filter(v=>v.level===2).length,0);assert.equal(g.cities.ship,0);assert.equal(g.cities.attacked,true);assert.equal(g.board.tiles[g.board.robber].resource,-1);});
test('unique defender gains VP and tied defenders draw their chosen deck',()=>{for(const tie of [false,true]){const g=setup();const v=g.board.vertices.filter(v=>v.owner<0);v[0].knight={owner:0,rank:3,active:true,activated:0,promoted:-1};if(tie)v[1].knight={owner:1,rank:3,active:true,activated:0,promoted:-1};g.cities.ship=6;let seq=[0,0,0];E.act(g,0,{type:'roll'},()=>seq.shift());finishChoices(g);assert.equal(g.cities.players[0].defenders,tie?0:1);if(tie)assert(g.cities.players[0].cards.length+g.cities.players[0].revealed.length===1);assert(C.knights(g).every(v=>!v.knight.active));}});
test('knights recruit, activate, promote once, and cannot move on activation turn',()=>{const g=setup();g.phase='main';hand(g,0,2,5);hand(g,0,4,5);hand(g,0,3,5);let o=E.legal(g,0).citiesKnights.find(o=>o.group==='recruit');E.act(g,0,{type:'ck',choice:o.key});const v=C.knights(g,0)[0];E.act(g,0,{type:'ck',choice:`activate:${v.id}`});assert(!E.legal(g,0).citiesKnights.some(o=>o.group==='move'));E.act(g,0,{type:'ck',choice:`promote:${v.id}`});assert.equal(v.knight.rank,2);assert(v.knight.active);assert(!E.legal(g,0).citiesKnights.some(o=>o.key===`promote:${v.id}`));assert.throws(()=>E.act(g,0,{type:'ck',choice:`activate:${v.id}`}));});
test('improvement confirmations match every branch, level and actual crane-discounted payment',()=>{
  for(let branch=0;branch<3;branch++)for(let from=0;from<5;from++)for(const discounted of [false,true]){
    const g=setup();g.phase='main';g.current=0;g.cities.players[0].levels[branch]=from;
    if(from===4)C.cities(g,0)[0].metropolis=branch;
    hand(g,0,5+branch,from+1);
    if(discounted)play(g,0,'crane');
    grant(g,0,'engineering');
    const options=E.publicGame(g,0).legal.citiesKnights,option=options.find(o=>o.key==='upgrade:'+branch);
    assert(option,'upgrade exists for branch '+branch+' level '+from);
    const expected={branch,from,to:from+1,cost:from+1-Number(discounted),discount:Number(discounted),metropolis:from===3?'claim':from===4?'secure':'none'};
    assert.deepEqual(option.improvement,expected);
    assert(options.some(o=>o.group==='progress'));
    assert(options.every(o=>Object.hasOwn(o,'improvement')===(o.group==='improvement')),'only upgrade options expose improvement metadata');
    const resources=[...g.players[0].resources],bank=g.bank[5+branch];
    E.act(g,0,{type:'ck',choice:option.key});
    assert.deepEqual(g.players[0].resources,resources.map((n,r)=>n-(r===5+branch?expected.cost:0)),'actual payment equals the confirmation cost');
    assert.equal(g.bank[5+branch],bank+expected.cost);
    assert.equal(g.cities.players[0].levels[branch],expected.to);
    assert.equal(g.cities.crane,0,'a crane is consumed even when the first upgrade costs zero');
    finishChoices(g);
    if(from>=3)assert.equal(C.cities(g,0)[0].metropolis,branch);
    C.validate(g);
  }
});

test('improvement confirmations distinguish claiming, taking, securing and no metropolis reward',()=>{
  const scenarios=[
    {from:3,owner:null,ownerLevel:null,metropolis:'claim',holder:0,ownGain:2,otherGain:0},
    {from:3,owner:1,ownerLevel:4,metropolis:'none',holder:1,ownGain:0,otherGain:0},
    {from:3,owner:1,ownerLevel:5,metropolis:'none',holder:1,ownGain:0,otherGain:0},
    {from:4,owner:1,ownerLevel:4,metropolis:'take',holder:0,ownGain:2,otherGain:-2},
    {from:4,owner:1,ownerLevel:5,metropolis:'none',holder:1,ownGain:0,otherGain:0},
    {from:4,owner:0,ownerLevel:4,metropolis:'secure',holder:0,ownGain:0,otherGain:0}
  ];
  for(let branch=0;branch<3;branch++)for(const scenario of scenarios){
    const g=setup();g.phase='main';g.current=0;g.cities.players[0].levels[branch]=scenario.from;
    const ownCity=C.cities(g,0)[0],otherCity=C.cities(g,1)[0];
    if(scenario.owner!==null){C.cities(g,scenario.owner)[0].metropolis=branch;g.cities.players[scenario.owner].levels[branch]=scenario.ownerLevel;}
    hand(g,0,5+branch,scenario.from+1);
    const option=E.publicGame(g,0).legal.citiesKnights.find(o=>o.key==='upgrade:'+branch);
    assert(option);assert.equal(option.improvement.metropolis,scenario.metropolis);
    const scores=[E.score(g,0),E.score(g,1)],before=g.players[0].resources[5+branch];
    E.act(g,0,{type:'ck',choice:option.key});
    assert.equal(g.players[0].resources[5+branch],before-option.improvement.cost);
    assert.equal(g.cities.players[0].levels[branch],option.improvement.to);
    assert.equal(g.phase,['claim','take'].includes(scenario.metropolis)?'ckChoice':'main');
    finishChoices(g);
    const metropolis=g.board.vertices.find(v=>v.metropolis===branch);
    assert.equal(metropolis.owner,scenario.holder);
    assert.equal(E.score(g,0),scores[0]+scenario.ownGain);assert.equal(E.score(g,1),scores[1]+scenario.otherGain);
    assert.equal(ownCity.owner,0);assert.equal(otherCity.owner,1);assert.equal(ownCity.level,2);assert.equal(otherCity.level,2);
    C.validate(g);
  }
});
test('Aqueduct gives only ordinary resources, commodities trade at 2:1 with trade level three',()=>{const g=setup();g.phase='main';g.cities.players[0].levels[0]=3;E.produce(g,99);assert.equal(g.phase,'ckChoice');assert(E.legal(g,0).citiesKnights.every(o=>Number(o.key.split(':')[1])<5));choose(g);g.cities.players[0].levels[1]=3;hand(g,0,6,2);const before=g.players[0].resources[7];E.act(g,0,{type:'bankTrade',give:6,get:7});assert.equal(g.players[0].resources[6],0);assert.equal(g.players[0].resources[7],before+1);});
test('every progress card resolves and its phase survives portable save',()=>{for(const key of Object.keys(D.cards).filter(k=>!['printing','constitution'].includes(k))){const g=setup();g.phase=key==='alchemy'?'roll':'main';g.cities.attacked=true;g.board.robber=g.board.tiles.find(t=>t.resource===-1).id;g.cities.players[1].defenders=3;grant(g,1,'crane');for(let id=0;id<3;id++)for(let r=0;r<8;r++)hand(g,id,r,2);const vs=g.board.vertices.filter(v=>v.owner<0);vs[0].knight={owner:0,rank:1,active:false,activated:-1,promoted:-1};const target=g.board.vertices.find(v=>v.owner<0&&v.edges.some(i=>g.board.edges[i].owner===0)&&v.id!==vs[0].id);target.knight={owner:1,rank:1,active:true,activated:0,promoted:-1};const card=grant(g,0,key),o=E.legal(g,0).citiesKnights.find(o=>o.key===`play:${card.id}`);assert(o,key);E.act(g,0,{type:'ck',choice:o.key});for(let i=0;g.phase==='ckChoice'&&i<100;i++){archive(g);choose(g);}assert.notEqual(g.phase,'ckChoice',key);C.validate(g);}});
test('malformed city saves and mismatched edition are rejected',()=>{const g=setup();for(const mutate of [g=>g.cities.decks[0].push('crane'),g=>g.cities.players[0].levels[0]=99,g=>g.bank[5]=100,g=>{g.phase='ckChoice';g.cities.queue=[{kind:'relocate',player:0,sites:[999]}];}]){const bad=structuredClone(g);mutate(bad);assert.throws(()=>archive(bad));}});
test('seeded bots finish three and four player games with round trips and conservation',()=>{for(const n of [3,4]){const random=rng(39+n),g=E.createGame(Array.from({length:n},(_,i)=>`Bot ${i}`),random,'cities');for(let step=0;step<3500&&g.phase!=='over';step++){const id=E.requiredActors(g)[0],a=E.chooseBotAction(g,id,random);assert(a,`${g.phase} ${JSON.stringify(g.cities.queue)}`);E.act(g,id,a,random);if(step%25===0)archive(g);C.validate(g);}assert.equal(g.phase,'over');assert(E.score(g,g.winner)>=13);}});

test('knights block roads through their site, not roads arriving from an independently connected end',()=>{
  const g=setup();g.phase='main';
  g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});g.board.edges.forEach(e=>e.owner=-1);
  const center=g.board.vertices.find(v=>v.edges.length===3);
  const [entry,candidate]=center.edges.map(i=>g.board.edges[i]);
  const far=g.board.vertices[candidate.a===center.id?candidate.b:candidate.a];
  const other=far.edges.map(i=>g.board.edges[i]).find(e=>e.id!==candidate.id);
  for(const active of [false,true]){
    entry.owner=1;other.owner=-1;center.knight={owner:0,rank:1,active,activated:-1,promoted:-1};
    assert(!E.roadSites(g,1).includes(candidate.id),'cannot extend through an opposing knight');
    other.owner=1;
    assert(E.roadSites(g,1).includes(candidate.id),'can approach from an existing road at the other end');
    other.owner=-1;entry.owner=0;
    assert(E.roadSites(g,0).includes(candidate.id),'own knight does not block own road');
    assert(!E.settlementSites(g,0).includes(center.id),'cannot build on own knight');
    entry.owner=1;
    assert(!E.settlementSites(g,1).includes(center.id),'cannot build on an opponent knight');
    delete center.knight;
    assert(E.settlementSites(g,1).includes(center.id),'the empty site is otherwise legal');
  }
});

test('knight move selects its source first, can cancel, displaces weaker knights and survives saving',()=>{
  const g=setup();g.phase='main';g.turn=4;
  g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});g.board.edges.forEach(e=>e.owner=-1);
  const e=g.board.edges[0],from=g.board.vertices[e.a],to=g.board.vertices[e.b];e.owner=0;
  const escapeEdge=to.edges.map(i=>g.board.edges[i]).find(x=>x.id!==e.id);escapeEdge.owner=1;
  const escape=g.board.vertices[escapeEdge.a===to.id?escapeEdge.b:escapeEdge.a];
  from.knight={owner:0,rank:2,active:true,activated:1,promoted:-1};to.knight={owner:1,rank:1,active:true,activated:1,promoted:-1};
  E.act(g,0,{type:'ck',choice:`move:${from.id}`});assert.equal(g.cities.queue[0].kind,'moveKnight');archive(g);
  assert.equal(E.publicGame(g,0).citiesKnights.choice.from,from.id);
  choose(g,o=>o.key==='cancel');assert(from.knight.active);assert.equal(g.phase,'main');
  E.act(g,0,{type:'ck',choice:`move:${from.id}`});choose(g,o=>o.position?.vertex===to.id);assert.equal(to.knight.owner,0);assert(!to.knight.active);
  assert.deepEqual(E.requiredActors(g),[1]);archive(g);choose(g,o=>o.position?.vertex===escape.id);assert.equal(escape.knight.owner,1);assert(escape.knight.active);assert.equal(from.knight,undefined);C.validate(g);
});

test('metropolises survive failure and all-used settlements keep a fallen city piece for rebuilding',()=>{
  const g=setup();const protectedCity=C.cities(g,0)[0];g.cities.players[0].levels[0]=4;protectedCity.metropolis=0;
  const ownCity=C.cities(g,1)[0];ownCity.wall=true;
  for(const v of g.board.vertices.filter(v=>v.owner<0).slice(0,4)){v.owner=1;v.level=1;}
  g.cities.ship=6;let seq=[0,0,0];E.act(g,0,{type:'roll'},()=>seq.shift());finishChoices(g);
  assert.equal(protectedCity.level,2);assert.equal(ownCity.level,1);assert.equal(ownCity.wall,undefined);assert.equal(ownCity.fallen,true);
  g.phase='main';g.current=1;hand(g,1,3,2);hand(g,1,4,3);assert.deepEqual(E.citySites(g,1),[ownCity.id]);
  E.act(g,1,{type:'city',vertex:ownCity.id});assert.equal(ownCity.level,2);assert.equal(ownCity.fallen,undefined);C.validate(g);
});

test('Commercial Harbor leaves the commodity choice to its owner and saves mid-exchange',()=>{
  const g=setup();g.phase='main';hand(g,0,0,2);hand(g,1,5,1);hand(g,1,6,1);play(g,0,'harbor');
  const before=[...g.players[0].resources];E.act(g,0,{type:'ck',choice:'harbor:1:0'});assert.deepEqual(E.requiredActors(g),[1]);archive(g);
  assert.deepEqual(E.legal(g,1).citiesKnights.map(o=>o.key),['r:5','r:6']);assert.equal(E.legal(g,0).citiesKnights.length,0);
  choose(g,o=>o.key==='r:6');assert.equal(g.players[0].resources[0],before[0]-1);assert.equal(g.players[0].resources[6],before[6]+1);
  assert(!E.legal(g,0).citiesKnights.some(o=>o.key.startsWith('harbor:1:')));C.validate(g);
});

test('public counts show progress hands without revealing them and all bonus points are public',()=>{
  const g=setup();grant(g,1,'crane');grant(g,1,'medicine');g.cities.players[1].defenders=2;
  const view=E.publicGame(g,0);assert.equal(view.players[1].developmentCount,2);assert.equal(view.citiesKnights.players[1].cards,null);assert.equal(view.players[1].score,5);
});

test('required fields on queued choices are validated before importing',()=>{
  for(const kind of ['draw','metropolis','moveKnight','takeCards','takeProgress','removeKnight','give','harborPay','replaceRank','replaceKnight','smithing']){
    const g=setup();g.phase='ckChoice';g.cities.queue=[{kind,player:0}];assert.throws(()=>archive(g),kind);
  }
});

test('starting cities and subsequent upgrades have separate construction counts',()=>{
  const g=setup();for(const p of g.statistics.players)assert.deepEqual(p.built,{settlement:1,city:1,road:2,ship:0});
  g.phase='main';hand(g,0,3,2);hand(g,0,4,3);E.act(g,0,{type:'city',vertex:E.citySites(g,0)[0]});
  assert.equal(g.statistics.players[0].built.city,2);assert.equal(g.statistics.players[0].built.settlement,1);
});

test('Diplomacy relocation keeps a tied Longest Road award until placement completes',()=>{
  const g=setup();g.phase='main';g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});g.board.edges.forEach(e=>e.owner=-1);
  const used=new Set(),paths=[];
  function search(at,vertices,edges){if(edges.length===5)return {vertices,edges};for(const e of g.board.vertices[at].edges.map(i=>g.board.edges[i])){const next=e.a===at?e.b:e.a;if(used.has(next)||vertices.includes(next))continue;const result=search(next,[...vertices,next],[...edges,e.id]);if(result)return result;}}
  for(let id=0;id<2;id++){
    const p=g.board.vertices.filter(v=>!used.has(v.id)).map(v=>search(v.id,[v.id],[])).find(Boolean);assert(p);paths.push(p);p.vertices.forEach(v=>used.add(v));p.edges.forEach(e=>g.board.edges[e].owner=id);g.board.vertices[p.vertices[0]].owner=id;g.board.vertices[p.vertices[0]].level=1;
  }
  g.longest=0;E.updateAwards(g);assert.deepEqual(g.roadLengths.slice(0,2),[5,5]);play(g,0,'diplomacy');
  const edge=paths[0].edges.at(-1);choose(g,o=>o.key===`edge:${edge}`);assert.equal(g.phase,'freeRoads');assert.equal(g.longest,0);assert(g.cities.diplomacyPending);archive(g);
  E.act(g,0,{type:'road',edge});assert.equal(g.longest,0);assert(!g.cities.diplomacyPending);C.validate(g);
});

test('Diplomacy cannot strand any knight, including an opponent',()=>{
  const g=setup();g.phase='main';g.board.vertices.forEach(v=>{v.owner=-1;v.level=0;});g.board.edges.forEach(e=>e.owner=-1);
  const e=g.board.edges[0];e.owner=1;g.board.vertices[e.a].knight={owner:1,rank:1,active:false,activated:-1,promoted:-1};
  const card=grant(g,0,'diplomacy');assert(!E.legal(g,0).citiesKnights.some(o=>o.key===`play:${card.id}`));
  delete g.board.vertices[e.a].knight;g.board.vertices[e.a].owner=2;g.board.vertices[e.a].level=1;
  assert(E.legal(g,0).citiesKnights.some(o=>o.key===`play:${card.id}`));
});


function clearHands(g){for(const p of g.players)for(let r=0;r<8;r++)hand(g,p.id,r,0);}
const giveContextFields=['reason','source','total','initialCount','sourceScore','playerScore'];
function pendingGive(reason='wedding',count=5){
  const g=setup();g.phase='main';g.current=0;clearHands(g);
  if(reason==='wedding')g.cities.players[1].defenders=1;
  hand(g,1,2,count-1);hand(g,1,7,1);grant(g,1,'crane');play(g,0,reason);return g;
}

test('Wedding exposes its cause and exact two-card or short-hand obligation without revealing cards',()=>{
  let g=setup(4);g.phase='main';g.current=0;clearHands(g);
  g.cities.players[1].defenders=1;g.cities.players[2].defenders=1;
  hand(g,1,2,2);hand(g,1,7,1);hand(g,2,3,1);hand(g,3,4,2);grant(g,1,'crane');play(g,0,'wedding');
  const expected={kind:'give',player:1,count:2,reason:'wedding',source:0,to:0,total:2,initialCount:3,sourceScore:3,playerScore:4};
  for(let viewer=0;viewer<4;viewer++){
    const view=E.publicGame(g,viewer);assert.deepEqual(view.citiesKnights.choice,expected);
    for(let id=0;id<4;id++)if(id!==viewer){assert.equal(view.players[id].resources,null);assert.equal(view.citiesKnights.players[id].cards,null);}
    assert.equal(view.legal.citiesKnights.length>0,viewer===1,'only the required payer may choose cards');
  }
  assert.deepEqual(g.cities.queue.map(q=>q.player),[1,2],'equal-score player owes nothing for Wedding');
  const receiver=[...g.players[0].resources];choose(g,o=>o.key==='r:7');
  assert.equal(g.players[0].resources[7],receiver[7]+1);assert.equal(g.players[1].resources[7],0);
  assert.deepEqual(E.publicGame(g,1).citiesKnights.choice,{...expected,count:1});
  g=archive(g);assert.deepEqual(E.publicGame(g,1).citiesKnights.choice,{...expected,count:1},'mid-payment save retains original totals and cause');
  choose(g,o=>o.key==='r:2');
  assert.deepEqual(E.publicGame(g,2).citiesKnights.choice,{...expected,player:2,count:1,total:1,initialCount:1},'one-card hand owes one, not two');
  choose(g);assert.equal(g.phase,'main');assert.equal(g.players[2].resources.reduce((a,b)=>a+b),0);
  assert.equal(g.players[0].resources.reduce((a,b)=>a+b),3);assert.equal(g.players[3].resources[4],2);C.validate(g);
});

test('Sabotage records an odd hand total, includes tied scores and decrements only the remaining count',()=>{
  let g=pendingGive('sabotage',9);C.cities(g,1)[0].wall=true;
  const expected={kind:'give',player:1,count:4,reason:'sabotage',source:0,to:-1,total:4,initialCount:9,sourceScore:3,playerScore:3};
  assert.deepEqual(E.publicGame(g,1).citiesKnights.choice,expected);
  const bank=[...g.bank],source=[...g.players[0].resources];
  choose(g,o=>o.key==='r:7');assert.equal(g.bank[7],bank[7]+1);assert.deepEqual(g.players[0].resources,source,'discarded cards go to the bank, not the source');
  assert.deepEqual(E.publicGame(g,0).citiesKnights.choice,{...expected,count:3});
  g=archive(g);assert.deepEqual(E.publicGame(g,2).citiesKnights.choice,{...expected,count:3});
  choose(g);assert.equal(E.publicGame(g,1).citiesKnights.choice.count,2);choose(g);assert.equal(E.publicGame(g,1).citiesKnights.choice.count,1);choose(g);
  assert.equal(g.phase,'main');assert.equal(g.players[1].resources.reduce((a,b)=>a+b),5);assert.equal(g.bank[2],bank[2]+3);assert(C.cities(g,1)[0].wall);C.validate(g);
});

test('legacy mid-payment archives preserve their remaining debt without inventing an initial total',()=>{
  for(const reason of ['wedding','sabotage']){
    let g=pendingGive(reason,5);choose(g,o=>o.key==='r:7');
    const remaining=g.cities.queue[0].count;
    for(const q of g.cities.queue)for(const field of giveContextFields)delete q[field];
    g=archive(g);
    const view=E.publicGame(g,1).citiesKnights.choice;
    assert.deepEqual(view,{kind:'give',player:1,count:remaining,reason,source:0,to:reason==='wedding'?0:-1});
    assert(!Object.hasOwn(view,'total'));assert(!Object.hasOwn(view,'initialCount'));assert(!Object.hasOwn(view,'sourceScore'));
    finishChoices(g);C.validate(g);
  }
});

test('invalid or partial payment explanation metadata is rejected when restoring a save',()=>{
  const g=pendingGive('wedding',5);
  const corruptions=[
    q=>q.reason='invented',q=>q.reason='sabotage',q=>q.source=1,q=>q.source=99,
    q=>q.to=-1,q=>q.total=3,q=>q.count=3,q=>q.initialCount=4,q=>q.initialCount=999,
    q=>q.sourceScore=-1,q=>q.playerScore=q.sourceScore,q=>q.sourceScore=1000001,
    q=>delete q.reason,q=>delete q.total,q=>q.total=null
  ];
  for(const corrupt of corruptions){const bad=structuredClone(g);corrupt(bad.cities.queue[0]);assert.throws(()=>archive(bad));}
  const partial=structuredClone(g);for(const field of giveContextFields)delete partial.cities.queue[0][field];partial.cities.queue[0].initialCount=5;assert.throws(()=>archive(partial));
  const unrelated=setup();unrelated.phase='ckChoice';unrelated.cities.queue=[{kind:'aqueduct',player:0,total:1}];assert.throws(()=>archive(unrelated));
});

test('Commercial Harbor publicly explains the one-for-one exchange but keeps the chosen commodity private',()=>{
  let g=setup();g.phase='main';g.current=0;clearHands(g);hand(g,0,0,1);hand(g,1,5,1);hand(g,1,6,1);play(g,0,'harbor');
  E.act(g,0,{type:'ck',choice:'harbor:1:0'});g=archive(g);
  const expected={kind:'harborPay',player:1,count:1,reason:'harbor',source:0,to:0,resource:0,total:1};
  for(let id=0;id<3;id++)assert.deepEqual(E.publicGame(g,id).citiesKnights.choice,expected);
  assert.equal(E.publicGame(g,0).players[1].resources,null);
  choose(g,o=>o.key==='r:6');assert.equal(g.players[0].resources[0],0);assert.equal(g.players[1].resources[0],1);assert.equal(g.players[0].resources[6],1);assert.equal(g.players[1].resources[5],1);C.validate(g);
});

test('off-turn progress overflow exposes its limit reason and one-card action without exposing the hand',()=>{
  const g=setup();g.cities.players[1].levels[0]=1;
  for(const key of ['crane','medicine','mining','invention'])grant(g,1,key);
  const deck=g.cities.decks[0],top=deck.findIndex(key=>key!=='printing');[deck[0],deck[top]]=[deck[top],deck[0]];
  const dice=[.5,0,.5];E.act(g,0,{type:'roll'},()=>dice.shift());
  assert.deepEqual(E.publicGame(g,0).citiesKnights.choice,{kind:'discardProgress',player:1,count:1,reason:'progressLimit'});
  assert.equal(E.publicGame(g,0).citiesKnights.players[1].cards,null);assert.equal(g.cities.players[1].cards.length,5);
  choose(g);assert.equal(g.cities.players[1].cards.length,4);assert.equal(g.phase,'main');C.validate(g);
});
