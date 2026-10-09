"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const E = require("./bridge-engine");
const Lesson = require("./bridge-lesson");
const Avatar = require("./avatar-data");
const Social = require("./game-social");
const { createRoomControl } = require("./room-control");

function attachBridge(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  const rooms = new Map(), sessions = new Map();
  const personalities = new WeakMap(), styleCount = require("./bridge-bot").profileCount;
  const lessonCache = new WeakMap();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (ok, message) => { if (!ok) throw new Error(message); };
  const clean = (v, n = 18) => String(v || "").trim().replace(/\s+/g, " ").slice(0, n);
  const online = (p) => p.ws?.readyState === WebSocket.OPEN;
  const stop = (r) => { clearTimeout(r.timer); r.timer = null; r.timerKey = null; };
  const control = createRoomControl({ rooms, active: (r) => r.game && r.game.phase !== "over", started: (r) => Boolean(r.game),
    actors: (r) => E.requiredActors(r.game), turnKey: (r) => r.game && `${r.game.board}:${r.game.revision}`,
    stop, changed: broadcast, remove: (r, p) => { const s = sessions.get(p.token); if (s) s.room = ""; send(p.ws, { type: "left", reason: "房主已将你移出房间 / Removed by the host" }); } });
  function snapshot(r, session) {
    const you = r.seats.findIndex((p) => p.token === session.token), swap = r.seatSwap;
    const game = r.game ? E.publicGame(r.game, you) : null;
    if (r.tutorial && lessonCache.get(r.game)?.revision !== r.game.revision) {
      lessonCache.set(r.game, { revision: r.game.revision, ...Lesson.coach(game) });
    }
    return { type: "state", code: r.code, you, host: r.seats.findIndex((p) => p.token === r.host), boards: r.boards,
      seats: r.seats.map((p) => ({ socialId: Social.publicId(p), name: p.name, position: p.position, avatar: p.avatar || null,
        bot: Boolean(p.bot), vacant: Boolean(p.vacant), connected: !p.vacant && (p.bot || online(p)), auto: Boolean(p.auto) })),
      seatSwap: swap ? { id: swap.id, from: r.seats.findIndex((p) => p.token === swap.from), to: r.seats.findIndex((p) => p.token === swap.to) } : null,
      control: control.snapshot(r, session), game, lesson: r.tutorial ? lessonCache.get(r.game) : null, scores: r.scores, chat: r.chat };
  }
  function record(r) {
    if (r.game?.phase === "over" && !r.scores.some((s) => s.board === r.game.board)) {
      r.scores.push({ board: r.game.board, contract: r.game.contract, vulnerability: r.game.vulnerability, ...r.game.result });
    }
  }
  function broadcast(r) {
    const used = new Set(r.seats.filter((p) => p.bot && personalities.has(p)).map((p) => personalities.get(p)));
    for (const p of r.seats) if (p.bot && !personalities.has(p)) {
      const available = Array.from({ length: styleCount }, (_, i) => i).filter((s) => !used.has(s));
      const style = available.length ? available[crypto.randomInt(available.length)] : crypto.randomInt(styleCount);
      personalities.set(p, style); used.add(style);
    }
    record(r); control.sync(r); r.updated = Date.now();
    r.seats.forEach((p) => { if (!p.bot) send(p.ws, snapshot(r, p)); });
    schedule(r);
  }
  function schedule(r) {
    if (r.tutorial) { stop(r); return; }
    const g = r.game, actor = g ? E.controller(g) : -1;
    const automatic = actor >= 0 && !r.seats[actor].vacant && (r.seats[actor].bot || r.seats[actor].auto);
    if (control.paused(r) || !g || g.phase === "over" || !r.seats.some((p) => !p.bot && online(p)) || (g.phase !== "trick" && !automatic)) { stop(r); return; }
    const key = `${g.board}:${g.revision}:${actor}`;
    if (r.timer && r.timerKey === key) return;
    stop(r); r.timerKey = key;
    r.timer = setTimeout(() => {
      r.timer = null; r.timerKey = null;
      if (r.game !== g || `${g.board}:${g.revision}:${E.controller(g)}` !== key || control.paused(r)) return schedule(r);
      try {
        if (g.phase === "trick") E.advanceTrick(g);
        else { if (!(r.seats[actor].bot || r.seats[actor].auto)) return; E.act(g, actor, E.chooseBotAction(g, actor, personalities.get(r.seats[actor]) ?? 0)); }
        broadcast(r);
      } catch (err) { console.error("Bridge automatic action:", err); r.seats.forEach((p) => send(p.ws, { type: "error", message: "自动行动失败，请重新连接 / Automatic action failed; reconnect" })); }
    }, Number(process.env.BRIDGE_BOT_DELAY) || (g.phase === "trick" ? 1500 : 850));
    r.timer.unref?.();
  }
  const openPosition = (r) => [0, 1, 2, 3].find((i) => !r.seats.some((p) => p.position === i));
  function remapChat(r, before) { r.chat.forEach((c) => { c.playerId = r.seats.findIndex((p) => p.token === before[c.playerId]?.token); }); }
  function detach(s, explicit = false) {
    const r = rooms.get(s.room); if (!r) return;
    const i = r.seats.findIndex((p) => p.token === s.token); if (i < 0) return;
    r.seats[i].ws = null;
    if (r.seatSwap && [r.seatSwap.from, r.seatSwap.to].includes(s.token)) r.seatSwap = null;
    control.elect(r);
    if (explicit && !r.game) { const before = [...r.seats]; r.seats.splice(i, 1); remapChat(r, before); }
    if (explicit) s.room = "";
    if (explicit && r.tutorial) { stop(r); rooms.delete(r.code); return; }
    if (!r.seats.some((p) => !p.bot && !p.vacant)) { stop(r); rooms.delete(r.code); } else broadcast(r);
  }
  function addBot(r) {
    fail(!r.game && r.seats.length < 4, "没有空位 / No open seat");
    const names = ["Laura", "Colin", "Emma", "Daniel", "Connie", "Alex", "Sophia", "James"].filter((n) => !r.seats.some((p) => p.name === n));
    r.seats.push({ token: crypto.randomUUID(), name: names[crypto.randomInt(names.length)], avatar: Avatar.randomBot(), position: openPosition(r), bot: true, auto: true, ws: null });
  }
  wss.on("connection", (ws) => {
    let session;
    ws.alive = true; ws.on("pong", () => { ws.alive = true; });
    ws.on("message", (raw) => {
      try {
        const d = JSON.parse(raw.toString());
        fail(d && typeof d === "object" && !Array.isArray(d), "请求无效 / Invalid request");
        const avatar = ["hello", "create", "createTutorial", "join", "profile"].includes(d.type) && Object.hasOwn(d, "avatar") ? Avatar.normalize(d.avatar) : undefined;
        if (d.type === "hello") {
          fail(!session, "连接已初始化 / Already connected");
          session = typeof d.token === "string" ? sessions.get(d.token) : null;
          if (!session) { session = { token: crypto.randomBytes(24).toString("hex"), room: "" }; sessions.set(session.token, session); }
          const previous = session.ws; session.ws = ws; session.updated = Date.now();
          if (avatar !== undefined) session.avatar = avatar;
          if (previous && previous !== ws) previous.close(4001, "Reconnected");
          send(ws, { type: "welcome", token: session.token });
          const r = rooms.get(session.room), p = r?.seats.find((p) => p.token === session.token);
          if (p) { p.ws = ws; if (avatar !== undefined) p.avatar = avatar; broadcast(r); }
          return;
        }
        fail(session && session.ws === ws, "请先连接 / Connect first"); session.updated = Date.now();
        if (d.type === "create" || d.type === "createTutorial") {
          const tutorial = d.type === "createTutorial", name = clean(d.name), boards = tutorial ? 1 : d.boards ?? 4;
          fail(name, "请输入名字 / Enter your name"); fail(tutorial || [4, 8, 16].includes(boards), "请选择 4、8 或 16 副 / Choose 4, 8 or 16 boards");
          detach(session, true);
          let code; do { code = `B${crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase()}`; } while (rooms.has(code));
          const r = { code, host: session.token, boards, seats: [{ token: session.token, name, avatar: avatar === undefined ? session.avatar || null : avatar, position: 0, bot: false, auto: false, ws }], game: null, scores: [], chat: [], seatSwap: null, updated: Date.now() };
          if (tutorial) { while (r.seats.length < 4) addBot(r); r.tutorial = true; r.game = Lesson.create(r.seats.map((p) => p.name)); }
          rooms.set(code, r); session.room = code; broadcast(r); return;
        }
        if (d.type === "join") {
          const r = rooms.get(clean(d.code, 6).toUpperCase()), name = clean(d.name);
          fail(r, "找不到桥牌房间 / Bridge room not found"); fail(name, "请输入名字 / Enter your name");
          fail(!r.tutorial, "这是个人教学练习 / This is a private guided lesson");
          const existing = r.seats.find((p) => p.token === session.token);
          fail(existing || control.vacancy(r) >= 0 || (!r.game && r.seats.length < 4), "房间已满 / Room is full");
          if (session.room !== r.code) detach(session, true);
          if (existing) { existing.ws = ws; if (avatar !== undefined) existing.avatar = avatar; }
          else {
            const p = { token: session.token, name, avatar: avatar === undefined ? session.avatar || null : avatar, position: openPosition(r), bot: false, auto: false, ws };
            const vacant = control.vacancy(r); if (vacant >= 0) control.fill(r, vacant, p); else r.seats.push(p);
          }
          session.room = r.code; broadcast(r); return;
        }
        const r = rooms.get(session.room); fail(r, "请先加入房间 / Join a room first");
        const you = r.seats.findIndex((p) => p.token === session.token); fail(you >= 0, "座位不存在 / Seat not found");
        const p = r.seats[you], host = () => fail(r.host === session.token, "仅房主可操作 / Host only");
        if (r.tutorial) fail(["action", "lessonContinue", "lessonRestart", "reaction", "profile", "chat", "leave"].includes(d.type), "教学按步骤进行，不启用托管或换座 / Guided practice uses manual steps, without auto-play or seat changes");
        if (control.handle(r, p, d)) return;
        if (d.type === "reaction") { const event = Social.reaction(r, r.seats, p, d); r.seats.forEach((s) => send(s.ws, event)); return; }
        if (d.type === "leave") { detach(session, true); send(ws, { type: "left" }); return; }
        if (!["chat", "profile"].includes(d.type)) control.guard(r);
        if (d.type === "profile") { fail(avatar !== undefined, "请选择头像 / Choose an avatar"); p.avatar = avatar; session.avatar = avatar; }
        else if (d.type === "chat") {
          const text = clean(d.text, 160);
          if (text) { fail(!p.lastChat || Date.now() - p.lastChat >= 500, "发送太快 / Please slow down"); p.lastChat = Date.now(); r.chat.push({ id: crypto.randomUUID(), playerId: you, name: p.name, text, time: Date.now() }); r.chat = r.chat.slice(-40); }
        } else if (d.type === "chooseSeat") {
          fail(!r.game && !r.seatSwap, "请先处理换座申请，开局后不能换座 / Resolve pending swaps; seats lock at start");
          fail(Number.isInteger(d.position) && d.position >= 0 && d.position < 4, "座位无效 / Invalid seat");
          const target = r.seats.find((s) => s.position === d.position);
          if (target === p) return;
          if (!target || target.bot) { if (target) target.position = p.position; p.position = d.position; }
          else { fail(online(target), "对方离线 / Player is offline"); r.seatSwap = { id: crypto.randomUUID(), from: p.token, to: target.token }; }
        } else if (d.type === "respondSeatSwap") {
          const swap = r.seatSwap, from = r.seats.find((s) => s.token === swap?.from);
          fail(!r.game && swap?.id === d.id && swap.to === p.token && typeof d.accept === "boolean" && from && online(from), "换座申请已失效 / Swap request expired");
          if (d.accept) [from.position, p.position] = [p.position, from.position]; r.seatSwap = null;
        } else if (d.type === "cancelSeatSwap") {
          fail(r.seatSwap?.id === d.id && r.seatSwap.from === p.token, "申请已失效 / Request expired"); r.seatSwap = null;
        } else if (d.type === "addBot") { host(); addBot(r); }
        else if (d.type === "fillBots") { host(); fail(!r.game, "已经开局 / Already started"); while (r.seats.length < 4) addBot(r); }
        else if (d.type === "removeBot") {
          host(); fail(!r.game, "已经开局 / Already started"); const i = r.seats.findIndex((s) => s.bot && Social.publicId(s) === d.target);
          fail(i >= 0, "座位已变化，请重新确认 / Seat changed; confirm again"); const before = [...r.seats]; r.seats.splice(i, 1); remapChat(r, before);
        } else if (d.type === "start") {
          host(); fail(!r.game && r.seats.length === 4 && !r.seatSwap, "请坐满四人并完成换座 / Fill four seats and resolve swaps");
          const before = [...r.seats]; r.seats.sort((a, b) => a.position - b.position); remapChat(r, before); r.game = E.createGame(r.seats.map((s) => s.name));
        } else if (d.type === "next") {
          host(); fail(r.game?.phase === "over" && r.game.board < r.boards, "本副尚未结束或整场已结束 / Board still in play or match complete");
          r.game = E.createGame(r.seats.map((s) => s.name), r.game.board + 1);
        } else if (d.type === "rematch") {
          host(); fail(r.game?.phase === "over" && r.game.board === r.boards, "整场尚未结束 / Match still in progress");
          r.game = null; r.scores = [];
        } else if (d.type === "lessonContinue" || d.type === "lessonRestart") {
          fail(r.tutorial && you === 0, "仅教学练习可操作 / Guided practice only");
          fail(d.revision === r.game.revision, "牌局已变化，请重试 / Board changed; try again");
          if (d.type === "lessonContinue") Lesson.next(r.game);
          else { const revision = r.game.revision + 1; r.game = Lesson.create(r.seats.map((s) => s.name)); r.game.revision = revision; r.scores = []; }
        } else if (d.type === "action") { fail(r.game, "尚未开始 / Not started"); (r.tutorial ? Lesson.act : E.act)(r.game, you, d.action); control.touch(r, p); }
        else throw new Error("未知请求 / Unknown request");
        broadcast(r);
      } catch (err) { send(ws, { type: "error", message: err.message }); }
    });
    ws.on("error", () => ws.close());
    ws.on("close", () => { if (session?.ws === ws) { session.ws = null; detach(session); } });
  });
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
    for (const [code, r] of rooms) if (Date.now() - r.updated > 12 * 3600000 && !r.seats.some(online)) { stop(r); rooms.delete(code); }
    for (const [token, s] of sessions) if (!s.ws && Date.now() - s.updated > 24 * 3600000) sessions.delete(token);
  }, 30000);
  heartbeat.unref();
  server.on("close", () => { control.close(); clearInterval(heartbeat); rooms.forEach(stop); wss.clients.forEach((ws) => ws.terminate()); wss.close(); });
  return { rooms, broadcast, upgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)); } };
}
module.exports = { attachBridge };
