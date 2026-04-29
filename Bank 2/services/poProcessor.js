// OB-zijde: verwerk PO_NEW → intern of extern (PO_OUT + POST CB.po_in).
const pool = require('../db');
const cfg = require('../config');
const C = require('../codes');
const cb = require('../lib/cbClient');
const { now } = require('../lib/time');
const { writeLog } = require('../lib/log');
const { validBic, validIban, validPoIdFormat, amountErrorCode } = require('../lib/validate');

const BIC = cfg.bic;

async function alreadyProcessed(po_id) {
  const [a] = await pool.query('SELECT po_id FROM po_out WHERE po_id = ? LIMIT 1', [po_id]);
  if (a.length) return true;
  const [b] = await pool.query('SELECT po_id FROM transactions WHERE po_id = ? LIMIT 1', [po_id]);
  return b.length > 0;
}

async function processOne(po) {
  const ts = now();
  const snapshot = { ...po };

  // Idempotency
  if (await alreadyProcessed(po.po_id)) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_duplicate', 'PO al verwerkt — overgeslagen', snapshot);
    return { po_id: po.po_id, status: 'SKIPPED', reason: 'already_processed', code: C.OK, skipped: true };
  }

  // Format checks
  if (!validPoIdFormat(po.po_id, po.ob_id || BIC)) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_rejected', `Ongeldig po_id formaat: ${po.po_id}`, snapshot);
    return { po_id: po.po_id, status: 'REJECTED', code: C.OB_MISMATCH };
  }
  if (!validBic(po.bb_id) || !validIban(po.oa_id) || !validIban(po.ba_id)) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_rejected', `Ongeldige BIC/IBAN`, snapshot);
    return { po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN };
  }

  // Bedrag
  const amErr = amountErrorCode(po.po_amount);
  if (amErr) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_rejected', `Bedrag ongeldig: ${po.po_amount}`, snapshot);
    return { po_id: po.po_id, status: 'REJECTED', code: amErr };
  }

  // OA bestaat & saldo
  const [oa] = await pool.query('SELECT id, balance FROM accounts WHERE id = ?', [po.oa_id]);
  if (oa.length === 0) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_rejected', `OA onbekend: ${po.oa_id}`, snapshot);
    return { po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN };
  }
  if (parseFloat(oa[0].balance) < parseFloat(po.po_amount)) {
    await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
    await writeLog('po_rejected', `Onvoldoende saldo OA ${po.oa_id}`, snapshot);
    return { po_id: po.po_id, status: 'REJECTED', code: C.INSUFFICIENT_BALANCE };
  }

  const isInternal = po.bb_id === BIC;

  // ── Interne betaling: atomisch ──────────────────────────────────────────
  if (isInternal) {
    if (po.oa_id === po.ba_id) {
      await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      await writeLog('po_rejected', 'OA == BA', snapshot);
      return { po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN, message: 'OA en BA mogen niet gelijk zijn' };
    }
    const [ba] = await pool.query('SELECT id FROM accounts WHERE id = ?', [po.ba_id]);
    if (ba.length === 0) {
      await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      await writeLog('po_rejected', `BA onbekend (intern): ${po.ba_id}`, snapshot);
      return { po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN };
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.oa_id]);
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.ba_id]);
      await conn.query(
        'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,1,1,?), (?,?,?,1,1,?)',
        [po.po_id, po.oa_id, -Math.abs(po.po_amount), now(),
         po.po_id, po.ba_id,  Math.abs(po.po_amount), now()]
      );
      await conn.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      conn.release();
      await writeLog('error', `Interne TX mislukt: ${e.message}`, snapshot);
      return { po_id: po.po_id, status: 'FAILED', code: C.INTERNAL_TX };
    }
    conn.release();
    await writeLog('po_internal', `Intern: ${po.oa_id} → ${po.ba_id} €${po.po_amount}`, snapshot);
    return { po_id: po.po_id, status: 'COMPLETED', code: C.OK, type: 'internal' };
  }

  // ── Externe betaling: po_out + debit OA + send to CB ────────────────────
  try {
    await pool.query(
      `INSERT INTO po_out
         (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,
          ob_code,ob_datetime,bb_id,ba_id,status)
       VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`,
      [po.po_id, po.po_amount, po.po_message, po.po_datetime,
       po.ob_id || BIC, po.oa_id, C.OK, ts, po.bb_id, po.ba_id]
    );
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      return { po_id: po.po_id, status: 'SKIPPED', reason: 'already_in_po_out', code: C.OK, skipped: true };
    }
    throw e;
  }

  // Debit OA + transactions-row
  await pool.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.oa_id]);
  await pool.query(
    'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,1,0,?)',
    [po.po_id, po.oa_id, -Math.abs(po.po_amount), ts]
  );
  await writeLog('oa_debited', `OA ${po.oa_id} −€${po.po_amount}`, snapshot);

  // POST naar CB
  let cbCode = null;
  try {
    const r = await cb.sendPos([{
      ...po,
      ob_id: po.ob_id || BIC,
      ob_code: C.OK,
      ob_datetime: ts,
    }]);
    cbCode = (r.body?.data?.[0]?.cb_code) ?? r.body?.code ?? null;
    await pool.query('UPDATE po_out SET cb_code=?, cb_datetime=? WHERE po_id=?', [cbCode, now(), po.po_id]);
    await writeLog('po_sent_cb', `CB ack: cb_code=${cbCode}`, snapshot);
  } catch (cbErr) {
    await writeLog('cb_error', `CB-call mislukt: ${cbErr.message}`, snapshot);
  }

  await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);

  // CB-rejectie inline afhandelen (anders zit po_out 1u in 'pending' tot timeout-monitor)
  // 2000 / null = OK of geen antwoord — wacht op echte ACK.
  const rejectCodes = new Set([C.AMOUNT_EXCEEDED, C.AMOUNT_INVALID, C.BB_UNKNOWN, C.DUPLICATE_PO, C.OB_MISMATCH, C.DUP_IN_BATCH]);
  if (cbCode != null && rejectCodes.has(parseInt(cbCode, 10))) {
    const rts = now();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('UPDATE po_out SET status=?, bb_datetime=? WHERE po_id=?', ['failed', rts, po.po_id]);
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.oa_id]);
      await conn.query(
        'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,0,1,?)',
        [po.po_id, po.oa_id, Math.abs(po.po_amount), rts]
      );
      await conn.query('UPDATE transactions SET iscomplete=1 WHERE po_id=? AND amount<0', [po.po_id]);
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      await writeLog('error', `CB-reject refund mislukt voor ${po.po_id}: ${e.message}`, snapshot);
    } finally {
      conn.release();
    }
    await writeLog('po_cb_rejected', `CB weigerde PO (cb_code=${cbCode}) — refund OA ${po.oa_id}`, snapshot);
    return { po_id: po.po_id, status: 'FAILED', code: parseInt(cbCode, 10), type: 'external', cb_code: cbCode };
  }

  return { po_id: po.po_id, status: 'PENDING', code: C.OK, type: 'external', cb_code: cbCode };
}

async function processPoNew() {
  const [pos] = await pool.query('SELECT * FROM po_new');
  const results = [];
  let skipped = 0;
  for (const po of pos) {
    const r = await processOne(po);
    if (r.skipped) skipped++;
    results.push(r);
  }
  return { processed: results.length - skipped, skipped, results };
}

module.exports = { processPoNew, processOne };
