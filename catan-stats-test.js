"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./catan-engine"), Maps = require("./catan-maps");
const seeded = s => () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
const names = ["Alice", "Bob", "Carol", "David", "Eve", "Frank"];
const make = (n = 3, map = "base") => E.createGame(names.slice(0, n), seeded(24), map);
const totals = g => g.players.map(p => E.score(g, p.id));
function setup(g) {
  const rng = seeded(18);
  for (let i = 0; !g.turn && i < 150; i++) {
    const id = E.requiredActors(g)[0]; E.act(g, id, E.chooseBotAction(g, id, rng), rng);
  }
  assert.equal(g.turn, 1); g.target = 99; return g;
}
function main(g) { g.turn = Math.max(1, g.turn); g.phase = "main"; g.rolled = true; return g; }
function gold(g, id, amount, r = 0) {
  g.phase = "gold"; g.goldQueue = [{ id, count: amount }]; g.goldResume = "main";
  const resources = [0, 0, 0, 0, 0]; resources[r] = amount;
  E.act(g, id, { type: "gold", resources });
}

test("statistics are private until game over; winning VP purchases are included and public snapshots are detached", () => {
  const g = main(setup(make()));
  g.target = E.score(g, 0) + 1; g.deck.push("vp"); g.players[0].resources = [0, 0, 1, 1, 1];
  for (const id of [-1, 0, 1, 2]) assert.equal(E.publicGame(g, id).statistics, null);
  E.act(g, 0, { type: "buyDevelopment" });
  assert.equal(g.phase, "over");
  assert.deepEqual(g.statistics.history.at(-1).scores, totals(g));
  assert.equal(g.statistics.history.at(-1).turn, 1);
  const own = E.publicGame(g, 0).statistics, other = E.publicGame(g, 1).statistics;
  assert.deepEqual(own, other);
  own.history[0].scores[0] = 900; own.players[0].production[0] = 800;
  assert.notEqual(g.statistics.history[0].scores[0], 900);
  assert.equal(g.statistics.players[0].production[0], 0);
});

test("one score snapshot per personal turn, setup baseline, rejected actions and history beyond the log limit", () => {
  const g = setup(make());
  assert.equal(g.statistics.history.length, 1);
  assert.deepEqual(g.statistics.history[0], { turn: 0, player: null, part: null, scores: [2, 2, 2] });
  assert.ok(g.statistics.players.every(p => p.built.settlement === 2 && p.built.road === 2));
  const before = structuredClone(g.statistics);
  assert.throws(() => E.act(g, 0, { type: "end" }));
  assert.deepEqual(g.statistics, before);
  for (let i = 1; i <= 135; i++) {
    main(g); const current = g.current;
    E.act(g, current, { type: "cancelTrade" });
    E.act(g, current, { type: "cancelTrade" });
    E.act(g, current, { type: "end" });
    assert.equal(g.statistics.history.length, i + 1);
    assert.equal(g.statistics.history.at(-1).turn, i);
    assert.equal(g.statistics.history.at(-1).player, current);
  }
  assert.equal(g.statistics.history[1].turn, 1);
  const next = make(); assert.notEqual(next.statistics.id, g.statistics.id);
  assert.equal(next.statistics.history.length, 1); assert.equal(E.sum(next.statistics.dice), 0);
});

test("score losses and hidden cards are recorded, including tribe and cloth bonuses", () => {
  const g = main(setup(make()));
  g.players[0].development.push({ type: "vp", turn: 0 }); g.longest = 0;
  E.act(g, 0, { type: "end" });
  g.longest = 1; main(g); E.act(g, 1, { type: "end" });
  assert.deepEqual(g.statistics.history.slice(1).map(row => row.scores), [[5, 2, 2], [3, 4, 2]]);
  const tribe = main(setup(make(3, "tribes")));
  tribe.players[0].scenarioPoints = 2; tribe.players[0].development.push({ type: "vp", turn: 0 });
  E.act(tribe, 0, { type: "cancelTrade" });
  assert.equal(tribe.statistics.history.at(-1).scores[0], 5);
  const cloth = main(setup(make(3, "cloth")));
  cloth.players[1].cloth = 2; E.act(cloth, 0, { type: "end" });
  const previous = cloth.statistics.history.at(-1).scores[1];
  cloth.phase = "steal"; cloth.current = 0; cloth.victims = [1]; cloth.thief = "pirate"; cloth.resumePhase = "main";
  E.act(cloth, 0, { type: "steal", victim: 1, loot: "cloth" });
  assert.equal(cloth.statistics.history.at(-1).scores[1], previous - 1);
});

