"use strict";

// Scenario rules use resolved board IDs. Hidden gift cards live only on the game.
const KINDS = new Set(["tribes", "cloth", "pirates", "wonders", "new-world"]);
const sum = (a) => a.reduce((n, x) => n + x, 0);
const is = (g, kind) => g.scenario?.kind === kind;
const ship = (e, id) => e.owner === id && e.kind === "ship";
const fail = (ok, message) => { if (!ok) throw new Error(message); };
const coast = (b, e) => e.tiles.some((i) => b.tiles[i].resource >= -1) && (e.tiles.length === 1 || e.tiles.some((i) => b.tiles[i].resource === -2));

function prepareBoard(b, map) {
  if (!KINDS.has(map.family || map.id)) return;
  if ((map.family || map.id) === "wonders") { b.pirate = -1; b.pirateStart = null; }
  if ((map.family || map.id) === "pirates") b.robber = -1;
  const spec = map.scenario || {}, at = (ref) => {
    if (Number.isInteger(ref)) return b.tiles[ref];
    const pair = Array.isArray(ref) ? ref : ref.at || ref.tile;
    const t = b.tiles.find((t) => t.row === pair[0] && t.col === pair[1]);
    fail(t, "Invalid scenario tile reference"); return t;
  };
  const vertex = (ref) => Number.isInteger(ref) ? ref : at(ref).vertices[ref.corner];
  const edge = (ref) => {
    if (Number.isInteger(ref)) return ref;
    const t = at(ref), rad = ref.angle * Math.PI / 180;
    const dot = (e) => ((b.vertices[e.a].x + b.vertices[e.b].x) / 2 - t.x) * Math.cos(rad) + ((b.vertices[e.a].y + b.vertices[e.b].y) / 2 - t.y) * Math.sin(rad);
    return b.edges.filter((e) => e.tiles.includes(t.id)).sort((a, c) => dot(c) - dot(a))[0].id;
  };
  b.scenario = {
    kind: map.family || map.id,
    gifts: (spec.gifts || []).map((x, i) => ({ id: x.id ?? `gift-${i}`, kind: x.kind || x.type, edge: edge(x.edge ?? x), ...(x.resource !== undefined ? { resource: x.resource } : {}), claimedBy: -1 })),
    villages: (spec.villages || []).map((x, i) => ({ id: x.id ?? `village-${i}`, vertex: vertex(x.vertex ?? x), number: x.number, cloth: x.cloth ?? 5, connected: [] })),
    piratePath: (spec.piratePath || []).map((x) => at(x).id),
    pirateSeats: (spec.pirateSeats || []).map((x) => ({ color: x.color, home: vertex(x.home || x.settlement), ship: edge(x.ship), landing: vertex(x.landing || x.outpost), fortress: vertex(x.fortress) })),
    wonderSites: { bridge: (spec.wonderSites?.bridge || []).map(vertex), wall: (spec.wonderSites?.wall || []).map(vertex), setupForbidden: (spec.setupExcluded || spec.wonderSites?.setupForbidden || []).map(vertex) },
    wonderCards: structuredClone(spec.wonderCards || []),
  };
}

