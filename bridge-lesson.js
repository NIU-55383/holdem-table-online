"use strict";

const E = require("./bridge-engine");
const Bot = require("./bridge-bot");
const suits = ["♠", "♥", "♦", "♣"], ranks = "AKQJT98765432", dirs = ["N", "E", "S", "W"];
const pair = (zh, en) => ({ zh, en });
const suit = (card) => Math.floor(card / 13);
const cardName = (card) => `${suits[suit(card)]}${ranks[card % 13].replace("T", "10")}`;
const auction = ["1NT", "P", "3NT", "P", "P", "P"];

function create(names) {
  const game = E.createGame(names);
  // Original teaching deal: a balanced 16-HCP opener, 12-HCP partner, and clubs to develop.
  const deal = [
    ["AK6", "K72", "Q84", "A963"], ["JT98", "QJ6", "A92", "KT5"],
    ["Q52", "A83", "K65", "QJ84"], ["743", "T954", "JT73", "72"]
  ];
  game.hands = deal.map((hand) => hand.flatMap((cards, s) => [...cards].map((rank) => s * 13 + ranks.indexOf(rank))).sort((a, b) => a - b));
  game.originalHands = game.hands.map((hand) => [...hand]);
  return game;
}

function act(game, actor, action) {
  if (game.phase === "auction" && action?.call !== auction[game.auction.length]) {
    const opening = game.auction.length === 0;
    throw new Error(opening
      ? "这手有 16 点、均型。本课先叫 1NT：向搭档表示 15–17 点，不必直接跳到高阶。 / With a balanced 16 HCP, bid 1NT in this lesson to describe 15–17 HCP to partner."
      : "搭档已叫到 3NT，本课选择不叫，承诺合力拿到 9 墩；继续加阶会增加任务。 / Partner has bid 3NT. Pass in this lesson: aim for nine tricks together; bidding higher raises the target.");
  }
  return E.act(game, actor, action);
}

function next(game) {
  if (game.phase === "trick") return E.advanceTrick(game);
  const actor = E.controller(game);
  if (actor <= 0 || game.phase === "over") throw new Error("请先完成你的行动 / Make your move first");
  if (game.phase === "auction") return act(game, actor, { type: "call", call: auction[game.auction.length] });
  // Opening from a sequence gives the first trick a clear, explainable shape.
  const action = !game.tricks.length && !game.trick.length
    ? { type: "play", card: 3 } : E.chooseBotAction(game, actor);
  return E.act(game, actor, action);
}

function countCards(view) {
  const played = new Set([...view.tricks.flatMap((t) => t.cards), ...view.trick].map((p) => p.card));
  const known = view.hands.filter(Boolean).flat();
  const seen = new Set([...known, ...played]);
  return suits.map((symbol, s) => {
    const remaining = Array.from({ length: 13 }, (_, r) => s * 13 + r).filter((c) => !played.has(c));
    const unknown = remaining.filter((c) => !seen.has(c));
    const voids = new Set();
    for (const trick of [...view.tricks.map((t) => t.cards), view.trick]) {
      if (!trick.length || suit(trick[0].card) !== s) continue;
      trick.filter((p) => suit(p.card) !== s).forEach((p) => voids.add(p.seat));
    }
    let topRun = 0;
    for (const c of remaining) { if (!known.includes(c)) break; topRun++; }
    const length = Math.max(0, ...view.hands.filter(Boolean).map((h) => h.filter((c) => suit(c) === s).length));
    return { symbol, played: [...played].filter((c) => suit(c) === s).length,
      held: known.filter((c) => suit(c) === s).length, unseen: unknown.length,
      honors: unknown.filter((c) => c % 13 < 4).map(cardName), voids: [...voids].map((seat) => dirs[seat]),
      topRun: Math.min(length, topRun) };
  });
}

function topCard(view) {
  if (!view.trick.length) return null;
  return view.trick.filter((p) => suit(p.card) === suit(view.trick[0].card))
    .reduce((best, p) => !best || p.card < best.card ? p : best, null);
}

