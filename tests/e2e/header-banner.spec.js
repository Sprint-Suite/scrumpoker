"use strict";

const { test, expect } = require("@playwright/test");
const { seedSession } = require("./helpers/seed");
const { injectSession } = require("./helpers/_auth");

function attachErrorListeners(page) {
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errs.push(m.text());
  });
  return errs;
}

async function expectBanner(band) {
  await expect(band).toBeVisible();
  await expect(band.locator(".waves")).toHaveCount(0);
  const image = await band.evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(image).toContain("/images/room-banner.webp");
  // Text that can wrap over the artwork carries an opaque-enough backing.
  for (const sub of await band.locator(".sub:not(:empty)").all()) {
    const bg = await sub.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  }
}

test.describe("header banner", () => {
  test("banner image is served", async ({ request }) => {
    const res = await request.get("/images/room-banner.webp");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/webp");
  });

  test("entry screen (index.html #login-section) shows the banner", async ({ page, context }) => {
    const errs = attachErrorListeners(page);

    seedSession();
    await injectSession(context);
    await page.goto("/");

    // Entry screen is visible before joining a room.
    await expect(page.locator("#login-section")).toBeVisible();

    await expectBanner(page.locator("#login-section .band").first());

    expect(errs).toEqual([]);
  });

  test("room section (index.html #poker-room-section) shows the banner after joining", async ({ page, context }) => {
    const errs = attachErrorListeners(page);

    seedSession();
    await injectSession(context);
    await page.goto("/");

    await expect(page.locator("#login-button")).toBeEnabled();

    await page.locator("#room-input").fill("waves-room");
    await page.locator("#name-input").fill("Alice");
    await page.locator("#role-select").selectOption("Facilitator");
    await page.locator("#login-button").click();

    await expect(page.locator("#poker-room-section")).toBeVisible();

    await expectBanner(page.locator("#poker-room-section .band").first());

    expect(errs).toEqual([]);
  });

  test("anonymous join entry (join.html #join-section) has NO band; room shows the banner after joining", async ({ page, context, browser }) => {
    const errs = attachErrorListeners(page);

    // Set up a room with a share token via an authenticated facilitator.
    seedSession();
    await injectSession(context);
    await page.goto("/");

    await page.locator("#room-input").fill("waves-anon-room");
    await page.locator("#name-input").fill("Alice");
    await page.locator("#role-select").selectOption("Facilitator");
    await page.locator("#login-button").click();
    await expect(page.locator("#poker-room-section")).toBeVisible();

    const token = await page.locator("#poker-room-section").getAttribute("data-share-token");
    expect(token).toMatch(/^[0-9a-f]{32}$/);

    // Anonymous user visits join.html via the share link.
    const anonCtx = await browser.newContext();
    const anon = await anonCtx.newPage();
    const anonErrs = [];
    anon.on("pageerror", (e) => anonErrs.push(String(e)));
    anon.on("console", (m) => {
      if (m.type() === "error") anonErrs.push(m.text());
    });

    try {
      await anon.goto(`/join?token=${token}`);

      // The join entry screen has no band — it's a focused card.
      await expect(anon.locator("#join-section")).toBeVisible();
      await expect(anon.locator("#join-section .band")).toHaveCount(0);

      // Join the room.
      await anon.fill("#join-name-input", "Guest");
      await anon.click("#join-button");
      await expect(anon.locator("#poker-room-section")).toBeVisible();

      await expectBanner(anon.locator("#poker-room-section .band").first());

      expect(anonErrs).toEqual([]);
    } finally {
      await anonCtx.close();
    }

    expect(errs).toEqual([]);
  });

  for (const width of [375, 1440]) {
    test(`an unbroken 200-character room name wraps inside its backing at ${width}px`, async ({ page, context }) => {
      await page.setViewportSize({ width, height: 800 });
      seedSession();
      await injectSession(context);
      await page.goto("/");

      await page.locator("#room-input").fill("W".repeat(200));
      await page.locator("#name-input").fill("Alice");
      await page.locator("#role-select").selectOption("Facilitator");
      await page.locator("#login-button").click();
      await expect(page.locator("#poker-room-section")).toBeVisible();

      const room = page.locator("#room-display");
      await expect(room).toContainText("WWWW");
      const fits = await room.evaluate((el) => el.scrollWidth <= el.clientWidth);
      expect(fits).toBe(true);
    });
  }
});
