const translations = {
  zh: {
    appName: "德州牌桌",
    home: "主页",
    calculator: "概率计算",
    soloGame: "单机对局",
    chooseMode: "选择一个模式",
    chooseModeHint: "练习决策，或直接坐上牌桌。",
    calculatorDesc: "选择手牌和公共牌，查看牌型分布、胜率与底池赔率。",
    gameDesc: "选择人数，与打法各不相同的机器人进行完整牌局。",
    players: "玩家",
    blinds: "盲注",
    startingStack: "起始筹码",
    language: "语言",
    calculatorIntro: "选择 2 张手牌和 0-5 张公共牌，计算最终牌型和对随机对手的胜率。",
    reset: "清空",
    holeCards: "手牌",
    communityCards: "公共牌",
    deck: "牌组",
    clickToSelect: "点击选牌",
    hole: "手牌",
    board: "公共牌",
    opponents: "对手人数",
    calculate: "计算",
    equity: "胜率",
    selectTwoCards: "请先选择两张手牌",
    runouts: "补牌样本",
    exactOrSample: "精确计算或随机采样",
    potOdds: "底池赔率",
    potBeforeCall: "当前底池",
    callAmount: "跟注金额",
    handDistribution: "牌型概率",
    setYourTable: "设置你的牌桌",
    setupHint: "你将与理性但风格不同的机器人进行无限注德州扑克。",
    tableSize: "牌桌人数",
    takeSeat: "坐下开局",
    nextHand: "下一手",
    pot: "底池",
    fold: "弃牌",
    check: "过牌",
    call: "跟注",
    raise: "加注",
    handLog: "牌局记录",
    you: "你",
    chips: "筹码",
    waiting: "等待其他玩家行动",
    yourTurn: "轮到你行动",
    exact: "精确枚举",
    sampled: "随机采样",
    requiredEquity: "最低所需胜率",
    favorableCall: "当前胜率高于底池赔率要求",
    unfavorableCall: "当前胜率低于底池赔率要求",
    noEquityYet: "计算胜率后显示跟注建议",
    preflop: "翻牌前",
    flop: "翻牌",
    turn: "转牌",
    river: "河牌",
    showdown: "摊牌",
    hand: "手牌",
    wins: "赢得底池",
    splitPot: "平分底池",
    everyoneFolded: "其他玩家均已弃牌",
    newHand: "新一手开始",
    postsSmallBlind: "投入小盲",
    postsBigBlind: "投入大盲",
    checks: "过牌",
    calls: "跟注",
    raisesTo: "加注到",
    folds: "弃牌",
    allIn: "全下",
    bustMessage: "你的筹码已用完，请重新设置牌桌。",
    gameOver: "牌局结束",
    resetTable: "重新设置",
    noHand: "尚未成牌",
    royalFlush: "皇家同花顺",
    straightFlush: "同花顺",
    fourKind: "四条",
    fullHouse: "葫芦",
    flush: "同花",
    straight: "顺子",
    threeKind: "三条",
    twoPair: "两对",
    onePair: "一对",
    highCard: "高牌",
  },
  en: {
    appName: "Hold'em Table",
    home: "Home",
    calculator: "Odds Calculator",
    soloGame: "Solo Game",
    chooseMode: "Choose a mode",
    chooseModeHint: "Study a decision or take a seat at the table.",
    calculatorDesc: "Choose hole and community cards to see hand distribution, equity, and pot odds.",
    gameDesc: "Choose a table size and play a full game against bots with distinct styles.",
    players: "Players",
    blinds: "Blinds",
    startingStack: "Starting stack",
    language: "Language",
    calculatorIntro: "Choose 2 hole cards and 0-5 community cards to calculate final hands and equity.",
    reset: "Reset",
    holeCards: "Hole cards",
    communityCards: "Community cards",
    deck: "Deck",
    clickToSelect: "Click to select",
    hole: "Hole",
    board: "Board",
    opponents: "Opponents",
    calculate: "Calculate",
    equity: "Equity",
    selectTwoCards: "Select two hole cards first",
    runouts: "Runout sample",
    exactOrSample: "Exact enumeration or sampling",
    potOdds: "Pot odds",
    potBeforeCall: "Current pot",
    callAmount: "Call amount",
    handDistribution: "Hand distribution",
    setYourTable: "Set your table",
    setupHint: "Play no-limit Texas Hold'em against rational bots with distinct styles.",
    tableSize: "Table size",
    takeSeat: "Take a seat",
    nextHand: "Next hand",
    pot: "Pot",
    fold: "Fold",
    check: "Check",
    call: "Call",
    raise: "Raise",
    handLog: "Hand log",
    you: "You",
    chips: "chips",
    waiting: "Waiting for other players",
    yourTurn: "Your turn",
    exact: "Exact enumeration",
    sampled: "Random sample",
    requiredEquity: "Required equity",
    favorableCall: "Your equity is above the pot-odds threshold",
    unfavorableCall: "Your equity is below the pot-odds threshold",
    noEquityYet: "Calculate equity to see a call recommendation",
    preflop: "Pre-flop",
    flop: "Flop",
    turn: "Turn",
    river: "River",
    showdown: "Showdown",
    hand: "Hand",
    wins: "wins the pot",
    splitPot: "split the pot",
    everyoneFolded: "all other players folded",
    newHand: "A new hand begins",
    postsSmallBlind: "posts small blind",
    postsBigBlind: "posts big blind",
    checks: "checks",
    calls: "calls",
    raisesTo: "raises to",
    folds: "folds",
    allIn: "all-in",
    bustMessage: "You are out of chips. Reset the table to play again.",
    gameOver: "Game over",
    resetTable: "Reset table",
    noHand: "No made hand",
    royalFlush: "Royal Flush",
    straightFlush: "Straight Flush",
    fourKind: "Four of a Kind",
    fullHouse: "Full House",
    flush: "Flush",
    straight: "Straight",
    threeKind: "Three of a Kind",
    twoPair: "Two Pair",
    onePair: "One Pair",
    highCard: "High Card",
  },
};

let language = localStorage.getItem("holdem-language") || "zh";
let selectedStartingStack = 150;
let selectedBlindInterval = 10;
const BLIND_LEVELS = [
  [1, 2],
  [2, 4],
  [3, 6],
  [5, 10],
  [10, 20],
  [15, 30],
  [20, 40],
];

function t(key) {
  return translations[language][key] || key;
}

const ranks = [
  { label: "A", value: 14 },
  { label: "K", value: 13 },
  { label: "Q", value: 12 },
  { label: "J", value: 11 },
  { label: "10", value: 10 },
  { label: "9", value: 9 },
  { label: "8", value: 8 },
  { label: "7", value: 7 },
  { label: "6", value: 6 },
  { label: "5", value: 5 },
  { label: "4", value: 4 },
  { label: "3", value: 3 },
  { label: "2", value: 2 },
];

const suits = [
  { label: "♠", name: "spades", color: "black" },
  { label: "♥", name: "hearts", color: "red" },
  { label: "♦", name: "diamonds", color: "red" },
  { label: "♣", name: "clubs", color: "black" },
];

const handTypes = [
  { key: "royalFlush", rank: 9, color: "#7156b8" },
  { key: "straightFlush", rank: 8, color: "#3271b8" },
  { key: "fourKind", rank: 7, color: "#1789a5" },
  { key: "fullHouse", rank: 6, color: "#176b4c" },
  { key: "flush", rank: 5, color: "#3e8e51" },
  { key: "straight", rank: 4, color: "#87a73c" },
  { key: "threeKind", rank: 3, color: "#c79b3b" },
  { key: "twoPair", rank: 2, color: "#d27638" },
  { key: "onePair", rank: 1, color: "#c43d3d" },
  { key: "highCard", rank: 0, color: "#747b76" },
];

