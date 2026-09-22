"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./catan-engine"), S = require("./catan-scenarios"), Maps = require("./catan-maps");
const names = ["Alice", "Bob", "Carol", "David"];
const kinds = ["tribes", "cloth", "pirates", "wonders", "new-world"];
const seeded = (s) => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
function game(kind, n = 3, seed = 1, layout = "default", options = {}) { return E.createGame(names.slice(0, n), seeded(seed), kind, layout, null, options); }
function setup(g, rng = seeded(7)) {
  for (let n = 0; g.turn === 0 && n < 100; n++) { const id = E.requiredActors(g)[0]; E.act(g, id, E.chooseBotAction(g, id, rng), rng); }
  assert.equal(g.turn, 1); return g;
}
function hand(g, id, cards) {
  g.players[id].resources.forEach((n, r) => { g.bank[r] += n; });
  g.players[id].resources = [...cards]; cards.forEach((n, r) => { g.bank[r] -= n; });
}
function main(g, id = 0) { g.turn = 1; g.phase = "main"; g.current = id; g.board.pirate = -1; return g; }
function unchanged(g, id, action, pattern) { const before = structuredClone(g); assert.throws(() => E.act(g, id, action, seeded(1)), pattern); assert.deepEqual(g, before); }
function emptyBoard(g) { for (const v of g.board.vertices) { v.owner = -1; v.level = 0; } for (const e of g.board.edges) { e.owner = -1; delete e.kind; delete e.warship; } }
function invariant(g) {
  for (let r = 0; r < 5; r++) { assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 19); assert.ok(g.bank[r] >= 0); }
  for (const p of g.players) {
    assert.ok(p.resources.every((n) => Number.isInteger(n) && n >= 0));
    const view = E.publicGame(g, p.id).players[p.id];
    assert.ok(view.settlements <= 5 && view.cities <= 4 && view.roads <= 15 && view.ships <= 15);
    assert.ok(view.ships + view.reservedShips <= 15);
    assert.equal(view.availableShips, 15 - view.ships - view.reservedShips);
  }
  const deckSize = S.is(g, "pirates") && g.players.length === 3 ? 20 : 25;
  assert.equal(g.deck.length + g.usedDevelopment.length + g.players.reduce((n, p) => n + p.development.length, 0) + Object.keys(g.giftDevelopment || {}).length, deckSize);
  if (S.is(g, "cloth")) assert.equal(g.scenario.clothBank + g.scenario.villages.reduce((n, v) => n + v.cloth, 0) + g.players.reduce((n, p) => n + p.cloth, 0), 50);
}
function giftApproach(g, gift, id = 0) {
  const e = g.board.edges[gift.edge], adjacent = g.board.vertices[e.a].edges.find((i) => i !== e.id);
  Object.assign(g.board.edges[adjacent], { owner: id, kind: "ship", builtTurn: 0 });
  hand(g, id, [2, 0, 2, 0, 0]);
  assert.ok(E.legal(g, id).ships.includes(e.id));
  E.act(g, id, { type: "ship", edge: e.id });
}
function coastalVertex(g) { return g.board.vertices.find((v) => v.tiles.some((i) => g.board.tiles[i].setupAllowed) && v.tiles.some((i) => g.board.tiles[i].resource === -2)); }
function seaPath(g, target, predicate) {
  const queue = [[target, []]], seen = new Set([target]);
  for (let i = 0; i < queue.length; i++) {
    const [v, path] = queue[i]; if (path.length && predicate(g.board.vertices[v])) return { start: v, path: [...path].reverse() };
    for (const eid of g.board.vertices[v].edges) {
      const e = g.board.edges[eid], next = e.a === v ? e.b : e.a;
      if (seen.has(next) || !e.tiles.some((i) => g.board.tiles[i].resource === -2)) continue;
      seen.add(next); queue.push([next, [...path, eid]]);
    }
  }
  throw new Error("No sea path");
}
function fleetToFortress(g, id = 0) {
  g.current = id; g.phase = "main"; g.turn = 1;
  const seat = g.scenario.pirateSeats[id];
  for (let i = 0; !E.legal(g, id).scenario.attackFortress && i < 15; i++) {
    const candidates = E.shipSites(g, id); assert.ok(candidates.length, `fleet blocked for ${id}`);
    Object.assign(g.board.edges[candidates[0]], { owner: id, kind: "ship", builtTurn: 0 });
  }
  assert.ok(E.legal(g, id).scenario.attackFortress, String(seat.fortress));
  return S.orderedShips(g, id);
}
function raidFixture(power = 1, actor = 1) {
  const g = game("pirates"), path = g.scenario.piratePath;
  emptyBoard(g); main(g); g.phase = "roll";
  const tile = path[power], vertex = g.board.tiles[tile].vertices[0];
  Object.assign(g.board.vertices[vertex], { owner: actor, level: 1 });
  g.board.pirate = path[0];
  return g;
}

