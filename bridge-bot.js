"use strict";

const { Card, Score, Trick } = require("./vendor/bridge-core");
const DIRS = ["N", "E", "S", "W"], SUITS = ["S", "H", "D", "C"];
const OBJECTS = Array.from({ length: 52 }, (_, i) => Card.numberToCard(i));
const suit = (c) => Math.floor(c / 13), rank = (c) => c % 13;
const points = (c) => Math.max(0, 4 - rank(c));
const profiles = Object.freeze([
  Object.freeze({ margin: 0, risk: 0, attack: .3, partner: .3 }),
  Object.freeze({ margin: .8, risk: -.18, attack: 0, partner: .5 }),
  Object.freeze({ margin: -.7, risk: .12, attack: .65, partner: .15 }),
  Object.freeze({ margin: .25, risk: -.05, attack: .15, partner: .8 })
]);
const profile = (id) => profiles[Number.isInteger(id) ? ((id % profiles.length) + profiles.length) % profiles.length : 0];
function handInfo(hand) {
  const lengths = SUITS.map((_, s) => hand.filter((c) => suit(c) === s).length), hcp = hand.reduce((n, c) => n + points(c), 0);
  const shape = [...lengths].sort((a, b) => b - a).join("");
  const stops = SUITS.map((_, s) => hand.some((c) => suit(c) === s && (rank(c) === 0 || rank(c) === 1 && lengths[s] >= 2 || rank(c) === 2 && lengths[s] >= 3)));
  return { lengths, hcp, balanced: ["4333", "4432", "5332"].includes(shape), stops,
    lengthPoints: lengths.reduce((n, l) => n + Math.max(0, l - 4), 0),
    supportPoints: lengths.reduce((n, l) => n + (l === 0 ? 3 : l === 1 ? 2 : l === 2 ? 1 : 0), 0) };
}
function bidsOf(v) { return v.auction.filter((a) => /^[1-7]/.test(a.call)).map((a) => ({ ...a, level: Number(a.call[0]), strain: a.call.slice(1) })); }
function inferBid(v, seat) {
  const bids = bidsOf(v), own = bids.filter((a) => a.seat === seat), first = own[0];
  const model = { min: 0, max: 40, lengths: [0, 0, 0, 0] };
  if (!first) { if (v.auction.some((a) => a.seat === seat && a.call === "P")) model.max = 11; return model; }
  const opening = bids[0], responding = first.seat % 2 === opening.seat % 2 && first !== opening;
  if (first === opening) {
    [model.min, model.max] = first.call === "1NT" ? [15, 17] : first.call === "2NT" ? [20, 21] : first.call === "3NT" ? [25, 27] : first.call === "2C" ? [22, 40] : first.level >= 2 ? [6, 11] : [12, 21];
  } else if (responding) {
    if (opening.call === "2C" && first.call === "2D") [model.min, model.max] = [0, 40];
    else if (opening.strain === "NT") [model.min, model.max] = first.strain === "NT" ? first.level === 2 ? [8, 9] : first.level === 3 ? [10, 15] : [16, 20] : first.level === 2 ? [0, 7] : [10, 18];
    else if (first.strain === opening.strain) [model.min, model.max] = first.level === 2 ? [6, 9] : first.level === 3 ? [10, 12] : [13, 18];
    else [model.min, model.max] = first.level === 1 ? [6, 18] : [10, 20];
  } else [model.min, model.max] = first.strain === "NT" ? [15, 18] : [10, 18];
  for (const bid of own) {
    const s = SUITS.indexOf(bid.strain); if (s < 0 || bid.call === "2C" && bid === opening || bid.call === "2D" && opening.call === "2C" && bid === first) continue;
    const raise = responding && bid.strain === opening.strain;
    model.lengths[s] = Math.max(model.lengths[s], raise ? s < 2 ? 3 : 4 : bid === opening ? bid.level >= 2 ? bid.level + 4 : s < 2 ? 5 : 3 : 4);
  }
  if (own.length >= 2) {
    const last = own.at(-1);
    if (first === opening && last.strain === "NT") [model.min, model.max] = first.call === "2C" ? last.level === 2 ? [22, 24] : [25, 27] : last.level === 1 ? [12, 14] : last.level === 2 ? [18, 19] : [19, 24];
    if (last.strain === first.strain && last.strain !== "NT" && own.length > 1 && first === opening) model.lengths[SUITS.indexOf(last.strain)] = Math.max(6, model.lengths[SUITS.indexOf(last.strain)]);
  }
  return model;
}
function chooseBid(v, actor, style) {
  const h = handInfo(v.hands[actor]), p = profile(style), legal = v.legalCalls;
  const bids = bidsOf(v), own = bids.filter((a) => a.seat === actor), partnerSeat = (actor + 2) % 4;
  const partner = bids.filter((a) => a.seat === partnerSeat), opp = bids.filter((a) => a.seat % 2 !== actor % 2), last = bids.at(-1);
  const pm = inferBid(v, partnerSeat), mineVul = actor % 2 === 0 ? ["VNv", "VV"].includes(v.vulnerability) : ["NvV", "VV"].includes(v.vulnerability);
  const margin = p.margin + (mineVul ? .35 : 0), longest = [0, 1, 2, 3].sort((a, b) => h.lengths[b] - h.lengths[a] || a - b)[0];
  const pick = (...calls) => calls.find((c) => legal.includes(c)) || "P";
  const cheapest = (s, max = 3) => Array.from({ length: max }, (_, i) => `${i + 1}${s}`).find((c) => legal.includes(c));
  const stops = opp.every((a) => a.strain === "NT" || h.stops[SUITS.indexOf(a.strain)]);
  if (own.length >= 4) return "P";
  if (!last) {
    if (h.balanced && h.hcp >= 25 && h.hcp <= 27) return "3NT";
    if (h.balanced && h.hcp >= 20 && h.hcp <= 21) return "2NT";
    if (h.hcp >= 22) return "2C";
    if (h.balanced && h.hcp >= 15 && h.hcp <= 17) return "1NT";
    if (h.hcp >= 12 + margin || h.hcp >= 10 && h.hcp + [...h.lengths].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b) >= 20 + margin) {
      const s = h.lengths[0] >= 5 ? 0 : h.lengths[1] >= 5 ? 1 : h.lengths[2] >= 4 && h.lengths[2] >= h.lengths[3] ? 2 : 3;
      return `1${SUITS[s]}`;
    }
    const honors = v.hands[actor].filter((c) => suit(c) === longest && rank(c) <= 4).length;
    if (h.hcp >= 6 + margin && h.hcp <= 10 && honors >= 2 && h.lengths[longest] >= 6 && !(longest === 3 && h.lengths[longest] === 6)) return pick(`${h.lengths[longest] >= 7 ? 3 : 2}${SUITS[longest]}`);
    return "P";
  }
  // Strong-club waiting response, then natural rebids. No undisclosed transfers.
  if (partner[0]?.call === "2C" && bids[0] === partner[0] && !own.length) return pick("2D");
  if (own[0]?.call === "2C" && bids[0] === own[0] && own.length === 1 && partner.length) return h.balanced ? pick(h.hcp >= 25 ? "3NT" : "2NT") : pick(cheapest(SUITS[longest], 3));
  if (partner.length) {
    const first = partner[0], recent = partner.at(-1), opening = bids[0];
    if (!own.length && first === opening && first.strain === "NT") {
      const base = first.level === 1 ? 15 : first.level === 2 ? 20 : 25;
      if (h.hcp + base >= 37) return pick("7NT");
      if (h.hcp + base >= 33 + margin) return pick("6NT");
      if (h.lengths[longest] >= 5 && longest < 2) return pick(`${h.hcp + base >= 25 + margin ? 3 : 2}${SUITS[longest]}`);
      if (h.hcp + base >= 25 + margin) return pick("3NT");
      if (h.hcp + base >= 23 + margin) return pick("2NT");
      return "P";
    }
    if (!own.length && first === opening && first.level === 1) {
      const s = SUITS.indexOf(first.strain), fit = s >= 0 && h.lengths[s] >= (s < 2 ? 3 : 5);
      const strength = h.hcp + (fit ? h.supportPoints : 0);
      if (fit && strength >= 6 + margin) {
        if (s < 2) return pick(`${strength >= 13 + margin ? 4 : strength >= 10 + margin ? 3 : 2}${first.strain}`);
        if (h.balanced && h.hcp >= 13 && stops) return pick("3NT");
      }
      if (h.hcp < 6 + margin) return "P";
      for (const s2 of [0, 1, 2, 3].sort((a, b) => h.lengths[b] - h.lengths[a] || a - b)) {
        if (s2 === s || h.lengths[s2] < 4) continue;
        if (legal.includes(`1${SUITS[s2]}`)) return `1${SUITS[s2]}`;
        if (h.hcp >= 10 + margin && h.lengths[s2] >= (s2 < 2 ? 5 : 4) && legal.includes(`2${SUITS[s2]}`)) return `2${SUITS[s2]}`;
      }
      return pick(h.hcp >= 13 + margin && stops ? "3NT" : h.hcp >= 11 + margin && h.balanced ? "2NT" : "1NT", fit ? `2${first.strain}` : "P");
    }
    const fits = [0, 1, 2, 3].filter((s) => h.lengths[s] + pm.lengths[s] >= 8);
    const fit = fits.sort((a, b) => (a < 2 ? 0 : 1) - (b < 2 ? 0 : 1) || h.lengths[b] + pm.lengths[b] - h.lengths[a] - pm.lengths[a])[0];
    const total = h.hcp + pm.min + (fit !== undefined ? Math.min(3, h.supportPoints) : 0);
    if (fit !== undefined) {
      const strain = SUITS[fit], game = fit < 2 ? 4 : 5, gamePoints = fit < 2 ? 25 : 29;
      if (total >= 33 + margin && h.hcp + pm.min >= 30 && h.stops.filter(Boolean).length >= 3) return pick(`6${strain}`);
      if (total >= gamePoints + margin) return pick(`${game}${strain}`);
      if (last.seat % 2 === actor % 2 && last.strain === strain && last.level >= 3) return "P";
      if (total >= 23 + margin && (!own.length || own.at(-1).level < 3)) return pick(`3${strain}`);
      if (total >= 19 + margin) return pick(`2${strain}`);
    }
    if (h.balanced && stops) {
      const ntTotal = h.hcp + pm.min;
      if (ntTotal >= 37) return pick("7NT");
      if (ntTotal >= 33 + margin) return pick("6NT");
      if (ntTotal >= 25 + margin) return pick("3NT");
      if (ntTotal >= 23 + margin) return pick("2NT");
      if (own.length === 1 && own[0] === opening && h.hcp <= 14) return pick("1NT");
    }
    if (own.length === 1 && own[0] === opening && own[0].level === 1) {
      const rs = SUITS.indexOf(recent.strain);
      if (rs >= 0 && h.lengths[rs] >= 4) return pick(`${h.hcp >= 19 ? 4 : h.hcp >= 16 ? 3 : 2}${recent.strain}`);
      if (h.lengths[longest] >= 6) return pick(`${h.hcp >= 16 ? 3 : 2}${SUITS[longest]}`);
      for (const s of [1, 0, 2, 3]) if (SUITS[s] !== own[0].strain && h.lengths[s] >= 4) { const bid = cheapest(SUITS[s], 2); if (bid && (Number(bid[0]) === 1 || h.hcp >= 17 || SUITS.indexOf(own[0].strain) < s)) return bid; }
    }
  }
  if (!own.length && !partner.length && last.seat % 2 !== actor % 2) {
    if (h.balanced && h.hcp >= 15 && h.hcp <= 18 && stops) return pick("1NT");
    const os = SUITS.indexOf(last.strain);
    if (legal.includes("X") && last.level <= 2 && h.hcp >= 12 + margin && os >= 0 && h.lengths[os] <= 2 && h.lengths.every((l, s) => s === os || l >= 3)) return "X";
    if (h.lengths[longest] >= 5 && h.hcp >= 10 + margin) {
      const bid = cheapest(SUITS[longest], h.hcp >= 13 + margin ? 2 : 1); if (bid) return bid;
    }
  }
  const partnerDouble = v.auction.some((a) => a.seat === partnerSeat && a.call === "X");
  if (partnerDouble && !own.length && last.seat % 2 !== actor % 2) {
    const s = [0, 1, 2, 3].filter((s) => SUITS[s] !== last.strain).sort((a, b) => h.lengths[b] - h.lengths[a] || a - b)[0];
    return pick(cheapest(SUITS[s], 3));
  }
  if (legal.includes("XX") && own.length && h.hcp + pm.min >= 25 && own.at(-1).strain === last.strain) return "XX";
  return "P";
}

