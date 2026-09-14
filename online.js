(() => {
  const state = {
    socket: null,
    reconnectTimer: null,
    clientId: localStorage.getItem("holdem-online-client") || crypto.randomUUID(),
    desiredRoom: sessionStorage.getItem("holdem-online-room") || "",
    room: null,
    maxPlayers: 4,
    startingStack: 150,
    blindInterval: 10,
    practiceMode: 0,
    intentionalClose: false,
    shareUrl: "",
    lastRoomSnapshot: null,
    animationTimer: null,
    animationPhase: "",
    pulseSeats: false,
    pulseBoard: new Set(),
    pulseTimer: null,
    countdownTimer: null,
    chatBubbleTimer: null,
    practiceExpanded: false,
    replayHandNumber: 0,
    replayFrames: [],
    replayLastSignature: "",
    completedReplay: null,
    replayGenerating: false,
    replayDownload: null,
    replayView: "player",
  };
  localStorage.setItem("holdem-online-client", state.clientId);

  const elements = {
    setup: document.querySelector("#onlineSetup"),
    lobby: document.querySelector("#onlineLobby"),
    pokerRoom: document.querySelector("#onlinePokerRoom"),
    status: document.querySelector("#onlineConnectionStatus"),
    error: document.querySelector("#onlineError"),
    name: document.querySelector("#onlineNameInput"),
    roomCode: document.querySelector("#onlineRoomCodeInput"),
    roomCodeButton: document.querySelector("#onlineRoomCodeButton"),
    lobbyPlayers: document.querySelector("#onlineLobbyPlayers"),
    lobbyConfig: document.querySelector("#onlineLobbyConfig"),
    lobbyMessage: document.querySelector("#onlineLobbyMessage"),
    botControls: document.querySelector("#onlineBotControls"),
    addBot: document.querySelector("#addOnlineBotBtn"),
    removeBot: document.querySelector("#removeOnlineBotBtn"),
    fillBots: document.querySelector("#fillOnlineBotsBtn"),
    startButton: document.querySelector("#startOnlineGameBtn"),
    nextButton: document.querySelector("#onlineNextHandBtn"),
    autoNext: document.querySelector("#onlineAutoNextBtn"),
    playersLayer: document.querySelector("#onlinePlayersLayer"),
    board: document.querySelector("#onlineCommunityCards"),
    pot: document.querySelector("#onlinePotValue"),
    message: document.querySelector("#onlineTableMessage"),
    handNumber: document.querySelector("#onlineHandNumber"),
    street: document.querySelector("#onlineStreetLabel"),
    blind: document.querySelector("#onlineBlindLabel"),
    roomBadge: document.querySelector("#onlineRoomBadge"),
    heroCards: document.querySelector("#onlineHeroCards"),
    heroName: document.querySelector("#onlineHeroName"),
    heroStack: document.querySelector("#onlineHeroStack"),
    practiceShell: document.querySelector("#onlinePracticeShell"),
    practiceToggle: document.querySelector("#onlinePracticeToggleBtn"),
    practicePanel: document.querySelector("#onlinePracticePanel"),
    practiceEquity: document.querySelector("#onlinePracticeEquity"),
    practiceRequired: document.querySelector("#onlinePracticeRequired"),
    practiceAdvice: document.querySelector("#onlinePracticeAdvice"),
    practiceDistribution: document.querySelector("#onlinePracticeDistribution"),
    actionPanel: document.querySelector("#onlineActionPanel"),
    fold: document.querySelector("#onlineFoldBtn"),
    call: document.querySelector("#onlineCallBtn"),
    raise: document.querySelector("#onlineRaiseBtn"),
    raiseInput: document.querySelector("#onlineRaiseInput"),
    revealPanel: document.querySelector("#onlineRevealPanel"),
    showCards: document.querySelector("#onlineShowCardsBtn"),
    muckCards: document.querySelector("#onlineMuckCardsBtn"),
    log: document.querySelector("#onlineLogEntries"),
    chatEntries: document.querySelector("#onlineChatEntries"),
    chatInput: document.querySelector("#onlineChatInput"),
    chatSend: document.querySelector("#onlineChatSendBtn"),
    dealLayer: document.querySelector("#onlineDealAnimationLayer"),
    dealText: document.querySelector("#onlineDealAnimationText"),
    replayVideo: document.querySelector("#onlineReplayVideoBtn"),
    replayDownload: document.querySelector("#onlineReplayDownloadLink"),
  };

  elements.name.value = localStorage.getItem("holdem-online-name") || "";
  const social = window.BoardGameUI.mountInteractions(() => state.room && ({ code: state.room.code, players: state.room.players, you: state.room.players.find((p) => p.clientId === state.clientId)?.socialId, connected: state.socket?.readyState === WebSocket.OPEN }), send);
  window.BoardGameUI.mountAvatarPicker(document.getElementById("pokerAvatarPicker"), elements.name);
  window.addEventListener("board-avatar-change", ({ detail }) => {
    if (state.room && state.socket?.readyState === WebSocket.OPEN) send({ type: "profile", avatar: detail.avatar });
  });

  function setError(message = "") {
    elements.error.textContent = message;
  }

  function connectionLabel(kind) {
    const labels = {
      connecting: "正在连接服务器 / Connecting",
      connected: "已连接 / Connected",
      disconnected: "连接中断，正在重连 / Reconnecting",
    };
    elements.status.textContent = labels[kind];
    elements.status.dataset.state = kind;
  }

  function socketUrl() {
    if (location.protocol === "file:") return "ws://127.0.0.1:8002/ws";
    return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
  }

  function connect() {
    clearTimeout(state.reconnectTimer);
    connectionLabel("connecting");
    const socket = new WebSocket(socketUrl());
    state.socket = socket;
    socket.addEventListener("open", () => {
      connectionLabel("connected");
      loadServerInfo();
      send({ type: "hello", clientId: state.clientId, avatar: window.BoardGameUI.getAvatar() });
      if (state.desiredRoom) {
        send({
          type: "join",
          code: state.desiredRoom,
          name: elements.name.value || "Player",
          avatar: window.BoardGameUI.getAvatar(),
        });
      }
    });
    socket.addEventListener("message", (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      if (data.type === "reaction") { social.receive(data); return; }
      if (data.type === "state") {
        captureReplayState(data.room);
        state.room = data.room;
        social.sync();
        state.desiredRoom = data.room.code;
        sessionStorage.setItem("holdem-online-room", state.desiredRoom);
        setError();
        render();
      } else if (data.type === "error") {
        setError(data.message);
      } else if (data.type === "left") {
        resetToSetup();
      }
    });
    socket.addEventListener("close", () => {
      connectionLabel("disconnected");
      render();
      if (!state.intentionalClose) {
        state.reconnectTimer = setTimeout(connect, 1400);
      }
    });
    socket.addEventListener("error", () => socket.close());
  }

  async function loadServerInfo() {
    const base = location.protocol === "file:" ? "http://127.0.0.1:8002" : location.origin;
    try {
      const response = await fetch(`${base}/api/info`);
      const info = await response.json();
      const hostedPublicly = location.protocol === "https:"
        || !["127.0.0.1", "localhost"].includes(location.hostname);
      state.shareUrl = hostedPublicly
        ? info.publicUrl
        : (info.shareUrls[0] || info.localUrl || info.publicUrl || "");
    } catch {
      state.shareUrl = location.protocol === "file:" ? "" : `${location.origin}${location.pathname}`;
    }
  }

  function send(data) {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      setError("服务器尚未连接 / Server is not connected");
      return false;
    }
    state.socket.send(JSON.stringify(data));
    return true;
  }

  function playerName() {
    const value = elements.name.value.trim().slice(0, 18);
    if (!value) {
      setError("请输入你的名字 / Enter your name");
      elements.name.focus();
      return "";
    }
    localStorage.setItem("holdem-online-name", value);
    return value;
  }

  function selectButtons(selector, value, key) {
    document.querySelectorAll(selector).forEach((button) => {
      button.addEventListener("click", () => {
        state[key] = Number(button.dataset[value]);
        document.querySelectorAll(selector).forEach((item) => {
          item.classList.toggle("active", Number(item.dataset[value]) === state[key]);
        });
      });
    });
  }

  selectButtons("[data-online-count]", "onlineCount", "maxPlayers");
  selectButtons("[data-online-stack]", "onlineStack", "startingStack");
  selectButtons("[data-online-blinds]", "onlineBlinds", "blindInterval");
  selectButtons("[data-online-practice]", "onlinePractice", "practiceMode");

  document.querySelector("#createOnlineRoomBtn").addEventListener("click", () => {
    const name = playerName();
    if (!name) return;
    state.desiredRoom = "";
    send({
      type: "create",
      name,
      avatar: window.BoardGameUI.getAvatar(),
      maxPlayers: state.maxPlayers,
      startingStack: state.startingStack,
      blindInterval: state.blindInterval,
      practiceMode: Boolean(state.practiceMode),
    });
  });

  function joinRoom() {
    const name = playerName();
    const code = elements.roomCode.value.trim().toUpperCase();
    if (!name) return;
    if (!/^[A-Z2-9]{5}$/.test(code)) {
      setError("请输入 5 位房间码 / Enter the 5-character room code");
      return;
    }
    state.desiredRoom = code;
    send({ type: "join", name, code, avatar: window.BoardGameUI.getAvatar() });
  }

  document.querySelector("#joinOnlineRoomBtn").addEventListener("click", joinRoom);
  elements.roomCode.addEventListener("input", () => {
    elements.roomCode.value = elements.roomCode.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
  });
  elements.roomCode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") joinRoom();
  });

  elements.roomCodeButton.addEventListener("click", async () => {
    if (!state.room) return;
    const inviteUrl = state.shareUrl || `${location.origin}${location.pathname}`;
    const invite = `Texas Hold'em / 德州扑克\n${inviteUrl}\n房间码 / Room: ${state.room.code}`;
    try {
      await navigator.clipboard.writeText(invite);
      elements.roomCodeButton.textContent = "已复制 / Copied";
      setTimeout(() => {
        if (state.room) elements.roomCodeButton.textContent = state.room.code;
      }, 1200);
    } catch {
      elements.roomCodeButton.textContent = state.room.code;
    }
  });

  elements.startButton.addEventListener("click", () => send({ type: "start" }));
  elements.addBot.addEventListener("click", () => send({ type: "addBot" }));
  elements.removeBot.addEventListener("click", () => send({ type: "removeBot" }));
  elements.fillBots.addEventListener("click", () => send({ type: "fillBots" }));
  elements.nextButton.addEventListener("click", () => {
    send({ type: elements.nextButton.dataset.action === "takeHost" ? "takeHost" : "nextHand" });
  });
  elements.autoNext.addEventListener("click", () => {
    if (!state.room) return;
    send({ type: "toggleAutoNext", enabled: !state.room.autoNext });
  });
  elements.fold.addEventListener("click", () => send({ type: "action", action: "fold" }));
  elements.call.addEventListener("click", () => send({ type: "action", action: "call" }));
  elements.raise.addEventListener("click", () => send({
    type: "action",
    action: "raise",
    target: Number(elements.raiseInput.value),
  }));
  elements.showCards.addEventListener("click", () => send({ type: "showCards", show: true }));
  elements.muckCards.addEventListener("click", () => send({ type: "showCards", show: false }));
  elements.practiceToggle.addEventListener("click", () => {
    state.practiceExpanded = !state.practiceExpanded;
    render();
  });
  document.querySelectorAll("[data-replay-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.replayView = button.dataset.replayView;
      document.querySelectorAll("[data-replay-view]").forEach((item) => {
        item.classList.toggle("active", item.dataset.replayView === state.replayView);
      });
      updateReplayButton();
    });
  });
  elements.replayVideo.addEventListener("click", exportReplayVideo);
  elements.replayDownload.addEventListener("click", (event) => {
    const download = state.replayDownload;
    if (!download) {
      event.preventDefault();
      return;
    }
    setTimeout(() => {
      state.replayDownload = null;
      elements.replayDownload.hidden = true;
      elements.replayVideo.hidden = false;
      elements.replayVideo.textContent = "视频已下载 / Video downloaded";
      setTimeout(() => URL.revokeObjectURL(download.url), 30000);
      setTimeout(updateReplayButton, 1800);
    }, 120);
  });
  elements.chatSend.addEventListener("click", sendChat);
  elements.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendChat();
  });
  document.querySelectorAll("[data-online-quick-bet]").forEach((button) => {
    button.addEventListener("click", () => setQuickBet(button.dataset.onlineQuickBet));
  });

  function leaveRoom() {
    if (state.room) send({ type: "leave" });
    resetToSetup();
  }

  document.querySelector("#leaveOnlineLobbyBtn").addEventListener("click", leaveRoom);
  document.querySelector("#leaveOnlineGameBtn").addEventListener("click", leaveRoom);

  function resetToSetup() {
    clearTimeout(state.animationTimer);
    clearTimeout(state.pulseTimer);
    clearTimeout(state.chatBubbleTimer);
    clearInterval(state.countdownTimer);
    state.animationPhase = "";
    state.pulseSeats = false;
    state.pulseBoard = new Set();
    state.practiceExpanded = false;
    state.lastRoomSnapshot = null;
    state.replayHandNumber = 0;
    state.replayFrames = [];
    state.replayLastSignature = "";
    state.completedReplay = null;
    state.replayGenerating = false;
    if (state.replayDownload?.url) URL.revokeObjectURL(state.replayDownload.url);
    state.replayDownload = null;
    state.replayView = "player";
    document.querySelectorAll("[data-replay-view]").forEach((item) => {
      item.classList.toggle("active", item.dataset.replayView === "player");
    });
    state.room = null;
    state.desiredRoom = "";
    sessionStorage.removeItem("holdem-online-room");
    elements.setup.hidden = false;
    elements.lobby.hidden = true;
    elements.pokerRoom.hidden = true;
  }

  function sendChat() {
    const text = elements.chatInput.value.trim();
    if (!text) return;
    if (send({ type: "chat", text })) elements.chatInput.value = "";
  }

  function setQuickBet(kind) {
    if (!state.room) return;
    const room = state.room;
    const hero = room.players[room.viewerIndex];
    if (!hero) return;
    const minimum = Number(elements.raiseInput.min) || room.bigBlindAmount;
    const maximum = Number(elements.raiseInput.max) || (hero.bet + hero.chips);
    const toCall = Math.max(0, room.currentBet - hero.bet);
    const base = hero.bet + toCall;
    let target = minimum;
    if (kind === "half") target = base + Math.ceil((room.pot + toCall) * 0.5);
    if (kind === "pot") target = base + room.pot + toCall;
    if (kind === "allin") target = maximum;
    elements.raiseInput.value = Math.max(minimum, Math.min(maximum, Math.round(target)));
  }

  function replaySnapshot(room) {
    return {
      code: room.code,
      handNumber: room.handNumber,
      status: room.status,
      street: room.street,
      board: (room.board || []).map((item) => ({ ...item })),
      godHands: (room.replayHands || []).map((hand) => hand.map((item) => ({ ...item }))),
      pot: room.pot,
      currentBet: room.currentBet,
      actor: room.actor,
      dealer: room.dealer,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      smallBlindAmount: room.smallBlindAmount,
      bigBlindAmount: room.bigBlindAmount,
      winners: [...(room.winners || [])],
      viewerIndex: room.viewerIndex,
      action: room.log?.[0] || room.message || "",
      players: room.players.map((player) => ({
        name: player.name,
        chips: player.chips,
        bet: player.bet,
        folded: player.folded,
        allIn: player.allIn,
        cardCount: player.cardCount,
        hand: (player.hand || []).map((item) => ({ ...item })),
      })),
    };
  }

  function captureReplayState(room) {
    if (!room || room.status === "lobby" || !room.handNumber) return;
    if (state.replayHandNumber !== room.handNumber) {
      if (state.replayFrames.length && state.replayFrames[state.replayFrames.length - 1]?.status === "handComplete") {
        state.completedReplay = {
          handNumber: state.replayHandNumber,
          frames: [...state.replayFrames],
        };
      }
      state.replayHandNumber = room.handNumber;
      state.replayFrames = [];
      state.replayLastSignature = "";
    }
    const snapshot = replaySnapshot(room);
    const signature = JSON.stringify(snapshot);
    if (signature === state.replayLastSignature) return;
    state.replayLastSignature = signature;
    state.replayFrames.push(snapshot);
    state.replayFrames = state.replayFrames.slice(-90);
    if (room.status === "handComplete") {
      state.completedReplay = {
        handNumber: room.handNumber,
        frames: [...state.replayFrames],
      };
    }
  }

  function replayForExport() {
    if (state.room?.status === "handComplete" && state.replayFrames.length) {
      return { handNumber: state.replayHandNumber, frames: state.replayFrames };
    }
    if (state.completedReplay?.frames.length) return state.completedReplay;
    if (state.replayFrames.length > 1) {
      return { handNumber: state.replayHandNumber, frames: state.replayFrames };
    }
    return null;
  }

  function replayMimeType() {
    if (typeof MediaRecorder === "undefined") return "";
    return [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type)) || "";
  }

  function godViewHands(replay) {
    for (let index = replay.frames.length - 1; index >= 0; index -= 1) {
      const hands = replay.frames[index].godHands;
      if (hands?.length === replay.frames[index].players.length && hands.every((hand) => hand.length === 2)) {
        return hands;
      }
    }
    return null;
  }

  function prepareReplay(replay) {
    const prepared = JSON.parse(JSON.stringify(replay));
    prepared.view = state.replayView;
    if (prepared.view !== "god") {
      prepared.frames.forEach((frame) => { frame.replayView = "player"; });
      return prepared;
    }
    const hands = godViewHands(prepared);
    if (!hands) return null;
    prepared.frames.forEach((frame) => {
      frame.replayView = "god";
      frame.players.forEach((player, index) => {
        player.hand = hands[index].map((item) => ({ ...item }));
        player.cardCount = player.hand.length;
      });
    });
    return prepared;
  }

  function updateReplayButton() {
    if (!elements.replayVideo) return;
    if (state.replayDownload) {
      elements.replayVideo.hidden = true;
      elements.replayDownload.hidden = false;
      elements.replayDownload.href = state.replayDownload.url;
      elements.replayDownload.download = state.replayDownload.filename;
      const viewLabel = state.replayDownload.view === "god" ? "上帝视角" : "玩家视角";
      elements.replayDownload.textContent = `下载第 ${state.replayDownload.handNumber} 手 · ${viewLabel} / Download Video`;
      return;
    }
    elements.replayVideo.hidden = false;
    elements.replayDownload.hidden = true;
    if (state.replayGenerating) {
      elements.replayVideo.disabled = true;
      elements.replayVideo.classList.add("generating");
      return;
    }
    const replay = replayForExport();
    const godViewAvailable = state.replayView !== "god" || Boolean(replay && godViewHands(replay));
    const supported = typeof HTMLCanvasElement !== "undefined"
      && "captureStream" in HTMLCanvasElement.prototype
      && Boolean(replayMimeType());
    elements.replayVideo.classList.remove("generating");
    elements.replayVideo.disabled = !replay || !supported || !godViewAvailable;
    if (!supported) {
      elements.replayVideo.textContent = "浏览器不支持视频导出 / Video export unsupported";
    } else if (!godViewAvailable) {
      elements.replayVideo.textContent = "本手结束后可用上帝视角 / Available after hand";
    } else if (replay) {
      const viewLabel = state.replayView === "god" ? "上帝视角" : "玩家视角";
      elements.replayVideo.textContent = `生成第 ${replay.handNumber} 手 · ${viewLabel} / Export Hand ${replay.handNumber}`;
    } else {
      elements.replayVideo.textContent = "行动后可生成回放 / Replay available after action";
    }
  }

  function replayRoundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function replayFitText(context, value, maxWidth) {
    const text = String(value || "");
    if (context.measureText(text).width <= maxWidth) return text;
    let shortened = text;
    while (shortened.length > 1 && context.measureText(`${shortened}...`).width > maxWidth) {
      shortened = shortened.slice(0, -1);
    }
    return `${shortened}...`;
  }

  function drawReplayCard(context, item, x, y, width, height, hidden = false) {
    replayRoundRect(context, x, y, width, height, 7);
    context.fillStyle = hidden ? "#a52a37" : "#ffffff";
    context.fill();
    context.lineWidth = 2;
    context.strokeStyle = hidden ? "#f1d9da" : "#d8ddd9";
    context.stroke();
    if (hidden) {
      context.save();
      replayRoundRect(context, x + 5, y + 5, width - 10, height - 10, 4);
      context.clip();
      context.strokeStyle = "rgba(255,255,255,0.42)";
      context.lineWidth = 1;
      for (let offset = -height; offset < width + height; offset += 9) {
        context.beginPath();
        context.moveTo(x + offset, y);
        context.lineTo(x + offset - height, y + height);
        context.stroke();
        context.beginPath();
        context.moveTo(x + offset, y);
        context.lineTo(x + offset + height, y + height);
        context.stroke();
      }
      context.restore();
      context.fillStyle = "#ffffff";
      context.font = `800 ${Math.max(15, width * 0.42)}px "Segoe UI Symbol", sans-serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("♠", x + width / 2, y + height / 2 + 1);
      return;
    }
    if (!item) return;
    context.fillStyle = item.color === "red" ? "#c53d42" : "#18201c";
    context.textAlign = "left";
    context.textBaseline = "top";
    context.font = `900 ${Math.max(14, width * 0.34)}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    context.fillText(item.rank || "", x + 7, y + 5);
    context.font = `${Math.max(15, width * 0.38)}px "Segoe UI Symbol", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(item.suitLabel || "", x + width / 2, y + height * 0.69);
  }

  function drawReplaySeat(context, frame, player, index, table) {
    const positions = seatMap(frame.players.length);
    const [left, top] = positions[index];
    const width = 184;
    const height = 108;
    const centerX = table.x + table.width * (left / 100);
    const centerY = table.y + table.height * (top / 100);
    const x = Math.max(24, Math.min(1280 - width - 24, centerX - width / 2));
    const y = Math.max(76, Math.min(565 - height, centerY - height / 2));
    const current = frame.status === "playing" && frame.actor === index;
    const winner = frame.winners.includes(index);
    context.save();
    context.globalAlpha = player.folded ? 0.58 : 1;
    if (current) {
      context.shadowColor = "rgba(238, 202, 87, 0.9)";
      context.shadowBlur = 24;
    }
    replayRoundRect(context, x, y, width, height, 8);
    context.fillStyle = "rgba(13, 23, 18, 0.94)";
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = current || winner || index === frame.viewerIndex ? 3 : 1.5;
    context.strokeStyle = winner ? "#f1cf63" : current ? "#f1cf63" : index === frame.viewerIndex ? "#83c4aa" : "rgba(255,255,255,0.22)";
    context.stroke();

    context.fillStyle = "#ffffff";
    context.font = '800 17px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillText(replayFitText(context, player.name, 112), x + 12, y + 9);
    const badges = [
      index === frame.dealer ? "D" : "",
      index === frame.smallBlind ? "SB" : "",
      index === frame.bigBlind ? "BB" : "",
    ].filter(Boolean).join(" · ");
    context.fillStyle = "#f1cf63";
    context.font = '800 11px "Segoe UI", sans-serif';
    context.textAlign = "right";
    context.fillText(badges, x + width - 10, y + 12);

    const visible = player.hand || [];
    const count = visible.length || player.cardCount || 0;
    for (let cardIndex = 0; cardIndex < count; cardIndex += 1) {
      drawReplayCard(context, visible[cardIndex], x + 12 + cardIndex * 39, y + 37, 34, 47, visible.length === 0);
    }
    context.fillStyle = "#b9c9c1";
    context.font = '700 13px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "right";
    context.fillText(`${player.chips} 筹码`, x + width - 11, y + 54);
    if (player.bet) {
      context.fillStyle = "#f1cf63";
      context.fillText(`+${player.bet}`, x + width - 11, y + 76);
    }
    if (player.folded || player.allIn) {
      context.fillStyle = player.folded ? "#ee8b8f" : "#f1cf63";
      context.font = '900 11px "Segoe UI", sans-serif';
      context.textAlign = "right";
      context.fillText(player.folded ? "FOLD" : "ALL-IN", x + width - 11, y + 94);
    }
    context.restore();
  }

  // The video is rendered from public snapshots so hidden cards stay hidden until revealed.
  function drawReplayFrame(context, frame, frameIndex, frameCount, progress) {
    const width = context.canvas.width;
    const height = context.canvas.height;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#19211d";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#f7f8f5";
    context.font = '900 25px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "left";
    context.textBaseline = "middle";
    const viewTitle = frame.replayView === "god"
      ? "上帝视角 / OMNISCIENT"
      : "玩家视角 / PLAYER VIEW";
    context.fillText(`德州扑克回放 · ${viewTitle}`, 42, 38);
    const streetLabels = {
      preflop: "翻牌前 / PREFLOP",
      flop: "翻牌 / FLOP",
      turn: "转牌 / TURN",
      river: "河牌 / RIVER",
    };
    context.fillStyle = "#b9c9c1";
    context.font = '700 15px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "right";
    context.fillText(`第 ${frame.handNumber} 手 / HAND ${frame.handNumber}   ${streetLabels[frame.street] || frame.street.toUpperCase()}   盲注 ${frame.smallBlindAmount}/${frame.bigBlindAmount}`, width - 42, 38);

    const table = { x: 64, y: 76, width: 1152, height: 500 };
    context.save();
    context.shadowColor = "rgba(0,0,0,0.52)";
    context.shadowBlur = 28;
    context.beginPath();
    context.ellipse(table.x + table.width / 2, table.y + table.height / 2, table.width / 2, table.height / 2, 0, 0, Math.PI * 2);
    context.fillStyle = "#156a4d";
    context.fill();
    context.shadowBlur = 0;
    context.lineWidth = 14;
    context.strokeStyle = "#a8b2ad";
    context.stroke();
    context.lineWidth = 2;
    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.beginPath();
    context.ellipse(table.x + table.width / 2, table.y + table.height / 2, table.width * 0.42, table.height * 0.38, 0, 0, Math.PI * 2);
    context.stroke();
    context.restore();

    frame.players.forEach((player, index) => drawReplaySeat(context, frame, player, index, table));

    context.fillStyle = "rgba(10, 25, 18, 0.64)";
    replayRoundRect(context, 477, 236, 326, 170, 12);
    context.fill();
    context.fillStyle = "#b9c9c1";
    context.font = '800 13px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "center";
    context.fillText("底池 / POT", 640, 258);
    context.fillStyle = "#ffffff";
    context.font = '900 31px "Segoe UI", sans-serif';
    context.fillText(String(frame.pot), 640, 286);
    const cardWidth = 54;
    const cardHeight = 76;
    const cardGap = 8;
    const boardWidth = cardWidth * 5 + cardGap * 4;
    const boardStart = 640 - boardWidth / 2;
    for (let index = 0; index < 5; index += 1) {
      if (frame.board[index]) {
        drawReplayCard(context, frame.board[index], boardStart + index * (cardWidth + cardGap), 308, cardWidth, cardHeight);
      } else {
        replayRoundRect(context, boardStart + index * (cardWidth + cardGap), 308, cardWidth, cardHeight, 7);
        context.fillStyle = "rgba(255,255,255,0.05)";
        context.fill();
        context.lineWidth = 1.5;
        context.strokeStyle = "rgba(255,255,255,0.2)";
        context.stroke();
      }
    }

    replayRoundRect(context, 160, 595, 960, 70, 10);
    context.fillStyle = "rgba(8, 16, 12, 0.9)";
    context.fill();
    context.fillStyle = "#ffffff";
    context.font = '800 21px "Segoe UI", "Microsoft YaHei", sans-serif';
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(replayFitText(context, frame.action, 900), 640, 625);
    context.fillStyle = "#a8b7b0";
    context.font = '700 12px "Segoe UI", sans-serif';
    context.textAlign = "right";
    context.fillText(`${frameIndex + 1} / ${frameCount}`, 1092, 650);

    context.fillStyle = "rgba(255,255,255,0.14)";
    context.fillRect(160, 680, 960, 5);
    context.fillStyle = "#f1cf63";
    context.fillRect(160, 680, 960 * Math.max(0, Math.min(1, progress)), 5);
    context.fillStyle = "#9fb0a7";
    context.font = '700 12px "Segoe UI", sans-serif';
    context.textAlign = "left";
    context.fillText(`ROOM ${frame.code}`, 42, 696);
    context.textAlign = "right";
    context.fillText("Hold'em Table", width - 42, 696);
  }

  async function exportReplayVideo() {
    if (state.replayGenerating) return;
    const selected = replayForExport();
    const mimeType = replayMimeType();
    if (!selected || !mimeType || !("captureStream" in HTMLCanvasElement.prototype)) return;
    const replay = prepareReplay(selected);
    if (!replay) return;
    state.replayGenerating = true;
    elements.replayVideo.disabled = true;
    elements.replayVideo.classList.add("generating");
    let stream;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const context = canvas.getContext("2d");
      stream = canvas.captureStream(30);
      const frameDuration = 820;
      const totalDuration = Math.max(2800, replay.frames.length * frameDuration + 1200);
      const blob = await new Promise((resolve, reject) => {
        const chunks = [];
        let timer;
        const recorder = new MediaRecorder(stream, {
          mimeType,
          videoBitsPerSecond: 5000000,
        });
        recorder.addEventListener("dataavailable", (event) => {
          if (event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("error", (event) => {
          clearInterval(timer);
          reject(event.error || new Error("Video recording failed"));
        });
        recorder.addEventListener("stop", () => {
          clearInterval(timer);
          resolve(new Blob(chunks, { type: mimeType }));
        });
        const startedAt = performance.now();
        recorder.start(250);
        timer = setInterval(() => {
          const elapsed = performance.now() - startedAt;
          const frameIndex = Math.min(replay.frames.length - 1, Math.floor(elapsed / frameDuration));
          const progress = Math.min(1, elapsed / totalDuration);
          drawReplayFrame(context, replay.frames[frameIndex], frameIndex, replay.frames.length, progress);
          elements.replayVideo.textContent = `生成中 ${Math.round(progress * 100)}% / Rendering`;
          if (elapsed >= totalDuration) {
            clearInterval(timer);
            drawReplayFrame(context, replay.frames[replay.frames.length - 1], replay.frames.length - 1, replay.frames.length, 1);
            recorder.stop();
          }
        }, 1000 / 30);
      });
      const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
      const url = URL.createObjectURL(blob);
      state.replayDownload = {
        url,
        handNumber: replay.handNumber,
        view: replay.view,
        filename: `holdem-hand-${replay.handNumber}-${replay.view}-view-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.${extension}`,
      };
      state.replayGenerating = false;
      elements.replayVideo.classList.remove("generating");
      elements.replayVideo.disabled = false;
      updateReplayButton();
    } catch (error) {
      console.error("Replay video export failed", error);
      state.replayGenerating = false;
      elements.replayVideo.classList.remove("generating");
      elements.replayVideo.textContent = "生成失败，请重试 / Export failed";
      setTimeout(updateReplayButton, 2200);
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      elements.replayVideo.disabled = false;
    }
  }

  function blindScheduleLabel(interval) {
    if (!interval) return "固定 / Fixed";
    return `每 ${interval} 手 / Every ${interval} hands`;
  }

  function renderLobby(room) {
    elements.setup.hidden = true;
    elements.lobby.hidden = false;
    elements.pokerRoom.hidden = true;
    elements.roomCodeButton.textContent = room.code;
    elements.lobbyConfig.innerHTML = `
      <span><strong>${room.players.length}/${room.maxPlayers}</strong> 玩家 / Players</span>
      <span><strong>${room.startingStack}</strong> 起始筹码 / Stack</span>
      <span><strong>${blindScheduleLabel(room.blindInterval)}</strong> 涨盲 / Blinds</span>
      <span><strong>${room.practiceMode ? "开启 / On" : "关闭 / Off"}</strong> 练习模式 / Practice</span>
    `;
    elements.lobbyPlayers.innerHTML = Array.from({ length: room.maxPlayers }, (_, index) => {
      const player = room.players[index];
      if (!player) {
        return `<div class="lobby-player empty"><span>${index + 1}</span><strong>等待加入 / Open seat</strong></div>`;
      }
      const host = player.clientId === room.hostId;
      const bot = player.isBot;
      return `
        <div class="lobby-player ${bot ? "bot" : ""}">
          ${window.BoardGameUI.avatar(player, playerConnected(player), "seat-avatar", player.clientId === state.clientId)}
          <strong>${escapeHtml(player.name)}</strong>
          <small>${bot ? "机器人 / Bot" : !playerConnected(player) ? "离线 / Offline" : host ? "房主 / Host" : "已就座 / Seated"}</small>
        </div>
      `;
    }).join("");
    const isHost = room.canManage || room.hostId === state.clientId || room.originalHostId === state.clientId;
    const botCount = room.players.filter((player) => player.isBot).length;
    elements.startButton.hidden = !isHost;
    elements.startButton.disabled = room.players.length < 2;
    elements.botControls.hidden = !isHost;
    elements.addBot.disabled = room.players.length >= room.maxPlayers;
    elements.fillBots.disabled = room.players.length >= room.maxPlayers;
    elements.removeBot.disabled = botCount <= 0;
    elements.lobbyMessage.textContent = room.players.length < 2
      ? "至少还需要一位玩家 / One more player needed"
      : isHost
        ? "全员准备后即可开局 / Start when everyone is ready"
        : room.hostConnected
          ? "等待房主开局 / Waiting for the host"
          : "房主离线，你可以接管 / Host offline, you can take over";
  }

  function seatMap(count) {
    if (typeof seatPositions === "function") return seatPositions(count);
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI / 2 + (index / count) * Math.PI * 2;
      return [50 + Math.cos(angle) * 40, 50 + Math.sin(angle) * 40];
    });
  }

  function card(card, hidden = false, large = false, extraClass = "") {
    if (hidden) return large
      ? `<div class="playing-card back ${extraClass}"></div>`
      : `<span class="mini-card back ${extraClass}">?</span>`;
    if (!card) return large ? `<div class="playing-card placeholder"></div>` : "";
    return large
      ? `<div class="playing-card ${card.color} ${extraClass}"><span class="rank">${card.rank}</span><span class="suit">${card.suitLabel}</span></div>`
      : `<span class="mini-card ${card.color} ${extraClass}">${card.rank}${card.suitLabel}</span>`;
  }

  function practicePercent(value) {
    if (!Number.isFinite(value)) return "--";
    if (value > 0 && value < 0.0001) return "<0.01%";
    return `${(value * 100).toFixed(1)}%`;
  }

  function renderPractice(room) {
    const analysis = room.practice;
    elements.practiceShell.hidden = !room.practiceMode || !analysis;
    elements.practicePanel.hidden = !state.practiceExpanded || !analysis;
    elements.practiceToggle.textContent = state.practiceExpanded
      ? "隐藏概率 / Hide Odds"
      : "查看概率 / Show Odds";
    if (!analysis) return;
    elements.practiceEquity.textContent = practicePercent(analysis.equity);
    elements.practiceRequired.textContent = analysis.toCall
      ? practicePercent(analysis.requiredEquity)
      : "0%";
    elements.practiceAdvice.textContent = analysis.advice;
    const adviceText = analysis.advice.toLowerCase();
    elements.practiceAdvice.dataset.kind = adviceText.includes("call")
      ? "call"
      : adviceText.includes("fold")
        ? "fold"
        : "neutral";
    elements.practiceDistribution.innerHTML = analysis.distribution.map((item) => `
      <div class="practice-row">
        <span>${escapeHtml(item.label)}</span>
        <div><i style="width:${Math.max(0, Math.min(100, item.probability * 100))}%"></i></div>
        <strong>${practicePercent(item.probability)}</strong>
      </div>
    `).join("");
  }

  function setOnlineAnimation(phase, duration = 520) {
    clearTimeout(state.animationTimer);
    state.animationPhase = phase;
    renderOnlineAnimation();
    if (phase) {
      state.animationTimer = setTimeout(() => {
        state.animationPhase = "";
        renderOnlineAnimation();
      }, duration);
    }
  }

  function renderOnlineAnimation() {
    elements.dealLayer.className = `deal-animation-layer ${state.animationPhase ? `active ${state.animationPhase}` : ""}`;
    elements.dealText.textContent = state.animationPhase === "shuffle"
      ? "洗牌 / Shuffle"
      : state.animationPhase === "burn"
        ? "烧牌 / Burn"
        : state.animationPhase
          ? "发牌 / Deal"
          : "";
  }

  function pulseDealtCards(boardIndexes = []) {
    clearTimeout(state.pulseTimer);
    state.pulseSeats = boardIndexes.length === 0;
    state.pulseBoard = new Set(boardIndexes);
    render();
    state.pulseTimer = setTimeout(() => {
      state.pulseSeats = false;
      state.pulseBoard = new Set();
      render();
    }, 760);
  }

  function updateOnlineAnimation(room) {
    const previous = state.lastRoomSnapshot;
    if (!previous && room.status === "playing") {
      state.practiceExpanded = false;
      setOnlineAnimation("shuffle", 620);
      setTimeout(() => {
        setOnlineAnimation("deal", 560);
        pulseDealtCards();
      }, 640);
    } else if (previous) {
      if (room.status === "playing" && room.handNumber !== previous.handNumber) {
        state.practiceExpanded = false;
        setOnlineAnimation("shuffle", 620);
        setTimeout(() => {
          setOnlineAnimation("deal", 560);
          pulseDealtCards();
        }, 640);
      } else if (room.status === "playing" && room.board.length > previous.boardCount) {
        const newIndexes = Array.from(
          { length: room.board.length - previous.boardCount },
          (_, index) => previous.boardCount + index
        );
        setOnlineAnimation("burn", 260);
        setTimeout(() => {
          setOnlineAnimation("board", 540);
          pulseDealtCards(newIndexes);
        }, 280);
      }
    }
    state.lastRoomSnapshot = {
      handNumber: room.handNumber,
      boardCount: room.board.length,
      status: room.status,
    };
  }

  function playerConnected(player) {
    return Boolean(player.isBot || (player.connected && (player.clientId !== state.clientId || state.socket?.readyState === WebSocket.OPEN)));
  }

  function renderTable(room) {
    elements.setup.hidden = true;
    elements.lobby.hidden = true;
    elements.pokerRoom.hidden = false;
    updateOnlineAnimation(room);
    const positions = seatMap(room.players.length);
    elements.playersLayer.innerHTML = room.players.map((player, index) => {
      const [left, top] = positions[index];
      const visibleCards = player.hand || [];
      const dealtClass = state.pulseSeats ? "dealt-card" : "";
      const cards = visibleCards.length
        ? visibleCards.map((item) => card(item, false, false, dealtClass)).join("")
        : Array.from({ length: player.cardCount || 0 }, () => card(null, true, false, dealtClass)).join("");
      const badges = [
        index === room.dealer ? `<span class="dealer-button">D · 庄家 / Dealer</span>` : "",
        index === room.smallBlind
          ? `<span class="blind-button">SB ${room.smallBlindAmount} · 小盲</span>`
          : "",
        index === room.bigBlind
          ? `<span class="blind-button">BB ${room.bigBlindAmount} · 大盲</span>`
          : "",
      ].join("");
      const classes = [
        "player-seat",
        index === room.actor ? "current" : "",
        player.folded ? "folded" : "",
        room.winners.includes(index) ? "winner" : "",
        !playerConnected(player) ? "offline" : "",
      ].filter(Boolean).join(" ");
      const latestChat = [...(room.chat || [])].reverse().find((entry) => (
        entry.clientId === player.clientId && Date.now() - entry.time < 8000
      ));
      return `
        <div class="${classes}" data-player-id="${index}" style="left:${left}%;top:${top}%">
          <div class="seat-head">${window.BoardGameUI.avatar(player, playerConnected(player), "seat-avatar", player.clientId === state.clientId)}<span class="seat-name">${escapeHtml(player.name)}</span></div>
          ${latestChat ? `<div class="seat-chat-bubble">${escapeHtml(latestChat.text)}</div>` : ""}
          <span class="seat-badges">${player.isBot ? `<span class="bot-button">BOT · 机器人</span>` : ""}${badges}</span>
          <div class="seat-cards">${cards}</div>
          <div class="seat-foot">
            <span class="seat-stack">${player.chips}${player.allIn ? " · ALL-IN" : ""}</span>
            <span class="seat-bet">${player.bet ? `+${player.bet}` : ""}</span>
          </div>
        </div>
      `;
    }).join("");

    elements.board.innerHTML = Array.from(
      { length: 5 },
      (_, index) => card(room.board[index], false, true, state.pulseBoard.has(index) ? "board-dealt-card" : "")
    ).join("");
    elements.pot.textContent = room.pot;
    elements.message.textContent = room.message;
    elements.handNumber.textContent = `#${room.handNumber}`;
    elements.street.textContent = room.street.toUpperCase();
    elements.blind.textContent = `盲注 / Blinds ${room.smallBlindAmount} / ${room.bigBlindAmount}`;
    elements.roomBadge.textContent = `房间 / Room ${room.code}`;
    elements.log.innerHTML = room.log.map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join("");
    elements.chatEntries.innerHTML = (room.chat || []).map((entry) => (
      `<div class="chat-line"><strong>${escapeHtml(entry.name)}:</strong> ${escapeHtml(entry.text)}</div>`
    )).join("");
    elements.chatEntries.scrollTop = elements.chatEntries.scrollHeight;
    clearTimeout(state.chatBubbleTimer);
    const chatMessages = room.chat || [];
    const newestChat = chatMessages[chatMessages.length - 1];
    if (newestChat && Date.now() - newestChat.time < 8000) {
      state.chatBubbleTimer = setTimeout(render, Math.max(50, 8050 - (Date.now() - newestChat.time)));
    }
    renderOnlineAnimation();
    updateReplayButton();

    const hero = room.players[room.viewerIndex];
    if (!hero) return;
    elements.heroCards.innerHTML = hero.hand.map((item) => card(
      item,
      false,
      true,
      state.pulseSeats ? "board-dealt-card" : ""
    )).join("");
    elements.heroName.textContent = hero.name;
    elements.heroStack.textContent = `${hero.chips} 筹码 / chips`;
    renderPractice(room);
    const heroTurn = room.status === "playing" && room.actor === room.viewerIndex;
    elements.actionPanel.classList.toggle("waiting", !heroTurn);
    [elements.fold, elements.call, elements.raise, elements.raiseInput].forEach((control) => {
      control.disabled = !heroTurn;
    });
    const toCall = Math.max(0, room.currentBet - hero.bet);
    elements.call.textContent = toCall
      ? `跟注 ${Math.min(toCall, hero.chips)} / Call`
      : "过牌 / Check";
    const minimum = room.currentBet === 0
      ? room.bigBlindAmount
      : room.currentBet + room.minRaise;
    const maximum = hero.bet + hero.chips;
    elements.raiseInput.min = Math.min(minimum, maximum);
    elements.raiseInput.max = maximum;
    if (Number(elements.raiseInput.value) < minimum || Number(elements.raiseInput.value) > maximum) {
      elements.raiseInput.value = Math.min(minimum, maximum);
    }
    const uncontestedWinner = room.status === "handComplete"
      && !room.wasShowdown
      && room.winners.includes(room.viewerIndex);
    const canChooseReveal = hero.hand.length > 0 && (hero.folded || uncontestedWinner);
    elements.revealPanel.hidden = !canChooseReveal;
    elements.showCards.disabled = !canChooseReveal || hero.showCards;
    elements.muckCards.disabled = !canChooseReveal || !hero.showCards;
    const isHost = room.canManage || room.hostId === state.clientId || room.originalHostId === state.clientId;
    elements.autoNext.hidden = !isHost;
    elements.autoNext.textContent = room.autoNext
      ? "自动下一手：开 / Auto On"
      : "自动下一手：关 / Auto Off";
    if (room.status === "handComplete" && isHost && !room.hostConnected && room.hostId !== state.clientId) {
      elements.nextButton.hidden = false;
      elements.nextButton.dataset.action = "takeHost";
      elements.nextButton.textContent = "接管房主 / Take Host";
    } else {
      elements.nextButton.dataset.action = "nextHand";
      elements.nextButton.hidden = !(room.status === "handComplete" && isHost);
      const seconds = room.nextHandAt ? Math.max(0, Math.ceil((room.nextHandAt - Date.now()) / 1000)) : 0;
      elements.nextButton.textContent = seconds
        ? `下一手 ${seconds}s / Next`
        : "下一手 / Next Hand";
    }
    clearInterval(state.countdownTimer);
    if (room.status === "handComplete" && room.nextHandAt) {
      state.countdownTimer = setInterval(render, 1000);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function render() {
    if (!state.room) {
      resetToSetup();
    } else if (state.room.status === "lobby") {
      renderLobby(state.room);
    } else {
      renderTable(state.room);
    }
  }

  connect();
})();
