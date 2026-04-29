const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/transactions', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM transactions ORDER BY datetime DESC LIMIT 500'
    );
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
    const type = req.query.type;
    const args = [];
    let sql = 'SELECT * FROM logs';
    if (type) { sql += ' WHERE type = ?'; args.push(type); }
    sql += ' ORDER BY datetime DESC LIMIT ?';
    args.push(limit);
    const [rows] = await pool.query(sql, args);
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
