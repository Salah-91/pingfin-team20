const cfg = require('./config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const jobs = require('./jobs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Basic security headers (defensieve laag bovenop Bearer auth) ────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');         // geen MIME-sniffing
  res.setHeader('X-Frame-Options', 'DENY');                   // geen iframe-embedding
  res.setHeader('Referrer-Policy', 'no-referrer');            // geen referer leak
  res.setHeader('X-XSS-Protection', '0');                     // moderne browsers gebruiken CSP
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; "
    + "script-src 'self' 'unsafe-inline'; "                              // inline onclick="..." in HTML (tabs!)
    + "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "  // Google Fonts CSS
    + "font-src 'self' https://fonts.gstatic.com; "                      // Google Fonts files
    + "img-src 'self' data:; "
    + "connect-src 'self' https://stevenop.be https://*.railway.app; "   // self + CB + cross-bank
    + "frame-ancestors 'none';"
  );
  next();
});

// ── Rate-limit op POST endpoints (geen externe lib — eenvoudige in-memory limiter) ──
const postHits = new Map();   // ip → { count, resetAt }
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;        // max 60 POST/min per IP
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = postHits.get(ip);
  if (!entry || now > entry.resetAt) {
    postHits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  entry.count++;
  if (entry.count > RATE_LIMIT) {
    return res.status(429).json({ ok: false, status: 429, code: null, message: 'Te veel requests, probeer later opnieuw', data: null });
  }
  next();
});

// Health (JSON) op een aparte path zodat de GUI op '/' kan staan
app.get('/health', (req, res) => {
  res.json({ ok: true, status: 200, message: `PingFin Bank ${cfg.bic} (${cfg.bankName}) draait`, data: null });
});

// API
app.use('/api', require('./routes/help'));
app.use('/api', require('./routes/info'));
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/banks'));
app.use('/api', require('./routes/po'));
app.use('/api', require('./routes/ack'));
app.use('/api', require('./routes/misc'));
app.use('/api', require('./routes/jobs'));

// GUI (static) — gehost vanuit lokale ./public folder (self-contained per bank)
// Cache-Control 0 zodat Railway/browser nooit oude JS/CSS vasthoudt na deploy
const guiDir = path.resolve(__dirname, './public');
app.use('/', express.static(guiDir, {
  extensions: ['html'],
  index: 'index.html',
  setHeaders: (res, filePath) => {
    if (/\.(js|css|html)$/.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// 404
app.use((req, res) => {
  res.status(404).json({ ok: false, status: 404, code: null, message: 'Endpoint niet gevonden', data: null });
});

app.listen(cfg.port, () => {
  console.log(`[startup] Bank ${cfg.bic} (${cfg.bankName}) — luisterend op ${cfg.port}`);
  console.log(`[startup] DB ${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`);
  console.log(`[startup] CB ${cfg.cb.url}, polling=${cfg.jobsEnabled ? cfg.cb.pollIntervalMs+'ms' : 'OFF'}`);
  jobs.startAll();
});