test("all five scenarios initialize both player counts and layouts with public-safe geometry", () => {
  for (const kind of kinds) for (const n of [3, 4]) for (const layout of ["default", "random"]) {
    const g = game(kind, n, 6, layout), view = E.publicGame(g, 0);
    assert.equal(view.scenario.kind, kind); assert.equal(view.target, Maps.get(kind).target);
    if (kind === "new-world") {
      assert.equal(view.scenario.pending.kind, "placeHarbor");
      while (g.scenario.harborDraft) { const actor = E.requiredActors(g)[0]; E.act(g, actor, E.chooseBotAction(g, actor)); }
    } else assert.equal(view.scenario.pending, null);
    assert.deepEqual(E.requiredActors(g), [0]);
    const starts = E.legal(g, 0).settlements;
    assert.ok(starts.length); assert.ok(starts.every((i) => g.board.vertices[i].tiles.some((t) => g.board.tiles[t].setupAllowed)));
    assert.ok(!Object.hasOwn(view, "giftDevelopment"));
    setup(g); invariant(g);
    for (const p of g.players) assert.equal(g.board.vertices.filter((v) => v.owner === p.id).length, ["cloth", "pirates"].includes(kind) ? 3 : 2);
  }
});

test("cloth setup is forward-reverse-forward and resources come only from the third settlement", () => {
  const g = game("cloth", 4), order = [];
  while (g.turn === 0) {
    const id = E.requiredActors(g)[0];
    if (g.phase === "setupSettlement") {
      order.push(id);
      if (g.setupStep < 8) assert.equal(g.players.reduce((n, p) => n + E.sum(p.resources), 0), 0);
    }
    E.act(g, id, E.chooseBotAction(g, id, seeded(2)), seeded(2));
  }
  assert.deepEqual(order, [0,1,2,3,3,2,1,0,0,1,2,3]);
  assert.ok(g.players.every((p) => E.sum(p.resources) > 0 && E.sum(p.resources) <= 3));
});

test("tribe gifts are one-use, development identity stays private and the received card must age", () => {
  for (const kind of ["vp", "development"]) {
    const g = main(game("tribes")), gift = g.scenario.gifts.find((x) => x.kind === kind);
    const privateType = g.giftDevelopment[gift.id]; giftApproach(g, gift);
    assert.equal(gift.claimedBy, 0);
    if (kind === "vp") assert.equal(g.players[0].scenarioPoints, 1);
    else {
      assert.deepEqual(g.players[0].development, [{ type: privateType, turn: 1 }]);
      assert.deepEqual(E.legal(g, 0).development, []);
      assert.equal(E.publicGame(g, 1).players[0].development, null);
      assert.ok(!Object.hasOwn(gift, "card")); assert.ok(!Object.hasOwn(gift, "development"));
      assert.ok(!Object.hasOwn(g.giftDevelopment, gift.id));
      if (privateType !== "vp") { g.turn++; assert.ok(E.legal(g, 0).development.includes(privateType)); }
    }
    g.board.edges[gift.edge].owner = -1;
    const points = g.players[0].scenarioPoints, count = g.players[0].development.length;
    giftApproach(g, gift); assert.equal(g.players[0].scenarioPoints, points); assert.equal(g.players[0].development.length, count); invariant(g);
  }
});

test("tribe harbors require immediate legal placement or remain stored until a coast becomes available", () => {
  const g = main(game("tribes")), gift = g.scenario.gifts.find((x) => x.kind === "harbor");
  giftApproach(g, gift); assert.equal(g.phase, "main"); assert.equal(g.players[0].harbors.length, 1);
  const v = coastalVertex(g); Object.assign(v, { owner: 0, level: 1 }); hand(g, 0, [0,0,0,2,3]);
  E.act(g, 0, { type: "city", vertex: v.id });
  assert.equal(g.phase, "scenarioChoice"); assert.equal(g.scenario.pending.kind, "placeHarbor"); assert.deepEqual(E.requiredActors(g), [0]);
  assert.deepEqual(E.legal(g, 1).scenario.placeHarbors, []);
  unchanged(g, 1, { type: "placeHarbor", harbor: gift.id, edge: 0 }, /harbor/);
  unchanged(g, 0, { type: "placeHarbor", harbor: gift.id, edge: -1 }, /harbor/);
  const edge = E.legal(g, 0).scenario.placeHarbors[0].edges[0];
  E.act(g, 0, { type: "placeHarbor", harbor: gift.id, edge });
  assert.equal(g.phase, "main"); assert.equal(g.players[0].harbors.length, 0);
  assert.equal(E.tradeRate(g, 0, gift.resource), gift.resource < 0 ? 3 : 2);
  g.players[0].harbors.push({ id: "another", resource: -1 });
  const edges = E.legal(g, 0).scenario.placeHarbors.flatMap((x) => x.edges), port = g.board.ports[0];
  assert.ok(edges.every((i) => ![g.board.edges[i].a, g.board.edges[i].b].some((v) => port.vertices.includes(v))));
});

test("tribe islands cannot be settled or produce, and the robber cannot return after leaving", () => {
  const g = main(game("tribes")), foreign = g.board.tiles.find((t) => t.resource >= -1 && !t.setupAllowed);
  assert.ok(E.settlementSites(g, 0).every((v) => !g.board.vertices[v].tiles.includes(foreign.id)));
  Object.assign(g.board.vertices[foreign.vertices[0]], { owner: 0, level: 2 });
  foreign.resource = 0; foreign.number = 6; E.produce(g, 6); assert.equal(g.players[0].resources[0], 0);
  g.phase = "robber"; const mainTile = E.legal(g, 0).robber.find((i) => g.board.tiles[i].setupAllowed);
  E.act(g, 0, { type: "robber", tile: mainTile }); g.phase = "robber";
  assert.ok(E.legal(g, 0).robber.every((i) => g.board.tiles[i].setupAllowed));
  unchanged(g, 0, { type: "robber", tile: foreign.id }, /legal tile/);
});

