"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm");
const Hints = require("./bridge-bidding"), E = require("./bridge-engine");
const ranks = "AKQJT98765432";
const hand = (...suits) => suits.flatMap((suit, s) => [...suit].map((r) => s * 13 + ranks.indexOf(r)));
function view(cards, calls = []) {
  const g = E.createGame(["N", "E", "S", "W"]);
  for (const call of calls) E.act(g, E.controller(g), { type: "call", call });
  g.hands[g.current] = [...cards];
  return E.publicGame(g, g.current);
}
function info(cards, calls = []) { const v = view(cards, calls); return Hints.analyze(v, v.current); }
const combinations = new Map();
function byPoints(length) {
  if (combinations.has(length)) return combinations.get(length);
  const values = new Map();
  function visit(start, cards, sum) {
    if (cards.length === length) { if (!values.has(sum)) values.set(sum, cards); return; }
    for (let i = start; i <= 13 - (length - cards.length); i++) visit(i + 1, [...cards, i], sum + Math.max(0, 4 - i));
  }
  visit(0, [], 0); combinations.set(length, values); return values;
}
function handFor(hcp, lengths = [4, 3, 3, 3]) {
  function build(s, remaining) {
    if (s === 4) return remaining === 0 ? [] : null;
    for (const [points, cards] of byPoints(lengths[s])) {
      if (points > remaining) continue;
      const rest = build(s + 1, remaining - points);
      if (rest) return [...cards.map((c) => s * 13 + c), ...rest];
    }
    return null;
  }
  const cards = build(0, hcp); assert(cards, `Cannot build ${hcp} ${lengths}`); return cards;
}

test("HCP uses A=4 K=3 Q=2 J=1, all low cards zero, and the complete deck sums to 40", () => {
  const cards = hand("AKQJ", "T987", "654", "32");
  const a = info(cards);
  assert.equal(a.hcp, 10); assert.deepEqual(a.honors, { A: 1, K: 1, Q: 1, J: 1 });
  assert.deepEqual(a.lengths, [4, 4, 3, 2]);
  assert.equal(info(handFor(0)).hcp, 0);
  let deckTotal = 0;
  for (let s = 0; s < 4; s++) deckTotal += info(Array.from({ length: 13 }, (_, i) => s * 13 + i)).hcp;
  assert.equal(deckTotal, 40);
});

test("only 4333, 4432 and 5332 are balanced, regardless of suit order", () => {
  for (const shape of [[4, 3, 3, 3], [2, 4, 4, 3], [3, 5, 2, 3]]) assert.equal(info(handFor(15, shape)).balanced, true);
  for (const shape of [[5, 4, 2, 2], [6, 3, 2, 2], [4, 4, 4, 1], [5, 4, 4, 0]]) assert.equal(info(handFor(15, shape)).balanced, false);
});

test("opening advice honors NT boundaries, shape and strong-club treatment", () => {
  const expected = new Map([[11, "P"], [12, "1C"], [14, "1C"], [15, "1NT"], [17, "1NT"], [18, "1C"], [19, "1C"], [20, "2NT"], [21, "2NT"], [22, "2C"], [24, "2C"], [25, "3NT"], [27, "3NT"], [28, "2C"]]);
  for (const [points, call] of expected) {
    const a = info(handFor(points)); assert.equal(a.hcp, points); assert.equal(a.recommendation?.call, call, `${points} points`);
  }
  assert.equal(info(handFor(16, [5, 4, 2, 2])).recommendation.call, "1S");
  assert.equal(info(handFor(20, [2, 6, 3, 2])).recommendation.call, "1H");
  assert(info(handFor(18)).notes.some((n) => n.zh.includes("18–19") && n.zh.includes("再跳叫 2NT")));
});

test("natural openings choose longer majors, higher equal five-card major, and adequate minors", () => {
  assert.equal(info(handFor(12, [5, 6, 1, 1])).recommendation.call, "1H");
  assert.equal(info(handFor(12, [5, 5, 2, 1])).recommendation.call, "1S");
  assert.equal(info(handFor(12, [4, 4, 3, 2])).recommendation.call, "1D");
  assert.equal(info(handFor(12, [3, 2, 4, 4])).recommendation.call, "1D");
  assert.equal(info(handFor(12, [4, 3, 3, 3])).recommendation.call, "1C");
});

test("weak-two hints require quality length and exclude strong 2C and fourth-seat preempts", () => {
  const weak = hand("AK9876", "Q54", "83", "72");
  assert.equal(info(weak).hcp, 9); assert.equal(info(weak).recommendation.call, "2S");
  assert.equal(info(hand("72", "Q54", "83", "AK9876")).recommendation, null);
  assert.equal(info(weak, ["P", "P", "P"]).recommendation, null);
  assert.equal(info(handFor(11, [5, 4, 3, 1])).recommendation, null);
  assert(info(handFor(11, [5, 4, 3, 1])).notes.some((n) => n.zh.includes("20 法则")));
});

test("uncontested natural 1NT responses distinguish pass, invitation, game and slam exploration", () => {
  for (const [points, call] of [[0, "P"], [7, "P"], [8, "2NT"], [9, "2NT"], [10, "3NT"], [15, "3NT"]]) {
    const a = info(handFor(points), ["1NT", "P"]); assert.equal(a.recommendation.call, call);
    assert(a.notes.some((n) => n.zh.includes(`${points + 15}–${points + 17}`)));
  }
  assert.equal(info(handFor(16), ["1NT", "P"]).recommendation, null);
  assert.equal(info(handFor(7, [5, 3, 3, 2]), ["1NT", "P"]).recommendation.call, "2S");
  assert.equal(info(handFor(10, [3, 5, 3, 2]), ["1NT", "P"]).recommendation.call, "3H");
  assert.equal(info(handFor(9, [5, 3, 3, 2]), ["1NT", "P"]).recommendation, null);
  assert.equal(info(handFor(10, [2, 2, 6, 3]), ["1NT", "P"]).recommendation, null);
});

