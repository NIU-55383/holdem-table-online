"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { defineHex } = require("honeycomb-grid");
const Maps = require("./catan-maps");
const Scenarios = require("./catan-scenario-maps");
const randomize = require("./catan-random");
const rngFor = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const shuffle = (values, rng) => {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
const adjacent = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r), Math.abs(a.q + a.r - b.q - b.r)) === 1;
const histogram = (values) => values.reduce((result, n) => { result[n] = (result[n] || 0) + 1; return result; }, {});
const inventory = (tiles) => [0,1,2,3,4,5,-1,-2].map((r) => tiles.filter((t) => !t.frame && t.resource === r).length);
const tileAt = (board, ref) => board.tiles.find((t) => t.row === ref[0] && t.col === ref[1]);

function geometry(map) {
  const Hex = defineHex({ dimensions: 53, origin: { x: 0, y: 0 } });
  const vertices = [], edges = [], vm = new Map(), em = new Map();
  const tiles = map.tiles.map((source, id) => {
    const tile = { ...source, id, vertices: [] }, hex = new Hex({ q: source.q, r: source.r });
    hex.corners.forEach((point) => {
      const key = `${Math.round(point.x * 100)}:${Math.round(point.y * 100)}`;
      if (!vm.has(key)) { vm.set(key, vertices.length); vertices.push({ ...point, tiles: [] }); }
      const v = vm.get(key); vertices[v].tiles.push(id); tile.vertices.push(v);
    });
    tile.vertices.forEach((a, side) => {
      const b = tile.vertices[(side + 1) % 6], key = [a,b].sort((a,b) => a-b).join(":");
      if (!em.has(key)) { em.set(key, edges.length); edges.push({ a, b, tiles: [] }); }
      edges[em.get(key)].tiles.push(id);
    });
    return tile;
  });
  return { tiles, edges, vertices };
}
function resolveEdge(board, reference) {
  const t = tileAt(board, reference.at), side = reference.angle / 60;
  assert.ok(t, `Missing edge tile ${reference.at}`);
  const a = t.vertices[side], b = t.vertices[(side + 1) % 6];
  return board.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}
function resolveVertex(board, reference) {
  const t = tileAt(board, reference.at);
  assert.ok(t, `Missing vertex tile ${reference.at}`);
  assert.ok(Number.isInteger(reference.corner) && reference.corner >= 0 && reference.corner < 6);
  return t.vertices[reference.corner];
}
function checkPorts(board, ports) {
  const used = new Set();
  for (const [row, col, angle, resource] of ports) {
    assert.ok([-1,0,1,2,3,4].includes(resource));
    const edge = resolveEdge(board, { at: [row,col], angle });
    assert.ok(edge);
    assert.equal(edge.tiles.filter((i) => board.tiles[i].resource >= -1).length, 1, `Non-coastal harbor ${row}:${col}:${angle}`);
    assert.equal(tileAt(board, [row,col]).resource >= -1, true);
    for (const id of [edge.a, edge.b]) { assert.ok(!used.has(id), "Harbors share an intersection"); used.add(id); }
  }
}

test("advanced map inventories match all five photographed tables, excluding printed frame water", () => {
  const expected = {
    tribes: [5,5,5,5,5,2,3,19], cloth: [4,3,4,5,4,2,2,18],
    pirates: [5,5,5,5,5,2,3,19], wonders: [5,5,5,5,5,2,3,19], "new-world": [5,4,5,5,4,0,0,19],
  };
  const numbered = { tribes: 18, cloth: 20, pirates: 24, wonders: 27, "new-world": 23 };
  for (const [id, counts] of Object.entries(expected)) {
    const map = Maps.get(id);
    assert.equal(map.family, id);
    assert.deepEqual([map.minPlayers, map.players, map.maxPlayers], [3,4,4]);
    assert.deepEqual(inventory(map.tiles), counts, id);
    assert.equal(map.tiles.filter((t) => t.frame).length, 2);
    assert.equal(map.tiles.filter((t) => t.number).length, numbered[id]);
    assert.ok(map.rules.every((rule) => rule.length === 2 && rule.every((s) => typeof s === "string" && s.length > 0)));
    checkPorts(geometry(map), map.ports);
  }
  assert.deepEqual(histogram(Maps.get("tribes").tiles.filter((t) => t.number).map((t) => t.number)), { 2:1,3:2,4:2,5:2,6:2,8:2,9:2,10:2,11:2,12:1 });
  assert.deepEqual(histogram([...Maps.get("cloth").tiles.map((t) => t.number).filter(Boolean), ...Maps.get("cloth").scenario.villages.map((v) => v.number)]), { 2:2,3:3,4:3,5:3,6:3,8:3,9:3,10:3,11:3,12:2 });
});

