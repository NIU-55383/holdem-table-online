"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const Audio = require("./game-audio"), Social = require("./social-data"), Catan = require("./catan-audio");
test("all shared reactions have short local sounds available in CATAN too", () => {
  assert.deepEqual(Object.keys(Audio.durations).sort(), Object.keys(Social.reactions).map(kind => `reaction-${kind}`).sort());
  for (const [kind, duration] of Object.entries(Audio.durations)) {
    assert.ok(duration > 0 && duration <= 1);
    assert.equal(Catan.durations[kind], duration);
  }
  assert.equal(Audio.synthesize({}, null, "unknown"), null);
});
test("shared effects respect unlock, mute, volume, visibility, polyphony and saved settings", () => {
  const storage = new Map(), rendered = [], stopped = [], contexts = [];
  const original = { localStorage: global.localStorage, AudioContext: global.AudioContext, document: global.document };
  global.localStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  global.document = { hidden: false };
  global.AudioContext = class {
    constructor() { this.state = "running"; this.currentTime = 0; contexts.push(this); }
    createDynamicsCompressor() { return { threshold: {}, ratio: {}, connect() {} }; }
    createGain() { return this.volume = { gain: {}, connect() {} }; }
  };
  const audio = Audio.create({ render: (ctx, destination, kind) => {
    rendered.push(kind); return { duration: 1, stop: () => stopped.push(kind) };
  } });
  try {
    assert.equal(audio.play("reaction-splash"), false, "Incoming events never autoplay before a gesture");
    audio.unlock(); assert.equal(contexts.length, 1);
    for (const kind of Object.keys(Audio.durations)) assert.equal(audio.play(kind), true);
    assert.equal(stopped.length, 2, "At most four sounds overlap");
    audio.setMuted(true); assert.equal(stopped.length, 6);
    assert.equal(audio.play("reaction-heart"), false);
    assert.equal(Audio.create().muted, true);
    audio.setMuted(false); audio.setVolume(.25);
    assert.equal(Audio.create().volume, .25); assert.equal(contexts[0].volume.gain.value, .25);
    assert.equal(Catan.create().volume, .6, "Standalone games do not overwrite CATAN preferences");
    audio.setVolume(0); assert.equal(audio.play("reaction-cheers"), false);
    audio.setVolume(.5); global.document.hidden = true;
    assert.equal(audio.play("reaction-luck"), false);
    global.document.hidden = false;
    assert.equal(rendered.length, 6, "Silent events are dropped, never queued to play later");
    assert.equal(audio.play("unknown"), false);
    assert.equal(audio.play("reaction-flowers"), true);
    audio.setVolume(9); assert.equal(audio.volume, 1);
    audio.setVolume(-9); assert.equal(audio.volume, 0);
  } finally {
    audio.stop();
    for (const [key, value] of Object.entries(original)) { if (value === undefined) delete global[key]; else global[key] = value; }
  }
});
