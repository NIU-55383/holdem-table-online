"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), http = require("node:http"), { once } = require("node:events"), { WebSocket } = require("ws");
const Maps = require("./catan-maps"), E = require("./catan-engine"), A = require("./room-archive"), C = require("./catan-cities"), D = require("./catan-cities-data");
const copy = value => JSON.parse(JSON.stringify(value));
function fixture(map, layout = "default") {
  const seats = Array.from({ length: map.players }, (_, position) => ({ position, name: `Player ${position}`, token: `private-token-${position}`, socialId: `private-social-${position}` }));
  return { mapId: map.id, maxPlayers: map.players, layout, thieves: "both", seats, game: E.createGame(seats.map(p => p.name), undefined, map.id, layout) };
}
async function launch() {
  process.env.CATAN_BOT_DELAY = "600000";
  const server = http.createServer(), api = require("./catan-server").attachCatan(server), sockets = [];
  server.on("upgrade", api.upgrade); server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = []; sockets.push(ws);
    ws.on("message", raw => messages.push(JSON.parse(raw))); await once(ws, "open");
    async function next(predicate, after = 0) {
      for (let i = 0; i < 800; i++) { const found = messages.slice(after).find(predicate); if (found) return found; await new Promise(resolve => setTimeout(resolve, 5)); }
      throw Error(`Missing response: ${JSON.stringify(messages.slice(-2)).slice(0, 500)}`);
    }
    async function request(data, type = "state") {
      const after = messages.length; ws.send(JSON.stringify(data)); const result = await next(m => m.type === type || m.type === "error", after);
      if (type !== "error") assert.notEqual(result.type, "error", `${data.type}: ${result.message}`); return result;
    }
    const welcome = await request({ type: "hello", token }, "welcome");
    return { ws, messages, next, request, token: welcome.token };
  }
  return { api, client, async close() { sockets.forEach(s => s.terminate()); await new Promise(resolve => server.close(resolve)); } };
}
function assertPrivate(state, you) {
  assert.equal(state.you, you);
  state.game.players.forEach((p, i) => assert.equal(p.resources === null, i !== you));
  state.game.citiesKnights.players.forEach((p, i) => assert.equal(p.cards === null, i !== you));
  assert.equal(state.game.cities, undefined);
}

test("combined mode exposes only four supported layouts, creates default/random rooms and preserves private views", { timeout: 30000 }, async () => {
  assert.equal(Maps.maps.length, 13); assert.equal(Maps.combinedMaps.length, 4); assert.equal(Maps.allMaps.length, 17);
  assert.deepEqual(Maps.combinedMaps.map(m => m.baseMapId), ["shores-1", "shores-2", "desert-1", "desert-2"]);
  const server = await launch();
  try {
    for (const map of Maps.combinedMaps) for (const layout of ["default", "random"]) {
      const preview = server.api.previews.get(map.id + (layout === "random" ? ":random" : ""));
      assert(preview); assert.equal(preview.mapId, map.id); assert.equal(preview.layout, layout); assert(preview.islands.length > 1);
      const host = await server.client(), guest = await server.client();
      const lobby = await host.request({ type: "create", name: "Host", mapId: map.id, layout, seats: map.players });
      assert.equal(lobby.maxPlayers, map.players); assert.equal(lobby.previewBoard.mapId, map.id); assert.equal(lobby.previewBoard.layout, layout);
      const joined = await guest.request({ type: "join", code: lobby.code, name: "Guest" }); assert.deepEqual(joined.previewBoard, lobby.previewBoard);
      await host.request({ type: "fillBots" }); const state = await host.request({ type: "start" });
      assert.equal(state.game.target, 16); assert.equal(state.game.players.length, map.players); assert.equal(state.game.players[0].resources.length, 8);
      assert.equal(state.game.board.mapId, map.id); assert.equal(state.game.board.layout, layout); assert.equal(state.game.citiesKnights.attacked, false);
      assertPrivate(state, 0); assertPrivate(await guest.next(m => Boolean(m.game)), 1);
      assert.deepEqual(state.game.board.tiles, lobby.previewBoard.tiles);
      const invalid = await host.request({ type: "create", name: "No six", mapId: map.id, seats: 5 }, "error"); assert.match(invalid.message, /4/);
      assert(server.api.rooms.has(lobby.code));
    }
    const stranger = await server.client();
    for (const mapId of ["cities-islands-1", "cities-fog-1", "cities-cloth", "cities-pirates", "cities-wonders", "cities-new-world"]) {
      const denied = await stranger.request({ type: "create", name: "Unsupported", mapId }, "error"); assert.match(denied.message, /Unknown map/);
    }
    for (const [mapId, target, resources] of [["base", 10, 5], ["cities", 13, 8], ["shores-1", 14, 5]]) {
      const host = await server.client(), lobby = await host.request({ type: "create", name: "Original mode", mapId, seats: 3 });
      await host.request({ type: "fillBots" }); const state = await host.request({ type: "start" });
      assert.equal(state.game.target, target); assert.equal(state.game.players[0].resources.length, resources); assert.equal(Boolean(state.game.citiesKnights), mapId === "cities");
      assert.equal(state.mapId, lobby.mapId);
    }
  } finally { await server.close(); }
});

