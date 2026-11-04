"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const Data = require("./million-data");
const Engine = require("./million-engine");
const { createGame, act, publicGame, requiredActors, chooseBotAction } = Engine;
const zero = () => 0;
const names = count => Array.from({ length: count }, (_, i) => `Player ${i}`);
function random(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 0x100000000; };
}
function unchanged(g, actor, action, rng) {
  const before = JSON.stringify(g);
  assert.throws(() => act(g, actor, action, rng));
  assert.equal(JSON.stringify(g), before, "rejected actions must not mutate any state");
}
function fixture(roles, options = {}) {
  const g = createGame(names(roles.length), options.settings || {}, zero);
  g.loot = options.loot === undefined ? 800 : options.loot;
  g.ante = options.ante === undefined ? 100 : options.ante;
  g.bonusRole = options.bonus || null;
  if (options.cash) options.cash.forEach((cash, i) => { g.players[i].cash = cash; g.players[i].roundStartCash = cash; });
  roles.forEach((role, i) => act(g, i, { type: "choose", roles: Array.isArray(role) ? role : [role] }, zero));
  for (const entry of options.withdraw || []) {
    const [owner, slot] = Array.isArray(entry) ? entry : [entry, 0];
    act(g, owner, { type: "withdraw", slot });
  }
  return g;
}
function resolve(g, role) {
  while (g.phase === "negotiation") {
    const actor = requiredActors(g)[0];
    assert.notEqual(actor, undefined);
    act(g, actor, { type: "ready", ready: true });
  }
  if (g.phase === "snitch") act(g, g.snitch.actor, { type: "snitch", role: role || g.snitch.options[0] });
  assert.ok(["results", "over"].includes(g.phase));
  return g;
}
function money(g) { return g.players.map(p => p.cash); }
function conserved(g, expected = g.players.length * 500) {
  assert.equal(money(g).reduce((a, b) => a + b, 0) + g.publicFund + g.reserve, expected);
  assert.ok(g.publicFund >= 0);
  for (const p of g.players) assert.ok(Number.isSafeInteger(p.cash) && p.cash >= 0);
}
const seven = ["driver", "brute", "crook", "mastermind", "snitch", "driver", "crook"];

test("role metadata, exact colors, bilingual labels and player-count variants", () => {
  assert.deepEqual(Data.ROLE_IDS, ["driver", "brute", "crook", "snitch", "mastermind"]);
  assert.deepEqual(Object.values(Data.ROLES).map(r => r.color), ["#5ccf7f", "#ef6b6b", "#4fb3e8", "#b48ef2", "#e6b450"]);
  assert.deepEqual(Object.values(Data.ROLES).map(r => r.en), ["Driver", "Brute", "Crook", "Snitch", "Mastermind"]);
  assert.deepEqual(Object.values(Data.ROLES).map(r => r.zh), ["司机", "暴徒", "恶棍", "告密者", "谋士"]);
  assert.deepEqual(Data.TITLE, { zh: "百万美金", en: "Millions of Dollars" });
  for (const role of Object.values(Data.ROLES)) {
    assert.ok(role.description.zh && role.description.en);
    assert.equal(role.name, role.zh);
    assert.equal(role.english, role.en);
  }
  for (let n = 3; n <= 8; n++) {
    const g = createGame(names(n), {}, zero);
    assert.equal(g.slotsPerPlayer, n === 3 ? 2 : 1);
    assert.equal(g.availableRoles.length, n === 3 || n >= 7 ? 5 : n >= 5 ? 4 : 3);
    assert.deepEqual(g.settings, { bruteShares: true, noRepeat: false });
    assert.deepEqual(money(g), Array(n).fill(500));
    assert.equal(g.maxRounds, 8);
    assert.equal(g.revision, 0);
    assert.deepEqual(requiredActors(g), Array.from({ length: n }, (_, i) => i));
  }
});

test("invalid setup, settings, actor, fields and randomness are rejected", () => {
  for (const count of [0, 2, 9]) assert.throws(() => createGame(names(count)));
  for (const settings of [null, [], { noRepeat: 1 }, { bruteShares: "false" }, { rounds: 2 }]) assert.throws(() => createGame(names(4), settings));
  for (const bad of ["", " ", 7, "x".repeat(41)]) assert.throws(() => createGame([bad, "B", "C"]));
  for (const rng of [7, () => 1, () => -1, () => NaN]) assert.throws(() => createGame(names(4), {}, rng));
  const g = createGame(names(4), {}, zero);
  for (const actor of [-1, 4, "0", null]) unchanged(g, actor, { type: "choose", roles: ["driver"] });
  for (const action of [null, [], {}, { type: "bogus" }, { type: "__proto__" }, { type: "choose", roles: ["driver"], extra: 1 }, { type: "ready", ready: true }]) unchanged(g, 0, action);
});