test("cloth connections give one immediate cloth, close their sea route and permit pirate movement", () => {
  const g = main(game("cloth")), village = g.scenario.villages[0];
  assert.equal(g.scenario.clothBank, 10);
  g.phase = "robber"; assert.deepEqual(E.legal(g, 0).pirate, []); g.phase = "main";
  const { start, path } = seaPath(g, village.vertex, (v) => v.tiles.some((i) => g.board.tiles[i].setupAllowed));
  Object.assign(g.board.vertices[start], { owner: 0, level: 1 });
  path.slice(0, -1).forEach((i) => Object.assign(g.board.edges[i], { owner: 0, kind: "ship", builtTurn: 0 }));
  hand(g, 0, [1,0,1,0,0]); E.act(g, 0, { type: "ship", edge: path.at(-1) });
  assert.equal(g.players[0].cloth, 1); assert.equal(village.cloth, 4); assert.deepEqual(village.connected, [0]);
  S.connections(g); assert.equal(g.players[0].cloth, 1);
  g.turn++; assert.ok(path.every((i) => !E.movableShips(g, 0).includes(i)));
  g.phase = "robber"; assert.ok(E.legal(g, 0).pirate.length > 0);
});

test("cloth routes stay closed beyond an intermediate village and do not award duplicate connections", () => {
  const g = main(game("cloth")), destination = g.scenario.villages[0];
  const end = g.board.vertices[destination.vertex];
  const route = seaPath(g, destination.vertex, (v) => v.tiles.some((i) => g.board.tiles[i].setupAllowed) && Math.hypot(v.x - end.x, v.y - end.y) > 150);
  assert.ok(route.path.length >= 2);
  Object.assign(g.board.vertices[route.start], { owner: 0, level: 1 });
  let v = route.start; const chain = [];
  route.path.forEach((i) => { const e = g.board.edges[i]; Object.assign(e, { owner: 0, kind: "ship", builtTurn: 0 }); v = e.a === v ? e.b : e.a; chain.push(v); });
  // A village in the middle must not stop traversal to the far village.
  g.scenario.villages[1].vertex = chain[0]; S.connections(g);
  assert.ok(g.scenario.villages[0].connected.includes(0)); assert.ok(g.scenario.villages[1].connected.includes(0));
  assert.ok(route.path.every((i) => !E.movableShips(g, 0).includes(i)));
  const cloth = g.players[0].cloth; S.connections(g); assert.equal(g.players[0].cloth, cloth);
});

test("cloth production pays each connection once, supplements shortages, and never revives empty villages", () => {
  const g = main(game("cloth")), v = g.scenario.villages[0];
  v.connected = [0,1,2]; v.cloth = 1; g.players[0].cloth = 4;
  E.produce(g, v.number);
  assert.equal(v.cloth, 0); assert.equal(g.scenario.clothBank, 8);
  assert.deepEqual(g.players.map((p) => p.cloth), [5,1,1]);
  const before = g.players.map((p) => p.cloth); E.produce(g, v.number); assert.deepEqual(g.players.map((p) => p.cloth), before);
  assert.equal(E.score(g, 0), 2);
  g.longest = 0; E.updateAwards(g); assert.equal(g.longest, -1); invariant(g);
});

test("cloth pirate loot validates resource versus cloth even with only one victim", () => {
  const base = main(game("cloth")); base.scenario.villages[0].connected = [0]; base.players[1].cloth = 2; hand(base, 1, [1,0,0,0,0]);
  const tile = base.board.tiles.find((t) => t.resource === -2), edge = base.board.edges.find((e) => e.tiles.includes(tile.id));
  Object.assign(edge, { owner: 1, kind: "ship" }); base.phase = "robber";
  E.act(base, 0, { type: "pirate", tile: tile.id }); assert.equal(base.phase, "steal");
  assert.deepEqual(E.legal(base, 0).scenario.steal, [{ victim: 1, loot: ["resource", "cloth"] }]);
  unchanged(base, 0, { type: "steal", victim: 1, loot: "development" }, /loot/);
  const cloth = structuredClone(base); E.act(cloth, 0, { type: "steal", victim: 1, loot: "cloth" });
  assert.equal(cloth.players[0].cloth, 1); assert.equal(cloth.players[1].resources[0], 1);
  E.act(base, 0, { type: "steal", victim: 1, loot: "resource" }); assert.equal(base.players[0].resources[0], 1); assert.equal(base.players[1].cloth, 2);
});

test("cloth depletion can award a non-current winner, using cloth as the VP tiebreaker", () => {
  const g = main(game("cloth"));
  g.scenario.villages.forEach((v, i) => { if (i >= 3) v.cloth = 0; });
  g.players[0].cloth = 4; g.players[1].cloth = 5; g.players[2].cloth = 2;
  E.act(g, 0, { type: "end" }); assert.equal(g.phase, "over"); assert.equal(g.winner, 1);
  const tie = main(game("cloth")); tie.scenario.villages.forEach((v, i) => { if (i >= 3) v.cloth = 0; }); tie.players[0].cloth = tie.players[2].cloth = 4;
  E.act(tie, 0, { type: "end" }); assert.deepEqual(E.publicGame(tie, 1).winners, [0,2]);
  assert.match(tie.log.at(-1).text, /Alice.*Carol/);
});

