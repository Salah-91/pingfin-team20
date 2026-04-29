// OB-rol: haal nieuwe ACKs uit CB.ack_out, verwerk lokaal (po_out + refund/bevestiging).
const cb = require('../lib/cbClient');
const cfg = require('../config');
const { writeLog } = require('../lib/log');
const { processAckIn } = require('../services/ackInService');

async function runOnce() {
  let acks = [];
  try {
    const r = await cb.fetchAcks();
    acks = r.body?.data || [];
    if (acks.length === 0) return { fetched: 0, processed: 0 };
  } catch (err) {
    await writeLog('error', `poll-ack-out fout: ${err.message}`);
    return { fetched: 0, processed: 0, error: err.message };
  }

  let processed = 0, skipped = 0;
  const myBic = cfg.bic.toUpperCase();
  for (const ack of acks) {
    if (ack.ob_id && String(ack.ob_id).toUpperCase() !== myBic)                       { skipped++; continue; }
    if (ack.po_id && !String(ack.po_id).toUpperCase().startsWith(`${myBic}_`))        { skipped++; continue; }
    await processAckIn(ack);
    processed++;
  }
  if (processed > 0 || skipped > 0) {
    await writeLog('ack_polled', `CB.ack_out: fetched=${acks.length} processed=${processed} skipped=${skipped}`);
  }
  return { fetched: acks.length, processed, skipped };
}

function start() {
  if (!cfg.jobsEnabled) return;
  setTimeout(runOnce, 8_000);
  setInterval(runOnce, cfg.cb.pollIntervalMs).unref();
}

module.exports = { runOnce, start };