test("random rounds use the exact loot, ante and bonus domains", () => {
  const observed = new Set(), bonuses = new Set(), leaders = new Set();
  for (let seed = 1; seed <= 250; seed++) {
    const g = createGame(names(8), {}, random(seed * 7919));
    assert.ok([800, 900, 1000, 1100, 1200].includes(g.loot));
    assert.ok([100, 200].includes(g.ante));
    if (g.loot === 800) assert.equal(g.ante, 100);
    if (g.loot === 1200) assert.equal(g.ante, 200);
    observed.add(`${g.loot}:${g.ante}`);
    bonuses.add(g.bonusRole);
    leaders.add(g.leader);
  }
  assert.equal(observed.size, 8);
  assert.equal(bonuses.size, 6);
  assert.equal(leaders.size, 8);
});

test("three-player choices are atomic, distinct and locked; all five roles available", () => {
  const g = createGame(names(3), {}, zero);
  for (const roles of [["driver"], ["brute", "brute"], ["driver", "unknown"], ["driver", "crook", "brute"]]) unchanged(g, 0, { type: "choose", roles });
  const returned = act(g, 0, { type: "choose", roles: ["mastermind", "snitch"] });
  assert.equal(returned, g);
  assert.equal(g.players[0].cash, 300);
  assert.equal(g.revision, 1);
  unchanged(g, 0, { type: "choose", roles: ["driver", "brute"] });
  assert.equal(publicGame(g, 1).players[0].slots[0].role, null);
  assert.equal(publicGame(g, 0).players[0].slots[0].role, "mastermind");
  const four = createGame(names(4), {}, zero);
  unchanged(four, 0, { type: "choose", roles: ["snitch"] });
});

test("last chooser random failure and next-round random failure roll back completely", () => {
  const g = createGame(names(4), {}, zero);
  for (let i = 0; i < 3; i++) act(g, i, { type: "choose", roles: ["driver"] });
  unchanged(g, 3, { type: "choose", roles: ["driver"] }, () => 1);
  act(g, 3, { type: "choose", roles: ["driver"] }, zero);
  resolve(g);
  unchanged(g, g.leader, { type: "next" }, () => -1);
});

test("full character ante is refunded, including reserve-funded shortfalls", () => {
  const g = fixture([["driver", "brute"], ["crook", "snitch"], ["driver", "mastermind"]], { ante: 200, cash: [250, 0, 500] });
  assert.deepEqual(g.players[0].slots.map(s => s.paidAnte), [200, 50]);
  assert.deepEqual(g.players[1].slots.map(s => s.paidAnte), [0, 0]);
  assert.equal(g.reserve, -550);
  assert.equal(g.publicFund, 1200);
  act(g, 0, { type: "withdraw", slot: 1 });
  assert.equal(g.players[0].cash, 200);
  act(g, 0, { type: "withdraw", slot: 0 });
  assert.equal(g.players[0].cash, 400);
  act(g, 1, { type: "withdraw", slot: 0 });
  assert.equal(g.players[1].cash, 200);
  conserved(g, 750);
});

test("center cards contain every selection except one, and never change after withdrawals", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  assert.deepEqual([...g.revealedCards, g.hiddenCard].sort(), ["driver", "brute", "crook", "crook"].sort());
  assert.equal(g.revealedCards.length, 3);
  const before = g.revealedCards.slice();
  act(g, 1, { type: "withdraw", slot: 0 });
  assert.deepEqual(g.revealedCards, before);
  unchanged(g, 1, { type: "withdraw", slot: 0 });
  assert.equal(publicGame(g, 0).players[1].slots[0].role, null);
});

test("ready is simultaneous and cancellable; only remaining players must be ready", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  act(g, 0, { type: "ready", ready: true });
  unchanged(g, 0, { type: "ready", ready: true });
  assert.deepEqual(requiredActors(g), [1, 2, 3]);
  act(g, 0, { type: "ready", ready: false });
  assert.deepEqual(requiredActors(g), [0, 1, 2, 3]);
  act(g, 3, { type: "withdraw", slot: 0 });
  unchanged(g, 3, { type: "ready", ready: true });
  resolve(g);
  assert.equal(g.phase, "results");
  assert.deepEqual(requiredActors(g), [g.leader]);
  assert.deepEqual(chooseBotAction(g, g.leader), { type: "next" });
});

test("all withdrawing refunds everyone and auto-resolves without a deadlock", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  for (let i = 0; i < 4; i++) act(g, i, { type: "withdraw", slot: 0 });
  assert.equal(g.phase, "results");
  assert.deepEqual(money(g), [500, 500, 500, 500]);
  assert.equal(g.result.totalLoot, 0);
  assert.equal(g.publicFund, 0);
  conserved(g);
});

