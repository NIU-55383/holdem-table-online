"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachMillion } = require("./million-server"), E = require("./million-engine");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const error = (event) => event.type === "error";
async function until(fn, message = "Expected network event", timeout = 4000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = fn(); if (result) return result; await sleep(10); }
  throw new Error(message);
}
async function fixture(t, overrides = {}) {
  const values = { MILLION_BOT_DELAY: "60000", ROOM_IDLE_MS: "120000", ROOM_HOST_GRACE_MS: "300000", ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const server = http.createServer(), api = attachMillion(server), clients = [];
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => {
    clients.forEach((client) => client.ws.terminate());
    await new Promise((resolve) => server.close(resolve));
    for (const room of api.rooms.values()) assert.equal(room.timer, null, "Server close clears every game timer");
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  async function client(token) {
    const ws = new WebSocket("ws://127.0.0.1:" + server.address().port + "/million-ws");
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
  return { api, client, clients, server };
}
async function humans(t, count = 4, overrides = {}, settings = {}) {
  const f = await fixture(t, overrides), players = [];
  for (let i = 0; i < count; i++) players.push(await f.client());
  await players[0].request({ type: "create", name: "Alice", capacity: count, settings });
  const code = players[0].state.code;
  for (let i = 1; i < count; i++) await players[i].request({ type: "join", code, name: "Player " + i });
  await until(() => players.every((p) => p.state?.seats.length === count));
  await players[0].request({ type: "start" }, (event) => event.type === "state" && event.game);
  await until(() => players.every((p) => p.state?.game));
  return { ...f, players, a: players[0], b: players[1], code, room: f.api.rooms.get(code) };
}
async function action(client, room, move, predicate) {
  return client.request({ type: "action", revision: room.game.revision, action: move }, predicate);
}
async function choose(players, room, roles = ["driver", "brute", "crook", "driver", "snitch"]) {
  for (let i = 0; i < players.length; i++) {
    await action(players[i], room, { type: "choose", roles: room.game.slotsPerPlayer === 2 ? [roles[i], "mastermind"] : [roles[i]] });
  }
  await until(() => players.every((p) => p.state.game.phase === "negotiation"));
}
function directResults(room, leader = 1) {
  const revision = room.game.revision;
  room.game = E.createGame(room.seats.map((p) => p.name), room.settings, () => 0);
  room.game.revision = revision + 1; room.game.leader = leader;
  for (let i = 0; i < room.seats.length; i++) E.act(room.game, i, { type: "choose", roles: ["brute"] }, () => 0);
  for (let i = 0; i < room.seats.length; i++) E.act(room.game, i, { type: "ready", ready: true }, () => 0);
  assert.equal(room.game.phase, "results");
}

test("Million adapter: capacities, lobby-only settings, stable positions and normalized own avatars", async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  for (const capacity of [2, 9, 3.5, "4"]) await a.request({ type: "create", name: "Alice", capacity }, error);
  await a.request({ type: "create", name: "Alice", settings: { noRepeat: "yes" } }, error);
  assert.equal(api.rooms.size, 0);
  await a.request({ type: "create", name: "Alice" });
  assert.equal(a.state.capacity, 4); assert.deepEqual(a.state.settings, { noRepeat: false, bruteShares: true });
  const code = a.state.code;
  await a.request({ type: "start" }, error);
  await a.request({ type: "addBot" });
  const oldBotId = a.state.seats[1].socialId;
  await b.request({ type: "join", name: "Bob", code });
  await b.request({ type: "settings", settings: { noRepeat: true } }, error);
  await b.request({ type: "chat", text: "My position survives lobby changes" });
  await a.request({ type: "removeBot", target: oldBotId });
  await until(() => b.state.seats.length === 2);
  assert.equal(b.state.seats[1].position, 2); assert.equal(b.state.chat[0].playerId, 1);
  await b.request({ type: "profile", target: a.state.seats[0].socialId, avatar: { kind: "emoji", value: "\u2b50" } });
  await until(() => a.state.seats[1].avatar?.value === "\u2b50");
  assert.equal(a.state.seats[0].avatar, null);
  await b.request({ type: "profile", avatar: { kind: "symbol", value: "bot-cool" } }, error);
  await b.request({ type: "profile", avatar: "avatar-0" }, error);
  await a.request({ type: "settings", capacity: 3, settings: { noRepeat: true, bruteShares: false } });
  await a.request({ type: "settings", capacity: 2 }, error);
  await a.request({ type: "fillBots" });
  const bot = a.state.seats.find((p) => p.bot), botAvatar = bot.avatar;
  const bobId = b.state.seats[b.state.you].socialId;
  await a.request({ type: "start" }, (event) => event.type === "state" && event.game);
  await until(() => b.state.game);
  assert.equal(b.state.you, 2); assert.equal(b.state.seats[2].socialId, bobId);
  assert.equal(b.state.chat[0].playerId, 2); assert.deepEqual(b.state.seats.map((p) => p.position), [0, 1, 2]);
  assert.deepEqual(b.state.seats[1].avatar, botAvatar); assert.equal(b.state.seats[1].socialId, bot.socialId);
  assert.equal(b.state.game.slotsPerPlayer, 2); assert.deepEqual(b.state.game.settings, { noRepeat: true, bruteShares: false });
  await a.request({ type: "settings", settings: { noRepeat: false } }, error);
  assert.equal(api.rooms.get(code).settings.noRepeat, true);
  for (const token of [a.token, b.token]) assert(!JSON.stringify(b.state).includes(token));
  for (const capacity of [3, 5, 6, 7, 8]) {
    const other = await client(); await other.request({ type: "create", name: "Capacity " + capacity, capacity });
    await other.request({ type: "fillBots" }); assert.equal(other.state.seats.length, capacity);
    assert.equal(new Set(other.state.seats.map((p) => p.name)).size, capacity);
  }
});

test("Million adapter: simultaneous choices, private roles, stale resync and authenticated actors", async (t) => {
  const { players, a, b, room, client } = await humans(t), outsider = await client();
  const revision = room.game.revision;
  assert.deepEqual(a.state.game.requiredActors, [0, 1, 2, 3]);
  await outsider.request({ type: "action", token: a.token, code: room.code, revision, action: { type: "choose", roles: ["driver"] } }, error);
  await action(a, room, { type: "choose", roles: ["driver"] });
  assert.equal(room.game.players[1].locked, false);
  const start = b.events.length;
  await b.request({ type: "action", revision, actor: 0, action: { type: "choose", roles: ["brute"] } }, error);
  await until(() => b.events.slice(start).some((e) => e.type === "state" && e.game.revision === room.game.revision));
  assert.equal(room.game.players[1].locked, false);
  await b.request({ type: "action", actor: 0, revision: room.game.revision, action: { type: "choose", roles: ["brute"] } });
  assert.equal(room.game.players[1].locked, true); assert.equal(room.game.players[0].slots[0].role, "driver");
  await action(players[2], room, { type: "choose", roles: ["crook"] });
  await action(players[3], room, { type: "choose", roles: ["driver"] });
  await until(() => players.every((p) => p.state.game.phase === "negotiation"));
  for (let viewer = 0; viewer < players.length; viewer++) {
    const g = players[viewer].state.game;
    assert.equal(g.players[viewer].slots[0].role, room.game.players[viewer].slots[0].role);
    for (let i = 0; i < players.length; i++) if (i !== viewer) assert.equal(g.players[i].slots[0].role, null);
    assert(!Object.hasOwn(g, "hiddenCard")); assert(!Object.hasOwn(g, "intel"));
    assert.equal(g.revealedCards.length, 3); assert.equal(g.hiddenCount, 1);
  }
  const before = JSON.stringify(room.game);
  await action(a, room, { type: "choose", roles: ["crook"] }, error);
  assert.equal(JSON.stringify(room.game), before);
  await action(a, room, { type: "withdraw", slot: 0 });
  for (let i = 1; i < players.length; i++) await action(players[i], room, { type: "ready", ready: true });
  await until(() => b.state.game.phase === "results");
  assert.equal(b.state.game.players[0].slots[0].role, "driver");
  assert.equal(b.state.game.result.players[0].slots[0].role, "driver");
  assert.equal(b.state.game.history[0].players[0].slots[0].role, "driver");
  assert.equal(b.state.game.players[2].slots[0].role, "crook");
});

test("Million adapter: binding offers reject duplicates, stale replies and forged counterparties atomically", async (t) => {
  const { players, a, b, room } = await humans(t); await choose(players, room);
  const offer = { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 };
  await action(players[2], room, offer, error);
  await action(a, room, offer);
  const id = room.game.offers[0].id, beforeDuplicate = JSON.stringify(room.game);
  await action(a, room, offer, error); assert.equal(JSON.stringify(room.game), beforeDuplicate);
  await action(a, room, { type: "respond", offerId: id, accept: true }, error);
  await action(players[2], room, { type: "respond", offerId: id, accept: true }, error);
  const cashA = room.game.players[0].cash, cashB = room.game.players[1].cash, ante = room.game.players[1].slots[0].paidAnte;
  await action(b, room, { type: "respond", offerId: id, accept: true });
  assert.equal(room.game.players[0].cash, cashA - 100); assert.equal(room.game.players[1].cash, cashB + 100 + ante);
  assert.equal(room.game.players[1].slots[0].withdrawn, true);
  const accepted = JSON.stringify(room.game);
  await action(b, room, { type: "respond", offerId: id, accept: true }, error);
  assert.equal(JSON.stringify(room.game), accepted);
  await action(a, room, { type: "offer", payer: 0, quitter: 2, slot: 0, amount: 100 });
  const staleId = room.game.offers.at(-1).id;
  await action(a, room, { type: "transfer", to: 3, amount: room.game.players[0].cash });
  assert.equal(room.game.offers.at(-1).status, "stale");
  const stale = JSON.stringify(room.game);
  await action(players[2], room, { type: "respond", offerId: staleId, accept: true }, error);
  assert.equal(JSON.stringify(room.game), stale);
  await action(b, room, { type: "transfer", to: 1, amount: 1 }, error);
});

test("Million adapter: concurrent ready requests reject stale input explicitly and can be retried", async (t) => {
  const { players, a, b, room } = await humans(t); await choose(players, room, ["brute", "brute", "brute", "brute"]);
  const revision = room.game.revision, offsets = [a.events.length, b.events.length];
  const request = { type: "action", revision, action: { type: "ready", ready: true } };
  a.send(request); b.send(request);
  await until(() => [a, b].some((p, i) => p.events.slice(offsets[i]).some(error)));
  assert.equal(room.game.revision, revision + 1);
  assert.equal(room.game.players.filter((p) => p.ready).length, 1);
  const retryIndex = room.game.players[0].ready ? 1 : 0, retry = players[retryIndex];
  await until(() => retry.events.slice(offsets[retryIndex]).some((e) => e.type === "state" && e.game.revision === revision + 1));
  await action(retry, room, { type: "ready", ready: true });
  for (let i = 2; i < 4; i++) await action(players[i], room, { type: "ready", ready: true });
  assert.equal(room.game.phase, "results");
});

test("Million adapter: threats stay private; reconnects and replacements receive only their own inherited seat secrets", async (t) => {
  const { api, players, a, b, room, client, code } = await humans(t, 3);
  const roles = [["driver", "mastermind"], ["brute", "snitch"], ["crook", "mastermind"]];
  for (let i = 0; i < 3; i++) await action(players[i], room, { type: "choose", roles: roles[i] });
  room.game.players[0].threats = 1; api.broadcast(room);
  await action(a, room, { type: "threat", target: 1, slot: 0 });
  await until(() => a.state.game.players[1].slots[0].role === "brute");
  assert.deepEqual(a.state.game.players[1].slots.map((s) => s.role), ["brute", null]);
  await until(() => players[2].state.game.revision === room.game.revision);
  assert.deepEqual(players[2].state.game.players[1].slots.map((s) => s.role), [null, null]);
  assert.equal(room.game.players[0].threats, 0);
  const back = await client(b.token); await until(() => back.state);
  assert.deepEqual(back.state.game.players[1].slots.map((s) => s.role), roles[1]);
  assert.deepEqual(back.state.game.players[0].slots.map((s) => s.role), [null, null]);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  const previousId = a.state.seats[1].socialId, cash = room.game.players[1].cash, revision = room.game.revision;
  await a.request({ type: "roomControl", action: "kick", target: previousId });
  const replacement = await client();
  await replacement.request({ type: "join", code, name: "New teammate" });
  assert.equal(replacement.state.you, 1); assert.equal(replacement.state.game.players[1].name, "New teammate");
  assert.equal(replacement.state.game.players[1].cash, cash); assert.equal(replacement.state.game.revision, revision + 2);
  assert.equal(replacement.state.control.idleAuto, true); assert.equal(replacement.state.seats[1].auto, false);
  assert.notEqual(replacement.state.seats[1].socialId, previousId);
  assert.deepEqual(replacement.state.game.players[1].slots.map((s) => s.role), roles[1]);
  assert.deepEqual(replacement.state.game.players[2].slots.map((s) => s.role), [null, null]);
  assert(!Object.hasOwn(replacement.state.game, "intel"));
  await back.request({ type: "action", revision, action: { type: "ready", ready: true } }, error);
});

test("Million adapter: reactions are room-only, authenticated, cooldown-limited and never restart jobs", async (t) => {
  const { players, a, b, room, client } = await humans(t), outsider = await client();
  await action(b, room, { type: "choose", roles: ["brute"] });
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  const timer = room.timer, revision = room.game.revision, chatLength = room.chat.length;
  const foreign = await outsider.request({ type: "create", name: "Other room" });
  const target = a.state.seats[1].socialId;
  const event = await a.request({ type: "reaction", kind: "flowers", target, from: target }, (e) => e.type === "reaction");
  assert.equal(event.from, a.state.seats[0].socialId); assert.equal(event.room, room.code);
  await until(() => players.every((p) => p.events.some((e) => e.id === event.id)));
  assert.equal(room.game.revision, revision); assert.equal(room.timer, timer); assert.equal(room.chat.length, chatLength);
  await a.request({ type: "reaction", kind: "heart", target }, error);
  await b.request({ type: "reaction", kind: "unknown", target: a.state.seats[0].socialId }, error);
  await b.request({ type: "reaction", kind: "heart", target: foreign.seats[0].socialId }, error);
  assert(!outsider.events.some((e) => e.type === "reaction"));
  const id = a.state.seats[0].socialId, back = await client(a.token);
  await until(() => back.state);
  assert.equal(back.state.you, 0); assert.equal(back.state.seats[0].socialId, id);
  assert(!back.events.some((e) => e.type === "reaction"));
  await until(() => a.ws.readyState === WebSocket.CLOSED);
  await back.request({ type: "hello" }, error);
  await back.request({ type: "join", name: "No duplicate", code: room.code });
  assert.equal(room.seats.length, 4); assert.equal(room.game.revision, revision);
});

test("Million adapter: host transfer and role requests require the correct person's consent", async (t) => {
  const { a, b, players, room } = await humans(t);
  await b.request({ type: "roomControl", action: "transfer", target: a.state.seats[2].socialId }, error);
  await a.request({ type: "roomControl", action: "transfer", target: a.state.seats[1].socialId });
  const id = a.state.control.pending.id;
  assert.equal(room.host, a.token);
  await players[2].request({ type: "roomControl", action: "respond", id, accept: true }, error);
  await b.request({ type: "roomControl", action: "respond", id, accept: false });
  assert.equal(room.host, a.token);
  await b.request({ type: "roomControl", action: "requestHost" });
  await a.request({ type: "roomControl", action: "respond", id: b.state.control.pending.id, accept: true });
  assert.equal(room.host, b.token); assert.equal(a.state.host, 1);
  await a.request({ type: "roomControl", action: "respond", id, accept: true }, error);
  assert.equal(room.host, b.token);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true }, error);
});

