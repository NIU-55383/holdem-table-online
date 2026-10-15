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
});

test("cloth depletion and shared wins publish the final scores, not just the active player's score", () => {
  const g = main(setup(make(3, "cloth")));
  g.scenario.villages.forEach((v, i) => { v.cloth = i < 3 ? 5 : 0; });
  g.players[1].cloth = 10; g.players[2].cloth = 10;
  E.act(g, 0, { type: "cancelTrade" });
  assert.equal(g.phase, "over"); assert.deepEqual(g.winners, [1, 2]);
  assert.deepEqual(E.publicGame(g, 0).statistics.history.at(-1).scores, totals(g));
});
