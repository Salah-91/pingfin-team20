const express = require('express');
const router = express.Router();
const pool = require('../db');
const cfg = require('../config');
const C = require('../codes');
const cb = require('../lib/cbClient');
const { now } = require('../lib/time');
const { writeLog } = require('../lib/log');
const { validBic, validIban, amountErrorCode } = require('../lib/validate');
const { requireBearer } = require('../middleware/auth');
const { processPoIn } = require('../services/poInService');
const { processPoNew } = require('../services/poProcessor');

const BIC = cfg.bic;

// ─── PO_NEW reads ────────────────────────────────────────────────────────────

router.get('/po_new', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_new ORDER BY created_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_new/generate ───────────────────────────────────────────────────

router.get('/po_new/generate', async (req, res) => {
  try {
    const [accounts] = await pool.query('SELECT id FROM accounts');
    if (accounts.length === 0)
      return res.status(500).json({ ok: false, status: 500, code: null, message: 'Geen accounts in DB', data: null });

    const ibans = accounts.map(a => a.id);
    let banks = [];
    try {
      const r = await cb.banks();
      banks = (r.body?.data || r.body || [])
        .map(b => b.bic || b.id)
        .filter(b => b && b !== BIC);
    } catch {}
    if (banks.length === 0) banks = ['GKCCBEBB', 'BBRUBEBB', 'AXABBE22'];

    const count = Math.min(parseInt(req.query.count, 10) || 5, 50);
    const messages = ['Huurkosten april', 'Factuur 2026-001', 'Aankoop materiaal', 'Terugbetaling', 'Projectbijdrage'];
    const pos = [];

    for (let i = 0; i < count; i++) {
      const oa = ibans[Math.floor(Math.random() * ibans.length)];
      const bb = banks[Math.floor(Math.random() * banks.length)];
      // Geldige BE-IBAN: BE + 2 cijfers + 12 cijfers = 16 chars (manual-conform)
      const ba = `BE${Math.floor(Math.random() * 90 + 10)}${String(Math.floor(Math.random() * 1e12)).padStart(12, '0')}`;
      const amount = Math.round((Math.random() * 499 + 1) * 100) / 100;
      pos.push({
        po_id: `${BIC}_${Math.random().toString(36).slice(2, 10)}`,
        po_amount: amount,
        po_message: messages[i % messages.length],
        po_datetime: now(),
        ob_id: BIC, oa_id: oa,
        ob_code: null, ob_datetime: null,
        cb_code: null, cb_datetime: null,
        bb_id: bb,    ba_id: ba,
        bb_code: null, bb_datetime: null,
      });
    }

    await writeLog('po_generated', `${count} PO's gegenereerd`);
    res.json({ ok: true, status: 200, code: null, message: `Generated ${count} POs`, data: pos });
  } catch (err) {
    await writeLog('error', `po_new/generate fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_new/add ───────────────────────────────────────────────────────

router.post('/po_new/add', async (req, res) => {
  try {
    const pos = Array.isArray(req.body?.data) ? req.body.data : (Array.isArray(req.body) ? req.body : []);
    if (pos.length === 0)
      return res.status(400).json({ ok: false, status: 400, code: null, message: 'data moet een niet-lege array zijn', data: null });

    let added = 0;
    for (const po of pos) {
      try {
        await pool.query(
          'INSERT INTO po_new (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?)',
          [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || now(),
           po.ob_id || BIC, po.oa_id, po.bb_id, po.ba_id]
        );
        added++;
      } catch (e) {
        if (e.code !== 'ER_DUP_ENTRY') throw e;
      }
    }
    await writeLog('po_added', `${added}/${pos.length} PO's toegevoegd aan po_new`);
    res.json({ ok: true, status: 200, code: null, message: `${added} PO's toegevoegd`, data: null });
  } catch (err) {
    await writeLog('error', `po_new/add fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_new/manual ────────────────────────────────────────────────────

router.post('/po_new/manual', async (req, res) => {
  try {
    const { po_amount, po_message, oa_id, ob_id, ba_id, bb_id } = req.body || {};

    if (!oa_id || !validIban(oa_id))
      return res.status(400).json({ ok: false, status: 400, code: C.ACCOUNT_UNKNOWN, message: 'Ongeldig oa_id (IBAN)', data: null });
    if (!ba_id || !validIban(ba_id))
      return res.status(400).json({ ok: false, status: 400, code: C.ACCOUNT_UNKNOWN, message: 'Ongeldig ba_id (IBAN)', data: null });
    if (!bb_id || !validBic(bb_id))
      return res.status(400).json({ ok: false, status: 400, code: C.BB_UNKNOWN, message: 'Ongeldig bb_id (BIC)', data: null });
    const amErr = amountErrorCode(po_amount);
    if (amErr) return res.status(400).json({ ok: false, status: 400, code: amErr, message: 'Ongeldig bedrag', data: null });

    const po_id = `${BIC}_${Math.random().toString(36).slice(2, 10)}`;
    const ts = now();
    await pool.query(
      'INSERT INTO po_new (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?)',
      [po_id, po_amount, po_message || null, ts, ob_id || BIC, oa_id, bb_id, ba_id]
    );
    await writeLog('po_manual', `Manuele PO ${po_id}`, { po_id, po_amount, po_message, po_datetime: ts, ob_id: ob_id || BIC, oa_id, bb_id, ba_id });
    res.json({ ok: true, status: 200, code: null, message: 'Manuele PO toegevoegd', data: { po_id } });
  } catch (err) {
    await writeLog('error', `po_new/manual fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_new/process ────────────────────────────────────────────────────

router.get('/po_new/process', async (req, res) => {
  try {
    const result = await processPoNew();
    res.json({ ok: true, status: 200, code: null,
      processed: result.processed, skipped: result.skipped,
      message: `${result.processed} PO(s) verwerkt, ${result.skipped} overgeslagen`,
      data: result.results });
  } catch (err) {
    await writeLog('error', `po_new/process fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── PO_OUT / PO_IN reads ───────────────────────────────────────────────────

router.get('/po_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_out ORDER BY ob_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

router.get('/po_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_in ORDER BY po_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_in — push uit CB (Bearer required) ────────────────────────────

router.post('/po_in', requireBearer, async (req, res) => {
  const raw = req.body || {};
  const poList = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : [raw]);
  const results = [];
  for (const po of poList) results.push(await processPoIn(po));
  res.json({ ok: true, status: 200, code: null, message: null, data: results });
});

module.exports = router;
