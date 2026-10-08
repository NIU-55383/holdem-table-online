"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  Auction: () => auction_exports,
  Board: () => board_exports,
  Card: () => card_exports,
  Constants: () => bridge_constants_exports,
  Deal: () => deal_exports,
  Hand: () => hand_exports,
  Score: () => score_exports,
  StringParser: () => string_parser_exports,
  Trick: () => trick_exports,
  Types: () => types_exports
});
module.exports = __toCommonJS(src_exports);

// src/auction/index.ts
var auction_exports = {};
__export(auction_exports, {
  bidToNumber: () => bidToNumber,
  biddableSuitToNumber: () => biddableSuitToNumber,
  calculateContract: () => calculateContract,
  calculateRecentBid: () => calculateRecentBid,
  calculateRecentBidForIndex: () => calculateRecentBidForIndex,
  countConsecutivePasses: () => countConsecutivePasses,
  countFinalConsecutivePasses: () => countFinalConsecutivePasses,
  isAuctionEnded: () => isAuctionEnded,
  isAuctionValid: () => isAuctionValid,
  isBid: () => isBid,
  isDoubleValid: () => isDoubleValid,
  isFinalDoubleValid: () => isFinalDoubleValid,
  isFinalRedoubleValid: () => isFinalRedoubleValid,
  isRedoubleValid: () => isRedoubleValid
});

// src/auction/auction-ended.ts
function isAuctionEnded(auction) {
  if (auction.length < 4) {
    return false;
  }
  return countFinalConsecutivePasses(auction) >= 3;
}

// src/auction/auction-valid.ts
function isAuctionValid(auction) {
  let auctionContractNumber = -1;
  for (let i = 0; i < auction.length; i++) {
    const { call } = auction[i];
    switch (call) {
      case "P":
        break;
      case "X":
        if (!isDoubleValid(auction, i)) {
          return false;
        }
        break;
      case "XX":
        if (!isRedoubleValid(auction, i)) {
          return false;
        }
        break;
      default:
        if (call.level < 0 || call.level > 7) {
          return false;
        }
        if (bidToNumber(call) > auctionContractNumber) {
          auctionContractNumber = bidToNumber(call);
        } else {
          return false;
        }
    }
    if (isAuctionEnded(auction.slice(0, i + 1)) && i !== auction.length - 1) {
      return false;
    }
  }
  return true;
}

// src/bridge-constants.ts
var bridge_constants_exports = {};
__export(bridge_constants_exports, {
  ALL_CARD_RANKS: () => ALL_CARD_RANKS,
  ALL_COMPASS: () => ALL_COMPASS,
  ALL_SUITS: () => ALL_SUITS,
  ALL_SUITS_NT: () => ALL_SUITS_NT,
  BIDS_PER_LEVEL: () => BIDS_PER_LEVEL,
  CARDS_IN_DEAL: () => CARDS_IN_DEAL,
  CARDS_IN_HAND: () => CARDS_IN_HAND,
  CARDS_IN_SUIT: () => CARDS_IN_SUIT,
  CARDS_IN_TRICK: () => CARDS_IN_TRICK,
  COMPASS_DIRECTIONS: () => COMPASS_DIRECTIONS,
  CONTRACT_BOOK: () => CONTRACT_BOOK,
  LARGEST_BID_LEVEL: () => LARGEST_BID_LEVEL,
  NUMBER_OF_SUITS: () => NUMBER_OF_SUITS,
  VULNERABILITIES: () => VULNERABILITIES
});
var CARDS_IN_SUIT = 13;
var CARDS_IN_HAND = 13;
var NUMBER_OF_SUITS = 4;
var CARDS_IN_DEAL = NUMBER_OF_SUITS * CARDS_IN_HAND;
var BIDS_PER_LEVEL = 5;
var CONTRACT_BOOK = 6;
var CARDS_IN_TRICK = 4;
var COMPASS_DIRECTIONS = 4;
var VULNERABILITIES = 16;
var LARGEST_BID_LEVEL = 7;
var ALL_COMPASS = ["N", "E", "S", "W"];
var ALL_SUITS = ["S", "H", "D", "C"];
var ALL_SUITS_NT = ["NT", ...ALL_SUITS];
var ALL_CARD_RANKS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2"
];

// src/assertion-error.ts
var BridgeToolsError = class extends Error {
};

// src/utils/object.ts
function invert(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[value] = key;
  }
  return result;
}
function findOrThrow(obj, index, str) {
  const result = obj[index];
  if (result === void 0) {
    throw new BridgeToolsError(str);
  }
  return result;
}

