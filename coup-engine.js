"use strict";

// Coup base game. State is server-owned; publicGame is the only wire view.
const crypto = require("node:crypto");
const ROLES = Object.freeze(["Duke", "Assassin", "Captain", "Ambassador", "Contessa"]);
const ACTIONS = Object.freeze({ income: {}, aid: { blocks: ["Duke"] }, coup: { cost: 7, target: true },
  tax: { role: "Duke" }, assassinate: { role: "Assassin", cost: 3, target: true, blocks: ["Contessa"] },
  steal: { role: "Captain", target: true, blocks: ["Captain", "Ambassador"] }, exchange: { role: "Ambassador" } });
const ZH = { Duke: "公爵", Assassin: "刺客", Captain: "队长", Ambassador: "大使", Contessa: "女伯爵",
  income: "收入", aid: "外国援助", coup: "政变", tax: "征税", assassinate: "暗杀", steal: "偷窃", exchange: "交换" };
const PHASES = ["turn", "actionChallenge", "block", "blockChallenge", "lose", "exchange", "over"];
const clone = value => JSON.parse(JSON.stringify(value));
const fail = (ok, message = "操作无效 / Invalid action") => { if (!ok) throw new Error(message); };
const alive = (g, id) => Number.isInteger(id) && Boolean(g.players[id] && !g.players[id].eliminated);
const activeCards = p => p.cards.filter(c => !c.revealed);
const living = g => g.players.filter(p => !p.eliminated).map(p => p.id);
function random(g) {
  g.rng = (g.rng + 0x6D2B79F5) >>> 0;
  let n = g.rng; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
  return ((n ^ n >>> 14) >>> 0) / 4294967296;
}
function shuffle(g, values) { for (let i = values.length - 1; i > 0; i--) { const j = Math.floor(random(g) * (i + 1)); [values[i], values[j]] = [values[j], values[i]]; } return values; }
function log(g, text, en) { g.log.push({ id: g.logSequence++, text, en }); if (g.log.length > 120) g.log.shift(); }
function name(g, i) { return g.players[i].name; }
function phase(g, next, choice = {}) { g.phase = next; g.choice = choice; }
function createGame(names, options = {}) {
  fail(Array.isArray(names) && names.length >= 2 && names.length <= 6, "需要 2–6 位玩家 / Requires 2–6 players");
  const g = { version: 1, rng: Number.isInteger(options.seed) ? options.seed >>> 0 : crypto.randomBytes(4).readUInt32LE(),
    players: names.map((p, id) => ({ id, name: String(typeof p === "string" ? p : p?.name || `Player ${id + 1}`).slice(0, 40),
      coins: names.length === 2 && id === 0 ? 1 : 2, cards: [], eliminated: false })),
    deck: [], phase: "turn", choice: {}, pending: null, current: 0, turn: 1, revision: 0, winner: null, log: [], logSequence: 0 };
  const roles = shuffle(g, ROLES.flatMap(role => [role, role, role]));
  g.deck = roles.map((role, i) => ({ id: `c${i + 1}`, role, revealed: false }));
  for (const p of g.players) p.cards = [g.deck.pop(), g.deck.pop()];
  log(g, "每人获得两张隐藏角色牌，宫廷博弈开始。", "Each player receives two hidden influence cards. The court opens.");
  return g;
}
function checkWinner(g) {
  const ids = living(g); if (ids.length !== 1) return false;
  g.winner = ids[0]; g.pending = null; phase(g, "over");
  log(g, `${name(g, g.winner)} 获胜。`, `${name(g, g.winner)} wins.`); return true;
}
function finishTurn(g) {
  if (checkWinner(g)) return;
  const old = g.current; let next = (old + 1) % g.players.length;
  while (!alive(g, next)) next = (next + 1) % g.players.length;
  g.current = next; g.turn++; g.pending = null; phase(g, "turn");
}
function lose(g, id, reason, reasonEn, next) {
  if (!alive(g, id)) return resume(g, next);
  phase(g, "lose", { playerId: id, reason, reasonEn, next });
}
function respondPhase(g, kind, eligible, extras = {}) {
  if (!eligible.length) return kind === "actionChallenge" ? afterClaim(g) : kind === "blockChallenge" ? finishTurn(g) : resolve(g);
  phase(g, kind, { eligible, responded: [], ...extras });
}
function afterClaim(g) {
  if (checkWinner(g)) return;
  const p = g.pending, spec = ACTIONS[p.action];
  if (!alive(g, p.actorId)) return finishTurn(g);
  if (spec.target && !alive(g, p.targetId)) return resolve(g);
  if (spec.blocks) respondPhase(g, "block", p.action === "aid" ? living(g).filter(i => i !== p.actorId) : [p.targetId], { roles: spec.blocks.slice() });
  else resolve(g);
}
function resolve(g) {
  const p = g.pending; if (!p || !alive(g, p.actorId)) return finishTurn(g);
  const actor = g.players[p.actorId];
  if (p.action === "income" || p.action === "aid" || p.action === "tax") {
    const count = { income: 1, aid: 2, tax: 3 }[p.action]; actor.coins += count;
    log(g, `${actor.name} 获得 ${count} 金币。`, `${actor.name} takes ${count} coins.`);
  } else if (p.action === "coup" || p.action === "assassinate") {
    if (alive(g, p.targetId)) return lose(g, p.targetId,
      `${actor.name} 对你发动了${ZH[p.action]}。`, `${actor.name} targeted you with ${p.action === "coup" ? "a coup" : "an assassination"}.`, "finish");
  } else if (p.action === "steal") {
    // The rulebook's caught-block example still transfers the stolen coins when
    // the target loses their last influence; only the remainder returns to bank.
    const target = g.players[p.targetId], count = Math.min(2, target.eliminated ? p.deadTargetCoins || 0 : target.coins);
    if (!target.eliminated) target.coins -= count; actor.coins += count; p.deadTargetCoins = 0;
    log(g, `${actor.name} 从 ${target.name} 处取得 ${count} 金币。`, `${actor.name} steals ${count} coins from ${target.name}.`);
  } else if (p.action === "exchange") {
    const own = activeCards(actor), drawn = [g.deck.pop(), g.deck.pop()];
    fail(drawn.every(Boolean), "牌堆不足 / Not enough cards");
    return phase(g, "exchange", { playerId: p.actorId, keepCount: own.length, choices: [...own, ...drawn] });
  }
  finishTurn(g);
}
function resume(g, next) {
  if (checkWinner(g)) return;
  if (next === "afterClaim") afterClaim(g);
  else if (next === "resolve") resolve(g);
  else finishTurn(g);
}
function legalActions(g, viewer = g.current) {
  if (g.phase !== "turn" || viewer !== g.current || !alive(g, viewer)) return [];
  const coins = g.players[viewer].coins;
  if (coins >= 10) return ["coup"];
  return Object.keys(ACTIONS).filter(key => coins >= (ACTIONS[key].cost || 0));
}
function requiredActors(g) {
  if (g.phase === "over") return [];
  if (g.phase === "turn") return [g.current];
  if (g.phase === "lose" || g.phase === "exchange") return [g.choice.playerId];
  return g.choice.eligible.filter(id => !g.choice.responded.includes(id) && alive(g, id));
}
function challenge(g, challenger) {
  const counter = g.phase === "blockChallenge", p = g.pending;
  const claimant = counter ? p.block.playerId : p.actorId, role = counter ? p.block.role : ACTIONS[p.action].role;
  const person = g.players[claimant], proof = person.cards.find(c => !c.revealed && c.role === role);
  log(g, `${name(g, challenger)} 质疑 ${person.name} 的${ZH[role]}声明。`, `${name(g, challenger)} challenges ${person.name}'s ${role} claim.`);
  if (proof) {
    const index = person.cards.indexOf(proof);
    g.deck.push(proof); shuffle(g, g.deck); person.cards[index] = g.deck.pop();
    log(g, `${person.name} 展示${ZH[role]}，洗回牌堆并抽取替代牌。`, `${person.name} proves ${role}, shuffles it into the deck and draws a replacement.`);
    lose(g, challenger, `质疑失败：${person.name} 确实持有${ZH[role]}。`, `Challenge failed: ${person.name} proved ${role}.`, counter ? "finish" : "afterClaim");
  } else {
    if (!counter && p.costPaid) { person.coins += p.costPaid; p.costPaid = 0; }
    log(g, `${person.name} 无法展示${ZH[role]}，声明被揭穿。`, `${person.name} cannot show ${role}; the bluff is exposed.`);
    lose(g, claimant, `${name(g, challenger)} 揭穿了你的${ZH[role]}声明。`, `${name(g, challenger)} exposed your ${role} claim.`, counter ? "resolve" : "finish");
  }
}
function apply(g, actorId, action) {
  fail(Number.isInteger(actorId) && requiredActors(g).includes(actorId), "现在不需要你操作 / You cannot act now");
  fail(action && typeof action === "object" && !Array.isArray(action));
  const allowed = { action: ["type", "action", "targetId"], pass: ["type"], challenge: ["type"], block: ["type", "role"], lose: ["type", "cardId"], exchange: ["type", "cardIds"] };
  fail(Object.hasOwn(allowed, action.type) && Object.keys(action).every(k => allowed[action.type].includes(k)), "操作字段无效 / Invalid action fields");
  const actor = g.players[actorId];
  if (g.phase === "turn") {
    fail(action.type === "action" && legalActions(g).includes(action.action), "这个行动目前不可用 / Action unavailable");
    const spec = ACTIONS[action.action];
    if (spec.target) fail(alive(g, action.targetId) && action.targetId !== actorId, "请选择其他存活玩家 / Choose another surviving player");
    else fail(action.targetId === undefined, "此行动不需要目标 / This action has no target");
    actor.coins -= spec.cost || 0;
    g.pending = { action: action.action, actorId, targetId: spec.target ? action.targetId : null, costPaid: spec.cost || 0, block: null };
    log(g, `${actor.name} 宣布${ZH[action.action]}${spec.target ? ` → ${name(g, action.targetId)}` : ""}。`, `${actor.name} declares ${action.action}${spec.target ? ` against ${name(g, action.targetId)}` : ""}.`);
    if (spec.role) respondPhase(g, "actionChallenge", living(g).filter(i => i !== actorId));
    else if (spec.blocks) afterClaim(g); else resolve(g);
  } else if (g.phase === "lose") {
    fail(action.type === "lose");
    const card = actor.cards.find(c => c.id === action.cardId && !c.revealed);
    fail(card, "请选择自己的未公开角色牌 / Choose your own hidden influence");
    const next = g.choice.next; card.revealed = true;
    log(g, `${actor.name} 公开${ZH[card.role]}，失去一点影响力。`, `${actor.name} reveals ${card.role} and loses one influence.`);
    actor.eliminated = activeCards(actor).length === 0;
    if (actor.eliminated) {
      if (g.pending?.action === "steal" && g.pending.targetId === actorId && next !== "finish") g.pending.deadTargetCoins = actor.coins;
      actor.coins = 0; log(g, `${actor.name} 已出局。`, `${actor.name} is eliminated.`);
    }
    resume(g, next);
  } else if (g.phase === "exchange") {
    fail(action.type === "exchange" && Array.isArray(action.cardIds));
    const c = g.choice;
    fail(action.cardIds.length === c.keepCount && new Set(action.cardIds).size === c.keepCount && action.cardIds.every(id => c.choices.some(card => card.id === id)), "请选择指定数量的不同角色牌 / Choose the required number of distinct cards");
    actor.cards = [...actor.cards.filter(card => card.revealed), ...c.choices.filter(card => action.cardIds.includes(card.id))];
    g.deck.push(...c.choices.filter(card => !action.cardIds.includes(card.id))); shuffle(g, g.deck);
    log(g, `${actor.name} 完成了交换。`, `${actor.name} completes the exchange.`); finishTurn(g);
  } else if (g.phase === "block") {
    fail(action.type === "pass" || action.type === "block");
    if (action.type === "block") {
      fail(g.choice.roles.includes(action.role), "这个角色不能反制此行动 / This role cannot block that action");
      g.pending.block = { playerId: actorId, role: action.role };
      log(g, `${actor.name} 声明${ZH[action.role]}反制。`, `${actor.name} claims ${action.role} to block.`);
      respondPhase(g, "blockChallenge", living(g).filter(i => i !== actorId));
    } else { g.choice.responded.push(actorId); if (!requiredActors(g).length) resolve(g); }
  } else {
    fail(action.type === "pass" || action.type === "challenge");
    if (action.type === "challenge") challenge(g, actorId);
    else {
      g.choice.responded.push(actorId);
      if (!requiredActors(g).length) g.phase === "actionChallenge" ? afterClaim(g) : finishTurn(g);
    }
  }
}
function act(g, actorId, action) {
  // Validate on a copy: even a malformed exchange cannot partially spend coins,
  // reveal a card, consume randomness, or invalidate somebody else's decision.
  const draft = clone(g); apply(draft, actorId, action); draft.revision++;
  for (const key of Object.keys(g)) delete g[key]; Object.assign(g, draft); return g;
}
function endGame(g) {
  fail(g && g.phase !== "over", "本局已经结束 / This game has already ended");
  validateRestore(g);
  const draft = clone(g);
  if (draft.phase === "exchange") {
    const original = new Set(draft.players[draft.choice.playerId].cards.map(c => c.id));
    draft.deck.push(...draft.choice.choices.filter(c => !original.has(c.id)));
    shuffle(draft, draft.deck);
  }
  draft.pending = null; draft.winner = null; draft.endReason = "hostEnded";
  phase(draft, "over"); draft.revision++;
  log(draft, "房主提前结束了本局，不判定胜者。", "The host ended this game early. No winner is declared.");
  for (const key of Object.keys(g)) delete g[key]; Object.assign(g, draft); return g;
}
function publicGame(g, you) {
  const choice = clone(g.choice);
  delete choice.next;
  if (g.phase === "exchange" && choice.playerId !== you) delete choice.choices;
  const pending = g.pending ? clone(g.pending) : null; if (pending) delete pending.deadTargetCoins;
  return { version: g.version, phase: g.phase, choice, current: g.current, turn: g.turn, round: g.turn, revision: g.revision,
    status: g.phase === "over" ? "finished" : "playing", winner: g.winner, endReason: g.endReason || null, pending, deckCount: g.deck.length,
    players: g.players.map(p => ({ id: p.id, name: p.name, coins: p.coins, eliminated: p.eliminated,
      cards: p.cards.map((c, slot) => ({ id: p.id === you || c.revealed ? c.id : `hidden-${p.id}-${slot}`,
        role: p.id === you || c.revealed ? c.role : null, revealed: c.revealed })) })),
    log: clone(g.log), legalActions: legalActions(g, you) };
}
function chooseBotAction(game, actorId, rng = Math.random) {
  if (!requiredActors(game).includes(actorId)) return null;
  const g = publicGame(game, actorId), me = g.players[actorId], hand = activeCards(me), has = role => hand.some(c => c.role === role);
  const roll = () => { const n = Number(rng()); return Number.isFinite(n) ? Math.max(0, Math.min(.999999, n)) : .5; };
  const visibleCount = role => g.players.flatMap(p => p.cards).filter(c => c.role === role).length;
  const value = c => ({ Duke: me.coins < 7 ? 5 : 3, Assassin: me.coins >= 3 ? 4 : 2, Captain: 3.5, Ambassador: 1, Contessa: 3 })[c.role];
  if (g.phase === "lose") return { type: "lose", cardId: hand.slice().sort((a, b) => value(a) - value(b))[0].id };
  if (g.phase === "exchange") {
    const pool = g.choice.choices.slice(), kept = [];
    while (kept.length < g.choice.keepCount) { pool.sort((a, b) => (value(b) - (kept.some(c => c.role === b.role) ? 3 : 0)) - (value(a) - (kept.some(c => c.role === a.role) ? 3 : 0))); kept.push(pool.shift()); }
    return { type: "exchange", cardIds: kept.map(c => c.id) };
  }
  if (g.phase === "block") {
    const truthful = g.choice.roles.find(has);
    if (truthful) return { type: "block", role: truthful };
    const chance = g.pending.action === "assassinate" && hand.length === 1 ? .8 : .1;
    return roll() < chance ? { type: "block", role: g.choice.roles[0] } : { type: "pass" };
  }
  if (g.phase === "actionChallenge" || g.phase === "blockChallenge") {
    const role = g.phase === "blockChallenge" ? g.pending.block.role : ACTIONS[g.pending.action].role;
    const lethal = g.pending.action === "assassinate" && g.pending.targetId === actorId && hand.length === 1 && !has("Contessa");
    return { type: visibleCount(role) >= 3 || roll() < (lethal ? .35 : .065) ? "challenge" : "pass" };
  }
  const opponents = g.players.filter(p => !p.eliminated && p.id !== actorId);
  const target = opponents.slice().sort((a, b) => activeCards(b).length * 4 + b.coins - activeCards(a).length * 4 - a.coins)[0];
  if (me.coins >= 7) return { type: "action", action: "coup", targetId: target.id };
  if (me.coins >= 3 && has("Assassin") && roll() < .8) return { type: "action", action: "assassinate", targetId: target.id };
  if (has("Duke") || roll() < .23) return { type: "action", action: "tax" };
  const rich = opponents.slice().sort((a, b) => b.coins - a.coins)[0];
  if (has("Captain") && rich.coins >= 2) return { type: "action", action: "steal", targetId: rich.id };
  if (has("Ambassador") && roll() < .08) return { type: "action", action: "exchange" };
  return { type: "action", action: roll() < .5 ? "aid" : "income" };
}

