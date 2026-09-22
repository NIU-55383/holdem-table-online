"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./catan-engine"), Maps = require("./catan-maps");
const rngFor = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const game = (map = "shores-1") => E.createGame(["A", "B", "C", "D"].slice(0, Maps.get(map).players), rngFor(1), map);
const actor = (g) => g.phase === "discard" ? Number(Object.keys(g.discard)[0]) : g.phase === "gold" ? g.goldQueue[0].id : g.current;
function setup(g) { while (g.turn === 0) { const id = actor(g); E.act(g, id, E.chooseBotAction(g, id)); } return g; }
function supply(g, id = 0, cards = [8,8,8,8,8]) { g.players.forEach((p) => { p.resources = p.id === id ? [...cards] : [0,0,0,0,0]; }); g.bank = cards.map((n) => 19 - n); }
function invariant(g) {
  for (let r = 0; r < 5; r++) {
    assert.equal(g.bank[r] + g.players.reduce((n, p) => n + p.resources[r], 0), 19);
    assert.ok(Number.isInteger(g.bank[r]) && g.bank[r] >= 0);
    for (const p of g.players) assert.ok(Number.isInteger(p.resources[r]) && p.resources[r] >= 0);
  }
  assert.equal(g.deck.length + g.usedDevelopment.length + g.players.reduce((n, p) => n + p.development.length, 0), 25);
  for (const p of g.players) {
    const pub = E.publicGame(g, p.id).players[p.id];
    assert.ok(pub.roads <= 15 && pub.ships <= 15 && pub.settlements <= 5 && pub.cities <= 4);
    assert.equal(new Set(p.discovered).size, p.discovered.length);
  }
}

test("four fixed maps match photographed terrain inventories, tokens and separated harbors", () => {
  const inventories = [[3,4,5,4,4,2,0,13], [5,5,5,5,5,2,1,14], [4,4,4,4,4,0,0,15], [5,4,5,5,4,0,0,12]];
  Maps.maps.slice(0, 4).forEach((m, i) => {
    const b = E.makeBoard(rngFor(7), m.id);
    assert.deepEqual(b, E.makeBoard(rngFor(31), m.id));
    assert.equal(b.islands.length, 4);
    assert.deepEqual([0,1,2,3,4,5,-1,-2].map((r) => b.tiles.filter((t) => t.resource === r && !t.frame).length), inventories[i]);
    if (m.family === "islands") { assert.equal(b.pirate, -1); assert.ok(b.pirateStart.y > Math.max(...b.tiles.map((t) => t.y))); }
    else assert.equal(b.tiles[b.pirate].resource, -2);
    assert.equal(b.tiles[b.robber].number, m.id === "shores-2" ? 0 : 12);
    assert.equal(b.ports.length, m.id === "shores-1" ? 8 : 9);
    assert.equal(new Set(b.ports.flatMap((p) => p.vertices)).size, b.ports.length * 2);
    for (const p of b.ports) assert.equal(b.edges[p.edge].tiles.filter((t) => b.tiles[t].resource !== -2).length, 1);
    assert.throws(() => E.createGame(["A", "B", "C", "D"].slice(0, m.players === 3 ? 4 : 3), undefined, m.id));
  });
});

test("initial placement restricts New Shores to main island, permits Four Islands homes and coastal ships", () => {
  for (const m of Maps.maps.slice(0, 8)) {
    const g = game(m.id), order = [];
    while (!g.turn) {
      const id = actor(g), l = E.legal(g, id);
      if (g.phase === "setupSettlement") {
        if (m.family === "shores") assert.ok(l.settlements.every((v) => g.board.vertices[v].tiles.some((t) => g.board.tiles[t].island === g.board.mainIsland)));
        order.push(id);
      }
      const a = g.phase === "setupRoad" && l.ships.length ? { type: "ship", edge: l.ships[0] } : E.chooseBotAction(g, id);
      E.act(g, id, a); invariant(g);
    }
    assert.deepEqual(order, [...g.players.map((p) => p.id), ...g.players.map((p) => p.id).reverse()]);
    assert.ok(g.players.every((p) => (m.family === "fog" || (p.homeIslands.length >= 1 && p.homeIslands.length <= 2)) && !p.discovered.length));
    assert.ok(!g.board.vertices.filter((v) => v.owner >= 0).some((v) => v.tiles.every((t) => g.board.tiles[t].resource === -2)));
  }
});

