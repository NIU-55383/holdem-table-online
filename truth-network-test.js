"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachTruth } = require("./truth-server"), E = require("./truth-engine");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn, message = "Expected network event", timeout = 3500) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = fn(); if (result) return result; await sleep(10); }
  throw new Error(message);
}
async function fixture(t, overrides = {}) {
  const values = { TRUTH_BOT_DELAY: "60000", ROOM_IDLE_MS: "120000", ROOM_HOST_GRACE_MS: "300000", ...overrides };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const server = http.createServer(), api = attachTruth(server), clients = [];
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => {
    clients.forEach((client) => client.ws.terminate());
    await new Promise((resolve) => server.close(resolve));
    for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  });
  async function client(token) {
    const ws = new WebSocket("ws://127.0.0.1:" + server.address().port + "/truth-ws");
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
    await once(ws, "open"); await c.request({ type: "hello", token }, (event) => event.type === "welcome"); return c;
  }
  return { api, client };
}
const error = (event) => event.type === "error";
async function twoPlayers(t, overrides, settings = {}) {
  const f = await fixture(t, overrides), a = await f.client(), b = await f.client();
  await a.request({ type: "create", name: "Alice", maxPlayers: 4, rounds: 3, level: "heat", ...settings });
  const code = a.state.code;
  await b.request({ type: "join", code, name: "Bob" });
  await b.request({ type: "ready", ready: true }); await a.request({ type: "start" });
  await until(() => b.state.game); return { ...f, a, b, code, room: f.api.rooms.get(code) };
}
test("Truth adapter: ready gate, avatars, compact seat order and person-bound host consent", async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  await a.request({ type: "create", name: "Alice", maxPlayers: 4 });
  const code = a.state.code;
  await a.request({ type: "addBot" });
  const removedBot = a.state.seats[1].socialId;
  await b.request({ type: "join", code, name: "Bob" }); await until(() => a.state.seats.length === 3);
  await a.request({ type: "start" }, error); assert.equal(api.rooms.get(code).game, null);
  await b.request({ type: "chat", text: "My seat moves with me" });
  await a.request({ type: "removeBot", target: removedBot });
  assert.equal(a.state.chat[0].playerId, 1); assert.equal(a.state.seats[1].position, 2);
  await a.request({ type: "addBot" });
  const botAvatar = a.state.seats[2].avatar, botId = a.state.seats[2].socialId;
  await b.request({ type: "profile", avatar: { kind: "emoji", value: "⭐" }, target: a.state.seats[0].socialId });
  await until(() => a.state.seats[1].avatar?.value === "⭐");
  assert.equal(a.state.seats[0].avatar, null);
  await b.request({ type: "profile", avatar: { kind: "symbol", value: "bot-cool" } }, error);
  await b.request({ type: "roomControl", action: "transfer", target: a.state.seats[0].socialId }, error);
  await a.request({ type: "roomControl", action: "transfer", target: a.state.seats[1].socialId });
  assert.equal(a.state.host, 0);
  await b.request({ type: "roomControl", action: "respond", id: a.state.control.pending.id, accept: true });
  await until(() => a.state.host === 1);
  await b.request({ type: "start" }); await until(() => a.state.game);
  assert.equal(b.state.host, 2); assert.equal(b.state.you, 2);
  assert.equal(b.state.chat[0].playerId, 2);
  assert.deepEqual(b.state.seats.map((seat) => seat.position), [0, 1, 2]);
  assert.equal(b.state.seats[1].socialId, botId); assert.deepEqual(b.state.seats[1].avatar, botAvatar);
  assert.equal(b.state.control.idleAuto, false);
  assert(!JSON.stringify(b.state).includes(a.token)); assert(!JSON.stringify(b.state).includes(b.token));
});

