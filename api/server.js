require('dotenv').config();
const express = require('express');
const cors = require('cors');

// Verplichte env vars controleren bij startup
const REQUIRED = ['CB_TOKEN', 'DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[STARTUP] Ontbrekende env vars: ${missing.join(', ')}`);
  console.error('[STARTUP] Kopieer .env.example naar .env en vul de waarden in.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api', require('./routes/info'));
app.use('/api', require('./routes/accounts'));
app.use('/api', require('./routes/po'));
app.use('/api', require('./routes/ack'));

app.get('/', (req, res) => {
  res.json({ ok: true, status: 200, message: 'PingFin Bank1 (CEKVBE88) API draait', data: null });
});

app.use((req, res) => {
  res.status(404).json({ ok: false, status: 404, code: null, message: 'Endpoint niet gevonden', data: null });
});

app.listen(PORT, () => console.log(`Bank1 (CEKVBE88) draait op poort ${PORT}`));
