"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const E = require("./truth-engine"), Archive = require("./room-archive");
const fixed = () => .1;
const D = require("./truth-data");
function ask(g) { if (g.stage === "choose") E.act(g,g.asker,{type:"choose",kind:"truth"},fixed); if(g.stage === "prepare")E.act(g,g.asker,{type:"ask"},fixed); }
function unchanged(g, fn) { const before=JSON.stringify(g);assert.throws(fn);assert.equal(JSON.stringify(g),before); }

test("seen prompts belong to the respondent, include replacements and skips, and outlive recent history",()=>{
  const g=E.createGame(2,{mode:"truth",selection:"chain",skipLimit:-1},()=>0);
  const first=g.prompt.id, respondent=g.target;
  E.act(g,g.asker,{type:"reroll"},()=>0);const replaced=g.prompt.id;
  ask(g);E.act(g,respondent,{type:"skip"},()=>0);
  assert.equal(g.prompt.id,first,"another respondent may draw the same question");
  ask(g);E.act(g,g.target,{type:"complete"},()=>0);
  assert.equal(g.target,respondent);assert(![first,replaced].includes(g.prompt.id));
  for(let i=0;i<30;i++){ask(g);E.act(g,g.target,{type:"skip"},()=>0);}
  assert.equal(g.history.length,12);assert(g.seenPrompts[respondent].includes(first));
  assert(g.seenPrompts[respondent].includes(replaced));
  const copy=E.snapshot(g);assert.deepEqual(copy,g);copy.seenPrompts[0].pop();assert.notDeepEqual(copy.seenPrompts,g.seenPrompts);
});

test("mixed categories remain separate and new games reset personal histories",()=>{
  const g=E.createGame(2,{mode:"mixed"},()=>0);
  for(const kind of ["truth","dare","truth","dare"]){
    E.act(g,g.asker,{type:"choose",kind},()=>0);assert.equal(D.PROMPTS.find(p=>p.id===g.prompt.id).kind,kind);
    ask(g);E.act(g,g.target,{type:"complete"},()=>0);
  }
  assert.equal(new Set(g.seenPrompts[1]).size,4);assert.equal(g.seenPrompts[0].length,0);
  assert.deepEqual(E.createGame(2,{mode:"mixed"},()=>0).seenPrompts,[[],[]]);
});

test("old level/shared-pool saves migrate conservatively without losing current question or allowances",()=>{
  const g=E.createGame(2,{mode:"truth",selection:"chain",skipLimit:1},fixed);
  ask(g);E.act(g,g.target,{type:"skip"},fixed);
  const current=structuredClone(g.prompt),history=structuredClone(g.history),skips=[...g.skipsUsed];
  const ids=[D.PROMPTS[0].id,D.PROMPTS[45].id];
  delete g.seenPrompts;g.level="heat";g.used={"chill/truth":[ids[0]],"heat/truth":[ids[1]]};
  const archive={format:"boardclub-save",version:1,game:"truth",positions:[0,1],config:{level:"heat",mode:g.mode,rounds:0,maxPlayers:2,selection:g.selection,skipLimit:g.skipLimit},progress:g};
  const restored=Archive.decode(archive,["truth"]).room;
  assert.equal(restored.level,undefined);assert.equal(restored.game.level,undefined);assert.equal(restored.game.used,undefined);
  assert.deepEqual(restored.game.prompt,current);assert.deepEqual(restored.game.history,history);assert.deepEqual(restored.game.skipsUsed,skips);
  for(const seen of restored.game.seenPrompts)for(const id of ids)assert(seen.includes(id));
  E.act(restored.game,restored.game.asker,{type:"reroll"},()=>0);assert(!ids.includes(restored.game.prompt.id));
  const saved=Archive.encode("truth",restored);assert.equal("level" in saved.config,false);assert.equal("level" in saved.progress,false);
  assert.deepEqual(Archive.decode(saved,["truth"]).room.game,restored.game);
});

test("archives reject malformed or oversized personal histories",()=>{
  const g=E.createGame(2,{mode:"truth"},fixed),r={seats:[{position:0},{position:1}],...g,game:g,maxPlayers:2};
  const archive=Archive.encode("truth",r);
  for(const seen of [null,{},[],[[],[] ,[]],[["unknown"],[]],[[D.PROMPTS[0].id,D.PROMPTS[0].id],[]],[Array(301).fill(D.PROMPTS[0].id),[]]]){
    const bad=structuredClone(archive);bad.progress.seenPrompts=seen;assert.throws(()=>Archive.decode(bad,["truth"]));
  }
});

