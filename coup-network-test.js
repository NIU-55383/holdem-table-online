"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachCoup } = require("./coup-server"), E = require("./coup-engine");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const error = (event) => event.type === "error";
async function until(fn, message = "Expected network event", timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = fn(); if (result) return result; await sleep(10); }
  throw new Error(message);
}
async function fixture(t, overrides = {}) {
  const values = { COUP_BOT_DELAY: "60000", ROOM_IDLE_MS: "120000", ROOM_HOST_GRACE_MS: "300000", ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const server = http.createServer(), api = attachCoup(server), clients = [];
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  let closed = false;
  async function close() {
    if (closed) return; closed = true;
    clients.forEach((c) => c.ws.terminate()); await new Promise((resolve) => server.close(resolve));
    for (const r of api.rooms.values()) assert.equal(r.timer, null, "Shutdown cancels every queued action");
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(close);
  async function client(token) {
    const ws = new WebSocket("ws://127.0.0.1:" + server.address().port + "/coup-ws");
    const c = { ws, events: [], state: null }; clients.push(c);
    ws.on("message", (raw) => {
      const event = JSON.parse(raw); c.events.push(event);
      if (event.type === "state") c.state = event;
      if (event.type === "welcome") c.token = event.token;
    });
    c.send = (data) => ws.send(JSON.stringify(data));
    c.request = async (data, predicate = (event) => event.type === "state") => {
      const start = c.events.length; c.send(data);
      return until(() => c.events.slice(start).find(predicate), JSON.stringify(data));
    };
    await once(ws, "open"); await c.request({ type: "hello", token }, (event) => event.type === "welcome");
    return c;
  }
  return { api, client, clients, server, close };
}
async function humans(t, count = 3, overrides = {}) {
  const f = await fixture(t, overrides), players = [];
  for (let i = 0; i < count; i++) players.push(await f.client());
  await players[0].request({ type: "create", name: "Alice", capacity: count });
  const code = players[0].state.code;
  for (let i = 1; i < count; i++) await players[i].request({ type: "join", code, name: "Player " + i });
  for (let i = 1; i < count; i++) await players[i].request({ type: "ready", ready: true });
  await players[0].request({ type: "start" }, (event) => event.type === "state" && event.game);
  await until(() => players.every((p) => p.state?.game));
  return { ...f, players, a: players[0], b: players[1], code, room: f.api.rooms.get(code) };
}
const move = (c, room, action, predicate) => c.request({ type: "action", revision: room.game.revision, action }, predicate);
const income = { type: "action", action: "income" };
const roles = (player) => player.cards.map((c) => c.role);

test("Coup adapter: 2–6 seats, lobby readiness, stable positions, normalized own avatars and bot identity", async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  for (const capacity of [1, 7, 2.5, "3"]) await a.request({ type: "create", name: "Alice", capacity }, error);
  assert.equal(api.rooms.size, 0);
  await a.request({ type: "create", name: "Alice" }); assert.equal(a.state.capacity, 6);
  const code = a.state.code;
  await a.request({ type: "start" }, error);
  await a.request({ type: "addBot" }); const oldBot = a.state.seats[1]; assert.equal(oldBot.ready, true);
  await b.request({ type: "join", name: "Bob", code });
  await a.request({ type: "start" }, error);
  await b.request({ type: "settings", capacity: 3 }, error);
  await b.request({ type: "ready", ready: "true" }, error);
  await b.request({ type: "profile", target: a.state.seats[0].socialId, avatar: { kind: "emoji", value: "⭐" } });
  await until(() => a.state.seats[2].avatar?.value === "⭐"); assert.equal(a.state.seats[0].avatar, null);
  await b.request({ type: "profile", avatar: "avatar-0" }, error);
  await b.request({ type: "profile", avatar: { kind: "symbol", value: "bot-cool" } }, error);
  await b.request({ type: "chat", text: "Stable position" });
  await a.request({ type: "removeBot", target: oldBot.socialId });
  await until(() => b.state.seats.length === 2);
  assert.equal(b.state.seats[1].position, 2); assert.equal(b.state.chat[0].playerId, 1);
  await a.request({ type: "settings", capacity: 2 }, error);
  await a.request({ type: "addBot" }); const bot = a.state.seats[2];
  await b.request({ type: "ready", ready: true });
  await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  await until(() => b.state.game);
  assert.equal(b.state.you, 2); assert.equal(b.state.chat[0].playerId, 2);
  assert.deepEqual(b.state.seats.map((p) => p.position), [0, 1, 2]);
  assert.equal(b.state.seats[1].socialId, bot.socialId); assert.deepEqual(b.state.seats[1].avatar, bot.avatar);
  assert.equal(a.state.capacity, 6, "Starting does not require filling all six seats");
  await b.request({ type: "ready", ready: false }, error);
  await a.request({ type: "settings", capacity: 4 }, error);
  for (const n of [2, 4, 5, 6]) {
    const c = await client(); await c.request({ type: "create", name: "Capacity " + n, capacity: n });
    await c.request({ type: "fillBots" }); assert.equal(c.state.seats.length, n);
    assert.equal(new Set(c.state.seats.map((p) => p.socialId)).size, n);
  }
});

test("Coup adapter: private cards, authenticated actor, mandatory revisions and replay rejection", async (t) => {
  const { a, b, players, room, client } = await humans(t), stranger = await client();
  for (let viewer = 0; viewer < players.length; viewer++) {
    const state = players[viewer].state;
    assert.deepEqual(roles(state.game.players[viewer]), roles(room.game.players[viewer]));
    for (let i = 0; i < players.length; i++) if (i !== viewer) assert.deepEqual(roles(state.game.players[i]), [null, null]);
    assert(!Object.hasOwn(state.game, "deck")); assert(!Object.hasOwn(state.game, "rng"));
    for (const p of players) assert(!JSON.stringify(state).includes(p.token));
  }
  const before = structuredClone(room.game), revision = room.game.revision;
  await stranger.request({ type: "action", code: room.code, token: a.token, revision, action: income }, error);
  await b.request({ type: "action", actor: 0, revision, action: income }, error);
  await a.request({ type: "action", action: income }, error);
  assert.deepEqual(room.game, before);
  await a.request({ type: "action", revision, action: income });
  const after = structuredClone(room.game); assert.equal(after.revision, revision + 1);
  assert.equal(after.players[0].coins, before.players[0].coins + 1);
  const offset = a.events.length;
  await a.request({ type: "action", revision, action: income }, error);
  await until(() => a.events.slice(offset).some((e) => e.type === "state" && e.game.revision === after.revision));
  assert.deepEqual(room.game, after);
});

test("Coup adapter: reconnect replaces the socket without changing private cards, position or public identity", async (t) => {
  const { a, b, room, code, client } = await humans(t);
  const id = b.state.seats[1].socialId, own = structuredClone(room.game.players[1].cards), revision = room.game.revision;
  b.ws.close(); await until(() => a.state.seats[1].connected === false);
  assert.equal(room.seats[1].auto, false);
  const back = await client(b.token); await until(() => back.state);
  assert.equal(back.state.you, 1); assert.equal(back.state.seats[1].socialId, id);
  assert.deepEqual(back.state.game.players[1].cards, own);
  assert.deepEqual(roles(back.state.game.players[0]), [null, null]);
  assert.equal(back.state.seats[1].connected, true);
  await back.request({ type: "join", code, name: "Not a second seat" }); assert.equal(room.seats.length, 3);
  assert.equal(room.game.revision, revision);
  const newer = await client(back.token); await until(() => newer.state);
  await until(() => back.ws.readyState === WebSocket.CLOSED);
  assert.equal(newer.state.seats[1].socialId, id);
  await newer.request({ type: "hello" }, error);
});

test("Coup adapter: reactions are transient, room-only, authenticated and do not restart AI", async (t) => {
  const { players, a, b, room, client } = await humans(t), outsider = await client();
  const foreign = await outsider.request({ type: "create", name: "Other room" });
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  const timer = room.timer, revision = room.game.revision, chatLength = room.chat.length;
  assert(timer);
  const target = a.state.seats[1].socialId;
  const event = await a.request({ type: "reaction", kind: "flowers", target, from: target }, (e) => e.type === "reaction");
  assert.equal(event.from, a.state.seats[0].socialId); assert.equal(event.room, room.code);
  await until(() => players.every((p) => p.events.some((e) => e.id === event.id)));
  assert.equal(room.game.revision, revision); assert.equal(room.timer, timer); assert.equal(room.chat.length, chatLength);
  await a.request({ type: "reaction", kind: "heart", target }, error);
  await b.request({ type: "reaction", kind: "unknown", target: a.state.seats[0].socialId }, error);
  await b.request({ type: "reaction", kind: "heart", target: foreign.seats[0].socialId }, error);
  assert(!outsider.events.some((e) => e.type === "reaction"));
  const back = await client(b.token); await until(() => back.state);
  assert(!back.events.some((e) => e.type === "reaction"));
});

test("Coup adapter: host transfer requires recipient consent; disconnect grace and clockwise succession survive reconnect", async (t) => {
  const { a, b, players, room, client } = await humans(t, 3, { ROOM_HOST_GRACE_MS: "300", ROOM_IDLE_MS: "250" });
  await b.request({ type: "roomControl", action: "transfer", target: a.state.seats[2].socialId }, error);
  await a.request({ type: "roomControl", action: "transfer", target: a.state.seats[1].socialId });
  const old = a.state.control.pending.id;
  await players[2].request({ type: "roomControl", action: "respond", id: old, accept: true }, error);
  await b.request({ type: "roomControl", action: "respond", id: old, accept: false });
  assert.equal(room.host, a.token);
  await b.request({ type: "roomControl", action: "requestHost" });
  await a.request({ type: "roomControl", action: "respond", id: b.state.control.pending.id, accept: true });
  assert.equal(room.host, b.token);
  await a.request({ type: "roomControl", action: "respond", id: old, accept: true }, error);
  b.ws.close(); await until(() => a.state.seats[1].connected === false); await sleep(80);
  assert.equal(room.host, b.token);
  const back = await client(b.token); await until(() => back.state); await sleep(340);
  assert.equal(room.host, b.token, "Returning during grace cancels the old deadline");
  back.ws.close(); await until(() => a.state.seats[1].connected === false);
  await until(() => room.host === players[2].token, "Next online human clockwise inherits host");
  const later = await client(b.token); await until(() => later.state);
  assert.equal(room.host, players[2].token, "Former host must not reclaim the role");
  await players[2].request({ type: "leave" }, (e) => e.type === "left");
  assert.equal(room.host, a.token, "Explicit leave transfers immediately");
});

test("Coup adapter: vacancies revoke membership, stop jobs, preserve assets and invalidate stale targets", async (t) => {
  const { a, b, players, room, code, client } = await humans(t);
  await a.request({ type: "roomControl", action: "auto", enabled: true }); assert(room.timer);
  const oldB = a.state.seats[1].socialId, oldC = a.state.seats[2].socialId, original = structuredClone(room.game), revision = room.game.revision;
  await b.request({ type: "roomControl", action: "kick", target: oldC }, error);
  await a.request({ type: "roomControl", action: "kick", target: oldB });
  await until(() => b.events.some((e) => e.type === "left"));
  await a.request({ type: "roomControl", action: "kick", target: oldC });
  assert.equal(room.timer, null); assert.equal(a.state.control.paused, true);
  await move(a, room, income, error);
  await b.request({ type: "chat", text: "Removed" }, error);
  await b.request({ type: "reaction", kind: "heart", target: a.state.seats[0].socialId }, error);
  await b.request({ type: "profile", avatar: { kind: "emoji", value: "⭐" } }, error);
  const back = await client(b.token); await sleep(30); assert.equal(back.state, null);
  await a.request({ type: "join", code, name: "Alice" }); assert.equal(room.seats.filter((p) => p.vacant).length, 2);
  await back.request({ type: "join", code, name: "Bob back" });
  assert.equal(back.state.you, 1); assert.equal(back.state.seats[1].auto, false);
  assert.notEqual(back.state.seats[1].socialId, oldB); assert.deepEqual(room.game.players[1].cards, original.players[1].cards);
  assert.equal(room.game.players[1].coins, original.players[1].coins); assert.equal(room.timer, null);
  await back.request({ type: "join", code, name: "No duplicate" }); assert.equal(room.seats.filter((p) => p.vacant).length, 1);
  await a.request({ type: "roomControl", action: "kick", target: oldB }, error);
  await a.request({ type: "chat", text: "Chat works while paused" });
  await a.request({ type: "reaction", kind: "heart", target: back.state.seats[1].socialId }, (e) => e.type === "reaction");
  const vacant = a.state.seats[2].socialId;
  await a.request({ type: "roomControl", action: "fillBot", target: vacant });
  assert.equal(a.state.control.paused, false); assert(room.timer);
  assert.equal(room.game.revision, revision + 4); assert.equal(room.seats.length, 3);
  assert.notEqual(a.state.seats[2].socialId, vacant); assert.equal(a.state.seats[2].position, 2);
  await a.request({ type: "action", revision, action: income }, error);
  await a.request({ type: "roomControl", action: "fillBot", target: vacant }, error);
  await players[2].request({ type: "join", code, name: "Too late" }, error);
  await a.request({ type: "roomControl", action: "kick", target: a.state.seats[2].socialId }); assert.equal(room.timer, null);
});

test("Coup adapter: idle policy is opt-in, host-only, actor-specific and separate from manual auto", async (t) => {
  const { a, b, room, client } = await humans(t, 3, { ROOM_IDLE_MS: "260", ROOM_WARNING_MS: "100" });
  assert.equal(a.state.control.idleAuto, false); await sleep(310); assert.equal(room.seats[0].auto, false);
  await b.request({ type: "roomControl", action: "idleAuto", enabled: true }, error);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  const deadline = a.state.control.warning.deadline;
  await until(() => b.state.control.idleAuto); assert.equal(b.state.control.warning, null);
  await a.request({ type: "chat", text: "Does not extend my action timer" }); assert.equal(a.state.control.warning.deadline, deadline);
  await until(() => room.seats[0].auto); assert.equal(a.state.seats[0].connected, true);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false }); assert.equal(room.seats[0].auto, false); assert.equal(room.timer, null);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false }); assert.equal(room.seats[0].auto, true);
  a.ws.close(); await until(() => b.state.seats[0].connected === false); assert.equal(room.timer, null);
  const back = await client(a.token); await until(() => back.state);
  assert.equal(back.state.seats[0].connected, true); assert.equal(back.state.seats[0].auto, true); assert(room.timer);
  await back.request({ type: "roomControl", action: "auto", enabled: false }); assert.equal(room.timer, null);
});

