"use strict";

const { defineHex, Grid, spiral } = require("honeycomb-grid");
const { randomInt } = require("node:crypto");
const Maps = require("./catan-maps");
const randomizeMap = require("./catan-random");
const Scenarios = require("./catan-scenarios");
const RES = ["wood", "brick", "wool", "grain", "ore"];
const COST = { road: [1, 1, 0, 0, 0], ship: [1, 0, 1, 0, 0], settlement: [1, 1, 1, 1, 0], city: [0, 0, 0, 2, 3], development: [0, 0, 1, 1, 1] };
const LABEL = { wood: "木材 / Lumber", brick: "砖块 / Brick", wool: "羊毛 / Wool", grain: "麦子 / Grain", ore: "矿石 / Ore" };
const zeros = () => [0, 0, 0, 0, 0];
const sum = (a) => a.reduce((x, y) => x + y, 0);
const random = () => randomInt(0x100000000) / 0x100000000;
const shuffle = (a, rng) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const requireRule = (ok, message) => { if (!ok) throw new Error(message); };
const affordable = (p, cost) => cost.every((n, i) => p.resources[i] >= n);
const resourceArray = (value) => Array.isArray(value) && value.length === 5 && value.every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 95);
const pips = (n) => n ? 6 - Math.abs(7 - n) : 0;

function makeBoard(rng = random, mapId = "base", layout = "default") {
  const map = Maps.get(mapId);
  requireRule(mapId === "base" || map, "未知地图 / Unknown map");
  requireRule(["default", "random"].includes(layout), "未知地图模式 / Unknown map layout");
  const Hex = defineHex({ dimensions: 53, origin: { x: 0, y: 0 } });
  const grid = new Grid(Hex, map ? map.tiles.map(({ q, r }) => ({ q, r })) : spiral({ radius: 2 }));
  const vertices = [], edges = [], tiles = [], vm = new Map(), em = new Map();
  const terrain = shuffle([0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, -1], rng);
  grid.forEach((hex, id) => {
    const fixed = map?.tiles[tiles.length];
    const tile = { id: tiles.length, q: hex.q, r: hex.r, x: hex.x, y: hex.y, resource: fixed?.resource ?? terrain[tiles.length], number: fixed?.number || 0, vertices: [], ...(fixed ? { row: fixed.row, col: fixed.col, frame: fixed.frame, setupAllowed: fixed.setupAllowed, noSettlement: fixed.noSettlement, noProduction: fixed.noProduction, robberAllowed: fixed.robberAllowed, ...(map.family === "desert" ? { region: fixed.region } : {}) } : {}) };
    hex.corners.forEach((point) => {
      const key = `${Math.round(point.x * 100)},${Math.round(point.y * 100)}`;
      if (!vm.has(key)) {
        vm.set(key, vertices.length);
        vertices.push({ id: vertices.length, x: point.x, y: point.y, tiles: [], edges: [], neighbors: [], owner: -1, level: 0 });
      }
      const v = vertices[vm.get(key)];
      v.tiles.push(tile.id);
      tile.vertices.push(v.id);
    });
    tile.vertices.forEach((a, i) => {
      const b = tile.vertices[(i + 1) % 6], key = [a, b].sort((x, y) => x - y).join(":");
      if (!em.has(key)) {
        const edge = { id: edges.length, a, b, owner: -1, tiles: [] };
        em.set(key, edge.id); edges.push(edge);
        vertices[a].edges.push(edge.id); vertices[b].edges.push(edge.id);
        vertices[a].neighbors.push(b); vertices[b].neighbors.push(a);
      }
      edges[em.get(key)].tiles.push(tile.id);
    });
    tiles.push(tile);
  });
  if (map) {
    const at = ([row, col]) => tiles.find((t) => t.row === row && t.col === col);
    const randomized = layout === "random" ? randomizeMap(map, tiles, edges, rng, shuffle) : null;
    const islands = [];
    for (const tile of tiles.filter((t) => t.resource >= -1)) {
      if (tile.island !== undefined) continue;
      const island = islands.length, members = [], queue = [tile];
      tile.island = island;
      while (queue.length) {
        const t = queue.pop(); members.push(t.id);
        for (const e of edges.filter((edge) => edge.tiles.includes(t.id))) for (const tid of e.tiles) {
          const neighbor = tiles[tid];
          if (neighbor.resource >= -1 && neighbor.island === undefined) { neighbor.island = island; queue.push(neighbor); }
        }
      }
      islands.push(members);
    }
    const mainIsland = islands.reduce((best, a, i) => a.length > islands[best].length ? i : best, 0);
    if (map.family !== "desert") tiles.forEach((t) => { t.region = t.island; });
    const portSpecs = randomized?.ports || map.ports;
    const portTypes = layout === "random" ? shuffle(portSpecs.map((p) => p[3]), rng) : portSpecs.map((p) => p[3]);
    const ports = portSpecs.map(([row, col, angle], index) => {
      const tile = at([row, col]), rad = angle * Math.PI / 180;
      const candidates = edges.filter((e) => e.tiles.includes(tile.id));
      const e = candidates.sort((a, b) => {
        const dot = (edge) => ((vertices[edge.a].x + vertices[edge.b].x) / 2 - tile.x) * Math.cos(rad) + ((vertices[edge.a].y + vertices[edge.b].y) / 2 - tile.y) * Math.sin(rad);
        return dot(b) - dot(a);
      })[0];
      return { resource: portTypes[index], vertices: [e.a, e.b], edge: e.id, land: tile.id };
    });
    const xs = vertices.map((v) => v.x), ys = vertices.map((v) => v.y), margin = 42;
    const offset = map.pirateOffset, anchor = offset && at(offset);
    const pirateStart = map.pirate ? null : offset ? { x: anchor.x + offset[2], y: anchor.y + offset[3] } : { x: 0, y: Math.max(...ys) + 26 };
    if (pirateStart) { xs.push(pirateStart.x); ys.push(pirateStart.y); }
    const robber = map.robber == null ? null : layout === "default" ? at(map.robber) : tiles.find((t) => t.resource === -1 && t.robberAllowed !== false) || tiles.find((t) => t.number === 12 && t.robberAllowed !== false);
    const board = { tiles, vertices, edges, ports, robber: robber?.id ?? -1, pirate: map.pirate ? at(map.pirate).id : -1, pirateStart, islands, mainIsland, mapId, layout, bounds: [Math.min(...xs) - margin, Math.min(...ys) - margin, Math.max(...xs) - Math.min(...xs) + margin * 2, Math.max(...ys) - Math.min(...ys) + margin * 2] };
    Scenarios.prepareBoard(board, map);
    return board;
  }
  const numbered = tiles.filter((t) => t.resource >= 0);
  // Keep high-probability 6/8 tokens apart on the randomized base-game island.
  for (let attempt = 0; attempt < 10000; attempt++) {
    const numbers = shuffle([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12], rng);
    numbered.forEach((t, i) => { t.number = numbers[i]; });
    if (!edges.some((e) => e.tiles.length === 2 && e.tiles.every((id) => [6, 8].includes(tiles[id].number)))) break;
  }
  const coast = edges.filter((e) => e.tiles.length === 1).sort((a, b) => {
    const angle = (e) => Math.atan2(vertices[e.a].y + vertices[e.b].y, vertices[e.a].x + vertices[e.b].x);
    return angle(a) - angle(b);
  });
  const ports = shuffle([-1, -1, -1, -1, 0, 1, 2, 3, 4], rng).map((resource, i) => {
    const e = coast[[0, 3, 7, 10, 13, 17, 20, 23, 27][i]];
    return { resource, vertices: [e.a, e.b], edge: e.id };
  });
  return { tiles, vertices, edges, ports, robber: tiles.find((t) => t.resource === -1).id };
}

