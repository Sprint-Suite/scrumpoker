const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');
const { expectResultsInVoteColumn } = require('./helpers/layout');

test('authed user joins a company room, votes, reveals', async ({ page, context }) => {
  seedSession();
  await injectSession(context);
  await page.goto('/');

  await expect(page.locator('#connection-status')).toHaveText('Connected');
  await expect(page.locator('#login-button')).toBeEnabled();

  // Team picker is gone in the company model.
  await expect(page.locator('#team-field')).toHaveCount(0);

  await page.fill('#room-input', 'planning');
  await page.fill('#name-input', 'Alice');
  await page.selectOption('#role-select', 'Facilitator');
  await page.click('#login-button');

  await expect(page.locator('#poker-room-section')).toBeVisible();
  await expect(page.locator('#room-display')).toHaveText('Room: planning');
  await expect(page.locator('#room-org')).toHaveText('Acme Co');
  await expect(page.locator('#user-greeting')).toHaveText('Hello, Alice (Facilitator)');
  await expect(page.locator('#participants-list')).toContainText('Alice (You)');

  // Cast a vote — selector confirmed from cardDeck.js (cardButton.dataset.value) and app.js renderVotingCards()
  await page.locator('button.vote-card[data-value="5"]').click();
  await expect(page.locator('button.vote-card[data-value="5"]')).toHaveClass(/selected/);

  await page.click('#show-votes-button');
  await expect(page.locator('#vote-summary')).toBeVisible();
  await expect(page.locator('#average-vote')).toHaveText('5.0');
  await expect(page.locator('#ordered-votes-list')).toContainText('Alice');
  await expect(page.locator('#ordered-votes-list')).toContainText('5');
  await expectResultsInVoteColumn(page);
});

test('no session bounces away from the app page', async ({ page }) => {
  let redirectedTo = null;
  page.on('response', (resp) => {
    if (resp.status() === 302 && resp.url() === 'http://127.0.0.1:3066/') {
      redirectedTo = resp.headers()['location'];
    }
  });
  // No cookie injected. The server should 302 to the hub login.
  await page.goto('/', { waitUntil: 'commit' }).catch(() => {});
  expect(redirectedTo).toMatch(/\/login\?return_to=/);
  await expect(page.locator('#poker-room-section')).toBeHidden();
});