test("Coup adapter: save/export/freeze/cancel/import/claim/resume respects host and hides unclaimed hands", async (t) => {
  const { a, b, room, api, client } = await humans(t);
  await move(a, room, income);
  const before = structuredClone(room.game), eventCount = a.events.filter((e) => e.type === "state").length;
  const exported = await a.request({ type: "archiveExport" }, (e) => e.type === "archiveExported");
  assert.deepEqual(room.game, before); assert.equal(a.events.filter((e) => e.type === "state").length, eventCount);
  assert.equal(exported.archive.game, "coup"); assert(!/"(token|clientId|socialId|socket|ws|avatar|auto)":/.test(JSON.stringify(exported.archive)));
  assert(!JSON.stringify(exported.archive).includes("Alice"));
  await b.request({ type: "archiveExport" }, error);
  const frozen = await a.request({ type: "archivePrepare" }, (e) => e.type === "archiveReady");
  assert.equal(a.state.control.paused, true); assert.equal(room.timer, null);
  await move(b, room, income, error);
  await a.request({ type: "archiveCancel", ticket: frozen.ticket }); assert.deepEqual(room.game, before);
  const saved = await a.request({ type: "archivePrepare" }, (e) => e.type === "archiveReady");
  await a.request({ type: "archiveCommit", ticket: saved.ticket }, (e) => e.type === "left");
  assert(!api.rooms.has(room.code));
  const lobby = await a.request({ type: "archiveImport", archive: saved.archive, name: "New host" }, (e) => e.type === "archiveLobby");
  assert.deepEqual(Object.keys(lobby).sort(), ["code", "game", "seats", "type"]); assert(lobby.seats.every((p) => p.vacant));
  const friend = await client(); await friend.request({ type: "join", code: lobby.code, name: "Friend" }, (e) => e.type === "archiveLobby");
  const offsets = [a.events.length, friend.events.length];
  a.send({ type: "archiveClaim", seat: 0 }); friend.send({ type: "archiveClaim", seat: 0 });
  const results = await Promise.all([a, friend].map((c, i) => until(() => c.events.slice(offsets[i]).find((e) => e.type === "state" || e.type === "error"))));
  assert.deepEqual(results.map((e) => e.type).sort(), ["error", "state"]);
  const host = results[0].type === "state" ? a : friend, guest = host === a ? friend : a;
  const first = host.state; assert.equal(first.control.paused, true);
  assert.deepEqual(roles(first.game.players[0]), roles(saved.archive.progress.players[0]));
  assert.deepEqual(roles(first.game.players[1]), [null, null]);
  const second = await guest.request({ type: "archiveClaim", seat: 1 }); assert.equal(second.control.paused, true);
  await guest.request({ type: "archiveContinue" }, error); await host.request({ type: "archiveContinue" }, error);
  const empty = host.state.control.seats.find((p) => p.vacant);
  await host.request({ type: "roomControl", action: "fillBot", target: empty.id }); assert.equal(host.state.control.paused, true);
  await host.request({ type: "archiveContinue" }); assert.equal(host.state.control.paused, false);
  assert.equal(host.state.control.idleAuto, false); assert.equal(host.state.control.auto, false);
  const restored = api.rooms.get(lobby.code);
  assert.deepEqual(restored.game.deck, saved.archive.progress.deck); assert.equal(restored.game.revision, saved.archive.progress.revision);
});

