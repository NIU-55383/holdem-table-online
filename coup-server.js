"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const E = require("./coup-engine");
const Avatar = require("./avatar-data");
const Social = require("./game-social");
const { createRoomControl } = require("./room-control");

function attachCoup(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2200000 });
  const rooms = new Map(), sessions = new Map();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (ok, message) => { if (!ok) throw new Error(message); };
  const clean = (value, limit = 18) => String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
  const online = (p) => p?.ws?.readyState === WebSocket.OPEN;
  const automatic = (p) => p && !p.vacant && (p.bot || (p.auto && online(p)));
  const humansOnline = (r) => r.seats.some((p) => !p.bot && !p.vacant && online(p));
  const stop = (r) => { clearTimeout(r.timer); r.timer = null; r.timerKey = null; };
  const override = Number(process.env.COUP_BOT_DELAY);
  const botDelay = Number.isFinite(override) && override > 0 ? Math.max(15, override) : 1100;
  let closed = false;
  const control = createRoomControl({
    rooms, active: (r) => Boolean(r.game && r.game.phase !== "over"), started: (r) => Boolean(r.game),
    actors: (r) => r.game ? E.requiredActors(r.game) : [],
    // Other players answering the same challenge must not restart your idle clock.
    turnKey: (r) => r.game ? `${r.generation || 0}:${r.game.turn}:${r.game.current}:${r.game.phase}` : null,
    stop, changed: broadcast,
    remove: (r, p) => {
      const session = sessions.get(p.token);
      if (session?.room === r.code) session.room = "";
      send(p.ws, { type: "left", reason: "房主已将你移出房间 / Removed by the host" });
    },
    replace: (r, index, previous, replacement) => {
      // Do not execute a queued click against a changed occupant; keep the seat's cards and coins.
      if (r.game && !r.archiveRestoring) r.game.revision++;
      return { ...replacement, position: previous.position };
    }
  });
  function capacity(value = 6) {
    fail(Number.isInteger(value) && value >= 2 && value <= 6, "人数上限须为 2–6 人 / Capacity must be 2–6");
    return value;
  }
  function snapshot(r, viewer) {
    const you = r.seats.indexOf(viewer);
    return {
      type: "state", code: r.code, you, host: r.seats.findIndex((p) => p.token === r.host), capacity: r.capacity,
      seats: r.seats.map((p) => ({
        socialId: Social.publicId(p), name: p.name, position: p.position, avatar: p.avatar || null,
        bot: Boolean(p.bot), vacant: Boolean(p.vacant), ready: Boolean(p.ready),
        connected: !p.vacant && Boolean(p.bot || online(p)), auto: Boolean(p.auto)
      })),
      control: control.snapshot(r, viewer), game: r.game ? E.publicGame(r.game, you) : null, chat: r.chat
    };
  }
  function broadcast(r) {
    if (closed) return;
    archives.sync(r); control.sync(r); r.updated = Date.now();
    if (r.game) r.lastRevision = r.game.revision;
    for (const p of r.seats) if (!p.bot && !p.vacant) send(p.ws, snapshot(r, p));
    schedule(r);
  }
  const archives = require("./room-archive").createRoomArchive({ kind: "coup", rooms, sessions, control, send, stop, broadcast,
    validate: (r) => { E.validateRestore(r.game); r.seats.forEach((_, i) => E.publicGame(r.game, i)); } });
  function addChat(r, actor, text) {
    r.chat.push({ id: crypto.randomUUID(), playerId: actor, name: r.seats[actor].name,
      text: clean(text, 220), time: Date.now() });
    r.chat = r.chat.slice(-40);
  }
  const waitingOffline = (r) => E.requiredActors(r.game).some((i) => !r.seats[i]?.bot && !online(r.seats[i]));
  function schedule(r) {
    const game = r.game;
    if (closed || !game || game.phase === "over" || control.paused(r) || !humansOnline(r) || waitingOffline(r)) { stop(r); return; }
    const actor = E.requiredActors(game).find((i) => automatic(r.seats[i]));
    if (actor === undefined) { stop(r); return; }
    const key = `${game.revision}:${actor}:${r.seats[actor].token}`;
    if (r.timer && r.timerKey === key) return;
    stop(r); r.timerKey = key;
    r.timer = setTimeout(() => {
      r.timer = null; r.timerKey = null;
      if (closed || r.game !== game || control.paused(r) || !humansOnline(r) || waitingOffline(r) ||
          `${game.revision}:${actor}:${r.seats[actor]?.token}` !== key ||
          !E.requiredActors(game).includes(actor) || !automatic(r.seats[actor])) return schedule(r);
      try {
        const action = E.chooseBotAction(game, actor);
        if (!action) throw new Error("暂时无法自动行动 / No automatic action is available");
        E.act(game, actor, action); control.touch(r, r.seats[actor]); broadcast(r);
      } catch (error) {
        stop(r); for (const p of r.seats) send(p.ws, { type: "error", message: error.message });
      }
    }, botDelay);
    r.timer.unref?.();
  }
  const openPosition = (r) => Array.from({ length: r.capacity }, (_, i) => i).find((i) => !r.seats.some((p) => p.position === i));
  const unready = (r) => r.seats.forEach((p) => { p.ready = Boolean(p.bot); });
  function remapChat(r, before) {
    for (const message of r.chat) {
      const old = before[message.playerId];
      if (old) { message.name ||= old.name; message.playerId = r.seats.findIndex((p) => p.token === old.token); }
    }
  }
  function detach(session, explicit = false) {
    const r = rooms.get(session.room);
    if (!r) { if (explicit) session.room = ""; return; }
    const index = r.seats.findIndex((p) => !p.vacant && p.token === session.token);
    if (index < 0) { session.room = ""; return; }
    r.seats[index].ws = null;
    control.elect(r, { immediate: explicit && r.host === session.token });
    if (explicit && !r.game) {
      const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before); unready(r);
    }
    if (explicit) session.room = "";
    if (!r.seats.some((p) => !p.bot && !p.vacant)) { stop(r); rooms.delete(r.code); }
    else broadcast(r);
  }
  function addBot(r) {
    fail(!r.game && r.seats.length < r.capacity, "没有空位 / No open seat");
    const names = ["Laura", "Colin", "Emma", "Daniel", "Connie", "Alex", "Sophia", "James", "Zoey", "Gary", "Alison", "Anna"]
      .filter((name) => !r.seats.some((p) => p.name === name));
    r.seats.push({ token: crypto.randomUUID(), name: names[crypto.randomInt(names.length)], avatar: Avatar.randomBot(),
      position: openPosition(r), bot: true, ready: true, auto: true, ws: null });
    unready(r);
  }
  wss.on("connection", (ws) => {
    let session;
    ws.alive = true; ws.on("pong", () => { ws.alive = true; });
    ws.on("message", (raw) => {
      let isAction = false;
      try {
        const d = JSON.parse(raw.toString());
        fail(d && typeof d === "object" && !Array.isArray(d), "请求无效 / Invalid request");
        isAction = d.type === "action";
        const avatar = ["hello", "create", "join", "profile"].includes(d.type) && Object.hasOwn(d, "avatar") ? Avatar.normalize(d.avatar) : undefined;
        if (d.type === "hello") {
          fail(!session, "连接已初始化 / Already connected");
          session = typeof d.token === "string" ? sessions.get(d.token) : null;
          if (!session) {
            session = { token: crypto.randomBytes(24).toString("hex"), room: "", updated: Date.now() }; sessions.set(session.token, session);
          }
          const previous = session.ws; session.ws = ws; session.updated = Date.now();
          if (avatar !== undefined) session.avatar = avatar;
          if (previous && previous !== ws) previous.close(4001, "Reconnected");
          send(ws, { type: "welcome", token: session.token });
          const r = rooms.get(session.room), p = r?.seats.find((seat) => !seat.vacant && seat.token === session.token);
          if (p) { p.ws = ws; if (avatar !== undefined) p.avatar = avatar; broadcast(r); }
          return;
        }
        fail(session && session.ws === ws, "请先连接 / Connect first"); session.updated = Date.now();
        if (archives.handle(session, ws, d)) return;
        if (d.type === "create") {
          const name = clean(d.name), size = capacity(d.capacity ?? 6); fail(name, "请输入名字 / Enter your name");
          fail(rooms.size < 200, "房间已满 / Server is busy"); detach(session, true);
          if (avatar !== undefined) session.avatar = avatar;
          let code; do { code = "Q" + crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase(); } while (rooms.has(code));
          const r = { code, host: session.token, capacity: size, game: null, generation: 0, chat: [], updated: Date.now(),
            seats: [{ token: session.token, name, avatar: session.avatar || null, position: 0, bot: false, ready: false, auto: false, ws }] };
          rooms.set(code, r); session.room = code; broadcast(r); return;
        }
        if (d.type === "join") {
          const r = rooms.get(clean(d.code, 6).toUpperCase()), name = clean(d.name);
          fail(r, "找不到政变房间 / Coup room not found"); fail(name, "请输入名字 / Enter your name");
          const existing = r.seats.find((p) => !p.vacant && p.token === session.token);
          fail(existing || control.vacancy(r) >= 0 || (!r.game && r.seats.length < r.capacity), "房间已满 / Room is full");
          if (session.room !== r.code) detach(session, true);
          if (avatar !== undefined) session.avatar = avatar;
          if (existing) { existing.ws = ws; if (avatar !== undefined) existing.avatar = avatar; }
          else {
            const p = { token: session.token, name, avatar: session.avatar || null, position: openPosition(r), bot: false, ready: false, auto: false, ws };
            const vacant = control.vacancy(r);
            if (vacant >= 0) control.fill(r, vacant, p); else { r.seats.push(p); unready(r); }
          }
          session.room = r.code; broadcast(r); return;
        }
        const r = rooms.get(session.room); fail(r, "请先加入房间 / Join a room first");
        const you = r.seats.findIndex((p) => !p.vacant && p.token === session.token), p = r.seats[you];
        fail(p && p.ws === ws, "连接已失效 / No active seat");
        const host = () => fail(r.host === session.token, "仅房主可操作 / Host only");
        if (control.handle(r, p, d)) return;
        if (d.type === "reaction") {
          const event = Social.reaction(r, r.seats, p, d);
          for (const seat of r.seats) send(seat.ws, event);
          return;
        }
        if (d.type === "leave") { detach(session, true); send(ws, { type: "left" }); return; }
        if (!["profile", "chat"].includes(d.type)) control.guard(r);
        if (d.type === "profile") {
          fail(avatar !== undefined, "请选择头像 / Choose an avatar"); p.avatar = avatar; session.avatar = avatar;
        } else if (d.type === "chat") {
          const text = clean(d.text, 160);
          if (text) {
            fail(!p.lastChat || Date.now() - p.lastChat >= 500, "发送太快 / Please slow down"); p.lastChat = Date.now(); addChat(r, you, text);
          }
        } else if (d.type === "ready") {
          fail(!r.game, "已经开始 / Already started"); fail(typeof d.ready === "boolean", "准备状态无效 / Invalid ready state"); p.ready = d.ready;
        } else if (d.type === "settings") {
          host(); fail(!r.game, "已经开始 / Already started"); const size = capacity(d.capacity ?? r.capacity);
          fail(size >= r.seats.length && r.seats.every((seat) => seat.position < size), "已有座位超出人数上限 / Existing seats exceed capacity");
          r.capacity = size; unready(r);
        } else if (d.type === "addBot") { host(); addBot(r); }
        else if (d.type === "fillBots") { host(); fail(!r.game, "已经开始 / Already started"); while (r.seats.length < r.capacity) addBot(r); }
        else if (d.type === "removeBot") {
          host(); fail(!r.game, "已经开始 / Already started");
          const index = r.seats.findIndex((seat) => seat.bot && Social.publicId(seat) === d.target);
          fail(index >= 0, "座位已变化，请重新确认 / Seat changed; confirm again");
          const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before); unready(r);
        } else if (d.type === "start") {
          host(); fail(!r.game && r.seats.length >= 2, "至少需要 2 人 / At least 2 players are required");
          fail(r.seats.every((seat) => seat.bot || online(seat)), "请等待所有玩家上线 / Wait for everyone to connect");
          fail(r.seats.every((seat) => seat === p || seat.bot || seat.ready), "请等待其他玩家准备 / Wait for the other players to be ready");
          const before = [...r.seats]; r.seats.sort((a, b) => a.position - b.position); remapChat(r, before);
          stop(r); r.game = E.createGame(r.seats.map((seat) => seat.name)); r.generation = (r.generation || 0) + 1;
          r.game.revision = Math.max(r.game.revision, (r.lastRevision ?? -1) + 1);
        } else if (d.type === "endGame" || d.type === "restart") {
          host(); fail(r.game, "游戏尚未开始 / Game has not started");
          fail(Number.isInteger(d.revision) && d.revision === r.game.revision, "局面已变化，请重新确认 / Game changed; confirm again");
          if (d.type === "endGame") {
            fail(r.game.phase !== "over", "本局已经结束 / Game already ended");
            stop(r); E.endGame(r.game);
          } else {
            stop(r); r.lastRevision = r.game.revision; r.game = null; unready(r);
            for (const seat of r.seats) seat.auto = Boolean(seat.bot);
          }
        } else if (d.type === "rematch") {
          host(); fail(r.game?.phase === "over", "本局尚未结束 / Finish this game first");
          stop(r); r.game = null; unready(r); for (const seat of r.seats) seat.auto = Boolean(seat.bot);
        } else if (d.type === "action") {
          fail(r.game && r.game.phase !== "over", "游戏尚未开始或已结束 / Game is not in progress");
          const action = d.action; fail(action && typeof action === "object" && !Array.isArray(action), "行动无效 / Invalid action");
          fail(Number.isInteger(d.revision) && d.revision === r.game.revision, "局面已变化，请重试 / Game changed; try again");
          if (action.revision !== undefined) fail(action.revision === r.game.revision, "局面已变化，请重试 / Game changed; try again");
          E.act(r.game, you, action); control.touch(r, p);
        } else throw new Error("未知请求 / Unknown request");
        broadcast(r);
      } catch (error) {
        send(ws, { type: "error", message: error.message });
        if (isAction && session?.ws === ws) {
          const r = rooms.get(session.room), p = r?.seats.find((seat) => !seat.vacant && seat.token === session.token && seat.ws === ws);
          if (p) send(ws, snapshot(r, p));
        }
      }
    });
    ws.on("error", () => ws.close());
    ws.on("close", () => { if (session?.ws === ws) { session.ws = null; detach(session); } });
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) ws.terminate(); else { ws.alive = false; ws.ping(); } }
    for (const [code, r] of rooms) if (Date.now() - r.updated > 12 * 3600000 && !r.seats.some(online)) { stop(r); rooms.delete(code); }
    for (const [token, session] of sessions) if (!session.ws && Date.now() - session.updated > 24 * 3600000) sessions.delete(token);
  }, 30000);
  heartbeat.unref();
  server.on("close", () => {
    archives.close(); closed = true; control.close(); clearInterval(heartbeat); rooms.forEach(stop);
    wss.clients.forEach((ws) => ws.terminate()); wss.close();
  });
  return { rooms, broadcast, upgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)); } };
}
module.exports = { attachCoup };
