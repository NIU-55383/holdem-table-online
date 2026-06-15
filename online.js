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
    intentionalClose: false,
    shareUrl: "",
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
    startButton: document.querySelector("#startOnlineGameBtn"),
    nextButton: document.querySelector("#onlineNextHandBtn"),
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
    actionPanel: document.querySelector("#onlineActionPanel"),
    fold: document.querySelector("#onlineFoldBtn"),
    call: document.querySelector("#onlineCallBtn"),
    raise: document.querySelector("#onlineRaiseBtn"),
    raiseInput: document.querySelector("#onlineRaiseInput"),
    log: document.querySelector("#onlineLogEntries"),
  };

  elements.name.value = localStorage.getItem("holdem-online-name") || "";

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
      send({ type: "hello", clientId: state.clientId });
      if (state.desiredRoom) {
        send({
          type: "join",
          code: state.desiredRoom,
          name: elements.name.value || "Player",
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
      if (data.type === "state") {
        state.room = data.room;
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

  document.querySelector("#createOnlineRoomBtn").addEventListener("click", () => {
    const name = playerName();
    if (!name) return;
    state.desiredRoom = "";
    send({
      type: "create",
      name,
      maxPlayers: state.maxPlayers,
      startingStack: state.startingStack,
      blindInterval: state.blindInterval,
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
    send({ type: "join", name, code });
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
  elements.nextButton.addEventListener("click", () => send({ type: "nextHand" }));
  elements.fold.addEventListener("click", () => send({ type: "action", action: "fold" }));
  elements.call.addEventListener("click", () => send({ type: "action", action: "call" }));
  elements.raise.addEventListener("click", () => send({
    type: "action",
    action: "raise",
    target: Number(elements.raiseInput.value),
  }));

  function leaveRoom() {
    if (state.room) send({ type: "leave" });
    resetToSetup();
  }

  document.querySelector("#leaveOnlineLobbyBtn").addEventListener("click", leaveRoom);
  document.querySelector("#leaveOnlineGameBtn").addEventListener("click", leaveRoom);

  function resetToSetup() {
    state.room = null;
    state.desiredRoom = "";
    sessionStorage.removeItem("holdem-online-room");
    elements.setup.hidden = false;
    elements.lobby.hidden = true;
    elements.pokerRoom.hidden = true;
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
          <span>${index + 1}</span>
          <strong>${escapeHtml(player.name)}</strong>
          <small>${bot ? "机器人 / Bot" : (host ? "房主 / Host" : (player.connected ? "已就座 / Seated" : "断线 / Offline"))}</small>
        </div>
      `;
    }).join("");
    const isHost = room.hostId === state.clientId;
    const botCount = room.players.filter((player) => player.isBot).length;
    elements.startButton.hidden = !isHost;
    elements.startButton.disabled = room.players.length < 2;
    elements.botControls.hidden = !isHost;
    elements.addBot.disabled = room.players.length >= room.maxPlayers;
    elements.removeBot.disabled = botCount <= 0;
    elements.lobbyMessage.textContent = room.players.length < 2
      ? "至少还需要一位玩家 / One more player needed"
      : isHost
        ? "全员准备后即可开局 / Start when everyone is ready"
        : "等待房主开局 / Waiting for the host";
  }

  function seatMap(count) {
    if (typeof seatPositions === "function") return seatPositions(count);
    return Array.from({ length: count }, (_, index) => {
      const angle = Math.PI / 2 + (index / count) * Math.PI * 2;
      return [50 + Math.cos(angle) * 40, 50 + Math.sin(angle) * 40];
    });
  }

  function card(card, hidden = false, large = false) {
    if (hidden) return large
      ? `<div class="playing-card back"></div>`
      : `<span class="mini-card back">?</span>`;
    if (!card) return large ? `<div class="playing-card placeholder"></div>` : "";
    return large
      ? `<div class="playing-card ${card.color}"><span class="rank">${card.rank}</span><span class="suit">${card.suitLabel}</span></div>`
      : `<span class="mini-card ${card.color}">${card.rank}${card.suitLabel}</span>`;
  }

  function renderTable(room) {
    elements.setup.hidden = true;
    elements.lobby.hidden = true;
    elements.pokerRoom.hidden = false;
    const positions = seatMap(room.players.length);
    elements.playersLayer.innerHTML = room.players.map((player, index) => {
      const [left, top] = positions[index];
      const visibleCards = player.hand || [];
      const cards = visibleCards.length
        ? visibleCards.map((item) => card(item)).join("")
        : Array.from({ length: player.cardCount || 0 }, () => card(null, true)).join("");
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
        !player.connected ? "offline" : "",
      ].filter(Boolean).join(" ");
      return `
        <div class="${classes}" style="left:${left}%;top:${top}%">
          <div class="seat-head"><span class="seat-name">${escapeHtml(player.name)}</span></div>
          <span class="seat-badges">${player.isBot ? `<span class="bot-button">BOT · 机器人</span>` : ""}${badges}</span>
          <div class="seat-cards">${cards}</div>
          <div class="seat-foot">
            <span class="seat-stack">${player.chips}${player.allIn ? " · ALL-IN" : ""}</span>
            <span class="seat-bet">${player.bet ? `+${player.bet}` : ""}</span>
          </div>
        </div>
      `;
    }).join("");

    elements.board.innerHTML = Array.from({ length: 5 }, (_, index) => card(room.board[index], false, true)).join("");
    elements.pot.textContent = room.pot;
    elements.message.textContent = room.message;
    elements.handNumber.textContent = `#${room.handNumber}`;
    elements.street.textContent = room.street.toUpperCase();
    elements.blind.textContent = `盲注 / Blinds ${room.smallBlindAmount} / ${room.bigBlindAmount}`;
    elements.roomBadge.textContent = `房间 / Room ${room.code}`;
    elements.log.innerHTML = room.log.map((entry) => `<div class="log-entry">${escapeHtml(entry)}</div>`).join("");

    const hero = room.players[room.viewerIndex];
    if (!hero) return;
    elements.heroCards.innerHTML = hero.hand.map((item) => card(item, false, true)).join("");
    elements.heroName.textContent = hero.name;
    elements.heroStack.textContent = `${hero.chips} 筹码 / chips`;
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
    const isHost = room.hostId === state.clientId;
    elements.nextButton.hidden = !(room.status === "handComplete" && isHost);
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
