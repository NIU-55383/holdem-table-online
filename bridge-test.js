"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./bridge-engine");
const names = ["North", "East", "South", "West"];
function rng(seed) { return (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); }; }
function auction(g, calls) { calls.forEach((call) => E.act(g, E.controller(g), { type: "call", call })); }
test("52 unique cards, 13 per hand; standard dealers and vulnerability", () => {
  const expected = ["NvNv", "VNv", "NvV", "VV", "VNv", "NvV", "VV", "NvNv", "NvV", "VV", "NvNv", "VNv", "VV", "NvNv", "VNv", "NvV"];
  for (let board = 1; board <= 32; board++) {
    const g = E.createGame(names, board, rng(board));
    assert.deepEqual(g.hands.map((h) => h.length), [13, 13, 13, 13]);
    assert.equal(new Set(g.hands.flat()).size, 52); assert.equal(g.dealer, (board - 1) % 4);
    assert.equal(g.vulnerability, expected[(board - 1) % 16]);
  }
});
test("legal auction, doubles, redoubles, first strain bidder declares", () => {
  const g = E.createGame(names);
  assert(!E.legalCalls(g).includes("X"));
  auction(g, ["1H", "P", "2H", "X", "XX", "P", "P", "P"]);
  assert.deepEqual(g.contract, { declarer: "N", level: 2, strain: "H", redoubled: true });
  assert.equal(g.current, 1); assert.equal(g.phase, "play");
  for (const call of ["0NT", "8C", "1Z", {}, null]) {
    const fresh = E.createGame(names); assert.throws(() => E.act(fresh, 0, { type: "call", call })); assert.equal(fresh.revision, 0);
  }
});
test("four opening passes score zero, three passes after a bid close auction", () => {
  const g = E.createGame(names); auction(g, ["P", "P", "P"]); assert.equal(g.phase, "auction");
  auction(g, ["P"]); assert.equal(g.phase, "over"); assert.equal(g.result.score, 0);
});
test("private hands, opening lead reveals dummy, only declarer controls dummy", () => {
  const g = E.createGame(names); auction(g, ["1NT", "P", "P", "P"]);
  for (let seat = 0; seat < 4; seat++) assert.equal(E.publicGame(g, seat).hands.filter(Boolean).length, 1);
  assert.equal(E.publicGame(g, -1).hands.filter(Boolean).length, 0);
  E.act(g, 1, { type: "play", card: E.legalCards(g)[0] });
  assert.equal(g.current, 2); assert.equal(E.controller(g), 0);
  assert(E.publicGame(g, 1).hands[2]); assert.equal(E.publicGame(g, 1).hands[0], null);
  const card = E.legalCards(g)[0]; assert.throws(() => E.act(g, 2, { type: "play", card })); E.act(g, 0, { type: "play", card });
});
test("must follow suit, cannot play another hand, stale actions do not mutate", () => {
  const g = E.createGame(names, 1, rng(7)); auction(g, ["1NT", "P", "P", "P"]);
  const lead = g.hands[1].find((c) => g.hands[2].some((d) => Math.floor(d / 13) === Math.floor(c / 13)));
  E.act(g, 1, { type: "play", card: lead });
  const offSuit = g.hands[2].find((c) => Math.floor(c / 13) !== Math.floor(lead / 13)), before = JSON.stringify(g);
  assert.throws(() => E.act(g, 0, { type: "play", card: offSuit }));
  assert.throws(() => E.act(g, 0, { type: "play", card: E.legalCards(g)[0], revision: 0 }));
  assert.equal(JSON.stringify(g), before);
});
test("official contract scores, bonuses and penalties", () => {
  const cases = [
    ["N", 1, "NT", false, false, "NvNv", 7, 90], ["N", 3, "NT", false, false, "NvNv", 9, 400],
    ["N", 4, "S", false, false, "VNv", 10, 620], ["E", 5, "C", false, false, "NvNv", 11, -400],
    ["N", 2, "H", true, false, "NvNv", 8, 470], ["N", 2, "H", true, false, "VNv", 9, 870],
    ["N", 1, "NT", false, true, "NvNv", 7, 560], ["N", 6, "NT", false, false, "NvNv", 12, 990],
    ["N", 7, "NT", false, false, "VV", 13, 2220], ["N", 4, "S", false, false, "NvNv", 8, -100],
    ["N", 4, "S", true, false, "NvNv", 6, -800], ["N", 4, "S", true, false, "VV", 7, -800],
    ["E", 4, "S", false, true, "VV", 7, 1600]
  ];
  for (const [declarer, level, strain, doubled, redoubled, vul, tricks, score] of cases) assert.equal(E.Core.Score.calculate({ declarer, level, strain, doubled, redoubled }, vul, tricks).score, score);
});
test("120 complete mixed-style bot boards obey the core's full play validator", () => {
  let played = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const g = E.createGame(names, seed, rng(seed)); let actions = 0;
    while (g.phase !== "over" && actions++ < 200) {
      if (g.phase === "trick") E.advanceTrick(g);
      else {
        const actor = E.controller(g);
        E.act(g, actor, E.chooseBotAction(g, actor, (seed + actor) % 4));
      }
    }
    assert.equal(g.phase, "over");
    if (g.contract !== "Passout") {
      played++; assert.equal(g.won[0] + g.won[1], 13); assert.equal(g.hands.flat().length, 0);
      const deal = Object.fromEntries(E.DIRECTIONS.map((d, i) => [d, g.originalHands[i].map(E.Core.Card.numberToCard)]));
      assert(E.Core.Board.isPlayValid(deal, g.tricks.map((t) => t.cards.map((p) => E.Core.Card.numberToCard(p.card))), g.contract));
    }
  }
  assert(played > 100);
});
test("bot decisions do not read hidden opponents' hands", () => {
  const g = E.createGame(names, 1, rng(93)), actor = E.controller(g), before = E.chooseBotAction(g, actor);
  [g.hands[1], g.hands[3]] = [g.hands[3], g.hands[1]];
  assert.deepEqual(E.chooseBotAction(g, actor), before);
  auction(g, ["1NT", "P", "P", "P"]);
  const play = E.chooseBotAction(g, 1); [g.hands[0], g.hands[2]] = [g.hands[2], g.hands[0]];
  assert.deepEqual(E.chooseBotAction(g, 1), play);
});
