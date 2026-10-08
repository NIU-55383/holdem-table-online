"use strict";
const E = require("./bridge-engine");
function rng(seed) { return (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); }; }
// Frozen pre-upgrade card policy, used only as a reproducible benchmark opponent.
function previousCard(g) {
  const legal = E.legalCards(g), hand = g.hands[g.current], cards = g.trick.map((p) => E.Core.Card.numberToCard(p.card));
  const cheapest = (list) => [...list].sort((a, b) => b % 13 - a % 13 || a - b)[0];
  if (!cards.length) {
    const lengths = [0, 0, 0, 0]; hand.forEach((c) => lengths[Math.floor(c / 13)]++);
    const s = lengths.indexOf(Math.max(...lengths)), suit = hand.filter((c) => Math.floor(c / 13) === s);
    return suit.find((c) => c % 13 === 0) ?? cheapest(suit);
  }
  let best = 0; for (let i = 1; i < cards.length; i++) if (E.Core.Card.compare(cards[best], cards[i], g.contract.strain) < 0) best = i;
  if (g.trick[best].seat % 2 === g.current % 2) return cheapest(legal);
  const winning = legal.filter((c) => E.Core.Card.compare(cards[best], E.Core.Card.numberToCard(c), g.contract.strain) < 0);
  return cheapest(winning.length ? winning : legal);
}
function benchmark(boards = 32) {
  let netScore = 0, trickGain = 0, ahead = 0, tied = 0; const durations = [];
  const start = performance.now();
  for (let seed = 1; seed <= boards; seed++) {
    const results = [];
    for (const newPair of [0, 1]) {
      const g = E.createGame(["N", "E", "S", "W"], seed, rng(seed * 731)), contract = ["3NT", "4S", "4H", "2S"][seed % 4];
      for (const call of [contract, "P", "P", "P"]) E.act(g, E.controller(g), { type: "call", call });
      while (g.phase !== "over") {
        if (g.phase === "trick") { E.advanceTrick(g); continue; }
        const actor = E.controller(g), at = performance.now();
        const action = actor % 2 === newPair ? E.chooseBotAction(g, actor) : { type: "play", card: previousCard(g) };
        if (actor % 2 === newPair) durations.push(performance.now() - at);
        E.act(g, actor, action);
      }
      results.push({ score: g.result.score, tricks: g.won[0] });
    }
    const delta = results[0].score - results[1].score; netScore += delta; trickGain += results[0].tricks - results[1].tricks;
    if (delta > 0) ahead++; if (!delta) tied++;
  }
  durations.sort((a, b) => a - b);
  return { pairedDeals: boards, games: boards * 2, ahead, tied, behind: boards - ahead - tied, netScore, trickGain,
    averageMs: +(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(2), p95Ms: +durations[Math.floor(durations.length * .95)].toFixed(2), maxMs: +durations.at(-1).toFixed(2), elapsedSeconds: +((performance.now() - start) / 1000).toFixed(2) };
}
if (require.main === module) console.log(JSON.stringify(benchmark(Number(process.argv[2]) || 32), null, 2));
module.exports = { benchmark, previousCard };
