"use strict";

const { randomUUID } = require("node:crypto");

function point(g, turn, player, part, score) {
  return { turn, player, part, scores: g.players.map(p => score(g, p.id, true)) };
}

function create(g, score) {
  return {
    id: randomUUID(), version: 3,
    history: [point(g, 0, null, null, score)],
    dice: Array(11).fill(0),
    diceRandom: Array(11).fill(0), diceAlchemy: Array(11).fill(0), diceUnknown: Array(11).fill(0),
    players: g.players.map(p => ({
      production: Array(g.cities ? 8 : 5).fill(0), gold: Array(g.cities ? 8 : 5).fill(0),
      robbed: { theft: 0, raid: 0 },
      built: {
        settlement: g.board.vertices.filter(v => v.owner === p.id && v.level === 1).length,
        city: g.board.vertices.filter(v => v.owner === p.id && v.level === 2).length,
        road: g.board.edges.filter(e => e.owner === p.id && e.kind !== "ship").length,
        ship: g.board.edges.filter(e => e.owner === p.id && e.kind === "ship").length,
      },
    })),
  };
}

function received(g, player, resource, amount, source) {
  if (g.turn > 0 && amount > 0 && (source === "production" || source === "gold")) {
    const counters = g.statistics?.players[player];
    if (counters) counters[source][resource] += amount;
  }
}
function robbed(g, player, source) {
  const counters = g.statistics?.players[player]?.robbed;
  if (counters && (source === "theft" || source === "raid")) counters[source]++;
}

function ensureDiceSources(stats, usesAlchemy) {
  const valid = values => Array.isArray(values) && values.length === 11 && Array.from(values).every(n => Number.isSafeInteger(n) && n >= 0);
  const complete = [stats.diceRandom, stats.diceAlchemy, stats.diceUnknown].every(valid)
    && stats.dice.every((n, i) => stats.diceRandom[i] + stats.diceAlchemy[i] + stats.diceUnknown[i] === n);
  if (!complete) {
    // Older Cities histories did not record whether Alchemy chose the dice. Never
    // invent random throws by subtracting incomplete or contradictory source counts.
    stats.diceRandom = usesAlchemy ? Array(11).fill(0) : [...stats.dice];
    stats.diceAlchemy = Array(11).fill(0);
    stats.diceUnknown = usesAlchemy ? [...stats.dice] : Array(11).fill(0);
  }
  stats.version = 3;
  return stats;
}

function record(g, before, id, action, score) {
  const stats = g.statistics;
  if (!stats) return;
  ensureDiceSources(stats, Boolean(g.cities));
  if (action.type === "roll") {
    const index = g.dice[0] + g.dice[1] - 2;
    stats.dice[index]++;
    (before.alchemy ? stats.diceAlchemy : stats.diceRandom)[index]++;
  }
  const build = g.cities && action.type === "settlement" && !before.turn && g.board.vertices[action.vertex]?.level === 2 ? "city" : action.type;
  if (Object.hasOwn(stats.players[id].built, build)) stats.players[id].built[build]++;
  // End-turn actions belong to the turn just completed, not the next player's turn.
  const next = point(g, before.turn, before.turn ? before.current : null, before.part, score);
  if (stats.history.at(-1).turn === before.turn) stats.history[stats.history.length - 1] = next;
  else stats.history.push(next);
}

function publicStatistics(g) {
  return g.phase === "over" && g.statistics ? ensureDiceSources(structuredClone(g.statistics), Boolean(g.cities)) : null;
}

module.exports = { create, received, robbed, record, publicStatistics, ensureDiceSources };
