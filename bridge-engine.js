"use strict";

const crypto = require("node:crypto");
const Core = require("./vendor/bridge-core");
const { Auction, Board, Card, Score, StringParser, Trick } = Core;
const Bot = require("./bridge-bot");
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

function chooseBotAction(g, actor, style = 0) {
  if (actor !== controller(g)) return null;
  // The AI receives exactly the acting player's view, never the full deal.
  return Bot.chooseAction(publicGame(g, actor), actor, style);
}
module.exports = { createGame, act, advanceTrick, controller, requiredActors, legalCalls, legalCards, publicGame, chooseBotAction, DIRECTIONS, Core };
