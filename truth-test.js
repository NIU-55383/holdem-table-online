"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const E = require("./truth-engine");
const D = require("./truth-data");
const fixed = value => () => value;
function roll(game, die) {
  let first = true;
  return E.act(game, game.current, { type: "roll" }, () => {
    if (first) { first = false; return (die - 0.5) / 6; }
    return 0;
  });
}
function rolls(game, values) { for (const die of values) roll(game, die); return game; }
function prepare(game, values = [6, 1], kind = "truth") {
  rolls(game, values);
  if (game.stage === "choose") E.act(game, game.asker, { type: "choose", kind }, fixed(0));
  assert.equal(game.stage, "prepare");
  return game;
}
function finish(game, values, outcome = "complete") {
  prepare(game, values);
  E.act(game, game.asker, { type: "ask" });
  E.act(game, game.target, { type: outcome });
}
function unchanged(game, fn) {
  const before = JSON.stringify(game);
  assert.throws(fn);
  assert.equal(JSON.stringify(game), before, "Rejected actions must leave the state unchanged");
}

test("Prompt bank: 250 unique bilingual cards, 30 truths and 20 dares in each of five levels", () => {
  assert.equal(D.PROMPTS.length, 250);
  assert.deepEqual(D.LEVELS, ["chill", "heat", "wild", "unmasked", "showdown"]);
  assert.deepEqual(E.LEVELS, D.LEVELS);
  for (const field of ["id", "zh", "en"]) assert.equal(new Set(D.PROMPTS.map(p => p[field])).size, 250);
  for (const level of D.LEVELS) for (const kind of ["truth", "dare"]) {
    assert.equal(D.PROMPTS.filter(p => p.level === level && p.kind === kind).length, kind === "truth" ? 30 : 20);
  }
  for (const prompt of D.PROMPTS) {
    assert.match(prompt.id, /^(chill|heat|wild|unmasked|showdown)-(truth|dare)-[0-9]{2}$/);
    assert.match(prompt.zh, /[\u4e00-\u9fff]/);
    assert.match(prompt.en, /[a-zA-Z]/);
    assert.ok(Object.isFrozen(prompt));
  }
});

test("V2 creation validates mode/options and records total contest count", () => {
  const game = E.createGame(3);
  assert.equal(game.version, 2);
  assert.equal(game.stage, "roll");
  assert.equal(game.phase, "playing");
  assert.equal(game.round, 1);
  assert.equal(game.rounds, 3);
  assert.equal(game.level, "heat");
  assert.equal(game.mode, "mixed");
  assert.equal(game.asker, -1);
  assert.equal(game.target, -1);
  assert.equal(game.tie, null);
  assert.deepEqual(game.dice, [0, 0, 0]);
  assert.deepEqual(game.tieHistory, []);
  assert.deepEqual(game.scores, [0, 0, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(game)), game);
  assert.equal(E.createGame(12, { level: "wild", rounds: 10, mode: "dare" }).playerCount, 12);
  for (const players of [0, 1, 13, 2.5, "2", null, undefined, NaN]) assert.throws(() => E.createGame(players));
  for (const options of [null, [], 4, "heat", { level: "bad" }, { level: null },
    { rounds: 0 }, { rounds: 11 }, { rounds: 1.5 }, { rounds: "3" }, { rounds: NaN },
    { mode: "both" }, { mode: null }, { mode: 1 }, { typo: true }]) assert.throws(() => E.createGame(2, options));
  assert.throws(() => E.createGame(2, {}, 1));
});

test("Every seat rolls in order; highest asks lowest and die faces never choose the category", () => {
  const game = E.createGame(4);
  for (const [index, value] of [4, 2, 6, 1].entries()) {
    assert.equal(game.current, index);
    const previousRevision = game.revision;
    roll(game, value);
    assert.equal(game.revision, previousRevision + 1);
  }
  assert.deepEqual(game.dice, [4, 2, 6, 1]);
  assert.equal(game.asker, 2);
  assert.equal(game.target, 3);
  assert.equal(game.current, 2);
  assert.equal(game.stage, "choose");
  assert.equal(game.prompt, null);
  assert.equal(game.turns, 0);
  assert.equal(game.tie, null);
});

test("Truth-only and dare-only auto-draw; mixed gives only the highest roller the choice", () => {
  for (const mode of ["truth", "dare", "mixed"]) {
    const game = E.createGame(2, { mode, level: "chill" });
    rolls(game, [2, 1]);
    assert.equal(game.asker, 0);
    assert.equal(game.target, 1);
    assert.equal(game.current, 0);
    if (mode === "mixed") {
      assert.equal(game.stage, "choose");
      unchanged(game, () => E.act(game, 1, { type: "choose", kind: "truth" }, fixed(0)));
      for (const kind of [undefined, "", "other", null]) {
        unchanged(game, () => E.act(game, 0, { type: "choose", kind }, fixed(0)));
      }
      E.act(game, 0, { type: "choose", kind: "dare" }, fixed(0));
      assert.equal(game.kind, "dare");
    } else {
      assert.equal(game.kind, mode);
      unchanged(game, () => E.act(game, 0, { type: "choose", kind: mode }, fixed(0)));
    }
    assert.equal(game.stage, "prepare");
    assert.match(game.prompt.id, new RegExp("^chill-" + game.kind));
  }
});