test("roads cannot join ships without own building; terrain and independent piece limits are enforced", () => {
  const g = game(); g.phase = "main"; g.turn = 4; supply(g);
  const v = g.board.vertices.find((v) => v.edges.some((e) => g.board.edges[e].tiles.every((t) => g.board.tiles[t].resource === -2)) && v.tiles.some((t) => g.board.tiles[t].resource >= 0));
  const seaEdge = g.board.edges[v.edges.find((e) => g.board.edges[e].tiles.every((t) => g.board.tiles[t].resource === -2))];
  seaEdge.owner = 0; seaEdge.kind = "ship";
  assert.equal(E.roadSites(g, 0).length, 0);
  assert.throws(() => E.act(g, 0, { type: "road", edge: seaEdge.id }));
  v.owner = 0; v.level = 1;
  assert.ok(E.roadSites(g, 0).length);
  for (const eId of E.roadSites(g, 0)) assert.ok(g.board.edges[eId].tiles.some((t) => g.board.tiles[t].resource !== -2));
  for (const eId of E.shipSites(g, 0)) assert.ok(g.board.edges[eId].tiles.some((t) => g.board.tiles[t].resource === -2));
  const initialShips = E.shipSites(g, 0);
  g.board.edges.filter((e) => e.owner < 0 && !initialShips.includes(e.id)).slice(0, 15).forEach((e) => { e.owner = 0; e.kind = "road"; });
  assert.equal(E.roadSites(g, 0).length, 0); assert.ok(E.shipSites(g, 0).length);
  const edge = E.shipSites(g, 0)[0], before = [...g.players[0].resources];
  E.act(g, 0, { type: "ship", edge });
  assert.deepEqual(g.players[0].resources, before.map((n,r) => n - E.COST.ship[r]));
});

function shipPath(g, length = 3) {
  const edges = g.board.edges.filter((e) => e.tiles.some((t) => g.board.tiles[t].resource === -2) && !e.tiles.includes(g.board.pirate));
  function walk(v, vertices, path) {
    if (path.length === length) return { vertices, edges: path };
    for (const e of edges.filter((e) => e.a === v || e.b === v)) {
      const next = e.a === v ? e.b : e.a;
      if (vertices.includes(next)) continue;
      const found = walk(next, [...vertices, next], [...path, e.id]); if (found) return found;
    }
  }
  for (const v of g.board.vertices.filter((v) => v.tiles.some((t) => g.board.tiles[t].resource !== -2))) {
    const found = walk(v.id, [v.id], []); if (found) return found;
  }
}
test("old open-end ship moves once, new ships and closed routes cannot move", () => {
  const g = game(); g.phase = "main"; g.turn = 2;
  const path = shipPath(g);
  const home = g.board.vertices[path.vertices[0]]; home.owner = 0; home.level = 1;
  path.edges.forEach((id) => Object.assign(g.board.edges[id], { owner: 0, kind: "ship", builtTurn: 1 }));
  assert.deepEqual(E.movableShips(g, 0), [path.edges.at(-1)]);
  const end = g.board.edges[path.edges.at(-1)]; end.builtTurn = 2;
  assert.deepEqual(E.movableShips(g, 0), []); end.builtTurn = 1;
  const far = g.board.vertices[path.vertices.at(-1)]; far.owner = 0; far.level = 1;
  assert.deepEqual(E.movableShips(g, 0), []);
  g.board.vertices[path.vertices[1]].owner = 1; g.board.vertices[path.vertices[1]].level = 1;
  assert.deepEqual(E.movableShips(g, 0), [], "Opponent's building does not reopen a closed shipping route");
  g.board.vertices[path.vertices[1]].owner = -1; far.owner = -1; far.level = 0;
  const l = E.legal(g, 0), from = end.id, edge = l.shipDestinations[from][0];
  assert.throws(() => E.act(g, 0, { type: "moveShip", from, edge: from }));
  E.act(g, 0, { type: "moveShip", from, edge });
  assert.equal(g.board.edges[from].owner, -1); assert.equal(g.board.edges[edge].owner, 0);
  assert.equal(g.shipMoved, true); assert.deepEqual(E.legal(g, 0).moveShips, []);
});