function initialize(g, map, options, rng) {
  if (!KINDS.has(map?.family || map?.id)) return;
  if (!g.board.scenario) prepareBoard(g.board, map);
  g.scenario = g.board.scenario;
  Object.assign(g.scenario, { pending: null, actor: null, clothBank: is(g, "cloth") ? 10 : 0, thieves: is(g, "wonders") ? "robber" : is(g, "pirates") ? "pirate" : is(g, "new-world") ? options.thieves || "both" : "both" });
  fail(["both", "robber", "pirate"].includes(g.scenario.thieves), "Invalid robber/pirate option");
  if (g.scenario.thieves === "pirate") g.board.robber = -1;
  if (g.scenario.thieves === "robber") { g.board.pirate = -1; g.board.pirateStart = null; }
  g.players.forEach((p) => Object.assign(p, { scenarioPoints: 0, cloth: 0, harbors: [], wonder: null }));
  if (is(g, "tribes")) {
    g.target = 13; g.giftDevelopment = {}; g.scenario.robberLeftSmall = Boolean(g.board.tiles[g.board.robber]?.setupAllowed);
    for (const gift of g.scenario.gifts) if (gift.kind === "development") g.giftDevelopment[gift.id] = g.deck.pop();
    if (g.layout === "random") {
      const harbors = g.scenario.gifts.filter((x) => x.kind === "harbor"), resources = harbors.map((x) => x.resource);
      for (let i = resources.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [resources[i], resources[j]] = [resources[j], resources[i]]; }
      harbors.forEach((x, i) => { x.resource = resources[i]; });
    }
  }
  if (is(g, "cloth")) g.target = 14;
  if (is(g, "new-world")) {
    g.target = 12; g.board.ports = [];
    g.harborDeck = [...(map.scenario.harborTypes || [0,1,2,3,4,-1,-1,-1,-1,-1])];
    for (let i = g.harborDeck.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [g.harborDeck[i], g.harborDeck[j]] = [g.harborDeck[j], g.harborDeck[i]]; }
    nextHarbor(g, 0);
  }
  if (is(g, "pirates")) {
    g.target = 10; g.board.robber = -1;
    g.deck = g.players.length === 3 ? g.deck.filter((x) => x !== "vp") : g.deck.map((x) => x === "vp" ? "knight" : x);
    g.scenario.pirateSeats = g.scenario.pirateSeats.slice(0, g.players.length).map((s, owner) => ({ ...s, owner, strength: 3, liberated: false }));
    for (const s of g.scenario.pirateSeats) {
      Object.assign(g.board.vertices[s.home], { owner: s.owner, level: 1 });
      Object.assign(g.board.edges[s.ship], { owner: s.owner, kind: "ship", builtTurn: 0 });
    }
  }
}

function settlementAllowed(g, id, v, setup) {
  if (!g.scenario) return true;
  const b = g.board, s = g.scenario;
  if (!is(g, "pirates") && v.tiles.some((i) => b.tiles[i].noSettlement)) return false;
  if ((is(g, "tribes") || is(g, "cloth")) && !v.tiles.some((i) => b.tiles[i].setupAllowed)) return false;
  if (is(g, "wonders") && setup) {
    const forbidden = [...s.wonderSites.setupForbidden, ...s.wonderSites.bridge, ...s.wonderSites.wall];
    if (forbidden.includes(v.id)) return false;
  }
  if (is(g, "pirates")) {
    if (s.pirateSeats.some((x) => x.fortress === v.id)) return false;
    if (!v.tiles.some((i) => b.tiles[i].setupAllowed)) return !setup && s.pirateSeats[id]?.landing === v.id;
    if (v.edges.some((e) => b.edges[e].owner >= 0 && b.edges[e].owner !== id && b.edges[e].kind === "ship")) return false;
  }
  return true;
}

function orderedShips(g, id, ignore = -1) {
  const s = g.scenario?.pirateSeats[id];
  if (!s) return [];
  const result = [], seen = new Set(); let v = s.home;
  while (true) {
    const e = g.board.vertices[v].edges.map((i) => g.board.edges[i]).find((x) => x.id !== ignore && ship(x, id) && !seen.has(x.id));
    if (!e) break;
    seen.add(e.id); result.push(e.id); v = e.a === v ? e.b : e.a;
  }
  return result;
}

function seaDistances(g, target, id) {
  const b = g.board, dist = new Map([[target, 0]]), queue = [target];
  for (let n = 0; n < queue.length; n++) {
    const v = queue[n];
    for (const eid of b.vertices[v].edges) {
      const e = b.edges[eid], next = e.a === v ? e.b : e.a;
      if (!(e.tiles.length === 1 || e.tiles.some((i) => b.tiles[i].resource === -2)) || e.owner >= 0 && e.owner !== id || dist.has(next)) continue;
      if (b.vertices[next].owner >= 0 && b.vertices[next].owner !== id) continue;
      dist.set(next, dist.get(v) + 1); queue.push(next);
    }
  }
  return dist;
}

