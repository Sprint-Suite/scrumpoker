"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// reconnect.js is a browser IIFE that attaches to `window`; run it against a stub.
function loadReconnect() {
  const win = {};
  const code = fs.readFileSync(path.join(__dirname, "../public/js/reconnect.js"), "utf8");
  new Function("window", code)(win);
  return win.ScrumPokerReconnect;
}
const { createBackoff, probeAccess } = loadReconnect();

test("backoff doubles from the base to the ceiling and resets", () => {
  const backoff = createBackoff({ baseMs: 5000, maxMs: 60000, jitter: 0, random: () => 0.5 });
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(() => backoff.next()), [5000, 10000, 20000, 40000, 60000, 60000]);
  backoff.reset();
  assert.equal(backoff.next(), 5000);
});

test("backoff jitter stays within its band", () => {
  const low = createBackoff({ baseMs: 5000, maxMs: 60000, jitter: 0.2, random: () => 0 });
  const high = createBackoff({ baseMs: 5000, maxMs: 60000, jitter: 0.2, random: () => 0.999999 });
  assert.equal(low.next(), 4000);
  assert.ok(Math.abs(high.next() - 6000) < 1);
});

test("probeAccess asks for re-auth on a redirect or 401", async () => {
  assert.equal(await probeAccess(async () => ({ type: "opaqueredirect", status: 0 })), "reauth");
  assert.equal(await probeAccess(async () => ({ type: "basic", status: 401 })), "reauth");
});

test("probeAccess treats a healthy page, a server error or a network failure as busy", async () => {
  assert.equal(await probeAccess(async () => ({ type: "basic", status: 200 })), "busy");
  assert.equal(await probeAccess(async () => ({ type: "basic", status: 503 })), "busy");
  assert.equal(await probeAccess(async () => { throw new TypeError("network"); }), "busy");
});

test("probeAccess gives up on a hung request and reports busy", async () => {
  const hung = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => reject(new Error("aborted")));
  });
  assert.equal(await probeAccess(hung, { timeoutMs: 20 }), "busy");
});

test("probeAccess sends a same-origin, uncached, manual-redirect request", async () => {
  let seen;
  await probeAccess(async (url, opts) => { seen = { url, ...opts }; return { type: "basic", status: 200 }; });
  assert.equal(seen.url, "/");
  assert.equal(seen.redirect, "manual");
  assert.equal(seen.cache, "no-store");
});
