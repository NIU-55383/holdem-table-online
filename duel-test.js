"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const http = require("node:http"), { once } = require("node:events"), { Worker } = require("node:worker_threads"), path = require("node:path");
const { WebSocket } = require("ws"), E = require("./duel-engine"), { attachDuel } = require("./duel-server");
function position(fen) { const g = E.createGame("xiangqi"); assert.equal(g.chess.load(fen),true); g.current=g.chess.turn()==="r"?0:1; return g; }
const has = (g,from,to) => E.legal(g).some((m)=>m.from===E.index(from)&&m.to===E.index(to));
test("Gomoku: all four directions, overlines, turn order, occupied/outside points, undo",()=>{
  for(const delta of [1,15,16,14]) {
    const g=E.createGame("gomoku");for(let n=0;n<4;n++)g.board[80+n*delta]=0;
    E.move(g,0,{to:80+4*delta});assert.equal(g.winner,0);assert.equal(g.phase,"over");assert.throws(()=>E.move(g,1,{to:0}));
  }
  const long=E.createGame("gomoku");[105,106,107,109,110].forEach(i=>long.board[i]=0);E.move(long,0,{to:108});assert.equal(long.winner,0);
  const g=E.createGame("gomoku");assert.throws(()=>E.move(g,1,{to:0}));assert.throws(()=>E.move(g,0,{to:-1}));E.move(g,0,{to:112});assert.throws(()=>E.move(g,1,{to:112}));E.move(g,1,{to:113});E.undo(g,2);assert.equal(g.current,0);assert.equal(g.board[112],-1);assert.equal(g.moves.length,0);
});
test("Xiangqi: opening, horse legs, elephant eyes/river and flying generals",()=>{
  const g=E.createGame("xiangqi");assert.equal(E.legal(g).length,44);assert.ok(has(g,"b0","c2"));assert.equal(has(g,"c0","c2"),false);
  const leg=position("4k4/9/9/9/4p4/9/9/9/1C7/1N2K4 r - - 0 1");assert.equal(has(leg,"b0","c2"),false);assert.ok(has(leg,"b0","d1"));
  const eye=position("4k4/9/9/9/4p4/9/9/9/1C7/2B1K4 r - - 0 1");assert.equal(has(eye,"c0","a2"),false);assert.ok(has(eye,"c0","e2"));
  const river=position("4k4/9/9/9/4p4/2B6/9/9/9/4K4 r - - 0 1");assert.equal(has(river,"c4","e6"),false);
  const face=position("4k4/9/9/9/4R4/9/9/9/9/4K4 r - - 0 1");assert.equal(has(face,"e5","d5"),false);
});
test("Xiangqi: cannon screen, check evasion, stalemate is a loss, undo",()=>{
  const g=position("4k4/9/r8/9/p3p4/9/9/C8/9/4K4 r - - 0 1");assert.ok(has(g,"a2","a7"));assert.equal(has(g,"a2","a5"),false);
  const check=position("4k4/9/9/9/9/9/9/4r4/9/R3K4 r - - 0 1");assert.equal(check.chess.in_check(),true);assert.equal(has(check,"a0","a1"),false);
  const stale=position("4k4/3R1R3/9/9/9/4P4/9/9/9/4K4 r - - 0 1");
  E.move(stale,0,{from:E.index("e4"),to:E.index("e5")});assert.equal(stale.phase,"over");assert.equal(stale.winner,0);assert.match(stale.reason,/Stalemate/);
  const normal=E.createGame("xiangqi"), fen=normal.chess.fen();E.move(normal,0,E.legal(normal)[0]);E.undo(normal,1);assert.equal(normal.chess.fen(),fen);
});
async function ai(game,level) {
  const w=new Worker(path.join(__dirname,"duel-ai.js"),{workerData:{game:E.snapshot(game),level}});let best,depth=-1;
  w.on("message",m=>{best=m.move;depth=m.depth;});
  await Promise.race([once(w,"exit"),new Promise(r=>setTimeout(r,{easy:500,normal:1100,hard:2100}[level]))]);
  await w.terminate();assert.ok(best,"AI must return a legal fallback promptly");return {best,depth};
}
test("Xiangqi club repetition rule: unilateral perpetual check loses, quiet repetition draws",()=>{
  const check=position("4k4/4R4/9/9/4P4/9/9/9/9/4K4 b - - 0 1");
  for(let n=0;n<2;n++)for(const [from,to] of [["e9","d9"],["e8","d8"],["d9","e9"],["d8","e8"]])E.move(check,check.current,{from:E.index(from),to:E.index(to)});
  assert.equal(check.phase,"over");assert.equal(check.winner,1);assert.match(check.reason,/Perpetual/);
  const quiet=position("r3k4/9/9/9/4p4/9/9/9/9/R3K4 r - - 0 1");
  for(let n=0;n<2;n++)for(const[from,to]of[["a0","a1"],["a9","a8"],["a1","a0"],["a8","a9"]])E.move(quiet,quiet.current,{from:E.index(from),to:E.index(to)});
  assert.equal(quiet.phase,"over");assert.equal(quiet.winner,-1);assert.match(quiet.reason,/repetition/);
});
test("Three AI levels: Gomoku completes own five and blocks opponent's forced five",{timeout:20000},async()=>{
  for(const level of E.LEVELS)for(const side of [0,1]){
    const g=E.createGame("gomoku");[108,109,110,111].forEach(i=>g.board[i]=side);g.board[107]=1-side;g.current=0;
    const {best}=await ai(g,level);assert.equal(best.to,112);E.move(g,0,best);
  }
});
test("Three AI levels: Xiangqi returns legal captures and preserves input state",{timeout:15000},async()=>{
  for(const level of E.LEVELS){const g=position("4k4/9/9/9/r3p4/9/9/9/9/R3K4 r - - 0 1"),fen=g.chess.fen();const {best}=await ai(g,level);assert.equal(g.chess.fen(),fen);assert.ok(E.legal(g).some(m=>m.from===best.from&&m.to===best.to));assert.equal(best.to,E.index("a5"));}
});
async function live(fn) {
  const server=http.createServer(),duel=attachDuel(server),sockets=[];server.on("upgrade",duel.upgrade);server.listen(0,"127.0.0.1");await once(server,"listening");
  const client=async(token)=>{
    const ws=new WebSocket(`ws://127.0.0.1:${server.address().port}/duel-ws`),messages=[];sockets.push(ws);ws.on("message",raw=>messages.push(JSON.parse(raw)));
    const send=m=>ws.send(JSON.stringify(m));
    const next=async(pred,after=0)=>{for(let n=0;n<1000;n++){const m=messages.slice(after).find(pred);if(m)return m;await new Promise(r=>setTimeout(r,10));}throw Error("Missing state: "+JSON.stringify(messages.slice(-2)));};
    await once(ws,"open");send({type:"hello",token});const welcome=await next(m=>m.type==="welcome");return{ws,send,next,messages,token:welcome.token};
  };
  try{await fn(client,duel);}finally{sockets.forEach(ws=>ws.terminate());server.close();server.emit("close");}
}
test("Online: ready, host on second side, legal synchronized moves, undo consent, reconnect, draw and rematch",{timeout:20000},()=>live(async(client)=>{
  const a=await client();a.send({type:"create",kind:"xiangqi",difficulty:"normal",side:1,name:"Connie",avatar:{kind:"emoji",value:"😀"}});const created=await a.next(m=>m.code);
  const b=await client();b.send({type:"join",code:created.code,name:"Gary"});await b.next(m=>m.code);
  a.send({type:"start"});await a.next(m=>m.type==="error");b.send({type:"ready",ready:true});await a.next(m=>m.seats?.every(p=>p?.ready));a.send({type:"start"});const begun=await a.next(m=>m.game);assert.equal(begun.you,1);assert.equal(begun.host,1);assert.equal(begun.game.current,0);
  a.send({type:"move",revision:0,from:0,to:9});await a.next(m=>m.type==="error"&&/turn/.test(m.message));
  const m=begun.game.legal[0];b.send({type:"move",revision:0,...m});const one=await a.next(m=>m.game?.revision===1);assert.equal(one.game.moves.length,1);
  a.send({type:"profile",avatar:null,side:0});const profile=await b.next(m=>m.game?.revision===1&&m.seats[1].avatar===null);assert.equal(profile.seats[0].avatar,null);
  a.send({type:"move",revision:1,...one.game.legal[0]});await b.next(m=>m.game?.revision===2);
  b.send({type:"request",action:"undo"});const ask=await a.next(m=>m.pending?.action==="undo");assert.equal(ask.game.moves.length,2);a.send({type:"respond",id:ask.pending.id,accept:true});const undone=await b.next(m=>m.game?.revision===3);assert.equal(undone.game.moves.length,0);assert.equal(undone.game.current,0);
  a.ws.close();await once(a.ws,"close");await b.next(m=>m.seats?.[1]?.connected===false);
  const restored=await client(a.token);const back=await restored.next(m=>m.game?.revision===3);assert.equal(back.you,1);assert.equal(back.seats[1].connected,true);
  b.send({type:"request",action:"draw"});const draw=await restored.next(m=>m.pending?.action==="draw");restored.send({type:"respond",id:draw.pending.id,accept:true});await b.next(m=>m.game?.phase==="over");
  b.send({type:"request",action:"rematch"});const again=await restored.next(m=>m.pending?.action==="rematch");restored.send({type:"respond",id:again.pending.id,accept:true});const fresh=await b.next(m=>m.game?.phase==="playing"&&m.you===1);assert.equal(fresh.game.moves.length,0);assert.equal(fresh.host,1);
  b.send({type:"resign"});const end=await restored.next(m=>m.game?.reason?.includes("Resignation"));assert.equal(end.game.winner,0);assert.equal(end.seats[0].name,"Connie");
}));
test("AI rooms isolate games, cancel obsolete searches on undo, and keep avatars stable",{timeout:20000},()=>live(async(client,duel)=>{
  const a=await client();a.send({type:"create",kind:"gomoku",difficulty:"hard",side:0,ai:true,name:"Host"});const initial=await a.next(m=>m.game);const bot=initial.seats[1].avatar;
  a.send({type:"move",revision:0,to:112});await a.next(m=>m.game?.revision===1&&m.thinking);
  a.send({type:"request",action:"undo"});await a.next(m=>m.game?.revision===2&&m.game.moves.length===0);
  await new Promise(r=>setTimeout(r,2300));const room=duel.rooms.get(initial.code);assert.equal(room.game.moves.length,0);assert.equal(room.game.current,0);
  a.send({type:"move",revision:2,to:112});const replied=await a.next(m=>m.game?.revision===4);assert.equal(replied.game.moves.length,2);assert.deepEqual(replied.seats[1].avatar,bot);
  const b=await client();b.send({type:"create",kind:"xiangqi",difficulty:"easy",side:1,ai:true,name:"Second"});const second=await b.next(m=>m.game?.moves.length===1);assert.equal(second.game.type,"xiangqi");assert.equal(room.game.moves.length,2);
}));
