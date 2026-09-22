"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const E = require("./catan-engine");
function seeded(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function game(n = 3, seed = 3) { return E.createGame(["Alice", "Bob", "Connie", "David"].slice(0, n), seeded(seed)); }
function setup(g) { while (g.phase.startsWith("setup")) E.act(g, g.current, E.chooseBotAction(g, g.current)); return g; }
function resources(g, allocations) { g.players.forEach((p, i) => { p.resources = allocations[i] || [0, 0, 0, 0, 0]; }); g.bank = E.RES.map((_, r) => 19 - g.players.reduce((n, p) => n + p.resources[r], 0)); }
function botTradeGame(hand, give, want) {
  const g = setup(game()); g.phase = "main";
  resources(g, [give, hand]);
  E.act(g, 0, { type: "offerTrade", give, want, to: 1 });
  return g;
}
function invariant(g) {
  for (let r = 0; r < 5; r++) { assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 19); assert.ok(g.bank[r] >= 0); g.players.forEach((p) => assert.ok(Number.isInteger(p.resources[r]) && p.resources[r] >= 0)); }
  assert.equal(g.deck.length + g.usedDevelopment.length + g.players.reduce((n, p) => n + p.development.length, 0), 25);
  g.players.forEach((p) => { assert.ok(g.board.vertices.filter((v) => v.owner === p.id && v.level === 1).length <= 5); assert.ok(g.board.vertices.filter((v) => v.owner === p.id && v.level === 2).length <= 4); assert.ok(g.board.edges.filter((e) => e.owner === p.id).length <= 15); });
}
test("base board has 19 hexes, 54 vertices, 72 edges and nine separate ports", () => {
  for (let i = 1; i <= 25; i++) {
    const b = game(3, i).board;
    assert.deepEqual([b.tiles.length, b.vertices.length, b.edges.length, b.ports.length], [19, 54, 72, 9]);
    assert.deepEqual([0, 1, 2, 3, 4, -1].map((r) => b.tiles.filter((t) => t.resource === r).length), [4, 3, 4, 4, 3, 1]);
    assert.equal(new Set(b.ports.flatMap((p) => p.vertices)).size, 18);
    assert.ok(!b.edges.some((e) => e.tiles.length === 2 && e.tiles.every((t) => [6, 8].includes(b.tiles[t].number))));
  }
});

test("piece caps explain blocked builds and a city upgrade returns a settlement piece", () => {
  for (const map of ["base","shores-1"]) {
    const g=E.createGame(["A","B","C"],seeded(8),map);
    g.phase="main";g.turn=1;g.current=0;g.players[0].resources=[10,10,10,10,10];
    for(const v of g.board.vertices){v.owner=-1;v.level=0;}
    for(const e of g.board.edges){e.owner=-1;}
    g.board.vertices.slice(0,5).forEach(v=>{v.owner=0;v.level=1;});
    assert.match(E.legal(g,0).buildBlocked.settlement,/5.*村庄/);
    let before=structuredClone(g);
    assert.throws(()=>E.act(g,0,{type:"settlement",vertex:10}),/All 5 settlements/);assert.deepEqual(g,before);
    E.act(g,0,{type:"city",vertex:0});
    assert.equal(E.legal(g,0).buildBlocked.settlement,undefined,"Upgrading releases a village piece");
    g.board.vertices.slice(1,4).forEach(v=>{v.owner=0;v.level=2;});
    g.board.edges.slice(0,15).forEach(e=>{e.owner=0;e.kind="road";});
    if(g.board.islands)g.board.edges.slice(15,30).forEach(e=>{e.owner=0;e.kind="ship";});
    const blocked=E.legal(g,0).buildBlocked;
    assert.match(blocked.city,/All 4 cities/);assert.match(blocked.road,/All 15 roads/);
    if(g.board.islands)assert.match(blocked.ship,/All 15 ships/);
    for(const type of ["road","city",...(g.board.islands?["ship"]:[])]) {
      before=structuredClone(g);assert.throws(()=>E.act(g,0,{type,vertex:4,edge:40}),/All (4|15)/);assert.deepEqual(g,before);
    }
    assert.deepEqual(E.publicGame(g,0).legal.buildBlocked,blocked);
  }
});
test("development purchase explains sold-out stock, missing costs, turn and phase without mutating rejected actions", () => {
  const g = game();
  g.phase = "main"; g.turn = 1; resources(g, [[0, 0, 1, 0, 0]]);
  const reason = E.legal(g, 0).buildBlocked.buyDevelopment;
  assert.match(reason, /Missing:.*Grain.*Ore/); assert.doesNotMatch(reason.split("Missing:")[1], /Wool/);
  const blocked = pattern => {
    const before = structuredClone(g);
    assert.match(E.publicGame(g, 0).legal.buildBlocked.buyDevelopment, pattern);
    assert.throws(() => E.act(g, 0, { type: "buyDevelopment" }), pattern);
    assert.deepEqual(g, before);
  };
  blocked(/Missing:/);
  const deck = g.deck; g.deck = []; blocked(/sold out/);
  g.deck = deck; g.phase = "roll"; blocked(/Roll the dice/);
  g.phase = "setupSettlement"; blocked(/initial placement/);
  g.phase = "plenty"; blocked(/current action/);
  g.phase = "main"; g.current = 1; blocked(/own turn/);
  g.current = 0; resources(g, [[0, 0, 1, 1, 1]]);
  assert.equal(E.legal(g, 0).buildBlocked.buyDevelopment, undefined);
  const count = g.deck.length; E.act(g, 0, { type: "buyDevelopment" });
  assert.equal(g.deck.length, count - 1); assert.equal(g.players[0].development.length, 1); invariant(g);
});

test("shortage notices describe missed and partial production without changing allocations or exposing another player's notices", () => {
  const g = game(), tile = g.board.tiles.find(t => t.resource >= 0), r = tile.resource;
  g.board.tiles.forEach(t => { t.number = t.id === tile.id ? 2 : 0; });
  const first = g.board.vertices[tile.vertices[0]], second = g.board.vertices[tile.vertices[2]];
  first.owner = 0; first.level = 2; second.owner = 1; second.level = 1;
  const held = [0, 0, 0, 0, 0]; held[r] = 18; resources(g, [[], [], held].map(a => a.length ? a : [0, 0, 0, 0, 0]));
  E.produce(g, 2);
  assert.equal(g.bank[r], 1); assert.equal(g.players[0].resources[r], 0);
  assert.deepEqual(E.publicGame(g, 0).supplyNotices, [{ id: 1, resource: r, wanted: 2, received: 0, reason: "shared" }]);
  assert.deepEqual(E.publicGame(g, 1).supplyNotices, [{ id: 2, resource: r, wanted: 1, received: 0, reason: "shared" }]);
  assert.deepEqual(E.publicGame(g, 2).supplyNotices, []);
  second.owner = -1; E.produce(g, 2);
  assert.equal(g.bank[r], 0); assert.equal(g.players[0].resources[r], 1);
  assert.deepEqual(E.publicGame(g, 0).supplyNotices.at(-1), { id: 3, resource: r, wanted: 2, received: 1, reason: "resource" });
  E.produce(g, 2); assert.equal(g.supplyNotices.at(-1).received, 0);
  g.board.robber = tile.id; const count = g.supplyNotices.length; E.produce(g, 2);
  assert.equal(g.supplyNotices.length, count, "Blocked production is not a bank shortage");
  g.board.robber = -1; for (let n = 0; n < 45; n++) E.produce(g, 2);
  assert.equal(g.supplyNotices.length, 40, "Notification history stays bounded"); invariant(g);
});

