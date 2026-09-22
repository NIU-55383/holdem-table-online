"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./catan-engine"), Maps = require("./catan-maps");
const rngFor = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const names = ["A", "B", "C", "D"];
const game = (id, layout = "default", seed = 1) => E.createGame(names.slice(0, Maps.get(id).players), rngFor(seed), id, layout);
const sorted = (a) => [...a].sort((x,y) => x-y);
const at = (board, [row,col]) => board.tiles.find((t) => t.row === row && t.col === col);
const actor = (g) => g.phase === "gold" ? g.goldQueue[0].id : g.phase === "discard" ? Number(Object.keys(g.discard)[0]) : g.current;
const fogNear = (g, e) => [...new Set([e.a,e.b].flatMap((v) => g.board.vertices[v].tiles))].filter((id) => g.board.tiles[id].resource === -3);
function invariant(g) {
  for (let r=0;r<5;r++) {
    assert.equal(g.bank[r] + g.players.reduce((n,p) => n+p.resources[r],0),19);
    assert.ok(g.bank[r]>=0 && g.players.every((p) => Number.isInteger(p.resources[r]) && p.resources[r]>=0));
  }
  for (const p of E.publicGame(g,0).players) assert.ok(p.roads<=15 && p.ships<=15 && p.settlements<=5 && p.cities<=4);
  const fog = g.board.tiles.filter((t)=>t.resource===-3).length;
  assert.equal(g.fogTerrain.length,fog);
  assert.equal(g.fogNumbers.length,g.fogTerrain.filter((r)=>r>=0).length);
}

test("eight maps include exact Fog and Desert inventories, legal harbors and four desert bonus regions", () => {
  assert.deepEqual(Maps.maps.slice(4,8).map((m) => m.id), ["fog-1", "fog-2", "desert-1", "desert-2"]);
  const inventory = {
    "fog-1": [4,2,4,2,2,0,0,16,12], "fog-2": [4,3,4,3,3,0,0,13,12],
    "desert-1": [5,3,4,4,4,2,3,10,0], "desert-2": [5,5,5,5,5,2,3,12,0],
  };
  for (const m of Maps.maps.slice(4,8)) {
    const g=game(m.id),b=g.board;
    assert.deepEqual(b,E.makeBoard(rngFor(32),m.id));
    assert.deepEqual([0,1,2,3,4,5,-1,-2,-3].map((r)=>b.tiles.filter((t)=>!t.frame&&t.resource===r).length),inventory[m.id]);
    assert.equal(b.ports.length,m.players===3?8:9);
    assert.equal(new Set(b.ports.flatMap((p)=>p.vertices)).size,b.ports.length*2);
    assert.deepEqual(sorted(b.ports.map((p)=>p.resource)),sorted([0,1,2,3,4,...Array(b.ports.length-5).fill(-1)]));
    b.ports.forEach((p)=>assert.equal(b.edges[p.edge].tiles.filter((t)=>b.tiles[t].resource>=-1).length,1));
    if(m.family==="desert") {
      assert.equal(b.tiles[b.robber].resource,-1);
      assert.equal(new Set(b.tiles.filter((t)=>t.resource>=0&&!t.setupAllowed).map((t)=>t.region)).size,4);
      const strip=at(b,[0,0]);
      assert.equal(strip.island,b.mainIsland,"Foreign strip is physically connected through desert");
      assert.notEqual(strip.region,at(b,[4,1]).region,"But is a separate reward territory");
    } else { assert.equal(g.fogTerrain.length,12); assert.equal(b.tiles[b.robber].number,12); assert.equal(m.bonusPoints,0); }
    while(g.turn===0) {
      const id=actor(g),l=E.legal(g,id);
      if(g.phase==="setupSettlement") for(const vId of l.settlements) {
        const v=b.vertices[vId];assert.ok(v.tiles.some((t)=>b.tiles[t].setupAllowed));
        if(m.family==="desert") assert.ok(v.tiles.every((t)=>b.tiles[t].resource<0||b.tiles[t].setupAllowed));
      }
      E.act(g,id,E.chooseBotAction(g,id,rngFor(4)));invariant(g);
    }
  }
});

