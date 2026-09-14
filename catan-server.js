"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const crypto = require("node:crypto");
const E = require("./catan-engine");
const Maps = require("./catan-maps");
const AvatarData = require("./avatar-data");
const Social = require("./game-social"), SocialData = require("./social-data");

function attachCatan(server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 32768,
    perMessageDeflate: { serverNoContextTakeover: true, clientNoContextTakeover: true,
      threshold: 1024, concurrencyLimit: 4, zlibDeflateOptions: { level: 3 } } });
  const rooms = new Map(), sessions = new Map();
  const familiar = ["Connie", "Colin", "Angela", "Stephan", "Zoey", "William", "Tim", "Gary", "Alison"];
  const common = ["Emma", "James", "Olivia", "Daniel", "David", "Sophia", "Michael", "Emily", "Alex", "Sarah", "Ryan", "Anna", "Chris", "Laura"];
  const clean = (s, n = 18) => String(s || "").trim().replace(/\s+/g, " ").slice(0, n);
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const fail = (condition, message) => { if (!condition) throw new Error(message); };
  function roomCode() {
    let code;
    do { code = `C${crypto.randomBytes(3).toString("hex").slice(0, 4).toUpperCase()}`; } while (rooms.has(code));
    return code;
  }
  function snapshot(room, session) {
    const you = room.seats.findIndex((p) => p.token === session.token);
    const swap = room.seatSwap;
    return { type: "state", code: room.code, mapId: room.mapId, layout: room.layout, maxPlayers: room.maxPlayers, you, targetedTrades: true, seatSelection: true,
      host: room.seats.findIndex((p) => p.token === room.host),
      skins: room.skins,
      seats: room.seats.map((p) => ({ socialId: Social.publicId(p), name: p.name, position: p.position, avatar: p.avatar || null, bot: p.bot, connected: p.bot || Boolean(p.ws), auto: p.auto })),
      seatSwap: swap ? { id: swap.id, from: room.seats.findIndex((p) => p.token === swap.from), to: room.seats.findIndex((p) => p.token === swap.to) } : null,
      game: room.game ? E.publicGame(room.game, you) : null, previewBoard: room.game ? null : room.previewBoard, chat: room.chat,
    };
  }
  function openPosition(room) {
    return Array.from({ length: room.maxPlayers }, (_, i) => i).find((position) => !room.seats.some((p) => p.position === position));
  }
  function remapChat(room, previousSeats) {
    // Seat indices become game player IDs at start; chat authors must follow the person.
    room.chat.forEach((message) => {
      const author = previousSeats[message.playerId];
      message.playerId = author ? room.seats.findIndex((p) => p.token === author.token) : -1;
    });
  }
  function clearSeatSwap(room, token) {
    if (room.seatSwap && [room.seatSwap.from, room.seatSwap.to].includes(token)) room.seatSwap = null;
  }
  function chooseSeat(room, seat, position) {
    fail(!room.game, "开局后不能换座 / Seats are locked after starting");
    fail(Number.isInteger(position) && position >= 0 && position < room.maxPlayers, "座位无效 / Invalid seat");
    fail(!room.seatSwap, "请先处理当前换座申请 / Resolve the pending swap first");
    if (seat.position === position) return;
    const target = room.seats.find((p) => p.position === position);
    if (!target || target.bot) {
      if (target) target.position = seat.position;
      seat.position = position;
    } else {
      fail(target.ws?.readyState === WebSocket.OPEN, "对方离线，暂时无法换座 / Player is offline");
      room.seatSwap = { id: crypto.randomUUID(), from: seat.token, to: target.token };
    }
  }
  function broadcast(room) {
    room.updated = Date.now();
    room.seats.forEach((p) => { if (!p.bot && p.ws) send(p.ws, snapshot(room, p)); });
    schedule(room);
  }
  function controlled(p) { return p.bot || p.auto || (!p.ws && Date.now() - p.disconnectedAt > 30000); }
  function schedule(room) {
    clearTimeout(room.timer);
    if (!room.game || room.game.phase === "over" || !room.seats.some((p) => !p.bot && p.ws)) return;
    const g = room.game;
    let actor = -1;
    if (g.phase === "discard") actor = room.seats.findIndex((p, i) => g.discard[i] && controlled(p));
    else if (g.phase === "gold") actor = controlled(room.seats[g.goldQueue[0].id]) ? g.goldQueue[0].id : -1;
    else if (g.trade) actor = room.seats.findIndex((p, i) => controlled(p) && E.canRespondToTrade(g, i));
    if (actor < 0 && controlled(room.seats[g.current]) && !["discard", "gold"].includes(g.phase)) actor = g.current;
    if (actor < 0) {
      if (room.seats.some((p) => !p.bot && !p.ws)) room.timer = setTimeout(() => schedule(room), 3000);
      return;
    }
    const revision = g.revision;
    room.timer = setTimeout(() => {
      if (!rooms.has(room.code) || room.game !== g || g.revision !== revision) return schedule(room);
      try {
        const action = E.chooseBotAction(g, actor);
        if (action) { E.act(g, actor, action); broadcast(room); }
      } catch (error) {
        console.error("Catan bot action failed:", error.message);
        room.seats.filter((p) => !p.bot).forEach((p) => send(p.ws, { type: "error", message: "机器人行动异常，请重新连接 / Bot action failed; reconnect" }));
      }
    }, process.env.CATAN_BOT_DELAY ? Number(process.env.CATAN_BOT_DELAY) : 1100 + crypto.randomInt(950));
    room.timer.unref?.();
  }
  function detach(session, explicit = false) {
    const room = rooms.get(session.room);
    if (!room) return;
    const index = room.seats.findIndex((p) => p.token === session.token);
    if (index < 0) return;
    const seat = room.seats[index];
    seat.ws = null; seat.disconnectedAt = explicit ? 0 : Date.now();
    clearSeatSwap(room, seat.token);
    if (!room.game && explicit) { const before = [...room.seats]; room.seats.splice(index, 1); remapChat(room, before); }
    if (room.host === session.token) {
      const next = room.seats.find((p) => !p.bot && p.ws);
      if (next) room.host = next.token;
    }
    if (explicit) session.room = "";
    if (!room.seats.some((p) => !p.bot)) { clearTimeout(room.timer); rooms.delete(room.code); }
    else broadcast(room);
  }
  function addBot(room) {
    fail(!room.game && room.seats.length < room.maxPlayers, "没有空位 / No open seat");
    const used = room.seats.map((p) => p.name);
    const pool = (Math.random() < .4 ? familiar : common).filter((n) => !used.includes(n));
    const name = pool[crypto.randomInt(pool.length)];
    room.seats.push({ token: crypto.randomUUID(), name, position: openPosition(room), avatar: AvatarData.randomBot(), bot: true, auto: true, ws: null });
  }
  wss.on("connection", (ws) => {
    let session = null;
    ws.alive = true;
    ws.on("pong", () => { ws.alive = true; });
    ws.on("message", (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        const avatar = ["hello", "create", "join", "profile"].includes(data.type) && Object.hasOwn(data, "avatar") ? AvatarData.normalize(data.avatar) : undefined;
        if (data.type === "hello") {
          fail(!session, "连接已初始化 / Already connected");
          session = sessions.get(data.token);
          if (!session) { session = { token: crypto.randomBytes(24).toString("hex"), room: "", updated: Date.now() }; sessions.set(session.token, session); }
          const oldWs = session.ws;
          session.ws = ws; session.updated = Date.now();
          if (avatar !== undefined) session.avatar = avatar;
          if (oldWs && oldWs !== ws) oldWs.close(4001, "Reconnected");
          send(ws, { type: "welcome", token: session.token });
          const room = rooms.get(session.room);
          if (room) {
            const seat = room.seats.find((p) => p.token === session.token);
            if (seat) { seat.ws = ws; seat.auto = false; if (avatar !== undefined) seat.avatar = avatar; if (!room.seats.some((p) => p.token === room.host && p.ws)) room.host = seat.token; broadcast(room); }
          }
          return;
        }
        fail(session && session.ws === ws, "请先连接 / Connect first");
        session.updated = Date.now();
        if (data.type === "create") {
          const name = clean(data.name); fail(name, "请输入名字 / Enter your name");
          const mapId = data.mapId || "base", map = Maps.get(mapId);
          fail(mapId === "base" || map, "未知地图 / Unknown map");
          const layout = data.layout ?? "default";
          fail(["default", "random"].includes(layout), "未知地图模式 / Unknown map layout");
          detach(session, true);
          const room = { code: roomCode(), mapId, layout, host: session.token, maxPlayers: map?.players || (Number(data.seats) === 3 ? 3 : 4), seats: [], seatSwap: null, game: null, chat: [], updated: Date.now(), timer: null };
          room.previewBoard = E.makeBoard(undefined, mapId, layout);
          room.skins = SocialData.normalizeSkins(data.skins); room.previewBoard.skins = room.skins;
          room.seats.push({ token: session.token, name, position: 0, avatar: avatar === undefined ? session.avatar || null : avatar, bot: false, auto: false, ws });
          rooms.set(room.code, room); session.room = room.code; broadcast(room); return;
        }
        if (data.type === "join") {
          const room = rooms.get(clean(data.code, 5).toUpperCase()), name = clean(data.name);
          fail(room, "找不到卡坦岛房间 / Catan room not found"); fail(name, "请输入名字 / Enter your name");
          const existing = room.seats.find((p) => p.token === session.token);
          fail(existing || (!room.game && room.seats.length < room.maxPlayers), "房间已满或已开局 / Room is full or already started");
          if (session.room !== room.code) detach(session, true);
          if (existing) { existing.ws = ws; existing.auto = false; if (avatar !== undefined) existing.avatar = avatar; }
          else room.seats.push({ token: session.token, name, position: openPosition(room), avatar: avatar === undefined ? session.avatar || null : avatar, bot: false, auto: false, ws });
          session.room = room.code;
          if (!room.seats.some((p) => p.token === room.host && p.ws)) room.host = session.token;
          broadcast(room); return;
        }
        const room = rooms.get(session.room);
        fail(room, "请先加入房间 / Join a room first");
        const you = room.seats.findIndex((p) => p.token === session.token);
        fail(you >= 0, "座位不存在 / Seat not found");
        if (data.type === "reaction") {
          const event = Social.reaction(room, room.seats, room.seats[you], data);
          room.seats.forEach((p) => { if (!p.bot) send(p.ws, event); }); return;
        }
        const host = () => fail(room.host === session.token, "仅房主可操作 / Host only");
        if (data.type === "leave") { detach(session, true); send(ws, { type: "left" }); return; }
        if (data.type === "profile") { fail(avatar !== undefined, "请选择头像 / Choose an avatar"); room.seats[you].avatar = avatar; session.avatar = avatar; }
        else if (data.type === "chooseSeat") { chooseSeat(room, room.seats[you], data.position); }
        else if (data.type === "respondSeatSwap") {
          fail(!room.game, "开局后不能换座 / Seats are locked after starting");
          const swap = room.seatSwap;
          fail(swap && swap.id === data.id, "换座申请已失效 / Swap request expired");
          fail(swap.to === session.token && typeof data.accept === "boolean", "仅被邀请的玩家可回应 / Invited player only");
          const from = room.seats.find((p) => p.token === swap.from), to = room.seats[you];
          fail(from && from.ws?.readyState === WebSocket.OPEN, "对方已离线 / Requester is offline");
          if (data.accept) [from.position, to.position] = [to.position, from.position];
          room.seatSwap = null;
        }
        else if (data.type === "cancelSeatSwap") {
          fail(!room.game && room.seatSwap && room.seatSwap.id === data.id && room.seatSwap.from === session.token, "仅申请人可取消 / Requester only");
          room.seatSwap = null;
        }
        else if (data.type === "addBot") { host(); addBot(room); }
        else if (data.type === "fillBots") { host(); fail(!room.game, "游戏已开始 / Game started"); while (room.seats.length < room.maxPlayers) addBot(room); }
        else if (data.type === "removeBot") { host(); fail(!room.game, "游戏已开始 / Game started"); const last = room.seats.findLastIndex((p) => p.bot); if (last >= 0) { const before = [...room.seats]; room.seats.splice(last, 1); remapChat(room, before); } }
        else if (data.type === "start") {
          host(); fail(!room.game && room.seats.length === room.maxPlayers, "座位尚未坐满 / Waiting for all seats to be filled");
          fail(!room.seatSwap, "请先处理当前换座申请 / Resolve the pending swap first");
          const before = [...room.seats]; room.seats.sort((a, b) => a.position - b.position); remapChat(room, before);
          room.game = E.createGame(room.seats.map((p) => p.name), undefined, room.mapId, room.layout, room.previewBoard);
        }
        else if (data.type === "rematch") { host(); fail(room.game?.phase === "over", "游戏尚未结束 / Game not over"); room.game = E.createGame(room.seats.map((p) => p.name), undefined, room.mapId, room.layout); room.game.board.skins = room.skins; }
        else if (data.type === "action") { fail(room.game, "游戏尚未开始 / Game not started"); E.act(room.game, you, data.action || {}); }
        else if (data.type === "auto") { room.seats[you].auto = Boolean(data.enabled); }
        else if (data.type === "chat") {
          const text = clean(data.text, 160);
          if (text) { room.chat.push({ id: crypto.randomUUID(), playerId: you, name: room.seats[you].name, text, time: Date.now() }); room.chat = room.chat.slice(-40); }
        } else throw new Error("未知请求 / Unknown request");
        broadcast(room);
      } catch (error) { send(ws, { type: "error", message: error.message }); }
    });
    ws.on("error", () => ws.close());
    ws.on("close", () => { if (session?.ws === ws) { session.ws = null; detach(session); } });
  });
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => { if (!ws.alive) return ws.terminate(); ws.alive = false; ws.ping(); });
    for (const [code, room] of rooms) if (Date.now() - room.updated > 12 * 3600000 && !room.seats.some((p) => !p.bot && p.ws)) { clearTimeout(room.timer); rooms.delete(code); }
    for (const [token, s] of sessions) if (!s.ws && Date.now() - s.updated > 24 * 3600000) sessions.delete(token);
  }, 30000);
  heartbeat.unref();
  server.on("close", () => { clearInterval(heartbeat); rooms.forEach((r) => clearTimeout(r.timer)); wss.clients.forEach((ws) => ws.terminate()); wss.close(); });
  const previews = new Map([["base", E.makeBoard()], ...Maps.maps.map((map) => [map.id, E.makeBoard(undefined, map.id)])]);
  Maps.maps.forEach((map) => previews.set(`${map.id}:random`, E.makeBoard(undefined, map.id, "random")));
  return { upgrade(request, socket, head) { wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request)); }, rooms, preview: previews.get("base"), previews };
}
module.exports = { attachCatan };