test("dice count each roll once, including seven, and never count paired building as another throw", () => {
  const g = setup(make(6));
  E.act(g, 0, { type: "roll" }, () => 0);
  assert.deepEqual(g.statistics.dice, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  E.act(g, 0, { type: "end" });
  assert.equal(g.pairedTurn.part, 2);
  E.act(g, 3, { type: "end" });
  assert.equal(E.sum(g.statistics.dice), 1);
  assert.deepEqual(g.statistics.history.slice(1).map(({ turn, player, part }) => [turn, player, part]), [[1, 0, 1], [2, 3, 2]]);
  const rolls = [0, .999]; E.act(g, g.current, { type: "roll" }, () => rolls.shift());
  assert.equal(g.statistics.dice[5], 1); assert.equal(E.sum(g.statistics.dice), 2);
});

test("actual production respects robber, shared shortages and partial bank supply", () => {
  const g = make(); g.turn = 1; g.target = 99;
  const tile = g.board.tiles.find(t => t.resource === 0);
  g.board.tiles.forEach(t => { t.number = t === tile ? 2 : 0; });
  const a = g.board.vertices[tile.vertices[0]], b = g.board.vertices[tile.vertices[2]];
  Object.assign(a, { owner: 0, level: 2 }); Object.assign(b, { owner: 1, level: 1 }); g.bank[0] = 1;
  E.produce(g, 2);
  assert.deepEqual(g.statistics.players.map(p => p.production[0]), [0, 0, 0]);
  b.owner = -1; E.produce(g, 2);
  assert.equal(g.statistics.players[0].production[0], 1);
  g.bank[0] = 10; g.board.robber = tile.id; E.produce(g, 2);
  assert.equal(g.statistics.players[0].production[0], 1);
  g.board.robber = -1; E.produce(g, 2);
  assert.equal(g.statistics.players[0].production[0], 3);
});

test("gold is counted by chosen resource, but setup, trades, plenty and theft are excluded", () => {
  const g = make();
  gold(g, 0, 1); assert.equal(E.sum(g.statistics.players[0].gold), 0);
  g.turn = 1; g.target = 99; gold(g, 1, 2, 4);
  assert.deepEqual(g.statistics.players[1].gold, [0, 0, 0, 0, 2]);
  main(g); g.current = 0; g.players[0].resources = [10, 10, 10, 10, 10];
  const counters = g.statistics.players.map(p => [p.production, p.gold]);
  const before = structuredClone(counters);
  E.act(g, 0, { type: "bankTrade", give: 0, get: 1 });
  g.phase = "plenty"; g.resumePhase = "main";
  E.act(g, 0, { type: "plenty", resources: [0, 0, 2, 0, 0] });
  E.act(g, 0, { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 0, 0, 0, 1], to: 1 });
  E.act(g, 1, { type: "acceptTrade", offerId: g.trade.id });
  g.phase = "steal"; g.victims = [1];
  E.act(g, 0, { type: "steal", victim: 1 }, () => 0);
  assert.deepEqual(counters, before);
});

