const express = require('express');
const router = express.Router();
const { getPool } = require('../db');

router.get('/ack_in', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM ack_in ORDER BY cb_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

router.get('/ack_out', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM ack_out ORDER BY bb_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
