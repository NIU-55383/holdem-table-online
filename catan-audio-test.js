"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./catan-engine"), A = require("./catan-audio");
function game(map = "base") {
  let seed = 41;
  return E.createGame(["A", "B", "C"], () => ((seed = (Math.imul(seed,1664525)+1013904223) >>> 0) / 4294967296), map);
}
function ready(map) {
  const g = game(map);
  while (!g.turn) { const id = g.phase === "gold" ? g.goldQueue[0].id : g.current; E.act(g,id,E.chooseBotAction(g,id)); }
  g.players[0].resources = [8,8,8,8,8]; g.bank = [11,11,11,11,11]; return g;
}
function checkEffect(g, sound) {
  assert.deepEqual(g.effect, {id:g.revision,sound}); assert.ok(A.durations[sound]);
  assert.deepEqual(E.publicGame(g,1).effect, g.effect, "Only public sound kind and revision are transmitted");
}
test("confirmed buildings, routes, dice and thieves have different sound cues", () => {
  const base = game(); E.act(base,0,E.chooseBotAction(base,0)); checkEffect(base,"settlement");
  E.act(base,0,{type:"road",edge:E.legal(base,0).roads[0]}); checkEffect(base,"road");
  const g = ready(); E.act(g,0,{type:"roll"},()=>0); checkEffect(g,"dice");
  E.act(g,0,{type:"city",vertex:E.legal(g,0).cities[0]}); checkEffect(g,"city");
  const before = structuredClone(g);
  assert.throws(()=>E.act(g,0,{type:"city",vertex:-1})); assert.deepEqual(g,before, "Invalid actions never create a sound event");
  g.phase="robber"; g.resumePhase="main"; E.act(g,0,{type:"robber",tile:E.legal(g,0).robber[0]}); checkEffect(g,"robber");
  const sea = game("shores-1");
  const coast = E.legal(sea,0).settlements.find(id => { const v = sea.setupVertex; sea.setupVertex=id; const ok=E.shipSites(sea,0,true).length; sea.setupVertex=v; return ok; });
  E.act(sea,0,{type:"settlement",vertex:coast}); E.act(sea,0,{type:"ship",edge:E.legal(sea,0).ships[0]}); checkEffect(sea,"ship");
  const sailing = ready("shores-1"); sailing.phase="robber"; sailing.resumePhase="main";
  E.act(sailing,0,{type:"pirate",tile:E.legal(sailing,0).pirate[0]}); checkEffect(sailing,"pirate");
});
test("development cues reveal only played cards, and victory has priority", () => {
  for (const card of ["roads","plenty","monopoly","knight"]) {
    const g=ready(); g.deck.splice(g.deck.indexOf(card),1); g.players[0].development.push({type:card,turn:0});
    E.act(g,0,{type:"playDevelopment",card}); checkEffect(g,card);
    if (["roads","plenty"].includes(card)) { E.act(g,0,{type:"cancelDevelopment"}); checkEffect(g,"cancel"); }
  }
  const g=ready(); g.phase="main"; g.rolled=true;
  E.act(g,0,{type:"buyDevelopment"}); assert.equal(g.effect,null, "The purchased card's identity stays private");
  assert.equal(E.publicGame(g,1).players[0].development,null);
  g.target=2; E.act(g,0,{type:"bankTrade",give:0,get:1}); checkEffect(g,"victory"); assert.equal(g.winner,0);
});
test("trade and action tracking ignores repeats, reconnect history and unrelated recipients", () => {
  const played=[], tracker=A.tracker(s=>played.push(s));
  const room={code:"CTEST",you:1,game:{phase:"main",current:0,revision:1,players:[{id:0},{id:1},{id:2}],trade:null,effect:null}};
  tracker.update(room);
  room.game.revision=2; room.game.effect={id:2,sound:"ship"}; tracker.update(room); tracker.update(room);
  assert.deepEqual(played,["ship"]);
  room.game.trade={id:3,from:0,to:2,rejected:[]}; room.game.revision=3; tracker.update(room); assert.equal(A.incoming(room),false);
  room.game.trade={id:4,from:0,to:null,rejected:[]}; room.game.revision=4; tracker.update(room); tracker.update(room);
  assert.deepEqual(played,["ship","trade"]);
  room.game.trade.rejected=[1]; room.game.revision=5; tracker.update(room); assert.equal(A.incoming(room),false);
  room.game.trade={id:6,from:0,to:1,rejected:[]}; room.game.revision=6; tracker.update(room);
  tracker.reset(); tracker.update(room); assert.deepEqual(played,["ship","trade","trade"]);
  room.control={paused:true}; assert.equal(A.incoming(room),false);
  room.control.paused=false; room.you=0; assert.equal(A.incoming(room),false);
  tracker.update(room); assert.equal(played.length,3, "Changing local identity establishes a fresh baseline");
});
test("audio gracefully handles unavailable APIs and saves the mute preference", () => {
  const storage=new Map(); global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  try {
    const a=A.create(); assert.equal(a.play("ship"),false); a.unlock(); assert.equal(a.play("ship"),false);
    a.setMuted(true); assert.equal(A.create().muted,true); a.setMuted(false); assert.equal(A.create().muted,false);
    a.stop();
  } finally { delete global.localStorage; }
});