function createGame(names, rng = random, mapId = "base", layout = "default", preparedBoard = null, options = {}) {
  requireRule(names.length === 3 || names.length === 4, "基础版需要 3–4 人 / Base game needs 3–4 players");
  const map = Maps.get(mapId);
  requireRule(!map || (map.minPlayers ? names.length >= map.minPlayers && names.length <= (map.maxPlayers || map.players) : names.length === map.players), "人数不符合地图 / Wrong player count for this map");
  const g = {
    board: preparedBoard ? structuredClone(preparedBoard) : makeBoard(rng, mapId, layout), mapId, layout, target: map?.target || 10,
    fogTerrain: map?.family === "fog" ? shuffle([-2,-2,5,5,3,3,1,1,4,4,2,0], rng) : [],
    fogNumbers: map?.fogNumbers ? shuffle(map.fogNumbers, rng) : [],
    players: names.map((name, id) => ({ id, name, resources: zeros(), development: [], knights: 0, homeIslands: [], discovered: [] })),
    bank: [19, 19, 19, 19, 19], deck: shuffle([...Array(14).fill("knight"), ...Array(5).fill("vp"), "roads", "roads", "plenty", "plenty", "monopoly", "monopoly"], rng),
    usedDevelopment: [], phase: "setupSettlement", current: 0, setupStep: 0, setupVertex: -1,
    turn: 0, dice: [], rolled: false, developmentPlayed: false, pendingDevelopment: null, freeRoads: 0,
    discard: {}, victims: [], resumePhase: "main", longest: -1, largest: -1, roadLengths: names.map(() => 0),
    winner: -1, log: [], revision: 0, trade: null, shipMoved: false, goldQueue: [], goldResume: "main", thief: "robber",
  };
  Scenarios.initialize(g, map, options, rng);
  log(g, "选择初始村庄 / Choose an initial settlement");
  return g;
}
function log(g, text) { g.log.push({ id: g.revision, text }); if (g.log.length > 120) g.log.shift(); }
function pieceCount(g, id, level) { return g.board.vertices.filter((v) => v.owner === id && v.level === level).length + (level === 1 && Scenarios.is(g, "pirates") && !g.scenario.pirateSeats[id].liberated ? 1 : 0); }
function emptySite(g, v) { return v.tiles.some((t) => g.board.tiles[t].resource >= -1) && v.owner < 0 && v.neighbors.every((id) => g.board.vertices[id].owner < 0); }
function settlementSites(g, id, setup = false) {
  if (pieceCount(g, id, 1) >= 5) return [];
  return g.board.vertices.filter((v) => emptySite(g, v)
    && Scenarios.settlementAllowed(g, id, v, setup)
    && (!setup || !g.board.islands || v.tiles.some((t) => g.board.tiles[t].setupAllowed))
    && (!setup || Maps.get(g.mapId)?.family !== "desert" || v.tiles.every((t) => g.board.tiles[t].resource < 0 || g.board.tiles[t].setupAllowed))
    && (setup || v.edges.some((e) => g.board.edges[e].owner === id))).map((v) => v.id);
}
function roadSites(g, id, setup = false) {
  return routeSites(g, id, "road", setup);
}
const routeKind = (e) => e.kind || "road";
const routeCount = (g, id, kind) => g.board.edges.filter((e) => e.owner === id && routeKind(e) === kind).length;
function routeTerrain(g, e, kind) {
  return kind === "ship" ? g.board.pirate !== undefined && (e.tiles.some((t) => g.board.tiles[t].resource <= -2) || g.scenario && e.tiles.length === 1) && (Scenarios.is(g, "pirates") || !e.tiles.includes(g.board.pirate))
    : e.tiles.some((t) => g.board.tiles[t].resource >= -1);
}
function routeSites(g, id, kind, setup = false, ignore = -1) {
  if (routeCount(g, id, kind) + (kind === "ship" ? Scenarios.reservedShips(g, id) : 0) - (ignore >= 0 ? 1 : 0) >= 15) return [];
  return g.board.edges.filter((e) => e.id !== ignore && e.owner < 0 && routeTerrain(g, e, kind) && Scenarios.routeAllowed(g, id, e, kind, setup, ignore) && (setup ? [e.a, e.b].includes(g.setupVertex) : [e.a, e.b].some((vId) => {
    const v = g.board.vertices[vId];
    return v.owner === id || (v.owner < 0 && v.edges.some((edge) => edge !== ignore && g.board.edges[edge].owner === id && routeKind(g.board.edges[edge]) === kind));
  }))).map((e) => e.id);
}
function shipSites(g, id, setup = false) { return routeSites(g, id, "ship", setup); }
function movableShips(g, id) {
  if (!g.board.islands || g.shipMoved || g.phase !== "main" || Scenarios.is(g, "pirates")) return [];
  const ships = g.board.edges.filter((e) => e.owner === id && routeKind(e) === "ship");
  // Mark every simple path between two of this player's buildings as closed.
  // Opponent buildings do not turn a previously closed route into a movable one.
  const closed = new Set(), homes = g.board.vertices.filter((v) => v.owner === id);
  function visit(vId, path, seen, origin) {
    if (vId !== origin && g.board.vertices[vId].owner === id) { path.forEach((e) => closed.add(e)); return; }
    if (vId !== origin && Scenarios.tradeVillage(g, vId)) path.forEach((e) => closed.add(e));
    for (const eId of g.board.vertices[vId].edges) {
      const e = g.board.edges[eId], next = e.a === vId ? e.b : e.a;
      if (e.owner !== id || routeKind(e) !== "ship" || seen.has(next)) continue;
      seen.add(next); path.push(eId); visit(next, path, seen, origin); path.pop(); seen.delete(next);
    }
  }
  homes.forEach((v) => visit(v.id, [], new Set([v.id]), v.id));
  return ships.filter((e) => !closed.has(e.id) && e.builtTurn !== g.turn && !e.tiles.includes(g.board.pirate)
    && [e.a, e.b].some((vId) => g.board.vertices[vId].owner < 0 && ships.filter((s) => s.a === vId || s.b === vId).length === 1)
    && routeSites(g, id, "ship", false, e.id).length).map((e) => e.id);
}
function citySites(g, id) { return pieceCount(g, id, 2) >= 4 ? [] : g.board.vertices.filter((v) => v.owner === id && v.level === 1).map((v) => v.id); }
function longestRoad(g, id) {
  const owned = g.board.edges.filter((e) => e.owner === id);
  function walk(vId, used, kind) {
    const v = g.board.vertices[vId];
    if (used.size && v.owner >= 0 && v.owner !== id) return used.size;
    let best = used.size;
    for (const eId of v.edges) {
      const e = g.board.edges[eId];
      if (e.owner !== id || used.has(eId) || (kind && kind !== routeKind(e) && v.owner !== id)) continue;
      used.add(eId); best = Math.max(best, walk(e.a === vId ? e.b : e.a, used, routeKind(e))); used.delete(eId);
    }
    return best;
  }
  return Math.max(0, ...[...new Set(owned.flatMap((e) => [e.a, e.b]))].map((v) => walk(v, new Set())));
}
function award(values, holder, threshold) {
  const high = Math.max(...values);
  if (high < threshold) return -1;
  const leaders = values.map((n, id) => n === high ? id : -1).filter((id) => id >= 0);
  return leaders.includes(holder) ? holder : leaders.length === 1 ? leaders[0] : -1;
}
function score(g, id, hidden = true) {
  return g.board.vertices.filter((v) => v.owner === id).reduce((n, v) => n + v.level, 0)
    + (g.longest === id ? 2 : 0) + (g.largest === id ? 2 : 0)
    + Scenarios.islandPoints(g, id) + Scenarios.extraPoints(g, id)
    + (hidden ? g.players[id].development.filter((d) => d.type === "vp").length : 0);
}
function updateAwards(g) {
  g.roadLengths = g.players.map((p) => longestRoad(g, p.id));
  g.longest = Scenarios.is(g, "cloth") || Scenarios.is(g, "pirates") ? -1 : award(g.roadLengths, g.longest, 5);
  g.largest = Scenarios.is(g, "pirates") ? -1 : award(g.players.map((p) => p.knights), g.largest, 3);
}
function checkWin(g) {
  if (Scenarios.checkWin(g, score, log)) return;
  if (!g.phase.startsWith("setup") && score(g, g.current) >= (g.target || 10)) {
    g.winner = g.current; g.phase = "over"; g.trade = null;
    log(g, `${g.players[g.current].name} 获胜 / wins · ${score(g, g.current)} VP`);
  }
}
function pay(g, p, cost) { requireRule(affordable(p, cost), "资源不足 / Not enough resources"); cost.forEach((n, i) => { p.resources[i] -= n; g.bank[i] += n; }); }
function supplyShortage(g, player, resource, wanted, received, reason = "resource") {
  if (received >= wanted) return;
  const event = { id: (g.supplyNoticeSeq || 0) + 1, player, resource, wanted, received, reason };
  g.supplyNoticeSeq = event.id;
  g.supplyNotices = [...(g.supplyNotices || []), event].slice(-40);
  const choosing = ["gold", "plenty"].includes(reason) && received > 0;
  log(g, `${g.players[player].name} · ${resource >= 0 ? LABEL[RES[resource]] : "资源 / Resources"} · 银行库存不足，应领 ${wanted}，${choosing ? "本次可领" : "实领"} ${received} / Bank shortage: ${received} of ${wanted} ${choosing ? "available to choose" : "received"}`);
}
function take(g, p, r, amount = 1) {
  const n = Math.min(g.bank[r], amount); g.bank[r] -= n; p.resources[r] += n;
  supplyShortage(g, p.id, r, amount, n);
}
function limitGoldSupply(g) {
  const available = sum(g.bank);
  // Only the next recipient can reserve the remaining bank supply.
  for (const choice of available ? g.goldQueue.slice(0, 1) : g.goldQueue) {
    supplyShortage(g, choice.id, -1, choice.count, Math.min(choice.count, available), "gold");
    choice.count = Math.min(choice.count, available);
  }
  if (!available) g.goldQueue = [];
}
function discover(g, id, edgeId) {
  if (Maps.get(g.mapId)?.family !== "fog") return;
  const edge = g.board.edges[edgeId];
  const reachable = new Set([edge.a, edge.b].flatMap((v) => g.board.vertices[v].tiles));
  let gold = 0;
  // Stable tile order also makes simultaneous discoveries reproducible on every client.
  for (const tile of g.board.tiles) if (reachable.has(tile.id) && tile.resource === -3) {
    tile.resource = g.fogTerrain.pop();
    tile.number = tile.resource >= 0 ? g.fogNumbers.pop() : 0;
    tile.discoveredAt = g.revision + 1;
    if (tile.resource === 5) gold++;
    else if (tile.resource >= 0) take(g, g.players[id], tile.resource);
    const name = tile.resource === -2 ? "海洋 / Sea" : tile.resource === 5 ? "金矿 / Gold" : LABEL[RES[tile.resource]];
    log(g, `${g.players[id].name} 探索发现 / discovers ${name}${tile.number ? ` · ${tile.number}` : ""}`);
  }
  if (gold) {
    g.goldQueue = [{ id, count: gold }]; limitGoldSupply(g);
    if (g.goldQueue.length) { g.goldResume = g.phase; g.phase = "gold"; }
  }
}
function produce(g, number) {
  const demand = g.players.map(() => zeros());
  g.board.tiles.filter((t) => !t.noProduction && t.number === number && t.id !== g.board.robber && t.resource >= 0 && t.resource < 5).forEach((t) => {
    t.vertices.forEach((id) => { const v = g.board.vertices[id]; if (v.owner >= 0) demand[v.owner][t.resource] += v.level; });
  });
  RES.forEach((_, r) => {
    const total = demand.reduce((n, x) => n + x[r], 0), recipients = demand.filter((x) => x[r] > 0).length;
    if (total <= g.bank[r] || recipients === 1) demand.forEach((d, id) => take(g, g.players[id], r, d[r]));
    else if (total) demand.forEach((d, id) => supplyShortage(g, id, r, d[r], 0, "shared"));
  });
  const gold = g.players.map(() => 0);
  g.board.tiles.filter((t) => !t.noProduction && t.resource === 5 && t.number === number && t.id !== g.board.robber).forEach((t) => t.vertices.forEach((vId) => { const v = g.board.vertices[vId]; if (v.owner >= 0) gold[v.owner] += v.level; }));
  g.goldQueue = Array.from({ length: g.players.length }, (_, n) => (g.current + n) % g.players.length).filter((id) => gold[id]).map((id) => ({ id, count: gold[id] }));
  limitGoldSupply(g);
  if (g.goldQueue.length && sum(g.bank)) { g.goldResume = g.phase; g.phase = "gold"; }
  else g.goldQueue = [];
  Scenarios.produceCloth(g, number);
}
function finishRoll(g, number) {
  if (number === 7) {
    g.resumePhase = "main";
    g.players.forEach((x) => { const n = sum(x.resources); if (n > 7) g.discard[x.id] = Math.floor(n / 2); });
    if (Object.keys(g.discard).length) g.phase = "discard";
    else Scenarios.seven(g);
  } else produce(g, number);
}
function endTurn(g) {
  g.trade = null; g.current = (g.current + 1) % g.players.length; g.turn++; g.phase = "roll"; g.dice = []; g.rolled = false; g.developmentPlayed = false; g.shipMoved = false;
  log(g, `${g.players[g.current].name} 的回合 / turn`);
}
function tradeRate(g, id, r) {
  let rate = 4;
  g.board.ports.forEach((port) => { if (port.vertices.some((v) => g.board.vertices[v].owner === id)) { if (port.resource === r) rate = 2; else if (port.resource < 0) rate = Math.min(rate, 3); } });
  return rate;
}
function legal(g, id) {
  const ownTurn = id === g.current && g.phase !== "over", p = g.players[id];
  const out = { roads: [], ships: [], moveShips: [], shipDestinations: {}, settlements: [], cities: [], robber: [], pirate: [], victims: [], development: [], cancelDevelopment: false, roll: false, end: false, buy: false, trade: false, discard: g.discard[id] || 0, gold: g.phase === "gold" && g.goldQueue[0]?.id === id ? Math.min(g.goldQueue[0].count, sum(g.bank)) : 0 };
  out.buildBlocked = {};
  out.scenario = Scenarios.legal(g, id, scenarioHelpers);
  if (p) {
    if (g.phase === "over") out.buildBlocked.buyDevelopment = "本局已结束，不能再购买发展卡。 / The game is over; development cards can no longer be bought.";
    else if (!g.deck.length) out.buildBlocked.buyDevelopment = "发展卡已售罄，本局不能再购买。 / Development cards are sold out for this game.";
    else if (!ownTurn) out.buildBlocked.buyDevelopment = "还没轮到你，请在自己的回合购买发展卡。 / Buy development cards on your own turn.";
    else if (g.phase === "roll") out.buildBlocked.buyDevelopment = "请先掷骰子，再购买发展卡。 / Roll the dice before buying a development card.";
    else if (g.phase.startsWith("setup")) out.buildBlocked.buyDevelopment = "初始放置尚未完成，开局后才能购买发展卡。 / Finish initial placement before buying development cards.";
    else if (g.phase !== "main") out.buildBlocked.buyDevelopment = "请先完成当前操作，再购买发展卡。 / Finish the current action before buying a development card.";
    else if (!affordable(p, COST.development)) {
      const missing = COST.development.flatMap((n, r) => n > p.resources[r] ? [`${n - p.resources[r]} ${LABEL[RES[r]]}`] : []).join("、");
      out.buildBlocked.buyDevelopment = `购买需要羊毛、麦子、矿石各 1 张。还缺：${missing}。 / Costs 1 wool, 1 grain and 1 ore. Missing: ${missing}.`;
    }
    if (pieceCount(g, id, 1) >= 5) out.buildBlocked.settlement = "已用完 5 个村庄。先将村庄升级为城市，收回村庄后才能再建。 / All 5 settlements are in use. Upgrade one to a city to recover a settlement piece.";
    if (pieceCount(g, id, 2) >= 4) out.buildBlocked.city = "已用完 4 座城市，无法再升级。 / All 4 cities are in use. No more city pieces are available.";
    if (routeCount(g, id, "road") >= 15) out.buildBlocked.road = "已用完 15 条道路，无法再修路。 / All 15 roads are in use. No more road pieces are available.";
    const reserved = Scenarios.reservedShips(g, id), ships = routeCount(g, id, "ship");
    if (g.board.islands && ships + reserved >= 15) out.buildBlocked.ship = reserved
      ? "15 枚船棋子已用完，其中 1 枚用于奇观标记，无法再造船；符合移船规则的旧船仍可移动。 / All 15 ship pieces are in use, including 1 reserved wonder marker. Eligible existing ships can still be moved."
      : "已用完 15 艘船，无法再造船；符合移船规则的旧船仍可移动。 / All 15 ships are in use. Eligible existing ships can still be moved.";
    if (Scenarios.is(g, "wonders") && !p.wonder && ships >= 15) out.buildBlocked.chooseWonder = "选择奇观需要 1 枚未使用的船棋子作为标记；15 艘船已全部在版图上。 / Claiming a wonder requires 1 unused ship piece as its marker; all 15 ships are on the board.";
  }
  if (!ownTurn || !p) return out;
  if (g.phase === "setupSettlement") out.settlements = settlementSites(g, id, true);
  if (g.phase === "setupRoad") out.roads = roadSites(g, id, true);
  if (g.phase === "freeRoads") out.roads = roadSites(g, id);
  if (["setupRoad", "freeRoads"].includes(g.phase)) out.ships = shipSites(g, id, g.phase === "setupRoad");
  if (g.phase === "roll") out.roll = true;
  out.cancelDevelopment = Boolean(g.pendingDevelopment && g.pendingDevelopment.player === id && g.pendingDevelopment.turn === g.turn
    && ((g.phase === "plenty" && g.pendingDevelopment.card.type === "plenty")
      || (g.phase === "freeRoads" && g.freeRoads === 2 && g.pendingDevelopment.card.type === "roads")));
  if (g.phase === "robber") {
    out.robber = g.board.tiles.filter((t) => t.resource >= -1 && t.id !== g.board.robber).map((t) => t.id);
    if (g.board.islands) out.pirate = g.board.tiles.filter((t) => t.resource === -2 && t.id !== g.board.pirate).map((t) => t.id);
  }
  if (g.phase === "steal") out.victims = [...g.victims];
  if (["roll", "main"].includes(g.phase) && !g.developmentPlayed) out.development = [...new Set(p.development.filter((d) => d.type !== "vp" && d.turn < g.turn).map((d) => d.type))];
  if (g.phase === "main") {
    out.roads = affordable(p, COST.road) ? roadSites(g, id) : [];
    out.ships = affordable(p, COST.ship) ? shipSites(g, id) : [];
    out.moveShips = movableShips(g, id);
    out.moveShips.forEach((e) => { out.shipDestinations[e] = routeSites(g, id, "ship", false, e); });
    out.settlements = affordable(p, COST.settlement) ? settlementSites(g, id) : [];
    out.cities = affordable(p, COST.city) ? citySites(g, id) : [];
    out.buy = affordable(p, COST.development) && g.deck.length > 0;
    out.end = true; out.trade = true;
  }
  Scenarios.filterLegal(g, id, out);
  return out;
}
function steal(g, id, victim, rng, loot = "resource") {
  requireRule(g.victims.includes(victim), "请选择相邻对手 / Choose an adjacent opponent");
  requireRule(loot === "resource" || loot === "cloth" && Scenarios.is(g, "cloth") && g.thief === "pirate" && g.players[victim].cloth > 0, "请选择可用战利品 / Choose available loot");
  if (loot === "cloth") {
    g.players[victim].cloth--; g.players[id].cloth++;
    log(g, `${g.players[id].name} 偷取 1 布匹 / steals 1 cloth`);
    g.phase = g.resumePhase; g.victims = []; return;
  }
  const p = g.players[victim], count = sum(p.resources);
  requireRule(count > 0, "对方没有资源 / No resources to steal");
  if (count > 0) {
    let n = Math.floor(rng() * count), resource = 0;
    while (n >= p.resources[resource]) n -= p.resources[resource++];
    p.resources[resource]--; g.players[id].resources[resource]++;
    log(g, `${g.players[id].name} 从 ${p.name} 偷取 1 张资源 / steals 1 resource`);
  }
  g.phase = g.resumePhase; g.victims = [];
}

