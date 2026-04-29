// Validatie-helpers (manual-conform)
const C = require('../codes');

// BIC: 8 of 11 chars; case-insensitive zodat andere banken die lowercase/mixed sturen
// niet onterecht als OB_MISMATCH afgewezen worden.
const BIC_RE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/i;
// IBAN: 2 letters + 2 cijfers + 11–30 alfanumeriek. Totaal 15–34 chars (NL=18, DE=22, FR=27…).
// Onze oorspronkelijke regex was BE-only (16) → veroorzaakte massa 4101's bij andere banken.
const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/i;

function validBic(bic)   { return typeof bic === 'string' && BIC_RE.test(bic); }
function validIban(iban) { return typeof iban === 'string' && IBAN_RE.test(iban); }

/* Echte IBAN-checksum check (mod 97). Strikt-validerende banken eisen dit. */
function validIbanChecksum(iban) {
  if (!validIban(iban)) return false;
  const up = iban.toUpperCase();
  const moved = up.slice(4) + up.slice(0, 4);
  const numeric = moved.replace(/[A-Z]/g, c => (c.charCodeAt(0) - 55).toString());
  try { return BigInt(numeric) % 97n === 1n; }
  catch { return false; }
}

/* Genereer een willekeurige BE-IBAN met correcte mod-97 checksum. */
function genValidBeIban(bbanPrefix = '') {
  const padTotal = 12 - bbanPrefix.length;
  const random = padTotal > 0
    ? String(Math.floor(Math.random() * Math.pow(10, padTotal))).padStart(padTotal, '0')
    : '';
  const bban = (bbanPrefix + random).slice(0, 12).padStart(12, '0');
  const numeric = bban + '111400';                 // B=11, E=14, placeholder 00
  const cs = (98n - BigInt(numeric) % 97n).toString().padStart(2, '0');
  return `BE${cs}${bban}`;
}

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
  // Manual: prefixed with BIC_ van de OB, vb GKCCBEBB_21xa-39-95.
  // Case-insensitief zodat we niet breken als andere banken lowercase of mixed sturen.
  if (ob_id) return po_id.toUpperCase().startsWith(`${String(ob_id).toUpperCase()}_`);
  return /^[A-Z0-9]{6,11}_/i.test(po_id);
}

module.exports = {
  validBic, validIban, validIbanChecksum, genValidBeIban,
  validAmount, amountErrorCode, validPoIdFormat,
};