function routeAllowed(g, id, e, kind, setup, ignore) {
  if (!is(g, "pirates")) return true;
  const b = g.board, s = g.scenario.pirateSeats[id];
  if (kind !== "ship") return [e.a, e.b].every((v) => !b.vertices[v].edges.some((i) => ship(b.edges[i], b.edges[i].owner) && b.edges[i].owner >= 0 && b.edges[i].owner !== id));
  if (setup || !s || s.liberated) return false;
  const path = orderedShips(g, id, ignore);
  let tip = s.home;
  for (const i of path) { const p = b.edges[i]; tip = p.a === tip ? p.b : p.a; }
  if (tip === s.fortress || ![e.a, e.b].includes(tip)) return false;
  const next = e.a === tip ? e.b : e.a;
  if (next === s.home || b.vertices[next].edges.some((i) => i !== ignore && b.edges[i].owner >= 0 && (b.edges[i].kind === "ship" || b.edges[i].owner !== id))) return false;
  if (b.vertices[next].owner >= 0 && b.vertices[next].owner !== id) return false;
  const reachedLanding = path.some((i) => [b.edges[i].a, b.edges[i].b].includes(s.landing));
  const target = reachedLanding || tip === s.landing ? s.fortress : s.landing;
  const dist = seaDistances(g, target, id);
  return (dist.get(next) ?? Infinity) < (dist.get(tip) ?? Infinity);
}

function pirateIslandEdge(g, edge) {
  return is(g, "pirates") && edge && edge.tiles.some(i => g.board.tiles[i].resource >= -1)
    && edge.tiles.every(i => !g.board.tiles[i].setupAllowed);
}

const tradeVillage = (g, v) => is(g, "cloth") && g.scenario.villages.some((x) => x.vertex === v);
const islandPoints = (g, id) => (g.players[id].discovered?.length || 0) * (is(g, "new-world") ? 1 : 2);
const extraPoints = (g, id) => (g.players[id].scenarioPoints || 0) + Math.floor((g.players[id].cloth || 0) / 2);
const warships = (g, id) => g.board.edges.filter((e) => ship(e, id) && e.warship).length;
const reservedShips = (g, id) => is(g, "wonders") && g.players[id].wonder ? 1 : 0;
const setupRounds = (g) => is(g, "cloth") ? 3 : 2;
function nextSetupPlayer(g) {
  const n = g.players.length, step = g.setupStep;
  return step < n ? step : step < 2 * n ? 2 * n - 1 - step : step - 2 * n;
}

function settled(g, id, v, setup) {
  const p = g.players[id];
  if (is(g, "new-world")) {
    const islands = [...new Set(v.tiles.map((i) => g.board.tiles[i].island).filter((i) => i !== undefined))];
    if (setup) p.homeIslands = [...new Set([...p.homeIslands, ...islands])];
    else for (const i of islands) if (!p.homeIslands.includes(i) && !p.discovered.includes(i)) { p.discovered.push(i); v.islandBonus = (v.islandBonus || 0) + 1; }
  }
  if (is(g, "wonders") && !setup && !v.tiles.some((i) => g.board.tiles[i].setupAllowed)) { p.scenarioPoints++; v.islandBonus = (v.islandBonus || 0) + 1; }
}

function connections(g) {
  if (!is(g, "cloth")) return;
  for (const p of g.players) {
    const seen = new Set(), queue = g.board.vertices.filter((v) => v.owner === p.id).map((v) => v.id);
    for (let i = 0; i < queue.length; i++) {
      const v = queue[i]; if (seen.has(v)) continue; seen.add(v);
      if (g.board.vertices[v].owner >= 0 && g.board.vertices[v].owner !== p.id) continue;
      for (const eid of g.board.vertices[v].edges) { const e = g.board.edges[eid]; if (ship(e, p.id)) queue.push(e.a === v ? e.b : e.a); }
    }
    for (const village of g.scenario.villages) if (seen.has(village.vertex) && !village.connected.includes(p.id)) {
      village.connected.push(p.id);
      if (village.cloth > 0) { village.cloth--; p.cloth++; }
    }
  }
}