const boardLabels = [
  { zh: "翻牌 1", en: "Flop 1" },
  { zh: "翻牌 2", en: "Flop 2" },
  { zh: "翻牌 3", en: "Flop 3" },
  { zh: "转牌", en: "Turn" },
  { zh: "河牌", en: "River" },
];

const fullDeck = suits.flatMap((suit) =>
  ranks.map((rank) => ({
    id: `${rank.label}-${suit.name}`,
    rank: rank.label,
    value: rank.value,
    suit: suit.name,
    suitLabel: suit.label,
    color: suit.color,
  }))
);

const botProfiles = [
  {
    bluff: 0.035,
    aggression: 0.28,
  },
  {
    bluff: 0.08,
    aggression: 0.48,
  },
  {
    bluff: 0.13,
    aggression: 0.42,
  },
  {
    bluff: 0.2,
    aggression: 0.75,
  },
  {
    bluff: 0.3,
    aggression: 0.62,
  },
  {
    bluff: 0.055,
    aggression: 0.36,
  },
  {
    bluff: 0.17,
    aggression: 0.56,
  },
];

const familiarBotNames = [
  "Connie", "Colin", "Angela", "Stephan", "Zoey",
  "William", "Tim", "Gary", "Alison",
];

const commonBotNames = [
  "James", "Emma", "Michael", "Olivia", "Daniel", "Sophia", "David",
  "Emily", "Chris", "Anna", "Alex", "Sarah", "Ryan", "Jessica",
  "Matthew", "Rachel", "Kevin", "Laura", "Andrew", "Megan",
];

function drawBotNames(count) {
  const familiar = shuffle(familiarBotNames);
  const common = shuffle(commonBotNames);
  const selected = [];

  while (selected.length < count) {
    const preferFamiliar = Math.random() < 0.4;
    const source = preferFamiliar
      ? (familiar.length ? familiar : common)
      : (common.length ? common : familiar);
    selected.push(source.pop());
  }
  return selected;
}

const viewElements = {
  home: document.querySelector("#homeView"),
  calculator: document.querySelector("#calculatorView"),
  game: document.querySelector("#gameView"),
  online: document.querySelector("#onlineView"),
};

let currentView = "home";

function setView(view) {
  currentView = view;
  Object.entries(viewElements).forEach(([key, element]) => {
    element.classList.toggle("active", key === view);
  });
  document.querySelectorAll("[data-view-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === view);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll("[data-view-target]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.viewTarget));
});

document.querySelectorAll("[data-open-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.openView));
});

document.querySelector("#brandButton").addEventListener("click", () => setView("home"));

function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  document.querySelector("#langZh").classList.toggle("active", language === "zh");
  document.querySelector("#langEn").classList.toggle("active", language === "en");
  renderCalculator();
  renderPotOdds();
  if (game.players.length) renderGame();
}

document.querySelector("#langZh").addEventListener("click", () => {
  language = "zh";
  localStorage.setItem("holdem-language", language);
  applyLanguage();
});

document.querySelector("#langEn").addEventListener("click", () => {
  language = "en";
  localStorage.setItem("holdem-language", language);
  applyLanguage();
});

function cardMarkup(card) {
  return `<span class="${card.color}"><span class="rank">${card.rank}</span><span class="suit">${card.suitLabel}</span></span>`;
}

function playingCardMarkup(card, extraClass = "") {
  if (!card) return `<div class="playing-card placeholder ${extraClass}"></div>`;
  return `
    <div class="playing-card ${card.color} ${extraClass}">
      <span class="rank">${card.rank}</span>
      <span class="suit">${card.suitLabel}</span>
    </div>
  `;
}

function miniCardMarkup(card, hidden = false, extraClass = "") {
  if (hidden) return `<span class="mini-card back ${extraClass}">?</span>`;
  return `<span class="mini-card ${card.color} ${extraClass}">${card.rank}${card.suitLabel}</span>`;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomCentered() {
  return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
}

function formatNumber(value) {
  return Math.round(value).toLocaleString(language === "zh" ? "zh-CN" : "en-US");
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  if (value === 0) return "0%";
  if (value < 0.01) return "<0.01%";
  return `${value.toFixed(2)}%`;
}

function* combinations(items, size, start = 0, prefix = []) {
  if (size === 0) {
    yield prefix;
    return;
  }

  for (let i = start; i <= items.length - size; i += 1) {
    yield* combinations(items, size - 1, i + 1, [...prefix, items[i]]);
  }
}

function getStraightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);

  for (let i = 0; i <= unique.length - 5; i += 1) {
    const run = unique.slice(i, i + 5);
    if (run[0] - run[4] === 4) return run[0] === 1 ? 5 : run[0];
  }
  return 0;
}

