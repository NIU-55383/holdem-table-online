"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events"), { WebSocket } = require("ws");
const Maps = require("./catan-maps"), E = require("./catan-engine");

test("advanced rooms preserve player count, scenario state, hidden cards and New World options", { timeout: 30000 }, async () => {
  const server = http.createServer(), catan = require("./catan-server").attachCatan(server), sockets = [];
  server.on("upgrade", (request, socket, head) => catan.upgrade(request, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = [];
    sockets.push(ws); ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    await once(ws, "open");
    const next = async (predicate, after = 0) => {
      for (let i = 0; i < 600; i++) {
        const message = messages.slice(after).find(predicate);
        if (message) return message;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error("Timed out waiting for scenario room response");
    };
    const request = async (data, predicate = (m) => m.type === "state" || m.type === "error") => {
      const after = messages.length; ws.send(JSON.stringify(data)); return next(predicate, after);
    };
    const welcome = await request({ type: "hello", token }, (m) => m.type === "welcome");
    return { ws, messages, next, request, token: welcome.token };
  }
  try {
    const advanced = Maps.maps.filter((map) => ["tribes", "cloth", "pirates", "wonders", "new-world"].includes(map.family));
    assert.equal(advanced.length, 5);
    for (const map of advanced) for (const count of map.minPlayers === 3 ? [3, 4] : [map.players]) {
      const host = await client(), guest = await client();
      const lobby = await host.request({ type: "create", name: "Host", mapId: map.id, seats: count, layout: "random" });
      assert.equal(lobby.type, "state", lobby.message); assert.equal(lobby.maxPlayers, count);
      assert.equal(lobby.control.idleAuto, false);
      const room = catan.rooms.get(lobby.code);
      const joined = await guest.request({ type: "join", name: "Guest", code: lobby.code });
      assert.deepEqual(joined.previewBoard, lobby.previewBoard);
      await host.request({ type: "fillBots" }, (m) => m.seats?.length === count || m.type === "error");
      let started = await host.request({ type: "start" }, (m) => Boolean(m.game) || m.type === "error"); clearTimeout(room.timer);
      assert.equal(started.game.players.length, count);
      assert.equal(started.game.scenario.kind, map.family);
      assert.equal(started.game.giftDevelopment, undefined);
      assert.equal(started.game.harborDeck, undefined);
      assert.equal(started.game.players[1].resources, null);
      assert.deepEqual(E.requiredActors(room.game), [0]);
      assert.deepEqual(started.game.board.tiles, lobby.previewBoard.tiles);
      await guest.next((m) => Boolean(m.game));
      const forbidden = await guest.request({ type: "roomControl", action: "idleAuto", enabled: true }, (m) => m.type === "error");
      assert.equal(forbidden.type, "error");
      const policy = await host.request({ type: "roomControl", action: "idleAuto", enabled: true });
      assert.equal(policy.control.idleAuto, true);
      if (started.game.scenario.harborDraft) {
        assert.equal(started.game.phase, "scenarioChoice");
        const choice = started.game.legal.scenario.placeHarbors[0]; assert.ok(choice.edges.length);
        const action = { type: "placeHarbor", harbor: choice.harbor, edge: choice.edges[0] };
        const placedHarbor = await host.request({ type: "action", action });
        assert.equal(placedHarbor.game.board.ports.length, 1);
        assert.deepEqual(E.requiredActors(room.game), [1]);
        const wrongTurn = await host.request({ type: "action", action }, (m) => m.type === "error");
        assert.equal(wrongTurn.type, "error");
        while (room.game.scenario.harborDraft) {
          const actor = E.requiredActors(room.game)[0];
          E.act(room.game, actor, E.chooseBotAction(room.game, actor));
        }
        started = await host.request({ type: "chat", text: "Harbors ready" }); clearTimeout(room.timer);
        assert.equal(started.game.board.ports.length, 10);
        assert.equal(started.game.phase, "setupSettlement");
      }
      const first = started.game.legal.settlements[0]; assert.ok(Number.isInteger(first));
      const placed = await host.request({ type: "action", action: { type: "settlement", vertex: first } });
      assert.equal(placed.game.board.vertices[first].owner, 0);
      assert.equal(placed.game.phase, "setupRoad");
      host.ws.close(); await once(host.ws, "close"); clearTimeout(room.timer);
      const restored = await client(host.token), state = await restored.next((m) => m.game);
      assert.deepEqual(state.game.scenario, placed.game.scenario);
      assert.equal(state.control.idleAuto, true);
      restored.ws.close(); guest.ws.close(); clearTimeout(room.timer);
    }
    for (const thieves of ["both", "robber", "pirate"]) {
      const host = await client();
      const lobby = await host.request({ type: "create", name: "Explorer", mapId: "new-world", seats: 3, thieves });
      assert.equal(lobby.thieves, thieves);
      await host.request({ type: "fillBots" });
      const started = await host.request({ type: "start" }), room = catan.rooms.get(lobby.code); clearTimeout(room.timer);
      assert.equal(started.game.scenario.thieves, thieves);
      if (thieves === "pirate") assert.ok(!started.game.board.tiles[started.game.board.robber]);
      if (thieves === "robber") assert.ok(!started.game.board.tiles[started.game.board.pirate] && !started.game.board.pirateStart);
      room.game.phase = "over"; room.game.winner = 0;
      const rematch = await host.request({ type: "rematch" });
      assert.equal(rematch.game.scenario.thieves, thieves); clearTimeout(room.timer);
      const invalid = await host.request({ type: "create", name: "Explorer", mapId: "new-world", thieves: "invalid" });
      assert.equal(invalid.type, "error");
      assert.equal((await host.request({ type: "chat", text: "still here" })).code, lobby.code);
      host.ws.close();
    }
  } finally {
    sockets.forEach((ws) => ws.terminate());
    await new Promise((resolve) => server.close(resolve));
  }
});
