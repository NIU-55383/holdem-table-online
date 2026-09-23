"use strict";
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const { startSearch } = require("./duel-bot");
const E = require("./duel-engine"), Avatar = require("./avatar-data");
const ensure = E.requireRule;
const Social = require("./game-social");
function attachDuel(server) {
  const rooms = new Map(), sessions = new Map(), wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  let running = 0, closed = false;
  const queue = [];
  const control = require("./room-control").createRoomControl({ rooms,
    active: (r) => r.game?.phase === "playing", started: (r) => Boolean(r.game),
    turnKey: (r) => r.game && `${r.game.revision}:${r.game.current}`, actors: (r) => [r.game.current],
    stop, changed: (r) => { broadcast(r); schedule(r); },
    remove: (r, p) => { const s = sessions.get(p.token); if (s) s.room = ""; send(p.ws, { type: "left", reason: "房主已将你移出房间 / Removed by the host" }); }
  });
  const clean = (s, n = 18) => String(s || "").trim().replace(/\s+/g, " ").slice(0, n);
  function botName(exclude) {
    const familiar = ["Connie","Colin","Angela","Stephan","Zoey","William","Tim","Gary","Alison"];
    const common = ["Alex","Emma","James","Olivia","Daniel","David","Sophia","Emily","Michael","Sarah","Ryan","Anna","Chris","Laura"];
    const pool = (crypto.randomInt(10) < 4 ? familiar : common).filter((name) => name !== exclude);
    return pool[crypto.randomInt(pool.length)];
  }
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  function connected(p) { return p && (p.bot || p.ws?.readyState === WebSocket.OPEN); }
  function snapshot(room, token) {
    return { type: "state", code: room.code, kind: room.kind, difficulty: room.difficulty, you: room.seats.findIndex((p) => p?.token === token),
      host: room.seats.findIndex((p) => p?.token === room.host), seats: room.seats.map((p) => p ? { socialId: Social.publicId(p), name: p.name, avatar: p.avatar, bot: p.bot, vacant: Boolean(p.vacant), auto: Boolean(p.auto), connected: Boolean(connected(p)), ready: p.ready, departed: Boolean(p.departed) } : null),
      game: room.game ? E.snapshot(room.game) : null, control: control.snapshot(room, room.seats.find((p) => p?.token === token)), pending: room.pending, chat: room.chat, thinking: Boolean(room.job) };
  }
  function broadcast(room) {
    control.sync(room);
    room.updated = Date.now();
    room.seats.forEach((p) => { if (p && !p.bot) send(p.ws, snapshot(room, p.token)); });
  }
  function stop(room) {
    if (room.job) { room.job.cancelled = true; room.job.cancel?.(); room.job = null; }
  }
  function pump() {
    if (closed) return;
    // One native search at a time keeps CPU and NNUE memory bounded across rooms.
    while (running < 1 && queue.length) {
      const job = queue.shift(); if (job.cancelled) continue;
      running++;
      const { room, game, revision } = job, search = startSearch(E.snapshot(game), room.difficulty);
      let done = false, settled = false, result, settle;
      const started = Date.now();
      const complete = () => {
        if (done) return; done = true; clearTimeout(settle); running--;
        if (!job.cancelled && room.job === job && !control.paused(room) && room.game === game && game.revision === revision && game.phase === "playing") {
          room.job = null;
          try { if (result?.move) E.move(game, game.current, result.move); }
          catch (error) { console.error("Duel AI:", error.message); result = null; }
          if (!result?.move) {
            room.seats.forEach(p => { if (p && !p.bot) send(p.ws, { type: "error", message: "AI 暂时无法落子，请重新开局 / AI unavailable; please restart the game" }); });
            broadcast(room); pump(); return;
          }
          room.pending = null; broadcast(room); schedule(room);
        }
        pump();
      };
      job.cancel = () => { search.cancel(); if (settled) complete(); };
      search.done.then(value => { result = value; }, error => { console.error("Duel AI:", error.message); }).finally(() => {
        settled = true;
        if (job.cancelled) complete();
        else settle = setTimeout(complete, Math.max(0, 550 - (Date.now() - started)));
      });
    }
  }
  function schedule(room) {
    if (control.paused(room) || room.job || room.game?.phase !== "playing" || !(room.seats[room.game.current]?.bot || room.seats[room.game.current]?.auto) || !room.seats.some((p) => p && !p.bot && connected(p))) return;
    const job = { room, game: room.game, revision: room.game.revision, cancelled: false };
    room.job = job; queue.push(job); broadcast(room); pump();
  }
  function start(room) {
    stop(room); room.game = E.createGame(room.kind); room.pending = null;
    broadcast(room); schedule(room);
  }
  function detach(session, explicit) {
    const room = rooms.get(session.room); if (!room) return;
    const id = room.seats.findIndex((p) => p?.token === session.token), seat = room.seats[id]; if (!seat) return;
    seat.ws = null; room.pending = null;
    control.elect(room);
    if (explicit) {
      if (room.game?.phase === "playing" && !control.paused(room)) { stop(room); E.resign(room.game, id); }
      if (!room.game) room.seats[id] = null; else seat.departed = true;
      session.room = "";
    }
    if (!room.seats.some((p) => p && !p.bot && connected(p))) stop(room);
    if (!room.seats.some((p) => p && !p.bot && !p.departed)) { stop(room); rooms.delete(room.code); }
    else broadcast(room);
  }
  function makeCode(kind) { let code; do { code = (kind === "gomoku" ? "G" : "X") + crypto.randomBytes(3).toString("hex").slice(0,5).toUpperCase(); } while (rooms.has(code)); return code; }
  wss.on("connection", (ws) => {
    let session, count = 0, since = Date.now(); ws.alive = true;
    ws.on("pong", () => { ws.alive = true; }); ws.on("error", () => ws.close());
    ws.on("message", (raw) => {
      try {
        if (Date.now() - since > 5000) { since = Date.now(); count = 0; }
        ensure(++count < 100, "操作太快 / Too many requests");
        const data = JSON.parse(raw), avatar = Object.hasOwn(data, "avatar") ? Avatar.normalize(data.avatar) : undefined;
        if (data.type === "hello") {
          ensure(!session, "已连接 / Already connected");
          session = sessions.get(data.token);
          if (!session) { session = { token: crypto.randomBytes(24).toString("hex"), room: "" }; sessions.set(session.token, session); }
          const old = session.ws; session.ws = ws; session.updated = Date.now(); if (old && old !== ws) old.close(4001, "Reconnected");
          send(ws, { type: "welcome", token: session.token });
          const room = rooms.get(session.room), seat = room?.seats.find((p) => p?.token === session.token);
          if (seat && !seat.departed) { seat.ws = ws; broadcast(room); schedule(room); }
          return;
        }
        ensure(session?.ws === ws, "请先连接 / Connect first"); session.updated = Date.now();
        if (data.type === "create") {
          ensure(E.TYPES.includes(data.kind) && E.LEVELS.includes(data.difficulty), "设置无效 / Invalid settings");
          ensure(rooms.size < 200, "房间已满 / Server is busy"); const name = clean(data.name); ensure(name, "请输入名字 / Enter a name");
          ensure([0, 1].includes(data.side), "请选择执子 / Choose a side");
          detach(session, true);
          const room = { code: makeCode(data.kind), kind: data.kind, difficulty: data.difficulty, host: session.token, seats: [null, null], game: null, chat: [], pending: null, job: null, updated: Date.now() };
          room.seats[data.side] = { token: session.token, name, avatar: avatar || null, ws, bot: false, ready: true };
          if (data.ai === true) room.seats[1-data.side] = { token: crypto.randomUUID(), name: botName(name), avatar: Avatar.randomBot(), bot: true, ready: true };
          rooms.set(room.code, room); session.room = room.code;
          if (data.ai === true) start(room); else broadcast(room);
          return;
        }
        if (data.type === "join") {
          const room = rooms.get(clean(data.code,6).toUpperCase()), name = clean(data.name);
          ensure(room, "找不到房间 / Room not found");
          const former = room.seats.find(p => p?.token === session.token && !p.departed);
          ensure(former || control.vacancy(room) >= 0 || !room.game && room.seats.includes(null), "已开局或房间已满 / Started or full"); ensure(name, "请输入名字 / Enter a name");
          if (session.room !== room.code) detach(session, true);
          const player = { token: session.token, name, avatar: avatar || null, bot: false, ws, ready: Boolean(room.game) };
          if (former) { former.ws = ws; former.auto = false; if (avatar !== undefined) former.avatar = avatar; }
          else if (control.vacancy(room) >= 0) control.fill(room, control.vacancy(room), player); else room.seats[room.seats.indexOf(null)] = player;
          session.room = room.code;
          if (!room.seats.some((p) => p?.token === room.host && connected(p))) room.host = session.token;
          broadcast(room); schedule(room); return;
        }
        const room = rooms.get(session.room); ensure(room, "请先加入房间 / Join a room");
        const id = room.seats.findIndex((p) => p?.token === session.token); ensure(id >= 0 && !room.seats[id].departed, "不在此房间 / No seat");
        if (control.handle(room, room.seats[id], data)) return;
        if (data.type === "reaction") {
          const event = Social.reaction(room, room.seats, room.seats[id], data);
          room.seats.forEach((p) => { if (p && !p.bot && !p.departed) send(p.ws, event); }); return;
        }
        const host = () => ensure(session.token === room.host, "仅房主可操作 / Host only");
        if (data.type === "leave") { detach(session, true); send(ws, { type: "left" }); return; }
        if (!["profile", "chat"].includes(data.type)) control.guard(room);
        if (data.type === "profile") { ensure(avatar !== undefined, "请选择头像 / Choose avatar"); room.seats[id].avatar = avatar; }
        else if (data.type === "ready") { ensure(!room.game || room.game.phase === "over", "正在对局 / Game in progress"); room.seats[id].ready = Boolean(data.ready); }
        else if (data.type === "start") { host(); ensure(!room.game && !room.pending && room.seats.every((p) => p && connected(p) && p.ready), "等待玩家准备 / Waiting for ready players"); start(room); return; }
        else if (data.type === "move") { ensure(room.game && data.revision === room.game.revision, "棋盘已更新 / Board changed"); E.move(room.game, id, data); stop(room); control.touch(room, room.seats[id]); room.pending = null; }
        else if (data.type === "resign") { ensure(room.game, "尚未开局 / Not started"); stop(room); E.resign(room.game,id); room.pending = null; }
        else if (data.type === "request") {
          ensure(!room.pending, "请先处理当前申请 / Resolve pending request");
          const other = room.seats[1-id]; ensure(other && connected(other), "对方不在线 / Opponent offline");
          ensure(["undo","draw","rematch","swap"].includes(data.action), "无效申请 / Invalid request");
          if (data.action === "swap") ensure(!room.game, "开局后不能换边 / Sides locked");
          else if (data.action === "rematch") ensure(room.game?.phase === "over", "本局尚未结束 / Game not over");
          else ensure(room.game?.phase === "playing", "尚未开局 / Not playing");
          if (data.action === "undo") ensure(room.game.moves.length && room.game.moves.some((m) => m.side === id), "没有可撤回的落子 / No move to undo");
          ensure(!(data.action === "draw" && other.bot), "AI 不接受求和 / AI draw offers unavailable");
          room.pending = { id: crypto.randomUUID(), from: id, action: data.action, revision: room.game?.revision };
          if (other.bot) resolve(room,true);
        }
        else if (data.type === "respond") {
          ensure(room.pending && room.pending.id === data.id && room.pending.from !== id && typeof data.accept === "boolean", "申请已失效 / Request expired"); resolve(room,data.accept);
        }
        else if (data.type === "cancel") { ensure(room.pending?.from === id, "不能取消 / Cannot cancel"); room.pending = null; }
        else if (data.type === "chat") { const text = clean(data.text,160); if (text) { room.chat.push({ id: crypto.randomUUID(), playerId: id, text, time: Date.now() }); room.chat = room.chat.slice(-50); } }
        else throw Error("未知操作 / Unknown action");
        broadcast(room); schedule(room);
      } catch (error) { send(ws, { type: "error", message: error.message }); }
    });
    ws.on("close", () => { if (session?.ws === ws) { session.ws = null; detach(session,false); } });
  });
  function resolve(room, accept) {
    const p = room.pending; room.pending = null; if (!accept) return;
    ensure(p.action === "swap" || room.game?.revision === p.revision, "棋盘已更新 / Board changed");
    if (p.action === "undo") { stop(room); const n = room.game.moves.at(-1).side === p.from ? 1 : 2; E.undo(room.game,n); }
    if (p.action === "draw") { stop(room); room.game.phase = "over"; room.game.winner = -1; room.game.reason = "双方同意和棋 / Draw by agreement"; room.game.revision++; }
    if (p.action === "swap" || p.action === "rematch") {
      room.seats.reverse(); room.chat.forEach((m) => { m.playerId = 1-m.playerId; });
      if (p.action === "rematch") start(room);
    }
  }
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
    for (const [code, room] of rooms) if (!room.seats.some((p) => p && !p.bot && connected(p)) && Date.now()-room.updated > 3600000) { stop(room); rooms.delete(code); }
    for (const [token, s] of sessions) if (!s.ws && Date.now()-s.updated > 12*3600000) sessions.delete(token);
  },30000); heartbeat.unref();
  server.on("close", () => { closed = true; control.close(); clearInterval(heartbeat); rooms.forEach(stop); wss.clients.forEach((ws) => ws.terminate()); wss.close(); });
  return { rooms, upgrade: (r,s,h) => wss.handleUpgrade(r,s,h,(ws) => wss.emit("connection",ws,r)) };
}
module.exports = { attachDuel };
