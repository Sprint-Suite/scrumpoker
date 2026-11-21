const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

const BODY_LINE = '1. Grant of licence.';

async function joinRoom(page, context, { sessionId, name, role, room = 'licence-room' }) {
  seedSession({ id: sessionId, userId: `u-${sessionId}` });
  await injectSession(context, sessionId);
  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');
  await page.fill('#room-input', room);
  await page.fill('#name-input', name);
  await page.selectOption('#role-select', role);
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
}

function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

const dialog = (page) => page.locator('dialog.licence-modal');
const licenceLink = (page) => page.locator('a[data-licence-modal]');

test('opens over the room and restores focus on Esc', async ({ page, context }) => {
  const errors = watchErrors(page);
  await joinRoom(page, context, { sessionId: 's-lic1', name: 'Alice', role: 'Facilitator' });
  const url = page.url();

  await licenceLink(page).click();
  await expect(dialog(page)).toHaveAttribute('open', '');
  await expect(page.locator('#licence-modal-title')).toBeFocused();
  await expect(dialog(page)).toContainText(BODY_LINE);
  expect(page.url()).toBe(url);

  await page.keyboard.press('Escape');
  await expect(dialog(page)).not.toHaveAttribute('open', '');
  await expect(licenceLink(page)).toBeFocused();
  expect(errors).toEqual([]);
});

test('Close button and a backdrop click both close it', async ({ page, context }) => {
  await joinRoom(page, context, { sessionId: 's-lic2', name: 'Alice', role: 'Facilitator' });

  await licenceLink(page).click();
  await page.locator('.licence-modal__close').click();
  await expect(dialog(page)).not.toHaveAttribute('open', '');

  await licenceLink(page).click();
  await page.mouse.click(5, 5); // outside the dialog box = the backdrop
  await expect(dialog(page)).not.toHaveAttribute('open', '');
});

test('reopening shows the licence text once', async ({ page, context }) => {
  await joinRoom(page, context, { sessionId: 's-lic3', name: 'Alice', role: 'Facilitator' });
  for (let i = 0; i < 2; i += 1) {
    await licenceLink(page).click();
    await expect(page.locator('#licence-modal-title')).toBeFocused();
    await page.keyboard.press('Escape');
  }
  await licenceLink(page).click();
  await expect(page.getByText(BODY_LINE)).toHaveCount(1);
  await expect(page.locator('dialog.licence-modal')).toHaveCount(1);
});

test('a live room survives reading the licence', async ({ page, context, browser }) => {
  await joinRoom(page, context, { sessionId: 's-lic4', name: 'Alice', role: 'Facilitator', room: 'live-licence' });
  const bobCtx = await browser.newContext();
  const bob = await bobCtx.newPage();
  await joinRoom(bob, bobCtx, { sessionId: 's-lic5', name: 'Bob', role: 'Voter', room: 'live-licence' });
  await bob.locator('button.vote-card[data-value="8"]').click();
  await expect(page.locator('#participants-list')).toContainText('Bob');

  await bob.locator('a[data-licence-modal]').click();
  await expect(dialog(bob)).toHaveAttribute('open', '');
  await bob.keyboard.press('Escape');

  await expect(bob.locator('button.vote-card[data-value="8"]')).toHaveClass(/selected/);
  await expect(bob.locator('#connection-status')).toHaveText('Connected');
  await page.click('#show-votes-button');
  await expect(page.locator('#ordered-votes-list')).toContainText('Bob');
  await expect(page.locator('#ordered-votes-list')).toContainText('8');
  await bobCtx.close();
});

test('fits a phone viewport with Close reachable', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await joinRoom(page, context, { sessionId: 's-lic6', name: 'Alice', role: 'Facilitator' });
  await licenceLink(page).click();

  const box = await dialog(page).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.y + box.height).toBeLessThanOrEqual(667);
  await expect(page.locator('.licence-modal__close')).toBeInViewport();
});

test('the privacy link opens in a new tab', async ({ page, context }) => {
  await joinRoom(page, context, { sessionId: 's-lic7', name: 'Alice', role: 'Facilitator' });
  await licenceLink(page).click();
  const privacy = dialog(page).locator('a[href="https://sprintsuite.uk/privacy"]');
  await expect(privacy).toHaveAttribute('target', '_blank');
  await expect(privacy).toHaveAttribute('rel', 'noopener');
});

test('the guest join page opens the licence too', async ({ page }) => {
  await page.goto('/join');
  await licenceLink(page).click();
  await expect(dialog(page)).toContainText(BODY_LINE);
});
