// tests/theme-contrast.test.js
"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { contrastRatio, meetsAA } = require("../lib/contrast");

/**
 * Instrument palette pairs that Poker MUST maintain for WCAG AA.
 *
 * Hexes are the sRGB equivalents of the named oklch tokens defined in
 * public/css/instrument-core.css (and poker.css for --danger).
 * If a token is recoloured, this test catches the regression.
 *
 * data-app="poker" sets --accent: var(--ink), so Poker's primary
 * button/action colour is ink (dark monochrome).
 */
const INS = {
  // -- instrument-core.css tokens --
  bone:      "#f1f3f5", // oklch(0.964 0.004 240) — page background
  panel:     "#fdfeff", // oklch(0.996 0.002 240) — card / surface background
  ink:       "#1a1f24", // oklch(0.235 0.013 250) — primary text + poker accent
  soft:      "#52575d", // oklch(0.455 0.012 250) — secondary text
  faint:     "#7c8186", // oklch(0.6   0.01  250) — tertiary / placeholder text
  green:     "#266248", // oklch(0.45  0.077 162) — Show Votes (success action)
  greenwash: "#ddf5e9", // oklch(0.95  0.03  165) — green pill / highlight bg
  // -- poker.css local token --
  danger:    "#a03f3c", // oklch(0.5   0.13   25) — Reset / End / Logout button bg
};

// --------------------------------------------------------------------------
// BODY TEXT pairs — WCAG AA requires 4.5:1
// --------------------------------------------------------------------------
const BODY_PAIRS = [
  ["ink",   "bone"],      // standard page text
  ["ink",   "panel"],     // text on cards
  ["soft",  "panel"],     // secondary text on cards
  ["soft",  "bone"],      // secondary text on page bg
  ["white", "ink"],       // label on ink primary button (btn-primary, accent=ink)
  ["green", "greenwash"], // green pill label on greenwash pill bg
];

for (const [fg, bg] of BODY_PAIRS) {
  test(`instrument/poker contrast: ${fg} on ${bg} meets AA body text`, () => {
    const fgHex = fg === "white" ? "#ffffff" : INS[fg];
    const bgHex = INS[bg];
    const ratio = contrastRatio(fgHex, bgHex);
    assert.ok(
      meetsAA(fgHex, bgHex),
      `${fg} (${fgHex}) on ${bg} (${bgHex}) = ${ratio.toFixed(2)}:1, need 4.5:1`
    );
  });
}

// --------------------------------------------------------------------------
// LARGE / BOLD button-label pairs — WCAG AA requires 3:1 for large/bold text
// These are bold (font-weight 700) action button labels.
// --------------------------------------------------------------------------
const LARGE_PAIRS = [
  ["white", "green"],  // Show Votes button (.success-action: bg=green, color=#fff)
  ["white", "danger"], // Reset / End / Logout (.danger-action: bg=danger, color=#fff)
];

for (const [fg, bg] of LARGE_PAIRS) {
  test(`instrument/poker contrast: ${fg} on ${bg} meets AA large/bold text`, () => {
    const fgHex = "#ffffff";
    const bgHex = INS[bg];
    const ratio = contrastRatio(fgHex, bgHex);
    assert.ok(
      meetsAA(fgHex, bgHex, { largeText: true }),
      `${fg} (#ffffff) on ${bg} (${bgHex}) = ${ratio.toFixed(2)}:1, need 3:1`
    );
  });
}

// --------------------------------------------------------------------------
// HEADER BANNER — text over images/room-banner.webp (poker.css "Header band")
// The .sub backing is 88% banner-base over the image's darkest pixel, so this
// is the worst case anywhere a long room name can wrap.
// --------------------------------------------------------------------------
const BANNER_BASE = "#f3faf7";
const BANNER_DARKEST = "#1c6f5a";
const EYEBROW = "#216b63";

function composite(topHex, bottomHex, alpha) {
  const ch = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const mix = [0, 1, 2].map((i) => Math.round(alpha * ch(topHex, i) + (1 - alpha) * ch(bottomHex, i)));
  return `#${mix.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

test("banner: eyebrow on the banner base meets AA body text", () => {
  assert.ok(meetsAA(EYEBROW, BANNER_BASE), `${contrastRatio(EYEBROW, BANNER_BASE).toFixed(2)}:1`);
});

test("banner: secondary text on the .sub backing meets AA over the darkest artwork", () => {
  const backing = composite(BANNER_BASE, BANNER_DARKEST, 0.88);
  assert.ok(meetsAA(INS.soft, backing), `${contrastRatio(INS.soft, backing).toFixed(2)}:1 on ${backing}`);
});
