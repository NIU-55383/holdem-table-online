"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./million-engine");
const D = require("./million-data");
const zero = () => 0;
function random(seed) { return () => ((seed = Math.imul(seed, 1664525) + 1013904223 >>> 0) / 4294967296); }
function fixture(roles) {
  const g = E.createGame(roles.map((_, i) => `P${i}`), { edition: "2024" }, zero);
  g.reserve += g.loot - 1000; g.lootPool = g.loot = 1000; g.bonusRole = null;
  roles.forEach((r, i) => E.act(g, i, { type: "choose", roles: Array.isArray(r) ? r : [r] }, zero));
  while (g.phase === "claims") E.act(g, g.claimActor, { type: "claim", roles: g.players[g.claimActor].slots.map(s => s.role) });
  return g;
}
function vote(g) {
  E.act(g, g.leader, { type: "callVote" });
  while (g.phase === "negotiation" && g.vote.open) E.act(g, E.requiredActors(g)[0], { type: "vote", yes: true });
}
function conserved(g) {
  assert.equal(g.players.reduce((s, p) => s + p.cash, 0) + g.publicFund + g.lootPool + g.reserve, g.players.length * 1000);
  assert.ok(g.players.every(p => Number.isSafeInteger(p.cash) && p.cash >= 0));
  assert.ok(g.lootPool >= 0 && g.publicFund >= 0);
}
test("2024 player counts, role sets, money and separate edition options", () => {
  for (let n = 3; n <= 9; n++) {
    const g = E.createGame(Array.from({ length: n }, (_, i) => `P${i}`), { edition: "2024" }, zero);
    assert.equal(g.version, 3); assert.equal(g.maxRounds, 5); assert.equal(g.ante, 200);
    assert.equal(g.slotsPerPlayer, n === 3 ? 2 : 1); assert.equal(g.players[0].cash, 1000);
    assert.deepEqual(g.availableRoles, D.rolesForCount(n, "2024")); conserved(g);
  }
  assert.deepEqual(D.rolesForCount(4, "2024"), ["acrobat", "brute", "driver"]);
  assert.ok(D.rolesForCount(5, "2024").includes("mentalist"));
  assert.ok(!D.rolesForCount(6, "2024").includes("brain"));
  assert.equal(D.rolesForCount(7, "2024").length, 6);
  assert.throws(() => E.createGame(["A", "B", "C"], { edition: "2024", noRepeat: true }));
  assert.throws(() => E.createGame(Array(9).fill("P")));
});
test("declarations may bluff, are clockwise, and do not expose ownership", () => {
  const g = E.createGame(["A", "B", "C", "D"], { edition: "2024" }, zero);
  ["acrobat", "brute", "driver", "brute"].forEach((role, i) => E.act(g, i, { type: "choose", roles: [role] }, zero));
  assert.equal(g.phase, "claims");
  assert.throws(() => E.act(g, 1, { type: "claim", roles: ["driver"] }));
  E.act(g, 0, { type: "claim", roles: ["driver"] });
  assert.deepEqual(g.claims[0], ["driver"]); assert.equal(g.players[0].slots[0].role, "acrobat");
  const view = E.publicGame(g, 1);
  assert.equal(view.players[0].slots[0].role, null); assert.deepEqual(view.claims[0], ["driver"]);
  assert.equal(view.hiddenCard, undefined); assert.equal(view.heist, undefined);
});
test("half of all players suffice; withdrawn players vote; failed vote returns to talks", () => {
  const g = fixture(["acrobat", "brute", "driver", "driver"]);
  E.act(g, 3, { type: "withdraw", slot: 0 });
  assert.equal(g.players[3].cash, 1000); conserved(g);
  assert.throws(() => E.act(g, 1, { type: "callVote" }));
  E.act(g, 0, { type: "callVote" });
  for (const i of [1, 2, 3]) E.act(g, i, { type: "vote", yes: false });
  assert.equal(g.vote.open, false); assert.equal(g.phase, "negotiation");
  E.act(g, 0, { type: "callVote" }); E.act(g, 3, { type: "vote", yes: true });
  assert.equal(g.phase, "results"); conserved(g);
});
test("role order, duplicate Driver, Mentalist and upward rounding", () => {
  const g = fixture(["acrobat", "brute", "mentalist", "driver", "driver"]);
  vote(g); assert.equal(g.phase, "mentalist");
  assert.deepEqual(g.mentalist.targets.map(t => t.role), ["acrobat", "brute"]);
  assert.throws(() => E.act(g, 2, { type: "steal", target: 3, slot: 0 }));
  E.act(g, 2, { type: "steal", target: 0, slot: 0 });
  assert.equal(g.phase, "results");
  assert.deepEqual(g.players.map(p => p.cash), [1600, 1500, 1500, 800, 800]);
  assert.equal(g.result.topUp, 200); assert.equal(g.result.share, 500);
  assert.equal(g.players[3].slots[0].status, "duplicate"); conserved(g);
});
test("Tech elimination still pays every Brute, including duplicates", () => {
  const g = fixture(["tech", "acrobat", "brute", "mentalist", "driver", "brute"]);
  vote(g); assert.equal(g.phase, "snitch");
  E.act(g, 0, { type: "snitch", role: "acrobat" });
  assert.equal(g.phase, "mentalist");
  assert.deepEqual(g.mentalist.targets.map(t => t.role), ["tech"]);
  E.act(g, 3, { type: "steal", target: 0, slot: 0 });
  assert.deepEqual(g.players.map(p => p.cash), [1100, 800, 1000, 1500, 1600, 1000]);
  assert.equal(g.logs.filter(l => l.type === "brute-take").length, 2); conserved(g);
  const b = fixture(["tech", "acrobat", "brute", "mentalist", "driver", "driver"]);
  vote(b); E.act(b, 0, { type: "snitch", role: "brute" });
  assert.equal(b.players[2].slots[0].status, "eliminated"); assert.equal(b.players[2].cash, 1000);
  conserved(b);
});
test("Brain adds printed loot again and bonus goes to the shared pot", () => {
  const g = fixture(["brain", "brute", "driver", "acrobat", "tech", "mentalist", "driver"]);
  g.bonusRole = "brain";
  for (const i of [1, 2, 3, 4, 5, 6]) E.act(g, i, { type: "withdraw", slot: 0 });
  vote(g);
  assert.equal(g.result.share, 2300); assert.equal(g.players[0].cash, 3100);
  assert.equal(g.logs.find(l => l.type === "pool-bonus").amount, 100); conserved(g);
});
test("lone Tech loses five million, cash cannot go negative", () => {
  const g = fixture(["tech", "acrobat", "brute", "mentalist", "driver", "brute"]);
  for (let i = 1; i < 6; i++) E.act(g, i, { type: "withdraw", slot: 0 });
  vote(g); E.act(g, 0, { type: "snitch", role: g.snitch.options[0] });
  assert.equal(g.players[0].cash, 300); assert.equal(g.result.penalty, 500); assert.equal(g.result.share, 0); conserved(g);
});
test("three players use two distinct roles and self-theft changes no wealth", () => {
  const g = fixture([["mentalist", "acrobat"], ["brute", "driver"], ["tech", "brute"]]);
  E.act(g, 1, { type: "withdraw", slot: 0 }); E.act(g, 2, { type: "withdraw", slot: 1 });
  vote(g); E.act(g, 2, { type: "snitch", role: "brute" });
  const cash = g.players[0].cash;
  E.act(g, 0, { type: "steal", target: 0, slot: 1 });
  assert.equal(g.logs.find(l => l.type === "mentalist-steal").amount, 0);
  assert.equal(g.players[0].cash, cash + 2 * g.result.share); conserved(g);
});
test("next leader is poorest and only five rounds are played", () => {
  const g = fixture(["acrobat", "brute", "driver", "driver"]); vote(g);
  const poorest = Math.min(...g.players.map(p => p.cash));
  assert.equal(g.players[g.nextLeader].cash, poorest);
  const next = g.nextLeader; E.act(g, g.leader, { type: "next" }, zero);
  assert.equal(g.leader, next); assert.equal(g.round, 2); conserved(g);
});
test("210 seeded complete 2024 games terminate and conserve all cash", () => {
  for (let n = 3; n <= 9; n++) for (let seed = 1; seed <= 30; seed++) {
    const rng = random(seed * 101 + n), g = E.createGame(Array.from({ length: n }, (_, i) => `P${i}`), { edition: "2024" }, rng);
    let turns = 0;
    while (g.phase !== "over") {
      assert.ok(++turns < 500, `${n}:${seed}:${g.phase}`);
      const offers = g.offers.filter(o => o.status === "pending").map(o => o.responder);
      const actors = [...new Set([...offers, ...E.requiredActors(g)])];
      const actor = actors[Math.floor(rng() * actors.length)];
      const action = E.chooseBotAction(g, actor, rng);
      assert.ok(action, `${n}:${seed}:${g.phase}:${actor}`);
      E.act(g, actor, action, rng); conserved(g);
      const view = E.publicGame(g, -1);
      if (["planning", "claims", "negotiation"].includes(g.phase)) for (const p of view.players) for (const s of p.slots) assert.equal(s.role, null);
    }
    assert.equal(g.winners.length, 1); assert.ok(g.round <= 5);
  }
});
