const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { execFile } = require("child_process");

const PORT = Number(process.env.PORT) || 8002;
const ROOT = __dirname;
const BLIND_LEVELS = [[1, 2], [2, 4], [3, 6], [5, 10], [10, 20], [15, 30], [20, 40]];
const rooms = new Map();
const clients = new Set();
const FAMILIAR_BOT_NAMES = [
  "Connie", "Colin", "Angela", "Stephan", "Zoey", "William", "Tim", "Gary", "Alison",
];
const COMMON_BOT_NAMES = [
  "James", "Emma", "Michael", "Olivia", "Daniel", "Sophia", "David", "Emily",
  "Chris", "Anna", "Alex", "Sarah", "Ryan", "Jessica", "Matthew", "Rachel",
  "Kevin", "Laura", "Andrew", "Megan",
];

const ranks = [
  ["A", 14], ["K", 13], ["Q", 12], ["J", 11], ["10", 10], ["9", 9], ["8", 8],
  ["7", 7], ["6", 6], ["5", 5], ["4", 4], ["3", 3], ["2", 2],
];
const suits = [
  ["spades", "♠", "black"],
  ["hearts", "♥", "red"],
  ["diamonds", "♦", "red"],
  ["clubs", "♣", "black"],
];
const fullDeck = suits.flatMap(([suit, suitLabel, color]) =>
  ranks.map(([rank, value]) => ({ id: `${rank}-${suit}`, rank, value, suit, suitLabel, color }))
);

function combinations(items, size, start = 0, prefix = [], result = []) {
  if (size === 0) {
    result.push(prefix);
    return result;
  }
  for (let i = start; i <= items.length - size; i += 1) {
    combinations(items, size - 1, i + 1, [...prefix, items[i]], result);
  }
  return result;
}

function straightHigh(values) {
  const unique = [...new Set(values)].sort((a, b) => b - a);
  if (unique.includes(14)) unique.push(1);
  for (let i = 0; i <= unique.length - 5; i += 1) {
    if (unique[i] - unique[i + 4] === 4) return unique[i] === 1 ? 5 : unique[i];
  }
  return 0;
}

function evaluateFive(cards) {
  const values = cards.map((card) => card.value).sort((a, b) => b - a);
  const counts = new Map();
  cards.forEach((card) => counts.set(card.value, (counts.get(card.value) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const flush = new Set(cards.map((card) => card.suit)).size === 1;
  const straight = straightHigh(values);
  if (flush && straight === 14) return [9, 14];
  if (flush && straight) return [8, straight];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1] && groups[1][1] === 2) {
    return [6, groups[0][0], groups[1][0]];
  }
  if (flush) return [5, ...values];
  if (straight) return [4, straight];
  if (groups[0][1] === 3) {
    return [3, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  }
  if (groups[0][1] === 2 && groups[1] && groups[1][1] === 2) {
    const pairs = groups.slice(0, 2).map(([value]) => value).sort((a, b) => b - a);
    return [2, ...pairs, groups[2][0]];
  }
  if (groups[0][1] === 2) {
    return [1, groups[0][0], ...groups.slice(1).map(([value]) => value).sort((a, b) => b - a)];
  }
  return [0, ...values];
}

function compareRank(left, right) {
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference;
  }
  return 0;
}

function bestRank(cards) {
  return combinations(cards, 5).reduce((best, five) => {
    const rank = evaluateFive(five);
    return !best || compareRank(rank, best) > 0 ? rank : best;
  }, null);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").slice(0, 18);
}

function roomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 5 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
  } while (rooms.has(code));
  return code;
}

function makeRoom(host, config) {
  const room = {
    code: roomCode(),
    hostId: host.clientId,
    maxPlayers: Math.max(2, Math.min(8, Number(config.maxPlayers) || 4)),
    startingStack: [100, 150, 200].includes(Number(config.startingStack))
      ? Number(config.startingStack)
      : 150,
    blindInterval: [0, 5, 10].includes(Number(config.blindInterval))
      ? Number(config.blindInterval)
      : 10,
    players: [],
    status: "lobby",
    handNumber: 0,
    dealer: -1,
    smallBlind: -1,
    bigBlind: -1,
    blindLevel: 0,
    smallBlindAmount: 1,
    bigBlindAmount: 2,
    street: "preflop",
    board: [],
    burned: [],
    deck: [],
    pot: 0,
    currentBet: 0,
    minRaise: 2,
    raiseCount: 0,
    lastAggressor: -1,
    playerReads: {},
    actor: -1,
    acted: new Set(),
    message: "等待玩家 / Waiting for players",
    log: [],
    winners: [],
    botSerial: 0,
    botTimer: null,
  };
  rooms.set(room.code, room);
  return room;
}