test("combined archives preserve setup and mid-game state and reject mismatched modes or metadata", () => {
  for (const map of Maps.combinedMaps) for (const layout of ["default", "random"]) {
    const room = fixture(map, layout);
    for (let step = 0; step < map.players * 4 + 4; step++) {
      const archive = A.encode("catan", room), restored = A.decode(archive, ["catan"]).room;
      assert.deepEqual(restored.game, archive.progress); assert.equal(restored.mapId, map.id); assert.equal(restored.layout, layout);
      assert(!JSON.stringify(archive).includes("private-token")); assert(!JSON.stringify(archive).includes("private-social"));
      assert(restored.seats.every(p => p.vacant)); C.validate(restored.game);
      const actor = E.requiredActors(room.game)[0]; E.act(room.game, actor, E.chooseBotAction(room.game, actor));
    }
    const saved = A.encode("catan", room);
    const mutations = [
      a => { a.config.mapId = "cities-fog-1"; a.progress.mapId = "cities-fog-1"; a.progress.board.mapId = "cities-fog-1"; },
      a => { a.config.mapId = map.baseMapId; },
      a => { a.progress.mapId = map.baseMapId; },
      a => { a.progress.board.mapId = map.baseMapId; },
      a => { a.progress.board.tiles[0].q += 1; },
      a => { a.progress.target = 13; },
      a => { a.progress.cities.seafarers = false; },
      a => { a.progress.cities.thiefStart = null; },
      a => { a.progress.players[0].resources.pop(); },
      a => { delete a.progress.cities; },
      a => { a.config.maxPlayers = 5; },
      a => { a.config.thieves = "pirate"; },
      a => { a.config.layout = layout === "default" ? "random" : "default"; },
      a => { a.progress.board = E.makeBoard(undefined, "cities"); },
    ];
    for (const mutate of mutations) { const invalid = copy(saved); mutate(invalid); assert.throws(() => A.decode(invalid, ["catan"]), `${map.id}: ${mutate}`); }
  }
});

test("combined game exports without pausing and restores in a new server with private claims, reconnect and host resume", { timeout: 30000 }, async () => {
  const first = await launch(); let saved;
  try {
    const host = await first.client(), lobby = await host.request({ type: "create", name: "Original", mapId: "cities-shores-1", layout: "random", seats: 3 });
    await host.request({ type: "fillBots" }); await host.request({ type: "start" }); const room = first.api.rooms.get(lobby.code);
    while (room.game.phase.startsWith("setup")) { const actor = E.requiredActors(room.game)[0]; E.act(room.game, actor, E.chooseBotAction(room.game, actor)); }
    const g = room.game; g.players[1].resources[5] = 3; g.bank[5] -= 3;
    const key = "crane", deck = g.cities.decks[D.cards[key][0]], index = deck.indexOf(key); deck.splice(index, 1); g.cities.players[1].cards.push({ key, id: ++g.cities.sequence }); C.validate(g);
    const before = JSON.stringify(g), exported = await host.request({ type: "archiveExport" }, "archiveExported"); saved = exported.archive;
    assert.equal(JSON.stringify(g), before); assert(!room.archiveFreeze); assert.equal(saved.config.mapId, "cities-shores-1");
  } finally { await first.close(); }
  const second = await launch();
  try {
    const owner = await second.client(), preview = await owner.request({ type: "archiveImport", name: "New host", archive: saved }, "archiveLobby");
    assert.equal(preview.game, "catan"); assert.equal(preview.progress, undefined); assert.equal(preview.board, undefined); assert(!JSON.stringify(preview).includes("crane"));
    const state = await owner.request({ type: "archiveClaim", seat: 1 });
    assertPrivate(state, 1); assert.equal(state.host, 1); assert.equal(state.control.paused, true); assert.equal(state.game.players[1].resources[5], 3);
    assert.equal(state.game.citiesKnights.players[1].cards[0].key, "crane");
    assert.deepEqual(state.game.board, saved.progress.board); assert.equal(state.game.target, 16);
    const friend = await second.client(); await friend.request({ type: "join", name: "Friend", code: state.code }, "archiveLobby");
    const friendState = await friend.request({ type: "archiveClaim", seat: 0 }); assertPrivate(friendState, 0);
    await friend.request({ type: "archiveContinue" }, "error");
    const vacancy = friendState.control.seats.find(s => s.vacant);
    const filled = await owner.request({ type: "roomControl", action: "fillBot", target: vacancy.id }); assert.equal(filled.control.paused, true);
    const resumed = await owner.request({ type: "archiveContinue" }); assert.equal(resumed.control.paused, false);
    owner.ws.close(); await once(owner.ws, "close");
    const reconnect = await second.client(owner.token), connected = await reconnect.next(m => Boolean(m.game));
    assertPrivate(connected, 1); assert.equal(connected.host, 1); assert.equal(connected.mapId, saved.config.mapId); assert.equal(connected.layout, "random");
    assert.deepEqual(connected.game.players[1].resources, saved.progress.players[1].resources);
    const revision = connected.game.revision;
    const rolled = await friend.request({ type: "action", action: { type: "roll" } }); assert.equal(rolled.game.revision, revision + 1);
    assert.equal(rolled.game.dice.length, 2); assert.equal(rolled.game.citiesKnights.players.length, 3);
  } finally { await second.close(); }
});
