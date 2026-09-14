"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const path = require("node:path"), fs = require("node:fs");
const { WebSocket } = require("ws");
const A = require("./avatar-data");
const port = 18753, origin = `http://127.0.0.1:${port}`;
const smile = { kind: "emoji", value: "\u{1f600}" }, wink = { kind: "emoji", value: "\u{1f609}" };
// A minimal SOF header tests transport validation; browser tests use a real decoded image.
const jpeg = Buffer.from([255, 216, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 17, 0, 2, 17, 0, 3, 17, 0, 255, 217]);
const photo = { kind: "photo", value: `data:image/jpeg;base64,${jpeg.toString("base64")}` };
let server;
const sockets = [];
before(async () => {
  server = spawn(process.execPath, [path.join(__dirname, "server.js")], { cwd: __dirname, env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Avatar test server startup timeout")), 5000);
    server.stdout.once("data", () => { clearTimeout(timer); resolve(); });
    server.once("error", reject);
    server.stderr.on("data", (data) => { clearTimeout(timer); reject(new Error(String(data))); });
  });
});
after(async () => {
  sockets.forEach((socket) => socket.terminate());
  if (server && server.exitCode === null) { server.kill(); await once(server, "exit"); }
});
async function client(game, identity, avatar) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/${game === "catan" ? "catan-ws" : "ws"}`);
  sockets.push(socket);
  const messages = [];
  socket.on("message", (raw) => messages.push(JSON.parse(String(raw))));
  await once(socket, "open");
  const send = (data) => socket.send(JSON.stringify(data));
  async function wait(predicate, after = 0) {
    const deadline = Date.now() + 7000;
    while (Date.now() < deadline) {
      const found = messages.slice(after).find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`Missing ${game} message: ${messages.at(-1)?.type}`);
  }
  send({ type: "hello", ...(game === "catan" ? { token: identity } : { clientId: identity }), ...(avatar === undefined ? {} : { avatar }) });
  const token = game === "catan" ? (await wait((m) => m.type === "welcome")).token : identity;
  return { socket, messages, send, wait, token };
}
test("Avatar validation: graphemes, image bounds, safe formats and stable bot choices", () => {
  assert.equal(A.firstLetter("  Connie"), "C");
  assert.equal(A.firstLetter("小明"), "小");
  assert.equal(A.firstLetter("\u{1f469}\u200d\u{1f4bb}Coder"), "\u{1f469}\u200d\u{1f4bb}");
  assert.equal(A.normalize(null), null);
  for (const value of [smile.value, "\u{1f468}\u200d\u{1f469}\u200d\u{1f467}", "\u{1f1e8}\u{1f1f3}", "1\ufe0f\u20e3"]) assert.equal(A.normalize({ kind: "emoji", value }).value, value);
  for (const value of ["abc", "<img src=x>", smile.value + wink.value, "1", ""]) assert.throws(() => A.normalize({ kind: "emoji", value }));
  assert.deepEqual(A.normalize(photo), photo);
  const oversized = Buffer.from(jpeg); oversized.writeUInt16BE(257, 9);
  for (const value of ["https://example.com/a.jpg", "data:image/svg+xml;base64,PHN2Zz4=", "data:image/jpeg;base64,AAAA", `data:image/jpeg;base64,${oversized.toString("base64")}`, photo.value + "A".repeat(16000)]) assert.throws(() => A.normalize({ kind: "photo", value }));
  assert.throws(() => A.normalize({ kind: "symbol", value: "bot-smile" }));
  assert.throws(() => A.normalize({ kind: "symbol", value: "avatar-0" }, true));
  assert.equal(A.randomBot(() => .1), null);
  for (let i = 0; i < A.BOT_SYMBOLS.length; i++) {
    let call = 0;
    const bot = A.randomBot(() => ++call === 1 ? .8 : (i + .1) / A.BOT_SYMBOLS.length);
    assert.equal(bot.value, A.BOT_SYMBOLS[i]); assert.deepEqual(A.normalize(bot, true), bot);
  }
});
for (const game of ["catan", "poker"]) test(`${game}: avatars synchronize, survive reconnect, and can only update the sender's seat`, async () => {
  const host = await client(game, `${game}-avatar-host`, smile), guest = await client(game, `${game}-avatar-guest`, photo);
  const seats = (message) => game === "catan" ? message.seats : message.room.players;
  host.send({ type: "create", name: "Connie", seats: 3, maxPlayers: 3 });
  const created = await host.wait((m) => m.type === "state"), code = game === "catan" ? created.code : created.room.code;
  assert.deepEqual(seats(created)[0].avatar, smile);
  guest.send({ type: "join", name: "Gary", code });
  const joined = await guest.wait((m) => m.type === "state");
  assert.deepEqual(seats(joined)[1].avatar, photo);
  host.send({ type: "addBot" });
  const full = await host.wait((m) => m.type === "state" && seats(m).length === 3);
  const botAvatar = seats(full)[2].avatar;
  assert.deepEqual(A.normalize(botAvatar, true), botAvatar);
  let cursor = guest.messages.length;
  host.send({ type: "profile", avatar: wink, playerId: 1, clientId: `${game}-avatar-guest` });
  const changed = await guest.wait((m) => m.type === "state" && seats(m)[0].avatar?.value === wink.value, cursor);
  assert.deepEqual(seats(changed)[1].avatar, photo, "Other seats cannot be edited by the profile request");
  assert.deepEqual(seats(changed)[2].avatar, botAvatar);
  cursor = host.messages.length;
  host.send({ type: "profile", avatar: { kind: "photo", value: "javascript:alert(1)" } });
  await host.wait((m) => m.type === "error", cursor);
  cursor = guest.messages.length;
  host.send({ type: "start" });
  const started = await guest.wait((m) => m.type === "state" && (game === "catan" ? m.game : m.room.status !== "lobby"), cursor);
  assert.deepEqual(seats(started)[0].avatar, wink);
  assert.deepEqual(seats(started)[2].avatar, botAvatar, "Bot avatars stay unchanged at game start");
  if (game === "catan") assert.ok(started.seats.every((p) => !Object.hasOwn(p, "token")));
  guest.socket.close(); await once(guest.socket, "close");
  const reconnected = await client(game, guest.token);
  if (game === "poker") reconnected.send({ type: "join", code, name: "Gary" });
  const restored = await reconnected.wait((m) => m.type === "state");
  assert.deepEqual(seats(restored)[1].avatar, photo, "Reconnect without an avatar preserves the saved seat photo");
  reconnected.send({ type: "profile", avatar: null });
  const reset = await host.wait((m) => m.type === "state" && seats(m)[1].avatar === null, host.messages.length);
  assert.equal(seats(reset)[1].avatar, null);
});
test("Avatar picker in real browsers: upload, camera input, emoji, cancel, shared preference and mobile layout", { skip: process.env.AVATAR_UI !== "1", timeout: 60000 }, async () => {
  let playwright;
  try { playwright = require("playwright"); } catch { playwright = require(path.resolve(path.dirname(process.execPath), "../node_modules/playwright")); }
  const browser = await playwright.chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
  try {
    fs.mkdirSync(path.join(__dirname, "test-results"), { recursive: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage(), errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/catan.html`);
    await page.locator("#name").fill("Connie");
    assert.equal(await page.locator("#catanAvatarPicker .avatar-initial").textContent(), "C");
    await page.locator("#catanAvatarPicker button").click();
    assert.equal(await page.locator("#avatarCamera").getAttribute("capture"), "user");
    await page.locator("#avatarEmoji").fill("not an emoji");
    assert.equal(await page.locator("#avatarSave").isDisabled(), true);
    await page.locator("#avatarEmoji").fill(smile.value);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
      const box = await page.locator("#avatarDialog").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width && box.y >= 0 && box.y + box.height <= (width === 320 ? 640 : 900));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/avatar-picker-${width}.png` });
    }
    await page.locator("#avatarSave").click();
    assert.deepEqual(await page.evaluate(() => BoardGameUI.getAvatar()), smile);
    await page.locator("#catanAvatarPicker button").click();
    await page.locator("#avatarEmoji").fill(wink.value);
    await page.locator(".avatar-dialog-actions [data-avatar-close]").click();
    assert.deepEqual(await page.evaluate(() => BoardGameUI.getAvatar()), smile, "Cancel must not save a draft");
    const png = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 300; canvas.height = 180;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#257b62"; ctx.fillRect(0, 0, 300, 180);
      ctx.fillStyle = "#ffd963"; ctx.beginPath(); ctx.arc(150, 90, 60, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#183b3b"; ctx.font = "bold 80px sans-serif"; ctx.textAlign = "center"; ctx.fillText("C", 150, 118);
      return canvas.toDataURL("image/png");
    });
    await page.locator("#catanAvatarPicker button").click();
    await page.locator("#avatarUpload").setInputFiles({ name: "portrait.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1], "base64") });
    await page.waitForFunction(() => { const img = document.querySelector(".avatar-editor-preview img"); return img?.complete && img.naturalWidth === 128 && !document.getElementById("avatarSave").disabled; });
    await page.locator("#avatarSave").click();
    const saved = await page.evaluate(() => BoardGameUI.getAvatar());
    assert.equal(saved.kind, "photo"); assert.ok(saved.value.length <= A.MAX_PHOTO_LENGTH);
    assert.ok(!saved.value.includes(png.split(",")[1]));
    await page.locator("#create").click();
    await page.locator("#lobby [data-edit-avatar]").waitFor();
    await page.waitForFunction(() => document.querySelector("#lobby .avatar-photo")?.naturalWidth === 128);
    await page.locator("#fillBots").click();
    await page.locator("#start:not([disabled])").waitFor();
    await page.locator("#start").click();
    await page.locator("#players [data-edit-avatar]").waitFor();
    await page.locator("#players [data-edit-avatar]").click();
    const chooserPromise = page.waitForEvent("filechooser");
    await page.locator("[data-avatar-camera]").click();
    const chooser = await chooserPromise;
    await chooser.setFiles({ name: "camera.png", mimeType: "image/png", buffer: Buffer.from(png.split(",")[1], "base64") });
    await page.waitForFunction(() => !document.getElementById("avatarSave").disabled);
    await page.locator("#avatarSave").click();
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `test-results/avatar-catan-${width}.png`, fullPage: true });
    }
    await page.goto(`${origin}/index.html`); await page.locator(".poker-game").click();
    await page.locator("#onlineNameInput").fill("Connie");
    await page.waitForFunction(() => document.querySelector("#pokerAvatarPicker .avatar-photo")?.naturalWidth === 128);
    assert.equal((await page.evaluate(() => BoardGameUI.getAvatar())).kind, "photo", "Preference is shared between games");
    await page.locator('[data-online-count="8"]').click(); await page.locator("#createOnlineRoomBtn").click();
    await page.locator("#onlineLobby [data-edit-avatar]").waitFor();
    const roomCode = await page.locator("#onlineRoomCodeButton").textContent();
    const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } }), guestPage = await guestContext.newPage();
    guestPage.on("pageerror", (error) => errors.push(error.message));
    await guestPage.goto(`${origin}/index.html`); await guestPage.locator(".poker-game").click();
    await guestPage.locator("#onlineNameInput").fill("Gary"); await guestPage.locator("#onlineRoomCodeInput").fill(roomCode);
    await guestPage.locator("#joinOnlineRoomBtn").click();
    await guestPage.waitForFunction(() => document.querySelector("#onlineLobby .avatar-photo")?.naturalWidth === 128);
    assert.equal(await guestPage.locator("#onlineLobby [data-edit-avatar]").count(), 1, "Only the viewer's own avatar is editable");
    await page.locator("#fillOnlineBotsBtn").click(); await page.locator("#startOnlineGameBtn").click();
    await page.locator("#onlinePlayersLayer [data-edit-avatar]").waitFor();
    await guestPage.waitForFunction(() => document.querySelector('#onlinePlayersLayer [data-player-id="0"] .avatar-photo')?.naturalWidth === 128);
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.screenshot({ path: `test-results/avatar-poker-${width}.png`, fullPage: true });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    await page.locator("#onlinePlayersLayer [data-edit-avatar]").click(); await page.locator("[data-avatar-initial]").click(); await page.locator("#avatarSave").click();
    await guestPage.waitForFunction(() => document.querySelector('#onlinePlayersLayer [data-player-id="0"] .avatar-initial')?.textContent === "C");
    assert.equal(await page.locator("#pokerAvatarPicker .avatar-initial").textContent(), "C");
    assert.equal(await page.evaluate(() => BoardGameUI.getAvatar()), null);
    await guestContext.close();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
