"use strict";
(() => {
  const $ = (id) => document.getElementById(id), B = window.CatanBoard, Maps = window.CatanMaps, S = window.CatanScenarioUI;
  const labels = ["木材", "砖块", "羊毛", "麦子", "矿石"], english = ["Lumber", "Brick", "Wool", "Grain", "Ore"];
  const colors = ["#30885c", "#c66b4b", "#8fb349", "#ccab36", "#859da2"];
  const devNames = { knight: ["骑士", "Knight"], roads: ["道路建设", "Road Building"], plenty: ["丰收", "Year of Plenty"], monopoly: ["垄断", "Monopoly"], vp: ["胜利点", "Victory Point"] };
  const costs = { road: [0, 1], ship: [0, 2], settlement: [0, 1, 2, 3], city: [3, 3, 4, 4, 4], development: [2, 3, 4] };
  const state = { socket: null, room: null, seats: 4, mode: "", selected: null, tradeMode: "bank", resourceMode: "", pending: false, phaseKey: "", diceKey: "", reconnect: null, noticeTimer: null, cardBaseline: false, cardChanges: new Map(), cardChangeTimer: null };
  const CARD_CHANGE_DURATION = 3500;
  const audio = window.CatanAudio.create(), soundEvents = window.CatanAudio.tracker(kind => audio.play(kind));
  const music = window.CatanMusic.create();
  let viewedTradeKey = "", alertTradeKey = "";
  let harborSetupKey = "", harborSetupAcknowledged = false;
  let islandRoadIntent = null;
  function renderSoundToggle() {
    const button = $("soundToggle"), label = audio.muted ? "开启音效 / Enable sounds" : "关闭音效 / Mute sounds";
    button.title = label; button.setAttribute("aria-label", label); button.setAttribute("aria-pressed", String(!audio.muted));
    button.innerHTML = `<i data-lucide="${audio.muted ? "volume-x" : "volume-2"}" aria-hidden="true"></i>`;
    window.lucide?.createIcons();
  }
  $("soundToggle").onclick = () => { audio.setMuted(!audio.muted); renderSoundToggle(); renderAudioSettings(); };
  renderSoundToggle();
  const unlockAudio = () => { audio.unlock(); music.unlock(); };
  document.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
  document.addEventListener("pointerup", unlockAudio, { capture: true, passive: true });
  document.addEventListener("keydown", event => { if (["Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) unlockAudio(); }, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) audio.stop(); music.sync(); });
  window.addEventListener("pagehide", () => music.stop());
  window.addEventListener("pageshow", event => { if (event.persisted) music.unlock(); });
  function renderAudioSettings() {
    $("musicEnabled").checked = music.enabled; $("sfxEnabled").checked = !audio.muted;
    $("musicVolume").value = Math.round(music.volume * 100); $("sfxVolume").value = Math.round(audio.volume * 100);
    $("musicVolumeValue").textContent = `${Math.round(music.volume * 100)}%`; $("sfxVolumeValue").textContent = `${Math.round(audio.volume * 100)}%`;
    $("musicTrackCredit").textContent = music.track.title; $("musicTrackCredit").href = music.track.source;
    $("musicError").hidden = !music.failed;
  }
  music.onChange(renderAudioSettings);
  $("audioSettings").onclick = () => { renderAudioSettings(); if (!$("audioSettingsDialog").open) $("audioSettingsDialog").showModal(); };
  $("musicEnabled").onchange = () => music.setEnabled($("musicEnabled").checked);
  $("sfxEnabled").onchange = () => { audio.setMuted(!$("sfxEnabled").checked); renderSoundToggle(); renderAudioSettings(); };
  $("musicVolume").oninput = () => { music.setVolume(Number($("musicVolume").value) / 100); renderAudioSettings(); };
  $("sfxVolume").oninput = () => { audio.setVolume(Number($("sfxVolume").value) / 100); renderAudioSettings(); };
  $("sfxVolume").onchange = () => audio.play("click");
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || button.disabled || button.id === "soundToggle") return;
    if (button.matches("[data-close],[data-edition],[data-layout],[data-skin],[data-add-resource],[data-remove-resource],[data-add-trade],[data-remove-trade],[data-discard-side],[data-trade-mode],[data-action],[data-dev],#viewIncomingTrade,#helpButton,#baseRules,#seafarerRules,#mapRules,#lobbyMapRules,#gameMapRules,#gameBaseRules,#gameSailingRules")) audio.play("click");
  }, true);
  state.mapId = "base"; state.layout = "default"; state.moveFrom = null; state.thieves = "both"; state.harbor = null; state.victim = null;
  try { state.skins = window.GameSocialData.normalizeSkins(JSON.parse(localStorage.getItem("catan-piece-skins") || "null")); }
  catch { state.skins = window.GameSocialData.normalizeSkins(); }
  const social = window.BoardGameUI.mountInteractions(() => state.room && ({ code: state.room.code, players: state.room.seats, you: state.room.seats[state.room.you]?.socialId, connected: state.socket?.readyState === WebSocket.OPEN }), send);
  const management = window.BoardGameUI.mountRoomControl(() => state.room?.control, send, () => document.querySelector(state.room?.game ? ".game-rule-links" : "#lobby .room-heading"));
  function renderSkins() {
    $("pieceSkins").innerHTML = Object.entries(window.GameSocialData.skins).map(([kind, choices]) => `<fieldset ${kind === "pirate" && state.mapId === "base" ? "hidden" : ""}><legend>${kind === "robber" ? "强盗 / Robber" : "海盗 / Pirate"}</legend><div class="skin-options">${choices.map((s) => `<button type="button" data-skin-kind="${kind}" data-skin="${s.id}" title="${s.label}" aria-label="${s.label}" aria-pressed="${state.skins[kind] === s.id}">${s.emoji || `<svg viewBox="0 0 48 48" aria-hidden="true">${B.icon(s.art)}</svg>`}</button>`).join("")}</div></fieldset>`).join("");
  }
  $("pieceSkins").onclick = (event) => {
    const button = event.target.closest("[data-skin]"); if (!button) return;
    state.skins[button.dataset.skinKind] = button.dataset.skin;
    try { localStorage.setItem("catan-piece-skins", JSON.stringify(state.skins)); } catch {}
    chooseMap(state.mapId);
  };
  const layoutName = (layout, mapId = state.room?.mapId || state.mapId) => layout === "random" ? Maps.get(mapId)?.randomPolicy?.portsOnly ? "固定地形 · 随机港口 / Fixed terrain · Random harbors" : "随机地图 / Random" : "默认地图 / Default";
  let previewRequest = 0, supplyRoomKey = "";
  function showSailingRules(mapId, general = false) {
    const map = Maps.get(mapId);
    if (!map && !general) return;
    $("sailingTitle").innerHTML = general ? "航海家规则<small>Seafarers Rules</small>" : `${B.escape(map.name)}<small>${B.escape(map.english)} · ${S.playerRange(map)} Players · ${S.target(map)[1]}</small>`;
    $("sailingContent").innerHTML = (general ? Maps.rules : map.rules).map(([zh, en]) => `<p>${B.escape(zh)}<small>${B.escape(en)}</small></p>`).join("")
      + '<a class="rules-link" href="https://www.catan.com/sites/default/files/2021-06/catan-seafarers_2021_rule_book_201201.pdf" target="_blank" rel="noopener noreferrer">官方规则 / Official Rulebook ↗</a>';
    if (!general) {
      const preview = document.createElement("div"); preview.className = "map-rules-preview"; $("sailingContent").prepend(preview);
      const mode = document.createElement("p"); mode.className = "map-layout-label"; mode.textContent = layoutName(state.room?.layout || state.layout); $("sailingContent").prepend(mode);
      const roomBoard = state.room?.mapId === mapId && (state.room.game?.board || state.room.previewBoard);
      if (roomBoard) preview.innerHTML = B.render(roomBoard, { preview: true });
      else fetch(`/api/catan-preview?map=${encodeURIComponent(mapId)}&layout=${state.layout}&players=${state.seats}&thieves=${state.thieves}`).then((r) => r.json()).then((board) => { if (preview.isConnected) preview.innerHTML = B.render({ ...board, skins: state.room?.skins || state.skins }, { preview: true }); }).catch(() => {});
    }
    if (!$("sailingDialog").open) $("sailingDialog").showModal();
    $("sailingContent").scrollTop = 0;
  }
  $("sailingAcknowledge").onclick = () => $("sailingDialog").close();
  function showScenarioInfo(target) {
    const info = S.pirateInfo(target.dataset.scenarioInfo, Number(target.dataset.owner), Number(target.dataset.strength ?? 3))
      || S.tribeInfo(target.dataset.scenarioInfo, Number(target.dataset.resource ?? -1));
    if (!info) return;
    $("scenarioInfoTitle").innerHTML = `${B.escape(info.title[0])}<small>${B.escape(info.title[1])}</small>`;
    const symbol = info.scenarioArt ? S.art(info.scenarioArt) : info.icon ? icon(info.icon) : "";
    $("scenarioInfoContent").innerHTML = (symbol ? `<div class="scenario-info-symbol"${info.color ? ` style="color:${info.color}"` : ""}>${symbol}</div>` : "") + info.paragraphs.map(([zh, en]) => `<p>${B.escape(zh)}<small>${B.escape(en)}</small></p>`).join("");
    if (!$("scenarioInfoDialog").open) $("scenarioInfoDialog").showModal();
    $("scenarioInfoContent").scrollTop = 0;
  }
  for (const id of ["previewBoard", "sailingContent", "board", "scenarioPanel"]) {
    const explain = event => {
      const target = event.target.closest("[data-scenario-info]");
      if (!target || event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
      event.preventDefault(); event.stopImmediatePropagation(); showScenarioInfo(target);
    };
    $(id).addEventListener("click", explain);
    $(id).addEventListener("keydown", explain);
  }
  function showBaseRules() {
    const map = Maps.get(state.room?.mapId || state.mapId), target = state.room?.game?.target || map?.target || 10;
    $("helpTitle").innerHTML = map ? "通用规则与费用<small>Core Rules &amp; Costs</small>" : "基础版规则<small>Base Game Rules</small>";
    $("rulesVictory").innerHTML = `在自己的回合达到 ${target} 分即获胜。村庄 1 分，城市 2 分，最长${map ? "商路" : "道路"}与最大骑士团各 2 分，胜利点发展卡各 1 分。<small>Win immediately with ${target} victory points on your own turn. Settlement 1; city 2; longest ${map ? "route" : "road"} and largest army 2 each; victory point card 1.</small>`;
    $("rulesVictoryCard").innerHTML = `胜利点卡例外：新买的卡也立即计分，不占每回合使用一张发展卡的额度。在自己的回合达到 ${target} 分即可获胜。<small>Victory point cards are the exception: they count immediately, including newly purchased cards, and do not use your one-development-card allowance. Reach ${target} points on your own turn to win.</small>`;
    $("rulesShipSupply").hidden = !map; $("rulesScenarioNote").hidden = !map;
    $("buildingCosts").innerHTML = Object.entries(costs).filter(([type]) => type !== "ship" || map).map(([type, resources]) => {
      const name = ({ road: "道路 / Road", ship: "船 / Ship", settlement: "村庄 / Settlement", city: "城市 / City", development: "发展卡 / Dev card" })[type];
      const description = resources.map((r) => `${labels[r]} / ${english[r]}`).join(", ");
      return `<div class="cost-row" data-cost="${type}"><span>${name}</span><div class="cost-resources" role="img" aria-label="${description}" title="${description}">${resources.map((r) => icon(B.RES[r])).join("")}</div></div>`;
    }).join("");
    const effects = [
      ["knight", map?.family === "pirates" ? "warship" : "robber", map?.family === "pirates" ? "作为战舰卡：将最靠近主岛的一艘普通船改为战舰，不移动海盗。计入每回合最多一张行动发展卡的限制，购买当回合不能使用。" : "移动强盗，按规则偷取一张资源。", map?.family === "pirates" ? "As a Warship card: convert the normal ship nearest the mainland into a warship, without moving the pirate. Counts toward the limit of one action development card per turn; not playable on the turn bought." : "Move the robber and steal one resource, following the robber rules."],
      ["roads", "dev-roads", (map ? "免费建造两条道路或两艘船，也可各一。" : "免费建造两条道路，仍需遵守连接规则与棋子上限。") + "放下第一段之前可以撤回，归还卡牌与本回合使用机会；放下后不可撤回。", (map ? "Build two roads or ships for free, in any combination." : "Build two roads for free, obeying placement rules and piece limits.") + " Cancel before the first placement to restore the card and your development-card allowance; not after placement."],
      ["plenty", "dev-plenty", "从银行拿两张自选资源，可以同种；仅限银行库存。", "Take two resources of your choice from the bank, including two of the same type, subject to supply."],
      ["monopoly", "dev-monopoly", "指定一种资源，其他玩家须交出该种资源的所有手牌。", "Choose a resource. All opponents give you every card of that resource."],
      ["vp", "dev-vp", "秘密增加一分，达到获胜条件时计入总分。", "One hidden victory point, counted when checking for victory."]
    ];
    const pirate = map?.family === "pirates", players = state.room?.game?.players.length || state.room?.maxPlayers || state.seats;
    const deckCounts = { knight: pirate && players === 4 ? 19 : 14, vp: pirate ? 0 : 5, roads: 2, plenty: 2, monopoly: 2 };
    $("rulesDevelopment").innerHTML = effects.filter(([type]) => deckCounts[type]).map(([type, art, zh, en]) => {
      const name = S.devName(type, pirate) || devNames[type];
      return `<div><dt>${art === "warship" ? S.art("warship") : icon(art)}<span>${name[0]} × ${deckCounts[type]}<small>${name[1]} × ${deckCounts[type]}</small></span></dt><dd>${zh}<small>${en}</small></dd></div>`;
    }).join("");
    if (map) {
      const extra = map.family === "pirates" ? ["本图不使用最长商路和最大骑士团。骑士卡改为战舰卡；三人移除 5 张胜利点卡，四人把它们也改为战舰卡。每回合最多使用一张行动发展卡，战舰卡也计入此限制，购买当回合不能使用。必须解放自己的要塞并达到目标分数才能获胜。", "No Longest Route or Largest Army here. Knights become Warships; three players remove the 5 VP cards, four players also convert them to Warships. Play at most one action development card per turn, including Warships; not on the turn bought. Liberate your own fortress and reach the target VP to win."] : map.family === "wonders" ? ["每人最多认领一项奇迹；认领时须从自己的 15 艘船库存中预留一艘作为永久标记，该船不能再用于棋盘，库存无船时不能认领。在自己的回合建完第 4 阶段，或达到 10 分且奇迹阶段严格领先所有对手，即获胜。", "Claim at most one wonder. Reserve one of your 15 ships from supply as its permanent marker; that ship is unavailable for the board, and claiming requires an available ship. Win on your turn by completing stage 4, or with 10 VP and strictly more wonder stages than every opponent."] : map.family === "cloth" ? ["本图不使用最长商路。每 2 布匹计 1 分；布匹公开，不是资源卡，不能交易或弃牌。村庄供货耗尽时也可能提前结算，详见本图规则。", "No Longest Route here. Every 2 cloth score 1 VP. Cloth is public, not a resource card, and cannot be traded or discarded. Depleted village supplies may end the game early; see Map Rules."] : ["航海家的船、海盗、金矿与地图奖励另见「航海规则」及「本图规则」；剧本例外优先。", "See Sailing Rules and Map Rules for ships, pirates, gold and rewards. Scenario exceptions take precedence."];
      $("rulesScenarioNote").innerHTML = `${extra[0]}<small>${extra[1]}</small>`;
      if (["wonders", "pirates"].includes(map.family)) {
        $("rulesVictory").innerHTML = `${S.target(map)[0]}。${extra[0]}<small>${S.target(map)[1]}. ${extra[1]}</small>`;
        $("rulesVictoryCard").innerHTML = "胜利点卡立即计分，包括新买的卡；但仍须满足本图的特殊获胜条件。<small>Victory point cards count immediately, even when newly bought, but this scenario's special victory conditions still apply.</small>";
        if (pirate) {
          $("rulesVictoryCard").innerHTML = "本图没有直接加分的发展卡。三人局移除全部 5 张胜利点卡，共 20 张发展卡，其中 14 张战舰；四人局保留这 5 张，但都当战舰卡使用，不加分，共 25 张，其中 19 张战舰。两种人数都是道路建设、丰收、垄断各 2 张。<small>No development card scores VP here. With 3 players, remove all 5 VP cards: 20 cards total, including 14 Warships. With 4 players, keep those 5 but use them as Warship cards, worth no VP: 25 cards total, including 19 Warships. Both decks contain 2 Road Building, 2 Year of Plenty and 2 Monopoly cards.</small>";
          $("rulesScenarioNote").innerHTML += "<br>要塞收复前不能升级城市；收复后变成自己的村庄，可以按正常费用（2 麦子 + 3 矿石）升级城市，仍受每人最多 4 座城市的限制。进攻会结束回合，升级要等之后自己的建造阶段。<small>A fortress cannot be upgraded before liberation. Once liberated, it becomes your settlement and can be upgraded for the normal cost of 2 grain + 3 ore, within your 4-city limit. Attacking ends your turn, so upgrade during a later building phase of your own.</small>";
        }
      }
    }
    if (!$("helpDialog").open) $("helpDialog").showModal();
    $("helpContent").scrollTop = 0;
  }
  $("baseRules").onclick = showBaseRules;
  $("helpAcknowledge").onclick = () => $("helpDialog").close();
  $("mapChoice").innerHTML = Maps.maps.map((map) => `<option value="${map.id}">${map.name} / ${map.english} · ${S.playerRange(map)}人 / Players</option>`).join("");
  function chooseMap(id) {
    const map = Maps.get(id); state.mapId = map ? id : "base";
    if (!state.room) music.setEdition(state.mapId);
    renderSkins();
    $("baseSetup").hidden = Boolean(map); $("seafarerSetup").hidden = !map; $("playerCountChoice").hidden = Boolean(map && !(map.minPlayers < map.players));
    $("scenarioSetup").hidden = map?.id !== "new-world";
    $("layoutChoice").querySelector('[data-layout="random"]').innerHTML = map?.randomPolicy?.portsOnly ? "随机港口<small>Random harbors · Fixed terrain</small>" : "随机地图<small>Random</small>";
    document.querySelectorAll("[data-edition]").forEach((b) => b.classList.toggle("selected", b.dataset.edition === (map ? "seafarers" : "base")));
    $("editionTitle").innerHTML = map ? '卡坦：航海家<small>CATAN Seafarers</small>' : '卡坦岛 <small>CATAN</small>';
    $("mapSummary").textContent = map ? `${map.name} / ${map.english} · ${S.playerRange(map)} 玩家 / Players · ${S.target(map)[0]} / ${S.target(map)[1]}` : "3–4 玩家 / Players · 10 VP";
    if (map) { state.seats = map.minPlayers < map.players ? Math.max(map.minPlayers, Math.min(map.players, Number($("seatChoice").querySelector(".selected")?.dataset.seats) || map.players)) : map.players; $("mapChoice").value = id; }
    else { state.seats = Number($("seatChoice").querySelector(".selected")?.dataset.seats) || 4; }
    const request = ++previewRequest;
    fetch(`/api/catan-preview?map=${encodeURIComponent(state.mapId)}&layout=${state.layout}&players=${state.seats}&thieves=${state.thieves}`).then((r) => { if (!r.ok) throw new Error("preview"); return r.json(); }).then((board) => { if (request === previewRequest) { $("previewBoard").innerHTML = B.render({ ...board, skins: state.skins }, { preview: true }); $("previewBoard").dataset.layout = board.layout || "default"; $("previewBoard").dataset.map = state.mapId; } }).catch(() => { if (request === previewRequest) $("previewBoard").innerHTML = `<div class="offline-island">${icon("ship")}<p>请使用新版服务器 / Updated server required</p></div>`; });
  }
  $("editionChoice").onclick = (e) => { const b = e.target.closest("[data-edition]"); if (!b) return; chooseMap(b.dataset.edition === "seafarers" ? $("mapChoice").value : "base"); };
  $("mapChoice").onchange = () => chooseMap($("mapChoice").value);
  $("thiefChoice").onclick = e => {
    const button = e.target.closest("[data-thieves]"); if (!button) return;
    state.thieves = button.dataset.thieves;
    $("thiefChoice").querySelectorAll("button").forEach(b => { b.classList.toggle("selected", b === button); b.setAttribute("aria-pressed", String(b === button)); });
    chooseMap(state.mapId);
  };
  $("layoutChoice").onclick = (e) => {
    const button = e.target.closest("[data-layout]"); if (!button) return;
    state.layout = button.dataset.layout;
    $("layoutChoice").querySelectorAll("button").forEach((b) => { b.classList.toggle("selected", b === button); b.setAttribute("aria-pressed", String(b === button)); });
    chooseMap(state.mapId);
  };
  $("seafarerRules").onclick = () => showSailingRules(state.mapId, true);
  $("mapRules").onclick = () => showSailingRules(state.mapId);
  $("lobbyMapRules").onclick = () => Maps.get(state.room.mapId) ? showSailingRules(state.room.mapId) : showBaseRules();
  $("gameMapRules").onclick = () => showSailingRules(state.room.mapId);
  $("gameBaseRules").onclick = showBaseRules;
  $("gameSailingRules").onclick = () => showSailingRules(state.room.mapId, true);
  let tradeDraft = { give: [0, 0, 0, 0, 0], want: [0, 0, 0, 0, 0] };
  let discardDraft = [0, 0, 0, 0, 0];
  let resourceDraft = [0, 0, 0, 0, 0];
  const chatBubbles = new Map();
  let chatRoomKey = "", seenChat = new Set(), chatBubbleTimer = null;
  const icon = (kind, cls = "") => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">${["robber", "pirate"].includes(kind) ? B.piece(kind, 0, 0, 48, state.room?.skins || state.skins) : B.icon(kind)}</svg>`;
  const me = () => state.room?.game?.players[state.room.you];
  const seatConnected = (id) => {
    const seat = state.room?.seats[id];
    return Boolean(seat && (seat.bot || (seat.connected && (id !== state.room.you || state.socket?.readyState === WebSocket.OPEN))));
  };
  const seatNumber = (position) => `<b class="seat-number" title="${position + 1} 号位 / Seat ${position + 1}">${position + 1}</b>`;
  const numberedAvatar = (player, id, className) => `<span class="numbered-avatar">${window.BoardGameUI.avatar({ ...player, vacant: state.room.seats[id]?.vacant, socialId: state.room.seats[id]?.socialId }, seatConnected(id), className, id === state.room.you)}${seatNumber(player.position ?? id)}</span>`;
  const total = (a) => a.reduce((n, x) => n + x, 0);
  const mobileLayout = matchMedia("(max-width: 740px)");
  const playerOverview = document.querySelector(".player-overview");
  function placePlayerOverview() {
    const anchor = mobileLayout.matches ? $("supplyDetails") : $("scenarioWonders");
    if (playerOverview.nextElementSibling !== anchor) anchor.before(playerOverview);
  }
  placePlayerOverview(); mobileLayout.addEventListener("change", placePlayerOverview);
  const compactDetails = () => document.querySelectorAll(".table-detail").forEach((detail) => { detail.open = detail.id === "supplyDetails" || !mobileLayout.matches; });
  compactDetails(); mobileLayout.addEventListener("change", compactDetails);
  let lastChat = "";
  $("chatDetails").addEventListener("toggle", () => { if ($("chatDetails").open) $("chatUnread").hidden = true; });
  function notice(text) {
    $("notice").textContent = text; $("notice").hidden = !text;
    clearTimeout(state.noticeTimer);
    if (text) state.noticeTimer = setTimeout(() => { $("notice").hidden = true; }, 8000);
  }
  let battleRoomKey = "", battleId = null, battleMarkup = "";
  function resetBattleFeedback() {
    battleRoomKey = ""; battleId = null; battleMarkup = "";
    $("pirateBattle").hidden = true; $("pirateBattle").innerHTML = "";
  }
  function renderPirateBattle() {
    const room = state.room, el = $("pirateBattle"), key = room?.game ? `${room.code}:${room.you}` : "";
    const report = S.battleReport(room?.game, icon), fresh = Boolean(report && key === battleRoomKey && report.id !== battleId);
    el.hidden = !report;
    if (report && (report.html !== battleMarkup || report.id !== battleId)) {
      el.classList.toggle("battle-arrival", fresh);
      el.dataset.result = report.result;
      el.innerHTML = report.html;
      if (fresh || key !== battleRoomKey) el.open = true;
      if (fresh && report.actor === room.you) notice(report.notice);
    }
    battleRoomKey = key; battleId = report?.id ?? null; battleMarkup = report?.html || "";
  }
  function send(data) {
    if (state.room?.control?.paused && ["action", "start", "rematch"].includes(data.type)) { notice("空位待补齐，游戏暂停 / Waiting for replacement"); return false; }
    if (state.socket?.readyState !== WebSocket.OPEN) { notice("连接尚未恢复 / Waiting for connection"); return false; }
    state.socket.send(JSON.stringify(data)); return true;
  }
  function action(a) { if (state.pending || $("harborSetupDialog").open || $("scenarioInfoDialog").open || $("islandRoadDialog").open) return; if (send({ type: "action", action: a })) { state.pending = true; renderActions(); renderScenario(); } }
  function islandRoadKey() {
    const room = state.room, g = room?.game;
    return g ? JSON.stringify([room.code, room.you, room.seats[room.you]?.socialId, g.revision, g.current, g.phase, g.turn]) : "";
  }
  function validIslandRoadIntent(intent) {
    const l = state.room?.game?.legal;
    return Boolean(intent && intent.key === islandRoadKey() && !state.pending && !state.room?.control?.paused && state.socket?.readyState === WebSocket.OPEN
      && (intent.type === "removeIslandRoad" ? l?.scenario?.removeIslandRoads?.includes(intent.edge) : l?.roads?.includes(intent.edge) && l?.scenario?.warnIslandRoads?.includes(intent.edge)));
  }
  function syncIslandRoadDialog() {
    if (islandRoadIntent && !validIslandRoadIntent(islandRoadIntent)) { islandRoadIntent = null; $("islandRoadDialog").close(); }
  }
  function confirmIslandRoad(type, edge) {
    const intent = { type, edge, key: islandRoadKey() };
    if (!validIslandRoadIntent(intent)) return;
    islandRoadIntent = intent;
    const remove = type === "removeIslandRoad";
    $("islandRoadTitle").innerHTML = remove ? "撤回这条外岛道路？<small>Remove this island road?</small>" : "这里需要船只通往要塞<small>Ships are needed to reach the fortress</small>";
    $("islandRoadDescription").innerHTML = remove
      ? "道路棋子回到库存，但不退任何资源、发展卡或免费建造次数。<small>The road piece returns to your supply. No resources, development cards or free builds are refunded.</small>"
      : "只有船只通往要塞才能进攻，在此建造道路没有任何收益。<small>Only a continuous line of ships reaching your fortress allows an attack. Building a road here gives no benefit.</small>";
    $("confirmIslandRoad").textContent = remove ? "撤回道路 / Remove road" : "仍然建路 / Build anyway";
    if (!$("islandRoadDialog").open) $("islandRoadDialog").showModal();
  }
  $("islandRoadDialog").addEventListener("close", () => { if (!$("islandRoadDialog").open) islandRoadIntent = null; });
  $("confirmIslandRoad").onclick = () => {
    const intent = islandRoadIntent;
    if (!validIslandRoadIntent(intent)) { islandRoadIntent = null; $("islandRoadDialog").close(); return; }
    islandRoadIntent = null; $("islandRoadDialog").close();
    action({ type: intent.type, edge: intent.edge });
  };
  function requestBuild(a) {
    if (a.type === "road" && state.room?.game?.legal.scenario?.warnIslandRoads?.includes(a.edge)) confirmIslandRoad(a.type, a.edge);
    else action(a);
  }
  function clearCardChanges() {
    clearTimeout(state.cardChangeTimer); state.cardChangeTimer = null; state.cardChanges.clear();
  }
  function scheduleCardChanges() {
    clearTimeout(state.cardChangeTimer); state.cardChangeTimer = null;
    if (!state.cardChanges.size) return;
    const expires = Math.min(...[...state.cardChanges.values()].map((change) => change.expires));
    state.cardChangeTimer = setTimeout(() => {
      const now = Date.now();
      for (const [key, change] of state.cardChanges) if (change.expires <= now) state.cardChanges.delete(key);
      renderCardChanges(); scheduleCardChanges();
    }, Math.max(0, expires - Date.now()));
  }
  function trackCardChanges(next) {
    const previous = state.room, before = previous?.game, after = next.game;
    const comparable = state.cardBaseline && before && after && previous.code === next.code && previous.you === next.you
      && after.revision >= before.revision && before.players.length === after.players.length;
    state.cardBaseline = Boolean(after);
    if (!comparable) { clearCardChanges(); return; }
    const now = Date.now();
    // Only compare public totals, never an opponent's hidden card types.
    for (const player of after.players) {
      const old = before.players.find((p) => p.id === player.id);
      if (!old) continue;
      for (const [kind, field] of [["resource", "resourceCount"], ["development", "developmentCount"]]) {
        if (!Number.isInteger(player[field]) || !Number.isInteger(old[field])) continue;
        const delta = player[field] - old[field];
        if (delta) state.cardChanges.set(`${player.id}:${kind}`, { delta, expires: now + CARD_CHANGE_DURATION });
      }
    }
    scheduleCardChanges();
  }
  function renderCardChanges() {
    const now = Date.now();
    $("players").querySelectorAll("[data-card-change]").forEach((el) => {
      const change = state.cardChanges.get(el.dataset.cardChange), delta = change && change.expires > now ? change.delta : 0;
      el.textContent = delta ? `${delta > 0 ? "+" : ""}${delta}` : "";
      el.classList.toggle("gain", delta > 0); el.classList.toggle("loss", delta < 0);
      el.title = delta ? `${delta > 0 ? "增加" : "减少"} ${Math.abs(delta)} 张 / ${delta > 0 ? "Gained" : "Lost"} ${Math.abs(delta)} cards` : "";
    });
  }
  function clearChatBubbles() {
    clearTimeout(chatBubbleTimer); chatBubbleTimer = null;
    chatBubbles.clear(); chatRoomKey = ""; seenChat.clear(); renderChatBubbles();
  }
  function renderChatBubbles() {
    const now = Date.now();
    $("players").querySelectorAll("[data-chat-bubble]").forEach((el) => {
      const bubble = chatBubbles.get(Number(el.dataset.chatBubble));
      el.hidden = !bubble || bubble.expires <= now;
      el.closest("tr").classList.toggle("speaking", !el.hidden);
      const text = el.hidden ? "" : bubble.text;
      if (el.firstElementChild.textContent !== text) el.firstElementChild.textContent = text;
      el.title = text;
    });
  }
  function scheduleChatBubbles() {
    clearTimeout(chatBubbleTimer); chatBubbleTimer = null;
    if (!chatBubbles.size) return;
    const expires = Math.min(...[...chatBubbles.values()].map((b) => b.expires));
    chatBubbleTimer = setTimeout(() => {
      for (const [id, bubble] of chatBubbles) if (bubble.expires <= Date.now()) chatBubbles.delete(id);
      renderChatBubbles(); scheduleChatBubbles();
    }, Math.max(0, expires - Date.now()));
  }
  function trackChatBubbles(next) {
    const roomKey = `${next.code}:${next.you}`, chat = next.chat || [];
    const keys = chat.map((m) => m.id || JSON.stringify([m.time, m.name, m.text]));
    if (chatRoomKey !== roomKey || !next.game) {
      clearChatBubbles(); chatRoomKey = roomKey; seenChat = new Set(keys); return;
    }
    let changed = false;
    chat.forEach((message, i) => {
      if (seenChat.has(keys[i]) || typeof message.text !== "string" || !message.text.trim()) return;
      const matching = next.game.players.filter((p) => p.name === message.name);
      // Older servers have no player IDs; only use a name when it is unambiguous.
      const id = Number.isInteger(message.playerId) ? message.playerId : matching.length === 1 ? matching[0].id : -1;
      if (!next.game.players.some((p) => p.id === id)) return;
      const text = message.text.slice(0, 160), duration = Math.max(5000, Math.min(10000, text.length * 80));
      chatBubbles.set(id, { text, expires: Date.now() + duration }); changed = true;
    });
    seenChat = new Set(keys);
    if (changed) scheduleChatBubbles();
  }
  function connect() {
    clearTimeout(state.reconnect);
    const protocol = location.protocol === "https:" ? "wss:" : "ws:", host = location.protocol === "file:" ? "127.0.0.1:8002" : location.host;
    const ws = new WebSocket(`${protocol}//${host}/catan-ws`); state.socket = ws;
    $("connection").textContent = "连接中 / Connecting";
    ws.addEventListener("open", () => { $("connection").textContent = "已连接 / Connected"; $("connection").classList.remove("offline"); send({ type: "hello", token: sessionStorage.getItem("catan-token") || "", avatar: window.BoardGameUI.getAvatar() }); });
    ws.addEventListener("message", (event) => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (data.type === "welcome") { sessionStorage.setItem("catan-token", data.token); soundEvents.reset(); resetBattleFeedback(); state.cardBaseline = false; clearCardChanges(); renderCardChanges(); clearChatBubbles(); }
      if (data.type === "reaction") { social.receive(data); return; }
      if (data.type === "state") { soundEvents.update(data); trackCardChanges(data); trackChatBubbles(data); state.room = data; social.sync(); state.pending = false; render(); }
      if (data.type === "error") { state.pending = false; notice(data.message); renderActions(); renderScenario(); }
      if (data.type === "left") { audio.stop(); soundEvents.reset(); viewedTradeKey = ""; clearCardChanges(); clearChatBubbles(); resetBoardView(); state.cardBaseline = false; state.room = null; state.phaseKey = ""; state.pending = false; state.mode = ""; state.selected = null; state.moveFrom = null; document.querySelectorAll("dialog[open]").forEach((d) => d.close()); render(); if (data.reason) notice(data.reason); }
    });
    ws.addEventListener("close", (event) => {
      audio.stop(); soundEvents.reset(); $("incomingTradeAlert").hidden = true;
      $("connection").textContent = "正在重连 / Reconnecting"; $("connection").classList.add("offline");
      if (state.room) render();
      if (event.code !== 4001) state.reconnect = setTimeout(connect, 1800);
      else notice("此座位已在另一个连接打开 / Seat opened in another connection");
    });
    ws.addEventListener("error", () => ws.close());
  }
  function playerName() { const name = $("name").value.trim(); if (!name) { notice("请输入你的名字 / Enter your name"); $("name").focus(); return ""; } localStorage.setItem("boardclub-name", name); return name; }
  $("name").value = localStorage.getItem("boardclub-name") || localStorage.getItem("holdem-online-name") || "";
  window.BoardGameUI.mountAvatarPicker($("catanAvatarPicker"), $("name"));
  window.addEventListener("board-avatar-change", ({ detail }) => {
    if (state.room && state.socket?.readyState === WebSocket.OPEN) send({ type: "profile", avatar: detail.avatar });
  });
  $("code").value = new URLSearchParams(location.search).get("room") || "";
  $("seatChoice").addEventListener("click", (e) => { const button = e.target.closest("[data-seats]"); if (!button) return; state.seats = Number(button.dataset.seats); $("seatChoice").querySelectorAll("button").forEach((b) => { b.classList.toggle("selected", b === button); b.setAttribute("aria-pressed", String(b === button)); }); chooseMap(state.mapId); });
  $("create").onclick = () => { const name = playerName(); if (name) send({ type: "create", name, avatar: window.BoardGameUI.getAvatar(), seats: state.seats, mapId: state.mapId, layout: state.layout, skins: state.skins, thieves: state.thieves }); };
  $("join").onclick = () => { const name = playerName(); if (name) send({ type: "join", name, avatar: window.BoardGameUI.getAvatar(), code: $("code").value }); };
  $("code").addEventListener("keydown", (e) => { if (e.key === "Enter") $("join").click(); });
  for (const id of ["addBot", "fillBots", "start", "rematch"]) $(id).onclick = () => send({ type: id });
  $("removeBot").onclick = () => {
    const c = state.room?.control, target = c?.seats.findLast(s => s?.bot);
    if (!target) return;
    window.BoardGameUI.confirmRemoval({ name: target.name, started: false,
      valid: () => { const now = state.room?.control; return now?.code === c.code && !now.started && now.host === now.you && now.seats.findLast(s => s?.bot)?.id === target.id; },
      remove: () => send({ type: "removeBot", target: target.id }) });
  };
  $("lobbySeats").addEventListener("click", (e) => {
    const button = e.target.closest("[data-seat-position]");
    if (button && !button.disabled) send({ type: "chooseSeat", position: Number(button.dataset.seatPosition) });
  });
  $("seatSwap").addEventListener("click", (e) => {
    const button = e.target.closest("[data-seat-response]");
    if (!button || !state.room?.seatSwap) return;
    const value = button.dataset.seatResponse, id = state.room.seatSwap.id;
    send(value === "cancel" ? { type: "cancelSeatSwap", id } : { type: "respondSeatSwap", id, accept: value === "accept" });
  });
  document.querySelectorAll("[data-leave]").forEach((b) => { b.onclick = () => $("leaveDialog").showModal(); });
  document.querySelectorAll("[data-close]").forEach((b) => { b.onclick = () => $(b.dataset.close).close(); });
  $("confirmLeave").onclick = () => { send({ type: "leave" }); $("leaveDialog").close(); };
  $("helpButton").onclick = () => Maps.get(state.room?.mapId || state.mapId) ? showSailingRules(state.room?.mapId || state.mapId, true) : showBaseRules();
  $("autoButton").onclick = () => send({ type: "auto", enabled: !state.room.seats[state.room.you].auto });
  $("copyCode").onclick = async () => {
    const url = new URL("catan.html", location.href); url.searchParams.set("room", state.room.code);
    const text = `卡坦岛 / CATAN · ${state.room.code}\n${url.href}`;
    try { await navigator.clipboard.writeText(text); notice("邀请已复制 / Invitation copied"); } catch { notice(text); }
  };
  function render() {
    const room = state.room, g = room?.game;
    music.setEdition(room?.mapId || state.mapId);
    syncIslandRoadDialog();
    $("setup").hidden = Boolean(room); $("lobby").hidden = !room || Boolean(g); $("game").hidden = !g;
    renderHarborSetup();
    renderPirateBattle();
    management.sync();
    if (!room) { supplyRoomKey = ""; $("incomingTradeAlert").hidden = true; $("goldChoiceAlert").hidden = true; alertTradeKey = ""; return; }
    const map = Maps.get(room.mapId);
    if (g && supplyRoomKey !== room.code) { $("supplyDetails").open = true; supplyRoomKey = room.code; }
    $("lobbyMapName").textContent = map ? `${map.name} / ${map.english} · ${S.target(map)[0]} / ${S.target(map)[1]} · ${layoutName(room.layout)}` : "基础版 / Base Game · 10 VP";
    $("lobbyMapRules").hidden = false; $("gameMapRules").hidden = !map; $("gameSailingRules").hidden = !map;
    $("lobbyMapRules").textContent = map ? "本图规则 / Map Rules" : "基础规则 / Base Rules";
    if (!g) {
      $("incomingTradeAlert").hidden = true; $("goldChoiceAlert").hidden = true; viewedTradeKey = ""; alertTradeKey = "";
      $("copyCode").textContent = room.code; $("lobbyCount").textContent = `${room.seats.length} / ${room.maxPlayers} 玩家 / Players`;
      $("lobbySeats").innerHTML = Array.from({ length: room.maxPlayers }, (_, id) => {
        const index = room.seats.findIndex((p, i) => (p.position ?? i) === id), p = room.seats[index], own = index === room.you;
        const label = own ? "我的座位 / My seat" : !p ? "坐这里 / Sit here" : p.bot ? "换座 / Swap seats" : "申请换座 / Request swap";
        const disabled = own || room.seatSwap || (p && !seatConnected(index));
        return `<div class="lobby-seat ${p ? "" : "empty"} ${own ? "own-seat" : ""}" data-position="${id}" style="--player:${B.COLORS[id]}"><span class="seat-label">${id + 1} 号位 / Seat ${id + 1}</span>${p ? `${numberedAvatar(p, index, "avatar")}<strong>${B.escape(p.name)}</strong><small>${p.bot ? "机器人 / Bot" : index === room.host ? "房主 / Host" : "玩家 / Player"}${!seatConnected(index) ? " · 离线 / Offline" : ""}</small>` : `<span class="avatar" style="--player:#ffffff15">+</span><strong>空位 / Open seat</strong><small>等待玩家 / Waiting</small>`}${room.seatSelection ? `<button class="quiet seat-choice" data-seat-position="${id}" ${disabled ? "disabled" : ""}>${label}</button>` : ""}</div>`;
      }).join("");
      const swap = room.seatSwap, from = swap && room.seats[swap.from], to = swap && room.seats[swap.to];
      $("seatSwap").hidden = !from || !to;
      $("seatSwap").innerHTML = from && to ? `<p><strong>${B.escape(from.name)} ⇄ ${B.escape(to.name)}</strong><span>${from.position + 1} 号位 ⇄ ${to.position + 1} 号位 / Seat ${from.position + 1} ⇄ ${to.position + 1}</span><small>等待 ${B.escape(to.name)} 同意 / Waiting for ${B.escape(to.name)}</small></p><div>${room.you === swap.to ? '<button class="secondary" data-seat-response="decline">拒绝 / Decline</button><button class="primary" data-seat-response="accept">同意 / Accept</button>' : room.you === swap.from ? '<button class="secondary" data-seat-response="cancel">取消 / Cancel</button>' : ""}</div>` : "";
      const host = room.you === room.host;
      ["addBot", "fillBots"].forEach((id) => { $(id).disabled = !host || room.seats.length >= room.maxPlayers; });
      $("removeBot").disabled = !host || !room.seats.some((p) => p.bot); $("start").disabled = !host || Boolean(swap) || room.seats.length < (room.seatSelection ? room.maxPlayers : 3);
      return;
    }
    // Different rooms and seats can start with identical phase/turn values.
    const key = `${room.code}:${room.you}:${g.phase}:${g.current}:${g.turn}:${g.scenario?.pending?.actor ?? ""}:${g.scenario?.pending?.kind || ""}`;
    $("game").dataset.phase = g.phase;
    $("game").dataset.seafarers = String(Boolean(g.board.islands));
    if (state.phaseKey !== key) {
      $("buildNotice").hidden = true; $("buildNotice").dataset.type = "";
      state.phaseKey = key; state.selected = null; state.moveFrom = null; state.harbor = null; state.victim = null;
      state.mode = g.current === room.you ? ({ setupSettlement: "settlement", setupRoad: "road", freeRoads: "road", robber: "robber", steal: "steal" }[g.phase] || "") : "";
    }
    if (["setupRoad", "freeRoads"].includes(g.phase) && state.mode === "road" && !g.legal.roads.length && g.legal.ships?.length) state.mode = "ship";
    if (g.phase === "robber" && state.mode === "robber" && !g.legal.robber?.length && g.legal.pirate?.length) state.mode = "pirate";
    const harbors = g.legal.scenario?.placeHarbors || [];
    if (state.harbor !== null && !harbors.some(h => h.harbor === state.harbor)) { state.harbor = null; if (state.mode === "placeHarbor") state.mode = ""; }
    if (g.phase === "scenarioChoice" && g.scenario?.pending?.kind === "placeHarbor" && harbors.length && state.harbor === null) { state.harbor = harbors[0].harbor; state.mode = "placeHarbor"; }
    $("roomLabel").textContent = `房间 / Room ${room.code}`;
    $("turnLabel").textContent = `回合 / Turn ${g.turn || "—"}`;
    const specialTarget = ["wonders", "pirates", "cloth"].includes(map?.family);
    $("victoryTarget").classList.toggle("scenario-target", specialTarget);
    $("victoryTarget").parentElement.classList.toggle("has-scenario-target", specialTarget);
    $("victoryTarget").title = S.target(map, g).join(" / ");
    $("victoryTargetLabel").textContent = specialTarget ? "胜利条件 / Win Conditions" : "胜利目标 / Target";
    $("victoryTargetValue").textContent = g.target || map?.target || 10;
    $("victoryTargetScore").hidden = specialTarget;
    $("scenarioVictoryConditions").hidden = !specialTarget;
    $("scenarioVictoryConditions").innerHTML = map?.family === "wonders"
      ? '<p class="victory-timing">自己的回合，满足以下任意一项<small>On your turn, meet either condition</small></p><p><strong>奇观建满全部 4 个阶段</strong><small>Complete all 4 stages of your wonder</small></p><p class="victory-alternative"><span>或 / OR</span><span><strong>至少 10 分，且奇观阶段数超过所有对手</strong><small>At least 10 VP, with more completed wonder stages than every opponent</small></span></p>'
      : map?.family === "pirates" ? `<p class="victory-timing">自己的回合，必须同时满足<small>On your turn, meet both conditions</small></p><p><strong>至少 ${g.target || map.target} 分，并收复自己的海盗要塞</strong><small>At least ${g.target || map.target} VP and your own pirate fortress liberated</small></p>`
      : map?.family === "cloth" ? `<p><strong>自己的回合达 ${g.target || map.target} 分</strong><small>Reach ${g.target || map.target} VP on your turn</small></p><p><strong>或有布村落仅剩 3 个：分高者胜，同分比布匹</strong><small>Or only 3 villages have cloth: most VP wins; ties go to most cloth</small></p>` : "";
    $("autoButton").textContent = room.seats[room.you].auto ? "托管中 / Auto On" : "托管 / Auto";
    $("autoButton").classList.toggle("selected", room.seats[room.you].auto);
    $("victory").hidden = g.winner < 0;
    if (g.winner >= 0) { const winners = (g.winners?.length ? g.winners : [g.winner]).map(id => g.players[id]); const names = winners.map(p => B.escape(p.name)).join(" &amp; "); $("winnerText").innerHTML = `${names} ${winners.length > 1 ? "共同获胜" : "获胜"}！<small>${names} ${winners.length > 1 ? "win together" : "wins"}</small>`; $("rematch").disabled = room.you !== room.host; }
    renderBoard(); renderPrompt(); renderPlayers(); renderHand(); renderActions(); renderSpecial(); renderScenario(); renderOffer(); renderGoldAlert(); renderBank();
    const chatKey = JSON.stringify([room.code, room.chat]);
    if (lastChat && lastChat !== chatKey && room.chat.length && !$("chatDetails").open) $("chatUnread").hidden = false;
    lastChat = chatKey;
    $("chatMessages").innerHTML = room.chat.map((m) => `<p><b>${B.escape(m.name)}</b> ${B.escape(m.text)}</p>`).join("");
    $("gameLog").innerHTML = [...g.log].reverse().map((m) => `<p>${B.escape(m.text)}</p>`).join("");
    if (room.control?.paused) { $("tradeDialog").close(); $("resourceDialog").close(); }
    if (!g.legal.trade) $("tradeDialog").close();
    else if ($("tradeDialog").open) updateTrade();
    const scenarioResource = ["piratePayment", "pirateReward"].includes(state.resourceMode);
    if ($("resourceDialog").open && scenarioResource) {
      if (!S.choice(g, room.you, state.resourceMode)) $("resourceDialog").close();
      else renderResourceChoices();
    }
    if ($("resourceDialog").open && !scenarioResource && state.resourceMode !== "discard" && g.phase !== state.resourceMode) $("resourceDialog").close();
    if ($("resourceDialog").open && ["gold", "plenty", "monopoly"].includes(state.resourceMode)) {
      if (state.resourceMode === "gold" ? !g.legal.gold : room.you !== g.current) $("resourceDialog").close();
      else renderResourceChoices();
    }
    if ($("resourceDialog").open && state.resourceMode === "discard") {
      if (!g.legal.discard) $("resourceDialog").close();
      else renderDiscard();
    }
  }
  function acknowledgeHarborSetup() {
    harborSetupAcknowledged = true;
    $("harborSetupDialog").close();
    $("boardViewport").focus({ preventScroll: true });
  }
  $("acknowledgeHarborSetup").onclick = acknowledgeHarborSetup;
  $("harborSetupDialog").addEventListener("cancel", event => { event.preventDefault(); acknowledgeHarborSetup(); });
  function renderHarborSetup() {
    const room = state.room, g = room?.game, dialog = $("harborSetupDialog"), banner = $("harborSetupBanner");
    const key = g?.scenario?.kind === "new-world" ? `${room.code}:${room.you}:${room.seats[room.you]?.socialId || ""}` : "";
    if (harborSetupKey !== key || !key || g.scenario.harborDraft) {
      harborSetupKey = key; harborSetupAcknowledged = false;
      if (dialog.open) dialog.close();
      banner.hidden = true;
      if (!key || g.scenario.harborDraft) return;
    }
    const initial = ["setupSettlement", "setupRoad"].includes(g.phase);
    banner.hidden = !initial;
    if (!initial) { if (dialog.open) dialog.close(); return; }
    const settlement = g.phase === "setupSettlement", actor = g.players[g.current].name;
    $("harborSetupPhase").textContent = settlement ? "初始建设：放置村庄 / Place settlements" : "初始建设：放置道路或船 / Place roads or ships";
    $("harborSetupTitle").innerHTML = settlement ? "现在开始建村庄<small>Now place initial settlements</small>" : "已进入初始建设阶段<small>Initial placement has begun</small>";
    $("harborSetupActor").textContent = settlement ? `轮到 ${actor} 放置村庄 / ${actor}: place a settlement` : `轮到 ${actor} 放置道路或船 / ${actor}: place a road or ship`;
    // A modal prevents rapid harbor clicks from becoming settlement placements.
    if (!harborSetupAcknowledged && !dialog.open) dialog.showModal();
  }
  function renderBoard() {
    const g = state.room?.game; if (!g) return;
    if (state.moveFrom !== null && !g.legal.moveShips?.includes(state.moveFrom)) state.moveFrom = null;
    $("boardViewport").style.aspectRatio = g.board.bounds ? `${g.board.bounds[2]} / ${g.board.bounds[3]}` : "620 / 570";
    const options = { legal: state.room.control?.paused ? {} : g.legal, mode: state.mode, selected: state.selected, dice: g.dice, moveFrom: state.moveFrom, thief: g.thief, scenario: g.scenario, harbor: state.harbor };
    const boardKey = JSON.stringify([state.room.code, state.room.you, g.board, options]);
    // Chat, presence and resource-only changes must not rebuild the SVG scene.
    if (state.boardRenderKey !== boardKey) {
      $("board").innerHTML = B.render(g.board, options); state.boardRenderKey = boardKey;
    }
    $("selection").hidden = !state.selected;
    const label = { road: "修建道路 / Build road", ship: "建造船只 / Build ship", settlement: "建造村庄 / Build settlement", city: "升级城市 / Upgrade city", robber: "移动强盗 / Move robber", pirate: "移动海盗 / Move pirate", placeHarbor: "放置港口 / Place harbor" }[state.mode];
    $("selectionLabel").textContent = state.selected ? `${label} · ${state.selected.id + 1}` : "";
  }
  function selectBoard(e) {
    const road = e.target.closest("[data-remove-road]");
    if (road) { confirmIslandRoad("removeIslandRoad", Number(road.dataset.removeRoad)); return; }
    const target = e.target.closest("[data-vertex],[data-edge],[data-tile],[data-victim]"); if (!target || state.pending || state.room?.control?.paused) return;
    if ("victim" in target.dataset) {
      if (state.mode === "steal") {
        const victim = Number(target.dataset.victim), choice = state.room.game.legal.scenario?.steal?.find(v => v.victim === victim);
        if (choice?.loot.length > 1) { state.victim = victim; renderScenario(); $("scenarioPanel").scrollIntoView({ block: "nearest", behavior: "instant" }); }
        else action({ type: "steal", victim, ...(choice ? { loot: choice.loot[0] } : {}) });
      }
      return;
    }
    const kind = "vertex" in target.dataset ? "vertex" : "edge" in target.dataset ? "edge" : "tile";
    if (state.mode === "placeHarbor") {
      const edge = Number(target.dataset.edge), legal = state.room.game.legal.scenario?.placeHarbors?.find(h => h.harbor === state.harbor);
      if (kind === "edge" && legal?.edges.includes(edge)) action({ type: "placeHarbor", harbor: state.harbor, edge });
      return;
    }
    if (state.mode === "moveShip" && kind === "edge") {
      const edge = Number(target.dataset.edge), l = state.room.game.legal;
      if (l.moveShips.includes(edge)) { state.moveFrom = edge; renderBoard(); renderPrompt(); }
      else if (state.moveFrom !== null && l.shipDestinations[state.moveFrom]?.includes(edge)) { action({ type: "moveShip", from: state.moveFrom, edge }); state.moveFrom = null; }
      return;
    }
    if (["road", "ship", "settlement", "city"].includes(state.mode)) {
      state.selected = null;
      requestBuild({ type: state.mode, [kind]: Number(target.dataset[kind]) });
      return;
    }
    state.selected = { kind, id: Number(target.dataset[kind]) }; renderBoard(); renderPrompt();
  }
  $("board").onclick = selectBoard;
  $("board").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectBoard(e); } };
  $("confirmBuild").onclick = () => { if (!state.selected) return; requestBuild({ type: state.mode, [state.selected.kind]: state.selected.id }); state.selected = null; renderBoard(); };
  $("cancelBuild").onclick = () => { state.selected = null; if (state.room.game.phase === "main") state.mode = ""; renderBoard(); renderActions(); renderPrompt(); };
  const viewport = $("boardViewport"), boardView = { scale: 1, x: 0, y: 0 };
  let boardGesture = null, boardClickBlockedUntil = 0;
  function drawBoardView() {
    boardView.scale = Math.max(1, Math.min(3, boardView.scale));
    boardView.x = Math.max(-viewport.clientWidth * (boardView.scale - 1), Math.min(0, boardView.x));
    boardView.y = Math.max(-viewport.clientHeight * (boardView.scale - 1), Math.min(0, boardView.y));
    $("board").style.transform = `translate(${boardView.x}px, ${boardView.y}px) scale(${boardView.scale})`;
    viewport.classList.toggle("zoomed", boardView.scale > 1);
  }
  function resetBoardView() {
    Object.assign(boardView, { scale: 1, x: 0, y: 0 }); boardGesture = null;
    viewport.classList.remove("dragging"); drawBoardView();
  }
  function boardPoint(point) {
    const rect = viewport.getBoundingClientRect();
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }
  function boardTouches(event) {
    return [...event.touches].filter((touch) => viewport.contains(touch.target)).map(boardPoint);
  }
  function touchGeometry(points) {
    const [a, b] = points;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  }
  function beginBoardTouch(points) {
    if (points.length >= 2) {
      const center = touchGeometry(points);
      boardGesture = { kind: "pinch", distance: center.distance, scale: boardView.scale,
        anchorX: (center.x - boardView.x) / boardView.scale, anchorY: (center.y - boardView.y) / boardView.scale };
      boardClickBlockedUntil = Infinity;
    } else if (points.length === 1) {
      boardGesture = { kind: "pan", start: points[0], x: boardView.x, y: boardView.y, moved: false };
    } else boardGesture = null;
  }
  viewport.addEventListener("touchstart", (event) => {
    const points = boardTouches(event);
    if (points.length === 1) boardClickBlockedUntil = 0;
    if (points.length >= 2) event.preventDefault();
    beginBoardTouch(points);
  }, { passive: false });
  viewport.addEventListener("touchmove", (event) => {
    const points = boardTouches(event);
    if (points.length >= 2) {
      event.preventDefault();
      if (boardGesture?.kind !== "pinch") beginBoardTouch(points);
      const center = touchGeometry(points), gesture = boardGesture;
      // Keep the same board location beneath the fingers as their midpoint moves.
      boardView.scale = Math.max(1, Math.min(3, gesture.scale * center.distance / gesture.distance));
      boardView.x = center.x - gesture.anchorX * boardView.scale;
      boardView.y = center.y - gesture.anchorY * boardView.scale;
      drawBoardView();
    } else if (points.length === 1 && boardGesture?.kind === "pan") {
      const dx = points[0].x - boardGesture.start.x, dy = points[0].y - boardGesture.start.y;
      if (Math.hypot(dx, dy) > 6) { boardGesture.moved = true; boardClickBlockedUntil = Infinity; }
      if (boardView.scale > 1 && boardGesture.moved) {
        event.preventDefault(); viewport.classList.add("dragging");
        boardView.x = boardGesture.x + dx; boardView.y = boardGesture.y + dy; drawBoardView();
      }
    }
  }, { passive: false });
  function endBoardTouch(event) {
    const points = boardTouches(event);
    if (boardClickBlockedUntil === Infinity && (!points.length || event.type === "touchcancel")) boardClickBlockedUntil = performance.now() + 450;
    viewport.classList.remove("dragging");
    if (event.type === "touchcancel") boardGesture = null;
    else beginBoardTouch(points);
  }
  viewport.addEventListener("touchend", endBoardTouch);
  viewport.addEventListener("touchcancel", endBoardTouch);
  viewport.addEventListener("click", (event) => {
    if (event.detail !== 0 && performance.now() < boardClickBlockedUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  viewport.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    boardClickBlockedUntil = 0;
    if (boardView.scale > 1) boardGesture = { kind: "mouse", id: event.pointerId, start: boardPoint(event), x: boardView.x, y: boardView.y, moved: false };
  });
  viewport.addEventListener("pointermove", (event) => {
    if (boardGesture?.kind !== "mouse" || boardGesture.id !== event.pointerId) return;
    if (!(event.buttons & 1)) { endBoardPointer(event); return; }
    const point = boardPoint(event), dx = point.x - boardGesture.start.x, dy = point.y - boardGesture.start.y;
    if (!boardGesture.moved && Math.hypot(dx, dy) <= 6) return;
    boardGesture.moved = true; boardClickBlockedUntil = Infinity;
    viewport.setPointerCapture(event.pointerId); viewport.classList.add("dragging");
    boardView.x = boardGesture.x + dx; boardView.y = boardGesture.y + dy; drawBoardView();
  });
  function endBoardPointer(event) {
    if (boardGesture?.kind !== "mouse" || boardGesture.id !== event.pointerId) return;
    if (boardGesture.moved) boardClickBlockedUntil = performance.now() + 450;
    boardGesture = null; viewport.classList.remove("dragging");
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  }
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(type, endBoardPointer);
  function zoomBoardAt(scale, point) {
    const next = Math.max(1, Math.min(3, scale)), ratio = next / boardView.scale;
    boardView.x = point.x - (point.x - boardView.x) * ratio;
    boardView.y = point.y - (point.y - boardView.y) * ratio;
    boardView.scale = next; drawBoardView();
  }
  viewport.addEventListener("wheel", (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    zoomBoardAt(boardView.scale * Math.exp(-event.deltaY * .01), boardPoint(event));
  }, { passive: false });
  viewport.addEventListener("keydown", (event) => {
    if (event.target !== viewport || !["+", "=", "-", "0", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "0") resetBoardView();
    else if (event.key.startsWith("Arrow")) {
      boardView.x += ({ ArrowLeft: 40, ArrowRight: -40 }[event.key] || 0);
      boardView.y += ({ ArrowUp: 40, ArrowDown: -40 }[event.key] || 0); drawBoardView();
    } else zoomBoardAt(boardView.scale + (event.key === "-" ? -.25 : .25), { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  });
  let boardWidth = 0, boardHeight = 0;
  new ResizeObserver(() => {
    const width = viewport.clientWidth, height = viewport.clientHeight;
    if (!width || !height) return;
    if (boardWidth && boardHeight) { boardView.x *= width / boardWidth; boardView.y *= height / boardHeight; }
    boardWidth = width; boardHeight = height; drawBoardView();
  }).observe(viewport);
  const phases = { setupSettlement: ["初始村庄", "Initial settlement"], setupRoad: ["初始道路", "Initial road"], roll: ["掷骰阶段", "Roll dice"], main: ["交易与建造", "Trade & build"], discard: ["弃掉资源", "Discard resources"], robber: ["移动强盗", "Move robber"], steal: ["选择偷取对象", "Choose a victim"], freeRoads: ["免费修路", "Free roads"], plenty: ["选择丰收资源", "Year of Plenty"], monopoly: ["选择垄断资源", "Monopoly"], over: ["游戏结束", "Game over"] };
  phases.gold = ["选择金矿资源", "Gold-field resources"];
  Object.assign(phases, S.phases);
  function diceMarkup(n) {
    const positions = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
    return `<span class="die" aria-label="${n || "未掷骰 / Not rolled"}">${(positions[n] || []).map((p) => `<i style="grid-area:${Math.ceil(p / 3)} / ${(p - 1) % 3 + 1}"></i>`).join("")}</span>`;
  }
  function renderPrompt() {
    const { game: g, you } = state.room, winner = g.phase === "over" ? g.players[g.winner] : null;
    const actor = g.phase === "scenarioChoice" ? g.scenario?.pending?.actor ?? g.scenario?.actor ?? g.current : g.phase === "gold" ? g.goldQueue[0]?.id ?? g.current : g.current;
    const current = winner || g.players[actor], phase = g.board.islands && g.phase === "setupRoad" ? ["初始道路或船", "Initial road or ship"] : g.board.islands && g.phase === "freeRoads" ? ["免费道路或船", "Free roads or ships"] : phases[g.phase] || ["等待操作", "Waiting for action"];
    $("phaseLabel").textContent = g.scenario?.harborDraft ? "初始海港 / Initial harbors" : `${phase[0]} / ${phase[1]}`;
    $("turnAvatar").innerHTML = window.BoardGameUI.avatar(state.room.seats[current.id], seatConnected(current.id), "turn-avatar", current.id === state.room.you) + seatNumber(current.id); $("turnAvatar").style.setProperty("--player", B.COLORS[current.id]);
    const own = current.id === you, waiting = g.phase === "discard" && !g.legal.discard;
    let zh = g.legal.discard ? `你需要弃掉 ${g.legal.discard} 张资源` : waiting ? "等待玩家弃掉资源" : `${own ? "轮到你" : current.name} · ${phase[0]}`;
    let en = g.legal.discard ? `Discard ${g.legal.discard} resource cards` : waiting ? "Waiting for discards" : `${own ? "Your turn" : current.name} · ${phase[1]}`;
    if (winner) { const names = (g.winners?.length ? g.winners : [g.winner]).map(id => g.players[id].name).join(" & "); zh = `${names} ${g.winners?.length > 1 ? "共同胜利" : "胜利"}`; en = `${names} ${g.winners?.length > 1 ? "win together" : "wins"}`; }
    if (own && g.phase === "robber") {
      const pirate = state.mode === "pirate";
      zh = state.selected ? `确认移动${pirate ? "海盗" : "强盗"}` : `${pirate ? "海盗" : "强盗"}：选择空心圆`;
      en = state.selected ? `Confirm the ${pirate ? "pirate" : "robber"}'s destination` : `${pirate ? "Pirate" : "Robber"}: choose a circle`;
    }
    if (own && g.phase === "steal") {
      zh = g.thief === "pirate" ? "偷取资源：点击发光的船" : "偷取资源：点击发光的房子";
      en = g.thief === "pirate" ? "Steal: choose a glowing ship" : "Steal: choose a glowing building";
      if (g.scenario?.kind === "pirates") { zh = "偷取资源：选择任意对手的发光船只或建筑"; en = "Steal from any opponent: choose their glowing ship or building"; }
    }
    if (state.mode && !g.phase.startsWith("setup") && g.phase === "main") { const mode = { road: ["选择道路", "Choose a road"], city: ["选择村庄升级", "Choose a settlement to upgrade"], settlement: ["选择村庄位置", "Choose a settlement site"] }[state.mode]; if (mode) { zh = mode[0]; en = mode[1]; } }
    if (state.mode === "ship" && own) { zh = "选择船只位置"; en = "Choose a ship site"; }
    if (state.mode === "moveShip" && own) { zh = state.moveFrom === null ? "选择发光的旧船" : "选择船的新位置"; en = state.moveFrom === null ? "Choose a highlighted old ship" : "Choose the ship's destination"; }
    if (g.legal.gold) { zh = `选择 ${g.legal.gold} 张金矿资源`; en = `Choose ${g.legal.gold} gold-field resources`; }
    if (own && state.mode === "placeHarbor") { zh = g.scenario?.harborDraft ? "初始海港：选择海岸边" : "选择海岸边放置港口"; en = g.scenario?.harborDraft ? "Initial harbor: choose a coastal edge" : "Choose a coastal edge for your harbor"; }
    if (S.choice(g, you, "piratePayment")) { zh = `海盗掠夺：交出 ${g.legal.scenario.piratePayment} 张资源`; en = `Pirate raid: lose ${g.legal.scenario.piratePayment} resources`; }
    if (S.choice(g, you, "pirateReward")) { zh = "击退海盗：领取一张资源"; en = "Pirate defense: claim one resource"; }
    if (own && g.phase === "steal" && g.scenario?.kind === "cloth") { zh = "选择玩家及资源或布匹"; en = "Choose a player, then resource or cloth"; }
    $("turnPrompt").innerHTML = `${B.escape(zh)}<small>${B.escape(en)}</small>`;
    $("dice").innerHTML = diceMarkup(g.dice[0]) + diceMarkup(g.dice[1]);
    const key = `${g.turn}:${g.dice.join()}`;
    if (state.diceKey !== key && g.dice.length) { $("dice").classList.remove("rolling"); requestAnimationFrame(() => $("dice").classList.add("rolling")); }
    state.diceKey = key;
  }
  function renderPlayers() {
    const { game: g, seats, you } = state.room;
    const seafarers = Boolean(g.board.islands);
    const pirates = g.scenario?.kind === "pirates";
    const routeUnavailable = Maps.get(g.mapId || state.room.mapId)?.scenario?.longestRoute === false;
    $("players").closest("table").querySelector("thead th:nth-last-child(3)").innerHTML = pirates ? "战舰<small>Warships</small>" : "骑士<small>Knights</small>";
    const longestLabel = seafarers ? "最长商路 / Longest Route" : "最长道路 / Longest Road";
    $("players").closest("table").classList.toggle("seafarers-summary", seafarers);
    $("islandPointsHeading").hidden = !seafarers;
    $("routeCountHeading").innerHTML = seafarers ? "已建<br>商路<small>Built</small>" : "已建<br>道路<small>Built</small>";
    $("routeCountHeading").title = seafarers ? "已建道路与船只总数 / Total built roads and ships" : "已建道路总数 / Total built roads";
    $("longestRouteHeading").innerHTML = `${seafarers ? "最长<br>商路" : "最长<br>道路"}<small>Longest</small>`;
    $("longestRouteHeading").title = longestLabel;
    $("players").innerHTML = g.players.map((p) => {
      const connected = seatConnected(p.id);
      const status = seats[p.id].bot ? "机器人 / Bot" : !connected ? "离线 / Offline" : "在线 / Online";
      const length = g.roadLengths[p.id];
      const routeTitle = `${longestLabel}: ${routeUnavailable ? "不可用 / Not available" : `${length}${g.longest === p.id ? " · 最长奖 +2 分 / Award +2 VP" : ""}`}`;
      return `<tr data-player-id="${p.id}" class="summary-player ${p.id === g.current && g.phase !== "over" ? "current" : ""}" style="--player:${B.COLORS[p.id]}"><th scope="row"><div class="summary-identity">${numberedAvatar({ name: p.name, avatar: seats[p.id]?.avatar }, p.id, "player-portrait")}<div class="summary-person"><strong title="${B.escape(p.name)} · ${status}">${B.escape(p.name)}</strong><span class="summary-meta"><i class="player-color"></i><b>${p.score}</b> VP</span>${p.id === you || p.id === state.room.host ? `<small>${p.id === state.room.host ? "房主 / Host" : "你 / You"}</small>` : ""}</div></div><span class="player-speech" data-chat-bubble="${p.id}" aria-label="${B.escape(p.name)} 说 / says" hidden><span class="player-speech-text"></span></span></th>
        ${seafarers ? `<td class="island-points" title="登岛奖励，已包含在总分中 / Island bonus, included in total VP" aria-label="登岛奖励 / Island bonus: ${p.islandPoints} VP"><b>${p.islandPoints}</b><small>VP</small></td>` : ""}
        <td class="resource-count" aria-label="资源卡 / Resource cards: ${p.resourceCount}">${cardCounter(p.id, "resource", "resource-back", p.resourceCount)}</td><td class="development-count" aria-label="发展卡 / Development cards: ${p.developmentCount}">${cardCounter(p.id, "development", "development", p.developmentCount)}</td><td class="knight-count" aria-label="已用骑士 / Played knights: ${p.knights}"><span>${icon("robber")}<b>${p.knights}</b></span></td><td class="road-count" aria-label="已建道路 / Built roads: ${p.roads}"><span>${icon("road")}<b>${p.roads}</b></span></td>
        <td class="longest-count${routeUnavailable ? " route-unavailable" : g.longest === p.id ? " route-holder" : ""}" title="${routeTitle}" aria-label="${routeTitle}">${routeUnavailable ? "<b>不可用</b><small>Not available</small>" : `<b>${length}</b>${g.longest === p.id ? "<small>+2 VP</small>" : ""}`}</td></tr>`;
    }).join("");
    $("players").querySelectorAll("tr").forEach((row, id) => row.classList.toggle("current", g.phase !== "over" && id === (g.phase === "gold" ? g.goldQueue[0]?.id : g.current)));
    if (g.phase === "scenarioChoice") $("players").querySelectorAll("tr").forEach((row, id) => row.classList.toggle("current", id === (g.scenario.pending?.actor ?? g.scenario.actor)));
    if (pirates) $("players").querySelectorAll(".knight-count").forEach((cell, id) => { cell.innerHTML = `<span>${S.art("warship")}<b>${g.players[id].warships || 0}</b></span>`; cell.setAttribute("aria-label", `战舰 / Warships: ${g.players[id].warships || 0}`); });
    if (["tribes", "cloth", "pirates", "wonders"].includes(g.scenario?.kind)) {
      $("islandPointsHeading").innerHTML = "剧本<br>奖励<small>Scenario VP</small>";
      $("islandPointsHeading").title = "剧本奖励分 / Scenario victory points";
      $("players").querySelectorAll(".island-points").forEach((cell, id) => { const p = g.players[id], points = (p.scenarioPoints || 0) + (g.scenario.kind === "cloth" ? Math.floor((p.cloth || 0) / 2) : 0); cell.innerHTML = `<b>${points}</b><small>VP</small>`; cell.title = `剧本奖励，已包含在总分中 / Scenario bonus, included in total VP: ${points}`; cell.setAttribute("aria-label", cell.title); });
    } else { $("islandPointsHeading").innerHTML = "登岛<br>奖励<small>Island VP</small>"; $("islandPointsHeading").title = "登岛奖励分 / Island bonus victory points"; }
    $("players").querySelectorAll(".road-count").forEach((cell, i) => {
      const p = g.players[i];
      cell.title = `村庄 / Settlements ${p.settlements}/5 · 城市 / Cities ${p.cities}/4 · 道路 / Roads ${p.roads}/15${g.board.islands ? ` · 船 / Ships ${p.ships}/15${p.reservedShips ? ` · 奇迹预留 / Wonder reserved ${p.reservedShips} · 库存 / Available ${p.availableShips}` : ""} · 登岛 / Island bonus ${p.islandPoints} VP` : ""}`;
      if (g.board.islands) { cell.innerHTML += `<span class="ship-count">${icon("ship")}<b>${p.ships}</b></span>`; cell.setAttribute("aria-label", cell.title); }
    });
    renderCardChanges(); renderChatBubbles();
  }
  function cardCounter(id, kind, image, count) {
    return `<span class="card-count"><span class="card-count-total">${icon(image)}<b>${count}</b></span><span class="card-change" data-card-change="${id}:${kind}" aria-live="polite" aria-atomic="true"></span></span>`;
  }
  function renderHand() {
    const p = me(), g = state.room.game;
    $("handTotal").textContent = `${total(p.resources)} 张 / Cards`;
    $("resources").innerHTML = p.resources.flatMap((n, r) => Array.from({ length: n }, () => `<div class="resource-card" data-resource="${r}" style="--resource:${colors[r]}" role="img" aria-label="${labels[r]} / ${english[r]}" title="${labels[r]} / ${english[r]}">${icon(B.RES[r])}<small>${labels[r]}<br>${english[r]}</small></div>`)).join("") || '<span class="hand-empty">暂无资源 / No resource cards</span>';
    $("development").classList.toggle("empty", !p.development.length);
    $("development").innerHTML = p.development.length ? p.development.map((card, index) => {
      const name = S.devName(card.type, g.scenario?.kind === "pirates") || devNames[card.type], warship = card.type === "knight" && g.scenario?.kind === "pirates";
      return `<button class="development-card" data-dev="${card.type}" data-dev-index="${index}" ${!state.pending && !state.room.control?.paused && g.legal.development.includes(card.type) && card.turn < g.turn ? "" : "disabled"} title="${name.join(" / ")}${card.type === "vp" ? " · 自动计分 / Scores automatically" : ""}">${warship ? S.art("warship") : icon(card.type === "knight" ? "robber" : `dev-${card.type}`)}<span>${name[0]}<small>${name[1]}</small></span></button>`;
    }).join("") : `<span class="development-empty">暂无发展卡 / No development cards</span>`;
  }
  $("development").onclick = (e) => { const button = e.target.closest("[data-dev]"); if (button && !button.disabled) action({ type: "playDevelopment", card: button.dataset.dev }); };
  function renderActions() {
    const g = state.room?.game; if (!g) return;
    const l = g.legal;
    const items = [
      ["road", "road", "修道路", "Road", l.roads.length && ["main", "freeRoads", "setupRoad"].includes(g.phase), "木 + 砖 / Wood + Brick"],
      ["settlement", "settlement", "建村庄", "Settlement", l.settlements.length, "木砖羊麦 / 4 resources"],
      ["city", "city", "升城市", "City", l.cities.length, "2 麦 + 3 矿 / Grain + Ore"],
      ["buyDevelopment", "development", "买发展卡", "Dev card", l.buy, "羊麦矿 / Wool Grain Ore"],
      ["trade", "trade", "交易", "Trade", l.trade, "银行 / 玩家 · Bank / Player"],
      ["help", "dice", "建造费用", "Build costs", true, g.board.islands ? "航海家 / Seafarers" : "基础版 / Base game"],
    ];
    if (g.board.islands) items.splice(1, 0,
      ["ship", "ship", "造船", "Ship", g.legal.ships?.length, "木 + 羊 / Lumber + Wool"],
      ["moveShip", "ship", "移船", "Move ship", g.legal.moveShips?.length, "每回合一次 / Once per turn"]);
    const shownReason = l.buildBlocked?.[$("buildNotice").dataset.type];
    if (!shownReason) $("buildNotice").hidden = true;
    $("actions").innerHTML = items.map(([type, image, zh, en, enabled, cost]) => {
      const reason = l.buildBlocked?.[type];
      return `<button data-action="${type}" title="${B.escape(reason || `${zh} / ${en} · ${cost}`)}" class="${reason ? "build-unavailable" : state.mode === type ? "selected" : ""}" ${(enabled || reason) && !state.pending && (type === "help" || !state.room.control?.paused) ? "" : "disabled"}>${icon(image)}<span>${zh}<small>${en}</small><small class="action-cost">${cost}</small></span></button>`;
    }).join("")
      + `<button class="turn-action" data-action="${l.roll ? "roll" : "end"}" ${!state.pending && !state.room.control?.paused && (l.roll || l.end) ? "" : "disabled"}><span>${l.roll ? "掷骰子" : "结束回合"}<small>${l.roll ? "Roll Dice" : "End Turn"}</small></span><span aria-hidden="true">→</span></button>`;
  }
  $("actions").onclick = (e) => {
    const button = e.target.closest("[data-action]"); if (!button || button.disabled) return;
    const type = button.dataset.action;
    const reason = state.room.game.legal.buildBlocked?.[type];
    $("buildNotice").hidden = !reason; $("buildNotice").dataset.type = reason ? type : "";
    if (reason) {
      $("buildNotice").textContent = reason;
      $("buildNotice").scrollIntoView({ behavior: "instant", block: "nearest" });
      return;
    }
    if (["road", "ship", "moveShip", "settlement", "city"].includes(type)) {
      state.mode = type; state.selected = null; state.moveFrom = null; renderBoard(); renderActions(); renderPrompt();
      const rect = $("boardViewport").getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight) $("boardViewport").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    else if (type === "help") showBaseRules();
    else if (type === "trade") {
      tradeDraft = { give: [0, 0, 0, 0, 0], want: [0, 0, 0, 0, 0] };
      $("tradeTarget").value = "all"; $("tradeError").textContent = "";
      updateTrade(); $("tradeDialog").showModal();
    }
    else action({ type });
  };
  function renderSpecial() {
    const g = state.room.game, own = g.current === state.room.you;
    let html = "";
    if (g.legal.discard) html = `<button class="primary" data-special="discard">弃掉 ${g.legal.discard} 张 / Discard ${g.legal.discard}</button>`;
    else if (g.legal.gold) html = `<button class="primary gold-choice-button" data-special="gold">${icon("gold")}<span>轮到你领取 ${g.legal.gold} 张金矿资源<small>Your turn: choose ${g.legal.gold} gold-field resources</small></span></button>`;
    else if (own && ["plenty", "monopoly"].includes(g.phase)) html = `<button class="primary" data-special="${g.phase}">${phases[g.phase].join(" / ")}</button>`;
    if (own && g.phase === "robber" && g.board.islands) html += `<div class="segments">${[["robber", "强盗 / Robber"], ["pirate", "海盗 / Pirate"]].filter(([mode]) => g.legal[mode]?.length).map(([mode, label]) => `<button data-thief="${mode}" class="${state.mode === mode ? "selected" : ""}">${icon(mode)}${label}</button>`).join("")}</div>`;
    for (const mode of ["piratePayment", "pirateReward"]) {
      const choice = S.choice(g, state.room.you, mode);
      if (choice) html += `<button class="primary scenario-resource-choice" data-special="${mode}" ${state.pending || state.room.control?.paused ? "disabled" : ""}>${S.art(mode === "piratePayment" ? "fortress" : "warship")}<span>${phases[mode][0]} · ${choice.required}<small>${phases[mode][1]} · ${choice.required}</small></span></button>`;
    }
    if (g.legal.cancelDevelopment) html += `<button class="secondary cancel-development" data-cancel-development ${state.pending ? "disabled" : ""}><span aria-hidden="true">↶</span> ${g.phase === "freeRoads" ? "撤回道路卡" : "撤回丰收卡"} / Cancel card</button>`;
    $("special").hidden = !html; $("special").innerHTML = html;
    $("cancelDevelopment").hidden = !g.legal.cancelDevelopment || g.phase !== "plenty" || state.resourceMode !== "plenty";
    $("cancelDevelopment").disabled = state.pending;
  }
  function renderScenario() {
    const g = state.room?.game;
    if (!g) { $("scenarioPanel").hidden = true; $("scenarioWonders").hidden = true; return; }
    const content = S.render(g, state.room.you, { icon, pending: state.pending, paused: state.room.control?.paused, connected: state.socket?.readyState === WebSocket.OPEN, harbor: state.harbor, victim: state.victim });
    for (const [id, html] of [["scenarioPanel", content.panel], ["scenarioWonders", content.wonders]]) {
      const el = $(id); el.hidden = !html;
      if (el.innerHTML !== html) el.innerHTML = html;
    }
  }
  function scenarioClick(event) {
    const button = event.target.closest("button");
    if (!button || button.disabled || state.pending || state.room?.control?.paused) return;
    const g = state.room.game, legal = g.legal.scenario || {};
    if (button.hasAttribute("data-harbor")) {
      const harbor = legal.placeHarbors?.find(h => String(h.harbor) === button.dataset.harbor);
      if (!harbor?.edges.length) return;
      state.harbor = harbor.harbor; state.mode = "placeHarbor"; state.selected = null;
      renderBoard(); renderPrompt(); renderScenario();
      $("boardViewport").scrollIntoView({ block: "center", behavior: "instant" });
    } else if (button.hasAttribute("data-loot")) {
      const victim = Number(button.dataset.lootVictim), loot = button.dataset.loot;
      if (legal.steal?.some(v => v.victim === victim && v.loot.includes(loot))) action({ type: "steal", victim, loot });
    } else if (button.hasAttribute("data-loot-back")) { state.victim = null; renderScenario(); }
    else {
      const type = button.dataset.scenarioAction, wonder = button.dataset.wonderId;
      if (type === "chooseWonder" && legal.chooseWonders?.includes(wonder)) action({ type, wonder });
      if (type === "buildWonder" && legal.buildWonder && me().wonder?.id === wonder) action({ type });
      if (type === "attackFortress" && legal.attackFortress) action({ type });
    }
  }
  $("scenarioPanel").onclick = scenarioClick;
  $("scenarioWonders").onclick = scenarioClick;
  function cancelDevelopment() {
    if (state.pending || !state.room.game.legal.cancelDevelopment) return;
    action({ type: "cancelDevelopment" });
    if (state.pending) { $("resourceDialog").close(); renderSpecial(); }
  }
  $("cancelDevelopment").onclick = cancelDevelopment;
  $("special").onclick = (e) => {
    const thief = e.target.closest("[data-thief]");
    if (thief) { state.mode = thief.dataset.thief; state.selected = null; renderBoard(); renderPrompt(); renderSpecial(); return; }
    if (e.target.closest("[data-cancel-development]")) { cancelDevelopment(); return; }
    const b = e.target.closest("[data-special]"); if (b && !b.disabled && !state.pending) resourceDialog(b.dataset.special);
  };
  function tradeCards(cards, side, editable = false) {
    return cards.flatMap((n, r) => Array.from({ length: n }, () => {
      const name = `${labels[r]} / ${english[r]}`, label = editable ? `移除 ${labels[r]} / Remove ${english[r]}` : name;
      const tag = editable ? "button" : "span";
      return `<${tag} class="trade-card" style="--resource:${colors[r]}" data-resource="${r}" ${editable ? `type="button" data-remove-trade="${side}"` : 'role="img"'} aria-label="${label}" title="${label}">${icon(B.RES[r])}</${tag}>`;
    })).join("") || '<span class="empty-trade-slot" role="img" aria-label="未选卡牌 / No cards selected"></span>';
  }
  function renderOffer() {
    const t = state.room.game.trade, incoming = window.CatanAudio.incoming(state.room);
    const connected = state.socket?.readyState === WebSocket.OPEN;
    const key = t ? `${state.room.code}:${state.room.you}:${state.room.game.turn}:${t.id}` : "";
    $("tradeOffer").hidden = !t; $("tradeOffer").classList.toggle("incoming-offer", incoming);
    $("incomingTradeAlert").hidden = !incoming || !connected || viewedTradeKey === key;
    if (incoming && alertTradeKey !== key) {
      alertTradeKey = key; $("incomingTradeName").textContent = state.room.game.players[t.from].name;
    }
    if (!t) alertTradeKey = "";
    if (!t) return;
    const own = t.from === state.room.you, recipient = t.to == null || t.to === state.room.you;
    const target = t.to == null ? "所有玩家 / All players" : B.escape(state.room.game.players[t.to].name);
    const responses = state.room.game.players.filter((p) => p.id !== t.from).map((p) => {
      const response = t.to != null && t.to !== p.id ? "excluded" : t.rejected.includes(p.id) ? "declined" : "pending";
      const label = { excluded: ["未参与", "Not invited"], declined: ["已拒绝", "Declined"], pending: ["等待回应", "Waiting"] }[response];
      return `<li data-trade-player="${p.id}" data-response="${response}"><span class="trade-person" style="--player:${B.COLORS[p.id]}"><i class="player-color" aria-hidden="true"></i><span title="${B.escape(p.name)}">${B.escape(p.name)}</span></span><span class="trade-response ${response}">${label[0]}<small>${label[1]}</small></span></li>`;
    }).join("");
    const blocked = state.pending || !connected || state.room.control?.paused;
    const buttons = own ? `<button class="secondary" data-offer="cancelTrade" ${blocked ? "disabled" : ""}>撤回 / Cancel</button>` : recipient ? `<button class="primary" data-offer="acceptTrade" ${blocked || t.rejected.includes(state.room.you) || t.want.some((n, r) => me().resources[r] < n) ? "disabled" : ""}>接受 / Accept</button><button class="secondary" data-offer="rejectTrade" ${blocked || t.rejected.includes(state.room.you) ? "disabled" : ""}>拒绝 / Decline</button>` : "";
    $("tradeOffer").innerHTML = `<h3>${B.escape(state.room.game.players[t.from].name)} 的交易 / Trade offer</h3><p class="offer-target">交易对象 / To: ${target}</p><div class="trade-card-summary"><section aria-label="提供 / Gives"><h3>提供 <small>Gives</small></h3><div class="trade-card-list">${tradeCards(t.give, "give")}</div></section><span class="trade-arrow" aria-hidden="true">→</span><section aria-label="需要 / Wants"><h3>需要 <small>Wants</small></h3><div class="trade-card-list">${tradeCards(t.want, "want")}</div></section></div><ul class="trade-responses" aria-label="交易回应 / Trade responses" aria-live="polite">${responses}</ul>${buttons ? `<div class="offer-buttons">${buttons}</div>` : ""}`;
  }
  $("tradeOffer").onclick = (e) => { const b = e.target.closest("[data-offer]"); if (b && !b.disabled) action({ type: b.dataset.offer, offerId: state.room.game.trade.id }); };
  $("viewIncomingTrade").onclick = () => {
    if (!window.CatanAudio.incoming(state.room)) return;
    viewedTradeKey = alertTradeKey; $("incomingTradeAlert").hidden = true;
    $("tradeOffer").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    $("tradeOffer").focus({ preventScroll: true });
  };
  function renderGoldAlert() {
    const required = window.CatanAudio.goldChoice(state.room), connected = state.socket?.readyState === WebSocket.OPEN;
    $("goldChoiceAlert").hidden = !required || !connected || $("resourceDialog").open;
    document.querySelector(".turn-banner").classList.toggle("needs-gold", required && connected);
    if (required) {
      const n = state.room.game.legal.gold;
      $("goldChoiceTitle").textContent = `请领取 ${n} 张金矿资源`;
      $("goldChoiceHint").textContent = `Your turn: choose ${n} resources`;
    }
  }
  $("chooseGold").onclick = () => { if (!state.pending && window.CatanAudio.goldChoice(state.room)) resourceDialog("gold"); };
  $("resourceDialog").addEventListener("close", renderGoldAlert);
  function renderBank() {
    const g = state.room.game;
    $("bank").innerHTML = g.bank.map((n, r) => `<span class="bank-item" title="${labels[r]} / ${english[r]}">${icon(B.RES[r])}${n}</span>`).join("");
    $("devSupply").textContent = `发展卡 / Dev ${g.deckCount}`;
    $("awards").innerHTML = `<span>${icon("road")}最长道路 / Longest Road: ${g.longest < 0 ? "—" : B.escape(g.players[g.longest].name) + " · " + g.roadLengths[g.longest]}</span><span>${icon("knight")}最大骑士团 / Largest Army: ${g.largest < 0 ? "—" : B.escape(g.players[g.largest].name) + " · " + g.players[g.largest].knights}</span>`;
    if (g.board.islands) {
      $("awards").firstElementChild.innerHTML = `${icon("ship")}最长商路 / Longest Trade Route: ${g.longest < 0 ? "—" : B.escape(g.players[g.longest].name) + " · " + g.roadLengths[g.longest]}`;
      $("awards").innerHTML += `<span>目标 / Target ${g.target} VP · 登岛奖励 / Island bonus ${me().islandPoints} VP</span>`;
    }
    if (g.scenario?.kind === "pirates") $("awards").innerHTML = `<span>${S.target(Maps.get(state.room.mapId), g).join(" / ")}</span>`;
    if (g.scenario?.kind === "wonders") $("awards").lastElementChild.innerHTML = S.target(Maps.get(state.room.mapId), g).join(" / ");
    if (g.scenario?.kind === "cloth") { $("awards").firstElementChild.remove(); $("awards").lastElementChild.innerHTML = `${S.art("cloth")}2 布匹 = 1 分 / 2 cloth = 1 VP · 目标 / Target ${g.target} VP`; }
  }
  $("chatForm").onsubmit = (e) => { e.preventDefault(); if (send({ type: "chat", text: $("chatInput").value })) $("chatInput").value = ""; };
  const valid = (a) => a.every((n) => Number.isInteger(n) && n >= 0 && n <= 95);
  for (const [id, side] of [["offerGive", "give"], ["offerWant", "want"]]) {
    $(id).innerHTML = labels.map((name, r) => `<button type="button" class="trade-resource-add" data-add-trade="${side}" data-resource="${r}" style="--resource:${colors[r]}">${icon(B.RES[r])}<span>${name}<small>${english[r]}</small></span><i aria-hidden="true">+</i></button>`).join("");
  }
  $("playerTradeFields").onclick = (e) => {
    const button = e.target.closest("[data-add-trade],[data-remove-trade]"); if (!button || button.disabled) return;
    const side = button.dataset.addTrade || button.dataset.removeTrade, r = Number(button.dataset.resource);
    const adding = Boolean(button.dataset.addTrade), other = side === "give" ? "want" : "give";
    if (adding && (tradeDraft[other][r] || tradeDraft[side][r] >= (side === "give" ? me().resources[r] : 19))) return;
    tradeDraft[side][r] = Math.max(0, tradeDraft[side][r] + (adding ? 1 : -1));
    $("tradeError").textContent = ""; renderTradeDraft();
    if (!adding) {
      const next = document.querySelector(`[data-remove-trade="${side}"][data-resource="${r}"]`) || document.querySelector(`[data-add-trade="${side}"][data-resource="${r}"]`);
      next?.focus({ preventScroll: true });
    }
  };
  function renderTradeDraft() {
    for (const [side, id] of [["give", "draftGive"], ["want", "draftWant"]]) {
      const other = side === "give" ? "want" : "give";
      $(id).innerHTML = tradeCards(tradeDraft[side], side, true);
      document.querySelectorAll(`[data-add-trade="${side}"]`).forEach((button) => {
        const r = Number(button.dataset.resource), limit = side === "give" ? me().resources[r] : 19;
        button.disabled = Boolean(tradeDraft[other][r]) || tradeDraft[side][r] >= limit;
        const reason = tradeDraft[other][r] ? "已在另一侧选择 / Selected on the other side" : tradeDraft[side][r] >= limit ? "没有更多可选卡牌 / No more cards available" : "添加一张 / Add one card";
        button.title = `${labels[r]} / ${english[r]} · ${reason}`;
        button.setAttribute("aria-label", `${side === "give" ? "付出 / Give" : "换取 / Receive"} ${labels[r]} / ${english[r]} · ${reason}`);
      });
    }
    if (state.tradeMode === "players") $("confirmTrade").disabled = state.pending || !total(tradeDraft.give) || !total(tradeDraft.want) || tradeDraft.give.some((n, r) => n > me().resources[r]);
  }
  const options = labels.map((name, r) => `<option value="${r}">${name} / ${english[r]}</option>`).join("");
  $("tradeGive").innerHTML = options; $("tradeGet").innerHTML = options; $("tradeGet").value = "1";
  document.querySelectorAll("[data-trade-mode]").forEach((button) => { button.onclick = () => { state.tradeMode = button.dataset.tradeMode; document.querySelectorAll("[data-trade-mode]").forEach((b) => b.classList.toggle("selected", b === button)); updateTrade(); }; });
  function updateTrade() {
    const bank = state.tradeMode === "bank"; $("bankTradeFields").hidden = !bank; $("playerTradeFields").hidden = bank; $("tradeRate").hidden = !bank;
    const selected = $("tradeTarget").value, players = state.room?.game.players || [];
    $("tradeTarget").innerHTML = '<option value="all">所有玩家 / All players</option>' + players.filter((p) => p.id !== state.room.you).map((p) => `<option value="${p.id}">${B.escape(p.name)}</option>`).join("");
    $("tradeTarget").value = players.some((p) => p.id !== state.room.you && String(p.id) === selected) ? selected : "all";
    const r = Number($("tradeGive").value), n = state.room?.game.rates[r] || 4;
    $("tradeRate").textContent = `${n} ${labels[r]} → 1 ${labels[Number($("tradeGet").value)]} · ${n}:1`;
    $("confirmTrade").textContent = bank ? "确认交易 / Trade" : "发出交易 / Offer Trade";
    $("confirmTrade").disabled = state.pending;
    renderTradeDraft();
  }
  $("tradeGive").onchange = updateTrade; $("tradeGet").onchange = updateTrade;
  $("confirmTrade").onclick = () => {
    if (state.pending || !state.room?.game?.legal.trade) return;
    const g = state.room.game, p = me(); let a;
    if (state.tradeMode === "bank") {
      const give = Number($("tradeGive").value), get = Number($("tradeGet").value);
      if (give === get || p.resources[give] < g.rates[give] || !g.bank[get]) { $("tradeError").textContent = "资源不足或选中了相同资源 / Unavailable or identical resources"; return; }
      a = { type: "bankTrade", give, get };
    } else {
      const give = [...tradeDraft.give], want = [...tradeDraft.want];
      if (!valid(give) || !valid(want) || !total(give) || !total(want) || give.some((n, r) => n > p.resources[r] || (n && want[r]))) { $("tradeError").textContent = "请设置双方交换的不同资源 / Choose different resources to exchange"; return; }
      const to = $("tradeTarget").value === "all" ? null : Number($("tradeTarget").value);
      if (to !== null && (!Number.isInteger(to) || !g.players[to] || to === state.room.you)) { $("tradeError").textContent = "请选择其他玩家 / Choose another player"; return; }
      if (to !== null && !state.room.targetedTrades) { $("tradeError").textContent = "服务器版本过旧，请使用新版游戏链接 / Open the updated game server"; return; }
      a = { type: "offerTrade", give, want, to };
    }
    action(a);
    if (state.pending) {
      tradeDraft = { give: [0, 0, 0, 0, 0], want: [0, 0, 0, 0, 0] };
      $("tradeDialog").close();
    }
  };
  function resourceDialog(mode) {
    const g = state.room.game; state.resourceMode = mode;
    if (["piratePayment", "pirateReward"].includes(mode) && !S.choice(g, state.room.you, mode)) return;
    const discard = mode === "discard";
    $("resourceTitle").innerHTML = `${phases[mode][0]}<small>${phases[mode][1]}</small>`; $("resourceError").textContent = "";
    $("resourceDialog").classList.toggle("is-discard", discard);
    $("resourceDialog").classList.toggle("is-pick", !discard);
    $("resourceChoices").hidden = discard; $("discardChoices").hidden = !discard;
    $("confirmResources").textContent = discard ? "确认弃牌 / Discard" : mode === "piratePayment" ? "交出资源 / Lose resources" : "确认 / Confirm";
    $("confirmResources").disabled = false;
    $("cancelDevelopment").hidden = mode !== "plenty" || !g.legal.cancelDevelopment;
    $("cancelDevelopment").disabled = state.pending;
    if (discard) {
      discardDraft = [0, 0, 0, 0, 0]; renderDiscard();
      for (const id of ["discardHand", "discardSelected"]) $(id).scrollTop = 0;
    } else {
      resourceDraft = [0, 0, 0, 0, 0];
      $("resourceSupply").innerHTML = labels.map((name, r) => `<button type="button" class="trade-resource-add" data-add-resource="${r}" style="--resource:${colors[r]}">${icon(B.RES[r])}<span>${name}<small>${english[r]}</small></span><i aria-hidden="true">+</i></button>`).join("");
      renderResourceChoices(); $("resourceChoices").scrollTop = 0; $("resourceSelected").scrollTop = 0;
    }
    $("resourceDialog").showModal();
    renderGoldAlert();
  }
  function resourceLimits() {
    const g = state.room.game, mode = state.resourceMode;
    if (["piratePayment", "pirateReward"].includes(mode)) return S.choice(g, state.room.you, mode) || { required: 0, supply: [0, 0, 0, 0, 0] };
    return { required: mode === "gold" ? g.legal.gold : mode === "plenty" ? Math.min(2, total(g.bank)) : 1, supply: mode === "monopoly" ? [1, 1, 1, 1, 1] : g.bank };
  }
  function renderResourceChoices() {
    const { required, supply } = resourceLimits(), monopoly = state.resourceMode === "monopoly";
    let remaining = required, adjusted = false;
    resourceDraft = resourceDraft.map((n, r) => {
      const kept = Math.min(n, supply[r], remaining);
      remaining -= kept; adjusted ||= kept !== n; return kept;
    });
    if (adjusted) $("resourceError").textContent = "可选资源有变化，已调整选择 / Available resources changed; selection updated";
    const selected = total(resourceDraft);
    $("resourceSupply").querySelectorAll("[data-add-resource]").forEach((button) => {
      const r = Number(button.dataset.addResource), available = supply[r] - resourceDraft[r];
      button.disabled = state.pending || !available || (!monopoly && selected >= required);
      button.title = `${labels[r]} / ${english[r]} · ${monopoly ? "选择此资源 / Choose this resource" : `可选 / Available ${available}`}`;
      button.setAttribute("aria-label", `${monopoly ? "选择 / Choose" : "添加 / Add"} ${labels[r]} / ${english[r]}${monopoly ? "" : ` · ${available}`}`);
      button.setAttribute("aria-pressed", String(monopoly && resourceDraft[r] > 0));
    });
    $("resourceSelected").innerHTML = resourceDraft.flatMap((n, r) => Array.from({ length: n }, () => {
      const label = `移除 ${labels[r]} / Remove ${english[r]}`;
      return `<button type="button" class="trade-card" data-remove-resource="${r}" style="--resource:${colors[r]}" ${state.pending ? "disabled" : ""} aria-label="${label}" title="${label}">${icon(B.RES[r])}</button>`;
    })).join("") || '<span class="empty-trade-slot" role="img" aria-label="未选卡牌 / No cards selected"></span>';
    $("resourceHint").textContent = `已选 / Selected ${selected} / ${required}`;
    $("confirmResources").disabled = state.pending || selected !== required;
  }
  $("resourceChoices").onclick = (e) => {
    const button = e.target.closest("[data-add-resource],[data-remove-resource]");
    if (!button || button.disabled || state.pending || !["gold", "plenty", "monopoly", "piratePayment", "pirateReward"].includes(state.resourceMode)) return;
    const adding = button.hasAttribute("data-add-resource"), r = Number(adding ? button.dataset.addResource : button.dataset.removeResource);
    const { required, supply } = resourceLimits();
    if (adding && state.resourceMode === "monopoly") resourceDraft = [0, 0, 0, 0, 0];
    if (adding && (total(resourceDraft) >= required || resourceDraft[r] >= supply[r])) return;
    resourceDraft[r] = Math.max(0, resourceDraft[r] + (adding ? 1 : -1));
    $("resourceError").textContent = ""; renderResourceChoices();
    if (!adding) {
      const next = $("resourceSelected").querySelector(`[data-remove-resource="${r}"]`) || $("resourceSupply").querySelector(`[data-add-resource="${r}"]:not(:disabled)`);
      next?.focus({ preventScroll: true });
    }
  };
  function renderDiscard() {
    const hand = me().resources, required = state.room.game.legal.discard;
    discardDraft = discardDraft.map((n, r) => Math.min(n, hand[r]));
    const selected = total(discardDraft);
    for (const [id, side, cards] of [["discardHand", "keep", hand.map((n, r) => n - discardDraft[r])], ["discardSelected", "discard", discardDraft]]) {
      $(id).innerHTML = cards.flatMap((n, r) => Array.from({ length: n }, () => {
        const label = `${side === "keep" ? "弃掉 / Discard" : "放回手牌 / Keep"} ${labels[r]} / ${english[r]}`;
        return `<button type="button" class="discard-card" data-discard-side="${side}" data-resource="${r}" style="--resource:${colors[r]}" ${state.pending || (side === "keep" && selected >= required) ? "disabled" : ""} aria-label="${label}" title="${label}">${icon(B.RES[r])}<span>${labels[r]}<small>${english[r]}</small></span></button>`;
      })).join("") || '<span class="empty-discard-slot" role="img" aria-label="未选卡牌 / No cards selected"></span>';
    }
    $("resourceHint").textContent = `已选 / Selected ${selected} / ${required}`;
    $("confirmResources").disabled = state.pending || !required || selected !== required;
  }
  $("discardChoices").onclick = (e) => {
    const button = e.target.closest("[data-discard-side]");
    if (!button || button.disabled || state.pending || state.resourceMode !== "discard") return;
    const r = Number(button.dataset.resource), adding = button.dataset.discardSide === "keep", required = state.room.game.legal.discard;
    if (!required || (adding && (total(discardDraft) >= required || discardDraft[r] >= me().resources[r]))) return;
    discardDraft[r] = Math.max(0, discardDraft[r] + (adding ? 1 : -1));
    $("resourceError").textContent = ""; renderDiscard();
    const next = $(adding ? "discardHand" : "discardSelected").querySelector(`[data-resource="${r}"]:not(:disabled)`)
      || $(adding ? "discardHand" : "discardSelected").querySelector("button:not(:disabled)")
      || $(adding ? "discardSelected" : "discardHand").querySelector(`[data-resource="${r}"]:not(:disabled)`);
    next?.focus({ preventScroll: true });
  };
  $("confirmResources").onclick = () => {
    if (state.pending) return;
    const g = state.room.game, mode = state.resourceMode, resources = mode === "discard" ? [...discardDraft] : [...resourceDraft];
    const scenarioChoice = ["piratePayment", "pirateReward"].includes(mode);
    if (scenarioChoice && !S.choice(g, state.room.you, mode)) return;
    const { required: count, supply } = mode === "discard" ? { required: g.legal.discard, supply: me().resources } : resourceLimits();
    if (!valid(resources) || total(resources) !== count || resources.some((n, r) => n > supply[r])) { $("resourceError").textContent = "数量不符或资源不足 / Check quantity and availability"; return; }
    action(["monopoly", "pirateReward"].includes(mode) ? { type: mode, resource: resources.findIndex((n) => n) } : { type: mode, resources });
    if (state.pending) $("resourceDialog").close();
  };
  const initialMap = new URLSearchParams(location.search).get("map");
  chooseMap(Maps.get(initialMap) ? initialMap : new URLSearchParams(location.search).get("edition") === "seafarers" ? "shores-1" : "base");
  connect();
})();