test("duplicate normal roles forfeit antes; duplicate Brutes always refund", () => {
  for (const role of ["driver", "crook"]) {
    const g = resolve(fixture(Array(4).fill(role)));
    assert.deepEqual(money(g), [400, 400, 400, 400]);
    assert.equal(g.publicFund, 0);
    assert.equal(g.reserve, 400);
    assert.ok(g.players.every(p => p.slots[0].status === "duplicate"));
    assert.equal(g.result.share, 0);
    conserved(g);
  }
  const brutes = resolve(fixture(Array(4).fill("brute")));
  assert.deepEqual(money(brutes), [500, 500, 500, 500]);
  assert.ok(brutes.players.every(p => p.pendingThreats === 0));
  const masterminds = resolve(fixture(["mastermind", "mastermind", "driver", "driver", "crook", "crook", "crook"]));
  assert.equal(masterminds.result.totalLoot, 0);
  assert.ok(masterminds.players.every(p => p.cash === 400));
});

test("unique Driver fees and Brute future threat, including toggle-off sharing", () => {
  const g = resolve(fixture(["driver", "brute", "crook", "crook"]));
  assert.deepEqual(money(g), [1000, 800, 400, 400]);
  assert.equal(g.players[1].threats, 0);
  assert.equal(g.players[1].pendingThreats, 1);
  assert.equal(g.result.share, 400);
  const oldLeader = g.leader;
  unchanged(g, (oldLeader + 1) % 4, { type: "next" });
  act(g, oldLeader, { type: "next" }, zero);
  assert.equal(g.round, 2);
  assert.equal(g.leader, (oldLeader + 1) % 4);
  assert.equal(g.players[1].threats, 1);
  assert.equal(g.players[1].pendingThreats, 0);
  const noShare = resolve(fixture(["driver", "brute", "crook", "crook"], { settings: { bruteShares: false }, bonus: "brute" }));
  assert.deepEqual(money(noShare), [1300, 500, 400, 400]);
  assert.equal(noShare.players[1].slots[0].status, "exited");
  assert.equal(noShare.players[1].pendingThreats, 1);
  conserved(noShare);
});

test("Crook steals from all available Brute funds, not just the current share", () => {
  const g = resolve(fixture(["driver", "brute", "crook", "driver"]));
  assert.deepEqual(money(g), [400, 700, 1100, 400]);
  const oldCash = resolve(fixture(seven, { loot: 0, withdraw: [3, 4, 5, 6] }));
  assert.equal(oldCash.players[1].cash, 200);
  assert.equal(oldCash.players[2].cash, 600);
  const capped = resolve(fixture(seven, { loot: 0, ante: 0, cash: [0, 80, 0, 0, 0, 0, 0], withdraw: [3, 4, 5, 6] }));
  assert.deepEqual(money(capped).slice(0, 3), [80, 0, 0]);
  conserved(capped, 80);
});

test("Mastermind adds 200, shares round down by 100, remainder returns to reserve, bonus comes from reserve", () => {
  const g = resolve(fixture(seven, { loot: 1200, bonus: "brute", withdraw: [4, 5, 6] }));
  assert.equal(g.result.totalLoot, 1400);
  assert.equal(g.result.share, 300);
  assert.equal(g.result.remainder, 200);
  assert.deepEqual(money(g), [1100, 600, 900, 700, 500, 500, 500]);
  assert.equal(g.publicFund, 0);
  assert.equal(g.reserve, -1300);
  conserved(g);
  const removedBonus = resolve(fixture(seven, { bonus: "mastermind", withdraw: [3, 4, 5, 6] }));
  assert.equal(removedBonus.players[3].cash, 500);
  assert.equal(removedBonus.result.totalLoot, 800);
});

test("every eligible unique role receives its bonus, and Crook theft caps at remaining funds", () => {
  for (const role of Data.ROLE_IDS) {
    const target = role === "mastermind" ? "crook" : "mastermind";
    const baseline = resolve(fixture(seven, { withdraw: [5, 6] }), target);
    const bonus = resolve(fixture(seven, { withdraw: [5, 6], bonus: role }), target);
    const owner = seven.indexOf(role);
    assert.equal(bonus.players[owner].cash, baseline.players[owner].cash + 100);
    assert.equal(bonus.reserve, baseline.reserve - 100);
    conserved(bonus);
  }
  const capped = resolve(fixture(seven, { cash: Array(7).fill(0), ante: 0, withdraw: [5, 6] }), "mastermind");
  assert.deepEqual(money(capped), [500, 0, 200, 0, 100, 0, 0]);
  assert.equal(capped.logs.find(e => e.type === "crook-steal").amount, 100);
  conserved(capped, 0);
});

test("same-owner roles receive two shares but do not transfer fees or stolen money to themselves", () => {
  const g = resolve(fixture([["driver", "crook"], ["brute", "snitch"], ["mastermind", "driver"]], { withdraw: [[1, 1], [2, 0], [2, 1]] }));
  assert.deepEqual(money(g), [1200, 400, 500]);
  assert.equal(g.result.share, 200);
  const selfFee = g.logs.find(e => e.type === "driver-fee" && e.from === e.to);
  assert.equal(selfFee.amount, 0);
  conserved(g);
  const selfSteal = resolve(fixture([["brute", "crook"], ["driver", "snitch"], ["mastermind", "driver"]], { withdraw: [[1, 0], [1, 1], [2, 0], [2, 1]] }));
  assert.equal(selfSteal.players[0].cash, 1300);
  assert.equal(selfSteal.logs.find(e => e.type === "crook-steal").amount, 0);
  conserved(selfSteal);
});

