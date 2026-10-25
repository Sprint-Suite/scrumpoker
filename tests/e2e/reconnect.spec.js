const { test, expect } = require('@playwright/test');
const { seedSession } = require('./helpers/seed');
const { injectSession } = require('./helpers/_auth');

test('a rate-limit close tells the member why and reconnects on its own', async ({ page, context }) => {
  seedSession();
  await injectSession(context);

  let connections = 0;
  let firstSocket;
  await page.routeWebSocket(/\/ws$/, (ws) => {
    connections += 1;
    if (connections === 1) firstSocket = ws;
    ws.connectToServer();
  });

  await page.goto('/');
  await expect(page.locator('#connection-status')).toHaveText('Connected');

  await firstSocket.close({ code: 1008, reason: 'Too many messages' });
  await expect(page.locator('#login-error')).toContainText('Too many messages');

  // The first retry waits 4–6s (5s base, ±20% jitter).
  await expect(page.locator('#connection-status')).toHaveText('Connected', { timeout: 10_000 });
  expect(connections).toBe(2);
});
