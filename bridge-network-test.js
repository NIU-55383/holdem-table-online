"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachBridge } = require("./bridge-server"), E = require("./bridge-engine");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, message = "Expected network event") { const end = Date.now() + 3500; while (Date.now() < end) { const value = fn(); if (value) return value; await sleep(10); } throw new Error(message); }
async function fixture(t) {
  const old = process.env.BRIDGE_BOT_DELAY; process.env.BRIDGE_BOT_DELAY = "60000";
  const server = http.createServer(), api = attachBridge(server); server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  const clients = [];
  t.after(async () => { clients.forEach((c) => c.ws.terminate()); await new Promise((resolve) => server.close(resolve)); if (old === undefined) delete process.env.BRIDGE_BOT_DELAY; else process.env.BRIDGE_BOT_DELAY = old; });
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/bridge-ws`), c = { ws, events: [], state: null };
    clients.push(c); ws.on("message", (raw) => { const d = JSON.parse(raw); c.events.push(d); if (d.type === "state") c.state = d; if (d.type === "welcome") c.token = d.token; });
    await once(ws, "open");
    c.send = (d) => ws.send(JSON.stringify(d));
    c.request = async (d, pred = (v) => v.type === "state") => { const n = c.events.length; c.send(d); return until(() => c.events.slice(n).find(pred), JSON.stringify(d)); };
    await c.request({ type: "hello", token }, (v) => v.type === "welcome"); return c;
  }
  return { server, api, client };
}
test("Bridge adapter: private hands, seat consent, host consent, vacancies, reconnection and reactions", { timeout: 20000 }, async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  await a.request({ type: "create", name: "Alice", boards: 4 }); const code = a.state.code;
  await b.request({ type: "join", name: "Bob", code }); await until(() => a.state.seats.length === 2);
  assert.equal(a.state.control.idleAuto, false);
  await b.request({ type: "roomControl", action: "idleAuto", enabled: true }, (v) => v.type === "error");
  await a.request({ type: "chooseSeat", position: 1 }); const swap = a.state.seatSwap;
  assert.equal(a.state.seats[0].position, 0);
  await b.request({ type: "respondSeatSwap", id: swap.id, accept: true }); await until(() => a.state.seats[0].position === 1);
  assert.equal(a.state.host, 0);
  await a.request({ type: "roomControl", action: "transfer", target: a.state.seats[1].socialId });
  await b.request({ type: "roomControl", action: "respond", id: a.state.control.pending.id, accept: true }); await until(() => a.state.host === 1);
  await b.request({ type: "fillBots" }); await b.request({ type: "start" }); await until(() => a.state.game);
  assert.equal(b.state.you, 0); assert.equal(a.state.you, 1);
  for (const c of [a, b]) {
    assert.equal(c.state.game.hands.filter(Boolean).length, 1); assert.equal(c.state.game.originalHands, null);
    assert(!JSON.stringify(c.state).includes(c.token)); assert(!JSON.stringify(c.state).includes("originalHands\": ["));
    assert(c.state.seats.every((p) => typeof p.socialId === "string"));
  }
  const room = api.rooms.get(code), revision = room.game.revision;
  await a.request({ type: "action", action: { type: "call", call: "7NT" } }, (v) => v.type === "error"); assert.equal(room.game.revision, revision);
  const reaction = await a.request({ type: "reaction", kind: "flowers", target: a.state.seats[0].socialId, from: "spoof" }, (v) => v.type === "reaction");
  assert.equal(reaction.from, a.state.seats[1].socialId); assert.equal(room.game.revision, revision);
  await a.request({ type: "reaction", kind: "flowers", target: "foreign" }, (v) => v.type === "error");
  await b.request({ type: "roomControl", action: "idleAuto", enabled: true });
  const warning = b.state.control.warning; assert(warning);
  await b.request({ type: "chat", text: "hello" }); assert.equal(b.state.control.warning.deadline, warning.deadline);
  await b.request({ type: "profile", avatar: { kind: "emoji", value: "⭐" } }); assert.equal(b.state.control.warning.deadline, warning.deadline);
  const target = b.state.seats[2].socialId, hand = [...room.game.hands[2]];
  await b.request({ type: "roomControl", action: "kick", target }); assert(b.state.control.paused); assert.equal(room.timer, null);
  await b.request({ type: "action", action: { type: "call", call: "P" } }, (v) => v.type === "error"); assert.equal(room.game.revision, revision);
  const c = await client(); await c.request({ type: "join", name: "Carol", code });
  assert.equal(c.state.you, 2); assert(!c.state.control.paused); assert.deepEqual(c.state.game.hands[2], hand); assert.notEqual(c.state.seats[2].socialId, target); assert.equal(c.state.seats[2].auto, false);
  const aliceId = a.state.seats[a.state.you].socialId, aliceHand = [...room.game.hands[1]];
  await b.request({ type: "roomControl", action: "kick", target: aliceId }); await until(() => a.events.some((d) => d.type === "left"));
  await a.request({ type: "chat", text: "not a member" }, (v) => v.type === "error");
  await a.request({ type: "join", name: "Alice again", code }); assert.equal(a.state.you, 1); assert.deepEqual(a.state.game.hands[1], aliceHand);
  b.ws.close(); await until(() => a.state.host === 1); assert.equal(room.game.revision, revision);
  const back = await client(b.token); await until(() => back.state); assert.equal(back.state.host, 1); assert.equal(back.state.you, 0);
  await a.request({ type: "roomControl", action: "kick", target: a.state.seats[3].socialId });
  await a.request({ type: "roomControl", action: "fillBot", target: a.state.seats[3].socialId }); assert.equal(a.state.seats[3].bot, true); assert.equal(a.state.control.paused, false);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: false }); await until(() => back.state.control.idleAuto === false); assert.equal(back.state.control.warning, null);
});
test("Bridge adapter: dummy deadlines, no chat timer reset, board scoring and host-only continuation", { timeout: 12000 }, async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  await a.request({ type: "create", name: "North", boards: 4 }); const code = a.state.code;
  await b.request({ type: "join", code, name: "East" }); await a.request({ type: "fillBots" }); await a.request({ type: "start" });
  const r = api.rooms.get(code); ["1NT", "P", "P", "P"].forEach((call) => E.act(r.game, E.controller(r.game), { type: "call", call }));
  E.act(r.game, 1, { type: "play", card: E.legalCards(r.game)[0] }); api.broadcast(r);
  await until(() => a.state.game.current === 2); assert.equal(a.state.game.controller, 0); assert(a.state.game.legalCards.length); assert.equal(b.state.game.legalCards.length, 0);
  await a.request({ type: "roomControl", action: "idleAuto", enabled: true }); assert(a.state.control.warning); assert.equal(b.state.control.warning, null);
  await a.request({ type: "roomControl", action: "auto", enabled: true }); const timer = r.timer;
  await a.request({ type: "chat", text: "bot timer unchanged" }); assert.equal(r.timer, timer);
  await a.request({ type: "roomControl", action: "auto", enabled: false }); assert.equal(r.timer, null);
  while (r.game.phase !== "over") { if (r.game.phase === "trick") E.advanceTrick(r.game); else E.act(r.game, E.controller(r.game), E.chooseBotAction(r.game, E.controller(r.game))); }
  api.broadcast(r); await until(() => a.state.game.phase === "over"); assert.equal(a.state.scores.length, 1); api.broadcast(r); assert.equal(r.scores.length, 1);
  await b.request({ type: "next" }, (v) => v.type === "error"); await a.request({ type: "next" }); assert.equal(a.state.game.board, 2); assert.equal(a.state.game.dealer, 1); assert.equal(a.state.game.hands.filter(Boolean).length, 1);
});

test("Bridge adapter: four-board match records each result once and rematches from the lobby", async (t) => {
  const { api, client } = await fixture(t), a = await client();
  await a.request({ type: "create", name: "Host", boards: 4 });
  await a.request({ type: "fillBots" }); await a.request({ type: "start" });
  const room = api.rooms.get(a.state.code), ids = a.state.seats.map((p) => p.socialId);
  await a.request({ type: "next" }, (v) => v.type === "error");
  for (let board = 1; board <= 4; board++) {
    while (room.game.phase !== "over") { if (room.game.phase === "trick") E.advanceTrick(room.game); else E.act(room.game, E.controller(room.game), E.chooseBotAction(room.game, E.controller(room.game))); }
    api.broadcast(room); await until(() => a.state.scores.length === board);
    assert.equal(a.state.game.board, board); assert.deepEqual(a.state.seats.map((p) => p.socialId), ids);
    if (board < 4) { await a.request({ type: "rematch" }, (v) => v.type === "error"); await a.request({ type: "next" }); }
  }
  await a.request({ type: "next" }, (v) => v.type === "error");
  await a.request({ type: "rematch" }); assert.equal(a.state.game, null); assert.deepEqual(a.state.scores, []);
  await a.request({ type: "start" }); assert.equal(a.state.game.board, 1); assert.deepEqual(a.state.seats.map((p) => p.socialId), ids);
});

test("bot styles stay server-private, distinct and person-bound across swaps, reconnects and replacement", { timeout: 10000 }, async (t) => {
  const { api, client } = await fixture(t), a = await client(), seen = new Map(), original = E.chooseBotAction;
  t.after(() => { E.chooseBotAction = original; });
  E.chooseBotAction = (g, actor, style) => {
    const room = [...api.rooms.values()][0], token = room.seats[actor].token;
    if (seen.has(token)) assert.equal(style, seen.get(token));
    assert(Number.isInteger(style)); seen.set(token, style);
    return { type: "call", call: "P" };
  };
  await a.request({ type: "create", name: "Host", boards: 4 }); await a.request({ type: "fillBots" });
  const r = api.rooms.get(a.state.code), botTokens = r.seats.filter((p) => p.bot).map((p) => p.token);
  assert.doesNotMatch(JSON.stringify(a.state), /personality|botStyle|risk|margin|profile/);
  async function botTurn(token) {
    clearTimeout(r.timer); r.timer = null; r.timerKey = null;
    r.game = E.createGame(r.seats.map((p) => p.name)); r.game.current = r.seats.findIndex((p) => p.token === token);
    const rev = r.game.revision;
    const previous = process.env.BRIDGE_BOT_DELAY; process.env.BRIDGE_BOT_DELAY = "15"; api.broadcast(r); process.env.BRIDGE_BOT_DELAY = previous;
    await until(() => r.game.revision > rev); clearTimeout(r.timer); r.timer = null; r.timerKey = null;
  }
  for (const token of botTokens) await botTurn(token);
  assert.equal(new Set(seen.values()).size, 3);
  r.game = null; api.broadcast(r); await a.request({ type: "chooseSeat", position: 1 }); await a.request({ type: "start" });
  for (const token of botTokens) await botTurn(token);
  const back = await client(a.token); await until(() => back.state); for (const token of botTokens) await botTurn(token);
  const target = back.state.seats.find((p) => p.bot).socialId;
  await back.request({ type: "roomControl", action: "kick", target });
  await back.request({ type: "roomControl", action: "fillBot", target: back.state.seats.find((p) => p.vacant).socialId });
  const replacement = r.seats.find((p) => p.bot && !botTokens.includes(p.token)); await botTurn(replacement.token);
  const currentStyles = r.seats.filter((p) => p.bot).map((p) => seen.get(p.token)); assert.equal(new Set(currentStyles).size, 3);
  assert.doesNotMatch(JSON.stringify(back.state), /personality|botStyle|risk|margin|profile/);
});