test("Year of Plenty explains limited supply and bank trades name the exhausted resource", () => {
  const g = setup(game()); g.phase = "main";
  resources(g, [[18, 19, 19, 19, 19]]);
  g.deck.splice(g.deck.indexOf("plenty"), 1); g.players[0].development.push({ type: "plenty", turn: 0 });
  E.act(g, 0, { type: "playDevelopment", card: "plenty" });
  assert.equal(g.phase, "plenty");
  assert.deepEqual(E.publicGame(g, 0).supplyNotices.at(-1), { id: 1, resource: -1, wanted: 2, received: 1, reason: "plenty" });
  E.act(g, 0, { type: "plenty", resources: [1, 0, 0, 0, 0] });
  const before = structuredClone(g);
  assert.throws(() => E.act(g, 0, { type: "bankTrade", give: 0, get: 1 }), /no brick left/);
  assert.deepEqual(g, before); invariant(g);
});

test("snake setup, second-settlement resources, distance rule and turn ownership", () => {
  const g = game(4), order = [];
  while (g.phase.startsWith("setup")) {
    const id = g.current, a = E.chooseBotAction(g, id);
    if (a.type === "settlement") {
      order.push(id);
      assert.throws(() => E.act(g, (id + 1) % 4, a));
      E.act(g, id, a);
      g.board.vertices[a.vertex].neighbors.forEach((v) => assert.ok(!E.settlementSites(g, id, true).includes(v)));
      if (g.setupStep >= 4) assert.equal(E.sum(g.players[id].resources), g.board.vertices[a.vertex].tiles.filter((t) => g.board.tiles[t].resource >= 0).length);
    } else E.act(g, id, a);
  }
  assert.deepEqual(order, [0, 1, 2, 3, 3, 2, 1, 0]); assert.equal(g.current, 0); assert.equal(g.phase, "roll"); invariant(g);
});
test("seven requires half-discard before robber movement, stealing conserves resources", () => {
  const g = setup(game()); resources(g, [[5, 3, 1, 0, 0], [0, 0, 0, 6, 2]]);
  const rolls = [.4, .6]; E.act(g, 0, { type: "roll" }, () => rolls.shift());
  assert.equal(g.phase, "discard"); assert.deepEqual(g.discard, { 0: 4, 1: 4 });
  assert.throws(() => E.act(g, 0, { type: "robber", tile: 0 }));
  assert.throws(() => E.act(g, 0, { type: "discard", resources: [3, 0, 0, 0, 0] }));
  E.act(g, 0, { type: "discard", resources: [3, 1, 0, 0, 0] }); E.act(g, 1, { type: "discard", resources: [0, 0, 0, 4, 0] });
  assert.equal(g.phase, "robber"); assert.throws(() => E.act(g, 0, { type: "robber", tile: g.board.robber }));
  const tile = g.board.tiles.find((t) => t.id !== g.board.robber && t.vertices.some((v) => g.board.vertices[v].owner === 1));
  const before = E.sum(g.players[0].resources);
  E.act(g, 0, { type: "robber", tile: tile.id });
  if (g.phase === "steal") E.act(g, 0, { type: "steal", victim: 1 });
  assert.equal(E.sum(g.players[0].resources), before + 1); assert.equal(g.phase, "main"); invariant(g);
});
test("stealing only targets adjacent opponents with resources, and happens once", () => {
  for (const resumePhase of ["roll", "main"]) {
    const g = setup(game(4)); g.phase = "robber"; g.resumePhase = resumePhase;
    resources(g, [[1, 0, 0, 0, 0], [0, 2, 0, 0, 0], [0, 0, 3, 0, 0]]);
    g.board.vertices.forEach((v) => { v.owner = -1; v.level = 0; });
    const tile = g.board.tiles.find((t) => t.id !== g.board.robber);
    for (const [corner, owner] of [[0, 1], [2, 2], [4, 3]]) {
      const v = g.board.vertices[tile.vertices[corner]]; v.owner = owner; v.level = owner === 2 ? 2 : 1;
    }
    E.act(g, 0, { type: "robber", tile: tile.id });
    assert.equal(g.phase, "steal"); assert.deepEqual(E.legal(g, 0).victims, [1, 2]);
    assert.deepEqual(E.legal(g, 1).victims, []);
    for (const victim of [0, 3]) assert.throws(() => E.act(g, 0, { type: "steal", victim }));
    assert.throws(() => E.act(g, 1, { type: "steal", victim: 2 }));
    const before = g.players.map((p) => E.sum(p.resources));
    E.act(g, 0, { type: "steal", victim: 2 }, () => 0);
    assert.deepEqual(g.players.map((p) => E.sum(p.resources)), [before[0] + 1, before[1], before[2] - 1, before[3]]);
    assert.equal(g.phase, resumePhase); assert.deepEqual(g.victims, []);
    assert.throws(() => E.act(g, 0, { type: "steal", victim: 1 })); invariant(g);
  }
});

