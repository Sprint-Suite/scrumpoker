const { test, expect } = require('@playwright/test');
const WebSocket = require('ws');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

const WS_URL = 'ws://127.0.0.1:3066/ws';

// Routes the page's sockets through to the real server, keeping a handle on each.
async function trackSockets(page) {
  const sockets = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    sockets.push({ ws, at: performance.now() });
    ws.connectToServer();
  });
  return sockets;
}

function openMemberSocket() {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, { headers: { cookie: 'poker_session=s-e2e' } });
    ws.once('open', () => resolve(ws));
    ws.once('unexpected-response', () => resolve(null));
  });
}

// Opens sockets from this IP until the server refuses one, whatever is already open.
async function fillSlots(into) {
  for (let i = 0; i < 45; i += 1) {
    const ws = await openMemberSocket();
    if (!ws) return;
    into.push(ws);
  }
  throw new Error('the per-IP cap never refused a socket');
}

test('a rate-limit close tells the member why and reconnects on its own', async ({ page, context }) => {
  seedSession();
  await injectSession(context);
  const sockets = await trackSockets(page);

  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');

  await sockets[0].ws.close({ code: 1008, reason: 'Too many messages' });
  await expect(page.locator('#login-error')).toContainText('Too many messages');

  // The first retry waits 4–6s (5s base, ±20% jitter).
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 10_000 });
  expect(sockets).toHaveLength(2);
});

test('a member refused while the server is busy backs off, then recovers', async ({ page, context }) => {
  test.setTimeout(60_000);
  seedSession();
  await injectSession(context);
  const sockets = await trackSockets(page);

  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');

  // Fill this IP's slots, including the one the page's socket frees.
  const others = [];
  try {
    await fillSlots(others);
    await sockets[0].ws.close({ code: 1001 });
    await expect(page.locator('#login-error')).toContainText('Reconnecting');
    await fillSlots(others);
    await expect(page.locator('#login-error')).toContainText('The server is busy', { timeout: 10_000 });
    expect(page.url()).toContain('127.0.0.1:3066');
  } finally {
    others.forEach((ws) => ws.close());
  }

  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 20_000 });
  expect(sockets).toHaveLength(3);
  const firstGap = sockets[2].at - sockets[1].at;
  expect(firstGap).toBeGreaterThan(7_000); // the second retry waits ~10s, not the base 5s
});

test('a member whose session has gone is sent back through sign-in', async ({ page, context }) => {
  seedSession();
  await injectSession(context);
  const sockets = await trackSockets(page);

  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');

  await context.clearCookies();
  const navigated = page.waitForEvent('framenavigated', { timeout: 15_000 });
  await sockets[0].ws.close({ code: 1001 });
  await expect(page.locator('#login-error')).toContainText('session has ended', { timeout: 10_000 });
  await navigated;
});

test('a guest who drops reconnects, and one who joins after the room closed is told the room may be gone or the server busy', async ({ page, context, browser }) => {
  seedSession();
  await injectSession(context);
  await page.goto('/');
  await page.fill('#room-input', 'rejoin-refused');
  await page.fill('#name-input', 'Alice');
  await page.selectOption('#role-select', 'Facilitator');
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  const token = await page.locator('#poker-room-section').getAttribute('data-share-token');

  const anonCtx = await browser.newContext();
  const anon = await anonCtx.newPage();
  try {
    const guestSockets = await trackSockets(anon);
    await anon.goto(`/join?token=${token}`);
    await anon.fill('#join-name-input', 'Guest');
    await anon.click('#join-button');
    await expect(anon.locator('#poker-room-section')).toBeVisible();

    await guestSockets[0].ws.close({ code: 1001 });
    await expect(anon.locator('#connection-status')).toHaveText('Reconnecting...');
    await expect(anon.locator('#poker-room-section')).toBeVisible();
    await expect(anon.locator('#connection-status')).toHaveText('Connected');

    await page.click('#end-session-button');
    await page.click('#confirm-end-session-button');
    await expect(page.locator('#login-section')).toBeVisible();

    await anon.goto(`/join?token=${token}`);
    await anon.fill('#join-name-input', 'Guest');
    await anon.click('#join-button');
    await expect(anon.locator('#join-error')).toContainText('may have closed, or the server is busy');
  } finally {
    await anonCtx.close();
  }
});

