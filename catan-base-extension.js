"use strict";

// CATAN 5-6 Player Expansion: 2025 rulebook, variable setup and paired turns.
const ROWS = [3, 4, 5, 6, 5, 4, 3];
const START_Q = [1, 0, -1, -2, -2, -2, -2];
const NUMBERS = [2, 5, 4, 6, 3, 9, 8, 11, 11, 10, 6, 3, 8, 4, 8, 10, 11, 12, 10, 5, 4, 9, 5, 9, 12, 3, 2, 6];
const TERRAIN = [6, 5, 6, 6, 5].flatMap((count, resource) => Array(count).fill(resource)).concat([-1, -1]);
const COORDINATES = ROWS.flatMap((length, row) => Array.from({ length }, (_, col) => ({ q: START_Q[row] + col, r: row - 3 })));
// Counterclockwise spiral, beginning at the upper-right corner; skip deserts.
const SPIRAL = [2, 1, 0, 3, 7, 12, 18, 23, 27, 28, 29, 26, 22, 17, 11, 6, 5, 4, 8, 13, 19, 24, 25, 21, 16, 10, 9, 14, 20, 15];

function finishBoard(tiles, edges, vertices, rng, shuffle) {
  let index = 0;
  for (const id of SPIRAL) if (tiles[id].resource >= 0) tiles[id].number = NUMBERS[index++];
  const xs = vertices.map(v => v.x), ys = vertices.map(v => v.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const coast = edges.filter(e => e.tiles.length === 1).sort((a, b) => {
    const angle = e => Math.atan2((vertices[e.a].y + vertices[e.b].y) / 2 - cy, (vertices[e.a].x + vertices[e.b].x) / 2 - cx);
    return angle(a) - angle(b);
  });
  // 38 coast edges: eleven separated harbors, including the extra wool and 3:1.
  const ports = shuffle([-1, -1, -1, -1, -1, 0, 1, 2, 2, 3, 4], rng).map((resource, i) => {
    const e = coast[Math.floor(i * coast.length / 11)];
    return { resource, vertices: [e.a, e.b], edge: e.id, land: e.tiles[0] };
  });
  return { tiles, vertices, edges, ports, robber: tiles.find(t => t.resource === -1).id,
    extension: "5-6", bounds: [Math.min(...xs) - 66, Math.min(...ys) - 66, Math.max(...xs) - Math.min(...xs) + 132, Math.max(...ys) - Math.min(...ys) + 132] };
}

module.exports = { COORDINATES, TERRAIN, NUMBERS, SPIRAL, finishBoard };
