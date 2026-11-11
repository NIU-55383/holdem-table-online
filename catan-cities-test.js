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
test('improvement discounts, metropolis claims and transfer at five',()=>{const g=setup();g.phase='main';g.cities.players[0].levels[0]=3;hand(g,0,5,4);E.act(g,0,{type:'ck',choice:'upgrade:0'});assert.equal(g.phase,'ckChoice');choose(g);assert.equal(C.cities(g,0)[0].metropolis,0);assert.equal(E.score(g,0),5);g.current=1;g.cities.players[1].levels[0]=4;hand(g,1,5,5);E.act(g,1,{type:'ck',choice:'upgrade:0'});choose(g);assert.equal(C.cities(g,0)[0].metropolis,undefined);assert.equal(C.cities(g,1)[0].metropolis,0);C.validate(g);});
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