test("production pays cities twice, robber blocks production, bank shortage is not partial for multiple recipients", () => {
  const g = game(), t = g.board.tiles.find((t) => t.resource >= 0), r = t.resource;
  g.board.vertices[t.vertices[0]].owner = 0; g.board.vertices[t.vertices[0]].level = 2;
  E.produce(g, t.number); assert.equal(g.players[0].resources[r], 2);
  g.board.robber = t.id; E.produce(g, t.number); assert.equal(g.players[0].resources[r], 2);
  g.board.robber = g.board.tiles.find((t) => t.resource < 0).id;
  g.board.vertices[t.vertices[2]].owner = 1; g.board.vertices[t.vertices[2]].level = 1;
  const a = [0, 0, 0, 0, 0]; a[r] = 18; resources(g, [a]);
  E.produce(g, t.number); assert.equal(g.players[1].resources[r], 0); assert.equal(g.bank[r], 1);
  g.board.vertices[t.vertices[2]].owner = -1; E.produce(g, t.number); assert.equal(g.players[0].resources[r], 19); invariant(g);
});
test("maritime trading honors port access and rejects unavailable or identical resources", () => {
  const g = setup(game()); g.phase = "main"; resources(g, [[10, 0, 0, 0, 0]]);
  g.board.ports.forEach((p) => { p.vertices.forEach((id) => { g.board.vertices[id].owner = -1; }); });
  assert.equal(E.tradeRate(g, 0, 0), 4);
  E.act(g, 0, { type: "bankTrade", give: 0, get: 1 }); assert.deepEqual(g.players[0].resources, [6, 1, 0, 0, 0]);
  const port = g.board.ports.find((p) => p.resource === 0); g.board.vertices[port.vertices[0]].owner = 0;
  assert.equal(E.tradeRate(g, 0, 0), 2); E.act(g, 0, { type: "bankTrade", give: 0, get: 4 });
  assert.equal(g.players[0].resources[0], 4); assert.throws(() => E.act(g, 0, { type: "bankTrade", give: 0, get: 0 })); invariant(g);
});
test("player trades require current player's offer, sufficient cards, and fresh offer ID", () => {
  const g = setup(game()); g.phase = "main"; resources(g, [[3, 0, 0, 0, 0], [0, 2, 0, 0, 0]]);
  E.act(g, 0, { type: "offerTrade", give: [2, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] });
  const id = g.trade.id;
  assert.throws(() => E.act(g, 2, { type: "acceptTrade", offerId: id }));
  E.act(g, 1, { type: "acceptTrade", offerId: id });
  assert.deepEqual(g.players[0].resources, [1, 1, 0, 0, 0]); assert.deepEqual(g.players[1].resources, [2, 1, 0, 0, 0]);
  assert.throws(() => E.act(g, 1, { type: "acceptTrade", offerId: id })); invariant(g);
});
test("targeted trades exclude other players, survive invalid requests, and stay private about cards", () => {
  const g = setup(game(4)); g.phase = "main"; resources(g, [[3, 0, 0, 0, 0], [0, 2, 0, 0, 0], [0, 2, 0, 0, 0], [0, 2, 0, 0, 0]]);
  const offer = { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0], to: 2 };
  E.act(g, 0, offer);
  const offerId = g.trade.id, before = structuredClone(g);
  for (const id of [0, 1, 3]) {
    assert.equal(E.canRespondToTrade(g, id), false);
    assert.throws(() => E.act(g, id, { type: "acceptTrade", offerId }));
    assert.throws(() => E.act(g, id, { type: "rejectTrade", offerId }));
    assert.deepEqual(g, before);
  }
  assert.equal(E.chooseBotAction(g, 1), null);
  assert.equal(E.chooseBotAction(g, 3), null);
  assert.equal(E.chooseBotAction(g, 2).type, "acceptTrade");
  const snapshot = E.publicGame(g, 1);
  assert.equal(snapshot.trade.to, 2);
  assert.equal(snapshot.players[2].resources, null);
  assert.equal(snapshot.players[2].development, null);
  E.act(g, 2, { type: "rejectTrade", offerId });
  assert.equal(E.canRespondToTrade(g, 2), false);
  assert.throws(() => E.act(g, 2, { type: "acceptTrade", offerId }));
  E.act(g, 0, offer);
  assert.throws(() => E.act(g, 2, { type: "acceptTrade", offerId }));
  E.act(g, 2, { type: "acceptTrade", offerId: g.trade.id });
  assert.deepEqual(g.players[2].resources, [1, 1, 0, 0, 0]);
  assert.equal(g.trade, null); invariant(g);
});

test("all-player offers accept one counterparty and validate targeted recipients", () => {
  const g = setup(game()); g.phase = "main"; resources(g, [[4, 0, 0, 0, 0], [0, 2, 0, 0, 0], [0, 2, 0, 0, 0]]);
  const offer = { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] };
  for (const to of [0, -1, 3, 1.5, "1", false, {}, []]) assert.throws(() => E.act(g, 0, { ...offer, to }));
  for (const to of [undefined, null]) {
    E.act(g, 0, { ...offer, to });
    assert.equal(g.trade.to, null);
    assert.equal(E.canRespondToTrade(g, 1), true);
    assert.equal(E.canRespondToTrade(g, 2), true);
    const offerId = g.trade.id;
    E.act(g, 1, { type: "acceptTrade", offerId });
    assert.throws(() => E.act(g, 2, { type: "acceptTrade", offerId }));
    invariant(g);
  }
});

test("bot trades surplus resources to complete its planned city", () => {
  const g = botTradeGame([3, 0, 0, 1, 3], [0, 0, 0, 1, 0], [2, 0, 0, 0, 0]);
  const before = structuredClone(g), action = E.chooseBotAction(g, 1);
  assert.equal(action.type, "acceptTrade");
  assert.deepEqual(g, before, "Evaluating an offer must not change the game");
  E.act(g, 1, action);
  assert.deepEqual(g.players[1].resources, [1, 0, 0, 2, 3]);
  E.act(g, 0, { type: "end" });
  E.act(g, 1, { type: "roll" }, () => 0);
  assert.equal(E.chooseBotAction(g, 1).type, "city"); invariant(g);
});

test("bot protects a city reserve even when offered more cards", () => {
  const g = botTradeGame([3, 0, 0, 1, 3], [0, 0, 3, 0, 0], [0, 0, 0, 0, 1]);
  const action = E.chooseBotAction(g, 1);
  assert.equal(action.type, "rejectTrade"); E.act(g, 1, action);
  assert.deepEqual(g.trade.rejected, [1]); invariant(g);
});

test("the same offer is accepted or rejected according to the bot's own build needs", () => {
  for (const [hand, expected] of [
    [[0, 0, 0, 2, 3], "rejectTrade"],
    [[0, 0, 0, 1, 4], "acceptTrade"]
  ]) {
    const g = botTradeGame(hand, [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]);
    assert.equal(E.chooseBotAction(g, 1).type, expected); invariant(g);
  }
});

test("bot avoids funding visible leaders and possible hidden victory points", () => {
  for (const [points, cards] of [[8, 0], [9, 0], [7, 3]]) {
    const g = botTradeGame([3, 0, 0, 1, 3], [0, 0, 0, 1, 0], [1, 0, 0, 0, 0]);
    assert.equal(E.chooseBotAction(g, 1).type, "acceptTrade");
    g.board.vertices.filter((v) => v.owner === 0).forEach((v) => { v.level = 2; });
    while (E.score(g, 0, false) < points) {
      const vertex = g.board.vertices[E.settlementSites(g, 0, true)[0]];
      assert.ok(vertex, "Fixture needs an unoccupied legal settlement site");
      vertex.owner = 0;
      vertex.level = Math.min(2, points - E.score(g, 0, false));
    }
    for (let n = 0; n < cards; n++) {
      g.deck.splice(g.deck.indexOf("knight"), 1);
      g.players[0].development.push({ type: "knight", turn: 0 });
    }
    assert.equal(E.score(g, 0, false), points);
    assert.equal(E.chooseBotAction(g, 1).type, "rejectTrade"); invariant(g);
  }
});

test("bot trade decisions do not read opponents' hidden resource or development types", () => {
  const actions = [];
  for (const card of ["knight", "vp"]) {
    const g = botTradeGame([0, 0, 0, 1, 4], [0, 0, 0, 1, 0], [0, 0, 0, 0, 1]);
    resources(g, card === "knight"
      ? [[1, 0, 0, 1, 0], g.players[1].resources, [0, 1, 0, 0, 0]]
      : [[0, 1, 0, 1, 0], g.players[1].resources, [1, 0, 0, 0, 0]]);
    g.deck.splice(g.deck.indexOf(card), 1);
    g.players[0].development.push({ type: card, turn: 0 });
    actions.push(E.chooseBotAction(g, 1).type); invariant(g);
  }
  assert.deepEqual(actions, ["acceptTrade", "acceptTrade"]);
});

test("bot rejects a trade worse than its available two-to-one port", () => {
  const g = botTradeGame([6, 0, 0, 1, 3], [0, 0, 0, 1, 0], [4, 0, 0, 0, 0]);
  const port = g.board.ports.find((p) => p.resource === 0);
  const vertex = g.board.vertices[port.vertices.find((id) => g.board.vertices[id].owner < 0)];
  assert.ok(vertex); vertex.owner = 1; vertex.level = 1;
  assert.equal(E.tradeRate(g, 1, 0), 2);
  assert.equal(E.chooseBotAction(g, 1).type, "rejectTrade");
  g.board.ports = [];
  assert.equal(E.tradeRate(g, 1, 0), 4);
  assert.equal(E.chooseBotAction(g, 1).type, "acceptTrade"); invariant(g);
});

