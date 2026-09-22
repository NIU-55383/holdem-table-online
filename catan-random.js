"use strict";

// Scenario pools are explicit; only New Shores and New World move sea tiles.
module.exports = function randomize(map, tiles, edges, rng, shuffle) {
  const policy = map.randomPolicy;
  if (policy?.portsOnly) return;
  if (policy?.regenerateWorld) {
    const world = require("./catan-scenario-maps").generateWorld(rng);
    const terrain = { t: 0, b: 1, w: 2, h: 3, o: 4, s: -2, F: -2 };
    for (const t of tiles) {
      const cell = world.rows[t.row].split(" ")[t.col];
      t.resource = terrain[cell[0]];
      t.number = Number(cell.slice(1)) || 0;
      t.setupAllowed = t.resource >= 0;
      t.noProduction = false;
      t.noSettlement = false;
      t.robberAllowed = t.resource >= 0;
    }
    return { ports: world.ports };
  }
  if (!policy?.groups?.length) throw new Error("Missing random map policy");
  const groups = policy.groups.map((cells) => {
    const members = cells.map(([row, col]) => tiles.find((t) => t.row === row && t.col === col));
    if (members.some((t) => !t || t.frame || t.resource === -3)) throw new Error("Invalid random map region");
    return { members, terrain: members.map((t) => t.resource), numbers: members.filter((t) => t.number).map((t) => t.number) };
  });
  for (let attempt = 0; attempt < 10000; attempt++) {
    for (const group of groups) {
      const terrain = shuffle(group.terrain, rng), numbers = shuffle(group.numbers, rng);
      let i = 0;
      group.members.forEach((t, index) => { t.resource = terrain[index]; t.number = t.resource >= 0 ? numbers[i++] : 0; });
      if (i !== numbers.length) throw new Error("Terrain/token count mismatch");
    }
    if (policy.productivePastures && tiles.some((t) => [0,2].includes(t.resource) && [2,3,11,12].includes(t.number))) continue;
    if (policy.goldNoRed && tiles.some((t) => t.resource === 5 && [6,8].includes(t.number))) continue;
    if (policy.redSeparated && edges.some((e) => e.tiles.length === 2 && e.tiles.every((id) => [6,8].includes(tiles[id].number)))) continue;
    if (policy.restrictedNumbers?.some((rule) => rule.cells.some(([row, col]) => rule.forbidden.includes(tiles.find((t) => t.row === row && t.col === col)?.number)))) continue;
    return;
  }
  throw new Error("Unable to generate a legal random map; please retry");
};
