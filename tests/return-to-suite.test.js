"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("index.html has a hidden Return-to-Suite button + the snippet", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.match(html, /data-suite-return/, "button marker present");
  assert.match(html, /\shidden(\s|>)/, "button ships hidden");
  assert.match(html, /\/auth-client\/suite-return\.js/, "snippet included");
});

for (const shell of ["join.html"]) {
  test(`${shell} (anon/public) does NOT have the Return-to-Suite button`, () => {
    const html = fs.readFileSync(path.join(__dirname, "../public", shell), "utf8");
    assert.doesNotMatch(html, /data-suite-return/, "anon shell must not show the button");
  });
}