test("Million adapter: vacancies stop jobs, revoke memberships and preserve assets through duplicate-safe replacements", async (t) => {
  const { api, a, b, players, room, code, client } = await humans(t);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  assert(room.timer);
  const oldB = a.state.seats[1].socialId, oldC = a.state.seats[2].socialId, revision = room.game.revision;
  room.game.players[1].cash = 731; room.game.players[1].threats = 2;
  await b.request({ type: "roomControl", action: "kick", target: oldC }, error);
  await a.request({ type: "roomControl", action: "kick", target: oldB });
  await until(() => b.events.some((e) => e.type === "left"));
  assert.equal(room.timer, null); assert.equal(a.state.control.paused, true);
  await a.request({ type: "roomControl", action: "kick", target: oldC });
  await action(a, room, { type: "choose", roles: ["driver"] }, error);
  await b.request({ type: "chat", text: "Removed" }, error);
  await b.request({ type: "reaction", kind: "heart", target: a.state.seats[0].socialId }, error);
  await b.request({ type: "profile", avatar: { kind: "emoji", value: "\u2b50" } }, error);
  const reconnect = await client(b.token); await sleep(30); assert.equal(reconnect.state, null);
  await a.request({ type: "join", code, name: "Alice" });
  assert.equal(room.seats.filter((p) => p.vacant).length, 2);
  await reconnect.request({ type: "join", code, name: "Bob back" });
  assert.equal(reconnect.state.you, 1); assert.equal(reconnect.state.game.players[1].cash, 731);
  assert.equal(reconnect.state.game.players[1].threats, 2); assert.equal(reconnect.state.seats[1].auto, false);
  assert.notEqual(reconnect.state.seats[1].socialId, oldB); assert.equal(room.timer, null);
  await reconnect.request({ type: "join", code, name: "No duplicate" });
  assert.equal(room.seats.filter((p) => p.vacant).length, 1);
  await a.request({ type: "roomControl", action: "kick", target: oldB }, error);
  await a.request({ type: "chat", text: "Management and chat remain available" });
  await a.request({ type: "reaction", kind: "heart", target: reconnect.state.seats[1].socialId }, (e) => e.type === "reaction");
  const vacantId = a.state.seats[2].socialId;
  await a.request({ type: "roomControl", action: "fillBot", target: vacantId });
  assert.equal(a.state.control.paused, false); assert(room.timer);
  assert.equal(room.game.revision, revision + 4); assert.equal(room.seats.length, 4);
  assert.notEqual(a.state.seats[2].socialId, vacantId); assert.equal(a.state.seats[2].position, 2);
  await players[2].request({ type: "join", code, name: "Too late" }, error);
  await a.request({ type: "roomControl", action: "fillBot", target: vacantId }, error);
  const botId = a.state.seats[2].socialId;
  await a.request({ type: "roomControl", action: "kick", target: botId });
  assert.equal(room.timer, null); assert.equal(api.rooms.get(code).game.players[1].cash, 731);
});