test("800 seeded random boards obey their own region pools, shape, tokens and harbor restrictions", () => {
  for(const m of Maps.maps.slice(0,8)) for(let seed=1;seed<=100;seed++) {
    const b=E.makeBoard(rngFor(seed),m.id,"random"),fixed=E.makeBoard(rngFor(1),m.id);
    assert.equal(b.layout,"random");
    for(const group of m.randomPolicy.groups) {
      const before=group.map((cell)=>at(fixed,cell)),after=group.map((cell)=>at(b,cell));
      assert.deepEqual(sorted(after.map((t)=>t.resource)),sorted(before.map((t)=>t.resource)),m.id);
      assert.deepEqual(sorted(after.filter((t)=>t.number).map((t)=>t.number)),sorted(before.filter((t)=>t.number).map((t)=>t.number)));
    }
    const shuffled=new Set(m.randomPolicy.groups.flat().map((cell)=>at(b,cell).id));
    b.tiles.forEach((t,i)=>{
      if(!shuffled.has(i)) assert.deepEqual([t.resource,t.number],[fixed.tiles[i].resource,fixed.tiles[i].number]);
      if(m.family!=="shores") assert.equal(t.resource<0,fixed.tiles[i].resource<0,"Land/sea outline is fixed");
    });
    if(m.randomPolicy.redSeparated) assert.ok(!b.edges.some((e)=>e.tiles.length===2&&e.tiles.every((t)=>[6,8].includes(b.tiles[t].number))));
    if(m.randomPolicy.goldNoRed) assert.ok(b.tiles.filter((t)=>t.resource===5).every((t)=>![6,8].includes(t.number)));
    if(m.randomPolicy.productivePastures) assert.ok(b.tiles.filter((t)=>[0,2].includes(t.resource)).every((t)=>![2,3,11,12].includes(t.number)));
    assert.deepEqual(sorted(b.ports.map((p)=>p.resource)),sorted(fixed.ports.map((p)=>p.resource)));
    assert.ok(b.tiles[b.robber].number===12||b.tiles[b.robber].resource===-1);
    b.ports.forEach((p)=>assert.equal(b.edges[p.edge].tiles.filter((t)=>b.tiles[t].resource>=-1).length,1));
  }
  assert.equal(Maps.get("fog-1").randomPolicy.redSeparated,false);
  assert.throws(()=>E.makeBoard(rngFor(1),"fog-1","invalid"));
});

function discoveryFixture(kind="ship", phase="main", resource=0) {
  const g=game("fog-1");g.phase=phase;g.turn=3;
  if(kind==="road") {
    const revealed=g.board.tiles.find((t)=>t.resource===-3);
    revealed.resource=3;revealed.number=g.fogNumbers.pop();g.fogTerrain.splice(g.fogTerrain.indexOf(3),1);
  }
  let edge,anchor,old;
  for(const e of g.board.edges) {
    if(fogNear(g,e).length!==1||!e.tiles.some((t)=>kind==="road"?g.board.tiles[t].resource>=-1:g.board.tiles[t].resource<=-2)) continue;
    for(const v of [e.a,e.b]) {
      const back=g.board.vertices[v].edges.map((id)=>g.board.edges[id]).find((b)=>b.id!==e.id&&!fogNear(g,b).length&&b.tiles.some((t)=>g.board.tiles[t].resource===-2));
      if(kind==="road"||back) { edge=e;anchor=v;old=back;break; }
    }
    if(edge) break;
  }
  assert.ok(edge);Object.assign(g.board.vertices[anchor],{owner:0,level:1});
  g.players[0].resources=[6,6,6,6,6];g.bank=[13,13,13,13,13];
  const top=g.fogTerrain.length-1,index=g.fogTerrain.indexOf(resource);
  [g.fogTerrain[top],g.fogTerrain[index]]=[g.fogTerrain[index],g.fogTerrain[top]];
  return {g,edge,old,anchor,tile:g.board.tiles[fogNear(g,edge)[0]]};
}

test("roads and ships reveal terrain/tokens, award one resource, and never repeat discovery",()=>{
  for(const kind of ["road","ship"]) for(const resource of [-2,0,1,2,3,4]) {
    const {g,edge,tile}=discoveryFixture(kind,"main",resource),before=[...g.players[0].resources],fogCount=g.fogTerrain.length,tokenCount=g.fogNumbers.length;
    E.act(g,0,{type:kind,edge:edge.id});
    assert.equal(tile.resource,resource);assert.equal(g.fogTerrain.length,fogCount-1);
    assert.equal(g.fogNumbers.length,tokenCount-(resource===-2?0:1));
    assert.deepEqual(g.players[0].resources,before.map((n,r)=>n-E.COST[kind][r]+(r===resource?1:0)));
    assert.equal(E.publicGame(g,0).players[0].islandPoints,0);invariant(g);
    assert.throws(()=>E.act(g,0,{type:kind,edge:edge.id}));assert.equal(g.fogTerrain.length,fogCount-1);
  }
});