test("Tribe gift coordinates are distinct coast edges with the photographed 8/4/6 supply", () => {
  const map = Maps.get("tribes"), board = geometry(map), gifts = map.scenario.gifts;
  assert.deepEqual(histogram(gifts.map((g) => g.type)), { vp:8, development:4, harbor:6 });
  assert.equal(new Set(gifts.map((g) => resolveEdge(board, g))).size, 18);
  assert.equal(new Set(gifts.map((g) => g.id)).size, 18);
  for (const gift of gifts) {
    const e = resolveEdge(board, gift), t = tileAt(board, gift.at);
    assert.equal(e.tiles.filter((id) => board.tiles[id].resource >= -1).length, 1);
    assert.equal(t.number, 0); assert.equal(t.noSettlement, true); assert.equal(t.noProduction, true);
  }
  assert.deepEqual(gifts.filter((g) => g.type === "harbor").map((g) => g.resource).sort(), [-1,0,1,2,3,4]);
  assert.equal(map.tiles.filter((t) => t.setupAllowed).length, 18);
});

test("Cloth villages are intersection tokens, not producing hexes", () => {
  const map = Maps.get("cloth"), board = geometry(map), villages = map.scenario.villages;
  assert.equal(villages.length, 8);
  assert.equal(new Set(villages.map((v) => resolveVertex(board, v))).size, 8);
  assert.deepEqual(villages.map((v) => [v.at, v.corner, v.number]), [
    [[2,3],5,11], [[2,3],2,8], [[3,2],5,10], [[3,2],2,9],
    [[3,5],5,4], [[3,5],2,5], [[4,3],5,6], [[4,3],2,3],
  ]);
  for (const village of villages) {
    const t = tileAt(board, village.at);
    assert.equal(village.cloth, 5); assert.equal(t.number, 0);
    assert.equal(t.setupAllowed, false); assert.equal(t.noSettlement, true); assert.equal(t.robberAllowed, false);
  }
  assert.equal(villages.reduce((sum, v) => sum + v.cloth, map.scenario.clothReserve), 50);
  assert.equal(map.tiles.filter((t) => t.setupAllowed).length, 20);
  assert.equal(tileAt(board, map.robber).number, 12);
});

test("Pirates have a 14-hex closed clockwise sea patrol and four correctly anchored seat sets", () => {
  const map = Maps.get("pirates"), board = geometry(map), scenario = map.scenario;
  const route = scenario.piratePath.map((ref) => tileAt(board, ref));
  assert.equal(route.length, 14); assert.equal(new Set(route).size, 14);
  assert.deepEqual(scenario.piratePath[0], map.pirate);
  route.forEach((tile, i) => { assert.equal(tile.resource, -2); assert.ok(adjacent(tile, route[(i + 1) % route.length])); });
  const signedArea = route.reduce((sum, t, i) => { const n = route[(i + 1) % route.length]; return sum + (2*t.q+t.r)*n.r - (2*n.q+n.r)*t.r; }, 0);
  assert.ok(signedArea > 0, "Clockwise in screen coordinates");
  assert.deepEqual(scenario.pirateSeats.map((s) => s.color), ["red","blue","orange","white"]);
  for (const seat of scenario.pirateSeats) {
    const home = resolveVertex(board, seat.settlement), ship = resolveEdge(board, seat.ship);
    assert.ok([ship.a, ship.b].includes(home), `${seat.color} ship touches home`);
    assert.ok(board.vertices[home].tiles.some((id) => board.tiles[id].setupAllowed));
    for (const key of ["fortress", "outpost"]) {
      const vertex = resolveVertex(board, seat[key]);
      assert.ok(board.vertices[vertex].tiles.some((id) => board.tiles[id].resource >= 0));
      assert.ok(!board.vertices[vertex].tiles.some((id) => board.tiles[id].setupAllowed));
    }
  }
  assert.equal(map.robber, null); assert.ok(map.randomPolicy.portsOnly);
});

test("Wonders preserve 2 bridge sites, 5 wall sites, 4 warnings, and exact five-resource stage costs", () => {
  const map = Maps.get("wonders"), board = geometry(map), scenario = map.scenario;
  assert.equal(scenario.wonderSites.bridge.length, 2);
  assert.equal(scenario.wonderSites.wall.length, 5);
  assert.equal(scenario.warningSites.length, 4);
  assert.equal(new Set(scenario.setupExcluded.map((s) => resolveVertex(board, s))).size, 11);
  for (const ref of scenario.setupExcluded) assert.ok(board.vertices[resolveVertex(board, ref)].tiles.some((id) => board.tiles[id].setupAllowed));
  assert.deepEqual(scenario.wonderCards.map((c) => [c.id,c.cost]), [
    ["bridge",[3,0,1,1,0]], ["wall",[1,3,0,1,0]], ["theatre",[1,1,3,0,0]],
    ["library",[0,1,0,1,3]], ["colossus",[0,0,0,3,2]],
  ]);
  assert.ok(scenario.wonderCards.every((c) => c.stages === 4 && c.cost.reduce((a,b) => a+b, 0) === 5));
  assert.deepEqual(scenario.wonderCards.find((c) => c.id === "library").requirements, { cities:1, victoryPoints:6 });
  assert.deepEqual(scenario.wonderCards.find((c) => c.id === "colossus").requirements, { harbors:1, routeLength:5 });
  assert.equal(scenario.islandBonus, "each-settlement");
});