test("unique Snitch resolves first, uses public options, and eliminated Brute alone refunds", () => {
  for (const target of ["driver", "brute", "crook", "mastermind"]) {
    const g = fixture(seven, { withdraw: [5, 6] });
    while (g.phase === "negotiation") act(g, requiredActors(g)[0], { type: "ready", ready: true });
    assert.equal(g.phase, "snitch");
    assert.equal(g.snitch.player, 4);
    assert.equal(g.players[4].cash, 500);
    assert.equal(publicGame(g, 0).players[4].slots[0].role, "snitch");
    assert.deepEqual(new Set(g.snitch.options), new Set(g.revealedCards.filter(r => r !== "snitch")));
    unchanged(g, 0, { type: "snitch", role: target });
    unchanged(g, 4, { type: "snitch", role: "snitch" });
    act(g, 4, { type: "snitch", role: target });
    const index = seven.indexOf(target);
    assert.equal(g.players[index].cash, target === "brute" ? 500 : 400);
    assert.equal(g.players[index].slots[0].status, "eliminated");
    if (target === "brute") assert.equal(g.players[index].pendingThreats, 0);
    assert.ok(g.result.participants.some(s => s.role === "snitch"));
    conserved(g);
  }
});

test("Snitch cannot name a role absent from public cards, but may name a withdrawn role", () => {
  const g = fixture(["mastermind", "snitch", "driver", "driver", "brute", "brute", "crook"], { withdraw: [2, 3, 4, 5, 6] });
  assert.equal(g.hiddenCard, "mastermind");
  while (g.phase === "negotiation") act(g, requiredActors(g)[0], { type: "ready", ready: true });
  assert.ok(!g.snitch.options.includes("mastermind"));
  unchanged(g, 1, { type: "snitch", role: "mastermind" });
  act(g, 1, { type: "snitch", role: "brute" });
  assert.equal(g.players[0].slots[0].status, "sharing");
});

test("duplicate Snitches lose antes and do not invoke a naming phase", () => {
  const g = resolve(fixture(["snitch", "snitch", "snitch", "snitch", "snitch"]));
  assert.equal(g.snitch, null);
  assert.deepEqual(money(g), [400, 400, 400, 400, 400]);
  assert.ok(g.players.every(p => p.slots[0].status === "duplicate"));
});

test("sole Snitch pays a balance-capped 300 and gets neither loot nor bonus", () => {
  for (const starting of [500, 150, 0]) {
    const g = resolve(fixture(["snitch", "driver", "driver", "driver", "driver"], { cash: [starting, 500, 500, 500, 500], bonus: "snitch" }), "driver");
    assert.equal(g.players[0].cash, Math.max(0, starting - 300));
    assert.equal(g.result.penalty, Math.min(300, Math.max(starting, g.ante)));
    assert.equal(g.result.totalLoot, 0);
    assert.deepEqual(g.result.splitting, []);
    assert.deepEqual(g.winners, []);
    conserved(g, starting + 2000);
  }
  const noBruteShare = resolve(fixture(["snitch", "brute", "driver", "driver", "driver"], { settings: { bruteShares: false } }), "driver");
  assert.equal(noBruteShare.players[0].cash, 200);
  assert.equal(noBruteShare.players[1].cash, 500);
});

test("unique Snitch with no public non-Snitch options resolves automatically", () => {
  const g = fixture(["snitch", "snitch", "snitch", "snitch", "snitch"], { withdraw: [1, 2, 3, 4] });
  act(g, 0, { type: "ready", ready: true });
  assert.equal(g.phase, "results");
  assert.deepEqual(g.snitch.options, []);
  assert.equal(g.players[0].cash, 200);
});

test("early win applies only to actual splitters and highest qualifying cash wins", () => {
  const g = resolve(fixture(["driver", "brute", "crook", "crook"], { cash: [1700, 2300, 2600, 500], withdraw: [2] }));
  assert.equal(g.phase, "over");
  assert.deepEqual(g.winners, [1]);
  assert.ok(!g.winners.includes(2));
  assert.equal(g.winReason, "target");
  assert.deepEqual(requiredActors(g), []);
  unchanged(g, g.leader, { type: "next" });
  const onlyRichWithdrawn = resolve(fixture(["driver", "brute", "crook", "crook"], { cash: [500, 500, 2600, 500], withdraw: [2] }));
  assert.equal(onlyRichWithdrawn.phase, "results");
});

test("eighth-round qualifying splitter outranks a richer withdrawn player", () => {
  const g = fixture(["driver", "brute", "crook", "crook"], { cash: [1200, 500, 2100, 500], withdraw: [1, 2, 3] });
  g.round = 8;
  resolve(g);
  assert.equal(g.players[0].cash, 2000);
  assert.equal(g.players[2].cash, 2100);
  assert.deepEqual(g.winners, [0]);
  assert.equal(g.winReason, "target");
});