function produceCloth(g, number) {
  if (!is(g, "cloth")) return;
  for (const v of g.scenario.villages) if (v.number === number && v.cloth > 0) {
    const recipients = [...v.connected].sort((a, b) => (a - g.current + g.players.length) % g.players.length - (b - g.current + g.players.length) % g.players.length);
    for (const id of recipients) {
      if (v.cloth > 0) { v.cloth--; g.players[id].cloth++; }
      else if (g.scenario.clothBank > 0) { g.scenario.clothBank--; g.players[id].cloth++; }
    }
  }
}

function harborEdges(g, id, draft = false) {
  const b = g.board;
  return b.edges.filter((e) => coast(b, e) && (draft || [e.a, e.b].some((v) => b.vertices[v].owner === id))
    && !b.ports.some((p) => p.vertices.includes(e.a) || p.vertices.includes(e.b))).map((e) => e.id);
}
function setPending(g, pending) { g.scenario.pending = pending; g.scenario.actor = pending?.actor ?? null; if (pending) g.phase = "scenarioChoice"; }
function nextHarbor(g, actor) {
  const s = g.scenario;
  if (!g.harborDeck.length) { s.harborDraft = null; s.harborRemaining = 0; setPending(g, null); g.phase = "setupSettlement"; g.current = 0; return; }
  s.harborRemaining = g.harborDeck.length;
  s.harborDraft = { id: `draft-${10 - s.harborRemaining}`, resource: g.harborDeck.pop(), actor };
  g.current = actor; setPending(g, { actor, kind: "placeHarbor" });
}
function afterAction(g, id, a, h) {
  if (!g.scenario || g.phase === "over") return;
  if (is(g, "tribes") && a.type === "robber" && g.board.tiles[a.tile].setupAllowed) g.scenario.robberLeftSmall = true;
  if (is(g, "tribes") && (a.type === "ship" || a.type === "moveShip")) {
    for (const gift of g.scenario.gifts) if (gift.edge === a.edge && gift.claimedBy < 0) {
      gift.claimedBy = id;
      if (gift.kind === "vp") g.players[id].scenarioPoints++;
      if (gift.kind === "development") { g.players[id].development.push({ type: g.giftDevelopment[gift.id], turn: g.turn }); delete g.giftDevelopment[gift.id]; }
      if (gift.kind === "harbor") {
        g.players[id].harbors.push({ id: gift.id, resource: gift.resource });
        g.board.ports = g.board.ports.filter((p) => p.edge !== gift.edge);
      }
      h.log(g, `${g.players[id].name} receives a gift / 获得礼物`);
    }
  }
  connections(g);
  if (is(g, "tribes") && !g.scenario.pending && ["main", "roll", "freeRoads", "setupRoad"].includes(g.phase)) {
    const actor = g.current;
    if (g.players[actor].harbors.length && harborEdges(g, actor).length) setPending(g, { actor, kind: "placeHarbor", resume: g.phase });
  }
}

function eligibleWonders(g, id, h) {
  if (!is(g, "wonders") || g.players[id].wonder || g.board.edges.filter((e) => ship(e, id)).length >= 15) return [];
  const own = (ids) => ids.some((i) => g.board.vertices[i].owner === id);
  const cities = h.pieceCount(g, id, 2), points = h.score(g, id);
  const criteria = { bridge: own(g.scenario.wonderSites.bridge), wall: own(g.scenario.wonderSites.wall), theatre: cities >= 2, library: cities >= 1 && points >= 6, colossus: g.board.ports.some((p) => own(p.vertices)) && h.longestRoad(g, id) >= 5 };
  return g.scenario.wonderCards.filter((w) => criteria[w.id] && !g.players.some((p) => p.wonder?.id === w.id)).map((w) => w.id);
}