function evaluateFiveRank(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map();
  cards.forEach((card) => counts.set(card.value, (counts.get(card.value) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = new Set(cards.map((card) => card.suit)).size === 1;
  const straightHigh = getStraightHigh(values);

  if (flush && straightHigh === 14) return [9, 14];
  if (flush && straightHigh) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...values];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) {
    return [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.slice(0, 2).map(([value]) => value).sort((a, b) => b - a);
    return [2, ...pairs, groups[2][0]];
  }
  if (groups[0][1] === 2) {
    return [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  }
  return [0, ...values];
}

function compareRank(left, right) {
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const a = left[i] || 0;
    const b = right[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}

function evaluateBestRank(cards) {
  if (cards.length < 5) return null;
  let best = null;
  for (const five of combinations(cards, 5)) {
    const rank = evaluateFiveRank(five);
    if (!best || compareRank(rank, best) > 0) best = rank;
  }
  return best;
}

function handTypeKey(cards) {
  const rank = evaluateBestRank(cards);
  if (!rank) return "noHand";
  return handTypes.find((type) => type.rank === rank[0]).key;
}

function boardForcesTie(board) {
  if (board.length !== 5) return false;
  const boardRank = evaluateFiveRank(board);
  const boardIds = new Set(board.map((card) => card.id));
  const available = fullDeck.filter((card) => !boardIds.has(card.id));

  for (const holeCards of combinations(available, 2)) {
    const bestRank = evaluateBestRank([...board, ...holeCards]);
    if (compareRank(bestRank, boardRank) > 0) return false;
  }
  return true;
}

// Calculator
const calcState = {
  hand: [],
  board: [],
  target: "hand",
  distribution: Object.fromEntries(handTypes.map((type) => [type.key, 0])),
  total: 0,
  method: "",
  equity: null,
};

const handSlotsEl = document.querySelector("#handSlots");
const boardSlotsEl = document.querySelector("#boardSlots");
const deckEl = document.querySelector("#deck");
const resultsEl = document.querySelector("#results");
const comboCountEl = document.querySelector("#comboCount");
const equityValueEl = document.querySelector("#equityValue");
const equityNoteEl = document.querySelector("#equityNote");
const sampleNoteEl = document.querySelector("#sampleNote");
const opponentInput = document.querySelector("#opponentInput");
const potInput = document.querySelector("#potInput");
const callInput = document.querySelector("#callInput");
const potOddsResultEl = document.querySelector("#potOddsResult");

function resetCalculatorResults() {
  calcState.distribution = Object.fromEntries(handTypes.map((type) => [type.key, 0]));
  calcState.total = 0;
  calcState.method = "";
  calcState.equity = null;
}

function renderCalculator() {
  handSlotsEl.innerHTML = "";
  boardSlotsEl.innerHTML = "";

  for (let i = 0; i < 2; i += 1) {
    handSlotsEl.appendChild(createCalculatorSlot(calcState.hand[i], "hand", i));
  }

  for (let i = 0; i < 5; i += 1) {
    const wrapper = document.createElement("div");
    wrapper.className = "board-slot";
    const label = boardLabels[i];
    wrapper.innerHTML = `<div class="street-label"><span>${language === "zh" ? label.zh : label.en}</span><strong>${label.en}</strong></div>`;
    wrapper.appendChild(createCalculatorSlot(calcState.board[i], "board", i));
    boardSlotsEl.appendChild(wrapper);
  }

  const selected = new Set([...calcState.hand, ...calcState.board].map((card) => card.id));
  deckEl.innerHTML = "";
  fullDeck.forEach((card) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `deck-card ${selected.has(card.id) ? "selected" : ""}`;
    button.innerHTML = cardMarkup(card);
    button.addEventListener("click", () => toggleCalculatorCard(card));
    deckEl.appendChild(button);
  });

  document.querySelectorAll("[data-card-target]").forEach((button) => {
    button.classList.toggle("active", button.dataset.cardTarget === calcState.target);
  });

  comboCountEl.textContent = formatNumber(calcState.total);
  sampleNoteEl.textContent = calcState.method ? t(calcState.method) : t("exactOrSample");
  equityValueEl.textContent = calcState.equity === null ? "--" : formatPercent(calcState.equity);
  equityNoteEl.textContent = calcState.equity === null
    ? t("selectTwoCards")
    : `${t("opponents")}: ${clamp(Number(opponentInput.value) || 1, 1, 5)}`;
  renderDistribution();
}

function createCalculatorSlot(card, group, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `slot ${card ? "filled" : ""}`;
  button.innerHTML = card ? cardMarkup(card) : index + 1;
  if (card) {
    button.addEventListener("click", () => {
      calcState[group] = calcState[group].filter((item) => item.id !== card.id);
      resetCalculatorResults();
      renderCalculator();
    });
  }
  return button;
}

function toggleCalculatorCard(card) {
  const handIndex = calcState.hand.findIndex((item) => item.id === card.id);
  const boardIndex = calcState.board.findIndex((item) => item.id === card.id);
  if (handIndex >= 0) {
    calcState.hand.splice(handIndex, 1);
  } else if (boardIndex >= 0) {
    calcState.board.splice(boardIndex, 1);
  } else if (calcState.target === "hand" && calcState.hand.length < 2) {
    calcState.hand.push(card);
    if (calcState.hand.length === 2) calcState.target = "board";
  } else if (calcState.target === "board" && calcState.board.length < 5) {
    calcState.board.push(card);
  }
  resetCalculatorResults();
  renderCalculator();
}

function calculateDistribution() {
  if (calcState.hand.length !== 2) return;
  const known = [...calcState.hand, ...calcState.board];
  const remaining = fullDeck.filter((card) => !known.some((knownCard) => knownCard.id === card.id));
  const missing = 5 - calcState.board.length;
  const counts = Object.fromEntries(handTypes.map((type) => [type.key, 0]));
  let total = 0;

  if (missing <= 2) {
    for (const runout of combinations(remaining, missing)) {
      counts[handTypeKey([...known, ...runout])] += 1;
      total += 1;
    }
    calcState.method = "exact";
  } else {
    const samples = missing === 5 ? 40000 : 30000;
    for (let i = 0; i < samples; i += 1) {
      const runout = shuffle(remaining).slice(0, missing);
      counts[handTypeKey([...known, ...runout])] += 1;
      total += 1;
    }
    calcState.method = "sampled";
  }

  calcState.distribution = counts;
  calcState.total = total;
}

function calculateEquity(trials = 5000) {
  if (calcState.hand.length !== 2) return null;
  const opponents = clamp(Number(opponentInput.value) || 1, 1, 5);
  opponentInput.value = opponents;
  const known = [...calcState.hand, ...calcState.board];
  const remaining = fullDeck.filter((card) => !known.some((knownCard) => knownCard.id === card.id));
  let share = 0;

  for (let i = 0; i < trials; i += 1) {
    const cards = shuffle(remaining);
    let cursor = 0;
    const hands = [];
    for (let opponent = 0; opponent < opponents; opponent += 1) {
      hands.push(cards.slice(cursor, cursor + 2));
      cursor += 2;
    }
    const board = [...calcState.board, ...cards.slice(cursor, cursor + (5 - calcState.board.length))];
    const heroRank = evaluateBestRank([...calcState.hand, ...board]);
    let bestComparison = 0;
    let ties = 0;
    for (const hand of hands) {
      const comparison = compareRank(heroRank, evaluateBestRank([...hand, ...board]));
      if (comparison < 0) {
        bestComparison = -1;
        break;
      }
      if (comparison === 0) ties += 1;
    }
    if (bestComparison === 0) share += 1 / (ties + 1);
  }
  return (share / trials) * 100;
}

function renderDistribution() {
  const max = Math.max(...Object.values(calcState.distribution), 1);
  resultsEl.innerHTML = handTypes.map((type) => {
    const count = calcState.distribution[type.key] || 0;
    const percent = calcState.total ? (count / calcState.total) * 100 : 0;
    const width = count ? Math.max((count / max) * 100, 1.5) : 0;
    return `
      <div class="bar-row">
        <div class="bar-label">
          <strong>${t(type.key)}</strong>
          <small>${translations.en[type.key]}</small>
        </div>
        <div class="bar-track"><div class="bar-fill" style="width:${width}%;background:${type.color}"></div></div>
        <span class="bar-value">${formatPercent(percent)}</span>
      </div>
    `;
  }).join("");
}

function renderPotOdds() {
  const pot = Math.max(0, Number(potInput.value) || 0);
  const call = Math.max(0, Number(callInput.value) || 0);
  if (!call) {
    potOddsResultEl.innerHTML = `<strong>${t("requiredEquity")}: 0%</strong>`;
    return;
  }
  const required = call / (pot + call) * 100;
  let advice = t("noEquityYet");
  if (calcState.equity !== null) {
    advice = calcState.equity >= required ? t("favorableCall") : t("unfavorableCall");
  }
  potOddsResultEl.innerHTML = `<strong>${t("requiredEquity")}: ${formatPercent(required)}</strong><br>${advice}`;
}

document.querySelectorAll("[data-card-target]").forEach((button) => {
  button.addEventListener("click", () => {
    calcState.target = button.dataset.cardTarget;
    renderCalculator();
  });
});

document.querySelector("#calculateBtn").addEventListener("click", () => {
  if (calcState.hand.length !== 2) {
    equityNoteEl.textContent = t("selectTwoCards");
    return;
  }
  document.querySelector("#calculateBtn").disabled = true;
  document.querySelector("#calculateBtn").textContent = "...";
  window.setTimeout(() => {
    calculateDistribution();
    calcState.equity = calculateEquity();
    renderCalculator();
    renderPotOdds();
    document.querySelector("#calculateBtn").disabled = false;
    document.querySelector("#calculateBtn").textContent = t("calculate");
  }, 20);
});

document.querySelector("#resetCalculatorBtn").addEventListener("click", () => {
  calcState.hand = [];
  calcState.board = [];
  calcState.target = "hand";
  resetCalculatorResults();
  renderCalculator();
  renderPotOdds();
});

opponentInput.addEventListener("input", () => {
  calcState.equity = null;
  renderCalculator();
  renderPotOdds();
});
potInput.addEventListener("input", renderPotOdds);
callInput.addEventListener("input", renderPotOdds);

// Solo game
let selectedPlayerCount = 4;
const game = {
  players: [],
  deck: [],
  community: [],
  pot: 0,
  currentBet: 0,
  minRaise: 2,
  startingStack: 150,
  blindInterval: 10,
  blindLevel: 0,
  smallBlindAmount: 1,
  bigBlindAmount: 2,
  dealer: -1,
  smallBlind: -1,
  bigBlind: -1,
  lastAggressor: -1,
  raiseCount: 0,
  currentActor: -1,
  street: "preflop",
  acted: new Set(),
  handNumber: 0,
  humanImage: {
    overbetStreak: 0,
    suspicion: 0,
    observedBluffs: 0,
  },
  humanOverbetThisHand: false,
  humanOverbetRecorded: false,
  burned: [],
  dealing: false,
  animationPhase: "",
  communityPulse: -1,
  dealToken: 0,
  boardLockedTie: false,
  complete: false,
  matchResult: null,
  winners: [],
  message: "",
  log: [],
  timer: null,
};

function gameText(key) {
  const zh = translations.zh[key] || key;
  const en = translations.en[key] || key;
  return zh === en ? zh : `${zh} / ${en}`;
}

document.querySelectorAll("[data-count]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedPlayerCount = Number(button.dataset.count);
    document.querySelectorAll("[data-count]").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.count) === selectedPlayerCount);
    });
  });
});