test("construction is cumulative, free roads count, upgrades do not remove settlement builds", () => {
  const g = main(setup(make())); g.players[0].resources = [10, 10, 10, 10, 10];
  const village = E.legal(g, 0).cities[0];
  E.act(g, 0, { type: "city", vertex: village });
  assert.equal(g.statistics.players[0].built.settlement, 2);
  assert.equal(g.statistics.players[0].built.city, 1);
  g.players[0].development.push({ type: "roads", turn: 0 });
  E.act(g, 0, { type: "playDevelopment", card: "roads" });
  const edge = E.legal(g, 0).roads[0]; E.act(g, 0, { type: "road", edge });
  assert.equal(g.statistics.players[0].built.road, 3);
  g.board.edges[edge].owner = -1;
  E.act(g, 0, { type: "road", edge });
  assert.equal(g.statistics.players[0].built.road, 4);
  const before = structuredClone(g.statistics);
  assert.throws(() => E.act(g, 0, { type: "road", edge }));
  assert.deepEqual(g.statistics, before);
});

test("all Seafarers maps record setup and the first dice roll, including pirate starting pieces", () => {
  for (const map of Maps.maps) {
    const g = setup(make(map.minPlayers || map.players, map.id));
    assert.deepEqual(g.statistics.history[0].scores, totals(g), map.id);
    for (const p of g.players) {
      const built = g.statistics.players[p.id].built;
      assert.equal(built.settlement, g.board.vertices.filter(v => v.owner === p.id && v.level === 1).length, map.id);
      assert.equal(built.road + built.ship, g.board.edges.filter(e => e.owner === p.id).length, map.id);
      assert.equal(E.sum(g.statistics.players[p.id].production) + E.sum(g.statistics.players[p.id].gold), 0, map.id);
    }
    E.act(g, 0, { type: "roll" }, () => 0);
    assert.equal(E.sum(g.statistics.dice), 1, map.id);
    assert.equal(g.statistics.history.at(-1).turn, 1, map.id);
  }
});

test("complete games finish with statistics matching final scores for 3, 4, 5 and 6 players", () => {
  for (const count of [3, 4, 5, 6]) {
    const rng = seeded(count * 17), g = E.createGame(names.slice(0, count), rng);
    let rollCount = 0;
    for (let i = 0; g.phase !== "over" && i < 14000; i++) {
      const actor = E.requiredActors(g)[0], action = E.chooseBotAction(g, actor, rng);
      if (action.type === "roll") rollCount++;
      E.act(g, actor, action, rng);
    }
    assert.equal(g.phase, "over", `${count} players`);
    assert.deepEqual(g.statistics.history.at(-1).scores, totals(g));
    assert.equal(E.sum(g.statistics.dice), rollCount);
    assert.ok(g.statistics.history.every((row, i) => row.turn === i));
  }
});

test("fortress combat is not a dice roll or a new build and records its ending turn", () => {
  const g = main(setup(make(3, "pirates"))), seat = g.scenario.pirateSeats[0];
  for (let i = 0; !E.legal(g, 0).scenario.attackFortress && i < 15; i++) {
    Object.assign(g.board.edges[E.shipSites(g, 0)[0]], { owner: 0, kind: "ship", warship: true, builtTurn: 0 });
  }
  assert.equal(E.legal(g, 0).scenario.attackFortress, true);
  seat.strength = 1;
  const before = structuredClone(g.statistics.players[0].built), turn = g.turn;
  E.act(g, 0, { type: "attackFortress" }, () => 0);
  assert.equal(seat.liberated, true); assert.equal(g.turn, turn + 1);
  assert.equal(g.statistics.history.at(-1).turn, turn);
  assert.deepEqual(g.statistics.history.at(-1).scores, totals(g));
  assert.equal(E.sum(g.statistics.dice), 0);
  assert.deepEqual(g.statistics.players[0].built, before);
  assert.ok(g.statistics.players.every(p => p.robbed.theft === 0 && p.robbed.raid === 0));
});

test("cloth depletion and shared wins publish the final scores, not just the active player's score", () => {
  const g = main(setup(make(3, "cloth")));
  g.scenario.villages.forEach((v, i) => { v.cloth = i < 3 ? 5 : 0; });
  g.players[1].cloth = 10; g.players[2].cloth = 10;
  E.act(g, 0, { type: "cancelTrade" });
  assert.equal(g.phase, "over"); assert.deepEqual(g.winners, [1, 2]);
  assert.deepEqual(E.publicGame(g, 0).statistics.history.at(-1).scores, totals(g));
});