test("pirate initial pieces reserve the fortress settlement, remove awards, and transform the development deck", () => {
  for (const n of [3, 4]) {
    const g = setup(game("pirates", n));
    assert.equal(g.board.robber, -1); assert.equal(g.deck.length, n === 3 ? 20 : 25); assert.ok(!g.deck.includes("vp"));
    assert.equal(g.deck.filter((x) => x === "knight").length, n === 3 ? 14 : 19);
    assert.equal(E.publicGame(g, 0).players[0].settlements, 4);
    g.longest = g.largest = 0; E.updateAwards(g); assert.equal(g.longest, -1); assert.equal(g.largest, -1);
    const v = g.board.vertices.find((v) => v.owner < 0); Object.assign(v, { owner: 0, level: 1 });
    assert.equal(E.publicGame(g, 0).players[0].settlements, 5); assert.deepEqual(E.settlementSites(g, 0), []);
    assert.ok(E.legal(g, 0).buildBlocked.settlement);
  }
});

test("pirate fleet is a single shortest route via its own outpost, never branching or extending past the fortress", () => {
  const g = main(game("pirates"));
  const seat = g.scenario.pirateSeats[0], forbidden = g.scenario.pirateSeats[1].landing;
  assert.equal(S.settlementAllowed(g, 0, g.board.vertices[forbidden], false), false);
  assert.equal(S.settlementAllowed(g, 0, g.board.vertices[seat.landing], false), true);
  const path = fleetToFortress(g);
  assert.ok(path.some((i) => [g.board.edges[i].a, g.board.edges[i].b].includes(seat.landing)));
  assert.deepEqual(E.shipSites(g, 0), []); assert.deepEqual(E.movableShips(g, 0), []);
  const degree = new Map(); path.forEach((i) => [g.board.edges[i].a, g.board.edges[i].b].forEach((v) => degree.set(v, (degree.get(v) || 0) + 1)));
  assert.ok([...degree.values()].every((n) => n <= 2));
});

test("all four pirate fleets can reach their own fortresses without interfering or using more than fifteen ships", () => {
  const g = main(game("pirates", 4));
  for (let id = 0; id < 4; id++) { const path = fleetToFortress(g, id); assert.equal(path.length, 9); }
  assert.equal(new Set(g.board.edges.filter((e) => e.owner >= 0).map((e) => e.id)).size, 36);
  for (const seat of g.scenario.pirateSeats) {
    const path = S.orderedShips(g, seat.owner); assert.ok(path.some((i) => [g.board.edges[i].a, g.board.edges[i].b].includes(seat.landing)));
  }
});

test("pirate knights convert nearest ordinary ships on distinct turns, never on the purchase turn", () => {
  const g = main(game("pirates")), path = fleetToFortress(g); g.turn = 5; g.phase = "roll";
  g.players[0].development = [{ type: "knight", turn: 1 }, { type: "knight", turn: 1 }];
  for (let n = 0; n < 2; n++) {
    assert.ok(E.legal(g, 0).development.includes("knight"));
    E.act(g, 0, { type: "playDevelopment", card: "knight" });
    assert.equal(g.board.edges[path[n]].warship, true); assert.equal(g.developmentPlayed, true);
    assert.equal(g.phase, "roll"); assert.deepEqual(E.legal(g, 0).development, []);
    unchanged(g, 0, { type: "playDevelopment", card: "knight" }, /Cannot play/);
    E.act(g, 0, { type: "roll" }, () => .34);
    unchanged(g, 0, { type: "playDevelopment", card: "knight" }, /Cannot play/);
    E.act(g, 0, { type: "end" });
    while (g.current !== 0) { E.act(g, g.current, { type: "roll" }, () => .34); E.act(g, g.current, { type: "end" }); }
    assert.equal(g.developmentPlayed, false);
  }
  E.act(g, 0, { type: "roll" }, () => .34);
  g.deck = ["knight"]; hand(g, 0, [0,0,1,1,1]);
  E.act(g, 0, { type: "buyDevelopment" });
  assert.equal(g.players[0].development[0].turn, g.turn); assert.equal(g.developmentPlayed, false);
  unchanged(g, 0, { type: "playDevelopment", card: "knight" }, /Cannot play/);
  E.act(g, 0, { type: "end" });
  while (g.current !== 0) { E.act(g, g.current, { type: "roll" }, () => .34); E.act(g, g.current, { type: "end" }); }
  E.act(g, 0, { type: "playDevelopment", card: "knight" }); assert.equal(g.board.edges[path[2]].warship, true);
});