function canRespondToTrade(g, id) {
  const t = g.trade;
  return Boolean(g.phase === "main" && t && t.from === g.current && g.players[id] && id !== t.from
    && (t.to == null || t.to === id) && !t.rejected.includes(id));
}

function act(g, id, a, rng = random) {
  requireRule(g.players[id] && g.phase !== "over", "游戏未进行 / Game not active");
  const p = g.players[id], l = legal(g, id), type = a.type;
  requireRule(typeof type === "string", "无效行动 / Invalid action");
  if (Object.hasOwn(l.buildBlocked, type)) requireRule(false, l.buildBlocked[type]);
  if (Scenarios.act(g, id, a, l, rng, scenarioHelpers)) {
    // Scenario choices can belong to a player other than the current turn owner.
  } else if (type === "gold") {
    requireRule(l.gold > 0 && resourceArray(a.resources) && sum(a.resources) === l.gold && a.resources.every((n, r) => n <= g.bank[r]), "请选择金矿资源 / Choose available gold-field resources");
    a.resources.forEach((n, r) => take(g, p, r, n)); g.goldQueue.shift();
    log(g, `${p.name} 领取 ${l.gold} 张金矿资源 / collects gold-field resources`);
    limitGoldSupply(g);
    if (!g.goldQueue.length || !sum(g.bank)) { g.goldQueue = []; g.phase = g.goldResume; }
  } else if (type === "discard") {
    requireRule(g.phase === "discard" && l.discard > 0 && resourceArray(a.resources) && sum(a.resources) === l.discard && affordable(p, a.resources), "请弃掉指定数量的资源 / Discard the required resources");
    pay(g, p, a.resources); delete g.discard[id];
    log(g, `${p.name} 弃掉 ${sum(a.resources)} 张资源 / discards resources`);
    if (!Object.keys(g.discard).length) Scenarios.seven(g);
  } else if (type === "acceptTrade") {
    const t = g.trade;
    requireRule(canRespondToTrade(g, id) && t.id === a.offerId, "交易已失效或未向你发出 / Offer unavailable or addressed to another player");
    const from = g.players[g.current];
    requireRule(affordable(p, t.want) && affordable(from, t.give), "交易双方资源不足 / Trade resources unavailable");
    RES.forEach((_, r) => { p.resources[r] += t.give[r] - t.want[r]; from.resources[r] += t.want[r] - t.give[r]; });
    log(g, `${from.name} 与 ${p.name} 完成交易 / complete a trade`); g.trade = null;
  } else if (type === "rejectTrade") {
    requireRule(canRespondToTrade(g, id) && g.trade.id === a.offerId, "交易已失效或未向你发出 / Offer unavailable or addressed to another player");
    if (!g.trade.rejected.includes(id)) g.trade.rejected.push(id);
  } else {
    requireRule(id === g.current, "还没轮到你 / Not your turn");
    if (type === "settlement") {
      requireRule(l.settlements.includes(a.vertex), "这里不能建村庄 / Illegal settlement");
      const setup = g.phase === "setupSettlement", v = g.board.vertices[a.vertex];
      if (!setup) pay(g, p, COST.settlement);
      v.owner = id; v.level = 1;
      if (g.board.islands && Maps.get(g.mapId)?.bonusPoints && !g.scenario) {
        const islands = [...new Set(v.tiles.map((t) => g.board.tiles[t].region).filter((i) => i !== undefined))];
        if (setup) p.homeIslands = [...new Set([...p.homeIslands, ...islands])];
        else for (const island of islands) if (!p.homeIslands.includes(island) && !p.discovered.includes(island)) {
          p.discovered.push(island); v.islandBonus = (v.islandBonus || 0) + 2;
          log(g, `${p.name} 首次登岛 +2 分 / settles a foreign island +2 VP`);
        }
      }
      Scenarios.settled(g, id, v, setup);
      log(g, `${p.name} 建造村庄 / builds a settlement`);
      if (setup) {
        g.setupVertex = v.id; g.phase = "setupRoad";
        if (g.setupStep >= (Scenarios.setupRounds(g) - 1) * g.players.length) {
          let gold = 0;
          v.tiles.forEach((t) => { if (g.board.tiles[t].noProduction) return; const r = g.board.tiles[t].resource; if (r >= 0 && r < 5) take(g, p, r); else if (r === 5) gold++; });
        if (gold) {
          g.goldQueue = [{ id, count: gold }]; limitGoldSupply(g);
          if (g.goldQueue.length) { g.goldResume = "setupRoad"; g.phase = "gold"; }
        }
        }
      }
      updateAwards(g);
    } else if (type === "road" || type === "ship") {
      requireRule(l[type === "ship" ? "ships" : "roads"].includes(a.edge), "这里不能建造 / Illegal route placement");
      const phase = g.phase;
      if (phase === "main") pay(g, p, COST[type]);
      Object.assign(g.board.edges[a.edge], { owner: id, kind: type, builtTurn: g.turn });
      log(g, `${p.name} ${type === "ship" ? "建造船只 / builds a ship" : "修建道路 / builds a road"}`);
      if (phase === "setupRoad") {
        g.setupStep++;
        const n = g.players.length;
        if (g.setupStep === Scenarios.setupRounds(g) * n) { g.phase = "roll"; g.turn = 1; g.current = 0; log(g, "初始建造完成 / Setup complete"); }
        else { g.current = Scenarios.nextSetupPlayer(g); g.phase = "setupSettlement"; }
      } else if (phase === "freeRoads") {
        // The first placement commits the card, before any exploration or gold choice.
        g.pendingDevelopment = null;
        g.freeRoads--;
        if (!g.freeRoads || (!roadSites(g, id).length && !shipSites(g, id).length)) { g.freeRoads = 0; g.phase = g.resumePhase; }
      }
      updateAwards(g);
      discover(g, id, a.edge);
    } else if (type === "moveShip") {
      requireRule(l.moveShips.includes(a.from) && l.shipDestinations[a.from].includes(a.edge), "这艘船现在不能移到这里 / Illegal ship move");
      g.board.edges[a.from].owner = -1; delete g.board.edges[a.from].kind; delete g.board.edges[a.from].builtTurn;
      Object.assign(g.board.edges[a.edge], { owner: id, kind: "ship", builtTurn: g.turn });
      g.shipMoved = true; updateAwards(g); log(g, `${p.name} 移动船只 / moves a ship`);
      discover(g, id, a.edge);
    } else if (type === "city") {
      requireRule(l.cities.includes(a.vertex), "请选择自己的村庄 / Choose your settlement");
      pay(g, p, COST.city); g.board.vertices[a.vertex].level = 2; log(g, `${p.name} 升级城市 / upgrades to a city`);
    } else if (type === "roll") {
      requireRule(l.roll, "本回合已经掷骰 / Dice already rolled");
      g.dice = [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)]; g.rolled = true; g.phase = "main";
      const number = sum(g.dice); log(g, `${p.name} 掷出 / rolls ${g.dice[0]} + ${g.dice[1]} = ${number}`);
      if (!Scenarios.rollPirate(g, number, scenarioHelpers, rng)) finishRoll(g, number);
    } else if (type === "robber" || type === "pirate") {
      requireRule(l[type].includes(a.tile), "必须移动到另一个合法地块 / Move to a different legal tile");
      g.board[type] = a.tile; g.thief = type;
      const owners = type === "pirate" ? g.board.edges.filter((e) => e.tiles.includes(a.tile) && routeKind(e) === "ship").map((e) => e.owner) : g.board.tiles[a.tile].vertices.map((v) => g.board.vertices[v].owner);
      g.victims = [...new Set(owners)].filter((v) => v >= 0 && v !== id && (sum(g.players[v].resources) || Scenarios.is(g, "cloth") && type === "pirate" && g.players[v].cloth));
      log(g, `${p.name} ${type === "pirate" ? "移动海盗 / moves the pirate" : "移动强盗 / moves the robber"}`);
      if (g.victims.length === 1 && !(Scenarios.is(g, "cloth") && type === "pirate" && g.players[g.victims[0]].cloth)) steal(g, id, g.victims[0], rng);
      else g.phase = g.victims.length ? "steal" : g.resumePhase;
    } else if (type === "steal") {
      requireRule(g.phase === "steal", "现在不能偷取资源 / Cannot steal now"); steal(g, id, a.victim, rng, a.loot);
    } else if (type === "bankTrade") {
      requireRule(l.trade && Number.isInteger(a.give) && Number.isInteger(a.get) && a.give >= 0 && a.give < 5 && a.get >= 0 && a.get < 5 && a.give !== a.get, "无效交易 / Invalid trade");
      const rate = tradeRate(g, id, a.give);
      requireRule(g.bank[a.get] > 0, `银行的${LABEL[RES[a.get]]}已无库存，暂时无法换取。 / The bank has no ${RES[a.get]} left to trade.`);
      requireRule(p.resources[a.give] >= rate, `需要 ${rate} 张${LABEL[RES[a.give]]}才能交换。 / You need ${rate} ${RES[a.give]} to trade.`);
      const cost = zeros(); cost[a.give] = rate; pay(g, p, cost); take(g, p, a.get);
      log(g, `${p.name} ${rate}:1 交易 / maritime trade · ${LABEL[RES[a.give]]} → ${LABEL[RES[a.get]]}`);
    } else if (type === "offerTrade") {
      requireRule(l.trade && resourceArray(a.give) && resourceArray(a.want) && sum(a.give) > 0 && sum(a.want) > 0 && a.give.every((n, i) => !n || !a.want[i]) && affordable(p, a.give), "请提供有效的资源交换 / Choose a valid exchange");
      const to = a.to ?? null;
      requireRule(to === null || (Number.isInteger(to) && g.players[to] && to !== id), "请选择其他玩家或所有玩家 / Choose another player or all players");
      g.trade = { id: g.revision + 1, from: id, to, give: [...a.give], want: [...a.want], rejected: [] };
    } else if (type === "cancelTrade") {
      requireRule(l.trade, "现在不能交易 / Cannot trade now"); g.trade = null;
    } else if (type === "buyDevelopment") {
      requireRule(l.buy, "无法购买发展卡 / Cannot buy development card");
      pay(g, p, COST.development); p.development.push({ type: g.deck.pop(), turn: g.turn }); log(g, `${p.name} 购买发展卡 / buys a development card`);
    } else if (type === "playDevelopment") {
      requireRule(l.development.includes(a.card), "本回合无法使用这张卡 / Cannot play this card this turn");
      if (a.card === "roads") requireRule(roadSites(g, id).length || shipSites(g, id).length, "没有可建道路或船 / No route available");
      if (a.card === "plenty") requireRule(sum(g.bank) > 0, "银行没有资源 / Bank is empty");
      const index = p.development.findIndex((d) => d.type === a.card && d.turn < g.turn);
      g.pendingDevelopment = ["plenty", "roads"].includes(a.card) ? { card: { ...p.development[index] }, index, player: id, turn: g.turn, phase: g.phase, resumePhase: g.resumePhase, freeRoads: g.freeRoads } : null;
      p.development.splice(index, 1); g.usedDevelopment.push(a.card);
      g.developmentPlayed = true;
      g.resumePhase = g.phase;
      const names = { knight: "骑士 / Knight", roads: "道路建设 / Road Building", plenty: "丰收 / Year of Plenty", monopoly: "垄断 / Monopoly" };
      log(g, `${p.name} 使用 / plays ${names[a.card]}`);
      if (a.card === "knight") {
        p.knights++;
        if (Scenarios.is(g, "pirates")) g.board.edges[Scenarios.orderedShips(g, id).find((e) => !g.board.edges[e].warship)].warship = true;
        else g.phase = "robber";
        updateAwards(g);
      }
      if (a.card === "roads") { g.phase = "freeRoads"; g.freeRoads = 2; }
      if (a.card === "plenty") {
        g.phase = "plenty";
        supplyShortage(g, id, -1, 2, Math.min(2, sum(g.bank)), "plenty");
      }
      if (a.card === "monopoly") g.phase = "monopoly";
    } else if (type === "cancelDevelopment") {
      requireRule(l.cancelDevelopment && g.usedDevelopment.at(-1) === g.pendingDevelopment?.card.type, "现在不能撤回 / This card can no longer be cancelled");
      const pending = g.pendingDevelopment;
      p.development.splice(pending.index, 0, pending.card); g.usedDevelopment.pop();
      g.phase = pending.phase; g.resumePhase = pending.resumePhase; g.freeRoads = pending.freeRoads ?? 0; g.developmentPlayed = false; g.pendingDevelopment = null;
      log(g, `${p.name} ${pending.card.type === "roads" ? "撤回道路卡 / cancels Road Building" : "撤回丰收卡 / cancels Year of Plenty"}`);
    } else if (type === "plenty") {
      requireRule(g.phase === "plenty" && resourceArray(a.resources) && sum(a.resources) === Math.min(2, sum(g.bank)) && a.resources.every((n, i) => n <= g.bank[i]), "请选择银行中的两张资源 / Choose available resources");
      a.resources.forEach((n, i) => take(g, p, i, n)); g.phase = g.resumePhase; g.pendingDevelopment = null;
    } else if (type === "monopoly") {
      requireRule(g.phase === "monopoly" && Number.isInteger(a.resource) && a.resource >= 0 && a.resource < 5, "请选择一种资源 / Choose a resource");
      let n = 0;
      g.players.forEach((x) => { if (x.id !== id) { n += x.resources[a.resource]; x.resources[a.resource] = 0; } });
      p.resources[a.resource] += n; g.phase = g.resumePhase; log(g, `${p.name} 获得 ${n} ${LABEL[RES[a.resource]]} / collects resources`);
    } else if (type === "end") {
      requireRule(l.end, "请先完成当前行动 / Complete the current action first");
      endTurn(g);
    } else throw new Error("未知行动 / Unknown action");
  }
  Scenarios.afterAction(g, id, a, scenarioHelpers);
  g.revision++; checkWin(g);
  const sound = g.winner >= 0 ? "victory" : type === "playDevelopment" ? a.card
    : ({ road: "road", ship: "ship", moveShip: "ship", settlement: "settlement", city: "city", robber: "robber", pirate: "pirate", roll: "dice", acceptTrade: "exchange", bankTrade: "exchange", cancelDevelopment: "cancel" })[type];
  g.effect = sound ? { id: g.revision, sound } : null;
  return g;
}

