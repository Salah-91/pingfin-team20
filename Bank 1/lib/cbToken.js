// CB-token manager: haalt token op via POST /token (BIC + secret_key) en ververst elke ~3.5h.
// Wordt door cbClient gebruikt om elke uitgaande call van een vers token te voorzien.

const fetch = require('node-fetch');
const cfg = require('../config');
const { writeLog } = require('./log');

let currentToken = cfg.cb.initialToken || null;
let fetchedAt = currentToken ? Date.now() : 0;
const TTL_MS = 3.5 * 60 * 60 * 1000;  // 3.5h (token leeft 4h, vervang vroeger)

async function refresh() {
  if (!cfg.cb.secret) {
    if (!currentToken) {
      console.warn('[cb] Geen CB_SECRET en geen CB_TOKEN; CB-calls zullen 401 geven.');
    }
    return currentToken;
  }
  try {
    const resp = await fetch(`${cfg.cb.url}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bic: cfg.bic, secret_key: cfg.cb.secret }),
    });
    const data = await resp.json().catch(() => ({}));
    const token = data.token || data.data?.token || data.access_token;
    if (!token) {
      const msg = `CB-token ophalen mislukte: ${resp.status} ${JSON.stringify(data).slice(0, 200)}`;
      console.error('[cb]', msg);
      await writeLog('cb_token_error', msg);
      return currentToken;
    }
    currentToken = token;
    fetchedAt = Date.now();
    await writeLog('cb_token', `Nieuw CB-token opgehaald (geldig ~4h)`);
    console.log('[cb] CB-token opgehaald');
  } catch (err) {
    console.error('[cb] token fetch fout:', err.message);
    await writeLog('cb_token_error', `Token fetch fout: ${err.message}`);
  }
  return currentToken;
}

async function getToken() {
  if (!currentToken || Date.now() - fetchedAt > TTL_MS) {
    await refresh();
  }
  return currentToken;
}

function start() {
  // Eerste fetch bij startup, dan elke 3.5h
  refresh();
  setInterval(refresh, TTL_MS).unref();
}

module.exports = { getToken, refresh, start };