test("Truth adapter: authoritative turns and revisions; reactions are authenticated transient events", async (t) => {
  const { api, client, a, b, room } = await twoPlayers(t);
  const outsider = await client(), original = room.game.revision;
  await outsider.request({ type: "action", action: "roll", revision: original, code: room.code, token: a.token }, error);
  await b.request({ type: "action", action: "roll", revision: original, actor: 0 }, error);
  await a.request({ type: "action", action: "roll" }, error);
  assert.equal(room.game.revision, original);
  const socialId = a.state.seats[0].socialId;
  const event = await a.request({ type: "reaction", kind: "flowers", target: a.state.seats[1].socialId, from: b.state.control.you },
    (value) => value.type === "reaction");
  assert.equal(event.from, socialId); assert.equal(event.room, room.code); assert.equal(room.game.revision, original);
  assert.equal(a.state.chat.length, 0);
  await a.request({ type: "reaction", kind: "flowers", target: "foreign-room" }, error);
  await a.request({ type: "reaction", kind: "flowers", target: a.state.seats[1].socialId }, error);
  await a.request({ type: "action", action: "roll", revision: original });
  assert.equal(room.game.revision, original + 1);
  await a.request({ type: "action", action: "roll", revision: original }, error);
  assert.equal(room.game.revision, original + 1);
  const aId = a.state.seats[0].socialId, reconnect = await client(a.token);
  await until(() => reconnect.state);
  assert.equal(reconnect.state.you, 0); assert.equal(reconnect.state.seats.length, 2);
  assert.equal(reconnect.state.seats[0].socialId, aId);
  assert(!reconnect.events.some((value) => value.type === "reaction"));
  assert.equal(api.rooms.get(room.code).seats.length, 2);
});

test("Truth adapter: removals revoke membership, suspend turns and preserve assets for replacements", async (t) => {
  const { api, client, a, b, room, code } = await twoPlayers(t);
  room.game.scores[1] = 7; api.broadcast(room); await until(() => a.state.game.scores[1] === 7);
  const previousId = a.state.seats[1].socialId, revision = room.game.revision, current = room.game.current;
  await b.request({ type: "roomControl", action: "kick", target: a.state.seats[0].socialId }, error);
  await a.request({ type: "roomControl", action: "kick", target: a.state.seats[0].socialId }, error);
  await a.request({ type: "roomControl", action: "kick", target: previousId });
  await until(() => b.events.some((event) => event.type === "left"));
  assert(a.state.control.paused); assert(a.state.seats[1].vacant); assert.equal(room.timer, null);
  await a.request({ type: "action", action: "roll", revision }, error);
  await b.request({ type: "chat", text: "No longer in this room" }, error);
  await b.request({ type: "reaction", kind: "heart", target: a.state.seats[0].socialId }, error);
  assert.equal(room.game.revision, revision); assert.equal(room.game.current, current);
  const removedReconnect = await client(b.token); await sleep(40);
  assert.equal(removedReconnect.state, null);
  await removedReconnect.request({ type: "join", code, name: "Bob again" });
  assert.equal(removedReconnect.state.you, 1); assert.equal(removedReconnect.state.game.scores[1], 7);
  assert.notEqual(removedReconnect.state.seats[1].socialId, previousId);
  assert.equal(removedReconnect.state.seats[1].auto, false); assert.equal(removedReconnect.state.control.paused, false);
  const replacementId = removedReconnect.state.seats[1].socialId;
  await removedReconnect.request({ type: "join", code, name: "No second seat" });
  assert.equal(removedReconnect.state.seats.length, 2); assert.equal(removedReconnect.state.seats[1].socialId, replacementId);
  await a.request({ type: "roomControl", action: "kick", target: previousId }, error);
  assert.equal(room.seats[1].vacant, undefined);
  await a.request({ type: "roomControl", action: "kick", target: replacementId });
  const vacancyId = a.state.seats[1].socialId;
  await a.request({ type: "roomControl", action: "fillBot", target: vacancyId });
  assert.equal(a.state.control.paused, false); assert(a.state.seats[1].bot);
  assert.notEqual(a.state.seats[1].socialId, vacancyId); assert.equal(a.state.game.scores[1], 7);
  assert.equal(a.state.game.current, current); assert.equal(a.state.game.revision, revision);
});

