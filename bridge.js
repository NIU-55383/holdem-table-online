"use strict";
(() => {
  const $ = (s) => document.querySelector(s), esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dirs = ["北 / N", "东 / E", "南 / S", "西 / W"], symbols = { S: "♠", H: "♥", D: "♦", C: "♣", NT: "NT" };
  const suitNames = ["黑桃 / Spades", "红桃 / Hearts", "方块 / Diamonds", "梅花 / Clubs"], ranks = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
  let state = null, ws, token = "", level = 1, selected = null, busy = false, lastKey = "", reconnectTimer, review = false;
  const bubbles = new Map(); let bubbleTimer;
  const audio = BridgeAudio.create(), avatarPicker = BoardGameUI.mountAvatarPicker($("#avatarPicker"), $("#playerName"));
  try { token = sessionStorage.getItem("bridge-token") || ""; $("#playerName").value = localStorage.getItem("boardclub-name") || ""; } catch {}
  $("#roomInput").value = new URLSearchParams(location.search).get("room") || "";
  const send = (data) => { if (ws?.readyState !== WebSocket.OPEN) { error("连接已断开，正在重连 / Disconnected; reconnecting"); return false; } ws.send(JSON.stringify(data)); return true; };
  const social = BoardGameUI.mountInteractions(() => ({ code: state?.code, players: state?.seats || [], you: state?.seats[state.you]?.socialId, connected: ws?.readyState === WebSocket.OPEN }), send, { audio, onSoundChange: renderSound });
  const management = BoardGameUI.mountRoomControl(() => state?.control, send, () => $("#roomTools"));
  function icons() { window.lucide?.createIcons(); }
  function error(message) { $("#error").textContent = message || ""; }
  function renderSound() {
    $("#soundBtn").innerHTML = `<i data-lucide="${audio.muted ? "volume-x" : "volume-2"}"></i>`;
    $("#soundBtn").title = $("#soundBtn").ariaLabel = audio.muted ? "开启音效 / Unmute" : "关闭音效 / Mute";
    $("#mute").checked = audio.muted; $("#volume").value = Math.round(audio.volume * 100); $("#volumeValue").value = `${Math.round(audio.volume * 100)}%`; icons();
  }
  document.addEventListener("pointerdown", () => audio.unlock(), { passive: true }); document.addEventListener("keydown", () => audio.unlock());
  document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); });
  function callHTML(call) {
    if (["P", "X", "XX"].includes(call)) return call === "P" ? "Pass" : call;
    const s = call.slice(1); return `<span class="${s === "H" || s === "D" ? "call-red" : ""}">${esc(call[0])}${symbols[s] || esc(s)}</span>`;
  }
  function contractHTML(c) { return !c ? "—" : c === "Passout" ? "全不叫 / Passed out" : `${c.level}${symbols[c.strain]}${c.redoubled ? " XX" : c.doubled ? " X" : ""}`; }
  function cardHTML(id, playable = false, isSelected = false, tag = "button") {
    const suit = Math.floor(id / 13), rank = ranks[id % 13], symbol = ["♠", "♥", "♦", "♣"][suit];
    return `<${tag} class="playing-card ${suit === 1 || suit === 2 ? "red" : ""} ${playable ? "playable" : ""} ${isSelected ? "selected" : ""}" ${tag === "button" ? `data-card="${id}" ${!playable ? "disabled" : ""} aria-pressed="${isSelected}"` : ""} aria-label="${suitNames[suit]} ${rank}"><span class="rank">${rank}</span><span class="suit" aria-hidden="true">${symbol}</span></${tag}>`;
  }
  const playerName = (seat) => state?.seats[seat]?.name || "—";
  const positionClass = (seat) => ["bottom", "left", "top", "right"][(state.seats[seat].position - state.seats[state.you].position + 4) % 4];
  function vulnerability(g) { return ["VNv", "VV"].includes(g.vulnerability) ? (["NvV", "VV"].includes(g.vulnerability) ? "双方有局 / Both vulnerable" : "南北有局 / NS vulnerable") : g.vulnerability === "NvV" ? "东西有局 / EW vulnerable" : "双方无局 / Neither vulnerable"; }
  function seatHTML(p, seat) {
    const g = state.game, active = g && ["play", "auction"].includes(g.phase) && g.current === seat;
    const role = g?.contract && g.contract !== "Passout" ? g.dummy === seat ? "明手 / Dummy" : ["N", "E", "S", "W"].indexOf(g.contract.declarer) === seat ? "庄家 / Declarer" : "防家 / Defender" : "";
    const bubble = bubbles.get(p.socialId);
    return `<div class="seat seat-${positionClass(seat)} ${active ? "active" : ""}">${BoardGameUI.avatar(p, p.connected, "bridge-avatar", seat === state.you)}<div class="seat-info"><strong class="seat-name">${esc(playerName(seat))}</strong><span class="seat-detail">${dirs[p.position]}${seat === state.you ? " · 你 / You" : ""}</span><span class="seat-detail">${p.vacant ? "空位 / Open" : p.connected ? "在线 / Online" : "离线 / Offline"}${p.auto ? " · Auto" : ""}</span>${g ? `<span class="seat-detail"><span class="card-back-mini"></span>${g.counts[seat]} · ${role}</span>` : ""}</div>${bubble && bubble.until > Date.now() ? `<span class="player-chat">${esc(bubble.text)}</span>` : ""}</div>`;
  }
  function renderTable() {
    if (!state) return;
    const g = state.game;
    $("#table").innerHTML = state.seats.map(seatHTML).join("") + `<div class="trick-center">${g?.trick.length ? g.trick.map((p) => `<div class="played played-${positionClass(p.seat)}">${cardHTML(p.card, false, false, "span")}</div>`).join("") : `<div class="center-label"><small>${g ? `第 ${g.board} 副 / Board ${g.board}` : "南北 × 东西 / NS × EW"}</small><strong>${g?.phase === "auction" ? "叫牌 / Auction" : g ? contractHTML(g.contract) : "BRIDGE"}</strong><small>${g?.phase === "play" ? "领出 / Lead" : g ? "" : "四人搭档 / Four players"}</small></div>`}</div>`;
    if (!g) { $("#turnStatus").textContent = "选择座位，南北与东西分别搭档 / Choose seats: NS vs EW"; return; }
    $("#boardMeta").innerHTML = `<span>第 ${g.board} / ${state.boards} 副 · Board ${g.board} / ${state.boards}</span><span>发牌 / Dealer ${dirs[g.dealer]}</span><span class="${g.vulnerability !== "NvNv" ? "vulnerable" : ""}">${vulnerability(g)}</span>`;
    const name = esc(playerName(g.current)); let status;
    if (state.control.paused) status = "有座位空缺，牌局暂停 / Open seat: play paused";
    else if (g.phase === "over") status = g.contract === "Passout" ? "全员不叫，本副零分 / Passed out: no score" : `本副结束 · 南北 ${g.won[0]} 墩 / NS · 东西 ${g.won[1]} 墩 / EW`;
    else if (g.phase === "trick") status = `${name} 赢得第 ${g.tricks.length} 墩 / wins trick ${g.tricks.length}`;
    else if (g.controller === state.you) status = g.phase === "auction" ? "轮到你叫牌 / Your call" : g.current === g.dummy ? "轮到你替明手出牌 / Play from dummy" : !g.dummyVisible ? "轮到你首攻 / Your opening lead" : "轮到你出牌 / Your turn to play";
    else status = `${name} · ${g.phase === "auction" ? "正在叫牌 / Calling" : g.current === g.dummy ? `明手，由 ${esc(playerName(g.controller))} 出牌 / Dummy, played by declarer` : "正在出牌 / Playing"}`;
    $("#turnStatus").innerHTML = status;
    $("#turnStatus").classList.toggle("your-turn", !state.control.paused && g.controller === state.you);
  }
  function renderLobby() {
    $("#lobby").hidden = Boolean(state.game);
    if (state.game) return;
    $("#lobbySeats").innerHTML = [0, 1, 2, 3].map((pos) => {
      const i = state.seats.findIndex((s) => s.position === pos), p = state.seats[i];
      return `<div class="lobby-seat">${p ? BoardGameUI.avatar(p, p.connected, "bridge-avatar", i === state.you) : '<span class="open-seat">＋</span>'}<div class="seat-info"><strong>${dirs[pos]} · ${p ? esc(p.name) : "空位 / Open"}</strong><small>${pos % 2 === 0 ? "南北搭档 / NS" : "东西搭档 / EW"}${p ? ` · ${p.bot ? "机器人 / Bot" : p.connected ? "在线 / Online" : "离线 / Offline"}` : ""}</small></div>${i !== state.you ? `<button data-seat="${pos}" ${state.seatSwap ? "disabled" : ""} title="${p && !p.bot ? "申请换座 / Request swap" : "选择座位 / Take seat"}"><i data-lucide="arrow-left-right"></i></button>` : ""}${p?.bot && state.host === state.you ? `<button data-remove="${esc(p.socialId)}" title="移除机器人 / Remove bot" aria-label="移除 ${esc(p.name)} / Remove bot"><i data-lucide="user-minus"></i></button>` : ""}</div>`;
    }).join("");
    $("#fillBtn").hidden = state.host !== state.you; $("#fillBtn").disabled = state.seats.length >= 4;
    $("#startBtn").hidden = state.host !== state.you; $("#startBtn").disabled = state.seats.length !== 4 || Boolean(state.seatSwap);
    const swap = state.seatSwap;
    $("#swapRequest").innerHTML = swap ? `<div class="swap-request">${esc(playerName(swap.from))} ↔ ${esc(playerName(swap.to))}<br>换座申请 / Seat swap${swap.to === state.you ? '<div><button data-swap="yes">同意 / Accept</button><button data-swap="no">拒绝 / Decline</button></div>' : swap.from === state.you ? '<div><button data-swap="cancel">取消 / Cancel</button></div>' : ""}</div>` : "";
  }
  function renderHand(id, cards, title, english, seat, dummy) {
    const el = $(id), g = state.game; el.hidden = !cards;
    if (!cards) return;
    const active = g.phase === "play" && g.controller === state.you && g.current === seat && !state.control.paused;
    const sorted = [...cards].sort((a, b) => a - b);
    el.classList.toggle("dummy-hand", Boolean(dummy));
    el.innerHTML = `<div class="hand-heading"><h2>${title}<small>${english}</small></h2><span>${dirs[seat]} · ${esc(playerName(seat))}</span></div><div class="hand-cards">${sorted.map((c) => cardHTML(c, active && g.legalCards.includes(c) && !busy, selected === c)).join("")}</div>${active ? `<div class="hand-actions"><span class="selection-hint">${g.trick.length ? `跟牌 / Follow ${symbols[["S", "H", "D", "C"][Math.floor(g.trick[0].card / 13)]]}` : "领出一张牌 / Lead a card"}</span><button data-play class="primary" ${selected === null || busy ? "disabled" : ""}><i data-lucide="arrow-up"></i>出牌 / Play</button></div>` : ""}`;
  }
  function renderAuction() {
    const g = state.game; $("#biddingPanel").hidden = !g;
    if (!g) return;
    const legal = g.legalCalls, active = g.phase === "auction" && g.controller === state.you && !state.control.paused && !busy;
    if (!legal.some((c) => c.startsWith(String(level)))) level = Number(legal.find((c) => /^[1-7]/.test(c))?.[0]) || 1;
    $("#bidControls").hidden = g.phase !== "auction";
    $("#bidControls").innerHTML = `<div class="level-picker" role="group" aria-label="阶数 / Level">${[1, 2, 3, 4, 5, 6, 7].map((l) => `<button data-level="${l}" aria-pressed="${l === level}" ${!active || !legal.some((c) => c.startsWith(String(l))) ? "disabled" : ""}>${l}</button>`).join("")}</div><div class="strain-picker">${["C", "D", "H", "S", "NT"].map((s) => `<button class="${s === "D" || s === "H" ? "red" : ""}" data-call="${level}${s}" ${!active || !legal.includes(`${level}${s}`) ? "disabled" : ""} aria-label="${level}${s}">${symbols[s]}</button>`).join("")}</div><div class="other-calls">${[["P", "不叫 / Pass"], ["X", "加倍 X"], ["XX", "再加倍 XX"]].map(([c, label]) => `<button data-call="${c}" ${!active || !legal.includes(c) ? "disabled" : ""} title="${c === "X" ? "Double" : c === "XX" ? "Redouble" : "Pass"}">${label}</button>`).join("")}</div>`;
    const cells = [...Array(g.dealer).fill(null), ...g.auction];
    while (cells.length % 4) cells.push(null);
    $("#auction").innerHTML = `<table class="auction-table"><thead><tr>${dirs.map((d, i) => `<th class="${i === g.dealer ? "dealer" : ""}">${d}</th>`).join("")}</tr></thead><tbody>${Array.from({ length: cells.length / 4 }, (_, row) => `<tr>${cells.slice(row * 4, row * 4 + 4).map((a) => `<td>${a ? callHTML(a.call) : "·"}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    $("#auction").scrollTop = $("#auction").scrollHeight;
  }
  function renderContract() {
    const g = state.game, c = g?.contract;
    $("#contractPanel").hidden = !c || c === "Passout";
    if (c && c !== "Passout") {
      const declarer = ["N", "E", "S", "W"].indexOf(c.declarer);
      $("#contractPanel").innerHTML = `<div class="contract-title"><strong>${contractHTML(c)}</strong><small>定约 / Contract</small></div><p class="contract-note">庄家 / Declarer: <b>${esc(playerName(declarer))}</b><br>目标 / Target: <b>${c.level + 6} 墩 / tricks</b></p><div class="trick-totals"><span>南北 / NS <strong>${g.won[0]}</strong></span><span>东西 / EW <strong>${g.won[1]}</strong></span></div>${g.lastTrick ? `<button id="lastTrickBtn" class="review-button"><i data-lucide="history"></i>上一墩 / Last trick</button><div id="lastTrickCards" hidden>${g.lastTrick.cards.map((p) => `<span>${dirs[p.seat]} ${cardHTML(p.card, false, false, "span")}</span>`).join("")}<p>${esc(playerName(g.lastTrick.winner))} 赢墩 / won</p></div>` : ""}`;
    }
  }
  function renderResult() {
    const g = state.game; $("#resultPanel").hidden = g?.phase !== "over";
    if (g?.phase !== "over") return;
    const total = state.scores.reduce((s, b) => s + b.score, 0), complete = g.board === state.boards;
    const winner = (complete ? total : g.result.score) > 0 ? 0 : 1;
    const winningNames = [winner, winner + 2].map(playerName).map(esc).join(" & ");
    const draw = (complete ? total : g.result.score) === 0;
    const outcome = g.result.result === 0 ? "完成 / Made" : g.result.result > 0 ? `超 ${g.result.result} 墩 / ${g.result.result} overtricks` : `宕 ${-g.result.result} 墩 / Down ${-g.result.result}`;
    $("#resultPanel").innerHTML = `<h2>${draw ? "平局 / Draw" : `${winningNames}<br>胜利 / win${complete ? " the match" : " this board"}`}</h2><div class="result-score">${g.result.score >= 0 ? "+" : ""}${g.result.score}<small> NS</small></div><p>${contractHTML(g.contract)}${g.contract !== "Passout" ? ` · ${g.result.tricksTaken} 墩 / tricks · ${outcome}` : ""}</p><button id="reviewBtn" class="wide"><i data-lucide="eye"></i>四家手牌 / All hands</button>${state.host === state.you ? `<button id="nextBtn" class="primary wide" style="margin-top:8px" ${state.control.paused ? "disabled" : ""}><i data-lucide="${complete ? "rotate-cw" : "arrow-right"}"></i>${complete ? "再来一场 / New match" : "下一副 / Next board"}</button>` : "<p>等待房主继续 / Waiting for the host</p>"}`;
  }
  function renderReview() {
    const g = state?.game; $("#reviewPanel").hidden = !review || !g?.originalHands;
    if (review && g?.originalHands) $("#reviewPanel").innerHTML = `<div class="review-hands">${g.originalHands.map((h, seat) => `<section><h3>${dirs[seat]} · ${esc(playerName(seat))}</h3><div class="hand-cards">${h.map((c) => cardHTML(c, false, false, "span")).join("")}</div></section>`).join("")}</div>`;
  }
  function render() {
    $("#setup").hidden = Boolean(state); $("#roomPanel").hidden = !state;
    if (!state) {
      $("#table").innerHTML = '<img class="table-intro" src="bridge-art.svg" alt="桥牌牌桌 / Bridge table">';
      $("#boardMeta").innerHTML = '<span>四人定约桥牌 / Contract Bridge</span><span>南北 × 东西 / NS × EW</span>';
      $("#turnStatus").textContent = "等待入座 / Waiting for players"; $("#turnStatus").classList.remove("your-turn");
      ["#handPanel", "#dummyPanel", "#reviewPanel"].forEach((s) => $(s).hidden = true); social.sync(); management.sync(); return;
    }
    $("#roomCode").textContent = state.code;
    renderTable(); renderLobby(); renderAuction(); renderContract(); renderResult(); renderReview();
    const g = state.game;
    $("#handPanel").hidden = !g; $("#dummyPanel").hidden = true;
    if (g) {
      renderHand("#handPanel", g.hands[state.you], g.dummy === state.you ? "你的手牌 · 明手" : "你的手牌", g.dummy === state.you ? "Your hand · Dummy" : "Your hand", state.you, false);
      if (g.dummyVisible && g.dummy !== state.you && g.phase !== "over") renderHand("#dummyPanel", g.hands[g.dummy], "明手", "Dummy", g.dummy, true);
    }
    const totals = state.scores.reduce((s, b) => [s[0] + Math.max(b.score, 0), s[1] + Math.max(-b.score, 0)], [0, 0]);
    $("#totalScore").textContent = `NS ${totals[0]} : ${totals[1]} EW`;
    $("#scores").innerHTML = `<table class="score-table"><thead><tr><th>副 / Board</th><th>定约 / Contract</th><th>NS</th><th>EW</th></tr></thead><tbody>${state.scores.map((s) => `<tr><td>${s.board}</td><td>${contractHTML(s.contract)}</td><td>${Math.max(s.score, 0)}</td><td>${Math.max(-s.score, 0)}</td></tr>`).join("")}</tbody></table>`;
    $("#messages").innerHTML = state.chat.map((m) => `<p><b>${esc(m.name)}</b>${esc(m.text)}</p>`).join(""); $("#messages").scrollTop = $("#messages").scrollHeight;
    social.sync(); management.sync(); icons();
  }
  function receive(next) {
    const old = state, g = next.game, key = g ? `${next.code}:${g.board}:${g.revision}` : "";
    const changed = key !== lastKey;
    if (!old || old.code !== next.code || old.game?.board !== g?.board) { bubbles.clear(); review = false; }
    if (old?.code === next.code) {
      const seen = new Set(old.chat.map((m) => m.id));
      next.chat.filter((m) => !seen.has(m.id) && Date.now() - m.time < 6000).forEach((m) => { const p = next.seats[m.playerId]; if (p) bubbles.set(p.socialId, { text: m.text, until: Date.now() + 6000 }); });
    }
    if (changed) { selected = null; busy = false; }
    state = next;
    if (old?.code === next.code && old.game?.board === g?.board && changed) {
      if (g.phase === "over") audio.play("victory");
      else if (g.controller === next.you && old.game.controller !== next.you) audio.play("turn");
      else if (g.event) audio.play(g.event.kind);
    }
    lastKey = key; render();
    clearTimeout(bubbleTimer); if (bubbles.size) bubbleTimer = setTimeout(() => { bubbles.clear(); if (state) renderTable(); }, 6100);
  }
  function connect() {
    clearTimeout(reconnectTimer); ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/bridge-ws`);
    ws.addEventListener("open", () => { $("#connection").textContent = "已连接 / Connected"; send({ type: "hello", token, avatar: BoardGameUI.getAvatar() }); });
    ws.addEventListener("message", (event) => {
      const d = JSON.parse(event.data);
      if (d.type === "welcome") { token = d.token; try { sessionStorage.setItem("bridge-token", token); } catch {} }
      else if (d.type === "state") { error(""); receive(d); }
      else if (d.type === "reaction") social.receive(d);
      else if (d.type === "error") { busy = false; error(d.message); render(); }
      else if (d.type === "left") { state = null; selected = null; lastKey = ""; bubbles.clear(); review = false; history.replaceState(null, "", "bridge.html"); render(); error(d.reason || ""); }
    });
    ws.addEventListener("close", (event) => {
      $("#connection").textContent = "离线 / Offline"; busy = false; audio.stop(); lastKey = ""; social.sync();
      if (event.code === 4001) error("此账号已在另一连接打开 / Session opened elsewhere"); else { state = null; render(); reconnectTimer = setTimeout(connect, 1500); }
    });
    ws.addEventListener("error", () => {});
  }
  function identity() {
    const name = $("#playerName").value.trim(); if (!name) { error("请输入名字 / Enter your name"); $("#playerName").focus(); return null; }
    try { localStorage.setItem("boardclub-name", name); } catch {} return { name, avatar: BoardGameUI.getAvatar() };
  }
  function act(action) { if (busy || !state?.game || state.control.paused) return; busy = true; if (!send({ type: "action", action: { ...action, revision: state.game.revision } })) busy = false; render(); }
  $("#createBtn").addEventListener("click", () => { const who = identity(); if (who) send({ type: "create", ...who, boards: Number($("#boardCount").value) }); });
  $("#joinForm").addEventListener("submit", (e) => { e.preventDefault(); const who = identity(); if (who) send({ type: "join", ...who, code: $("#roomInput").value }); });
  $("#fillBtn").addEventListener("click", () => send({ type: "fillBots" })); $("#startBtn").addEventListener("click", () => send({ type: "start" }));
  $("#leaveBtn").addEventListener("click", () => $("#confirmDialog").showModal());
  $("#confirmLeave").addEventListener("click", () => { $("#confirmDialog").close(); send({ type: "leave" }); });
  $("#copyBtn").addEventListener("click", async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${state.code}`); $("#copyBtn").title = "已复制 / Copied"; } catch { error(`房间号 / Room code: ${state.code}`); } });
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); if (send({ type: "chat", text: $("#chatText").value })) $("#chatText").value = ""; });
  $("#rulesBtn").addEventListener("click", () => $("#rulesDialog").showModal());
  $("#settingsBtn").addEventListener("click", () => { renderSound(); $("#settingsDialog").showModal(); });
  $("#soundBtn").addEventListener("click", () => { audio.setMuted(!audio.muted); renderSound(); });
  $("#mute").addEventListener("change", (e) => { audio.setMuted(e.target.checked); renderSound(); });
  $("#volume").addEventListener("input", (e) => { audio.setVolume(Number(e.target.value) / 100); renderSound(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    if (b.dataset.close) $("#" + b.dataset.close).close();
    if (b.dataset.level) { level = Number(b.dataset.level); renderAuction(); $(`[data-level="${level}"]`)?.focus({ preventScroll: true }); }
    if (b.dataset.call) act({ type: "call", call: b.dataset.call });
    if (b.dataset.card !== undefined) { selected = Number(b.dataset.card); render(); $(".playing-card.selected")?.focus({ preventScroll: true }); }
    if (b.hasAttribute("data-play") && selected !== null) act({ type: "play", card: selected });
    if (b.dataset.seat !== undefined) send({ type: "chooseSeat", position: Number(b.dataset.seat) });
    if (b.dataset.swap && state.seatSwap) send({ type: b.dataset.swap === "cancel" ? "cancelSeatSwap" : "respondSeatSwap", id: state.seatSwap.id, accept: b.dataset.swap === "yes" });
    if (b.dataset.remove) {
      const code = state.code, target = b.dataset.remove, name = state.seats.find((p) => p.socialId === target)?.name;
      BoardGameUI.confirmRemoval({ name, started: false, valid: () => state?.code === code && !state.game && state.host === state.you && state.seats.some((p) => p.socialId === target && p.bot), remove: () => send({ type: "removeBot", target }) });
    }
    if (b.id === "nextBtn") { review = false; send({ type: state.game.board === state.boards ? "rematch" : "next" }); }
    if (b.id === "reviewBtn") { review = !review; renderReview(); }
    if (b.id === "lastTrickBtn") $("#lastTrickCards").hidden = !$("#lastTrickCards").hidden;
  });
  window.addEventListener("board-avatar-change", (e) => { if (state) send({ type: "profile", avatar: e.detail.avatar }); });
  renderSound(); icons(); connect();
})();
