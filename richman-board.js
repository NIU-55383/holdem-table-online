"use strict";
(()=>{
  const D=window.RichmanData,esc=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const point=t=>({x:365+(t.x-t.y)*37,y:100+(t.x+t.y)*21});
  const use=(id,x,y,w,h=w)=>`<use href="richman-art.svg#${id}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  function render(g,seats=[],positions={},you=-1){
    const tiles=g?.tiles||D.tiles.map(t=>({...t,owner:-1,level:0}));
    const tilesHTML=tiles.map(t=>{const{x,y}=point(t),color=t.owner>=0?D.COLORS[t.owner]:"#ebeccf",symbol={bank:"bank",shop:"shop",lottery:"lottery"}[t.type];
      return`<g class="map-tile ${t.type}" data-tile="${t.id}" tabindex="0" role="button" aria-label="${esc(t.name+" / "+t.en)}"><title>${esc(t.name+" / "+t.en)}${t.type==="land"?` · ${t.owner>=0?esc(seats[t.owner]?.name||"")+" · Lv "+t.level:t.price}`:""}</title><path d="M${x} ${y-21}l37 21-37 21-37-21z" fill="${t.type==="land"?"#91a3a0":"#c6b99b"}" stroke="#e5e3c8" stroke-width="2"/><path d="M${x-28} ${y+4}l28 15 28-15" fill="none" stroke="${color}" stroke-width="6"/>${symbol?use(symbol,x-21,y-46,42,48):t.owner>=0?use(t.level>=3?"tower":"house",x-17,y-(32+t.level*5),34,37+t.level*5):`<text x="${x}" y="${y+4}" class="tile-number">${t.type==="land"?t.id+1:{news:"!",fate:"?",points:"+30"}[t.type]}</text>`}${t.owner>=0?`<text x="${x+23}" y="${y+7}" class="building-level">${t.level}</text>`:""}</g>`;
    }).join("");
    const trees=[[3,2],[7,2],[2,5],[6,5],[8,6]].map(([x,y])=>{const p=point({x,y});return use("tree",p.x-18,p.y-51,36,54);}).join("");
    const spirits=(g?.gods||[{type:"wealth",pos:3},{type:"angel",pos:15},{type:"devil",pos:24}]).map(d=>{const p=point(tiles[d.pos]);return`<g class="map-spirit" pointer-events="none"><title>${esc(D.gods[d.type].name+" / "+D.gods[d.type].en)}</title>${use(D.gods[d.type].art,p.x+13,p.y-41,24,28)}</g>`;}).join("");
    const players=(g?.players||[]).filter(p=>!p.out).map(p=>{const q=point(tiles[positions[p.id]??p.pos]),others=g.players.filter(x=>(positions[x.id]??x.pos)===(positions[p.id]??p.pos)&&!x.out),offset=(others.findIndex(x=>x.id===p.id)-(others.length-1)/2)*15;const seat=seats[p.id]||p;
      return`<g class="map-player ${g.current===p.id&&g.phase!=="over"?"current":""}" transform="translate(${q.x+offset},${q.y-12})" pointer-events="none"><ellipse cy="22" rx="13" ry="5" fill="#294a4938"/><path d="M-11 15L0 27l11-12" fill="${D.COLORS[p.id]}" stroke="#fffbe4" stroke-width="2"/><circle r="15" fill="${D.COLORS[p.id]}" stroke="#fffbe4" stroke-width="3"/><foreignObject x="-16" y="-16" width="32" height="32" pointer-events="auto"><div xmlns="http://www.w3.org/1999/xhtml" style="padding:4px;--player:${D.COLORS[p.id]}">${window.BoardGameUI.avatar(seat,seat.connected,"map-avatar",p.id===you)}</div></foreignObject></g>`;
    }).join("");
    return`<svg class="richman-map" viewBox="0 0 820 530" role="group" aria-label="晴湾地图 / Sunny Bay board"><path d="M365 64L774 296 446 483 35 250z" fill="#5babb8"/><path d="M365 83L755 305 441 484 52 263z" fill="#e8d99c"/><path d="M365 112L709 305 442 456 98 263z" fill="#b6d478"/><path d="M283 231l132-57 103 98-132 63z" fill="#c8de92"/><ellipse cx="402" cy="295" rx="72" ry="34" fill="#f0dfab"/><ellipse cx="402" cy="289" rx="61" ry="25" fill="#74c5ce"/><ellipse cx="402" cy="285" rx="30" ry="11" fill="#b4e7df"/><path d="M402 284v-21m0 6q-14-19-23 0m23 0q14-19 23 0" stroke="#e0f5df" stroke-width="4" fill="none"/>${trees}<g>${tilesHTML}</g><g class="map-name"><text x="405" y="229">晴湾</text><text x="405" y="248" class="map-name-en">SUNNY BAY</text></g>${spirits}${players}</svg>`;
  }
  window.RichmanBoard={render,point};
})();
