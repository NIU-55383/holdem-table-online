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
test("confirmed trade offers give the sender a distinct once-only cue, never on failure or reconnect", () => {
  const g=ready();g.phase="main";g.rolled=true;g.players[1].resources=[3,3,3,3,3];
  const heard=[[],[],[]], trackers=heard.map(sounds=>A.tracker(sound=>sounds.push(sound)));
  const update=()=>trackers.forEach((tracker,you)=>tracker.update({code:"OFFERS",you,game:E.publicGame(g,you)}));
  update();
  const offer={type:"offerTrade",give:[1,0,0,0,0],want:[0,1,0,0,0],to:1};
  E.act(g,0,offer);update();update();
  assert.deepEqual(heard,[["offer"],["trade"],[]],"Sender and recipient hear different cues; unrelated players hear neither");
  assert.throws(()=>E.act(g,0,{...offer,give:[999,0,0,0,0]}));update();
  assert.deepEqual(heard,[["offer"],["trade"],[]],"A rejected action does not sound like a sent offer");
  E.act(g,1,{type:"rejectTrade",offerId:g.trade.id});update();
  assert.deepEqual(heard,[["offer"],["trade"],[]],"Responses do not replay the send cue");
  E.act(g,0,{...offer,to:null});update();
  assert.deepEqual(heard,[["offer","offer"],["trade","trade"],["trade"]],"A new public offer notifies sender and all recipients once");
  trackers.forEach(tracker=>tracker.reset());update();
  assert.deepEqual(heard,[["offer","offer"],["trade","trade"],["trade"]],"Reconnect establishes a silent baseline");
  E.act(g,1,{type:"acceptTrade",offerId:g.trade.id});update();update();
  assert.deepEqual(heard,[["offer","offer","exchange"],["trade","trade","exchange"],["trade","exchange"]],"Only acceptance plays the success sound");
});

test("audio gracefully handles unavailable APIs and saves the mute preference", () => {
  const storage=new Map(); global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  try {
    const a=A.create(); assert.equal(a.play("ship"),false); a.unlock(); assert.equal(a.play("ship"),false);
    a.setMuted(true); assert.equal(A.create().muted,true); a.setMuted(false); assert.equal(A.create().muted,false);
    a.stop();
  } finally { delete global.localStorage; }
});

test("effect volume is bounded, remembered and independent of mute and music", () => {
  const storage=new Map([["catan-music-volume","0.2"]]);
  global.localStorage={getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)};
  try {
    const a=A.create(); assert.equal(a.volume,.6);
    a.setVolume(.35); assert.equal(A.create().volume,.35);
    a.setMuted(true); assert.equal(a.volume,.35); a.setMuted(false); assert.equal(a.volume,.35);
    a.setVolume(0); assert.equal(a.play("ship"),false); assert.equal(a.muted,false);
    a.setVolume(2); assert.equal(a.volume,1); a.setVolume(-1); assert.equal(a.volume,0);
    a.setVolume(.7); a.setVolume(NaN); a.setVolume(Infinity); assert.equal(a.volume,.7);
    for (const invalid of ["bad","NaN","Infinity",""]) { storage.set("catan-sfx-volume",invalid); assert.equal(A.create().volume,.6); }
    assert.equal(storage.get("catan-music-volume"),"0.2");
  } finally { delete global.localStorage; }
});

test("gold chime is local, once per choice, silent on reconnect, pause and manual auto", () => {
  const sounds=[], t=A.tracker(s=>sounds.push(s));
  const room={code:"GOLD",you:1,control:{},game:{phase:"main",current:0,turn:3,revision:1,legal:{gold:0},goldQueue:[]}};
  t.update(room);
  Object.assign(room.game,{phase:"gold",revision:2,legal:{gold:2},goldQueue:[{id:1,count:2},{id:0,count:1}]});
  assert.equal(A.goldChoice(room),true,"The recipient need not be the current dice roller");
  t.update(room);t.update(room);assert.deepEqual(sounds,["gold"]);
  t.reset();t.update(room);assert.deepEqual(sounds,["gold"]);
  room.control.paused=true;assert.equal(A.goldChoice(room),false);t.update(room);
  room.control.paused=false;t.update(room);assert.deepEqual(sounds,["gold"]);
  room.control.auto=true;assert.equal(A.goldChoice(room),false);
  room.game.turn++;t.update(room);assert.deepEqual(sounds,["gold"]);
  room.control.auto=false;t.update(room);assert.deepEqual(sounds,["gold"]);
  room.game.legal.gold=0;assert.equal(A.goldChoice(room),false);t.update(room);
  room.game.goldQueue.shift();t.update(room);assert.deepEqual(sounds,["gold"]);
  room.game.goldQueue=[{id:1,count:1}];room.game.legal.gold=1;room.game.revision++;t.update(room);
  assert.deepEqual(sounds,["gold","gold"]);
});
