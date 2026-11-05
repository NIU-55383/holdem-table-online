"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./million-engine"), Bot = require("./million-bot");
function fixture() {
  const g = E.createGame(["A", "B", "C", "D", "E", "F"], { edition: "2024" }, () => 0);
  ["tech", "acrobat", "brute", "mentalist", "driver", "brute"].forEach((r, i) => E.act(g, i, { type: "choose", roles: [r] }, () => 0));
  return g;
}
test("bots make both truthful and false claims without changing their selected cards", () => {
  const g = fixture(), before = JSON.stringify(g);
  const truth = E.chooseBotAction(g, 0, () => .99);
  const bluff = E.chooseBotAction(g, 0, () => 0);
  assert.deepEqual(truth.roles, ["tech"]); assert.notDeepEqual(bluff.roles, ["tech"]);
  assert.equal(JSON.stringify(g), before);
});
test("speech follows the announced identity, not a secret debug label", () => {
  const g = fixture();
  while (g.phase === "claims") E.act(g, g.claimActor, { type: "claim", roles: ["driver"] });
  const text = E.chooseBotSpeech(g, 0, () => .99);
  assert.match(text, /我是司机/); assert.match(text, /I am Driver/);
  assert.doesNotMatch(text, /Tech|技术员|truth|bluff/);
  E.act(g, 0, { type: "withdraw", slot: 0 });
  assert.equal(E.chooseBotSpeech(g, 0), null);
});
test("decisions use only public declarations and authorized private views", () => {
  const g = fixture();
  while (g.phase === "claims") E.act(g, g.claimActor, { type: "claim", roles: ["brute"] });
  const altered = structuredClone(g);
  altered.players[1].slots[0].role = "driver"; altered.hiddenCard = "tech";
  assert.deepEqual(E.publicGame(g, 0), E.publicGame(altered, 0));
  assert.deepEqual(E.chooseBotAction(g, 0, () => .5), E.chooseBotAction(altered, 0, () => .5));
  assert.equal(E.chooseBotSpeech(g, 0, () => .5), E.chooseBotSpeech(altered, 0, () => .5));
});
test("Mentalist prefers an opponent with money to stealing from itself", () => {
  const g = E.publicGame(fixture(), 3);
  g.phase = "mentalist"; g.mentalist = { actor: 3, targets: [{ owner: 3, slot: 0 }, { owner: 1, slot: 0 }, { owner: 2, slot: 0 }] };
  g.players[1].cash = 0; g.players[2].cash = 900;
  assert.deepEqual(Bot.choose(g, 3, () => .5), { type: "steal", target: 2, slot: 0 });
});
test("choice weights respond to previous competition and selected role bonuses", () => {
  const g = E.createGame(["A", "B", "C", "D", "E", "F"], { edition: "2024" }, () => 0);
  g.bonusRole = "driver";
  const a = E.chooseBotAction(g, 0, () => .5);
  g.history = [{ round: 0, leader: 0, loot: 1000, ante: 200, bonusRole: null, revealedCards: [], namedRole: null,
    totalLoot: 0, share: 0, remainder: 0, penalty: 0, participants: [], splitting: [], logs: [], privateIntel: g.intel,
    players: g.players.map(p => ({ name: p.name, cash: p.cash, delta: 0, slots: [{ slot: 0, role: a.roles[0] }] })) }];
  const b = E.chooseBotAction(g, 0, () => .5);
  assert.notDeepEqual(a.roles, b.roles);
});