test("pirate knights and Monopoly share one action-development allowance before and after rolling", () => {
  for (const n of [3,4]) for (const phase of ["roll", "main"]) for (const first of ["knight", "monopoly"]) {
    const g = main(game("pirates", n)); fleetToFortress(g); g.phase = phase;
    g.players[0].development = [{ type: "knight", turn: 0 }, { type: "knight", turn: 0 }, { type: "monopoly", turn: 0 }];
    E.act(g, 0, { type: "playDevelopment", card: first });
    if (first === "monopoly") E.act(g, 0, { type: "monopoly", resource: 0 });
    assert.equal(g.phase, phase); assert.equal(g.developmentPlayed, true);
    assert.deepEqual(E.legal(g, 0).development, []);
    for (const card of ["knight", "monopoly"]) unchanged(g, 0, { type: "playDevelopment", card }, /Cannot play/);
    if (phase === "roll") {
      E.act(g, 0, { type: "roll" }, () => .34);
      assert.equal(g.developmentPlayed, true);
      for (const card of ["knight", "monopoly"]) unchanged(g, 0, { type: "playDevelopment", card }, /Cannot play/);
    }
  }
});

test("pirate bots attack with a smaller viable fleet when no knights remain to reinforce it", () => {
  const g = main(game("pirates")), path = fleetToFortress(g);
  path.slice(0, 3).forEach((i) => { g.board.edges[i].warship = true; }); g.deck = [];
  assert.equal(E.chooseBotAction(g, 0).type, "attackFortress");
  g.players[0].development = [{ type: "knight", turn: g.turn }];
  assert.notEqual(E.chooseBotAction(g, 0).type, "attackFortress");
});

test("pirate seed 20 finishes after deck exhaustion without waiting forever for a fourth warship", () => {
  const rng = seeded(20), g = E.createGame(names.slice(0, 3), rng, "pirates");
  const developmentTurns = new Set(); let fallbackAttacks = 0, steps = 0;
  while (g.phase !== "over" && steps++ < 1000) {
    const id = E.requiredActors(g)[0], action = E.chooseBotAction(g, id, rng);
    if (action.type === "playDevelopment") {
      assert.ok(!developmentTurns.has(g.turn), "one action development card per turn"); developmentTurns.add(g.turn);
    }
    if (action.type === "attackFortress" && !g.deck.length && S.warships(g, id) === 3) fallbackAttacks++;
    E.act(g, id, action, rng);
    if (steps % 25 === 0) invariant(g);
  }
  assert.ok(fallbackAttacks > 0); assert.equal(g.deck.length, 0);
  assert.equal(g.phase, "over"); assert.equal(g.winner, 0);
  assert.equal(g.scenario.pirateSeats[g.winner].liberated, true); invariant(g);
});

test("pirate raid losses are automatic weighted random discards before production, never player-selected", () => {
  const g = raidFixture(); hand(g, 1, [1,0,0,0,2]);
  const city = g.board.vertices.find((v) => v.owner < 0 && !g.board.tiles[g.scenario.piratePath[1]].vertices.includes(v.id));
  Object.assign(city, { owner: 1, level: 2 });
  g.board.tiles.forEach((t) => { t.number = 0; });
  const draws = [0,0,.99,0]; E.act(g, 0, { type: "roll" }, () => draws.shift() ?? 0);
  assert.equal(g.board.pirate, g.scenario.piratePath[1]); assert.equal(g.phase, "main");
  assert.deepEqual(g.players[1].resources, [0,0,0,0,1]); assert.equal(g.scenario.pending, null);
  unchanged(g, 1, { type: "piratePayment", resources: [0,0,0,0,1] }, /Not your turn/); invariant(g);
});

test("pirate raid wins schedule the affected player, restrict bank choice, then resume roll production", () => {
  const g = raidFixture();
  g.board.edges.slice(0, 2).forEach((e) => Object.assign(e, { owner: 1, kind: "ship", warship: true }));
  const tile = g.board.tiles.find((t) => t.resource >= 0 && t.resource < 5 && t.vertices.some((i) => g.board.vertices[i].owner === 1));
  if (tile) tile.number = 2;
  E.act(g, 0, { type: "roll" }, () => 0);
  assert.equal(g.phase, "scenarioChoice"); assert.deepEqual(E.requiredActors(g), [1]);
  assert.equal(g.scenario.pending.kind, "pirateReward"); assert.deepEqual(E.legal(g, 0).scenario.pirateReward, []);
  unchanged(g, 0, { type: "pirateReward", resource: 0 }, /choice/);
  unchanged(g, 1, { type: "pirateReward", resource: 8 }, /resource/);
  E.act(g, 1, { type: "pirateReward", resource: 0 }); assert.equal(g.phase, "main"); assert.equal(g.players[1].resources[0] >= 1, true); invariant(g);
});

test("pirate raid ties change no cards, and random losses happen before checking seven's discard threshold", () => {
  const tie = raidFixture(); Object.assign(tie.board.edges[0], { owner: 1, kind: "ship", warship: true }); hand(tie, 1, [2,0,0,0,0]);
  tie.board.tiles.forEach((t) => { t.number = 0; }); E.act(tie, 0, { type: "roll" }, () => 0);
  assert.equal(tie.phase, "main"); assert.deepEqual(tie.players[1].resources, [2,0,0,0,0]);
  const loss = raidFixture(); hand(loss, 1, [8,0,0,0,0]);
  const dice = [0,.99,0]; E.act(loss, 0, { type: "roll" }, () => dice.shift() ?? 0);
  assert.equal(loss.players[1].resources[0], 7); assert.deepEqual(loss.discard, {}); assert.equal(loss.phase, "steal");
  assert.deepEqual(loss.victims, [1]); invariant(loss);
});

