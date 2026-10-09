"use strict";
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bilingual = (p, tag = "p") => `<${tag} class="lesson-copy">${esc(p.zh)}<span lang="en">${esc(p.en)}</span></${tag}>`;
  const text = (zh, en) => bilingual({ zh, en });
  const cardName = (id) => ["♠", "♥", "♦", "♣"][Math.floor(id / 13)] + ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"][id % 13];
  const titles = [
    ["第一课：桥牌的基本结构", "1. The basics of bridge"],
    ["第二课：怎样赢一墩牌？", "2. How do you win a trick?"],
    ["第三课：什么是将牌？", "3. What are trumps?"],
    ["第四课：叫牌与定约", "4. Bidding and the contract"],
    ["第五课：庄家与明手", "5. Declarer and dummy"],
    ["第六课：判断手牌的实力", "6. Evaluating your hand"],
    ["第七课：试着叫牌", "7. Choose your opening bid"],
    ["第八课：读懂搭档的叫牌", "8. Reading partner's bids"],
    ["术语回顾，准备实战", "Key terms and your practice board"]
  ];
  const suits = [["♠", "黑桃", "Spades"], ["♥", "红桃", "Hearts"], ["♦", "方块", "Diamonds"], ["♣", "梅花", "Clubs"]];
  const exampleHand = [[0, 1, 7, 11], [15, 16, 19, 23], [26, 31, 35], [40, 47]];
  const responseHand = [[1, 6, 9], [15, 18, 21], [29, 33, 36, 38], [44, 48, 50]];
  const glossary = [
    ["桥牌", "Contract Bridge"], ["搭档", "Partner"], ["对手", "Opponents"], ["花色", "Suit"],
    ["一墩", "Trick"], ["将牌", "Trump"], ["无将", "No Trump (NT)"], ["跟牌", "Follow Suit"],
    ["将吃", "Ruff"], ["叫牌", "Bidding"], ["定约", "Contract"], ["庄家", "Declarer"],
    ["明手", "Dummy"], ["防守方", "Defenders"], ["首攻", "Opening Lead"],
    ["大牌点", "High Card Points (HCP)"], ["牌型", "Distribution"], ["开叫", "Opening Bid"],
    ["叫牌体系", "Bidding System"], ["牌力", "Strength"], ["长套", "Long Suit"],
    ["配合", "Fit"], ["八张将牌配合", "Eight-card Trump Fit"], ["五张高花制", "Five-card Majors"],
    ["清将", "Drawing Trumps"], ["简单加叫", "Simple Raise"], ["支持点", "Support Points"],
    ["叫牌背景", "Auction Context"], ["逼叫性不叫", "Forcing Pass"], ["协议公开", "Disclosure"], ["应叫", "Response"]
  ];
  function create({ cardHTML, start, send, getState, focusAction }) {
    const dialog = document.querySelector("#lessonIntro"), coach = document.querySelector("#lessonCoach"), notebook = document.querySelector("#lessonNotebook");
    let page = 0, trickAnswer = null, bidAnswer = null, bidChecked = false, level = 4, strain = "♥", advanced = false, key = "";
    let responseAnswer = null, responseChecked = false;
    const cards = (ids) => ids.map((id) => cardHTML(id, false, false, "span")).join("");
    const heading = (zh, en) => bilingual({ zh, en }, "h3");
    const table = (label, headers, rows) => `<table class="lesson-reference"><caption>${esc(label)}</caption><thead><tr>${headers.map(([zh, en]) => `<th scope="col">${esc(zh)}<span lang="en">${esc(en)}</span></th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, i) => i === 0 ? `<th scope="row">${cell}</th>` : `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    function handDiagram(withPoints = false, hand = exampleHand, seat = "南家 / South") {
      return `<figure class="lesson-hand-example"><figcaption>你的 13 张手牌 <span lang="en">Your 13-card hand</span><small>${esc(seat)}</small></figcaption>${hand.map((ids, i) => `<div class="lesson-suit-row"><span class="lesson-suit-label ${i === 1 || i === 2 ? "red" : ""}" aria-label="${suits[i][1]} / ${suits[i][2]}">${suits[i][0]}</span><div class="lesson-suit-cards">${cards(ids)}</div>${withPoints ? `<span class="lesson-suit-points">${ids.reduce((sum, id) => sum + Math.max(0, 4 - id % 13), 0)} HCP</span>` : ""}</div>`).join("")}</figure>`;
    }
    function trickFeedback() {
      return trickAnswer === null ? "" : trickAnswer === 0
        ? text("对，南家的 ♠A 赢。无将时，只比较首引花色的大小。东家虽然出了 A，却是红桃，不能赢这一墩。", "Yes, South's ♠A wins. In no trumps, compare only cards of the led suit. East's ace is a heart, so it cannot win this trick.")
        : text("先看首引花色：黑桃。没有将牌，♥A 不能胜过黑桃；♠A 又大于 ♠K 和 ♠7，所以南家赢。", "Start with the led suit: spades. With no trumps, ♥A cannot beat a spade; ♠A beats both ♠K and ♠7, so South wins.");
    }
    function bidFeedback() {
      if (!bidChecked) return "";
      if (bidAnswer === "1NT") return text("答对了：1NT。17 点、4-4-3-2 均型，符合本题的 15–17 点开叫范围。你是在告诉搭档自己的实力与牌型，暂时承诺至少拿 7 墩；搭档可以根据自己的牌继续叫高。", "Correct: 1NT. Your balanced 4-4-3-2 hand has 17 HCP, within this problem's 15–17 range. You describe strength and shape to partner and provisionally promise seven tricks. Partner may raise with suitable cards.");
      if (bidAnswer === "2NT") return text("这手牌还不够开 2NT。本题采用的自然体系中，2NT 通常是 20–21 点均型；你只有 17 点，应开 1NT。", "This hand is not strong enough for 2NT. In the natural system used here, 2NT normally shows a balanced 20–21 HCP; with 17, open 1NT.");
      return text(`本题采用五张高花、15–17 点开 1NT 的自然体系。${bidAnswer === "1S" ? "黑桃" : "红桃"}只有 4 张，不适合开叫 ${bidAnswer === "1S" ? "1♠" : "1♥"}；17 点均型更适合用 1NT 描述。`, `This problem uses five-card majors and a 15–17 HCP 1NT opening. You have only four ${bidAnswer === "1S" ? "spades" : "hearts"}, so ${bidAnswer === "1S" ? "1♠" : "1♥"} is not the opening for this hand. 1NT describes your balanced 17 HCP.`);
    }
    function responseFeedback() {
      if (!responseChecked) return "";
      if (responseAnswer === "2H") return text("对，2♥。♠K 3 点、♥Q 2 点、♦J 1 点，合计 6 HCP；你还有三张红桃。搭档的 1♥ 表示至少五张红桃，所以双方至少有八张配合。这手牌没有短套加点，符合本题约定的 6–9 支持点简单加叫：告诉搭档有配合，但牌力有限，让搭档决定是否继续。", "Correct: 2♥. ♠K is 3, ♥Q is 2 and ♦J is 1: six HCP, plus three-card heart support. Partner's 1♥ shows at least five hearts, giving your side at least an eight-card fit. With no shortage points to add, your hand fits this problem's 6–9 support-point simple raise: show a fit and limited strength, then let partner decide whether to continue.");
      if (responseAnswer === "P") return text("这手牌可以支持搭档，不必不叫。你有 6 HCP、三张红桃，已经满足本题简单加叫的条件；叫 2♥ 能把这个配合告诉搭档。只有 6 点，不等于不能应叫。", "You have enough to support partner: six HCP and three hearts meet this problem's simple-raise requirements. Bid 2♥ to tell partner about the fit. Having only six points does not mean you must pass.");
      if (responseAnswer === "2S") return text("不选 2♠。你只有三张黑桃，也没有跳叫新花色所需的牌力；在本题的自然体系里，2♠ 会严重夸大这手牌。既然已找到红桃配合，用 2♥ 表达有限支持。", "Not 2♠. You have only three spades and lack the strength for a jump response in a new suit; 2♠ would greatly overstate this hand in the natural methods used here. With a heart fit already found, show limited support with 2♥.");
      return text("4♥ 承诺至少赢 10 墩；仅凭搭档开叫和自己的 6 点，还不足以确定该打成局。你只有三张支持、牌型也平，不能拿其他体系里的阻击性加叫来套这手牌。先叫 2♥，让搭档根据额外实力决定是否叫高。", "4♥ promises ten tricks. Partner's opening plus your six points does not yet justify game. With only three-card support and a flat hand, this is not a preemptive raise either. Start with 2♥ and let partner judge whether extra strength warrants bidding higher.");
    }
    function contractDemo() {
      return `<div class="lesson-contract"><strong>${level}${strain}</strong><span>6 + ${level} = <b>${level + 6}</b> 墩 / tricks</span></div>
        <div class="lesson-trick-meter" aria-label="${level + 6} / 13">${Array.from({ length: 13 }, (_, i) => `<span class="${i < 6 ? "base" : i < level + 6 ? "promised" : ""}">${i + 1}</span>`).join("")}</div>
        ${text(`赢到 ${level + 6} 墩就完成定约；对手拿到 ${8 - level} 墩就能让你宕约。${strain === "NT" ? "无将：没有花色能压过首引花色。" : `${strain}是将牌；没有首引花色时，才可出将牌将吃。`}`, `Take ${level + 6} tricks to make the contract; ${8 - level} for the opponents defeats it. ${strain === "NT" ? "No trumps: an off-suit card cannot beat the led suit." : `${strain} is trump. You may trump only when void in the led suit.`}`)}`;
    }
    function intro() {
      const bodies = [
        () => `${text("桥牌（Contract Bridge）是两人搭档、信息不完全的策略游戏。和德州扑克不同，你要通过叫牌、出牌和推理，和对面的搭档一起赢分。", "Contract Bridge is a partnership strategy game with incomplete information. Unlike Texas Hold'em, you work with the player opposite you, using bidding, card play and inference to score together.")}
          ${heading("先知道怎样赢", "First, know the goal")}
          ${text("每副先叫牌，约定己方至少要赢几墩，以及哪门花色是将牌。达到目标，定约方得分；没达到，防守方得分。普通房间打完指定副数后，累计分高的一队获胜。", "First bid to agree how many tricks your side promises and which suit, if any, is trump. Make that target and your side scores; fall short and the defenders score. In normal rooms, the higher total after the chosen number of boards wins.")}
          <div class="lesson-outcomes"><div><strong>3NT → 9 / 13</strong>${text("己方拿 9 墩，完成定约，己方得分。", "Take nine tricks: make the contract and score.")}</div><div><strong>3NT → 8 / 13</strong>${text("只拿 8 墩，宕一墩，防家得分。", "Take only eight: down one, defenders score.")}</div></div>
          ${heading("四个人，两支队伍", "Four players, two partnerships")}
          <div class="lesson-partners"><span>北 / North · N<br><b>搭档 / Partner</b></span><span>西 / West · W<br>对手 / Opponent</span><i data-lucide="handshake"></i><span>东 / East · E<br>对手 / Opponent</span><span>南 / South · S<br><b>你 / You</b></span></div>
          ${text("北与南一队，东与西一队。搭档叫 Partner，对手叫 Opponents。使用标准 52 张扑克牌，没有大小王，每人发 13 张。", "North and South are partners; East and West are partners. Your teammate is your partner, and the other pair are your opponents. Use a standard 52-card deck, without jokers, and deal 13 cards to each player.")}
          ${heading("四种花色", "The four suits")}
          <div class="lesson-suits">${suits.map(([symbol, zh, en], i) => `<div><strong class="${i === 1 || i === 2 ? "red" : ""}">${symbol}</strong><b>${zh}</b><span lang="en">${en}</span></div>`).join("")}</div>
          <p class="lesson-rank-order">A &gt; K &gt; Q &gt; J &gt; 10 &gt; 9 &gt; 8 &gt; 7 &gt; 6 &gt; 5 &gt; 4 &gt; 3 &gt; 2</p>
          ${text("每种花色有 13 张，A（Ace）最大，其次 K（King）、Q（Queen）、J（Jack），再到 10 至 2。出牌时，黑桃并不天然大于红桃；花色等级只用在叫牌中。", "Each suit has 13 cards: Ace is highest, then King, Queen, Jack, and 10 down to 2. In card play, spades do not automatically beat hearts. The ranking of suits is used only in bidding.")}`,
        () => `${text("墩（Trick）就是四个人顺时针各出一张牌。其中一张赢下这一墩，计入该玩家与搭档共同的墩数。", "A trick consists of one card from each player, in clockwise order. One card wins the trick, which counts toward that player's partnership total.")}
          ${text("你坐南。这一墩没有将牌，北家先出 ♠K；东家已经没有黑桃，出了 ♥A，接着你出 ♠A，西家出 ♠7。", "You sit South. There are no trumps. North leads ♠K; East has no spades and plays ♥A; you play ♠A, then West plays ♠7.")}
          <div class="lesson-trick-compass" aria-label="一墩示例 / Example trick">${[["北 / North", 1], ["东 / East", 13], ["南 / South · 你 / You", 0], ["西 / West", 7]].map(([label, id], i) => `<div class="lesson-trick-seat seat-${i}"><small>${label}</small>${cards([id])}<small>${i + 1}</small></div>`).join("")}<div class="lesson-trick-center">无将<span lang="en">No trumps</span><i data-lucide="rotate-cw"></i></div></div>
          ${text("哪张牌赢下这一墩？", "Which card wins this trick?")}
          <div class="lesson-quiz" role="group" aria-label="哪张牌赢 / Which card wins?">${[1, 13, 0, 7].map((id) => `<button data-lesson-quiz="${id}" aria-pressed="${trickAnswer === id}">${cardName(id)}</button>`).join("")}</div>
          <div id="lessonQuizFeedback" role="status">${trickFeedback()}</div>
          ${heading("有首引花色，必须跟牌", "Follow suit whenever you can")}
          ${text("跟牌（Follow Suit）：你有先出花色的牌，就必须出该花色。只有没有时，才可以出其他花色。无将时，首引花色中最大的牌赢，所以这里是南家的 ♠A 赢，不是 ♥A。", "Follow Suit: if you hold any card of the suit led, you must play that suit. Only when you have none may you play a different suit. In no trumps, the highest card of the led suit wins: South's ♠A, not ♥A.")}
          ${text("赢墩的人领出（Lead）下一墩。每人 13 张，每墩各用一张，所以一副共打 13 墩。", "The winner leads the next trick. Each player has 13 cards and uses one per trick, so a board contains 13 tricks.")}`,
        () => `${text("定约可以指定一种花色做将牌（Trump Suit）。只要符合跟牌规则，将牌就能压过其他花色，即使只是一张 2。", "A contract can name a trump suit. Subject to the follow-suit rule, a trump beats any non-trump card, even if the trump is only a 2.")}
          <div class="lesson-example-trick"><div>${cards([0])}${text("黑桃最大牌", "Highest spade")}</div><i data-lucide="arrow-right"></i><div>${cards([25])}${text("红桃将牌", "Heart trump")}</div></div>
          <p class="lesson-rank-order">♥2 &gt; ♠A <small>红桃为将 / Hearts are trumps</small></p>
          ${text("假设黑桃先出，红桃是将牌。出 ♥2 的人手里已经没有黑桃，而且这一墩没有更大的将牌，♥2 就能赢过 ♠A。这叫将吃（Ruff）。还有黑桃，就必须跟黑桃，不能将吃。", "Suppose spades are led and hearts are trumps. If the ♥2 player has no spades, and no higher trump appears in the trick, ♥2 beats ♠A. This is a ruff. If you still hold a spade, you must follow spades and cannot ruff.")}
          ${text("一墩中有多张将牌时，最大的将牌赢；没有将牌时，首引花色里最大的牌赢。无将（No Trump，NT）是不指定任何将牌花色。", "If several trumps are played, the highest trump wins. If none are played, the highest card of the led suit wins. No Trump (NT) means no suit is designated as trump.")}`,
        () => `${text("叫牌（Bidding）不是选一张牌打出去，也不是一味叫得更高。你和搭档一边描述手牌，一边争取一个能完成、得分合适的目标；对手也在竞争。", "Bidding is not playing a card or simply trying to bid highest. You and partner describe your hands while seeking a makeable, worthwhile target. The opponents compete too.")}
          ${text("这个承诺叫定约（Contract，也叫契约）：在指定的将牌或无将条件下，己方至少赢多少墩。完成有奖，没完成要付罚分。", "That promise is the contract: the minimum number of tricks your side undertakes to win with a named trump suit or no trumps. Making it earns points; falling short gives penalty points to the defenders.")}
          ${heading("阶数 + 花色或无将", "Level + suit or no trump")}
          ${text("4♥ 表示红桃为将，至少赢 6 + 4 = 10 墩。叫牌数字是在 6 墩基础上额外承诺的墩数，不是总数。最多只有 13 墩，所以阶数只有 1 至 7。", "4♥ means hearts are trumps and you promise at least 6 + 4 = 10 tricks. The level counts tricks above six, not the total. With only 13 tricks available, levels run from 1 to 7.")}
          ${table("叫牌与目标 / Bids and targets", [["叫牌", "Bid"], ["至少赢几墩", "Tricks needed"]], [["1♣", "7"], ["2♦", "8"], ["3NT", "9"], ["4♥", "10"], ["5♠", "11"], ["6NT", "12"], ["7♠", "13"]])}
          <div class="lesson-contract-input"><label>阶数 / Level<select id="lessonLevel">${[1, 2, 3, 4, 5, 6, 7].map((l) => `<option ${l === level ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>将牌 / Trump<select id="lessonStrain">${["NT", "♠", "♥", "♦", "♣"].map((s) => `<option ${s === strain ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><div id="lessonContractDemo" aria-live="polite">${contractDemo()}</div>
          ${heading("怎样叫得比上一家高？", "What makes a higher bid?")}
          <p class="lesson-rank-order">♣ &lt; ♦ &lt; ♥ &lt; ♠ &lt; NT</p>
          ${text("从发牌人开始，顺时针轮流叫牌。新叫品必须高于当前叫品：先比阶数，同阶才比花色。1♥ 后可叫 1♠、1NT 或 2♣，不能叫 1♦；2♣ 比 1NT 高，因为阶数优先。", "Starting with dealer, players call clockwise. A new bid must outrank the current bid: compare level first, then denomination. After 1♥, you may bid 1♠, 1NT or 2♣, but not 1♦. 2♣ outranks 1NT because level comes first.")}
          ${text("不想竞叫可以不叫（Pass），但不叫不是弃牌，你仍参与这一副。加倍（Double，X）针对对手尚未加倍的定约；再加倍（Redouble，XX）回应对手对己方定约的加倍。它们改变得分和罚分，不改变目标墩数。", "Pass declines to compete now; it is not folding, and you still play the board. Double (X) challenges an opponent's undoubled contract; Redouble (XX) responds when opponents double yours. They change scores and penalties, not the trick target.")}
          ${text("有人叫牌后，连续三家不叫，叫牌结束；若期间有人加倍、再加倍或叫得更高，就重新数三次不叫。最后叫出的阶数与花色成为定约，保留适用的加倍状态。如果开头四家全不叫，这副牌不打、双方均记 0 分。", "After a bid, three consecutive passes end the auction. A double, redouble or higher bid resets that count. The last bid sets the contract, with any applicable double or redouble. Four opening passes pass the board out: no play and zero for both sides.")}`,
        () => `${heading("谁是庄家？", "Who becomes declarer?")}
          ${text("定约方中，第一个叫出最终定约花色（或无将）的人是庄家（Declarer），不一定是最后叫牌的人。庄家的搭档叫明手（Dummy）；另外两人是防守方（Defenders）。", "Declarer is the first player on the winning side to have bid the final denomination, not necessarily the person who made the last bid. Declarer's partner is dummy; the other two players are the defenders.")}
          <div class="lesson-auction-example"><span>南 / S<br><b>1NT</b></span><span>西 / W<br>Pass</span><span>北 / N<br><b>3NT</b></span><span>东 / E<br>Pass</span><span>南 / S<br>Pass</span><span>西 / W<br>Pass</span></div>
          ${text("例如你坐南，先叫 1NT，北家加到 3NT。虽然是北叫的 3NT，南才是本方第一个叫无将的人，所以你做庄家，北是明手。", "For example, you sit South and open 1NT; North raises to 3NT. Although North bid 3NT, South first bid no trumps for your side. You declare and North is dummy.")}
          <div class="lesson-role-flow"><div><i data-lucide="arrow-up-right"></i>${text("西家先出一张", "West leads one card")}</div><div><i data-lucide="eye"></i>${text("北家亮出手牌", "North exposes dummy")}</div><div><i data-lucide="hand"></i>${text("你替明手选牌", "You play dummy")}</div></div>
          ${text("庄家左边的防守者先出第一张牌，叫首攻（Opening Lead）。首攻后，明手把 13 张牌全部摊开，由庄家决定明手出什么牌。上例中南的左手方是西，所以西先出，北再摊牌。", "The defender to declarer's left makes the opening lead. Only then does dummy expose all 13 cards, with declarer choosing each play from that hand. In this example, West is to South's left: West leads, then North exposes dummy.")}
          ${text("庄家控制两手共 26 张牌，但仍按顺时针顺序，从轮到的那手出牌。防守方各自控制自己的 13 张。所有人都看得到明手，看不到其余未公开的手牌。", "Declarer controls 26 cards in two hands, but plays from the hand whose turn it is, in the same clockwise order. Each defender controls their own 13. Everyone sees dummy, but not the other unexposed hands.")}`,
        () => `${handDiagram(true)}
          ${heading("先数大牌点", "Start with high-card points")}
          ${text("大牌点（High Card Points，HCP）用来初步判断手牌的实力。它不是结算时的比赛分，也不是保证能赢的墩数。", "High-card points (HCP) give an initial estimate of hand strength. They are not your match score or a guaranteed number of tricks.")}
          <div class="lesson-hcp">${[0, 1, 2, 3].map((id) => `<div>${cards([id])}<strong>${4 - id} HCP</strong></div>`).join("")}</div>
          ${text("A 算 4 点、K 算 3 点、Q 算 2 点、J 算 1 点，10 及以下都算 0 点。一副牌共 40 点，每人平均 10 点。", "A=4, K=3, Q=2, J=1; 10 and below count zero. The deck contains 40 HCP, averaging ten per player.")}
          ${table("这手牌怎样算 / Counting this hand", [["花色", "Suit"], ["大牌点", "HCP"]], [["♠", "A(4) + K(3) = 7"], ["♥", "Q(2) + J(1) = 3"], ["♦", "A(4) = 4"], ["♣", "K(3) = 3"]])}
          <p class="lesson-rank-order">7 + 3 + 4 + 3 = <strong>17 HCP</strong></p>
          ${heading("再看牌型", "Then consider distribution")}
          ${text("这手牌有 17 点，属于比较强的手牌。按黑桃、红桃、方块、梅花数张数是 4-4-3-2，属于均型。牌型（Distribution）和搭档配合也很重要：一门有 6 张的长套，可能比点数稍高的均型牌更有进攻潜力。", "This is a relatively strong 17-HCP hand. Counting spades, hearts, diamonds and clubs gives 4-4-3-2: a balanced shape. Distribution and fit with partner matter too. A six-card suit can offer more offensive potential than a balanced hand with slightly more points.")}`,
        () => `${handDiagram()}
          ${text("你是南家，第一个叫牌。这手有 17 HCP，牌型为 4-4-3-2。本题采用常见的自然叫牌体系（Natural Bidding）：五张高花，15–17 点均型开叫 1NT。你应该怎样开叫（Opening Bid）？", "You are South and call first. Your hand has 17 HCP and a balanced 4-4-3-2 shape. Use a common natural bidding system: five-card majors and a balanced 15–17 HCP 1NT opening. What is your opening bid?")}
          <div class="lesson-bid-quiz" role="group" aria-label="选择开叫 / Choose an opening bid">${[["1S", "1♠", "一黑桃", "One spade"], ["1H", "1♥", "一红桃", "One heart"], ["1NT", "1NT", "一无将", "One no trump"], ["2NT", "2NT", "二无将", "Two no trump"]].map(([call, label, zh, en]) => `<label class="lesson-bid-option"><input type="radio" name="lesson-opening" value="${call}" ${bidAnswer === call ? "checked" : ""}><span><b>${label}</b>${zh}<small lang="en">${en}</small></span></label>`).join("")}</div>
          <button id="lessonCheckBid" ${bidAnswer === null ? "disabled" : ""}><i data-lucide="check"></i>检查答案 / Check answer</button>
          <div id="lessonBidFeedback" role="status">${bidFeedback()}</div>
          ${text("不同叫牌体系可能给同一叫品不同含义；搭档需要事先约定。本题和接下来的练习都按上述自然体系理解。", "Different bidding systems may assign different meanings to the same bid; partners agree their methods beforehand. This question and the practice that follows use the natural methods above.")}`,
        () => `${text("叫牌不只是竞争谁来决定将牌，更是向搭档传递手牌信息。你不是直接宣布自己有哪些牌，而是使用事先约定的叫牌体系（Bidding System）；对手也能听到并利用这些信息。", "Bidding is more than competing to choose trumps: it communicates information to partner. You do not announce your exact cards; you use an agreed bidding system. The opponents hear the same auction and can use that information too.")}
          ${heading("一、叫牌透露哪三类信息？", "1. Three kinds of information")}
          ${table("叫牌中的信息 / Information in bids", [["信息", "Information"], ["能推断什么", "What you can infer"]], [
            ["牌力 / Strength", text("大致有多少大牌点。", "An approximate high-card point range.")],
            ["牌型 / Distribution", text("各花色的长度、是否有长套。", "Suit lengths and any long suits.")],
            ["配合 / Fit", text("双方某花色是否足够长，适合做将牌。", "Whether your combined length makes a suit suitable as trumps.")]
          ])}
          ${text("例如在常见的五张高花制（Five-card Majors）中，1♥ 开叫通常表示至少五张红桃，以及约 12–21 HCP 的开叫牌力，具体范围会随体系和牌型调整。它请搭档考虑红桃配合，但没有说出五张红桃的具体点数。", "For example, in common five-card-major methods, a 1♥ opening normally shows at least five hearts and opening strength, roughly 12–21 HCP, with adjustments for system and shape. It asks partner to consider a heart fit without identifying the actual heart cards.")}
          ${heading("二、为什么要找八张配合？", "2. Why look for an eight-card fit?")}
          <figure class="lesson-fit-example"><figcaption>红桃配合 <span lang="en">A heart fit</span></figcaption><div><b>你 / South · 5 张 / cards</b><div class="lesson-fit-cards">${cards([13, 14, 18, 20, 23])}</div></div><div><b>搭档 / North · 3 张 / cards</b><div class="lesson-fit-cards">${cards([15, 19, 24])}</div></div><p class="lesson-rank-order">5 + 3 = <strong>8 ♥</strong><small>对手合计 5 张<span lang="en">Opponents: 5 hearts</span></small></p></figure>
          ${text("你有 ♥A K 9 7 4，搭档有 ♥Q 8 3，合计八张。这叫八张将牌配合（Eight-card Trump Fit），通常是很好的将牌选择；但八张配合并不保证能拿八墩或一定完成定约。", "You hold ♥A K 9 7 4 and partner holds ♥Q 8 3: eight hearts together. This eight-card trump fit is usually a good reason to choose hearts. It does not guarantee eight tricks or a made contract.")}
          ${text("清将（Drawing Trumps）就是领出将牌，迫使还有将牌的对手跟出，逐步消耗他们的将牌。某一手缺少其他花色时，也可能靠将吃增加赢墩；所以有时要先保留将牌做将吃，再清将，不能每副都机械地先出光将牌。", "Drawing trumps means leading trump cards so opponents who still hold trumps must follow, gradually using up theirs. A hand short in another suit may also gain tricks by ruffing. Sometimes you need to preserve trumps for those ruffs before drawing them, rather than automatically playing them all out first.")}
          ${heading("三、把叫牌连起来读", "3. Read the whole auction")}
          <table class="lesson-reference lesson-fit-auction"><caption>叫牌过程 / Auction</caption><thead><tr>${[["南", "South"], ["西", "West"], ["北", "North"], ["东", "East"]].map(([zh, en]) => `<th scope="col">${zh}<span lang="en">${en}</span></th>`).join("")}</tr></thead><tbody><tr><td>1♥</td><td>Pass</td><td>2♥</td><td>Pass</td></tr><tr><td>4♥</td><td>Pass</td><td>Pass</td><td>Pass</td></tr></tbody></table>
          ${text("本课约定：1♥ 后的 2♥ 是简单加叫（Simple Raise），表示至少三张红桃、约 6–9 支持点。南开叫 1♥ 显示五张以上红桃和开叫实力；北加到 2♥，确认有限支持；南再叫 4♥，表示根据自己的额外实力或牌型，认为值得尝试十墩的成局定约。不是每手开叫牌都应直接叫到 4♥。", "Our agreement here: over 1♥, 2♥ is a simple raise showing at least three hearts and about 6–9 support points. South's 1♥ shows five or more hearts and opening strength; North's 2♥ confirms limited support; South's 4♥ judges that extra strength or shape makes the ten-trick game worth trying. Not every opening hand should jump to 4♥.")}
          ${text("支持点（Support Points）是在找到将牌配合后，结合大牌点和短套等因素重新估算的牌力，不总等于 HCP；不同体系的计算和范围也可能不同。4♥ 属于成局（Game），完成有成局奖分。", "Support points re-evaluate a hand once a trump fit is found, considering HCP and factors such as short suits. They are not always identical to HCP, and methods and ranges vary. 4♥ is a game contract, earning a game bonus if made.")}
          ${text("南不用看到北的牌，就能推断双方至少有八张红桃。东、西也听到了这些叫品，可以据此判断牌力分布、考虑争叫，或在防守时推测剩余的牌。", "Without seeing North's hand, South can infer at least eight combined hearts. East and West hear those same calls and can use them to estimate strength and distribution, decide whether to compete, or infer remaining cards during defense.")}
          ${heading("四、不叫也有含义", "4. A pass carries information too")}
          ${table("先看叫牌背景 / Consider the auction context", [["情况", "Situation"], ["Pass 可能表示", "What pass may mean"]], [
            [text("第一家就不叫", "Pass as the first caller"), text("通常不够正常开叫的牌力。", "Usually lacks normal opening strength.")],
            [text("搭档开 1♥，你不叫", "Pass over partner's 1♥ opening"), text("通常没有合适的应叫条件。", "Usually lacks a suitable response.")],
            [text("对手已经叫得很高", "Opponents have bid high"), text("不想继续竞争，可能牌力不足或风险太大。", "Declines further competition: too weak or too risky.")],
            [text("搭档已叫到 4♥，你不叫", "Pass over partner's 4♥"), text("接受这个定约，不准备继续加叫。", "Accepts that contract without bidding higher.")]
          ])}
          ${text("这些都不是绝对结论。Pass 不等于没有好牌，也不等于不喜欢红桃，要结合之前的叫牌背景（Auction Context）判断。", "None of these is absolute. Pass does not mean you have no good cards or dislike hearts; interpret it in the context of the preceding auction.")}
          ${text("进阶里还有逼叫性不叫（Forcing Pass）：在双方约定已形成逼叫局面的竞争叫牌中，不叫是把选择交给搭档，要求搭档继续叫牌或加倍，不能也不叫而让对手的定约原样结束。仅仅拿强牌先等一等，并不自动算逼叫性不叫。", "An advanced case is a forcing pass: in a competitive auction where your agreements have established a forcing situation, passing leaves the decision to partner, who must bid on or double rather than pass out the opponents' contract unchanged. Simply holding a strong hand and waiting does not automatically make a pass forcing.")}
          ${heading("五、信息同时给了双方", "5. Both sides receive the information")}
          ${text("听到你开叫 1♥，搭档能用自己的红桃张数判断配合；对手也能用你的五张红桃推测其他花色的分布。策略在于利用这些公开线索，找到对己方最有利的定约，而不是给搭档发秘密暗号。", "When you open 1♥, partner can count their own hearts to judge the fit, while opponents can use your five-card heart length to infer other suits. The challenge is to use those public clues to find your best contract, not to send secret signals to partner.")}
          ${text("搭档可以约定叫牌方法，但协议必须按比赛要求向对手公开和解释（Disclosure），不能隐瞒只有搭档懂的特殊含义。公开的是协议，不是把自己实际拿到的牌摊给对手。", "Partners may agree bidding methods, but those agreements must be disclosed and explained to opponents as the event requires. You cannot hide a special meaning known only to partner. You disclose the agreement, not your actual concealed cards.")}
          <section id="lessonResponseExercise">${heading("六、练习 2：你怎样应叫？", "6. Exercise 2: your response")}
          ${handDiagram(true, responseHand, "北家 / North")}
          ${text("你坐北。搭档南第一个开叫 1♥，西家 Pass，现在轮到你。♠K、♥Q、♦J 共 6 HCP，红桃三张，牌型 3-3-4-3。按本课的五张高花、6–9 支持点简单加叫约定，哪个应叫最合理？", "You sit North. Partner South opens 1♥, West passes, and it is your turn. ♠K, ♥Q and ♦J total six HCP; you have three hearts and a 3-3-4-3 shape. Using our five-card-major methods and a 6–9 support-point simple raise, what is the best response?")}
          <div class="lesson-bid-quiz" role="group" aria-label="选择应叫 / Choose a response">${[["P", "Pass", "不叫", "Pass"], ["2H", "2♥", "支持红桃", "Support hearts"], ["2S", "2♠", "改叫黑桃", "Bid spades"], ["4H", "4♥", "直接叫成局", "Bid game"]].map(([call, label, zh, en]) => `<label class="lesson-bid-option"><input type="radio" name="lesson-response" value="${call}" ${responseAnswer === call ? "checked" : ""}><span><b>${label}</b>${zh}<small lang="en">${en}</small></span></label>`).join("")}</div>
          <button id="lessonCheckResponse" ${responseAnswer === null ? "disabled" : ""}><i data-lucide="check"></i>查看解析 / Check answer</button>
          <div id="lessonResponseFeedback" role="status">${responseFeedback()}</div></section>
          ${text("同一个 2♥，在不同叫牌顺序里可能是简单加叫、新花色应叫，甚至约定性叫品。1♥、2♥、3♥、4♥ 不只是越来越想用红桃当将牌；理解它们，要先看谁叫过什么，再看双方约定。", "The same 2♥ can be a simple raise, a new-suit response or even an artificial call in different auctions. 1♥, 2♥, 3♥ and 4♥ do not simply mean an ever-stronger preference for hearts: first read the sequence, then apply the partnership agreement.")}`,
        () => `${table("今天的核心术语 / Today's key terms", [["中文", "Chinese"], ["英文", "English"]], glossary.map(([zh, en]) => [esc(zh), `<span lang="en">${esc(en)}</span>`]))}
          ${heading("接下来：一起打一副牌", "Next: play a board with guidance")}
          ${text("前两题分别是南家 17 点开叫、北家 6 点支持红桃。接下来换一副练习牌：你坐北，拿到 16 点、3-3-3-4 均型；南是搭档，持 12 点。你开 1NT，南加到 3NT，你做庄家，目标是共同赢 9 墩。", "The two questions used South's 17-HCP opening hand and North's six-HCP heart raise. The next exercise is a different deal: you sit North with a balanced 16-HCP, 3-3-3-4 hand; South is partner with 12 HCP. You open 1NT, South raises to 3NT, and you declare, aiming for nine tricks together.")}
          ${text("叫牌时，想想搭档的叫品透露了多少实力。明手亮牌后，先数两手能稳拿的墩，再找缺的墩从哪里来。有时要先让对手赢一墩，消耗他的大牌，才能把自己的长套变成赢张。", "During the auction, infer strength from partner's bids. Once dummy appears, count ready winners across both hands, then plan where the missing tricks can come from. Sometimes you must first lose a trick to remove an opposing high card and establish your long suit.")}
          ${text("出牌时也记住已经出现的大牌，以及谁没有跟牌、说明哪门花色已经没了。比如对手的 A、K 都出过，自己的 Q 就可能成为赢张；看到一家垫牌，就知道该家已没有首引花色。把这些线索用在下一墩的选择里。", "During play, remember which high cards have appeared and who has failed to follow suit, revealing a void. If the opposing ace and king are gone, your queen may now be a winner. When someone discards, you know that player has no cards of the led suit left. Use those clues to plan the next trick.")}`
      ];
      document.querySelector("#lessonIntroTitle").innerHTML = `${titles[page][0]}<small lang="en">${titles[page][1]}</small>`;
      document.querySelector("#lessonIntroBody").innerHTML = `<div class="lesson-page-label">${page + 1} / ${titles.length}</div>${bodies[page]()}`;
      document.querySelector("#lessonBack").disabled = page === 0;
      document.querySelector("#lessonForward").innerHTML = page === titles.length - 1 ? `${getState()?.lesson ? "返回牌桌 / Back to table" : "开始练习 / Play the lesson"} <i data-lucide="play"></i>` : '下一步 / Next <i data-lucide="arrow-right"></i>';
      document.querySelector("#lessonIntroBody").scrollTop = 0;
      window.lucide?.createIcons();
    }
    function open() { page = 0; trickAnswer = null; bidAnswer = null; bidChecked = false; responseAnswer = null; responseChecked = false; level = 4; strain = "♥"; intro(); dialog.showModal(); }
    document.querySelector("#lessonBack").addEventListener("click", () => { if (page > 0) { page--; intro(); } });
    document.querySelector("#lessonForward").addEventListener("click", () => {
      if (page < titles.length - 1) { page++; intro(); }
      else { dialog.close(); start(); }
    });
    dialog.addEventListener("click", (event) => {
      const answer = event.target.closest("[data-lesson-quiz]");
      if (answer) {
        trickAnswer = Number(answer.dataset.lessonQuiz);
        dialog.querySelectorAll("[data-lesson-quiz]").forEach((button) => button.setAttribute("aria-pressed", String(button === answer)));
        document.querySelector("#lessonQuizFeedback").innerHTML = trickFeedback();
      }
      if (event.target.closest("#lessonCheckBid") && bidAnswer !== null) {
        bidChecked = true;
        const feedback = document.querySelector("#lessonBidFeedback");
        feedback.innerHTML = bidFeedback(); feedback.scrollIntoView({ block: "nearest" });
      }
      if (event.target.closest("#lessonCheckResponse") && responseAnswer !== null) {
        responseChecked = true;
        const feedback = document.querySelector("#lessonResponseFeedback");
        feedback.innerHTML = responseFeedback(); feedback.scrollIntoView({ block: "nearest" });
      }
    });
    dialog.addEventListener("change", (event) => {
      if (event.target.name === "lesson-opening") {
        bidAnswer = event.target.value; bidChecked = false;
        document.querySelector("#lessonCheckBid").disabled = false;
        document.querySelector("#lessonBidFeedback").innerHTML = "";
      }
      if (event.target.name === "lesson-response") {
        responseAnswer = event.target.value; responseChecked = false;
        document.querySelector("#lessonCheckResponse").disabled = false;
        document.querySelector("#lessonResponseFeedback").innerHTML = "";
      }
      if (["lessonLevel", "lessonStrain"].includes(event.target.id)) {
        if (event.target.id === "lessonLevel") level = Number(event.target.value);
        else strain = event.target.value;
        document.querySelector("#lessonContractDemo").innerHTML = contractDemo();
      }
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-lesson-command]"); if (!button || button.disabled) return;
      const state = getState(); if (!state?.lesson) return;
      const command = button.dataset.lessonCommand;
      if (command === "continue") { button.disabled = true; if (!send({ type: "lessonContinue", revision: state.game.revision })) button.disabled = false; }
      if (command === "locate") focusAction(state.lesson.recommendation);
      if (command === "intro") open();
      if (command === "restart") document.querySelector("#lessonRestartDialog").showModal();
      if (command === "confirmRestart") { document.querySelector("#lessonRestartDialog").close(); send({ type: "lessonRestart", revision: state.game.revision }); }
    });
    function render(state, selected, busy) {
      const lesson = state?.lesson, game = state?.game;
      coach.hidden = !lesson; notebook.hidden = !lesson;
      document.body.classList.toggle("bridge-teaching", Boolean(lesson));
      document.querySelector("#copyBtn").hidden = Boolean(lesson);
      document.querySelector("#roomTools").hidden = Boolean(lesson);
      if (!lesson) { key = ""; coach.innerHTML = ""; notebook.innerHTML = ""; return; }
      const nextKey = `${state.code}:${game.revision}`, changed = key !== "" && key !== nextKey;
      key = nextKey;
      const phase = game.phase === "auction" ? "叫牌 / Auction" : game.phase === "over" ? "复盘 / Review" : `第 ${Math.min(13, game.tricks.length + (game.phase === "trick" ? 0 : 1))} 墩 / Trick`;
      const rec = lesson.recommendation;
      coach.innerHTML = `<div class="lesson-coach-heading"><span><i data-lucide="graduation-cap"></i>教学 / Lesson · ${phase}</span><button class="icon-button" data-lesson-command="intro" title="重看入门 / Review basics" aria-label="重看入门 / Review basics"><i data-lucide="book-open"></i></button><button class="icon-button" data-lesson-command="restart" title="重练 / Restart lesson" aria-label="重练 / Restart lesson"><i data-lucide="rotate-ccw"></i></button></div>
        ${bilingual(lesson.title, "h2")}${lesson.paragraphs.map((p) => bilingual(p)).join("")}
        ${game.trick.length ? `<div class="lesson-table-cards" aria-label="当前墩 / Current trick">${game.trick.map((p) => `<div class="${["trick", "over"].includes(game.phase) && game.lastTrick?.winner === p.seat ? "lesson-trick-winner" : ""}"><small>${["北 N", "东 E", "南 S", "西 W"][p.seat]}</small>${cardHTML(p.card, false, false, "span")}</div>`).join("")}</div>` : ""}
        ${game.contract && game.contract !== "Passout" ? `<div class="lesson-goal"><b>3NT · ${game.won[0]} / 9</b><span>己方已赢 / Your side's tricks</span><progress value="${game.won[0]}" max="9" aria-label="己方墩数 / Partnership tricks"></progress></div>` : ""}
        <div class="lesson-coach-actions">${lesson.canContinue ? `<button class="primary" data-lesson-command="continue" ${busy ? "disabled" : ""}><i data-lucide="arrow-right"></i>${game.phase === "trick" ? "收墩，继续 / Collect & continue" : "继续 / Continue"}</button>` : rec ? `<span>建议 / Suggestion: <b>${rec.type === "call" ? rec.call === "P" ? "不叫 / Pass" : esc(rec.call) : cardName(rec.card)}</b></span><button data-lesson-command="locate"><i data-lucide="${rec.type === "play" ? "arrow-up" : "arrow-down"}"></i>${rec.type === "call" ? "去叫牌 / Go to auction" : "选这张 / Select this card"}</button>` : `<button data-lesson-command="restart"><i data-lucide="rotate-ccw"></i>再练一次 / Replay lesson</button>`}</div>
        <span class="lesson-sr-status" role="status">${esc(lesson.title.zh)} / ${esc(lesson.title.en)}</span>`;
      notebook.innerHTML = `<details id="lessonAdvanced" ${advanced ? "open" : ""}><summary>进阶：记牌与计划 <small>Counting & planning</small></summary>${bilingual(lesson.tip)}
        ${game.dummyVisible ? `<table class="lesson-counts"><caption>只数已知信息 / Known information only</caption><thead><tr><th>花色<br>Suit</th><th>已出<br>Played</th><th>己方<br>NS hold</th><th>未知<br>Unseen</th></tr></thead><tbody>${lesson.counts.map((s) => `<tr><th>${s.symbol}</th><td>${s.played}</td><td>${s.held}</td><td>${s.unseen}</td></tr>`).join("")}</tbody></table>${text("每行合计 13。未知只表示对手合计持有，不表示具体在哪一家。", "Each row totals 13. Unseen cards belong to the defenders together, not to a known individual.")}<ul class="lesson-voids">${lesson.counts.filter((s) => s.voids.length).map((s) => `<li>${s.symbol} 缺门 / Void: ${s.voids.join(", ")}</li>`).join("")}</ul>` : ""}</details>`;
      document.querySelector("#lessonAdvanced").addEventListener("toggle", (event) => { advanced = event.target.open; });
      if (game.phase === "over") notebook.insertAdjacentHTML("beforeend", `<details class="lesson-review"><summary>逐墩复盘 <small>Trick review</small></summary>${game.tricks.map((trick, index) => `<div><strong>${index + 1} · ${["北 N", "东 E", "南 S", "西 W"][trick.winner]} 赢 / wins</strong><p>${trick.cards.map((p) => `${["N", "E", "S", "W"][p.seat]} ${cardName(p.card)}`).join(" → ")}</p></div>`).join("")}</details>`);
      if (rec?.type === "call") document.querySelector(`[data-call="${rec.call}"]`)?.classList.add("lesson-recommended");
      if (rec?.type === "play") {
        document.querySelector(`[data-card="${rec.card}"]:not(:disabled)`)?.classList.add("lesson-recommended");
        const active = document.querySelector(game.current === game.dummy ? "#dummyPanel" : "#handPanel");
        const note = selected === null ? lesson.reason : lesson.cardNotes[selected];
        if (note) {
          const detail = document.createElement("div"); detail.className = "lesson-card-advice";
          detail.innerHTML = `<strong>${selected === null ? "建议 / Suggestion" : "你的选择 / Your choice"}: ${cardName(selected === null ? rec.card : selected)}</strong>${bilingual(note)}${selected !== null && selected !== rec.card ? text(`也可以考虑 ${cardName(rec.card)}。这是根据公开信息给的建议，不保证是唯一好走法。`, `Also consider ${cardName(rec.card)}. This suggestion uses public information; it is not the only potentially good play.`) : ""}`;
          active.querySelector(".hand-actions")?.before(detail);
        }
      }
      // Start each lesson step at the hands, with the explanation following below.
      if (changed && !document.querySelector("dialog[open]")) {
        const target = game.phase !== "over" && document.querySelector("#dummyPanel:not([hidden]), #handPanel:not([hidden])") || coach;
        const heading = target.querySelector("h2"); heading.tabIndex = -1; heading.focus({ preventScroll: true });
        target.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    return { open, render };
  }
  window.BridgeLessonUI = { create };
})();
