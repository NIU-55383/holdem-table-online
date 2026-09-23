"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events"), { WebSocket } = require("ws");
const E = require("./catan-engine"), Extension = require("./catan-base-extension");
const seeded = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const game = (n = 6, seed = 12) => E.createGame(Array.from({ length: n }, (_, i) => `P${i + 1}`), seeded(seed));
function setup(g) { while (g.phase.startsWith("setup")) E.act(g, g.current, E.chooseBotAction(g, g.current)); return g; }
function resources(g, hands) {
  g.players.forEach((p, i) => { p.resources = hands[i] || [0, 0, 0, 0, 0]; });
  g.bank = E.RES.map((_, r) => g.resourceSupply - g.players.reduce((n, p) => n + p.resources[r], 0));
}
function invariant(g) {
  for (let r = 0; r < 5; r++) {
    assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 24);
    assert.ok(g.bank[r] >= 0);
    g.players.forEach(p => assert.ok(Number.isInteger(p.resources[r]) && p.resources[r] >= 0));
  }
  assert.equal(g.deck.length + g.usedDevelopment.length + g.players.reduce((n, p) => n + p.development.length, 0), 34);
  g.players.forEach(p => {
    assert.ok(g.board.vertices.filter(v => v.owner === p.id && v.level === 1).length <= 5);
    assert.ok(g.board.vertices.filter(v => v.owner === p.id && v.level === 2).length <= 4);
    assert.ok(g.board.edges.filter(e => e.owner === p.id).length <= 15);
  });
}

test("5/6 players: official terrain, disc spiral, eleven disjoint harbors, expanded bank and deck", () => {
  for (const n of [5, 6]) for (let seed = 1; seed <= 100; seed++) {
    const g = game(n, seed), b = g.board;
    assert.deepEqual([b.tiles.length, b.vertices.length, b.edges.length, b.ports.length], [30, 80, 109, 11]);
    assert.deepEqual([0, 1, 2, 3, 4, -1].map(r => b.tiles.filter(t => t.resource === r).length), [6, 5, 6, 6, 5, 2]);
    assert.deepEqual(Extension.SPIRAL.filter(id => b.tiles[id].resource >= 0).map(id => b.tiles[id].number), Extension.NUMBERS);
    assert.deepEqual([2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(num => b.tiles.filter(t => t.number === num).length), [2, 3, 3, 3, 3, 3, 3, 3, 3, 2]);
    assert.deepEqual([-1, 0, 1, 2, 3, 4].map(r => b.ports.filter(p => p.resource === r).length), [5, 1, 1, 2, 1, 1]);
    assert.equal(new Set(b.ports.flatMap(p => p.vertices)).size, 22);
    b.ports.forEach(p => assert.equal(b.edges[p.edge].tiles.length, 1));
    assert.equal(b.tiles[b.robber].resource, -1);
    assert.deepEqual(g.bank, [24, 24, 24, 24, 24]);
    assert.deepEqual(["knight", "vp", "roads", "plenty", "monopoly"].map(type => g.deck.filter(c => c === type).length), [20, 5, 3, 3, 3]);
  }
  for (const n of [3, 4]) { const g = game(n); assert.equal(g.board.tiles.length, 19); assert.equal(g.deck.length, 25); assert.equal(g.pairedTurn, null); }
  assert.throws(() => E.createGame(Array(5).fill("P"), seeded(1), "shores-1"), /Seafarers/);
  assert.throws(() => E.createGame(Array(6).fill("P"), seeded(1), "base", "default", E.makeBoard()), /Board does not match/);
});

test("5/6 players: snake setup, all piece limits and primary/paired turn order", () => {
  for (const n of [5, 6]) {
    const g = game(n), placed = [];
    while (g.phase.startsWith("setup")) {
      if (g.phase === "setupSettlement") placed.push(g.current);
      E.act(g, g.current, E.chooseBotAction(g, g.current)); invariant(g);
    }
    assert.deepEqual(placed, [...Array(n).keys(), ...Array(n).keys()].map((v, i) => i < n ? v : n - 1 - v));
    for (let round = 0; round < n * 2; round++) {
      assert.equal(g.current, round % n); assert.equal(g.phase, "roll");
      assert.equal(g.pairedTurn.round, round + 1); assert.equal(g.pairedTurn.part, 1);
      assert.deepEqual(E.requiredActors(g), [g.current]);
      E.act(g, g.current, { type: "roll" }, () => 0.05);
      const dice = [...g.dice], hands = g.players.map(p => [...p.resources]);
      E.act(g, g.current, { type: "end" });
      assert.equal(g.current, (round + 3) % n); assert.equal(g.phase, "main"); assert.equal(g.pairedTurn.part, 2);
      assert.deepEqual(g.dice, dice); assert.deepEqual(g.players.map(p => p.resources), hands);
      assert.deepEqual(E.requiredActors(g), [g.current]);
      assert.equal(E.legal(g, g.current).roll, false);
      const before = structuredClone(g);
      assert.throws(() => E.act(g, g.current, { type: "roll" }), /Dice already rolled/); assert.deepEqual(g, before);
      E.act(g, g.current, { type: "end" }); invariant(g);
    }
  }
});

test("paired player trades with the bank only; primary player can trade with every seat", () => {
  const g = setup(game()); g.phase = "main";
  resources(g, [[4, 0, 0, 0, 0], null, null, [4, 0, 0, 0, 1]]);
  E.act(g, 0, { type: "offerTrade", to: 3, give: [1, 0, 0, 0, 0], want: [0, 0, 0, 0, 1] });
  assert.equal(E.canRespondToTrade(g, 3), true);
  E.act(g, 3, { type: "acceptTrade", offerId: g.trade.id });
  E.act(g, 0, { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] });
  E.act(g, 0, { type: "end" });
  assert.equal(g.trade, null); assert.equal(g.current, 3);
  const l = E.legal(g, 3); assert.equal(l.trade, true); assert.equal(l.playerTrade, false);
  const before = structuredClone(g);
  assert.throws(() => E.act(g, 3, { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] }), /paired building/);
  assert.deepEqual(g, before);
  E.act(g, 3, { type: "bankTrade", give: 0, get: 1 }); invariant(g);
  assert.equal(g.players[3].resources[1], 1);
  assert.equal(E.publicGame(g, 0).players[3].resources, null);
});