function publicGame(g, id) {
  return {
    board: g.board, scenario: g.scenario || null, mapId: g.mapId, layout: g.layout, target: g.target, thief: g.thief, goldQueue: g.goldQueue, bank: g.bank, deckCount: g.deck.length, phase: g.phase, current: g.current, turn: g.turn,
    dice: g.dice, longest: g.longest, largest: g.largest, roadLengths: g.roadLengths, winner: g.winner, winners: g.winners || (g.winner >= 0 ? [g.winner] : []),
    log: g.log, revision: g.revision, effect: g.effect || null, trade: g.trade, discard: g.discard, freeRoads: g.freeRoads,
    supplyNotices: (g.supplyNotices || []).filter(n => n.player === id).map(({ player, ...notice }) => notice),
    players: g.players.map((p) => ({ id: p.id, name: p.name, resourceCount: sum(p.resources), developmentCount: p.development.length,
      resources: p.id === id || g.phase === "over" ? p.resources : null,
      development: p.id === id || g.phase === "over" ? p.development : null,
      knights: p.knights, score: score(g, p.id, p.id === id || g.phase === "over"),
      settlements: pieceCount(g, p.id, 1), cities: pieceCount(g, p.id, 2), roads: routeCount(g, p.id, "road"), ships: routeCount(g, p.id, "ship"), islandPoints: Scenarios.islandPoints(g, p.id),
      ...(g.scenario ? { cloth: p.cloth, scenarioPoints: p.scenarioPoints, harbors: p.harbors, wonder: p.wonder, warships: Scenarios.warships(g, p.id), reservedShips: Scenarios.reservedShips(g, p.id), availableShips: 15 - routeCount(g, p.id, "ship") - Scenarios.reservedShips(g, p.id), liberated: g.scenario.pirateSeats[p.id]?.liberated || false } : {}),
    })),
    legal: legal(g, id), rates: RES.map((_, r) => tradeRate(g, id, r)),
  };
}