const robberyCounts = g => g.statistics.players.map(p => p.robbed);
function robberyGame(map = "base", n = 3) {
  const g = main(make(n, map)); g.target = 99;
  g.board.vertices.forEach(v => { v.owner = -1; v.level = 0; });
  g.board.edges.forEach(e => { e.owner = -1; delete e.kind; delete e.warship; });
  return g;
}
function victimByTile(g, tile, id, corner = 0) {
  Object.assign(g.board.vertices[g.board.tiles[tile].vertices[corner]], { owner: id, level: 1 });
  g.players[id].resources = [2, 0, 0, 0, 0];
}

test("automatic robber theft counts the victim once, even beside several buildings; rejected repeats do not count", () => {
  for (const n of [3, 6]) {
    const g = robberyGame("base", n); g.phase = "robber";
    assert.deepEqual(robberyCounts(g), Array.from({ length: n }, () => ({ theft: 0, raid: 0 })));
    const tile = E.legal(g, 0).robber[0];
    victimByTile(g, tile, n - 1); victimByTile(g, tile, n - 1, 2);
    E.act(g, 0, { type: "robber", tile }, () => 0);
    assert.equal(g.players[n - 1].resources[0], 1);
    assert.deepEqual(robberyCounts(g)[n - 1], { theft: 1, raid: 0 });
    assert.equal(robberyCounts(g)[0].theft, 0, "The thief is not the victim");
    const before = structuredClone(g.statistics);
    assert.throws(() => E.act(g, 0, { type: "steal", victim: n - 1 }));
    assert.deepEqual(g.statistics, before);
  }
});

test("choosing a victim and knight theft count only after a card is transferred", () => {
  const g = robberyGame(); g.players[0].development.push({ type: "knight", turn: 0 });
  E.act(g, 0, { type: "playDevelopment", card: "knight" });
  const tile = E.legal(g, 0).robber[0];
  victimByTile(g, tile, 1); victimByTile(g, tile, 2, 2);
  E.act(g, 0, { type: "robber", tile }, () => 0);
  assert.equal(g.phase, "steal"); assert.ok(robberyCounts(g).every(p => p.theft === 0));
  assert.throws(() => E.act(g, 0, { type: "steal", victim: 0 }));
  E.act(g, 0, { type: "steal", victim: 2 }, () => 0);
  assert.deepEqual(robberyCounts(g), [{ theft: 0, raid: 0 }, { theft: 0, raid: 0 }, { theft: 1, raid: 0 }]);
});

test("empty-handed victims, blocked production, seven discards and Monopoly are not robberies", () => {
  const g = robberyGame(); g.phase = "robber";
  const tile = E.legal(g, 0).robber[0]; victimByTile(g, tile, 1);
  g.players[1].resources.fill(0);
  E.act(g, 0, { type: "robber", tile });
  E.produce(g, g.board.tiles[tile].number);
  g.phase = "steal"; g.victims = [1];
  assert.throws(() => E.act(g, 0, { type: "steal", victim: 1 }), /No resources/);
  g.phase = "roll"; g.rolled = false; g.players[1].resources = [8, 0, 0, 0, 0];
  const dice = [0, .99]; E.act(g, 0, { type: "roll" }, () => dice.shift());
  assert.equal(g.phase, "discard");
  E.act(g, 1, { type: "discard", resources: [4, 0, 0, 0, 0] });
  main(g); g.players[0].development.push({ type: "monopoly", turn: 0 });
  E.act(g, 0, { type: "playDevelopment", card: "monopoly" });
  E.act(g, 0, { type: "monopoly", resource: 0 });
  assert.ok(robberyCounts(g).every(p => p.theft === 0 && p.raid === 0));
});

