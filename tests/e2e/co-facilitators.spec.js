const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

const roomName = 'co-facilitator-room';

async function joinAs(browser, { sessionId, name, role }) {
  const context = await browser.newContext();
  await injectSession(context, sessionId);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#login-button')).toBeEnabled();
  await page.fill('#room-input', roomName);
  await page.fill('#name-input', name);
  await page.selectOption('#role-select', role);
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  return { context, page };
}

const row = (page, name) => page.locator('.participant-row').filter({ hasText: name });
const roleOptions = (page, name) => row(page, name).locator('.participant-role-select option');

test('a facilitator adds a co-facilitator who keeps the room running after they leave', async ({ browser }) => {
  seedSession({ id: 's-cf-alice', userId: 'u-cf-alice' });
  seedSession({ id: 's-cf-bob', userId: 'u-cf-bob' });
  seedSession({ id: 's-cf-carol', userId: 'u-cf-carol' });

  const alice = await joinAs(browser, { sessionId: 's-cf-alice', name: 'Alice', role: 'Facilitator' });
  const bob = await joinAs(browser, { sessionId: 's-cf-bob', name: 'Bob', role: 'Voter' });
  const carol = await joinAs(browser, { sessionId: 's-cf-carol', name: 'Carol', role: 'Voter' });
  try {
    // A member cannot take the role themselves.
    await bob.page.click('#edit-role-button');
    await expect(bob.page.locator('#edit-role-select option[value="Facilitator"]')).toBeHidden();
    await bob.page.click('#cancel-edit-role-button');

    await row(alice.page, 'Bob').locator('.participant-role-select').selectOption('Facilitator');
    await expect(bob.page.locator('#user-greeting')).toHaveText('Hello, Bob (Facilitator)');
    await expect(alice.page.locator('#user-greeting')).toHaveText('Hello, Alice (Facilitator)');
    await expect(bob.page.locator('#facilitator-controls')).toBeVisible();
    await expect(carol.page.locator('.participant-role.is-facilitator')).toHaveCount(2);

    // With two facilitators, the role is no longer offered to anyone else.
    await expect(roleOptions(alice.page, 'Carol')).toHaveText(['Voter', 'Observer']);

    await alice.page.click('#logout-button');
    await expect(row(bob.page, 'Alice')).toHaveCount(0);
    await expect(bob.page.locator('#user-greeting')).toHaveText('Hello, Bob (Facilitator)');

    await carol.page.locator('button.vote-card[data-value="5"]').click();
    await bob.page.click('#show-votes-button');
    await expect(carol.page.locator('#average-vote')).toHaveText('5.0');
  } finally {
    await Promise.all([alice, bob, carol].map(({ context }) => context.close()));
  }
});

test('a refused role change shows the error by the list and resets the select', async ({ browser }) => {
  seedSession({ id: 's-cf-rf-alice', userId: 'u-cf-rf-alice' });
  seedSession({ id: 's-cf-rf-bob', userId: 'u-cf-rf-bob' });
  seedSession({ id: 's-cf-rf-carol', userId: 'u-cf-rf-carol' });

  const alice = await joinAs(browser, { sessionId: 's-cf-rf-alice', name: 'Alice', role: 'Facilitator' });
  const bob = await joinAs(browser, { sessionId: 's-cf-rf-bob', name: 'Bob', role: 'Voter' });
  const carol = await joinAs(browser, { sessionId: 's-cf-rf-carol', name: 'Carol', role: 'Voter' });
  try {
    await row(alice.page, 'Bob').locator('.participant-role-select').selectOption('Facilitator');
    await expect(bob.page.locator('#user-greeting')).toHaveText('Hello, Bob (Facilitator)');
    await expect(roleOptions(alice.page, 'Carol')).toHaveText(['Voter', 'Observer']);

    // A stale page still offers the role the server now refuses.
    const carolSelect = row(alice.page, 'Carol').locator('.participant-role-select');
    await carolSelect.evaluate((select) => {
      select.insertAdjacentHTML('beforeend', '<option value="Facilitator">Facilitator</option>');
    });
    await carolSelect.selectOption('Facilitator');

    await expect(alice.page.locator('#role-error')).toHaveText('A room can have at most two facilitators.');
    await expect(alice.page.locator('#vote-error')).toBeHidden();
    await expect(row(alice.page, 'Carol').locator('.participant-role-select')).toHaveValue('Voter');
  } finally {
    await Promise.all([alice, bob, carol].map(({ context }) => context.close()));
  }
});
