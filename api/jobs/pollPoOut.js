// BB-rol: haal nieuwe PO's uit CB.po_out, verwerk lokaal, post antwoord naar CB.ack_in.
const cb = require('../lib/cbClient');
const cfg = require('../config');
const C = require('../codes');
const pool = require('../db');
const { writeLog } = require('../lib/log');
const { processPoIn } = require('../services/poInService');

async function runOnce() {
  let posForUs = [];
  try {
    const r = await cb.fetchPos();
    const list = r.body?.data || [];
    posForUs = list.filter(po => (po.bb_id || '') === cfg.bic);
    if (list.length === 0) return { fetched: 0, processed: 0 };
  } catch (err) {
    await writeLog('error', `poll-po-out fout: ${err.message}`);
    return { fetched: 0, processed: 0, error: err.message };
  }

  // CB verwacht het VOLLEDIGE PO-record terug (po_id alleen volstaat niet — CB faalt
  // stilletjes op ack_in als bb_id/ba_id ontbreken). We klonen het inkomende PO en
  // overschrijven enkel de bb_code/bb_datetime met ons antwoord.
  const acks = [];
  for (const po of posForUs) {
    const result = await processPoIn(po);
    acks.push({
      ...po,
      cb_code:     po.cb_code ?? C.OK,
      cb_datetime: po.cb_datetime || null,
      bb_code:     result.bb_code,
      bb_datetime: result.bb_datetime,
    });
  }

  // Post ACKs naar CB — één voor één, zodat 1 rotte appel niet de hele batch sloopt
  let pushed = 0, failed = 0;
  for (const ack of acks) {
    try {
      const r = await cb.sendAcks([ack]);
      if (r.ok) {
        await pool.query('UPDATE ack_out SET sent_to_cb=1 WHERE po_id=?', [ack.po_id]);
        pushed++;
      } else {
        failed++;
        await writeLog('cb_error', `ACK push status ${r.status} voor ${ack.po_id}: ${JSON.stringify(r.body).slice(0, 200)}`);
      }
    } catch (err) {
      failed++;
      await writeLog('cb_error', `ACK push exception voor ${ack.po_id}: ${err.message}`);
    }
  }
  if (acks.length > 0) {
    await writeLog('ack_pushed', `${pushed}/${acks.length} ACK(s) gepost naar CB${failed ? ` (${failed} gefaald)` : ''}`);
  }

  return { fetched: posForUs.length, processed: acks.length, pushed, failed };
}

function start() {
  if (!cfg.jobsEnabled) return;
  // Eerste run kort na opstart, daarna elke pollIntervalMs
  setTimeout(runOnce, 5_000);
  setInterval(runOnce, cfg.cb.pollIntervalMs).unref();
}

module.exports = { runOnce, start };
