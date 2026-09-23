"use strict";
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const E = require("./duel-engine"), { startSearch } = require("./duel-bot");

// A small regression match, not an Elo estimate: alternate colors from the normal opening.
(async () => {
  const report = { date: new Date().toISOString(), nativeLevel: "easy (200 ms)", previousLevel: "normal", games: [] };
  for (const type of E.TYPES) for (const nativeSide of [0, 1]) {
    const game = E.createGame(type), moves = [], started = Date.now();
    while (game.phase === "playing" && moves.length < 160) {
      const isNative = game.current === nativeSide;
      const result = await startSearch(E.snapshot(game), isNative ? "easy" : "normal", isNative ? { requireNative: true } : { native: false }).done;
      assert.ok(result?.move);
      moves.push({ side: game.current, ...result });
      E.move(game, game.current, result.move);
      if (moves.length % 20 === 0) console.log(`${type}, native side ${nativeSide}: ${moves.length} plies`);
    }
    const result = { type, nativeSide, winner: game.winner, phase: game.phase, reason: game.reason, elapsed: Date.now() - started, plies: moves.length, moves };
    report.games.push(result);
    console.log(JSON.stringify({ ...result, moves: undefined }));
  }
  fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "test-results", "duel-ai-benchmark.json"), JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
