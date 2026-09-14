"use strict";
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
// Keep the pinned upstream worker intact; expose its pure rules/search functions.
const context = vm.createContext({ self: { addEventListener() {}, postMessage() {} }, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, "vendor/gomoku.js"), "utf8"), context);
function bitboards(board) {
  const bits = [Array(8).fill(0), Array(8).fill(0)];
  board.forEach((side, i) => { if (side >= 0) bits[side][i >>> 5] |= 1 << (i % 32); });
  return bits;
}
module.exports = { bitboards, win: context.checkWinCondition, threats: context.checkImmediateThreat,
  candidates: context.generateCandidateMoves, search: context.minimaxAlphaBeta, evaluate: context.evaluatePosition };
