"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),E=require("./catan-engine"),C=require("./catan-cities"),D=require("./catan-cities-data");
const maps=["cities","cities-shores-1"];
function seeded(seed=47){return()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
function ready(mapId,seed=47){
  const g=E.createGame(["Offerer","Bot","Other"],seeded(seed),mapId);
  for(let n=0;g.phase.startsWith("setup");n++){assert(n<100);E.act(g,g.current,E.chooseBotAction(g,g.current));}
  Object.assign(g,{phase:"main",current:0,rolled:true,dice:[2,3]});
  return g;
}
function allocate(g,allocations){
  const size=g.players[0].resources.length;
  g.players.forEach((p,id)=>{p.resources=Array.from({length:size},(_,r)=>allocations[id]?.[r]||0);});
  g.bank=Array.from({length:size},(_,r)=>(r<5?(g.resourceSupply||19):12)-g.players.reduce((n,p)=>n+p.resources[r],0));
  assert(g.bank.every(n=>n>=0));
}
function offer(g,give,want){E.act(g,0,{type:"offerTrade",give,want,to:1});assert(E.canRespondToTrade(g,1));return g;}
function coinsForGrain(mapId,hand=[0,0,0,1,3,0,0,0]){
  const g=ready(mapId);g.cities.players[1].levels[2]=2;
  const give=[0,0,0,0,0,0,0,3],want=[0,0,0,1,0,0,0,0];
  allocate(g,[give,hand]);return offer(g,give,want);
}
function decision(g){
  const before=structuredClone(g),action=E.chooseBotAction(g,1);
  assert.deepEqual(g,before,"Evaluating a trade must not mutate the game");
  assert.deepEqual(Object.keys(action).sort(),["offerId","type"]);assert.equal(action.offerId,g.trade.id);
  return action;
}
function conserved(g){
  for(let r=0;r<g.bank.length;r++){
    const limit=r<5?(g.resourceSupply||19):12;
    assert.equal(g.bank[r]+g.players.reduce((n,p)=>n+p.resources[r],0),limit);
    assert(g.bank[r]>=0);for(const p of g.players)assert(Number.isSafeInteger(p.resources[r])&&p.resources[r]>=0);
  }
  if(g.cities)C.validate(g);
}
function grantProgress(g,id,key){
  const deck=g.cities.decks[D.cards[key][0]],at=deck.indexOf(key);assert(at>=0);deck.splice(at,1);
  g.cities.players[id].cards.push({key,id:++g.cities.sequence});
}

test("Cities bots can accept three coins for one grain to unlock Politics instead of fixating on a city",()=>{
  for(const mapId of maps){
    const g=coinsForGrain(mapId),before=structuredClone(g),a=decision(g);
    assert.equal(a.type,"acceptTrade",mapId+": a useful Politics upgrade justifies this favorable commodity offer");
    E.act(g,1,a);
    assert.equal(g.trade,null);assert.deepEqual(g.bank,before.bank,"Player trades do not manufacture or spend bank cards");
    assert.deepEqual(g.players[1].resources,[0,0,0,0,3,0,0,3]);
    assert.deepEqual(g.players[0].resources,[0,0,0,1,0,0,0,0]);conserved(g);
    E.act(g,0,{type:"end"});g.phase="main";g.rolled=true;
    const upgrade=E.legal(g,1).citiesKnights.find(o=>o.key==="upgrade:2");assert(upgrade,"The accepted coins actually fund the planned upgrade");
    E.act(g,1,{type:"ck",choice:upgrade.key});assert.equal(g.cities.players[1].levels[2],3);conserved(g);
  }
});

test("Commodity demand falls when the branch is complete and coins are already abundant",()=>{
  for(const mapId of maps){
    const useful=coinsForGrain(mapId);assert.equal(decision(useful).type,"acceptTrade");
    const saturated=coinsForGrain(mapId,[0,0,0,2,3,0,0,8]);saturated.cities.players[1].levels[2]=5;
    assert.equal(decision(saturated).type,"rejectTrade",mapId+": surplus coins must not displace an immediately affordable city");
    conserved(saturated);
  }
});

test("Even an attractive commodity offer is refused when its maker is near the mode's victory target",()=>{
  for(const mapId of maps)for(const distance of [2,1]){
    const g=coinsForGrain(mapId);assert.equal(decision(g).type,"acceptTrade");
    const targetScore=g.target-distance;g.cities.players[0].defenders+=targetScore-E.score(g,0,false);
    assert.equal(E.score(g,0,false),targetScore);
    assert.equal(decision(g).type,"rejectTrade",mapId+": do not finance a rival at "+targetScore+"/"+g.target);
    conserved(g);
  }
});

test("A threatened Cities bot protects the last grain needed to activate its knight",()=>{
  for(const mapId of maps){
    const g=coinsForGrain(mapId);assert.equal(decision(g).type,"acceptTrade");
    const site=g.board.vertices.find(v=>v.owner<0&&!v.knight&&v.edges.some(id=>g.board.edges[id].owner===1));
    assert(site,"The setup roads provide a legal knight site");
    site.knight={owner:1,rank:1,active:false,activated:-1,promoted:-1};g.cities.ship=6;
    assert.equal(decision(g).type,"rejectTrade",mapId+": a looming barbarian attack raises the value of the last activation grain");
    conserved(g);
  }
});

test("Another player's temporary Crane does not change the responder's upgrade costs",()=>{
  for(const mapId of maps){
    const g=coinsForGrain(mapId),plain=decision(g);g.cities.crane=1;
    assert.deepEqual(decision(g),plain,"Only the current player owns this turn's Crane discount");conserved(g);
  }
});

test("Cities trade evaluation ignores opponents' hidden resource allocation and progress-card types",()=>{
  for(const mapId of maps){
    const actions=[];
    for(const swapped of [false,true]){
      const g=coinsForGrain(mapId);
      const give=[0,0,0,0,0,0,0,3],want=[0,0,0,1,0,0,0,0];
      const source=[0,0,0,0,0,0,0,3],other=Array(8).fill(0);
      source[swapped?1:0]=1;other[swapped?0:1]=1;
      allocate(g,[source,[0,0,0,1,3,0,0,0],other]);g.trade=null;offer(g,give,want);
      grantProgress(g,0,swapped?"medicine":"crane");grantProgress(g,2,swapped?"crane":"medicine");
      const view=E.publicGame(g,1);assert.equal(view.players[0].resources,null);assert.equal(view.citiesKnights.players[0].cards,null);
      assert.equal(view.players[0].resourceCount,4);assert.equal(view.players[2].resourceCount,1);assert.equal(view.citiesKnights.players[0].count,1);
      actions.push(decision(g).type);conserved(g);
    }
    assert.deepEqual(actions,["acceptTrade","acceptTrade"],mapId+": identical visible opportunities produce identical decisions");
  }
});

test("Base and Seafarers bots still trade surplus toward a city without inspecting hidden VP cards",()=>{
  for(const mapId of ["base","shores-1"]){
    const actions=[];
    for(const type of ["knight","vp"]){
      const g=ready(mapId),give=[0,0,0,1,0],want=[0,0,0,0,1];
      allocate(g,[[0,0,0,1,0],[0,0,0,1,4]]);
      const at=g.deck.indexOf(type);assert(at>=0);g.deck.splice(at,1);g.players[0].development.push({type,turn:0});
      offer(g,give,want);const a=decision(g);actions.push(a.type);
      if(a.type==="acceptTrade"){E.act(g,1,a);assert.deepEqual(g.players[1].resources,[0,0,0,2,3]);conserved(g);}
    }
    assert.deepEqual(actions,["acceptTrade","acceptTrade"],mapId+": unobserved VP-card identity cannot alter the decision");
  }
});

test("The same quote changes when public grain production makes the bot's grain scarce or plentiful",()=>{
  const scarce=ready("cities",66),field=scarce.board.tiles.find(t=>t.resource===3&&t.number===3&&t.vertices.some(v=>scarce.board.vertices[v].owner===1));
  const unused=scarce.board.tiles.find(t=>t.resource>=0&&t.number===6&&t.vertices.every(v=>scarce.board.vertices[v].owner<0));
  assert(field&&unused,"Seeded fixture has a low-frequency bot field and an unoccupied high-frequency tile");
  allocate(scarce,[[0,0,0,0,0,0,0,1],[0,0,0,1,0,0,0,1]]);
  const plentiful=structuredClone(scarce);
  [plentiful.board.tiles[field.id].number,plentiful.board.tiles[unused.id].number]=[unused.number,field.number];
  assert.deepEqual(plentiful.board.tiles.map(t=>t.number).sort(),scarce.board.tiles.map(t=>t.number).sort(),"Number tokens are conserved");
  assert.deepEqual(plentiful.players,scarce.players,"Private hands and player assets are unchanged");
  assert.deepEqual(plentiful.bank,scarce.bank);
  const output=g=>{
    const total=Array(8).fill(0);
    for(let number=2;number<=12;number++){
      if(number===7)continue;
      const copy=structuredClone(g);allocate(copy,[]);E.produce(copy,number);
      copy.players[1].resources.forEach((n,r)=>total[r]+=n*(6-Math.abs(7-number)));
    }
    return total;
  };
  const low=output(scarce),high=output(plentiful);
  assert(high[3]>low[3],"Actual engine production makes grain easier for this bot to replenish");
  assert.equal(high[7],low[7],"Its coin production is unchanged");
  const give=[0,0,0,0,0,0,0,1],want=[0,0,0,1,0,0,0,0];
  offer(scarce,give,want);offer(plentiful,give,want);
  assert.equal(decision(scarce).type,"rejectTrade","Do not sell scarce grain for the marginal coin");
  const a=decision(plentiful);assert.equal(a.type,"acceptTrade","A stronger grain supply makes the identical quote worthwhile");
  E.act(plentiful,1,a);conserved(plentiful);conserved(scarce);
});