document.querySelectorAll("[data-stack]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedStartingStack = Number(button.dataset.stack);
    document.querySelectorAll("[data-stack]").forEach((item) => {
      item.classList.toggle("active", Number(item.dataset.stack) === selectedStartingStack);
    });
  });
});

document.querySelectorAll("[data-blind-interval]").forEach((button) => {
  button.addEventListener("click", () => {
    selectedBlindInterval = Number(button.dataset.blindInterval);
    document.querySelectorAll("[data-blind-interval]").forEach((item) => {
      item.classList.toggle(
        "active",
        Number(item.dataset.blindInterval) === selectedBlindInterval
      );
    });
  });
});

function startGame() {
  clearTimeout(game.timer);
  const names = drawBotNames(selectedPlayerCount - 1);
  const profiles = shuffle(botProfiles);
  const botCount = selectedPlayerCount - 1;
  const masterCount = Math.round(botCount * 0.8);
  const masteryLevels = shuffle(Array.from({ length: botCount }, (_, index) => (
    index < masterCount
      ? 0.82 + Math.random() * 0.18
      : 0.48 + Math.random() * 0.22
  )));
  game.players = [{
    isHuman: true,
    profile: null,
    chips: selectedStartingStack,
    hand: [],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    showCards: false,
    handBluff: 0,
    dealPulse: -1,
    foldAnimation: false,
  }];

  for (let i = 0; i < selectedPlayerCount - 1; i += 1) {
    game.players.push({
      isHuman: false,
      name: names[i],
      profile: { ...profiles[i] },
      mastery: masteryLevels[i],
      chips: selectedStartingStack,
      hand: [],
      bet: 0,
      totalBet: 0,
      folded: false,
      allIn: false,
      showCards: false,
      handBluff: 0,
      dealPulse: -1,
      foldAnimation: false,
    });
  }

  game.dealer = -1;
  game.smallBlind = -1;
  game.bigBlind = -1;
  game.matchResult = null;
  game.handNumber = 0;
  game.startingStack = selectedStartingStack;
  game.blindInterval = selectedBlindInterval;
  game.blindLevel = 0;
  game.smallBlindAmount = BLIND_LEVELS[0][0];
  game.bigBlindAmount = BLIND_LEVELS[0][1];
  game.humanImage = {
    overbetStreak: 0,
    suspicion: 0,
    observedBluffs: 0,
  };
  game.humanOverbetThisHand = false;
  game.humanOverbetRecorded = false;
  document.querySelector("#gameSetup").hidden = true;
  document.querySelector("#pokerRoom").hidden = false;
  beginHand();
}

function activeWithChips() {
  return game.players.map((player, index) => ({ player, index })).filter(({ player }) => player.chips > 0);
}

function nextIndex(start, predicate) {
  for (let offset = 1; offset <= game.players.length; offset += 1) {
    const index = (start + offset) % game.players.length;
    if (predicate(game.players[index], index)) return index;
  }
  return -1;
}

function beginHand() {
  clearTimeout(game.timer);
  if (game.handNumber > 0 && !game.humanOverbetThisHand) {
    game.humanImage.overbetStreak = 0;
    game.humanImage.suspicion *= 0.72;
  }
  game.matchResult = null;
  game.complete = false;
  game.winners = [];
  game.community = [];
  game.burned = [];
  game.pot = 0;
  game.currentBet = 0;
  game.lastAggressor = -1;
  game.raiseCount = 0;
  game.street = "preflop";
  game.acted = new Set();
  game.log = [];
  game.handNumber += 1;
  game.blindLevel = game.blindInterval > 0
    ? Math.min(
      Math.floor((game.handNumber - 1) / game.blindInterval),
      BLIND_LEVELS.length - 1
    )
    : 0;
  [game.smallBlindAmount, game.bigBlindAmount] = BLIND_LEVELS[game.blindLevel];
  game.minRaise = game.bigBlindAmount;
  game.humanOverbetThisHand = false;
  game.humanOverbetRecorded = false;
  game.dealing = true;
  game.animationPhase = "shuffle";
  game.communityPulse = -1;
  game.boardLockedTie = false;
  game.dealToken += 1;
  const dealToken = game.dealToken;
  game.deck = shuffle(fullDeck);

  game.players.forEach((player) => {
    player.hand = [];
    player.bet = 0;
    player.totalBet = 0;
    player.folded = player.chips <= 0;
    player.allIn = false;
    player.showCards = false;
    player.dealPulse = -1;
    player.foldAnimation = false;
    player.handBluff = player.isHuman
      ? 0
      : clamp(
        player.profile.bluff * (1 + randomCentered() * 0.75) + randomCentered() * 0.035,
        0.01,
        0.42
      );
  });

  const livePlayers = activeWithChips();
  if (livePlayers.length < 2 || game.players[0].chips <= 0) {
    game.complete = true;
    game.currentActor = -1;
    game.matchResult = game.players[0].chips <= 0 ? "loss" : "victory";
    game.message = game.matchResult === "loss"
      ? "你破产了 / You are bankrupt"
      : "你赢了 / Victory";
    renderGame();
    return;
  }

  game.dealer = nextIndex(game.dealer, (player) => player.chips > 0);
  const smallBlindIndex = livePlayers.length === 2
    ? game.dealer
    : nextIndex(game.dealer, (player) => player.chips > 0);
  const bigBlindIndex = nextIndex(smallBlindIndex, (player) => player.chips > 0);
  game.smallBlind = smallBlindIndex;
  game.bigBlind = bigBlindIndex;

  postBlind(smallBlindIndex, game.smallBlindAmount, "postsSmallBlind");
  postBlind(bigBlindIndex, game.bigBlindAmount, "postsBigBlind");
  game.currentBet = Math.max(game.players[smallBlindIndex].bet, game.players[bigBlindIndex].bet);
  game.currentActor = -1;
  game.message = "洗牌中... / Shuffling...";
  renderGame();

  game.timer = window.setTimeout(() => {
    if (dealToken !== game.dealToken) return;
    dealHoleCards(smallBlindIndex, bigBlindIndex, dealToken);
  }, 460);
}

function activeDealOrder(startIndex) {
  const order = [];
  for (let offset = 0; offset < game.players.length; offset += 1) {
    const index = (startIndex + offset) % game.players.length;
    if (game.players[index].chips > 0) order.push(index);
  }
  return order;
}

