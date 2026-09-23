"use strict";
const { spawn } = require("node:child_process");
const { Worker } = require("node:worker_threads");
const path = require("node:path");
const E = require("./duel-engine"), { prepare } = require("./engine-setup");
const THINK_MS = Object.freeze({ easy: 200, normal: 1000, hard: 3000 });
const warned = new Set();

function uciFen(fen) {
  const fields = fen.split(" ");
  if (fields[1] === "r") fields[1] = "w";
  return fields.join(" ");
}
function positionCommand(game) {
  // Keep repetition history for native search; custom test/analysis positions use FEN.
  const chess = new E.Xiangqi(), moves = [];
  for (const move of game.moves) {
    const from = E.square(move.from), to = E.square(move.to);
    if (!chess.move({ from, to })) return `position fen ${uciFen(game.fen)}`;
    moves.push(from + to);
  }
  if (chess.fen() !== game.fen) return `position fen ${uciFen(game.fen)}`;
  return `position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`;
}
function gomokuPosition(game) {
  const occupied = game.board.flatMap((side, i) => side < 0 ? [] : [i]);
  const history = game.moves.map(move => move.to);
  const complete = history.length === occupied.length && new Set(history).size === occupied.length
    && game.moves.every(move => game.board[move.to] === move.side);
  const order = complete ? history : occupied;
  const rows = order.map(i => `${i % 15},${Math.floor(i / 15)},${game.board[i] === game.current ? 1 : 2}`);
  // Rapfi reconstructs side-to-move from the sequence, not just the SELF/OPPO labels.
  // Synthetic analysis positions may need an opponent pass; live games never do.
  if (order.length && game.board[order.at(-1)] === game.current) rows.push("-1,-1,2");
  return rows.join("\n");
}
function startSearch(input, level = "hard", options = {}) {
  const game = structuredClone(input), budget = THINK_MS[level] || THINK_MS.hard;
  const started = Date.now(), legal = new Map(game.legal.map(m => [`${m.from ?? ""}:${m.to}`, m]));
  let cancelled = false, stopCurrent = () => {};
  const valid = move => legal.get(`${move?.from ?? ""}:${move?.to}`);

  function native() {
    return new Promise((resolve, reject) => {
      let info;
      try { info = prepare(game.type === "gomoku" ? "rapfi" : "pikafish"); }
      catch (error) { reject(error); return; }
      const child = spawn(info.executable, [], { cwd: info.dir, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      let buffer = "", stderr = "", result = null, error = null, ending = false, closed = false;
      let depth = 0, nodes = 0, timer, killTimer;
      const write = text => { if (!child.stdin.destroyed) child.stdin.write(text + "\n"); };
      const finish = (move, failure) => {
        if (ending) return;
        ending = true; clearTimeout(timer);
        if (move) result = { move, engine: info.name, depth, nodes, elapsed: Date.now() - started, fallback: false };
        error = failure;
        write(info.name === "rapfi" ? "END" : "quit");
        killTimer = setTimeout(() => child.kill("SIGKILL"), 300);
      };
      stopCurrent = () => { if (!closed) { finish(null); child.kill("SIGKILL"); } };
      const searchTimer = () => { clearTimeout(timer); timer = setTimeout(() => finish(null, Error(`${info.name} search timed out`)), budget + 2500); };
      timer = setTimeout(() => finish(null, Error(`${info.name} startup timed out`)), 10000);
      const line = text => {
        if (ending) return;
        if (info.name === "rapfi") {
          if (text === "OK") {
            searchTimer();
            const board = gomokuPosition(game);
            write(`INFO rule 0\nINFO timeout_turn ${budget}\nINFO time_left 100000000\nINFO max_memory 16777216\nINFO thread_num 1\nBOARD\n${board ? board + "\n" : ""}DONE`);
          }
          const stats = text.match(/^MESSAGE depth (\d+).*?\bn ([\d.]+)([KM]?)/i);
          if (stats) { depth = Number(stats[1]); nodes = Number(stats[2]) * ({ K: 1000, M: 1000000 }[stats[3].toUpperCase()] || 1); }
          const coordinate = text.match(/^(\d+),(\d+)$/);
          if (coordinate) {
            const x = Number(coordinate[1]), y = Number(coordinate[2]);
            const move = x < 15 && y < 15 && valid({ to: y * 15 + x });
            finish(move, move ? null : Error("Rapfi returned an illegal move"));
          }
          if (/^ERROR/.test(text)) finish(null, Error(text));
        } else {
          if (text === "uciok") write("setoption name Threads value 1\nsetoption name Hash value 16\nisready");
          if (text === "readyok") { searchTimer(); write(`${positionCommand(game)}\ngo movetime ${budget}`); }
          const stats = text.match(/^info depth (\d+).*?\bnodes (\d+)/);
          if (stats) { depth = Number(stats[1]); nodes = Number(stats[2]); }
          const best = text.match(/^bestmove ([a-i][0-9])([a-i][0-9])/);
          if (best) {
            const move = valid({ from: E.index(best[1]), to: E.index(best[2]) });
            finish(move, move ? null : Error("Pikafish returned an illegal move"));
          } else if (/^bestmove /.test(text)) finish(null, Error("Pikafish returned no move"));
        }
      };
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", chunk => {
        buffer += chunk;
        if (buffer.length > 262144) { finish(null, Error("Engine output overflow")); buffer = ""; return; }
        let i;
        while ((i = buffer.indexOf("\n")) >= 0) { const text = buffer.slice(0, i).trim(); buffer = buffer.slice(i + 1); line(text); }
      });
      child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2048); });
      child.stdin.on("error", failure => { if (!ending) finish(null, failure); });
      child.on("error", failure => { error = failure; });
      child.on("close", (code, signal) => {
        closed = true; clearTimeout(timer); clearTimeout(killTimer);
        if (cancelled) resolve(null);
        else if (result) resolve(result);
        else reject(error || Error(`${info.name} exited (${code ?? signal}): ${stderr}`));
      });
      if (cancelled) stopCurrent();
      else write(info.name === "rapfi" ? "START 15" : "uci");
    });
  }
  function fallback(reason) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, "duel-ai.js"), { workerData: { game, level } });
      let move = null, depth = 0, timer, failure;
      stopCurrent = () => { clearTimeout(timer); worker.terminate(); };
      worker.on("message", data => { if (valid(data.move)) { move = valid(data.move); depth = data.depth; } });
      worker.on("error", error => { failure = error; });
      worker.on("exit", () => {
        clearTimeout(timer);
        if (cancelled) resolve(null);
        else if (move) resolve({ move, engine: "javascript", depth, elapsed: Date.now() - started, fallback: true, reason });
        else reject(failure || Error("Fallback AI returned no legal move"));
      });
      timer = setTimeout(stopCurrent, { easy: 500, normal: 1200, hard: 2200 }[level] || 2200);
      if (cancelled) stopCurrent();
    });
  }
  const done = (async () => {
    if (game.phase !== "playing" || !legal.size) return null;
    if (options.native === false) return fallback("explicit fallback");
    try { return await native(); }
    catch (error) {
      if (cancelled) return null;
      if (options.requireNative) throw error;
      if (!warned.has(game.type)) { warned.add(game.type); console.error(`Duel ${game.type}: native engine failed; using emergency JavaScript AI. ${error.message}`); }
      return fallback(error.message);
    }
  })();
  return { done, cancel() { cancelled = true; stopCurrent(); } };
}
module.exports = { startSearch, positionCommand, gomokuPosition, THINK_MS };