test("Coup adapter: portable save survives a server restart without old identity permissions", async (t) => {
  const first = await fixture(t), old = await first.client();
  await old.request({ type: "create", name: "Old host", capacity: 2 }); await old.request({ type: "fillBots" });
  await old.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const saved = (await old.request({ type: "archiveExport" }, (e) => e.type === "archiveExported")).archive, oldToken = old.token;
  await first.close();
  const second = await fixture(t), next = await second.client(oldToken); assert.notEqual(next.token, oldToken); assert.equal(next.state, null);
  const preview = await next.request({ type: "archiveImport", archive: saved, name: "New owner" }, (e) => e.type === "archiveLobby");
  assert.equal(preview.game, "coup"); assert(preview.seats.every((s) => s.vacant));
  const claimed = await next.request({ type: "archiveClaim", seat: 1 });
  assert.equal(claimed.you, 1); assert.equal(claimed.host, 1); assert.equal(claimed.control.paused, true);
  assert.deepEqual(roles(claimed.game.players[1]), roles(saved.progress.players[1])); assert.deepEqual(roles(claimed.game.players[0]), [null, null]);
});

test("Coup adapter: host ending and restarting require a fresh confirmation revision and retain hidden cards", async (t) => {
  const { a, b, players, room } = await humans(t);
  const initial = structuredClone(room.game), revision = room.game.revision;
  await b.request({ type: "endGame", revision }, error);
  await b.request({ type: "restart", revision }, error);
  await a.request({ type: "endGame" }, error); await a.request({ type: "restart", revision: -1 }, error);
  assert.deepEqual(room.game, initial);
  await a.request({ type: "endGame", revision });
  assert.equal(room.game.phase, "over"); assert.equal(room.game.winner, null); assert.equal(room.game.endReason, "hostEnded");
  assert.deepEqual(a.state.game.players[1].cards.map(c => c.role), [null, null]);
  assert.deepEqual(room.game.players.map(p => p.cards), initial.players.map(p => p.cards));
  await a.request({ type: "restart", revision }, error);
  const endedRevision = room.game.revision;
  await a.request({ type: "restart", revision: endedRevision });
  assert.equal(room.game, null); assert(a.state.seats.every(p => !p.ready && !p.auto));
  await b.request({ type: "ready", ready: true });
  await a.request({ type: "start" }, error);
  await players[2].request({ type: "ready", ready: true });
  await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  assert(room.game.revision > endedRevision);
  await a.request({ type: "action", revision: endedRevision, action: income }, error);
  // Restarting an unfinished game is also allowed only to the confirmed host.
  const beforeRestart = room.game.revision;
  await a.request({ type: "restart", revision: beforeRestart }); assert.equal(room.game, null);
  assert(room.lastRevision >= beforeRestart);
});

test("Coup adapter: bots and voluntary auto-play complete a game and report the actual winner", { timeout: 15000 }, async (t) => {
  const { client, api } = await fixture(t, { COUP_BOT_DELAY: "15" }), a = await client();
  await a.request({ type: "create", name: "Human", capacity: 3 }); await a.request({ type: "fillBots" });
  await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await until(() => a.state?.game?.phase === "over", "Automatic game reaches a winner", 12000);
  const room = api.rooms.get(a.state.code); assert(Number.isInteger(a.state.game.winner));
  assert.equal(a.state.game.winner, room.game.winner); assert.equal(room.game.players.filter((p) => !p.eliminated).length, 1);
  assert.equal(room.timer, null);
  const revision = room.game.revision;
  await a.request({ type: "rematch" }); assert.equal(a.state.game, null); assert.equal(a.state.seats[0].ready, false);
  await a.request({ type: "start" }, (e) => e.type === "state" && e.game); assert(a.state.game.revision > revision);
});