function addBot(room) {
  if (room.status !== "lobby") throw new Error("Only in lobby / 只能在等待室添加机器人");
  if (room.players.length >= room.maxPlayers) throw new Error("Room is full / 房间已满");
  const usedNames = new Set(room.players.map((player) => player.name));
  const familiar = FAMILIAR_BOT_NAMES.filter((candidate) => !usedNames.has(candidate));
  const common = COMMON_BOT_NAMES.filter((candidate) => !usedNames.has(candidate));
  const preferFamiliar = Math.random() < 0.4;
  const source = preferFamiliar
    ? (familiar.length ? familiar : common)
    : (common.length ? common : familiar);
  const name = source.length
    ? source[crypto.randomInt(source.length)]
    : `Bot ${room.botSerial + 1}`;
  room.botSerial += 1;
  room.players.push({
    clientId: `bot-${room.code}-${room.botSerial}`,
    name,
    isBot: true,
    chips: room.startingStack,
    hand: [],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    connected: true,
    socket: null,
    aggression: 0.38 + Math.random() * 0.42,
    looseness: 0.18 + Math.random() * 0.28,
    mastery: 0.78 + Math.random() * 0.2,
    handBluff: 0,
  });
}

function updatePlayerRead(room, index, action, target = 0) {
  const player = room.players[index];
  if (!player || player.isBot) return;
  const read = room.playerReads[player.clientId] || {
    largeRaises: 0,
    shownBluffs: 0,
    suspicion: 0,
  };
  if (action === "raise") {
    const bigRaise = target >= Math.max(room.bigBlindAmount * 12, room.startingStack * 0.28);
    const potRaise = target >= Math.max(room.currentBet + room.pot * 0.75, room.bigBlindAmount * 8);
    if (bigRaise || potRaise) {
      read.largeRaises += 1;
      read.suspicion = clamp(read.suspicion + (read.largeRaises <= 2 ? 0.08 : 0.18), 0, 1);
    } else {
      read.suspicion *= 0.94;
    }
  }
  room.playerReads[player.clientId] = read;
}

function removeBot(room) {
  if (room.status !== "lobby") throw new Error("Only in lobby / 只能在等待室移除机器人");
  const index = room.players.map((player) => player.isBot).lastIndexOf(true);
  if (index < 0) throw new Error("No bot to remove / 没有机器人可移除");
  room.players.splice(index, 1);
}

function addPlayer(room, client, name) {
  const existing = room.players.find((player) => player.clientId === client.clientId);
  if (existing) {
    existing.connected = true;
    existing.socket = client;
    existing.name = cleanName(name) || existing.name;
    return existing;
  }
  if (room.status !== "lobby") throw new Error("牌局已经开始 / Game already started");
  if (room.players.length >= room.maxPlayers) throw new Error("房间已满 / Room is full");
  const normalized = cleanName(name);
  if (!normalized) throw new Error("请输入名字 / Enter your name");
  const player = {
    clientId: client.clientId,
    name: normalized,
    chips: room.startingStack,
    hand: [],
    bet: 0,
    totalBet: 0,
    folded: false,
    allIn: false,
    connected: true,
    socket: client,
  };
  room.players.push(player);
  return player;
}

function nextIndex(room, start, predicate) {
  for (let offset = 1; offset <= room.players.length; offset += 1) {
    const index = (start + offset) % room.players.length;
    if (predicate(room.players[index], index)) return index;
  }
  return -1;
}

function livePlayers(room) {
  return room.players.filter((player) => player.chips > 0);
}

function inHand(player) {
  return !player.folded && (player.chips > 0 || player.totalBet > 0);
}

function actionable(player) {
  return inHand(player) && !player.allIn && player.chips > 0;
}

