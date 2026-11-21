const path = require('path');
const express = require('express');
const { makeSecurityHeaders, DEFAULT_CSP } = require('../middleware/securityHeaders');

// WebSocket upgrade needs ws:/wss: in connect-src; extend the shared default.
// Also add font-src and upgrade-insecure-requests for poker's self-hosted fonts.
const POKER_CSP = DEFAULT_CSP
  .replace("connect-src 'self'", "connect-src 'self' wss: ws:")
  + "; font-src 'self' data:; upgrade-insecure-requests";

// makeSecurityHeaders middleware configured for poker (WS CSP + shared 6 headers).
const securityHeadersMiddleware = makeSecurityHeaders({ contentSecurityPolicy: POKER_CSP });

// Additional hardening headers layered on top of the shared set.
const EXTRA_HEADERS = [
  ['Cross-Origin-Opener-Policy', 'same-origin'],
  ['Cross-Origin-Embedder-Policy', 'require-corp'],
  ['Cross-Origin-Resource-Policy', 'same-origin'],
  ['Origin-Agent-Cluster', '?1'],
  ['X-DNS-Prefetch-Control', 'off'],
  ['X-Permitted-Cross-Domain-Policies', 'none'],
];

function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
}

// Apply the full poker security header set directly to a res object (used for
// static file callbacks where there is no next(); the shared middleware is used
// for the request pipeline).
function applySecurityHeaders(res) {
  res.setHeader('Content-Security-Policy', POKER_CSP);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()');
  for (const [name, value] of EXTRA_HEADERS) res.setHeader(name, value);
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
}

function sendStaticFile(res, filePath) {
  applySecurityHeaders(res);
  setNoCacheHeaders(res);
  res.sendFile(filePath, {
    lastModified: false,
    cacheControl: false,
    acceptRanges: false
  });
}

function createHttpApp({ publicDir, auth, getRoomCount, buildInfo = {}, requestLogger, errorHandler }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.set('etag', false);

  // Structured request logging — must be first so every route gets a req.log.
  if (requestLogger) app.use(requestLogger);

  // Security headers — mounted early, before static/body/routes (after trust-proxy).
  app.use(securityHeadersMiddleware);
  app.use((req, res, next) => {
    // Extra hardening headers and no-cache layered after the shared set.
    for (const [name, value] of EXTRA_HEADERS) res.setHeader(name, value);
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    setNoCacheHeaders(res);
    next();
  });

  app.use(express.json({ limit: '8kb' }));

  // Auth hub integration (launch / logout / heartbeat + browser heartbeat asset)
  app.use('/auth-client', auth.staticAssets);
  app.get('/auth/launch', auth.handleLaunch);
  app.get('/auth/logout', auth.handleLogout);
  app.get('/auth/whoami', auth.handleWhoami);
  app.post('/api/heartbeat', auth.handleHeartbeat);

  const requireEntitled = (req, res, next) => {
    if (req.user && req.user.entitled) return next();
    return res.redirect(302, `${auth._ctx.hubBaseUrl}/dashboard`);
  };

  // The licence lives on the Hub; in-app it opens as a popup (js/licence-modal.js).
  app.get(['/license', '/licence', '/license.html'], (_req, res) => {
    res.redirect(301, 'https://sprintsuite.uk/license');
  });

  app.use(
    '/',
    express.static(publicDir, {
      dotfiles: 'ignore', index: false, extensions: ['html'], redirect: false,
      etag: false, lastModified: false, cacheControl: false, acceptRanges: false,
      setHeaders: (res) => { applySecurityHeaders(res); setNoCacheHeaders(res); }
    })
  );

  app.get('/', auth.requireAuth, requireEntitled, (_req, res) => {
    sendStaticFile(res, path.join(publicDir, 'index.html'));
  });

  app.get('/api/me', auth.requireAuth, (req, res) => {
    res.json({ userId: req.user.id, company: req.user.company || null });
  });

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      version: buildInfo.version || 'unknown',
      commit: buildInfo.commit || 'unknown',
      uptime: process.uptime(),
      rooms: getRoomCount()
    });
  });

  // Central error handler — must be last, after all routes.
  if (errorHandler) app.use(errorHandler);

  return app;
}

module.exports = {
  applySecurityHeaders,
  createHttpApp,
  setNoCacheHeaders
};