function validateRestore(g) {
  const err = "政变存档无效 / Invalid Coup save";
  const ok = condition => fail(condition, err);
  const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
  const plain = o => o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
  const keys = (o, allowed, required = allowed) => plain(o) && Object.keys(o).every(k => allowed.includes(k)) && required.every(k => Object.hasOwn(o, k));
  const coreKeys = ["version", "rng", "players", "deck", "phase", "choice", "pending", "current", "turn", "revision", "winner", "log", "logSequence"];
  ok(keys(g, [...coreKeys, "endReason"], coreKeys));
  ok(g.endReason === undefined || g.endReason === null || g.endReason === "hostEnded" && g.phase === "over");
  ok(g.version === 1 && int(g.rng, 0, 4294967295) && PHASES.includes(g.phase));
  ok(Array.isArray(g.players) && g.players.length >= 2 && g.players.length <= 6);
  ok(int(g.current, 0, g.players.length - 1) && int(g.turn, 1, 1000000) && int(g.revision, 0, 10000000) && g.revision >= g.turn - 1);
  const all = [], byId = new Map();
  const card = c => keys(c, ["id", "role", "revealed"]) && /^c(?:[1-9]|1[0-5])$/.test(c.id) && ROLES.includes(c.role) && typeof c.revealed === "boolean";
  const add = c => { ok(card(c) && !byId.has(c.id)); byId.set(c.id, c); all.push(c); };
  g.players.forEach((p, i) => {
    ok(keys(p, ["id", "name", "coins", "cards", "eliminated"]));
    ok(p.id === i && typeof p.name === "string" && p.name.length <= 40 && int(p.coins, 0, 1000000));
    ok(Array.isArray(p.cards) && p.cards.length === 2 && typeof p.eliminated === "boolean");
    p.cards.forEach(add); ok(p.eliminated === p.cards.every(c => c.revealed)); if (p.eliminated) ok(p.coins === 0);
  });
  ok(Array.isArray(g.deck) && g.deck.length <= 11); g.deck.forEach(c => { add(c); ok(!c.revealed); });
  const playing = living(g);
  ok(g.phase === "over" ? g.endReason === "hostEnded" ? playing.length >= 2 && g.winner === null : playing.length === 1 && g.winner === playing[0] : playing.length >= 2 && g.winner === null);
  if (g.phase !== "over") ok(alive(g, g.current));
  ok(Array.isArray(g.log) && g.log.length <= 120 && int(g.logSequence, 0, 100000000));
  let previous = -1;
  for (const item of g.log) { ok(keys(item, ["id", "text", "en"]) && int(item.id, 0, g.logSequence - 1) && item.id > previous && typeof item.text === "string" && item.text.length <= 500 && typeof item.en === "string" && item.en.length <= 500); previous = item.id; }
  if (["turn", "over"].includes(g.phase)) ok(g.pending === null && keys(g.choice, []));
  else {
    const p = g.pending;
    ok(keys(p, ["action", "actorId", "targetId", "costPaid", "block", "deadTargetCoins"], ["action", "actorId", "targetId", "costPaid", "block"]));
    ok(Object.hasOwn(ACTIONS, p.action) && p.actorId === g.current);
    const spec = ACTIONS[p.action];
    ok(spec.target ? int(p.targetId, 0, g.players.length - 1) && p.targetId !== p.actorId : p.targetId === null);
    ok(p.costPaid === (spec.cost || 0) || g.phase === "lose" && p.costPaid === 0 && g.choice.next === "finish");
    if (Object.hasOwn(p, "deadTargetCoins")) ok(p.action === "steal" && int(p.deadTargetCoins, 0, 1000000));
    if (p.block !== null) ok(keys(p.block, ["playerId", "role"]) && int(p.block.playerId, 0, g.players.length - 1) && p.block.playerId !== p.actorId && spec.blocks?.includes(p.block.role) && (p.action === "aid" || p.block.playerId === p.targetId));
    const c = g.choice;
    if (g.phase === "exchange") {
      ok(p.action === "exchange" && p.block === null && alive(g, p.actorId));
      ok(keys(c, ["playerId", "keepCount", "choices"]) && c.playerId === p.actorId && c.keepCount === activeCards(g.players[p.actorId]).length && Array.isArray(c.choices) && c.choices.length === c.keepCount + 2);
      const seen = new Set();
      c.choices.forEach(x => { ok(card(x) && !x.revealed && !seen.has(x.id)); seen.add(x.id); if (byId.has(x.id)) ok(g.players[p.actorId].cards.some(own => !own.revealed && own.id === x.id && own.role === x.role)); else add(x); });
      ok(activeCards(g.players[p.actorId]).every(x => seen.has(x.id)));
    } else if (g.phase === "lose") {
      ok(keys(c, ["playerId", "reason", "reasonEn", "next"]) && alive(g, c.playerId) && typeof c.reason === "string" && c.reason.length <= 500 && typeof c.reasonEn === "string" && c.reasonEn.length <= 500 && ["finish", "afterClaim", "resolve"].includes(c.next));
      if (c.next === "afterClaim") ok(Boolean(spec.role) && p.block === null && c.playerId !== p.actorId && alive(g, p.actorId));
      if (c.next === "resolve") ok(p.block !== null && c.playerId === p.block.playerId && alive(g, p.actorId));
      if (c.next === "finish") ok(["coup", "assassinate"].includes(p.action) && c.playerId === p.targetId || (p.block !== null ? c.playerId !== p.block.playerId : c.playerId === p.actorId));
    } else {
      ok(alive(g, p.actorId));
      ok(keys(c, g.phase === "block" ? ["eligible", "responded", "roles"] : ["eligible", "responded"]));
      ok(Array.isArray(c.eligible) && c.eligible.length > 0 && c.eligible.length <= 5 && new Set(c.eligible).size === c.eligible.length && c.eligible.every(id => alive(g, id)));
      ok(Array.isArray(c.responded) && new Set(c.responded).size === c.responded.length && c.responded.every(id => c.eligible.includes(id)) && c.responded.length < c.eligible.length);
      if (g.phase === "actionChallenge") ok(Boolean(spec.role) && p.block === null && c.eligible.length === playing.length - 1 && c.eligible.every(id => id !== p.actorId));
      if (g.phase === "block") ok(Boolean(spec.blocks) && p.block === null && JSON.stringify(c.roles) === JSON.stringify(spec.blocks) && (p.action === "aid" ? c.eligible.length === playing.length - 1 && c.eligible.every(id => id !== p.actorId) : c.eligible.length === 1 && c.eligible[0] === p.targetId));
      if (g.phase === "blockChallenge") ok(p.block !== null && alive(g, p.block.playerId) && c.eligible.length === playing.length - 1 && c.eligible.every(id => id !== p.block.playerId));
    }
  }
  ok(all.length === 15 && ROLES.every(role => all.filter(c => c.role === role).length === 3));
  ok(g.deck.length === 15 - g.players.length * 2 - (g.phase === "exchange" ? 2 : 0));
  return true;
}
module.exports = { ROLES, ACTIONS, createGame, act, endGame, publicGame, requiredActors, legalActions, chooseBotAction, validateRestore };