test("mixed longest trade routes need own settlement at transition, enemy settlements split scoring", () => {
  const g = game(), path = shipPath(g, 6);
  path.edges.forEach((e, i) => Object.assign(g.board.edges[e], { owner: 0, kind: i < 3 ? "road" : "ship" }));
  assert.equal(E.longestRoad(g, 0), 3);
  const middle = g.board.vertices[path.vertices[3]]; middle.owner = 0; middle.level = 1;
  assert.equal(E.longestRoad(g, 0), 6);
  middle.level = 2; E.updateAwards(g);
  assert.equal(g.roadLengths[0], 6, "An own city also connects roads to ships");
  assert.equal(g.longest, 0);
  g.players[0].discovered = [1, 2];
  const visible = E.publicGame(g, 0);
  assert.deepEqual([visible.players[0].roads, visible.players[0].ships, visible.roadLengths[0], visible.players[0].islandPoints], [3, 3, 6, 4]);
  assert.equal(visible.players[0].score, E.score(g, 0, true), "Island points remain part of the displayed total");
  middle.owner = 1; E.updateAwards(g);
  assert.equal(g.roadLengths[0], 3); assert.equal(g.longest, -1);
});

test("pirate steals from adjacent ships, blocks construction and moving, and knight resumes pre-roll", () => {
  const g = game(), path = shipPath(g); g.phase = "roll"; g.turn = 3; supply(g, 1, [2,0,0,0,0]);
  path.edges.forEach((e) => Object.assign(g.board.edges[e], { owner: 1, kind: "ship", builtTurn: 1 }));
  const tile = g.board.edges[path.edges[0]].tiles.find((t) => g.board.tiles[t].resource === -2);
  g.players[0].development.push({ type: "knight", turn: 1 }); g.deck.splice(g.deck.indexOf("knight"), 1);
  E.act(g, 0, { type: "playDevelopment", card: "knight" });
  assert.throws(() => E.act(g, 0, { type: "pirate", tile: g.board.robber }));
  E.act(g, 0, { type: "pirate", tile });
  assert.equal(g.phase, "roll"); assert.equal(E.sum(g.players[0].resources), 1);
  assert.ok(!E.shipSites(g, 1).some((e) => g.board.edges[e].tiles.includes(tile)));
  assert.equal(E.legal(g, 0).roll, true); invariant(g);
});

test("gold production chooses clockwise, supports cities and shortages, robber blocks gold", () => {
  const g = game(), tile = g.board.tiles.find((t) => t.resource === 5); g.phase = "main"; g.turn = 2; g.current = 1;
  [0,1,2].forEach((id) => Object.assign(g.board.vertices[tile.vertices[id * 2]], { owner: id, level: id === 2 ? 2 : 1 }));
  E.produce(g, tile.number); assert.equal(g.phase, "gold");
  assert.deepEqual(g.goldQueue, [{ id: 1, count: 1 }, { id: 2, count: 2 }, { id: 0, count: 1 }]);
  assert.throws(() => E.act(g, 0, { type: "gold", resources: [1,0,0,0,0] }));
  for (const id of [1,2,0]) E.act(g, id, { type: "gold", resources: [E.legal(g,id).gold,0,0,0,0] });
  assert.equal(g.phase, "main"); invariant(g);
  g.board.robber = tile.id; E.produce(g, tile.number); assert.equal(g.phase, "main");
  g.board.robber = g.board.tiles.find((t) => t.resource === 1).id;
  g.players[0].resources = [18,19,19,19,19]; g.players[1].resources = [0,0,0,0,0]; g.players[2].resources = [0,0,0,0,0]; g.bank = [1,0,0,0,0];
  E.produce(g, tile.number); E.act(g, 1, { type: "gold", resources: [1,0,0,0,0] });
  assert.equal(g.phase, "main"); assert.deepEqual(g.goldQueue, []); invariant(g);
});