test("round eight falls back to globally richest with co-winners; early ties also co-win", () => {
  const g = fixture(["driver", "driver", "driver", "driver"], { cash: [700, 700, 500, 500] });
  g.round = 8;
  resolve(g);
  assert.deepEqual(g.winners, [0, 1]);
  assert.equal(g.winReason, "round-limit");
  const ties = resolve(fixture(["driver", "brute", "crook", "crook"], { cash: [1500, 1700, 500, 500] }));
  assert.deepEqual(ties.winners, [0, 1]);
  assert.equal(ties.winReason, "target");
});

test("direct transfers validate integer balance and identity before changing anything", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  for (const amount of [0, -1, 1, 10, 50, 150, 1.5, "100", NaN, Infinity, Number.MAX_SAFE_INTEGER, 401]) unchanged(g, 0, { type: "transfer", to: 1, amount });
  for (const to of [0, 4, -1, "1"]) unchanged(g, 0, { type: "transfer", to, amount: 10 });
  act(g, 0, { type: "transfer", to: 1, amount: 400, revision: g.revision, round: g.round });
  assert.deepEqual(money(g), [0, 800, 400, 400]);
  unchanged(g, 0, { type: "transfer", to: 1, amount: 1 });
  unchanged(g, 1, { type: "transfer", to: 0, amount: 1, revision: g.revision - 1 });
  unchanged(g, 1, { type: "transfer", to: 0, amount: 1, round: 0 });
  conserved(g);
});

test("replayed revision-tagged transfers and double-accepted competing offers never pay twice", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  const payment = { type: "transfer", to: 1, amount: 100, revision: g.revision };
  act(g, 0, payment);
  unchanged(g, 0, payment);
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  act(g, 2, { type: "offer", payer: 2, quitter: 1, slot: 0, amount: 200 });
  const [first, second] = g.offers.map(o => o.id);
  act(g, 1, { type: "respond", offerId: first, accept: true });
  unchanged(g, 1, { type: "respond", offerId: second, accept: true });
  unchanged(g, 1, { type: "respond", offerId: first, accept: true });
  assert.equal(g.players[2].cash, 400);
  assert.equal(g.players[1].cash, 700);
  conserved(g);
});

test("outstanding offers expire on heist entry and bounded offers cannot grow without limit", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  g.players[0].cash = 3000;
  for (let amount = 100; amount <= 2400; amount += 100) act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount });
  unchanged(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 2500 });
  resolve(g);
  assert.ok(g.offers.every(o => o.status === "expired"));
  unchanged(g, 1, { type: "respond", offerId: g.offers[0].id, accept: true });
});

test("binding offers transfer and withdraw atomically, keep payment, and refund full ante", () => {
  const g = fixture(["driver", "brute", "crook", "crook"], { cash: [500, 50, 500, 500] });
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  const o = g.offers[0];
  assert.equal(o.responder, 1);
  unchanged(g, 0, { type: "respond", offerId: o.id, accept: true });
  unchanged(g, 2, { type: "respond", offerId: o.id, accept: true });
  act(g, 1, { type: "respond", offerId: o.id, accept: true });
  assert.equal(g.offers[0].status, "accepted");
  assert.equal(g.players[1].cash, 200);
  assert.equal(g.players[0].cash, 300);
  assert.equal(g.players[1].slots[0].withdrawn, true);
  unchanged(g, 1, { type: "respond", offerId: o.id, accept: true });
  unchanged(g, 1, { type: "withdraw", slot: 0 });
  conserved(g, 1550);
});

test("quitter can propose; third parties cannot; cancellation and rejection have distinct authority", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  unchanged(g, 2, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  unchanged(g, 0, { type: "offer", payer: 0, quitter: 0, slot: 0, amount: 100 });
  act(g, 1, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  let id = g.offers.at(-1).id;
  assert.equal(g.offers.at(-1).responder, 0);
  unchanged(g, 0, { type: "cancel", offerId: id });
  unchanged(g, 1, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  act(g, 0, { type: "respond", offerId: id, accept: false });
  assert.equal(g.offers.at(-1).status, "rejected");
  act(g, 1, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  id = g.offers.at(-1).id;
  act(g, 1, { type: "cancel", offerId: id });
  assert.equal(g.offers.at(-1).status, "cancelled");
  unchanged(g, 0, { type: "respond", offerId: id, accept: true });
});

test("offers go stale on withdrawn slots, depleted balances and rounds; no double execution", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 300 });
  const first = g.offers[0].id;
  act(g, 0, { type: "transfer", to: 2, amount: 200 });
  assert.equal(g.offers[0].status, "stale");
  unchanged(g, 1, { type: "respond", offerId: first, accept: true });
  act(g, 2, { type: "offer", payer: 2, quitter: 1, slot: 0, amount: 100 });
  const second = g.offers[1].id;
  act(g, 1, { type: "withdraw", slot: 0 });
  assert.equal(g.offers[1].status, "stale");
  unchanged(g, 1, { type: "respond", offerId: second, accept: true });
  resolve(g);
  act(g, g.leader, { type: "next" }, zero);
  for (let i = 0; i < 4; i++) act(g, i, { type: "choose", roles: ["driver"] }, zero);
  unchanged(g, 1, { type: "respond", offerId: first, accept: true });
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  assert.notEqual(g.offers[0].id, first);
});

