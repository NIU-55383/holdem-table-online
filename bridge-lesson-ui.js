"use strict";
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const bilingual = (p, tag = "p") => `<${tag} class="lesson-copy">${esc(p.zh)}<span lang="en">${esc(p.en)}</span></${tag}>`;
  const text = (zh, en) => bilingual({ zh, en });
  const cardName = (id) => ["♠", "♥", "♦", "♣"][Math.floor(id / 13)] + ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"][id % 13];
  const titles = [
    ["先说怎样赢", "First: how do you win?"], ["四张牌，争一墩", "Four cards, one trick"],
    ["定约就是一份承诺", "A contract is a promise"], ["叫牌是在商量目标", "Bidding agrees your target"],
    ["谁来出明手的牌？", "Who plays dummy's cards?"]
  ];
  function create({ cardHTML, start, send, getState, focusAction }) {
    const dialog = document.querySelector("#lessonIntro"), coach = document.querySelector("#lessonCoach"), notebook = document.querySelector("#lessonNotebook");
    let page = 0, quiz = null, level = 3, strain = "NT", advanced = false, key = "";
    const cards = (ids) => ids.map((id) => cardHTML(id, false, false, "span")).join("");
    function contractDemo() {
      return `<div class="lesson-contract"><strong>${level}${strain}</strong><span>6 + ${level} = <b>${level + 6}</b> 墩 / tricks</span></div>
        <div class="lesson-trick-meter" aria-label="${level + 6} / 13">${Array.from({ length: 13 }, (_, i) => `<span class="${i < 6 ? "base" : i < level + 6 ? "promised" : ""}">${i + 1}</span>`).join("")}</div>
        ${text(`赢到 ${level + 6} 墩就完成定约；对手拿到 ${8 - level} 墩就能让你宕约。${strain === "NT" ? "无将：没有花色能压过首引花色。" : `${strain}是将牌；没有首引花色时，才可出将牌将吃。`}`, `Take ${level + 6} tricks to make the contract; ${8 - level} for the opponents defeats it. ${strain === "NT" ? "No trumps: an off-suit card cannot beat the led suit." : `${strain} is trump. You may trump only when void in the led suit.`}`)}`;
    }
    function intro() {
      const bodies = [
        () => `<div class="lesson-partners"><span>北 N<br><b>你 / You</b></span><span>西 W<br>防家 / Defender</span><i data-lucide="handshake"></i><span>东 E<br>防家 / Defender</span><span>南 S<br><b>搭档 / Partner</b></span></div>
          ${text("你和对面的玩家是一队，另外两人是一队。每人 13 张牌，每次各出一张，四张合成一墩；一副共 13 墩。", "You and the player opposite are partners against the other two. Each has 13 cards. One card from each player makes a trick; a board has 13 tricks.")}
          <div class="lesson-outcomes"><div><strong>3NT → 9 / 13</strong>${text("己方拿 9 墩，完成定约，己方得分。", "Take nine tricks: make the contract and score.")}</div><div><strong>3NT → 8 / 13</strong>${text("只拿 8 墩，宕一墩，防家得分。", "Take only eight: down one, defenders score.")}</div></div>
          ${text("先通过叫牌商定这一副要拿几墩、有没有将牌，再开始出牌。普通房间打多副，累计分高的一队赢；这次先练一副 3NT。", "First bid to agree the target and trump suit, then play. Normal rooms total several boards; the higher-scoring team wins. This lesson practices one 3NT board.")}`,
        () => `${text("顺时针每人出一张，有首引花色就必须跟。A 最大，接着 K、Q、J、10…2。这一墩是无将，首张为 ♠4。", "Each player plays one card clockwise. Follow the led suit if you can. A is high, then K, Q, J, 10…2. This no-trump trick starts with ♠4.")}
          <div class="lesson-example-trick">${[10, 2, 13, 6].map((id, i) => `<div><small>${i + 1}</small>${cardHTML(id, false, false, "span")}</div>`).join("")}</div>
          ${text("谁赢？红桃 A 的玩家没有黑桃，所以可以垫红桃。", "Which card wins? The ♥A player has no spades, so the heart discard is legal.")}
          <div class="lesson-quiz" role="group" aria-label="哪张牌赢 / Which card wins?">${[10, 2, 13, 6].map((id) => `<button data-lesson-quiz="${id}" aria-pressed="${quiz === id}">${cardName(id)}</button>`).join("")}</div>
          <div id="lessonQuizFeedback" role="status">${quiz === null ? "" : quiz === 2 ? text("对，♠Q 赢！它是首引花色里最大的牌。赢墩者先出下一墩，墩数算入搭档共同的总数。", "Yes, ♠Q wins: the highest spade. The winner leads next, and the trick counts for the partnership.") : text("再比较黑桃：无将时，别的花色再大也不能赢。这里最大的黑桃是 Q。", "Compare the spades again: in no trumps, another suit cannot win. The highest spade here is Q.")}</div>`,
        () => `${text("定约（Contract，也叫契约）写明己方承诺的目标和将牌。3NT 的 3 不是要拿三墩，而是 3 + 6 = 9 墩。NT（No Trump）表示无将；也可以选择一种花色做将牌。", "A contract states your side's target and trump suit. The 3 in 3NT does not mean three tricks: it means 3 + 6 = 9. NT means No Trump; a suit contract instead names a trump suit.")}
          <div class="lesson-contract-input"><label>阶数 / Level<select id="lessonLevel">${[1, 2, 3, 4, 5, 6, 7].map((l) => `<option ${l === level ? "selected" : ""}>${l}</option>`).join("")}</select></label><label>将牌 / Trump<select id="lessonStrain">${["NT", "♠", "♥", "♦", "♣"].map((s) => `<option ${s === strain ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><div id="lessonContractDemo" aria-live="polite">${contractDemo()}</div>
          <div class="lesson-example-trick">${cards([10, 2, 24, 6])}</div>${text("另一个例子：如果红桃是将牌，第三张 ♥3 就能赢上面这墩；前提仍是出它的人没有黑桃。能跟黑桃时不能将吃。", "Another example: with hearts as trumps, the third card ♥3 wins the trick shown above, but only if that player has no spades. You cannot trump while still holding the led suit.")}`,
        () => `<div class="lesson-hcp">${[0, 1, 2, 3].map((id) => `<div>${cardHTML(id, false, false, "span")}<strong>${4 - id} 点 / HCP</strong></div>`).join("")}</div>
          ${text("叫牌不是选一张牌打出去，而是向搭档描述实力，寻找能完成、得分合适的定约。大牌点 A=4、K=3、Q=2、J=1；其他牌为 0。长套、配合和牌型也很重要。", "A bid is not a card play. It describes strength to partner and seeks a makeable, worthwhile contract. High-card points: A=4, K=3, Q=2, J=1; other cards=0. Length, fit and shape also matter.")}
          <div class="lesson-auction-example"><span>北 N<br><b>1NT</b></span><span>东 E<br>Pass</span><span>南 S<br><b>3NT</b></span><span>西 W<br>Pass</span><span>北 N<br>Pass</span><span>东 E<br>Pass</span></div>
          ${text("这次你用均型 16 点开 1NT。搭档加到 3NT 后，连续三家不叫，定约成立。不叫不等于弃牌，你仍继续打这一副。", "Here you open a balanced 16 HCP with 1NT. Partner raises to 3NT, followed by three passes: the contract is set. Pass is not folding; you still play the hand.")}
          ${text("叫得更高，必须提高阶数或在同阶用更高的花色：♣ < ♦ < ♥ < ♠ < NT。加倍 X 针对对手的定约，再加倍 XX 回应对手的加倍；它们改变分值，不改变目标墩数。本课先不用。", "A new bid must raise the level or the denomination: ♣ < ♦ < ♥ < ♠ < NT. X doubles an opponent's contract; XX redoubles their double. These affect scoring, not the trick target. We leave them out of this first lesson.")}`,
        () => `<div class="lesson-role-flow"><div><i data-lucide="arrow-up-right"></i>${text("东首攻", "East leads")}</div><div><i data-lucide="eye"></i>${text("南摊牌", "South exposes dummy")}</div><div><i data-lucide="hand"></i>${text("你替南选牌", "You choose for South")}</div></div>
          ${text("最后叫成定约的那一方里，最早叫过最终花色的人是庄家。本课你最先叫 NT，所以你是庄家；南是明手，摊牌后由你替他选牌。", "Declarer is the first player on the winning side to bid the final denomination. You first bid NT, so you declare; South is dummy, whose exposed cards you choose.")}
          ${text("出牌顺序不变。轮到北，就从你的手牌出；轮到南，就从明手出。防家各管自己的牌，也会想办法阻止你拿到 9 墩。", "Turn order stays the same. On North's turn, play your own hand; on South's turn, play dummy. Each defender controls their own hand and tries to stop your nine tricks.")}
          ${text("先数能稳拿的墩，再想缺的墩从哪里来。有时要先让对手赢一墩，消耗他的大牌，让自己的长套变成赢张。接下来就在牌桌上试。", "Count your ready winners, then plan the missing tricks. Sometimes you first lose a trick to remove an opponent's high card and establish your long suit. Now try it at the table.")}`
      ];
      document.querySelector("#lessonIntroTitle").innerHTML = `${titles[page][0]}<small lang="en">${titles[page][1]}</small>`;
      document.querySelector("#lessonIntroBody").innerHTML = `<div class="lesson-page-label">${page + 1} / ${titles.length}</div>${bodies[page]()}`;
      document.querySelector("#lessonBack").disabled = page === 0;
      document.querySelector("#lessonForward").innerHTML = page === titles.length - 1 ? `${getState()?.lesson ? "返回牌桌 / Back to table" : "开始练习 / Play the lesson"} <i data-lucide="play"></i>` : '下一步 / Next <i data-lucide="arrow-right"></i>';
      document.querySelector("#lessonIntroBody").scrollTop = 0;
      window.lucide?.createIcons();
    }
    function open() { page = 0; quiz = null; intro(); dialog.showModal(); }
    document.querySelector("#lessonBack").addEventListener("click", () => { if (page > 0) { page--; intro(); } });
    document.querySelector("#lessonForward").addEventListener("click", () => {
      if (page < titles.length - 1) { page++; intro(); }
      else { dialog.close(); start(); }
    });
    dialog.addEventListener("click", (event) => {
      const answer = event.target.closest("[data-lesson-quiz]");
      if (answer) { quiz = Number(answer.dataset.lessonQuiz); intro(); dialog.querySelector(`[data-lesson-quiz="${quiz}"]`).focus({ preventScroll: true }); }
    });
    dialog.addEventListener("change", (event) => {
      if (event.target.id === "lessonLevel") level = Number(event.target.value);
      if (event.target.id === "lessonStrain") strain = event.target.value;
      document.querySelector("#lessonContractDemo").innerHTML = contractDemo();
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
        <div class="lesson-coach-actions">${lesson.canContinue ? `<button class="primary" data-lesson-command="continue" ${busy ? "disabled" : ""}><i data-lucide="arrow-right"></i>${game.phase === "trick" ? "收墩，继续 / Collect & continue" : "继续 / Continue"}</button>` : rec ? `<span>建议 / Suggestion: <b>${rec.type === "call" ? rec.call === "P" ? "不叫 / Pass" : esc(rec.call) : cardName(rec.card)}</b></span><button data-lesson-command="locate"><i data-lucide="arrow-down"></i>${rec.type === "call" ? "去叫牌 / Go to auction" : "选这张 / Select this card"}</button>` : `<button data-lesson-command="restart"><i data-lucide="rotate-ccw"></i>再练一次 / Replay lesson</button>`}</div>
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
      // Keep an explicitly advanced lesson visible, but do not scroll on chat/profile updates.
      if (changed && !document.querySelector("dialog[open]")) {
        const heading = coach.querySelector("h2"); heading.tabIndex = -1; heading.focus({ preventScroll: true });
        coach.scrollIntoView({ block: "start", behavior: "instant" });
      }
    }
    return { open, render };
  }
  window.BridgeLessonUI = { create };
})();