test("first suit responses recognize major support, new suits and artificial strong-club waiting", () => {
  for (const [points, call] of [[6, "2S"], [9, "2S"], [10, "3S"], [12, "3S"], [13, "4S"], [15, "4S"]]) {
    assert.equal(info(handFor(points, [3, 4, 3, 3]), ["1S", "P"]).recommendation.call, call);
  }
  assert.equal(info(handFor(16), ["1S", "P"]).recommendation, null);
  assert.equal(info(handFor(8, [4, 4, 3, 2]), ["1C", "P"]).recommendation.call, "1H");
  assert.equal(info(handFor(8, [4, 2, 4, 3]), ["1H", "P"]).recommendation.call, "1S");
  assert.equal(info(handFor(7, [2, 4, 4, 3]), ["1S", "P"]).recommendation.call, "1NT");
  assert.equal(info(handFor(11, [2, 3, 5, 3]), ["1S", "P"]).recommendation.call, "2D");
  assert.equal(info(handFor(0), ["2C", "P"]).recommendation.call, "2D");
  assert.match(info(handFor(0), ["2C", "P"]).recommendation.zh, /不保证你有方块/);
});

test("competition, doubles, passed hands and rebids get context rather than a guessed call", () => {
  const cards = handFor(16);
  for (const calls of [["1S"], ["1H", "1S"], ["1C", "X"], ["1NT", "P", "2NT", "P"], ["P", "P", "1C", "P"]]) {
    const a = info(cards, calls); assert.equal(a.recommendation, null, calls.join(" "));
    assert(a.notes.some((n) => /争叫|再叫/.test(n.zh)));
  }
});

test("recommendations are withheld when illegal or not the viewer's turn", () => {
  const v = view(handFor(16));
  v.legalCalls = ["P", "2NT"];
  assert.equal(Hints.analyze(v, 0).recommendation, null);
  v.current = 1; v.controller = 1;
  const a = Hints.analyze(v, 0); assert.equal(a.hcp, 16); assert.equal(a.recommendation, null);
  assert(a.notes.some((n) => n.zh.includes("还没轮到你")));
});

test("vulnerability uses the viewer's partnership, never another seat", () => {
  const cards = handFor(16);
  for (const vulnerability of ["NvNv", "VNv", "NvV", "VV"]) for (let seat = 0; seat < 4; seat++) {
    const v = view(cards); v.hands = [null, null, null, null]; v.hands[seat] = cards; v.current = seat; v.controller = seat; v.vulnerability = vulnerability;
    const a = Hints.analyze(v, seat);
    assert.equal(a.vulnerable, vulnerability === "VV" || vulnerability === (seat % 2 ? "NvV" : "VNv"));
    assert.equal(a.notes.some((n) => n.zh.startsWith("本方有局")), a.vulnerable);
  }
});

test("hints never read hidden hands, original hands or mutate the supplied snapshot", () => {
  const v = view(handFor(16)), expected = Hints.analyze(v, 0), before = JSON.stringify(v);
  for (let seat = 1; seat < 4; seat++) Object.defineProperty(v.hands, seat, { get() { throw new Error("hidden hand read"); } });
  Object.defineProperty(v, "originalHands", { get() { throw new Error("original deal read"); } });
  assert.deepEqual(Hints.analyze(v, 0), expected);
  const clean = view(handFor(16)), copy = JSON.stringify(clean);
  Hints.analyze(clean, 0); assert.equal(JSON.stringify(clean), copy); assert(before.length > 0);
});

test("missing, partial, duplicate or invalid hands and non-auction views are rejected", () => {
  const v = view(handFor(16));
  for (const cards of [null, [], v.hands[0].slice(1), Array(13).fill(0), [...v.hands[0].slice(1), 52], [...v.hands[0].slice(1), 1.5]]) {
    assert.equal(Hints.analyze({ ...v, hands: [cards] }, 0), null);
  }
  for (const phase of ["play", "trick", "over"]) assert.equal(Hints.analyze({ ...v, phase }, 0), null);
  for (const seat of [-1, 4, null, "0"]) assert.equal(Hints.analyze(v, seat), null);
  assert.equal(Hints.analyze({ ...v, auction: null }, 0).recommendation, null);
});

test("browser export matches Node without requiring server modules", () => {
  const context = {}; vm.runInNewContext(fs.readFileSync(require.resolve("./bridge-bidding"), "utf8"), context);
  const v = view(handFor(16));
  assert.equal(typeof context.BridgeBidding.analyze, "function");
  assert.equal(JSON.stringify(context.BridgeBidding.analyze(v, 0)), JSON.stringify(Hints.analyze(v, 0)));
});

test("sampled real auctions always return own HCP and only a legal recommendation", () => {
  let seed = 239;
  const rng = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
  let inspected = 0;
  for (let board = 1; board <= 80; board++) {
    const g = E.createGame(["N", "E", "S", "W"], board, rng);
    while (g.phase === "auction") {
      const seat = g.current, v = E.publicGame(g, seat), a = Hints.analyze(v, seat);
      assert.equal(a.hcp, g.hands[seat].reduce((n, c) => n + Math.max(0, 4 - c % 13), 0));
      if (a.recommendation) assert(v.legalCalls.includes(a.recommendation.call));
      E.act(g, seat, E.chooseBotAction(g, seat, board % 4)); inspected++;
    }
  }
  assert(inspected > 400);
});
