"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), E = require("./bridge-engine"), Bot = require("./bridge-bot");
function rng(seed) { return (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); }; }
function auctionView(hand, calls = []) {
  const g = E.createGame(["N", "E", "S", "W"]); calls.forEach((call) => E.act(g, E.controller(g), { type: "call", call }));
  g.hands[g.current] = hand; return E.publicGame(g, g.current);
}
test("natural bidding: balanced NT ranges, partner invitations, eight-card major fits and strong-club response", () => {
  const balanced17 = [0, 1, 2, 7, 13, 20, 24, 27, 32, 37, 42, 45, 49];
  assert.equal(Bot.handInfo(balanced17).hcp, 17);
  assert.equal(Bot.chooseAction(auctionView(balanced17), 0).call, "1NT");
  assert.equal(Bot.chooseAction(auctionView(balanced17, ["1NT", "P", "2NT", "P"]), 0).call, "3NT");
  const twelve = [0, 1, 2, 7, 16, 20, 24, 28, 32, 37, 43, 45, 49];
  assert.equal(Bot.handInfo(twelve).hcp, 12);
  assert.equal(Bot.chooseAction(auctionView(twelve, ["1NT", "P"]), 2).call, "3NT");
  assert.equal(Bot.chooseAction(auctionView(twelve, ["2C", "P"]), 2).call, "2D");
  const strong = Bot.inferBid(auctionView(twelve, ["2C", "P", "2D", "P", "2NT", "P"]), 0);
  assert.equal(strong.min, 22); assert.equal(strong.max, 24);
  const fit = [0, 1, 2, 6, 9, 13, 18, 20, 28, 35, 43, 45, 49];
  assert.equal(Bot.chooseAction(auctionView(fit, ["1S", "P"]), 2).call, "4S");
});
test("hidden styles are stable decision parameters and differ only at judgment margins", () => {
  const twelve = [0, 1, 2, 7, 16, 20, 24, 28, 32, 37, 43, 45, 49], v = auctionView(twelve);
  assert.equal(Bot.chooseAction(v, 0, 1).call, "P"); assert.equal(Bot.chooseAction(v, 0, 2).call, "1C");
  for (let style = 0; style < Bot.profileCount; style++) assert.deepEqual(Bot.chooseAction(v, 0, style), Bot.chooseAction(v, 0, style));
});
test("sampled deals preserve public cards, hand counts and every observed void", () => {
  let checked = 0, foundVoid = false;
  const g = E.createGame(["N", "E", "S", "W"], 1, rng(512));
  for (const call of ["3NT", "P", "P", "P"]) E.act(g, E.controller(g), { type: "call", call });
  while (g.phase !== "over") {
    if (g.phase === "trick") { E.advanceTrick(g); continue; }
    const actor = E.controller(g), v = E.publicGame(g, actor), k = Bot.knowledge(v, actor);
    const deals = Bot.sampleDeals(v, actor); assert.equal(deals.length, 8);
    for (const { hands } of deals) {
      assert.deepEqual(hands.map((h) => h.length), v.counts);
      const all = [...hands.flat(), ...k.played.map((p) => p.card)]; assert.equal(all.length, 52); assert.equal(new Set(all).size, 52);
      for (let s = 0; s < 4; s++) { if (k.known[s]) assert.deepEqual(hands[s], k.known[s]); for (const suit of k.voids[s]) { foundVoid = true; assert(!hands[s].some((c) => Math.floor(c / 13) === suit)); } }
    }
    E.act(g, actor, E.chooseBotAction(g, actor, checked % 4)); checked++;
  }
  assert.equal(checked, 52); assert(foundVoid);
});
test("AI and sampling cannot read hidden hands, original deal or unseen opponent profiles", () => {
  const g = E.createGame(["N", "E", "S", "W"], 1, rng(45));
  for (const call of ["3NT", "P", "P", "P"]) E.act(g, E.controller(g), { type: "call", call });
  E.act(g, 1, { type: "play", card: E.legalCards(g)[0] });
  const before = E.chooseBotAction(g, 0, 2), original = g.originalHands;
  [g.hands[1], g.hands[3]] = [g.hands[3], g.hands[1]];
  // Preserve public counts while changing every hidden value.
  [g.hands[1][0], g.hands[3][0]] = [g.hands[3][0], g.hands[1][0]];
  [g.hands[1], g.hands[3]] = [g.hands[3], g.hands[1]];
  Object.defineProperty(g, "originalHands", { get() { throw new Error("Hidden original deal read"); } });
  assert.deepEqual(E.chooseBotAction(g, 0, 2), before);
  assert(original.length);
});
test("small ending: take the winning ace now to preserve the contract", () => {
  const remaining = [0, 12, 24, 39, 23, 1, 2, 3], rest = Array.from({ length: 52 }, (_, i) => i).filter((c) => !remaining.includes(c));
  const groups = [0, 1, 2, 3].map((s) => rest.filter((c) => Math.floor(c / 13) === s)), tricks = [], spare = [];
  for (const group of groups) { while (group.length >= 4) tricks.push({ cards: group.splice(0, 4).map((card, seat) => ({ card, seat })), winner: 0 }); spare.push(...group); }
  // The only mixed historical trick shows dummy void in hearts, not either defender.
  if (spare.length) { const hearts = spare.filter((c) => Math.floor(c / 13) === 1), diamond = spare.find((c) => Math.floor(c / 13) === 2); tricks.push({ cards: [hearts[0], hearts[1], diamond, hearts[2]].map((card, seat) => ({ card, seat })), winner: 0 }); }
  const v = { board: 1, phase: "play", controller: 0, current: 0, dummy: 2, dummyVisible: true,
    contract: { level: 2, strain: "NT", declarer: "N" }, vulnerability: "NvNv", won: [6, 5],
    hands: [[0, 12], null, [39], null], counts: [2, 1, 1, 1], auction: [], tricks,
    trick: [{ seat: 1, card: 1 }, { seat: 2, card: 2 }, { seat: 3, card: 3 }], legalCards: [0, 12] };
  assert.equal(Bot.sampleDeals(v, 0).length, 8); assert.equal(Bot.chooseCard(v, 0), 0);
});
