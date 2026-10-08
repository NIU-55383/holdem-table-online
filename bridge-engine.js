"use strict";

const crypto = require("node:crypto");
const Core = require("./vendor/bridge-core");
const { Auction, Board, Card, Hand, Score, StringParser, Trick } = Core;
const DIRECTIONS = ["N", "E", "S", "W"];
const STRAINS = ["C", "D", "H", "S", "NT"];
const CALLS = ["P", "X", "XX", ...Array.from({ length: 7 }, (_, i) => STRAINS.map((s) => `${i + 1}${s}`)).flat()];
const fail = (ok, message) => { if (!ok) throw new Error(message); };
const cardObject = (id) => Card.numberToCard(id);
const seatOf = (direction) => DIRECTIONS.indexOf(direction);

function createGame(names, board = 1, randomInt = crypto.randomInt) {
  fail(names.length === 4, "桥牌需要四人 / Bridge needs four players");
  fail(Number.isInteger(board) && board > 0, "牌号无效 / Invalid board number");
  const cards = Array.from({ length: 52 }, (_, i) => i);
  for (let i = 51; i > 0; i--) { const j = randomInt(i + 1); [cards[i], cards[j]] = [cards[j], cards[i]]; }
  const hands = DIRECTIONS.map((_, seat) => cards.filter((c, i) => i % 4 === seat).sort((a, b) => a - b));
  const dealer = seatOf(Board.calculateDealer(board));
  return { board, players: names.map((name) => ({ name })), dealer, vulnerability: Board.calculateVulnerability(board),
    phase: "auction", current: dealer, auction: [], contract: null, hands, originalHands: hands.map((h) => [...h]),
    trick: [], tricks: [], won: [0, 0], dummyVisible: false, revision: 0, event: null, result: null };
}
function controller(g) {
  if (!["auction", "play"].includes(g.phase)) return -1;
  if (g.phase === "play" && g.current === (seatOf(g.contract.declarer) + 2) % 4) return seatOf(g.contract.declarer);
  return g.current;
}
function requiredActors(g) { const id = g ? controller(g) : -1; return id < 0 ? [] : [id]; }
function legalCalls(g) {
  if (g.phase !== "auction") return [];
  return CALLS.filter((call) => Auction.isAuctionValid([...g.auction, StringParser.parseCall(call)]));
}
function legalCards(g) {
  if (g.phase !== "play") return [];
  return Trick.generatePlayableCards(g.trick.map((p) => cardObject(p.card)), g.hands[g.current].map(cardObject)).map(Card.cardToNumber);
}
function finish(g) {
  const tricks = g.contract === "Passout" ? 0 : g.won[seatOf(g.contract.declarer) % 2];
  g.result = Score.calculate(g.contract, g.vulnerability, tricks);
  g.phase = "over";
}
function act(g, actor, action) {
  fail(action && typeof action === "object", "行动无效 / Invalid action");
  fail(action.revision === undefined || action.revision === g.revision, "牌局已变化，请重试 / Board changed; try again");
  fail(actor === controller(g) && actor >= 0, "还没轮到你 / Not your turn");
  if (g.phase === "auction") {
    fail(action.type === "call" && typeof action.call === "string" && legalCalls(g).includes(action.call), "叫牌无效 / Illegal call");
    g.auction.push(StringParser.parseCall(action.call));
    g.event = { kind: "bid", seat: actor, call: action.call };
    g.current = (g.current + 1) % 4;
    if (Auction.isAuctionEnded(g.auction)) {
      g.contract = Auction.calculateContract(g.auction, DIRECTIONS[g.dealer]);
      if (g.contract === "Passout") finish(g);
      else { g.phase = "play"; g.current = (seatOf(g.contract.declarer) + 1) % 4; }
    }
  } else {
    fail(action.type === "play" && Number.isInteger(action.card) && legalCards(g).includes(action.card), "必须跟出首引花色；没有该花色才可垫牌或将吃 / Follow suit if possible");
    const seat = g.current;
    g.hands[seat].splice(g.hands[seat].indexOf(action.card), 1);
    g.trick.push({ seat, card: action.card });
    g.dummyVisible = true;
    g.event = { kind: "card", seat, card: action.card };
    if (g.trick.length === 4) {
      const winner = seatOf(Trick.evaluate(g.trick.map((p) => cardObject(p.card)), DIRECTIONS[g.trick[0].seat], g.contract.strain));
      g.won[winner % 2]++;
      g.tricks.push({ cards: g.trick.map((p) => ({ ...p })), winner });
      g.current = winner;
      g.phase = "trick";
      g.event = { kind: "trick", seat: winner, number: g.tricks.length };
      if (g.tricks.length === 13) finish(g);
    } else g.current = (g.current + 1) % 4;
  }
  g.revision++;
  return g;
}
function advanceTrick(g) {
  fail(g.phase === "trick", "当前不是收墩阶段 / No trick to collect");
  g.trick = []; g.phase = "play"; g.revision++; g.event = { kind: "lead", seat: g.current };
}
function publicGame(g, you) {
  const dummy = g.contract && g.contract !== "Passout" ? (seatOf(g.contract.declarer) + 2) % 4 : -1;
  return { board: g.board, dealer: g.dealer, vulnerability: g.vulnerability, phase: g.phase, current: g.current,
    controller: controller(g), auction: g.auction.map((a, i) => ({ seat: (g.dealer + i) % 4, call: StringParser.stringifyCall(a) })),
    contract: g.contract, dummy, dummyVisible: g.dummyVisible, won: [...g.won], trick: g.trick, lastTrick: g.tricks.at(-1) || null,
    tricks: g.tricks, counts: g.hands.map((h) => h.length), revision: g.revision, event: g.event, result: g.result,
    hands: g.hands.map((h, seat) => seat === you || (seat === dummy && g.dummyVisible) || g.phase === "over" ? [...h] : null),
    originalHands: g.phase === "over" ? g.originalHands.map((h) => [...h]) : null,
    legalCalls: you === controller(g) ? legalCalls(g) : [], legalCards: you === controller(g) ? legalCards(g) : [] };
}

