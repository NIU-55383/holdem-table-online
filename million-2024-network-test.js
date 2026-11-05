"use strict";

const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events");
const { WebSocket } = require("ws"), { attachMillion } = require("./million-server");
const Data = require("./million-data");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const error = (event) => event.type === "error";
const state = (event) => event.type === "state";
const defaults = { noRepeat: false, bruteShares: true };

async function until(fn, message = "Expected network event", timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = fn(); if (result) return result; await sleep(5); }
  throw new Error(message);
}

async function fixture(t) {
  const values = { MILLION_BOT_DELAY: "25", ROOM_IDLE_MS: "120000", ROOM_HOST_GRACE_MS: "300000" };
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  const server = http.createServer(), api = attachMillion(server), clients = [];
  t.after(async () => {
    try {
      clients.forEach((client) => client.ws.terminate());
      await new Promise((resolve) => server.close(resolve));
      for (const room of api.rooms.values()) assert.equal(room.timer, null, "Closing the fixture clears bot jobs");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value;
      }
    }
  });
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/million-ws`);
    const c = { ws, events: [], state: null }; clients.push(c);
    ws.on("message", (raw) => {
      const event = JSON.parse(raw); c.events.push(event);
      if (state(event)) c.state = event;
      if (event.type === "welcome") c.token = event.token;
    });
    c.send = (data) => ws.send(JSON.stringify(data));
    c.request = async (data, predicate = state) => {
      const start = c.events.length; c.send(data);
      const event = await until(() => c.events.slice(start).find((e) => error(e) || predicate(e)), JSON.stringify(data));
      assert(predicate(event), `Unexpected response to ${JSON.stringify(data)}: ${JSON.stringify(event)}`);
      return event;
    };
    await once(ws, "open"); await c.request({ type: "hello", token }, (e) => e.type === "welcome");
    return c;
  }
  return { api, client, clients, server };
}

async function sync(players, room) {
  await until(() => players.every((p) => p.state?.game?.revision === room.game.revision), "All viewers receive the current revision");
}

async function humans(t, count = 4, edition = "2024") {
  const f = await fixture(t), players = [];
  for (let i = 0; i < count; i++) players.push(await f.client());
  const a = players[0], b = players[1];
  await a.request({ type: "create", name: "Host", capacity: count, edition });
  const code = a.state.code, room = f.api.rooms.get(code);
  for (let i = 1; i < count; i++) await players[i].request({ type: "join", code, name: `Player ${i}` });
  await until(() => players.every((p) => p.state?.seats.length === count));
  await a.request({ type: "start" }, (e) => state(e) && e.game?.phase === "planning");
  await sync(players, room);
  return { ...f, players, a, b, code, room };
}

async function action(client, room, move, extra = {}) {
  const revision = room.game.revision;
  return client.request({ type: "action", revision, ...extra, action: move },
    (e) => state(e) && e.game?.revision === revision + 1);
}

async function rejectedAction(client, room, move, extra = {}) {
  const before = JSON.stringify({ game: room.game, chat: room.chat }), start = client.events.length;
  await client.request({ type: "action", revision: room.game.revision, ...extra, action: move }, error);
  // Rejections send an error followed by a resync; drain both before the next request.
  await until(() => client.events.slice(start).some((e) => state(e) && e.game?.revision === room.game.revision));
  assert.equal(JSON.stringify({ game: room.game, chat: room.chat }), before, "Rejected actions are atomic, including claim chat");
}

async function choose(players, room, roles) {
  for (let i = 0; i < players.length; i++) {
    await action(players[i], room, { type: "choose", roles: Array.isArray(roles[i]) ? roles[i] : [roles[i]] });
  }
  await sync(players, room);
}

async function claims(players, room, declared = room.game.players.map(() => Array(room.game.slotsPerPlayer).fill("driver"))) {
  for (let i = 0; i < players.length; i++) {
    assert.equal(room.game.phase, "claims");
    const actor = room.game.claimActor;
    await action(players[actor], room, { type: "claim", roles: declared[actor] });
  }
  await sync(players, room);
  assert.equal(room.game.phase, "negotiation");
}

async function vote(players, room) {
  await action(players[room.game.leader], room, { type: "callVote" });
  for (const [i, player] of players.entries()) {
    if (room.game.phase !== "negotiation") break;
    if (room.game.vote.votes[i] === null) await action(player, room, { type: "vote", yes: true });
  }
  await sync(players, room);
}

function publicChat(message, room) {
  assert.deepEqual(Object.keys(message).sort(), ["generation", "id", "name", "playerId", "round", "text", "time"]);
  assert.equal(message.name, room.seats[message.playerId].name);
  assert.equal(message.round, room.game.round);
  assert.equal(message.generation, room.generation);
  assert.equal(typeof message.id, "string"); assert.equal(typeof message.time, "number");
}

function privateRoles(players, room) {
  for (const [viewer, client] of players.entries()) {
    const g = client.state.game;
    assert.equal(client.state.edition, "2024"); assert.equal(g.edition, "2024");
    for (const key of ["hiddenCard", "intel", "heist"]) assert(!Object.hasOwn(g, key), `${key} stays private`);
    assert.deepEqual(g.private, []);
    assert.deepEqual(g.claims, room.game.claims);
    for (const [owner, player] of g.players.entries()) {
      assert.deepEqual(player.slots.map((s) => s.role), room.game.players[owner].slots.map((s) => owner === viewer ? s.role : null));
    }
    for (const token of players.map((p) => p.token)) assert(!JSON.stringify(client.state).includes(token));
    for (const message of client.state.chat) publicChat(message, room);
  }
}

test("Million 2024 network: creation defaults to 2016; only 2024 permits nine seats", async (t) => {
  const { api, client } = await fixture(t), a = await client();
  for (const options of [
    { capacity: 9 }, { edition: "2016", capacity: 9 }, { edition: "2016", capacity: 10 },
    { edition: "2024", capacity: 10 }, { edition: "2024", capacity: 2 },
    { edition: "2024", capacity: 3.5 }, { edition: "2024", capacity: "9" },
    { edition: 2024 }, { edition: "2025" }
  ]) {
    await a.request({ type: "create", name: "Host", ...options }, error);
    assert.equal(api.rooms.size, 0);
  }
  await a.request({ type: "create", name: "Host" });
  assert.equal(a.state.edition, "2016"); assert.equal(a.state.capacity, 4);
  assert.deepEqual(a.state.settings, defaults); assert.equal(a.state.game, null);
  const oldCode = a.state.code;
  await a.request({ type: "create", name: "Invalid replacement", edition: "2024", capacity: 10 }, error);
  assert(api.rooms.has(oldCode), "Invalid creation does not detach an existing host");
  const modern = await client();
  await modern.request({ type: "create", name: "Modern", edition: "2024", capacity: 9,
    settings: { noRepeat: true, bruteShares: false } });
  assert.equal(modern.state.edition, "2024"); assert.equal(modern.state.capacity, 9);
  assert.deepEqual(modern.state.settings, defaults, "Legacy variants are normalized for 2024");
  await modern.request({ type: "fillBots" });
  assert.equal(modern.state.seats.length, 9);
  await modern.request({ type: "addBot" }, error);
  const excess = await client();
  await excess.request({ type: "join", code: modern.state.code, name: "Tenth" }, error);
  assert.equal(api.rooms.get(modern.state.code).seats.length, 9);
});

test("Million 2024 network: host-only edition switches guard occupied counts and high positions atomically", async (t) => {
  const { api, client } = await fixture(t), a = await client(), b = await client();
  await a.request({ type: "create", name: "Host", capacity: 8, settings: { noRepeat: true, bruteShares: false } });
  const room = api.rooms.get(a.state.code);
  await b.request({ type: "join", code: room.code, name: "Guest" });
  const lobby = () => JSON.stringify({ edition: room.edition, capacity: room.capacity, settings: room.settings,
    seats: room.seats.map((p) => ({ token: p.token, position: p.position })) });
  async function reject(client, data) {
    const before = lobby(); await client.request({ type: "settings", ...data }, error); assert.equal(lobby(), before);
  }
  await reject(b, { edition: "2024", capacity: 9 });
  await reject(a, { edition: "2024", capacity: 10 });
  await reject(a, { edition: "2025", capacity: 8 });
  await a.request({ type: "settings", edition: "2024", capacity: 9 });
  assert.deepEqual(a.state.settings, defaults); assert.equal(a.state.edition, "2024");
  await until(() => b.state.edition === "2024");
  await reject(b, { edition: "2016", capacity: 8 });
  await a.request({ type: "fillBots" });
  await reject(a, { edition: "2016" });
  await reject(a, { edition: "2016", capacity: 8, settings: { noRepeat: true } });
  const high = a.state.seats.find((p) => p.position === 8).socialId;
  await a.request({ type: "removeBot", target: a.state.seats.find((p) => p.position === 7).socialId });
  assert.equal(room.seats.length, 8);
  await reject(a, { edition: "2016", capacity: 8 });
  assert(room.seats.some((p) => p.position === 8), "Shrinking cannot silently discard an occupied high position");
  await a.request({ type: "removeBot", target: high });
  const ids = a.state.seats.map((p) => p.socialId);
  await a.request({ type: "settings", edition: "2016", capacity: 8, settings: { noRepeat: true, bruteShares: false } });
  assert.equal(a.state.edition, "2016"); assert.equal(a.state.capacity, 8);
  assert.deepEqual(a.state.settings, { noRepeat: true, bruteShares: false });
  assert.deepEqual(a.state.seats.map((p) => p.socialId), ids);
});

test("Million 2024 network: nine-player start, clockwise public claims and private ownership", async (t) => {
  const { players, room, a, b } = await humans(t, 9);
  for (const p of players) {
    assert.equal(p.state.game.version, 3); assert.equal(p.state.game.phase, "planning");
    assert.equal(p.state.capacity, 9); assert.equal(p.state.game.slotsPerPlayer, 1);
    assert.deepEqual(p.state.game.availableRoles, Data.rolesForCount(9, "2024"));
    assert.deepEqual(p.state.game.claims, Array(9).fill(null)); assert.equal(p.state.game.claimActor, null);
    assert.deepEqual(p.state.game.requiredActors, Array.from({ length: 9 }, (_, i) => i));
    assert.deepEqual(p.state.game.vote, { open: false, votes: Array(9).fill(null), attempt: 0 });
  }
  const initial = JSON.stringify(room.game);
  await a.request({ type: "settings", edition: "2016", capacity: 8 }, error);
  await b.request({ type: "settings", edition: "2024", capacity: 9 }, error);
  assert.equal(JSON.stringify(room.game), initial); assert.equal(room.edition, "2024");
  await choose(players, room, Array(9).fill("acrobat"));
  assert.equal(a.state.game.phase, "claims"); assert.equal(a.state.game.hiddenCount, 1);
  assert.equal(a.state.game.revealedCards.length, 8); assert.equal(room.chat.length, 0);
  privateRoles(players, room);
  const order = [], leader = room.game.leader;
  for (let step = 0; step < 9; step++) {
    const actor = (leader + step) % 9;
    assert.equal(room.game.claimActor, actor);
    assert.deepEqual(players[actor].state.game.requiredActors, [actor]);
    await action(players[actor], room, { type: "claim", roles: ["driver"] });
    order.push(actor); await sync(players, room); privateRoles(players, room);
    assert.deepEqual(room.chat.map((m) => m.playerId), order);
    for (const p of players) {
      assert.equal(p.state.chat.length, step + 1);
      for (const message of p.state.chat) {
        assert(message.text.includes("I claim Driver."));
        assert(!message.text.includes(Data.MODERN_ROLES.acrobat.en));
        assert(!message.text.includes(Data.MODERN_ROLES.acrobat.zh));
      }
      assert.deepEqual(p.state.game.logs.filter((l) => l.type === "claim").map((l) => ({ owner: l.owner, roles: l.roles })),
        order.map((owner) => ({ owner, roles: ["driver"] })));
    }
  }
  assert.equal(a.state.game.phase, "negotiation"); assert.equal(a.state.game.claimActor, null);
  assert.deepEqual(a.state.game.requiredActors, [leader]);
  assert.deepEqual(room.game.players.map((p) => p.slots[0].role), Array(9).fill("acrobat"), "Claims never rewrite actual roles");
});

test("Million 2024 network: modern actions enforce phases, revisions and authenticated actors", async (t) => {
  const { players, room, a, b, client } = await humans(t), outsider = await client();
  const revision = room.game.revision;
  await outsider.request({ type: "action", code: room.code, token: a.token, actor: 0, revision,
    action: { type: "choose", roles: ["acrobat"] } }, error);
  assert.equal(room.game.revision, revision); assert(!outsider.events.some(state));
  for (const move of [{ type: "claim", roles: ["driver"] }, { type: "callVote" }, { type: "vote", yes: true },
    { type: "steal", target: 1, slot: 0 }, { type: "ready", ready: true }, { type: "threat", target: 1, slot: 0 }]) {
    await rejectedAction(a, room, move);
  }
  await action(a, room, { type: "choose", roles: ["acrobat"] }, { actor: 1, token: b.token });
  assert.equal(room.game.players[0].locked, true); assert.equal(room.game.players[1].locked, false);
  await rejectedAction(b, room, { type: "choose", roles: ["brute"] }, { revision });
  await rejectedAction(b, room, { type: "choose", roles: ["brute"], actor: 0 });
  await rejectedAction(b, room, { type: "choose", roles: ["crook"] });
  for (let i = 1; i < 4; i++) await action(players[i], room, { type: "choose", roles: [i === 2 ? "driver" : "brute"] });
  const actor = room.game.claimActor, other = (actor + 1) % 4;
  await rejectedAction(players[other], room, { type: "claim", roles: ["driver"] }, { actor, token: players[actor].token });
  await rejectedAction(players[actor], room, { type: "claim", roles: ["driver"], revision: room.game.revision - 1 });
  await rejectedAction(players[actor], room, { type: "claim", roles: ["driver"], round: 0 });
  await rejectedAction(players[actor], room, { type: "callVote" });
  await action(players[actor], room, { type: "claim", roles: ["driver"] }, { actor: other });
  assert.deepEqual(room.game.claims[actor], ["driver"]); assert.equal(room.game.claims[other], null);
  while (room.game.phase === "claims") await action(players[room.game.claimActor], room, { type: "claim", roles: ["driver"] });
  const leader = room.game.leader, voter = (leader + 1) % 4;
  for (const move of [{ type: "claim", roles: ["driver"] }, { type: "vote", yes: true },
    { type: "steal", target: 1, slot: 0 }, { type: "ready", ready: true }, { type: "threat", target: 1, slot: 0 }]) {
    await rejectedAction(a, room, move);
  }
  await rejectedAction(players[voter], room, { type: "callVote" }, { actor: leader });
  await action(players[leader], room, { type: "callVote" });
  await action(players[voter], room, { type: "vote", yes: false }, { actor: leader, token: players[leader].token });
  assert.equal(room.game.vote.votes[voter], false); assert.equal(room.game.vote.votes[leader], true);
  await rejectedAction(players[voter], room, { type: "vote", yes: true }, { actor: (voter + 1) % 4 });
  const nextVoter = room.game.vote.votes.findIndex((v) => v === null);
  await action(players[nextVoter], room, { type: "vote", yes: true });
  await sync(players, room); assert.equal(a.state.game.phase, "results");
  for (const move of [{ type: "claim", roles: ["driver"] }, { type: "callVote" }, { type: "vote", yes: true },
    { type: "steal", target: 1, slot: 0 }]) await rejectedAction(a, room, move);
  await rejectedAction(players[voter], room, { type: "next" }, { actor: leader });
  await action(players[leader], room, { type: "next" }); await sync(players, room);
  assert.equal(a.state.game.phase, "planning"); assert.equal(a.state.game.round, 2);
  assert.deepEqual(a.state.game.claims, Array(4).fill(null)); assert.equal(a.state.game.claimActor, null);
  assert.deepEqual(a.state.game.vote, { open: false, votes: Array(4).fill(null), attempt: 0 });
  assert.equal(a.state.game.hiddenCount, 0); assert.deepEqual(a.state.game.offers, []);
});

test("Million 2024 network: three players select two distinct private slots and declare two public roles", async (t) => {
  const { players, room, a } = await humans(t, 3);
  assert.equal(a.state.game.slotsPerPlayer, 2);
  const roles = [["mentalist", "acrobat"], ["brute", "driver"], ["tech", "brute"]];
  for (const invalid of [["driver"], ["driver", "driver"], ["crook", "brute"]]) {
    await rejectedAction(a, room, { type: "choose", roles: invalid });
  }
  await choose(players, room, roles); privateRoles(players, room);
  assert.equal(a.state.game.phase, "claims"); assert.equal(a.state.game.revealedCards.length, 5);
  assert.equal(a.state.game.hiddenCount, 1);
  await rejectedAction(players[room.game.claimActor], room, { type: "claim", roles: ["driver"] });
  const declared = [["tech", "driver"], ["acrobat", "mentalist"], ["driver", "acrobat"]];
  await claims(players, room, declared); privateRoles(players, room);
  for (const message of a.state.chat) {
    const names = declared[message.playerId].map((id) => Data.MODERN_ROLES[id].en).join(" + ");
    assert(message.text.includes(`I claim ${names}.`));
  }
  await rejectedAction(a, room, { type: "withdraw", slot: 2 });
  await action(a, room, { type: "withdraw", slot: 1 }); await sync(players, room);
  assert.equal(a.state.game.players[0].slots[0].withdrawn, false);
  assert.equal(a.state.game.players[0].slots[1].withdrawn, true);
  privateRoles(players, room);
});

test("Million 2024 network: Tech and Mentalist outgoing phases authorize only their actual actors", async (t) => {
  const { players, room, a } = await humans(t, 6);
  await choose(players, room, ["tech", "acrobat", "brute", "mentalist", "driver", "brute"]);
  await claims(players, room);
  await action(players[4], room, { type: "withdraw", slot: 0 });
  await vote(players, room);
  assert.equal(a.state.game.phase, "snitch"); assert.equal(a.state.game.snitch.actor, 0);
  assert.deepEqual(a.state.game.requiredActors, [0]);
  // Two Brutes guarantee at least one public Brute regardless of the shuffled hidden card.
  assert(a.state.game.snitch.options.includes("brute"));
  await rejectedAction(players[1], room, { type: "snitch", role: "brute" }, { actor: 0, token: a.token });
  await rejectedAction(a, room, { type: "snitch", role: "tech" });
  await rejectedAction(players[3], room, { type: "steal", target: 1, slot: 0 });
  await players[4].request({ type: "chat", text: "Withdrawn advice" }, error);
  await action(a, room, { type: "snitch", role: "brute" }); await sync(players, room);
  for (const p of players) {
    assert.equal(p.state.game.phase, "mentalist"); assert.equal(p.state.game.mentalist.actor, 3);
    assert.deepEqual(p.state.game.requiredActors, [3]);
    assert.deepEqual(p.state.game.mentalist.targets.map((target) => target.owner).sort(), [0, 1]);
    assert(!Object.hasOwn(p.state.game, "heist")); assert(!Object.hasOwn(p.state.game, "hiddenCard"));
  }
  await rejectedAction(players[1], room, { type: "steal", target: 0, slot: 0 }, { actor: 3, token: players[3].token });
  await rejectedAction(players[3], room, { type: "steal", target: 4, slot: 0 });
  await rejectedAction(a, room, { type: "snitch", role: "brute" });
  await players[4].request({ type: "chat", text: "Still withdrawn" }, error);
  await action(players[3], room, { type: "steal", target: 1, slot: 0 }); await sync(players, room);
  assert.equal(a.state.game.phase, "results"); assert.equal(a.state.game.mentalist, null);
  const theft = a.state.game.logs.find((log) => log.type === "mentalist-steal");
  assert.equal(theft.from, 1); assert.equal(theft.to, 3); assert.equal(theft.amount, 200);
  await players[4].request({ type: "chat", text: "Round review" });
  assert.equal(room.chat.at(-1).playerId, 4);
});

test("Million 2024 network: real bots publish claims, matching speech and optional offers; social events stay transient", async (t) => {
  const { api, client } = await fixture(t), a = await client(), outsider = await client();
  await a.request({ type: "create", name: "Host", edition: "2024", capacity: 4 });
  await a.request({ type: "fillBots" });
  await a.request({ type: "start" }, (e) => state(e) && e.game?.phase === "planning");
  const room = api.rooms.get(a.state.code);
  await until(() => room.game.players.slice(1).every((p) => p.locked), "Bots choose their roles");
  assert.equal(room.timer, null);
  // Keep the human in charge of claims and voting; do not control random bot declarations.
  room.game.leader = 0;
  await action(a, room, { type: "choose", roles: ["acrobat"] });
  assert.equal(a.state.game.phase, "claims"); assert.equal(a.state.game.claimActor, 0);
  await action(a, room, { type: "claim", roles: ["driver"] });
  await until(() => room.game.phase === "negotiation" && room.timer === null &&
    room.seats.slice(1).every((_, i) => room.botMemory?.get(`${room.generation}:${room.game.round}:${room.seats[i + 1].token}`)?.spoke),
  "Every bot speaks and its bounded negotiation jobs finish");
  await until(() => a.state.game.revision === room.game.revision && a.state.chat.length === room.chat.length);
  privateRoles([a], room);
  const metadata = Data.rolesForEdition("2024");
  assert.deepEqual(a.state.chat.filter((m) => m.text.includes("I claim ")).map((m) => m.playerId), [0, 1, 2, 3]);
  for (let i = 1; i < 4; i++) {
    const declared = a.state.game.claims[i];
    assert.equal(declared.length, 1); assert(a.state.game.availableRoles.includes(declared[0]));
    const messages = a.state.chat.filter((m) => m.playerId === i);
    assert.equal(messages.filter((m) => m.text.includes(`I claim ${metadata[declared[0]].en}.`)).length, 1);
    assert.equal(messages.filter((m) => m.text.includes(`I am ${metadata[declared[0]].en}.`)).length, 1);
  }
  for (const offer of room.game.offers) {
    assert(room.seats[offer.proposer].bot); assert.equal(offer.amount, 100);
    const phrase = offer.quitter === offer.proposer ? "Pay me $1M" : "take $1M to withdraw";
    assert(a.state.chat.some((m) => m.playerId === offer.proposer && m.text.includes(phrase)));
  }
  assert(!a.events.some(error)); assert(!a.events.some((e) => e.type === "reaction"), "Bot speech is not a reaction event");
  const before = JSON.stringify(room.game), memory = JSON.stringify([...room.botMemory]), deadline = room.negotiationUntil;
  await a.request({ type: "chat", text: "Public table discussion" });
  assert.equal(JSON.stringify(room.game), before); assert.equal(room.timer, null);
  assert.equal(JSON.stringify([...room.botMemory]), memory); assert.equal(room.negotiationUntil, deadline);
  await outsider.request({ type: "create", name: "Other room", edition: "2024" });
  const chat = JSON.stringify(room.chat), target = a.state.seats[1].socialId;
  const reaction = await a.request({ type: "reaction", kind: "heart", target, from: target }, (e) => e.type === "reaction");
  assert.equal(reaction.from, a.state.seats[0].socialId); assert.equal(reaction.room, room.code);
  await a.request({ type: "reaction", kind: "flowers", target }, error);
  await outsider.request({ type: "reaction", kind: "heart", target }, error);
  await a.request({ type: "profile", avatar: null });
  assert.equal(JSON.stringify(room.game), before); assert.equal(JSON.stringify(room.chat), chat);
  assert.equal(room.timer, null); assert.equal(JSON.stringify([...room.botMemory]), memory);
  assert.equal(a.events.filter((e) => e.type === "reaction").length, 1);
  assert(!outsider.events.some((e) => e.type === "reaction"));
  const back = await client(a.token); await until(() => back.state);
  assert(!back.events.some((e) => e.type === "reaction"), "Reconnecting never replays reactions");
  assert.equal(JSON.stringify(room.game), before); assert.equal(room.timer, null);
});

for (const edition of ["2016", "2024"]) test(`Million 2024 network: ${edition} rematch preserves its edition and can start a clean opposite edition`, async (t) => {
  const { players, room, a, b } = await humans(t, 4, edition);
  const firstRevision = room.game.revision, ids = a.state.seats.map((p) => p.socialId);
  await a.request({ type: "rematch" }, error);
  // Duplicate Brutes cannot win early or trigger optional role decisions in either edition.
  for (let round = 1; round <= room.game.maxRounds; round++) {
    assert.equal(room.game.round, round);
    await choose(players, room, Array(4).fill("brute"));
    if (edition === "2024") { await claims(players, room); await vote(players, room); }
    else {
      assert.equal(a.state.game.phase, "negotiation"); assert(!Object.hasOwn(a.state.game, "claims"));
      await rejectedAction(a, room, { type: "claim", roles: ["driver"] });
      for (const p of players) await action(p, room, { type: "ready", ready: true });
    }
    if (room.game.phase === "over") break;
    assert.equal(room.game.phase, "results");
    await action(players[room.game.leader], room, { type: "next" });
  }
  await sync(players, room);
  assert.equal(a.state.game.phase, "over"); assert.equal(room.game.round, room.game.maxRounds);
  assert(a.state.game.winners.length); assert.equal(room.timer, null);
  const lastRevision = room.game.revision;
  await b.request({ type: "rematch" }, error);
  await a.request({ type: "rematch" }, (e) => state(e) && e.game === null);
  assert.equal(a.state.edition, edition); assert.equal(a.state.capacity, 4);
  assert.deepEqual(a.state.settings, defaults); assert.deepEqual(a.state.seats.map((p) => p.socialId), ids);
  assert(a.state.seats.every((p) => p.auto === false));
  const nextEdition = edition === "2024" ? "2016" : "2024";
  await a.request({ type: "settings", edition: nextEdition });
  await a.request({ type: "start" }, (e) => state(e) && e.game?.phase === "planning");
  await sync(players, room);
  for (const p of players) {
    assert.equal(p.state.edition, nextEdition); assert.equal(p.state.game.edition, nextEdition);
    assert.equal(p.state.game.version, nextEdition === "2024" ? 3 : 2);
    assert.equal(p.state.game.round, 1); assert.equal(p.state.game.history.length, 0);
    assert.deepEqual(p.state.game.offers, []); assert.deepEqual(p.state.game.winners, []);
    assert.equal(p.state.game.hiddenCount, 0); assert.equal(p.state.game.result, null);
    assert(p.state.game.players.every((player) => !player.locked && player.slots.every((s) => s.role === null)));
    assert.deepEqual(p.state.game.availableRoles, Data.rolesForCount(4, nextEdition));
    if (nextEdition === "2024") assert.deepEqual(p.state.game.claims, Array(4).fill(null));
    else for (const key of ["claims", "claimActor", "vote", "mentalist", "nextLeader"]) assert(!Object.hasOwn(p.state.game, key));
  }
  assert(room.game.revision > lastRevision);
  await rejectedAction(a, room, { type: "choose", roles: ["driver"] }, { revision: firstRevision });
  await rejectedAction(a, room, { type: "choose", roles: ["driver"] }, { revision: lastRevision });
  await action(a, room, { type: "choose", roles: [nextEdition === "2024" ? "acrobat" : "crook"] });
  assert.equal(room.game.players[0].locked, true);
});