function production(g, id) {
  const rates = zeros();
  g.board.vertices.filter((v) => v.owner === id).forEach((v) => v.tiles.forEach((tId) => { const t = g.board.tiles[tId]; if (t.resource >= 0 && t.resource < 5) rates[t.resource] += pips(t.number) * v.level; else if (t.resource === 5) rates.forEach((_, r) => { rates[r] += pips(t.number) * v.level / 5; }); }));
  return rates;
}
function siteValue(g, id, vId) {
  const rates = production(g, id), v = g.board.vertices[vId];
  return v.tiles.reduce((value, tId) => {
    const t = g.board.tiles[tId];
    return value + (t.resource === 5 ? pips(t.number) * 2.8 : t.resource >= 0 ? pips(t.number) * (1 + 3 / (rates[t.resource] + 2)) * [1, 1, .85, 1.15, 1.1][t.resource] : 0);
  }, 0) + (g.board.ports.some((p) => p.vertices.includes(vId)) ? 2 : 0)
    + (Maps.get(g.mapId)?.bonusPoints && g.turn > 0 && v.owner < 0 && v.tiles.some((t) => { const island = g.board.tiles[t].region; return island !== undefined && !g.players[id].homeIslands.includes(island) && !g.players[id].discovered.includes(island); }) ? 18 : 0);
}
function roadValue(g, id, eId, kind = "road") {
  const e = g.board.edges[eId], queue = [[e.a, 0], [e.b, 0]], seen = new Set();
  let best = kind === "ship" ? Scenarios.routeValue(g, id, eId) : 0;
  while (queue.length) {
    const [vId, distance] = queue.shift();
    if (seen.has(vId) || distance > 4) continue;
    seen.add(vId); const v = g.board.vertices[vId];
    if (v.owner >= 0 && v.owner !== id) continue;
    if (emptySite(g, v)) best = Math.max(best, siteValue(g, id, vId) / (distance + 1));
    if (v.tiles.some((t) => g.board.tiles[t].resource === -3)) best = Math.max(best, 16 / (distance + 1));
    v.edges.forEach((edgeId) => {
      const edge = g.board.edges[edgeId];
      if ((edge.owner < 0 || (edge.owner === id && routeKind(edge) === kind)) && routeTerrain(g, edge, kind)) queue.push([edge.a === vId ? edge.b : edge.a, distance + (edge.owner === id ? 0 : 1)]);
    });
  }
  return best;
}
function botBuildPlans(g, id) {
  const hand = g.players[id].resources, rates = production(g, id), goals = [];
  if (citySites(g, id).length) goals.push(["city", 6]);
  if (settlementSites(g, id).length) goals.push(["settlement", 5]);
  if (roadSites(g, id).length && g.board.edges.filter((e) => e.owner === id).length < 12) goals.push(["road", g.longest !== id && g.roadLengths[id] >= 4 ? 4 : 2.2]);
  if (shipSites(g, id).length) goals.push(["ship", 3.8]);
  if (g.deck.length) goals.push(["development", 2.5]);
  if (g.players[id].wonder?.stage < 4) goals.push(["wonder", 12]);
  const scarcity = rates.map((n) => 1 + 2 / (n + 2));
  return goals.map(([type, priority]) => {
    const cost = type === "wonder" ? g.scenario.wonderCards.find((x) => x.id === g.players[id].wonder.id).cost : COST[type], missing = cost.reduce((n, amount, r) => n + Math.max(0, amount - hand[r]) * scarcity[r], 0);
    return { type, cost, priority, scarcity, missing, value: priority / (1 + missing * .65) };
  }).sort((a, b) => b.value - a.value);
}

