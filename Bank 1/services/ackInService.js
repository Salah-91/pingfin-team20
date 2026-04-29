// OB-zijde: verwerk een ACK (van CB-push of CB-poll).
const pool = require('../db');
const C = require('../codes');
const { now } = require('../lib/time');
const { writeLog } = require('../lib/log');

async function processAckIn(ack) {
  const { po_id, cb_code, cb_datetime, bb_code, bb_datetime } = ack || {};
  const ts = now();
  if (!po_id) return { skipped: true, reason: 'no_po_id' };

  // ack_in is uniek op po_id — eerste write wint, latere worden ge-ignored
  try {
    await pool.query(
      `INSERT INTO ack_in (po_id,cb_code,cb_datetime,bb_code,bb_datetime,received_at)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         cb_code=VALUES(cb_code), cb_datetime=VALUES(cb_datetime),
         bb_code=VALUES(bb_code), bb_datetime=VALUES(bb_datetime),
         received_at=VALUES(received_at)`,
      [po_id, cb_code ?? null, cb_datetime || null, bb_code ?? null, bb_datetime || null, ts]
    );
  } catch (err) {
    await writeLog('error', `ack_in insert fout: ${err.message}`, { po_id, cb_code, bb_code, cb_datetime, bb_datetime });
    return { po_id, ok: false, error: err.message };
  }

  const [poOut] = await pool.query('SELECT * FROM po_out WHERE po_id = ?', [po_id]);
  if (poOut.length === 0) {
    await writeLog('ack_unknown', `ACK voor onbekende PO: ${po_id}`, { po_id, cb_code, bb_code });
    return { po_id, ok: true, status: 'unknown_po' };
  }

  const po = poOut[0];

  // Bepaal nieuwe status: bb_code OK = processed, anders failed
  if (parseInt(bb_code, 10) === C.OK) {
    await pool.query(
      'UPDATE po_out SET cb_code=?, cb_datetime=?, bb_code=?, bb_datetime=?, status=? WHERE po_id=?',
      [cb_code ?? po.cb_code, cb_datetime || po.cb_datetime, bb_code, bb_datetime || ts, 'processed', po_id]
    );
    // markeer transactions iscomplete
    await pool.query('UPDATE transactions SET iscomplete=1 WHERE po_id=?', [po_id]);
    await writeLog('ack_processed', `Betaling bevestigd, bb_code=${bb_code}`, { po_id, cb_code, bb_code });
  } else {
    // Negatieve ACK: refund OA + nieuwe (positieve) TX-rij + markeer oude als invalid+complete
    await pool.query(
      'UPDATE po_out SET cb_code=?, cb_datetime=?, bb_code=?, bb_datetime=?, status=? WHERE po_id=?',
      [cb_code ?? po.cb_code, cb_datetime || po.cb_datetime, bb_code ?? po.bb_code, bb_datetime || ts, 'failed', po_id]
    );
    await pool.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.oa_id]);
    await pool.query(
      'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,?,1,?)',
      [po_id, po.oa_id, Math.abs(po.po_amount), 0, ts]   // refund-rij: invalid (= rollback)
    );
    await pool.query('UPDATE transactions SET iscomplete=1 WHERE po_id=? AND account_id=? AND amount<0', [po_id, po.oa_id]);
    await writeLog('oa_refunded', `Negatieve ACK (${bb_code}): refund OA ${po.oa_id} +€${po.po_amount}`, { po_id, cb_code, bb_code });
  }

  return { po_id, ok: true };
}

module.exports = { processAckIn };