test("gold discovery suspends and resumes Road Building before dice, without consuming another card",()=>{
  const {g,edge,tile}=discoveryFixture("ship","roll",5);
  g.players[0].development=[{type:"roads",turn:1}];g.deck.splice(g.deck.indexOf("roads"),1);
  E.act(g,0,{type:"playDevelopment",card:"roads"});
  assert.equal(E.legal(g,0).cancelDevelopment,true);
  E.act(g,0,{type:"ship",edge:edge.id});
  assert.equal(g.pendingDevelopment,null);assert.equal(E.legal(g,0).cancelDevelopment,false);
  const committed=structuredClone(g);assert.throws(()=>E.act(g,0,{type:"cancelDevelopment"}));assert.deepEqual(g,committed);
  assert.equal(tile.resource,5);assert.equal(g.phase,"gold");assert.equal(g.freeRoads,1);
  assert.equal(g.goldResume,"freeRoads");
  E.act(g,0,{type:"gold",resources:[0,0,0,1,0]});
  assert.equal(g.phase,"freeRoads");assert.equal(g.developmentPlayed,true);
  assert.equal(E.legal(g,0).cancelDevelopment,false);assert.throws(()=>E.act(g,0,{type:"cancelDevelopment"}));
  const l=E.legal(g,0),id=l.ships.find((e)=>!fogNear(g,g.board.edges[e]).length);
  assert.notEqual(id,undefined);E.act(g,0,{type:"ship",edge:id});assert.equal(g.phase,"roll");invariant(g);
});

test("moving an old ship discovers fog and newly revealed land supports settlements and production",()=>{
  const {g,edge,tile,old,anchor}=discoveryFixture("ship","main",0);
  assert.ok(old);Object.assign(old,{owner:0,kind:"ship",builtTurn:1});
  assert.ok(E.legal(g,0).shipDestinations[old.id]?.includes(edge.id));
  E.act(g,0,{type:"moveShip",from:old.id,edge:edge.id});assert.equal(tile.resource,0);assert.equal(g.shipMoved,true);
  const v=g.board.vertices[tile.vertices.find((v)=>v!==anchor)];Object.assign(v,{owner:1,level:2});
  const before=g.players[1].resources[0];E.produce(g,tile.number);assert.ok(g.players[1].resources[0]>=before+2);invariant(g);
});

test("fog decks remain private and never influence bot choices before discovery",()=>{
  const g=game("fog-2"),other=structuredClone(g);other.fogTerrain.reverse();other.fogNumbers.reverse();
  for(const id of [0,1,2,3]) {
    const pub=E.publicGame(g,id);assert.equal(pub.fogTerrain,undefined);assert.equal(pub.fogNumbers,undefined);
    assert.deepEqual(pub,E.publicGame(other,id));
  }
  assert.deepEqual(E.chooseBotAction(g,0,rngFor(9)),E.chooseBotAction(other,0,rngFor(9)));
  g.phase="robber";const l=E.legal(g,0);
  assert.ok([...l.robber,...l.pirate].every((id)=>g.board.tiles[id].resource!==-3));
});

test("each desert foreign territory awards each player once, with at most eight bonus VP",()=>{
  for(const id of ["desert-1","desert-2"]) {
    const g=game(id),p=g.players[0];g.phase="main";g.turn=1;g.target=100;
    p.homeIslands=[g.board.tiles.find((t)=>t.setupAllowed).region];
    const regions=[...new Set(g.board.tiles.filter((t)=>t.resource>=0&&!t.setupAllowed).map((t)=>t.region))];
    for(const region of regions) {
      const v=g.board.vertices.find((v)=>v.tiles.some((t)=>g.board.tiles[t].region===region&&g.board.tiles[t].resource>=0)&&v.owner<0&&v.neighbors.every((n)=>g.board.vertices[n].owner<0));
      assert.ok(v);p.resources=[9,9,9,9,9];g.bank=[10,10,10,10,10];g.board.edges[v.edges[0]].owner=0;
      E.act(g,0,{type:"settlement",vertex:v.id});
      assert.equal(v.islandBonus,2);
      E.act(g,0,{type:"city",vertex:v.id});assert.equal(v.islandBonus,2);
    }
    assert.equal(p.discovered.length,4);assert.equal(E.publicGame(g,0).players[0].islandPoints,8);
  }
});