test("development cards are hidden, age-limited, once per turn, with VP exception", () => {
  const g = setup(game()); g.phase = "main"; resources(g, [[0, 0, 3, 3, 3]]);
  const index = g.deck.indexOf("knight"); [g.deck[index], g.deck[g.deck.length - 1]] = [g.deck.at(-1), g.deck[index]];
  E.act(g, 0, { type: "buyDevelopment" });
  assert.throws(() => E.act(g, 0, { type: "playDevelopment", card: "knight" }));
  const opponent = E.publicGame(g, 1); assert.equal(opponent.players[0].resources, null); assert.equal(opponent.players[0].development, null); assert.equal(opponent.deck, undefined);
  g.turn++; g.phase = "roll"; E.act(g, 0, { type: "playDevelopment", card: "knight" });
  assert.equal(g.players[0].knights, 1); assert.equal(g.phase, "robber");
  E.act(g, 0, E.chooseBotAction(g, 0)); if (g.phase === "steal") E.act(g, 0, E.chooseBotAction(g, 0));
  assert.equal(g.phase, "roll"); assert.equal(E.legal(g, 0).development.length, 0); invariant(g);
});
test("all progress cards resolve, including duplicate Year of Plenty resources", () => {
  for (const card of ["roads", "plenty", "monopoly"]) {
    const g = setup(game()); g.phase = "main"; g.turn++;
    g.deck.splice(g.deck.indexOf(card), 1); g.players[0].development.push({ type: card, turn: 0 });
    E.act(g, 0, { type: "playDevelopment", card });
    if (card === "plenty") E.act(g, 0, { type: "plenty", resources: [0, 0, 0, 0, 2] });
    if (card === "monopoly") { resources(g, [[0, 0, 0, 0, 0], [3, 1, 0, 0, 0], [2, 0, 0, 0, 0]]); E.act(g, 0, { type: "monopoly", resource: 0 }); assert.equal(g.players[0].resources[0], 5); }
    if (card === "roads") { const before = [...g.players[0].resources]; while (g.phase === "freeRoads") E.act(g, 0, E.chooseBotAction(g, 0)); assert.deepEqual(g.players[0].resources, before); }
    assert.equal(g.phase, "main"); invariant(g);
  }
});
test("Year of Plenty can be cancelled before choosing resources without consuming a card or the turn allowance", () => {
  for (const phase of ["roll", "main"]) {
    const g = setup(game());
    if (phase === "main") E.act(g, 0, { type: "roll" }, () => 0);
    for (const [type, turn] of [["vp", 0], ["plenty", 0], ["plenty", g.turn], ["knight", 0]]) {
      g.deck.splice(g.deck.indexOf(type), 1); g.players[0].development.push({ type, turn });
    }
    const hand = structuredClone(g.players[0].development), bank = [...g.bank], before = g.players.map((p) => [...p.resources]);
    const used = [...g.usedDevelopment], rolled = g.rolled, dice = [...g.dice];
    for (let attempt = 0; attempt < 3; attempt++) {
      E.act(g, 0, { type: "playDevelopment", card: "plenty" });
      assert.equal(E.legal(g, 0).cancelDevelopment, true);
      assert.equal(E.legal(g, 1).cancelDevelopment, false);
      assert.equal(E.publicGame(g, 1).pendingDevelopment, undefined, "Cancellation metadata stays private");
      const waiting = structuredClone(g);
      assert.throws(() => E.act(g, 1, { type: "cancelDevelopment" }));
      assert.throws(() => E.act(g, 0, { type: "plenty", resources: [0, 0, 0, 0, 0] }));
      assert.deepEqual(g, waiting, "Rejected actions must not mutate a pending card");
      E.act(g, 0, { type: "cancelDevelopment" });
      assert.equal(g.phase, phase); assert.equal(g.rolled, rolled); assert.deepEqual(g.dice, dice);
      assert.deepEqual(g.players[0].development, hand, "Restore the card's position and original purchase turn");
      assert.deepEqual(g.usedDevelopment, used); assert.deepEqual(g.bank, bank);
      assert.deepEqual(g.players.map((p) => p.resources), before);
      assert.equal(g.developmentPlayed, false); assert.equal(g.pendingDevelopment, null);
      assert.ok(E.legal(g, 0).development.includes("knight"));
      assert.equal(E.legal(g, 0).roll, phase === "roll");
      assert.equal(E.legal(g, 0).end, phase === "main");
      assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); invariant(g);
    }
    E.act(g, 0, { type: "playDevelopment", card: "plenty" });
    E.act(g, 0, { type: "plenty", resources: [0, 0, 0, 0, 2] });
    assert.equal(g.pendingDevelopment, null); assert.equal(g.developmentPlayed, true);
    assert.equal(g.players[0].development.length, hand.length - 1);
    assert.equal(g.players[0].resources[4], before[0][4] + 2);
    const resolved = structuredClone(g);
    assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" }));
    assert.throws(() => E.act(g, 0, { type: "playDevelopment", card: "knight" }));
    assert.deepEqual(g, resolved, "Confirmed resources cannot be undone or duplicated"); invariant(g);
  }
});

test("Road Building can be cancelled only before its first road, preserving the original card and turn", () => {
  for (const phase of ["roll", "main"]) {
    const g = setup(game());
    if (phase === "main") E.act(g, 0, { type: "roll" }, () => 0);
    for (const [type, turn] of [["vp", 0], ["roads", 0], ["roads", g.turn], ["plenty", 0]]) {
      g.deck.splice(g.deck.indexOf(type), 1); g.players[0].development.push({ type, turn });
    }
    const before = structuredClone(g);
    for (let attempt = 0; attempt < 3; attempt++) {
      E.act(g, 0, { type: "playDevelopment", card: "roads" });
      assert.equal(E.legal(g, 0).cancelDevelopment, true); assert.equal(E.legal(g, 1).cancelDevelopment, false);
      assert.equal(E.publicGame(g, 1).pendingDevelopment, undefined);
      const pending = structuredClone(g);
      for (const [id, action] of [[1, { type: "cancelDevelopment" }], [0, { type: "road", edge: -1 }], [0, { type: "ship", edge: -1 }]]) {
        assert.throws(() => E.act(g, id, action)); assert.deepEqual(g, pending);
      }
      E.act(g, 0, { type: "cancelDevelopment" });
      for (const field of ["phase", "resumePhase", "freeRoads", "rolled", "dice", "board", "bank", "players", "usedDevelopment", "developmentPlayed"]) assert.deepEqual(g[field], before[field], field);
      assert.equal(g.pendingDevelopment, null); assert.ok(E.legal(g, 0).development.includes("plenty"));
      assert.equal(E.legal(g, 0).roll, phase === "roll"); assert.equal(E.legal(g, 0).end, phase === "main");
      assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); invariant(g);
    }
    E.act(g, 0, { type: "playDevelopment", card: "roads" });
    E.act(g, 0, { type: "road", edge: E.legal(g, 0).roads[0] });
    assert.equal(E.legal(g, 0).cancelDevelopment, false); assert.equal(g.pendingDevelopment, null);
    const placed = structuredClone(g);
    assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); assert.deepEqual(g, placed);
    while (g.phase === "freeRoads") E.act(g, 0, E.chooseBotAction(g, 0));
    assert.equal(g.phase, phase); assert.equal(g.developmentPlayed, true);
    assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); invariant(g);
  }
});