// src/auction/basic.ts
var BIDDABLE_SUIT_TO_NUMBER = {
  C: 0,
  D: 1,
  H: 2,
  S: 3,
  NT: 4
};
function isBid(call) {
  return call.suit !== void 0;
}
function biddableSuitToNumber(suit) {
  return findOrThrow(
    BIDDABLE_SUIT_TO_NUMBER,
    suit,
    `Unexpected biddable suit: ${suit}`
  );
}
function bidToNumber(bid) {
  return (bid.level - 1) * BIDS_PER_LEVEL + biddableSuitToNumber(bid.suit);
}

// src/board/index.ts
var board_exports = {};
__export(board_exports, {
  BOARD_TO_DEALER: () => BOARD_TO_DEALER,
  BOARD_TO_VULNERABILITY: () => BOARD_TO_VULNERABILITY,
  calculateDealer: () => calculateDealer,
  calculateVulnerability: () => calculateVulnerability,
  countClockwiseSteps: () => countClockwiseSteps,
  isDirectionVulnerable: () => isDirectionVulnerable,
  isNorthSouth: () => isNorthSouth,
  isPlayValid: () => isPlayValid,
  isPlayerVulnerableOnBoard: () => isPlayerVulnerableOnBoard,
  isSamePair: () => isSamePair,
  rotateAnticlockwise: () => rotateAnticlockwise,
  rotateClockwise: () => rotateClockwise
});

// src/utils/mod.ts
function positiveModulo(a, modulus) {
  let m = a % modulus;
  if (m < 0) {
    m += modulus;
  }
  return m;
}

// src/board/basic.ts
var COMPASS_TO_NUMBER = {
  N: 0,
  E: 1,
  S: 2,
  W: 3
};
var NUMBER_TO_COMPASS = invert(COMPASS_TO_NUMBER);
function rotateClockwise(initial, steps) {
  const initialNumber = COMPASS_TO_NUMBER[initial];
  const newNumber = positiveModulo(initialNumber + steps, 4);
  return NUMBER_TO_COMPASS[newNumber];
}
function rotateAnticlockwise(initial, steps) {
  return rotateClockwise(initial, -steps);
}
function countClockwiseSteps(initial, end) {
  const initialNumber = COMPASS_TO_NUMBER[initial];
  const endNumber = COMPASS_TO_NUMBER[end];
  return positiveModulo(endNumber - initialNumber, 4);
}
function isNorthSouth(direction) {
  return direction === "N" || direction === "S";
}
function isSamePair(d1, d2) {
  const bothNS = isNorthSouth(d1) && isNorthSouth(d2);
  const bothEW = !isNorthSouth(d1) && !isNorthSouth(d2);
  return bothNS || bothEW;
}
function isDirectionVulnerable(direction, vulnerability) {
  if (isNorthSouth(direction)) {
    return vulnerability === "VNv" || vulnerability === "VV";
  }
  return vulnerability === "NvV" || vulnerability === "VV";
}

// src/board/calculate-dealer.ts
var BOARD_TO_DEALER = {
  1: "N",
  2: "E",
  3: "S",
  0: "W"
};
function calculateDealer(boardNumber) {
  const board = boardNumber % COMPASS_DIRECTIONS;
  return findOrThrow(
    BOARD_TO_DEALER,
    board,
    `Failed to calculate dealer of board number ${boardNumber}`
  );
}

// src/board/calculate-vulnerability.ts
var BOARD_TO_VULNERABILITY = {
  1: "NvNv",
  2: "VNv",
  3: "NvV",
  4: "VV",
  5: "VNv",
  6: "NvV",
  7: "VV",
  8: "NvNv",
  9: "NvV",
  10: "VV",
  11: "NvNv",
  12: "VNv",
  13: "VV",
  14: "NvNv",
  15: "VNv",
  0: "NvV"
};
function calculateVulnerability(boardNumber) {
  const board = boardNumber % VULNERABILITIES;
  return findOrThrow(
    BOARD_TO_VULNERABILITY,
    board,
    `Failed to calculate vulnerability of board number ${boardNumber}`
  );
}

// src/card/index.ts
var card_exports = {};
__export(card_exports, {
  cardAbove: () => cardAbove,
  cardBelow: () => cardBelow,
  cardToNumber: () => cardToNumber,
  compare: () => compare,
  compareRank: () => compareRank,
  equalCard: () => equalCard,
  isMajor: () => isMajor,
  isMinor: () => isMinor,
  numberToCard: () => numberToCard,
  numberToSuit: () => numberToSuit,
  suitToNumber: () => suitToNumber
});

