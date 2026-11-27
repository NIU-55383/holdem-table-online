"use strict";
(() => {
// Visual design adapted from the user-supplied reference:
// https://coup-court-lt19.onrender.com/
const $ = s => document.querySelector(s);
const ROLES = {
  Duke: { name: '公爵', en: 'DUKE', symbol: 'crown', color: 'purple', text: '征税 +3 · 阻止外国援助' },
  Assassin: { name: '刺客', en: 'ASSASSIN', symbol: 'dagger', color: 'red', text: '支付 3 金币 · 暗杀一名玩家' },
  Captain: { name: '队长', en: 'CAPTAIN', symbol: 'ship', color: 'blue', text: '偷取至多 2 金币 · 反制偷窃' },
  Ambassador: { name: '大使', en: 'AMBASSADOR', symbol: 'branch', color: 'green', text: '交换角色牌 · 反制偷窃' },
  Contessa: { name: '女伯爵', en: 'CONTESSA', symbol: 'rose', color: 'orange', text: '反制针对自己的暗杀' },
};
const ACTIONS = {
  income: { name: '收入', en: 'INCOME', note: '+1 金币', icon: 'coin' },
  aid: { name: '外国援助', en: 'FOREIGN AID', note: '+2 金币', icon: 'branch' },
  coup: { name: '政变', en: 'COUP', note: '支付 7 金币', icon: 'crown', target: true },
  tax: { name: '征税', en: 'DUKE', note: '+3 金币', icon: 'crown', role: 'Duke' },
  assassinate: { name: '暗杀', en: 'ASSASSIN', note: '支付 3 金币', icon: 'dagger', role: 'Assassin', target: true },
  steal: { name: '偷窃', en: 'CAPTAIN', note: '取得至多 2 金币', icon: 'ship', role: 'Captain', target: true },
  exchange: { name: '交换', en: 'AMBASSADOR', note: '抽 2 张 · 换牌', icon: 'branch', role: 'Ambassador' },
};
function icon(name, cls = '') {
  const paths = {
    crown: '<path d="M7 15l9 8 8-16 8 16 9-8-4 23H11z"/><path d="M15 43h18M15 33h18"/>',
    dagger: '<path d="M28 5l4 17-14 15-7-7 14-15zM9 26l13 13M13 35l-8 8M6 40l3 3"/><path d="M15 31l13-14"/>',
    ship: '<path d="M24 5v29M22 9L7 29h15M27 12l13 17H27M5 34h38l-8 8H13zM9 46l7-2 8 2 8-2 7 2"/>',
    branch: '<path d="M9 43C28 30 20 15 37 5M17 35C4 34 5 25 5 25s14-1 12 10M24 25C10 23 14 15 14 15s13 1 10 10M28 17C21 6 28 3 28 3s9 8 0 14M21 31c15 5 18-5 18-5s-13-6-18 5M29 20c13 2 15-7 15-7s-11-3-15 7"/>',
    rose: '<path d="M24 31v14M24 39l10-5M24 42l-10-7M24 6c9-8 15 2 11 7 12 0 12 12 4 14 3 10-8 14-15 5-7 9-18 5-15-5-8-2-8-14 4-14-4-5 2-15 11-7z"/><circle cx="24" cy="20" r="6"/>',
    coin: '<circle cx="24" cy="24" r="18"/><circle cx="24" cy="24" r="12"/><path d="M24 16v16M20 19h6a3 3 0 010 6h-4a3 3 0 000 6h6"/>',
    arrow: '<path d="M10 24h28M28 14l10 10-10 10"/>',
    shield: '<path d="M24 5L7 12v13c0 10 17 19 17 19s17-9 17-19V12zM16 24l6 6 12-13"/>',
  };
  return `<svg class="icon ${cls}" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.crown}</svg>`;
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const UI = window.BoardGameUI, sessionKey = 'boardclub-coup-session';
const english = { Duke:'Tax +3 · Block foreign aid', Assassin:'Pay 3 coins · Assassinate', Captain:'Steal up to 2 · Block stealing', Ambassador:'Exchange roles · Block stealing', Contessa:'Block assassination against you' };
const notes = { income:'+1 coin', aid:'+2 coins', coup:'Pay 7 coins', tax:'+3 coins', assassinate:'Pay 3 coins', steal:'Take up to 2 coins', exchange:'Draw 2 · Exchange' };
let state = null, socket, reconnectTimer, pendingTimer, busy = false, selectedAction = null, selectedCards = new Set(), phaseKey = '', toastTimer, confirmRequest;
const live = () => socket?.readyState === WebSocket.OPEN;
const read = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const write = (storage, key, value) => { try { storage.setItem(key, value); } catch {} };
const audio = BoardGameAudio.create();
const social = UI.mountInteractions(() => state && ({code:state.code,players:state.seats,you:state.seats[state.you]?.socialId,connected:live()}), send, {audio,onSoundChange:soundButton});
const management = UI.mountRoomControl(() => state?.control, send, () => $('#roomTools'));
const archives = BoardGameArchives.mount({game:'coup',send,view:()=>state?.control,name:()=>$('#playerName').value,anchor:$('#setup')});
const pname = id => state?.seats[id]?.name || '玩家 / Player';
const name = id => esc(pname(id));
const blocked = () => !live() || busy || !!state?.control?.paused || !!state?.seats[state.you]?.auto;
const can = () => blocked() ? 'disabled' : '';
const dual = (zh, en) => `${zh}<small class="en">${en}</small>`;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(()=>$('#toast').classList.remove('show'),5000); }
function soundButton() { $('#soundBtn').innerHTML = `<i data-lucide="${audio.muted?'volume-x':'volume-2'}"></i>`; $('#soundBtn').setAttribute('aria-pressed',String(!audio.muted)); $('#soundBtn').title = audio.muted?'开启音效 / Enable sound':'静音 / Mute'; window.lucide?.createIcons(); }
// Patch existing nodes so a state update does not recreate avatars, SVGs or focused cards.
function patch(container, html) {
  if (container.dataset.markup === html) return;
  container.dataset.markup = html;
  const template = document.createElement('template'); template.innerHTML = html;
  const key = n => n.nodeType===1 ? n.getAttribute('data-key') || n.id || null : null;
  const same = (a,b) => a.nodeType===b.nodeType && (a.nodeType!==1 || a.nodeName===b.nodeName && key(a)===key(b));
  function sync(parent, source) {
    let cursor = parent.firstChild;
    for(const next of [...source.childNodes]) {
      let old = cursor;
      if(key(next)) old = [...parent.childNodes].find(n=>same(n,next)) || null;
      if(!old || !same(old,next)) { old=next.cloneNode(true); parent.insertBefore(old,cursor); }
      else {
        if(old!==cursor) parent.insertBefore(old,cursor);
        if(old.nodeType===3) { if(old.data!==next.data) old.data=next.data; }
        else if(old.nodeType===1) {
          for(const a of [...old.attributes]) if(!next.hasAttribute(a.name)) old.removeAttribute(a.name);
          for(const a of [...next.attributes]) if(old.getAttribute(a.name)!==a.value) old.setAttribute(a.name,a.value);
          sync(old,next);
        }
      }
      cursor=old.nextSibling;
    }
    while(cursor) { const next=cursor.nextSibling; cursor.remove(); cursor=next; }
  }
  sync(container,template.content);
}
function roleCard(role, extra='', id=null, revealed=false, renderKey=null) {
  const r=ROLES[role]; if(!r) return '';
  const tag=id!==null?'button':'div', key=renderKey!==null?`card:${renderKey}`:id!==null?`card:${id}`:`role:${role}`;
  return `<${tag} data-key="${esc(key)}" class="role-card ${r.color} ${extra} ${revealed?'revealed':''}" ${id!==null?`type="button" data-card="${esc(id)}" aria-label="${esc(r.name+' / '+r.en)}" aria-pressed="${selectedCards.has(String(id))}" ${can()}`:''}><span class="card-corner">${r.en[0]}<small>◆</small></span><span class="card-illustration">${icon(r.symbol)}<span class="orbit"></span></span><span class="card-name">${r.name}</span><span class="card-en">${r.en}</span>${revealed?'<span class="revealed-label">已失去影响力 / Lost</span>':`<span class="card-ability">${r.text}</span>`}<span class="card-index">COURT · ${String(Object.keys(ROLES).indexOf(role)+1).padStart(2,'0')}</span></${tag}>`;
}
function seat(s,index) {
  if(!s) return `<div data-key="seat:${index}" class="seat empty"><span class="empty-emblem">＋</span><span>虚位以待 / Open</span><small>SEAT ${index+1}</small></div>`;
  const g=state.game,p=g?.players[index], me=index===state.you,active=g&&g.phase!=='over'&&g.current===index, connected=!!s.connected&&(s.bot||live());
  const status=s.vacant?'空位 / Vacant':`${connected?'在线 / Online':'离线 / Offline'}${s.bot?' · BOT':''}${state.host===index?' · 房主 / Host':''}`;
  return `<div data-key="seat:${index}" class="seat ${active?'active':''} ${p?.eliminated?'eliminated':''} ${me?'my-seat':''}"><div class="seat-header">${UI.avatar(s,connected,'coup-avatar',me&&!s.vacant)}<div class="seat-name">${esc(s.name)}${me?'<small>你 / You</small>':''}<span class="seat-status">${status}</span>${p?.eliminated?'<span class="seat-status">已出局 / Eliminated</span>':s.auto&&!s.bot?'<span class="seat-status">托管中 / Auto</span>':''}</div>${p?`<span class="coin-count" aria-label="${p.coins} 金币 / coins">${icon('coin')}${p.coins}</span>`:''}</div><div class="mini-hand">${p?p.cards.map((c,i)=>`<div data-key="mini:${index}:${i}" class="mini-card ${c.revealed?'open':me?'own':'back'} ${c.role?ROLES[c.role].color:''}">${c.role?`${icon(ROLES[c.role].symbol)}<span>${ROLES[c.role].name}</span>${c.revealed?'<small>已失效 / Lost</small>':''}`:`<span class="card-back-mark">${icon('crown')}</span>`}</div>`).join(''):`<div class="lobby-seat-text"><span>${s.ready?'准备就绪 / Ready':'等待准备 / Not ready'}</span>${s.bot&&state.host===state.you?`<button type="button" class="text-button remove-bot" data-remove="${esc(s.socialId)}" aria-label="移除 ${esc(s.name)} / Remove">×</button>`:''}</div>`}</div></div>`;
}
function phaseText() {
  const g=state.game,c=g?.choice||{},p=g?.pending;
  if(!g) return ['等待宾客入席','THE COURT AWAITS','至少 2 人，准备后由房主开局。','At least 2 players. Ready up, then the host starts.'];
  if(g.phase==='over') return g.endReason==='hostEnded'?['本局已提前结束','Ended by host','本局不判定胜者，暗牌仍保密。','No winner is declared; hidden roles remain private.']:[`${name(g.winner)} 胜利`,`${name(g.winner)} wins`,'宫廷落幕，唯一的掌权者已诞生。','The last influence standing rules the court.'];
  if(g.phase==='turn') return [`${name(g.current)} 的回合`,`${name(g.current)}’s turn`,g.players[g.current].coins>=10?'已有至少 10 金币，本回合必须政变。':'选择一个行动；角色声明可以虚张声势。',g.players[g.current].coins>=10?'10 or more coins: you must coup.':'Choose an action. Role claims may be bluffs.'];
  if(g.phase==='lose') return [`${name(c.playerId)} 选择公开身份`,'Choose influence to lose',esc(c.reason||'失去一点影响力'),esc(c.reasonEn||'Lose one influence and reveal that card.')];
  if(g.phase==='exchange') return [`${name(c.playerId)} 正在交换`,'A private exchange','选择仅对本人可见，请等待。','Only the exchanging player sees the options.'];
  if(g.phase==='actionChallenge') return [`${name(p.actorId)} 声明${ROLES[ACTIONS[p.action]?.role]?.name||''}`,'A role is claimed','可以质疑此声明，或放行。','Challenge the claim, or pass.'];
  if(g.phase==='block') return ['是否反制？','Block or allow?',`${ACTIONS[p.action]?.name||''}等待回应。`,'A blocking role may be claimed.'];
  if(g.phase==='blockChallenge') return [`${name(p.block.playerId)} 声明${ROLES[p.block.role]?.name||''}反制`,'A block is claimed','可以质疑反制声明，或放行。','Challenge the block, or pass.'];
  return ['等待回应','Waiting','',''];
}
function waiting() {
  const g=state.game; if(!g||g.phase==='over') return '';
  const c=g.choice||{},ids=g.requiredActors||c.eligible?.filter(id=>!c.responded?.includes(id))||(Number.isInteger(c.playerId)?[c.playerId]:[g.current]);
  return ids.length?`<div class="waiting"><span class="pulse-dot"></span>等待 / Waiting: ${ids.map(i=>`${name(i)}${state.seats[i]?.connected?'':'（离线 / offline）'}`).join('、')}</div>`:'';
}
function renderTable() {
  const g=state.game,t=phaseText(),slots=Array.from({length:g?state.seats.length:state.capacity},(_,i)=>state.seats[i]),split=Math.ceil(slots.length/2);
  patch($('#table'),`<div data-key="top-seats" class="seat-row" style="--seat-columns:${split}">${slots.slice(0,split).map(seat).join('')}</div><div data-key="center" class="table-center"><div class="deck"><div class="deck-card">${icon('crown')}<span>COUP</span><small>THE COURT</small></div><span class="deck-count">${g?`中央牌堆 / Deck · ${g.deckCount}`:'15 张角色牌 / 15 cards'}</span></div><div class="center-copy"><span class="eyebrow">${t[1]}</span><h2>${t[0]}</h2><p>${t[2]}<br>${t[3]}</p>${g?.pending?`<div class="pending-action">${ACTIONS[g.pending.action]?.name||''} / ${ACTIONS[g.pending.action]?.en||''}${Number.isInteger(g.pending.targetId)?` <span>→</span> ${name(g.pending.targetId)}`:''}</div>`:''}${waiting()}</div></div><div data-key="bottom-seats" class="seat-row" style="--seat-columns:${slots.length-split}">${slots.slice(split).map((s,i)=>seat(s,i+split)).join('')}</div>`);
}
function lobbyControls() {
  const host=state.host===state.you,ready=state.seats[state.you]?.ready,everyone=state.seats.length>=2&&state.seats.every((s,i)=>i===state.host||s.bot||s.ready),available=live()&&!state.control?.paused;
  return `<div data-key="lobby" class="lobby-controls"><div><span class="eyebrow">BEFORE THE FIRST MOVE</span><h3>你的身份，将在开局时揭晓。</h3><p class="muted">Your roles are dealt when play starts.<br>${state.seats.filter(s=>s.ready||s.bot).length} / ${state.seats.length} 已准备 / Ready</p></div><div class="lobby-buttons"><button type="button" class="${ready?'secondary':'primary'}" data-do="ready" ${available?'':'disabled'}>${ready?'✓ 已准备 · 取消 / Unready':'我准备好了 / Ready'}</button>${host?`<button type="button" class="primary" data-do="start" ${available&&everyone?'':'disabled'}>开始对局 / Start →</button>`:'<span class="muted">等待房主开始 / Waiting for host</span>'}</div></div>${host?`<div data-key="bots" class="bot-controls"><button type="button" class="secondary small" data-do="addBot" ${available&&state.seats.length<state.capacity?'':'disabled'}>添加机器人 / Add bot</button><button type="button" class="secondary small" data-do="fillBots" ${available&&state.seats.length<state.capacity?'':'disabled'}>填满机器人 / Fill bots</button><label>人数上限 / Capacity <select id="roomCapacity" ${available?'':'disabled'}>${[2,3,4,5,6].map(n=>`<option value="${n}" ${n===state.capacity?'selected':''} ${n<state.seats.length?'disabled':''}>${n}</option>`).join('')}</select></label></div>`:''}`;
}
function playControls() {
  const g=state.game,me=g.players[state.you],c=g.choice||{},responding=(c.eligible||[]).includes(state.you)&&!(c.responded||[]).includes(state.you),exchange=g.phase==='exchange'&&c.playerId===state.you,losing=g.phase==='lose'&&c.playerId===state.you;
  let controls='';
  if(g.phase==='over') controls=`<div data-key="over" class="observer-message"><h3>${g.endReason==='hostEnded'?'本局已提前结束 / Ended by host':`${name(g.winner)} 胜利 / ${name(g.winner)} wins`}</h3>${g.endReason==='hostEnded'?'<p>本局不判定胜者。 / No winner is declared.</p>':''}${state.host===state.you?`<button type="button" class="primary" data-do="rematch" ${!live()?'disabled':''}>返回大厅，再来一局 / Play again</button>`:'<p>等待房主开始下一局 / Waiting for the host</p>'}</div>`;
  else if(me.eliminated) controls='<div data-key="observer" class="observer-message"><h3>你已退出本局的权力角逐。<small class="en">You have been eliminated.</small></h3><p>可以继续观战；其他人的暗牌仍保密。<br>You may spectate. Other hidden roles remain private.</p></div>';
  else if(losing) controls=`<div data-key="decision" class="decision"><div><span class="eyebrow">CHOOSE YOUR INFLUENCE</span><h3>${dual('选择一张暗牌，公开并失去它。','Choose one hidden card to lose.')}</h3><p>${esc(c.reason||'')}<br>${esc(c.reasonEn||'Click a card, then confirm.')}</p></div></div>`;
  else if(exchange) controls=`<div data-key="decision" class="decision"><div><span class="eyebrow">A PRIVATE EXCHANGE</span><h3>${dual(`选择保留 ${c.keepCount} 张角色牌。`,`Keep ${c.keepCount} role cards.`)}</h3><p>已选 / Selected ${selectedCards.size} / ${c.keepCount} · 其余 2 张洗回牌堆。<br>The other 2 cards return to the shuffled deck.</p></div></div>`;
  else if(responding) controls=`<div data-key="decision" class="decision"><div><span class="eyebrow">YOUR DECISION</span><h3>${dual(g.phase==='block'?'是否声明一个角色来反制？':'相信这句声明，还是提出质疑？',g.phase==='block'?'Claim a role to block?':'Trust this claim, or challenge it?')}</h3><p>${g.phase==='block'?'不必真的持有该角色，但其他人可以质疑。<br>You may bluff; other players can challenge.':'质疑错误会失去一点影响力。<br>A failed challenge costs one influence.'}</p></div><div class="decision-buttons">${g.phase==='block'?(c.roles||[]).map(r=>`<button type="button" class="primary" data-block="${r}" ${can()}>${ROLES[r].name}反制 / ${ROLES[r].en}</button>`).join(''):`<button type="button" class="danger" data-do="challenge" ${can()}>提出质疑 / Challenge</button>`}<button type="button" class="secondary" data-do="pass" ${can()}>${g.phase==='block'?'不反制 / Allow':'放行 / Pass'}</button></div></div>`;
  else if(g.phase==='turn'&&g.current===state.you) controls=`<div data-key="heading" class="action-heading"><div><span class="eyebrow">MAKE YOUR MOVE</span><h3>${dual(me.coins>=10?'轮到你了 · 必须政变':'轮到你了，选择一个行动。',me.coins>=10?'Your turn · Coup required':'Your turn. Choose an action.')}</h3></div></div><div data-key="actions" class="action-grid">${Object.entries(ACTIONS).map(([key,a])=>`<button type="button" data-key="action:${key}" class="action ${selectedAction===key?'selected':''}" data-action="${key}" ${!(g.legalActions||[]).includes(key)||blocked()?'disabled':''}>${icon(a.icon)}<strong>${a.name}</strong><span>${a.en}</span><small>${a.note}</small><small>${notes[key]}</small></button>`).join('')}</div>${selectedAction?`<div data-key="action-confirm" class="action-confirm"><div><b>${ACTIONS[selectedAction].name}</b> · ${ACTIONS[selectedAction].target?'选择目标 / Choose target':'确认行动 / Confirm action'}${ACTIONS[selectedAction].role?`<small>声明 / Claim ${ROLES[ACTIONS[selectedAction].role].name}</small>`:''}</div><div class="target-buttons">${ACTIONS[selectedAction].target?g.players.filter(p=>p.id!==state.you&&!p.eliminated).map(p=>`<button type="button" class="primary" data-target="${p.id}" ${can()}>${name(p.id)}<small>${p.coins} 金币 / coins</small></button>`).join(''):`<button type="button" class="primary" data-do="confirm-action" ${can()}>确认 / Confirm →</button>`}<button type="button" class="text-button" data-do="cancel-action">取消 / Cancel</button></div></div>`:''}`;
  else controls=`<div data-key="observer" class="observer-message"><span class="eyebrow">WATCH THE COURT</span><h3>${dual(responding?'等待回应。':(c.responded||[]).includes(state.you)?'你已放行，等待其他玩家。':'观察局势，等待你的时机。','Watch the court. Waiting for other players.')}</h3>${waiting()}</div>`;
  const cards=exchange?c.choices:me.cards;
  return `${controls}<div data-key="private-hand" class="private-hand"><div class="hand-label"><span class="eyebrow">YOUR INFLUENCE</span><h3>${exchange?'交换角色牌':'你的影响力'}<small class="en">${exchange?'Choose cards':'Your influence'}</small></h3><span>${icon('shield')}仅你可见 / Private</span></div><div class="hand-cards">${(cards||[]).map(card=>roleCard(card.role,`${selectedCards.has(String(card.id))?'chosen':''} ${card.revealed?'lost':''}`,(exchange||losing)&&!card.revealed?card.id:null,card.revealed,card.id)).join('')}</div>${exchange||losing?`<button type="button" class="primary card-confirm" data-do="confirm-cards" ${blocked()||selectedCards.size!==(exchange?c.keepCount:1)?'disabled':''}>${exchange?`保留 ${selectedCards.size} 张 / Keep ${selectedCards.size}`:'确认失去这张牌 / Confirm loss'}</button>`:'<p class="hand-footnote">你可以声明任何角色。<br>You may claim any role.</p>'}</div>`;
}
function render() {
  $('#landing').hidden=!!state; $('#room').hidden=!state;
  $('#connection').textContent=live()?'已连接 / Online':'连接中 / Reconnecting'; $('#connection').classList.toggle('online',live());
  $('#createBtn').disabled=!live()||busy; $('#joinForm button').disabled=!live()||busy;
  if(!state) { social.sync();management.sync();return; }
  const g=state.game;
  $('#roomCode').textContent=state.code; $('#roundLabel').textContent=g?`PRIVATE COURT / TURN ${g.turn}`:'PRIVATE COURT / LOBBY';
  patch($('#roomTitle'),`${!g?'宫廷会客厅':g.phase==='over'?(g.endReason==='hostEnded'?'本局已结束':'胜负已定'):'权力的游戏'}<span>${state.seats.length} / ${state.capacity} 人</span>`);
  let banner='';
  if(!live()) banner='正在恢复连接，暂时无法提交操作。 / Reconnecting. Actions are temporarily paused.';
  else if(state.control?.paused) banner='游戏暂停，请在房间管理中补齐空位或继续存档。 / Paused. Fill vacant seats or resume the save in room management.';
  else if(state.seats[state.you]?.auto) banner='你的座位已开启托管，可在房间管理中停止。 / Auto-play is on. Stop it in room management.';
  $('#reconnectBanner').hidden=!banner; $('#reconnectBanner').textContent=banner;
  patch($('#hostControls'),state.host===state.you&&g?`<div class="host-controls"><span>房主管理 / Host controls</span><div>${g.phase!=='over'?`<button type="button" class="text-button end-game-button" data-do="end-game" ${!live()||state.control?.paused?'disabled':''}>提前结束本局 / End game</button>`:''}<button type="button" class="secondary small" data-do="restart-game" ${!live()||state.control?.paused?'disabled':''}>重新开始 / Restart</button></div></div>`:'');
  renderTable(); patch($('#controls'),g?playControls():lobbyControls());
  const previousLogs=$('#logs').textContent;
  patch($('#logs'),g?.log?.length?g.log.map((l,i)=>`<div data-key="log:${l.id??i}" class="log-entry ${i===g.log.length-1?'latest':''}"><span>${String(i+1).padStart(2,'0')}</span><p>${esc(typeof l==='string'?l:l.text||l.zh||'')}${l.en?`<small class="en">${esc(l.en)}</small>`:''}</p></div>`).join(''):'<div class="log-empty">✧<p>故事尚未开始。<br>The story has yet to begin.</p></div>');
  if(previousLogs!==$('#logs').textContent) $('#logs').scrollTop=$('#logs').scrollHeight;
  const previousChat=$('#messages').textContent;
  patch($('#messages'),(state.chat||[]).map(m=>`<p data-key="chat:${esc(m.id)}"><b>${esc(m.name||pname(m.playerId))}</b><span>${esc(m.text)}</span></p>`).join(''));
  if(previousChat!==$('#messages').textContent) $('#messages').scrollTop=$('#messages').scrollHeight;
  $('#chatText').disabled=!live(); $('#chatForm button').disabled=!live();
  social.sync(); management.sync();
}
function release(){busy=false;clearTimeout(pendingTimer);}
function send(data){if(!live()){toast('正在重连，请稍候。 / Reconnecting, please wait.');return false;}socket.send(JSON.stringify(data));return true;}
function act(action){if(!state?.game||blocked())return;busy=true;if(!send({type:'action',action,revision:state.game.revision})){release();return;}pendingTimer=setTimeout(()=>{release();toast('尚未收到确认，请检查当前局面后重试。 / Not confirmed. Check the current state before retrying.');render();},7000);render();}
function connect(){
  clearTimeout(reconnectTimer);const ws=new WebSocket(`${location.protocol==='https:'?'wss:':'ws:'}//${location.host}/coup-ws`);socket=ws;
  ws.onopen=()=>{if(socket!==ws)return;send({type:'hello',token:read(sessionStorage,sessionKey),avatar:UI.getAvatar()});render();};
  ws.onmessage=({data})=>{
    if(socket!==ws)return;let m;try{m=JSON.parse(data);}catch{return;}
    if(archives.receive(m))return;
    if(m.type==='welcome'){write(sessionStorage,sessionKey,m.token);return;}
    if(m.type==='reaction'){social.receive(m);return;}
    if(m.type==='error'){release();toast(m.message);render();return;}
    if(m.type==='left'){state=null;release();selectedCards.clear();selectedAction=null;phaseKey='';$('#confirmDialog').close();const u=new URL(location.href);u.searchParams.delete('room');history.replaceState(null,'',u);render();if(m.reason)toast(m.reason);return;}
    if(m.type!=='state')return;
    const old=state;
    if(old?.code===m.code&&old.game&&m.game&&m.game.revision<old.game.revision)return;
    state=m;
    const g=m.game,c=g?.choice||{},nextKey=`${m.code}:${g?.turn}:${g?.phase}:${c.playerId}:${g?.pending?.actorId}:${g?.pending?.targetId}:${g?.pending?.block?.playerId}:${(c.choices||[]).map(x=>x.id).join(',')}`;
    if(nextKey!==phaseKey){selectedCards.clear();selectedAction=null;phaseKey=nextKey;}
    if(busy&&(old?.game?.revision!==g?.revision||!g))release();
    if(confirmRequest?.valid&&!confirmRequest.valid()){$('#confirmDialog').close();confirmRequest=null;}
    const u=new URL(location.href);u.searchParams.set('room',m.code);history.replaceState(null,'',u);render();
  };
  ws.onclose=e=>{if(socket!==ws)return;release();render();if(e.code!==4001)reconnectTimer=setTimeout(connect,1500);else toast('此身份已在另一窗口连接。刷新可重新连接。 / Connected in another window. Refresh to reconnect.');};
  ws.onerror=()=>{};
}
function identity(){const name=$('#playerName').value.trim();if(!name){toast('请输入昵称 / Enter your name');$('#playerName').focus();return null;}write(localStorage,'boardclub-name',name);return{name,avatar:UI.getAvatar()};}
function confirm(title,text,run,valid){confirmRequest={run,valid};$('#confirmTitle').textContent=title;$('#confirmText').textContent=text;$('#confirmDialog').showModal();$('#cancelConfirm').focus();}
function enterRoom(message){if(busy)return;if(!send(message))return;busy=true;pendingTimer=setTimeout(()=>{release();render();toast('尚未收到确认，请重试 / Not confirmed. Please retry.');},7000);render();}
$('#createBtn').onclick=()=>{const p=identity();if(p)enterRoom({type:'create',...p,capacity:Number($('#capacity').value)});};
$('#joinForm').onsubmit=e=>{e.preventDefault();const p=identity();if(p)enterRoom({type:'join',...p,code:$('#roomInput').value.trim().toUpperCase()});};
$('#chatForm').onsubmit=e=>{e.preventDefault();const text=$('#chatText').value.trim();if(text&&send({type:'chat',text}))$('#chatText').value='';};
$('#copyBtn').onclick=async()=>{if(!state)return;const u=new URL('coup.html',location.href);u.searchParams.set('room',state.code);try{await navigator.clipboard.writeText(u.href);toast('邀请链接已复制 / Invitation copied');}catch{toast(u.href);}};
$('#leaveBtn').onclick=()=>{const code=state?.code;confirm('离开房间 / Leave room','开局后保留你的席位；其他玩家可等你回来，或由房主管理补位。 / After play starts, your seat is retained for your return or host-managed replacement.',()=>send({type:'leave'}),()=>state?.code===code);};
document.addEventListener('change',e=>{if(e.target.id==='roomCapacity')send({type:'settings',capacity:Number(e.target.value)});});
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b||b.disabled||!state)return;
  if(b.dataset.remove){const code=state.code,target=b.dataset.remove,host=state.seats[state.host]?.socialId;UI.confirmRemoval({name:state.seats.find(s=>s.socialId===target)?.name||'Bot',started:false,valid:()=>state?.code===code&&!state.game&&state.you===state.host&&state.seats[state.host]?.socialId===host&&state.seats.some(s=>s.bot&&s.socialId===target),remove:()=>send({type:'removeBot',target})});return;}
  if(b.dataset.action){selectedAction=b.dataset.action;render();return;}
  if(b.dataset.target!==undefined){act({type:'action',action:selectedAction,targetId:Number(b.dataset.target)});return;}
  if(b.dataset.block){act({type:'block',role:b.dataset.block});return;}
  if(b.dataset.card!==undefined){const id=b.dataset.card,c=state.game.choice||{},n=state.game.phase==='exchange'?c.keepCount:1;if(selectedCards.has(id))selectedCards.delete(id);else{if(n===1)selectedCards.clear();if(selectedCards.size<n)selectedCards.add(id);else return toast(`最多选择 ${n} 张 / Choose at most ${n}`);}render();return;}
  switch(b.dataset.do){
    case 'end-game':case 'restart-game':{
      const code=state.code,revision=state.game?.revision,host=state.seats[state.host]?.socialId,end=b.dataset.do==='end-game';
      confirm(end?'提前结束本局？ / End this game?':'重新开始？ / Restart?',end?'将结束当前对局并取消尚未结算的行动。本局不判定胜者，暗牌不会公开。 / End the game and cancel pending actions. No winner is declared, and hidden roles stay private.':'清空本局手牌和金币，所有人回到同一个房间的大厅。重新准备后再开局。 / Clear this game’s cards and coins and return everyone to the same lobby. Ready up again to start.',()=>send({type:end?'endGame':'restart',revision}),()=>live()&&state?.code===code&&state.game?.revision===revision&&state.you===state.host&&state.seats[state.host]?.socialId===host);break;
    }
    case 'ready':send({type:'ready',ready:!state.seats[state.you]?.ready});break;
    case 'start':case 'addBot':case 'fillBots':case 'rematch':send({type:b.dataset.do});break;
    case 'challenge':case 'pass':act({type:b.dataset.do});break;
    case 'confirm-action':act({type:'action',action:selectedAction});break;
    case 'cancel-action':selectedAction=null;render();break;
    case 'confirm-cards':{
      const cards=state.game.phase==='exchange'?state.game.choice.choices:state.game.players[state.you].cards;
      const ids=[...selectedCards].map(id=>cards.find(c=>String(c.id)===id)?.id);
      if(ids.some(id=>id===undefined))return;
      act(state.game.phase==='exchange'?{type:'exchange',cardIds:ids}:{type:'lose',cardId:ids[0]});break;
    }
  }
});
$('#confirmAction').onclick=()=>{const r=confirmRequest;$('#confirmDialog').close();confirmRequest=null;if(r&&(!r.valid||r.valid()))r.run();else toast('局面已变化，请重新操作 / The situation changed. Try again.');};
$('#cancelConfirm').onclick=()=>$('#confirmDialog').close();$('#confirmDialog [data-close]').onclick=()=>$('#confirmDialog').close();
$('#soundBtn').onclick=()=>{audio.setMuted(!audio.muted);soundButton();};
$('#playerName').value=read(localStorage,'boardclub-name')||'';$('#roomInput').value=new URLSearchParams(location.search).get('room')||'';UI.mountAvatarPicker($('#avatarPicker'),$('#playerName'));
window.addEventListener('board-avatar-change',({detail})=>{if(state)send({type:'profile',avatar:detail.avatar});});
for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>audio.unlock(),{passive:true});
window.addEventListener('pagehide',()=>audio.stop());
$('#heroArt').innerHTML=`<div class="art-ring"></div>${roleCard('Assassin','fan-left')}${roleCard('Duke','fan-center')}${roleCard('Contessa','fan-right')}<span class="art-caption">TRUST NO ONE. CLAIM EVERYTHING.</span>`;
$('#roleReference').innerHTML=`<div class="panel-title"><h2>宫廷名录</h2><span>5 ROLES · 15 CARDS</span></div>${Object.entries(ROLES).map(([id,r])=>`<button type="button" class="role-reference ${r.color}" data-rules-game="coup" data-rules-section="actions">${icon(r.symbol)}<div><b>${r.name}<small>${r.en} ×3</small></b><p>${r.text}<br>${english[id]}</p></div></button>`).join('')}<div class="reference-note">金币与失效角色公开，其余身份仅持牌者知道。<br>Coins and lost roles are public; live roles are private.</div>`;
soundButton();render();connect();
})();