test("Knight and Monopoly cards cannot be refunded through development cancellation", () => {
  for (const card of ["knight", "monopoly"]) {
    const g = setup(game());
    g.deck.splice(g.deck.indexOf(card), 1); g.players[0].development.push({ type: card, turn: 0 });
    E.act(g, 0, { type: "playDevelopment", card });
    assert.equal(E.legal(g, 0).cancelDevelopment, false);
    const before = structuredClone(g);
    assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); assert.deepEqual(g, before); invariant(g);
  }
});

test("knights and all progress cards work before or after rolling without skipping the roll", () => {
  for (const phase of ["roll", "main"]) for (const card of ["knight", "roads", "plenty", "monopoly"]) {
    const g = setup(game());
    if (phase === "main") E.act(g, 0, { type: "roll" }, () => 0);
    for (let i = 0; i < 2; i++) {
      g.deck.splice(g.deck.indexOf(card), 1);
      g.players[0].development.push({ type: card, turn: 0 });
    }
    E.act(g, 0, { type: "playDevelopment", card });
    assert.equal(E.legal(g, 0).roll, false, "Resolve the card before rolling");
    assert.throws(() => E.act(g, 0, { type: "roll" }));
    let steps = 0;
    while (g.phase !== phase && steps++ < 4) E.act(g, 0, E.chooseBotAction(g, 0));
    assert.equal(g.phase, phase, `${card} should return to ${phase}`);
    assert.equal(g.players[0].development.length, 1);
    assert.deepEqual(E.legal(g, 0).development, [], "Only one development card per turn");
    assert.throws(() => E.act(g, 0, { type: "playDevelopment", card }));
    if (phase === "roll") {
      assert.equal(g.rolled, false);
      assert.equal(E.legal(g, 0).end, false);
      E.act(g, 0, { type: "roll" }, () => 0);
      assert.deepEqual(E.legal(g, 0).development, [], "Rolling does not reset the card limit");
    }
    assert.equal(g.rolled, true);
    assert.equal(E.legal(g, 0).roll, false);
    invariant(g);
  }
});

test("each purchased action card waits until its buyer's next own turn", () => {
  for (const card of ["knight", "roads", "plenty", "monopoly"]) {
    const g = setup(game());
    E.act(g, 0, { type: "roll" }, () => 0);
    resources(g, [[0, 0, 1, 1, 1]]);
    const index = g.deck.indexOf(card);
    [g.deck[index], g.deck[g.deck.length - 1]] = [g.deck.at(-1), g.deck[index]];
    E.act(g, 0, { type: "buyDevelopment" });
    assert.deepEqual(E.legal(g, 0).development, []);
    assert.throws(() => E.act(g, 0, { type: "playDevelopment", card }));
    E.act(g, 0, { type: "end" });
    for (let id = 1; id < g.players.length; id++) {
      assert.equal(g.current, id);
      assert.deepEqual(E.legal(g, 0).development, []);
      assert.throws(() => E.act(g, 0, { type: "playDevelopment", card }));
      E.act(g, id, { type: "roll" }, () => 0);
      E.act(g, id, { type: "end" });
    }
    assert.equal(g.current, 0);
    assert.equal(g.phase, "roll");
    assert.ok(E.legal(g, 0).development.includes(card));
    E.act(g, 0, { type: "playDevelopment", card });
    invariant(g);
  }
});

test("a newly purchased victory point can win even after playing another development card", () => {
  const g = setup(game()); g.phase = "main";
  g.board.vertices.filter((v) => v.owner === 0).forEach((v) => { v.level = 2; });
  for (let i = 0; i < 3; i++) {
    g.deck.splice(g.deck.indexOf("vp"), 1); g.players[0].development.push({ type: "vp", turn: 0 });
    g.deck.splice(g.deck.indexOf("knight"), 1); g.usedDevelopment.push("knight");
  }
  g.players[0].knights = 3; g.developmentPlayed = true; E.updateAwards(g);
  assert.equal(E.score(g, 0), 9);
  resources(g, [[0, 0, 1, 1, 1]]);
  const index = g.deck.indexOf("vp");
  [g.deck[index], g.deck[g.deck.length - 1]] = [g.deck.at(-1), g.deck[index]];
  E.act(g, 0, { type: "buyDevelopment" });
  assert.equal(E.score(g, 0), 10); assert.equal(g.winner, 0); assert.equal(g.phase, "over");
  assert.equal(g.players[0].development.at(-1).turn, g.turn);
  invariant(g);
});

test("longest road is a trail and enemy settlements split it", () => {
  const g = game();
  function findPath(v, vertices, edges) {
    if (edges.length === 6) return { vertices, edges };
    for (const eId of g.board.vertices[v].edges) { const e = g.board.edges[eId], next = e.a === v ? e.b : e.a; if (vertices.includes(next)) continue; const found = findPath(next, [...vertices, next], [...edges, eId]); if (found) return found; }
  }
  const path = findPath(0, [0], []); path.edges.forEach((id) => { g.board.edges[id].owner = 0; }); E.updateAwards(g);
  assert.equal(g.roadLengths[0], 6); assert.equal(g.longest, 0);
  g.board.vertices[path.vertices[3]].owner = 1; g.board.vertices[path.vertices[3]].level = 1; E.updateAwards(g);
  assert.equal(g.roadLengths[0], 3); assert.equal(g.longest, -1);
  const visible = E.publicGame(g, 0);
  assert.equal(visible.players[0].roads, 6);
  assert.equal(visible.roadLengths[0], 3, "Public summary distinguishes built pieces from longest trail");
  assert.equal(visible.players[0].islandPoints, 0);
});
test("longest routes count a single trail across branches, loops and disconnected components", () => {
  function fixture(pairs) {
    const g = game();
    g.board.vertices = []; g.board.edges = [];
    for (const [a, b, owner = 0, kind = "road"] of pairs) {
      const id = g.board.edges.length;
      g.board.edges.push({ id, a, b, owner, kind });
      for (const v of [a, b]) {
        g.board.vertices[v] ||= { id: v, owner: -1, level: 0, edges: [] };
        g.board.vertices[v].edges.push(id);
      }
    }
    return g;
  }
  for (const kind of ["road", "ship"]) {
    const branch = fixture([[0,1],[1,2],[0,3],[3,4],[0,5],[5,6]].map(([a,b]) => [a,b,0,kind]));
    E.updateAwards(branch);
    assert.equal(branch.roadLengths[0], 4, "Three branches of length two make a trail of four, not six");
    assert.equal(branch.longest, -1, "Showing a length below five does not award the bonus");
    const loop = fixture([[0,1],[1,2],[2,3],[3,4],[4,5],[5,0],[0,6],[6,7]].map(([a,b]) => [a,b,0,kind]));
    assert.equal(E.longestRoad(loop, 0), 8, "A closed loop and tail can revisit a vertex, but never an edge");
    loop.board.vertices[3].owner = 1;
    assert.equal(E.longestRoad(loop, 0), 6, "A rival building stops the route even on a loop");
  }
  const separate = fixture([[0,1],[1,2],[2,3],[3,4],[4,5],[6,7],[7,8],[8,9]]);
  E.updateAwards(separate);
  assert.equal(separate.roadLengths[0], 5, "Disconnected roads are not added together");
  assert.equal(separate.longest, 0);
  const tied = fixture([
    [0,1],[1,2],[2,3],[3,4],[4,5],
    [6,7,1],[7,8,1],[8,9,1],[9,10,1],[10,11,1],
  ]);
  E.updateAwards(tied); assert.equal(tied.longest, -1, "No holder when tied without an incumbent");
  tied.longest = 1; E.updateAwards(tied); assert.equal(tied.longest, 1, "Incumbent keeps a tie");
  tied.board.edges[9].owner = 0; E.updateAwards(tied);
  assert.equal(tied.longest, 0); assert.equal(tied.roadLengths[0], 5, "An isolated extra road does not extend the trail");
});