test("All-equal dice reroll everyone, repeat as needed, then resolve a highest tie", () => {
  const game = E.createGame(3);
  rolls(game, [2, 2, 2]);
  assert.deepEqual(game.tie, { role: "all", candidates: [0, 1, 2], dice: [0, 0, 0] });
  assert.equal(game.current, 0);
  roll(game, 4);
  assert.equal(game.current, 1);
  assert.deepEqual(game.tie.dice, [4, 0, 0]);
  unchanged(game, () => E.act(game, 0, { type: "roll" }, fixed(0)));
  rolls(game, [4, 4]);
  assert.equal(game.tie.role, "all");
  assert.equal(game.tieHistory.length, 1);
  assert.deepEqual(game.tieHistory[0].dice, [4, 4, 4]);
  rolls(game, [6, 6, 1]);
  assert.deepEqual(game.dice, [6, 6, 1]);
  assert.deepEqual(game.tie, { role: "high", candidates: [0, 1], dice: [0, 0, 0] });
  rolls(game, [2, 5]);
  assert.equal(game.asker, 1);
  assert.equal(game.target, 2);
  assert.equal(game.current, 1);
  assert.equal(game.stage, "choose");
  assert.equal(game.tie, null);
  assert.deepEqual(game.tieHistory.map(t => t.role), ["all", "all", "high"]);
  assert.deepEqual(game.tieHistory[2], { role: "high", candidates: [0, 1], dice: [2, 5, 0] });
});

test("Highest rerolls narrow to remaining tied seats, including repeated ties", () => {
  const game = E.createGame(4);
  rolls(game, [6, 6, 6, 1]);
  assert.deepEqual(game.tie.candidates, [0, 1, 2]);
  rolls(game, [5, 5, 2]);
  assert.deepEqual(game.tie.candidates, [0, 1]);
  rolls(game, [4, 4]);
  assert.deepEqual(game.tie.candidates, [0, 1]);
  rolls(game, [1, 6]);
  assert.equal(game.asker, 1);
  assert.equal(game.target, 3);
  assert.deepEqual(game.dice, [6, 6, 6, 1]);
  assert.equal(game.tieHistory.length, 3);
});

test("Lowest rerolls narrow correctly; only candidates roll even when another die is higher", () => {
  const game = E.createGame(4);
  rolls(game, [6, 1, 1, 1]);
  assert.equal(game.asker, 0);
  assert.equal(game.tie.role, "low");
  assert.deepEqual(game.tie.candidates, [1, 2, 3]);
  assert.equal(game.current, 1);
  rolls(game, [3, 3, 6]);
  assert.deepEqual(game.tie.candidates, [1, 2]);
  rolls(game, [2, 4]);
  assert.equal(game.asker, 0);
  assert.equal(game.target, 1);
  assert.equal(game.current, 0);
  assert.equal(game.stage, "choose");
});

test("Simultaneous high and low ties resolve high first and preserve each candidate group", () => {
  const game = E.createGame(4, { mode: "truth" });
  rolls(game, [6, 6, 1, 1]);
  assert.equal(game.tie.role, "high");
  rolls(game, [1, 2]);
  assert.equal(game.asker, 1);
  assert.equal(game.tie.role, "low");
  assert.deepEqual(game.tie.candidates, [2, 3]);
  rolls(game, [5, 6]);
  assert.equal(game.target, 2);
  assert.equal(game.current, 1);
  assert.equal(game.stage, "prepare");
  assert.equal(game.kind, "truth");
  assert.deepEqual(game.dice, [6, 6, 1, 1]);
  assert.deepEqual(game.tieHistory.map(t => t.role), ["high", "low"]);
});

test("Exhaustive initial dice for 2–4 seats never let the asker and target coincide", () => {
  for (const players of [2, 3, 4]) {
    const total = 6 ** players;
    for (let code = 0; code < total; code++) {
      let n = code;
      const values = Array.from({ length: players }, () => { const die = n % 6 + 1; n = Math.floor(n / 6); return die; });
      const game = E.createGame(players);
      rolls(game, values);
      while (game.stage === "roll") {
        const candidates = game.tie.candidates.slice();
        for (let index = 0; index < candidates.length; index++) roll(game, index + 1);
      }
      assert.notEqual(game.asker, game.target);
      assert.equal(game.stage, "choose");
      if (new Set(values).size > 1) {
        assert.equal(values[game.asker], Math.max(...values));
        assert.equal(values[game.target], Math.min(...values));
      }
    }
  }
});