test("pirate seven moves the fleet once, then discards and steals from any opponent without moving again", () => {
  const g = raidFixture(); emptyBoard(g); hand(g, 1, [9,0,0,0,0]); hand(g, 2, [0,1,0,0,0]);
  const draws = [0,.99]; E.act(g, 0, { type: "roll" }, () => draws.shift() ?? 0);
  const pirate = g.board.pirate; assert.equal(g.phase, "discard"); assert.deepEqual(E.requiredActors(g), [1]);
  E.act(g, 1, { type: "discard", resources: [4,0,0,0,0] }); assert.equal(g.phase, "steal");
  assert.deepEqual(E.legal(g, 0).victims, [1,2]); assert.deepEqual(E.legal(g, 0).pirate, []);
  E.act(g, 0, { type: "steal", victim: 2 }, () => 0); assert.equal(g.board.pirate, pirate); assert.equal(g.players[0].resources[1], 1); invariant(g);
});

test("fortress combat removes nearest ships on ties/losses, liberates at three wins, and always ends the turn", () => {
  for (const result of ["tie", "loss", "win"]) {
    const g = main(game("pirates")), path = fleetToFortress(g), s = g.scenario.pirateSeats[0];
    const count = result === "win" ? 7 : result === "tie" ? 1 : 0;
    path.slice(0, count).forEach((i) => { g.board.edges[i].warship = true; });
    if (result === "win") { s.strength = 1; g.scenario.pirateSeats.slice(1).forEach((x) => { x.liberated = true; x.strength = 0; }); }
    E.act(g, 0, { type: "attackFortress" }, () => 0);
    assert.equal(g.current, 1); assert.equal(g.phase, "roll"); assert.equal(g.scenario.lastAttack.result, result);
    if (result === "win") {
      assert.equal(s.strength, 0); assert.equal(s.liberated, true); assert.equal(g.board.vertices[s.fortress].owner, 0);
      assert.equal(g.board.pirate, -1); assert.equal(g.board.pirateStart, null);
    } else {
      assert.equal(g.board.edges[path.at(-1)].owner, -1);
      assert.equal(g.board.edges[path.at(-2)].owner, result === "loss" ? -1 : 0);
      assert.equal(s.strength, 3); assert.equal(E.legal(g, 0).scenario.attackFortress, false);
    }
  }
});

test("pirate victory needs both ten points and the player's own liberated fortress", () => {
  const g = main(game("pirates")); g.players[0].scenarioPoints = 10;
  hand(g, 0, [0,0,0,2,3]); E.act(g, 0, { type: "city", vertex: g.scenario.pirateSeats[0].home });
  assert.equal(g.winner, -1);
  const path = fleetToFortress(g); path.forEach((i) => { g.board.edges[i].warship = true; }); g.scenario.pirateSeats[0].strength = 1;
  E.act(g, 0, { type: "attackFortress" }, () => 0); assert.equal(g.winner, 0); assert.equal(g.current, 0);
});

test("wonders use exact costs, six-point library eligibility, exclusive irrevocable claims and four stages", () => {
  const g = main(game("wonders")), p = g.players[0], site = g.scenario.wonderSites.bridge[0];
  assert.equal(g.board.pirateStart, null); assert.equal(E.legal(g, 0).scenario.chooseWonders.length, 0);
  Object.assign(g.board.vertices[site], { owner: 0, level: 2 }); p.scenarioPoints = 3;
  assert.ok(!E.legal(g, 0).scenario.chooseWonders.includes("library")); p.scenarioPoints++;
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("library"));
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("bridge"));
  unchanged(g, 0, { type: "chooseWonder", wonder: "colossus" }, /requirements/);
  E.act(g, 0, { type: "chooseWonder", wonder: "bridge" });
  unchanged(g, 0, { type: "chooseWonder", wonder: "library" }, /requirements/);
  g.current = 1; Object.assign(g.board.vertices[g.scenario.wonderSites.bridge[1]], { owner: 1, level: 1 });
  assert.ok(!E.legal(g, 1).scenario.chooseWonders.includes("bridge")); g.current = 0;
  hand(g, 0, [12,0,4,4,0]);
  for (let stage = 1; stage <= 4; stage++) { E.act(g, 0, { type: "buildWonder" }); assert.equal(p.wonder.stage, stage); }
  assert.equal(g.winner, 0); assert.deepEqual(p.resources, [0,0,0,0,0]); invariant(g);
});