function random(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
function hash(text) { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }
function playedCards(v) {
  const cards = new Map();
  for (const p of [...v.tricks.flatMap((t) => t.cards), ...v.trick]) cards.set(p.card, p);
  return [...cards.values()];
}
function knowledge(v, actor) {
  const played = playedCards(v), known = [null, null, null, null];
  known[actor] = [...v.hands[actor]];
  if (v.dummyVisible) known[v.dummy] = [...v.hands[v.dummy]];
  const voids = Array.from({ length: 4 }, () => new Set());
  for (const trick of [...v.tricks.map((t) => t.cards), v.trick]) if (trick.length) for (const p of trick) if (suit(p.card) !== suit(trick[0].card)) voids[p.seat].add(suit(trick[0].card));
  const seen = new Set([...played.map((p) => p.card), ...known.filter(Boolean).flat()]);
  const unseen = Array.from({ length: 52 }, (_, i) => i).filter((c) => !seen.has(c));
  return { known, voids, unseen, played };
}
function sampleDeals(v, actor, count = 8) {
  const k = knowledge(v, actor), hidden = DIRS.map((_, i) => i).filter((s) => !k.known[s]);
  const rng = random(hash(JSON.stringify([v.board, v.contract, v.auction, v.current, k.known, k.played])));
  const models = DIRS.map((_, s) => inferBid(v, s)), output = [];
  for (let sample = 0; sample < count; sample++) {
    const hands = k.known.map((h) => h ? [...h] : []), capacity = v.counts.map((n, s) => k.known[s] ? 0 : n);
    const cards = k.unseen.map((c) => ({ c, tie: rng(), seats: hidden.filter((s) => !k.voids[s].has(suit(c))) })).sort((a, b) => a.seats.length - b.seats.length || a.tie - b.tie);
    let nodes = 0;
    function assign(i) {
      if (++nodes > 4000) return false;
      if (i === cards.length) return capacity.every((n) => n === 0);
      for (const s of hidden) if (capacity[s] > cards.slice(i).filter((c) => c.seats.includes(s)).length) return false;
      const choices = cards[i].seats.filter((s) => capacity[s] > 0).map((s) => ({ s, order: rng() * capacity[s] })).sort((a, b) => b.order - a.order);
      for (const { s } of choices) { hands[s].push(cards[i].c); capacity[s]--; if (assign(i + 1)) return true; capacity[s]++; hands[s].pop(); }
      return false;
    }
    if (!assign(0)) continue;
    let penalty = 0;
    for (const s of hidden) {
      const original = [...hands[s], ...k.played.filter((p) => p.seat === s).map((p) => p.card)], h = handInfo(original), m = models[s];
      penalty += Math.max(0, m.min - h.hcp, h.hcp - m.max) * .13;
      penalty += m.lengths.reduce((n, min, i) => n + Math.max(0, min - h.lengths[i]) * .35, 0);
    }
    output.push({ hands, weight: Math.max(.02, Math.exp(-penalty)) });
  }
  return output;
}
function legal(hand, trick) { return Trick.generatePlayableCards(trick.map((p) => OBJECTS[p.card]), hand.map((c) => OBJECTS[c])).map(Card.cardToNumber); }
function currentWinner(trick, trump) {
  let best = trick[0]; for (const p of trick.slice(1)) if (Card.compare(OBJECTS[best.card], OBJECTS[p.card], trump) < 0) best = p; return best;
}
const cheapest = (cards) => [...cards].sort((a, b) => rank(b) - rank(a) || a - b)[0];
function rollCard(hands, turn, trick, trump) {
  const hand = hands[turn], choices = legal(hand, trick); if (choices.length === 1) return choices[0];
  const opponents = hands.filter((_, s) => s % 2 !== turn % 2).flat();
  if (!trick.length) {
    const winners = choices.filter((c) => !opponents.some((o) => suit(o) === suit(c) && rank(o) < rank(c)));
    const safe = winners.filter((c) => opponents.every((o) => SUITS[suit(o)] !== trump) || SUITS[suit(c)] === trump || [1, 3].every((offset) => hands[(turn + offset) % 4].some((o) => suit(o) === suit(c))));
    if (safe.length) return cheapest(safe);
    const lengths = handInfo(hand).lengths, s = lengths.indexOf(Math.max(...lengths));
    const sequence = hand.filter((c) => suit(c) === s && hand.includes(c + 1) && rank(c) <= 3);
    return sequence[0] ?? cheapest(hand.filter((c) => suit(c) === s));
  }
  const best = currentWinner(trick, trump), winning = choices.filter((c) => Card.compare(OBJECTS[best.card], OBJECTS[c], trump) < 0);
  if (best.seat % 2 === turn % 2) {
    const remaining = 4 - trick.length - 1;
    let threatened = false;
    for (let offset = 1; offset <= remaining; offset++) {
      const next = (turn + offset) % 4;
      if (next % 2 !== turn % 2 && legal(hands[next], trick).some((c) => Card.compare(OBJECTS[best.card], OBJECTS[c], trump) < 0)) threatened = true;
    }
    if (!threatened) return cheapest(choices);
  }
  return cheapest(winning.length ? winning : choices);
}
function play(state, card, trump) {
  const s = state.turn; state.hands[s].splice(state.hands[s].indexOf(card), 1); state.trick.push({ seat: s, card });
  if (state.trick.length === 4) {
    const winner = DIRS.indexOf(Trick.evaluate(state.trick.map((p) => OBJECTS[p.card]), DIRS[state.trick[0].seat], trump));
    state.won[winner % 2]++; state.turn = winner; state.trick = [];
  } else state.turn = (s + 1) % 4;
}
function rollout(state, trump) {
  while (state.hands.some((h) => h.length)) play(state, rollCard(state.hands, state.turn, state.trick, trump), trump);
  return state.won[0];
}
function copy(s) { return { hands: s.hands.map((h) => [...h]), turn: s.turn, trick: [...s.trick], won: [...s.won] }; }
// Bounded minimax for small endings, with rollout evaluation at the node limit.
function ending(state, trump, budget, alpha = -1, beta = 14) {
  if (!state.hands.some((h) => h.length)) return state.won[0];
  if (--budget.nodes < 0) return rollout(copy(state), trump);
  const maximize = state.turn % 2 === 0; let best = maximize ? -1 : 14;
  const choices = legal(state.hands[state.turn], state.trick).sort((a, b) => rank(a) - rank(b));
  for (const c of choices) {
    const next = copy(state); play(next, c, trump); const value = ending(next, trump, budget, alpha, beta);
    best = maximize ? Math.max(best, value) : Math.min(best, value);
    if (maximize) alpha = Math.max(alpha, best); else beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}
function preference(v, actor, c, style) {
  const p = profile(style), h = v.hands[v.current], trump = v.contract.strain;
  const seen = new Set(playedCards(v).map((p) => p.card)), own = new Set(h);
  const remainingHigher = Array.from({ length: rank(c) }, (_, r) => suit(c) * 13 + r).filter((n) => !seen.has(n) && !own.has(n));
  let value = rank(c) * .001;
  if (!v.trick.length) {
    value += handInfo(h).lengths[suit(c)] * .006;
    if (!remainingHigher.length) value += .05 + p.attack * .03;
    if (h.includes(c + 1) && rank(c) <= 3) value += .04 + p.attack * .03;
    const partner = inferBid(v, (v.current + 2) % 4); value += partner.lengths[suit(c)] * p.partner * .015;
    if (SUITS[suit(c)] !== trump && rank(c) !== 0 && remainingHigher.length && h.some((n) => suit(n) === suit(c) && rank(n) === 0)) value -= .03;
  } else {
    const best = currentWinner(v.trick, trump);
    if (best.seat % 2 === actor % 2 && Card.compare(OBJECTS[best.card], OBJECTS[c], trump) < 0) value -= .04;
  }
  return value;
}
function chooseCard(v, actor, style = 0) {
  const choices = v.legalCards; if (choices.length === 1) return choices[0];
  const deals = sampleDeals(v, actor), p = profile(style), trump = v.contract.strain, declarer = DIRS.indexOf(v.contract.declarer);
  const smallEnding = v.counts.every((n) => n <= 3), candidates = [];
  for (const card of choices) {
    let sum = 0, squares = 0, weights = 0;
    for (const deal of deals) {
      const state = { hands: deal.hands.map((h) => [...h]), turn: v.current, trick: [...v.trick], won: [...v.won] };
      play(state, card, trump);
      const ns = smallEnding ? ending(state, trump, { nodes: 1800 }) : rollout(state, trump), tricks = declarer % 2 === 0 ? ns : 13 - ns;
      const value = Score.calculate(v.contract, v.vulnerability, tricks).score / 100 * (actor % 2 === 0 ? 1 : -1);
      sum += value * deal.weight; squares += value * value * deal.weight; weights += deal.weight;
    }
    const mean = weights ? sum / weights : 0, variance = weights ? Math.max(0, squares / weights - mean * mean) : 0;
    candidates.push({ card, value: mean + p.risk * Math.sqrt(variance) + preference(v, actor, card, style) });
  }
  candidates.sort((a, b) => b.value - a.value || rank(b.card) - rank(a.card) || a.card - b.card);
  return candidates[0]?.card;
}
function chooseAction(view, actor, style = 0) {
  if (view.controller !== actor) return null;
  return view.phase === "auction" ? { type: "call", call: chooseBid(view, actor, style) } : { type: "play", card: chooseCard(view, actor, style) };
}
module.exports = { chooseAction, chooseBid, chooseCard, sampleDeals, knowledge, inferBid, handInfo, profileCount: profiles.length };