function acceptBotTrade(g, id, offer) {
  const hand = g.players[id].resources;
  if (!affordable(g.players[id], offer.want)) return false;
  // Hidden victory points are unknown; only visible points and the public card count inform caution.
  const rivalPoints = score(g, offer.from, false), rivalCards = g.players[offer.from].development.length;
  const target = g.target || 10;
  if (rivalPoints >= target - 2 || (rivalPoints >= target - 3 && rivalCards >= 3)) return false;
  const plan = botBuildPlans(g, id)[0];
  if (!plan) return false;
  const after = hand.map((n, r) => n + offer.give[r] - offer.want[r]);
  const missingAfter = plan.cost.reduce((n, amount, r) => n + Math.max(0, amount - after[r]) * plan.scarcity[r], 0);
  if (["city", "settlement"].includes(plan.type) && missingAfter > plan.missing + .001) return false;

  // Surplus cards should not be sold more cheaply than the bot's own bank/port exchange.
  const outgoing = RES.map((_, r) => r).filter((r) => offer.want[r]);
  const incoming = RES.map((_, r) => r).filter((r) => offer.give[r]);
  if (outgoing.length === 1 && incoming.length === 1) {
    const give = outgoing[0], get = incoming[0], bankYield = Math.floor(offer.want[give] / tradeRate(g, id, give));
    if (bankYield > offer.give[get] && g.bank[get] >= bankYield) return false;
  }
  const value = (cards) => cards.reduce((result, count, r) => {
    const reserve = Math.max(1, plan.cost[r]), weight = plan.scarcity[r] * (plan.cost[r] ? 1.45 : .85);
    for (let n = 1; n <= count; n++) result += weight / (1 + Math.max(0, n - reserve) * .55);
    return result;
  }, 0);
  const beforeValue = value(hand);
  const received = value(hand.map((n, r) => n + offer.give[r])) - beforeValue;
  const paid = beforeValue - value(hand.map((n, r) => n - offer.want[r]));
  const completes = plan.missing > 0 && missingAfter === 0;
  const progress = (plan.missing - missingAfter) * 1.2 + (completes ? plan.priority * .5 : 0);
  const cautious = rivalPoints >= target - 3 || (rivalPoints >= target - 4 && rivalCards >= 3);
  if (cautious && (!completes || !["city", "settlement"].includes(plan.type) || received < paid * 1.5)) return false;
  return received - paid + progress > .15;
}

