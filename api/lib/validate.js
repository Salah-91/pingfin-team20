// Validatie-helpers (manual-conform)
const C = require('../codes');

const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;   // 8 of 11 chars, willekeurig land
const IBAN_RE = /^[A-Z]{2}\d{14}$/;                              // 16-char BE-stijl IBAN

function validBic(bic)   { return typeof bic === 'string' && BIC_RE.test(bic); }
function validIban(iban) { return typeof iban === 'string' && IBAN_RE.test(iban); }

function validAmount(amount) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return false;
  // Max 2 decimalen: n * 100 moet een geheel getal zijn (binnen tolerantie)
  return Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
}

function amountErrorCode(amount) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n) || n <= 0) return C.AMOUNT_INVALID;
  if (n > 500) return C.AMOUNT_EXCEEDED;
  return null;
}

function validPoIdFormat(po_id, ob_id) {
  if (typeof po_id !== 'string') return false;
  if (po_id.length === 0 || po_id.length > 50) return false;
  // Manual: prefixed with BIC_ van de OB, vb GKCCBEBB_21xa-39-95
  if (ob_id) return po_id.startsWith(`${ob_id}_`);
  return /^[A-Z0-9]{6,11}_/.test(po_id);
}

module.exports = { validBic, validIban, validAmount, amountErrorCode, validPoIdFormat };