test("pirates count both resource and cloth theft, but not placing the pirate or invalid loot choices", () => {
  for (const loot of ["resource", "cloth"]) {
    const g = robberyGame("cloth"); g.phase = "robber";
    g.scenario.villages[0].connected = [0];
    const tile = E.legal(g, 0).pirate[0];
    const edge = g.board.edges.find(e => e.tiles.includes(tile));
    Object.assign(edge, { owner: 1, kind: "ship" });
    g.players[1].resources = [2, 0, 0, 0, 0]; g.players[1].cloth = 2;
    E.act(g, 0, { type: "pirate", tile });
    assert.equal(g.phase, "steal"); assert.equal(robberyCounts(g)[1].theft, 0);
    assert.throws(() => E.act(g, 0, { type: "steal", victim: 1, loot: "gold" }));
    E.act(g, 0, { type: "steal", victim: 1, loot }, () => 0);
    assert.deepEqual(robberyCounts(g)[1], { theft: 1, raid: 0 });
    assert.equal(loot === "cloth" ? g.players[1].cloth : g.players[1].resources[0], 1);
  }
});

test("Pirate Islands seven counts theft separately from discards and fleet raids", () => {
  const g = robberyGame("pirates"); g.phase = "roll"; g.rolled = false;
  g.players[1].resources = [9, 0, 0, 0, 0]; g.players[2].resources = [1, 0, 0, 0, 0];
  const dice = [0, .99]; E.act(g, 0, { type: "roll" }, () => dice.shift());
  E.act(g, 1, { type: "discard", resources: [4, 0, 0, 0, 0] });
  assert.equal(g.phase, "steal");
  E.act(g, 0, { type: "steal", victim: 2 }, () => 0);
  assert.deepEqual(robberyCounts(g), [{ theft: 0, raid: 0 }, { theft: 0, raid: 0 }, { theft: 1, raid: 0 }]);
});

test("fleet raids count one event for multiple lost cards; empty hands, ties and wins do not count", () => {
  for (const [cards, warships, expected] of [[3, 0, 1], [0, 0, 0], [3, 1, 0], [3, 2, 0]]) {
    const g = robberyGame("pirates"); g.phase = "roll"; g.rolled = false;
    const path = g.scenario.piratePath; g.board.pirate = path[0];
    const vertex = g.board.vertices[g.board.tiles[path[1]].vertices[0]];
    Object.assign(vertex, { owner: 1, level: 2 });
    g.players[1].resources = [cards, 0, 0, 0, 0];
    g.board.edges.slice(0, warships).forEach(e => Object.assign(e, { owner: 1, kind: "ship", warship: true }));
    E.act(g, 0, { type: "roll" }, () => 0);
    assert.deepEqual(robberyCounts(g)[1], { theft: 0, raid: expected });
    if (expected) assert.equal(g.scenario.battle.lost, 2);
  }
});

test("robbery totals are private during play, detached after game over, reset for new games and absent for legacy matches", () => {
  const g = robberyGame(); g.phase = "steal"; g.victims = [1]; g.players[1].resources[0] = 2;
  E.act(g, 0, { type: "steal", victim: 1 }, () => 0);
  assert.equal(E.publicGame(g, 1).statistics, null);
  g.phase = "over"; g.winner = 0;
  const view = E.publicGame(g, 1).statistics;
  assert.equal(view.players[1].robbed.theft, 1);
  view.players[1].robbed.theft = 50;
  assert.equal(E.publicGame(g, 2).statistics.players[1].robbed.theft, 1);
  assert.ok(robberyCounts(make()).every(p => p.theft === 0 && p.raid === 0));
  g.statistics.version = 1; g.statistics.players.forEach(p => delete p.robbed);
  g.phase = "steal"; g.victims = [1]; g.winner = -1;
  E.act(g, 0, { type: "steal", victim: 1 }, () => 0);
  assert.ok(g.statistics.players.every(p => !Object.hasOwn(p, "robbed")), "Do not invent complete counts for older matches");
});


