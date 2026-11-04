"use strict";
(() => {
  const $ = id => document.getElementById(id), UI = window.BoardGameUI, D = window.MillionData;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const icons = () => window.lucide?.createIcons();
  const icon = name => `<i data-lucide="${name}"></i>`;
  const cash = n => `${Number(n).toLocaleString("en-US")}万`;
  const dollars = n => `$${Number((n / 100).toFixed(2))}M`;
  const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
  const write = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
  const sessionKey = "boardclub-million-session", params = new URLSearchParams(location.search);
  const short = {
    driver: ["每个其他分赃角色付你100万", "Collect $1M per other sharing role"],
    brute: ["保证金必退；唯一且未被点名才得威胁卡", "Ante always returned; threat if unique and unnamed"],
    crook: ["从分赃的暴徒拿走200万", "Take $2M from a sharing Brute"],
    snitch: ["唯一时必须点名；最后独存扣300万、不分赃", "If unique, must name; left alone: lose $3M, no loot"],
    mastermind: ["赃款增加200万再平分", "Add $2M to the loot before splitting"]
  };
  let state = null, socket, reconnectTimer, pendingTimer, busy = false, picked = [], draftKey = "", drafts = {}, confirmRequest;
  let firstState = true, bubbleTimer;
  const seenChat = new Set(), bubbles = new Map();
  function synth(ctx, dest, kind) {
    if (!['deal', 'phase', 'victory'].includes(kind)) return BoardGameAudio.synthesize(ctx, dest, kind);
    const notes = kind === 'deal' ? [587, 784] : kind === 'victory' ? [523, 659, 784, 1047] : [392, 523, 659], nodes = [];
    notes.forEach((frequency, i) => { const o = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime + i * .12; o.type = 'sine'; o.frequency.value = frequency; gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.11, t + .015); gain.gain.exponentialRampToValueAtTime(.0001, t + .3); o.connect(gain); gain.connect(dest); o.start(t); o.stop(t + .31); nodes.push(o, gain); o.onended = () => { o.disconnect(); gain.disconnect(); }; });
    return { duration: .8, stop() { nodes.forEach(n => { try { n.stop?.(); n.disconnect(); } catch {} }); } };
  }
  const audio = BoardGameAudio.create({ render: synth, sounds: { ...BoardGameAudio.durations, deal: .8, phase: .8, victory: .8 } });
  const live = () => socket?.readyState === WebSocket.OPEN;
  const social = UI.mountInteractions(() => state && ({ code: state.code, players: state.seats, you: state.seats[state.you]?.socialId, connected: live() }), send, { audio, onSoundChange: soundButton });
  const management = UI.mountRoomControl(() => state?.control, send, () => $("roomTools"));
  const archives = BoardGameArchives.mount({ game: "million", send, view: () => state?.control, name: () => $("playerName").value, anchor: $("setup") });
  const pname = index => state?.seats[index]?.name || "Player";
  function roleTag(id, faded = false) { const r = D.ROLES[id]; return r ? `<span class="role-tag role-${id}${faded ? " faded" : ""}">${esc(r.zh)} <small>${esc(r.en)}</small></span>` : `<span class="hidden-role">${icon("lock-keyhole")}身份保密 / Hidden</span>`; }
  function roleCard(id, selectable, disabled = false) {
    const r = D.ROLES[id];
    const attrs = selectable
      ? `data-pick="${id}" aria-pressed="${picked.includes(id)}" ${disabled ? "disabled" : ""}`
      : `data-rules-game="million" data-rules-section="role-${id}" title="${r.zh}规则 / ${r.en} rules"`;
    return `<button type="button" class="role-card role-${id}${selectable && picked.includes(id) ? " selected" : ""}${!selectable && disabled ? " inactive" : ""}" ${attrs}><svg viewBox="0 0 100 100" aria-hidden="true"><use href="million-art.svg#${id}"></use></svg><b>${r.zh}</b><small>${r.en}</small><div class="role-description">${short[id][0]}<br>${short[id][1]}</div></button>`;
  }
  function error(message = "") { $("error").textContent = message; }
  function send(data) { if (!live()) { error("连接中断，正在重连 / Reconnecting, please wait"); return false; } socket.send(JSON.stringify(data)); return true; }
  function release() { busy = false; clearTimeout(pendingTimer); }
  function act(action) {
    if (!state?.game || busy || state.control?.paused || state.seats[state.you]?.auto) return;
    error(); busy = true;
    if (!send({ type: "action", action, revision: state.game.revision })) { release(); return; }
    pendingTimer = setTimeout(() => { release(); error("操作尚未确认，请稍后重试 / Action not confirmed; try again"); render(); }, 7000);
    render();
  }
  function soundButton() { $("soundBtn").innerHTML = icon(audio.muted ? "volume-x" : "volume-2"); $("soundBtn").setAttribute("aria-pressed", String(!audio.muted)); $("soundBtn").title = audio.muted ? "开启音效 / Enable sound" : "静音 / Mute"; $("volume").value = Math.round(audio.volume * 100); $("volumeValue").textContent = `${Math.round(audio.volume * 100)}%`; $("mute").checked = audio.muted; icons(); }
  function identity() { const name = $("playerName").value.trim(); if (!name) { error("请输入你的名字 / Enter your name"); $("playerName").focus(); return null; } write(localStorage, "boardclub-name", name); return { name, avatar: UI.getAvatar() }; }
  function connect() {
    clearTimeout(reconnectTimer);
    const current = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/million-ws`); socket = current;
    $("connection").textContent = "连接中 / Connecting";
    current.onopen = () => { if (socket !== current) return; $("connection").textContent = "已连接 / Connected"; send({ type: "hello", token: read(sessionStorage, sessionKey), avatar: UI.getAvatar() }); render(); };
    current.onmessage = ({ data }) => {
      if (socket !== current) return;
      let message; try { message = JSON.parse(data); } catch { return; }
      if (archives.receive(message)) return;
      if (message.type === "welcome") { write(sessionStorage, sessionKey, message.token); return; }
      if (message.type === "reaction") { social.receive(message); return; }
      if (message.type === "error") { release(); error(message.message); render(); return; }
      if (message.type === "left") { state = null; picked = []; drafts = {}; firstState = true; bubbles.clear(); release(); const url = new URL(location.href); url.searchParams.delete("room"); history.replaceState(null, "", url); $("confirmDialog").close(); render(); if (message.reason) error(message.reason); return; }
      if (message.type !== "state") return;
      const old = state;
      if (old?.code !== message.code) { firstState = true; seenChat.clear(); bubbles.clear(); picked = []; drafts = {}; }
      if (!firstState && old?.game && message.game) {
        if (message.game.phase === "over" && old.game.phase !== "over") audio.play("victory");
        else if (old.game.phase !== message.game.phase) audio.play("phase");
        else if ((message.game.offers || []).some(o => !(old.game.offers || []).some(p => p.id === o.id))) audio.play("deal");
      }
      state = message;
      if (busy && (old?.game?.revision !== state.game?.revision || !state.game)) release();
      if (old?.code !== state.code) error();
      const url = new URL(location.href); url.searchParams.set("room", state.code); history.replaceState(null, "", url);
      for (const m of state.chat || []) { if (!firstState && !seenChat.has(m.id) && Date.now() - m.time < 6000) bubbles.set(m.playerId, m); seenChat.add(m.id); }
      firstState = false; clearTimeout(bubbleTimer); if (bubbles.size) bubbleTimer = setTimeout(() => { bubbles.clear(); render(); }, 6000);
      if ($("confirmDialog").open && confirmRequest?.valid && !confirmRequest.valid()) { $("confirmDialog").close(); confirmRequest = null; }
      render();
    };
    current.onclose = event => { if (socket !== current) return; release(); $("connection").textContent = "已离线 / Offline"; render(); if (event.code !== 4001) reconnectTimer = setTimeout(connect, 1500); else error("此身份已在其他窗口连接，刷新可重新连接 / Connected in another window; refresh to reconnect"); };
    current.onerror = () => { $("connection").textContent = "连接中断 / Disconnected"; };
  }
  function confirm(title, text, run, valid) { confirmRequest = { run, valid }; $("confirmTitle").textContent = title; $("confirmText").textContent = text; $("confirmDialog").showModal(); }
  function settingLabels(settings) { return `<span>${settings.noRepeat ? "角色不可连选 / No consecutive repeats" : "角色可连选 / Repeats allowed"}</span><br><span>${settings.bruteShares ? "暴徒分赃（旧版规则） / Brute shares (2016)" : "暴徒不分赃（本馆变体） / Brute leaves (house rule)"}</span>`; }
  function renderPlayers() {
    const g = state.game;
    const outcomes = { withdrawn: "已退出 / Withdrawn", eliminated: "被点名 / Named", duplicate: "撞车出局 / Duplicate", sharing: "参与分赃 / Shares", alone: "独存罚款 / Lone Snitch", exited: "获威胁后离场 / Threat, no share" };
    $("playerCount").textContent = `${state.seats.filter(p => !p.vacant).length} / ${state.capacity}`;
    $("players").innerHTML = state.seats.map((p, i) => {
      const info = g?.players[i], bubble = bubbles.get(i), mine = i === state.you;
      const tags = info ? info.slots.map(s => `${roleTag(s.role, s.withdrawn)}${outcomes[s.status] ? `<span class="player-outcome">${outcomes[s.status]}</span>` : ""}`).join("") : "";
      return `<div class="player-row ${mine ? "mine" : ""}" data-seat="${i}">${UI.avatar(p, !!p.connected && (p.bot || live()), "million-avatar", mine && !p.vacant)}<div class="player-detail"><strong>${esc(p.name)}${mine ? " · 你 / You" : ""}</strong><small>${p.vacant ? "空位 / Vacant" : `${p.connected && (p.bot || live()) ? "在线 / Online" : "离线 / Offline"}${p.bot ? " · BOT" : ""}${state.host === i ? " · 房主 / Host" : ""}${p.auto && !p.bot ? " · 托管 / Auto" : ""}${g?.leader === i ? " · 带头人 / Leader" : ""}`}</small>${info ? `<small>${info.threats + info.pendingThreats ? `威胁卡 / Threats: ${info.threats}${info.pendingThreats ? ` (+${info.pendingThreats} 下轮 / next round)` : ""}` : ""}</small>` : ""}${bubble ? `<span class="player-chat">${esc(bubble.text)}</span>` : ""}</div><div class="player-cash">${info ? `<strong>${cash(info.cash)}</strong><small>${dollars(info.cash)}${["results", "over"].includes(g.phase) ? ` · <span class="${info.delta > 0 ? "up" : info.delta < 0 ? "down" : ""}">${info.delta > 0 ? "+" : ""}${info.delta}万</span>` : ""}</small>` : `<small>${p.vacant ? "等待补位 / Open" : "已入座 / Seated"}</small>`}</div><div class="player-roles">${g?.phase === "planning" && !mine ? `<span class="hidden-role">${info.locked ? "已选定 / Locked" : "选择中 / Choosing"}</span>` : tags}${info?.lastRoles?.length ? `<small>上轮 / Last: ${info.lastRoles.map(r => D.ROLES[r].zh).join(" · ")}</small>` : ""}${!g && p.bot && state.host === state.you ? `<button class="icon-button" data-remove="${esc(p.socialId)}" title="移除 ${esc(p.name)} / Remove" aria-label="移除 ${esc(p.name)} / Remove">${icon("user-minus")}</button>` : ""}</div></div>`;
    }).join("");
  }
  function selectOptions(players) { return players.map(i => `<option value="${i}">${esc(pname(i))}</option>`).join(""); }
  function offersHTML(g) {
    const pending = g.offers.filter(o => o.status === "pending");
    return `<h3>交易提议 / Offers</h3>${pending.length ? `<ul class="offers">${pending.map(o => `<li><b>${esc(pname(o.payer))}</b> → <b>${esc(pname(o.quitter))}</b> · ${cash(o.amount)} / ${dollars(o.amount)}<br>退出角色 ${o.slot + 1} / Withdraw role ${o.slot + 1}${o.responder === state.you ? `<div class="buttons"><button data-response="${esc(o.id)}" data-accept="true">${icon("check")}接受 / Accept</button><button data-response="${esc(o.id)}" data-accept="false">${icon("x")}拒绝 / Reject</button></div>` : o.proposer === state.you ? `<div class="buttons"><button data-cancel-offer="${esc(o.id)}">${icon("undo-2")}撤回 / Cancel</button></div>` : ""}</li>`).join("")}</ul>` : `<p>暂无交易 / No open offers</p>`}`;
  }
  function actionHTML(g, me) {
    const others = g.players.map((_, i) => i).filter(i => i !== state.you);
    if (g.phase === "planning") return `<h2>${me.locked ? "已锁定身份 / Roles locked" : `秘密选择 ${g.slotsPerPlayer} 个身份 / Choose ${g.slotsPerPlayer} role${g.slotsPerPlayer > 1 ? "s" : ""}`}</h2>${me.locked ? `<div class="public-roles">${me.slots.map(s => roleTag(s.role)).join("")}</div><p>等待其他玩家 / Waiting for the others</p>` : `<p>每个角色保证金 ${cash(g.ante)} / ${dollars(g.ante)}<small>选定后本轮不可更改；三人局需两个不同角色。<br>Locked for this round; choose two different roles in a three-player game.</small></p><div class="role-picker">${g.availableRoles.map(id => roleCard(id, true, !g.allowedRoles.includes(id))).join("")}</div><button id="lockRoles" class="primary wide" ${picked.length !== g.slotsPerPlayer ? "disabled" : ""}>${icon("lock-keyhole")}确认身份 / Lock roles</button>`}<p>${g.players.filter(p => p.locked).length} / ${g.players.length} 已选定 / locked</p>`;
    if (g.phase === "snitch") return g.snitch.player === state.you ? `<h2>告密：点名一种身份 / Name a role</h2><p>必须选择一种公开身份，不能跳过。该身份仍在场者全部出局；若最后只剩你，扣300万且不分赃。<small>You must name a public role, with no pass. Its active characters are eliminated. If left alone, lose $3M and take no loot.</small></p><div class="role-picker">${g.snitch.options.map(r => `<button data-name-role="${r}" class="role-card role-${r}"><svg viewBox="0 0 100 100" aria-hidden="true"><use href="million-art.svg#${r}"></use></svg><b>${D.ROLES[r].zh}</b><small>${D.ROLES[r].en}</small></button>`).join("")}</div>` : `<h2>等待告密者 / Waiting for the Snitch</h2><p>${esc(pname(g.snitch.player))} 正在点名一种身份。<small>${esc(pname(g.snitch.player))} is choosing which role to eliminate.</small></p>`;
    if (["results", "over"].includes(g.phase)) {
      const wins = g.winners.map(pname), result = g.result;
      const leader = state.seats[g.leader], canNext = g.leader === state.you || state.host === state.you && (leader.bot || !leader.connected || leader.auto);
      const next = g.phase === "over" ? state.you === state.host ? `<button id="rematchBtn" class="primary wide">${icon("rotate-ccw")}再来一局 / Play again</button>` : `<p>等待房主再开一局 / Waiting for the host</p>` : canNext ? `<button id="nextRound" class="primary wide">${icon("arrow-right")}下一轮 / Next round</button>` : `<p>等待 ${esc(pname(g.leader))} 开始下一轮。<small>Waiting for ${esc(pname(g.leader))} to start the next round.</small></p>`;
      const logItems = list => list.map(l => `<li>${esc(l.zh)}<small>${esc(l.en)}</small></li>`).join("");
      return `${g.phase === "over" ? `<div class="result-title">${esc(wins.join("、"))} ${wins.length > 1 ? "共同胜利" : "胜利"}<small>${esc(wins.join(" & "))} ${wins.length > 1 ? "win together" : "wins"}</small></div>` : `<h2>第 ${g.round} 轮结算 / Round ${g.round}</h2>`}<p>分赃 ${cash(result.totalLoot)} / ${dollars(result.totalLoot)} · 每份 ${cash(result.share)}<small>Each share: ${dollars(result.share)} · Remainder: ${dollars(result.remainder)}</small></p><ul class="details-list">${logItems((result.logs || []).filter(l => ["snitch", "snitch-alone", "no-share", "driver-fee", "crook-steal", "bonus", "threat-earned"].includes(l.type)))}</ul>${next}<details class="full-ledger"><summary>完整账目 <small>Full ledger · amounts in ×$10k</small></summary><ol class="details-list">${logItems((result.logs || []).filter(l => l.type !== "role-result"))}</ol></details>`;
    }
    const active = me.slots.filter(s => !s.withdrawn), targetSlots = others.flatMap(i => g.players[i].slots.filter(s => !s.withdrawn).map(s => `<option value="${i}:${s.slot}">${esc(pname(i))} · 角色 ${s.slot + 1} / Role ${s.slot + 1}</option>`));
    return `<h2>你的身份 / Your roles</h2>${me.slots.map(s => `<div class="my-slot">${roleTag(s.role, s.withdrawn)}${s.withdrawn ? `<small>已退出 / Withdrawn</small>` : `<button data-withdraw="${s.slot}">${icon("log-out")}退出 / Withdraw</button>`}</div>`).join("")}${!active.length ? `<p>你已退出本轮，保留谈判所得。<small>You have withdrawn and keep any negotiated payments.</small></p>` : ""}${offersHTML(g)}${active.length ? `<details><summary>谈个价钱 <small>Make a deal</small></summary>${targetSlots.length ? `<div class="form-row"><label>让谁退出 / Who withdraws<select data-k="paySlot">${targetSlots.join("")}</select></label><label>金额 / ×$10k<input data-k="payAmount" type="number" min="100" max="${me.cash}" step="100" value="100"></label><button id="payOffer" class="wide">${icon("handshake")}出钱让对方退出 / Pay them to leave</button></div>` : ""}<div class="form-row"><label>请谁付钱 / Ask payer<select data-k="askPayer">${selectOptions(others)}</select></label><label>金额 / ×$10k<input data-k="askAmount" type="number" min="100" step="100" value="100"></label>${active.length > 1 ? `<label>我的角色 / My role<select data-k="askSlot">${active.map(s => `<option value="${s.slot}">${D.ROLES[s.role].zh} / ${D.ROLES[s.role].en}</option>`).join("")}</select></label>` : ""}<button id="askOffer" class="wide">${icon("hand-coins")}收钱后我退出 / Pay me to leave</button></div><p>接受交易后自动付款并退出。<small>Accepting executes payment and withdrawal together.</small></p></details><details><summary>直接付款 <small>Direct payment</small></summary><div class="form-row"><label>付给 / Recipient<select data-k="transferTo">${selectOptions(others)}</select></label><label>金额 / ×$10k<input data-k="transferAmount" type="number" min="100" max="${me.cash}" step="100" value="100"></label><button id="transferBtn" class="wide">${icon("banknote")}付款 / Pay</button></div><p>直接付款不会让对方自动退出。<small>A direct payment does not make the recipient withdraw.</small></p></details><h3>开车确认 / Ready for the heist</h3><div class="ready-list">${g.players.map((p, i) => p.slots.some(s => !s.withdrawn) ? `<span class="${p.ready ? "ready" : ""}">${icon(p.ready ? "circle-check" : "clock-3")}${esc(pname(i))}</span>` : "").join("")}</div><button id="readyHeist" class="${me.ready ? "" : "primary"} wide">${icon(me.ready ? "undo-2" : "car")}${me.ready ? "取消确认 / Not ready" : "确认开车 / Ready for the heist"}</button><p>所有在场玩家确认后立即开车，未接受的交易取消。<small>Starts when every active player is ready; unanswered offers expire.</small></p>` : ""}`;
  }
  function threatsHTML(g, me) {
    if (!me.threats || !["planning", "negotiation", "snitch"].includes(g.phase)) return "";
    const targets = g.players.flatMap((p, i) => i === state.you || !p.locked ? [] : p.slots
      .filter(s => !s.role).map(s => `<option value="${i}:${s.slot}">${esc(pname(i))} · 角色 ${s.slot + 1} / Character ${s.slot + 1}</option>`));
    return `<h3>威胁卡 / Threats · ${me.threats}</h3><div class="form-row"><label>查看一张角色牌 / Inspect one card<select data-k="threatTarget">${targets.join("")}</select></label><button id="threatBtn">${icon("scan-eye")}使用 / Use</button></div>`;
  }
  function restoreDrafts(focus) {
    document.querySelectorAll('[data-k]').forEach(el => { const value = drafts[el.dataset.k]; if (value !== undefined && (el.tagName !== 'SELECT' || [...el.options].some(o => o.value === value))) el.value = value; });
    if (focus) document.querySelector(`[data-k="${focus}"]`)?.focus({ preventScroll: true });
  }
  function render() {
    const g = state?.game, me = g?.players[state.you], host = state && state.you === state.host;
    document.body.classList.toggle("in-room", !!state);
    const focus = document.activeElement?.dataset?.k;
    const key = g ? `${state.code}:${g.round}` : "";
    if (key !== draftKey) { draftKey = key; drafts = {}; picked = []; }
    if (g?.phase !== "planning" || me?.locked) picked = [];
    $("setup").hidden = !!state; $("roomPanel").hidden = !state; $("crewSection").hidden = !state; $("chatPanel").hidden = !state; $("actionPanel").hidden = !g;
    if (matchMedia("(max-width: 900px)").matches) $("turnStatus").after($("actionPanel"));
    else $("roomPanel").after($("actionPanel"));
    $("createBtn").disabled = !live(); $("joinForm").querySelector("button").disabled = !live();
    $("roundLabel").textContent = g ? `第 ${g.round} / ${g.maxRounds} 轮 · ROUND ${g.round}` : `${state?.capacity || "3–8"} 人 / Players`;
    $("phaseTrack").querySelectorAll("li").forEach(li => li.classList.toggle("active", li.dataset.phase === (g?.phase === "over" ? "results" : g?.phase)));
    $("lootAmount").innerHTML = g ? `${g.loot}<small> 万 / ${dollars(g.loot)}</small>` : "—";
    $("lootDetails").innerHTML = g ? `保证金 / Ante · ${cash(g.ante)} / ${dollars(g.ante)}<br>奖励 / Bonus · ${g.bonusRole ? roleTag(g.bonusRole) : "无 / None"}` : "保证金 / Ante · —";
    $("leaderLabel").textContent = g ? `带头人 / Leader · ${pname(g.leader)}` : "等朋友到齐 / Waiting for your crew";
    $("fundLabel").textContent = `待退保证金 / Ante escrow · ${cash(g?.publicFund || 0)}`;
    $("publicRoles").innerHTML = g?.hiddenCount ? `<small>公共区 / Public roles</small>${g.revealedCards.map(r => roleTag(r)).join("")}<span class="hidden-role">${icon("lock-keyhole")}藏起 1 张 / One hidden</span>` : `<small>${g ? "等待所有玩家选定身份 / Waiting for everyone's roles" : "秘密身份 · 自由谈判 · 八轮分赃 / Hidden roles · Negotiation · Eight rounds"}</small>`;
    const available = g?.availableRoles || (state ? D.rolesForCount(state.capacity) : D.ROLE_IDS);
    $("roleGallery").innerHTML = D.ROLE_IDS.map(id => roleCard(id, false, !available.includes(id))).join("");
    let status = "选择身份，谈好价钱，一起开车。", english = "Choose a role. Make a deal. Split the loot.";
    if (state && !g) { status = `等待入座 · ${state.seats.length} / ${state.capacity}`; english = host ? "Invite friends or fill the seats with bots." : "The host will start when the crew is complete."; }
    if (g?.phase === "planning") { status = me.locked ? "身份已锁定，等其他人选择。" : `秘密选择 ${g.slotsPerPlayer} 个${g.slotsPerPlayer > 1 ? "不同" : ""}身份`; english = me.locked ? "Roles locked. Waiting for the others." : `Choose ${g.slotsPerPlayer} secret role${g.slotsPerPlayer > 1 ? "s" : ""}.`; }
    if (g?.phase === "negotiation") { status = me.slots.every(s => s.withdrawn) ? "你已退出本轮，等待分赃。" : me.ready ? "你已确认开车，等待其他人。" : "谈判中：可以留下、交易或退出。"; english = me.slots.every(s => s.withdrawn) ? "You have withdrawn. Waiting for settlement." : me.ready ? "Ready for the heist. Waiting for the others." : "Negotiate, make a deal, or withdraw."; }
    if (g?.phase === "snitch") { status = `${pname(g.snitch.player)} 正在告密`; english = `${pname(g.snitch.player)} is naming a role.`; }
    if (g?.phase === "results") { status = "本轮已结算，查看每人的收支。"; english = "Round settled. Review each player's gains and losses."; }
    if (g?.phase === "over") { status = `${g.winners.map(pname).join("、")} 胜利`; english = `${g.winners.map(pname).join(" & ")} ${g.winners.length > 1 ? "win together" : "wins"}.`; }
    if (state?.control?.paused) { status = "有空位待补齐，游戏已暂停。"; english = "Paused until all vacant seats are filled."; }
    else if (state && !live()) { status = "连接中断，正在重连；进度会保留。"; english = "Reconnecting; your progress is kept."; }
    else if (g && state.seats[state.you]?.auto) { status = "你已开启托管。"; english = "Auto-play is enabled for your seat."; }
    $("turnStatus").innerHTML = `${esc(status)}<small>${esc(english)}</small>`;
    $("turnStatus").classList.toggle("your-turn", !!g?.requiredActors.includes(state.you)); $("turnStatus").classList.toggle("paused", !!state?.control?.paused);
    if (state) {
      $("roomCode").textContent = state.code; renderPlayers();
      $("roomSettings").innerHTML = !g && host ? `<div class="settings-fields"><label><input data-setting="noRepeat" type="checkbox" ${state.settings.noRepeat ? "checked" : ""}>连续两轮不选同一角色<small>No consecutive repeats</small></label><label><input data-setting="bruteShares" type="checkbox" ${state.settings.bruteShares ? "checked" : ""}>暴徒参与分赃（旧版规则）<small>Brute shares; disable for house rule</small></label></div>` : settingLabels(state.settings);
      $("lobbyActions").hidden = !!g || !host; $("addBotBtn").disabled = !live() || state.seats.length >= state.capacity; $("fillBotsBtn").disabled = $("addBotBtn").disabled; $("startBtn").disabled = !live() || state.seats.length !== state.capacity || state.seats.some(p => !p.bot && !p.connected) || !!state.control?.paused;
      if (g) $("actionPanel").innerHTML = actionHTML(g, me) + threatsHTML(g, me);
      const threatTarget = document.querySelector('[data-k="threatTarget"]');
      if (threatTarget && !threatTarget.options.length) {
        threatTarget.innerHTML = '<option>暂无可查看的角色 / No hidden character available</option>';
        threatTarget.disabled = true;
        $("threatBtn").disabled = true;
      }
      if (g && (!live() || busy || state.control?.paused || state.seats[state.you]?.auto)) $("actionPanel").querySelectorAll('button,input,select').forEach(el => el.disabled = true);
      const oldMessages = $("messages").textContent;
      $("messages").innerHTML = (state.chat || []).map(m => `<p><b>${esc(m.name || pname(m.playerId))}</b>${esc(m.text)}</p>`).join(""); if ($("messages").textContent !== oldMessages) $("messages").scrollTop = $("messages").scrollHeight;
      const silent = g && ["negotiation", "snitch"].includes(g.phase) && me.slots.every(s => s.withdrawn);
      $("chatText").disabled = !live() || !!silent; $("chatForm").querySelector("button").disabled = !live() || !!silent;
      $("chatHint").textContent = silent ? "本轮已退出，请保持沉默 / Withdrawn players stay silent this round" : "";
    }
    $("privatePanel").hidden = !g?.private.length;
    $("privateInfo").innerHTML = (g?.private || []).map(i => `<p>${esc(pname(i.player))} · 角色 ${i.slot + 1} / Role ${i.slot + 1}<br>${roleTag(i.role)}</p>`).join("");
    $("historySection").hidden = !g?.history.length;
    $("history").innerHTML = g?.history.length ? `<table><thead><tr><th>玩家 / Player</th>${g.history.map(h => `<th>第 ${h.round} 轮 / R${h.round}<br>${cash(h.loot)}</th>`).join("")}</tr></thead><tbody>${state.seats.map((p, i) => `<tr><td>${esc(p.name)}</td>${g.history.map(h => `<td>${h.players[i].slots.map(s => roleTag(s.role, s.withdrawn)).join(" ")}<small class="${h.players[i].delta >= 0 ? "up" : "down"}">${h.players[i].delta > 0 ? "+" : ""}${h.players[i].delta}万</small></td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
    restoreDrafts(focus); social.sync(); management.sync(); icons();
  }
  const val = key => document.querySelector(`[data-k="${key}"]`)?.value;
  document.addEventListener("input", e => { if (e.target.dataset.k) drafts[e.target.dataset.k] = e.target.value; });
  document.addEventListener("change", e => { if (e.target.dataset.k) drafts[e.target.dataset.k] = e.target.value; if (e.target.dataset.setting) send({ type: "settings", settings: { [e.target.dataset.setting]: e.target.checked } }); });
  $("actionPanel").onclick = e => {
    const b = e.target.closest("button"); if (!b || b.disabled || !state?.game) return;
    const g = state.game, me = g.players[state.you], code = state.code, round = g.round;
    const roster = state.seats.map(p => p.socialId).join(":");
    const valid = () => state?.code === code && state.game?.round === round && state.game?.phase === g.phase && state.seats.map(p => p.socialId).join(":") === roster && live() && !state.control?.paused;
    if (b.dataset.pick) { const r = b.dataset.pick; if (picked.includes(r)) picked = picked.filter(x => x !== r); else { if (picked.length >= g.slotsPerPlayer) picked.shift(); picked.push(r); } render(); }
    else if (b.id === "lockRoles") act({ type: "choose", roles: picked.slice() });
    else if (b.dataset.withdraw !== undefined) { const slot = Number(b.dataset.withdraw); confirm("退出本轮 / Withdraw", "退出后拿回整笔保证金，保留谈判收入，但不能反悔，也不再参与分赃。 / Your full ante is returned and negotiated payments are kept. Withdrawal is final; this role gets no loot.", () => act({ type: "withdraw", slot }), () => valid() && !state.game.players[state.you].slots[slot].withdrawn); }
    else if (b.id === "readyHeist") act({ type: "ready", ready: !me.ready });
    else if (b.dataset.nameRole) { const role = b.dataset.nameRole; confirm("确认告密 / Name this role", `${D.ROLES[role].zh}仍在场的角色将全部出局。 / All active ${D.ROLES[role].en} roles will be eliminated.`, () => act({ type: "snitch", role }), valid); }
    else if (b.id === "nextRound") act({ type: "next" });
    else if (b.id === "rematchBtn") send({ type: "rematch" });
    else if (b.id === "payOffer") { const [quitter, slot] = String(val("paySlot")).split(":").map(Number); act({ type: "offer", payer: state.you, quitter, slot, amount: Number(val("payAmount")) }); }
    else if (b.id === "askOffer") act({ type: "offer", payer: Number(val("askPayer")), quitter: state.you, slot: val("askSlot") !== undefined ? Number(val("askSlot")) : me.slots.find(s => !s.withdrawn).slot, amount: Number(val("askAmount")) });
    else if (b.dataset.response) { const offerId = b.dataset.response, accept = b.dataset.accept === "true", o = g.offers.find(x => x.id === offerId); if (!accept) act({ type: "respond", offerId, accept }); else confirm("接受交易 / Accept deal", `${pname(o.payer)} 支付 ${cash(o.amount)} 给 ${pname(o.quitter)}，后者的角色 ${o.slot + 1} 退出。 / ${pname(o.payer)} pays ${dollars(o.amount)} to ${pname(o.quitter)}, whose role ${o.slot + 1} withdraws.`, () => act({ type: "respond", offerId, accept: true }), () => valid() && state.game.offers.some(x => x.id === offerId && x.status === "pending")); }
    else if (b.dataset.cancelOffer) act({ type: "cancel", offerId: b.dataset.cancelOffer });
    else if (b.id === "transferBtn") { const to = Number(val("transferTo")), amount = Number(val("transferAmount")); if (!Number.isSafeInteger(amount) || amount <= 0 || amount % 100 !== 0 || amount > me.cash) return error("付款须为100万的整数倍且不能超过余额 / Pay in whole $1M within your balance"); confirm("直接付款 / Direct payment", `向 ${pname(to)} 支付 ${cash(amount)}。对方不会自动退出。 / Pay ${dollars(amount)} to ${pname(to)}. They will not automatically withdraw.`, () => act({ type: "transfer", to, amount }), valid); }
    else if (b.id === "threatBtn") { const [target, slot] = String(val("threatTarget")).split(":").map(Number); act({ type: "threat", target, slot }); }
  };
  $("players").onclick = e => { const b = e.target.closest("[data-remove]"); if (!b || !state) return; const code = state.code, target = b.dataset.remove, host = state.seats[state.host]?.socialId; UI.confirmRemoval({ name: state.seats.find(p => p.socialId === target)?.name || "Bot", started: false, valid: () => state?.code === code && !state.game && state.you === state.host && state.seats[state.host]?.socialId === host && state.seats.some(p => p.bot && p.socialId === target), remove: () => send({ type: "removeBot", target }) }); };
  $("playerName").value = read(localStorage, "boardclub-name") || ""; UI.mountAvatarPicker($("avatarPicker"), $("playerName")); $("roomInput").value = params.get("room") || "";
  window.addEventListener("board-avatar-change", ({ detail }) => { if (state) send({ type: "profile", avatar: detail.avatar }); });
  $("createBtn").onclick = () => { const p = identity(); if (p) send({ type: "create", ...p, capacity: Number($("capacity").value), settings: { noRepeat: $("noRepeat").checked, bruteShares: $("bruteShares").checked } }); };
  $("joinForm").onsubmit = e => { e.preventDefault(); const p = identity(); if (p) send({ type: "join", ...p, code: $("roomInput").value.trim().toUpperCase() }); };
  $("addBotBtn").onclick = () => send({ type: "addBot" }); $("fillBotsBtn").onclick = () => send({ type: "fillBots" }); $("startBtn").onclick = () => send({ type: "start" });
  $("chatForm").onsubmit = e => { e.preventDefault(); const text = $("chatText").value.trim(); if (text && send({ type: "chat", text })) $("chatText").value = ""; };
  $("leaveBtn").onclick = () => { const code = state?.code; confirm("离开房间 / Leave room", "开局后会保留你的席位；其他玩家可以等你回来，或由房主管理补位。 / After play starts, your seat is kept for your return or host-managed replacement.", () => send({ type: "leave" }), () => state?.code === code); };
  $("copyBtn").onclick = async () => { if (!state) return; const url = new URL("million.html", location.href); url.searchParams.set("room", state.code); try { await navigator.clipboard.writeText(url.href); error("邀请链接已复制 / Invitation copied"); } catch { error(`房间 / Room ${state.code} · ${url.href}`); } };
  $("confirmAction").onclick = () => { const request = confirmRequest; $("confirmDialog").close(); confirmRequest = null; if (request && (!request.valid || request.valid())) request.run(); else error("局面已变化，请重新操作 / The situation changed; try again"); };
  $("cancelConfirm").onclick = () => $("confirmDialog").close(); document.querySelectorAll("[data-close]").forEach(b => b.onclick = () => b.closest("dialog").close());
  $("settingsBtn").onclick = () => { soundButton(); $("soundDialog").showModal(); }; $("soundBtn").onclick = () => { audio.setMuted(!audio.muted); soundButton(); }; $("volume").oninput = () => { audio.setVolume(Number($("volume").value) / 100); soundButton(); }; $("mute").onchange = () => { audio.setMuted($("mute").checked); soundButton(); };
  for (const event of ["pointerdown", "keydown"]) document.addEventListener(event, () => audio.unlock(), { passive: true });
  window.addEventListener("pagehide", () => audio.stop());
  matchMedia("(max-width: 900px)").addEventListener("change", render);
  soundButton(); render(); connect();
})();