test("a wonder requires an unused physical ship, reserves it, and leaves board ship counts unchanged", () => {
  const g = main(game("wonders")), site = g.scenario.wonderSites.bridge[0];
  Object.assign(g.board.vertices[site], { owner: 0, level: 1 });
  const coast = coastalVertex(g); Object.assign(coast, { owner: 0, level: 1 });
  hand(g, 0, [15,0,15,0,0]);
  for (let i = 0; i < 15; i++) E.act(g, 0, { type: "ship", edge: E.legal(g, 0).ships[0] });
  let view = E.publicGame(g, 0);
  assert.equal(view.players[0].ships, 15); assert.equal(view.players[0].reservedShips, 0); assert.equal(view.players[0].availableShips, 0);
  assert.deepEqual(view.legal.scenario.chooseWonders, []); assert.match(view.legal.buildBlocked.chooseWonder, /unused ship.*marker/);
  unchanged(g, 0, { type: "chooseWonder", wonder: "bridge" }, /unused ship.*marker/);
  const released = g.board.edges.find((e) => e.owner === 0 && e.kind === "ship");
  released.owner = -1; delete released.kind; delete released.builtTurn;
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("bridge"));
  const before = structuredClone(g.board.edges);
  E.act(g, 0, { type: "chooseWonder", wonder: "bridge" });
  assert.deepEqual(g.board.edges, before);
  view = E.publicGame(g, 0);
  assert.equal(view.players[0].ships, 14); assert.equal(view.players[0].reservedShips, 1); assert.equal(view.players[0].availableShips, 0);
  assert.deepEqual(E.legal(g, 0).scenario.chooseWonders, []);
  assert.deepEqual(view.legal.ships, []); assert.deepEqual(E.shipSites(g, 0), []);
  assert.match(view.legal.buildBlocked.ship, /1 reserved wonder marker/);
  hand(g, 0, [1,0,1,0,0]); unchanged(g, 0, { type: "ship", edge: released.id }, /reserved wonder marker/);
  g.phase = "freeRoads"; g.freeRoads = 2;
  assert.deepEqual(E.legal(g, 0).ships, []); unchanged(g, 0, { type: "ship", edge: released.id }, /reserved wonder marker/);
  const snapshot = structuredClone(g); assert.equal(E.publicGame(snapshot, 1).players[0].reservedShips, 1);
});

test("wonder ship markers leave fourteen buildable ships and never prevent moving a legal old ship at capacity", () => {
  const g = main(game("wonders")), site = g.scenario.wonderSites.bridge[0];
  Object.assign(g.board.vertices[site], { owner: 0, level: 1 });
  Object.assign(coastalVertex(g), { owner: 0, level: 1 });
  E.act(g, 0, { type: "chooseWonder", wonder: "bridge" });
  assert.equal(E.publicGame(g, 0).players[0].availableShips, 14);
  hand(g, 0, [14,0,14,0,0]);
  for (let i = 0; i < 14; i++) E.act(g, 0, { type: "ship", edge: E.legal(g, 0).ships[0] });
  assert.equal(E.publicGame(g, 0).players[0].ships, 14); assert.deepEqual(E.shipSites(g, 0), []);
  g.turn++;
  const l = E.legal(g, 0), from = l.moveShips[0]; assert.ok(Number.isInteger(from));
  E.act(g, 0, { type: "moveShip", from, edge: l.shipDestinations[from][0] });
  const view = E.publicGame(g, 0);
  assert.equal(view.players[0].ships, 14); assert.equal(view.players[0].reservedShips, 1); assert.equal(view.players[0].availableShips, 0);
  assert.deepEqual(view.legal.ships, []); invariant(g);
});

test("all wonder eligibility branches use buildings, a legal single trail and the correct marked sites", () => {
  const g = main(game("wonders"));
  const site = g.scenario.wonderSites.wall[0]; Object.assign(g.board.vertices[site], { owner: 0, level: 1 });
  assert.deepEqual(E.legal(g, 0).scenario.chooseWonders, ["wall"]);
  const port = g.board.ports[0]; Object.assign(g.board.vertices[port.vertices[0]], { owner: 0, level: 1 });
  assert.ok(!E.legal(g, 0).scenario.chooseWonders.includes("colossus"));
  function trail(vertex, used) {
    if (used.length === 5) return used;
    for (const eid of g.board.vertices[vertex].edges) {
      const e = g.board.edges[eid];
      if (used.includes(eid) || !e.tiles.some((i) => g.board.tiles[i].resource >= -1)) continue;
      const found = trail(e.a === vertex ? e.b : e.a, [...used, eid]); if (found) return found;
    }
    return null;
  }
  trail(port.vertices[0], []).forEach((i) => Object.assign(g.board.edges[i], { owner: 0, kind: "road" }));
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("colossus"));
  g.board.vertices[site].level = 2; g.board.vertices[port.vertices[0]].level = 2;
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("theatre"));
  assert.ok(E.legal(g, 0).scenario.chooseWonders.includes("wall"));
  assert.equal(E.makeBoard(seeded(3), "wonders").pirateStart, null);
  assert.equal(E.makeBoard(seeded(3), "pirates", "random").robber, -1);
});

test("wonder VP victory requires a strict stage lead; each small-island settlement earns one point", () => {
  const g = main(game("wonders"));
  g.players[0].wonder = { id: "bridge", stage: 1 }; g.players[1].wonder = { id: "wall", stage: 1 }; g.players[0].scenarioPoints = 10;
  hand(g, 0, [3,0,1,1,0]); E.act(g, 0, { type: "buildWonder" }); assert.equal(g.winner, 0);
  const other = main(game("wonders"));
  const foreign = other.board.vertices.filter((v) => v.tiles.some((i) => other.board.tiles[i].resource >= 0) && !v.tiles.some((i) => other.board.tiles[i].setupAllowed));
  for (const v of foreign.slice(0, 2)) S.settled(other, 0, v, false);
  assert.equal(other.players[0].scenarioPoints, 2);
  for (const v of other.scenario.wonderSites.setupForbidden) assert.ok(!E.settlementSites(other, 0, true).includes(v));
});

