"use strict";

const crypto = require("node:crypto");
const Avatar = require("./avatar-data");
const MAX_BYTES = 2 * 1024 * 1024;
const FORMAT = "boardclub-save";
const fail = (ok, message = "存档损坏或版本不支持 / Invalid or unsupported save") => { if (!ok) throw new Error(message); };
const copy = (value) => JSON.parse(JSON.stringify(value));
const pick = (value, keys) => Object.fromEntries(keys.filter(k => value[k] !== undefined).map(k => [k, copy(value[k])]));
const integer = (v, low, high) => Number.isSafeInteger(v) && v >= low && v <= high;
const CONFIG = {
  catan: ["mapId", "layout", "thieves", "maxPlayers", "skins"], bridge: ["boards", "scores"],
  gomoku: ["difficulty"], xiangqi: ["difficulty"], truth: ["level", "mode", "rounds", "maxPlayers", "selection", "skipLimit"],
  million: ["capacity", "settings", "edition"], poker: ["maxPlayers", "startingStack", "blindInterval", "practiceMode"]
};
const POKER = ["status", "handNumber", "dealer", "smallBlind", "bigBlind", "blindLevel", "smallBlindAmount", "bigBlindAmount", "street", "board", "burned", "deck", "pot", "currentBet", "minRaise", "raiseCount", "lastAggressor", "actor", "message", "log", "winners", "wasShowdown", "autoNext"];
const POKER_SEAT = ["chips", "hand", "bet", "totalBet", "folded", "showCards", "allIn"];

function checkTree(value) {
  let nodes = 0;
  function visit(v, depth) {
    fail(++nodes <= 160000 && depth <= 32);
    if (v === null || typeof v === "boolean") return;
    if (typeof v === "number") { fail(Number.isFinite(v) && Math.abs(v) <= Number.MAX_SAFE_INTEGER); return; }
    if (typeof v === "string") { fail(v.length <= 16000); return; }
    fail(v && typeof v === "object" && (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype));
    for (const [k, child] of Object.entries(v)) {
      fail(!["__proto__", "constructor", "prototype", "token", "clientId", "socket", "ws", "socialId"].includes(k));
      visit(child, depth + 1);
    }
  }
  visit(value, 0);
}

function clearMillionConsents(g) {
  g.players.forEach(p => { p.ready = false; });
  g.offers.forEach(o => { if (o.status === "pending") o.status = "stale"; });
  if (g.edition === "2024" && g.phase === "negotiation") {
    g.vote.open = false;
    g.vote.votes = g.players.map(() => null);
  }
}

