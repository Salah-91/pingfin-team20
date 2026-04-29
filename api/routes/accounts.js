const express = require('express');
const router = express.Router();
const pool = require('../db');
const C = require('../codes');

router.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_name, balance FROM accounts ORDER BY id');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

router.get('/accounts/:iban', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, owner_name, balance FROM accounts WHERE id = ?', [req.params.iban]
    );
    if (rows.length === 0)
      return res.status(404).json({ ok: false, status: 404, code: C.ACCOUNT_UNKNOWN, message: 'Account not found', data: null });
    res.json({ ok: true, status: 200, code: null, message: null, data: rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