function dealHoleCards(smallBlindIndex, bigBlindIndex, dealToken) {
  const order = activeDealOrder(smallBlindIndex);
  const sequence = [...order, ...order];
  game.animationPhase = "deal";
  let step = 0;

  function dealNext() {
    if (dealToken !== game.dealToken) return;
    game.players.forEach((player) => {
      player.dealPulse = -1;
    });

    if (step >= sequence.length) {
      game.dealing = false;
      game.animationPhase = "";
      game.currentActor = nextIndex(bigBlindIndex, isActionable);
      game.message = gameText("newHand");
      renderGame();
      scheduleBotIfNeeded();
      return;
    }

    const player = game.players[sequence[step]];
    player.hand.push(game.deck.pop());
    player.dealPulse = player.hand.length - 1;
    game.message = "发牌中... / Dealing...";
    renderGame();
    step += 1;
    game.timer = window.setTimeout(dealNext, 82);
  }

  dealNext();
}

function playerDisplayName(player) {
  return player.isHuman ? gameText("you") : player.name;
}

function postBlind(index, amount, logKey) {
  const player = game.players[index];
  const paid = contribute(player, amount);
  addLog(`${playerDisplayName(player)} ${gameText(logKey)} ${paid}`);
}

function contribute(player, amount) {
  const paid = Math.min(player.chips, Math.max(0, amount));
  player.chips -= paid;
  player.bet += paid;
  player.totalBet += paid;
  game.pot += paid;
  if (player.chips === 0) player.allIn = true;
  return paid;
}

function isActionable(player) {
  return !player.folded && !player.allIn && player.chips > 0;
}

function remainingPlayers() {
  return game.players.map((player, index) => ({ player, index })).filter(({ player }) => !player.folded);
}

function bettingComplete() {
  const actionable = game.players.map((player, index) => ({ player, index })).filter(({ player }) => isActionable(player));
  if (!actionable.length) return true;
  return actionable.every(({ player, index }) => game.acted.has(index) && player.bet === game.currentBet);
}

function nextNeedingAction(start) {
  return nextIndex(start, (player, index) => (
    isActionable(player) && (!game.acted.has(index) || player.bet < game.currentBet)
  ));
}

function continueAfterAction(fromIndex) {
  if (remainingPlayers().length === 1) {
    awardUncontested();
    return;
  }
  if (bettingComplete()) {
    advanceStreet();
    return;
  }
  game.currentActor = nextNeedingAction(fromIndex);
  renderGame();
  scheduleBotIfNeeded();
}

function advanceStreet() {
  game.players.forEach((player) => {
    player.bet = 0;
  });
  game.currentBet = 0;
  game.minRaise = game.bigBlindAmount;
  game.lastAggressor = -1;
  game.raiseCount = 0;
  game.acted = new Set();

  if (game.street === "preflop") {
    animateCommunityDeal("flop", 3);
    return;
  } else if (game.street === "flop") {
    animateCommunityDeal("turn", 1);
    return;
  } else if (game.street === "turn") {
    animateCommunityDeal("river", 1);
    return;
  } else {
    showdown();
    return;
  }
}

function animateCommunityDeal(nextStreet, count) {
  game.dealing = true;
  game.animationPhase = "burn";
  game.currentActor = -1;
  game.burned.push(game.deck.pop());
  game.message = "烧牌... / Burn card...";
  renderGame();
  const dealToken = game.dealToken;
  let dealt = 0;

  game.timer = window.setTimeout(function dealCommunityCard() {
    if (dealToken !== game.dealToken) return;
    game.animationPhase = "board";
    game.street = nextStreet;
    game.community.push(game.deck.pop());
    game.communityPulse = game.community.length - 1;
    dealt += 1;
    game.message = `${gameText(nextStreet)} · 发牌 / Deal`;
    renderGame();

    if (dealt < count) {
      game.timer = window.setTimeout(dealCommunityCard, 115);
      return;
    }

    game.timer = window.setTimeout(() => finishCommunityDeal(dealToken), 180);
  }, 180);
}

function finishCommunityDeal(dealToken) {
  if (dealToken !== game.dealToken) return;
  game.dealing = false;
  game.animationPhase = "";
  game.communityPulse = -1;
  game.boardLockedTie = game.street === "river" && boardForcesTie(game.community);
  game.message = game.boardLockedTie
    ? "公共牌锁定平局 / Board plays for everyone"
    : gameText(game.street);
  game.currentActor = nextIndex(game.dealer, isActionable);
  if (game.currentActor < 0 || bettingComplete()) {
    game.timer = window.setTimeout(advanceStreet, 900);
    renderGame();
    return;
  }
  renderGame();
  scheduleBotIfNeeded();
}

function addLog(text) {
  game.log.unshift(text);
  game.log = game.log.slice(0, 40);
}

function performAction(index, action, raiseTarget = 0) {
  if (game.complete || index !== game.currentActor) return;
  const player = game.players[index];
  const name = playerDisplayName(player);
  const toCall = Math.max(0, game.currentBet - player.bet);

  if (action === "fold") {
    player.folded = true;
    player.foldAnimation = true;
    if (player.isHuman && game.humanOverbetThisHand) {
      game.humanImage.suspicion = clamp(game.humanImage.suspicion + 0.1, 0, 1);
    }
    if (!player.isHuman) {
      const revealChance = 0.06
        + player.profile.aggression * 0.08
        + player.handBluff * 0.18;
      player.showCards = Math.random() < revealChance;
    }
    game.acted.add(index);
    addLog(`${name} ${gameText("folds")}`);
    window.setTimeout(() => {
      player.foldAnimation = false;
      renderGame();
    }, 480);
  } else if (action === "call") {
    if (toCall === 0) {
      addLog(`${name} ${gameText("checks")}`);
    } else {
      const paid = contribute(player, toCall);
      addLog(`${name} ${gameText("calls")} ${paid}${player.allIn ? ` · ${gameText("allIn")}` : ""}`);
    }
    game.acted.add(index);
  } else if (action === "raise") {
    const maxTarget = player.bet + player.chips;
    const minimumTarget = game.currentBet === 0
      ? game.bigBlindAmount
      : game.currentBet + game.minRaise;
    const target = clamp(Math.round(raiseTarget), minimumTarget, maxTarget);
    if (target <= game.currentBet) {
      const paid = contribute(player, toCall);
      addLog(`${name} ${gameText("calls")} ${paid}${player.allIn ? ` · ${gameText("allIn")}` : ""}`);
      game.acted.add(index);
    } else {
      const previousBet = game.currentBet;
      contribute(player, target - player.bet);
      game.currentBet = player.bet;
      game.minRaise = Math.max(game.bigBlindAmount, game.currentBet - previousBet);
      game.lastAggressor = index;
      game.raiseCount += 1;
      if (
        player.isHuman
        && game.street === "preflop"
        && target >= Math.max(game.bigBlindAmount * 12, game.startingStack * 0.2)
        && !game.humanOverbetRecorded
      ) {
        game.humanOverbetThisHand = true;
        game.humanOverbetRecorded = true;
        game.humanImage.overbetStreak += 1;
        const repeatAdjustment = game.humanImage.overbetStreak <= 2 ? 0.07 : 0.18;
        game.humanImage.suspicion = clamp(
          game.humanImage.suspicion + repeatAdjustment,
          0,
          1
        );
      }
      game.acted = new Set([index]);
      addLog(`${name} ${gameText("raisesTo")} ${game.currentBet}${player.allIn ? ` · ${gameText("allIn")}` : ""}`);
    }
  }

  game.message = game.log[0];
  continueAfterAction(index);
}

function preflopStrength(hand) {
  const [a, b] = [...hand].sort((left, right) => right.value - left.value);
  const pair = a.value === b.value;
  const suited = a.suit === b.suit;
  const gap = Math.abs(a.value - b.value);
  if (pair) return clamp(0.42 + a.value / 28, 0.48, 0.92);

  let score = 0.08;
  score += ((a.value - 2) / 12) * 0.35;
  score += ((b.value - 2) / 12) * 0.18;
  if (suited) score += 0.05;
  if (gap === 1) score += 0.045;
  if (gap === 2) score += 0.02;
  if (gap >= 4) score -= 0.055;
  if (a.value >= 13 && b.value >= 10) score += 0.055;
  return clamp(score, 0.06, 0.78);
}

