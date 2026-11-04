"use strict";
(function (root, factory) {
if (typeof module === "object" && module.exports) {
const fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
// Keep the pinned upstream worker intact; expose its pure rules/search functions.
const context = vm.createContext({ self: { addEventListener() {}, postMessage() {} }, console });
vm.runInContext(fs.readFileSync(path.join(__dirname, "vendor/gomoku.js"), "utf8"), context);
module.exports = factory(context);
} else root.GomokuRules = factory(root);
})(typeof globalThis !== "undefined" ? globalThis : this, function (context) {
function bitboards(board) {
  const bits = [Array(8).fill(0), Array(8).fill(0)];
  board.forEach((side, i) => { if (side >= 0) bits[side][i >>> 5] |= 1 << (i % 32); });
  return bits;
}
return { bitboards, win: context.checkWinCondition, threats: context.checkImmediateThreat,
  candidates: context.generateCandidateMoves, search: context.minimaxAlphaBeta, evaluate: context.evaluatePosition };
});
