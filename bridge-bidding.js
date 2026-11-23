(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BridgeBidding = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SUITS = ["S", "H", "D", "C"], SYMBOLS = ["♠", "♥", "♦", "♣"];
  const pair = (zh, en) => ({ zh, en });
  const display = (call) => call === "P" ? "Pass" : call.replace(/[SHDC]$/, (s) => SYMBOLS[SUITS.indexOf(s)]);

  // Hints consume the same private snapshot as the human player. Never inspect another seat.
  function analyze(view, you) {
    if (!view || view.phase !== "auction" || !Number.isInteger(you) || you < 0 || you > 3) return null;
    const hand = view.hands?.[you];
    if (!Array.isArray(hand) || hand.length !== 13 || new Set(hand).size !== 13 || hand.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) return null;
    const honors = { A: 0, K: 0, Q: 0, J: 0 }, lengths = [0, 0, 0, 0];
    for (const c of hand) { lengths[Math.floor(c / 13)]++; if (c % 13 < 4) honors[["A", "K", "Q", "J"][c % 13]]++; }
    const hcp = honors.A * 4 + honors.K * 3 + honors.Q * 2 + honors.J;
    const shape = [...lengths].sort((a, b) => b - a).join("");
    const balanced = ["4333", "4432", "5332"].includes(shape);
    const vulnerable = you % 2 === 0 ? ["VNv", "VV"].includes(view.vulnerability) : ["NvV", "VV"].includes(view.vulnerability);
    const result = { hcp, honors, lengths, balanced, vulnerable, recommendation: null, notes: [] };
    const note = (zh, en) => result.notes.push(pair(zh, en));
    const legal = Array.isArray(view.legalCalls) ? view.legalCalls : [];
    const active = view.controller === you && view.current === you;
    const suggest = (call, zh, en) => {
      if (active && legal.includes(call)) result.recommendation = { call, zh, en };
      else if (active) note("当前叫牌已不允许这个选择，请按最新叫牌记录重新判断。", "That call is no longer legal; use the current auction to reassess.");
    };
    note("按本馆的简化自然叫牌判断：五张高花、强无将；真人搭档若采用其他约定，请以双方约定为准。", "These hints use the club's simplified natural methods: five-card majors and a strong notrump. Follow your partnership's agreements if different.");
    if (vulnerable) note("本方有局：宕约时给防守方的罚分通常更多，弱牌争叫或阻击要更谨慎。", "Your side is vulnerable: defenders usually score larger penalties if you go down, so be more cautious with weak competitive bids or preempts.");
    if (!active) {
      note("还没轮到你。点数先供参考，轮到你时会结合最新叫牌给出提示。", "It is not your turn. Review your points now; guidance updates with the auction when your turn arrives.");
      return result;
    }
    if (!Array.isArray(view.auction) || view.auction.some((a) => !a || !Number.isInteger(a.seat) || a.seat < 0 || a.seat > 3 || !/^(?:P|X|XX|[1-7](?:C|D|H|S|NT))$/.test(a.call))) {
      note("叫牌记录不完整，暂不推荐具体叫品。", "The auction record is incomplete, so no specific call is suggested."); return result;
    }
    const calls = view.auction, bids = calls.filter((a) => /^[1-7]/.test(a.call));
    const partner = (you + 2) % 4, ownCalls = calls.filter((a) => a.seat === you);
    const longest = [0, 1, 2, 3].sort((a, b) => lengths[b] - lengths[a] || a - b)[0];
    const longMajor = [0, 1].filter((s) => lengths[s] >= 5).sort((a, b) => lengths[b] - lengths[a] || a - b)[0];
    if (!bids.length) {
      if (hcp >= 25 && hcp <= 27 && balanced) suggest("3NT", `你有 ${hcp} 点，且是均型牌。本馆把 25–27 点均型牌开叫为 3NT。`, `You have ${hcp} HCP and a balanced hand. The club opens balanced 25–27 HCP with 3NT.`);
      else if (hcp >= 22) suggest("2C", `你有 ${hcp} 点，达到本馆强 2♣ 的 22 点门槛。这是表示强牌的约定叫，不保证梅花长。`, `Your ${hcp} HCP meet the club's 22-point strong 2C threshold. This artificial opening shows strength, not necessarily clubs.`);
      else if (balanced && hcp >= 20) suggest("2NT", `你有 ${hcp} 点，且是均型牌，符合 2NT 开叫的 20–21 点范围。`, `Your balanced ${hcp}-HCP hand fits the 20–21 HCP 2NT opening.`);
      else if (balanced && hcp >= 15 && hcp <= 17) suggest("1NT", `你有 ${hcp} 点，且是均型牌，符合 1NT 开叫的 15–17 点范围。`, `Your balanced ${hcp}-HCP hand fits the 15–17 HCP 1NT opening.`);
      else if (hcp >= 12) {
        const s = longMajor ?? (lengths[2] > lengths[3] || lengths[2] === lengths[3] && lengths[2] >= 4 ? 2 : 3);
        const call = `1${SUITS[s]}`;
        suggest(call, `你有 ${hcp} 点，达到通常 12 点起的开叫范围；${SYMBOLS[s]} 有 ${lengths[s]} 张，可先叫 ${display(call)} 描述牌型。`, `Your ${hcp} HCP meet the usual 12-point opening threshold. With ${lengths[s]} ${SUITS[s]} cards, start with ${display(call)} to describe your shape.`);
        if (balanced && hcp >= 18) note("18–19 点均型牌通常先开叫一阶花色；搭档在一阶应叫后，通常再跳叫 2NT 表示牌力。直接开叫 2NT 表示 20–21 点。", "With a balanced 18–19 HCP, usually open one of a suit, then jump-rebid 2NT after a one-level response. An immediate 2NT opening shows 20–21 HCP.");
        else if (!balanced && hcp >= 15) note("你的牌不是均型，不能只因点数落在无将范围就开叫无将。", "Your hand is unbalanced; points in a notrump range alone do not justify a notrump opening.");
      } else {
        const longPoints = [...lengths].sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
        const topHonors = hand.filter((c) => Math.floor(c / 13) === longest && c % 13 <= 2).length;
        const sideMajor = [0, 1].some((s) => s !== longest && lengths[s] >= 4);
        if (hcp >= 10 && hcp + longPoints >= 20) {
          note(`你有 ${hcp} 点，两门最长花色共 ${longPoints} 张，达到「20 法则」的边缘开叫参考值；牌型、座次和搭档约定都重要，暂不指定叫品。`, `Your ${hcp} HCP plus ${longPoints} cards in the two longest suits meet the rule-of-20 guideline for a light opening. Shape, position and partnership agreement still matter; no single call is specified.`);
        } else if (hcp >= 6 && hcp <= 10 && lengths[longest] === 6 && longest !== 3 && topHonors >= 2 && !sideMajor && calls.length < 3) {
          const call = `2${SUITS[longest]}`;
          suggest(call, `你有 ${hcp} 点，${SYMBOLS[longest]} 六张且含 A/K/Q 中至少两张，可考虑弱二开叫 ${display(call)}。它表示长花色弱牌，不表示 20 点。`, `With ${hcp} HCP and six ${SUITS[longest]} including at least two of A/K/Q, consider a weak ${display(call)} opening. It shows a weak long-suit hand, not 20 points.`);
          note("弱二适用于约定好的 2♦、2♥、2♠；2♣ 在本馆是强牌。第三、第四家或有局时尤其要结合局况判断。", "Weak twos here are 2D, 2H and 2S; 2C is strong. Position and vulnerability are especially important when preempting.");
        } else if (lengths[longest] >= 6) {
          note(`你有 ${hcp} 点，但 ${SYMBOLS[longest]} 有 ${lengths[longest]} 张，长套可能带来额外赢墩。阻击还要看大牌质量、座次和局况，不能只按点数决定。`, `You have ${hcp} HCP but ${lengths[longest]} cards in ${SUITS[longest]}; that length may produce extra tricks. Preempts also depend on suit quality, position and vulnerability.`);
        } else suggest("P", `目前无人开叫；你的 ${hcp} 点低于通常 12 点起的开叫范围，也没有明显的长套开叫条件，可先不叫。`, `Nobody has opened. Your ${hcp} HCP are below the usual 12-point opening range, without a clear long-suit exception; consider passing.`);
      }
      return result;
    }
    const interference = calls.some((a) => a.seat % 2 !== you % 2 && a.call !== "P") || calls.some((a) => a.call === "X" || a.call === "XX");
    if (interference) {
      note(`现在已有对手叫牌或加倍。你有 ${hcp} 点，最长的 ${SYMBOLS[longest]} 有 ${lengths[longest]} 张；争叫还要看套的质量、可叫阶数与局况，不能直接套用无人干扰的开叫点数表。`, `An opponent has bid or a double is present. You have ${hcp} HCP and ${lengths[longest]} cards in your longest suit, ${SUITS[longest]}. Competitive bidding also depends on suit quality, level and vulnerability; the opening-point table alone does not apply.`);
      note("加倍可能表示请求搭档选花色，也可能表示惩罚，要先按叫牌经过和双方约定判断。", "A double can be takeout or penalty; its meaning depends on the auction and your agreements.");
      return result;
    }
    if (ownCalls.length || bids.length !== 1 || bids[0].seat !== partner) {
      note("现在属于再叫或较复杂的叫牌。结合搭档已经表示的点数范围、双方同一花色是否合计至少八张，再决定停叫、邀请进局或继续叫牌；这里不指定一个叫品。", "This is a rebid or a more complex auction. Consider partner's shown strength and whether your side has at least eight cards in a suit before stopping, inviting or bidding on; no single call is specified here.");
      return result;
    }
    const opening = bids[0].call;
    if (opening === "2C") {
      suggest("2D", "搭档开叫强 2♣；本馆用 2♦ 等待应叫，让搭档继续描述强牌。它不保证你有方块，也不表示你的点数很少。", "Partner opened a strong 2C. The club uses a waiting 2D response so partner can describe the hand; it promises neither diamonds nor a weak hand.");
      return result;
    }
    if (opening === "1NT") {
      note(`按本馆约定，搭档的 1NT 表示 15–17 点均型牌；加上你的 ${hcp} 点，双方估计共有 ${hcp + 15}–${hcp + 17} 点。这是根据叫牌推测，未读取搭档的牌。`, `Under the club's methods, partner's 1NT shows a balanced 15–17 HCP. Adding your ${hcp} gives an estimated partnership range of ${hcp + 15}–${hcp + 17} HCP, inferred only from the auction.`);
      if (hcp >= 16) note("双方可能接近满贯牌力，但还要确认控制、缺门及是否会连丢两墩；不要仅凭点数直接叫满贯。", "Your side may have slam strength, but controls, shortages and quick losers still matter; do not bid slam from points alone.");
      else if (longMajor !== undefined) {
        const s = SUITS[longMajor];
        if (hcp <= 7) suggest(`2${s}`, `你有 ${hcp} 点和至少五张 ${SYMBOLS[longMajor]}。本馆采用自然应叫，可叫 2${SYMBOLS[longMajor]} 表示弱牌，希望停在该花色。`, `With ${hcp} HCP and at least five ${s}, the club's natural 2${s} response shows a weak hand and asks to stop there.`);
        else if (hcp >= 10) suggest(`3${s}`, `你有 ${hcp} 点和至少五张 ${SYMBOLS[longMajor]}。自然应叫 3${SYMBOLS[longMajor]} 表示有进局实力，让搭档在高花进局与 3NT 之间选择。`, `With ${hcp} HCP and at least five ${s}, a natural 3${s} response shows game-going strength and lets partner choose between the major game and 3NT.`);
        else note("你有邀请进局的点数和五张高花。如何同时表示这两点需要搭档约定；本馆的二阶高花应叫表示弱牌、三阶表示进局实力，暂不指定叫品。", "You have invitational strength with a five-card major. Showing both needs agreement: the club's two-level major response is weak and its three-level response is game-going, so no call is specified here.");
      } else if (balanced) {
        if (hcp <= 7) suggest("P", `你有 ${hcp} 点；与搭档的 15–17 点相加，通常不足以主动邀请进局，可停在 1NT。`, `With ${hcp} HCP opposite 15–17, your side is usually short of an invitation; consider stopping in 1NT.`);
        else if (hcp <= 9) suggest("2NT", `你有 ${hcp} 点均型牌；可叫 2NT 邀请进局，让搭档持低限时不叫、较强时考虑 3NT。`, `With a balanced ${hcp} HCP, invite game with 2NT; partner can pass with a minimum or consider 3NT with extra strength.`);
        else suggest("3NT", `你有 ${hcp} 点均型牌，双方至少约 ${hcp + 15} 点，达到常用的约 25 点无将进局参考值，可考虑 3NT。`, `With your balanced ${hcp} HCP, the partnership has at least about ${hcp + 15}, reaching the usual roughly 25-HCP notrump-game guideline; consider 3NT.`);
      } else note("你不是均型牌，也没有五张高花。是否应转到低花或保留无将，还要看长套是否能赢墩；暂不按点数直接推荐无将。", "Your hand is unbalanced without a five-card major. Whether to move to a minor or keep notrump depends on your long suit's playing strength; no automatic notrump call is suggested.");
      return result;
    }
    if (!/^1[CDHS]$/.test(opening)) {
      note("搭档开叫的是二阶或更高的牌。本提示的普通应叫点数表只适用于一阶花色或 1NT；强开叫与阻击需要不同应对。", "Partner opened at the two level or higher. The ordinary response table applies to one-of-a-suit or 1NT; strong openings and preempts need different responses.");
      return result;
    }
    const openedSuit = SUITS.indexOf(opening.slice(1));
    if (hcp < 6) {
      if (lengths[longest] >= 6 || openedSuit < 2 && lengths[openedSuit] >= 4) note("你的大牌点不到 6，但长套或较多将牌可能补足牌力；是否加叫还要按支持点和搭档约定判断。", "You have fewer than 6 HCP, but long-suit or trump support may add playing strength; raising depends on support evaluation and agreement.");
      else suggest("P", `你有 ${hcp} 点，低于通常应叫所需的约 6 点，且没有明显长套或大量将牌支持，可先不叫。`, `Your ${hcp} HCP are below the usual roughly 6-point response threshold, without exceptional length or trump support; consider passing.`);
      return result;
    }
    if (openedSuit < 2 && lengths[openedSuit] >= 3) {
      const support = lengths.reduce((n, count, s) => n + (s === openedSuit ? 0 : count === 0 ? 3 : count === 1 ? 2 : count === 2 ? 1 : 0), 0);
      if (!balanced && support >= 3) note("你已有高花配合，短门能增加将吃机会；本栏的大牌点没有把这些支持点加进去，请结合牌型选择加叫高度。", "You have a major fit and useful shortages. The displayed HCP exclude support points; consider shape before choosing a raise level.");
      if (hcp >= 16 || !balanced && support >= 3) {
        note(`搭档的一阶高花通常至少五张，你有 ${lengths[openedSuit]} 张 ${SYMBOLS[openedSuit]}，双方至少 ${5 + lengths[openedSuit]} 张，已经找到配合；进一步叫多高还需评估支持点与控制。`, `Partner's one-major opening normally promises five cards. Your ${lengths[openedSuit]} ${SUITS[openedSuit]} establish at least a ${5 + lengths[openedSuit]}-card fit; the right level still depends on support points and controls.`);
      } else {
        const level = hcp <= 9 ? 2 : hcp <= 12 ? 3 : 4;
        suggest(`${level}${SUITS[openedSuit]}`, `你有 ${hcp} 点和 ${lengths[openedSuit]} 张 ${SYMBOLS[openedSuit]} 支持，双方至少八张配合。可${level === 2 ? "简单加叫到二阶" : level === 3 ? "加叫到三阶邀请进局" : "加叫到四阶进局"}。`, `You have ${hcp} HCP and ${lengths[openedSuit]}-card support, establishing an eight-card or longer fit. Consider ${level === 2 ? "a simple two-level raise" : level === 3 ? "a three-level invitation" : "a four-level game raise"}.`);
      }
      return result;
    }
    const newSuits = [0, 1, 2, 3].filter((s) => s !== openedSuit && lengths[s] >= 4).sort((a, b) => {
      if ((a < 2) !== (b < 2)) return a < 2 ? -1 : 1;
      return lengths[b] - lengths[a] || (lengths[a] >= 5 ? a - b : b - a);
    });
    const oneSuit = newSuits.find((s) => legal.includes(`1${SUITS[s]}`));
    if (oneSuit !== undefined) {
      suggest(`1${SUITS[oneSuit]}`, `你有 ${hcp} 点，且 ${SYMBOLS[oneSuit]} 至少四张；可在一阶叫出新花色，要求搭档至少再叫一次，继续寻找配合。`, `With ${hcp} HCP and at least four ${SUITS[oneSuit]}, respond in a new suit at the one level, asking partner to bid again and explore a fit.`);
    } else if (hcp >= 10) {
      const twoSuit = newSuits.find((s) => lengths[s] >= (s < 2 ? 5 : 4) && !legal.includes(`1${SUITS[s]}`) && legal.includes(`2${SUITS[s]}`));
      if (twoSuit !== undefined) suggest(`2${SUITS[twoSuit]}`, `你有 ${hcp} 点，${SYMBOLS[twoSuit]} 有 ${lengths[twoSuit]} 张；可非跳叫地应叫二阶新花色，要求搭档再叫。本馆不把它约定为自动逼叫到进局。`, `With ${hcp} HCP and ${lengths[twoSuit]} ${SUITS[twoSuit]}, consider a non-jump two-level new-suit response, forcing another call. The club does not treat it as an automatic game force.`);
      else if (balanced && hcp <= 15) {
        const call = hcp >= 13 ? "3NT" : hcp >= 11 ? "2NT" : "1NT";
        suggest(call, `你有 ${hcp} 点均型牌，尚未找到高花配合；按本馆自然应叫，${call === "3NT" ? "可考虑 3NT 进局" : call === "2NT" ? "可用 2NT 邀请进局" : "可用 1NT 表示有限牌力"}。`, `With a balanced ${hcp} HCP and no established major fit, the club's natural methods suggest ${call === "3NT" ? "3NT for game" : call === "2NT" ? "an invitational 2NT" : "a limited 1NT response"}.`);
      } else note("你的牌值得继续交流，但当前点数和牌型不足以直接确定应叫；先考虑描述长花色、寻找配合，再决定是否进局。", "Your hand merits further bidding, but points and shape do not identify a single response here; describe length and find a fit before choosing the level.");
    } else if (balanced) suggest("1NT", `你有 ${hcp} 点，没有三张高花支持，也不能在一阶叫出至少四张的新花色；可用 1NT 表示有限牌力。`, `With ${hcp} HCP, no three-card major support and no four-card new suit available at the one level, consider a limited 1NT response.`);
    else note("你有普通应叫牌力，但牌型不均衡且没有可在一阶叫出的新长花色。进一步应叫需结合低花支持及搭档约定，暂不指定叫品。", "You have response strength but an unbalanced hand without a new suit available at the one level. Further bidding depends on minor support and agreement; no single call is specified.");
    return result;
  }
  return Object.freeze({ analyze });
});