test("fully withdrawn actors cannot initiate economic actions; partial withdrawal still can", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  g.players[0].threats = 1;
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  act(g, 0, { type: "withdraw", slot: 0 });
  assert.equal(g.offers[0].status, "stale");
  for (const action of [{ type: "transfer", to: 1, amount: 100 }, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 }]) unchanged(g, 0, action);
  act(g, 0, { type: "threat", target: 1 });
  assert.equal(g.players[0].threats, 0);
  unchanged(g, 1, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 1 });
  const two = fixture([["driver", "brute"], ["crook", "snitch"], ["mastermind", "driver"]]);
  act(two, 0, { type: "withdraw", slot: 0 });
  act(two, 0, { type: "transfer", to: 1, amount: 100 });
});

test("threat consumes one token per character, never revealing both three-player slots", () => {
  const g = fixture([["driver", "brute"], ["crook", "snitch"], ["mastermind", "driver"]]);
  unchanged(g, 0, { type: "threat", target: 1 });
  g.players[0].threats = 2;
  unchanged(g, 0, { type: "threat", target: 0 });
  unchanged(g, 0, { type: "threat", target: 3 });
  act(g, 1, { type: "withdraw", slot: 1 });
  unchanged(g, 0, { type: "threat", target: 1 });
  act(g, 0, { type: "threat", target: 1, slot: 0 });
  assert.equal(g.players[0].threats, 1);
  assert.deepEqual(publicGame(g, 0).players[1].slots.map(s => s.role), ["crook", null]);
  assert.deepEqual(publicGame(g, 2).players[1].slots.map(s => s.role), [null, null]);
  assert.deepEqual(publicGame(g, -1).private, []);
  assert.equal(publicGame(g, 0).private.length, 1);
  unchanged(g, 0, { type: "threat", target: 1, slot: 0 });
  act(g, 0, { type: "threat", target: 1, slot: 1 });
  assert.equal(g.players[0].threats, 0);
  assert.equal(publicGame(g, 0).private.length, 2);
  resolve(g);
  assert.equal(publicGame(g, 0).history[0].players[1].slots[1].role, "snitch");
  assert.equal(publicGame(g, 2).history[0].players[1].slots[1].role, "snitch");
});

test("snapshots reveal withdrawn roles at round end, keep internal intel private, and are detached", () => {
  const g = fixture(seven, { withdraw: [3, 4, 5, 6] });
  resolve(g);
  const view = publicGame(g, 0);
  assert.equal(view.players[3].slots[0].role, "mastermind");
  assert.equal(view.history[0].players[3].slots[0].role, "mastermind");
  assert.equal(view.result.players[3].slots[0].role, "mastermind");
  assert.equal(view.players[1].slots[0].role, "brute");
  for (const forbidden of ["hiddenCard", "privateIntel", "intel", "lastRoles", "roundStartCash"]) assert.ok(!JSON.stringify(view).includes(`"${forbidden}"`));
  const before = JSON.stringify(g);
  view.players[0].cash = -1;
  view.center.revealed.push("bad");
  view.history[0].logs.length = 0;
  view.result.players[0].slots[0].role = "bad";
  assert.equal(JSON.stringify(g), before);
  act(g, g.leader, { type: "next" }, zero);
  assert.equal(publicGame(g, 0).history[0].players[3].slots[0].role, "mastermind");
  g.phase = "over";
  assert.equal(publicGame(g, -1).history[0].players[3].slots[0].role, "mastermind");
});

test("noRepeat excludes all own last-round roles and only that option exposes lastRoles", () => {
  const g = fixture([["driver", "brute"], ["crook", "snitch"], ["mastermind", "driver"]], { settings: { noRepeat: true }, withdraw: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] });
  assert.deepEqual(publicGame(g, 1).players[0].lastRoles, []);
  act(g, g.leader, { type: "next" }, zero);
  assert.deepEqual(publicGame(g, 1).players[0].lastRoles, ["driver", "brute"]);
  assert.deepEqual(publicGame(g, 0).allowedRoles, ["crook", "snitch", "mastermind"]);
  unchanged(g, 0, { type: "choose", roles: ["driver", "crook"] });
  unchanged(g, 0, { type: "choose", roles: ["mastermind", "brute"] });
  act(g, 0, { type: "choose", roles: ["snitch", "mastermind"] });
  const normal = createGame(names(4), {}, zero);
  assert.ok(!Object.hasOwn(publicGame(normal, 0).players[0], "lastRoles"));
});