test("New World remembers personal home islands and awards each foreign island only once", () => {
  const g = game("new-world"), islands = g.board.islands;
  assert.ok(islands.length >= 3);
  const vertex = (i) => g.board.vertices[g.board.tiles[islands[i][0]].vertices[0]];
  S.settled(g, 0, vertex(0), true); S.settled(g, 0, vertex(1), true); assert.deepEqual(g.players[0].homeIslands, [0,1]);
  S.settled(g, 0, vertex(0), false); assert.equal(g.players[0].discovered.length, 0);
  S.settled(g, 0, vertex(2), false); S.settled(g, 0, vertex(2), false);
  assert.deepEqual(g.players[0].discovered, [2]); assert.equal(E.score(g, 0), 1);
  S.settled(g, 1, vertex(2), false); assert.equal(E.score(g, 1), 1);
  for (const thieves of ["both", "robber", "pirate"]) {
    const x = main(game("new-world", 3, 1, "random", { thieves })); x.phase = "robber";
    assert.equal(E.legal(x, 0).robber.length > 0, thieves !== "pirate"); assert.equal(E.legal(x, 0).pirate.length > 0, thieves !== "robber");
    if (thieves === "robber") assert.equal(x.board.pirateStart, null);
  }
});

test("New World drafts ten hidden-order harbors clockwise before any settlements on either layout", () => {
  for (const layout of ["default", "random"]) for (const n of [3, 4]) {
    const g = game("new-world", n, 31, layout), types = [];
    assert.equal(g.phase, "scenarioChoice"); assert.deepEqual(g.board.ports, []);
    assert.equal(g.scenario.harborRemaining, 10); assert.equal(g.harborDeck.length, 9);
    for (let i = 0; i < 10; i++) {
      const actor = i % n, view = E.publicGame(g, actor), draft = view.scenario.harborDraft;
      assert.deepEqual(E.requiredActors(g), [actor]); assert.equal(view.current, actor); assert.equal(draft.actor, actor);
      assert.equal(view.scenario.harborRemaining, 10 - i); assert.ok(!JSON.stringify(view).includes("harborDeck"));
      assert.deepEqual(view.legal.settlements, []); types.push(draft.resource);
      const choices = view.legal.scenario.placeHarbors[0];
      assert.ok(choices.edges.length); assert.deepEqual(E.legal(g, (actor + 1) % n).scenario.placeHarbors, []);
      unchanged(g, actor, { type: "placeHarbor", harbor: "previous-token", edge: choices.edges[0] }, /harbor/);
      unchanged(g, (actor + 1) % n, { type: "placeHarbor", harbor: draft.id, edge: choices.edges[0] }, /harbor/);
      E.act(g, actor, { type: "placeHarbor", harbor: draft.id, edge: choices.edges[0] });
      assert.equal(new Set(g.board.ports.flatMap((p) => p.vertices)).size, g.board.ports.length * 2);
    }
    assert.equal(g.phase, "setupSettlement"); assert.equal(g.current, 0); assert.equal(g.turn, 0);
    assert.equal(g.scenario.harborDraft, null); assert.equal(g.scenario.harborRemaining, 0);
    assert.deepEqual(types.sort((a, b) => a - b), [-1,-1,-1,-1,-1,0,1,2,3,4]);
    assert.equal(g.board.vertices.filter((v) => v.owner >= 0).length, 0);
  }
});

test("requiredActors covers scenario choices, gold, simultaneous discards, ordinary turns and game end", () => {
  const g = main(game("new-world")); assert.deepEqual(E.requiredActors(g), [0]);
  g.phase = "gold"; g.goldQueue = [{ id: 2, count: 2 }, { id: 1, count: 1 }]; assert.deepEqual(E.requiredActors(g), [2]);
  g.phase = "discard"; g.discard = { 0: 4, 2: 5 }; assert.deepEqual(E.requiredActors(g), [0,2]);
  g.phase = "over"; assert.deepEqual(E.requiredActors(g), []);
});

test("twenty complete seeded scenario bot games validate every action and preserve inventory", { timeout: 120000 }, () => {
  const coverage = {};
  for (const kind of kinds) for (const n of [3, 4]) for (const layout of ["default", "random"]) {
    const rng = seeded(17 + n), g = E.createGame(names.slice(0, n), rng, kind, layout);
    let steps = 0;
    while (g.phase !== "over" && steps++ < 6000) {
      const id = E.requiredActors(g)[0], a = E.chooseBotAction(g, id, rng);
      assert.ok(a, `${kind}/${n}/${layout}: no bot action in ${g.phase}`);
      E.act(g, id, a, rng); coverage[a.type] = (coverage[a.type] || 0) + 1;
      if (steps % 25 === 0) invariant(g);
    }
    assert.equal(g.phase, "over", `${kind}/${n}/${layout} stalled at turn ${g.turn}`); invariant(g);
  }
  for (const action of ["placeHarbor", "pirateReward", "attackFortress", "chooseWonder", "buildWonder"]) assert.ok(coverage[action], action);
  console.log("Scenario action coverage:", coverage);
});