test("all prompts are available without repeats per respondent in every turn order",()=>{
  const D=require("./truth-data");
  for(const selection of E.SELECTIONS)for(const kind of selection==="together"?["truth"]:["truth","dare"]){
    const g=E.createGame(2,{mode:kind,selection},fixed),seen=[new Set(),new Set()];
    const expected=D.PROMPTS.filter(p=>p.kind===kind);
    const turns=expected.length*(selection==="chain"?2:1);
    for(let i=0;i<turns;i++){
      const targets=selection==="together"?[0,1]:[g.target];
      for(const target of targets){assert(!seen[target].has(g.prompt.id));seen[target].add(g.prompt.id);}
      const {id,zh,en}=expected.find(p=>p.id===g.prompt.id);assert.deepEqual(g.prompt,{id,zh,en});
      if(selection==="together"){E.act(g,0,{type:"complete"},fixed);E.act(g,1,{type:"complete"},fixed);}
      else{ask(g);E.act(g,g.target,{type:"complete"},fixed);}
    }
    assert.equal(g.prompt,null);assert.equal(g.stage,"prepare");assert.equal(g.phase,"playing");
    assert.equal(E.hasPrompts(g),false);
    unchanged(g,()=>E.act(g,g.asker,{type:"ask"},fixed));
    E.act(g,g.asker,{type:"ask",text:"A new question"},fixed);
    assert.equal(g.stage,"challenge");
    assert.equal(g.seenPrompts.some(ids=>ids.length===expected.length),true);
  }
});

test("new games use 2-8 players, no rolls, and validate setup options",()=>{
  for(const count of [2,3,4,5,6,7,8])for(const mode of E.MODES)for(const selection of ["random","chain"]){
    const g=E.createGame(count,{mode,selection},fixed);
    assert.equal(g.version,3);assert.notEqual(g.asker,g.target);assert.notEqual(g.stage,"roll");
    unchanged(g,()=>E.act(g,g.current,{type:"roll"}));
    for(let n=0;n<40;n++){ask(g);E.act(g,g.target,{type:"complete"},fixed);}
    assert.equal(g.rounds,0);assert.equal(g.phase,"playing");assert.equal(g.round,41);assert.deepEqual(g.winners,[]);assert.equal(g.scores.reduce((a,b)=>a+b),40);
    assert(g.history.length<=12,"long sessions keep bounded recent history");
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
  const r={seats:[{position:0},{position:1}],mode:g.mode,rounds:g.rounds,maxPlayers:2,selection:g.selection,skipLimit:g.skipLimit,game:g};
  const restored=Archive.decode(Archive.encode("truth",r),["truth"]).room;
  assert.deepEqual(restored.game,g);assert.equal(restored.skipLimit,1);assert.equal(restored.selection,"chain");
  ask(g);E.act(g,g.target,{type:"complete"},fixed);ask(g);
  assert.equal(g.target,target);unchanged(g,()=>E.act(g,target,{type:"skip"}));
  E.act(g,target,{type:"complete"},fixed);assert.equal(g.phase,"playing");assert.equal(g.round,4);
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
  assert.equal(g.phase,"playing");assert.equal(g.round,4);assert.deepEqual(g.scores,[2,3]);assert.deepEqual(g.winners,[]);
});
test("zero and unlimited skips, failed randomness and custom validation are atomic",()=>{
  const g=E.createGame(2,{mode:"truth",skipLimit:0},fixed);ask(g);
  unchanged(g,()=>E.act(g,g.target,{type:"skip"}));
  unchanged(g,()=>E.act(g,g.target,{type:"complete"},()=>1));
  const both=E.createGame(2,{mode:"truth",selection:"together",skipLimit:-1},fixed);
  unchanged(both,()=>E.act(both,0,{type:"ask",text:"x".repeat(241)}));
  for(let i=0;i<40;i++){E.act(both,0,{type:"skip"},fixed);E.act(both,1,{type:"skip"},fixed);}
  assert.deepEqual(both.skipsUsed,[40,40]);assert.deepEqual(both.winners,[]);assert.equal(both.phase,"playing");
  const r={seats:[{position:0},{position:1}],...both,game:both,maxPlayers:2};
  assert.deepEqual(Archive.decode(Archive.encode("truth",r),["truth"]).room.game,both);
});

test("older capped V3 saves resume without resetting progress or allowances",()=>{
  const g=E.createGame(2,{mode:"truth",selection:"chain",rounds:3,skipLimit:1},fixed);
  assert.equal(g.rounds,0,"old clients cannot impose a round cap on new games");
  for(let i=0;i<3;i++){ask(g);E.act(g,g.target,{type:i===0?"skip":"complete"},fixed);}
  const lastTarget=g.history.at(-1).target, counts=[...g.scores], skips=[...g.skipsUsed], history=E.snapshot(g).history;
  Object.assign(g,{rounds:3,round:3,phase:"over",stage:"roll",current:0,asker:-1,target:-1,prompt:null,kind:null,winners:[1]});
  const r={seats:[{position:0},{position:1}],...g,game:g,maxPlayers:2};
  const restored=Archive.decode(Archive.encode("truth",r),["truth"]).room;
  assert.equal(restored.rounds,0);assert.equal(restored.game.phase,"playing");assert.equal(restored.game.round,4);
  assert.equal(restored.game.asker,lastTarget);assert.deepEqual(restored.game.scores,counts);assert.deepEqual(restored.game.skipsUsed,skips);assert.deepEqual(restored.game.history,history);
  assert.deepEqual(restored.game.winners,[]);
  const active=E.createGame(2,{mode:"truth"},fixed);active.rounds=5;
  const prompt=active.prompt;E.resumeEndless(active);assert.equal(active.prompt,prompt);assert.equal(active.rounds,0);
});