test("noRepeat restriction advances on next while completed round roles are already public", () => {
  const g = createGame(names(3), { noRepeat: true }, zero);
  let previous = g.players.map(() => []);
  for (let round = 1; round <= 8; round++) {
    const choices = previous.map(roles => Data.ROLE_IDS.filter(role => !roles.includes(role)).slice(0, 2));
    for (const viewer of [-1, 0, 1, 2]) {
      const view = publicGame(g, viewer);
      assert.deepEqual(view.players.map(p => p.lastRoles), previous);
      if (viewer >= 0) assert.deepEqual(view.allowedRoles, Data.ROLE_IDS.filter(role => !previous[viewer].includes(role)));
    }
    choices.forEach((roles, actor) => act(g, actor, { type: "choose", roles }, zero));
    for (let actor = 0; actor < 3; actor++) for (let slot = 0; slot < 2; slot++) act(g, actor, { type: "withdraw", slot });
    assert.equal(g.phase, round === 8 ? "over" : "results");
    for (const viewer of [-1, 0, 1, 2]) {
      const view = publicGame(g, viewer);
      assert.deepEqual(view.players.map(p => p.lastRoles), previous);
      for (let owner = 0; owner < 3; owner++) {
        const expected = choices[owner];
        assert.deepEqual(view.players[owner].slots.map(s => s.role), expected);
        assert.deepEqual(view.result.players[owner].slots.map(s => s.role), expected);
        assert.deepEqual(view.history.at(-1).players[owner].slots.map(s => s.role), expected);
      }
      if (round < 8) for (const result of view.history) {
        result.players.forEach((p, owner) => {
          assert.deepEqual(p.slots.map(s => s.role), g.history[result.round - 1].players[owner].slots.map(s => s.role));
        });
      }
    }
    if (round < 8) {
      const resultsView = publicGame(g, -1);
      unchanged(g, g.leader, { type: "next" }, () => 1);
      act(g, g.leader, { type: "next" }, zero);
      assert.deepEqual(publicGame(g, -1).players.map(p => p.lastRoles), choices);
      assert.deepEqual(resultsView.players.map(p => p.lastRoles), previous);
      previous = choices;
    }
  }
});

test("single-slot noRepeat results keep prior restriction separate from disclosed current roles", () => {
  for (const noRepeat of [false, true]) {
    const g = fixture(["driver", "brute", "crook", "brute"], { settings: { noRepeat }, withdraw: [0] });
    resolve(g);
    const view = publicGame(g, 1);
    assert.equal(view.players[0].slots[0].role, "driver");
    assert.equal(view.result.players[0].slots[0].role, "driver");
    assert.equal(view.history[0].players[0].slots[0].role, "driver");
    assert.equal(Object.hasOwn(view.players[0], "lastRoles"), noRepeat);
    if (noRepeat) assert.deepEqual(view.players[0].lastRoles, []);
    act(g, g.leader, { type: "next" }, zero);
    const next = publicGame(g, 1);
    assert.equal(Object.hasOwn(next.players[0], "lastRoles"), noRepeat);
    if (noRepeat) assert.deepEqual(next.players[0].lastRoles, ["driver"]);
    else assert.ok(!JSON.stringify(next).includes('"lastRoles"'));
  }
});

test("bilingual ledgers identify cash parties, ante/refund/forfeit, slot outcomes and deltas", () => {
  const g = resolve(fixture(["driver", "brute", "crook", "crook"]));
  const view = publicGame(g, 0);
  assert.equal(view.players[0].delta, 500);
  assert.equal(view.players[0].slots[0].share, 400);
  assert.equal(view.players[0].slots[0].outcome, "sharing");
  assert.equal(view.players[0].slots[0].id, 0);
  assert.ok(view.players[0].ledger.some(e => e.type === "ante"));
  assert.ok(view.players[0].ledger.some(e => e.type === "refund"));
  assert.ok(view.players[2].ledger.some(e => e.type === "forfeit"));
  for (const e of view.logs) {
    assert.ok(e.zh && e.en);
    if (e.from !== undefined && e.to !== undefined) {
      assert.ok(e.zh.includes(g.players[e.from].name) && e.zh.includes(g.players[e.to].name));
      assert.ok(e.en.includes(g.players[e.from].name) && e.en.includes(g.players[e.to].name));
    }
  }
});

test("bot decisions and all observer snapshots are invariant to inaccessible secrets", () => {
  const g = fixture([["driver", "brute"], ["crook", "snitch"], ["mastermind", "driver"]]);
  const altered = structuredClone(g);
  altered.players[1].slots[0].role = "brute";
  altered.players[1].slots[1].role = "mastermind";
  altered.hiddenCard = "mastermind";
  altered.players[1].lastRoles = ["snitch"];
  altered.intel[1]["2:0"] = "mastermind";
  assert.deepEqual(publicGame(g, 0), publicGame(altered, 0));
  assert.deepEqual(publicGame(g, -1), publicGame(altered, -1));
  assert.deepEqual(chooseBotAction(g, 0, random(17)), chooseBotAction(altered, 0, random(17)));
  const before = JSON.stringify(g);
  chooseBotAction(g, 0, random(18));
  assert.equal(JSON.stringify(g), before);
});

