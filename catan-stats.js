"use strict";

const { randomUUID } = require("node:crypto");

function point(g, turn, player, part, score) {
  return { turn, player, part, scores: g.players.map(p => score(g, p.id, true)) };
}

function create(g, score) {
  return {
    id: randomUUID(), version: 2,
    history: [point(g, 0, null, null, score)],
    dice: Array(11).fill(0),
    players: g.players.map(p => ({
      production: Array(5).fill(0), gold: Array(5).fill(0),
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

function record(g, before, id, action, score) {
  const stats = g.statistics;
  if (!stats) return;
  if (action.type === "roll") stats.dice[g.dice[0] + g.dice[1] - 2]++;
  if (Object.hasOwn(stats.players[id].built, action.type)) stats.players[id].built[action.type]++;
  // End-turn actions belong to the turn just completed, not the next player's turn.
  const next = point(g, before.turn, before.turn ? before.current : null, before.part, score);
  if (stats.history.at(-1).turn === before.turn) stats.history[stats.history.length - 1] = next;
  else stats.history.push(next);
}

function publicStatistics(g) {
  return g.phase === "over" && g.statistics ? structuredClone(g.statistics) : null;
}

module.exports = { create, received, robbed, record, publicStatistics };
