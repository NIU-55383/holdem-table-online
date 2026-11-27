"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), { once } = require("node:events"), http = require("node:http");
const { spawn } = require("node:child_process"), { WebSocket } = require("ws");
const { encode, decode } = require("./room-archive");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const seats = n => Array.from({ length: n }, (_, i) => ({ token: `secret-${i}`, name: `Player ${i}`, position: i, bot: i > 0, auto: true, socialId: `social-${i}` }));
function fixture(kind) {
  const count = ["gomoku", "xiangqi"].includes(kind) ? 2 : kind === "bridge" ? 4 : 3;
  const r = { seats: seats(count), mapId: "base", layout: "default", thieves: "both", maxPlayers: count, boards: 4, scores: [], difficulty: "easy", level: "heat", mode: "mixed", rounds: 3, capacity: count, settings: { noRepeat: false, bruteShares: true } };
  const E = require(`./${["gomoku", "xiangqi"].includes(kind) ? "duel" : kind}-engine`);
  r.game = ["gomoku", "xiangqi"].includes(kind) ? E.createGame(kind) : kind === "truth" ? E.createGame(count) : E.createGame(r.seats.map(p => p.name));
  return r;
}
for (const kind of ["catan", "bridge", "gomoku", "xiangqi", "truth", "million", "coup"]) test(`${kind}: portable progress without identities, fresh vacant seats`, () => {
  const r = fixture(kind);
  if (["gomoku", "xiangqi"].includes(kind)) {
    const E = require("./duel-engine"); for (let i = 0; i < 5; i++) E.move(r.game, r.game.current, E.legal(r.game)[0]);
  }
  const a = encode(kind, r), restored = decode(JSON.parse(JSON.stringify(a)), [kind]).room;
  assert.ok(!JSON.stringify(a).includes("secret-")); assert.ok(!JSON.stringify(a).includes("social-"));
  assert.ok(restored.seats.every(p => p.vacant && !p.auto && !p.bot && !p.ws)); assert.equal(restored.host, "");
  assert.equal(restored.archiveRestoring, true);
  const again = encode(kind, restored); assert.deepEqual(again.progress, a.progress); assert.deepEqual(again.config, a.config);
  assert.throws(() => decode({ ...a, version: 999 }, [kind]), /unsupported/);
  assert.throws(() => decode({ ...a, positions: [0, 0] }, [kind]), /unsupported/);
  assert.throws(() => decode(JSON.parse(JSON.stringify(a).replace('"progress":{', '"progress":{"__proto__":{},')), [kind]), /unsupported/);
});

test("all Catan maps and scenarios retain progress throughout an automated game", () => {
  const E = require("./catan-engine"), Maps = require("./catan-maps");
  const maps = ["base", ...Maps.maps.map(m => m.id)];
  for (const mapId of maps) {
    const r = fixture("catan"); r.mapId = mapId; const map = Maps.get(mapId); const n = map?.players || 4;
    r.maxPlayers = n; r.seats = seats(n); r.game = E.createGame(r.seats.map(p => p.name), undefined, mapId);
    for (let step = 0; step < 120 && r.game.phase !== "over"; step++) {
      const restored = decode(encode("catan", r), ["catan"]).room;
      assert.equal(restored.game.phase, r.game.phase, mapId);
      restored.seats.forEach((_, i) => E.publicGame(restored.game, i));
      const actor = E.requiredActors(r.game)[0], action = E.chooseBotAction(r.game, actor);
      if (!action) break; E.act(r.game, actor, action);
    }
  }
});