test("bots handle offers and use only allowed planning and Snitch choices", () => {
  const g = fixture(["driver", "brute", "crook", "crook"]);
  act(g, 0, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  assert.deepEqual(chooseBotAction(g, 1, zero), { type: "respond", offerId: g.offers[0].id, accept: true });
  act(g, 1, chooseBotAction(g, 1, zero));
  assert.equal(chooseBotAction(g, 1, zero), null);
});

test("UMD browser data and engine expose the same standalone API", () => {
  const context = vm.createContext({ crypto: require("node:crypto").webcrypto, Uint32Array });
  vm.runInContext(fs.readFileSync(require.resolve("./million-data"), "utf8"), context);
  vm.runInContext(fs.readFileSync(require.resolve("./million-engine"), "utf8"), context);
  assert.deepEqual(Object.keys(context.MillionEngine), Object.keys(Engine));
  const g = context.MillionEngine.createGame(names(4), {}, zero);
  context.MillionEngine.act(g, 0, { type: "choose", roles: ["driver"] });
  assert.equal(context.MillionEngine.publicGame(g, 1).players[0].slots[0].role, null);
});

test("360 seeded complete simulations terminate, conserve cash, and keep all views private", () => {
  let completed = 0;
  for (let n = 3; n <= 8; n++) for (let seed = 1; seed <= 60; seed++) {
    const rng = random(seed * 101 + n);
    const g = createGame(names(n), { noRepeat: seed % 2 === 0, bruteShares: seed % 3 !== 0 }, rng);
    let turns = 0;
    while (g.phase !== "over") {
      assert.ok(++turns <= 350, `stalled count=${n} seed=${seed} phase=${g.phase}`);
      const actors = requiredActors(g);
      assert.ok(actors.length);
      const actor = actors[Math.floor(rng() * actors.length)];
      const action = chooseBotAction(g, actor, rng);
      assert.ok(action, `bot needs action in ${g.phase}`);
      const revision = g.revision;
      act(g, actor, action, rng);
      assert.equal(g.revision, revision + 1);
      conserved(g);
      const view = publicGame(g, -1);
      assert.ok(!Object.hasOwn(view, "hiddenCard"));
      assert.deepEqual(view.private, []);
      if (g.phase === "planning" || g.phase === "negotiation") {
        for (const p of view.players) for (const s of p.slots) assert.equal(s.role, null);
      }
      if (g.phase !== "over") for (const result of view.history) {
        for (const p of result.players) for (const s of p.slots) assert.ok(Data.ROLE_IDS.includes(s.role));
      }
    }
    assert.ok(g.winners.length >= 1 && g.round <= 8);
    assert.equal(g.history.length, g.round);
    const view = publicGame(g, -1);
    for (const result of view.history) for (const p of result.players) for (const s of p.slots) assert.ok(Data.ROLE_IDS.includes(s.role));
    completed++;
  }
  assert.equal(completed, 360);
});

test("older threats work after a target locks and during Snitch naming, without exposing other cards", () => {
  const g = createGame(names(3), {}, zero);
  g.players[0].threats = 3;
  unchanged(g, 0, { type: "threat", target: 1, slot: 0 });
  act(g, 1, { type: "choose", roles: ["driver", "brute"] }, zero);
  act(g, 0, { type: "threat", target: 1, slot: 1 });
  assert.equal(g.phase, "planning");
  assert.deepEqual(publicGame(g, 0).players[1].slots.map(s => s.role), [null, "brute"]);
  assert.deepEqual(publicGame(g, 2).players[1].slots.map(s => s.role), [null, null]);
  act(g, 0, { type: "choose", roles: ["snitch", "mastermind"] }, zero);
  act(g, 2, { type: "choose", roles: ["crook", "driver"] }, zero);
  while (g.phase === "negotiation") act(g, requiredActors(g)[0], { type: "ready", ready: true });
  assert.equal(g.phase, "snitch");
  act(g, 0, { type: "threat", target: 2, slot: 0 });
  assert.equal(publicGame(g, 0).players[2].slots[0].role, "crook");
  assert.equal(publicGame(g, 1).players[2].slots[0].role, null);
  g.players[1].threats = 1;
  unchanged(g, 1, { type: "threat", target: 0, slot: 0 });
  act(g, 0, { type: "snitch", role: "crook" });
  unchanged(g, 0, { type: "threat", target: 1, slot: 0 });
});

test("Snitch cannot pass, and is not fined merely for sharing with another survivor", () => {
  const g = fixture(seven, { withdraw: [5, 6] });
  while (g.phase === "negotiation") act(g, requiredActors(g)[0], { type: "ready", ready: true });
  for (const role of [undefined, null, "", "pass"]) unchanged(g, g.snitch.actor, { type: "snitch", role });
  act(g, g.snitch.actor, { type: "snitch", role: "mastermind" });
  assert.equal(g.result.penalty, 0);
  assert.equal(g.players[4].slots[0].status, "sharing");
  assert.equal(g.publicFund, 0);
  conserved(g);
});