// src/card/basic.ts
var RANK_TO_NUMBER = {
  A: 0,
  K: 1,
  Q: 2,
  J: 3,
  T: 4,
  "9": 5,
  "8": 6,
  "7": 7,
  "6": 8,
  "5": 9,
  "4": 10,
  "3": 11,
  "2": 12
};
var NUMBER_TO_RANK = invert(RANK_TO_NUMBER);
var SUIT_TO_NUMBER = {
  S: 0,
  H: 1,
  D: 2,
  C: 3
};
var NUMBER_TO_SUIT = invert(SUIT_TO_NUMBER);
function suitToNumber(suit) {
  return findOrThrow(SUIT_TO_NUMBER, suit, `Unexpected suit: ${suit}`);
}
function numberToSuit(num) {
  return findOrThrow(NUMBER_TO_SUIT, num, `Unexpected number for suit: ${num}`);
}
function isMinor(suit) {
  return suit === "C" || suit === "D";
}
function isMajor(suit) {
  return suit === "H" || suit === "S";
}
function compareRank(rank1, rank2) {
  const n1 = RANK_TO_NUMBER[rank1];
  const n2 = RANK_TO_NUMBER[rank2];
  if (n1 < n2) {
    return 1;
  }
  if (n1 === n2) {
    return 0;
  }
  return -1;
}
function cardToNumber(card) {
  return RANK_TO_NUMBER[card.rank] + CARDS_IN_SUIT * suitToNumber(card.suit);
}
function numberToCard(cardNumber) {
  if (cardNumber < 0 || cardNumber >= CARDS_IN_DEAL) {
    throw new BridgeToolsError(`Tried to convert invalid card: ${cardNumber}`);
  }
  return {
    rank: NUMBER_TO_RANK[cardNumber % CARDS_IN_HAND],
    suit: numberToSuit(Math.floor(cardNumber / CARDS_IN_HAND))
  };
}
function equalCard(card1, card2) {
  return card1.rank === card2.rank && card1.suit === card2.suit;
}
function cardAbove(card) {
  if (card.rank === "A") {
    return null;
  }
  return numberToCard(cardToNumber(card) - 1);
}
function cardBelow(card) {
  if (card.rank === "2") {
    return null;
  }
  return numberToCard(cardToNumber(card) + 1);
}

// src/card/compare.ts
function compare(card1, card2, trumpSuit) {
  if (card1.suit === card2.suit) {
    return compareRank(card1.rank, card2.rank);
  }
  if (card1.suit === trumpSuit) {
    return 1;
  }
  if (card2.suit === trumpSuit) {
    return -1;
  }
  return 1;
}

// src/hand/index.ts
var hand_exports = {};
__export(hand_exports, {
  MILTON_HCP: () => MILTON_HCP,
  clone: () => clone,
  containsCard: () => containsCard,
  containsSuit: () => containsSuit,
  countMiltonHCP: () => countMiltonHCP,
  countSuit: () => countSuit,
  distribution: () => distribution,
  exactDistribution: () => exactDistribution,
  filterBySuit: () => filterBySuit,
  formatHandAsLines: () => formatHandAsLines,
  removeCard: () => removeCard,
  sort: () => sort
});

// src/hand/clone.ts
function clone(hand) {
  return hand.map((card) => ({ suit: card.suit, rank: card.rank }));
}

// src/hand/contains-card.ts
function containsCard(hand, card) {
  for (const c of hand) {
    if (equalCard(c, card)) {
      return true;
    }
  }
  return false;
}

// src/hand/contains-suit.ts
function containsSuit(hand, suit) {
  return countSuit(hand, suit) > 0;
}

// src/hand/count-hcp.ts
var MILTON_HCP = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
  T: 0,
  9: 0,
  8: 0,
  7: 0,
  6: 0,
  5: 0,
  4: 0,
  3: 0,
  2: 0
};
function countMiltonHCP(hand) {
  let points = 0;
  for (const card of hand) {
    points += MILTON_HCP[card.rank];
  }
  return points;
}

// src/hand/count-suit.ts
function countSuit(hand, suit) {
  const minCardNumber = cardToNumber({ rank: "A", suit });
  const maxCardNumber = cardToNumber({ rank: "2", suit });
  let count = 0;
  for (const card of hand) {
    const number = cardToNumber(card);
    if (number >= minCardNumber && number <= maxCardNumber) {
      count++;
    }
  }
  return count;
}

// src/hand/exact-distribution.ts
function exactDistribution(hand) {
  return [
    countSuit(hand, "S"),
    countSuit(hand, "H"),
    countSuit(hand, "D"),
    countSuit(hand, "C")
  ];
}

