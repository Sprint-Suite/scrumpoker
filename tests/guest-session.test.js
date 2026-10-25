"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadGuestSession() {
  const win = {};
  for (const file of ["reconnect.js", "guestSession.js"]) {
    new Function("window", fs.readFileSync(path.join(__dirname, "../public/js", file), "utf8"))(win);
  }
  return win.ScrumPokerGuestSession;
}
const { load, save, clear, createRetryWindow, createReconnector } = loadGuestSession();

function stubStorage() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}
const KEY = "a".repeat(32);

test("save then load round-trips the name and key", () => {
  const storage = stubStorage();
  save(storage, { token: "t1", name: "Guest", rejoinKey: KEY });
  assert.deepEqual(load(storage, "t1"), { name: "Guest", rejoinKey: KEY });
});

test("load returns null for another token, bad JSON or nothing stored", () => {
  const storage = stubStorage();
  assert.equal(load(storage, "t1"), null);
  save(storage, { token: "t1", name: "Guest", rejoinKey: KEY });
  assert.equal(load(storage, "t2"), null);
  storage.setItem("scrumPokerGuest", "{not json");
  assert.equal(load(storage, "t1"), null);
});

test("clear removes the entry", () => {
  const storage = stubStorage();
  save(storage, { token: "t1", name: "Guest", rejoinKey: KEY });
  clear(storage);
  assert.equal(load(storage, "t1"), null);
});

test("the retry window expires at exactly windowMs", () => {
  let t = 1000;
  const retry = createRetryWindow({ now: () => t });
  assert.equal(retry.expired(), false);
  retry.start();
  t = 1000 + 119999;
  assert.equal(retry.expired(), false);
  t = 1000 + 120000;
  assert.equal(retry.expired(), true);
});

test("a second start does not restart the window; stop clears it", () => {
  let t = 0;
  const retry = createRetryWindow({ now: () => t });
  retry.start();
  t = 100000;
  retry.start();
  t = 120000;
  assert.equal(retry.expired(), true);
  retry.stop();
  assert.equal(retry.expired(), false);
});

// A manual clock whose timers fire in order as it advances.
function fakeClock() {
  let t = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => { timers.set(nextId, { fn, at: t + ms }); return nextId++; },
    clearTimer: (id) => timers.delete(id),
    pending: () => timers.size,
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        t = due[1].at;
        due[1].fn();
      }
      t = end;
    }
  };
}

function reconnectorWith(clock) {
  const calls = { reopen: 0, giveUp: 0 };
  const reconnector = createReconnector({
    reopen: () => { calls.reopen += 1; },
    onWait: () => {},
    onGiveUp: () => { calls.giveUp += 1; },
    ...clock
  });
  return { reconnector, calls };
}

test("a reopen that never settles still reaches give-up at the deadline, once", () => {
  const clock = fakeClock();
  const { reconnector, calls } = reconnectorWith(clock);
  reconnector.begin();
  reconnector.schedule();
  clock.advance(1500);
  assert.equal(calls.reopen, 1);
  clock.advance(118499);
  assert.equal(calls.giveUp, 0);
  clock.advance(1);
  assert.equal(calls.giveUp, 1);
  reconnector.schedule();
  clock.advance(500000);
  assert.equal(calls.giveUp, 1);
  assert.equal(reconnector.active(), false);
});

test("stop() cancels the deadline and the pending reopen", () => {
  const clock = fakeClock();
  const { reconnector, calls } = reconnectorWith(clock);
  reconnector.begin();
  reconnector.schedule();
  reconnector.stop();
  clock.advance(500000);
  assert.deepEqual(calls, { reopen: 0, giveUp: 0 });
});

test("repeated begin() and schedule() do not extend the deadline", () => {
  const clock = fakeClock();
  const { reconnector, calls } = reconnectorWith(clock);
  reconnector.begin();
  clock.advance(60000);
  reconnector.begin();
  assert.equal(clock.pending(), 1);
  reconnector.schedule();
  clock.advance(59999);
  assert.equal(calls.giveUp, 0);
  clock.advance(1);
  assert.equal(calls.giveUp, 1);
});
