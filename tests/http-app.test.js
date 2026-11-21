const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');
const { createHttpApp } = require('../lib/httpApp');

function fakeAuth({ entitled = true, company = { id: 'co1', name: 'Acme' } } = {}) {
  return {
    staticAssets: (req, res, next) => next(),
    handleLaunch: (req, res) => res.send('launch'),
    handleLogout: (req, res) => res.send('logout'),
    handleHeartbeat: (req, res) => res.json({ ok: true }),
    handleWhoami: (req, res) => res.json({ authed: false }),
    requireAuth: (req, res, next) => { req.user = { id: 'u1', entitled, company }; next(); },
    _ctx: { hubBaseUrl: 'https://hub' },
  };
}

function build(authOverrides) {
  return createHttpApp({
    publicDir: path.join(__dirname, '..', 'public'),
    auth: fakeAuth(authOverrides),
    getRoomCount: () => 0,
    buildInfo: { version: 't', commit: 'c' },
  });
}

test('/api/me returns the authed user id + company', async () => {
  const res = await request(build({ company: { id: 'co1', name: 'Acme' } })).get('/api/me');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { userId: 'u1', company: { id: 'co1', name: 'Acme' } });
});

test('GET / bounces to the hub dashboard when not entitled', async () => {
  const res = await request(build({ entitled: false })).get('/').redirects(0);
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, 'https://hub/dashboard');
});

test('removed admin route returns 404', async () => {
  const res = await request(build()).get('/api/admin/keys');
  assert.equal(res.status, 404);
});

test('/health returns ok', async () => {
  const res = await request(build()).get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

for (const p of ['/license', '/licence', '/license.html']) {
  test(`${p} permanently redirects to the Hub licence`, async () => {
    const res = await request(build()).get(p).redirects(0);
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, 'https://sprintsuite.uk/license');
  });
}
