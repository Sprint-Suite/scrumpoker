const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');
const { expectResultsInVoteColumn } = require('./helpers/layout');

// An authenticated company member opens a room and shares its anonymous link;
// a person with NO account joins via that link and can vote but cannot facilitate.
test('anonymous player joins via share link, votes, and cannot facilitate', async ({ page, context, browser }) => {
  seedSession();
  await injectSession(context);
  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');

  await page.fill('#room-input', 'anon-room');
  await page.fill('#name-input', 'Alice');
  await page.selectOption('#role-select', 'Facilitator');
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();

  // The room exposes its anonymous share token for the invite link.
  const token = await page.locator('#poker-room-section').getAttribute('data-share-token');
  expect(token).toMatch(/^[0-9a-f]{32}$/);

  // A second browser context with NO session cookie joins via the link.
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  try {
    await anon.goto(`/join?token=${token}`);
    await anon.fill('#join-name-input', 'Guest');
    await anon.click('#join-button');

    // The anonymous guest is in the room and can vote.
    await expect(anon.locator('#poker-room-section')).toBeVisible();
    await anon.locator('button.vote-card[data-value="8"]').click();
    await expect(anon.locator('button.vote-card[data-value="8"]')).toHaveClass(/selected/);

    // The anonymous page exposes NO facilitator controls.
    await expect(anon.locator('#show-votes-button')).toHaveCount(0);
    await expect(anon.locator('#reset-votes-button')).toHaveCount(0);
    await expect(anon.locator('#end-session-button')).toHaveCount(0);
    await expect(anon.locator('#invite-menu-button')).toHaveCount(0);

    // The facilitator sees the guest and can reveal; the guest's vote surfaces.
    await expect(page.locator('#participants-list')).toContainText('Guest');
    await page.click('#show-votes-button');
    await expect(anon.locator('#vote-summary')).toBeVisible();
    await expect(anon.locator('#average-vote')).toHaveText('8.0');
    await expect(anon.locator('#ordered-votes')).toBeVisible();
    await expectResultsInVoteColumn(anon);

    // A reset flips the guest's cards face-down before the new round opens.
    await page.click('#reset-votes-button');
    await expect(anon.locator('.vote-card .card-inner.is-face-down').first()).toBeAttached();
    await expect(anon.locator('#round-status')).toHaveText('Open');
    await expect(anon.locator('button.vote-card.selected')).toHaveCount(0);
  } finally {
    await anonCtx.close();
  }
});

test('a closed/invalid share link shows a friendly error and joins no room', async ({ browser }) => {
  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  try {
    await anon.goto('/join?token=deadbeefdeadbeefdeadbeefdeadbeef');
    await anon.fill('#join-name-input', 'Nobody');
    await anon.click('#join-button');

    await expect(anon.locator('#join-error')).toBeVisible();
    await expect(anon.locator('#join-error')).toContainText(/closed|invalid/i);
    await expect(anon.locator('#poker-room-section')).toBeHidden();
  } finally {
    await anonCtx.close();
  }
});