test("development cards age across either role, one per personal turn, with cancellable progress cards", () => {
  for (const n of [5, 6]) {
    const g = setup(game(n)); g.phase = "main";
    resources(g, [[0, 0, 1, 1, 1], null, null, [0, 0, 1, 1, 1]]);
    for (const id of [0, 3]) {
      g.deck.splice(g.deck.indexOf("roads"), 1); g.deck.push("roads");
      E.act(g, id, { type: "buyDevelopment" });
      assert.ok(!E.legal(g, id).development.includes("roads"));
      E.act(g, id, { type: "end" });
    }
    // P1's next personal turn is the paired turn of primary n-3.
    while (g.current !== 0) { if (g.phase === "roll") E.act(g, g.current, { type: "roll" }, () => 0.05); E.act(g, g.current, { type: "end" }); }
    assert.equal(g.pairedTurn.part, 2); assert.ok(E.legal(g, 0).development.includes("roads"));
    E.act(g, 0, { type: "playDevelopment", card: "roads" });
    E.act(g, 0, { type: "cancelDevelopment" });
    assert.equal(g.phase, "main"); assert.equal(g.developmentPlayed, false);
    E.act(g, 0, { type: "playDevelopment", card: "roads" });
    E.act(g, 0, { type: "road", edge: E.legal(g, 0).roads[0] });
    assert.equal(E.legal(g, 0).cancelDevelopment, false);
    E.act(g, 0, { type: "road", edge: E.legal(g, 0).roads[0] });
    assert.equal(g.phase, "main"); assert.equal(g.developmentPlayed, true);
    assert.deepEqual(E.legal(g, 0).development, []); invariant(g);
    E.act(g, 0, { type: "end" });
    while (g.current !== 3 || g.pairedTurn.part !== 1) { if (g.phase === "roll") E.act(g, g.current, { type: "roll" }, () => 0.05); E.act(g, g.current, { type: "end" }); }
    assert.equal(g.pairedTurn.part, 1); assert.ok(E.legal(g, 3).development.includes("roads"));
  }
});