test("Truth adapter: disconnect grace, return cancellation, succession and explicit leave", async (t) => {
  const { client, a, b, room, code } = await twoPlayers(t, { ROOM_HOST_GRACE_MS: "300", ROOM_IDLE_MS: "2000" });
  a.ws.close(); await until(() => !b.state.seats[0].connected);
  assert.equal(b.state.host, 0); assert.equal(room.seats[0].auto, false);
  await b.request({ type: "join", code, name: "Bob" }); assert.equal(b.state.host, 0);
  const back = await client(a.token); await until(() => back.state);
  assert.equal(back.state.host, 0); await sleep(350); assert.equal(room.host, a.token);
  back.ws.close(); await until(() => !b.state.seats[0].connected);
  assert.equal(b.state.host, 0); await until(() => b.state.host === 1);
  const returned = await client(a.token); await until(() => returned.state);
  assert.equal(returned.state.host, 1); assert.equal(returned.state.you, 0);
  assert.equal(room.seats.length, 2);
  await b.request({ type: "leave" }, (event) => event.type === "left");
  await until(() => returned.state.host === 0);
  assert.equal(returned.state.seats[1].connected, false); assert.equal(room.seats[1].auto, false);
});

test("Truth adapter: actor-only idle deadlines, shared settings and offline auto pause", async (t) => {
  const { client, a, b, room } = await twoPlayers(t, { ROOM_IDLE_MS: "500", ROOM_WARNING_MS: "100" });
  await b.request({ type: "roomControl", action: "idleAuto", enabled: true }, error);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  const deadline = a.state.control.warning.deadline;
  await until(() => b.state.control.idleAuto); assert.equal(b.state.control.warning, null);
  await a.request({ type: "chat", text: "This does not reset the clock" });
  assert.equal(a.state.control.warning.deadline, deadline);
  await a.request({ type: "profile", avatar: { kind: "emoji", value: "🎲" } });
  assert.equal(a.state.control.warning.deadline, deadline);
  await a.request({ type: "reaction", kind: "heart", target: a.state.seats[1].socialId }, (event) => event.type === "reaction");
  assert.equal(a.state.control.warning.deadline, deadline);
  await a.request({ type: "roomControl", action: "stay" });
  assert(a.state.control.warning.deadline > deadline);
  await until(() => a.state.seats[0].auto);
  assert(room.timer); assert.equal(a.state.seats[0].connected, true);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false });
  assert.equal(a.state.seats[0].auto, false); assert.equal(a.state.control.warning, null); assert.equal(room.timer, null);
  await a.request({ type: "roomControl", action: "auto", enabled: true });
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true });
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false });
  assert.equal(a.state.seats[0].auto, true);
  const timer = room.timer;
  await b.request({ type: "chat", text: "Timer remains stable" }); assert.equal(room.timer, timer);
  const revision = room.game.revision;
  a.ws.close(); await until(() => !b.state.seats[0].connected);
  assert.equal(room.timer, null); assert.equal(room.game.revision, revision);
  const back = await client(a.token); await until(() => back.state); assert.equal(back.state.seats[0].auto, true); assert(room.timer);
  await back.request({ type: "roomControl", action: "auto", enabled: false }); assert.equal(room.timer, null);
});


const dieRng = (die) => () => (die - 0.5) / 6;
function rollDeterministic(game, values = [6, 1]) {
  let limit = 100;
  while (game.phase === "playing" && game.stage === "roll" && limit--) {
    E.act(game, game.current, { type: "roll" }, dieRng(values[game.current] || 1));
  }
  assert(limit > 0, "Deterministic dice should resolve");
}
async function networkAction(client, room, type, extra = {}, predicate) {
  return client.request({ type: "action", action: type, revision: room.game.revision, ...extra }, predicate);
}
async function networkRolls(clients, room) {
  let count = 0;
  while (room.game.stage === "roll" && room.game.phase === "playing") {
    assert(count++ < 100, "Dice contest should settle after finite tie rerolls");
    await networkAction(clients[room.game.current], room, "roll");
  }
}