function cardReason(view, card) {
  const led = view.trick[0], top = topCard(view), symbol = suits[suit(card)];
  if (!led) {
    const count = countCards(view)[suit(card)];
    if (suit(card) === 3 && count.honors.includes("♣K") && count.held >= 6) return pair(
      `领出 ${cardName(card)}，目的是建立梅花。对手的 K 还没出现，让 Q/J 与它交锋；即使先输一墩，也可能把后续梅花变成赢张。`,
      `Lead ${cardName(card)} to develop clubs. The opposing king is still unaccounted for; challenge it with Q/J. Losing a trick now may establish later club winners.`);
    const played = new Set(view.tricks.flatMap((t) => t.cards.map((p) => p.card)));
    const highest = Array.from({ length: 13 }, (_, r) => suit(card) * 13 + r).find((c) => !played.has(c));
    if (card === highest) return pair(
      `${cardName(card)} 已是这门花色剩下最大的牌。这副无将，它是可以兑现的赢张；仍要注意不要把搭档同门的大牌一起消耗掉。`,
      `${cardName(card)} is the highest remaining card in this suit. In no trumps it is a cashable winner; avoid wasting partner's honors on the same trick.`);
    if (view.hands[(view.current + 2) % 4]?.includes(highest)) return pair(
      `领出 ${cardName(card)}，可以用另一手的 ${cardName(highest)} 接过去。这叫利用进张：赢这一墩，也把下一墩的出牌权交给那手。`,
      `Lead ${cardName(card)} toward ${cardName(highest)} in the other hand. This uses an entry: win the trick there and let that hand lead next.`);
    return pair(
      `领出 ${cardName(card)}，这一墩就由${symbol}开始。两手合起来规划，不要把所有进明手的大牌过早用完。`,
      `Leading ${cardName(card)} starts a ${symbol} trick. Plan both hands together; keep high-card entries to dummy for later.`);
  }
  if (suit(card) !== suit(led.card)) return pair(
    `你没有${suits[suit(led.card)]}，可以垫 ${cardName(card)}。本副无将，垫别的花色不能赢这墩；优先保留有机会成赢张的牌。`,
    `You are void in ${suits[suit(led.card)]}, so ${cardName(card)} is legal. In no trumps, an off-suit discard cannot win; keep cards that may become winners.`);
  const partner = top.seat % 2 === 0, winsNow = card < top.card;
  if (partner && !winsNow) return pair(
    `${cardName(card)} 跟出首引花色。目前是己方的 ${cardName(top.card)} 最大，通常不必再花一张大牌；后面没出的人仍可能超越。`,
    `${cardName(card)} follows suit. Your side's ${cardName(top.card)} is currently high, so usually save honors; a player still to act may overtake it.`);
  if (winsNow) return pair(
    `${cardName(card)} 跟花色，且暂时压过 ${cardName(top.card)}。若后面没人超越，它就赢墩；能赢的牌不止一张时，考虑用较小的。`,
    `${cardName(card)} follows suit and overtakes ${cardName(top.card)} for now. It wins unless overtaken; consider the cheapest card that can do the job.`);
  return pair(
    `${cardName(card)} 合法跟牌，但压不过 ${cardName(top.card)}。留住大牌有时比抢这一墩好，尤其还要建立长套时。`,
    `${cardName(card)} legally follows, but cannot beat ${cardName(top.card)}. Saving honors can be better than contesting this trick, especially while developing a long suit.`);
}

