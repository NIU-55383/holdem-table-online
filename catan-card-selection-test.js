"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),E=require("./catan-engine"),C=require("./catan-cities"),D=require("./catan-cities-data"),A=require("./room-archive");
const total=a=>a.reduce((n,x)=>n+x,0), resources=(...pairs)=>{const a=Array(8).fill(0);for(const [r,n] of pairs)a[r]=n;return a;};
function rng(seed=97){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function setup(n=3){const g=E.createGame(Array.from({length:n},(_,i)=>`P${i}`),rng(),"cities");while(g.phase.startsWith("setup"))E.act(g,g.current,E.chooseBotAction(g,g.current));g.phase="main";g.players.forEach(p=>setHand(g,p.id,resources()));return g;}
function setHand(g,id,values){g.players[id].resources.forEach((n,r)=>{g.bank[r]+=n-values[r];assert(g.bank[r]>=0);});g.players[id].resources=[...values];}
function grant(g,id,key){const deck=g.cities.decks[D.cards[key][0]],index=deck.indexOf(key);assert(index>=0);deck.splice(index,1);const card={id:++g.cities.sequence,key};g.cities.players[id].cards.push(card);return card;}
function play(g,id,key){const card=grant(g,id,key);E.act(g,id,{type:"ck",choice:`play:${card.id}`});}
function queue(g,...items){g.phase="ckChoice";g.cities.queue=items;g.cities.after="main";}
function select(g,id,value,field="resources"){const action={type:"ckSelect",revision:g.revision,[field]:value};E.act(g,id,action);return action;}
function rejectsUnchanged(g,id,a){const before=JSON.stringify(g);assert.throws(()=>E.act(g,id,a));assert.equal(JSON.stringify(g),before,"rejected batch must leave the entire game unchanged");}
function conserved(g){assert.deepEqual(g.bank.map((n,r)=>n+total(g.players.map(p=>p.resources[r]))),[19,19,19,19,19,12,12,12]);C.validate(g);}
function restore(g){const room={mapId:"cities",layout:"default",maxPlayers:g.players.length,thieves:"both",seats:g.players.map((p,i)=>({position:i,name:p.name,token:`secret${i}`})),game:g};return A.decode(A.encode("catan",room),["catan"]).room.game;}
function model(g,id){return E.publicGame(g,id).citiesKnights.selection;}
function wedding(){const g=setup();g.cities.players[1].defenders=1;setHand(g,1,resources([0,2],[5,1],[7,1]));play(g,0,"wedding");assert.equal(g.cities.queue[0].kind,"give");return g;}

test("Wedding submits a mixed resource/commodity payment once, preserves supply, and rejects replay",()=>{
  const g=wedding(),before=g.revision;
  assert.deepEqual(model(g,1),{kind:"give",required:2,resources:[2,0,0,0,0,1,0,1]});
  const action=select(g,1,resources([0,1],[7,1]));
  assert.equal(g.revision,before+1);assert.equal(g.phase,"main");assert.deepEqual(g.players[0].resources,resources([0,1],[7,1]));assert.deepEqual(g.players[1].resources,resources([0,1],[5,1]));
  conserved(g);rejectsUnchanged(g,1,action);
});

test("Saboteur discards its complete half-hand obligation atomically to the bank",()=>{
  const g=setup();setHand(g,1,resources([0,3],[2,2],[5,2],[7,2]));play(g,0,"sabotage");
  assert.equal(model(g,1).required,4);const before=[...g.bank],revision=g.revision;
  select(g,1,resources([0,2],[5,1],[7,1]));
  assert.deepEqual(g.bank,before.map((n,r)=>n+([2,0,0,0,0,1,0,1][r])));assert.equal(g.revision,revision+1);assert.equal(g.phase,"main");assert.equal(total(g.players[1].resources),5);conserved(g);
});

test("batch rejects incomplete, excessive, negative, fractional, unavailable and malformed resources before any change",()=>{
  const g=wedding(),good=resources([0,1],[5,1]),base={type:"ckSelect",revision:g.revision};
  const variants=[resources(),resources([0,1]),resources([0,2],[5,1]),resources([0,-1],[5,3]),resources([0,.5],[5,1.5]),resources([0,3],[5,-1]),resources([6,2]),good.slice(0,5),[...good,0],good.map((n,r)=>r===0?"1":n),good.map((n,r)=>r===0?NaN:n),good.map((n,r)=>r===0?Infinity:n),Array(8),null,{},"wood"];
  for(const value of variants)rejectsUnchanged(g,1,{...base,resources:value});
  rejectsUnchanged(g,1,{...base,resources:good,cards:[]});rejectsUnchanged(g,1,{...base,resources:good,choice:"r:0"});rejectsUnchanged(g,1,{...base,cards:[1]});rejectsUnchanged(g,1,base);
  select(g,1,good);conserved(g);
});

test("actor, phase and integer revision guard rejects stale, missing and foreign submissions",()=>{
  const g=wedding(),valid={type:"ckSelect",revision:g.revision,resources:resources([0,1],[5,1])};
  for(const actor of [0,2,-1,99])rejectsUnchanged(g,actor,valid);
  for(const revision of [undefined,null,g.revision-1,g.revision+1,String(g.revision),.5,NaN])rejectsUnchanged(g,1,{...valid,revision});
  const main=setup();rejectsUnchanged(main,0,{...valid,revision:main.revision});
  main.phase="roll";rejectsUnchanged(main,0,{...valid,revision:main.revision});
  queue(main,{kind:"reward",player:0});rejectsUnchanged(main,0,{...valid,revision:main.revision});
});

test("revision prevents one confirmation consuming a second same-player obligation",()=>{
  const g=setup();setHand(g,1,resources([0,4]));queue(g,{kind:"give",player:1,to:0,count:2},{kind:"give",player:1,to:-1,count:2});
  const action=select(g,1,resources([0,2]));assert.equal(g.phase,"ckChoice");assert.equal(model(g,1).required,2);rejectsUnchanged(g,1,action);
  select(g,1,resources([0,2]));assert.equal(g.phase,"main");assert.equal(g.players[0].resources[0],2);assert.equal(g.players[1].resources[0],0);conserved(g);
});

test("Commercial Harbor accepts exactly one commodity and performs both sides of the exchange together",()=>{
  const g=setup();setHand(g,0,resources([2,1]));setHand(g,1,resources([0,2],[5,2],[6,1]));play(g,0,"harbor");E.act(g,0,{type:"ck",choice:"harbor:1:2"});
  assert.deepEqual(model(g,1),{kind:"harborPay",required:1,resources:[0,0,0,0,0,2,1,0]});
  const base={type:"ckSelect",revision:g.revision};for(const a of [resources([0,1]),resources([5,2]),resources([7,1]),resources()])rejectsUnchanged(g,1,{...base,resources:a});
  const broken=structuredClone(g);setHand(broken,0,resources());rejectsUnchanged(broken,1,{...base,resources:resources([5,1])});
  select(g,1,resources([6,1]));assert.equal(g.phase,"main");assert.deepEqual(g.players[0].resources,resources([6,1]));assert.deepEqual(g.players[1].resources,resources([0,2],[2,1],[5,2]));conserved(g);
});

test("Aqueduct chooses one ordinary resource, rejects commodities and empty bank supply",()=>{
  const g=setup();setHand(g,2,resources([4,19]));g.cities.players[0].levels[0]=3;g.cities.players[1].levels[0]=3;E.produce(g,99);
  assert.deepEqual(model(g,0),{kind:"aqueduct",required:1,resources:[19,19,19,19,0,0,0,0]});
  for(const values of [resources([5,1]),resources([4,1]),resources([0,2])])rejectsUnchanged(g,0,{type:"ckSelect",revision:g.revision,resources:values});
  select(g,0,resources([1,1]));assert.equal(g.cities.queue[0].player,1);select(g,1,resources([2,1]));assert.equal(g.phase,"main");assert.equal(g.players[0].resources[1],1);assert.equal(g.players[1].resources[2],1);conserved(g);
});

test("Master Merchant collects two chosen cards together, including commodities and a short target hand",()=>{
  for(const count of [1,2,3]){
    const g=setup();g.cities.players[1].defenders=1;setHand(g,1,count===1?resources([6,1]):resources([0,count-1],[6,1]));play(g,0,"guild");E.act(g,0,{type:"ck",choice:"player:1"});
    assert.equal(model(g,0).required,Math.min(count,2));const chosen=count===1?resources([6,1]):resources([0,1],[6,1]);
    rejectsUnchanged(g,0,{type:"ckSelect",revision:g.revision,resources:resources([7,Math.min(count,2)])});
    select(g,0,chosen);assert.equal(g.phase,"main");assert.deepEqual(g.players[0].resources,chosen);assert.equal(total(g.players[1].resources),Math.max(0,count-2));conserved(g);
  }
});

test("Spy transfers only a selected target card without returning it to a deck",()=>{
  const g=setup(),a=grant(g,1,"crane"),b=grant(g,1,"mining"),foreign=grant(g,2,"medicine");play(g,0,"espionage");E.act(g,0,{type:"ck",choice:"player:1"});
  assert.deepEqual(model(g,0),{kind:"takeProgress",required:1,cards:[a,b]});
  for(const cards of [[],[a.id,a.id],[a.id,b.id],[foreign.id],[999],[String(a.id)],[null],Array(1)])rejectsUnchanged(g,0,{type:"ckSelect",revision:g.revision,cards});
  rejectsUnchanged(g,0,{type:"ckSelect",revision:g.revision,cards:[a.id],resources:resources()});
  const decks=structuredClone(g.cities.decks);select(g,0,[b.id],"cards");assert.deepEqual(g.cities.players[0].cards,[b]);assert.deepEqual(g.cities.players[1].cards,[a]);assert.deepEqual(g.cities.decks,decks);conserved(g);
});

test("progress hand-limit confirmation removes the selected card before resuming production",()=>{
  const g=setup();g.phase="roll";g.cities.players[1].levels[0]=1;for(const key of ["crane","medicine","mining","invention"])grant(g,1,key);
  const deck=g.cities.decks[0],top=deck.findIndex(key=>key!=="printing");[deck[0],deck[top]]=[deck[top],deck[0]];
  const rolls=[.5,0,.5];E.act(g,0,{type:"roll"},()=>rolls.shift());assert.equal(g.cities.queue[0].kind,"discardProgress");
  const required=model(g,1);assert.equal(required.required,1);assert.equal(required.cards.length,5);const card=required.cards[2],before=g.cities.decks[D.cards[card.key][0]].length;
  select(g,1,[card.id],"cards");assert.equal(g.cities.players[1].cards.length,4);assert(!g.cities.players[1].cards.some(c=>c.id===card.id));assert.equal(g.cities.decks[D.cards[card.key][0]].length,before+1);assert.equal(g.phase,"main");conserved(g);
});

test("an imported progress-discard queue preserves its one-card obligation and rejects duplicate or foreign IDs",()=>{
  let g=setup();for(const key of ["crane","medicine","mining","invention","irrigation","smithing"])grant(g,1,key);queue(g,{kind:"discardProgress",player:1});g=restore(g);
  const cards=model(g,1).cards;assert.equal(model(g,1).required,1);
  for(const ids of [[],[cards[0].id,cards[0].id],[cards[0].id,cards[1].id],[999]])rejectsUnchanged(g,1,{type:"ckSelect",revision:g.revision,cards:ids});
  const legacy=structuredClone(g);E.act(legacy,1,{type:"ck",choice:`card:${cards[0].id}`});
  select(g,1,[cards[0].id],"cards");assert.equal(g.cities.players[1].cards.length,5);assert.equal(g.phase,"main");assert.deepEqual(g.cities.players,legacy.cities.players);assert.deepEqual(g.cities.decks,legacy.cities.decks);conserved(g);
});

test("selection inventory is private to the required actor for all six choice kinds",()=>{
  const cases=[{kind:"give",player:1,to:0,count:2},{kind:"harborPay",player:1,to:0,resource:0},{kind:"aqueduct",player:1},{kind:"takeCards",player:1,target:2,remaining:2},{kind:"takeProgress",player:1,target:2},{kind:"discardProgress",player:1}];
  for(const item of cases){const g=setup();setHand(g,0,resources([0,1]));setHand(g,1,resources([0,2],[7,2]));setHand(g,2,resources([1,3],[6,1]));grant(g,1,"crane");grant(g,2,"mining");queue(g,item);
    const view=E.publicGame(g,1);assert.equal(view.citiesKnights.selection.kind,item.kind);assert.equal(view.players[2].resources,null);assert.equal(view.citiesKnights.players[2].cards,null);
    for(const actor of [0,2]){assert.equal(model(g,actor),null);assert.deepEqual(E.publicGame(g,actor).legal.citiesKnights,[]);}
    const payload=view.citiesKnights.selection;if(payload.resources)payload.resources.fill(0);else payload.cards[0].key="bad";assert.notDeepEqual(model(g,1),payload,"selection model must not alias game inventory");
    g.phase="main";assert.equal(model(g,1),null);
  }
  const g=setup();queue(g,{kind:"pillage",player:1});assert.equal(model(g,1),null);
});

test("legacy partial choices and old short-hand archives can finish through the batch protocol",()=>{
  const g=wedding();E.act(g,1,{type:"ck",choice:"r:0"});assert.equal(model(g,1).required,1);select(g,1,resources([5,1]));conserved(g);
  let old=setup();setHand(old,1,resources([0,1]));queue(old,{kind:"give",player:1,to:0,count:2});old=restore(old);assert.equal(model(old,1).required,1);select(old,1,resources([0,1]));assert.equal(old.phase,"main");conserved(old);
});

test("legacy ck and bot choices remain usable for each batch-enabled queue",()=>{
  for(const q of [{kind:"give",player:1,to:0,count:2},{kind:"harborPay",player:1,to:0,resource:0},{kind:"aqueduct",player:1},{kind:"takeCards",player:1,target:2,remaining:2},{kind:"takeProgress",player:1,target:2},{kind:"discardProgress",player:1}]){
    const g=setup();setHand(g,0,resources([0,1]));setHand(g,1,resources([1,2],[5,2]));setHand(g,2,resources([2,2]));grant(g,1,"crane");grant(g,2,"mining");queue(g,q);
    for(let step=0;g.phase==="ckChoice"&&step<5;step++){const actor=E.requiredActors(g)[0],a=E.chooseBotAction(g,actor);assert.equal(a.type,"ck");E.act(g,actor,a);}
    assert.equal(g.phase,"main",q.kind);conserved(g);
  }
});
