"use strict";
((root) => {
  const names = { k: ["帅","将","General"], a: ["仕","士","Advisor"], b: ["相","象","Elephant"], n: ["马","马","Horse"], r: ["车","车","Chariot"], c: ["炮","炮","Cannon"], p: ["兵","卒","Soldier"] };
  const initial = "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR";
  function empty(kind) {
    if (kind === "gomoku") return Array(225).fill(-1);
    return initial.split("/").flatMap((r) => [...r].flatMap((c) => /[1-9]/.test(c) ? Array(Number(c)).fill(null) : [{ type: c.toLowerCase(), side: c === c.toUpperCase() ? 0 : 1 }]));
  }
  function render(kind, game, options = {}) {
    const gomoku = kind === "gomoku", cols = gomoku ? 15 : 9, rows = gomoku ? 15 : 10, step = gomoku ? 34 : 56, margin = gomoku ? 28 : 35;
    const width = margin*2+(cols-1)*step, height = margin*2+(rows-1)*step, board = game?.board || empty(kind), last = game?.moves.at(-1);
    const xy = (i) => { const r = Math.floor(i/cols), c = i%cols; return [margin+(options.flip ? cols-1-c : c)*step,margin+(options.flip ? rows-1-r : r)*step]; };
    let svg = `<svg class="duel-board-svg ${kind}" viewBox="0 0 ${width} ${height}" role="group" aria-label="${gomoku ? "五子棋棋盘 / Gomoku board" : "中国象棋棋盘 / Xiangqi board"}"><rect x="2" y="2" width="${width-4}" height="${height-4}" rx="7" class="board-surface"/><g class="board-grid">`;
    for (let r = 0; r < rows; r++) svg += `<path d="M${margin},${margin+r*step}H${width-margin}"/>`;
    for (let c = 0; c < cols; c++) {
      const x = margin+c*step;
      svg += `<path d="M${x},${margin}V${!gomoku && c>0 && c<8 ? margin+4*step : height-margin}${!gomoku && c>0 && c<8 ? ` M${x},${margin+5*step}V${height-margin}` : ""}"/>`;
    }
    if (!gomoku) {
      for (const r of [0,7]) svg += `<path d="M${margin+3*step},${margin+r*step}L${margin+5*step},${margin+(r+2)*step}M${margin+5*step},${margin+r*step}L${margin+3*step},${margin+(r+2)*step}"/>`;
    }
    svg += "</g>";
    if (gomoku) for (const i of [48,56,112,168,176]) { const [x,y] = xy(i); svg += `<circle cx="${x}" cy="${y}" r="3" fill="#709087"/>`; }
    else svg += `<g class="river-label"><text x="${margin+2*step}" y="${margin+4.5*step-1}">楚 河</text><text x="${margin+6*step}" y="${margin+4.5*step-1}">汉 界</text><text class="river-en" x="${width/2}" y="${margin+4.5*step+16}">CHU RIVER · HAN BORDER</text></g>`;
    const target = new Set(options.targets || []);
    const moveNumbers = new Map((game?.moves || []).map((m,n) => [m.to,n+1]));
    if (gomoku && game?.phase === "over" && game.winner >= 0 && last?.side === game.winner) {
      for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
        const ends = [-1,1].map((sign) => { let r=Math.floor(last.to/15),c=last.to%15; while(r+dr*sign>=0&&r+dr*sign<15&&c+dc*sign>=0&&c+dc*sign<15&&board[(r+dr*sign)*15+c+dc*sign]===game.winner){r+=dr*sign;c+=dc*sign;} return r*15+c; });
        if(Math.max(Math.abs(Math.floor(ends[0]/15)-Math.floor(ends[1]/15)),Math.abs(ends[0]%15-ends[1]%15))>=4){const a=xy(ends[0]),b=xy(ends[1]);svg+=`<path d="M${a[0]},${a[1]}L${b[0]},${b[1]}" fill="none" stroke="#d6a22f" stroke-width="12" stroke-linecap="round" opacity=".6"/>`;}
      }
    }
    board.forEach((p,i) => {
      const [x,y] = xy(i), occupied = gomoku ? p>=0 : Boolean(p), active = options.interactive && (gomoku ? !occupied : occupied || target.has(i));
      let label = gomoku ? `${"ABCDEFGHIJKLMNO"[i%15]}${15-Math.floor(i/15)}` : `${"abcdefghi"[i%9]}${9-Math.floor(i/9)}`;
      if (occupied) label += gomoku ? p===0 ? " 黑 / Black" : " 白 / White" : ` ${names[p.type][p.side]} / ${names[p.type][2]}`;
      svg += `<g data-cell="${i}" ${active ? `role="button" tabindex="0"` : ""} aria-label="${label}" class="board-point ${options.selected===i ? "selected" : ""}">`;
      if (last && (last.to===i || last.from===i)) svg += `<rect x="${x-step*.43}" y="${y-step*.43}" width="${step*.86}" height="${step*.86}" rx="5" class="last-square"/>`;
      if (occupied) {
        if (gomoku) svg += `<circle class="stone stone-${p}" cx="${x}" cy="${y+2}" r="14"/><circle class="stone-face stone-${p}" cx="${x}" cy="${y}" r="14"/>${options.numbers ? `<text class="stone-number n-${p}" x="${x}" y="${y+4}">${moveNumbers.get(i)||""}</text>` : last?.to===i ? `<circle cx="${x}" cy="${y}" r="3.5" fill="#e6b44c"/>` : ""}`;
        else svg += `<circle class="piece-base" cx="${x}" cy="${y+3}" r="24"/><circle class="piece-face side-${p.side}" cx="${x}" cy="${y}" r="24"/><circle class="piece-line side-${p.side}" cx="${x}" cy="${y}" r="19.5"/><text class="piece-letter side-${p.side}" x="${x}" y="${y+9}">${names[p.type][p.side]}</text>`;
      }
      if (target.has(i)) svg += occupied ? `<circle class="capture-target" cx="${x}" cy="${y}" r="26"/>` : `<circle class="move-target" cx="${x}" cy="${y}" r="8"/>`;
      if (options.selected===i) svg += `<circle class="selected-ring" cx="${x}" cy="${y}" r="27"/>`;
      if (!gomoku && game?.check && p?.type === "k" && p.side === game.current) svg += `<circle class="capture-target" cx="${x}" cy="${y}" r="27"/>`;
      if (active) svg += `<circle class="point-hit" cx="${x}" cy="${y}" r="${step/2}" fill="transparent"/>`;
      svg += "</g>";
    });
    return svg+"</svg>";
  }
  root.DuelBoard = { render, names, empty };
})(typeof window !== "undefined" ? window : globalThis);
