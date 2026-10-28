"use strict";
const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const E = require("./truth-engine");
const Avatar = require("./avatar-data");
const Social = require("./game-social");
const { createRoomControl } = require("./room-control");

function attachTruth(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768 });
  const rooms = new Map(), sessions = new Map();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (ok, message) => { if (!ok) throw new Error(message); };
  const clean = (value, limit = 18) => String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
  const online = (p) => p?.ws?.readyState === WebSocket.OPEN;
  const stop = (r) => { clearTimeout(r.timer); r.timer = null; r.timerKey = null; };
  const control = createRoomControl({
    rooms, active: (r) => r.game?.phase === "playing", started: (r) => Boolean(r.game),
    actors: (r) => r.game?.phase === "playing" ? [r.game.current] : [],
    turnKey: (r) => r.game ? String(r.game.revision) : null,
    stop, changed: broadcast,
    remove: (r, p) => {
      const session = sessions.get(p.token);
      if (session?.room === r.code) session.room = "";
      send(p.ws, { type: "left", reason: "房主已将你移出房间 / Removed by the host" });
    }
  });
  function snapshot(r, viewer) {
    return {
      type: "state", code: r.code, you: r.seats.indexOf(viewer),
      host: r.seats.findIndex((p) => p.token === r.host),
      level: r.level, mode: r.mode, rounds: r.rounds, maxPlayers: r.maxPlayers,
      seats: r.seats.map((p) => ({
        name: p.name, socialId: Social.publicId(p), avatar: p.avatar || null,
        position: p.position, bot: Boolean(p.bot), connected: !p.vacant && Boolean(p.bot || online(p)),
        ready: Boolean(p.ready), auto: Boolean(p.auto), vacant: Boolean(p.vacant)
      })),
      game: r.game ? E.snapshot(r.game) : null, control: control.snapshot(r, viewer), chat: r.chat
    };
  }
  function broadcast(r) {
    control.sync(r); r.updated = Date.now(); if (r.game) r.lastRevision = r.game.revision;
    for (const p of r.seats) if (!p.bot && !p.vacant) send(p.ws, snapshot(r, p));
    schedule(r);
  }
  function schedule(r) {
    const game = r.game, player = r.seats[game?.current];
    // Offline humans always wait, even if they enabled auto-play before disconnecting.
    const automatic = player && !player.vacant && (player.bot || (player.auto && online(player)));
    if (!game || game.phase !== "playing" || control.paused(r) || !automatic ||
        !r.seats.some((p) => !p.bot && !p.vacant && online(p))) { stop(r); return; }
    const key = [game.revision, game.current, game.stage, player.token].join(":");
    if (r.timer && r.timerKey === key) return;
    stop(r); r.timerKey = key;
    r.timer = setTimeout(() => {
      r.timer = null; r.timerKey = null;
      if (r.game !== game || control.paused(r) ||
          [game.revision, game.current, game.stage, r.seats[game.current]?.token].join(":") !== key) return schedule(r);
      const p = r.seats[game.current];
      if (!(p.bot || (p.auto && online(p)))) return;
      try {
        // A server cannot decide that a person performed a real-world challenge.
        const action = game.stage === "roll" ? { type: "roll" } :
          game.stage === "choose" ? { type: "choose", kind: "truth" } :
          game.stage === "prepare" ? { type: "ask" } : { type: "skip" };
        E.act(game, game.current, action); broadcast(r);
      } catch (error) {
        stop(r);
        for (const seat of r.seats) send(seat.ws, { type: "error", message: error.message });
      }
    }, Math.max(15, Number(process.env.TRUTH_BOT_DELAY) || 1000));
    r.timer.unref?.();
  }
  const openPosition = (r) => Array.from({ length: r.maxPlayers }, (_, i) => i).find((i) => !r.seats.some((p) => p.position === i));
  function remapChat(r, before) {
    for (const message of r.chat) {
      const old = before[message.playerId];
      if (old) { message.name ||= old.name; message.playerId = r.seats.findIndex((p) => p.token === old.token); }
    }
  }
  function detach(session, explicit = false) {
    const r = rooms.get(session.room);
    if (!r) { if (explicit) session.room = ""; return; }
    const index = r.seats.findIndex((p) => p.token === session.token);
    if (index < 0) { session.room = ""; return; }
    r.seats[index].ws = null;
    control.elect(r, { immediate: explicit && r.host === session.token });
    if (explicit && !r.game) {
      const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before);
    }
    if (explicit) session.room = "";
    if (!r.seats.some((p) => !p.bot && !p.vacant)) { stop(r); rooms.delete(r.code); }
    else broadcast(r);
  }
  function addBot(r) {
    fail(!r.game && r.seats.length < r.maxPlayers, "没有空位 / No open seat");
    const names = ["Laura", "Colin", "Emma", "Daniel", "Connie", "Alex", "Sophia", "James", "Zoey", "Gary", "Alison", "Anna"]
      .filter((name) => !r.seats.some((p) => p.name === name));
    r.seats.push({
      token: crypto.randomUUID(), name: names.length ? names[crypto.randomInt(names.length)] : "Bot",
      avatar: Avatar.randomBot(), position: openPosition(r), bot: true, ready: true, auto: true, ws: null
    });
  }
  wss.on("connection", (ws) => {
    let session;
    ws.alive = true; ws.on("pong", () => { ws.alive = true; });
    ws.on("message", (raw) => {
      try {
        const d = JSON.parse(raw.toString());
        fail(d && typeof d === "object" && !Array.isArray(d), "请求无效 / Invalid request");
        const avatar = ["hello", "create", "join", "profile"].includes(d.type) && Object.hasOwn(d, "avatar")
          ? Avatar.normalize(d.avatar) : undefined;
        if (d.type === "hello") {
          fail(!session, "连接已初始化 / Already connected");
          session = typeof d.token === "string" ? sessions.get(d.token) : null;
          if (!session) {
            session = { token: crypto.randomBytes(24).toString("hex"), room: "", updated: Date.now() };
            sessions.set(session.token, session);
          }
          const previous = session.ws;
          session.ws = ws; session.updated = Date.now();
          if (avatar !== undefined) session.avatar = avatar;
          if (previous && previous !== ws) previous.close(4001, "Reconnected");
          send(ws, { type: "welcome", token: session.token });
          const r = rooms.get(session.room), p = r?.seats.find((seat) => seat.token === session.token);
          if (p && !p.vacant) { p.ws = ws; if (avatar !== undefined) p.avatar = avatar; broadcast(r); }
          return;
        }
        fail(session && session.ws === ws, "请先连接 / Connect first");
        session.updated = Date.now();
        if (d.type === "create") {
          const name = clean(d.name), level = d.level ?? "heat", mode = d.mode ?? "mixed", rounds = d.rounds ?? 3, maxPlayers = d.maxPlayers ?? 8;
          fail(name, "请输入名字 / Enter your name");
          fail(E.LEVELS.includes(level), "请选择挑战强度 / Choose a challenge level");
          fail(["truth", "dare", "mixed"].includes(mode), "请选择真心话、大冒险或混合 / Choose truth, dare or mixed mode");
          fail([3, 5, 8].includes(rounds), "请选择 3、5 或 8 轮 / Choose 3, 5 or 8 rounds");
          fail(Number.isInteger(maxPlayers) && maxPlayers >= 2 && maxPlayers <= 12, "房间人数为 2–12 人 / Rooms hold 2–12 players");
          detach(session, true);
          let code; do { code = "T" + crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase(); } while (rooms.has(code));
          const r = { code, host: session.token, level, mode, rounds, maxPlayers, game: null, chat: [], updated: Date.now(),
            seats: [{ token: session.token, name, avatar: avatar === undefined ? session.avatar || null : avatar,
              position: 0, bot: false, ready: true, auto: false, ws }] };
          rooms.set(code, r); session.room = code; broadcast(r); return;
        }
        if (d.type === "join") {
          const r = rooms.get(clean(d.code, 6).toUpperCase()), name = clean(d.name);
          fail(r, "找不到真心话房间 / Truth or Dare room not found"); fail(name, "请输入名字 / Enter your name");
          const existing = r.seats.find((p) => p.token === session.token && !p.vacant);
          fail(existing || control.vacancy(r) >= 0 || (!r.game && r.seats.length < r.maxPlayers), "房间已满 / Room is full");
          if (session.room !== r.code) detach(session, true);
          if (existing) { existing.ws = ws; if (avatar !== undefined) existing.avatar = avatar; }
          else {
            const p = { token: session.token, name, avatar: avatar === undefined ? session.avatar || null : avatar,
              position: openPosition(r), bot: false, ready: false, auto: false, ws };
            const vacant = control.vacancy(r);
            if (vacant >= 0) control.fill(r, vacant, p); else r.seats.push(p);
          }
          session.room = r.code; broadcast(r); return;
        }
        const r = rooms.get(session.room); fail(r, "请先加入房间 / Join a room first");
        const you = r.seats.findIndex((p) => p.token === session.token && !p.vacant), p = r.seats[you];
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
          fail(avatar !== undefined, "请选择头像 / Choose an avatar");
          p.avatar = avatar; session.avatar = avatar;
        } else if (d.type === "chat") {
          const text = clean(d.text, 160);
          if (text) {
            fail(!p.lastChat || Date.now() - p.lastChat >= 500, "发送太快 / Please slow down");
            p.lastChat = Date.now();
            r.chat.push({ id: crypto.randomUUID(), playerId: you, name: p.name, text, time: Date.now() }); r.chat = r.chat.slice(-40);
          }
        } else if (d.type === "ready") {
          fail(!r.game, "已经开始 / Already started");
          fail(d.ready === undefined || typeof d.ready === "boolean", "准备状态无效 / Invalid ready state");
          p.ready = d.ready === undefined ? !p.ready : d.ready;
        } else if (d.type === "addBot") { host(); addBot(r); }
        else if (d.type === "fillBots") { host(); fail(!r.game, "已经开始 / Already started"); while (r.seats.length < r.maxPlayers) addBot(r); }
        else if (d.type === "removeBot") {
          host(); fail(!r.game, "已经开始 / Already started");
          const index = r.seats.findIndex((seat) => seat.bot && Social.publicId(seat) === d.target);
          fail(index >= 0, "座位已变化，请重新确认 / Seat changed; confirm again");
          const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before);
        } else if (d.type === "start") {
          host(); fail(!r.game && r.seats.length >= 2, "至少两人才能开始 / At least two players are needed");
          fail(r.seats.every((seat) => seat.bot || (online(seat) && (seat.ready || seat.token === r.host))),
            "请等待所有玩家上线并准备 / Wait for everyone to connect and ready up");
          const before = [...r.seats]; r.seats.sort((a, b) => a.position - b.position); remapChat(r, before);
          r.seats.forEach((seat, i) => { seat.position = i; });
          r.game = E.createGame(r.seats.length, { level: r.level, rounds: r.rounds, mode: r.mode });
          r.game.revision = (r.lastRevision ?? -1) + 1;
        } else if (d.type === "restart" || d.type === "rematch") {
          host(); fail(r.game?.phase === "over", "本局尚未结束 / Finish this game first");
          stop(r); r.game = null;
          for (const seat of r.seats) { seat.ready = Boolean(seat.bot || seat.token === r.host); seat.auto = Boolean(seat.bot); }
        } else if (d.type === "action") {
          fail(r.game?.phase === "playing", "游戏尚未开始或已结束 / Game is not in progress");
          const action = typeof d.action === "object" && d.action ? d.action : { type: d.action, kind: d.kind, text: d.text };
          fail(Number.isInteger(d.revision ?? action.revision) && (d.revision ?? action.revision) === r.game.revision,
            "局面已变化，请重试 / Game changed; try again");
          const move = { type: action.type };
          if (action.type === "choose") move.kind = action.kind;
          if (action.type === "ask" && action.text !== undefined) move.text = action.text;
          E.act(r.game, you, move);
          control.touch(r, p);
        } else throw new Error("未知请求 / Unknown request");
        broadcast(r);
      } catch (error) { send(ws, { type: "error", message: error.message }); }
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
    control.close(); clearInterval(heartbeat); rooms.forEach(stop);
    wss.clients.forEach((ws) => ws.terminate()); wss.close();
  });
  return { rooms, broadcast, upgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)); } };
}
module.exports = { attachTruth };