test("scenario randomizers preserve fixed areas, inventories and all regional number restrictions for 100 seeds", () => {
  for (const id of ["tribes","cloth","pirates","wonders"]) {
    const map = Maps.get(id), before = JSON.stringify(map), variants = new Set();
    const movable = new Set(map.randomPolicy.groups.flat().map((ref) => ref.join(":")));
    for (let seed = 0; seed < 100; seed++) {
      const board = geometry(map);
      randomize(map, board.tiles, board.edges, rngFor(seed), shuffle);
      assert.deepEqual(inventory(board.tiles), inventory(map.tiles));
      assert.deepEqual(histogram(board.tiles.map((t) => t.number)), histogram(map.tiles.map((t) => t.number)));
      for (const t of board.tiles) if (!movable.has(`${t.row}:${t.col}`)) {
        const original = map.tiles[t.id];
        assert.deepEqual([t.resource,t.number], [original.resource,original.number]);
      }
      for (const rule of map.randomPolicy.restrictedNumbers || []) for (const ref of rule.cells) assert.ok(!rule.forbidden.includes(tileAt(board, ref).number));
      variants.add(JSON.stringify(board.tiles.map((t) => [t.resource,t.number])));
      checkPorts(board, map.ports);
    }
    assert.equal(JSON.stringify(map), before, "Never mutate reusable definitions");
    assert.equal(id === "pirates" ? variants.size === 1 : variants.size > 90, true, id);
  }
});

test("New World has a reproducible generated default and freshly generated legal coasts/ports for 150 seeds", () => {
  const map = Maps.get("new-world"), baseline = JSON.stringify(map), variants = new Set();
  const fixed = Scenarios.generateWorld(rngFor(map.defaultSeed));
  assert.deepEqual(fixed.rows, map.rows); assert.deepEqual(fixed.ports, map.ports);
  assert.equal(map.defaultGenerated, true); assert.ok(map.defaultNote[1].includes("not an illustrated"));
  assert.equal(map.scenario.harborPlacement, "draft");
  assert.equal(map.scenario.harborDraftStartSeat, 0);
  assert.deepEqual(histogram(map.scenario.harborTypes), { "-1":5, 0:1,1:1,2:1,3:1,4:1 });
  for (let seed = 0; seed < 150; seed++) {
    const board = geometry(map), result = randomize(map, board.tiles, board.edges, rngFor(seed), shuffle);
    assert.deepEqual(inventory(board.tiles), [5,4,5,5,4,0,0,19]);
    assert.deepEqual(histogram(board.tiles.map((t) => t.number)), histogram(map.tiles.map((t) => t.number)));
    assert.equal(result.ports.length, 10);
    assert.deepEqual(histogram(result.ports.map((p) => p[3])), { "-1":5, 0:1,1:1,2:1,3:1,4:1 });
    checkPorts(board, result.ports);
    for (const edge of board.edges) assert.ok(!(edge.tiles.length === 2 && edge.tiles.every((id) => [6,8].includes(board.tiles[id].number))));
    for (const t of board.tiles) assert.equal(t.setupAllowed, t.resource >= 0);
    variants.add(JSON.stringify(board.tiles.map((t) => [t.resource,t.number])));
  }
  assert.equal(variants.size, 150); assert.equal(JSON.stringify(map), baseline);
});

test("browser and Node registry exports agree after loading scenario data before maps", () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(require.resolve("./catan-scenario-maps"), "utf8"), sandbox);
  vm.runInContext(fs.readFileSync(require.resolve("./catan-maps"), "utf8"), sandbox);
  assert.equal(sandbox.CatanMaps.maps.length, 13);
  assert.equal(JSON.stringify(sandbox.CatanMaps.maps), JSON.stringify(Maps.maps));
});

test("shared rules state standard development inventory without hiding Pirate Islands exceptions", () => {
  const english = Maps.rules.map((pair) => pair[1]).join(" ");
  assert.match(english, /5 settlements, 4 cities, 15 roads and 15 ships/);
  assert.match(english, /25-card.*14 Knights, 5 Victory Points, 2 Road Building, 2 Year of Plenty and 2 Monopoly/);
  assert.match(english, /remove the 5 VP cards with three players; treat them as Knights with four/);
});