test("Only asker prepares/locks; only target answers; the locked challenge cannot be rerolled", () => {
  const game = prepare(E.createGame(3), [2, 6, 1]);
  assert.equal(game.current, 1);
  for (const actor of [0, 2]) {
    unchanged(game, () => E.act(game, actor, { type: "ask" }));
    unchanged(game, () => E.act(game, actor, { type: "reroll" }, fixed(0)));
  }
  unchanged(game, () => E.act(game, 1, { type: "complete" }));
  const prompt = game.prompt.id;
  E.act(game, 1, { type: "ask" });
  assert.equal(game.current, 2);
  assert.equal(game.stage, "challenge");
  assert.equal(game.prompt.id, prompt);
  for (const type of ["roll", "choose", "reroll", "ask"]) {
    unchanged(game, () => E.act(game, 2, type === "choose" ? { type, kind: "dare" } : { type }, fixed(0)));
  }
  unchanged(game, () => E.act(game, 1, { type: "complete" }));
  E.act(game, 2, { type: "complete" });
  assert.deepEqual(game.scores, [0, 0, 1]);
  assert.equal(game.history[0].asker, 1);
  assert.equal(game.history[0].target, 2);
  assert.equal(game.history[0].actor, 2);
  assert.deepEqual(game.history[0].dice, [2, 6, 1]);
});

test("Custom questions are trimmed plain text with 1–240 Unicode characters and strict fields", () => {
  for (const text of ["hello", "  一个问题？  ", "问".repeat(240), "😀".repeat(240), "<b>literal text</b>"]) {
    const game = prepare(E.createGame(2));
    E.act(game, 0, { type: "ask", text });
    assert.equal(game.prompt.zh, text.trim());
    assert.equal(game.prompt.en, "Custom prompt from the asker.");
    assert.match(game.prompt.id, /^custom-1-/);
    assert.equal(game.current, 1);
  }
  const game = prepare(E.createGame(2));
  for (const text of ["", "   ", "\n\t", "x".repeat(241), "😀".repeat(241), null, undefined, 4, {}, "a\u0000b"]) {
    unchanged(game, () => E.act(game, 0, { type: "ask", text }));
  }
  for (const action of [{ type: "ask", kind: "truth" }, { type: "ask", text: "x", target: 0 },
    { type: "reroll", text: "x" }, { type: "complete", text: "x" }]) {
    unchanged(game, () => E.act(game, 0, action, fixed(0)));
  }
});

test("Unlimited preparation replacements exhaust each category before repeating, without points or extra contests", () => {
  for (const level of E.LEVELS) for (const kind of ["truth", "dare"]) {
    const game = prepare(E.createGame(2, { level, mode: kind }));
    const expectedIds = new Set(D.PROMPTS.filter(p => p.level === level && p.kind === kind).map(p => p.id));
    assert.equal(expectedIds.size, kind === "truth" ? 30 : 20);
    let previous;
    for (let cycle = 0; cycle < 3; cycle++) {
      const seen = new Set();
      for (let index = 0; index < expectedIds.size; index++) {
        if (cycle || index) E.act(game, 0, { type: "reroll" }, fixed(0));
        assert(expectedIds.has(game.prompt.id), "Draws must remain in their selected level and category");
        assert.equal(seen.has(game.prompt.id), false);
        assert.notEqual(game.prompt.id, previous);
        previous = game.prompt.id;
        seen.add(game.prompt.id);
        assert.equal(game.kind, kind);
        assert.equal(game.current, game.asker);
        assert.equal(game.turns, 0);
        assert.deepEqual(game.scores, [0, 0]);
        assert.equal(game.used[level + "/" + kind].length, index + 1);
      }
      assert.deepEqual(seen, expectedIds, "Every card in the pool appears exactly once per cycle");
    }
  }
});

test("Rounds count total contests, only completers score and all highest-score players win", () => {
  const game = E.createGame(3, { rounds: 3 });
  finish(game, [6, 1, 3]);
  assert.equal(game.round, 2);
  assert.equal(game.turns, 1);
  assert.equal(game.current, 0);
  assert.deepEqual(game.dice, [0, 0, 0]);
  assert.deepEqual(game.tieHistory, []);
  finish(game, [6, 3, 1]);
  finish(game, [1, 6, 3], "skip");
  assert.equal(game.phase, "over");
  assert.equal(game.turns, 3);
  assert.equal(game.round, 3);
  assert.equal(game.history.length, 3);
  assert.deepEqual(game.scores, [0, 1, 1]);
  assert.deepEqual(game.winners, [1, 2]);
  assert.equal(game.history[2].outcome, "skip");
  assert.equal(game.history[2].points, 0);
  unchanged(game, () => E.act(game, game.current, { type: "roll" }, fixed(0)));
  const skipped = E.createGame(2, { rounds: 1 });
  finish(skipped, [6, 1], "skip");
  assert.deepEqual(skipped.winners, [0, 1]);
  const large = E.createGame(12, { rounds: 10, mode: "dare" });
  for (let index = 0; index < 10; index++) finish(large, [6, ...Array(10).fill(3), 1]);
  assert.equal(large.turns, 10);
  assert.equal(large.history.length, 10);
  assert.deepEqual(large.winners, [11]);
  assert.equal(large.scores[11], 10);
});

