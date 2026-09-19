"use strict";
(() => {
  const $ = (id) => document.getElementById(id), B = window.DuelBoard, UI = window.BoardGameUI;
  const params = new URLSearchParams(location.search);
  let kind = params.get("game") === "xiangqi" ? "xiangqi" : "gomoku", state = null, socket, selected = -1, flipped = false, busy = false, reconnectTimer, confirmAction;
  let seenChat = new Set(), bubbles = new Map(), firstState = true, sessionKey = `boardclub-${kind}-session`;
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
  const titles = { gomoku: ["五子棋","Gomoku"], xiangqi: ["中国象棋","Xiangqi"] };
  const sideLabel = (side) => kind === "gomoku" ? side === 0 ? "黑棋 / Black" : "白棋 / White" : side === 0 ? "红方 / Red" : "黑方 / Black";
  const dot = (side) => `<i class="side-dot dot-${kind === "xiangqi" && side === 0 ? "red" : side === 0 || kind === "xiangqi" ? "black" : "white"}"></i>`;
  const levels = { easy:"入门 / Easy", normal:"标准 / Standard", hard:"进阶 / Advanced" };
  const requestLabels = { undo:"悔棋 / Undo", draw:"和棋 / Draw", swap:"交换执子 / Swap sides", rematch:"换边再来一局 / Rematch with swapped sides" };
  const icons = () => window.lucide.createIcons();
  const social = UI.mountInteractions(() => state && ({ code: state.code, players: state.seats, you: state.seats[state.you]?.socialId, connected: socket?.readyState === WebSocket.OPEN }), send);
  const management = UI.mountRoomControl(() => state?.control, send, () => document.querySelector("#roomPanel .room-heading"));
  function send(data) {
    if (state?.control?.paused && ["move", "request", "respond", "start", "resign"].includes(data.type)) { $("error").textContent = "空位待补齐，游戏暂停 / Waiting for replacement"; return false; }
    if (socket?.readyState !== WebSocket.OPEN) { $("error").textContent = "连接已断开，正在重连 / Disconnected, reconnecting"; return false; }
    socket.send(JSON.stringify(data)); return true;
  }
  function title() {
    $("gameTitle").textContent = titles[kind][0]; $("gameEnglish").textContent = titles[kind][1]; document.title = `${titles[kind][0]} / ${titles[kind][1]} · 桌游小馆`;
    $("sideOptions").innerHTML = [0,1].map((side) => `<label><input type="radio" name="side" value="${side}" ${side===0 ? "checked" : ""}><span>${dot(side)}${sideLabel(side)}</span></label>`).join("");
    $("numberOption").hidden = kind !== "gomoku";
  }
  function confirm(text, action) { $("confirmTitle").textContent = text; confirmAction = action; $("confirmDialog").showModal(); }
  function showRules() {
    const items = kind === "gomoku" ? [
      ["15×15 棋盘，黑棋先行，双方轮流在交叉点落一子。","Black moves first on a 15×15 board; place one stone per turn."],
      ["横、竖或斜线连成五子或更多即胜。本馆采用自由五子棋，无三三、四四或长连禁手。","Five or more in a row wins. Freestyle rules: no forbidden moves or overline restrictions."],
      ["棋盘填满仍无人获胜则和棋。联机悔棋、求和和换边再来需要对手同意。","A full board without a winner is a draw. Online undo, draw and rematch requests need consent."]
    ] : [
      ["红方先行。点击自己的棋子，再点击标出的合法落点。","Red moves first. Select a piece, then a highlighted legal destination."],
      ["车走直线；炮吃子要隔一子；马走日且不能蹩腿；象走田、不能塞眼或过河。","Chariots move orthogonally; cannons capture over one screen. Horses can be blocked; elephants cannot cross the river or jump a blocked eye."],
      ["将帅与士不能出九宫；兵卒只能向前，过河后也可横走，不能后退。将帅不可直接照面。","Generals and advisors stay in the palace. Soldiers move forward, and sideways after crossing the river. Generals cannot face each other."],
      ["被将军必须应将。将死或无合法着法（困毙）均判负。","You must escape check. Checkmate and stalemate both lose."],
      ["本馆休闲规则：单方连续长将导致三次重复，该方判负；其他三次重复、双方无进攻子力或连续 120 半回合无吃子判和。不做复杂长捉的竞赛仲裁。","Club rules: unilateral perpetual check loses on threefold repetition; other threefold repetition, insufficient attacking material or 120 non-capturing plies draw. Tournament chase adjudication is not included."]
    ];
    $("rulesContent").innerHTML = `<ul>${items.map(([zh,en])=>`<li>${zh}<small>${en}</small></li>`).join("")}</ul>`; $("rulesDialog").showModal();
  }
  function playerStrip(id) {
    const p = state?.seats[id]; if (!p || p.vacant) return `<div class="player-name">等待入座 <small>Waiting for a player</small></div><div class="player-side">${dot(id)}${sideLabel(id)}</div>`;
    const own = id === state.you, bubble = bubbles.get(id), live = p.connected && (p.bot || socket?.readyState === WebSocket.OPEN);
    return `${UI.avatar(p,live,"duel-avatar game-avatar",own)}<div class="player-info"><div class="player-name">${esc(p.name)}${p.bot ? " · AI" : ""}</div><div class="player-meta">${p.bot ? levels[state.difficulty] : own ? "你 / You" : "好友 / Friend"}${id === state.host ? " · 房主 / Host" : ""}</div>${bubble && Date.now()-bubble.time<6000 ? `<div class="player-chat">${esc(bubble.text)}</div>` : ""}</div><div class="player-side">${dot(id)}${sideLabel(id)}</div>`;
  }
  function renderBoard() {
    const g = state?.game, own = g?.phase === "playing" && g.current === state.you && !state.control?.paused && !state.seats[state.you]?.auto && !busy && socket?.readyState === WebSocket.OPEN;
    const targets = own && selected >= 0 ? g.legal.filter((m)=>m.from===selected).map((m)=>m.to) : [];
    $("board").innerHTML = B.render(kind,g,{ flip: flipped, selected, targets, interactive: Boolean(own), numbers: $("numbers").checked });
  }
  function render() {
    social.sync();
    management.sync();
    const g = state?.game, me = state?.you ?? 0, other = 1-me;
    document.querySelector(".duel-layout").classList.toggle("in-room",Boolean(state));
    $("setup").hidden = Boolean(state); $("roomPanel").hidden = !state; $("gameActions").hidden = !g;
    $("opponent").innerHTML = playerStrip(other); $("you").innerHTML = playerStrip(me);
    $("opponent").classList.toggle("active",g?.phase === "playing" && g.current === other);
    $("you").classList.toggle("active",g?.phase === "playing" && g.current === me);
    $("status").classList.toggle("over",g?.phase === "over");
    if (!g) $("status").textContent = state ? "等待双方准备 / Waiting for players" : titles[kind].join(" / ");
    else if (g.phase === "over") $("status").innerHTML = g.winner >= 0 ? `${esc(state.seats[g.winner].name)} 胜利 / ${esc(state.seats[g.winner].name)} wins<small>${esc(g.reason)}</small>` : `和棋 / Draw<small>${esc(g.reason)}</small>`;
    else $("status").textContent = `${g.current === me ? "轮到你 / Your turn" : `${state.seats[g.current].name} ${state.thinking ? "思考中 / Thinking" : "的回合 / to move"}`}${g.check ? " · 将军 / Check" : ""}`;
    renderBoard();
    if (!state) { icons(); return; }
    $("roomCode").textContent = state.code; $("lobby").hidden = Boolean(g);
    $("lobbySeats").innerHTML = state.seats.map((p,id)=>`<div class="lobby-seat">${p ? UI.avatar(p,p.connected,"game-avatar",id===me) : dot(id)}<div>${p ? esc(p.name) : "空位 / Open seat"}<small>${sideLabel(id)} · ${p ? p.ready ? "已准备 / Ready" : "未准备 / Not ready" : "等待加入 / Waiting"}</small></div></div>`).join("");
    $("readyBtn").textContent = state.seats[me]?.ready ? "取消准备 / Unready" : "准备 / Ready";
    $("startBtn").hidden = state.host !== me; $("startBtn").disabled = !state.seats.every((p)=>p?.ready && p.connected) || Boolean(state.pending);
    $("swapBtn").disabled = !state.seats[other]?.connected || Boolean(state.pending);
    $("undoBtn").disabled = !g || g.phase !== "playing" || !g.moves.some((m)=>m.side===me) || Boolean(state.pending);
    $("drawBtn").disabled = !g || g.phase !== "playing" || state.seats[other]?.bot || Boolean(state.pending);
    $("resignBtn").disabled = g?.phase !== "playing"; $("rematchBtn").hidden = g?.phase !== "over";
    $("rematchBtn").disabled = !state.seats[other]?.connected || Boolean(state.pending);
    const p = state.pending; $("requestPanel").hidden = !p;
    if (p) $("requestPanel").innerHTML = `<strong>${esc(state.seats[p.from].name)}</strong> · ${requestLabels[p.action]}<div>${p.from===me ? '<button data-request="cancel">撤回 / Cancel</button>' : '<button data-request="accept" class="primary">同意 / Accept</button><button data-request="decline">拒绝 / Decline</button>'}</div>`;
    $("messages").innerHTML = state.chat.map((m)=>`<p><b>${esc(m.name || state.seats[m.playerId]?.name)}</b>${esc(m.text)}</p>`).join("");
    $("moveCount").textContent = g?.moves.length || 0;
    $("moveLog").innerHTML = (g?.moves || []).map((m,n)=>`<li><span>${n+1}</span>${dot(m.side)}${m.piece ? esc(B.names[m.piece][m.side])+" " : ""}${esc(m.text)}${m.captured ? " ×" : ""}${m.check ? " +" : ""}</li>`).join("");
    icons();
  }
  function connect() {
    clearTimeout(reconnectTimer);
    if (location.protocol === "file:") { $("error").textContent = "请从正在运行的 Node 服务器打开游戏 / Open through the running game server"; return; }
    socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/duel-ws`);
    socket.onopen = () => { $("connection").textContent="已连接 / Connected"; send({type:"hello",token:sessionStorage.getItem(sessionKey)}); };
    socket.onmessage = ({data}) => {
      const m = JSON.parse(data);
      if (m.type === "reaction") { social.receive(m); return; }
      if (m.type === "welcome") sessionStorage.setItem(sessionKey,m.token);
      if (m.type === "error") { busy=false; $("error").textContent=m.message; renderBoard(); }
      if (m.type === "left") { state=null; selected=-1; busy=false; flipped=false; bubbles.clear(); firstState=true; render(); if(m.reason)$("error").textContent=m.reason; }
      if (m.type === "state") {
        if (state?.code !== m.code) { bubbles.clear(); seenChat.clear(); firstState=true; }
        else if (state.you !== m.you) bubbles.clear();
        const changed = state?.game?.revision !== m.game?.revision || state?.code !== m.code;
        if (changed) { selected=-1; busy=false; }
        if (!state || state.code!==m.code || state.you!==m.you) flipped=m.you===1;
        if (kind!==m.kind) { kind=m.kind; title(); }
        state=m;
        for (const msg of m.chat) { if (!firstState && !seenChat.has(msg.id) && Date.now()-msg.time<6000) bubbles.set(msg.playerId,msg); seenChat.add(msg.id); }
        firstState=false; $("error").textContent=""; render();
        $("messages").scrollTop=$("messages").scrollHeight;
      }
    };
    socket.onclose = (event) => {
      busy=false; $("connection").textContent=event.code===4001 ? "已在其他窗口连接 / Other tab" : "连接中断 / Disconnected";
      render();
      if (event.code!==4001) reconnectTimer=setTimeout(connect,1500);
    };
    socket.onerror=()=>{ $("error").textContent="连接未成功，请确认已启动新版服务器 / Could not connect to the updated server"; };
  }
  $("playerName").value=localStorage.getItem("boardclub-name") || "";
  UI.mountAvatarPicker($("avatarPicker"),$("playerName"));
  window.addEventListener("board-avatar-change",({detail})=>{ if(state)send({type:"profile",avatar:detail.avatar}); });
  function identity() { const name=$("playerName").value.trim(); if(!name){$("playerName").focus();$("error").textContent="请输入名字 / Enter your name";return null;} localStorage.setItem("boardclub-name",name);return {name,avatar:UI.getAvatar()}; }
  $("createBtn").onclick=()=>{const p=identity();if(p)send({type:"create",kind,difficulty:$("difficulty").value,side:Number(document.querySelector('[name=side]:checked').value),ai:document.querySelector('[name=mode]:checked').value==="ai",...p});};
  document.querySelectorAll('[name=mode]').forEach((r)=>r.onchange=()=>{const ai=r.value==="ai";$("difficultyRow").hidden=!ai;$("createLabel").textContent=ai?"开始对战 / Play":"创建房间 / Create room";});
  $("joinForm").onsubmit=(e)=>{e.preventDefault();const p=identity();if(p)send({type:"join",code:$("roomInput").value.trim().toUpperCase(),...p});};
  $("roomInput").value=params.get("room") || "";
  $("readyBtn").onclick=()=>send({type:"ready",ready:!state.seats[state.you].ready});
  $("startBtn").onclick=()=>send({type:"start"});
  $("swapBtn").onclick=()=>send({type:"request",action:"swap"});
  $("undoBtn").onclick=()=>send({type:"request",action:"undo"});
  $("drawBtn").onclick=()=>send({type:"request",action:"draw"});
  $("rematchBtn").onclick=()=>send({type:"request",action:"rematch"});
  $("resignBtn").onclick=()=>confirm("确认认输？ / Resign this game?",()=>send({type:"resign"}));
  $("leaveBtn").onclick=()=>confirm(state.game?.phase==="playing" ? "离开会认输 / Leaving resigns this game" : "离开房间？ / Leave room?",()=>send({type:"leave"}));
  $("flipBtn").onclick=()=>{flipped=!flipped;renderBoard();};
  $("numbers").onchange=renderBoard;
  $("rulesBtn").onclick=showRules;
  $("confirmYes").onclick=()=>{$("confirmDialog").close();confirmAction?.();};
  document.querySelectorAll('[data-close]').forEach((b)=>b.onclick=()=>$(b.dataset.close).close());
  $("requestPanel").onclick=(e)=>{const b=e.target.closest('[data-request]');if(!b||!state.pending)return;send(b.dataset.request==="cancel" ? {type:"cancel"} : {type:"respond",id:state.pending.id,accept:b.dataset.request==="accept"});};
  $("copyBtn").onclick=async()=>{const url=new URL("duel.html",location.href);url.searchParams.set("game",kind);url.searchParams.set("room",state.code);try{await navigator.clipboard.writeText(url.href);$("error").textContent="邀请链接已复制 / Invite copied";}catch{$("error").textContent=`房间 / Room ${state.code} · ${url.href}`;}};
  $("chatForm").onsubmit=(e)=>{e.preventDefault();const text=$("chatText").value.trim();if(text && send({type:"chat",text}))$("chatText").value="";};
  let down;
  $("board").onpointerdown=(e)=>{down={x:e.clientX,y:e.clientY};};
  function cellAction(e) {
    const cell=e.target.closest('[data-cell]'),g=state?.game;if(!cell||!g||g.phase!=="playing"||g.current!==state.you||busy)return;
    const to=Number(cell.dataset.cell);
    if(kind==="xiangqi" && g.board[to]?.side===state.you){selected=selected===to?-1:to;renderBoard();return;}
    const move=g.legal.find((m)=>m.to===to && (kind==="gomoku"||m.from===selected));
    if(move){busy=send({type:"move",...move,revision:g.revision});selected=-1;renderBoard();}
  }
  $("board").onclick=(e)=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8){down=null;return;}down=null;cellAction(e);};
  $("board").onkeydown=(e)=>{if(["Enter"," "].includes(e.key)){e.preventDefault();cellAction(e);}};
  setInterval(()=>{if([...bubbles.values()].some((m)=>Date.now()-m.time>=6000)){for(const[id,m]of bubbles)if(Date.now()-m.time>=6000)bubbles.delete(id);render();}},800);
  title();render();connect();
})();