function recommend(view) {
  const legal = view.legalCards, top = topCard(view);
  const low = (cards) => [...cards].sort((a, b) => b % 13 - a % 13)[0];
  if (top) {
    const following = legal.filter((c) => suit(c) === suit(view.trick[0].card));
    if (following.length) {
      const winners = following.filter((c) => c < top.card);
      return { type: "play", card: top.seat % 2 === 0 || !winners.length ? low(following) : low(winners) };
    }
    return Bot.chooseAction(view, 0);
  }
  const counts = countCards(view), hand = view.hands[view.current], partner = view.hands[(view.current + 2) % 4] || [];
  const clubs = hand.filter((c) => suit(c) === 3);
  if (clubs.length && counts[3].honors.includes("♣K") && counts[3].held >= 6) {
    // Lead toward dummy's Q/J or lead that sequence, without locating the unseen king.
    const sequence = clubs.filter((c) => [2, 3].includes(c % 13));
    return { type: "play", card: sequence.length ? Math.min(...sequence) : low(clubs) };
  }
  const suitsByLength = [0, 1, 2, 3].sort((a, b) => counts[b].held - counts[a].held);
  const played = new Set(view.tricks.flatMap((t) => t.cards.map((p) => p.card)));
  for (const s of suitsByLength) {
    const mine = hand.filter((c) => suit(c) === s); if (!mine.length) continue;
    const highest = Array.from({ length: 13 }, (_, r) => s * 13 + r).find((c) => !played.has(c));
    if (mine.includes(highest)) return { type: "play", card: highest };
    if (partner.includes(highest)) return { type: "play", card: low(mine) };
  }
  return Bot.chooseAction(view, 0);
}

