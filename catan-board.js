"use strict";
window.CatanBoard = (() => {
  const COLORS = ["#f16d66", "#53b5ed", "#ffc85c", "#ba97ee"];
  const RES = ["wood", "brick", "wool", "grain", "ore", "desert", "sea", "gold", "fog"];
  const FILL = ["#249b63", "#dd7650", "#a8c847", "#edc448", "#a0b8b8", "#dece96", "#197c9e", "#d6b457", "#a3c6ca"];
  const names = ["森林 / Forest", "丘陵 / Hills", "牧场 / Pasture", "麦田 / Fields", "山地 / Mountains", "沙漠 / Desert", "海洋 / Sea", "金矿 / Gold fields", "未知海域 / Unexplored"];
  const sprite = document.getElementById("catanSprite") ? "#catan-art-" : "catan-art.svg#";
  const icon = (kind, x = 0, y = 0, size = 48, color = "") => `<use href="${sprite}${kind}" x="${x}" y="${y}" width="${size}" height="${size}"${color ? ` style="color:${color}"` : ""}/>`;
  const scenarioIcon = (kind, x, y, size, color = "") => `<use href="${document.getElementById("catanScenarioSprite") ? "#catan-scenario-art-" : "catan-scenario-art.svg#"}${kind}" x="${x}" y="${y}" width="${size}" height="${size}"${color ? ` style="color:${color}"` : ""}/>`;
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function piece(kind, x, y, size, skins) {
    const choice = window.GameSocialData?.skin(kind, skins?.[kind]);
    return choice?.emoji ? `<text class="piece-emoji" x="${x + size / 2}" y="${y + size * .82}" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif" font-size="${size * .9}">${choice.emoji}</text>` : icon(choice?.art || kind, x, y, size);
  }
  function render(board, options = {}) {
    const { legal = {}, mode = "", selected = null, dice = [], preview = false, moveFrom = null, thief = "robber" } = options;
    const shadow = preview ? "preview-piece-shadow" : "game-piece-shadow";
    const showPieces = !preview || board.islands || Boolean(board.skins);
    const v = board.vertices;
    const scenario = options.scenario || board.scenario || {};
    const piratePosition = board.tiles[board.pirate] || board.pirateStart;
    const points = (tile, scale = 1) => tile.vertices.map((i) => `${tile.x + (v[i].x - tile.x) * scale},${tile.y + (v[i].y - tile.y) * scale}`).join(" ");
    const accessible = (attr, id, label) => preview ? "" : `data-${attr}="${id}" tabindex="0" role="button" aria-label="${label} ${id + 1}"`;
    const info = (kind, label) => `data-scenario-info="${kind}" tabindex="0" role="button" aria-label="${escape(label)} · 查看说明 / Details"`;
    return `<svg class="catan-island" viewBox="${board.bounds?.join(" ") || "-310 -285 620 570"}" xmlns="http://www.w3.org/2000/svg" aria-label="卡坦岛棋盘 / Catan board">
      <defs><filter id="${shadow}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-opacity=".25"/></filter></defs>
      <g fill="none" stroke="#68becd" opacity=".3" stroke-width="2"><path d="M-290-160q12 7 24 0m-9 12q12 7 24 0M218 178q12 7 24 0m-9 12q12 7 24 0M-249 165q12 7 24 0M209-196q12 7 24 0"/></g>
      ${board.tiles.map((t) => {
        const foreign = scenario.kind === "tribes" && t.resource >= -1 && !t.setupAllowed;
        const clothIsland = scenario.kind === "cloth" && t.resource >= -1 && !t.setupAllowed;
        const r = foreign || clothIsland ? 5 : t.resource === -3 ? 8 : t.resource === -2 ? 6 : t.resource === -1 ? 5 : t.resource === 5 ? 7 : t.resource;
        const occupied = showPieces && (t.id === board.robber || t.id === board.pirate);
        const robbable = !preview && ["robber", "pirate"].includes(mode) && legal[mode]?.includes(t.id);
        const chosen = robbable && selected?.kind === "tile" && selected.id === t.id;
        const rolled = dice.length && dice[0] + dice[1] === t.number && t.id !== board.robber;
        return `<g ${robbable ? `${accessible("tile", t.id, "移动强盗 / Move robber")} aria-pressed="${chosen}"` : foreign ? info("foreign", "外岛，不产资源，不能建村 / Foreign island, no production or settlements") : ""} class="hex-tile ${foreign ? "foreign-island" : ""} ${clothIsland ? "cloth-island" : ""} ${r === 8 ? "fog-tile" : ""} ${robbable ? "target-tile" : ""} ${chosen ? "chosen-tile" : ""} ${rolled ? "producing" : ""}">
          <title>${foreign ? "外岛 · 不产资源 · 不能建村 / Foreign island · No production or settlements" : names[r]}${t.number ? ` · ${t.number}` : ""}</title>
          <polygon points="${points(t)}" fill="${r === 8 ? "#b9d5d7" : r === 6 ? "#197c9e" : "#ebca80"}" stroke="${r >= 6 && r !== 7 ? "#51a1b2" : "#f6df9e"}" stroke-width="2"/>
          <polygon class="hex-land" points="${points(t, .88)}" fill="${FILL[r]}" stroke="#384b3f" stroke-opacity=".25" stroke-width="1.5"/>
          <polygon points="${points(t, .78)}" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="1"/>
          ${occupied ? "" : r === 8 ? `${icon("fog", t.x - 24, t.y - 28, 48)}<text x="${t.x}" y="${t.y + 24}" text-anchor="middle" fill="#34606b" font-size="21" font-weight="800">?</text>` : icon(RES[r], t.x - 16, t.y - 37, 32)}
          ${t.number ? occupied
            ? `<g class="blocked-number"><rect x="${t.x - 13}" y="${t.y - 39}" width="26" height="17" rx="4" fill="#fff7df"/><text x="${t.x}" y="${t.y - 26}" text-anchor="middle" fill="#634576" font-size="14" font-weight="800">${t.number}</text></g>`
            : `<g><rect x="${t.x - 18}" y="${t.y - 1}" width="36" height="36" rx="7" fill="#fff7df" stroke="#907a46" stroke-opacity=".35"/><text x="${t.x}" y="${t.y + 23}" text-anchor="middle" fill="${[6, 8].includes(t.number) ? "#b53732" : "#254938"}" font-size="24" font-weight="800">${t.number}</text><text x="${t.x}" y="${t.y + 31}" text-anchor="middle" fill="${[6, 8].includes(t.number) ? "#b53732" : "#254938"}" font-size="8">${"•".repeat(6 - Math.abs(7 - t.number))}</text></g>` : ""}
          ${robbable ? `<g class="robber-target" aria-hidden="true"><circle class="robber-target-outline" cx="${t.x}" cy="${t.y}" r="39"/><circle class="robber-target-ring" cx="${t.x}" cy="${t.y}" r="39"/></g>` : ""}
        </g>`;
      }).join("")}
      ${scenario.piratePath?.length ? `<g class="pirate-patrol" aria-label="海盗巡航路线 / Pirate patrol" fill="none" stroke="#ecedce" stroke-opacity=".65" stroke-width="2">${scenario.piratePath.map((id, i, path) => {
        const a = board.tiles[id], b = board.tiles[path[(i + 1) % path.length]];
        if (!a || !b) return "";
        const x = a.x * .4 + b.x * .6, y = a.y * .4 + b.y * .6, angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        return `<path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke-dasharray="3 7"/><path d="m-7-5 7 5-7 5" transform="translate(${x} ${y}) rotate(${angle})"/>`;
      }).join("")}</g>` : ""}
      ${board.ports.map((p) => {
        const a = v[p.vertices[0]], b = v[p.vertices[1]], x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        // The outward edge normal keeps both pier arms equal at every harbor.
        const land = p.land !== undefined ? board.tiles[p.land] : { x: 0, y: 0 };
        const direction = -dy * (x - land.x) + dx * (y - land.y) >= 0 ? 1 : -1;
        const px = x - dy / length * 36 * direction, py = y + dx / length * 36 * direction;
        return `<g><path class="harbor-pier" d="M${a.x},${a.y} L${px},${py} L${b.x},${b.y}" stroke="#dbb369" stroke-width="5" fill="none"/><circle cx="${px}" cy="${py}" r="17" fill="#e9f2e8" stroke="#b5d6d7" stroke-width="2"/>${p.resource < 0 ? `<text x="${px}" y="${py+5}" text-anchor="middle" fill="#1d5573" font-size="14" font-weight="800">3:1</text>` : `${icon(RES[p.resource], px-9, py-14, 18)}<text x="${px}" y="${py+12}" text-anchor="middle" fill="#1d5573" font-size="10" font-weight="800">2:1</text>`}</g>`;
      }).join("")}
      ${board.edges.filter((e) => e.owner >= 0).map((e) => {
        if (e.kind !== "ship") return `<g class="built-road"><path d="M${v[e.a].x} ${v[e.a].y}L${v[e.b].x} ${v[e.b].y}" stroke="#283c4b" stroke-width="12" stroke-linecap="round"/><path d="M${v[e.a].x} ${v[e.a].y}L${v[e.b].x} ${v[e.b].y}" stroke="${COLORS[e.owner]}" stroke-width="8" stroke-linecap="round"/></g>`;
        const x = (v[e.a].x + v[e.b].x) / 2, y = (v[e.a].y + v[e.b].y) / 2;
        const movable = mode === "moveShip" && legal.moveShips?.includes(e.id), victim = mode === "steal" && thief === "pirate" && (scenario.kind === "pirates" || e.tiles.includes(board.pirate)) && legal.victims?.includes(e.owner);
        return `<g class="built-ship ${e.warship ? "built-warship" : ""} ${victim ? "steal-target" : movable ? "ship-move-target" : ""}" ${victim ? accessible("victim", e.owner, "偷取船主资源 / Steal from ship owner") : movable ? accessible("edge", e.id, "移动这艘船 / Move this ship") : ""}>${victim || movable ? `<circle cx="${x}" cy="${y}" r="23" fill="#ffea9480" stroke="#fff0b2" stroke-width="3"/>` : ""}<g filter="url(#${shadow})">${e.warship ? scenarioIcon("warship", x - 19, y - 23, 38, COLORS[e.owner]) : icon("ship", x - 19, y - 23, 38, COLORS[e.owner])}</g></g>`;
      }).join("")}
      ${(scenario.gifts || []).filter((gift) => gift.claimedBy == null || gift.claimedBy < 0).map((gift) => {
        const edge = board.edges[gift.edge]; if (!edge) return "";
        const a = v[edge.a], b = v[edge.b], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const land = edge.tiles.map(i => board.tiles[i]).find(t => t.resource >= -1);
        const dx = mx - (land?.x ?? mx), dy = my - (land?.y ?? my), length = Math.hypot(dx, dy) || 1;
        // Keep the information badge off the edge where a ship is placed.
        const x = mx + dx / length * 23, y = my + dy / length * 23;
        const harbor = gift.kind === "harbor", rate = gift.resource >= 0 ? "2:1" : "3:1";
        const name = harbor ? `${gift.resource >= 0 ? ["木材 / Lumber", "砖块 / Brick", "羊毛 / Wool", "麦子 / Grain", "矿石 / Ore"][gift.resource] : "通用 / Generic"} ${rate} 海港 / Harbor` : gift.kind === "vp" ? "+1 胜利点 / Victory point" : "免费发展卡 / Free development card";
        const badge = harbor ? `<rect class="gift-badge" x="${x - 24}" y="${y - 15}" width="48" height="30" rx="5" fill="#edf6f1" stroke="#bb9044" stroke-width="2"/>${gift.resource >= 0 ? icon(RES[gift.resource], x - 21, y - 11, 20) : ""}<text x="${x + (gift.resource >= 0 ? 10 : 0)}" y="${y + 5}" text-anchor="middle" fill="#20526a" font-size="13" font-weight="800">${rate}</text>`
          : `<circle class="gift-badge" cx="${x}" cy="${y}" r="16" fill="#fff2c3" stroke="#bb9044" stroke-width="2"/>${icon(gift.kind === "vp" ? "dev-vp" : "development", x - 11.5, y - 11.5, 23)}`;
        return `<g class="scenario-gift" data-gift="${escape(gift.id)}"><path class="gift-coast" d="M${a.x * .8 + b.x * .2} ${a.y * .8 + b.y * .2}L${a.x * .2 + b.x * .8} ${a.y * .2 + b.y * .8}" stroke="#fff2b0" stroke-width="5" stroke-linecap="round"/><path class="gift-connector" d="M${mx} ${my}L${x} ${y}" stroke="#ffe19a" stroke-width="2"/><g ${info(gift.kind, name)} data-resource="${gift.resource ?? -1}"><title>${escape(name)} · 船抵达所连海岸边领取 / Claim by ship on the linked coast edge</title>${badge}</g></g>`;
      }).join("")}
      ${(scenario.villages || []).map((village) => {
        const point = v[village.vertex]; if (!point) return "";
        return `<g class="cloth-village" role="img" aria-label="${escape(`部落 ${village.number}，布匹 ${village.cloth} / Village ${village.number}, ${village.cloth} cloth`)}"><circle cx="${point.x}" cy="${point.y}" r="14" fill="#fff7df" stroke="#2f777d" stroke-width="2"/><text x="${point.x}" y="${point.y + 5}" text-anchor="middle" font-size="14" font-weight="800" fill="${[6, 8].includes(village.number) ? "#b53732" : "#254938"}">${village.number}</text><rect x="${point.x - 16}" y="${point.y + 13}" width="32" height="16" rx="4" fill="#e9f2e8" stroke="#6fa2a5"/>${scenarioIcon("cloth", point.x - 13, point.y + 14, 14)}<text x="${point.x + 8}" y="${point.y + 25}" text-anchor="middle" fill="#24566b" font-size="11" font-weight="800">${village.cloth}</text></g>`;
      }).join("")}
      ${(scenario.pirateSeats || []).map((seat, i) => {
        const point = v[seat.landing]; if (!point || point.owner >= 0) return "";
        return `<g class="pirate-outpost" role="img" aria-label="${i + 1} 号位补给点 / Seat ${i + 1} outpost"><circle cx="${point.x}" cy="${point.y}" r="9" fill="${COLORS[seat.owner ?? i]}" stroke="#fff0c6" stroke-width="2"/></g>`;
      }).join("")}
      ${(scenario.pirateSeats || []).filter((seat) => !seat.liberated && (seat.strength ?? 3) > 0).map((seat, i) => {
        const point = v[seat.fortress]; if (!point) return "";
        const strength = seat.strength ?? 3;
        return `<g class="pirate-fortress" role="img" aria-label="${escape(`海盗堡垒，强度 ${strength} / Pirate fortress, strength ${strength}`)}">${scenarioIcon("fortress", point.x - 20, point.y - 25, 40, COLORS[seat.owner ?? i])}<circle cx="${point.x + 14}" cy="${point.y + 10}" r="9" fill="#fff2c3" stroke="#735b46"/><text x="${point.x + 14}" y="${point.y + 14}" text-anchor="middle" fill="#493d43" font-size="12" font-weight="800">${strength}</text></g>`;
      }).join("")}
      ${preview ? (scenario.pirateSeats || []).map((seat, i) => {
        const point = v[seat.home], edge = board.edges[seat.ship]; if (!point || !edge) return "";
        const x = (v[edge.a].x + v[edge.b].x) / 2, y = (v[edge.a].y + v[edge.b].y) / 2;
        return `<g class="pirate-starting-pieces">${icon("ship", x - 19, y - 23, 38, COLORS[i])}${icon("settlement", point.x - 15, point.y - 22, 30, COLORS[i])}</g>`;
      }).join("") : ""}
      ${["bridge", "wall"].flatMap((kind) => (scenario.wonderSites?.[kind] || []).map((id) => {
        const point = v[id]; if (!point || point.owner >= 0) return "";
        return `<g class="wonder-site" role="img" aria-label="${kind === "bridge" ? "大桥施工位置 / Great Bridge site" : "长城施工位置 / Great Wall site"}"><rect x="${point.x - 6}" y="${point.y - 6}" width="12" height="12" fill="${kind === "bridge" ? "#bd80cf" : "#cd9859"}" stroke="#fff0c6" stroke-width="2"/></g>`;
      })).join("")}
      ${(scenario.wonderSites?.setupForbidden || []).filter((id) => !(scenario.wonderSites.bridge || []).includes(id) && !(scenario.wonderSites.wall || []).includes(id)).map((id) => {
        const point = v[id]; if (!point || point.owner >= 0) return "";
        return `<g class="wonder-warning" role="img" aria-label="初始村庄禁放位置 / No starting settlement"><path d="m${point.x} ${point.y - 8} 7 8-7 8-7-8z" fill="#ffe37a" stroke="#81683d" stroke-width="1.5"/><text x="${point.x}" y="${point.y + 4}" text-anchor="middle" font-size="12" font-weight="800" fill="#594726">!</text></g>`;
      }).join("")}
      ${mode === "placeHarbor" ? (legal.scenario?.placeHarbors?.find((entry) => entry.harbor === options.harbor)?.edges || []).map((id) => {
        const edge = board.edges[id], a = v[edge.a], b = v[edge.b], x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        return `<g ${accessible("edge", id, "放置海港 / Place harbor")} class="board-target road-target ${selected?.kind === "edge" && selected.id === id ? "selected-target" : ""}"><path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="transparent" stroke-width="28"/><circle cx="${x}" cy="${y}" r="15" fill="#fff4ca" stroke="#176787" stroke-width="3"/><path d="M${x-5} ${y}h10m-5-5v10" stroke="#176787" stroke-width="2"/></g>`;
      }).join("") : ""}
      ${["road", "ship", "moveShip"].includes(mode) ? (mode === "moveShip" ? legal.shipDestinations?.[moveFrom] || [] : legal[mode === "ship" ? "ships" : "roads"] || []).map((id) => { const e = board.edges[id], a = v[e.a], b = v[e.b]; return `<g ${accessible("edge", id, mode === "road" ? "修建道路 / Build road" : "船只位置 / Ship destination")} class="board-target road-target ${selected?.kind === "edge" && selected.id === id ? "selected-target" : ""}"><circle cx="${(a.x+b.x)/2}" cy="${(a.y+b.y)/2}" r="16" fill="transparent"/><path d="M${a.x} ${a.y}L${b.x} ${b.y}" stroke="transparent" stroke-width="24"/><path class="target-road" d="M${a.x*.82+b.x*.18} ${a.y*.82+b.y*.18}L${b.x*.82+a.x*.18} ${b.y*.82+a.y*.18}" fill="none" stroke="#35383b" stroke-width="9" stroke-linecap="round"/>${mode !== "road" ? icon("ship", (a.x+b.x)/2-12, (a.y+b.y)/2-15, 24, "#e6ecdc") : ""}</g>`; }).join("") : ""}
      ${board.vertices.filter((v) => v.owner >= 0).map((v) => {
        const choosing = !preview && mode === "steal";
        const target = choosing && legal.victims?.includes(v.owner) && (scenario.kind === "pirates" || thief !== "pirate" && v.tiles.includes(board.robber));
        const kind = v.level === 2 ? "city" : "settlement", size = target ? 42 : 30;
        return `<g class="built-building ${target ? "steal-target" : choosing ? "steal-inactive" : ""}" ${target ? `${accessible("victim", v.owner, "偷取资源 / Steal one resource")} data-steal-vertex="${v.id}"` : ""}>
          ${target ? `<circle class="steal-hit" cx="${v.x}" cy="${v.y - 7}" r="32"/><g class="steal-halo" aria-hidden="true"><circle cx="${v.x}" cy="${v.y - 7}" r="24"/></g>` : ""}
          <g class="building-piece" filter="url(#${shadow})">${icon(kind, v.x - size / 2, v.y - 7 - size / 2, size, COLORS[v.owner])}</g>
          ${v.islandBonus ? `<g class="island-bonus" role="img" aria-label="登岛奖励 / Island bonus +${v.islandBonus} VP"><circle cx="${v.x+12}" cy="${v.y+5}" r="8" fill="#ffe391" stroke="#916b2f"/><text x="${v.x+12}" y="${v.y+8}" text-anchor="middle" fill="#604617" font-size="9" font-weight="800">${v.islandBonus}</text></g>` : ""}
        </g>`;
      }).join("")}
      ${["settlement", "city"].includes(mode) ? (legal[mode === "city" ? "cities" : "settlements"] || []).map((id) => `<g ${accessible("vertex", id, mode === "city" ? "升级城市 / Upgrade city" : "建造村庄 / Build settlement")} class="board-target ${selected?.kind === "vertex" && selected.id === id ? "selected-target" : ""}"><circle cx="${v[id].x}" cy="${v[id].y}" r="19" fill="transparent"/><circle class="target-dot" cx="${v[id].x}" cy="${v[id].y}" r="10" fill="#fffbe5" stroke="#176787" stroke-width="3"/><path d="M${v[id].x-4} ${v[id].y}h8m-4-4v8" stroke="#176787" stroke-width="2"/></g>`).join("") : ""}
      ${!showPieces || !board.tiles[board.robber] ? "" : `<g class="robber-piece" role="img" aria-label="强盗 / Robber">${piece("robber", board.tiles[board.robber].x - 21, board.tiles[board.robber].y - 21, 42, board.skins)}</g>`}
      ${!piratePosition ? "" : `<g class="pirate-piece" ${scenario.kind === "tribes" ? info("pirate", "海盗 / Pirate") : 'role="img" aria-label="海盗 / Pirate"'}>${piece("pirate", piratePosition.x - 23, piratePosition.y - 23, 46, board.skins)}</g>`}
    </svg>`;
  }
  return { render, icon, piece, escape, COLORS, RES };
})();