// src/hand/distribution.ts
function distribution(hand) {
  return exactDistribution(hand).sort((a, b) => a - b).reverse();
}

// src/string-parser/index.ts
var string_parser_exports = {};
__export(string_parser_exports, {
  parseAuction: () => parseAuction,
  parseCall: () => parseCall,
  parseCard: () => parseCard,
  parseCardPlay: () => parseCardPlay,
  parseHand: () => parseHand,
  parseRanks: () => parseRanks,
  parseSuit: () => parseSuit,
  parseTrick: () => parseTrick,
  stringifyAuction: () => stringifyAuction,
  stringifyCall: () => stringifyCall,
  stringifyCard: () => stringifyCard,
  stringifyCardPlay: () => stringifyCardPlay,
  stringifyHand: () => stringifyHand,
  stringifyRanks: () => stringifyRanks,
  stringifySuit: () => stringifySuit,
  stringifyTrick: () => stringifyTrick
});

// src/string-parser/parse-suit.ts
var STRING_SUIT_TO_SUIT = {
  S: "S",
  s: "S",
  H: "H",
  h: "H",
  D: "D",
  d: "D",
  C: "C",
  c: "C"
};
function parseSuit(str) {
  return findOrThrow(
    STRING_SUIT_TO_SUIT,
    str,
    `Failed to parse suit with string: ${str}`
  );
}

// src/string-parser/parse-card.ts
function parseCard(str) {
  const suit = parseSuit(str[0] ?? "");
  const ranks = parseRanks(str[1] ?? "");
  if (ranks.length !== 1) {
    throw new Error(`Failed to parse card with string: ${str}`);
  }
  return { suit, rank: ranks[0] };
}

// src/string-parser/parse-auction.ts
function parseContestedAuction(auction) {
  const calls = auction.split("-");
  return calls.map((call) => parseCall(call));
}
function parseUncontestedAuction(auction) {
  let contestedAuction = auction.replaceAll("-", "-P-");
  contestedAuction += "-P";
  return parseContestedAuction(contestedAuction);
}
function parseAuction(auction, contested = true) {
  return contested ? parseContestedAuction(auction) : parseUncontestedAuction(auction);
}

// src/string-parser/parse-call.ts
function parseStrain(str) {
  return str === "n" || str === "N" || str === "nt" || str === "NT" ? "NT" : parseSuit(str);
}
function parseCall(bid) {
  const upperCaseBid = bid.toUpperCase();
  if (upperCaseBid === "P" || upperCaseBid === "X" || upperCaseBid === "XX") {
    return { call: upperCaseBid };
  }
  const level = Number.parseInt(bid);
  const strain = bid.slice(1);
  if (level > 0 && level <= LARGEST_BID_LEVEL) {
    return { call: { level, suit: parseStrain(strain) } };
  } else {
    throw new Error(`Failed to parse Call with string: ${bid}`);
  }
}

// src/string-parser/parse-trick.ts
function parseTrick(str) {
  const trimmed = str.trim();
  if (trimmed.length > 8) {
    throw new Error(`Error occurred parsing trick: ${trimmed}`);
  }
  const trick = [];
  for (let i = 0; i < trimmed.length; i += 2) {
    const card = parseCard(trimmed.slice(i, i + 2));
    trick.push(card);
  }
  return trick;
}

// src/string-parser/parse-cardplay.ts
function parseCardPlay(str) {
  return str.trim().split(",").map((trick) => parseTrick(trick));
}

// src/string-parser/parse-hand.ts
function parseHand(str, allowPartial = false) {
  const suitStrs = str.split(".");
  if (suitStrs.length !== NUMBER_OF_SUITS) {
    throw new Error(`Unexpected number of suits in string: ${str}`);
  }
  const spades = parseRanks(suitStrs[0]).map((rank) => ({
    suit: "S",
    rank
  }));
  const hearts = parseRanks(suitStrs[1]).map((rank) => ({
    suit: "H",
    rank
  }));
  const diamonds = parseRanks(suitStrs[2]).map((rank) => ({
    suit: "D",
    rank
  }));
  const clubs = parseRanks(suitStrs[3]).map((rank) => ({
    suit: "C",
    rank
  }));
  if (!allowPartial && spades.length + hearts.length + diamonds.length + clubs.length !== CARDS_IN_HAND) {
    throw new Error(`Incorrect number of cards in string: ${str}`);
  }
  return [...spades, ...hearts, ...diamonds, ...clubs];
}

