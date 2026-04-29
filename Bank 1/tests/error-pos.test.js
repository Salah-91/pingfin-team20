// Error-PO test suite — pure Node, geen externe tools nodig (Windows-friendly)
//
// Genereert PO's met opzettelijke fouten en verifieert:
//   1. juiste error-code in response
//   2. log-event geschreven in /api/logs
//
// Gebruik:  node tests/error-pos.test.js [base_url]
// Default:  http://localhost:8089
'use strict';

const fetch = require('node-fetch');

const BASE = process.argv[2] || 'http://localhost:8089';
let pass = 0, fail = 0;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function req(method, path, body, extraHeaders = {}) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...extraHeaders } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  let json = null;
  try { json = await r.json(); } catch {}
  return { status: r.status, body: json };
}

async function check(label, ok, detail = '') {
  if (ok) { pass++; console.log('  ✅', label, detail ? '— ' + detail : ''); }
  else    { fail++; console.log('  ❌', label, detail ? '— ' + detail : ''); }
}

async function logBevat(zoekTerm) {
  const r = await req('GET', '/api/logs?limit=20');
  const rijen = r.body?.data ?? [];
  return rijen.find(l => (l.message ?? '').toLowerCase().includes(zoekTerm.toLowerCase()));
}

async function testPo(label, body, verwachteCode, logZoekTerm) {
  console.log('\n─── ' + label + ' ───');
  console.log('  body:', JSON.stringify(body));
  const r = await req('POST', '/api/po_new/manual', body);
  console.log('  response:', JSON.stringify(r.body));
  const code = r.body?.code ?? r.body?.data?.code;
  await check(`response.code = ${verwachteCode}`, String(code) === String(verwachteCode),
              `kreeg ${code}`);

  await sleep(300);
  if (logZoekTerm) {
    const log = await logBevat(logZoekTerm);
    await check(`log bevat "${logZoekTerm}"`, !!log,
                log ? `[${log.type}] ${log.message?.slice(0, 60)}` : 'geen match');
  }
}

(async () => {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PingFin Error-PO Test Suite — ' + BASE);
  console.log('═══════════════════════════════════════════════════════════════');

  // Eigen BIC ophalen
  const info = await req('GET', '/api/info');
  const ownBic = info.body?.data?.bic;
  if (!ownBic) {
    console.error('❌ Kan BIC niet ophalen — draait', BASE, '?');
    process.exit(2);
  }
  console.log('  Bank:', ownBic, '\n');

  const OA = 'BE13101000000020';   // Salah Sennouni — Bank 1 (uit pingfin_database.sql)
  const OA_B1 = 'BE41101000000001'; // Jan Janssen — Bank 1

  // 1. AMOUNT_EXCEEDED (4002)
  await testPo('TEST 1 — Bedrag te hoog (€600 > €500)',
    { oa_id: OA, ba_id: 'BE99100200300001', bb_id: 'HOMNBEB1', po_amount: 600, po_message: '4002-test' },
    4002, 'Ongeldig bedrag');

  // 2. AMOUNT_INVALID (4003) — negatief
  await testPo('TEST 2 — Bedrag negatief (-50)',
    { oa_id: OA, ba_id: 'BE99100200300001', bb_id: 'HOMNBEB1', po_amount: -50, po_message: '4003-test' },
    4003, 'Ongeldig bedrag');

  // 3. AMOUNT_INVALID (4003) — nul
  await testPo('TEST 3 — Bedrag nul (0)',
    { oa_id: OA, ba_id: 'BE99100200300001', bb_id: 'HOMNBEB1', po_amount: 0, po_message: '4003-zero' },
    4003, 'Ongeldig bedrag');

  // 4. BB_UNKNOWN (4004) — ongeldige BIC
  await testPo('TEST 4 — Ongeldige BB BIC',
    { oa_id: OA, ba_id: 'BE99100200300001', bb_id: 'BAD BIC', po_amount: 10, po_message: '4004-test' },
    4004, 'Ongeldig bb_id');

  // 5. ACCOUNT_UNKNOWN (4101) — ongeldige IBAN OA
  await testPo('TEST 5 — Ongeldige OA IBAN',
    { oa_id: 'INVALID', ba_id: 'BE99100200300001', bb_id: 'HOMNBEB1', po_amount: 10, po_message: '4101-oa' },
    4101, 'Ongeldig oa_id');

  // 6. ACCOUNT_UNKNOWN (4101) — ongeldige IBAN BA
  await testPo('TEST 6 — Ongeldige BA IBAN',
    { oa_id: OA, ba_id: 'INVALID', bb_id: 'HOMNBEB1', po_amount: 10, po_message: '4101-ba' },
    4101, 'Ongeldig ba_id');

  // 7. INSUFFICIENT_BALANCE (4102) — saldo overschrijding via process-stap
  console.log('\n─── TEST 7 — Onvoldoende saldo (intern, > €5000) ───');
  const tooMuch = { oa_id: OA, ba_id: OA_B1, bb_id: ownBic, po_amount: 9999, po_message: '4102-test' };
  // Manual-stap valideert wel formaat maar niet saldo (saldo-check zit in process)
  // Dus we moeten eerst toevoegen via po_new/add met bedrag binnen format-grens en dan process aanroepen
  // Alternatief: bedrag = 500 maar OA met laag saldo — voor demo doen we via process-pad rechtstreeks
  const lowAmount = { oa_id: OA_B1, ba_id: OA, bb_id: ownBic, po_amount: 499, po_message: '4102-test' };
  console.log('  (deze test werkt alleen na meerdere debit-rondes — overgeslagen voor live demo)');
  console.log('  ℹ️  Zie tests/error-pos.test.js — TEST 7 manuele check via /api/po_new/process');

  // 8. Bearer-auth — geen token → 401
  console.log('\n─── TEST 8 — POST /po_in zonder Bearer-token ───');
  const noAuth = await req('POST', '/api/po_in', { data: [] });
  await check('HTTP 401 zonder Bearer', noAuth.status === 401, `kreeg HTTP ${noAuth.status}`);

  // 9. Bearer-auth — verkeerde token → 401
  console.log('\n─── TEST 9 — POST /po_in met verkeerde Bearer ───');
  const wrongAuth = await req('POST', '/api/po_in', { data: [] }, { 'Authorization': 'Bearer wrong-token-12345' });
  await check('HTTP 401 met verkeerd token', wrongAuth.status === 401, `kreeg HTTP ${wrongAuth.status}`);

  // 10. Geldige PO — 2000 OK
  await testPo('TEST 10 — Geldige interne PO',
    { oa_id: OA_B1, ba_id: OA, bb_id: ownBic, po_amount: 1.00, po_message: 'OK-test' },
    null,  // geen .code — alleen ok=true
    'Manuele PO');
  // Extra check op .ok = true
  const okResp = await req('POST', '/api/po_new/manual',
    { oa_id: OA_B1, ba_id: OA, bb_id: ownBic, po_amount: 1.00, po_message: 'OK-test-2' });
  await check('TEST 10b — geldige PO accepted (ok=true)', okResp.body?.ok === true);

  // ────────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`  RESULTAAT: ${pass} geslaagd / ${fail} gefaald (${pass + fail} totaal)`);
  console.log('═══════════════════════════════════════════════════════════════');
  process.exit(fail > 0 ? 1 : 0);
})().catch(err => {
  console.error('❌ Test-runner crashte:', err.message);
  process.exit(2);
});
