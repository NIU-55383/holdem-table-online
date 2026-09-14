"use strict";
const { parentPort, workerData } = require("node:worker_threads");
const E = require("./duel-engine");
const G = require("./gomoku-adapter");
const { game, level } = workerData;
const send = (move, depth) => parentPort.postMessage({ move, depth });
if (game.type === "gomoku") {
  const [black, white] = G.bitboards(game.board), us = game.current === 0 ? "black" : "white", them = game.current === 0 ? "white" : "black";
  const forced = G.threats(black, white, us)[0] || G.threats(black, white, them)[0];
  if (forced) send({ to: forced.row * 15 + forced.col }, 1);
  else {
    const candidates = G.candidates(black, white);
    if (!game.moves.length) send({ to: 112 }, 1);
    else if (candidates.length) {
      send({ to: candidates[0].row * 15 + candidates[0].col }, 0);
      const maxDepth = { easy: 1, normal: 3, hard: 5 }[level];
      for (let depth = 1; depth <= maxDepth; depth++) {
        const result = G.search(black, white, depth, -Infinity, Infinity, true, us, them);
        if (result.move) send({ to: result.move.row * 15 + result.move.col }, depth);
        if (Math.abs(result.score) > 90000) break;
      }
    }
  }
} else {
  const chess = new E.Xiangqi(game.fen), values = { k: 100000, r: 900, c: 450, n: 410, b: 200, a: 200, p: 100 };
  const budget = { easy: 180, normal: 650, hard: 1500 }[level], deadline = Date.now() + budget;
  let nodes = 0;
  function evaluate() {
    let value = 0;
    chess.board().forEach((row, y) => row.forEach((p, x) => {
      if (!p) return;
      const advance = p.color === "r" ? 9 - y : y, center = 4 - Math.abs(4 - x);
      let bonus = p.type === "p" ? advance * 7 + (advance >= 5 ? 65 + center * 7 : 0) : ["n", "c", "r"].includes(p.type) ? center * 5 + Math.min(advance, 6) * 3 : 0;
      value += (p.color === chess.turn() ? 1 : -1) * (values[p.type] + bonus);
    }));
    return value;
  }
  function ordered(moves) { const weight = (m) => (values[m.captured?.toLowerCase()] || 0) * 10 - values[m.piece.toLowerCase()]; return moves.sort((a,b) => weight(b) - weight(a)); }
  function search(depth, alpha, beta, ply, quiet = 2) {
    if ((++nodes & 31) === 0 && Date.now() > deadline) throw Error("budget");
    const moves = ordered(chess.moves({ verbose: true }));
    if (!moves.length) return -1000000 + ply;
    if (depth <= 0) {
      const stand = evaluate();
      if (!quiet) return stand;
      if (!chess.in_check()) { if (stand >= beta) return stand; alpha = Math.max(alpha, stand); }
      const forcing = chess.in_check() ? moves : moves.filter((m) => m.captured);
      for (const m of forcing) { chess.move(m); let score; try { score = -search(0, -beta, -alpha, ply + 1, quiet - 1); } finally { chess.undo(); } if (score >= beta) return score; alpha = Math.max(alpha, score); }
      return alpha;
    }
    for (const m of moves) {
      chess.move(m); let score; try { score = -search(depth - 1, -beta, -alpha, ply + 1); } finally { chess.undo(); }
      if (score >= beta) return score; alpha = Math.max(alpha, score);
    }
    return alpha;
  }
  let moves = ordered(chess.moves({ verbose: true })), best = moves[0];
  if (best) send({ from: E.index(best.from), to: E.index(best.to) }, 0);
  for (let depth = 1; depth <= { easy: 1, normal: 2, hard: 5 }[level]; depth++) {
    let alpha = -Infinity, found = best;
    try {
      for (const m of moves) {
        chess.move(m); let score; try { score = -search(depth - 1, -Infinity, -alpha, 1, level === "easy" ? 0 : 2); } finally { chess.undo(); }
        if (score > alpha) { alpha = score; found = m; }
      }
      best = found; send({ from: E.index(best.from), to: E.index(best.to) }, depth);
      moves = [best, ...moves.filter((m) => m !== best)];
      if (alpha > 900000) break;
    } catch (error) { if (error.message !== "budget") throw error; break; }
  }
}