test("Catan dice sources and unknown legacy history survive portable saves", () => {
  const E = require("./catan-engine");
  const sourceKeys = ["diceRandom", "diceAlchemy", "diceUnknown"], zero = () => Array(11).fill(0);
  const random = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  function ready(mapId) {
    const r = fixture("catan"), rng = random(43); r.mapId = mapId;
    r.game = E.createGame(r.seats.map(p => p.name), rng, mapId);
    for (let step = 0; !r.game.turn && step < 100; step++) {
      const id = E.requiredActors(r.game)[0]; E.act(r.game, id, E.chooseBotAction(r.game, id, rng), rng);
    }
    assert.equal(r.game.phase, "roll"); return r;
  }
  function prepareAlchemy(g) {
    const index = g.cities.decks[0].indexOf("alchemy"); assert(index >= 0);
    g.cities.decks[0].splice(index, 1);
    const card = { key: "alchemy", id: ++g.cities.sequence }; g.cities.players[g.current].cards.push(card);
    E.act(g, g.current, { type: "ck", choice: `play:${card.id}` });
    E.act(g, g.current, { type: "ck", choice: "dice:2:3" });
    assert.deepEqual(g.cities.alchemy, [2, 3]);
  }
  function roll(g, alchemy = false) {
    const sequence = alchemy ? [.5] : [0, 0, .5];
    E.act(g, g.current, { type: "roll" }, () => sequence.shift());
    for (let step = 0; g.phase !== "main" && step < 100; step++) {
      const id = E.requiredActors(g)[0]; E.act(g, id, E.chooseBotAction(g, id, () => .5), () => .5);
    }
    assert.equal(g.phase, "main");
  }
  function roundTrip(r) {
    const restored = decode(JSON.parse(JSON.stringify(encode("catan", r))), ["catan"]).room;
    assert.deepEqual(restored.game.statistics, r.game.statistics);
    return restored;
  }
  function conserved(stats) {
    for (let i = 0; i < 11; i++) assert.equal(sourceKeys.reduce((n, key) => n + stats[key][i], 0), stats.dice[i]);
  }
  for (const mapId of ["cities", "cities-shores-1"]) {
    let r = ready(mapId); roll(r.game); E.act(r.game, r.game.current, { type: "end" });
    prepareAlchemy(r.game); r = roundTrip(r);
    assert.deepEqual(r.game.cities.alchemy, [2, 3], "A save before rolling retains the selected Alchemy dice");
    roll(r.game, true);
    assert.equal(r.game.statistics.diceRandom[0], 1); assert.equal(r.game.statistics.diceAlchemy[3], 1);
    assert.deepEqual(r.game.statistics.diceUnknown, zero()); assert.equal(r.game.cities.alchemy, null);
    conserved(roundTrip(r).game.statistics);
  }
  for (const version of [1, 2]) for (const mapId of ["base", "cities", "cities-shores-1"]) {
    const original = ready(mapId); roll(original.game);
    const stats = original.game.statistics; stats.version = version;
    sourceKeys.forEach(key => delete stats[key]);
    if (version === 1) stats.players.forEach(p => delete p.robbed);
    const r = roundTrip(original), legacy = structuredClone(r.game.statistics), usesAlchemy = Boolean(r.game.cities);
    const publicStats = E.publicGame({ ...r.game, phase: "over" }, 0).statistics;
    assert.deepEqual(r.game.statistics, legacy, "Reading a finished legacy snapshot does not mutate the imported save");
    assert.deepEqual(publicStats.diceUnknown, usesAlchemy ? legacy.dice : zero());
    assert.deepEqual(publicStats.diceRandom, usesAlchemy ? zero() : legacy.dice);
    assert.deepEqual(publicStats.diceAlchemy, zero(), "Legacy logs cannot prove which past rolls used Alchemy");
    E.act(r.game, r.game.current, { type: "end" });
    if (usesAlchemy) prepareAlchemy(r.game);
    roll(r.game, usesAlchemy);
    const continued = roundTrip(r).game.statistics;
    assert.equal(continued.version, 3); conserved(continued);
    assert.deepEqual(continued.diceUnknown, usesAlchemy ? legacy.dice : zero());
    assert.equal(continued.diceAlchemy[3], usesAlchemy ? 1 : 0);
    assert.equal(continued.diceRandom[0], usesAlchemy ? 0 : 2);
    if (version === 1) assert(continued.players.every(p => !Object.hasOwn(p, "robbed")), "Unavailable old robbery totals stay unavailable");
  }
});
async function launch() {
  const probe = http.createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening"); const port = probe.address().port; await new Promise(r => probe.close(r));
  const server = spawn(process.execPath, [require.resolve("./server")], { windowsHide: true, env: { ...process.env, PORT: String(port), LOCAL_ONLY: "1", AUTO_OPEN: "0", CATAN_BOT_DELAY: "10000", BRIDGE_BOT_DELAY: "10000", MILLION_BOT_DELAY: "10000", TRUTH_BOT_DELAY: "10000" }, stdio: ["ignore", "pipe", "pipe"] });
  let errors = ""; server.stderr.on("data", chunk => { errors += chunk; }); await once(server.stdout, "data");
  const sockets = [];
  async function client(kind) {
    const endpoint = kind === "poker" ? "ws" : ["gomoku", "xiangqi"].includes(kind) ? "duel-ws" : `${kind}-ws`;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/${endpoint}`), messages = []; sockets.push(ws);
    ws.on("message", raw => messages.push(JSON.parse(raw))); await once(ws, "open");
    const send = data => ws.send(JSON.stringify(data));
    async function next(predicate, start = 0) { for (let i = 0; i < 500; i++) { const m = messages.slice(start).find(predicate); if (m) return m; await sleep(10); } throw Error(`${kind}: missing message ${JSON.stringify(messages.slice(-2)).slice(0, 1000)}\n${errors}`); }
    async function request(data, type = "state") { const start = messages.length; send(data); const m = await next(m => m.type === type || m.type === "error", start); if (type !== "error" && m.type === "error") throw Error(`${kind} ${data.type}: ${m.message}`); return m.room || m; }
    send(kind === "poker" ? { type: "hello" } : { type: "hello" }); if (kind !== "poker") await next(m => m.type === "welcome");
    return { ws, send, next, request, messages };
  }
  return { client, port, async close() { sockets.forEach(s => s.terminate()); server.kill(); await once(server, "exit"); assert.equal(errors, ""); } };
}

for (const kind of ["bridge", "truth", "million", "coup"]) test(`${kind}: every phase and ongoing or final progress can be restored`, () => {
  const r = fixture(kind), E = require(`./${kind}-engine`);
  for (let step = 0; step < 250 && r.game.phase !== "over"; step++) {
    const { room } = decode(encode(kind, r), [kind]);
    if (kind === "bridge") {
      room.seats.forEach((_, i) => E.publicGame(room.game, i));
      if (r.game.phase === "trick") E.advanceTrick(r.game);
      else { const actor = E.controller(r.game); E.act(r.game, actor, E.chooseBotAction(r.game, actor)); }
    } else if (kind === "truth") {
      const g = r.game, type = { roll: "roll", choose: "choose", prepare: "ask", challenge: "complete" }[g.stage];
      E.act(g, g.current, type === "choose" ? { type, kind: "truth" } : { type });
    } else {
      room.seats.forEach((_, i) => E.publicGame(room.game, i));
      const actor = E.requiredActors(r.game)[0]; E.act(r.game, actor, E.chooseBotAction(r.game, actor));
    }
  }
  const phase = kind === "truth" ? "playing" : "over";
  assert.equal(r.game.phase, phase); assert.equal(decode(encode(kind, r), [kind]).room.game.phase, phase);
  if (kind === "truth") assert(r.game.turns > 8);
});

test("a save survives a completely new server process", { timeout: 30000 }, async () => {
  const first = await launch(); let saved;
  try {
    const c = await first.client("bridge"); await c.request({ type: "create", name: "Old host", biddingHints: true });
    await c.request({ type: "fillBots" }); await c.request({ type: "start" });
    saved = (await c.request({ type: "archivePrepare" }, "archiveReady")).archive;
  } finally { await first.close(); }
  const second = await launch();
  try {
    const c = await second.client("bridge"); await c.request({ type: "archiveImport", name: "New person", archive: saved }, "archiveLobby");
    const state = await c.request({ type: "archiveClaim", seat: 2 });
    assert.equal(state.biddingHints, true);
    assert.equal(state.you, 2); assert.deepEqual(state.game.hands[2], saved.progress.hands[2]);
    assert.equal(state.game.hands[0], null); assert.equal(state.game.hands[1], null); assert.equal(state.game.hands[3], null);
  } finally { await second.close(); }
});

test("eight adapters: save/cancel/export/evict/import/choose/resume, host checks and hidden-data isolation", { timeout: 120000 }, async () => {
  const app = await launch();
  try {
    for (const kind of ["catan", "bridge", "gomoku", "xiangqi", "truth", "million", "coup", "poker"]) {
      let a = await app.client(kind);
      const duel = ["gomoku", "xiangqi"].includes(kind);
      await a.request({ type: "create", name: "Host", kind, difficulty: "easy", side: 0, ai: duel, seats: 3, maxPlayers: 3, capacity: 3, boards: 4 });
      if (!duel) { await a.request({ type: "fillBots" }); await a.request({ type: "start" }); }
      const liveBefore = a.messages.filter(m => m.type === "state").at(-1), exportOnly = await a.request({ type: "archiveExport" }, "archiveExported");
      assert.equal(exportOnly.archive.game, kind);
      assert.equal(a.messages.filter(m => m.type === "state").at(-1), liveBefore, `${kind}: saving must not broadcast or mutate room state`);
      assert.ok(!a.messages.some(m => m.type === "left"));
      const first = await a.request({ type: "archivePrepare" }, "archiveReady");
      assert.deepEqual(exportOnly.archive.progress, first.archive.progress);
      const frozen = a.messages.filter(m => m.type === "state").at(-1); assert.equal((frozen.room || frozen).control.archive.saving, true);
      const action = kind === "poker" ? { type: "action", action: "fold" } : duel ? { type: "move", to: 10 } : { type: "action", action: { type: "roll" } };
      assert.match((await a.request(action, "error")).message, /paused/);
      await a.request({ type: "archiveCancel", ticket: first.ticket });
      const saved = await a.request({ type: "archivePrepare" }, "archiveReady");
      assert.deepEqual(saved.archive.progress, first.archive.progress, `${kind}: cancellation did not mutate progress`);
      assert.ok(!/"(token|clientId|socialId|socket|ws)":/.test(JSON.stringify(saved.archive)));
      await a.request({ type: "archiveCommit", ticket: saved.ticket }, "left");
      await a.request(action, "error");
      const restored = await a.request({ type: "archiveImport", archive: saved.archive, name: "New host" }, "archiveLobby");
      assert.ok(restored.seats.every(s => s.vacant)); assert.deepEqual(Object.keys(restored).sort(), ["code", "game", "seats", "type"]);
      let b = await app.client(kind); await b.request({ type: "join", code: restored.code, name: "Friend" }, "archiveLobby");
      const aStart = a.messages.length, bStart = b.messages.length;
      a.send({ type: "archiveClaim", seat: 0 }); b.send({ type: "archiveClaim", seat: 0 });
      const outcomeA = await a.next(m => m.type === "state" || m.type === "error", aStart);
      const outcomeB = await b.next(m => m.type === "state" || m.type === "error", bStart);
      assert.deepEqual([outcomeA.type, outcomeB.type].sort(), ["error", "state"], `${kind}: only one concurrent claim succeeds`);
      const success = outcomeA.type === "state" ? outcomeA : outcomeB;
      const rejected = outcomeA.type === "error" ? outcomeA : outcomeB;
      assert.match(rejected.message, /already filled/);
      assert.equal(rejected.game, undefined); assert.equal(rejected.room, undefined);
      if (outcomeA.type === "error") [a, b] = [b, a];
      const seated = success.room || success;
      assert.equal(seated.control.paused, true); assert.equal(seated.control.host, seated.control.you);
      const friend = await b.request({ type: "archiveClaim", seat: 1 }); assert.equal(friend.control.paused, true);
      assert.match((await b.request({ type: "archivePrepare" }, "error")).message, /host only/i);
      assert.match((await b.request({ type: "archiveExport" }, "error")).message, /host only/i);
      assert.match((await b.request({ type: "archiveContinue" }, "error")).message, /host only/i);
      let current = seated;
      for (const s of seated.control.seats.filter(s => s.vacant && s.index !== 1)) current = await a.request({ type: "roomControl", action: "fillBot", target: s.id });
      const before = await a.request({ type: "archivePrepare" }, "archiveReady");
      assert.deepEqual(before.archive.progress, saved.archive.progress, `${kind}: exact progress after reassignment`);
      await a.request({ type: "archiveCancel", ticket: before.ticket });
      current = await a.request({ type: "archiveContinue" }); assert.equal(current.control.paused, false);
      assert.equal(current.control.idleAuto, false); assert.equal(current.control.auto, false);
      a.ws.close(); b.ws.close();
    }
  } finally { await app.close(); }
});

test("Coup: each challenge, block, influence loss, private exchange and end state round-trips", () => {
  const E = require("./coup-engine"), cases = [];
  const game = () => E.createGame(["Alice", "Bob", "Carol"], { seed: 120 });
  const save = g => cases.push(structuredClone(g));
  let g = game(); save(g);
  E.act(g, 0, { type: "action", action: "tax" }); save(g);
  E.act(g, 1, { type: "challenge" }); save(g);
  g = game(); E.act(g, 0, { type: "action", action: "aid" }); save(g);
  E.act(g, 1, { type: "block", role: "Duke" }); save(g);
  g = game(); E.act(g, 0, { type: "action", action: "exchange" });
  while (g.phase !== "exchange") E.act(g, E.requiredActors(g)[0], { type: "pass" });
  save(g);
  E.endGame(g); save(g);
  g = game();
  for (let steps = 0; g.phase !== "over" && steps < 700; steps++) {
    const actor = E.requiredActors(g)[0]; E.act(g, actor, E.chooseBotAction(g, actor));
  }
  assert.equal(g.phase, "over"); save(g);
  assert.deepEqual([...new Set(cases.map(g => g.phase))].sort(), ["turn", "actionChallenge", "block", "blockChallenge", "lose", "exchange", "over"].sort());
  for (const progress of cases) {
    const room = { seats: seats(3), capacity: 6, game: progress }, a = encode("coup", room);
    const restored = decode(a, ["coup"]).room;
    assert.deepEqual(restored.game, a.progress, progress.phase); assert.equal(restored.capacity, 6);
    assert.equal(restored.game.phase, progress.phase); E.validateRestore(restored.game);
    for (const oldName of ["Alice", "Bob", "Carol"]) assert(!JSON.stringify(a).includes(oldName), `${progress.phase}: no ${oldName} in the save`);
    for (let viewer = 0; viewer < 3; viewer++) {
      const view = E.publicGame(restored.game, viewer); assert(!Object.hasOwn(view, "deck")); assert(!Object.hasOwn(view, "rng"));
      for (const p of view.players) if (p.id !== viewer) assert(p.cards.every(c => c.revealed || c.role === null));
      if (progress.phase === "exchange" && viewer !== progress.choice.playerId) assert(!Object.hasOwn(view.choice, "choices"));
    }
    const again = encode("coup", restored); assert.deepEqual(again.progress, a.progress);
  }
});

test("Coup: malformed files cannot forge hands, deck, phase, capacity, positions or hidden identity keys", () => {
  const r = fixture("coup"), good = encode("coup", r);
  const invalid = [
    a => { a.game = "million"; }, a => { a.version = 2; }, a => { a.config.capacity = 1; },
    a => { a.config.capacity = 7; }, a => { a.config.capacity = 2; }, a => { a.positions[2] = 3; },
    a => { a.positions[2] = a.positions[1]; }, a => { a.progress.players.pop(); },
    a => { a.progress.players[0].coins = -1; }, a => { a.progress.players[0].cards[0].role = "Wizard"; },
    a => { a.progress.deck[0] = structuredClone(a.progress.deck[1]); }, a => { a.progress.deck.pop(); },
    a => { a.progress.phase = "exchange"; }, a => { a.progress.current = 99; },
    a => { a.progress.players[0].token = "must-not-import"; }, a => { a.progress.players[0].socialId = "must-not-import"; },
    a => { a.progress.players[0].cards = []; }, a => { a.progress.winner = 0; }
  ];
  for (const mutate of invalid) {
    const a = structuredClone(good); mutate(a); assert.throws(() => decode(a, ["coup"]));
  }
  assert.throws(() => decode(JSON.parse(JSON.stringify(good).replace('"progress":{', '"progress":{"__proto__":{},')), ["coup"]));
  assert.throws(() => decode({ ...good, unknown: "x".repeat(2 * 1024 * 1024) }, ["coup"]));
  const restarted = decode(good, ["coup"]).room;
  assert(restarted.seats.every(p => p.vacant && !p.auto && !p.bot && p.avatar === null && p.ws === null));
  assert.equal(restarted.host, ""); assert.equal(restarted.archiveRestoring, true);
});

test("Coup: portable saves omit historical occupant names and rebuild loss reasons without identifiers", () => {
  const E = require("./coup-engine"), g = E.createGame(["a", "I", "你"], { seed: 3 });
  E.act(g, 0, { type: "action", action: "tax" }); E.act(g, 1, { type: "challenge" });
  // Text may name a removed occupant who is no longer in players[].name.
  g.log[0].en = "Former occupant SecretOldPerson declared tax.";
  g.choice.reason = "SecretOldPerson 质疑了你。"; g.choice.reasonEn = "SecretOldPerson challenged you."; E.validateRestore(g);
  const a = encode("coup", { game: g, capacity: 3, seats: seats(3) });
  const restored = decode(a, ["coup"]).room;
  assert(!JSON.stringify(a).includes("SecretOldPerson")); assert.deepEqual(restored.game.log, []); assert.equal(restored.game.logSequence, 0);
  assert.match(restored.game.choice.reasonEn, /influence/); E.validateRestore(restored.game);
  assert.deepEqual(encode("coup", restored).progress, a.progress);
});

module.exports = { fixture, launch };
