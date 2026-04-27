const express = require('express');
const router = express.Router();
const { getPool, sql } = require('../db');

router.get('/accounts', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT id, balance FROM accounts ORDER BY id');
    res.json({ ok: true, status: 200, code: null, message: null, data: result.recordset });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

router.get('/accounts/:iban', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.VarChar(34), req.params.iban)
      .query('SELECT id, balance FROM accounts WHERE id = @id');
    if (result.recordset.length === 0)
      return res.status(404).json({ ok: false, status: 404, code: 'ERR_OA_UNKNOWN', message: 'Account not found', data: null });
    res.json({ ok: true, status: 200, code: null, message: null, data: result.recordset[0] });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