// src/string-parser/parse-ranks.ts
var STRING_RANK_TO_RANK = {
  A: "A",
  a: "A",
  K: "K",
  k: "K",
  Q: "Q",
  q: "Q",
  J: "J",
  j: "J",
  T: "T",
  t: "T",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2"
};
function parseRanks(str) {
  const hand = [];
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char.trim() === "") {
      continue;
    }
    if (char === "1") {
      if (str[i + 1] === "0") {
        hand.push("T");
        i += 1;
        continue;
      }
    } else {
      const rank = findOrThrow(
        STRING_RANK_TO_RANK,
        char,
        `Unexpected character: ${char}. Failed to parse ranks.`
      );
      hand.push(rank);
    }
  }
  return hand;
}

// src/string-parser/stringify-card.ts
function stringifyCard(card) {
  return card.suit + stringifyRanks([card.rank]);
}

// src/string-parser/stringify-call.ts
function stringifyStrain(strain) {
  return strain === "NT" ? "NT" : stringifySuit(strain);
}
function stringifyCall(bid) {
  if (bid.call === "P" || bid.call === "X" || bid.call === "XX") {
    return bid.call;
  }
  return bid.call.level.toString() + stringifyStrain(bid.call.suit);
}

// src/string-parser/stringify-trick.ts
function stringifyTrick(trick) {
  return trick.map((card) => stringifyCard(card)).join("");
}

// src/string-parser/stringify-cardplay.ts
function stringifyCardPlay(play) {
  return play.map((trick) => stringifyTrick(trick)).join(",");
}

// src/string-parser/stringify-hand.ts
function stringifyHand(hand) {
  const spadeStr = stringifyRanks(
    hand.filter((c) => c.suit === "S").map((c) => c.rank)
  );
  const heartStr = stringifyRanks(
    hand.filter((c) => c.suit === "H").map((c) => c.rank)
  );
  const diamondStr = stringifyRanks(
    hand.filter((c) => c.suit === "D").map((c) => c.rank)
  );
  const clubStr = stringifyRanks(
    hand.filter((c) => c.suit === "C").map((c) => c.rank)
  );
  return spadeStr + "." + heartStr + "." + diamondStr + "." + clubStr;
}

// src/string-parser/stringify-ranks.ts
function stringifyRanks(ranks) {
  const orderedRanks = ranks.sort(compareRank).reverse();
  return orderedRanks.join("");
}

// src/string-parser/stringify-suit.ts
function stringifySuit(suit) {
  return suit;
}

// src/string-parser/stringify-auction.ts
function stringifyContestedAuction(auction) {
  const stringAuction = auction.map((call) => stringifyCall(call));
  return stringAuction.join("-");
}
function stringifyUncontestedAuction(auction) {
  const passes = auction.filter((pass, index) => {
    return index % 2 === 1;
  });
  const bids = auction.filter((bid, index) => {
    return index % 2 === 0;
  });
  for (let i = 0; i < passes.length; i++) {
    if (passes[i].call !== "P") {
      throw new Error(
        `Invalid uncontested auction as opponents don't pass throughout in ${JSON.stringify(
          auction
        )}`
      );
    }
  }
  return bids.map((bid) => stringifyCall(bid)).join("-");
}
function stringifyAuction(auction, contested = true) {
  return contested ? stringifyContestedAuction(auction) : stringifyUncontestedAuction(auction);
}

// src/hand/format-as-lines.ts
function formatHandAsLines(hand) {
  const spades = stringifyRanks(
    filterBySuit(hand, "S").map((card) => card.rank)
  );
  const hearts = stringifyRanks(
    filterBySuit(hand, "H").map((card) => card.rank)
  );
  const diamonds = stringifyRanks(
    filterBySuit(hand, "D").map((card) => card.rank)
  );
  const clubs = stringifyRanks(
    filterBySuit(hand, "C").map((card) => card.rank)
  );
  return [spades, hearts, diamonds, clubs];
}

// src/hand/remove-card.ts
function removeCard(hand, card, throwErrorOnMissing = true) {
  const result = hand.filter((c) => !equalCard(c, card));
  if (throwErrorOnMissing && result.length === hand.length) {
    throw new Error(
      `Tried to remove card: ${stringifyCard(card)} but it wasn't in the hand.`
    );
  }
  return result;
}

// src/hand/filter-suit.ts
function filterBySuit(hand, suit) {
  return hand.filter((card) => card.suit === suit);
}

// src/hand/sort.ts
function sort(hand) {
  return hand.sort((c1, c2) => cardToNumber(c1) - cardToNumber(c2));
}

// src/trick/index.ts
var trick_exports = {};
__export(trick_exports, {
  evaluate: () => evaluate,
  generatePlayableCards: () => generatePlayableCards,
  isCardPlayable: () => isCardPlayable
});