test("Truth adapter: bots can ask but always skip their own real-world challenge", async (t) => {
  const { api, client } = await fixture(t, { TRUTH_BOT_DELAY: "15" }), a = await client();
  await a.request({ type: "create", name: "Alice", maxPlayers: 2, rounds: 3, mode: "mixed" });
  await a.request({ type: "addBot" }); await a.request({ type: "start" });
  const room = api.rooms.get(a.state.code), ids = a.state.seats.map((seat) => seat.socialId);
  rollDeterministic(room.game, [1, 6]); api.broadcast(room);
  await until(() => room.game.stage === "challenge");
  assert.equal(room.game.asker, 1); assert.equal(room.game.target, 0);
  assert(room.game.prompt); assert.equal(room.game.scores[1], 0);
  await networkAction(a, room, "complete"); assert.equal(room.game.scores[0], 1);
  rollDeterministic(room.game, [6, 1]); api.broadcast(room);
  await until(() => a.state.game.stage === "choose");
  await networkAction(a, room, "choose", { kind: "dare" }); await networkAction(a, room, "ask");
  await until(() => room.game.turns === 2);
  assert.equal(room.game.scores[1], 0); assert.equal(room.game.scores[0], 1);
  assert.deepEqual(a.state.seats.map((seat) => seat.socialId), ids);
  await a.request({ type: "restart" }, error);
  rollDeterministic(room.game); E.act(room.game, room.game.current, { type: "choose", kind: "truth" });
  E.act(room.game, room.game.current, { type: "ask" }); E.act(room.game, room.game.current, { type: "skip" });
  api.broadcast(room); await until(() => a.state.game.phase === "over");
  assert.equal(room.game.turns, 3); assert.equal(room.timer, null); assert.deepEqual(a.state.game.winners, [0]);
  await a.request({ type: "restart" }); assert.equal(a.state.game, null);
  assert.deepEqual(a.state.seats.map((seat) => seat.socialId), ids);
  await a.request({ type: "start" }); assert.equal(a.state.game.scores[0], 0); assert.equal(a.state.game.mode, "mixed");
});

test("Truth adapter: highest roller asks lowest; custom prompts, complete and pass have separate owners", async (t) => {
  const { a, b, room } = await twoPlayers(t), clients = [a, b], firstRevision = room.game.revision;
  assert.equal(a.state.mode, "mixed"); assert.equal(room.game.mode, "mixed");
  await networkAction(a, room, "complete", {}, error);
  await networkRolls(clients, room);
  assert.equal(room.game.stage, "choose");
  const asker = clients[room.game.asker], target = clients[room.game.target], targetIndex = room.game.target;
  assert.notEqual(room.game.asker, room.game.target);
  await networkAction(target, room, "choose", { kind: "truth" }, error);
  await networkAction(asker, room, "choose", { kind: "invalid" }, error);
  await networkAction(asker, room, "choose", { kind: "dare" });
  assert.equal(room.game.stage, "prepare"); assert.equal(room.game.kind, "dare");
  const prompt = room.game.prompt.id;
  await networkAction(target, room, "reroll", {}, error);
  await networkAction(asker, room, "reroll"); assert.notEqual(room.game.prompt.id, prompt);
  await networkAction(target, room, "ask", { text: "I cannot ask as the target" }, error);
  await networkAction(asker, room, "ask", { text: " ".repeat(4) }, error);
  await networkAction(asker, room, "ask", { text: "字".repeat(241) }, error);
  const custom = "用电影预告片的语气介绍今天的自己。";
  await networkAction(asker, room, "ask", { text: custom });
  assert.equal(room.game.stage, "challenge"); assert.equal(room.game.current, targetIndex);
  assert.equal(room.game.prompt.zh, custom);
  await networkAction(target, room, "reroll", {}, error);
  await networkAction(asker, room, "complete", {}, error);
  await networkAction(target, room, "complete");
  assert.equal(room.game.scores[targetIndex], 1); assert.equal(room.game.turns, 1); assert.equal(room.game.round, 2);
  while (room.game.phase === "playing") {
    const g = room.game, actor = clients[g.current];
    const type = g.stage === "roll" ? "roll" : g.stage === "choose" ? "choose" : g.stage === "prepare" ? "ask" : "skip";
    await networkAction(actor, room, type, type === "choose" ? { kind: "truth" } : {});
  }
  assert.equal(room.game.turns, 3); assert.equal(room.game.history.length, 3);
  assert.deepEqual(room.game.winners, [targetIndex]);
  const finalRevision = room.game.revision;
  await b.request({ type: "restart" }, error);
  await a.request({ type: "restart" }); await b.request({ type: "ready", ready: true }); await a.request({ type: "start" });
  assert(room.game.revision > finalRevision);
  await a.request({ type: "action", action: "roll", revision: firstRevision }, error);
  assert.equal(room.game.stage, "roll");
});