function legal(g, id, h) {
  const out = { placeHarbors: [], chooseWonders: [], buildWonder: false, attackFortress: false, removeIslandRoads: [], warnIslandRoads: [], piratePayment: 0, pirateReward: [], steal: [] };
  const s = g.scenario, p = g.players[id];
  if (!s || !p || g.phase === "over") return out;
  if (g.phase === "scenarioChoice") {
    if (s.pending?.actor !== id) return out;
    if (s.pending.kind === "pirateReward") out.pirateReward = g.bank.flatMap((n, r) => n > 0 ? [r] : []);
    if (s.pending.kind === "placeHarbor") out.placeHarbors = s.harborDraft ? [{ harbor: s.harborDraft.id, edges: harborEdges(g, id, true) }] : p.harbors.map((x) => ({ harbor: x.id, edges: harborEdges(g, id) }));
    return out;
  }
  if (id !== g.current) return out;
  if (g.phase === "steal") out.steal = g.victims.map((victim) => ({ victim, loot: [...(sum(g.players[victim].resources) ? ["resource"] : []), ...(is(g, "cloth") && g.thief === "pirate" && g.players[victim].cloth ? ["cloth"] : [])] }));
  if (g.phase !== "main") return out;
  out.placeHarbors = p.harbors.map((x) => ({ harbor: x.id, edges: harborEdges(g, id) })).filter((x) => x.edges.length);
  out.chooseWonders = eligibleWonders(g, id, h);
  if (p.wonder && p.wonder.stage < 4) out.buildWonder = h.affordable(p, s.wonderCards.find((w) => w.id === p.wonder.id).cost);
  if (is(g, "pirates")) {
    const seat = s.pirateSeats[id], path = orderedShips(g, id);
    out.attackFortress = !seat.liberated && path.some((eid) => [g.board.edges[eid].a, g.board.edges[eid].b].includes(seat.fortress));
    out.removeIslandRoads = g.board.edges.filter(e => e.owner === id && e.kind !== "ship" && pirateIslandEdge(g, e)).map(e => e.id);
  }
  return out;
}

function rollPirate(g, number, h, rng) {
  if (!is(g, "pirates") || g.board.pirate < 0) return false;
  const s = g.scenario, power = Math.min(...g.dice), path = s.piratePath, from = g.board.pirate;
  g.board.pirate = path[(Math.max(0, path.indexOf(g.board.pirate)) + power) % path.length];
  const victims = [...new Set(g.board.tiles[g.board.pirate].vertices.map(i => g.board.vertices[i]).filter(v => v.owner >= 0 && v.level > 0).map(v => v.owner))];
  // Public battle snapshots contain counts, never the identities of lost resource cards.
  const report = { id: g.revision + 1, kind: "raid", turn: g.turn, from, tile: g.board.pirate, dice: [...g.dice], power, actor: victims[0] ?? null, result: "clear" };
  s.lastPirate = s.battle = report;
  h.log(g, `海盗顺时针移动 ${power} 格 / Pirates move ${power} hexes clockwise`);
  if (!victims.length) { h.log(g, "停靠处没有村庄或城市，无人遭袭 / No buildings beside the destination; no raid"); return false; }
  const actor = victims[0], strength = warships(g, actor);
  Object.assign(report, { name: g.players[actor].name, strength, cities: h.pieceCount(g, actor, 2), result: strength > power ? "win" : strength === power ? "tie" : "loss", lost: 0 });
  const comparison = strength > power ? ">" : strength === power ? "=" : "<";
  h.log(g, `${report.name} 的沿岸建筑遭袭：战舰 ${strength} ${comparison} 海盗 ${power} / Coastal raid: ${strength} warships ${comparison} pirate strength ${power}`);
  if (strength === power) { h.log(g, "战力相等，无损失也无奖励 / Equal strength: no losses or reward"); return false; }
  const count = Math.min(sum(g.players[actor].resources), report.cities + 1);
  if (strength < power) {
    const p = g.players[actor];
    for (let i = 0; i < count; i++) {
      let pick = Math.floor(rng() * sum(p.resources)), r = 0;
      while (pick >= p.resources[r]) pick -= p.resources[r++];
      p.resources[r]--; g.bank[r]++;
    }
    report.lost = count;
    h.log(g, `${p.name} 防守失败：1 + ${report.cities} 座城市，应弃 ${report.cities + 1} 张，实际随机损失 ${count} 张资源 / Raid lost: 1 + ${report.cities} cities; ${count} resource cards randomly discarded`);
    return false;
  }
  report.reward = sum(g.bank) ? "pending" : "empty";
  h.log(g, report.reward === "pending" ? `${report.name} 击退海盗，待任选 1 张银行资源 / Wins the raid: choose 1 bank resource` : `${report.name} 击退海盗，但银行无资源可领 / Wins the raid, but the bank is empty`);
  if (report.reward === "empty") return false;
  setPending(g, { actor, kind: "pirateReward", number });
  return true;
}

