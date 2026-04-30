// Centraal config-object — leest env vars en exporteert één bron van waarheid
require('dotenv').config();

const REQUIRED = ['BIC', 'BANK_NAME', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME', 'INCOMING_TOKEN'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[STARTUP] Ontbrekende env vars: ${missing.join(', ')}`);
  console.error('[STARTUP] Kopieer .env.example naar .env en vul de waarden in.');
  process.exit(1);
}

module.exports = {
  bic:        process.env.BIC,
  bankName:   process.env.BANK_NAME,
  port:       parseInt(process.env.PORT, 10) || 3000,

  db: {
    host:     process.env.DB_HOST,
    port:     parseInt(process.env.DB_PORT, 10) || 3306,
    user:     process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
  },

  cb: {
    url:        (process.env.CB_URL || 'https://stevenop.be/pingfin/api/v2').replace(/\/$/, ''),
    secret:     process.env.CB_SECRET || '',          // wordt gebruikt om token op te halen
    initialToken: process.env.CB_TOKEN || '',         // optioneel: vooraf gekend token
    pollIntervalMs: parseInt(process.env.CB_POLL_MS, 10) || 5_000,    // Default 5s — snel voor demo, set CB_POLL_MS=30000 voor productie
  },

  // Bearer-token dat ANDERE banken/CB moeten meesturen om POST /po_in en POST /ack_in te gebruiken
  incomingToken: process.env.INCOMING_TOKEN,

  // Disable polling/timeouts via env (handig voor unit tests of dev)
  jobsEnabled: (process.env.JOBS_ENABLED ?? 'true').toLowerCase() === 'true',

  // Outstanding-PO timeout (default 1h per manual)
  outstandingTimeoutMs: parseInt(process.env.OUTSTANDING_TIMEOUT_MS, 10) || 60 * 60 * 1000,

  members: (() => {
    try { return JSON.parse(process.env.TEAM_MEMBERS || '[]'); }
    catch { return []; }
  })(),
};