// src/trick/all-playable-cards.ts
function generatePlayableCards(trick, hand) {
  if (trick.length === 0) {
    return hand;
  }
  const trickSuit = trick[0].suit;
  if (!containsSuit(hand, trickSuit)) {
    return hand;
  }
  return hand.filter((card) => card.suit === trickSuit);
}

// src/trick/card-playable.ts
function isCardPlayable(trick, card, hand) {
  if (trick.length === 0) {
    return true;
  }
  const trickSuit = trick[0].suit;
  if (card.suit === trickSuit) {
    return true;
  }
  return !containsSuit(hand, trickSuit);
}

// src/trick/evaluate.ts
function evaluateTrickIndex(trick, trumpSuit) {
  if (trick.length !== 4) {
    throw new BridgeToolsError("Trying to evaluate an incomplete trick");
  }
  let bestCard = trick[0];
  let bestCardPosition = 0;
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    if (compare(bestCard, card, trumpSuit) < 0) {
      bestCard = card;
      bestCardPosition = i;
    }
  }
  return bestCardPosition;
}
function evaluate(trick, startingPosition, trumpSuit) {
  const winnerIndex = evaluateTrickIndex(trick, trumpSuit);
  return rotateClockwise(startingPosition, winnerIndex);
}

// src/utils/array.ts
function generateIncreasing(length) {
  return Array.from({ length }, (_, i) => i);
}

// src/board/play-valid.ts
function isPlayValid(deal, play, contract) {
  let allCardNumbers = generateIncreasing(CARDS_IN_DEAL);
  let directionOnLead = rotateClockwise(contract.declarer, 1);
  const remainingCards = {
    N: deal.N,
    E: deal.E,
    S: deal.S,
    W: deal.W
  };
  for (let i = 0; i < play.length; i++) {
    const trick = play[i];
    for (let j = 0; j < trick.length; j += 1) {
      const card = trick[j];
      const cardNumber = cardToNumber(card);
      const directionToPlay = rotateClockwise(directionOnLead, j);
      const currentHand = remainingCards[directionToPlay];
      if (!allCardNumbers.includes(cardNumber)) {
        return false;
      }
      allCardNumbers = allCardNumbers.filter((number) => number !== cardNumber);
      if (!containsCard(currentHand, card)) {
        return false;
      }
      remainingCards[directionToPlay] = removeCard(currentHand, card);
      if (card.suit !== trick[0].suit && containsSuit(currentHand, trick[0].suit)) {
        return false;
      }
    }
    if (trick.length !== CARDS_IN_TRICK) {
      if (i !== play.length - 1) {
        return false;
      }
    } else {
      directionOnLead = evaluate(trick, directionOnLead, contract.strain);
    }
  }
  return true;
}

// src/board/player-vulnerable.ts
function isPlayerVulnerableOnBoard(boardNumber, direction) {
  const vul = calculateVulnerability(boardNumber);
  return isDirectionVulnerable(direction, vul);
}

// src/auction/calculate-recent-bid.ts
function calculateRecentBidForIndex(auction, index) {
  for (let i = index; i >= 0; i--) {
    const call = auction[i].call;
    if (isBid(call)) {
      return { bid: call, index: i };
    }
  }
  return null;
}
function calculateRecentBid(auction) {
  return calculateRecentBidForIndex(auction, auction.length - 1);
}

// src/auction/calculate-contract.ts
function calculateContract(auction, dealer) {
  if (!isAuctionEnded(auction)) {
    return null;
  }
  const finalBid = calculateRecentBid(auction);
  if (finalBid === null) {
    return "Passout";
  }
  let doubled = false;
  let redoubled = false;
  for (let i = auction.length - 1; i >= 0; i--) {
    const call = auction[i].call;
    if (call === "X") {
      doubled = true;
      break;
    } else if (call === "XX") {
      redoubled = true;
      break;
    } else if (isBid(call)) {
      break;
    }
  }
  const finalBidderDirection = rotateClockwise(dealer, finalBid.index);
  let declarer = "N";
  for (let i = 0; i < auction.length; i++) {
    const call = auction[i].call;
    const direction = rotateClockwise(dealer, i);
    if (isBid(call) && call.suit === finalBid.bid.suit && isSamePair(direction, finalBidderDirection)) {
      declarer = direction;
      break;
    }
  }
  return {
    declarer,
    level: finalBid.bid.level,
    strain: finalBid.bid.suit,
    ...doubled ? { doubled } : {},
    ...redoubled ? { redoubled } : {}
  };
}