function estimateBotEquity(index, trials = 90) {
  const player = game.players[index];
  if (game.community.length === 0) {
    const opponents = Math.max(1, remainingPlayers().length - 1);
    return clamp(preflopStrength(player.hand) - (opponents - 1) * 0.055, 0.04, 0.9);
  }
  const knownIds = new Set([...player.hand, ...game.community].map((card) => card.id));
  const unseen = fullDeck.filter((card) => !knownIds.has(card.id));
  const opponentCount = Math.max(1, remainingPlayers().length - 1);
  let share = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const sample = shuffle(unseen);
    let cursor = 0;
    const board = [...game.community, ...sample.slice(cursor, cursor + (5 - game.community.length))];
    cursor += 5 - game.community.length;
    const heroRank = evaluateBestRank([...player.hand, ...board]);
    let lost = false;
    let ties = 0;

    for (let opponent = 0; opponent < opponentCount; opponent += 1) {
      const opponentHand = sample.slice(cursor, cursor + 2);
      cursor += 2;
      const comparison = compareRank(heroRank, evaluateBestRank([...opponentHand, ...board]));
      if (comparison < 0) {
        lost = true;
        break;
      }
      if (comparison === 0) ties += 1;
    }
    if (!lost) share += 1 / (ties + 1);
  }
  return share / trials;
}

function preflopPositionScore(index) {
  const liveIndexes = game.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => player.chips > 0 && !player.folded)
    .map(({ playerIndex }) => playerIndex);
  const dealerPosition = liveIndexes.indexOf(game.dealer);
  const playerPosition = liveIndexes.indexOf(index);
  if (dealerPosition < 0 || playerPosition < 0 || liveIndexes.length < 2) return 0.5;
  const distanceFromDealer = (playerPosition - dealerPosition + liveIndexes.length) % liveIndexes.length;
  return 1 - distanceFromDealer / liveIndexes.length;
}

function choosePreflopBotAction(index) {
  const player = game.players[index];
  const profile = player.profile;
  const mastery = player.mastery || 0.55;
  const toCall = Math.max(0, game.currentBet - player.bet);
  const strength = preflopStrength(player.hand);
  const values = player.hand.map((card) => card.value).sort((a, b) => b - a);
  const isPair = values[0] === values[1];
  const pairValue = isPair ? values[0] : 0;
  const hasAce = values[0] === 14;
  const aceKicker = hasAce ? values[1] : 0;
  const strongBroadway = (hasAce && aceKicker >= 11) || (values[0] === 13 && values[1] === 12);
  const stackPressure = toCall / Math.max(player.chips + toCall, 1);
  const canRaise = player.chips > toCall + game.minRaise;
  const unopened = game.currentBet <= game.bigBlindAmount;
  const position = preflopPositionScore(index);
  const callers = game.players.filter((other, otherIndex) => (
    otherIndex !== index
    && otherIndex !== game.lastAggressor
    && !other.folded
    && other.bet === game.currentBet
    && other.bet > game.bigBlindAmount
  )).length;

  if (unopened) {
    const positionAdjustment = (position - 0.5) * 0.12 * mastery;
    const openThreshold = 0.45 - profile.aggression * 0.06 - positionAdjustment;
    const occasionalOpenBluff = Math.random() < player.handBluff * (0.18 + position * 0.32) * mastery;
    if (strength < openThreshold && !occasionalOpenBluff) {
      return toCall > 0 ? { action: "fold" } : { action: "call" };
    }
    if (canRaise) {
      const premiumOpen = pairValue >= 12 || (hasAce && aceKicker >= 13);
      const strongOpen = pairValue >= 9 || strongBroadway;
      const pressureOpenChance = premiumOpen
        ? 0.16 + profile.aggression * 0.2
        : strongOpen
          ? 0.035 + profile.aggression * 0.055
          : 0;

      if (mastery > 0.78 && Math.random() < pressureOpenChance) {
        const pressureTarget = premiumOpen
          ? game.bigBlindAmount * (6 + Math.round(Math.random() * 4))
          : game.bigBlindAmount * (5 + Math.round(Math.random() * 2));
        return { action: "raise", target: pressureTarget };
      }

      const openTarget = game.bigBlindAmount * (2.5 + profile.aggression * 0.8)
        + Math.min(callers, 2) * game.bigBlindAmount;
      return {
        action: "raise",
        target: clamp(
          Math.round(openTarget),
          Math.ceil(game.bigBlindAmount * 2.5),
          game.bigBlindAmount * 4.5
        ),
      };
    }
    return { action: "call" };
  }

  if (game.currentBet >= game.bigBlindAmount * 15) {
    const facingHumanOverbet = game.lastAggressor === 0;
    if (facingHumanOverbet) {
      const premiumPair = pairValue >= 10;
      const strongAce = hasAce && aceKicker >= 11;
      const mediumPair = pairValue >= 7;
      const decentAce = hasAce && aceKicker >= 9;
      const effectiveStack = player.chips + player.bet;
      const playablePressure = game.currentBet <= Math.max(
        game.startingStack * 0.75,
        effectiveStack * 0.75
      );
      const readStrength = clamp(game.humanImage.suspicion * mastery, 0, 1);
      const strongCallChance = clamp(
        0.32 + profile.aggression * 0.16 + readStrength * 0.9,
        0,
        0.98
      );
      const bluffCatchChance = clamp(
        (readStrength - 0.18) * 1.35 + profile.aggression * 0.08,
        0,
        0.88
      );
      if (
        playablePressure
        && (premiumPair || strongAce)
        && Math.random() < strongCallChance
      ) {
        return { action: "call" };
      }
      if (
        playablePressure
        && (mediumPair || decentAce || strongBroadway)
        && Math.random() < bluffCatchChance
      ) {
        return { action: "call" };
      }
    }
    if ((pairValue >= 12 || (hasAce && aceKicker === 13)) && stackPressure <= 0.6) {
      return { action: "call" };
    }
    return { action: "fold" };
  }

  if (game.raiseCount >= 2 || game.currentBet >= game.bigBlindAmount * 7.5) {
    const facingHumanRaise = game.lastAggressor === 0;
    if (facingHumanRaise && (pairValue >= 9 || strongBroadway) && stackPressure <= 0.35) {
      return { action: "call" };
    }
    const fourBetValue = pairValue >= 12 || (hasAce && aceKicker === 13);
    const fourBetBluff = mastery > 0.84
      && player.handBluff > 0.12
      && hasAce
      && aceKicker >= 10
      && Math.random() < player.handBluff * 0.18;
    if (canRaise && (fourBetValue || fourBetBluff) && game.currentBet < 28) {
      const target = Math.round(game.currentBet * (2.25 + profile.aggression * 0.25));
      return {
        action: "raise",
        target: clamp(
          target,
          game.bigBlindAmount * 17,
          game.bigBlindAmount * (fourBetValue ? 29 : 23)
        ),
      };
    }
    if (strength < 0.69 + (1 - mastery) * 0.07 || stackPressure > 0.36) {
      return { action: "fold" };
    }
    return { action: "call" };
  }

  const requiredStrength = 0.49
    + Math.min(game.currentBet / 55, 0.14)
    - position * 0.035 * mastery;
  if (strength < requiredStrength) return { action: "fold" };

  const premium = strength >= 0.82;
  const valueThreeBet = strength >= 0.69 - mastery * 0.025;
  const squeeze = callers >= 1 && strength >= 0.62 && mastery > 0.78;
  const threeBetBluff = mastery > 0.8
    && position > 0.45
    && Math.random() < player.handBluff * 0.28;
  const threeBet = valueThreeBet || squeeze || threeBetBluff;
  if (canRaise && threeBet) {
    const inPosition = position >= 0.55;
    const multiplier = inPosition ? 3 : 3.3;
    const squeezeExtra = callers * game.bigBlindAmount * 1.5;
    const premiumExtra = premium ? game.bigBlindAmount : 0;
    const target = Math.round(game.currentBet * multiplier + squeezeExtra + premiumExtra);
    const cap = game.bigBlindAmount * (premium ? 16 : (squeeze ? 13.5 : 12));
    return {
      action: "raise",
      target: clamp(target, game.currentBet + game.minRaise, cap),
    };
  }
  return { action: "call" };
}

