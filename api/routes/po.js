const express = require('express');
const router = express.Router();
const pool = require('../db');
const fetch = require('node-fetch');

const BIC = 'CEKVBE88';
const CB_URL = 'https://stevenop.be/pingfin/api/v2';

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function generatePoId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${BIC}_${rand}`;
}

// GET /api/po_new/generate
router.get('/po_new/generate', async (req, res) => {
  try {
    const [accounts] = await pool.query('SELECT id FROM accounts');
    const ibans = accounts.map(a => a.id);
    let banks = ['GKCCBEBB', 'BBRUBEBB', 'AXABBE22'];
    try {
      const token = process.env.CB_TOKEN || '';
      const resp = await fetch(`${CB_URL}/banks`, { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await resp.json();
      const fetched = (data.data || []).map(b => b.bic || b.id).filter(b => b && b !== BIC);
      if (fetched.length > 0) banks = fetched;
    } catch {}

    const count = parseInt(req.query.count) || 5;
    const messages = ['Huurkosten april', 'Factuur 2026-001', 'Aankoop materiaal', 'Terugbetaling', 'Projectbijdrage'];
    const pos = [];
    for (let i = 0; i < count; i++) {
      const oa = ibans[Math.floor(Math.random() * ibans.length)];
      const bb = banks[Math.floor(Math.random() * banks.length)];
      const ba = `BE${Math.floor(Math.random() * 90 + 10)}${Math.floor(Math.random() * 9e14 + 1e14)}`;
      const amount = Math.round((Math.random() * 499 + 1) * 100) / 100;
      pos.push({
        po_id: generatePoId(), po_amount: amount,
        po_message: messages[i % messages.length],
        po_datetime: now(), ob_id: BIC, oa_id: oa,
        ob_code: null, ob_datetime: null,
        cb_code: null, cb_datetime: null,
        bb_id: bb, ba_id: ba,
        bb_code: null, bb_datetime: null,
      });
    }
    res.json({ ok: true, status: 200, code: null, message: `Generated ${count} POs`, data: pos });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// POST /api/po_new/add
router.post('/po_new/add', async (req, res) => {
  try {
    const pos = req.body.data;
    if (!Array.isArray(pos) || pos.length === 0)
      return res.status(400).json({ ok: false, status: 400, code: null, message: 'data must be non-empty array', data: null });
    for (const po of pos) {
      await pool.query(
        'INSERT INTO po_new (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || now(), po.ob_id || BIC, po.oa_id, po.bb_id, po.ba_id]
      );
    }
    res.json({ ok: true, status: 200, code: null, message: `Added ${pos.length} POs to PO_NEW`, data: null });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// GET /api/po_new/process
router.get('/po_new/process', async (req, res) => {
  try {
    const [pos] = await pool.query('SELECT * FROM po_new');
    if (pos.length === 0)
      return res.json({ ok: true, status: 200, code: null, message: 'No POs to process', data: null });

    const results = [];
    for (const po of pos) {
      let obCode = null;
      const isInternal = po.bb_id === BIC;

      if (po.po_amount <= 0) obCode = 'ERR_AMOUNT_NEGATIVE';
      else if (po.po_amount > 500) obCode = 'ERR_AMOUNT_EXCEEDED';
      else {
        const [oa] = await pool.query('SELECT id, balance FROM accounts WHERE id = ?', [po.oa_id]);
        if (oa.length === 0) obCode = 'ERR_OA_UNKNOWN';
        else if (parseFloat(oa[0].balance) < parseFloat(po.po_amount)) obCode = 'ERR_BALANCE_INSUFFICIENT';
        else obCode = 'OK';
      }

      if (obCode !== 'OK') {
        await pool.query('INSERT INTO log (datetime,message,type,po_id) VALUES (?,?,?,?)',
          [new Date(), `OB validation failed: ${obCode}`, 'po_rejected', po.po_id]);
        await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
        results.push({ po_id: po.po_id, status: 'REJECTED', code: obCode });
        continue;
      }

      if (isInternal) {
        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
          await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.oa_id]);
          await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.ba_id]);
          await conn.query(
            'INSERT INTO transactions (po_id,amount,oa_id,ba_id,datetime,isvalid,iscomplete) VALUES (?,?,?,?,?,1,1)',
            [po.po_id, po.po_amount, po.oa_id, po.ba_id, new Date()]
          );
          await conn.commit();
          results.push({ po_id: po.po_id, status: 'COMPLETED', code: 'OK', type: 'internal' });
        } catch (e) {
          await conn.rollback();
          results.push({ po_id: po.po_id, status: 'FAILED', code: 'ERR_TX_FAILED' });
        } finally { conn.release(); }
        await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
        continue;
      }

      // External — move to PO_OUT
      await pool.query(
        'INSERT INTO po_out (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,ob_code,ob_datetime,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message, po.po_datetime, po.ob_id, po.oa_id, 'OK', new Date(), po.bb_id, po.ba_id]
      );
      await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      results.push({ po_id: po.po_id, status: 'PENDING', code: 'OK', type: 'external - moved to PO_OUT' });
    }
    res.json({ ok: true, status: 200, code: null, message: `Processed ${pos.length} POs`, data: results });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// GET /api/po_out
router.get('/po_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_out ORDER BY ob_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// GET /api/po_in
router.get('/po_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_in ORDER BY po_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