test("new scenario bots finish default and random games with exploration and conserved inventory",{timeout:120000},()=>{
  const covered={reveals:0,gold:0,ship:0};
  for(const m of Maps.maps.slice(4,8)) for(const layout of ["default","random"]) for(let seed=1;seed<=4;seed++) {
    const rng=rngFor(seed),g=E.createGame(names.slice(0,m.players),rng,m.id,layout);let steps=0;
    while(g.phase!=="over"&&steps++<9000) {
      const id=actor(g),a=E.chooseBotAction(g,id,rng);assert.ok(a,`${m.id}/${layout} stuck ${g.phase}`);
      if(a.type in covered) covered[a.type]++;
      E.act(g,id,a,rng);invariant(g);
    }
    assert.equal(g.phase,"over",`${m.id}/${layout}/${seed} ${g.players.map((p)=>E.score(g,p.id))}`);
    if(m.family==="fog") { covered.reveals+=12-g.fogTerrain.length;assert.ok(g.players.every((p)=>p.discovered.length===0)); }
  }
  assert.ok(covered.reveals>0&&covered.gold>0&&covered.ship>0);console.log("New scenario coverage:",covered);
});

test("random Fog rooms share one board, hide discovery stacks, reconnect unchanged and reroll on rematch",{timeout:15000},async()=>{
  const http=require("node:http"),{once}=require("node:events"),{WebSocket}=require("ws"),{attachCatan}=require("./catan-server");
  const server=http.createServer(),catan=attachCatan(server),sockets=[];
  server.on("upgrade",(r,s,h)=>catan.upgrade(r,s,h));server.listen(0,"127.0.0.1");await once(server,"listening");
  async function client(token) {
    const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`),messages=[];sockets.push(ws);
    ws.on("message",(raw)=>messages.push(JSON.parse(raw)));
    const next=async(predicate)=>{for(let i=0;i<500;i++){const m=messages.find(predicate);if(m)return m;await new Promise((r)=>setTimeout(r,10));}throw new Error("Missing network state");};
    await once(ws,"open");ws.send(JSON.stringify({type:"hello",token}));const welcome=await next((m)=>m.type==="welcome");
    return {ws,token:welcome.token,next,send:(m)=>ws.send(JSON.stringify(m))};
  }
  try {
    const host=await client();host.send({type:"create",name:"Host",mapId:"fog-2",layout:"random",seats:3});
    const lobby=await host.next((m)=>m.type==="state");assert.equal(lobby.layout,"random");assert.equal(lobby.maxPlayers,4);
    assert.equal(lobby.previewBoard.tiles.filter((t)=>t.resource===-3).length,12);
    const guest=await client();guest.send({type:"join",name:"Guest",code:lobby.code});
    const joined=await guest.next((m)=>m.type==="state");assert.deepEqual(joined.previewBoard,lobby.previewBoard);
    host.send({type:"fillBots"});await host.next((m)=>m.seats?.length===4);host.send({type:"start"});
    const start=await host.next((m)=>m.game);const room=catan.rooms.get(lobby.code);
    assert.deepEqual(start.game.board,lobby.previewBoard);assert.equal(start.game.layout,"random");assert.equal(start.game.target,12);
    const other=await guest.next((m)=>m.game);assert.deepEqual(other.game.board,start.game.board);
    assert.equal(other.game.fogTerrain,undefined);assert.equal(other.game.fogNumbers,undefined);
    assert.ok(other.game.players[0].resources===null);assert.equal(room.game.fogTerrain.length,12);
    host.ws.close();await once(host.ws,"close");clearTimeout(room.timer);
    const again=await client(host.token),restored=await again.next((m)=>m.game);
    assert.deepEqual(restored.game.board,start.game.board);assert.equal(restored.layout,"random");
    room.game.phase="over";room.game.winner=0;clearTimeout(room.timer);
    (restored.host===restored.you?again:guest).send({type:"rematch"});
    const changed=await again.next((m)=>m.game&&JSON.stringify(m.game.board)!==JSON.stringify(start.game.board));
    assert.equal(changed.game.layout,"random");assert.equal(changed.game.phase,"setupSettlement");
    assert.equal(changed.game.board.tiles.filter((t)=>t.resource===-3).length,12);assert.equal(room.game.fogTerrain.length,12);
  } finally {sockets.forEach((ws)=>ws.terminate());catan.rooms.forEach((r)=>clearTimeout(r.timer));server.close();server.emit("close");}
});
