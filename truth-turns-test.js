"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./truth-engine"), Archive = require("./room-archive");
const fixed = () => .1;
function ask(g) { if (g.stage === "choose") E.act(g,g.asker,{type:"choose",kind:"truth"},fixed); if(g.stage === "prepare")E.act(g,g.asker,{type:"ask"},fixed); }
function unchanged(g, fn) { const before=JSON.stringify(g);assert.throws(fn);assert.equal(JSON.stringify(g),before); }

test("new games use 2-8 players, no rolls, and validate setup options",()=>{
  for(const count of [2,3,4,5,6,7,8])for(const mode of E.MODES)for(const selection of ["random","chain"]){
    const g=E.createGame(count,{mode,selection},fixed);
    assert.equal(g.version,3);assert.notEqual(g.asker,g.target);assert.notEqual(g.stage,"roll");
    unchanged(g,()=>E.act(g,g.current,{type:"roll"}));
    for(let n=0;n<3;n++){ask(g);E.act(g,g.target,{type:"complete"},fixed);}
    assert.equal(g.phase,"over");assert.equal(g.scores.reduce((a,b)=>a+b),3);
  }
  for(const count of [0,1,9,12])assert.throws(()=>E.createGame(count));
  for(const options of [{selection:"bad"},{skipLimit:-2},{skipLimit:11},{skipLimit:1.5},{mode:"dare",selection:"together"}])assert.throws(()=>E.createGame(2,options));
  assert.throws(()=>E.createGame(3,{mode:"truth",selection:"together"}));
});
test("chain hands asking to the respondent after completing or skipping",()=>{
  const g=E.createGame(4,{selection:"chain",rounds:8,skipLimit:-1},fixed);
  for(let n=0;n<7;n++){const target=g.target;ask(g);E.act(g,target,{type:n%2?"skip":"complete"},fixed);assert.equal(g.asker,target);assert.notEqual(g.asker,g.target);}
});
test("two replacements per question, custom text remains available, budgets survive save/load",()=>{
  const g=E.createGame(2,{mode:"truth",selection:"chain",skipLimit:1},fixed);
  const first=g.prompt.id;E.act(g,g.asker,{type:"reroll"},fixed);assert.notEqual(g.prompt.id,first);
  E.act(g,g.asker,{type:"reroll"},fixed);unchanged(g,()=>E.act(g,g.asker,{type:"reroll"},fixed));
  E.act(g,g.asker,{type:"ask",text:"Our own question"},fixed);assert.equal(g.prompt.zh,"Our own question");
  const target=g.target;E.act(g,target,{type:"skip"},fixed);assert.equal(g.skipsUsed[target],1);assert.equal(g.replacements,0);
  const r={seats:[{position:0},{position:1}],level:g.level,mode:g.mode,rounds:g.rounds,maxPlayers:2,selection:g.selection,skipLimit:g.skipLimit,game:g};
  const restored=Archive.decode(Archive.encode("truth",r),["truth"]).room;
  assert.deepEqual(restored.game,g);assert.equal(restored.skipLimit,1);assert.equal(restored.selection,"chain");
  ask(g);E.act(g,g.target,{type:"complete"},fixed);ask(g);
  assert.equal(g.target,target);unchanged(g,()=>E.act(g,target,{type:"skip"}));
  E.act(g,target,{type:"complete"},fixed);assert.equal(g.phase,"over");
});
test("together shows one prompt, accepts either respondent, locks edits and rejects duplicates",()=>{
  const g=E.createGame(2,{mode:"truth",selection:"together",skipLimit:1},fixed);
  assert.equal(g.stage,"challenge");assert.deepEqual(E.requiredActors(g),[0,1]);
  E.act(g,0,{type:"reroll"},fixed);E.act(g,0,{type:"ask",text:"Shared question"},fixed);
  unchanged(g,()=>E.act(g,1,{type:"ask",text:"Not my edit turn"},fixed));
  E.act(g,1,{type:"complete"},fixed);assert.equal(g.round,1);assert.deepEqual(E.requiredActors(g),[0]);
  unchanged(g,()=>E.act(g,1,{type:"complete"}));unchanged(g,()=>E.act(g,0,{type:"reroll"}));
  E.act(g,0,{type:"skip"},fixed);assert.equal(g.round,2);assert.equal(g.asker,1);assert.equal(g.replacements,0);
  assert.equal(g.skipsUsed[0],1);unchanged(g,()=>E.act(g,0,{type:"skip"}));
  E.act(g,1,{type:"reroll"},fixed);E.act(g,0,{type:"complete"},fixed);E.act(g,1,{type:"complete"},fixed);
  E.act(g,0,{type:"complete"},fixed);E.act(g,1,{type:"complete"},fixed);
  assert.equal(g.phase,"over");assert.deepEqual(g.scores,[2,3]);assert.deepEqual(g.winners,[1]);
});
test("zero and unlimited skips, failed randomness and custom validation are atomic",()=>{
  const g=E.createGame(2,{mode:"truth",skipLimit:0},fixed);ask(g);
  unchanged(g,()=>E.act(g,g.target,{type:"skip"}));
  unchanged(g,()=>E.act(g,g.target,{type:"complete"},()=>1));
  const both=E.createGame(2,{mode:"truth",selection:"together",skipLimit:-1},fixed);
  unchanged(both,()=>E.act(both,0,{type:"ask",text:"x".repeat(241)}));
  for(let i=0;i<3;i++){E.act(both,0,{type:"skip"},fixed);E.act(both,1,{type:"skip"},fixed);}
  assert.deepEqual(both.skipsUsed,[3,3]);assert.deepEqual(both.winners,[0,1]);
});