// Natural, deliberately conservative bidding. It reads only this seat's hand and public calls.
function chooseBid(g, actor) {
  const hand = g.hands[actor].map(cardObject), hcp = Hand.countMiltonHCP(hand);
  const lengths = Object.fromEntries(STRAINS.filter((s) => s !== "NT").map((s) => [s, hand.filter((c) => c.suit === s).length]));
  const balanced = Object.values(lengths).every((n) => n >= 2 && n <= 5);
  const legal = legalCalls(g), bids = g.auction.map((a, i) => ({ call: a.call, seat: (g.dealer + i) % 4 })).filter((a) => Auction.isBid(a.call));
  const own = bids.filter((a) => a.seat === actor), partner = bids.filter((a) => a.seat === (actor + 2) % 4).at(-1);
  const latest = bids.at(-1);
  const longest = ["S", "H", "D", "C"].sort((a, b) => lengths[b] - lengths[a])[0];
  const pick = (...choices) => choices.find((c) => legal.includes(c)) || "P";
  if (own.length >= 2 || hcp < 6) return "P";
  if (!latest) {
    if (balanced && hcp >= 20 && hcp <= 22) return pick("2NT");
    if (balanced && hcp >= 15 && hcp <= 17) return pick("1NT");
    if (hcp < 12) return "P";
    const suit = lengths.S >= 5 ? "S" : lengths.H >= 5 ? "H" : lengths.D > lengths.C ? "D" : "C";
    return pick(`1${suit}`);
  }
  if (partner && (!latest || latest.seat % 2 === actor % 2)) {
    const s = partner.call.suit;
    if (s === "NT" && !own.length) return pick(hcp >= 10 ? "3NT" : hcp >= 8 ? "2NT" : "P");
    if (s !== "NT" && lengths[s] >= (s === "S" || s === "H" ? 3 : 4)) {
      const level = hcp >= 13 ? (s === "H" || s === "S" ? 4 : 3) : hcp >= 10 ? 3 : 2;
      return pick(`${level}${s}`);
    }
    if (!own.length && hcp >= 6) return pick(...[1, 2].filter((l) => l === 1 || hcp >= 10).map((l) => `${l}${longest}`), hcp >= 13 ? "3NT" : "1NT");
    if (own.length === 1 && hcp >= 18) return pick(balanced ? "3NT" : `3${own[0].call.suit}`);
  }
  if (!own.length && !partner && hcp >= 12 && lengths[longest] >= 5) return pick(`1${longest}`, hcp >= 15 ? `2${longest}` : "P");
  return "P";
}
function chooseBotAction(g, actor) {
  if (actor !== controller(g)) return null;
  if (g.phase === "auction") return { type: "call", call: chooseBid(g, actor) };
  const legal = legalCards(g), cards = g.trick.map((p) => cardObject(p.card)), trump = g.contract.strain;
  const value = (id) => 14 - id % 13;
  const cheapest = (list) => [...list].sort((a, b) => value(a) - value(b) || a - b)[0];
  let best = 0;
  for (let i = 1; i < cards.length; i++) if (Card.compare(cards[best], cards[i], trump) < 0) best = i;
  let chosen;
  if (!cards.length) {
    const h = g.hands[g.current], lengths = [0, 0, 0, 0]; h.forEach((c) => lengths[Math.floor(c / 13)]++);
    const longest = lengths.indexOf(Math.max(...lengths));
    const suit = h.filter((c) => Math.floor(c / 13) === longest);
    chosen = suit.some((c) => c % 13 === 0) ? suit.find((c) => c % 13 === 0) : cheapest(suit);
  } else if (g.trick[best].seat % 2 === g.current % 2) chosen = cheapest(legal);
  else { const winning = legal.filter((id) => Card.compare(cards[best], cardObject(id), trump) < 0); chosen = cheapest(winning.length ? winning : legal); }
  return { type: "play", card: chosen };
}
module.exports = { createGame, act, advanceTrick, controller, requiredActors, legalCalls, legalCards, publicGame, chooseBotAction, DIRECTIONS, Core };