for (const mode of ["truth", "dare"]) {
  test("Truth adapter: " + mode + " mode fixes prompt type and preserves it on restart", async (t) => {
    const { api, a, b, room } = await twoPlayers(t, {}, { mode });
    assert.equal(a.state.mode, mode); assert.equal(room.game.mode, mode);
    rollDeterministic(room.game); api.broadcast(room); await until(() => a.state.game.stage === "prepare");
    assert.equal(room.game.asker, 0); assert.equal(room.game.target, 1); assert.equal(room.game.kind, mode);
    await networkAction(a, room, "choose", { kind: mode === "truth" ? "dare" : "truth" }, error);
    await networkAction(b, room, "ask", {}, error);
    await networkAction(a, room, "ask");
    assert.equal(room.game.stage, "challenge"); assert.equal(room.game.current, 1);
    await networkAction(b, room, "complete"); assert.equal(room.game.scores[1], 1);
    while (room.game.phase === "playing") {
      if (room.game.stage === "roll") rollDeterministic(room.game);
      else E.act(room.game, room.game.current, { type: room.game.stage === "prepare" ? "ask" : "skip" });
    }
    api.broadcast(room); await until(() => a.state.game.phase === "over");
    await a.request({ type: "restart" }); await b.request({ type: "ready", ready: true }); await a.request({ type: "start" });
    assert.equal(a.state.mode, mode); assert.equal(a.state.game.mode, mode);
  });
}

