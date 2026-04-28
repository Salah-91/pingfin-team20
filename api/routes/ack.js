const express = require('express');
const router = express.Router();
const pool = require('../db');
const C = require('../codes');

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

async function writeLog(po_id, type, message) {
  try {
    await pool.query(
      'INSERT INTO logs (po_id, type, message, created_at) VALUES (?,?,?,?)',
      [po_id || null, type, message, now()]
    );
  } catch {}
}

// GET /api/ack_in — inkomende ACKs (van CB voor onze PO_OUT)
router.get('/ack_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_in ORDER BY received_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// GET /api/ack_out — uitgaande ACKs (van ons naar CB voor PO_IN)
router.get('/ack_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_out ORDER BY sent_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// POST /api/ack_in — ontvang ACK van CB voor onze uitgaande PO (wij = OB)
router.post('/ack_in', async (req, res) => {
  try {
    const body = req.body;
    const ackList = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : [body]);

    for (const ack of ackList) {
      const { po_id, cb_code, cb_datetime, bb_code, bb_datetime } = ack;
      const ts = now();

      if (!po_id) continue;

      // Registreer de ACK
      await pool.query(
        'INSERT INTO ack_in (po_id,cb_code,cb_datetime,bb_code,bb_datetime,received_at) VALUES (?,?,?,?,?,?)',
        [po_id, cb_code || null, cb_datetime || null, bb_code || null, bb_datetime || null, ts]
      );

      // Zoek de bijbehorende PO_OUT
      const [poOut] = await pool.query('SELECT * FROM po_out WHERE po_id = ?', [po_id]);
      if (poOut.length === 0) {
        await writeLog(po_id, 'ack_unknown', `ACK ontvangen voor onbekende PO: ${po_id}`);
        continue;
      }

      const po = poOut[0];

      if (parseInt(bb_code) === C.OK) {
        // Succesvolle ACK — betaling bevestigd (OA al gedebiteerd bij process)
        await pool.query(
          'UPDATE po_out SET bb_code=?, bb_datetime=?, status=? WHERE po_id=?',
          [bb_code, bb_datetime || ts, 'processed', po_id]
        );
        await writeLog(po_id, 'ack_processed', `ACK ontvangen: betaling bevestigd, bb_code=${bb_code}`);
      } else {
        // Negatieve ACK — refund OA
        await pool.query(
          'UPDATE po_out SET bb_code=?, bb_datetime=?, status=? WHERE po_id=?',
          [bb_code, bb_datetime || ts, 'failed', po_id]
        );
        await pool.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.oa_id]);
        await pool.query(
          'INSERT INTO transactions (po_id,from_iban,to_iban,amount,processed_at) VALUES (?,?,?,?,?)',
          [po_id, po.ba_id, po.oa_id, po.po_amount, ts]
        );
        await writeLog(po_id, 'oa_refunded', `ACK negatief (${bb_code}): OA ${po.oa_id} teruggestort €${po.po_amount}`);
      }

      if (cb_code !== null && cb_code !== undefined) {
        await pool.query('UPDATE po_out SET cb_code=?, cb_datetime=? WHERE po_id=?',
          [cb_code, cb_datetime || ts, po_id]);
      }
    }

    res.json({ ok: true, status: 200, code: null, message: 'ACK(s) verwerkt', data: null });
  } catch (err) {
    await writeLog(null, 'error', `ack_in fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