test("victory points only trigger a win on the owner's turn", () => {
  const g = setup(game()); g.phase = "main";
  g.board.vertices.filter((v) => v.owner === 1).forEach((v) => { v.level = 2; });
  for (let i = 0; i < 5; i++) { g.deck.splice(g.deck.indexOf("vp"), 1); g.players[1].development.push({ type: "vp", turn: 0 }); }
  g.players[1].knights = 3; E.updateAwards(g); assert.equal(E.score(g, 1), 11);
  assert.equal(g.winner, -1); E.act(g, 0, { type: "end" }); assert.equal(g.winner, 1); assert.equal(g.phase, "over");
});
test("twenty seeded full bot games finish legally and conserve all cards", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = seeded(seed), g = E.createGame(["A", "B", "C", "D"].slice(0, seed % 2 ? 3 : 4), rng);
    let steps = 0;
    while (g.phase !== "over" && steps++ < 5000) {
      const id = g.phase === "discard" ? Number(Object.keys(g.discard)[0]) : g.current;
      const a = E.chooseBotAction(g, id, rng); assert.ok(a, `No action: ${g.phase}`); E.act(g, id, a, rng); invariant(g);
    }
    assert.equal(g.phase, "over", `Seed ${seed} did not finish: ${g.players.map((p) => E.score(g, p.id))}`);
    assert.ok(E.score(g, g.winner) >= 10);
  }
});