// src/auction/consecutive-passes.ts
function countConsecutivePasses(auction, start) {
  let passes = 0;
  for (let i = start - 1; i >= 0; i--) {
    if (auction[i].call !== "P") {
      return passes;
    }
    passes += 1;
  }
  return passes;
}
function countFinalConsecutivePasses(auction) {
  return countConsecutivePasses(auction, auction.length);
}

// src/auction/double-valid.ts
function isDoubleValid(auction, index) {
  const consecutivePasses = countConsecutivePasses(auction, index);
  if (consecutivePasses !== 0 && consecutivePasses !== 2) {
    return false;
  }
  if (index - 1 - consecutivePasses < 0 || !isBid(auction[index - 1 - consecutivePasses].call)) {
    return false;
  }
  return true;
}
function isFinalDoubleValid(auction) {
  return isDoubleValid(auction, auction.length);
}

// src/auction/redouble-valid.ts
function isRedoubleValid(auction, index) {
  const consecutivePasses = countConsecutivePasses(auction, index);
  if (consecutivePasses !== 0 && consecutivePasses !== 2) {
    return false;
  }
  if (index - 1 - consecutivePasses < 0 || auction[index - 1 - consecutivePasses].call !== "X") {
    return false;
  }
  return true;
}
function isFinalRedoubleValid(auction) {
  return isRedoubleValid(auction, auction.length);
}

// src/deal/index.ts
var deal_exports = {};
__export(deal_exports, {
  clone: () => clone2,
  findCard: () => findCard,
  isValid: () => isValid,
  writeDealAsString: () => writeDealAsString
});

// src/deal/clone.ts
function clone2(deal) {
  return {
    N: hand_exports.clone(deal.N),
    E: hand_exports.clone(deal.E),
    S: hand_exports.clone(deal.S),
    W: hand_exports.clone(deal.W)
  };
}

// src/deal/deal-output.ts
function calculateWestEastTabSpacing(suitstr) {
  if (suitstr.length < 2) {
    return "	".repeat(6);
  } else if (suitstr.length > 9) {
    return "	".repeat(4);
  } else {
    return "	".repeat(5);
  }
}
function writeDealAsString(deal) {
  const north = formatHandAsLines(deal.N).map((line) => "			" + line);
  const south = formatHandAsLines(deal.S).map((line) => "			" + line);
  const west = formatHandAsLines(deal.W);
  const east = formatHandAsLines(deal.E);
  const handsWestEast = [];
  for (let i = 0; i < bridge_constants_exports.NUMBER_OF_SUITS; i++) {
    handsWestEast.push(
      west[i] + calculateWestEastTabSpacing(west[i]) + east[i]
    );
  }
  const dealString = [...north, ...handsWestEast, ...south];
  return dealString.join("\n");
}

// src/deal/find-card.ts
function findCard(deal, card) {
  if (hand_exports.containsCard(deal.N, card)) {
    return "N";
  } else if (hand_exports.containsCard(deal.E, card)) {
    return "E";
  } else if (hand_exports.containsCard(deal.S, card)) {
    return "S";
  } else if (hand_exports.containsCard(deal.W, card)) {
    return "W";
  } else {
    return null;
  }
}

// src/deal/valid.ts
function isValid(deal) {
  if (deal.N.length !== CARDS_IN_HAND || deal.E.length !== CARDS_IN_HAND || deal.S.length !== CARDS_IN_HAND || deal.W.length !== CARDS_IN_HAND) {
    return false;
  }
  let allCardNumbers = generateIncreasing(CARDS_IN_DEAL);
  for (const compass of ALL_COMPASS) {
    for (const card of deal[compass]) {
      const cardNumber = cardToNumber(card);
      if (!allCardNumbers.includes(cardNumber)) {
        return false;
      }
      allCardNumbers = allCardNumbers.filter((value) => value !== cardNumber);
    }
  }
  return true;
}

// src/score/index.ts
var score_exports = {};
__export(score_exports, {
  calculate: () => calculate
});

