"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),E=require("./catan-engine"),D=require("./catan-cities-data");
let pw;try{pw=require("playwright");}catch{pw=require(path.resolve(path.dirname(process.execPath),"../node_modules/playwright"));}
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const kinds=["alchemy","reward","fleet","monopoly","tradeMonopoly","guild","espionage","treason","replaceRank","harbor","discard"];
const optional=kind=>["harbor","discard"].includes(kind);
function grant(g,id,key){const deck=g.cities.decks[D.cards[key][0]],i=deck.indexOf(key);assert(i>=0);deck.splice(i,1);const c={id:++g.cities.sequence,key};g.cities.players[id].cards.push(c);return c;}
function base(mapId){
  const g=E.createGame(["TEN","Rival <b>","Colin"],rng(37),mapId);
  while(g.phase.startsWith("setup"))E.act(g,g.current,E.chooseBotAction(g,g.current));
  Object.assign(g,{phase:"main",current:0,turn:3,rolled:true,dice:[2,3]});
  g.players.forEach(p=>p.resources.forEach((n,r)=>{g.bank[r]-=2-n;p.resources[r]=2;}));
  g.cities.players[1].defenders=2;
  const sites=g.board.vertices.filter(v=>v.owner<0&&v.tiles.some(i=>g.board.tiles[i].resource>=-1));
  sites[0].knight={owner:1,rank:2,active:true,activated:0,promoted:-1};sites[1].knight={owner:2,rank:1,active:false,activated:0,promoted:-1};
  return g;
}
function fixture(seed,kind){
  const g=structuredClone(seed);
  if(kind==="reward"){g.phase="ckChoice";g.cities.queue=[{kind:"reward",player:0}];g.cities.after="main";return g;}
  if(kind==="discard"){for(const key of ["mining","crane","merchant","medicine","invention"])grant(g,0,key);return g;}
  if(kind==="alchemy")Object.assign(g,{phase:"roll",rolled:false,dice:[]});
  if(kind==="espionage")grant(g,1,"crane");
  const c=grant(g,0,kind==="replaceRank"?"treason":kind);E.act(g,0,{type:"ck",choice:"play:"+c.id});
  if(kind==="replaceRank"){E.act(g,0,{type:"ck",choice:"player:1"});E.act(g,1,{type:"ck",choice:E.legal(g,1).citiesKnights[0].key});}
  assert.equal(g.phase,kind==="harbor"?"main":"ckChoice");return g;
}
function snapshot(g,kind,you=0){return{type:"state",code:"PICKER-"+g.mapId+"-"+kind,mapId:g.mapId,layout:g.layout,you,host:0,maxPlayers:3,chat:[],seats:g.players.map(p=>({name:p.name,socialId:"picker-"+p.id,position:p.id,connected:true,bot:false,auto:false})),game:E.publicGame(g,you)};}
const dialog=page=>page.locator("#citiesChoiceDialog"),confirm=page=>page.locator("#citiesChoiceConfirm");
async function closeDialogs(page){for(let n=0;n<6&&await page.locator("dialog[open]").count();n++)await page.keyboard.press("Escape");}
async function openPicker(page,kind){
  if(optional(kind)&&!await page.locator(".cities-choice-list [data-cities-picker]").count())await page.locator('[data-group="'+kind+'"]').click();
  if(!await dialog(page).isVisible())await page.locator(".cities-choice-list [data-cities-picker]").click();await dialog(page).waitFor({state:"visible"});
}
async function selectDraft(page,g,kind){
  const d=dialog(page);
  if(kind==="alchemy"){
    assert.equal(await d.locator("[data-die-color='yellow'][data-face]").count(),6);assert.equal(await d.locator("[data-die-color='red'][data-face]").count(),6);
    await d.locator("[data-die-color='yellow'][data-face='3']").click();assert(await confirm(page).isDisabled());
    await d.locator("[data-die-color='red'][data-face='4']").click();assert(await confirm(page).isEnabled());
    await d.locator("[data-die-color='yellow'][data-face='2']").click();
    await d.locator("[data-die-color='yellow'][data-face='3']").click();assert.equal(await d.locator("[data-die-color='yellow'][data-face='3']").getAttribute("aria-pressed"),"true");assert.equal(await d.locator("[data-die-color='yellow'][data-face='2']").getAttribute("aria-pressed"),"false");assert.equal(await d.locator("[data-die-color='red'][data-face='4']").getAttribute("aria-pressed"),"true");return "dice:3:4";
  }
  if(kind==="harbor"){
    await d.locator("[data-choice-player='1']").click();assert(await confirm(page).isDisabled());
    await d.locator("[data-choice-resource='0']").click();return "harbor:1:0";
  }
  const legal=E.publicGame(g,0).legal.citiesKnights.filter(o=>optional(kind)?o.group===kind:o.group==="choice");
  const keys=await d.locator("[data-option-key]").evaluateAll(bs=>bs.map(b=>b.dataset.optionKey));
  assert.deepEqual(keys.slice().sort(),legal.map(o=>o.key).sort(),kind+": graphic choices match legal options exactly");
  assert(await d.locator("svg,.game-avatar").count()>0,kind+": options have game artwork");
  const key=keys[0];await d.locator('[data-option-key="'+key+'"]').click();return key;
}
async function fits(page){
  const d=dialog(page);assert(await d.evaluate(el=>{const r=el.getBoundingClientRect(),c=el.querySelector("[data-close]").getBoundingClientRect();return el.scrollWidth<=el.clientWidth+1&&r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1&&c.top>=0&&c.bottom<=innerHeight;}));
  assert(await confirm(page).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight+1;}),"Confirm stays on screen");
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
}
test("graphical city choices stage selections and confirm one legal action",{timeout:180000},async()=>{
  fs.mkdirSync(path.join(__dirname,"test-results"),{recursive:true});
  const browser=await pw.chromium.launch({executablePath:process.env.CHROME_PATH||"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],report=[];page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>{localStorage.setItem("catan-music-enabled","false");window.sent=[];window.WebSocket=class extends EventTarget{static OPEN=1;constructor(){super();this.readyState=1;window.testSocket=this;setTimeout(()=>this.dispatchEvent(new Event("open")),0);}send(data){sent.push(JSON.parse(data));}close(){this.readyState=3;}emit(data){this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(data)}));}};});
    await page.route("http://catan.test/**",route=>{const u=new URL(route.request().url());if(u.pathname==="/api/catan-preview")return route.fulfill({json:E.makeBoard(rng(37),u.searchParams.get("map")||"base")});const f=path.join(__dirname,u.pathname.slice(1));if(!fs.existsSync(f))return route.fulfill({status:404,body:""});return route.fulfill({body:fs.readFileSync(f),contentType:{".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"}[path.extname(f)]||"application/octet-stream"});});
    await page.goto("http://catan.test/catan.html");await page.evaluate(()=>testSocket.emit({type:"welcome",token:"picker-test"}));
    const emit=data=>page.evaluate(data=>testSocket.emit(data),data);
    for(const mapId of ["cities","cities-shores-1"]){
      const seed=base(mapId);
      for(const width of [1440,320]){
        await page.setViewportSize({width,height:width===320?568:1000});
        for(const kind of kinds){
          const g=fixture(seed,kind),view=snapshot(g,kind);await emit(view);await closeDialogs(page);
          const before=await page.evaluate(()=>JSON.stringify(sent));await openPicker(page,kind);
          assert(await confirm(page).isDisabled(),kind+": no default selection");await confirm(page).evaluate(b=>b.click());assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before);
          const key=await selectDraft(page,g,kind);assert(await confirm(page).isEnabled());assert((await page.locator("#citiesChoiceSelected").innerText()).trim());
          assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before,"Draft changes send no action");await fits(page);
          if(["guild","espionage","treason","harbor"].includes(kind)){
            assert((await dialog(page).innerText()).includes("Rival <b>"));assert((await dialog(page).innerHTML()).includes("Rival &lt;b&gt;"),"Player name is escaped");
            assert.equal(view.game.citiesKnights.players[1].cards,null);assert.equal(view.game.players[1].resources,null);
            if(kind==="espionage")assert.doesNotMatch(await dialog(page).innerText(),/Crane|起重机/,"Opponent's private cards stay hidden");
          }
          const draft=await page.locator("#citiesChoiceSelected").innerText();const chat=structuredClone(view);chat.chat.push({name:"TEN",text:"same revision",player:0});await emit(chat);
          assert(await dialog(page).isVisible());assert.equal(await page.locator("#citiesChoiceSelected").innerText(),draft);
          await dialog(page).locator("[data-clear-choice]").click();assert(await confirm(page).isDisabled());assert.equal(await dialog(page).locator('[aria-pressed="true"]').count(),0);await selectDraft(page,g,kind);
          await page.keyboard.press("Escape");assert(await dialog(page).isHidden());assert.equal(await page.evaluate(()=>JSON.stringify(sent)),before);
          await openPicker(page,kind);assert(await confirm(page).isDisabled(),"Reopening starts a fresh draft");assert.equal(await selectDraft(page,g,kind),key);
          if(mapId==="cities"&&["alchemy","reward","treason","replaceRank","harbor","discard"].includes(kind))await dialog(page).screenshot({path:path.join(__dirname,"test-results/catan-graphical-choice-"+kind+"-"+width+".png")});
          const start=await page.evaluate(()=>sent.length);await confirm(page).click();await dialog(page).waitFor({state:"hidden"});
          const messages=await page.evaluate(n=>sent.slice(n),start);assert.equal(messages.length,1);assert.equal(messages[0].type,"action");assert.deepEqual(messages[0].action,{type:"ck",choice:key});
          const after=structuredClone(g);E.act(after,0,messages[0].action);assert(after.revision>g.revision,"The real engine accepts the chosen action");
          await emit(snapshot(after,kind));await closeDialogs(page);await emit(snapshot(g,kind,2));await closeDialogs(page);
          assert.equal(await page.locator(".cities-choice-list [data-cities-picker]").count(),0,"Observer has no selection entry");
          report.push({mapId,width,kind,key});
        }
      }
    }
    // A saved draft must never survive game/actor/identity changes.
    const live=fixture(base("cities"),"alchemy"),view=snapshot(live,"alchemy");await page.setViewportSize({width:320,height:568});
    for(const mutation of ["revision","pause","identity","actor"]){
      await emit(view);await closeDialogs(page);await openPicker(page,"alchemy");await selectDraft(page,live,"alchemy");
      const start=await page.evaluate(()=>sent.length),changed=structuredClone(view);
      if(mutation==="revision")changed.game.revision++;
      if(mutation==="pause")changed.control={code:view.code,you:"picker-0",host:"picker-0",started:true,paused:true,archive:{supported:true,restoring:false,saving:false},auto:false,idleAuto:false,now:Date.now(),warning:null,pending:null,seats:view.seats.map((s,index)=>({...s,id:s.socialId,index}))};
      if(mutation==="identity")changed.seats[0].socialId="replacement";
      if(mutation==="actor"){changed.you=2;changed.game=E.publicGame(live,2);}
      await emit(changed);assert(await dialog(page).isHidden(),mutation+": invalid draft closes");
      await confirm(page).evaluate(b=>b.click());assert.equal(await page.evaluate(()=>sent.length),start,"Stale confirm sends nothing");
    }
    await emit(view);await closeDialogs(page);await openPicker(page,"alchemy");await selectDraft(page,live,"alchemy");const start=await page.evaluate(()=>sent.length);
    await page.evaluate(()=>{testSocket.readyState=3;testSocket.dispatchEvent(new Event("close"));});assert(await dialog(page).isHidden(),"Disconnect closes the draft");
    await confirm(page).evaluate(b=>b.click());assert.equal(await page.evaluate(()=>sent.length),start);
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(__dirname,"test-results/catan-graphical-choice-matrix.json"),JSON.stringify(report,null,2));
    console.log("Graphical choices: "+report.length+" map/width/type cases, editable draft, cancel, one legal confirmation, observer privacy and invalidation passed.");
  }finally{await browser.close();}
});
