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
  // schema vereist po_amount/oa_id/ob_id/bb_id/ba_id NOT NULL — vul defensief op met
  // veilige fallbacks zodat een rejectie nooit silently sneuvelt op een NOT NULL.
  await pool.query(
    `INSERT IGNORE INTO po_in
       (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,
        ob_code,ob_datetime,cb_code,cb_datetime,
        bb_id,ba_id,bb_code,bb_datetime)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [po.po_id, po.po_amount ?? 0, po.po_message || null, po.po_datetime || ts,
     po.ob_id || 'UNKNOWN0000', po.oa_id || 'UNKNOWN',
     po.ob_code ?? null, po.ob_datetime || null,
     po.cb_code ?? null, po.cb_datetime || null,
     po.bb_id || BIC, po.ba_id || 'UNKNOWN', bb_code, ts]
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

// Persisteer reject + queue ACK. Errors loggen i.p.v. swallowen, maar nooit throwen
// (een rejectie mag niet de hele batch sloopen).
async function persistRejection(po, bb_code, ts, snapshot) {
  try { await insertPoIn(po, bb_code, ts); }
  catch (err) { await writeLog('error', `insertPoIn (reject) faalde voor ${po.po_id}: ${err.message}`, snapshot); }
  try { await queueAckOut(po.po_id, bb_code, ts); }
  catch (err) { await writeLog('error', `queueAckOut faalde voor ${po.po_id}: ${err.message}`, snapshot); }
}

async function processPoIn(po) {
  const ts = now();
  const snapshot = { ...po, bb_id: po.bb_id || BIC };

  // BB ID moet onze BIC zijn (case-insensitive — sommige banken sturen lowercase)
  if (po.bb_id && String(po.bb_id).toUpperCase() !== BIC.toUpperCase()) {
    await writeLog('po_rejected', `BB-mismatch: ${po.bb_id} ≠ ${BIC}`, snapshot);
    await persistRejection(po, C.BB_UNKNOWN, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.BB_UNKNOWN, bb_datetime: ts };
  }

  // Format checks
  if (!validPoIdFormat(po.po_id, po.ob_id)) {
    await writeLog('po_rejected', `Ongeldig po_id formaat: ${po.po_id}`, snapshot);
    await persistRejection(po, C.OB_MISMATCH, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.OB_MISMATCH, bb_datetime: ts };
  }
  if (!validBic(po.ob_id)) {
    await writeLog('po_rejected', `Ongeldige ob_id: ${po.ob_id}`, snapshot);
    await persistRejection(po, C.OB_MISMATCH, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.OB_MISMATCH, bb_datetime: ts };
  }
  if (!validIban(po.ba_id)) {
    await writeLog('po_rejected', `Ongeldig ba_id formaat: ${po.ba_id}`, snapshot);
    await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts };
  }

  // Duplicate check — re-queue ACK zodat OB hem alsnog te zien krijgt als die hem miste
  try {
    const [dup] = await pool.query('SELECT bb_code FROM po_in WHERE po_id = ?', [po.po_id]);
    if (dup.length > 0) {
      const prevCode = dup[0].bb_code ?? C.DUPLICATE_PO;
      await writeLog('po_duplicate', `Duplicate po_id: ${po.po_id} (re-ack ${prevCode})`, snapshot);
      await queueAckOut(po.po_id, prevCode, ts).catch(err =>
        writeLog('error', `re-queue ACK voor duplicate ${po.po_id} faalde: ${err.message}`, snapshot));
      return { po_id: po.po_id, bb_code: prevCode, bb_datetime: ts };
    }
  } catch (err) {
    await writeLog('error', `Duplicate-check DB fout: ${err.message}`, snapshot);
  }

  // Bedrag
  const amErr = amountErrorCode(po.po_amount);
  if (amErr) {
    await writeLog('po_rejected', `Bedrag ongeldig: ${po.po_amount}`, snapshot);
    await persistRejection(po, amErr, ts, snapshot);
    return { po_id: po.po_id, bb_code: amErr, bb_datetime: ts };
  }

  // BA bestaat?
  const [ba] = await pool.query('SELECT id FROM accounts WHERE id = ?', [po.ba_id]);
  if (ba.length === 0) {
    await writeLog('po_rejected', `BA onbekend: ${po.ba_id}`, snapshot);
    await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
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
    conn.release();
    await writeLog('error', `Crediteren BA mislukt: ${err.message}`, snapshot);
    await persistRejection(po, C.ACCOUNT_UNKNOWN, ts, snapshot);
    return { po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts };
  }
  conn.release();

  await writeLog('ba_credited', `BA ${po.ba_id} +€${po.po_amount}`, snapshot);
  return { po_id: po.po_id, bb_code: C.OK, bb_datetime: ts };
}

module.exports = { processPoIn };