test("Catan snapshots negotiate compression and still support uncompressed clients", { timeout: 15000 }, async (t) => {
  const http = require("node:http"), { once } = require("node:events"), { WebSocket: Socket } = require("ws");
  const server = http.createServer(), catan = require("./catan-server").attachCatan(server), sockets = [];
  server.on("upgrade", (request, socket, head) => catan.upgrade(request, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    for (const compressed of [true, false]) {
      const ws = new Socket(`ws://127.0.0.1:${server.address().port}/catan-ws`, { perMessageDeflate: compressed });
      sockets.push(ws); await once(ws, "open");
      assert.equal(ws.extensions.includes("permessage-deflate"), compressed);
      const request = async (data) => {
        const before = ws._socket.bytesRead, received = once(ws, "message");
        ws.send(JSON.stringify(data));
        const [raw] = await received;
        return { data: JSON.parse(raw), decoded: raw.length, wire: ws._socket.bytesRead - before };
      };
      assert.equal((await request({ type: "hello" })).data.type, "welcome");
      assert.equal((await request({ type: "create", name: "Alice", mapId: "shores-2" })).data.type, "state");
      await request({ type: "fillBots" });
      const snapshot = await request({ type: "start" });
      assert.equal(snapshot.data.game.phase, "setupSettlement");
      assert.equal(snapshot.data.game.players[1].resources, null, "Compression preserves private-hand filtering");
      assert.ok(snapshot.decoded > 10000, "Exercise a complete island board snapshot");
      if (compressed) assert.ok(snapshot.wire < snapshot.decoded / 2, "Large snapshots use less than half the wire bytes");
      else assert.ok(snapshot.wire >= snapshot.decoded, "Legacy clients still receive the complete JSON state");
      t.diagnostic(`${compressed ? "compressed" : "plain"} snapshot: ${snapshot.decoded} JSON bytes, ${snapshot.wire} wire bytes`);
      assert.equal((await request({ type: "chat", text: "hello" })).data.chat.at(-1).text, "hello");
    }
  } finally {
    for (const ws of sockets) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("live targeted trades reject bystanders and schedule only the selected bot", { timeout: 15000 }, async () => {
  const http = require("node:http"), { once } = require("node:events"), { WebSocket } = require("ws");
  const { attachCatan } = require("./catan-server");
  const server = http.createServer(), catan = attachCatan(server), sockets = [];
  server.on("upgrade", (request, socket, head) => catan.upgrade(request, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client() {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = [];
    sockets.push(ws); ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    const send = (data) => ws.send(JSON.stringify(data));
    const next = async (predicate) => {
      for (let i = 0; i < 500; i++) { const found = messages.find(predicate); if (found) return found; await new Promise((r) => setTimeout(r, 10)); }
      throw new Error("Missing trade socket message");
    };
    await once(ws, "open"); send({ type: "hello" }); await next((m) => m.type === "welcome");
    return { send, next };
  }
  try {
    const a = await client(), b = await client();
    a.send({ type: "create", name: "Alice", seats: 4 }); const initial = await a.next((m) => m.type === "state");
    b.send({ type: "join", name: "Bob", code: initial.code }); await b.next((m) => m.type === "state");
    a.send({ type: "fillBots" }); await a.next((m) => m.seats?.length === 4);
    const room = catan.rooms.get(initial.code);
    room.game = setup(E.createGame(room.seats.map((p) => p.name), seeded(9))); room.game.phase = "main";
    resources(room.game, [[4, 0, 0, 0, 0], [0, 3, 0, 0, 0], [0, 3, 0, 0, 0], [0, 3, 0, 0, 0]]);
    const offer = { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] };
    a.send({ type: "action", action: { ...offer, to: 1 } });
    const direct = await b.next((m) => m.game?.trade?.to === 1);
    assert.equal(direct.game.players[0].resources, null);
    b.send({ type: "action", action: { type: "acceptTrade", offerId: direct.game.trade.id } });
    await a.next((m) => m.game?.revision > direct.game.revision && !m.game.trade);
    a.send({ type: "action", action: { ...offer, to: 3 } });
    const botOffer = await b.next((m) => m.game?.trade?.to === 3);
    b.send({ type: "action", action: { type: "acceptTrade", offerId: botOffer.game.trade.id } });
    await b.next((m) => m.type === "error" && m.message.includes("addressed to another player"));
    const done = await a.next((m) => m.game?.revision > botOffer.game.revision && !m.game.trade);
    assert.deepEqual(room.game.players[2].resources, [0, 3, 0, 0, 0], "Unselected bot must not trade");
    assert.deepEqual(room.game.players[3].resources, [1, 2, 0, 0, 0], "Selected bot must respond even with earlier bots seated");
    assert.equal(done.game.players[3].resources, null);
    a.send({ type: "action", action: { ...offer, to: null } });
    const open = await b.next((m) => m.game?.revision > done.game.revision && m.game.trade?.to === null);
    b.send({ type: "action", action: { type: "acceptTrade", offerId: open.game.trade.id } });
    const traded = await a.next((m) => m.game?.revision > open.game.revision && !m.game.trade);
    room.game.deck.splice(room.game.deck.indexOf("plenty"), 1);
    room.game.players[0].development.push({ type: "plenty", turn: 0 });
    const beforePlenty = [...room.game.players[0].resources];
    a.send({ type: "action", action: { type: "playDevelopment", card: "plenty" } });
    const choosing = await a.next((m) => m.game?.revision > traded.game.revision && m.game.phase === "plenty");
    const observer = await b.next((m) => m.game?.phase === "plenty");
    assert.equal(choosing.game.legal.cancelDevelopment, true);
    assert.equal(observer.game.legal.cancelDevelopment, false);
    assert.equal(observer.game.players[0].development, null);
    b.send({ type: "action", action: { type: "cancelDevelopment" } });
    await b.next((m) => m.type === "error" && m.message.includes("Not your turn"));
    a.send({ type: "action", action: { type: "cancelDevelopment" } });
    const cancelled = await b.next((m) => m.game?.revision > choosing.game.revision && m.game.phase === "main");
    assert.equal(cancelled.game.players[0].developmentCount, 1);
    assert.equal(cancelled.game.players[0].development, null);
    assert.deepEqual(room.game.players[0].resources, beforePlenty);
    assert.equal(room.game.developmentPlayed, false);
    room.game.deck.splice(room.game.deck.indexOf("roads"), 1);
    room.game.players[0].development.push({ type: "roads", turn: 0 });
    a.send({ type: "action", action: { type: "playDevelopment", card: "roads" } });
    const building = await a.next((m) => m.game?.revision > cancelled.game.revision && m.game.phase === "freeRoads");
    const watching = await b.next((m) => m.game?.revision === building.game.revision);
    assert.equal(building.game.legal.cancelDevelopment, true); assert.equal(watching.game.legal.cancelDevelopment, false);
    assert.equal(watching.game.players[0].development, null);
    a.send({ type: "action", action: { type: "cancelDevelopment" } });
    const returned = await b.next((m) => m.game?.revision > building.game.revision && m.game.phase === "main");
    assert.equal(returned.game.players[0].developmentCount, 2); assert.equal(room.game.developmentPlayed, false);
    a.send({ type: "action", action: { type: "playDevelopment", card: "roads" } });
    const replayed = await a.next((m) => m.game?.revision > returned.game.revision && m.game.phase === "freeRoads");
    a.send({ type: "action", action: { type: "road", edge: replayed.game.legal.roads[0] } });
    const committed = await a.next((m) => m.game?.revision > replayed.game.revision);
    assert.equal(committed.game.legal.cancelDevelopment, false);
    const placed = structuredClone(room.game);
    a.send({ type: "action", action: { type: "cancelDevelopment" } });
    await a.next((m) => m.type === "error" && m.message.includes("can no longer be cancelled"));
    assert.deepEqual(room.game, placed, "An outdated cancel button cannot undo a placed road over the network");
    invariant(room.game);
  } finally {
    for (const ws of sockets) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("lobby seat selection separates host ownership from turn order and requires consent for human swaps", { timeout: 15000 }, async () => {
  const http = require("node:http"), { once } = require("node:events"), { WebSocket: Socket } = require("ws");
  const server = http.createServer(), catan = require("./catan-server").attachCatan(server), sockets = [];
  server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new Socket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = []; sockets.push(ws);
    ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    const send = (data) => ws.send(JSON.stringify(data));
    async function next(predicate, after = 0) {
      for (let i = 0; i < 500; i++) { const result = messages.slice(after).find(predicate); if (result) return result; await new Promise((r) => setTimeout(r, 5)); }
      throw new Error("Missing seat-selection response");
    }
    await once(ws, "open"); send({ type: "hello", token });
    const welcome = await next((m) => m.type === "welcome");
    return { ws, messages, send, next, token: welcome.token, async request(data, type = "state") { const cursor = messages.length; send(data); return next((m) => m.type === type, cursor); } };
  }
  try {
    let a = await client(), b = await client(); const c = await client();
    const first = await a.request({ type: "create", name: "Host", seats: 4, avatar: { kind: "emoji", value: "\u{1f600}" } });
    const room = catan.rooms.get(first.code), hostToken = a.token;
    assert.equal(first.seatSelection, true);
    await a.request({ type: "cancelSeatSwap" }, "error");
    for (const position of [-1, 4, 1.5, "1", null]) await a.request({ type: "chooseSeat", position }, "error");
    const moved = await a.request({ type: "chooseSeat", position: 3 });
    assert.equal(moved.seats[moved.you].position, 3); assert.equal(moved.you, moved.host);
    await b.request({ type: "join", code: first.code, name: "Bob" });
    assert.equal(room.seats[1].position, 0, "Joining uses the first open position, not the array length");
    await b.request({ type: "chooseSeat", position: 1 });
    await c.request({ type: "join", code: first.code, name: "Charlie" });
    await a.request({ type: "start" }, "error");
    await a.request({ type: "addBot" });
    const botToken = room.seats[3].token, botAvatar = room.seats[3].avatar;
    assert.equal(room.seats[3].position, 2);
    await a.request({ type: "chat", text: "Host said this before swapping" });
    await b.request({ type: "chat", text: "Bob said this before swapping" });
    let pending = await a.request({ type: "chooseSeat", position: 1 });
    assert.equal(pending.seatSwap.from, 0); assert.equal(pending.seatSwap.to, 1);
    assert.ok(!JSON.stringify(pending).includes(hostToken), "Swap snapshots never expose session tokens");
    await c.request({ type: "respondSeatSwap", id: pending.seatSwap.id, accept: true }, "error");
    await a.request({ type: "start" }, "error");
    await c.request({ type: "chooseSeat", position: 2 }, "error");
    await b.request({ type: "respondSeatSwap", id: pending.seatSwap.id, accept: false });
    assert.equal(room.seats[0].position, 3); assert.equal(room.seats[1].position, 1);
    pending = await a.request({ type: "chooseSeat", position: 1 });
    await a.request({ type: "cancelSeatSwap", id: pending.seatSwap.id });
    await b.request({ type: "respondSeatSwap", id: pending.seatSwap.id, accept: true }, "error");
    const accepted = await a.request({ type: "chooseSeat", position: 1 });
    await b.request({ type: "respondSeatSwap", id: accepted.seatSwap.id, accept: true });
    assert.deepEqual(room.seats.map((p) => p.position), [1, 3, 0, 2]);
    assert.equal(room.host, hostToken);
    await b.request({ type: "chooseSeat", position: 2 });
    assert.equal(room.seats[1].position, 2); assert.equal(room.seats[3].position, 3);
    await a.request({ type: "chooseSeat", position: 3 });
    assert.equal(room.seats[3].position, 1); assert.deepEqual(room.seats[3].avatar, botAvatar);
    pending = await a.request({ type: "chooseSeat", position: 2 });
    b.ws.close(); await once(b.ws, "close");
    await a.next((m) => m.type === "state" && !m.seatSwap && !m.seats[1].connected, a.messages.length - 1);
    b = await client(b.token); await b.next((m) => m.type === "state");
    await b.request({ type: "respondSeatSwap", id: pending.seatSwap.id, accept: true }, "error");
    a = await client(hostToken);
    const resumed = await a.next((m) => m.type === "state");
    assert.equal(resumed.seats[resumed.you].position, 3); assert.equal(resumed.host, resumed.you);
    const started = await a.request({ type: "start" });
    assert.equal(started.you, 3); assert.equal(started.host, 3); assert.equal(started.game.current, 0);
    assert.deepEqual(started.seats.map((p) => p.position), [0, 1, 2, 3]);
    assert.deepEqual(started.game.players.map((p) => p.name), ["Charlie", room.seats[1].name, "Bob", "Host"]);
    assert.equal(room.seats[1].token, botToken);
    assert.equal(started.seats[3].avatar.value, "\u{1f600}");
    assert.equal(started.chat[0].playerId, 3); assert.equal(started.chat[1].playerId, 2);
    assert.equal(started.game.players[0].resources, null); assert.ok(Array.isArray(started.game.players[3].resources));
    await a.request({ type: "action", action: { type: "settlement", vertex: 0 } }, "error");
    await a.request({ type: "chooseSeat", position: 0 }, "error");
    await a.request({ type: "profile", avatar: null }); assert.equal(room.seats[3].avatar, null);
    const cStart = await c.next((m) => m.game?.phase === "setupSettlement");
    await c.request({ type: "action", action: { type: "settlement", vertex: cStart.game.legal.settlements[0] } });
    assert.equal(room.game.board.vertices.filter((v) => v.owner === 0).length, 1);
    room.game.phase = "over"; room.game.winner = 0;
    await b.request({ type: "rematch" }, "error");
    const rematch = await a.request({ type: "rematch" }); assert.equal(rematch.host, 3); assert.equal(rematch.game.current, 0);

    const small = await a.request({ type: "create", name: "Host", seats: 3 });
    await a.request({ type: "chooseSeat", position: 2 });
    await a.request({ type: "chooseSeat", position: 3 }, "error");
    await b.request({ type: "join", code: small.code, name: "Bob" });
    await b.request({ type: "chat", text: "Old Bob" });
    await b.request({ type: "leave" }, "left");
    const before = catan.rooms.get(small.code);
    assert.equal(before.seats[0].position, 2); assert.equal(before.chat[0].playerId, -1);
    await c.request({ type: "join", code: small.code, name: "Charlie" });
    await a.request({ type: "fillBots" });
    const three = await a.request({ type: "start" });
    assert.equal(three.host, 2); assert.equal(three.you, 2); assert.equal(three.seats.length, 3);
    assert.equal(three.game.players[0].name, "Charlie");
  } finally { for (const ws of sockets) ws.terminate(); await new Promise((resolve) => server.close(resolve)); }
});

test("WebSocket rooms isolate secrets, synchronize humans, reconnect hosts, and run bots", { timeout: 20000 }, async () => {
  const port = 18200 + Math.floor(Math.random() * 500), server = spawn(process.execPath, [require.resolve("./server")], { env: { ...process.env, PORT: String(port), CATAN_BOT_DELAY: "5" }, stdio: ["ignore", "pipe", "pipe"] });
  const sockets = [];
  function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/catan-ws`), messages = []; sockets.push(ws);
    ws.addEventListener("message", (e) => messages.push(JSON.parse(e.data)));
    return { ws, messages, send: (data) => ws.send(JSON.stringify(data)), async open() { if (ws.readyState !== WebSocket.OPEN) await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Socket open timeout")), 3000); ws.onopen = () => { clearTimeout(timer); resolve(); }; ws.onerror = reject; }); ws.send(JSON.stringify({ type: "hello", token })); return this.next((d) => d.type === "welcome"); }, async next(predicate, after = 0) { for (let i = 0; i < 300; i++) { const m = messages.slice(after).find(predicate); if (m) return m; await new Promise((r) => setTimeout(r, 10)); } throw new Error("Missing socket message"); } };
  }
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error("Server timeout")), 5000); server.stdout.on("data", () => { clearTimeout(timer); resolve(); }); server.stderr.on("data", (x) => reject(new Error(x.toString()))); });
    const home = await (await fetch(`http://127.0.0.1:${port}/index.html`)).text(); assert.ok(home.includes("catan.html"));
    const page = await (await fetch(`http://127.0.0.1:${port}/catan.html`)).text(); assert.ok(page.includes('id="board"'));
    const a = client(), b = client(); const wa = await a.open(); await b.open();
    a.send({ type: "create", name: "Alice", seats: 3 }); const initial = await a.next((m) => m.type === "state");
    b.send({ type: "join", code: initial.code, name: "Alice" }); await b.next((m) => m.type === "state");
    b.send({ type: "start" }); await b.next((m) => m.type === "error");
    a.send({ type: "fillBots" }); await a.next((m) => m.seats?.length === 3);
    a.send({ type: "start" }); const started = await a.next((m) => m.game?.phase === "setupSettlement");
    assert.equal(started.you, 0); assert.equal(started.game.players[1].resources, null);
    assert.ok(!JSON.stringify(started).includes(wa.token));
    const chatText = "Who has lumber?";
    b.send({ type: "chat", text: chatText, name: "Spoofed", playerId: 0, id: "client-supplied" });
    const firstChat = await a.next((m) => m.chat?.length === 1);
    const receivedChat = await b.next((m) => m.chat?.length === 1);
    assert.equal(firstChat.chat[0].name, "Alice");
    assert.equal(firstChat.chat[0].playerId, 1, "Chat identity comes from the authenticated seat, not the supplied name or ID");
    assert.notEqual(firstChat.chat[0].id, "client-supplied");
    assert.deepEqual(firstChat.chat, receivedChat.chat, "Everyone receives the same identified chat message");
    b.send({ type: "chat", text: chatText });
    const repeatedChat = await a.next((m) => m.chat?.length === 2);
    assert.notEqual(repeatedChat.chat[0].id, repeatedChat.chat[1].id, "Identical messages still have distinct IDs");
    a.send({ type: "chat", text: "  I have some!  " });
    const hostChat = await b.next((m) => m.chat?.length === 3);
    assert.equal(hostChat.chat[2].playerId, 0, "Same-name players remain distinguishable");
    assert.equal(hostChat.chat[2].text, "I have some!");
    a.send({ type: "action", action: { type: "settlement", vertex: started.game.legal.settlements[0] } });
    const updated = await b.next((m) => m.game?.phase === "setupRoad"); assert.equal(updated.game.board.vertices.filter((v) => v.owner === 0).length, 1);
    const reconnected = client(wa.token); await reconnected.open(); const resumed = await reconnected.next((m) => m.game?.phase === "setupRoad");
    assert.equal(resumed.you, 0); assert.equal(resumed.host, 0);
    assert.deepEqual(resumed.chat, hostChat.chat, "Reconnecting preserves chat IDs rather than recreating messages");
    reconnected.send({ type: "auto", enabled: true }); b.send({ type: "auto", enabled: true });
    const progressed = await reconnected.next((m) => m.game?.turn >= 3); assert.ok(progressed.game.players.every((p) => p.settlements >= 2));
  } finally { sockets.forEach((ws) => ws.close()); server.kill(); await new Promise((r) => { if (server.exitCode !== null) r(); else server.once("exit", r); }); }
});
