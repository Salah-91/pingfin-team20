// Unit tests voor lib/validate.js — dekkende test van alle valide & invalide gevallen
// Gebruik: node tests/validate.test.js
'use strict';

const v = require('../lib/validate');
const C = require('../codes');

let pass = 0, fail = 0;

function t(label, got, want) {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log((ok ? '  ✅' : '  ❌') + '  ' + label
    + (ok ? '' : `  (got=${JSON.stringify(got)}, want=${JSON.stringify(want)})`));
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  PingFin Validation Test Suite');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('─── 1.1 BIC validatie (8 of 11 chars, case-insensitive) ───────');
t('GKCCBEBB (8 chars)         → valid',     v.validBic('GKCCBEBB'),      true);
t('GKCCBEBBXXX (11 chars)     → valid',     v.validBic('GKCCBEBBXXX'),   true);
t('gkccbebb (lowercase)       → valid',     v.validBic('gkccbebb'),      true);
t('AB (te kort)               → invalid',   v.validBic('AB'),            false);
t('GKCC BEBB (met spatie)     → invalid',   v.validBic('GKCC BEBB'),     false);
t('null                       → invalid',   v.validBic(null),            false);

console.log('\n─── 1.2 IBAN validatie (15-34 chars + checksum) ───────────────');
t('BE13101000000020 (BE 16ch) → valid',     v.validIban('BE13101000000020'),                true);
t('NL91ABNA0417164300 (NL 18) → valid',     v.validIban('NL91ABNA0417164300'),              true);
t('DE89370400440532013000 (DE 22) → valid', v.validIban('DE89370400440532013000'),          true);
t('FR1420041010050500013M02606 (FR 27) → valid', v.validIban('FR1420041010050500013M02606'),true);
t('BE12345 (te kort)          → invalid',   v.validIban('BE12345'),                         false);
t('Mod-97 checksum BE valid    → true',     v.validIbanChecksum('BE13101000000020'),        true);
t('Mod-97 checksum BE invalid  → false',    v.validIbanChecksum('BE99999999999999'),        false);

console.log('\n─── 1.3 po_id format (BIC_ prefix, max 50 chars) ──────────────');
t('GKCCBEBB_abc-123           → valid',     v.validPoIdFormat('GKCCBEBB_abc-123', 'GKCCBEBB'), true);
t('CEKVBE88_o3z37943          → valid',     v.validPoIdFormat('CEKVBE88_o3z37943', 'CEKVBE88'), true);
t('zonder prefix              → invalid',   v.validPoIdFormat('o3z37943', 'CEKVBE88'),      false);
t('verkeerde BIC prefix       → invalid',   v.validPoIdFormat('XXXX_abc', 'CEKVBE88'),      false);
t('51 chars (max 50)          → invalid',   v.validPoIdFormat('CEKVBE88_' + 'x'.repeat(50), 'CEKVBE88'), false);
t('case-insensitive prefix    → valid',     v.validPoIdFormat('cekvbe88_abc', 'CEKVBE88'),  true);

console.log('\n─── 1.4 po_amount (>0, ≤500, max 2 decimalen) ─────────────────');
t('50.00                      → null (OK)', v.amountErrorCode(50.00),  null);
t('500.00 (op grens)          → null (OK)', v.amountErrorCode(500.00), null);
t('500.01                     → 4002 EXCEEDED', v.amountErrorCode(500.01), C.AMOUNT_EXCEEDED);
t('1000                       → 4002',      v.amountErrorCode(1000),   C.AMOUNT_EXCEEDED);
t('-5                         → 4003 INVALID', v.amountErrorCode(-5), C.AMOUNT_INVALID);
t('0                          → 4003',      v.amountErrorCode(0),      C.AMOUNT_INVALID);
t('"abc"                      → 4003',      v.amountErrorCode('abc'),  C.AMOUNT_INVALID);
t('null                       → 4003',      v.amountErrorCode(null),   C.AMOUNT_INVALID);
t('50.00 (2 decimalen OK)     → valid',     v.validAmount(50.00),      true);
t('50.123 (3 decimalen)       → invalid',   v.validAmount(50.123),     false);

console.log('\n─── 1.5 po_datetime format YYYY-MM-DD HH:MM:SS ────────────────');
const { now } = require('../lib/time');
const ts = now();
const re = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
t('now() returns YYYY-MM-DD HH:MM:SS', re.test(ts), true);
console.log('     voorbeeld output: ' + ts);

console.log('\n─── 1.6 Foutcodes (alle 10 codes uit codes.js) ────────────────');
const verwacht = {
  OK: 2000, INTERNAL_TX: 4001, AMOUNT_EXCEEDED: 4002, AMOUNT_INVALID: 4003,
  BB_UNKNOWN: 4004, DUPLICATE_PO: 4005, OB_MISMATCH: 4006, DUP_IN_BATCH: 4007,
  ACCOUNT_UNKNOWN: 4101, INSUFFICIENT_BALANCE: 4102,
};
for (const [k, val] of Object.entries(verwacht)) {
  t(k.padEnd(22) + ' = ' + val, C[k], val);
}

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  RESULTAAT: ${pass} geslaagd / ${fail} gefaald (${pass + fail} totaal)`);
console.log('═══════════════════════════════════════════════════════════════');
process.exit(fail > 0 ? 1 : 0);
