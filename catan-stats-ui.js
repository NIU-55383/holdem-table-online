"use strict";
(() => {
  const B = window.CatanBoard, esc = B.escape;
  const tabs = [
    ["scores", "分数走势", "Score history", "chart-line"],
    ["dice", "骰子分布", "Dice rolls", "dices"],
    ["resources", "资源产出", "Production", "sprout"],
    ["builds", "建设统计", "Construction", "house"],
  ];
  const resources = [
    ["木材", "Lumber", "#30885c"], ["砖块", "Brick", "#c66b4b"],
    ["羊毛", "Wool", "#8fb349"], ["麦子", "Grain", "#ccab36"], ["矿石", "Ore", "#859da2"],
  ];
  const buildings = [["村庄", "Settlements", "#4f9a91"], ["城市升级", "City upgrades", "#c58a4a"], ["道路", "Roads", "#7c8b9b"], ["船只", "Ships", "#559fc8"]];
  const dash = ["", "9 3", "3 3", "12 3 3 3", "6 3", "2 4"];
  const sum = values => values.reduce((a, b) => a + b, 0);
  const bilingual = (zh, en) => `${zh}<small>${en}</small>`;

  function mount() {
    const dialog = document.getElementById("statisticsDialog"), body = document.getElementById("statisticsBody"), entry = document.getElementById("matchStatistics");
    let game = null, key = "", active = "scores", selected = 0, visible = new Set();
    const seen = new Set();
    const playerName = id => esc(game.players[id]?.name || `${id + 1}`);
    const badge = id => `<span class="stats-seat" style="--seat-color:${B.COLORS[id]}">${id + 1}</span>`;
    const turnName = row => row.turn ? `第 ${row.turn} 回合 / Turn ${row.turn}` : "初始建设 / Setup";

    function open() {
      if (!game?.statistics) return;
      if (!dialog.open) dialog.showModal();
      render();
      seen.add(key);
    }
    function maybeOpen() {
      if (key && !seen.has(key) && !document.querySelector("dialog[open]")) open();
    }
    document.addEventListener("close", maybeOpen, true);
    entry.onclick = open;

    function sync(room) {
      const next = room?.game?.phase === "over" && room.game.statistics ? room.game : null;
      entry.hidden = !next;
      if (!next) {
        key = ""; game = null;
        if (dialog.open) dialog.close();
        body.replaceChildren();
        return;
      }
      const nextKey = `${room.code}:${next.statistics.id}`;
      game = next;
      if (nextKey !== key) {
        key = nextKey; active = "scores"; selected = game.statistics.history.length - 1;
        visible = new Set(game.players.map(p => p.id));
        if (dialog.open) dialog.close();
      }
      maybeOpen();
    }

    function render() {
      const stats = game.statistics;
      const winners = (game.winners?.length ? game.winners : [game.winner]).map(playerName).join(" &amp; ");
      document.getElementById("statisticsSummary").innerHTML = `<strong>${winners} 获胜<small>${winners} ${game.winners?.length > 1 ? "win together" : "wins"}</small></strong><span>${bilingual(`${stats.history.at(-1).turn} 回合 · ${sum(stats.dice)} 次掷骰`, `${stats.history.at(-1).turn} turns · ${sum(stats.dice)} rolls`)}</span>`;
      document.getElementById("statisticsTabs").innerHTML = tabs.map(([id, zh, en, icon]) => `<button type="button" id="statsTab-${id}" role="tab" aria-controls="statisticsBody" aria-selected="${id === active}" tabindex="${id === active ? 0 : -1}" data-stats-tab="${id}"><i data-lucide="${icon}" aria-hidden="true"></i><span>${bilingual(zh, en)}</span></button>`).join("");
      body.setAttribute("aria-labelledby", `statsTab-${active}`);
      if (active === "scores") renderScores();
      else if (active === "dice") renderDice();
      else renderBars(active === "resources");
      window.lucide?.createIcons();
    }

    function renderScores() {
      body.innerHTML = `<p class="stats-note">${bilingual("每回合总分，含加分卡与地图奖励。", "Total VP per turn, including VP cards and scenario bonuses.")}</p>
        <div class="stats-legend" aria-label="玩家曲线 / Player lines">${game.players.map(p => `<label><input type="checkbox" data-stats-player="${p.id}" ${visible.has(p.id) ? "checked" : ""}>${badge(p.id)}<span>${playerName(p.id)}</span></label>`).join("")}</div>
        <div class="stats-plot" id="statsScorePlot"></div>
        <div class="stats-turn-control"><label for="statsTurn">${bilingual("回合", "Turn")}</label><input id="statsTurn" type="range" min="0" max="${game.statistics.history.length - 1}" value="${selected}" step="1"><output id="statsTurnLabel" for="statsTurn"></output></div>
        <div id="statsPointValues" class="stats-point-values" aria-live="polite"></div>
        <p class="stats-note stats-footnote">${bilingual("记录每个玩家回合结束时的分数；最后一点为获胜时。", "Scores are recorded at the end of each personal turn; the last point is the winning moment.")}${game.pairedTurn ? bilingual("主回合与补充建造分别计数。", "Primary and paired-building turns count separately.") : ""}</p>
        ${dataTable(["回合 / Turn", "行动玩家 / Turn owner", ...game.players.map(p => `${p.id + 1}. ${playerName(p.id)}`)], game.statistics.history.map(row => [row.turn, row.player === null ? "初始建设 / Setup" : playerName(row.player), ...row.scores]))}`;
      const slider = body.querySelector("#statsTurn");
      slider.oninput = () => { selected = Number(slider.value); drawScores(); };
      body.querySelectorAll("[data-stats-player]").forEach(input => {
        input.onchange = () => { const id = Number(input.dataset.statsPlayer); input.checked ? visible.add(id) : visible.delete(id); drawScores(); };
      });
      const plot = body.querySelector("#statsScorePlot");
      plot.onpointerdown = event => {
        const rect = plot.getBoundingClientRect(), width = rect.width - 58;
        selected = Math.round(Math.max(0, Math.min(1, (event.clientX - rect.left - 36) / width)) * (game.statistics.history.length - 1));
        slider.value = selected; drawScores();
      };
      drawScores();
    }

    function drawScores() {
      const plot = body.querySelector("#statsScorePlot");
      if (!plot || !game) return;
      const history = game.statistics.history, row = history[selected];
      const w = Math.max(220, plot.clientWidth), h = 290, left = 36, right = w - 22, bottom = h - 28, top = 20;
      const maximum = history.reduce((max, row) => Math.max(max, ...row.scores), 2);
      const step = Math.max(1, Math.ceil(maximum / 5)), cap = Math.ceil(maximum / step) * step;
      const x = i => left + (right - left) * i / Math.max(1, history.length - 1), y = n => bottom - n / cap * (bottom - top);
      let markup = `<text x="3" y="13" class="stats-axis">VP</text>`;
      for (let n = 0; n <= cap; n += step) markup += `<line x1="${left}" y1="${y(n)}" x2="${right}" y2="${y(n)}" class="stats-grid"/><text x="${left - 9}" y="${y(n) + 4}" text-anchor="end" class="stats-axis">${n}</text>`;
      const ticks = [...new Set(Array.from({ length: Math.min(5, history.length) }, (_, n) => Math.round(n * (history.length - 1) / Math.max(1, Math.min(5, history.length) - 1))))];
      ticks.forEach(i => { markup += `<text x="${x(i)}" y="${h - 5}" text-anchor="middle" class="stats-axis">${history[i].turn}</text>`; });
      game.players.filter(p => visible.has(p.id)).forEach(p => {
        const d = history.map((row, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(row.scores[p.id]).toFixed(1)}`).join(" ");
        markup += `<path d="${d}" class="stats-line-outline"/><path d="${d}" fill="none" stroke="${B.COLORS[p.id]}" stroke-width="3" stroke-dasharray="${dash[p.id]}"/>`;
      });
      markup += `<line x1="${x(selected)}" y1="${top}" x2="${x(selected)}" y2="${bottom}" class="stats-cursor"/>`;
      game.players.filter(p => visible.has(p.id)).forEach(p => {
        markup += `<circle cx="${x(selected)}" cy="${y(row.scores[p.id])}" r="5" fill="${B.COLORS[p.id]}" stroke="#244652" stroke-width="1.5"/>`;
      });
      plot.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="所有玩家每回合总分折线图 / Total VP by personal turn">${markup}</svg>`;
      body.querySelector("#statsTurnLabel").textContent = turnName(row);
      body.querySelector("#statsTurn").setAttribute("aria-valuetext", turnName(row));
      body.querySelector("#statsPointValues").innerHTML = `<p class="stats-turn-owner">${row.player === null ? "初始建设 / Setup" : `${badge(row.player)}${playerName(row.player)} · ${row.part === 2 ? "补充建造 / Paired building" : "行动回合 / Turn owner"}`}</p>` + game.players.map(p => {
        const delta = row.scores[p.id] - (history[selected - 1]?.scores[p.id] ?? row.scores[p.id]);
        return `<div>${badge(p.id)}<span>${playerName(p.id)}</span><b>${row.scores[p.id]} <small>VP</small></b>${delta ? `<small class="stats-delta">${delta > 0 ? "+" : ""}${delta}</small>` : ""}</div>`;
      }).join("");
    }

    function renderDice() {
      const counts = game.statistics.dice, total = sum(counts), max = Math.max(1, ...counts);
      body.innerHTML = `<p class="stats-note">${bilingual("实际掷骰次数与理论次数", "Actual and expected roll counts")}</p><div class="stats-dice-key"><span class="stats-swatch" style="--swatch:#4298b5"></span>实际 / Actual <span class="stats-expected-key"></span>理论次数 / Expected</div><div class="stats-dice-chart">${counts.map((n, i) => {
        const number = i + 2, chance = (6 - Math.abs(7 - number)) / 36, scale = Math.max(max, total / 6);
        return `<div class="stats-dice-column" title="${number}: ${n} 次 / rolls; ${(chance * 100).toFixed(1)}% 理论概率 / expected probability"><strong>${n}</strong><div class="stats-dice-track"><span class="stats-dice-bar ${number === 7 ? "is-seven" : ""}" style="height:${n / scale * 100}%"></span><i style="bottom:${total * chance / scale * 100}%"></i></div><b>${number}</b></div>`;
      }).join("")}</div><p class="stats-note stats-footnote">${bilingual("仅统计回合的两颗骰子，不含进攻要塞的单骰。理论次数 = 掷骰总次数 × 该点数的理论概率。", "Only the two turn dice count, not fortress combat dice. Expected count = total rolls × theoretical probability.")}</p>${total ? "" : `<p class="stats-note">${bilingual("本局尚未掷骰。", "No dice were rolled in this match.")}</p>`}${dataTable(["点数 / Sum", "次数 / Rolls", "占比 / Actual %", "理论概率 / Expected %"], counts.map((n, i) => [i + 2, n, total ? `${(n / total * 100).toFixed(1)}%` : "0%", `${((6 - Math.abs(5 - i)) / 36 * 100).toFixed(1)}%`]))}`;
    }

    function renderBars(production) {
      const keys = production ? resources : buildings;
      const values = game.statistics.players.map(p => production ? p.production.map((n, i) => n + p.gold[i]) : [p.built.settlement, p.built.city, p.built.road, p.built.ship]);
      const max = Math.max(1, ...values.map(sum));
      body.innerHTML = `<p class="stats-note">${production
        ? bilingual("生产与金矿实际领到的资源", "Resource cards received from production and gold")
        : bilingual("累计建造，含初始建筑与免费道路", "Cumulative builds, including starting pieces and free roads")}</p>
        <div class="stats-bar-legend">${keys.map(([zh, en, color]) => `<span><i class="stats-swatch" style="--swatch:${color}"></i>${bilingual(zh, en)}</span>`).join("")}</div>
        <div class="stats-bars">${values.map((row, id) => `<div class="stats-bar-row"><div class="stats-bar-person">${badge(id)}<strong>${playerName(id)}</strong><b>${sum(row)} <small>${production ? "张 / cards" : "次 / builds"}</small></b></div><div class="stats-bar-track" role="img" aria-label="${playerName(id)}: ${keys.map(([zh, en], i) => `${zh} / ${en} ${row[i]}`).join(", ")}">${row.map((n, i) => n ? `<span style="width:${n / max * 100}%;--segment:${keys[i][2]}" title="${keys[i][0]} / ${keys[i][1]}: ${n}"></span>` : "").join("")}</div><p>${keys.map(([zh, en], i) => `<span>${zh} / ${en} <b>${row[i]}</b></span>`).join("")}</p>${production && game.board.islands ? `<small class="stats-gold">含金矿 ${sum(game.statistics.players[id].gold)} 张 / Includes ${sum(game.statistics.players[id].gold)} gold cards</small>` : ""}</div>`).join("")}</div>
        <p class="stats-note stats-footnote">${production
          ? bilingual("不含开局赠送、交易、偷取、发展卡或布匹；银行缺货时只计实领数量。", "Excludes starting cards, trades, theft, development cards and cloth; shortages count only cards received.")
          : bilingual("城市记升级次数；移船、战舰改装、收复要塞不算新建；被拆除或摧毁的不扣回。", "Cities count upgrades. Ship moves, warship conversions and fortress recovery are excluded; removed or destroyed pieces stay counted.")}</p>
        ${dataTable(["玩家 / Player", ...keys.map(([zh, en]) => `${zh} / ${en}`), "合计 / Total"], values.map((row, id) => [playerName(id), ...row, sum(row)]))}`;
    }

    function dataTable(headers, rows) {
      return `<details class="stats-data"><summary>详细数据 / Data table</summary><div tabindex="0" role="region" aria-label="统计明细 / Statistics data"><table><thead><tr>${headers.map(h => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((value, i) => i ? `<td>${value}</td>` : `<th scope="row">${value}</th>`).join("")}</tr>`).join("")}</tbody></table></div><p class="stats-note">${bilingual("按号位累计；中途换人会继续使用该号位的数据。", "Totals follow each seat, including when a player is replaced.")}</p></details>`;
    }
    document.getElementById("statisticsTabs").onclick = event => {
      const button = event.target.closest("[data-stats-tab]");
      if (!button) return;
      active = button.dataset.statsTab; render(); document.getElementById(`statsTab-${active}`).focus(); body.scrollTop = 0;
    };
    document.getElementById("statisticsTabs").onkeydown = event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const i = tabs.findIndex(t => t[0] === active);
      active = tabs[event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (i + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length][0];
      render(); document.getElementById(`statsTab-${active}`).focus(); body.scrollTop = 0;
    };
    new ResizeObserver(() => { if (dialog.open && active === "scores") drawScores(); }).observe(body);
    return { sync };
  }
  window.CatanStatistics = { mount };
})();