function chooseBotAction(index) {
  const player = game.players[index];
  const profile = player.profile;
  const toCall = Math.max(0, game.currentBet - player.bet);
  if (game.street === "preflop") return choosePreflopBotAction(index);
  if (game.boardLockedTie) return { action: "call" };

  const equity = estimateBotEquity(index);
  const potOdds = toCall ? toCall / (game.pot + toCall) : 0;
  const stackPressure = toCall / Math.max(player.chips + toCall, 1);
  const bluffing = Math.random() < player.handBluff
    * (game.street === "river" ? 1.15 : 0.72)
    * (stackPressure > 0.25 ? 0.3 : 1);
  const canRaise = player.chips > toCall + game.minRaise;

  if (toCall > 0) {
    const safetyMargin = 0.035 + stackPressure * 0.16;
    if (!bluffing && equity < potOdds + safetyMargin) {
      return { action: "fold" };
    }
    if (stackPressure > 0.42 && equity < 0.78 && !bluffing) {
      return { action: "fold" };
    }
    const strongThreshold = 0.72 - profile.aggression * 0.08;
    if (canRaise && (equity > strongThreshold || bluffing)) {
      const size = Math.max(
        game.minRaise,
        Math.round(game.pot * (0.3 + profile.aggression * 0.24))
      );
      let target = game.currentBet + size;
      const normalCommitmentCap = player.bet + Math.max(
        game.bigBlindAmount * 3,
        Math.floor(player.chips * 0.28)
      );
      if (equity < 0.84) target = Math.min(target, normalCommitmentCap);
      if (target >= player.bet + player.chips && equity < 0.9) return { action: "call" };
      return { action: "raise", target };
    }
    return { action: "call" };
  }

  const valueThreshold = 0.64 - profile.aggression * 0.07;
  if (canRaise && (equity > valueThreshold || bluffing)) {
    const target = Math.max(
      game.bigBlindAmount,
      Math.round(game.pot * (0.32 + profile.aggression * 0.22))
    );
    return { action: "raise", target };
  }
  return { action: "call" };
}

function scheduleBotIfNeeded() {
  clearTimeout(game.timer);
  const player = game.players[game.currentActor];
  if (!player || player.isHuman || game.complete) return;
  const toCall = Math.max(0, game.currentBet - player.bet);
  const stackPressure = toCall / Math.max(player.chips + toCall, 1);
  const potPressure = toCall / Math.max(game.pot, 1);
  const baseDelay = 850 + Math.random() * 650;
  const decisionDelay = Math.min(
    4500,
    baseDelay + stackPressure * 2600 + Math.min(potPressure, 1) * 1000
  );
  game.message = `${playerDisplayName(player)} 思考中... / Thinking...`;
  renderGame();
  game.timer = window.setTimeout(() => {
    const choice = chooseBotAction(game.currentActor);
    performAction(game.currentActor, choice.action, choice.target || 0);
  }, decisionDelay);
}

function awardUncontested() {
  const winner = remainingPlayers()[0];
  winner.player.chips += game.pot;
  game.winners = [winner.index];
  game.message = `${playerDisplayName(winner.player)} ${gameText("wins")} · ${gameText("everyoneFolded")}`;
  addLog(`${playerDisplayName(winner.player)} ${gameText("wins")} ${game.pot}`);
  finishHand();
}

function showdown() {
  game.street = "showdown";
  const contenders = remainingPlayers();
  let best = null;
  let winnerIndexes = [];

  contenders.forEach(({ player, index }) => {
    const rank = evaluateBestRank([...player.hand, ...game.community]);
    if (!best || compareRank(rank, best) > 0) {
      best = rank;
      winnerIndexes = [index];
    } else if (compareRank(rank, best) === 0) {
      winnerIndexes.push(index);
    }
  });

  const share = Math.floor(game.pot / winnerIndexes.length);
  let remainder = game.pot - share * winnerIndexes.length;
  winnerIndexes.forEach((index) => {
    game.players[index].chips += share + (remainder > 0 ? 1 : 0);
    remainder -= remainder > 0 ? 1 : 0;
  });
  game.winners = winnerIndexes;

  if (game.humanOverbetThisHand && !game.players[0].folded) {
    const shownStrength = preflopStrength(game.players[0].hand);
    if (shownStrength < 0.48) {
      game.humanImage.observedBluffs += 1;
      game.humanImage.suspicion = clamp(game.humanImage.suspicion + 0.3, 0, 1);
    } else if (shownStrength >= 0.72) {
      game.humanImage.suspicion = clamp(game.humanImage.suspicion - 0.14, 0, 1);
    }
  }

  const names = winnerIndexes.map((index) => playerDisplayName(game.players[index])).join(" / ");
  const handName = gameText(handTypes.find((type) => type.rank === best[0]).key);
  game.message = winnerIndexes.length > 1
    ? `${names} ${gameText("splitPot")} · ${handName}`
    : `${names} ${gameText("wins")} · ${handName}`;
  addLog(`${game.message} · ${game.pot}`);
  finishHand();
}

function finishHand() {
  game.complete = true;
  game.currentActor = -1;
  if (game.players[0].chips <= 0) {
    game.matchResult = "loss";
    game.message = "你破产了 / You are bankrupt";
  } else if (game.players.slice(1).every((player) => player.chips <= 0)) {
    game.matchResult = "victory";
    game.message = "你赢了 / Victory";
  }
  renderGame();
}

function seatPositions(count) {
  const compact = typeof window !== "undefined"
    && window.matchMedia("(max-width: 520px)").matches;
  const map = compact ? {
    2: [[50, 92], [50, 8]],
    3: [[50, 92], [10, 30], [90, 30]],
    4: [[50, 92], [8, 66], [50, 8], [92, 66]],
    5: [[50, 92], [8, 74], [13, 28], [87, 28], [92, 74]],
    6: [[50, 92], [8, 76], [8, 30], [50, 8], [92, 30], [92, 76]],
    7: [[50, 92], [8, 78], [8, 35], [31, 9], [69, 9], [92, 35], [92, 78]],
    8: [[50, 92], [8, 79], [8, 39], [28, 10], [50, 7], [72, 10], [92, 39], [92, 79]],
  } : {
    2: [[50, 91], [50, 8]],
    3: [[50, 91], [12, 34], [88, 34]],
    4: [[50, 91], [10, 50], [50, 8], [90, 50]],
    5: [[50, 91], [9, 61], [23, 12], [77, 12], [91, 61]],
    6: [[50, 91], [9, 66], [15, 22], [50, 8], [85, 22], [91, 66]],
    7: [[50, 91], [9, 70], [9, 31], [34, 8], [66, 8], [91, 31], [91, 70]],
    8: [[50, 91], [9, 72], [8, 38], [25, 10], [50, 7], [75, 10], [92, 38], [91, 72]],
  };
  return map[count];
}

