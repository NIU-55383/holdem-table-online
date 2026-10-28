"use strict";
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./truth-data"), require("node:crypto"));
  } else {
    root.TruthEngine = factory(root.TruthData, root.crypto);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (Data, cryptoSource) {
  if (!Data) throw Error("先加载题库 / Load truth-data.js first");
  const LEVELS = Data.LEVELS;
  const KINDS = ["truth", "dare"];
  const MODES = Object.freeze(["truth", "dare", "mixed"]);
  const ACTIONS = ["roll", "choose", "ask", "complete", "skip", "reroll"];
  const HISTORY_LIMIT = 12;
  const requireRule = (condition, message) => { if (!condition) throw Error(message); };
  const clone = value => JSON.parse(JSON.stringify(value));
  const pools = Object.fromEntries(LEVELS.flatMap(level =>
    KINDS.map(kind => [level + "/" + kind, Data.PROMPTS.filter(prompt => prompt.level === level && prompt.kind === kind)])
  ));

  function validateRng(rng) {
    requireRule(rng === undefined || typeof rng === "function", "随机源无效 / Invalid random source");
  }

  // Production outcomes use crypto rejection sampling. Tests may inject [0, 1).
  function randomIndex(size, rng) {
    validateRng(rng);
    if (rng !== undefined) {
      const value = rng();
      requireRule(typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1,
        "随机值必须在 0 到 1 之间 / Random value must be in [0, 1)");
      return Math.floor(value * size);
    }
    if (cryptoSource && typeof cryptoSource.randomInt === "function") return cryptoSource.randomInt(size);
    requireRule(cryptoSource && typeof cryptoSource.getRandomValues === "function",
      "无法使用安全随机数，请在 HTTPS 或本机打开 / Secure randomness requires HTTPS or localhost");
    const range = 0x100000000, limit = range - range % size;
    const word = new Uint32Array(1);
    do { cryptoSource.getRandomValues(word); } while (word[0] >= limit);
    return word[0] % size;
  }

  function createGame(playerCount, options = {}, rng) {
    requireRule(Number.isInteger(playerCount) && playerCount >= 2 && playerCount <= 12,
      "需要 2 至 12 位玩家 / Choose 2 to 12 players");
    requireRule(options !== null && typeof options === "object" && !Array.isArray(options),
      "设置无效 / Invalid options");
    requireRule(Object.keys(options).every(key => ["level", "rounds", "mode"].includes(key)),
      "未知设置 / Unknown option");
    const level = options.level === undefined ? "heat" : options.level;
    const rounds = options.rounds === undefined ? 3 : options.rounds;
    const mode = options.mode === undefined ? "mixed" : options.mode;
    requireRule(LEVELS.includes(level), "请选择有效的刺激等级 / Invalid intensity");
    requireRule(MODES.includes(mode), "请选择真心话、大冒险或混合模式 / Invalid mode");
    requireRule(Number.isInteger(rounds) && rounds >= 1 && rounds <= 10,
      "轮数须为 1 至 10 / Choose 1 to 10 rounds");
    validateRng(rng);
    return {
      type: "truth", version: 2, playerCount, phase: "playing", stage: "roll",
      current: 0, round: 1, rounds, level, mode, die: 0,
      dice: Array(playerCount).fill(0), tie: null, tieHistory: [], asker: -1, target: -1,
      kind: null, prompt: null, scores: Array(playerCount).fill(0),
      turns: 0, revision: 0, winners: [], history: [], used: {}
    };
  }

  function draw(game, kind, rng) {
    const key = game.level + "/" + kind, pool = pools[key];
    requireRule(pool && pool.length, "题库为空 / Prompt pool is empty");
    let used = Array.isArray(game.used[key]) ? game.used[key].slice() : [];
    let candidates = pool.filter(prompt => !used.includes(prompt.id));
    if (!candidates.length) {
      used = [];
      candidates = pool.filter(prompt => pool.length < 2 || prompt.id !== game.prompt?.id);
    }
    const selected = candidates[randomIndex(candidates.length, rng)];
    game.used[key] = used.concat(selected.id);
    game.prompt = { id: selected.id, zh: selected.zh, en: selected.en };
    game.kind = kind;
    game.stage = "prepare";
    game.current = game.asker;
  }

  function tiedSeats(dice, candidates, role) {
    const extreme = role === "high"
      ? Math.max(...candidates.map(index => dice[index]))
      : Math.min(...candidates.map(index => dice[index]));
    return candidates.filter(index => dice[index] === extreme);
  }

  function beginTie(game, role, candidates) {
    game.tie = { role, candidates: candidates.slice(), dice: Array(game.playerCount).fill(0) };
    game.current = candidates[0];
    game.stage = "roll";
  }

  function readyQuestion(game, rng) {
    requireRule(game.asker >= 0 && game.target >= 0 && game.asker !== game.target,
      "提问者与挑战者必须不同 / Asker and target must differ");
    game.tie = null;
    game.current = game.asker;
    if (game.mode === "mixed") game.stage = "choose";
    else draw(game, game.mode, rng);
  }

  function resolveLow(game, rng) {
    const seats = Array.from({ length: game.playerCount }, (_, index) => index);
    const low = tiedSeats(game.dice, seats, "low");
    if (low.length > 1) beginTie(game, "low", low);
    else { game.target = low[0]; readyQuestion(game, rng); }
  }

  function resolveAll(game, rng) {
    const seats = Array.from({ length: game.playerCount }, (_, index) => index);
    const high = tiedSeats(game.dice, seats, "high");
    if (high.length === game.playerCount) {
      beginTie(game, "all", seats);
    } else if (high.length > 1) {
      beginTie(game, "high", high);
    } else {
      game.asker = high[0];
      resolveLow(game, rng);
    }
  }

  function roll(game, actor, rng) {
    const die = randomIndex(6, rng) + 1;
    game.die = die;
    if (!game.tie) {
      game.dice[actor] = die;
      const next = game.dice.findIndex(value => value === 0);
      if (next >= 0) game.current = next;
      else resolveAll(game, rng);
      return;
    }
    const tie = game.tie;
    tie.dice[actor] = die;
    const next = tie.candidates.find(index => tie.dice[index] === 0);
    if (next !== undefined) { game.current = next; return; }
    game.tieHistory.push({ role: tie.role, candidates: tie.candidates.slice(), dice: tie.dice.slice() });
    if (tie.role === "all") {
      game.dice = tie.dice.slice();
      game.tie = null;
      resolveAll(game, rng);
      return;
    }
    const candidates = tiedSeats(tie.dice, tie.candidates, tie.role);
    if (candidates.length > 1) {
      beginTie(game, tie.role, candidates);
    } else if (tie.role === "high") {
      game.asker = candidates[0];
      game.tie = null;
      resolveLow(game, rng);
    } else {
      game.target = candidates[0];
      readyQuestion(game, rng);
    }
  }

  function finishContest(game, outcome) {
    const completed = outcome === "complete", points = completed ? 1 : 0;
    game.scores[game.target] += points;
    game.history.push({
      actor: game.target, asker: game.asker, target: game.target, round: game.round,
      dice: game.dice.slice(), kind: game.kind, prompt: clone(game.prompt),
      outcome, completed, points
    });
    if (game.history.length > HISTORY_LIMIT) game.history.splice(0, game.history.length - HISTORY_LIMIT);
    game.turns++;
    game.round = Math.min(game.rounds, game.turns + 1);
    game.stage = "roll";
    game.current = 0;
    game.die = 0;
    game.dice = Array(game.playerCount).fill(0);
    game.tieHistory = [];
    game.tie = null;
    game.asker = -1;
    game.target = -1;
    game.kind = null;
    game.prompt = null;
    if (game.turns === game.rounds) {
      game.phase = "over";
      const highest = Math.max(...game.scores);
      game.winners = game.scores.flatMap((score, index) => score === highest ? [index] : []);
    }
  }

  function act(game, actor, action, rng) {
    requireRule(game && typeof game === "object" && game.phase === "playing",
      "本局已结束 / Game is not playing");
    requireRule(Number.isInteger(actor) && actor === game.current,
      "还没轮到你 / Not your turn");
    requireRule(action !== null && typeof action === "object" && !Array.isArray(action),
      "操作无效 / Invalid action");
    requireRule(ACTIONS.includes(action.type), "未知操作 / Unknown action");
    requireRule(Object.keys(action).every(key => key === "type"
      || (action.type === "choose" && key === "kind")
      || (action.type === "ask" && key === "text")),
    "操作参数无效 / Invalid action fields");
    validateRng(rng);
    // A final die can trigger a prompt draw. Commit them together or not at all.
    const next = clone(game);
    switch (action.type) {
      case "roll":
        requireRule(next.stage === "roll", "现在不能掷骰子 / Cannot roll now");
        roll(next, actor, rng);
        break;
      case "choose":
        requireRule(next.stage === "choose" && actor === next.asker,
          "由最高点玩家选类型 / The highest roller chooses");
        requireRule(KINDS.includes(action.kind), "请选择真心话或大冒险 / Choose truth or dare");
        draw(next, action.kind, rng);
        break;
      case "reroll":
        requireRule(next.stage === "prepare" && actor === next.asker,
          "仅提问者可在确认前换题 / Only the asker can replace an unconfirmed question");
        draw(next, next.kind, rng);
        break;
      case "ask": {
        requireRule(next.stage === "prepare" && actor === next.asker,
          "仅提问者可确认问题 / Only the asker can confirm the question");
        if (Object.prototype.hasOwnProperty.call(action, "text")) {
          requireRule(typeof action.text === "string", "自定义题目须为文本 / Custom prompt must be text");
          const text = action.text.trim();
          requireRule([...text].length >= 1 && [...text].length <= 240,
            "自定义题目须为 1 至 240 字 / Custom prompt must contain 1 to 240 characters");
          requireRule(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text),
            "题目包含无效字符 / Prompt contains invalid characters");
          next.prompt = { id: "custom-" + next.round + "-" + (next.revision + 1), zh: text, en: "Custom prompt from the asker." };
        }
        next.stage = "challenge";
        next.current = next.target;
        break;
      }
      case "complete":
      case "skip":
        requireRule(next.stage === "challenge" && actor === next.target,
          "仅最低点玩家可回应 / Only the lowest roller can respond");
        finishContest(next, action.type);
        break;
    }
    next.revision++;
    Object.assign(game, next);
    return game;
  }

  function snapshot(game) { return clone(game); }
  return Object.freeze({ LEVELS, MODES, requireRule, createGame, act, snapshot });
});
