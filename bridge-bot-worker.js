"use strict";

const { Worker, isMainThread, parentPort } = require("node:worker_threads");

if (!isMainThread) {
  const Bot = require("./bridge-bot");
  parentPort.on("message", ({ id, view, actor, style }) => {
    try { parentPort.postMessage({ id, action: Bot.chooseAction(view, actor, style) }); }
    catch (error) { parentPort.postMessage({ id, error: error.message }); }
  });
}

function createBotRunner() {
  let worker = null, active = null, nextId = 0, closed = false;
  const queue = [];
  function pump() {
    if (closed || active || !queue.length) return;
    if (!worker) {
      const current = new Worker(__filename); worker = current;
      const failed = (error) => {
        if (worker !== current) return;
        worker = null;
        if (active) { active.reject(error); active = null; }
        current.terminate().catch(() => {}); pump();
      };
      current.on("error", failed);
      current.on("exit", (code) => { if (worker === current) failed(new Error(`Bridge worker exited: ${code}`)); });
      current.on("message", (message) => {
        if (worker !== current || active?.id !== message.id) return;
        const job = active; active = null; current.unref();
        if (job.cancelled) job.resolve(null);
        else if (message.error) job.reject(new Error(message.error));
        else job.resolve(message.action);
        pump();
      });
    }
    active = queue.shift(); worker.ref();
    const { id, view, actor, style } = active;
    worker.postMessage({ id, view, actor, style });
  }
  function cancel(key) {
    if (active?.key === key) { active.cancelled = true; active.resolve(null); }
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].key === key) queue.splice(i, 1)[0].resolve(null);
  }
  return {
    run(key, view, actor, style) {
      if (closed) return Promise.resolve(null);
      cancel(key);
      return new Promise((resolve, reject) => { queue.push({ id: ++nextId, key, view, actor, style, resolve, reject }); pump(); });
    },
    cancel,
    close() {
      closed = true;
      queue.splice(0).forEach((job) => job.resolve(null));
      if (active) { active.resolve(null); active = null; }
      const old = worker; worker = null;
      return old ? old.terminate() : Promise.resolve();
    }
  };
}

module.exports = { createBotRunner };