function anonymizeMillion(g) {
  const seatName = i => `座位 ${i + 1} / Seat ${i + 1}`;
  const names = g.players.map(p => p.name);
  for (const state of [g, g.result, ...(g.history || [])].filter(Boolean)) {
    const replacements = new Map();
    state.players.forEach((p, i) => {
      for (const name of [names[i], p.name]) if (typeof name === "string" && name && name !== seatName(i)) replacements.set(name, seatName(i));
      p.name = seatName(i);
    });
    // Logs contain rendered names as well as seat indices; anonymize both languages.
    const escaped = [...replacements.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (escaped.length) for (const entry of state.logs || []) for (const key of ["zh", "en"]) {
      if (typeof entry[key] === "string") entry[key] = entry[key].replace(new RegExp(escaped.join("|"), "g"), name => replacements.get(name));
    }
  }
}

function validateModernMillion(g, count, config) {
  const Data = require("./million-data"), order = Data.MODERN_ROLE_IDS, roles = Data.rolesForCount(count, "2024");
  const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const array = (v, max) => Array.isArray(v) && v.length <= max;
  const same = (a, b) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
  const actor = v => integer(v, 0, count - 1), slot = v => integer(v, 0, g.slotsPerPlayer - 1);
  const role = v => roles.includes(v), money = v => integer(v, 0, 1000000);
  const resolved = ["results", "over"].includes(g.phase);
  const heisting = ["snitch", "mentalist", "results", "over"].includes(g.phase);
  fail(g.type === "million" && ["planning", "claims", "negotiation", "snitch", "mentalist", "results", "over"].includes(g.phase));
  fail(g.maxRounds === 5 && integer(g.round, 1, g.maxRounds) && actor(g.leader));
  fail(g.slotsPerPlayer === (count === 3 ? 2 : 1) && same(g.availableRoles, roles));
  for (const settings of [g.settings, config.settings]) {
    fail(object(settings) && Object.keys(settings).every(k => ["bruteShares", "noRepeat"].includes(k)) && settings.bruteShares === true && settings.noRepeat === false);
  }
  // The club's bonus deck retains mapped legacy roles, even outside this count's pool.
  fail([800, 900, 1000, 1100, 1200].includes(g.loot) && g.ante === 200 && (g.bonusRole === null || order.includes(g.bonusRole)));
  fail(money(g.lootPool) && money(g.publicFund) && integer(g.reserve, -1000000, 1000000) && integer(g.offerSequence, 0, 10000000));
  fail(array(g.players, count) && g.players.length === count);
  function checkSlots(list) {
    fail(array(list, g.slotsPerPlayer) && list.length === g.slotsPerPlayer);
    list.forEach((s, i) => {
      fail(object(s) && s.slot === i && (s.role === null || role(s.role)) && typeof s.withdrawn === "boolean" && typeof s.refunded === "boolean");
      fail(integer(s.paidAnte, 0, g.ante) && money(s.share) && ["waiting", "active", "withdrawn", "duplicate", "eliminated", "sharing", "alone"].includes(s.status));
      fail(s.role === null ? s.status === "waiting" && !s.withdrawn && !s.refunded && s.paidAnte === 0 && s.share === 0 : s.status !== "waiting");
      fail(s.withdrawn === (s.status === "withdrawn"));
    });
    const chosen = list.filter(s => s.role !== null).map(s => s.role);
    fail(new Set(chosen).size === chosen.length);
  }
  for (const p of g.players) {
    fail(object(p) && typeof p.name === "string" && money(p.cash) && money(p.roundStartCash));
    fail(p.threats === 0 && p.pendingThreats === 0 && typeof p.locked === "boolean" && typeof p.ready === "boolean");
    fail(array(p.lastRoles, g.slotsPerPlayer) && p.lastRoles.every(role));
    checkSlots(p.slots);
    fail(p.slots.every(s => p.locked ? role(s.role) : s.role === null));
    fail(g.phase === "planning" || p.locked);
    if (["planning", "claims"].includes(g.phase)) fail(p.slots.every(s => !s.withdrawn && ["waiting", "active"].includes(s.status)));
  }
  const allSlots = g.players.flatMap(p => p.slots);
  fail(array(g.revealedCards, allSlots.length - 1) && g.revealedCards.every(role));
  if (g.phase === "planning") fail(g.hiddenCard === null && g.revealedCards.length === 0 && g.players.some(p => !p.locked));
  else {
    fail(role(g.hiddenCard));
    fail(same([...g.revealedCards, g.hiddenCard].sort(), allSlots.map(s => s.role).sort()));
  }
  function checkIntel(intel) {
    fail(array(intel, count) && intel.length === count && intel.every(v => object(v) && Object.keys(v).length === 0));
  }
  checkIntel(g.intel);
  fail(array(g.claims, count) && g.claims.length === count);
  for (const claim of g.claims) fail(claim === null || (array(claim, g.slotsPerPlayer) && claim.length === g.slotsPerPlayer && claim.every(role)));
  if (g.phase === "claims") {
    const made = g.claims.filter(c => c !== null).length;
    fail(made < count && g.claimActor === (g.leader + made) % count);
    for (let i = 0; i < count; i++) fail((g.claims[(g.leader + i) % count] !== null) === (i < made));
  } else {
    fail(g.claimActor === null && g.claims.every(c => g.phase === "planning" ? c === null : c !== null));
  }
  fail(object(g.vote) && typeof g.vote.open === "boolean" && integer(g.vote.attempt, 0, 10000000));
  fail(array(g.vote.votes, count) && g.vote.votes.length === count && g.vote.votes.every(v => v === null || typeof v === "boolean"));
  fail(!g.vote.open || (g.phase === "negotiation" && g.vote.attempt > 0));
  if (["planning", "claims"].includes(g.phase)) fail(g.vote.attempt === 0 && g.vote.votes.every(v => v === null));
  if (heisting) {
    fail(object(g.heist) && integer(g.heist.cursor, 1, order.length) && same(g.heist.revealed, order.slice(0, g.heist.cursor)));
    const cursor = g.phase === "snitch" ? order.indexOf("tech") + 1 : g.phase === "mentalist" ? order.indexOf("mentalist") + 1 : order.length;
    fail(g.heist.cursor === cursor && g.publicFund === 0);
  } else fail(g.heist === null);
  const live = s => !s.withdrawn && ["active", "sharing"].includes(s.status);
  if (g.snitch !== null) {
    const s = g.snitch;
    fail(object(s) && actor(s.actor) && s.player === s.actor && slot(s.slot));
    const tech = g.players[s.actor].slots[s.slot];
    fail(tech.role === "tech" && (live(tech) || (resolved && tech.status === "alone" && !tech.withdrawn)));
    fail(same(s.options, [...new Set(g.revealedCards.filter(r => r !== "tech"))]));
    fail(s.role === null || s.options.includes(s.role));
    fail(heisting && (g.phase === "snitch" ? s.role === null && s.options.length > 0 : s.options.length === 0 || s.role !== null));
  } else fail(g.phase !== "snitch");
  if (g.phase === "mentalist") {
    const m = g.mentalist;
    fail(object(m) && actor(m.actor) && slot(m.slot));
    fail(g.players[m.actor].slots[m.slot].role === "mentalist" && live(g.players[m.actor].slots[m.slot]));
    const targets = g.players.flatMap((p, owner) => p.slots.flatMap(s => live(s) && ["tech", "acrobat", "brute"].includes(s.role) ? [{ owner, slot: s.slot, role: s.role }] : []));
    fail(targets.length > 0 && array(m.targets, allSlots.length) && m.targets.length === targets.length);
    m.targets.forEach((t, i) => fail(object(t) && actor(t.owner) && slot(t.slot) && t.owner === targets[i].owner && t.slot === targets[i].slot && t.role === targets[i].role));
  } else fail(g.mentalist === null);
  fail(g.phase === "results" ? actor(g.nextLeader) : g.nextLeader === null);
  if (resolved) fail(g.lootPool === 0);
  fail(array(g.offers, 5000));
  const offerIds = new Set();
  for (const o of g.offers) {
    fail(object(o) && typeof o.id === "string" && o.id.length <= 80 && !offerIds.has(o.id) && o.round === g.round);
    offerIds.add(o.id);
    fail([o.payer, o.quitter, o.proposer, o.responder].every(actor) && o.payer !== o.quitter && slot(o.slot));
    fail((o.proposer === o.payer && o.responder === o.quitter) || (o.proposer === o.quitter && o.responder === o.payer));
    fail(integer(o.amount, 100, 1000000) && o.amount % 100 === 0 && ["pending", "stale", "expired", "accepted", "rejected", "cancelled"].includes(o.status));
  }
  function checkLogs(logs) {
    fail(array(logs, 10000));
    for (const entry of logs) {
      fail(object(entry) && typeof entry.type === "string" && typeof entry.zh === "string" && typeof entry.en === "string");
      for (const key of ["owner", "from", "to"]) if (entry[key] !== undefined) fail(actor(entry[key]));
      if (entry.slot !== undefined) fail(slot(entry.slot));
      if (entry.role !== undefined) fail(role(entry.role));
      if (entry.roles !== undefined) fail(array(entry.roles, g.slotsPerPlayer) && entry.roles.every(role));
    }
  }
  function checkResult(r, round) {
    fail(object(r) && r.round === round && actor(r.leader) && [800, 900, 1000, 1100, 1200].includes(r.loot) && r.ante === 200);
    fail((r.bonusRole === null || order.includes(r.bonusRole)) && (r.namedRole === null || role(r.namedRole)));
    for (const key of ["totalLoot", "share", "remainder", "penalty", "topUp"]) fail(money(r[key]));
    fail(array(r.players, count) && r.players.length === count);
    for (const p of r.players) {
      fail(object(p) && typeof p.name === "string" && money(p.cash) && integer(p.delta, -1000000, 1000000));
      checkSlots(p.slots); fail(p.slots.every(s => role(s.role)));
    }
    fail(array(r.revealedCards, allSlots.length - 1) && r.revealedCards.length === allSlots.length - 1 && r.revealedCards.every(role));
    fail(array(r.participants, allSlots.length));
    const refs = new Set();
    for (const s of r.participants) {
      fail(object(s) && actor(s.owner) && slot(s.slot) && role(s.role) && r.players[s.owner].slots[s.slot].role === s.role);
      const key = `${s.owner}:${s.slot}`; fail(!refs.has(key)); refs.add(key);
    }
    fail(array(r.splitting, count) && r.splitting.every(actor) && new Set(r.splitting).size === r.splitting.length);
    checkIntel(r.privateIntel); checkLogs(r.logs);
  }
  checkLogs(g.logs);
  fail(array(g.history, g.maxRounds) && g.history.length === g.round - (resolved ? 0 : 1));
  g.history.forEach((r, i) => checkResult(r, i + 1));
  if (resolved) checkResult(g.result, g.round); else fail(g.result === null);
  fail(array(g.winners, 1) && g.winners.every(actor));
  fail(g.phase === "over" ? g.winners.length === 1 && ["target", "round-limit"].includes(g.winReason) : g.winners.length === 0 && g.winReason === null);
}

function encode(kind, room) {
  const seats = kind === "poker" ? room.players : room.seats;
  fail(CONFIG[kind] && seats.every(Boolean));
  let progress;
  if (kind === "poker") {
    progress = pick(room, POKER);
    progress.players = seats.map(p => pick(p, POKER_SEAT));
    progress.acted = [...room.acted].map(id => seats.findIndex(p => p.clientId === id)).filter(i => i >= 0);
  } else if (["gomoku", "xiangqi"].includes(kind)) {
    progress = pick(room.game, ["moves", "phase", "winner", "reason", "revision"]);
  } else {
    progress = copy(room.game);
    if (kind === "million") anonymizeMillion(progress);
    else if (progress.players) progress.players.forEach((p, i) => { p.name = `座位 ${i + 1} / Seat ${i + 1}`; });
    // Pending offers and ready acknowledgements belong to the departing people.
    if (kind === "catan") progress.trade = null;
    if (kind === "million") clearMillionConsents(progress);
  }
  const config = pick(room, CONFIG[kind]);
  if (kind === "million" && config.edition === undefined) config.edition = progress.edition ?? "2016";
  if (kind === "truth") {
    progress = require("./truth-engine").snapshot(progress);
    delete config.level;
    Object.assign(config, { rounds: progress.rounds, selection: progress.selection || "dice", skipLimit: progress.skipLimit ?? -1 });
  }
  const archive = { format: FORMAT, version: 1, game: kind, savedAt: new Date().toISOString(),
    positions: seats.map((p, i) => p.position ?? i), config, progress };
  checkTree(archive);
  fail(Buffer.byteLength(JSON.stringify(archive)) <= MAX_BYTES, "存档超过 2 MB / Save exceeds 2 MB");
  return archive;
}

function validateProgress(kind, g, count, config) {
  fail(g && typeof g === "object" && !Array.isArray(g));
  if (["gomoku", "xiangqi"].includes(kind)) {
    fail(["easy", "normal", "hard"].includes(config.difficulty));
    fail(Array.isArray(g.moves) && g.moves.length <= (kind === "gomoku" ? 225 : 1000));
    fail(["playing", "over"].includes(g.phase) && integer(g.winner, -1, 1));
    const E = require("./duel-engine"), restored = E.createGame(kind);
    for (const move of g.moves) E.move(restored, move.side, move);
    fail(g.phase === "over" || restored.phase === "playing");
    if (g.phase === "over" && restored.phase !== "over") { restored.phase = "over"; restored.winner = g.winner; restored.reason = String(g.reason).slice(0, 200); }
    fail(integer(g.revision, restored.revision, 10000000)); restored.revision = g.revision;
    return restored;
  }
  if (kind === "poker") {
    fail(["playing", "handComplete"].includes(g.status) && ["preflop", "flop", "turn", "river", "showdown"].includes(g.street));
    fail(integer(config.maxPlayers, count, 8) && [100, 150, 200].includes(config.startingStack) && [0, 5, 10].includes(config.blindInterval));
    fail(Array.isArray(g.players) && g.players.length === count && integer(g.actor, -1, count - 1));
    const cards = [];
    for (const list of [g.deck, g.board, g.burned, ...g.players.map(p => p.hand)]) {
      fail(Array.isArray(list) && list.length <= 52);
      for (const c of list) {
        fail(c && integer(c.value, 2, 14) && ["spades", "hearts", "diamonds", "clubs"].includes(c.suit));
        const rank = ({ 14: "A", 13: "K", 12: "Q", 11: "J" })[c.value] || String(c.value);
        fail(c.id === `${rank}-${c.suit}`);
        Object.assign(c, { rank, suitLabel: ({ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" })[c.suit], color: ["hearts", "diamonds"].includes(c.suit) ? "red" : "black" });
        cards.push(c.id);
      }
    }
    fail(cards.length === 52 && new Set(cards).size === 52 && g.board.length <= 5 && g.players.every(p => p.hand.length <= 2));
    for (const p of g.players) for (const key of ["chips", "bet", "totalBet"]) fail(integer(p[key], 0, 100000000));
    for (const key of ["pot", "currentBet", "minRaise", "handNumber", "blindLevel"]) fail(integer(g[key], 0, 100000000));
    fail(Array.isArray(g.acted) && g.acted.every(i => integer(i, 0, count - 1)) && Array.isArray(g.log) && Array.isArray(g.winners));
    return g;
  }
  fail(integer(g.revision, 0, 10000000));
  if (kind === "catan") {
    const Maps = require("./catan-maps");
    fail(config.mapId === "base" || config.mapId === "cities" || Maps.get(config.mapId));
    fail(g.mapId === config.mapId && ["default", "random"].includes(config.layout) && integer(config.maxPlayers, count, config.mapId === "base" ? 6 : 4));
    fail(["setupSettlement", "setupRoad", "scenarioChoice", "ckChoice", "roll", "main", "discard", "robber", "steal", "gold", "plenty", "monopoly", "freeRoads", "over"].includes(g.phase));
    fail(Array.isArray(g.players) && g.players.length === count && integer(g.current, 0, count - 1));
    const resourceCount = config.mapId === "cities" ? 8 : 5;
    fail(Array.isArray(g.bank) && g.bank.length === resourceCount && Array.isArray(g.deck) && g.deck.length <= 34);
    fail(g.players.every(p => Array.isArray(p.resources) && p.resources.length === resourceCount && p.resources.every(v => integer(v, 0, 24)) && Array.isArray(p.development)));
    const b = g.board;
    fail(b && Array.isArray(b.tiles) && b.tiles.length <= 100 && Array.isArray(b.vertices) && b.vertices.length <= 300 && Array.isArray(b.edges) && b.edges.length <= 450 && Array.isArray(b.ports));
    const refs = (a, n, max) => Array.isArray(a) && a.length <= max && a.every(v => integer(v, 0, n - 1));
    b.tiles.forEach((t, i) => fail(t.id === i && refs(t.vertices, b.vertices.length, 6)));
    b.vertices.forEach((v, i) => fail(v.id === i && refs(v.tiles, b.tiles.length, 3) && refs(v.edges, b.edges.length, 3) && refs(v.neighbors, b.vertices.length, 3) && integer(v.owner, -1, count - 1)));
    b.edges.forEach((e, i) => fail(e.id === i && integer(e.a, 0, b.vertices.length - 1) && integer(e.b, 0, b.vertices.length - 1) && e.a !== e.b && integer(e.owner, -1, count - 1)));
    for (let i = 0; i < count; i++) fail(b.edges.filter(e => e.owner === i).length <= 30);
    if(config.mapId === "cities") require("./catan-cities").validate(g);
    else fail(!g.cities && g.phase !== "ckChoice");
    g.trade = null;
  } else if (kind === "bridge") {
    fail([4, 8, 16].includes(config.boards) && integer(g.board, 1, config.boards) && Array.isArray(config.scores) && config.scores.length <= config.boards);
    fail(["auction", "play", "trick", "over"].includes(g.phase) && integer(g.current, 0, 3));
    fail(Array.isArray(g.players) && g.players.length === 4 && Array.isArray(g.hands) && g.hands.length === 4 && Array.isArray(g.originalHands) && g.originalHands.length === 4);
    const cards = g.originalHands.flat();
    fail(cards.length === 52 && new Set(cards).size === 52 && cards.every(c => integer(c, 0, 51)) && g.hands.every((h, i) => Array.isArray(h) && h.length <= 13 && new Set(h).size === h.length && h.every(c => g.originalHands[i].includes(c))));
    fail(Array.isArray(g.auction) && g.auction.length <= 320 && Array.isArray(g.tricks) && g.tricks.length <= 13 && Array.isArray(g.trick) && g.trick.length <= 4);
    fail(require("./bridge-engine").Core.Auction.isAuctionValid(g.auction));
  } else if (kind === "truth") {
    const E = require("./truth-engine"), ids = new Set(require("./truth-data").PROMPTS.map(p => p.id));
    const promptList = list => Array.isArray(list) && list.length <= ids.size && list.every(id => ids.has(id)) && new Set(list).size === list.length;
    fail([2, 3].includes(g.version) && g.playerCount === count && ["playing", "over"].includes(g.phase) && ["roll", "choose", "prepare", "challenge"].includes(g.stage));
    fail(integer(g.current, 0, count - 1) && (g.version === 3 ? [0, 3, 5, 8] : [3, 5, 8]).includes(g.rounds) && Array.isArray(g.scores) && g.scores.length === count && E.validLegacyLevel(g.level) && E.validLegacyLevel(config.level));
    fail(E.MODES.includes(g.mode) && config.mode === g.mode && Array.isArray(g.history) && g.history.length <= 12);
    fail(g.seenPrompts === undefined || (Array.isArray(g.seenPrompts) && g.seenPrompts.length === count && g.seenPrompts.every(promptList)));
    fail(g.used === undefined || (g.used && typeof g.used === "object" && !Array.isArray(g.used) && Object.keys(g.used).length <= 10 && Object.values(g.used).every(promptList)));
    delete config.level;
    if (g.version === 3) {
      fail(integer(g.turns, 0, Number.MAX_SAFE_INTEGER - 1) && integer(g.round, 1, g.turns + 1));
      fail(count <= 8 && require("./truth-engine").SELECTIONS.includes(g.selection) && integer(g.skipLimit, -1, 10));
      fail(g.selection !== "together" || (count === 2 && g.mode === "truth"));
      fail(integer(g.replacements, 0, 2) && Array.isArray(g.skipsUsed) && g.skipsUsed.length === count && g.skipsUsed.every(n => integer(n, 0, g.turns + 1)));
      fail(g.skipLimit === -1 || g.skipsUsed.every(n => n <= g.skipLimit));
      fail(Array.isArray(g.responses) && g.responses.length === count && g.responses.every(v => v === null || v === "skip" || v === "complete"));
      fail(config.selection === g.selection && config.skipLimit === g.skipLimit);
      config.rounds = 0;
    } else Object.assign(config, { selection: "dice", skipLimit: -1 });
    E.resumeEndless(g);
  } else if (kind === "million") {
    const edition = g.edition === undefined && g.version === 2 ? "2016" : g.edition;
    fail((edition === "2016" && g.version === 2) || (edition === "2024" && g.version === 3));
    if (config.edition === undefined) config.edition = edition;
    fail(config.edition === edition && integer(count, 3, edition === "2024" ? 9 : 8) && config.capacity === count);
    if (edition === "2024") validateModernMillion(g, count, config);
    else {
      fail(["planning", "negotiation", "snitch", "results", "over"].includes(g.phase) && integer(g.round, 1, 8) && integer(g.leader, 0, count - 1));
      fail(Array.isArray(g.players) && g.players.length === count && Array.isArray(g.intel) && g.intel.length === count && Array.isArray(g.offers) && g.offers.length <= 5000);
      fail(g.players.every(p => integer(p.cash, 0, 1000000) && Array.isArray(p.slots) && p.slots.length === (count === 3 ? 2 : 1)));
    }
    clearMillionConsents(g); anonymizeMillion(g);
  }
  if (g.players) g.players.forEach((p, i) => { p.name = `座位 ${i + 1} / Seat ${i + 1}`; });
  return g;
}

function decode(input, allowed) {
  fail(Buffer.byteLength(JSON.stringify(input)) <= MAX_BYTES, "文件过大，最大 2 MB / File too large; maximum 2 MB");
  checkTree(input);
  fail(input?.format === FORMAT && input.version === 1 && allowed.includes(input.game));
  const a = copy(input), kind = a.game, count = a.positions?.length;
  const bounds = { catan: [3, 6], bridge: [4, 4], gomoku: [2, 2], xiangqi: [2, 2], truth: [2, 12], million: [3, 9], poker: [2, 8] }[kind];
  fail(Array.isArray(a.positions) && integer(count, ...bounds) && new Set(a.positions).size === count && a.positions.every(p => integer(p, 0, 11)));
  fail(a.config && typeof a.config === "object" && !Array.isArray(a.config));
  const config = pick(a.config, CONFIG[kind]);
  const progress = validateProgress(kind, a.progress, count, config);
  if (kind === "million") fail(a.positions.every(p => p < config.capacity));
  const seats = a.positions.map((position, i) => ({ token: crypto.randomUUID(), name: `座位 ${i + 1} / Seat ${i + 1}`, position, avatar: null, bot: false, auto: false, vacant: true, ready: false, ws: null }));
  const room = { ...config, host: "", seats, game: progress, chat: [], pending: null, seatSwap: null, job: null, timer: null, timerKey: null, updated: Date.now(), archiveRestoring: true };
  if (["gomoku", "xiangqi"].includes(kind)) room.kind = kind;
  if (kind === "million") { room.generation = crypto.randomUUID(); room.negotiationUntil = Date.now() + 5000; }
  if (kind === "poker") {
    Object.assign(room, pick(progress, POKER), { game: undefined, hostId: "", originalHostId: "", botSerial: 0, nextHandAt: 0, playerReads: {}, botTimer: null, autoNextTimer: null });
    room.players = seats.map((s, i) => ({ ...s, ...pick(progress.players[i], POKER_SEAT), clientId: s.token, isBot: false, socket: null, connected: false, aggression: .55, looseness: .25, mastery: .85, handBluff: .08 }));
    room.acted = new Set(progress.acted.map(i => room.players[i].clientId)); delete room.seats;
  }
  return { kind, room };
}

function createRoomArchive(options) {
  const { rooms, control, send, stop, broadcast } = options, poker = options.kind === "poker";
  const seats = r => poker ? r.players : r.seats, id = p => poker ? p.clientId : p.token;
  const membership = s => poker ? s.roomCode : s.room, bind = (s, code) => { if (poker) s.roomCode = code; else s.room = code; };
  const peer = p => poker ? p.socket : p.ws, host = r => poker ? r.hostId : r.host;
  const waiting = new Map(), leases = new Map();
  const allowed = options.kind === "duel" ? ["gomoku", "xiangqi"] : [options.kind];
  const member = (r, s, connection) => seats(r).find(p => !p.vacant && id(p) === id(s) && peer(p) === connection);
  const started = r => poker ? r.status !== "lobby" : Boolean(r.game);
  const kindOf = r => options.kind === "duel" ? r.kind : options.kind;
  function lobby(r) {
    return { type: "archiveLobby", code: r.code, game: kindOf(r), seats: seats(r).map((p, i) => ({ index: i, position: p.position ?? i, vacant: Boolean(p.vacant), name: p.vacant ? `座位 ${i + 1} / Seat ${i + 1}` : p.name })) };
  }
  function sync(r) {
    for (const [s, w] of waiting) if (w.code === r.code) {
      if ((!poker && s.ws !== w.connection) || (poker && w.connection.socket.destroyed)) { waiting.delete(s); continue; }
      if (!r.archiveRestoring) { send(w.connection, { type: "archiveClosed" }); waiting.delete(s); continue; }
      send(w.connection, lobby(r));
    }
  }
  function cancel(r) {
    clearTimeout(leases.get(r)); leases.delete(r); r.archiveFreeze = null;
    if (rooms.get(r.code) === r) broadcast(r);
  }
  function watch(r, s, connection, data) {
    fail(!rooms.has(membership(s)), "请先退出当前房间 / Leave your current room first");
    const name = String(data.name || "").trim().replace(/\s+/g, " ").slice(0, 18); fail(name, "请输入名字 / Enter your name");
    waiting.set(s, { code: r.code, connection, name, avatar: Avatar.normalize(data.avatar ?? s.avatar ?? null) });
    send(connection, lobby(r));
  }
  function handle(s, connection, data) {
    const type = data.type;
    if (type === "join") {
      const r = rooms.get(String(data.code || "").trim().toUpperCase());
      if (!r?.archiveRestoring || seats(r).some(p => !p.vacant && id(p) === id(s))) return false;
      watch(r, s, connection, data); return true;
    }
    if (!String(type).startsWith("archive")) return false;
    if (type === "archiveImport") {
      fail(!rooms.has(membership(s)), "请先退出当前房间 / Leave your current room first");
      fail(!s.archiveImportedAt || Date.now() - s.archiveImportedAt >= 3000, "请稍候再导入 / Please wait before importing again");
      s.archiveImportedAt = Date.now(); fail(rooms.size < 200, "房间已满 / Server is busy");
      const { kind, room: r } = decode(data.archive, allowed);
      // Exercise the engine's private/public view before registering untrusted state.
      options.validate(r);
      const prefix = { catan: "C", bridge: "B", gomoku: "G", xiangqi: "X", truth: "T", million: "M", poker: "P" }[kind];
      do { r.code = prefix + crypto.randomBytes(3).toString("hex").slice(0, kind === "catan" || poker ? 4 : 5).toUpperCase(); } while (rooms.has(r.code));
      watch(r, s, connection, data); rooms.set(r.code, r); return true;
    }
    if (type === "archiveCancelJoin") { waiting.delete(s); send(connection, { type: "archiveClosed" }); return true; }
    if (type === "archiveClaim") {
      const w = waiting.get(s), r = w && rooms.get(w.code);
      fail(w?.connection === connection && r?.archiveRestoring, "选座已失效，请重新输入房间码 / Rejoin the room to choose a seat");
      fail(!rooms.has(membership(s)) && !seats(r).some(p => !p.vacant && id(p) === id(s)), "你已经入座 / You already have a seat");
      fail(integer(data.seat, 0, seats(r).length - 1));
      const p = { token: s.token, clientId: s.clientId, name: w.name, avatar: w.avatar, bot: false, auto: false, vacant: false, ready: true, ws: connection, socket: poker ? connection : undefined };
      control.fill(r, data.seat, p); bind(s, r.code); waiting.delete(s); control.elect(r); broadcast(r); sync(r); return true;
    }
    const r = rooms.get(membership(s)); fail(r, "请先加入房间 / Join a room first");
    fail(member(r, s, connection) && host(r) === id(s), "仅当前房主可操作 / Current host only");
    if (type === "archiveContinue") {
      fail(r.archiveRestoring && !r.archiveFreeze && seats(r).every(p => !p.vacant), "请先补齐所有座位 / Fill all seats first");
      r.archiveRestoring = false; r.negotiationUntil = Date.now() + 5000; r.resultsUntil = Date.now() + 5000;
      broadcast(r); sync(r); return true;
    }
    if (type === "archiveExport") {
      fail(started(r) && !r.archiveFreeze, "尚未开局或正在保存 / Not started or already saving");
      send(connection, { type: "archiveExported", archive: encode(kindOf(r), r) }); return true;
    }
    if (type === "archivePrepare") {
      fail(started(r) && !r.archiveFreeze, "尚未开局或正在保存 / Not started or already saving");
      const archive = encode(kindOf(r), r), ticket = crypto.randomUUID();
      stop(r); r.archiveFreeze = { ticket, host: id(s), roster: seats(r).map(id).join("|") };
      const timer = setTimeout(() => cancel(r), 120000); timer.unref?.(); leases.set(r, timer);
      broadcast(r); send(connection, { type: "archiveReady", ticket, archive }); return true;
    }
    const lease = r.archiveFreeze;
    fail(lease && lease.ticket === data.ticket && lease.host === id(s), "保存已取消或过期 / Save cancelled or expired");
    if (type === "archiveCancel") { cancel(r); return true; }
    fail(type === "archiveCommit" && lease.roster === seats(r).map(id).join("|"), "座位已变化，请重新保存 / Seats changed; save again");
    stop(r); clearTimeout(leases.get(r)); leases.delete(r); rooms.delete(r.code);
    const allSessions = poker ? options.clients : options.sessions.values();
    for (const session of allSessions) if (membership(session) === r.code) bind(session, "");
    for (const p of seats(r)) send(peer(p), { type: "left", reason: "已保存并结束本次连接。下次导入存档继续。 / Saved and disconnected. Import the save to resume." });
    for (const [session, w] of waiting) if (w.code === r.code) { send(w.connection, { type: "archiveClosed" }); waiting.delete(session); }
    return true;
  }
  const sweep = setInterval(() => {
    for (const [s, w] of waiting) if (!rooms.has(w.code) || (!poker && s.ws !== w.connection) || (poker && w.connection.socket.destroyed)) waiting.delete(s);
  }, 30000);
  sweep.unref();
  return { handle, sync, close() { clearInterval(sweep); for (const t of leases.values()) clearTimeout(t); leases.clear(); waiting.clear(); } };
}

module.exports = { createRoomArchive, encode, decode, MAX_BYTES, FORMAT };