function coach(view) {
  const counts = countCards(view), result = { title: null, paragraphs: [], tip: null, counts, recommendation: null, cardNotes: {}, canContinue: false };
  const add = (zh, en) => result.paragraphs.push(pair(zh, en));
  if (view.phase === "auction") {
    const n = view.auction.length;
    result.title = pair(n === 0 ? "先描述你的牌，不是比谁叫得高" : n >= 4 ? "9 墩够了，停在 3NT" : "听听搭档怎么回应", n === 0 ? "Describe your hand, not the highest bid" : n >= 4 ? "Nine tricks: stop at 3NT" : "Listen to partner's response");
    if (!n) {
      add("你坐北，南是搭档。你的 A/K/Q/J 共 16 个大牌点，四个花色有 3、3、3、4 张，是均型。先叫 1NT，告诉搭档你的实力。", "You are North; South is partner. Your A/K/Q/J total 16 high-card points (HCP), with a balanced 3-3-3-4 shape. Open 1NT to describe that strength.");
      add("1NT 暂时承诺拿 7 墩，但搭档可以继续叫高。大牌点是估牌工具，不是结算分，也不等于能赢的墩数。", "1NT provisionally promises seven tricks; partner can raise. HCP evaluates strength: it is neither the final score nor a guaranteed trick count.");
    } else if (n < 3) {
      add("你的 1NT 表示均型、15–17 点。东先不叫，再轮到南。教学叫牌按固定示例进行，之后的出牌可自己选择。", "Your 1NT shows a balanced 15–17 HCP. East passes, then South responds. The lesson uses a fixed auction; you can choose freely during play.");
    } else {
      add("南叫 3NT：要与北合力赢 9 墩，没有将牌。你已经说明自己的牌力，选择不叫即可；再叫 4NT 就要 10 墩。", "South bids 3NT: your partnership must win nine tricks, with no trump suit. You have already described your strength, so pass; 4NT would require ten.");
      add("这副双方无局，未加倍 3NT 正好完成得 400 分；同样赢 9 墩但只订 1NT 得 150 分。叫到有把握的成局可多得奖励，但叫过头会宕约。", "Neither side is vulnerable: an undoubled 3NT made exactly scores 400; 1NT with the same nine tricks scores 150. A sound game bid earns a bonus, but overbidding risks defeat.");
    }
    result.tip = pair("常见成局定约：3NT 要 9 墩，4♥/4♠ 要 10 墩，5♣/5♦ 要 11 墩。约 25 个联合大牌点是考虑 3NT 的起点，不是保证。", "Common game contracts: 3NT needs nine tricks, 4♥/4♠ ten, and 5♣/5♦ eleven. Around 25 combined HCP is a starting guide for 3NT, not a guarantee.");
    if (view.controller === 0) result.recommendation = { type: "call", call: auction[n] };
    else result.canContinue = true;
  } else if (view.phase === "over") {
    const taken = view.won[0], made = taken >= 9;
    result.title = pair(made ? "定约完成！回看你怎么赢的" : "这次宕约了，来看看差在哪", made ? "Contract made! Review your play" : "Down this time: review the hand");
    add(`南北拿到 ${taken} 墩，目标 9 墩；东西拿到 ${view.won[1]} 墩。${made ? "南北得分" : "东西得分"}：${Math.abs(view.result.score)}。`, `NS took ${taken} tricks against a target of nine; EW took ${view.won[1]}. ${made ? "NS" : "EW"} scores ${Math.abs(view.result.score)}.`);
    add(made ? `本副 3NT 无局、未加倍：定约墩分 100 + 成局奖 300${taken > 9 ? ` + ${taken - 9} 个超墩 × 30` : ""}。不是每赢一墩就得 100 分。` : `本副无局、未加倍：少 ${9 - taken} 墩，每墩罚 50 分。下次先规划 9 墩的来源，再动手。`, made ? `Non-vulnerable, undoubled 3NT: 100 contract points + 300 game bonus${taken > 9 ? ` + ${taken - 9} overtricks × 30` : ""}. A trick is not automatically worth 100 points.` : `Non-vulnerable and undoubled: ${9 - taken} undertricks at 50 each. Next time, plan where nine tricks might come from before playing.`);
    add("这只是一副练习。普通房间累计多副的分数，最终总分高的一队胜。可以重练同一副，或离开教学去开正常房间。", "This is one practice board. Normal rooms total scores across several boards; the higher total wins. Replay this deal or leave the lesson to create a normal room.");
    result.tip = pair("复盘每墩：是否跟花色？搭档能赢时是否浪费大牌？有没有保留进入长套那手的牌？记牌是否只用了已知信息？", "Review each trick: did you follow suit, save honors when partner was high, preserve entries to long suits, and count only known information?");
  } else if (view.phase === "trick") {
    const trick = view.lastTrick, winning = trick.cards.find((p) => p.seat === trick.winner);
    result.title = pair(`第 ${view.tricks.length} 墩：${dirs[trick.winner]} 赢`, `Trick ${view.tricks.length}: ${dirs[trick.winner]} wins`);
    add(`首引花色是${suits[suit(trick.cards[0].card)]}，${cardName(winning.card)} 是其中最大的牌。这副是无将，其他花色再大也不能将吃。${dirs[trick.winner]} 下一墩先出。`, `The led suit was ${suits[suit(trick.cards[0].card)]}; ${cardName(winning.card)} is its highest card. This is no trumps, so off-suit cards cannot trump it. ${dirs[trick.winner]} leads next.`);
    add(`己方已得 ${view.won[0]} 墩，${view.won[0] >= 9 ? "目标已经达到；继续打完，再算超墩" : `还需要 ${9 - view.won[0]} 墩`}。看完四张牌再收墩。`, `Your side has ${view.won[0]} tricks; ${view.won[0] >= 9 ? "the target is secure. Finish the hand to count overtricks" : `${9 - view.won[0]} more are needed`}. Check all four cards before collecting.`);
    result.tip = pair("记牌先从一个花色开始：每门共 13 张。减去已经打出的、你手里的、明手里的，剩下才是两位防家合计持有的；不能据此确定谁拿哪张。", "Start counting one suit: 13 cards minus those played, in your hand and in dummy leaves the defenders' combined holding. It does not locate individual cards.");
    result.canContinue = true;
  } else {
    const active = view.controller === 0;
    result.title = pair(!view.dummyVisible ? "定约成立：你是庄家，东先攻" : active ? view.current === view.dummy ? "替搭档的明手出牌" : "轮到你的手牌" : `看 ${dirs[view.current]} 怎么防守`, !view.dummyVisible ? "Contract set: you declare, East leads" : active ? view.current === view.dummy ? "Play a card from dummy" : "Play from your own hand" : `Watch ${dirs[view.current]} defend`);
    if (!view.dummyVisible) {
      add("最终是 3NT。你是南北最先叫过 NT 的人，所以由你做庄家，即使最后叫 3NT 的是搭档。南是明手，东（你的左手方）先出第一张牌。", "The contract is 3NT. You first bid NT for NS, so you declare even though partner bid 3NT last. South is dummy; East, to your left, leads the first card.");
      add("本副要南北合计拿 9 墩，不是两个人各拿 9 墩。东西只要赢到 5 墩，就能让你完不成定约。", "NS need nine tricks together, not nine each. Five tricks for EW are enough to defeat the contract.");
    } else if (!view.tricks.length && view.trick.length === 1) {
      add("首攻后，南的 13 张牌公开。你现在看到自己的牌和明手；两位防家的牌仍然盖着。轮到南时，由你替南选牌，不是从北的牌里出。", "After the opening lead, South's 13 cards are exposed. You see your hand and dummy, but not the defenders' hands. On South's turn, choose from dummy, not North.");
      add("先数现成赢张：♠A/K/Q 有 3 墩，♥A/K 有 2 墩，♣A 有 1 墩，共 6 墩。还差 3 墩，可从梅花长套和方块想办法；别只顾着把 A 全打掉。", "Count immediate winners: ♠A/K/Q give three, ♥A/K two, and ♣A one: six total. Develop clubs and diamonds for the three more you need; do not simply cash every ace.");
    } else if (active) {
      add(view.trick.length ? `这一墩先出了${suits[suit(view.trick[0].card)]}。有这个花色就必须跟，没有才能垫别的。先比较桌上的牌，再选手牌。` : "你赢了上一墩，可以决定下一墩从哪门花色开始。先看看目标还差几墩，再考虑建立长套或兑现赢张。", view.trick.length ? `This trick was led in ${suits[suit(view.trick[0].card)]}. Follow that suit if you hold it; discard only if void. Compare the cards on the table before choosing.` : "You won the last trick, so choose which suit to lead. Check how many tricks you still need, then develop a long suit or cash winners.");
    } else add("防家也必须跟花色。他们会争取把你的 3NT 打宕；每次只推进一张牌，你可以先记下刚出的花色和大牌。", "Defenders must also follow suit and try to defeat 3NT. Advance one card at a time, noting the suit and honors played.");
    if (active) {
      result.recommendation = recommend(view);
      for (const card of view.legalCards) result.cardNotes[card] = cardReason(view, card);
      result.reason = result.cardNotes[result.recommendation.card];
    } else result.canContinue = true;
    const clubs = counts[3];
    result.tip = !view.dummyVisible ? pair("庄家的左手方首攻。等明手公开后，先数直接赢张，再安排出牌次序和两手之间的进张。", "Declarer's left-hand opponent leads. Once dummy appears, count ready winners and plan the order of play and entries between the hands.") : pair(clubs.honors.includes("♣K")
      ? "梅花共 13 张，己方起初 8 张，对手合计 5 张。♣K 还没出现：Q/J 暂时不能当作必胜张。让对手用掉 K 后，Q/J 或长套小牌才可能升值；还要留好进张。"
      : `♣K 已不在防家未知牌中。梅花已出 ${clubs.played} 张，己方剩 ${clubs.held} 张，对手未知 ${clubs.unseen} 张。小牌只有在对手同花色大牌都出完后才可能成为赢张。`,
      clubs.honors.includes("♣K")
        ? "NS began with eight clubs, leaving five for EW. The ♣K is still unaccounted for: Q/J are not sure winners yet. Driving out the king may promote honors or long cards; preserve an entry to reach them."
        : `The ♣K is no longer an unknown defender card. Clubs: ${clubs.played} played, ${clubs.held} held by NS, ${clubs.unseen} unknown. A small card can become a winner only after higher opposing cards in its suit are gone.`);
  }
  return result;
}

module.exports = { create, act, next, coach, countCards, cardReason, cardName, auction, recommend };