test("foreign-island bonus is personal, once per island and survives city upgrade; target wins only on own turn", () => {
  for (const map of Maps.maps.slice(0, 8).filter((m) => m.bonusPoints)) {
    const g = setup(game(map.id)); g.phase = "main"; supply(g);
    const p = g.players[0], site = g.board.vertices.find((v) => v.owner < 0 && v.neighbors.every((n) => g.board.vertices[n].owner < 0) && v.tiles.some((t) => g.board.tiles[t].region !== undefined && !p.homeIslands.includes(g.board.tiles[t].region)));
    const edge = g.board.edges[site.edges[0]]; edge.owner = 0; edge.kind = "ship";
    const before = E.score(g, 0); E.act(g, 0, { type: "settlement", vertex: site.id });
    assert.equal(E.score(g, 0), before + 3); assert.equal(p.discovered.length, 1);
    E.act(g, 0, { type: "city", vertex: site.id }); assert.equal(p.discovered.length, 1);
    assert.equal(E.publicGame(g, 0).players[0].islandPoints, 2);
    p.development = Array.from({ length: map.target - E.score(g, 0) }, () => ({ type: "vp", turn: g.turn }));
    g.current = 1; E.act(g, 1, { type: "end" }); assert.equal(g.winner, -1);
    g.current = g.players.length - 1; g.phase = "main"; E.act(g, g.current, { type: "end" }); assert.equal(g.winner, 0);
  }
});

test("Road Building builds ships before rolling and respects separate stock", () => {
  const g = game(); g.turn = 2; g.phase = "roll";
  const path = shipPath(g); Object.assign(g.board.vertices[path.vertices[0]], { owner: 0, level: 1 });
  g.players[0].development.push({ type: "roads", turn: 1 }); g.deck.splice(g.deck.indexOf("roads"), 1);
  E.act(g, 0, { type: "playDevelopment", card: "roads" });
  for (let n = 0; n < 2; n++) E.act(g, 0, { type: "ship", edge: E.legal(g, 0).ships[0] });
  assert.equal(g.phase, "roll"); assert.equal(E.publicGame(g,0).players[0].ships, 2); invariant(g);
});

test("original eight Seafarers maps cancel Road Building before placement, but not after a road or ship", () => {
  for (const map of Maps.maps.slice(0, 8)) for (const phase of ["roll", "main"]) for (const kind of ["road", "ship"]) {
    const g = game(map.id); g.turn = 3; g.phase = phase; g.rolled = phase === "main"; g.dice = g.rolled ? [1, 1] : [];
    const coast = g.board.vertices.find((v) => v.tiles.some((t) => g.board.tiles[t].resource >= 0) && v.tiles.some((t) => g.board.tiles[t].resource === -2));
    Object.assign(coast, { owner: 0, level: 1 });
    g.deck.splice(g.deck.indexOf("roads"), 1); g.players[0].development.push({ type: "roads", turn: 1 });
    const before = structuredClone(g);
    E.act(g, 0, { type: "playDevelopment", card: "roads" });
    assert.equal(E.legal(g, 0).cancelDevelopment, true, `${map.id}: ${phase}`);
    E.act(g, 0, { type: "cancelDevelopment" });
    for (const field of ["board", "players", "bank", "phase", "dice", "rolled", "freeRoads", "usedDevelopment"]) assert.deepEqual(g[field], before[field]);
    E.act(g, 0, { type: "playDevelopment", card: "roads" });
    const edge = E.legal(g, 0)[kind === "ship" ? "ships" : "roads"][0]; assert.notEqual(edge, undefined);
    E.act(g, 0, { type: kind, edge });
    assert.equal(g.pendingDevelopment, null); assert.equal(E.legal(g, 0).cancelDevelopment, false);
    const placed = structuredClone(g); assert.throws(() => E.act(g, 0, { type: "cancelDevelopment" })); assert.deepEqual(g, placed); invariant(g);
  }
});