for (const replaced of [1, 2]) test(`Million adapter: replacing offer ${replaced === 2 ? "payer" : "quitter"} invalidates old consent and queued actions`, async (t) => {
  const { a, players, room, code, client } = await humans(t);
  await choose(players, room, ["driver", "brute", "crook", "brute"]);
  await action(players[2], room, { type: "offer", payer: 2, quitter: 1, slot: 0, amount: 100 });
  await action(a, room, { type: "offer", payer: 0, quitter: 3, slot: 0, amount: 100 });
  const oldOffer = room.game.offers[0].id, revision = room.game.revision;
  const cash = room.game.players.map((p) => p.cash), slots = room.game.players.map((p) => structuredClone(p.slots));
  await a.request({ type: "roomControl", action: "kick", target: a.state.seats[replaced].socialId });
  assert.equal(room.game.offers[0].status, "stale");
  assert.equal(room.game.offers[1].status, "pending", "Unaffected parties retain their offer");
  assert.equal(room.game.revision, revision + 1);
  const replacement = await client();
  await replacement.request({ type: "join", code, name: "Replacement" });
  assert.equal(replacement.state.you, replaced); assert.equal(room.game.revision, revision + 2);
  const responder = replaced === 1 ? replacement : players[1];
  await responder.request({ type: "action", revision, action: { type: "respond", offerId: oldOffer, accept: true } }, error);
  await action(responder, room, { type: "respond", offerId: oldOffer, accept: true }, error);
  await responder.request({ type: "action", action: { type: "respond", offerId: oldOffer, accept: true } }, error);
  await a.request({ type: "action", revision, action: { type: "transfer", to: replaced, amount: 10 } }, error);
  assert.deepEqual(room.game.players.map((p) => p.cash), cash);
  assert.deepEqual(room.game.players.map((p) => p.slots), slots);
  const proposer = replaced === 2 ? replacement : players[2];
  await action(proposer, room, { type: "offer", payer: 2, quitter: 1, slot: 0, amount: 100 });
  const freshOffer = room.game.offers.at(-1).id;
  assert.notEqual(freshOffer, oldOffer);
  await action(responder, room, { type: "respond", offerId: freshOffer, accept: true });
  assert.equal(room.game.players[2].cash, cash[2] - 100);
  assert.equal(room.game.players[1].cash, cash[1] + 100 + slots[1][0].paidAnte);
});