test("Snapshots isolate nested arrays and tie state; JSON restore resumes the exact required roller", () => {
  const game = E.createGame(3);
  rolls(game, [6, 6, 1]);
  roll(game, 3);
  const restored = JSON.parse(JSON.stringify(game));
  assert.equal(restored.current, 1);
  roll(restored, 5);
  assert.equal(restored.asker, 1);
  assert.equal(restored.target, 2);
  assert.equal(game.tie.dice[1], 0);
  E.act(restored, 1, { type: "choose", kind: "truth" }, fixed(0));
  const copy = E.snapshot(restored);
  copy.scores[0] = 99;
  copy.dice[0] = 1;
  copy.tieHistory[0].dice[0] = 99;
  copy.prompt.zh = "changed";
  copy.used["heat/truth"].push("fake");
  assert.equal(restored.scores[0], 0);
  assert.equal(restored.dice[0], 6);
  assert.equal(restored.tieHistory[0].dice[0], 3);
  assert.notEqual(restored.prompt.zh, "changed");
  assert.equal(restored.used["heat/truth"].includes("fake"), false);
});

test("Wrong actors/stages, malformed actions and invalid RNG are rejected atomically", () => {
  const game = E.createGame(2, { mode: "truth" });
  for (const actor of [1, -1, 0.5, "0", null, undefined]) unchanged(game, () => E.act(game, actor, { type: "roll" }, fixed(0)));
  for (const action of [null, [], "roll", {}, { type: "unknown" }, { type: "roll", kind: "truth" },
    { type: "roll", revision: 0 }, { type: "choose", kind: "truth" }, { type: "complete" },
    { type: "skip" }, { type: "reroll" }, { type: "ask" }]) unchanged(game, () => E.act(game, 0, action, fixed(0)));
  for (const value of [-1, 1, NaN, Infinity, "0", undefined]) {
    unchanged(game, () => E.act(game, 0, { type: "roll" }, fixed(value)));
  }
  roll(game, 6);
  for (const value of [-1, 1, NaN, Infinity, "0", undefined]) {
    let calls = 0;
    unchanged(game, () => E.act(game, 1, { type: "roll" }, () => calls++ === 0 ? 0 : value));
  }
  roll(game, 1);
  unchanged(game, () => E.act(game, 0, { type: "reroll" }, fixed(1)));
  unchanged(game, () => E.act(game, 0, { type: "ask" }, "rng"));
});

function browserEngine(crypto) {
  const context = vm.createContext({ crypto });
  for (const filename of ["truth-data.js", "truth-engine.js"]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, filename), "utf8"), context, { filename });
  }
  return context;
}

test("Browser UMD uses unbiased rejection sampling for dice and prompt draws", () => {
  const words = [0xffffffff, 5, 0xffffffff, 6, 0xffffffff, 29];
  let calls = 0;
  const browser = browserEngine({ getRandomValues(buffer) {
    assert.ok(words.length > 0); buffer[0] = words.shift(); calls++; return buffer;
  } });
  const game = browser.TruthEngine.createGame(2, { level: "chill", mode: "truth" });
  browser.TruthEngine.act(game, 0, { type: "roll" });
  browser.TruthEngine.act(game, 1, { type: "roll" });
  assert.equal(calls, 6);
  assert.equal(game.dice[0], 6);
  assert.equal(game.dice[1], 1);
  assert.equal(game.prompt.id, "chill-truth-30");
  assert.equal(game.asker, 0);
  assert.equal(game.target, 1);
});

test("Unavailable browser crypto fails explicitly; Node default randomness never uses Math.random", () => {
  const browser = browserEngine(undefined), game = browser.TruthEngine.createGame(2);
  unchanged(game, () => browser.TruthEngine.act(game, 0, { type: "roll" }));
  const original = Math.random;
  try {
    Math.random = () => { throw Error("Math.random must not determine outcomes"); };
    for (let n = 0; n < 30; n++) {
      const next = E.createGame(2);
      E.act(next, 0, { type: "roll" });
      assert.ok(next.die >= 1 && next.die <= 6);
    }
  } finally { Math.random = original; }
});
