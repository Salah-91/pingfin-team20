const express = require('express');
const router = express.Router();
const pool = require('../db');
const { requireBearer } = require('../middleware/auth');
const { processAckIn } = require('../services/ackInService');
const { writeLog } = require('../lib/log');

// GET /ack_in
router.get('/ack_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_in ORDER BY received_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// GET /ack_out
router.get('/ack_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_out ORDER BY sent_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// POST /ack_in — push uit CB (Bearer required)
router.post('/ack_in', requireBearer, async (req, res) => {
  try {
    const body = req.body || {};
    const list = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : [body]);
    const results = [];
    for (const ack of list) results.push(await processAckIn(ack));
    res.json({ ok: true, status: 200, code: null, message: 'ACK(s) verwerkt', data: results });
  } catch (err) {
    await writeLog('error', `ack_in fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
