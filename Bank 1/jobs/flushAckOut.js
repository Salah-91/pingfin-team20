// Retry-job: ack_out rijen met sent_to_cb=0 worden alsnog naar CB gepost.
// Pakt het volledige PO-record uit po_in (CB vereist alle velden, anders silently dropped).
const pool = require('../db');
const cfg = require('../config');
const cb = require('../lib/cbClient');
const { writeLog } = require('../lib/log');

// Bouw ACK uit po_in indien beschikbaar, anders uit logs (snapshot van de inkomende PO)
// als laatste redmiddel. Op die manier wordt een ACK NOOIT silently gedropt.
async function buildAck(row) {
  if (row.po_amount != null) {
    return {
      po_id:       row.po_id,
      po_amount:   row.po_amount,
      po_message:  row.po_message,
      po_datetime: row.po_datetime,
      ob_id:       row.ob_id,
      oa_id:       row.oa_id,
      ob_code:     row.ob_code,
      ob_datetime: row.ob_datetime,
      cb_code:     row.cb_code,
      cb_datetime: row.cb_datetime,
      bb_id:       row.bb_id || cfg.bic,
      ba_id:       row.ba_id,
      bb_code:     row.bb_code,
      bb_datetime: row.bb_datetime,
    };
  }
  // Geen po_in — probeer een log-snapshot (writeLog persisteert de hele PO).
  const [logs] = await pool.query(
    `SELECT po_amount, po_message, po_datetime, ob_id, oa_id, ob_code, ob_datetime,
            cb_code, cb_datetime, bb_id, ba_id
       FROM logs
      WHERE po_id = ? AND po_amount IS NOT NULL
      ORDER BY id DESC LIMIT 1`,
    [row.po_id]
  );
  const src = logs[0] || {};
  return {
    po_id:       row.po_id,
    po_amount:   src.po_amount ?? 0,
    po_message:  src.po_message ?? null,
    po_datetime: src.po_datetime ?? row.bb_datetime,
    ob_id:       src.ob_id ?? null,
    oa_id:       src.oa_id ?? null,
    ob_code:     src.ob_code ?? null,
    ob_datetime: src.ob_datetime ?? null,
    cb_code:     src.cb_code ?? null,
    cb_datetime: src.cb_datetime ?? null,
    bb_id:       src.bb_id || cfg.bic,
    ba_id:       src.ba_id ?? null,
    bb_code:     row.bb_code,
    bb_datetime: row.bb_datetime,
  };
}

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
    const ack = await buildAck(r);
    try {
      const resp = await cb.sendAcks([ack]);
      if (resp.ok) {
        await pool.query('UPDATE ack_out SET sent_to_cb=1 WHERE po_id=?', [r.po_id]);
        pushed++;
      } else {
        failed++;
        await writeLog('cb_error', `[flush] ACK push status ${resp.status} voor ${r.po_id}: ${JSON.stringify(resp.body).slice(0,200)}`);
      }
    } catch (err) {
      failed++;
      await writeLog('cb_error', `[flush] ACK push exception voor ${r.po_id}: ${err.message}`);
    }
  }
  if (pushed > 0 || failed > 0) {
    await writeLog('ack_pushed', `[flush] ${pushed} hervonden ACK(s) gepost, ${failed} gefaald (van ${rows.length})`);
  }
  return { attempted: rows.length, pushed, failed };
}

function start() {
  if (!cfg.jobsEnabled) return;
  setTimeout(runOnce, 5_000);                // eerste run na 5s
  setInterval(runOnce, 10_000).unref();      // elke 10s — snel voor demo
}

module.exports = { runOnce, start };
