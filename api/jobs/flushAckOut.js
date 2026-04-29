// Retry-job: ack_out rijen met sent_to_cb=0 worden alsnog naar CB gepost.
// Pakt het volledige PO-record uit po_in (CB vereist alle velden, anders silently dropped).
const pool = require('../db');
const cfg = require('../config');
const cb = require('../lib/cbClient');
const { writeLog } = require('../lib/log');

async function runOnce(limit = 100) {
  const [rows] = await pool.query(
    `SELECT a.po_id, a.bb_code, a.bb_datetime,
            p.po_amount, p.po_message, p.po_datetime,
            p.ob_id, p.oa_id, p.ob_code, p.ob_datetime,
            p.cb_code, p.cb_datetime,
            p.bb_id, p.ba_id
       FROM ack_out a
       LEFT JOIN po_in p ON p.po_id = a.po_id
      WHERE a.sent_to_cb = 0
      ORDER BY a.sent_at DESC
      LIMIT ?`,
    [limit]
  );
  if (rows.length === 0) return { attempted: 0, pushed: 0, failed: 0 };

  let pushed = 0, failed = 0;
  for (const r of rows) {
    if (!r.po_amount) {                  // ack_out zonder bijhorende po_in (corrupt) — skip
      failed++;
      continue;
    }
    const ack = {
      po_id:       r.po_id,
      po_amount:   r.po_amount,
      po_message:  r.po_message,
      po_datetime: r.po_datetime,
      ob_id:       r.ob_id,
      oa_id:       r.oa_id,
      ob_code:     r.ob_code,
      ob_datetime: r.ob_datetime,
      cb_code:     r.cb_code,
      cb_datetime: r.cb_datetime,
      bb_id:       r.bb_id || cfg.bic,
      ba_id:       r.ba_id,
      bb_code:     r.bb_code,
      bb_datetime: r.bb_datetime,
    };
    try {
      const resp = await cb.sendAcks([ack]);
      if (resp.ok) {
        await pool.query('UPDATE ack_out SET sent_to_cb=1 WHERE po_id=?', [r.po_id]);
        pushed++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
    }
  }
  if (pushed > 0 || failed > 0) {
    await writeLog('ack_pushed', `[flush] ${pushed} hervonden ACK(s) gepost, ${failed} gefaald (van ${rows.length})`);
  }
  return { attempted: rows.length, pushed, failed };
}

function start() {
  if (!cfg.jobsEnabled) return;
  setTimeout(runOnce, 15_000);
  setInterval(runOnce, 60_000).unref();      // elke minuut
}

module.exports = { runOnce, start };
