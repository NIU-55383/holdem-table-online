"use strict";
const { test, before, after } = require("node:test"), assert = require("node:assert/strict");
const { spawn } = require("node:child_process"), { once } = require("node:events"), { WebSocket } = require("ws");
const Social = require("./game-social"), Data = require("./social-data");
const http = require("node:http"), { attachCatan } = require("./catan-server");
const port = 18763, sockets = []; let server;
before(async () => {
  server = spawn(process.execPath, ["server.js"], { cwd: __dirname, windowsHide: true, env: { ...process.env, PORT: String(port), AUTO_OPEN: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => { const timeout = setTimeout(() => reject(Error("Startup timeout")), 8000); server.stdout.once("data", () => { clearTimeout(timeout); resolve(); }); server.once("error", reject); server.stderr.once("data", (e) => reject(Error(String(e)))); });
});
after(async () => { sockets.forEach((s) => s.terminate()); if (server?.exitCode === null) { server.kill(); await once(server, "exit"); } });
test("reactions have stable public identities, trusted senders, bounded rates and no game mutation", () => {
  const a = { name: "Alice", token: "secret" }, b = { name: "Bob" }, c = { name: "Elsewhere" }, room = { code: "TEST", revision: 7 };
  const target = Social.publicId(b), before = JSON.stringify([room, a, b]);
  assert.equal(Social.publicId(b), target);
  const event = Social.reaction(room, [a, b], a, { target, kind: "flowers", from: "spoof" }, 10000);
  assert.equal(event.from, Social.publicId(a)); assert.equal(event.to, target); assert.ok(!JSON.stringify(event).includes("secret"));
  assert.equal(JSON.stringify([room, a, b]), before);
  assert.throws(() => Social.reaction(room, [a, b], a, { target, kind: "heart" }, 10500));
  for (const request of [{ target: Social.publicId(c), kind: "heart" }, { target, kind: "<script>" }, { target: Social.publicId(a), kind: "heart" }]) assert.throws(() => Social.reaction(room, [a, b], a, request, 20000));
  assert.throws(() => Social.reaction(room, [a, b], c, { target, kind: "heart" }, 20000));
  assert.equal(Social.reaction(room, [b, a], a, { target, kind: "heart" }, 22000).to, target, "Seat swaps retain identity");
  b.departed = true; assert.throws(() => Social.reaction(room, [a, b], a, { target, kind: "heart" }, 24000));
});
test("skin whitelist covers classic/robber/pirate choices and rejects arbitrary markup", () => {
  assert.deepEqual(Data.normalizeSkins({ robber: "<svg>", pirate: "https://x" }), { robber: "classic", pirate: "classic" });
  for (const kind of ["robber", "pirate"]) for (const skin of Data.skins[kind]) assert.equal(Data.normalizeSkins({ [kind]: skin.id })[kind], skin.id);
});
async function client(kind, token, serverPort = port) {
  const socket = new WebSocket(`ws://127.0.0.1:${serverPort}/${kind === "poker" ? "ws" : kind === "catan" ? "catan-ws" : "duel-ws"}`), messages = [];
  sockets.push(socket); socket.on("message", (raw) => messages.push(JSON.parse(raw))); await once(socket, "open");
  const send = (m) => socket.send(JSON.stringify(m));
  async function wait(predicate, cursor = 0) { for (let i = 0; i < 350; i++) { const m = messages.slice(cursor).find(predicate); if (m) return m; await new Promise((r) => setTimeout(r, 20)); } throw Error(`Missing ${kind} message: ${JSON.stringify(messages.at(-1))}`); }
  const id = token || crypto.randomUUID(); send({ type: "hello", clientId: id, token });
  const welcome = kind === "poker" ? { token: id } : await wait((m) => m.type === "welcome");
  return { socket, messages, send, wait, token: welcome.token };
}
test("Catan rematch keeps the room's skins and public identities", async () => {
  const server = http.createServer(), catan = attachCatan(server); server.on("upgrade", (r, s, h) => catan.upgrade(r, s, h));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let host;
  try {
    host = await client("catan", undefined, server.address().port);
    const skins = { robber: "red", pirate: "skull" };
    host.send({ type: "create", name: "Host", mapId: "shores-1", skins });
    const lobby = await host.wait((m) => m.type === "state");
    host.send({ type: "fillBots" }); await host.wait((m) => m.type === "state" && m.seats.length === 3);
    host.send({ type: "start" }); await host.wait((m) => m.type === "state" && m.game);
    const room = catan.rooms.get(lobby.code), old = room.game; old.phase = "over";
    host.send({ type: "rematch" });
    const cursor = host.messages.length;
    const fresh = await host.wait((m) => m.type === "state" && m.game?.phase === "setupSettlement", cursor);
    assert.notEqual(room.game, old); assert.deepEqual(fresh.game.board.skins, skins); assert.equal(fresh.seats[0].socialId, lobby.seats[0].socialId);
  } finally { host?.socket.terminate(); server.close(); server.closeAllConnections(); }
});
for (const kind of ["catan", "poker", "gomoku", "xiangqi"]) test(`${kind}: room-only reactions, forged sender ignored, reconnect stable, skins shared`, async () => {
  const a = await client(kind), b = await client(kind), outsider = await client(kind);
  const create = { type: "create", name: "Alice", kind, seats: 3, maxPlayers: 3, players: 3, side: 0, difficulty: "easy", funds: 50000, days: 30, mapId: "shores-1", skins: { robber: "angry", pirate: "flag" } };
  const unwrap = (m) => m.room || m, players = (s) => s.players || s.seats;
  a.send(create); const room = unwrap(await a.wait((m) => m.type === "state"));
  outsider.send({ ...create, name: "Outside" }); const outside = unwrap(await outsider.wait((m) => m.type === "state"));
  b.send({ type: "join", code: room.code, name: "Bob" });
  const joined = unwrap(await b.wait((m) => m.type === "state"));
  const from = players(joined)[0].socialId, target = players(joined)[1].socialId;
  assert.ok(from && target && from !== target);
  a.send({ type: "reaction", target, kind: "heart", from: "forged", fromName: "Fake" });
  const received = await b.wait((m) => m.type === "reaction");
  assert.equal(received.from, from); assert.equal(received.fromName, "Alice");
  assert.equal((await a.wait((m) => m.type === "reaction")).id, received.id);
  assert.equal(outsider.messages.some((m) => m.type === "reaction"), false);
  let cursor = a.messages.length;
  a.send({ type: "reaction", target, kind: "heart" }); await a.wait((m) => m.type === "error", cursor);
  cursor = a.messages.length;
  a.send({ type: "reaction", target: players(outside)[0].socialId, kind: "flowers" }); await a.wait((m) => m.type === "error", cursor);
  if (kind === "poker") { a.send({ type: "start" }); await a.wait((m) => m.type === "state" && m.room.status !== "lobby"); }
  b.socket.close(); await once(b.socket, "close");
  const back = await client(kind, b.token);
  if (kind === "poker") back.send({ type: "join", code: room.code, name: "Bob" });
  const restored = unwrap(await back.wait((m) => m.type === "state"));
  assert.equal(players(restored)[1].socialId, target); assert.equal(back.messages.some((m) => m.type === "reaction"), false, "No stale animation replay");
  if (kind === "catan") {
    assert.deepEqual(restored.skins, create.skins); assert.deepEqual(restored.previewBoard.skins, create.skins);
    a.send({ type: "fillBots" }); await a.wait((m) => m.type === "state" && m.seats.length === 3);
    a.send({ type: "start" }); const started = await a.wait((m) => m.type === "state" && m.game);
    assert.deepEqual(started.game.board.skins, create.skins);
    assert.equal(started.seats[0].socialId, from);
  }
});