function seven(g) {
  if (!is(g, "pirates")) { g.phase = "robber"; return; }
  g.thief = "pirate";
  g.victims = g.players.filter((p) => p.id !== g.current && sum(p.resources)).map((p) => p.id);
  g.phase = g.victims.length ? "steal" : "main";
}

function filterLegal(g, id, out) {
  if (!g.scenario) return;
  const s = g.scenario;
  if (is(g, "pirates")) out.scenario.warnIslandRoads = out.roads.filter(eid => pirateIslandEdge(g, g.board.edges[eid]));
  if (s.thieves === "robber" || is(g, "pirates") || is(g, "cloth") && !s.villages.some((v) => v.connected.includes(id))) out.pirate = [];
  if (s.thieves === "pirate") out.robber = [];
  out.robber = out.robber.filter((i) => is(g, "tribes") ? !s.robberLeftSmall || g.board.tiles[i].setupAllowed
    : g.board.tiles[i].robberAllowed !== false && (!is(g, "cloth") || g.board.tiles[i].setupAllowed));
  if (is(g, "pirates") && !orderedShips(g, id).some((i) => !g.board.edges[i].warship)) out.development = out.development.filter((x) => x !== "knight");
}

function act(g, id, a, l, rng, h) {
  const s = g.scenario, p = g.players[id];
  if (!s) return false;
  if (a.type === "removeIslandRoad") {
    fail(l.scenario.removeIslandRoads.includes(a.edge), "只能在自己的建造阶段撤回自己的外岛道路 / Remove only your own pirate-island roads during your building phase");
    const edge = g.board.edges[a.edge];
    edge.owner = -1; delete edge.kind; delete edge.builtTurn;
    h.updateAwards(g);
    h.log(g, `${p.name} 撤回外岛道路，不返还资源或建造次数 / removes a pirate-island road without refunding resources or builds`);
    return true;
  }
  if (a.type === "pirateReward") {
    fail(g.phase === "scenarioChoice" && s.pending?.actor === id && s.pending.kind === a.type, "Not your scenario choice / 尚未轮到你选择");
    fail(l.scenario.pirateReward.includes(a.resource), "Choose an available resource / 请选择可用资源"); h.take(g, p, a.resource);
    if (s.lastPirate?.actor === id) s.lastPirate.reward = "claimed";
    if (s.battle?.kind === "raid" && s.battle.actor === id) s.battle.reward = "claimed";
    h.log(g, `${p.name} 击退海盗，领取 1 张资源 / defeats the pirates and collects 1 resource`);
    const number = s.pending.number; setPending(g, null); g.phase = "main"; h.finishRoll(g, number); return true;
  }
  if (a.type === "placeHarbor") {
    fail(l.scenario.placeHarbors.some((x) => x.harbor === a.harbor && x.edges.includes(a.edge)), "Illegal harbor placement / 无效海港位置");
    if (s.harborDraft) {
      const e = g.board.edges[a.edge];
      g.board.ports.push({ resource: s.harborDraft.resource, vertices: [e.a, e.b], edge: e.id, land: e.tiles.find((i) => g.board.tiles[i].resource >= -1) });
      h.log(g, `${p.name} 摆放初始海港 / places a starting harbor`);
      nextHarbor(g, (id + 1) % g.players.length); return true;
    }
    const index = p.harbors.findIndex((x) => x.id === a.harbor), harbor = p.harbors[index], e = g.board.edges[a.edge];
    p.harbors.splice(index, 1); g.board.ports.push({ resource: harbor.resource, vertices: [e.a, e.b], edge: e.id, land: e.tiles.find((i) => g.board.tiles[i].resource >= -1) });
    h.log(g, `${p.name} 放置海港 / places a harbor`);
    if (s.pending?.kind === "placeHarbor") { g.phase = s.pending.resume; setPending(g, null); } return true;
  }
  if (a.type === "chooseWonder") {
    fail(l.scenario.chooseWonders.includes(a.wonder), "Wonder unavailable or requirements unmet / 奇观不可选择");
    p.wonder = { id: a.wonder, stage: 0 };
    const card = s.wonderCards.find((w) => w.id === a.wonder);
    h.log(g, `${p.name} 选择 ${card.name} / claims ${card.english}`); return true;
  }
  if (a.type === "buildWonder") {
    fail(l.scenario.buildWonder, "Cannot build this wonder / 无法兴建奇观");
    h.pay(g, p, s.wonderCards.find((x) => x.id === p.wonder.id).cost); p.wonder.stage++;
    h.log(g, `${p.name} 兴建奇观第 ${p.wonder.stage} 层 / builds wonder stage ${p.wonder.stage}`); return true;
  }
  if (a.type === "attackFortress") {
    fail(l.scenario.attackFortress, "Your fleet must reach your fortress / 舰队必须抵达自己的堡垒");
    const seat = s.pirateSeats[id], power = 1 + Math.floor(rng() * 6), strength = warships(g, id), path = orderedShips(g, id);
    const report = { id: g.revision + 1, kind: "fortress", turn: g.turn, actor: id, name: p.name, power, strength, defensesBefore: seat.strength, shipsLost: 0, result: strength > power ? "win" : strength === power ? "tie" : "loss" };
    s.lastAttack = s.battle = report;
    h.log(g, `${p.name} 攻击堡垒 / attacks fortress · ${strength} : ${power} · ${strength > power ? "胜利 / win" : strength === power ? "平手 / tie" : "失败 / loss"}`);
    if (strength > power) {
      seat.strength--;
      if (!seat.strength) { seat.liberated = true; Object.assign(g.board.vertices[seat.fortress], { owner: id, level: 1 }); }
      if (s.pirateSeats.every((x) => x.liberated)) { g.board.pirate = -1; g.board.pirateStart = null; }
    } else for (const eid of path.slice(-(strength === power ? 1 : 2))) { const e = g.board.edges[eid]; e.owner = -1; delete e.kind; delete e.builtTurn; delete e.warship; report.shipsLost++; }
    report.defenses = seat.strength; report.liberated = Boolean(seat.liberated);
    h.log(g, strength > power ? `移除 1 层防御，剩余 ${seat.strength}/3${seat.liberated ? "，要塞收复" : ""} / Remove 1 defense; ${seat.strength}/3 remain${seat.liberated ? "; fortress liberated" : ""}` : `损失离要塞最近的 ${report.shipsLost} 艘船，防御仍为 ${seat.strength}/3 / Lose ${report.shipsLost} ships nearest the fortress; defenses remain ${seat.strength}/3`);
    h.updateAwards(g); h.checkWin(g); if (g.phase !== "over") h.endTurn(g); return true;
  }
  return false;
}

