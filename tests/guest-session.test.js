"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function loadGuestSession() {
  const win = {};
  const code = fs.readFileSync(path.join(__dirname, "../public/js/guestSession.js"), "utf8");
  new Function("window", code)(win);
  return win.ScrumPokerGuestSession;
}
const { load, save, clear, createRetryWindow } = loadGuestSession();

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
