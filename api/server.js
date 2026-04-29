const cfg = require('./config');
const express = require('express');
const cors = require('cors');
const path = require('path');
const jobs = require('./jobs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Health
app.get('/', (req, res) => {
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

// GUI (static) — wordt mee gehost zodat één Railway-service volstaat
const guiDir = path.resolve(__dirname, '../gui');
app.use('/', express.static(guiDir, { extensions: ['html'] }));

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