function checkWin(g, score, log) {
  if (!g.scenario) return false;
  if (g.phase.startsWith("setup") || g.turn === 0) return true;
  const s = g.scenario;
  let winners = [];
  if (is(g, "cloth") && s.villages.filter((v) => v.cloth > 0).length < 4) {
    const max = Math.max(...g.players.map((p) => score(g, p.id)));
    const leaders = g.players.filter((p) => score(g, p.id) === max), cloth = Math.max(...leaders.map((p) => p.cloth));
    winners = leaders.filter((p) => p.cloth === cloth).map((p) => p.id);
  } else {
    const p = g.players[g.current], stage = p.wonder?.stage || 0;
    const wins = is(g, "wonders") ? stage === 4 || score(g, p.id) >= 10 && g.players.every((x) => x.id === p.id || stage > (x.wonder?.stage || 0))
      : score(g, p.id) >= g.target && (!is(g, "pirates") || s.pirateSeats[p.id].liberated);
    if (wins) winners = [p.id];
  }
  if (winners.length) { g.winners = winners; g.winner = winners[0]; g.phase = "over"; g.trade = null; setPending(g, null); log(g, `${winners.map((i) => g.players[i].name).join(" & ")} 胜利 / wins`); }
  return true;
}

function botAction(g, id, l, h) {
  if (!g.scenario) return null;
  const p = g.players[id], s = l.scenario;
  if (s.pirateReward.length) return { type: "pirateReward", resource: [...s.pirateReward].sort((a, b) => p.resources[a] - p.resources[b])[0] };
  if (s.placeHarbors.length) return { type: "placeHarbor", harbor: s.placeHarbors[0].harbor, edge: s.placeHarbors[0].edges[0] };
  if (id !== g.current) return null;
  if (s.steal.length && is(g, "cloth")) {
    const target = s.steal.find((x) => x.loot.includes("cloth")) || s.steal[0]; return { type: "steal", victim: target.victim, loot: target.loot.includes("cloth") ? "cloth" : "resource" };
  }
  if (is(g, "pirates") && l.development.includes("knight")) return { type: "playDevelopment", card: "knight" };
  if (s.buildWonder) return { type: "buildWonder" };
  if (s.chooseWonders.length) return { type: "chooseWonder", wonder: s.chooseWonders[0] };
  if (s.attackFortress) {
    const strength = warships(g, id), canReinforce = g.deck.length || p.development.some((d) => d.type === "knight");
    if (strength >= 4 || strength >= 2 && !canReinforce) return { type: "attackFortress" };
  }
  return null;
}

