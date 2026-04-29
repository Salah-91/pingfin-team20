// BB-zijde: verwerk een inkomende PO (van CB-push of CB-poll).
// Schrijft po_in + ack_out + transactions, valideert volgens manual.
const pool = require('../db');
const cfg = require('../config');
const C = require('../codes');
const { now } = require('../lib/time');
const { writeLog } = require('../lib/log');
const { validBic, validIban, amountErrorCode, validPoIdFormat } = require('../lib/validate');

const BIC = cfg.bic;

async function insertPoIn(po, bb_code, ts) {
  await pool.query(
    `INSERT INTO po_in
       (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,
        ob_code,ob_datetime,cb_code,cb_datetime,
        bb_id,ba_id,bb_code,bb_datetime)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || ts,
     po.ob_id, po.oa_id,
     po.ob_code ?? null, po.ob_datetime || null,
     po.cb_code ?? null, po.cb_datetime || null,
     po.bb_id || BIC, po.ba_id, bb_code, ts]
  );
}

async function queueAckOut(po_id, bb_code, ts) {
  // upsert in ack_out — sent_to_cb=0 zodat de poller hem oppikt
  await pool.query(
    `INSERT INTO ack_out (po_id,bb_code,bb_datetime,sent_to_cb,sent_at)
     VALUES (?,?,?,0,?)
     ON DUPLICATE KEY UPDATE bb_code=VALUES(bb_code), bb_datetime=VALUES(bb_datetime), sent_to_cb=0`,
    [po_id, bb_code, ts, ts]
  );
}

async function processPoIn(po) {
  const ts = now();
  const snapshot = { ...po, bb_id: po.bb_id || BIC };

  // BB ID moet onze BIC zijn
  if (po.bb_id && po.bb_id !== BIC) {
    await writeLog('po_rejected', `BB-mismatch: ${po.bb_id} ≠ ${BIC}`, snapshot);
    return { po_id: po.po_id, bb_code: C.BB_UNKNOWN, bb_datetime: ts };
  }

  // Format checks
  if (!validPoIdFormat(po.po_id, po.ob_id)) {
    await writeLog('po_rejected', `Ongeldig po_id formaat: ${po.po_id}`, snapshot);
    return { po_id: po.po_id, bb_code: C.OB_MISMATCH, bb_datetime: ts };
  }
  if (!validBic(po.ob_id)) {
    await writeLog('po_rejected', `Ongeldige ob_id: ${po.ob_id}`, snapshot);
    return { po_id: po.po_id, bb_code: C.OB_MISMATCH, bb_datetime: ts };
  }
  if (!validIban(po.ba_id)) {
    await writeLog('po_rejected', `Ongeldig ba_id formaat: ${po.ba_id}`, snapshot);
    await insertPoIn(po, C.ACCOUNT_UNKNOWN, ts).catch(() => {});
    await queueAckOut(po.po_id, C.ACCOUNT_UNKNOWN, ts).catch(() => {});
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts };
  }

  // Duplicate check
  try {
    const [dup] = await pool.query('SELECT po_id FROM po_in WHERE po_id = ?', [po.po_id]);
    if (dup.length > 0) {
      await writeLog('po_duplicate', `Duplicate po_id: ${po.po_id}`, snapshot);
      return { po_id: po.po_id, bb_code: C.DUPLICATE_PO, bb_datetime: ts };
    }
  } catch (err) {
    await writeLog('error', `Duplicate-check DB fout: ${err.message}`, snapshot);
  }

  // Bedrag
  const amErr = amountErrorCode(po.po_amount);
  if (amErr) {
    await writeLog('po_rejected', `Bedrag ongeldig: ${po.po_amount}`, snapshot);
    await insertPoIn(po, amErr, ts);
    await queueAckOut(po.po_id, amErr, ts);
    return { po_id: po.po_id, bb_code: amErr, bb_datetime: ts };
  }

  // BA bestaat?
  const [ba] = await pool.query('SELECT id FROM accounts WHERE id = ?', [po.ba_id]);
  if (ba.length === 0) {
    await writeLog('po_rejected', `BA onbekend: ${po.ba_id}`, snapshot);
    await insertPoIn(po, C.ACCOUNT_UNKNOWN, ts);
    await queueAckOut(po.po_id, C.ACCOUNT_UNKNOWN, ts);
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts };
  }

  // Crediteer BA atomisch
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.ba_id]);
    await conn.query(
      `INSERT INTO po_in
         (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,
          ob_code,ob_datetime,cb_code,cb_datetime,
          bb_id,ba_id,bb_code,bb_datetime)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || ts,
       po.ob_id, po.oa_id,
       po.ob_code ?? null, po.ob_datetime || null,
       po.cb_code ?? null, po.cb_datetime || null,
       po.bb_id || BIC, po.ba_id, C.OK, ts]
    );
    await conn.query(
      'INSERT INTO transactions (po_id,account_id,amount,isvalid,iscomplete,datetime) VALUES (?,?,?,1,1,?)',
      [po.po_id, po.ba_id, po.po_amount, ts]
    );
    await conn.query(
      `INSERT INTO ack_out (po_id,bb_code,bb_datetime,sent_to_cb,sent_at)
       VALUES (?,?,?,0,?)
       ON DUPLICATE KEY UPDATE bb_code=VALUES(bb_code), bb_datetime=VALUES(bb_datetime), sent_to_cb=0`,
      [po.po_id, C.OK, ts, ts]
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    await writeLog('error', `Crediteren BA mislukt: ${err.message}`, snapshot);
    conn.release();
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts };
  }
  conn.release();

  await writeLog('ba_credited', `BA ${po.ba_id} +€${po.po_amount}`, snapshot);
  return { po_id: po.po_id, bb_code: C.OK, bb_datetime: ts };
}

module.exports = { processPoIn };