// Tracks a guest page's sockets and the frames it sends to the server.
async function trackGuestSockets(page) {
  const sockets = [];
  await page.routeWebSocket(/\/ws/, (ws) => {
    const sent = [];
    const server = ws.connectToServer();
    ws.onMessage((message) => { sent.push(JSON.parse(message)); server.send(message); });
    sockets.push({ ws, sent });
  });
  return sockets;
}

async function joinGuestPage(browser, token) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sockets = await trackGuestSockets(page);
  await page.goto(`/join?token=${token}`);
  await page.fill('#join-name-input', 'Guest');
  await page.click('#join-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  return { context, page, sockets };
}

async function openMemberRoom(browser, id, room) {
  seedSession({ id, userId: `u-${id}` });
  const context = await browser.newContext();
  await injectSession(context, id);
  const page = await context.newPage();
  await page.goto('/');
  await page.fill('#room-input', room);
  await page.fill('#name-input', 'Alice');
  await page.selectOption('#role-select', 'Facilitator');
  await page.click('#login-button');
  await expect(page.locator('#poker-room-section')).toBeVisible();
  return { context, token: await page.locator('#poker-room-section').getAttribute('data-share-token') };
}

test('an active guest retry that gets a 1008 close stops and explains', async ({ browser }) => {
  const member = await openMemberRoom(browser, 's-rc-1008-retry', 'rc-1008-retry');
  const guest = await joinGuestPage(browser, member.token);
  try {
    await guest.sockets[0].ws.close({ code: 1001 });
    await expect(guest.page.locator('#connection-status')).toHaveText('Reconnecting...');
    await expect.poll(() => guest.sockets.length).toBe(2);
    await guest.sockets[1].ws.close({ code: 1008, reason: 'Too many messages' });
    await expect(guest.page.locator('#join-error')).toContainText('too many messages');
    await guest.page.waitForTimeout(2500);
    expect(guest.sockets).toHaveLength(2);
  } finally {
    await Promise.all([member.context.close(), guest.context.close()]);
  }
});

test('a manual Join after a 1008 close still sends the rejoin key', async ({ browser }) => {
  const member = await openMemberRoom(browser, 's-rc-key-kept', 'rc-key-kept');
  const guest = await joinGuestPage(browser, member.token);
  try {
    await expect.poll(() => guest.page.evaluate(() => sessionStorage.getItem('scrumPokerGuest'))).toContain('rejoinKey');
    const { rejoinKey } = JSON.parse(await guest.page.evaluate(() => sessionStorage.getItem('scrumPokerGuest')));
    expect(guest.sockets[0].sent[0].payload.rejoinKey).toBeUndefined();

    await guest.sockets[0].ws.close({ code: 1008, reason: 'Too many messages' });
    await expect(guest.page.locator('#join-error')).toContainText('too many messages');
    await guest.page.click('#join-button');
    await expect(guest.page.locator('#poker-room-section')).toBeVisible();
    expect(guest.sockets[1].sent[0].payload.rejoinKey).toBe(rejoinKey);
  } finally {
    await Promise.all([member.context.close(), guest.context.close()]);
  }
});

test('a 4000 close without the replaced message is terminal and does not reconnect', async ({ browser }) => {
  const member = await openMemberRoom(browser, 's-rc-4000', 'rc-4000');
  const guest = await joinGuestPage(browser, member.token);
  try {
    await guest.sockets[0].ws.close({ code: 4000, reason: 'replaced' });
    await expect(guest.page.locator('#join-error')).toHaveText('This session continued in another tab or window.');
    await guest.page.waitForTimeout(2500);
    expect(guest.sockets).toHaveLength(1);
  } finally {
    await Promise.all([member.context.close(), guest.context.close()]);
  }
});