for (const fillBot of [false, true]) test(`Million adapter: ${fillBot ? "bot" : "human"} replacement must confirm independently while same-person reconnect preserves consent`, async (t) => {
  const { a, b, players, room, code, client } = await humans(t);
  await choose(players, room, ["driver", "brute", "crook", "brute"]);
  await action(b, room, { type: "offer", payer: 1, quitter: 2, slot: 0, amount: 100 });
  await action(b, room, { type: "ready", ready: true });
  const revision = room.game.revision, owned = structuredClone(room.game.players[1]);
  const back = await client(b.token); await until(() => back.state);
  assert.equal(back.state.game.players[1].ready, true);
  assert.equal(room.game.offers[0].status, "pending"); assert.equal(room.game.revision, revision);
  await a.request({ type: "roomControl", action: "kick", target: a.state.seats[1].socialId });
  assert.equal(room.game.players[1].ready, false); assert.equal(room.game.offers[0].status, "stale");
  let replacement;
  if (fillBot) await a.request({ type: "roomControl", action: "fillBot", target: a.state.seats[1].socialId });
  else {
    replacement = await client(b.token);
    await replacement.request({ type: "join", code, name: "Returning as a replacement" });
  }
  const current = room.game.players[1];
  for (const field of ["slots", "cash", "threats", "pendingThreats", "locked"]) assert.deepEqual(current[field], owned[field]);
  assert.equal(current.ready, false); assert.equal(room.game.revision, revision + 2);
  for (const i of [0, 2, 3]) await action(players[i], room, { type: "ready", ready: true });
  assert.equal(room.game.phase, "negotiation"); assert.deepEqual(E.requiredActors(room.game), [1]);
  if (fillBot) assert(room.timer, "Replacement bot must schedule its own decision");
  else {
    assert.equal(room.seats[1].auto, false); assert.equal(room.timer, null);
    await action(replacement, room, { type: "ready", ready: true });
    assert.equal(room.game.phase, "results");
  }
});

