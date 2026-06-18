const { spawn } = require("child_process");
const path = require("path");

const node = process.execPath;
const port = 8012;
const server = spawn(node, [path.join(__dirname, "server.js")], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

function waitForServer() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server start timeout")), 5000);
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("multiplayer server")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (chunk) => reject(new Error(chunk.toString())));
  });
}

function makeClient(clientId) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const messages = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    messages.push(data);
    waiters.splice(0).forEach((resolve) => resolve());
  });
  return {
    socket,
    messages,
    async open() {
      if (socket.readyState !== WebSocket.OPEN) {
        await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
      }
      socket.send(JSON.stringify({ type: "hello", clientId }));
    },
    send(data) {
      socket.send(JSON.stringify(data));
    },
    async next(type = "state", after = 0) {
      const deadline = Date.now() + 4000;
      while (Date.now() < deadline) {
        const found = messages.slice(after).find((message) => message.type === type);
        if (found) return found;
        await new Promise((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 80);
        });
      }
      throw new Error(`Timed out waiting for ${type}`);
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForRoom(client, predicate, after = 0, label = "room condition") {
  const deadline = Date.now() + 9000;
  let cursor = after;
  while (Date.now() < deadline) {
    const state = await client.next("state", cursor);
    cursor = client.messages.length;
    if (predicate(state.room)) return state;
  }
  throw new Error(`Timed out waiting for ${label}`);
}

(async () => {
  try {
    await waitForServer();
    const pageResponse = await fetch(`http://127.0.0.1:${port}/index.html`);
    const page = await pageResponse.text();
    assert(pageResponse.ok && page.includes('id="onlineView"'), "Online page was not served");
    const infoResponse = await fetch(`http://127.0.0.1:${port}/api/info`, {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "holdem.example.com",
      },
    });
    const info = await infoResponse.json();
    assert(info.localUrl.includes(String(port)), "Server info endpoint is incorrect");
    assert(
      info.publicUrl === "https://holdem.example.com/index.html",
      "Public invitation URL is incorrect"
    );

    const alice = makeClient("alice-test");
    const bob = makeClient("bob-test");
    await Promise.all([alice.open(), bob.open()]);

    alice.send({
      type: "create",
      name: "Alice",
      maxPlayers: 5,
      startingStack: 200,
      blindInterval: 5,
    });
    const created = await alice.next();
    const code = created.room.code;
    assert(created.room.maxPlayers === 5, "Odd player room size was not applied");
    assert(created.room.startingStack === 200, "Starting stack was not applied");
    assert(created.room.blindInterval === 5, "Blind interval was not applied");

    const aliceBeforeJoin = alice.messages.length;
    bob.send({ type: "join", name: "Bob", code });
    const joined = await bob.next();
    await alice.next("state", aliceBeforeJoin);
    assert(joined.room.players.length === 2, "Second player did not join");

    const aliceBeforeStart = alice.messages.length;
    const bobBeforeStart = bob.messages.length;
    alice.send({ type: "start" });
    const aliceGame = await alice.next("state", aliceBeforeStart);
    const bobGame = await bob.next("state", bobBeforeStart);
    assert(aliceGame.room.status === "playing", "Game did not start");
    assert(aliceGame.room.players[0].hand.length === 2, "Alice cannot see her hand");
    assert(aliceGame.room.players[1].hand.length === 0, "Alice can see Bob's private hand");
    assert(bobGame.room.players[1].hand.length === 2, "Bob cannot see his hand");
    assert(bobGame.room.players[0].hand.length === 0, "Bob can see Alice's private hand");
    assert(aliceGame.room.pot === 3, "Blinds were not posted correctly");

    const actor = aliceGame.room.actor;
    const actorClient = actor === 0 ? alice : bob;
    const actorBefore = actorClient.messages.length;
    actorClient.send({ type: "action", action: "call" });
    let acted = await actorClient.next("state", actorBefore);
    assert(acted.room.actor !== actor || acted.room.status !== "playing", "Turn did not advance");

    let guard = 20;
    while (acted.room.status === "playing" && guard > 0) {
      const actingClient = acted.room.actor === 0 ? alice : bob;
      const aliceBeforeAction = alice.messages.length;
      actingClient.send({ type: "action", action: "call" });
      acted = await alice.next("state", aliceBeforeAction);
      guard -= 1;
    }
    assert(acted.room.status === "handComplete", "Hand did not reach completion");
    assert(acted.room.board.length === 5, "Board did not run out to five cards");
    assert(acted.room.players.every((player) => player.hand.length === 2), "Showdown cards were not revealed");
    assert(
      acted.room.players.reduce((total, player) => total + player.chips, 0) === 400,
      "Chips were not conserved after settlement"
    );

    const aliceBeforeNext = alice.messages.length;
    alice.send({ type: "nextHand" });
    const nextAliceGame = await waitForRoom(alice, (room) => room.status === "playing", aliceBeforeNext, "next hand start");
    const foldActor = nextAliceGame.room.actor;
    const foldClient = foldActor === 0 ? alice : bob;
    const revealObserver = foldActor === 0 ? bob : alice;
    const beforeFold = revealObserver.messages.length;
    foldClient.send({ type: "action", action: "fold" });
    await waitForRoom(revealObserver, (room) => room.status === "handComplete", beforeFold, "fold hand complete");
    const beforeShow = revealObserver.messages.length;
    foldClient.send({ type: "showCards", show: true });
    const shown = await waitForRoom(
      revealObserver,
      (room) => room.players[foldActor].hand.length === 2,
      beforeShow,
      "folded player reveal"
    );
    assert(shown.room.players[foldActor].showCards === true, "Folded reveal flag was not set");
    const beforeMuck = revealObserver.messages.length;
    foldClient.send({ type: "showCards", show: false });
    const mucked = await waitForRoom(
      revealObserver,
      (room) => room.players[foldActor].hand.length === 0,
      beforeMuck,
      "folded player muck"
    );
    assert(mucked.room.players[foldActor].showCards === false, "Folded muck flag was not cleared");

    console.log(`PASS room=${code} actor=${actor} board=${acted.room.board.length} chips=400`);
    alice.socket.close();
    bob.socket.close();

    const host = makeClient("host-bot-test");
    await host.open();
    host.send({
      type: "create",
      name: "Host",
      maxPlayers: 4,
      startingStack: 150,
      blindInterval: 10,
    });
    const botRoomCreated = await host.next();
    host.send({ type: "addBot" });
    const withBot = await waitForRoom(
      host,
      (room) => room.players.length === 2 && room.players.some((player) => player.isBot),
      botRoomCreated ? host.messages.length - 1 : 0,
      "bot added"
    );
    assert(withBot.room.players.filter((player) => player.isBot).length === 1, "Bot was not added");
    const beforeBotStart = host.messages.length;
    host.send({ type: "start" });
    let botGame = await waitForRoom(host, (room) => room.status === "playing", beforeBotStart, "bot game start");
    assert(botGame.room.players.length === 2, "Bot game player count is wrong");
    assert(botGame.room.players.some((player) => player.isBot), "Bot missing after start");
    assert(botGame.room.players[botGame.room.viewerIndex].hand.length === 2, "Host cannot see hand in bot game");

    let botGuard = 20;
    while (botGame.room.status === "playing" && botGuard > 0) {
      if (botGame.room.actor === botGame.room.viewerIndex) {
        const beforeHuman = host.messages.length;
        host.send({ type: "action", action: "call" });
        botGame = await waitForRoom(host, () => true, beforeHuman, "human action after bot");
      } else {
        botGame = await waitForRoom(
          host,
          (room) => room.actor === room.viewerIndex || room.status !== "playing",
          host.messages.length,
          "bot auto action"
        );
      }
      botGuard -= 1;
    }
    assert(botGame.room.status === "handComplete", "Bot hand did not complete");
    assert(
      botGame.room.players.reduce((total, player) => total + player.chips, 0) === 300,
      "Bot game chips were not conserved"
    );
    const botCode = botGame.room.code;
    await new Promise((resolve) => {
      host.socket.addEventListener("close", resolve, { once: true });
      host.socket.close();
    });
    const rejoinedHost = makeClient("host-bot-test");
    await rejoinedHost.open();
    rejoinedHost.send({ type: "join", name: "Host", code: botCode });
    const rejoined = await waitForRoom(
      rejoinedHost,
      (room) => room.status === "handComplete" && room.hostId === "host-bot-test",
      0,
      "host rejoin hand complete"
    );
    assert(rejoined.room.originalHostId === "host-bot-test", "Original host id was not preserved");
    const beforeRejoinNext = rejoinedHost.messages.length;
    rejoinedHost.send({ type: "nextHand" });
    await waitForRoom(rejoinedHost, (room) => room.status === "playing", beforeRejoinNext, "rejoined host next hand");
    console.log("PASS bot-room board=" + botGame.room.board.length + " chips=300");
    rejoinedHost.socket.close();
  } finally {
    server.kill();
  }
})().catch((error) => {
  console.error(error.stack || error.message);
  server.kill();
  process.exitCode = 1;
});
