"use strict";
const { Xiangqi } = require("./vendor/xiangqi.cjs");
const Gomoku = require("./gomoku-adapter");
const TYPES = ["gomoku", "xiangqi"], LEVELS = ["easy", "normal", "hard"];
const requireRule = (ok, message) => { if (!ok) throw Error(message); };
const sideOf = (color) => color === "r" ? 0 : 1;
const square = (i) => "abcdefghi"[i % 9] + (9 - Math.floor(i / 9));
const index = (s) => (9 - Number(s[1])) * 9 + "abcdefghi".indexOf(s[0]);
function createGame(type) {
  requireRule(TYPES.includes(type), "未知游戏 / Unknown game");
  return { type, board: type === "gomoku" ? Array(225).fill(-1) : null, chess: type === "xiangqi" ? new Xiangqi() : null,
    current: 0, phase: "playing", winner: -1, reason: "", moves: [], revision: 0, positions: [] };
}
function legal(g) {
  if (g.phase !== "playing") return [];
  return g.chess ? g.chess.moves({ verbose: true }).map((m) => ({ from: index(m.from), to: index(m.to) }))
    : g.board.flatMap((v, to) => v < 0 ? [{ to }] : []);
}
function finish(g, winner, reason) { g.phase = "over"; g.winner = winner; g.reason = reason; }
function move(g, id, a) {
  requireRule(g.phase === "playing" && id === g.current, "还没轮到你 / Not your turn");
  requireRule(Number.isInteger(a.to), "落点无效 / Invalid destination");
  let record;
  if (g.chess) {
    requireRule(Number.isInteger(a.from) && a.from >= 0 && a.from < 90 && a.to >= 0 && a.to < 90, "落点无效 / Invalid square");
    const m = g.chess.move({ from: square(a.from), to: square(a.to) });
    requireRule(m, "不能这样走 / Illegal move");
    record = { from: a.from, to: a.to, side: id, piece: m.piece.toLowerCase(), captured: m.captured?.toLowerCase() || null, check: g.chess.in_check(), text: `${m.from} → ${m.to}` };
    g.current = sideOf(g.chess.turn());
    g.positions.push({ key: g.chess.fen().split(" ").slice(0, 2).join(" "), side: id, check: record.check });
    if (!g.chess.moves().length) finish(g, id, record.check ? "将死 / Checkmate" : "困毙 / Stalemate loss");
    else if (g.chess.in_threefold_repetition()) {
      const key = g.positions.at(-1).key, repeats = g.positions.map((p, i) => p.key === key ? i : -1).filter((i) => i >= 0);
      const cycle = g.positions.slice(repeats.length >= 3 ? repeats.at(-3) + 1 : 0);
      const checkers = [0, 1].filter((side) => { const turns = cycle.filter((p) => p.side === side); return turns.length >= 2 && turns.every((p) => p.check); });
      if (checkers.length === 1) finish(g, 1 - checkers[0], "长将判负 / Perpetual check loses");
      else finish(g, -1, "三次重复 / Threefold repetition");
    } else if (g.chess.in_draw()) finish(g, -1, "和棋 / Draw");
  } else {
    requireRule(a.to >= 0 && a.to < 225 && g.board[a.to] === -1, "这里已有棋子 / Illegal intersection");
    g.board[a.to] = id;
    record = { to: a.to, side: id, text: `${"ABCDEFGHIJKLMNO"[a.to % 15]}${15 - Math.floor(a.to / 15)}` };
    if (Gomoku.win(Gomoku.bitboards(g.board)[id], a.to)) finish(g, id, "五子连珠 / Five in a row");
    else if (g.board.every((v) => v >= 0)) finish(g, -1, "棋盘已满 / Board full");
    g.current = 1 - id;
  }
  g.moves.push(record); g.revision++;
  return record;
}
function resign(g, id) { requireRule(g.phase === "playing", "本局已结束 / Game over"); finish(g, 1 - id, "认输 / Resignation"); g.revision++; }
function undo(g, steps) {
  requireRule(g.phase === "playing" && steps > 0 && steps <= g.moves.length, "不能悔棋 / Cannot undo");
  for (let n = 0; n < steps; n++) {
    const m = g.moves.pop(); if (g.chess) { g.chess.undo(); g.positions.pop(); } else g.board[m.to] = -1;
    g.current = m.side;
  }
  g.revision++;
}
function snapshot(g) {
  return { type: g.type, board: g.chess ? g.chess.board().flat().map((p) => p ? { side: sideOf(p.color), type: p.type } : null) : g.board,
    current: g.current, phase: g.phase, winner: g.winner, reason: g.reason, moves: g.moves, revision: g.revision,
    check: Boolean(g.chess?.in_check()), legal: legal(g), fen: g.chess?.fen() };
}
module.exports = { TYPES, LEVELS, Xiangqi, createGame, move, resign, undo, snapshot, legal, square, index, requireRule };
