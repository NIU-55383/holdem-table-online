"use strict";
(()=>{
  const D=window.RichmanData,UI=window.BoardGameUI,$=s=>document.querySelector(s),esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const num=n=>Number(n||0).toLocaleString("en-US"),label=(zh,en)=>`${esc(zh)}<small>${esc(en)}</small>`,icon=n=>`<i data-lucide="${n}"></i>`,godArt=type=>`<svg class="god-art" viewBox="0 0 64 72" aria-hidden="true"><use href="richman-art.svg#${D.gods[type].art}"/></svg>`;
  let socket,state=null,online=false,replaced=false,toastTimer,animationTimer,bubbleTimer,animating=false,positions={},modal=null,ruleTab="basics",selectedTarget=null,orderValues={},bankValue=1000;
  const boardView={scale:1,x:0,y:0};let boardGesture=null,blockBoardClick=0;
  const nameInput=$("#playerName");nameInput.value=localStorage.getItem("boardclub-name")||"";$("#roomInput").value=new URLSearchParams(location.search).get("room")||"";UI.mountAvatarPicker($("#avatarPicker"),nameInput);
  const icons=()=>window.lucide?.createIcons();
  const social=UI.mountInteractions(()=>state&&({code:state.code,players:state.seats,you:state.seats[state.you]?.socialId,connected:online}),send);
  function toast(text){$("#toast").textContent=text;$("#toast").hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$("#toast").hidden=true,5000);}
  function send(data){if(!online||socket.readyState!==WebSocket.OPEN){toast("尚未连接服务器 / Server not connected");return false;}socket.send(JSON.stringify(data));return true;}
  function action(data,close=false){if(!state?.game)return;if(send({type:"action",revision:state.game.revision,action:data})&&close)closeModal();}
  function connect(){
    if(location.protocol==="file:"){$("#connection").textContent="请从游戏服务器打开 / Open via game server";toast("请打开服务器网址，文件模式不能联机 / Use the server URL");return;}
    socket=new WebSocket(`${location.protocol==="https:"?"wss":"ws"}://${location.host}/richman-ws`);
    socket.onopen=()=>{socket.send(JSON.stringify({type:"hello",token:sessionStorage.getItem("boardclub-richman-session")}));};
    socket.onmessage=event=>{const data=JSON.parse(event.data);
      if(data.type==="reaction"){social.receive(data);return;}
      if(data.type==="welcome"){online=true;sessionStorage.setItem("boardclub-richman-session",data.token);$("#connection").textContent="已连接 / Connected";$("#connection").dataset.connected="true";return;}
      if(data.type==="error"){toast(data.message);return;}
      if(data.type==="left"){state=null;clearTimeout(animationTimer);animating=false;positions={};closeModal();history.replaceState({},"",location.pathname);render();return;}
      if(data.type!=="state")return;
      const old=state,newMove=data.game?.lastMove;state=data;history.replaceState({},"",`${location.pathname}?room=${data.code}`);
      if(old?.code===data.code&&old.game&&newMove&&newMove.id!==old.game.lastMove?.id&&!matchMedia("(prefers-reduced-motion: reduce)").matches){
        clearTimeout(animationTimer);positions={[newMove.player]:old.game.players[newMove.player].pos};animating=true;let step=0;
        const advance=()=>{positions[newMove.player]=newMove.path[step++];renderBoard();if(step<newMove.path.length)animationTimer=setTimeout(advance,150);else animationTimer=setTimeout(()=>{animating=false;positions={};render();},180);};animationTimer=setTimeout(advance,140);
      }
      render();
    };
    socket.onclose=event=>{online=false;$("#connection").dataset.connected="false";if(state){state.seats[state.you].connected=false;renderPlayers();renderLobby();icons();}if(event.code===4001){replaced=true;$("#connection").textContent="已在其他页面连接 / Open elsewhere";return;}$("#connection").textContent="重连中 / Reconnecting";if(!replaced)setTimeout(connect,1800);};
    socket.onerror=()=>{};
  }
  function identity(){const name=nameInput.value.trim();if(!name){toast("请输入名字 / Enter a name");nameInput.focus();return null;}localStorage.setItem("boardclub-name",name);return{name,avatar:UI.getAvatar()};}
  function create(ai){const who=identity();if(who)send({type:"create",...who,ai,players:Number($("#playerCount").value),funds:Number($("#funds").value),days:Number($("#days").value),difficulty:$("#difficulty").value});}
  $("#soloBtn").onclick=()=>create(true);$("#createBtn").onclick=()=>create(false);
  $("#joinForm").onsubmit=e=>{e.preventDefault();const who=identity();if(who)send({type:"join",...who,code:$("#roomInput").value.trim()});};
  $("#copyBtn").onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast("邀请链接已复制 / Invite copied");}catch{toast(`房间号 / Room: ${state.code}`);}};
  $("#leaveBtn").onclick=()=>openModal("leave");$("#autoBtn").onclick=()=>send({type:"auto"});
  $("#chatForm").onsubmit=e=>{e.preventDefault();const text=$("#chatText").value.trim();if(text&&send({type:"chat",text}))$("#chatText").value="";};
  window.addEventListener("board-avatar-change",e=>{if(state)send({type:"profile",avatar:e.detail.avatar});});
  function drawBoardView(){const board=$("#board");boardView.scale=Math.max(1,Math.min(3,boardView.scale));boardView.x=Math.max(-board.clientWidth*(boardView.scale-1),Math.min(0,boardView.x));boardView.y=Math.max(-board.clientHeight*(boardView.scale-1),Math.min(0,boardView.y));$("#mapCanvas").style.transform=`translate(${boardView.x}px,${boardView.y}px) scale(${boardView.scale})`;board.classList.toggle("zoomed",boardView.scale>1);$("#resetMap").hidden=boardView.scale<=1;}
  function renderBoard(){$("#board").innerHTML=`<div id="mapCanvas">${window.RichmanBoard.render(state?.game,state?.seats,positions,state?.you)}</div><button id="resetMap" class="icon-button" aria-label="重置视图 / Reset view" title="重置视图 / Reset view">${icon("scan")}</button>`;drawBoardView();$("#resetMap").onclick=()=>{Object.assign(boardView,{scale:1,x:0,y:0});drawBoardView();};}
  function dateText(g){const d=new Date(Date.UTC(2026,0,g.day));return`${d.getUTCFullYear()}.${String(d.getUTCMonth()+1).padStart(2,"0")}.${String(d.getUTCDate()).padStart(2,"0")} ${["周日 / Sun","周一 / Mon","周二 / Tue","周三 / Wed","周四 / Thu","周五 / Fri","周六 / Sat"][d.getUTCDay()]}`;}
  function cardClass(key){return["free","pardon","dismiss"].includes(key)?"passive":["red","black","tax","equal","pair","buy"].includes(key)?"finance":["destroy","monster","jail","sleep","seal"].includes(key)?"attack":"";}
  function cardButton(key,attribute="data-card",extra=""){const c=D.cards[key];return`<button class="rich-card ${cardClass(key)} ${extra}" ${attribute}="${key}" title="${esc(c[0]+" / "+c[1])}">${icon(c[2])}<span>${label(c[0],c[1])}</span></button>`;}
  const button=(type,zh,en,ico,disabled=false,primary=false)=>`<button data-act="${type}" ${disabled||animating?"disabled":""} class="${primary?"primary":""}">${ico?icon(ico):""}<span>${label(zh,en)}</span></button>`;
  function renderActions(){
    const g=state.game,p=g.players[state.you],mine=g.current===state.you&&!p.out&&!state.seats[state.you].auto,t=g.tiles[p.pos];let html="";
    if(g.phase==="over")html=state.you===state.host?`<button data-room-start class="primary">${icon("rotate-cw")}${label("再来一局","New game")}</button>`:"等待房主重新开局 / Waiting for host";
    else if(!mine)html=`<span>${state.seats[state.you].auto?"正在托管 / Auto is on":p.out?"你已破产，仍可观战和聊天 / Bankrupt; watching":"等待其他玩家行动 / Waiting for the current player"}</span>`;
    else if(g.phase==="roll")html=`${p.vehicle>1?`<label>${icon("dices")}<select id="diceCount">${Array.from({length:p.vehicle},(_,i)=>`<option value="${i+1}">${i+1} 骰 / Dice</option>`).join("")}</select></label>`:""}${button("roll","掷骰前进","Roll & move","dices",false,true)}`;
    else if(g.phase==="property")html=`<span>${label(t.name,t.en)}</span>${button(t.owner<0?"buy":"upgrade",`${t.owner<0?"买地":"加盖"} ${num(t.owner<0?g.buyPrice:Math.round(t.price*.6*g.index))}`,t.owner<0?"Buy land":"Upgrade","house-plus",p.cash<(t.owner<0?g.buyPrice:Math.round(t.price*.6*g.index)),true)}${button("done","跳过","Pass","arrow-right")}`;
    else if(["bank","shop","lottery"].includes(g.phase))html=`<button data-modal="${g.phase}" class="primary" ${animating?"disabled":""}>${icon({bank:"landmark",shop:"shopping-bag",lottery:"ticket"}[g.phase])}${label({bank:"存取款",shop:"卡片商店",lottery:"购买彩票"}[g.phase],{bank:"Bank",shop:"Card shop",lottery:"Buy tickets"}[g.phase])}</button>${button("done",g.remaining?"继续前进":"离开",g.remaining?"Continue moving":"Leave stop","arrow-right")}`;
    else html=button("done",g.phase==="rest"?"休息一天":"结束回合",g.phase==="rest"?"Rest a day":"End turn","check",false,true);
    $("#actions").innerHTML=html;
  }
  function renderPlayers(){
    if(!state?.game){$("#players").innerHTML="";return;}const g=state.game;
    $("#players").innerHTML=g.players.map(p=>{const seat=state.seats[p.id],bubble=state.chat.filter(m=>m.playerId===p.id&&Date.now()-m.time<6500).at(-1);return`<article class="rich-player ${g.current===p.id&&g.phase!=="over"?"current":""} ${p.out?"out":""}" style="--seat-color:${D.COLORS[p.id]}" data-player="${p.id}">${UI.avatar(seat,seat.connected,"rich-avatar",p.id===state.you)}<div class="player-data"><strong>${esc(seat.name)}<small>${p.id===state.host?"房主 / Host":seat.bot?"机器人 / Bot":p.id===state.you?"你 / You":""}</small></strong><div class="player-money"><span title="现金 / Cash">${icon("banknote")}${num(p.cash)}</span><span title="存款 / Deposit">${icon("landmark")}${num(p.deposit)}</span></div><div class="net-worth">${p.out?"破产 / Bankrupt":`${num(p.netWorth)} 总资产 / Net · ${p.cardCount} 卡 / Cards`}</div>${p.restUntil>g.day?`<small>${esc(p.restReason)} · ${p.restUntil-g.day} 天 / days</small>`:""}</div>${p.god?`<button class="god-button" data-god="${p.god.type}" title="${esc(D.gods[p.god.type].name+" / "+D.gods[p.god.type].en)}">${godArt(p.god.type)}<small>${p.god.until-g.day} 天 / days</small></button>`:""}${bubble?`<div class="chat-bubble">${esc(bubble.text)}</div>`:""}</article>`;}).join("");
    clearTimeout(bubbleTimer);const remaining=state.chat.filter(m=>Date.now()-m.time<6500).map(m=>6500-(Date.now()-m.time));if(remaining.length)bubbleTimer=setTimeout(()=>{renderPlayers();icons();},Math.min(...remaining)+20);
  }
  function renderLobby(){
    if(state.game){$("#lobby").innerHTML="";return;}const host=state.you===state.host;
    $("#lobby").innerHTML=state.seats.map((p,id)=>`<div class="lobby-seat" style="--seat-color:${D.COLORS[id]}">${p?`${UI.avatar(p,p.connected,"rich-avatar",id===state.you)}<span>${esc(p.name)}${label("",p.ready?"已准备 / Ready":"未准备 / Not ready")}</span>${host&&p.bot?`<button data-remove-bot="${id}" class="icon-button" title="移除机器人 / Remove bot" aria-label="移除机器人 / Remove bot">${icon("x")}</button>`:""}`:`<span>${id+1} 号位 / Seat ${id+1}</span><small>空位 / Open</small>`}</div>`).join("")+`<div class="lobby-actions">${host?`<button data-add-bots ${state.seats.every(Boolean)?"disabled":""}>${icon("bot")}${label("补齐机器人","Fill with bots")}</button><button data-room-start class="primary">${icon("play")}${label("开局","Start")}</button>`:`<button data-ready class="primary">${label(state.seats[state.you].ready?"取消准备":"准备",state.seats[state.you].ready?"Not ready":"Ready")}</button>`}</div>`;
  }
  function render(){
    social.sync();
    $(".rich-layout").classList.toggle("in-room",!!state);$("#setup").hidden=!!state;$("#roomPanel").hidden=!state;["actions","gameTools","handSection"].forEach(id=>$("#"+id).hidden=!state?.game);renderBoard();
    if(!state){$("#players").innerHTML="";$("#calendar").innerHTML="<span>晴湾 / Sunny Bay</span><span>虚拟游戏币 / Game currency</span>";$("#turnStatus").innerHTML=label("大富翁","Richman");icons();return;}
    $("#roomCode").textContent=state.code;renderLobby();
    $("#messages").innerHTML=state.chat.map(m=>`<p><strong>${esc(state.seats[m.playerId]?.name)}</strong>${esc(m.text)}</p>`).join("");$("#messages").scrollTop=$("#messages").scrollHeight;
    const g=state.game;
    if(g){
      const p=g.players[state.you],current=g.players[g.current];$("#calendar").innerHTML=`<span>${dateText(g)}</span><span>第 ${g.day} 天 / Day ${g.day}${g.limitDays?" / "+g.limitDays:""} · 物价 / Index ×${g.index}</span>`;
      const phases={roll:["准备掷骰","Ready to roll"],property:["投资土地","Property decision"],bank:["银行停靠","At the bank"],shop:["卡片商店","At the card shop"],lottery:["彩票亭","At the lottery booth"],rest:["休息中","Resting"],end:["回合行动","Turn actions"]};
      $("#turnStatus").classList.toggle("winner",g.phase==="over");$("#turnStatus").innerHTML=g.phase==="over"?`<span>${label(g.winners.map(id=>g.players[id].name).join(" & ")+" 胜利！",g.winners.map(id=>g.players[id].name).join(" & ")+" wins!")}<small>${esc(g.reason)}</small></span>`:`${g.dice.map(n=>`<span class="dice-face" aria-label="${n}">${["","⚀","⚁","⚂","⚃","⚄","⚅"][n]}</span>`).join("")}<span>${label(current.name+" · "+(animating?"前进中":phases[g.phase]?.[0]||"行动"),current.name+" · "+(animating?"Moving":phases[g.phase]?.[1]||"Playing"))}</span>`;
      renderActions();$("#autoBtn").classList.toggle("active",state.seats[state.you].auto);$("#autoBtn").title=state.seats[state.you].auto?"取消托管 / Stop auto":"托管 / Auto";
      $("#points").textContent=`${p.cardCount}/${D.MAX_CARDS} · ${num(p.points)} 点券 / Points`;
      $("#hand").innerHTML=p.cards.length?p.cards.map(k=>cardButton(k,"data-card",g.legal.cards[k]?.length?"usable":"")).join(""):`<span class="empty-note">暂无卡片 / No cards</span>`;
      $("#gameLog").innerHTML=[...g.log].reverse().map(m=>`<li>${esc(m.text)}<small>${esc(m.en)}</small></li>`).join("");
    }else{$("#turnStatus").innerHTML=label("等待玩家入座","Waiting for players");$("#gameLog").innerHTML="";}
    renderPlayers();if(modal&&!["rules","leave","god"].includes(modal.kind))renderModal();icons();
  }
  function openModal(kind,value){modal={kind,value};selectedTarget=null;renderModal();$("#richDialog").showModal();icons();}
  function closeModal(){modal=null;selectedTarget=null;$("#richDialog").close();}
  $("#closeDialog").onclick=closeModal;$("#richDialog").addEventListener("cancel",()=>{modal=null;});
  function renderModal(){
    if(!modal)return;const{kind,value}=modal,g=state?.game,p=g?.players[state.you];let title="",html="";
    const focused=document.activeElement?.matches("[data-order],#bankAmount")?{order:document.activeElement.dataset.order,id:document.activeElement.id}:null;
    if(kind==="rules"){
      title=label("大富翁规则","Richman Rules");const tabs={basics:["基础","Basics"],gods:["神明","Deities"],cards:["卡片","Cards"],stocks:["股票","Stocks"],lottery:["彩票","Lottery"]};
      html=`<div class="dialog-tabs">${Object.entries(tabs).map(([k,n])=>`<button data-rule-tab="${k}" class="${ruleTab===k?"active":""}">${label(...n)}</button>`).join("")}</div>`;
      if(D.rules[ruleTab])html+=`<ol class="rules-list">${D.rules[ruleTab].map(([zh,en])=>`<li>${label(zh,en)}</li>`).join("")}</ol>`;
      if(ruleTab==="gods")html+=`<div class="dialog-summary">神明通常附身 7 天，死神 13 天；遇到新神明替换旧神明。<small>Most deities stay 7 days; the Reaper stays 13. A new deity replaces the old one.</small></div><div class="rule-figures">${Object.entries(D.gods).map(([k,d])=>`<div class="rule-figure">${godArt(k)}<div><strong>${label(d.name,d.en)}</strong><p>${label(d.desc,d.detail)}</p></div></div>`).join("")}</div>`;
      if(ruleTab==="cards")html+=`<div class="dialog-summary">自己的掷骰前、土地决策或回合结束前可用卡；免费卡与免罪卡自动生效。<small>Use cards before rolling, at a property decision or before ending your turn. Waiver and Amnesty activate automatically.</small></div><div class="rule-figures">${Object.values(D.cards).map(c=>`<div class="rule-figure">${icon(c[2])}<div><strong>${label(c[0],c[1])}</strong><p>${label(c[5],c[6])}</p><small>${c[3]} 点券 / Points</small></div></div>`).join("")}</div>`;
      html+=`<p class="rules-source">规则参考 / References: <a href="https://km.softstar.com.tw/topic.aspx?mobile-app=true&theme=wiki&tid=456" target="_blank" rel="noopener">大宇《大富翁4Fun》介绍</a> · <a href="https://store.steampowered.com/app/2059810/4/?l=tchinese" target="_blank" rel="noopener">四代官方手册 / Richman 4 manual</a></p>`;
    }else if(kind==="leave"){title=label("离开房间？","Leave room?");html=`<p>进行中的角色会由机器人托管；保留此浏览器记录后可用房间号重进。<small>Your player will use auto mode. Rejoin with the room code in this browser session.</small></p><div class="dialog-actions"><button data-cancel>取消 / Cancel</button><button data-leave-confirm class="danger">离开 / Leave</button></div>`;}
    else if(kind==="god"){const d=D.gods[value];title=label(d.name,d.en);html=`<div class="card-focus">${godArt(value)}<p>${label(d.desc,d.detail)}</p></div><p>${d.days} 天 / days</p>`;}
    else if(!g){title=label("尚未开局","Game not started");html="<p>请先开始游戏 / Start a game first</p>";}
    else if(kind==="stocks"){
      title=label("股票市场","Stock Market");html=`<div class="dialog-summary">存款 / Deposit <b>${num(p.deposit)}</b> · 持股市值 / Holdings <b>${num(p.stockValue)}</b><small>${g.legal.canStock?"交易开放 · 每天最多 20 笔 / Open · 20 orders per day":"休市或游戏已结束 / Closed or game over"}</small></div><div class="stock-grid">${g.stocks.map(s=>{const delta=s.price-s.previous,lo=Math.min(...s.history)-2,hi=Math.max(...s.history)+2,points=s.history.map((v,i)=>`${i*200/Math.max(1,s.history.length-1)},${38-(v-lo)/(hi-lo)*35}`).join(" ");return`<article class="stock-item"><h3>${label(s.name,s.en)}</h3><div class="stock-price ${delta>=0?"up":"down"}">${s.price}<span>${delta>=0?"+":""}${delta} ${s.limit?"· "+(s.limit>0?"涨停 / Limit-up":"跌停 / Limit-down"):""}</span></div><svg class="sparkline" viewBox="0 0 200 42" preserveAspectRatio="none" aria-label="价格走势 / Price history"><polyline points="${points}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><small>${p.shares[s.id]} 股 / Shares${s.forceDays?` · ${s.force>0?"红卡 / Bull":"黑卡 / Bear"} ${s.forceDays} 天 / days`:""}</small><div class="stock-order"><input type="number" data-order="${s.id}" min="1" max="10000" step="1" value="${orderValues[s.id]||10}" aria-label="${esc(s.name)} 交易股数 / Shares"><button data-stock-buy="${s.id}" ${!g.legal.canStock||s.limit===1||state.seats[state.you].auto?"disabled":""}>买入 / Buy</button><button data-stock-sell="${s.id}" ${!g.legal.canStock||s.limit===-1||!p.shares[s.id]||state.seats[state.you].auto?"disabled":""}>卖出 / Sell</button></div></article>`;}).join("")}</div>`;
    }else if(kind==="lottery"){
      title=label("晴湾彩票","Sunny Bay Lottery");const can=g.current===state.you&&g.phase==="lottery"&&!state.seats[state.you].auto&&!animating;
      html=`<div class="dialog-summary">奖池 / Jackpot <b>${num(g.lottery.pool)}</b><small>每月 15 日开奖 · 每张 1,000 · 每次最多 5 张 / Draw on the 15th · 1,000 each · 5 per visit</small></div>${g.lottery.draw?`<p>上期 / Last draw: <b>${g.lottery.draw.number}</b> · ${g.lottery.draw.winner<0?"无人中奖 / No winner":esc(g.players[g.lottery.draw.winner].name)+" +"+num(g.lottery.draw.prize)}</p>`:""}<div class="number-grid">${Array.from({length:36},(_,i)=>{const n=i+1,owner=g.lottery.tickets[n],sold=Number.isInteger(owner);return`<button data-ticket="${n}" style="--seat-color:${D.COLORS[owner]||"transparent"}" class="${sold?"sold":""}" ${sold||!can||p.cash<1000||g.visitPurchases>=5?"disabled":""} title="${sold?esc(g.players[owner].name):"1,000"}">${n}</button>`;}).join("")}</div><p class="empty-note">${can?`本次已购 ${g.visitPurchases}/5 · Your visit purchases`:"停在彩票亭时可购买 / Buy when you stop at a lottery booth"}</p>`;
    }else if(kind==="bank"){
      title=label("晴湾银行","Sunny Bay Bank");const can=g.current===state.you&&g.phase==="bank"&&!state.seats[state.you].auto;
      html=`<div class="dialog-summary">现金 / Cash ${num(p.cash)} · 存款 / Deposit ${num(p.deposit)}</div><div class="bank-form"><label>金额 / Amount<input id="bankAmount" type="number" min="1" step="1" value="${bankValue}"></label><div><button data-bank="deposit" ${!can?"disabled":""}>${icon("arrow-down-to-line")}存入 / Deposit</button><button data-bank="withdraw" ${!can?"disabled":""}>${icon("arrow-up-from-line")}取出 / Withdraw</button></div></div><div class="dialog-actions"><button data-act="done" data-close-after class="primary" ${!can?"disabled":""}>继续 / Continue</button></div>`;
    }else if(kind==="shop"){
      title=label("卡片商店","Card Shop");const can=g.current===state.you&&g.phase==="shop"&&!state.seats[state.you].auto;
      html=`<div class="dialog-summary">${num(p.points)} 点券 / Points · ${p.cardCount}/${D.MAX_CARDS} 卡 / Cards</div><div class="card-store">${Object.entries(D.cards).map(([key,c])=>`<button class="rich-card ${cardClass(key)}" data-shop="${key}" ${!can||p.points<c[3]||p.cardCount>=D.MAX_CARDS?"disabled":""} title="${esc(c[5]+" "+c[6])}">${icon(c[2])}${label(c[0],c[1])}<b>${c[3]}</b></button>`).join("")}</div><h3>卖出 / Sell</h3><div class="card-store">${p.cards.map(k=>`<button class="rich-card ${cardClass(k)}" data-shop-sell="${k}" ${!can?"disabled":""}>${icon(D.cards[k][2])}${label(D.cards[k][0],D.cards[k][1])}<b>+${Math.floor(D.cards[k][3]/2)}</b></button>`).join("")}</div>`;
    }else if(kind==="properties"||kind==="tile"){
      title=kind==="tile"?label(g.tiles[value].name,g.tiles[value].en):label("我的地产","My Properties");const list=kind==="tile"?[g.tiles[value]]:g.tiles.filter(t=>t.owner===state.you);
      html=`<div class="property-list">${list.map(t=>{const owner=g.players[t.owner],worth=Math.round(t.price*(1+.6*t.level)*g.index),can=t.owner===state.you&&g.current===state.you&&["roll","end","property","bank"].includes(g.phase)&&!state.seats[state.you].auto;return`<div class="property-row"><svg class="god-art" viewBox="0 0 80 90"><use href="richman-art.svg#${t.type==="land"?"house":["bank","shop","lottery"].includes(t.type)?t.type:"shop"}"/></svg><div><strong>${label(t.name,t.en)}</strong><small>${t.type==="land"?`${owner?esc(owner.name):"未出售 / Unowned"} · Lv ${t.level} · ${num(worth)}`:"公共设施 / Public stop"}</small></div>${can?`<button data-sell-land="${t.id}" class="danger">${label("变卖 "+num(Math.floor(worth/2)),"Sell property")}</button>`:""}</div>`;}).join("")||"<p class=empty-note>暂无地产 / No properties</p>"}</div>`;
    }else if(kind==="sell"){
      const t=g.tiles[value];title=label("变卖地产？","Sell property?");html=`<p>${esc(t.name)} / ${esc(t.en)}</p><p>${num(Math.floor(t.price*(1+.6*t.level)*g.index/2))} 现金 / Cash</p><div class="dialog-actions"><button data-cancel>取消 / Cancel</button><button data-sell-confirm="${value}" class="danger">变卖 / Sell</button></div>`;
    }else if(kind==="card"){
      const c=D.cards[value],targets=g.legal.cards[value]||[];title=label(c[0],c[1]);html=`<div class="card-focus">${icon(c[2])}<p>${label(c[5],c[6])}</p></div>`;
      if(!targets.length||state.seats[state.you].auto)html+=`<p class="empty-note">${c[4]==="auto"?"满足条件时自动生效 / Activates automatically":"当前无法使用 / Not available now"}</p>`;
      else{
        const trivial=["none","self","selfGod","here"].includes(c[4]);if(trivial)selectedTarget=targets[0];
        if(!trivial)html+=`<div class="target-options">${targets.map(id=>{let text=c[4]==="step"?`${id} 步 / steps`:c[4]==="stock"?g.stocks[id].name+" / "+g.stocks[id].en:["player","opponent"].includes(c[4])?g.players[id].name:g.tiles[id].name+" / "+g.tiles[id].en;return`<button data-target="${id}" class="${selectedTarget===id?"selected":""}" style="--seat-color:${D.COLORS[id]}">${esc(text)}</button>`;}).join("")}</div>`;
        html+=`<div class="dialog-actions"><button data-cancel>取消 / Cancel</button><button data-use-card="${value}" class="primary" ${!targets.includes(selectedTarget)||animating?"disabled":""}>使用 / Use</button></div>`;
      }
    }
    $("#dialogTitle").innerHTML=title;$("#dialogContent").innerHTML=html;if(focused)$(focused.id?"#"+focused.id:`[data-order="${focused.order}"]`)?.focus({preventScroll:true});icons();
  }
  document.addEventListener("input",e=>{if(e.target.matches("[data-order]"))orderValues[e.target.dataset.order]=e.target.value;if(e.target.id==="bankAmount")bankValue=e.target.value;});
  document.addEventListener("click",e=>{
    const b=e.target.closest("button,[data-tile]");if(!b||b.disabled)return;const d=b.dataset;
    if(d.modal)openModal(d.modal);
    else if(d.tile!==undefined)openModal("tile",Number(d.tile));
    else if(d.card)openModal("card",d.card);
    else if(d.god)openModal("god",d.god);
    else if(d.ruleTab){ruleTab=d.ruleTab;renderModal();}
    else if(d.act){action({type:d.act,...(d.act==="roll"?{dice:Number($("#diceCount")?.value||1)}:{})},d.closeAfter!==undefined);}
    else if(d.roomStart!==undefined)send({type:"start"});
    else if(d.addBots!==undefined)send({type:"bots",fill:true});
    else if(d.removeBot!==undefined)send({type:"bots",remove:Number(d.removeBot)});
    else if(d.ready!==undefined)send({type:"ready",ready:!state.seats[state.you].ready});
    else if(d.leaveConfirm!==undefined){send({type:"leave"});closeModal();}
    else if(d.cancel!==undefined)closeModal();
    else if(d.target!==undefined){selectedTarget=Number(d.target);renderModal();}
    else if(d.useCard)action({type:"card",card:d.useCard,target:selectedTarget},true);
    else if(d.stockBuy!==undefined||d.stockSell!==undefined){const id=Number(d.stockBuy??d.stockSell),quantity=Number($(`[data-order="${id}"]`).value);action({type:"stock",stock:id,side:d.stockBuy!==undefined?"buy":"sell",quantity,quote:state.game.stocks[id].price});}
    else if(d.bank)action({type:"bank",direction:d.bank,amount:Number($("#bankAmount").value)});
    else if(d.ticket!==undefined)action({type:"lottery",number:Number(d.ticket)});
    else if(d.shop)action({type:"shop",card:d.shop});
    else if(d.shopSell)action({type:"shop",card:d.shopSell,sell:true});
    else if(d.sellLand!==undefined)openModal("sell",Number(d.sellLand));
    else if(d.sellConfirm!==undefined)action({type:"sellLand",tile:Number(d.sellConfirm)},true);
  });
  $("#board").addEventListener("keydown",e=>{if(["Enter"," "].includes(e.key)&&e.target.dataset.tile!==undefined){e.preventDefault();openModal("tile",Number(e.target.dataset.tile));}});
  const viewport=$("#board"),localPoint=p=>{const r=viewport.getBoundingClientRect();return{x:p.clientX-r.left,y:p.clientY-r.top};};
  const geometry=points=>({x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2,distance:Math.max(1,Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y))});
  function beginTouch(points){if(points.length>=2){const c=geometry(points);boardGesture={kind:"pinch",distance:c.distance,scale:boardView.scale,anchorX:(c.x-boardView.x)/boardView.scale,anchorY:(c.y-boardView.y)/boardView.scale};blockBoardClick=Infinity;}else boardGesture=points.length?{kind:"pan",start:points[0],x:boardView.x,y:boardView.y}:null;}
  viewport.addEventListener("touchstart",e=>{if(e.touches.length>=2)e.preventDefault();else blockBoardClick=0;beginTouch([...e.touches].map(localPoint));},{passive:false});
  viewport.addEventListener("touchmove",e=>{const points=[...e.touches].map(localPoint);if(points.length>=2){e.preventDefault();if(boardGesture?.kind!=="pinch")beginTouch(points);const c=geometry(points),s=boardGesture;boardView.scale=Math.max(1,Math.min(3,s.scale*c.distance/s.distance));boardView.x=c.x-s.anchorX*boardView.scale;boardView.y=c.y-s.anchorY*boardView.scale;drawBoardView();}else if(points.length===1&&boardGesture?.kind==="pan"){const dx=points[0].x-boardGesture.start.x,dy=points[0].y-boardGesture.start.y;if(Math.hypot(dx,dy)>6){blockBoardClick=Infinity;if(boardView.scale>1){e.preventDefault();boardView.x=boardGesture.x+dx;boardView.y=boardGesture.y+dy;drawBoardView();}}}},{passive:false});
  for(const type of["touchend","touchcancel"])viewport.addEventListener(type,e=>{if(!e.touches.length&&blockBoardClick===Infinity)blockBoardClick=performance.now()+450;beginTouch([...e.touches].map(localPoint));});
  viewport.addEventListener("click",e=>{if(e.detail!==0&&performance.now()<blockBoardClick){e.preventDefault();e.stopImmediatePropagation();}},true);
  viewport.addEventListener("wheel",e=>{if(!e.ctrlKey)return;e.preventDefault();const p=localPoint(e),next=Math.max(1,Math.min(3,boardView.scale*Math.exp(-e.deltaY*.01))),ratio=next/boardView.scale;boardView.x=p.x-(p.x-boardView.x)*ratio;boardView.y=p.y-(p.y-boardView.y)*ratio;boardView.scale=next;drawBoardView();},{passive:false});
  viewport.addEventListener("pointerdown",e=>{if(e.pointerType!=="mouse"||e.button!==0||e.target.closest("button"))return;blockBoardClick=0;if(boardView.scale>1)boardGesture={kind:"mouse",id:e.pointerId,start:localPoint(e),x:boardView.x,y:boardView.y};});
  viewport.addEventListener("pointermove",e=>{if(boardGesture?.kind!=="mouse"||boardGesture.id!==e.pointerId||!(e.buttons&1))return;const p=localPoint(e),dx=p.x-boardGesture.start.x,dy=p.y-boardGesture.start.y;if(Math.hypot(dx,dy)>6){blockBoardClick=Infinity;viewport.setPointerCapture(e.pointerId);boardView.x=boardGesture.x+dx;boardView.y=boardGesture.y+dy;drawBoardView();}});
  for(const type of["pointerup","pointercancel","lostpointercapture"])viewport.addEventListener(type,e=>{if(boardGesture?.kind!=="mouse"||boardGesture.id!==e.pointerId)return;if(blockBoardClick===Infinity)blockBoardClick=performance.now()+450;boardGesture=null;if(viewport.hasPointerCapture(e.pointerId))viewport.releasePointerCapture(e.pointerId);});
  new ResizeObserver(()=>{if($("#mapCanvas"))drawBoardView();}).observe(viewport);
  render();connect();
})();
