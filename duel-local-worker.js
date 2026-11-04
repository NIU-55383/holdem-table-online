"use strict";
// Reuse the pinned engines in isolation; the upstream AI worker stays unchanged.
importScripts("vendor/gomoku.js", "vendor/xiangqi.cjs", "gomoku-adapter.js");
self.Xiangqi = Xiangqi;
importScripts("duel-engine.js");
let game;
self.addEventListener("message", ({ data }) => {
  if (data.type !== "LOCAL_GAME") return;
  try {
    const a = data.action, E = self.DuelEngine;
    if (a.type === "start") {
      const next = E.createGame(a.kind);
      for (const m of a.progress?.moves || []) E.move(next, m.side, m);
      if (a.progress?.phase === "over") { next.phase = "over"; next.winner = a.progress.winner; next.reason = a.progress.reason; }
      next.revision = Math.max(next.revision, a.progress?.revision || 0); game = next;
    } else {
      if (!game || a.revision !== game.revision) throw Error("局面已变化 / Position changed");
      if (a.type === "move") E.move(game, game.current, a);
      else if (a.type === "undo") E.undo(game, 1);
      else if (a.type === "resign") E.resign(game, game.current);
      else if (a.type === "draw") { game.phase = "over"; game.winner = -1; game.reason = "双方同意 / By agreement"; game.revision++; }
      else throw Error("未知操作 / Unknown action");
    }
    self.postMessage({ type: "LOCAL_STATE", game: E.snapshot(game) });
  } catch (error) { self.postMessage({ type: "LOCAL_ERROR", message: error.message }); }
});
