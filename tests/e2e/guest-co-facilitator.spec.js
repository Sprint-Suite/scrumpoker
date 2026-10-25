const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

async function openRoomAsMember(browser, sessionId, roomName) {
  const context = await browser.newContext();
  await injectSession(context, sessionId);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#login-button')).toBeEnabled();
  await page.fill('#room-input', roomName);
  await page.fill('#name-input', 'Alice');
  await page.selectOption('#role-select', 'Facilitator');
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  const token = await page.locator('#poker-room-section').getAttribute('data-share-token');
  return { context, page, token };
}

async function joinAsGuest(browser, token) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/join?token=${token}`);
  await page.fill('#join-name-input', 'Guest');
  await page.click('#join-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  return { context, page };
}

const guestRoleSelect = (member) =>
  member.page.locator('.participant-row').filter({ hasText: 'Guest' }).locator('.participant-role-select');

test('a guest granted Facilitator runs the room after the facilitator leaves', async ({ browser }) => {
  seedSession({ id: 's-gcf-alice', userId: 'u-gcf-alice' });
  const member = await openRoomAsMember(browser, 's-gcf-alice', 'guest-cf-room');
  const guest = await joinAsGuest(browser, member.token);
  try {
    await guest.page.locator('button.vote-card[data-value="5"]').click();
    await expect(guest.page.locator('#show-votes-button')).toBeHidden();

    await guestRoleSelect(member).selectOption('Facilitator');
    await expect(guest.page.locator('#show-votes-button')).toBeVisible();

    await member.context.close();

    await guest.page.click('#show-votes-button');
    await expect(guest.page.locator('#average-vote')).toHaveText('5.0');
    await guest.page.click('#start-next-round-button');
    await expect(guest.page.locator('#round-status')).toHaveText('Open');

    await guest.page.click('#invite-menu-button');
    await expect(guest.page.locator('#copy-invite-link-button')).toBeVisible();
  } finally {
    await guest.context.close();
    await member.context.close().catch(() => {});
  }
});

test('a guest facilitator is demoted and loses the controls', async ({ browser }) => {
  seedSession({ id: 's-gcf-demote', userId: 'u-gcf-demote' });
  const member = await openRoomAsMember(browser, 's-gcf-demote', 'guest-cf-demote');
  const guest = await joinAsGuest(browser, member.token);
  try {
    await guestRoleSelect(member).selectOption('Facilitator');
    await expect(guest.page.locator('#facilitator-controls')).toBeVisible();
    await expect(guest.page.locator('#end-session-button')).toBeVisible();

    await guestRoleSelect(member).selectOption('Voter');
    await expect(guest.page.locator('#facilitator-controls')).toBeHidden();
    await expect(guest.page.locator('#end-session-button')).toBeHidden();
    await expect(guest.page.locator('#invite-menu-button')).toBeHidden();
  } finally {
    await Promise.all([member.context.close(), guest.context.close()]);
  }
});
