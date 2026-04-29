// Centrale logger — schrijft een rij naar `logs` met optionele PO-snapshot
const pool = require('../db');
const { now } = require('./time');

const LOG_FIELDS = [
  'po_id','po_amount','po_message','po_datetime',
  'ob_id','oa_id','ob_code','ob_datetime',
  'cb_code','cb_datetime',
  'bb_id','ba_id','bb_code','bb_datetime'
];

async function writeLog(type, message, po = null) {
  const cols = ['type', 'message', 'datetime'];
  const vals = [type, message, now()];

  if (po && typeof po === 'object') {
    for (const f of LOG_FIELDS) {
      cols.push(f);
      vals.push(po[f] ?? null);
    }
  }

  const placeholders = cols.map(() => '?').join(',');
  try {
    await pool.query(`INSERT INTO logs (${cols.join(',')}) VALUES (${placeholders})`, vals);
  } catch (e) {
    console.error('[log] kon niet wegschrijven:', e.message);
  }
}

module.exports = { writeLog };