test("forty seeded Seafarers bot games finish with legal actions and conserved pieces/resources", { timeout: 120000 }, () => {
  const totals = { ship: 0, pirate: 0, gold: 0, moveShip: 0, discoveries: 0 };
  for (const map of Maps.maps.slice(0, 4)) for (let seed = 1; seed <= 10; seed++) {
    const rng = rngFor(seed), g = E.createGame(["A","B","C","D"].slice(0,map.players), rng, map.id);
    let steps = 0;
    while (g.phase !== "over" && steps++ < 8000) {
      const id = actor(g), a = E.chooseBotAction(g, id, rng); assert.ok(a, `${map.id} stuck in ${g.phase}`);
      if (a.type in totals) totals[a.type]++;
      E.act(g, id, a, rng); invariant(g);
    }
    assert.equal(g.phase, "over", `${map.id}, seed ${seed}: scores ${g.players.map((p) => E.score(g,p.id))}`);
    totals.discoveries += g.players.reduce((n,p) => n+p.discovered.length,0);
  }
  assert.ok(totals.ship > 100 && totals.gold > 0 && totals.discoveries > 10);
  console.log("Seafarers simulation coverage:", totals);
});

test("network room fixes scenario player count, preserves map across seat changes and schedules non-current gold bots", { timeout: 15000 }, async () => {
  const http = require("node:http"), { once } = require("node:events"), { WebSocket } = require("ws"), { attachCatan } = require("./catan-server");
  const server = http.createServer(), catan = attachCatan(server), sockets = [];
  server.on("upgrade", (r,s,h) => catan.upgrade(r,s,h));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  async function client(token) {
    const ws = new WebSocket(`ws://127.0.0.1:${server.address().port}/catan-ws`), messages = []; sockets.push(ws);
    ws.on("message", (raw) => messages.push(JSON.parse(raw)));
    const send = (data) => ws.send(JSON.stringify(data));
    const next = async (predicate) => { for (let n=0;n<600;n++) { const found = messages.find(predicate); if(found) return found; await new Promise((r)=>setTimeout(r,10)); } throw new Error("Missing Seafarers state"); };
    await once(ws,"open"); send({ type:"hello", token }); const welcome = await next((m)=>m.type==="welcome");
    return { ws, send, next, token:welcome.token };
  }
  try {
    const host = await client();
    host.send({ type:"create", name:"Captain", mapId:"shores-1", seats:4 });
    const initial = await host.next((m)=>m.type==="state");
    assert.equal(initial.maxPlayers,3); assert.equal(initial.mapId,"shores-1");
    const guest = await client(); guest.send({ type:"join", code:initial.code, name:"Sailor" });
    assert.equal((await guest.next((m)=>m.type==="state")).mapId,"shores-1");
    host.send({ type:"chooseSeat", position:2 }); await host.next((m)=>m.seats?.[0].position===2);
    host.send({ type:"fillBots" }); await host.next((m)=>m.seats?.length===3);
    host.send({ type:"start" }); const start = await host.next((m)=>m.game);
    assert.equal(start.you,2); assert.equal(start.host,2); assert.equal(start.game.target,14);
    const room = catan.rooms.get(initial.code), g = room.game;
    const botId = room.seats.findIndex((p) => p.bot);
    assert.notEqual(botId, start.you);
    clearTimeout(room.timer); g.phase="gold"; g.turn=5; g.current=2; g.goldQueue=[{id:botId,count:2}]; g.goldResume="main";
    const revision = ++g.revision;
    host.send({ type:"chat", text:"Gold test" });
    const gold = await host.next((m)=>m.game?.revision===revision);
    assert.equal(gold.game.players[botId].resources,null); assert.equal(gold.game.legal.gold,0);
    const resumed = await host.next((m)=>m.game?.revision>revision && m.game.phase==="main");
    assert.equal(resumed.game.current,2); assert.equal(E.sum(g.players[botId].resources),2);
    host.ws.close(); await once(host.ws,"close");
    const again = await client(host.token), restored = await again.next((m)=>m.game?.phase==="main");
    assert.equal(restored.mapId,"shores-1"); assert.equal(restored.you,2);
    assert.ok(restored.game.players[2].resources); assert.equal(restored.game.players[0].resources,null);
  } finally { for(const ws of sockets) ws.terminate(); catan.rooms.forEach((r)=>clearTimeout(r.timer)); server.close(); server.emit("close"); }
});