test("Truth adapter: tied extrema reroll only their candidate seats before the high roller asks", async (t) => {
  const { api, client } = await fixture(t), clients = [];
  for (let i = 0; i < 4; i++) clients.push(await client());
  await clients[0].request({ type: "create", name: "Player 0", maxPlayers: 4, mode: "mixed" });
  const code = clients[0].state.code;
  for (let i = 1; i < 4; i++) {
    await clients[i].request({ type: "join", name: "Player " + i, code });
    await clients[i].request({ type: "ready", ready: true });
  }
  await clients[0].request({ type: "start" }); const room = api.rooms.get(code);
  for (const value of [6, 6, 1, 1]) E.act(room.game, room.game.current, { type: "roll" }, dieRng(value));
  api.broadcast(room); await until(() => clients[0].state.game.tie?.role === "high");
  assert.deepEqual(room.game.tie.candidates, [0, 1]); assert.equal(room.game.current, 0);
  await networkAction(clients[2], room, "roll", {}, error);
  await networkAction(clients[0], room, "roll");
  const firstHigh = room.game.tie.dice[0];
  E.act(room.game, room.game.current, { type: "roll" }, dieRng(firstHigh === 6 ? 1 : 6));
  api.broadcast(room); await until(() => clients[2].state.game.tie?.role === "low");
  assert.deepEqual(room.game.tie.candidates, [2, 3]); assert.equal(room.game.current, 2);
  const askerIndex = room.game.asker;
  await networkAction(clients[askerIndex], room, "roll", {}, error);
  await networkAction(clients[2], room, "roll");
  const firstLow = room.game.tie.dice[2];
  E.act(room.game, room.game.current, { type: "roll" }, dieRng(firstLow === 1 ? 6 : 1));
  api.broadcast(room); await until(() => clients[askerIndex].state.game.stage === "choose");
  assert.equal(room.game.tie, null); assert.equal(room.game.current, askerIndex);
  assert([0, 1].includes(room.game.asker)); assert([2, 3].includes(room.game.target));
  const targetIndex = room.game.target;
  await networkAction(clients[targetIndex], room, "choose", { kind: "truth" }, error);
  await networkAction(clients[askerIndex], room, "choose", { kind: "truth" });
  await networkAction(clients[askerIndex], room, "ask", { text: "分享一个让你开心的小瞬间。" });
  assert.equal(room.game.current, targetIndex);
  await networkAction(clients[targetIndex], room, "skip");
  assert.equal(room.game.turns, 1); assert(room.game.scores.every((score) => score === 0));
});

test("Truth adapter rejects an unknown mode or level before creating a room", async (t) => {
  const { api, client } = await fixture(t), a = await client();
  await a.request({ type: "create", name: "Alice", mode: "unknown" }, error);
  await a.request({ type: "create", name: "Alice", level: "unknown" }, error);
  assert.equal(api.rooms.size, 0); assert.equal(a.state, null);
});


for (const level of ["unmasked", "showdown"]) for (const mode of ["truth", "mixed"]) {
  test("Truth adapter: " + level + " accepts " + mode + ", draws its own pool and preserves stale-action guards", async (t) => {
    const { a, b, room } = await twoPlayers(t, {}, { level, mode, rounds: 3 }), clients = [a, b];
    assert.equal(a.state.level, level); assert.equal(room.game.level, level);
    await networkRolls(clients, room);
    const asker = clients[room.game.asker], target = clients[room.game.target];
    const kind = mode === "mixed" ? "dare" : "truth";
    if (mode === "mixed") {
      await networkAction(target, room, "choose", { kind }, error);
      await networkAction(asker, room, "choose", { kind });
    }
    assert.equal(room.game.stage, "prepare"); assert.equal(room.game.kind, kind);
    assert.match(room.game.prompt.id, new RegExp("^" + level + "-" + kind + "-"));
    const staleRevision = room.game.revision, originalPrompt = room.game.prompt.id;
    await networkAction(asker, room, "reroll");
    assert.notEqual(room.game.prompt.id, originalPrompt);
    assert.match(room.game.prompt.id, new RegExp("^" + level + "-" + kind + "-"));
    const unchanged = JSON.stringify(room.game);
    await asker.request({ type: "action", action: "ask", revision: staleRevision }, error);
    await networkAction(target, room, "ask", {}, error);
    assert.equal(JSON.stringify(room.game), unchanged);
    await networkAction(asker, room, "ask");
    await networkAction(target, room, "skip");
    assert.equal(room.game.turns, 1);
    while (room.game.phase === "playing") {
      const g = room.game, actor = clients[g.current];
      const type = g.stage === "roll" ? "roll" : g.stage === "choose" ? "choose" : g.stage === "prepare" ? "ask" : "skip";
      await networkAction(actor, room, type, type === "choose" ? { kind } : {});
    }
    assert.equal(room.game.phase, "over"); assert.equal(room.game.turns, 3);
    await a.request({ type: "restart" }); await b.request({ type: "ready", ready: true }); await a.request({ type: "start" });
    assert.equal(a.state.level, level); assert.equal(a.state.game.level, level); assert.equal(a.state.game.mode, mode);
  });
}