function renderGame() {
  const playersLayer = document.querySelector("#playersLayer");
  const positions = seatPositions(game.players.length);
  const reveal = game.complete && game.street === "showdown";

  playersLayer.innerHTML = game.players.map((player, index) => {
    const [left, top] = positions[index];
    const classes = [
      "player-seat",
      index === game.currentActor ? "current" : "",
      player.folded ? "folded" : "",
      player.foldAnimation ? "folding" : "",
      game.winners.includes(index) ? "winner" : "",
    ].filter(Boolean).join(" ");
    const hideCards = !player.isHuman && !(player.showCards || (reveal && !player.folded));
    const cards = player.hand.length
      ? player.hand.map((card, cardIndex) => miniCardMarkup(
        card,
        hideCards,
        cardIndex === player.dealPulse ? "dealt-card" : ""
      )).join("")
      : "";
    const badges = [
      index === game.dealer ? `<span class="dealer-button">D · 庄家 / Dealer</span>` : "",
      index === game.smallBlind
        ? `<span class="blind-button">SB ${game.smallBlindAmount} · 小盲 / Small Blind</span>`
        : "",
      index === game.bigBlind
        ? `<span class="blind-button">BB ${game.bigBlindAmount} · 大盲 / Big Blind</span>`
        : "",
    ].join("");
    const dealX = Math.round((50 - left) * 8);
    const dealY = Math.round((50 - top) * 4.5);
    const foldX = Math.round((50 - left) * 5.2);
    const foldY = Math.round((55 - top) * 3.2);
    return `
      <div class="${classes}" style="left:${left}%;top:${top}%;--deal-x:${dealX}px;--deal-y:${dealY}px;--fold-x:${foldX}px;--fold-y:${foldY}px">
        <div class="seat-head">
          <span class="seat-name">${playerDisplayName(player)}</span>
        </div>
        <span class="seat-badges">${badges}</span>
        <div class="seat-cards">${cards}</div>
        <div class="seat-foot">
          <span class="seat-stack">${formatNumber(player.chips)}</span>
          <span class="seat-bet">${player.bet ? `+${formatNumber(player.bet)}` : ""}</span>
        </div>
      </div>
    `;
  }).join("");

  document.querySelector("#communityCards").innerHTML = Array.from({ length: 5 }, (_, index) =>
    playingCardMarkup(
      game.community[index],
      index === game.communityPulse ? "board-dealt-card" : ""
    )
  ).join("");
  const dealLayer = document.querySelector("#dealAnimationLayer");
  dealLayer.className = `deal-animation-layer ${game.animationPhase ? `active ${game.animationPhase}` : ""}`;
  document.querySelector(".muck-pile").classList.toggle(
    "active",
    game.players.some((player) => player.folded && player.hand.length)
  );
  document.querySelector("#dealAnimationText").textContent = game.animationPhase === "shuffle"
    ? "洗牌 / Shuffle"
    : game.animationPhase === "burn"
      ? "烧牌 / Burn"
      : game.animationPhase
        ? "发牌 / Deal"
        : "";
  document.querySelector("#potValue").textContent = formatNumber(game.pot);
  document.querySelector("#tableMessage").textContent = game.message;
  document.querySelector("#handNumber").textContent = `#${game.handNumber}`;
  document.querySelector("#streetLabel").textContent = gameText(game.street).toUpperCase();
  const blindLevelLabel = document.querySelector("#blindLevelLabel");
  if (game.blindInterval === 0) {
    blindLevelLabel.textContent =
      `盲注 / Blinds ${game.smallBlindAmount} / ${game.bigBlindAmount} · 固定 / Fixed`;
  } else if (game.blindLevel === BLIND_LEVELS.length - 1) {
    blindLevelLabel.textContent =
      `盲注 / Blinds ${game.smallBlindAmount} / ${game.bigBlindAmount} · 最高级 / Max`;
  } else {
    const handsIntoLevel = (game.handNumber - 1) % game.blindInterval;
    const handsUntilRise = game.blindInterval - handsIntoLevel;
    blindLevelLabel.textContent =
      `盲注 / Blinds ${game.smallBlindAmount} / ${game.bigBlindAmount} · 下次 ${handsUntilRise} 手 / Next in ${handsUntilRise}`;
  }

  const hero = game.players[0];
  if (hero) {
    document.querySelector("#heroCards").innerHTML = hero.hand.map((card) => playingCardMarkup(card)).join("");
    document.querySelector("#heroStack").textContent = `${formatNumber(hero.chips)} ${gameText("chips")}`;
    const heroType = hero.hand.length && game.community.length >= 3
      ? handTypeKey([...hero.hand, ...game.community])
      : "noHand";
    document.querySelector("#heroHandName").textContent = gameText(heroType);
  }

  const actionPanel = document.querySelector("#actionPanel");
  const heroTurn = game.currentActor === 0 && !game.complete && !game.dealing;
  actionPanel.classList.toggle("waiting", !heroTurn);
  const toCall = hero ? Math.max(0, game.currentBet - hero.bet) : 0;
  const checkCallButton = document.querySelector("#checkCallBtn");
  checkCallButton.textContent = toCall
    ? `${gameText("call")} ${Math.min(toCall, hero.chips)}`
    : gameText("check");

  const raiseInput = document.querySelector("#raiseInput");
  if (heroTurn) {
    const minimum = game.currentBet === 0
      ? game.bigBlindAmount
      : game.currentBet + game.minRaise;
    const maximum = hero.bet + hero.chips;
    raiseInput.min = Math.min(minimum, maximum);
    raiseInput.max = maximum;
    raiseInput.value = Math.min(maximum, Math.max(minimum, Number(raiseInput.value) || minimum));
    document.querySelector("#raiseBtn").disabled = maximum <= game.currentBet;
  }

  document.querySelector("#logEntries").innerHTML = game.log.map((entry) =>
    `<div class="log-entry">${entry}</div>`
  ).join("");
  document.querySelector("#nextHandBtn").disabled = !game.complete || !hero || Boolean(game.matchResult);

  const resultNotice = document.querySelector("#matchResultNotice");
  resultNotice.hidden = !game.matchResult;
  resultNotice.classList.toggle("loss", game.matchResult === "loss");
  if (game.matchResult) {
    const victory = game.matchResult === "victory";
    document.querySelector("#matchResultIcon").textContent = victory ? "✓" : "!";
    document.querySelector("#matchResultTitle").textContent = victory
      ? "你赢了 / Victory"
      : "你破产了 / You are bankrupt";
    document.querySelector("#matchResultDetail").textContent = victory
      ? "其他所有玩家都已失去全部筹码，你赢得了这场牌局。 / All other players are out of chips. You won the table."
      : "你的筹码已经归零，这场牌局结束。 / You are out of chips. This game is over.";
  }
}

document.querySelector("#startGameBtn").addEventListener("click", startGame);
document.querySelector("#nextHandBtn").addEventListener("click", beginHand);

function returnToSetup() {
  clearTimeout(game.timer);
  game.dealToken += 1;
  game.dealing = false;
  game.animationPhase = "";
  game.players = [];
  game.matchResult = null;
  document.querySelector("#pokerRoom").hidden = true;
  document.querySelector("#gameSetup").hidden = false;
}

document.querySelector("#backToSetupBtn").addEventListener("click", returnToSetup);
document.querySelector("#resultBackBtn").addEventListener("click", returnToSetup);

document.querySelector("#foldBtn").addEventListener("click", () => performAction(0, "fold"));
document.querySelector("#checkCallBtn").addEventListener("click", () => performAction(0, "call"));
document.querySelector("#raiseBtn").addEventListener("click", () => {
  performAction(0, "raise", Number(document.querySelector("#raiseInput").value));
});

applyLanguage();
renderCalculator();
renderPotOdds();
