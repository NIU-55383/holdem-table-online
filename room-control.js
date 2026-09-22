"use strict";
const crypto = require("node:crypto"), Social = require("./game-social"), Avatar = require("./avatar-data");
const requireRule = (value, message) => { if (!value) throw new Error(message); };

function createRoomControl(options) {
  const seats = options.seats || ((r) => r.seats), identity = options.identity || ((p) => p?.token);
  const bot = options.bot || ((p) => p?.bot), connected = options.connected || ((p) => p?.ws?.readyState === 1);
  const host = options.host || ((r) => r.host), setHost = options.setHost || ((r, key) => { r.host = key; });
  const idleMs = Math.max(200, Number(process.env.ROOM_IDLE_MS) || 120000);
  const warningMs = Math.min(idleMs / 2, Math.max(100, Number(process.env.ROOM_WARNING_MS) || 20000));
  const meta = (room) => room.roomControl ||= { pending: null, idle: new Map(), idleAuto: false, timeoutAuto: new Set() };
  const human = (p) => p && !p.vacant && !p.departed && !bot(p);
  const paused = (room) => seats(room).some((p) => p?.vacant);
  function elect(room) {
    const list = seats(room).map((p, index) => ({p, position:p?.position ?? index})).sort((a,b) => a.position-b.position).map(({p}) => p);
    const index = list.findIndex((p) => identity(p) === host(room));
    if (human(list[index]) && connected(list[index])) return false;
    for (let offset = 1; offset <= list.length; offset++) {
      const p = list[(index + offset + list.length) % list.length];
      if (human(p) && connected(p)) { setHost(room, identity(p)); return true; }
    }
    return false;
  }
  function sync(room, now = Date.now()) {
    const m = meta(room), list = seats(room); let changed = elect(room);
    if (m.pending && (m.pending.host !== host(room) || ![m.pending.from, m.pending.to].every((id) => list.some((p) => human(p) && connected(p) && Social.publicId(p) === id)))) { m.pending = null; changed = true; }
    const actors = !paused(room) && options.active(room) ? options.actors(room) : [];
    const key = options.turnKey(room);
    for (const p of list) {
      if (!human(p) || !connected(p) || !m.idleAuto || p.auto || !actors.includes(list.indexOf(p))) { m.idle.delete(p); continue; }
      if (m.idle.get(p)?.key !== key) m.idle.set(p, { key, deadline: now + idleMs, warned: false });
    }
    for (const p of m.idle.keys()) if (!list.includes(p)) m.idle.delete(p);
    for (const p of m.timeoutAuto) if (!list.includes(p) || !p.auto) m.timeoutAuto.delete(p);
    return changed;
  }
  function snapshot(room, viewer) {
    const m = meta(room), idle = m.idle.get(viewer);
    return { code: room.code, you: Social.publicId(viewer), host: seats(room).find((p) => identity(p) === host(room)) ? Social.publicId(seats(room).find((p) => identity(p) === host(room))) : null,
      started: options.started(room), paused: paused(room), auto: Boolean(viewer.auto), idleAuto: m.idleAuto, now: Date.now(),
      warning: idle ? { warnAt: idle.deadline - warningMs, deadline: idle.deadline } : null,
      pending: m.pending ? { id: m.pending.id, from: m.pending.from, to: m.pending.to, next: m.pending.next } : null,
      seats: seats(room).map((p, index) => p ? { id: Social.publicId(p), index, position: p.position ?? index, name: p.name, avatar: p.avatar || null, bot: Boolean(bot(p)), vacant: Boolean(p.vacant), connected: !p.vacant && Boolean(bot(p) || connected(p)) } : null) };
  }
  function vacancy(room) { return seats(room).findIndex((p) => p?.vacant); }
  function fill(room, index, replacement) {
    const old = seats(room)[index]; requireRule(old?.vacant, "空位已被占用 / Seat already filled");
    const next = options.replace ? options.replace(room, index, old, replacement) : { ...replacement, position: old.position };
    seats(room)[index] = next;
    if (room.game?.players?.[index]) room.game.players[index].name = next.name;
    meta(room).idle.clear();
    return next;
  }
  function touch(room, player) { meta(room).idle.delete(player); }
  function guard(room) { requireRule(!paused(room), "空位待补齐，游戏暂停 / Game paused until all empty seats are filled"); }
  function handle(room, sender, data) {
    if (data.type !== "roomControl") return false;
    sync(room);
    const list = seats(room), m = meta(room), own = Social.publicId(sender), isHost = host(room) === identity(sender);
    requireRule(human(sender) && connected(sender), "连接已失效 / No active seat");
    const target = list.find((p) => p && Social.publicId(p) === data.target);
    if (data.action === "transfer" || data.action === "requestHost") {
      requireRule(!m.pending, "请先处理当前房主申请 / Resolve the pending host request");
      const receiver = data.action === "transfer" ? target : list.find((p) => identity(p) === host(room));
      requireRule(data.action !== "transfer" || isHost, "仅房主可转让 / Host only");
      requireRule(receiver !== sender && human(receiver) && connected(receiver), "请选择在线真人 / Choose an online human");
      m.pending = { id: crypto.randomUUID(), host: host(room), from: own, to: Social.publicId(receiver), next: data.action === "transfer" ? Social.publicId(receiver) : own };
    } else if (data.action === "respond") {
      const p = m.pending;
      requireRule(p && p.id === data.id && p.to === own && typeof data.accept === "boolean", "房主申请已失效 / Host request expired");
      if (data.accept) { const next = list.find((s) => s && Social.publicId(s) === p.next); requireRule(human(next) && connected(next), "对方已离线 / Player offline"); setHost(room, identity(next)); }
      m.pending = null;
    } else if (data.action === "cancel") {
      requireRule(m.pending?.from === own && m.pending.id === data.id, "不能撤回此申请 / Cannot cancel this request"); m.pending = null;
    } else if (data.action === "kick") {
      requireRule(isHost && options.started(room), "仅开局后的房主可移除玩家 / Host only, after start");
      requireRule(target && target !== sender && !target.vacant, "请选择其他玩家 / Choose another player");
      options.stop(room); const index = list.indexOf(target);
      m.pending = null; m.idle.clear(); room.seatSwap = null; room.pending = null;
      options.remove(room, target);
      const empty = { token: crypto.randomUUID(), name: "空位 / Open seat", avatar: null, bot: false, vacant: true, auto: false, ready: false, ws: null, position: target.position };
      list[index] = options.replace ? options.replace(room, index, target, empty) : empty;
      if (room.game?.players?.[index]) room.game.players[index].name = empty.name;
      for (const message of room.chat || []) if (message.playerId === index) { message.name ||= target.name; message.playerId = -1; }
    } else if (data.action === "fillBot") {
      requireRule(isHost && target?.vacant, "仅房主可补机器人 / Host only; select an empty seat");
      const familiar = ["Connie", "Colin", "Angela", "Stephan", "Zoey", "William", "Tim", "Gary", "Alison"];
      const common = ["Emma", "Alex", "Laura", "Sarah", "Olivia", "James", "Daniel", "David", "Sophia", "Emily", "Michael", "Ryan", "Anna", "Chris"];
      const available = (crypto.randomInt(10) < 4 ? familiar : common).filter((n) => !list.some((p) => p?.name === n));
      fill(room, list.indexOf(target), { token: crypto.randomUUID(), name: available[crypto.randomInt(available.length)] || "Bot", avatar: Avatar.randomBot(), bot: true, auto: true, ready: true, ws: null });
    } else if (data.action === "idleAuto") {
      requireRule(isHost, "仅房主可设置全员超时托管 / Host only: room-wide idle auto-play");
      requireRule(typeof data.enabled === "boolean", "请选择开启或关闭 / Choose on or off");
      if (m.idleAuto !== data.enabled) {
        m.idleAuto = data.enabled; m.idle.clear();
        if (!data.enabled) {
          if (m.timeoutAuto.size) options.stop(room);
          for (const p of m.timeoutAuto) p.auto = false;
          m.timeoutAuto.clear();
        }
      }
    } else if (data.action === "auto") {
      requireRule(options.started(room) && typeof data.enabled === "boolean", "游戏开始后才可托管 / Start the game first");
      options.stop(room); m.timeoutAuto.delete(sender); sender.auto = data.enabled; touch(room, sender);
    } else if (data.action === "stay") {
      requireRule(sender.auto || m.idle.has(sender), "当前无需取消托管 / No pending auto-play");
      if (sender.auto) options.stop(room);
      m.timeoutAuto.delete(sender); sender.auto = false; touch(room, sender);
    } else throw new Error("未知房间操作 / Unknown room action");
    options.changed(room); return true;
  }
  const timer = setInterval(() => {
    for (const room of options.rooms.values()) {
      const now = Date.now(); let changed = sync(room, now);
      for (const [p, idle] of meta(room).idle) {
        if (now >= idle.deadline) { p.auto = true; meta(room).timeoutAuto.add(p); meta(room).idle.delete(p); options.stop(room); changed = true; }
        else if (!idle.warned && now >= idle.deadline - warningMs) { idle.warned = true; changed = true; }
      }
      if (changed) options.changed(room);
    }
  }, Math.min(1000, Math.max(25, idleMs / 10)));
  timer.unref();
  return { sync, snapshot, handle, vacancy, fill, touch, guard, paused, elect, close: () => clearInterval(timer) };
}
module.exports = { createRoomControl };