test("Million adapter: five-minute host grace policy, reconnect cancellation, clockwise succession and explicit leave", async (t) => {
  const { a, b, room, code, client, players } = await humans(t, 4, { ROOM_HOST_GRACE_MS: "300", ROOM_IDLE_MS: "2000" });
  a.ws.close(); await until(() => !b.state.seats[0].connected);
  assert.equal(b.state.host, 0); assert.equal(room.seats[0].auto, false);
  await b.request({ type: "join", code, name: "Still Bob" }); assert.equal(b.state.host, 0);
  const back = await client(a.token); await until(() => back.state);
  assert.equal(back.state.host, 0); await sleep(350); assert.equal(room.host, a.token);
  b.ws.close(); await until(() => !back.state.seats[1].connected);
  back.ws.close(); await until(() => !players[2].state.seats[0].connected);
  assert.equal(players[2].state.host, 0);
  await until(() => players[2].state.host === 2);
  const returned = await client(a.token); await until(() => returned.state);
  assert.equal(returned.state.host, 2); assert.equal(returned.state.you, 0);
  await players[2].request({ type: "leave" }, (e) => e.type === "left");
  await until(() => returned.state.host === 3);
  assert.equal(room.seats[2].auto, false); assert.equal(room.seats.length, 4);
});

test("Million adapter: simultaneous idle clocks do not reset for others; policy and personal auto stay separate", async (t) => {
  const { a, b, room, players, client } = await humans(t, 4, { ROOM_IDLE_MS: "650", ROOM_WARNING_MS: "100" });
  assert.equal(a.state.control.idleAuto, false); assert.equal(a.state.control.warning, null);
  await b.request({ type: "roomControl", action: "idleAuto", enabled: true }, error);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  const deadline = a.state.control.warning.deadline;
  await until(() => players.every((p) => p.state.control.warning));
  await action(b, room, { type: "choose", roles: ["brute"] });
  await until(() => a.state.game.players[1].locked);
  assert.equal(a.state.control.warning.deadline, deadline); assert.equal(b.state.control.warning, null);
  await a.request({ type: "chat", text: "No idle-clock extension" });
  await a.request({ type: "profile", avatar: { kind: "emoji", value: "\u2b50" } });
  await a.request({ type: "reaction", kind: "heart", target: a.state.seats[1].socialId }, (e) => e.type === "reaction");
  assert.equal(a.state.control.warning.deadline, deadline);
  await a.request({ type: "roomControl", action: "stay" });
  assert(a.state.control.warning.deadline > deadline);
  await until(() => a.state.seats[0].auto); assert.equal(a.state.seats[0].connected, true); assert(room.timer);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false });
  assert.equal(a.state.seats[0].auto, false); assert.equal(room.timer, null); assert.equal(a.state.control.warning, null);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false });
  assert.equal(a.state.seats[0].auto, true);
  a.ws.close(); await until(() => !b.state.seats[0].connected);
  assert.equal(room.timer, null);
  const revision = room.game.revision; await sleep(50); assert.equal(room.game.revision, revision);
  const back = await client(a.token); await until(() => back.state);
  assert.equal(back.state.seats[0].auto, true); assert(room.timer);
  await back.request({ type: "roomControl", action: "auto", enabled: false }); assert.equal(room.timer, null);
});