test("seven includes all six players; secondary knights resolve robber and resume without another roll", () => {
  const g = setup(game()); resources(g, Array.from({ length: 6 }, () => [2, 2, 2, 2, 0]));
  let die = 0; E.act(g, 0, { type: "roll" }, () => die++ ? 0.51 : 0.34);
  assert.deepEqual(g.dice, [3, 4]); assert.deepEqual(E.requiredActors(g), [0, 1, 2, 3, 4, 5]);
  for (let i = 5; i >= 0; i--) E.act(g, i, { type: "discard", resources: [1, 1, 1, 1, 0] });
  assert.equal(g.phase, "robber");
  while (g.phase !== "main") E.act(g, g.current, E.chooseBotAction(g, g.current));
  E.act(g, 0, { type: "end" });
  g.deck.splice(g.deck.indexOf("knight"), 1); g.players[3].development.push({ type: "knight", turn: 0 });
  const dice = [...g.dice]; E.act(g, 3, { type: "playDevelopment", card: "knight" });
  while (g.phase !== "main") E.act(g, 3, E.chooseBotAction(g, 3));
  assert.deepEqual(g.dice, dice); assert.equal(E.legal(g, 3).roll, false); invariant(g);
});

test("either paired role can win, but primary victory resolves before the secondary turn", () => {
  for (const primaryWins of [false, true]) {
    const g = setup(game()); g.phase = "main";
    const addVP = id => { while (E.score(g, id) < 10) g.players[id].development.push({ type: "vp", turn: g.turn }); };
    addVP(3); if (primaryWins) addVP(0);
    if (primaryWins) {
      resources(g, [[1, 0, 0, 0, 0]]);
      E.act(g, 0, { type: "offerTrade", give: [1, 0, 0, 0, 0], want: [0, 1, 0, 0, 0] });
    } else E.act(g, 0, { type: "end" });
    assert.equal(g.winner, primaryWins ? 0 : 3); assert.equal(g.phase, "over");
  }
});

test("twelve complete 5/6-player bot games conserve cards and pieces and finish legally", { timeout: 120000 }, () => {
  for (const n of [5, 6]) for (let seed = 1; seed <= 6; seed++) {
    const g = game(n, seed), rng = seeded(seed + 80);
    for (let step = 0; step < 12000 && g.phase !== "over"; step++) {
      const actor = E.requiredActors(g)[0], action = E.chooseBotAction(g, actor, rng);
      assert.ok(action, `${n} players / ${seed} / ${g.phase}`);
      E.act(g, actor, action, rng); invariant(g);
    }
    assert.equal(g.phase, "over", `${n} players, seed ${seed}`); assert.ok(E.score(g, g.winner) >= 10);
  }
});

test("extended monopoly bots account for 24 resource cards, not the standard 19", () => {
  for (const n of [5, 6]) for (let seed = 1; seed <= 20; seed++) {
    const g = setup(game(n, seed)); g.phase = "monopoly"; g.current = 0;
    resources(g, [null, [0, 0, 0, 0, 1]]);
    assert.equal(E.chooseBotAction(g, 0).resource, 4, "Only ore is held by an opponent");
  }
});