const sourceKeys = ["diceRandom", "diceAlchemy", "diceUnknown"];
function sourceTotals(stats) {
  assert.equal(stats.version, 3);
  for (const key of ["dice", ...sourceKeys]) assert(stats[key].length === 11 && stats[key].every(n => Number.isSafeInteger(n) && n >= 0));
  assert.deepEqual(stats.dice, stats.dice.map((_, i) => sourceKeys.reduce((n, key) => n + stats[key][i], 0)));
  return sourceKeys.map(key => E.sum(stats[key]));
}
function alchemy(g, a, b) {
  const id = g.current, deck = g.cities.decks[0], at = deck.indexOf("alchemy"); assert(at >= 0);
  deck.splice(at, 1); const card = { id: ++g.cities.sequence, key: "alchemy" }; g.cities.players[id].cards.push(card);
  E.act(g, id, { type: "ck", choice: `play:${card.id}` });
  E.act(g, id, { type: "ck", choice: `dice:${a}:${b}` });
  assert.deepEqual(g.cities.alchemy, [a, b]);
}
function legacySources(g, version = 2) {
  g.statistics.version = version;
  sourceKeys.forEach(key => delete g.statistics[key]);
  if (version === 1) g.statistics.players.forEach(p => delete p.robbed);
  return g;
}

test("dice source bins record real Alchemy choices and normal seven without consuming extra randomness", () => {
  for (const map of ["cities", "cities-shores-1"]) {
    const g = setup(make(3, map)), normal = [0, .999, .5]; let randomCalls = 0;
    E.act(g, g.current, { type: "roll" }, () => { randomCalls++; return normal.shift(); });
    assert.equal(randomCalls, 3, "two number dice and one event die"); assert.deepEqual(g.dice, [1, 6]);
    assert.equal(g.statistics.diceRandom[5], 1); assert.deepEqual(sourceTotals(g.statistics), [1, 0, 0]);
    E.act(g, g.current, { type: "end" }); const before = structuredClone(g.statistics.dice);
    alchemy(g, 5, 6); assert.deepEqual(g.statistics.dice, before, "playing and choosing the card does not count as rolling");
    let eventCalls = 0; E.act(g, g.current, { type: "roll" }, () => { eventCalls++; return .5; });
    assert.equal(eventCalls, 1, "Alchemy rolls only the event die"); assert.deepEqual(g.dice, [5, 6]); assert.equal(g.cities.alchemy, null);
    assert.equal(g.statistics.diceAlchemy[9], 1); assert.deepEqual(sourceTotals(g.statistics), [1, 1, 0]);
    E.act(g, g.current, { type: "end" }); alchemy(g, 3, 4); E.act(g, g.current, { type: "roll" }, () => .5);
    assert.equal(g.statistics.dice[5], 2); assert.equal(g.statistics.diceRandom[5], 1); assert.equal(g.statistics.diceAlchemy[5], 1); assert.deepEqual(sourceTotals(g.statistics), [1, 2, 0]);
  }
});

test("rejected rolls and cancelled card actions cannot change dice-source counters or migrate history", () => {
  const g = setup(make(3, "cities")); alchemy(g, 2, 5);
  const before = structuredClone(g.statistics); let calls = 0;
  assert.throws(() => E.act(g, (g.current + 1) % 3, { type: "roll" }, () => { calls++; return 0; }));
  assert.deepEqual(g.statistics, before); assert.equal(calls, 0); assert.deepEqual(g.cities.alchemy, [2, 5]);
  E.act(g, g.current, { type: "roll" }, () => .5); const rolled = structuredClone(g.statistics);
  assert.throws(() => E.act(g, g.current, { type: "roll" }, () => { calls++; return 0; })); assert.deepEqual(g.statistics, rolled); assert.equal(calls, 0);
  const base = main(setup(make())); base.players[0].development.push({ type: "roads", turn: 0 });
  E.act(base, 0, { type: "playDevelopment", card: "roads" }); E.act(base, 0, { type: "cancelDevelopment" }); assert.deepEqual(sourceTotals(base.statistics), [0, 0, 0]);
  legacySources(g); const legacy = structuredClone(g.statistics); assert.throws(() => E.act(g, g.current, { type: "roll" })); assert.deepEqual(g.statistics, legacy);
});