function chooseBotAction(g, id, rng = random) {
  const p = g.players[id], l = legal(g, id);
  const scenarioAction = Scenarios.botAction(g, id, l, scenarioHelpers);
  if (scenarioAction) return scenarioAction;
  const best = (items, value) => [...items].sort((a, b) => value(b) - value(a))[0];
  if (l.gold) {
    const resources = zeros(), plan = botBuildPlans(g, id)[0]?.cost || COST.settlement;
    for (let n = 0; n < l.gold; n++) {
      const r = best([0,1,2,3,4].filter((r) => g.bank[r] > resources[r]), (r) => Math.max(0, plan[r] - p.resources[r] - resources[r]) * 4 + [1.1,1,.9,1.4,1.3][r] / (p.resources[r] + resources[r] + 1)); resources[r]++;
    }
    return { type: "gold", resources };
  }
  if (l.discard) {
    const remaining = [...p.resources], discards = zeros();
    for (let n = 0; n < l.discard; n++) { const r = best([0, 1, 2, 3, 4].filter((r) => remaining[r]), (r) => remaining[r] / [1.2, 1.1, 1, 1.8, 1.8][r]); remaining[r]--; discards[r]++; }
    return { type: "discard", resources: discards };
  }
  if (id !== g.current) {
    const t = g.trade;
    if (canRespondToTrade(g, id)) {
      const accept = acceptBotTrade(g, id, t);
      return { type: accept ? "acceptTrade" : "rejectTrade", offerId: t.id };
    }
    return null;
  }
  if (g.phase === "setupSettlement") return { type: "settlement", vertex: best(l.settlements, (v) => siteValue(g, id, v)) };
  const routes = [...l.roads.map((edge) => ({ type: "road", edge })), ...l.ships.map((edge) => ({ type: "ship", edge }))];
  const routeValue = (a) => roadValue(g, id, a.edge, a.type);
  if (["setupRoad", "freeRoads"].includes(g.phase)) return best(routes, routeValue);
  if (g.phase === "robber") return best([...l.robber.map((tile) => ({ type: "robber", tile })), ...l.pirate.map((tile) => ({ type: "pirate", tile }))], (a) => {
    if (a.type === "pirate") return g.board.edges.filter((e) => e.tiles.includes(a.tile) && e.owner >= 0 && routeKind(e) === "ship").reduce((n, e) => n + (e.owner === id ? -25 : 6 + score(g, e.owner, false) * 2), 0);
    const tId = a.tile;
    const t = g.board.tiles[tId];
    return t.vertices.reduce((n, vId) => { const v = g.board.vertices[vId]; return n + (v.owner < 0 ? 0 : v.owner === id ? -25 : v.level * (pips(t.number) + score(g, v.owner, false) * 1.5)); }, 0);
  });
  if (g.phase === "steal") return { type: "steal", victim: best(l.victims, (v) => sum(g.players[v].resources) + score(g, v, false)) };
  if (g.phase === "plenty") {
    const resources = zeros();
    for (let n = 0; n < Math.min(2, sum(g.bank)); n++) { const r = best([0, 1, 2, 3, 4].filter((r) => g.bank[r] > resources[r]), (r) => [1.1, 1, .9, 1.4, 1.3][r] / (p.resources[r] + resources[r] + 1)); resources[r]++; }
    return { type: "plenty", resources };
  }
  if (g.phase === "monopoly") { const rates = production(g, id); return { type: "monopoly", resource: best([0, 1, 2, 3, 4], (r) => (19 - g.bank[r] - p.resources[r]) * (1 + 1 / (rates[r] + 1))) }; }
  if (l.roll) {
    if (l.development.includes("knight") && g.board.tiles[g.board.robber]?.vertices.some((v) => g.board.vertices[v].owner === id)) return { type: "playDevelopment", card: "knight" };
    return { type: "roll" };
  }
  if (g.phase !== "main") return null;
  if (l.cities.length) return { type: "city", vertex: best(l.cities, (v) => siteValue(g, id, v)) };
  if (l.settlements.length) return { type: "settlement", vertex: best(l.settlements, (v) => siteValue(g, id, v)) };
  if (l.development.length) {
    const card = l.development.find((c) => c !== "roads" || roadSites(g, id).length || shipSites(g, id).length);
    if (card && (card !== "plenty" || sum(g.bank))) return { type: "playDevelopment", card };
  }
  if (g.board.islands) {
    const move = best(l.moveShips.flatMap((from) => l.shipDestinations[from].map((edge) => ({ type: "moveShip", from, edge }))), (a) => roadValue(g, id, a.edge, "ship") - roadValue(g, id, a.from, "ship"));
    if (move && roadValue(g, id, move.edge, "ship") > roadValue(g, id, move.from, "ship") + 1) return move;
    const route = best(routes, routeValue);
    if (route && routeValue(route) > 1 && (pieceCount(g, id, 1) < 5 || g.roadLengths[id] >= 4)) return route;
  }
  const roadCount = routeCount(g, id, "road");
  if (l.roads.length && roadCount < 12 && (pieceCount(g, id, 1) < 5 || g.roadLengths[id] >= 4)) return { type: "road", edge: best(l.roads, (e) => roadValue(g, id, e)) };
  if (l.buy) return { type: "buyDevelopment" };
  // Plan a build first, then trade only surplus cards toward its missing resources.
  for (const { cost } of botBuildPlans(g, id)) {
    const needed = [0, 1, 2, 3, 4].filter((r) => p.resources[r] < cost[r] && g.bank[r] > 0);
    const extra = [0, 1, 2, 3, 4].filter((r) => p.resources[r] - cost[r] >= tradeRate(g, id, r));
    if (needed.length && extra.length) return { type: "bankTrade", give: extra[0], get: needed[0] };
  }
  return { type: "end" };
}

const scenarioHelpers = { affordable, resourceArray, pay, take, supplyShortage, pieceCount, longestRoad, score, updateAwards, checkWin, finishRoll, endTurn, log };
module.exports = { RES, COST, LABEL, makeBoard, createGame, act, legal, publicGame, chooseBotAction, canRespondToTrade, longestRoad, updateAwards, score, produce, tradeRate, settlementSites, roadSites, shipSites, movableShips, citySites, sum, random, requiredActors: Scenarios.requiredActors };