function routeValue(g, id, eid) {
  if (!g.scenario) return 0;
  if (is(g, "pirates")) return 30;
  const b = g.board, e = b.edges[eid], targets = is(g, "tribes") ? g.scenario.gifts.filter((x) => x.claimedBy < 0).map((x) => [b.edges[x.edge].a, b.edges[x.edge].b])
    : is(g, "cloth") ? g.scenario.villages.filter((x) => x.cloth > 0 && !x.connected.includes(id)).map((x) => [x.vertex]) : [];
  let best = 0;
  for (const vertices of targets) for (const target of vertices) {
    const dist = seaDistances(g, target, id), distance = Math.min(dist.get(e.a) ?? Infinity, dist.get(e.b) ?? Infinity);
    best = Math.max(best, 25 / (distance + 1));
  }
  return best;
}

function requiredActors(g) {
  if (g.phase === "over") return [];
  if (g.phase === "scenarioChoice") return g.scenario?.pending ? [g.scenario.pending.actor] : [];
  if (g.phase === "discard") return Object.keys(g.discard).map(Number);
  if (g.phase === "gold") return g.goldQueue?.length ? [g.goldQueue[0].id] : [];
  return [g.current];
}

module.exports = { is, prepareBoard, initialize, settlementAllowed, routeAllowed, tradeVillage, islandPoints, extraPoints, warships, reservedShips, orderedShips, setupRounds, nextSetupPlayer, settled, connections, produceCloth, afterAction, legal, rollPirate, seven, filterLegal, act, checkWin, botAction, routeValue, requiredActors };