// src/score/calculate.ts
var NV_UNDERTRICK = 50;
var V_UNDERTRICK = 100;
var NV_D_UNDERTRICK_FIRST = 100;
var NV_D_UNDERTRICK_SECOND_THIRD = 200;
var NV_D_UNDERTRICK_SUBSEQ = 300;
var V_D_UNDERTRICK_FIRST = 200;
var V_D_UNDERTRICK_SUBSEQ = 300;
var MINOR_TRICK = 20;
var MAJOR_TRICK = 30;
var NT_TRICK_ADJUSTMENT = 10;
var GAME_THRESHOLD = 100;
var PARTSCORE_BONUS = 50;
var NV_GAME_BONUS = 250;
var NV_SLAM_BONUS = 500;
var NV_GRAND_BONUS = 500;
var V_GAME_BONUS = 450;
var V_SLAM_BONUS = 750;
var V_GRAND_BONUS = 750;
var D_INSULT = 50;
var RD_INSULT = 100;
var SLAM_LEVEL = 6;
var GRAND_LEVEL = 7;
var NV_DOUBLED_OVERTRICK = 100;
var V_DOUBLED_OVERTRICK = 200;
function calculateVulnerableUndertrickScore(contract, undertricks) {
  const doubledScore = V_D_UNDERTRICK_FIRST + (undertricks - 1) * V_D_UNDERTRICK_SUBSEQ;
  if (contract.doubled) {
    return doubledScore;
  }
  if (contract.redoubled) {
    return 2 * doubledScore;
  }
  return V_UNDERTRICK * undertricks;
}
function calculateNonVulnerableUndertrickScore(contract, undertricks) {
  const doubledScore = NV_D_UNDERTRICK_FIRST + Math.min(2, undertricks - 1) * NV_D_UNDERTRICK_SECOND_THIRD + Math.max(0, undertricks - 3) * NV_D_UNDERTRICK_SUBSEQ;
  if (contract.doubled) {
    return doubledScore;
  }
  if (contract.redoubled) {
    return 2 * doubledScore;
  }
  return NV_UNDERTRICK * undertricks;
}
function calculateUndertrickScore(contract, vulnerable, undertricks) {
  return vulnerable ? calculateVulnerableUndertrickScore(contract, undertricks) : calculateNonVulnerableUndertrickScore(contract, undertricks);
}
function calculateOvertrickScore(contract, vulnerable, overtricks) {
  const tricksOverBook = contract.level;
  let score = PARTSCORE_BONUS;
  let trickScore = 0;
  if (contract.strain === "NT") {
    trickScore = NT_TRICK_ADJUSTMENT + tricksOverBook * MAJOR_TRICK;
  } else if (isMinor(contract.strain)) {
    trickScore = tricksOverBook * MINOR_TRICK;
  } else {
    trickScore = tricksOverBook * MAJOR_TRICK;
  }
  if (contract.doubled) {
    score += D_INSULT;
    trickScore *= 2;
  }
  if (contract.redoubled) {
    score += RD_INSULT;
    trickScore *= 4;
  }
  score += trickScore;
  if (trickScore >= GAME_THRESHOLD) {
    score += vulnerable ? V_GAME_BONUS : NV_GAME_BONUS;
  }
  if (contract.level >= SLAM_LEVEL) {
    score += vulnerable ? V_SLAM_BONUS : NV_SLAM_BONUS;
  }
  if (contract.level === GRAND_LEVEL) {
    score += vulnerable ? V_GRAND_BONUS : NV_GRAND_BONUS;
  }
  if (contract.doubled) {
    score += overtricks * (vulnerable ? V_DOUBLED_OVERTRICK : NV_DOUBLED_OVERTRICK);
  } else if (contract.redoubled) {
    score += 2 * overtricks * (vulnerable ? V_DOUBLED_OVERTRICK : NV_DOUBLED_OVERTRICK);
  } else if (contract.strain === "NT") {
    score += overtricks * MAJOR_TRICK;
  } else if (isMinor(contract.strain)) {
    score += overtricks * MINOR_TRICK;
  } else {
    score += overtricks * MAJOR_TRICK;
  }
  return score;
}
function calculate(contract, vulnerability, tricks) {
  if (contract === "Passout") {
    return { result: 0, tricksTaken: 0, score: 0 };
  }
  const tricksContracted = contract.level + CONTRACT_BOOK;
  const result = tricks - tricksContracted;
  const vulnerable = isDirectionVulnerable(contract.declarer, vulnerability);
  if (result < 0) {
    const undertrickScore = calculateUndertrickScore(
      contract,
      vulnerable,
      -result
    );
    return {
      tricksTaken: tricks,
      result,
      score: isNorthSouth(contract.declarer) ? -undertrickScore : undertrickScore
    };
  } else {
    const overtrickScore = calculateOvertrickScore(
      contract,
      vulnerable,
      result
    );
    return {
      tricksTaken: tricks,
      result,
      score: isNorthSouth(contract.declarer) ? overtrickScore : -overtrickScore
    };
  }
}

// src/types/index.ts
var types_exports = {};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Auction,
  Board,
  Card,
  Constants,
  Deal,
  Hand,
  Score,
  StringParser,
  Trick,
  Types
});
