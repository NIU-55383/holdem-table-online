"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const E = require("./million-engine");
const Avatar = require("./avatar-data");
const Social = require("./game-social");
const { createRoomControl } = require("./room-control");

function attachMillion(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2200000 });
  const rooms = new Map(), sessions = new Map();
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (ok, message) => { if (!ok) throw new Error(message); };
  const clean = (value, limit = 18) => String(value || "").trim().replace(/\s+/g, " ").slice(0, limit);
  const online = (p) => p?.ws?.readyState === WebSocket.OPEN;
  const automatic = (p) => p && !p.vacant && (p.bot || (p.auto && online(p)));
  const humansOnline = (r) => r.seats.some((p) => !p.bot && !p.vacant && online(p));
  const stop = (r) => { clearTimeout(r.timer); r.timer = null; r.timerKey = null; };
  const override = Number(process.env.MILLION_BOT_DELAY);
  const botDelay = Number.isFinite(override) && override > 0 ? Math.max(15, override) : 850;
  const negotiationDelay = Number.isFinite(override) && override > 0 ? botDelay : 5000;
  let closed = false;
  const control = createRoomControl({
    rooms, active: (r) => Boolean(r.game && r.game.phase !== "over"), started: (r) => Boolean(r.game),
    actors: (r) => r.game ? E.requiredActors(r.game) : [],
    // Another simultaneous actor's move must not extend everybody else's idle deadline.
    turnKey: (r) => r.game ? `${r.generation}:${r.game.round}:${r.game.phase}` : null,
    stop, changed: broadcast,
    remove: (r, p) => {
      const session = sessions.get(p.token);
      if (session?.room === r.code) session.room = "";
      send(p.ws, { type: "left", reason: "房主已将你移出房间 / Removed by the host" });
    },
    replace: (r, index, previous, replacement) => {
      if (r.game && !r.archiveRestoring) {
        // Assets belong to the seat; outstanding consent belongs to its occupant.
        r.game.players[index].ready = false;
        for (const offer of r.game.offers) {
          if (offer.status === "pending" && [offer.payer, offer.quitter, offer.proposer, offer.responder].includes(index)) offer.status = "stale";
        }
        r.game.revision++;
        if (r.game.phase === "negotiation") r.negotiationUntil = Date.now() + negotiationDelay;
      }
      return { ...replacement, position: previous.position };
    }
  });
  function settings(input, previous = { noRepeat: false, bruteShares: true }) {
    fail(input && typeof input === "object" && !Array.isArray(input), "设置无效 / Invalid settings");
    fail(Object.keys(input).every((key) => ["noRepeat", "bruteShares"].includes(key)), "未知设置 / Unknown setting");
    const next = { ...previous };
    for (const key of Object.keys(input)) {
      fail(typeof input[key] === "boolean", "设置必须为开关值 / Settings must be booleans");
      next[key] = input[key];
    }
    return next;
  }
  function capacity(value) {
    fail(Number.isInteger(value) && value >= 3 && value <= 8, "房间人数为 3-8 人 / Rooms hold 3-8 players");
    return value;
  }
  function snapshot(r, viewer) {
    const you = r.seats.indexOf(viewer);
    return {
      type: "state", code: r.code, you, host: r.seats.findIndex((p) => p.token === r.host),
      capacity: r.capacity, settings: r.settings,
      seats: r.seats.map((p) => ({
        socialId: Social.publicId(p), name: p.name, position: p.position, avatar: p.avatar || null,
        bot: Boolean(p.bot), vacant: Boolean(p.vacant), connected: !p.vacant && Boolean(p.bot || online(p)), auto: Boolean(p.auto)
      })),
      control: control.snapshot(r, viewer), game: r.game ? E.publicGame(r.game, you) : null, chat: r.chat
    };
  }
  function broadcast(r) {
    if (closed) return;
    archives.sync(r);
    control.sync(r); r.updated = Date.now();
    if (r.game) r.lastRevision = r.game.revision;
    if (r.game?.phase === "results") {
      const key = `${r.generation}:${r.game.round}`;
      if (r.resultsKey !== key) { r.resultsKey = key; r.resultsUntil = Date.now() + negotiationDelay; }
    }
    for (const p of r.seats) if (!p.bot && !p.vacant) send(p.ws, snapshot(r, p));
    schedule(r);
  }
  const archives = require("./room-archive").createRoomArchive({ kind: "million", rooms, sessions, control, send, stop, broadcast,
    validate: r => r.seats.forEach((_, i) => E.publicGame(r.game, i)) });
  function applyAction(r, actor, action) {
    const previousPhase = r.game.phase;
    E.act(r.game, actor, action);
    if (r.game.phase === "negotiation" && (previousPhase !== "negotiation" || action.type !== "ready")) {
      r.negotiationUntil = Date.now() + negotiationDelay;
    }
  }
  function automatedActors(game) {
    const actors = [];
    if (game.phase === "negotiation") {
      // Answer offers before another bot's ready action can close negotiation.
      for (const offer of game.offers) if (offer.status === "pending" && !actors.includes(offer.responder)) actors.push(offer.responder);
    }
    for (const actor of E.requiredActors(game)) if (!actors.includes(actor)) actors.push(actor);
    return actors;
  }
  const waitingOffline = (r) => E.requiredActors(r.game).some((i) => !r.seats[i].bot && !online(r.seats[i]));
  function schedule(r) {
    const game = r.game;
    if (closed || !game || game.phase === "over" || control.paused(r) || !humansOnline(r) || waitingOffline(r)) { stop(r); return; }
    const actor = automatedActors(game).find((i) => automatic(r.seats[i]));
    if (actor === undefined) { stop(r); return; }
    const player = r.seats[actor], key = `${game.revision}:${actor}:${player.token}:${r.negotiationUntil || 0}`;
    if (r.timer && r.timerKey === key) return;
    stop(r); r.timerKey = key;
    const until = game.phase === "negotiation" ? r.negotiationUntil : game.phase === "results" ? r.resultsUntil : 0;
    const delay = Math.max(botDelay, (until || 0) - Date.now());
    r.timer = setTimeout(() => {
      r.timer = null; r.timerKey = null;
      if (closed || r.game !== game || control.paused(r) || !humansOnline(r) || waitingOffline(r) ||
          `${game.revision}:${actor}:${r.seats[actor]?.token}:${r.negotiationUntil || 0}` !== key ||
          !automatedActors(game).includes(actor) || !automatic(r.seats[actor])) return schedule(r);
      try {
        const action = E.chooseBotAction(game, actor);
        if (!action) return;
        applyAction(r, actor, action); control.touch(r, r.seats[actor]); broadcast(r);
      } catch (error) {
        stop(r);
        for (const p of r.seats) send(p.ws, { type: "error", message: error.message });
      }
    }, delay);
    r.timer.unref?.();
  }
  const openPosition = (r) => Array.from({ length: r.capacity }, (_, i) => i).find((i) => !r.seats.some((p) => p.position === i));
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
      const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before);
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
      position: openPosition(r), bot: true, auto: true, ws: null });
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
          const r = rooms.get(session.room), p = r?.seats.find((seat) => !seat.vacant && seat.token === session.token);
          if (p) { p.ws = ws; if (avatar !== undefined) p.avatar = avatar; broadcast(r); }
          return;
        }
        fail(session && session.ws === ws, "请先连接 / Connect first");
        session.updated = Date.now();
        if (archives.handle(session, ws, d)) return;
        if (d.type === "create") {
          const name = clean(d.name), size = capacity(d.capacity ?? 4), rules = settings(d.settings ?? {});
          fail(name, "请输入名字 / Enter your name");
          detach(session, true);
          if (avatar !== undefined) session.avatar = avatar;
          let code; do { code = "M" + crypto.randomBytes(3).toString("hex").slice(0, 5).toUpperCase(); } while (rooms.has(code));
          const r = { code, host: session.token, capacity: size, settings: rules, game: null, generation: 0, chat: [], updated: Date.now(),
            seats: [{ token: session.token, name, avatar: session.avatar || null, position: 0, bot: false, auto: false, ws }] };
          rooms.set(code, r); session.room = code; broadcast(r); return;
        }
        if (d.type === "join") {
          const r = rooms.get(clean(d.code, 6).toUpperCase()), name = clean(d.name);
          fail(r, "找不到百万美金房间 / Million Dollars room not found"); fail(name, "请输入名字 / Enter your name");
          const existing = r.seats.find((p) => !p.vacant && p.token === session.token);
          fail(existing || control.vacancy(r) >= 0 || (!r.game && r.seats.length < r.capacity), "房间已满 / Room is full");
          if (session.room !== r.code) detach(session, true);
          if (avatar !== undefined) session.avatar = avatar;
          if (existing) { existing.ws = ws; if (avatar !== undefined) existing.avatar = avatar; }
          else {
            const p = { token: session.token, name, avatar: session.avatar || null, position: openPosition(r), bot: false, auto: false, ws };
            const vacant = control.vacancy(r);
            if (vacant >= 0) control.fill(r, vacant, p); else r.seats.push(p);
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
          fail(!r.game || !["negotiation", "snitch"].includes(r.game.phase) ||
            r.game.players[you].slots.some((slot) => !slot.withdrawn), "本轮已退出，请等待结算后聊天 / Withdrawn players can chat after the round");
          const text = clean(d.text, 160);
          if (text) {
            fail(!p.lastChat || Date.now() - p.lastChat >= 500, "发送太快 / Please slow down"); p.lastChat = Date.now();
            r.chat.push({ id: crypto.randomUUID(), playerId: you, name: p.name, text, time: Date.now() }); r.chat = r.chat.slice(-40);
          }
        } else if (d.type === "settings") {
          host(); fail(!r.game, "已经开始 / Already started");
          const rules = settings(d.settings ?? {}, r.settings), size = capacity(d.capacity ?? r.capacity);
          fail(size >= r.seats.length && r.seats.every((seat) => seat.position < size), "已有座位超出人数上限 / Existing seats exceed capacity");
          r.settings = rules; r.capacity = size;
        } else if (d.type === "addBot") { host(); addBot(r); }
        else if (d.type === "fillBots") { host(); fail(!r.game, "已经开始 / Already started"); while (r.seats.length < r.capacity) addBot(r); }
        else if (d.type === "removeBot") {
          host(); fail(!r.game, "已经开始 / Already started");
          const index = r.seats.findIndex((seat) => seat.bot && Social.publicId(seat) === d.target);
          fail(index >= 0, "座位已变化，请重新确认 / Seat changed; confirm again");
          const before = [...r.seats]; r.seats.splice(index, 1); remapChat(r, before);
        } else if (d.type === "start") {
          host(); fail(!r.game && r.seats.length === r.capacity, "请坐满选定人数 / Fill the selected room capacity");
          fail(r.seats.every((seat) => seat.bot || online(seat)), "请等待所有玩家上线 / Wait for everyone to connect");
          const before = [...r.seats]; r.seats.sort((a, b) => a.position - b.position); remapChat(r, before);
          stop(r); r.game = E.createGame(r.seats.map((seat) => seat.name), r.settings); r.generation++;
          r.game.revision = Math.max(r.game.revision, (r.lastRevision ?? -1) + 1); r.negotiationUntil = 0; r.resultsKey = null;
        } else if (d.type === "rematch") {
          host(); fail(r.game?.phase === "over", "本局尚未结束 / Finish this game first");
          stop(r); r.game = null; r.negotiationUntil = 0;
          for (const seat of r.seats) seat.auto = Boolean(seat.bot);
        } else if (d.type === "action") {
          fail(r.game && r.game.phase !== "over", "游戏尚未开始或已结束 / Game is not in progress");
          const action = d.action;
          fail(action && typeof action === "object" && !Array.isArray(action), "行动无效 / Invalid action");
          for (const revision of [d.revision, action.revision]) if (revision !== undefined) {
            fail(Number.isInteger(revision) && revision === r.game.revision, "局面已变化，请重试 / Game changed; try again");
          }
          let actor = you;
          if (r.game.phase === "results" && action.type === "next" && you !== r.game.leader) {
            const leader = r.seats[r.game.leader];
            host(); fail(leader && (leader.bot || !online(leader) || leader.auto), "请等待队长继续 / Wait for the leader to continue");
            actor = r.game.leader;
          }
          applyAction(r, actor, action); control.touch(r, p);
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
    archives.close();
    closed = true; control.close(); clearInterval(heartbeat); rooms.forEach(stop);
    wss.clients.forEach((ws) => ws.terminate()); wss.close();
  });
  return { rooms, broadcast, upgrade(req, socket, head) { wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req)); } };
}
module.exports = { attachMillion };
