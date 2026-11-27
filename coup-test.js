"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("./coup-engine");
const copy = x => JSON.parse(JSON.stringify(x));
function game(hands, coins = []) {
  const g = E.createGame(hands.map((_, i) => `Player ${i + 1}`), { seed: 46 });
  const all = [...g.deck, ...g.players.flatMap(p => p.cards)];
  for (let i = 0; i < hands.length; i++) {
    g.players[i].cards = hands[i].map(role => all.splice(all.findIndex(c => c.role === role), 1)[0]);
    if (coins[i] !== undefined) g.players[i].coins = coins[i];
  }
  g.deck = all; E.validateRestore(g); return g;
}
function act(g, who, a) { E.act(g, who, a); E.validateRestore(g); }
function passAll(g) {
  const kind = g.phase;
  while (g.phase === kind && ["actionChallenge", "block", "blockChallenge"].includes(g.phase)) act(g, E.requiredActors(g)[0], { type: "pass" });
}
function lose(g) { act(g, g.choice.playerId, { type: "lose", cardId: g.players[g.choice.playerId].cards.find(c => !c.revealed).id }); }
test("setup: five roles, three each, two private cards, two-player first-player coin", () => {
  for (let n = 2; n <= 6; n++) {
    const g = E.createGame(Array.from({ length: n }, (_, i) => `Player ${i}`), { seed: n });
    assert.equal(E.validateRestore(g), true); assert.equal(g.deck.length, 15 - n * 2);
    assert.equal(g.players[0].coins, n === 2 ? 1 : 2);
    assert.deepEqual(E.requiredActors(g), [0]);
  }
  assert.deepEqual(E.createGame(["A", "B"], { seed: 5 }), E.createGame(["A", "B"], { seed: 5 }));
  assert.throws(() => E.createGame(["A"])); assert.throws(() => E.createGame(Array(7).fill("A")));
});
test("income, mandatory coup at ten, cost and loss, invalid actions are atomic", () => {
  const g = game([["Duke", "Captain"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]], [10, 2, 2]);
  assert.deepEqual(E.legalActions(g), ["coup"]);
  const before = copy(g);
  for (const [who, a] of [[1, { type: "action", action: "income" }], [0, { type: "action", action: "tax" }], [0, { type: "action", action: "coup", targetId: 0 }], [0, { type: "action", action: "coup", targetId: "1" }]]) {
    assert.throws(() => E.act(g, who, a)); assert.deepEqual(g, before);
  }
  act(g, 0, { type: "action", action: "coup", targetId: 1 });
  assert.equal(g.players[0].coins, 3); assert.equal(g.phase, "lose");
  assert.throws(() => E.act(g, 1, { type: "block", role: "Contessa" })); lose(g);
  assert.equal(g.current, 1); act(g, 1, { type: "action", action: "income" }); assert.equal(g.players[1].coins, 3);
});
test("uncontested bluff tax succeeds, and passed players cannot challenge retroactively", () => {
  const g = game([["Captain", "Ambassador"], ["Duke", "Contessa"], ["Assassin", "Duke"]]);
  act(g, 0, { type: "action", action: "tax" }); act(g, 1, { type: "pass" });
  const before = copy(g); assert.throws(() => E.act(g, 1, { type: "challenge" })); assert.deepEqual(g, before);
  act(g, 2, { type: "pass" }); assert.equal(g.players[0].coins, 5); assert.equal(g.current, 1);
});
test("a truthful challenged role is shuffled/replaced, challenger chooses lost influence", () => {
  const g = game([["Duke", "Captain"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]]);
  act(g, 0, { type: "action", action: "tax" }); act(g, 1, { type: "challenge" });
  assert.equal(g.phase, "lose"); assert.equal(g.choice.playerId, 1); assert.equal(g.deck.length, 9);
  assert.equal(g.players[0].cards.filter(c => c.revealed).length, 0);
  const before = copy(g); assert.throws(() => E.act(g, 2, { type: "challenge" })); assert.deepEqual(g, before);
  const chosen = g.players[1].cards[1].id; act(g, 1, { type: "lose", cardId: chosen });
  assert.equal(g.players[1].cards.find(c => c.id === chosen).revealed, true); assert.equal(g.players[0].coins, 5);
});
test("exposed Assassin action refunds three coins and cancels assassination", () => {
  const g = game([["Duke", "Captain"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]], [4, 2, 2]);
  act(g, 0, { type: "action", action: "assassinate", targetId: 1 }); assert.equal(g.players[0].coins, 1);
  act(g, 2, { type: "challenge" }); assert.equal(g.players[0].coins, 4); assert.equal(g.choice.playerId, 0);
  lose(g); assert.equal(g.current, 1); assert.equal(g.players[1].cards.some(c => c.revealed), false);
});
test("foreign aid permits another player to block; unchallenged block denies coins", () => {
  const g = game([["Duke", "Captain"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]]);
  act(g, 0, { type: "action", action: "aid" }); assert.equal(g.phase, "block");
  assert.deepEqual(E.requiredActors(g), [1, 2]); act(g, 2, { type: "block", role: "Duke" });
  assert.deepEqual(E.requiredActors(g), [0, 1]); passAll(g); assert.equal(g.players[0].coins, 2);
});
test("only target can block stealing; truthful block can be challenged by third party", () => {
  const g = game([["Captain", "Duke"], ["Captain", "Contessa"], ["Duke", "Ambassador"]]);
  act(g, 0, { type: "action", action: "steal", targetId: 1 }); passAll(g);
  assert.deepEqual(E.requiredActors(g), [1]); assert.throws(() => E.act(g, 2, { type: "block", role: "Ambassador" }));
  act(g, 1, { type: "block", role: "Captain" }); act(g, 2, { type: "challenge" });
  assert.equal(g.choice.playerId, 2); lose(g); assert.equal(g.players[0].coins, 2); assert.equal(g.players[1].coins, 2);
});
test("steal transfers at most available coins, including a bluffing blocker eliminated by challenge", () => {
  const g = game([["Captain", "Duke"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]], [2, 1, 2]);
  g.players[1].cards[0].revealed = true;
  act(g, 0, { type: "action", action: "steal", targetId: 1 }); passAll(g);
  act(g, 1, { type: "block", role: "Captain" }); act(g, 0, { type: "challenge" }); lose(g);
  assert.equal(g.players[1].eliminated, true); assert.equal(g.players[1].coins, 0); assert.equal(g.players[0].coins, 3); assert.equal(g.current, 2);
});
test("blocked assassination keeps fee spent and another player cannot block for the target", () => {
  const g = game([["Assassin", "Captain"], ["Duke", "Contessa"], ["Duke", "Ambassador"]], [5, 2, 2]);
  act(g, 0, { type: "action", action: "assassinate", targetId: 1 }); passAll(g);
  assert.throws(() => E.act(g, 2, { type: "block", role: "Contessa" }));
  act(g, 1, { type: "block", role: "Contessa" }); passAll(g);
  assert.equal(g.players[0].coins, 2); assert.equal(g.players[1].cards.filter(c => c.revealed).length, 0);
});
test("failed Assassin challenge then failed Contessa bluff can eliminate target without another loss prompt", () => {
  const g = game([["Assassin", "Captain"], ["Duke", "Ambassador"], ["Duke", "Contessa"]], [4, 2, 2]);
  act(g, 0, { type: "action", action: "assassinate", targetId: 1 }); act(g, 1, { type: "challenge" }); lose(g);
  assert.equal(g.phase, "block"); act(g, 1, { type: "block", role: "Contessa" }); act(g, 2, { type: "challenge" }); lose(g);
  assert.equal(g.phase, "turn"); assert.equal(g.current, 2); assert.equal(g.players[1].eliminated, true); assert.equal(g.players[0].coins, 1);
});
test("caught Contessa bluff loses a challenge influence and then assassination influence", () => {
  const g = game([["Assassin", "Captain"], ["Duke", "Ambassador"], ["Duke", "Contessa"]], [4, 2, 2]);
  act(g, 0, { type: "action", action: "assassinate", targetId: 1 }); passAll(g);
  act(g, 1, { type: "block", role: "Contessa" }); act(g, 0, { type: "challenge" }); lose(g);
  assert.equal(g.phase, "lose"); assert.equal(g.choice.playerId, 1); assert.match(g.choice.reason, /暗杀/); lose(g);
  assert.equal(g.players[1].eliminated, true); assert.equal(g.current, 2);
});
test("a failed Assassin challenge may still be followed by a truthful Contessa block", () => {
  const g = game([["Assassin", "Captain"], ["Duke", "Contessa"], ["Duke", "Ambassador"]], [4, 2, 2]);
  act(g, 0, { type: "action", action: "assassinate", targetId: 1 }); act(g, 1, { type: "challenge" });
  const duke = g.players[1].cards.find(c => c.role === "Duke"); act(g, 1, { type: "lose", cardId: duke.id });
  act(g, 1, { type: "block", role: "Contessa" }); passAll(g);
  assert.equal(g.players[1].eliminated, false); assert.equal(g.players[1].cards.filter(c => c.revealed).length, 1);
});
test("exchange keeps one influence when one is revealed, choices stay private and malformed choices are atomic", () => {
  const g = game([["Ambassador", "Duke"], ["Assassin", "Contessa"], ["Captain", "Duke"]]);
  g.players[0].cards[1].revealed = true; const oldRevealed = copy(g.players[0].cards[1]);
  act(g, 0, { type: "action", action: "exchange" }); passAll(g);
  assert.equal(g.choice.keepCount, 1); assert.equal(g.choice.choices.length, 3); assert.equal(g.deck.length, 7);
  assert.equal(E.publicGame(g, 1).choice.choices, undefined); assert.equal(E.publicGame(g, -1).choice.choices, undefined);
  assert.equal(E.publicGame(g, 0).choice.choices.length, 3);
  const before = copy(g);
  for (const cardIds of [[], ["invalid"], [g.choice.choices[0].id, g.choice.choices[0].id]]) { assert.throws(() => E.act(g, 0, { type: "exchange", cardIds })); assert.deepEqual(g, before); }
  act(g, 0, { type: "exchange", cardIds: [g.choice.choices[2].id] });
  assert.equal(g.deck.length, 9); assert.deepEqual(g.players[0].cards.find(c => c.revealed), oldRevealed);
});
test("last influence loss names winner, zeroes eliminated coins, rejects future actions", () => {
  const g = game([["Duke", "Captain"], ["Assassin", "Contessa"]], [8, 4]);
  g.players[1].cards[0].revealed = true; act(g, 0, { type: "action", action: "coup", targetId: 1 }); lose(g);
  assert.equal(g.phase, "over"); assert.equal(g.winner, 0); assert.deepEqual(E.requiredActors(g), []); assert.equal(g.players[1].coins, 0);
  assert.match(g.log.at(-1).en, /Player 1 wins/); assert.throws(() => E.act(g, 0, { type: "action", action: "income" }));
});
test("public views mask deck, RNG, continuation and opponents' cards and physical identifiers", () => {
  const g = E.createGame(["A", "B", "C"], { seed: 3 }); const view = E.publicGame(g, 0);
  for (const field of ["deck", "rng", "logSequence"]) assert.equal(view[field], undefined);
  assert.equal(view.players[0].cards.every(c => E.ROLES.includes(c.role)), true);
  assert.equal(view.players.slice(1).flatMap(p => p.cards).every(c => c.role === null && c.id.startsWith("hidden-")), true);
  view.players[0].coins = 100; assert.notEqual(g.players[0].coins, 100);
  assert.equal(E.publicGame(g, -1).players.flatMap(p => p.cards).every(c => c.role === null), true);
});
test("bot choices do not inspect opponents' hidden roles or deck order", () => {
  const a = game([["Duke", "Captain"], ["Assassin", "Contessa"], ["Duke", "Ambassador"]]);
  act(a, 0, { type: "action", action: "tax" });
  const b = copy(a); const x = b.players[0].cards[0], y = b.deck[0]; [x.role, y.role] = [y.role, x.role]; b.deck.reverse();
  E.validateRestore(b);
  for (const n of [.01, .15, .99]) assert.deepEqual(E.chooseBotAction(a, 1, () => n), E.chooseBotAction(b, 1, () => n));
});
test("restore rejects malformed cards, phases, actor links, extra fields and leaked identity fields", () => {
  const initial = E.createGame(["A", "B", "C"], { seed: 4 });
  const mutations = [g => g.players[0].cards[0].id = g.players[1].cards[0].id,
    g => g.players[0].cards[0].role = "King", g => g.phase = "bogus", g => g.current = 7,
    g => g.players[0].eliminated = true, g => g.players[0].coins = -1, g => g.deck.pop(),
    g => g.players[0].token = "secret", g => g.rng = NaN, g => g.winner = 0, g => g.choice = { next: "resolve" }];
  for (const mutate of mutations) { const g = copy(initial); mutate(g); assert.throws(() => E.validateRestore(g)); }
  const g = copy(initial); act(g, 0, { type: "action", action: "tax" });
  for (const mutate of [x => x.pending.actorId = 1, x => x.choice.eligible = [0], x => x.choice.responded = [1, 2], x => x.pending.targetId = 1]) { const bad = copy(g); mutate(bad); assert.throws(() => E.validateRestore(bad)); }
});
test("120 complete bot games validate every state and resume identically after serialization", () => {
  let randomState = 123;
  const rng = () => { randomState = Math.imul(randomState, 1664525) + 1013904223 | 0; return (randomState >>> 0) / 4294967296; };
  for (let seed = 1; seed <= 120; seed++) {
    const count = 2 + seed % 5, g = E.createGame(Array.from({ length: count }, (_, i) => `Seat ${i}`), { seed });
    let steps = 0;
    while (g.phase !== "over" && steps++ < 1200) {
      const actor = E.requiredActors(g)[0], a = E.chooseBotAction(g, actor, rng); assert.ok(a);
      const restored = copy(g); assert.equal(E.validateRestore(restored), true);
      act(g, actor, a); act(restored, actor, a); assert.deepEqual(restored, g);
    }
    assert.equal(g.phase, "over", `seed ${seed} did not finish`);
    assert.equal(g.players.filter(p => !p.eliminated).length, 1);
  }
});
test("host ending every active phase cancels pending actions and remains privately restorable", () => {
  const fixtures = [];
  const make = () => game([["Assassin", "Ambassador"], ["Duke", "Contessa"], ["Captain", "Duke"]], [8, 2, 2]);
  fixtures.push(make());
  const challenged = make(); act(challenged, 0, { type: "action", action: "assassinate", targetId: 1 }); fixtures.push(challenged);
  const blocked = copy(challenged); passAll(blocked); fixtures.push(blocked);
  const counter = copy(blocked); act(counter, 1, { type: "block", role: "Contessa" }); fixtures.push(counter);
  const loss = make(); act(loss, 0, { type: "action", action: "coup", targetId: 1 }); fixtures.push(loss);
  const exchange = make(); act(exchange, 0, { type: "action", action: "exchange" }); passAll(exchange); fixtures.push(exchange);
  assert.deepEqual(fixtures.map(g => g.phase), ["turn", "actionChallenge", "block", "blockChallenge", "lose", "exchange"]);
  for (const g of fixtures) {
    const original = copy(g), cards = g.players.map(p => copy(p.cards)), coins = g.players.map(p => p.coins);
    E.endGame(g);
    assert.equal(g.phase, "over"); assert.equal(g.winner, null); assert.equal(g.endReason, "hostEnded");
    assert.equal(g.revision, original.revision + 1); assert.deepEqual(g.players.map(p => p.cards), cards);
    assert.deepEqual(g.players.map(p => p.coins), coins); assert.equal(g.deck.length, 9); assert.equal(g.pending, null); assert.deepEqual(g.choice, {});
    assert.equal(E.validateRestore(copy(g)), true); assert.deepEqual(E.requiredActors(g), []);
    for (let viewer = 0; viewer < g.players.length; viewer++) {
      const v = E.publicGame(g, viewer); assert.equal(v.endReason, "hostEnded"); assert.equal(v.winner, null);
      assert.equal(v.players.filter(p => p.id !== viewer).flatMap(p => p.cards).every(c => c.revealed || c.role === null), true);
    }
    const ended = copy(g); assert.throws(() => E.endGame(g)); assert.deepEqual(g, ended);
    assert.throws(() => E.act(g, 0, { type: "action", action: "income" })); assert.deepEqual(g, ended);
  }
});
test("host end validates before mutation, accepts old saves, and rejects forged winner/reason combinations", () => {
  const g = E.createGame(["A", "B", "C"], { seed: 18 });
  assert.equal(Object.hasOwn(g, "endReason"), false); assert.equal(E.validateRestore(g), true);
  const bad = copy(g); bad.phase = "exchange"; const before = copy(bad);
  assert.throws(() => E.endGame(bad)); assert.deepEqual(bad, before);
  const early = copy(g); early.endReason = "hostEnded"; assert.throws(() => E.validateRestore(early));
  E.endGame(g);
  const winner = copy(g); winner.winner = 0; assert.throws(() => E.validateRestore(winner));
  const missing = copy(g); delete missing.endReason; assert.throws(() => E.validateRestore(missing));
  const reason = copy(g); reason.endReason = "cancelled"; assert.throws(() => E.validateRestore(reason));
});