test("5/6-player rooms preserve chosen seats, paired reconnect, host controls, vacancies and rematches", { timeout: 30000 }, async () => {
  const server = http.createServer(), catan = require("./catan-server").attachCatan(server), sockets = [];
  server.on("upgrade", (req, socket, head) => catan.upgrade(req, socket, head));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = []; sockets.push(ws);
    ws.on("message", raw => messages.push(JSON.parse(raw))); await once(ws, "open");
    const next = async (predicate, after = 0) => {
      for (let i = 0; i < 500; i++) { const m = messages.slice(after).find(predicate); if (m) return m; await new Promise(r => setTimeout(r, 5)); }
      throw Error("Timed out waiting for extension room");
    };
    const request = (data, predicate = m => ["state", "error"].includes(m.type)) => { const after = messages.length; ws.send(JSON.stringify(data)); return next(predicate, after); };
    const welcome = await request({ type: "hello", token }, m => m.type === "welcome");
    return { ws, request, next, token: welcome.token };
  }
  try {
    for (const n of [5, 6]) {
      const host = await client(), guest = await client();
      const lobby = await host.request({ type: "create", name: "Host", mapId: "base", seats: n });
      assert.equal(lobby.maxPlayers, n); assert.equal(lobby.previewBoard.tiles.length, 30);
      assert.equal(lobby.control.idleAuto, false);
      await guest.request({ type: "join", name: "Guest", code: lobby.code });
      await host.request({ type: "chooseSeat", position: n - 1 });
      await host.request({ type: "fillBots" });
      const start = await host.request({ type: "start" });
      assert.equal(start.you, n - 1); assert.equal(start.host, n - 1);
      const room = catan.rooms.get(lobby.code); clearTimeout(room.timer); setup(room.game);
      room.game.current = 0; room.game.phase = "main";
      E.act(room.game, 0, { type: "end" });
      const view = await host.request({ type: "chat", text: "paired" }); clearTimeout(room.timer);
      assert.equal(view.game.current, 3); assert.equal(view.game.pairedTurn.part, 2);
      assert.ok(view.game.players.every((p, i) => i === view.you || p.resources === null));
      const denied = await guest.request({ type: "roomControl", action: "idleAuto", enabled: true });
      assert.equal(denied.type, "error");
      const kicked = await host.request({ type: "roomControl", action: "kick", target: view.seats[3].socialId });
      assert.equal(kicked.control.paused, true); assert.equal(kicked.seats[3].vacant, true);
      const frozen = structuredClone(room.game);
      const blocked = await host.request({ type: "action", action: { type: "end" } }); assert.equal(blocked.type, "error"); assert.deepEqual(room.game, frozen);
      const newcomer = await client(); const joined = await newcomer.request({ type: "join", name: "Replacement", code: lobby.code });
      assert.equal(joined.you, 3); assert.equal(joined.control.paused, false); assert.equal(joined.game.legal.playerTrade, false);
      assert.notEqual(joined.seats[3].socialId, view.seats[3].socialId);
      assert.deepEqual(joined.game.board, frozen.board);
      newcomer.ws.close(); await once(newcomer.ws, "close");
      const reconnect = await client(newcomer.token), restored = await reconnect.next(m => m.type === "state");
      assert.equal(restored.you, 3); assert.deepEqual(restored.game.pairedTurn, frozen.pairedTurn);
      assert.equal(restored.game.legal.end, true);
      await reconnect.request({ type: "action", action: { type: "end" } }); clearTimeout(room.timer);
      assert.equal(room.game.current, 1); assert.equal(room.game.phase, "roll");
      const invalid = await host.request({ type: "create", name: "Host", seats: 7 }, m => m.type === "error"); assert.equal(invalid.type, "error");
      const sea = await host.request({ type: "create", name: "Host", mapId: "shores-1", seats: 5 }, m => m.type === "error"); assert.equal(sea.type, "error");
      room.game.phase = "over"; room.game.winner = 0;
      const rematch = await host.request({ type: "rematch" }, m => m.type === "state" && m.game?.phase.startsWith("setup")); clearTimeout(room.timer);
      assert.equal(rematch.game.players.length, n); assert.equal(rematch.game.board.tiles.length, 30); assert.equal(rematch.game.deckCount, 34);
      assert.equal(rematch.game.pairedTurn.part, 1); assert.equal(rematch.control.idleAuto, false);
      host.ws.close(); guest.ws.close(); reconnect.ws.close(); clearTimeout(room.timer);
    }
  } finally { sockets.forEach(ws => ws.terminate()); await new Promise(resolve => server.close(resolve)); }
});