function contribute(room, player, amount) {
  const paid = Math.max(0, Math.min(player.chips, Math.floor(amount)));
  player.chips -= paid;
  player.bet += paid;
  player.totalBet += paid;
  room.pot += paid;
  if (player.chips === 0) player.allIn = true;
  return paid;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function addLog(room, text) {
  room.log.unshift(text);
  room.log = room.log.slice(0, 18);
}

function postBlind(room, index, amount, label) {
  const player = room.players[index];
  contribute(room, player, amount);
  addLog(room, `${player.name} ${label} ${Math.min(amount, player.bet)}`);
}

function preflopStrength(hand) {
  if (!hand || hand.length !== 2) return 0;
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

function estimateBotEquity(room, index, trials = 80) {
  const player = room.players[index];
  const opponents = Math.max(1, remaining(room).length - 1);
  if (room.board.length === 0) {
    return clamp(preflopStrength(player.hand) - (opponents - 1) * 0.055, 0.04, 0.9);
  }

  const knownIds = new Set([...player.hand, ...room.board].map((card) => card.id));
  const unseen = fullDeck.filter((card) => !knownIds.has(card.id));
  let share = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const sample = shuffle(unseen);
    let cursor = 0;
    const board = [...room.board, ...sample.slice(cursor, cursor + (5 - room.board.length))];
    cursor += 5 - room.board.length;
    const heroRank = bestRank([...player.hand, ...board]);
    let lost = false;
    let ties = 0;

    for (let opponent = 0; opponent < opponents; opponent += 1) {
      const opponentHand = sample.slice(cursor, cursor + 2);
      cursor += 2;
      const comparison = compareRank(heroRank, bestRank([...opponentHand, ...board]));
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

function preflopPositionScore(room, index) {
  const liveIndexes = room.players
    .map((player, playerIndex) => ({ player, playerIndex }))
    .filter(({ player }) => player.chips > 0 && !player.folded)
    .map(({ playerIndex }) => playerIndex);
  const dealerPosition = liveIndexes.indexOf(room.dealer);
  const playerPosition = liveIndexes.indexOf(index);
  if (dealerPosition < 0 || playerPosition < 0 || liveIndexes.length < 2) return 0.5;
  const distanceFromDealer = (playerPosition - dealerPosition + liveIndexes.length) % liveIndexes.length;
  return 1 - distanceFromDealer / liveIndexes.length;
}

function handTexture(cards) {
  const suitCounts = new Map();
  const values = cards.map((card) => card.value);
  cards.forEach((card) => suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1));
  const uniqueValues = [...new Set(values)];
  if (uniqueValues.includes(14)) uniqueValues.push(1);
  let straightOuts = 0;
  for (let low = 1; low <= 10; low += 1) {
    const present = [low, low + 1, low + 2, low + 3, low + 4]
      .filter((value) => uniqueValues.includes(value)).length;
    if (present === 4) straightOuts += 1;
    if (present === 3) straightOuts += 0.35;
  }
  const maxSuit = Math.max(0, ...suitCounts.values());
  return {
    flushDraw: maxSuit === 4,
    strongFlushDraw: maxSuit >= 4,
    straightDraw: straightOuts >= 1,
    backdoorStraight: straightOuts > 0 && straightOuts < 1,
    drawScore: (maxSuit === 4 ? 0.18 : 0) + Math.min(straightOuts * 0.1, 0.22),
  };
}

function boardTexture(board) {
  if (board.length < 3) return { wetness: 0, paired: false, flushPossible: false, straightPossible: false };
  const suitCounts = new Map();
  const valueCounts = new Map();
  board.forEach((card) => {
    suitCounts.set(card.suit, (suitCounts.get(card.suit) || 0) + 1);
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  });
  const values = [...new Set(board.map((card) => card.value))];
  if (values.includes(14)) values.push(1);
  let connected = 0;
  for (let low = 1; low <= 10; low += 1) {
    const present = [low, low + 1, low + 2, low + 3, low + 4]
      .filter((value) => values.includes(value)).length;
    connected = Math.max(connected, present);
  }
  const maxSuit = Math.max(...suitCounts.values());
  const paired = [...valueCounts.values()].some((count) => count >= 2);
  const flushPossible = maxSuit >= 3;
  const straightPossible = connected >= 3;
  return {
    paired,
    flushPossible,
    straightPossible,
    wetness: (flushPossible ? 0.16 : 0) + (straightPossible ? 0.16 : 0) + (paired ? 0.07 : 0),
  };
}

function boardForcesTie(board) {
  if (board.length !== 5) return false;
  const boardRank = evaluateFive(board);
  const boardIds = new Set(board.map((card) => card.id));
  const available = fullDeck.filter((card) => !boardIds.has(card.id));
  for (const hand of combinations(available, 2)) {
    if (compareRank(bestRank([...board, ...hand]), boardRank) > 0) return false;
  }
  return true;
}

function readAgainstAggressor(room) {
  const aggressor = room.players[room.lastAggressor];
  if (!aggressor || aggressor.isBot) return 0;
  return room.playerReads[aggressor.clientId]?.suspicion || 0;
}

function choosePreflopBotAction(room, index) {
  const player = room.players[index];
  const toCall = Math.max(0, room.currentBet - player.bet);
  const strength = preflopStrength(player.hand);
  const values = player.hand.map((card) => card.value).sort((a, b) => b - a);
  const isPair = values[0] === values[1];
  const pairValue = isPair ? values[0] : 0;
  const hasAce = values[0] === 14;
  const aceKicker = hasAce ? values[1] : 0;
  const strongBroadway = (hasAce && aceKicker >= 11) || (values[0] === 13 && values[1] === 12);
  const stackPressure = toCall / Math.max(player.chips + toCall, 1);
  const canRaise = player.chips > toCall + room.minRaise;
  const unopened = room.currentBet <= room.bigBlindAmount;
  const position = preflopPositionScore(room, index);
  const mastery = player.mastery || 0.82;
  const aggression = player.aggression || 0.55;
  const callers = room.players.filter((other, otherIndex) => (
    otherIndex !== index
    && otherIndex !== room.lastAggressor
    && !other.folded
    && other.bet === room.currentBet
    && other.bet > room.bigBlindAmount
  )).length;

  if (unopened) {
    const positionAdjustment = (position - 0.5) * 0.12 * mastery;
    const openThreshold = 0.45 - aggression * 0.06 - positionAdjustment;
    const occasionalOpenBluff = Math.random() < (player.handBluff || 0.08) * (0.16 + position * 0.3) * mastery;
    if (strength < openThreshold && !occasionalOpenBluff) {
      return toCall > 0 ? { action: "fold" } : { action: "call" };
    }
    if (canRaise) {
      const premiumOpen = pairValue >= 12 || (hasAce && aceKicker >= 13);
      const strongOpen = pairValue >= 9 || strongBroadway;
      const pressureChance = premiumOpen
        ? 0.16 + aggression * 0.2
        : strongOpen
          ? 0.035 + aggression * 0.055
          : 0;
      if (mastery > 0.78 && Math.random() < pressureChance) {
        const target = premiumOpen
          ? room.bigBlindAmount * (6 + crypto.randomInt(5))
          : room.bigBlindAmount * (5 + crypto.randomInt(3));
        return { action: "raise", target };
      }
      const openTarget = room.bigBlindAmount * (2.5 + aggression * 0.8)
        + Math.min(callers, 2) * room.bigBlindAmount;
      return {
        action: "raise",
        target: clamp(
          Math.round(openTarget),
          Math.ceil(room.bigBlindAmount * 2.5),
          room.bigBlindAmount * 4.5
        ),
      };
    }
    return { action: "call" };
  }

  if (room.currentBet >= room.bigBlindAmount * 15) {
    if ((pairValue >= 10 || (hasAce && aceKicker >= 11)) && stackPressure <= 0.62) {
      return { action: "call" };
    }
    if ((pairValue >= 7 || (hasAce && aceKicker >= 9) || strongBroadway)
      && stackPressure <= 0.38
      && Math.random() < 0.42 + aggression * 0.16) {
      return { action: "call" };
    }
    return { action: "fold" };
  }

  if (room.raiseCount >= 2 || room.currentBet >= room.bigBlindAmount * 7.5) {
    const fourBetValue = pairValue >= 12 || (hasAce && aceKicker === 13);
    const fourBetBluff = mastery > 0.84
      && (player.handBluff || 0) > 0.12
      && hasAce
      && aceKicker >= 10
      && Math.random() < (player.handBluff || 0) * 0.16;
    if (canRaise && (fourBetValue || fourBetBluff)) {
      const target = Math.round(room.currentBet * (2.25 + aggression * 0.25));
      return {
        action: "raise",
        target: clamp(
          target,
          room.currentBet + room.minRaise,
          room.bigBlindAmount * (fourBetValue ? 29 : 23)
        ),
      };
    }
    if (strength < 0.69 + (1 - mastery) * 0.07 || stackPressure > 0.36) {
      return { action: "fold" };
    }
    return { action: "call" };
  }

  const requiredStrength = 0.49
    + Math.min(room.currentBet / Math.max(room.bigBlindAmount * 28, 1), 0.14)
    - position * 0.035 * mastery;
  if (strength < requiredStrength) return { action: "fold" };

  const premium = strength >= 0.82;
  const valueThreeBet = strength >= 0.69 - mastery * 0.025;
  const squeeze = callers >= 1 && strength >= 0.62 && mastery > 0.78;
  const threeBetBluff = mastery > 0.8
    && position > 0.45
    && Math.random() < (player.handBluff || 0.08) * 0.25;
  if (canRaise && (valueThreeBet || squeeze || threeBetBluff)) {
    const inPosition = position >= 0.55;
    const multiplier = inPosition ? 3 : 3.3;
    const squeezeExtra = callers * room.bigBlindAmount * 1.5;
    const premiumExtra = premium ? room.bigBlindAmount : 0;
    const target = Math.round(room.currentBet * multiplier + squeezeExtra + premiumExtra);
    const cap = room.bigBlindAmount * (premium ? 16 : (squeeze ? 13.5 : 12));
    return {
      action: "raise",
      target: clamp(target, room.currentBet + room.minRaise, cap),
    };
  }
  return { action: "call" };
}

function chooseBotAction(room, index) {
  const player = room.players[index];
  const toCall = Math.max(0, room.currentBet - player.bet);
  if (room.street === "preflop") return choosePreflopBotAction(room, index);
  if (boardForcesTie(room.board)) return { action: "call" };

  const texture = handTexture([...player.hand, ...room.board]);
  const board = boardTexture(room.board);
  const readStrength = readAgainstAggressor(room) * (player.mastery || 0.82);
  const equity = clamp(
    estimateBotEquity(room, index, room.street === "river" ? 120 : 140) + texture.drawScore * 0.28,
    0,
    0.98
  );
  const potOdds = toCall ? toCall / Math.max(room.pot + toCall, 1) : 0;
  const stackPressure = toCall / Math.max(player.chips + toCall, 1);
  const aggression = player.aggression || 0.55;
  const bluffing = Math.random() < (player.handBluff || 0.08)
    * (room.street === "river" ? 1.05 : 0.7)
    * (texture.strongFlushDraw || texture.straightDraw ? 1.55 : 1)
    * (board.paired ? 0.78 : 1)
    * (stackPressure > 0.25 ? 0.32 : 1);
  const canRaise = player.chips > toCall + room.minRaise;

  if (toCall > 0) {
    const safetyMargin = 0.035 + stackPressure * 0.16 + board.wetness * 0.12 - readStrength * 0.12;
    if (!bluffing && equity < potOdds + safetyMargin) {
      return { action: "fold" };
    }
    if (stackPressure > 0.42 && equity < 0.78 - readStrength * 0.18 && !bluffing) {
      return { action: "fold" };
    }
    const strongThreshold = 0.72 - aggression * 0.08 - texture.drawScore * 0.08;
    if (canRaise && (equity > strongThreshold || bluffing)) {
      const protection = board.wetness > 0.22 && equity > 0.68 ? 0.12 : 0;
      const size = Math.max(
        room.minRaise,
        Math.round(room.pot * (0.32 + aggression * 0.24 + protection))
      );
      let target = room.currentBet + size;
      const normalCommitmentCap = player.bet + Math.max(
        room.bigBlindAmount * 3,
        Math.floor(player.chips * 0.28)
      );
      if (equity < 0.84) target = Math.min(target, normalCommitmentCap);
      if (target >= player.bet + player.chips && equity < 0.9) return { action: "call" };
      return { action: "raise", target };
    }
    return { action: "call" };
  }

  const valueThreshold = 0.64 - aggression * 0.07 - texture.drawScore * 0.08;
  if (canRaise && (equity > valueThreshold || bluffing)) {
    const protection = board.wetness > 0.22 && equity > 0.68 ? 0.12 : 0;
    const target = Math.max(
      room.bigBlindAmount,
      Math.round(room.pot * (0.32 + aggression * 0.22 + protection))
    );
    return { action: "raise", target };
  }
  return { action: "call" };
}

function scheduleBot(room) {
  clearTimeout(room.botTimer);
  if (room.status !== "playing" || room.actor < 0) return;
  const player = room.players[room.actor];
  if (!player || !player.isBot || !actionable(player)) return;
  const delay = 650 + Math.floor(Math.random() * 850);
  room.botTimer = setTimeout(() => {
    if (room.status !== "playing" || room.players[room.actor] !== player) return;
    try {
      const decision = chooseBotAction(room, room.actor);
      performAction(room, room.actor, decision.action, decision.target);
    } catch {
      try {
        performAction(room, room.actor, "call");
      } catch {
        if (room.status === "playing" && room.players[room.actor] === player) {
          performAction(room, room.actor, "fold");
        }
      }
    }
  }, delay);
}

function beginHand(room) {
  const active = livePlayers(room);
  if (active.length < 2) {
    room.status = "finished";
    room.message = "牌局结束 / Match finished";
    broadcast(room);
    return;
  }

  room.status = "playing";
  room.handNumber += 1;
  room.blindLevel = room.blindInterval
    ? Math.min(Math.floor((room.handNumber - 1) / room.blindInterval), BLIND_LEVELS.length - 1)
    : 0;
  [room.smallBlindAmount, room.bigBlindAmount] = BLIND_LEVELS[room.blindLevel];
  room.street = "preflop";
  room.board = [];
  room.burned = [];
  room.deck = shuffle(fullDeck);
  room.pot = 0;
  room.currentBet = 0;
  room.minRaise = room.bigBlindAmount;
  room.raiseCount = 0;
  room.lastAggressor = -1;
  room.actor = -1;
  room.acted = new Set();
  room.winners = [];
  room.log = [];
  room.players.forEach((player) => {
    player.hand = [];
    player.bet = 0;
    player.totalBet = 0;
    player.folded = player.chips <= 0;
    player.allIn = false;
    if (player.isBot) {
      player.handBluff = clamp(
        (player.looseness || 0.25) * (0.45 + Math.random() * 0.9),
        0.02,
        0.34
      );
    }
  });

  room.dealer = nextIndex(room, room.dealer, (player) => player.chips > 0);
  const headsUp = active.length === 2;
  room.smallBlind = headsUp
    ? room.dealer
    : nextIndex(room, room.dealer, (player) => player.chips > 0);
  room.bigBlind = nextIndex(room, room.smallBlind, (player) => player.chips > 0);

  const dealStart = nextIndex(room, room.dealer, (player) => player.chips > 0);
  for (let round = 0; round < 2; round += 1) {
    let index = dealStart;
    do {
      if (room.players[index].chips > 0) room.players[index].hand.push(room.deck.pop());
      index = (index + 1) % room.players.length;
    } while (index !== dealStart);
  }

  postBlind(room, room.smallBlind, room.smallBlindAmount, "下小盲 / posts SB");
  postBlind(room, room.bigBlind, room.bigBlindAmount, "下大盲 / posts BB");
  room.currentBet = Math.max(room.players[room.smallBlind].bet, room.players[room.bigBlind].bet);
  room.actor = nextIndex(room, room.bigBlind, actionable);
  room.message = `第 ${room.handNumber} 手 / Hand ${room.handNumber}`;
  skipDisconnectedActor(room);
  broadcast(room);
  scheduleBot(room);
}

function bettingComplete(room) {
  const active = room.players.filter(actionable);
  if (active.length === 0) return true;
  return active.every((player) => room.acted.has(player.clientId) && player.bet === room.currentBet);
}

function remaining(room) {
  return room.players.map((player, index) => ({ player, index })).filter(({ player }) => inHand(player));
}

function nextActor(room, start) {
  return nextIndex(room, start, (player) => (
    actionable(player) && (!room.acted.has(player.clientId) || player.bet !== room.currentBet)
  ));
}

function performAction(room, index, action, target) {
  if (room.status !== "playing" || room.actor !== index) throw new Error("还没轮到你 / Not your turn");
  const player = room.players[index];
  const toCall = Math.max(0, room.currentBet - player.bet);

  if (action === "fold") {
    player.folded = true;
    room.acted.add(player.clientId);
    addLog(room, `${player.name} 弃牌 / folds`);
  } else if (action === "call") {
    const paid = contribute(room, player, toCall);
    room.acted.add(player.clientId);
    addLog(room, paid ? `${player.name} 跟注 ${paid} / calls` : `${player.name} 过牌 / checks`);
  } else if (action === "raise") {
    updatePlayerRead(room, index, action, target);
    const maximum = player.bet + player.chips;
    const minimum = room.currentBet === 0
      ? room.bigBlindAmount
      : room.currentBet + room.minRaise;
    const requested = Math.floor(Number(target));
    if (!Number.isFinite(requested) || requested <= room.currentBet) {
      throw new Error("加注金额无效 / Invalid raise");
    }
    const raiseTarget = Math.min(requested, maximum);
    if (raiseTarget < minimum && raiseTarget !== maximum) {
      throw new Error(`最小加注到 ${minimum} / Minimum raise ${minimum}`);
    }
    const previousBet = room.currentBet;
    contribute(room, player, raiseTarget - player.bet);
    room.currentBet = player.bet;
    if (room.currentBet - previousBet >= room.minRaise) {
      room.minRaise = room.currentBet - previousBet;
    }
    room.lastAggressor = index;
    room.raiseCount += 1;
    room.acted = new Set([player.clientId]);
    addLog(room, `${player.name} 加注到 ${player.bet} / raises to ${player.bet}`);
  } else {
    throw new Error("未知操作 / Unknown action");
  }

  if (remaining(room).length === 1) {
    awardUncontested(room);
    return;
  }
  if (bettingComplete(room)) {
    advanceStreet(room);
    return;
  }
  room.actor = nextActor(room, index);
  skipDisconnectedActor(room);
  broadcast(room);
  scheduleBot(room);
}

function resetStreetBets(room) {
  room.players.forEach((player) => {
    player.bet = 0;
  });
  room.currentBet = 0;
  room.minRaise = room.bigBlindAmount;
  room.raiseCount = 0;
  room.lastAggressor = -1;
  room.acted = new Set();
}

function burn(room) {
  if (room.deck.length) room.burned.push(room.deck.pop());
}

function advanceStreet(room) {
  resetStreetBets(room);
  if (room.street === "preflop") {
    burn(room);
    room.board.push(room.deck.pop(), room.deck.pop(), room.deck.pop());
    room.street = "flop";
  } else if (room.street === "flop") {
    burn(room);
    room.board.push(room.deck.pop());
    room.street = "turn";
  } else if (room.street === "turn") {
    burn(room);
    room.board.push(room.deck.pop());
    room.street = "river";
  } else {
    showdown(room);
    return;
  }

  const canAct = room.players.filter(actionable);
  if (canAct.length <= 1) {
    advanceStreet(room);
    return;
  }
  room.actor = nextIndex(room, room.dealer, actionable);
  room.message = `${room.street.toUpperCase()}`;
  skipDisconnectedActor(room);
  broadcast(room);
  scheduleBot(room);
}

function awardUncontested(room) {
  const winner = remaining(room)[0];
  const amount = room.pot;
  winner.player.chips += amount;
  room.winners = [winner.index];
  room.status = "handComplete";
  room.actor = -1;
  room.message = `${winner.player.name} 赢得底池 ${amount} / wins the pot`;
  addLog(room, room.message);
  broadcast(room);
}

function seatOrderFromDealer(room, indices) {
  return [...indices].sort((a, b) => {
    const distanceA = (a - room.dealer + room.players.length) % room.players.length;
    const distanceB = (b - room.dealer + room.players.length) % room.players.length;
    return distanceA - distanceB;
  });
}

function showdown(room) {
  const contributions = [...new Set(
    room.players.map((player) => player.totalBet).filter((amount) => amount > 0)
  )].sort((a, b) => a - b);
  let previous = 0;
  const allWinners = new Set();
  const awards = new Map();

  contributions.forEach((level) => {
    const contributors = room.players
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => player.totalBet >= level);
    const potAmount = (level - previous) * contributors.length;
    const eligible = contributors.filter(({ player }) => !player.folded);
    previous = level;
    if (!eligible.length || potAmount <= 0) return;
    let winningRank = null;
    let winners = [];
    eligible.forEach(({ player, index }) => {
      const rank = bestRank([...player.hand, ...room.board]);
      const comparison = winningRank ? compareRank(rank, winningRank) : 1;
      if (comparison > 0) {
        winningRank = rank;
        winners = [index];
      } else if (comparison === 0) {
        winners.push(index);
      }
    });
    const ordered = seatOrderFromDealer(room, winners);
    const share = Math.floor(potAmount / ordered.length);
    let remainder = potAmount % ordered.length;
    ordered.forEach((index) => {
      const amount = share + (remainder > 0 ? 1 : 0);
      remainder -= remainder > 0 ? 1 : 0;
      awards.set(index, (awards.get(index) || 0) + amount);
      allWinners.add(index);
    });
  });

  awards.forEach((amount, index) => {
    room.players[index].chips += amount;
  });
  room.winners = [...allWinners];
  room.status = "handComplete";
  room.actor = -1;
  const summary = [...awards.entries()]
    .map(([index, amount]) => `${room.players[index].name} +${amount}`)
    .join(", ");
  room.message = `${summary} · 摊牌 / Showdown`;
  addLog(room, room.message);
  broadcast(room);
}

function skipDisconnectedActor(room) {
  let guard = room.players.length + 1;
  while (room.actor >= 0 && !room.players[room.actor].isBot && !room.players[room.actor].connected && guard > 0) {
    const index = room.actor;
    room.players[index].folded = true;
    room.acted.add(room.players[index].clientId);
    addLog(room, `${room.players[index].name} 断线弃牌 / disconnected and folds`);
    if (remaining(room).length === 1) {
      awardUncontested(room);
      return;
    }
    if (bettingComplete(room)) {
      advanceStreet(room);
      return;
    }
    room.actor = nextActor(room, index);
    guard -= 1;
  }
}

function publicState(room, clientId) {
  const viewerIndex = room.players.findIndex((player) => player.clientId === clientId);
  const showdownVisible = room.status === "handComplete" && room.board.length === 5;
  return {
    type: "state",
    room: {
      code: room.code,
      hostId: room.hostId,
      maxPlayers: room.maxPlayers,
      startingStack: room.startingStack,
      blindInterval: room.blindInterval,
      status: room.status,
      handNumber: room.handNumber,
      dealer: room.dealer,
      smallBlind: room.smallBlind,
      bigBlind: room.bigBlind,
      smallBlindAmount: room.smallBlindAmount,
      bigBlindAmount: room.bigBlindAmount,
      street: room.street,
      board: room.board,
      pot: room.pot,
      currentBet: room.currentBet,
      minRaise: room.minRaise,
      actor: room.actor,
      message: room.message,
      log: room.log,
      winners: room.winners,
      viewerIndex,
      players: room.players.map((player, index) => ({
        clientId: player.clientId,
        name: player.name,
        chips: player.chips,
        bet: player.bet,
        totalBet: player.totalBet,
        folded: player.folded,
        allIn: player.allIn,
        connected: player.connected,
        isBot: Boolean(player.isBot),
        cardCount: player.hand.length,
        hand: index === viewerIndex || (showdownVisible && !player.folded) ? player.hand : [],
      })),
    },
  };
}

function broadcast(room) {
  room.players.forEach((player) => {
    if (player.connected && player.socket) {
      send(player.socket, publicState(room, player.clientId));
    }
  });
}

function leaveClient(client) {
  if (!client.roomCode) return;
  const room = rooms.get(client.roomCode);
  if (!room) return;
  clearTimeout(room.botTimer);
  const index = room.players.findIndex((player) => player.clientId === client.clientId);
  if (index < 0) return;
  const player = room.players[index];
  player.connected = false;
  player.socket = null;
  if (room.hostId === client.clientId) {
    const nextHost = room.players.find((candidate) => (
      candidate.clientId !== client.clientId && candidate.connected
    ));
    if (nextHost) room.hostId = nextHost.clientId;
  }
  if (room.status === "lobby") {
    room.players.splice(index, 1);
    if (!room.players.length) {
      rooms.delete(room.code);
      return;
    }
    if (!room.players.some((candidate) => candidate.clientId === room.hostId)) {
      room.hostId = room.players[0].clientId;
    }
  } else if (room.actor === index) {
    skipDisconnectedActor(room);
  }
  broadcast(room);
  scheduleBot(room);
}

function handleMessage(client, message) {
  const data = JSON.parse(message);
  if (data.type === "hello") {
    client.clientId = String(data.clientId || crypto.randomUUID()).slice(0, 64);
    return;
  }
  if (!client.clientId) throw new Error("连接尚未初始化 / Connection not initialized");

  if (data.type === "create") {
    leaveClient(client);
    const room = makeRoom(client, data);
    addPlayer(room, client, data.name);
    client.roomCode = room.code;
    send(client, publicState(room, client.clientId));
    return;
  }
  if (data.type === "join") {
    leaveClient(client);
    const code = String(data.code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) throw new Error("找不到房间 / Room not found");
    addPlayer(room, client, data.name);
    client.roomCode = room.code;
    broadcast(room);
    return;
  }

  const room = rooms.get(client.roomCode);
  if (!room) throw new Error("你还没有加入房间 / Join a room first");
  const playerIndex = room.players.findIndex((player) => player.clientId === client.clientId);
  if (playerIndex < 0) throw new Error("座位不存在 / Seat not found");

  if (data.type === "start") {
    if (room.hostId !== client.clientId) throw new Error("只有房主可以开局 / Host only");
    if (room.status !== "lobby") throw new Error("牌局已经开始 / Game already started");
    if (room.players.length < 2) throw new Error("至少需要两位玩家 / At least two players");
    beginHand(room);
  } else if (data.type === "addBot") {
    if (room.hostId !== client.clientId) throw new Error("Host only / 只有房主可以添加机器人");
    addBot(room);
    broadcast(room);
  } else if (data.type === "removeBot") {
    if (room.hostId !== client.clientId) throw new Error("Host only / 只有房主可以移除机器人");
    removeBot(room);
    broadcast(room);
  } else if (data.type === "action") {
    performAction(room, playerIndex, data.action, data.target);
  } else if (data.type === "nextHand") {
    if (room.hostId !== client.clientId) throw new Error("只有房主可以开始下一手 / Host only");
    if (room.status !== "handComplete") throw new Error("本手尚未结束 / Hand is not complete");
    beginHand(room);
  } else if (data.type === "leave") {
    leaveClient(client);
    client.roomCode = "";
    send(client, { type: "left" });
  }
}

function encodeFrame(text) {
  const payload = Buffer.from(text);
  let header;
  if (payload.length < 126) {
    header = Buffer.from([0x81, payload.length]);
  } else if (payload.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(payload.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(client, data) {
  if (!client.socket.destroyed) client.socket.write(encodeFrame(JSON.stringify(data)));
}

function parseFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);
  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const masked = Boolean(second & 0x80);
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (client.buffer.length < 4) return;
      length = client.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (client.buffer.length < 10) return;
      length = Number(client.buffer.readBigUInt64BE(2));
      offset = 10;
    }
    const maskLength = masked ? 4 : 0;
    if (client.buffer.length < offset + maskLength + length) return;
    const mask = masked ? client.buffer.subarray(offset, offset + 4) : null;
    offset += maskLength;
    const payload = Buffer.from(client.buffer.subarray(offset, offset + length));
    client.buffer = client.buffer.subarray(offset + length);
    if (masked) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
    }
    if (opcode === 0x8) {
      client.socket.end();
      return;
    }
    if (opcode === 0x9) {
      const pong = Buffer.from(payload);
      client.socket.write(Buffer.concat([Buffer.from([0x8a, pong.length]), pong]));
      continue;
    }
    if (opcode !== 0x1) continue;
    try {
      handleMessage(client, payload.toString("utf8"));
    } catch (error) {
      send(client, { type: "error", message: error.message || "服务器错误 / Server error" });
    }
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  if (pathname === "/health") {
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  if (pathname === "/api/info") {
    const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
    const forwardedHost = String(request.headers["x-forwarded-host"] || "").split(",")[0].trim();
    const protocol = forwardedProto || (request.socket.encrypted ? "https" : "http");
    const publicUrl = `${protocol}://${forwardedHost || request.headers.host}/index.html`;
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
      .map((entry) => `http://${entry.address}:${PORT}/index.html`);
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
    });
    response.end(JSON.stringify({
      localUrl: `http://127.0.0.1:${PORT}/index.html`,
      shareUrls: addresses,
      publicUrl,
    }));
    return;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(ROOT, relative);
  const relativePath = path.relative(ROOT, filePath);
  if (
    relativePath.startsWith("..")
    || path.isAbsolute(relativePath)
    || !fs.existsSync(filePath)
    || fs.statSync(filePath).isDirectory()
  ) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(response);
});

server.on("upgrade", (request, socket) => {
  if (request.url !== "/ws") {
    socket.destroy();
    return;
  }
  const key = request.headers["sec-websocket-key"];
  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
    "\r\n",
  ].join("\r\n"));
  const client = { socket, buffer: Buffer.alloc(0), clientId: "", roomCode: "" };
  clients.add(client);
  socket.on("data", (chunk) => parseFrames(client, chunk));
  socket.on("close", () => {
    clients.delete(client);
    leaveClient(client);
  });
  socket.on("error", () => socket.destroy());
});

server.listen(PORT, "0.0.0.0", () => {
  const localUrl = `http://127.0.0.1:${PORT}/index.html`;
  console.log(`Hold'em multiplayer server: ${localUrl}`);
  Object.values(os.networkInterfaces()).flat().forEach((entry) => {
    if (entry && entry.family === "IPv4" && !entry.internal) {
      console.log(`LAN invitation URL: http://${entry.address}:${PORT}/index.html`);
    }
  });
  if (process.env.AUTO_OPEN === "1" && process.platform === "win32") {
    execFile("cmd.exe", ["/c", "start", "", localUrl], { windowsHide: true });
  }
});
