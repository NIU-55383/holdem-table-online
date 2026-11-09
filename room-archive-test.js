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
for (const kind of ["catan", "bridge", "gomoku", "xiangqi", "truth", "million"]) test(`${kind}: portable progress without identities, fresh vacant seats`, () => {
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

for (const kind of ["bridge", "truth", "million"]) test(`${kind}: every phase and ongoing or final progress can be restored`, () => {
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
    const c = await first.client("bridge"); await c.request({ type: "create", name: "Old host" });
    await c.request({ type: "fillBots" }); await c.request({ type: "start" });
    saved = (await c.request({ type: "archivePrepare" }, "archiveReady")).archive;
  } finally { await first.close(); }
  const second = await launch();
  try {
    const c = await second.client("bridge"); await c.request({ type: "archiveImport", name: "New person", archive: saved }, "archiveLobby");
    const state = await c.request({ type: "archiveClaim", seat: 2 });
    assert.equal(state.you, 2); assert.deepEqual(state.game.hands[2], saved.progress.hands[2]);
    assert.equal(state.game.hands[0], null); assert.equal(state.game.hands[1], null); assert.equal(state.game.hands[3], null);
  } finally { await second.close(); }
});

test("seven adapters: save/cancel/export/evict/import/choose/resume, host checks and hidden-data isolation", { timeout: 120000 }, async () => {
  const app = await launch();
  try {
    for (const kind of ["catan", "bridge", "gomoku", "xiangqi", "truth", "million", "poker"]) {
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

module.exports = { fixture, launch };