test("Million adapter: every automatic job waits for an offline required human and for any online human", async (t) => {
  const { api, client } = await fixture(t, { MILLION_BOT_DELAY: "100" }), a = await client(), b = await client();
  await a.request({ type: "create", name: "Alice", capacity: 3 });
  const code = a.state.code; await b.request({ type: "join", code, name: "Bob" });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const room = api.rooms.get(code), revision = room.game.revision;
  b.ws.close(); await until(() => !a.state.seats[1].connected);
  assert.equal(room.timer, null); await sleep(180); assert.equal(room.game.revision, revision);
  const back = await client(b.token); await until(() => back.state);
  await until(() => room.game.players[2].locked); assert.equal(room.game.players[1].locked, false);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await back.request({ type: "roomControl", action: "auto", enabled: true });
  a.ws.close(); back.ws.close(); await until(() => room.seats.every((p) => p.bot || !p.ws));
  const stopped = room.game.revision; assert.equal(room.timer, null);
  await sleep(180); assert.equal(room.game.revision, stopped);
});

test("Million adapter: already-ready bots still answer offers without repeating ready", async (t) => {
  const { api, client } = await fixture(t, { MILLION_BOT_DELAY: "25" }), a = await client();
  await a.request({ type: "create", name: "Alice", capacity: 4 });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const room = api.rooms.get(a.state.code);
  await until(() => room.game.players.slice(1).every((p) => p.locked));
  await action(a, room, { type: "choose", roles: ["driver"] });
  for (let i = 1; i < 4; i++) room.game.players[i].slots[0].role = "brute";
  room.game.revealedCards = ["brute", "brute", "brute"]; api.broadcast(room);
  await until(() => room.game.players.slice(1).every((p) => p.ready));
  const revision = room.game.revision; assert.equal(room.timer, null);
  await a.request({ type: "profile", avatar: null }); await sleep(80); assert.equal(room.game.revision, revision);
  await action(a, room, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  const offerId = room.game.offers.at(-1).id;
  await until(() => room.game.offers.find(o => o.id === offerId).status === "accepted");
  assert.equal(room.game.players[1].slots[0].withdrawn, true);
  assert.equal(room.game.phase, "negotiation"); assert.equal(room.timer, null);
  assert(!a.events.some(error));
});

test("Million adapter: default negotiation and results both leave five seconds for human inspection", async (t) => {
  const { api, client } = await fixture(t, { MILLION_BOT_DELAY: "" }), a = await client();
  await a.request({ type: "create", name: "Alice", capacity: 4 });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const room = api.rooms.get(a.state.code);
  for (let i = 1; i < 4; i++) E.act(room.game, i, { type: "choose", roles: ["brute"] });
  api.broadcast(room); await until(() => a.state.game.players[3].locked);
  await action(a, room, { type: "choose", roles: ["brute"] });
  assert(room.negotiationUntil - Date.now() > 4700); assert(room.timer);
  const revision = room.game.revision; await sleep(150); assert.equal(room.game.revision, revision);
  directResults(room); api.broadcast(room);
  assert(room.resultsUntil - Date.now() > 4700); assert(room.timer);
  const resultRevision = room.game.revision; await sleep(150); assert.equal(room.game.revision, resultRevision);
});

test("Million adapter: a ready bot's pending offer is answered before another bot can close the heist", async (t) => {
  const { api, client } = await fixture(t, { MILLION_BOT_DELAY: "100" }), a = await client();
  await a.request({ type: "create", name: "Alice", capacity: 4 });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const room = api.rooms.get(a.state.code);
  for (let i = 1; i < 4; i++) E.act(room.game, i, { type: "choose", roles: ["brute"] });
  api.broadcast(room); await until(() => a.state.game.players[3].locked);
  await action(a, room, { type: "choose", roles: ["driver"] });
  E.act(room.game, 1, { type: "ready", ready: true }); E.act(room.game, 3, { type: "ready", ready: true });
  api.broadcast(room);
  await action(a, room, { type: "offer", payer: 0, quitter: 1, slot: 0, amount: 100 });
  const offerId = room.game.offers.at(-1).id;
  await action(a, room, { type: "ready", ready: true });
  await until(() => room.game.offers.find(o => o.id === offerId)?.status !== "pending");
  assert.equal(room.game.offers.find(o => o.id === offerId).status, "accepted");
  assert.equal(room.game.players[1].slots[0].withdrawn, true);
  assert(!a.events.some(error));
});

test("Million adapter: connected leader owns next, host proxy only for offline or controlled leader", async (t) => {
  const { api, a, b, room } = await humans(t);
  directResults(room); api.broadcast(room); await until(() => a.state.game.phase === "results");
  await action(a, room, { type: "next" }, error); assert.equal(room.game.round, 1);
  await action(b, room, { type: "next" }); assert.equal(room.game.round, 2);
  directResults(room); api.broadcast(room); await until(() => a.state.game.phase === "results");
  await b.request({ type: "roomControl", action: "auto", enabled: true });
  await action(a, room, { type: "next" }); assert.equal(room.game.round, 2);
  directResults(room); api.broadcast(room); await until(() => a.state.game.phase === "results");
  b.ws.close(); await until(() => !a.state.seats[1].connected); assert.equal(room.timer, null);
  await action(a, room, { type: "next" }); assert.equal(room.game.round, 2);
});

test("Million adapter: withdrawn spectators cannot chat during negotiation or Snitch decisions", async (t) => {
  const { players, a, room } = await humans(t, 5);
  await choose(players, room, ["driver", "brute", "crook", "driver", "snitch"]);
  await action(a, room, { type: "withdraw", slot: 0 });
  await a.request({ type: "chat", text: "Withdrawn advice" }, error); assert.equal(room.chat.length, 0);
  for (let i = 1; i < players.length; i++) await action(players[i], room, { type: "ready", ready: true });
  assert.equal(room.game.phase, "snitch");
  await a.request({ type: "chat", text: "Withdrawn advice again" }, error);
  await players[1].request({ type: "chat", text: "Still active" });
  await action(a, room, { type: "snitch", role: room.game.snitch.options[0] }, error);
  await action(players[4], room, { type: "snitch", role: room.game.snitch.options[0] });
  await a.request({ type: "chat", text: "Round review is allowed" });
  assert.equal(room.chat.length, 2);
});

test("Million adapter: automated simultaneous rounds finish, rematch preserves identities and rejects previous-match revisions", async (t) => {
  const { api, client } = await fixture(t, { MILLION_BOT_DELAY: "15" }), a = await client();
  await a.request({ type: "create", name: "Alice", capacity: 3, settings: { noRepeat: true, bruteShares: false } });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  const room = api.rooms.get(a.state.code), firstRevision = room.game.revision, ids = a.state.seats.map((p) => p.socialId);
  await a.request({ type: "rematch" }, error);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await until(() => a.state.game.phase === "over", "Automated match completes", 15000);
  assert(a.state.game.winners.length); assert.equal(room.timer, null);
  assert(!a.events.some((e) => error(e) && !e.message.includes("Finish this game first")));
  const lastRevision = room.game.revision;
  await a.request({ type: "rematch" }); assert.equal(a.state.game, null);
  assert.deepEqual(a.state.seats.map((p) => p.socialId), ids); assert.equal(a.state.seats[0].auto, false);
  await a.request({ type: "start" }, (e) => e.type === "state" && e.game);
  assert(room.game.revision > lastRevision); assert.equal(room.game.settings.noRepeat, true);
  await a.request({ type: "action", revision: firstRevision, action: { type: "choose", roles: ["driver", "brute"] } }, error);
  assert.equal(room.game.players[0].locked, false);
});