test("new games reset every dice-source bin and completed snapshots remain private and detached", () => {
  const g = setup(make(3, "cities")); alchemy(g, 1, 1); E.act(g, g.current, { type: "roll" }, () => .5);
  assert.equal(require("./catan-stats").publicStatistics(g), null);
  for (const id of [0, 1, 2]) assert.equal(E.publicGame(g, id).statistics, null);
  g.phase = "over"; g.winner = 0; const first = E.publicGame(g, 0).statistics, second = E.publicGame(g, 1).statistics;
  assert.deepEqual(first, second); for (const key of ["dice", ...sourceKeys]) first[key][0] = 900;
  assert.deepEqual(sourceTotals(g.statistics), [0, 1, 0]); assert.deepEqual(sourceTotals(E.publicGame(g, 2).statistics), [0, 1, 0]);
  const next = make(3, "cities"); assert.notEqual(next.statistics.id, g.statistics.id); assert.deepEqual(sourceTotals(next.statistics), [0, 0, 0]); assert.notEqual(next.statistics.dice, next.statistics.diceRandom); assert.notEqual(next.statistics.diceRandom, next.statistics.diceAlchemy);
});

test("legacy base and pure Seafarers history is known random while legacy Cities history stays unknown", () => {
  for (const version of [1, 2]) for (const map of ["base", "shores-1", "cities", "cities-shores-1"]) {
    const g = setup(make(3, map)); E.act(g, g.current, { type: "roll" }, () => .5); legacySources(g, version);
    const hasAlchemy = Boolean(g.cities), original = structuredClone(g.statistics); g.phase = "over"; g.winner = 0;
    const view = E.publicGame(g, 0).statistics; assert.deepEqual(sourceTotals(view), hasAlchemy ? [0, 0, 1] : [1, 0, 0]); assert.deepEqual(view.dice, original.dice);
    assert.deepEqual(g.statistics, original, "public normalization only changes its detached clone");
    if (version === 1) assert(view.players.every(p => !Object.hasOwn(p, "robbed")), "no fabricated complete robbery count");
    for (const key of sourceKeys) view[key][0] = 50; assert.deepEqual(g.statistics, original);
  }
});

test("resumed legacy Cities keeps unknown historical bins while recording subsequent random and Alchemy rolls", () => {
  for (const version of [1, 2]) {
    const g = setup(make(3, "cities")); E.act(g, g.current, { type: "roll" }, () => .5); const history = [...g.statistics.dice]; legacySources(g, version);
    E.act(g, g.current, { type: "end" }); assert.deepEqual(g.statistics.diceUnknown, history);
    const values = [0, 0, .5]; E.act(g, g.current, { type: "roll" }, () => values.shift()); E.act(g, g.current, { type: "end" });
    alchemy(g, 6, 6); E.act(g, g.current, { type: "roll" }, () => .5);
    assert.deepEqual(sourceTotals(g.statistics), [1, 1, 1]); assert.deepEqual(g.statistics.diceUnknown, history); assert.equal(g.statistics.diceRandom[0], 1); assert.equal(g.statistics.diceAlchemy[10], 1);
    if (version === 1) assert(g.statistics.players.every(p => !Object.hasOwn(p, "robbed")));
  }
});

test("incomplete or contradictory source arrays conservatively fall back as a whole, never to negative random counts", () => {
  const corruptions = [
    s => delete s.diceUnknown, s => s.diceRandom.pop(), s => s.diceAlchemy.push(0),
    s => s.diceRandom[0] = -1, s => s.diceAlchemy[0] = .5, s => s.diceUnknown[0] = "1",
    s => s.diceRandom[0] = Number.MAX_SAFE_INTEGER + 1, s => s.diceAlchemy[0] = 99,
    s => { s.diceRandom[6] = 0; s.diceRandom[0] = 1; }
  ];
  for (const map of ["base", "cities"]) for (const corrupt of corruptions) {
    const g = setup(make(3, map)); E.act(g, g.current, { type: "roll" }, () => .5); corrupt(g.statistics); g.phase = "over";g.winner = 0;
    const before = structuredClone(g.statistics), view = E.publicGame(g, 0).statistics;
    assert.deepEqual(sourceTotals(view), g.cities ? [0, 0, 1] : [1, 0, 0]); assert.deepEqual(view.dice, before.dice); assert.deepEqual(g.statistics, before);
  }
});
