// 1-uur timeout-monitor: outstanding po_out (zonder bb_code) wordt na cfg.outstandingTimeoutMs
// gemarkeerd als 'timeout' en de OA wordt gerefund.
const pool = require('../db');
const cfg = require('../config');
const { now } = require('../lib/time');
const { writeLog } = require('../lib/log');

async function runOnce() {
  const cutoff = new Date(Date.now() - cfg.outstandingTimeoutMs);
  const cutoffSql = cutoff.toISOString().slice(0, 19).replace('T', ' ');

  const [rows] = await pool.query(
    `SELECT * FROM po_out
       WHERE status = 'pending'
         AND bb_code IS NULL
         AND ob_datetime IS NOT NULL
         AND ob_datetime < ?`,
    [cutoffSql]
  );
  if (rows.length === 0) return { timed_out: 0 };

  for (const po of rows) {
    const ts = now();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE po_out SET status=? WHERE po_id=?', ['timeout', po.po_id]);
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.oa_id]);
      await conn.query(
        'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,0,1,?)',
        [po.po_id, po.oa_id, Math.abs(po.po_amount), ts]
      );
      await conn.query('UPDATE transactions SET iscomplete=1 WHERE po_id=? AND amount<0', [po.po_id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      conn.release();
      await writeLog('error', `Timeout-handler fout voor ${po.po_id}: ${err.message}`, po);
      continue;
    }
    conn.release();
    await writeLog('po_timeout', `Geen ACK binnen 1u — refund OA ${po.oa_id}`, po);
  }
  return { timed_out: rows.length };
}

function start() {
  if (!cfg.jobsEnabled) return;
  // Elke 5 min
  setTimeout(runOnce, 60_000);
  setInterval(runOnce, 5 * 60_000).unref();
}

module.exports = { runOnce, start };
