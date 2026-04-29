'use strict';

/* ─────────────────────────────────────────────
   Bank-configuratie
   • localhost:8080 (nginx)         → /bank1/api & /bank2/api (reverse proxy)
   • localhost:3000 / 3001 direct   → /api van die ene bank
   • Railway / productie            → beide Railway-domeinen, dropdown wisselt
─────────────────────────────────────────────── */
const RAILWAY_BANK1 = 'https://pingfin-team20-production.up.railway.app';
const RAILWAY_BANK2 = 'https://pingfin-team20-bank2-production.up.railway.app';

function buildBanken() {
  const o = window.location.origin;
  const isNginx       = o.endsWith(':8080');
  const isLocalDirect = o.match(/localhost:(3000|3001)$/);

  if (isNginx) {
    return {
      bank1: { naam: 'Bank1', bic: 'CEKVBE88', apiBase: o + '/bank1/api', heeftManuelePo: true },
      bank2: { naam: 'Bank2', bic: 'HOMNBEB1', apiBase: o + '/bank2/api', heeftManuelePo: true },
    };
  }
  if (isLocalDirect) {
    const isBank2 = o.endsWith(':3001');
    return {
      [isBank2 ? 'bank2' : 'bank1']: {
        naam: isBank2 ? 'Bank2' : 'Bank1',
        bic:  isBank2 ? 'HOMNBEB1' : 'CEKVBE88',
        apiBase: o + '/api',
        heeftManuelePo: true,
      }
    };
  }
  // Productie / Railway: beide banken tonen, ongeacht welk domein de gebruiker bezoekt
  return {
    bank1: { naam: 'Bank1', bic: 'CEKVBE88', apiBase: RAILWAY_BANK1 + '/api', heeftManuelePo: true },
    bank2: { naam: 'Bank2', bic: 'HOMNBEB1', apiBase: RAILWAY_BANK2 + '/api', heeftManuelePo: true },
  };
}

const BANKEN = buildBanken();
const EERSTE_KEY = Object.keys(BANKEN)[0];

let huidigeBank    = BANKEN[EERSTE_KEY];
let gegenereerdePos = [];

/* ─────────────────────────────────────────────
   Navigatie
─────────────────────────────────────────────── */
function toonSectie(naam, knop) {
  document.querySelectorAll('.sectie').forEach(s => s.classList.remove('actief'));
  document.querySelectorAll('nav.sitenav button').forEach(b => b.classList.remove('actief'));
  document.getElementById('sectie-' + naam).classList.add('actief');
  knop.classList.add('actief');
  laadSectie(naam);
}

function laadSectie(naam) {
  const secties = {
    dashboard:    laadDashboard,
    accounts:     laadAccounts,
    'po-nieuw':   laadPoNieuw,
    'po-uit':     laadPoUit,
    'po-in':      laadPoIn,
    'ack-in':     laadAckIn,
    'ack-uit':    laadAckUit,
    transacties:  laadTransacties,
    logs:         laadLogs,
    banks:        laadBanks,
  };
  if (secties[naam]) secties[naam]();
}

/* ─────────────────────────────────────────────
   Bank-selector
─────────────────────────────────────────────── */
function wisselBank(bankKey) {
  if (!BANKEN[bankKey]) return;
  huidigeBank = BANKEN[bankKey];
  localStorage.setItem('pingfin_bank', bankKey);

  const bicLabel = document.getElementById('header-bic-label');
  if (bicLabel) bicLabel.textContent = 'BIC: ' + huidigeBank.bic;

  const asideBic = document.getElementById('aside-bic-waarde');
  if (asideBic) asideBic.textContent = huidigeBank.bic;

  const asideNaam = document.getElementById('aside-banknaam-waarde');
  if (asideNaam) asideNaam.textContent = huidigeBank.naam;

  document.title = 'PingFin — ' + huidigeBank.bic;

  // Reset BB BIC naar eigen BIC als het leeg is of nog een eigen BIC bevat
  const bbVeld = document.getElementById('m-bb-id');
  if (bbVeld) {
    bbVeld.placeholder = huidigeBank.bic;
    const eigenBics = Object.values(BANKEN).map(b => b.bic);
    if (!bbVeld.value || eigenBics.includes(bbVeld.value)) {
      bbVeld.value = huidigeBank.bic;
    }
  }

  // Herlaad actieve sectie
  const actieveSectie = document.querySelector('.sectie.actief');
  if (actieveSectie) laadSectie(actieveSectie.id.replace('sectie-', ''));
}

function initialiseerBankSelector() {
  const opgeslagen = localStorage.getItem('pingfin_bank');
  const bankKey    = (opgeslagen && BANKEN[opgeslagen]) ? opgeslagen : EERSTE_KEY;

  const selector = document.getElementById('bank-selector');
  if (selector) {
    // Verwijder opties voor banken die niet beschikbaar zijn (bv. single-instance prod)
    Array.from(selector.options).forEach(opt => {
      if (!BANKEN[opt.value]) opt.remove();
    });
    selector.value = bankKey;
    if (Object.keys(BANKEN).length < 2) selector.style.display = 'none';
  }

  wisselBank(bankKey);

  // Probeer BIC/Bankname op te halen als ze nog onbekend zijn (single-instance fallback)
  if (huidigeBank.bic === '?') {
    fetch(huidigeBank.apiBase + '/info').then(r => r.json()).then(j => {
      if (j?.data?.bic) {
        huidigeBank.bic = j.data.bic;
        huidigeBank.naam = j.data.bank_name || huidigeBank.naam;
        wisselBank(EERSTE_KEY);
      }
    }).catch(() => {});
  }
}

/* ─────────────────────────────────────────────
   API-hulpfunctie
─────────────────────────────────────────────── */
async function apiFetch(pad, opties) {
  const antwoord = await fetch(huidigeBank.apiBase + pad, opties);
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  return antwoord.json();
}

/* ─────────────────────────────────────────────
   Render-hulpfuncties
─────────────────────────────────────────────── */
function badge(code) {
  if (code === null || code === undefined || code === '')
    return '<span class="badge badge-wacht">—</span>';
  const n = Number(code);
  if (n === 2000 || String(code) === 'OK')
    return `<span class="badge badge-ok">✓ ${code}</span>`;
  if (n >= 4000)
    return `<span class="badge badge-fout">✕ ${code}</span>`;
  return `<span class="badge badge-wacht">${code}</span>`;
}

function euro(waarde) {
  return `<span class="cel-bedrag">€${parseFloat(waarde || 0).toFixed(2)}</span>`;
}

function datumCel(waarde) {
  if (!waarde) return '<span class="cel-datum" style="color:var(--kleur-tekst-zwak)">—</span>';
  return `<span class="cel-datum">${new Date(waarde).toLocaleString('nl-BE')}</span>`;
}

function zetTeller(id, rijen) {
  const el = document.getElementById(id);
  if (el) el.textContent = rijen.length + ' rijen';
}

function legeRij(kolommen, bericht = 'Geen data') {
  return `<tr class="rij-leeg"><td colspan="${kolommen}">${bericht}</td></tr>`;
}

/* normaliseert API-antwoord naar array — werkt voor { data: [...] } én directe arrays */
function normaliseer(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}

/* ─────────────────────────────────────────────
   Dashboard
─────────────────────────────────────────────── */
async function laadDashboard() {
  try {
    const res = await apiFetch('/info');
    const d   = res.data ?? res ?? {};
    document.getElementById('info-inhoud').innerHTML = `
      <div class="info-rij">
        <span class="info-label">Banknaam</span>
        <span class="info-waarde">${d.bank_name ?? '—'}</span>
      </div>
      <div class="info-rij">
        <span class="info-label">BIC</span>
        <span class="info-waarde">${d.bic ?? '—'}</span>
      </div>
      <div class="info-rij">
        <span class="info-label">CB API</span>
        <span class="info-waarde">https://stevenop.be/pingfin/api/v2/</span>
      </div>
      <div class="info-rij">
        <span class="info-label">Team</span>
        <span class="info-waarde">${d.team ?? '—'}</span>
      </div>
      <div class="leden-raster">
        ${(d.members || []).map(m => `
          <div class="lid-kaart">
            <div class="lid-avatar">${(m.name ?? '?')[0]}</div>
            <div class="lid-naam">${m.name}</div>
            <div class="lid-rol">${m.role ?? ''}</div>
          </div>`).join('')}
      </div>`;

    // Sync aside met live bankinfo uit API
    const asideBic = document.getElementById('aside-bic-waarde');
    if (asideBic && d.bic) asideBic.textContent = d.bic;
    const asideNaam = document.getElementById('aside-banknaam-waarde');
    if (asideNaam && d.bank_name) asideNaam.textContent = d.bank_name;
  } catch {
    document.getElementById('info-inhoud').innerHTML =
      '<div class="leeg"><div class="leeg-icoon">⚠️</div><div class="leeg-tekst">API niet bereikbaar — controleer de server</div></div>';
  }

  try {
    const [acc, poUit, poIn, ackIn, tx, logs] = await Promise.all([
      apiFetch('/accounts'), apiFetch('/po_out'),
      apiFetch('/po_in'),    apiFetch('/ack_in'),
      apiFetch('/transactions'),
      apiFetch('/logs?limit=1000'),
    ]);
    document.getElementById('stat-accounts').textContent = normaliseer(acc).length;
    document.getElementById('stat-po-uit').textContent   = normaliseer(poUit).length;
    document.getElementById('stat-po-in').textContent    = normaliseer(poIn).length;
    document.getElementById('stat-ack-in').textContent   = normaliseer(ackIn).length;
    document.getElementById('stat-tx').textContent       = normaliseer(tx).length;
    document.getElementById('stat-logs').textContent     = normaliseer(logs).length;
  } catch {
    ['stat-accounts','stat-po-uit','stat-po-in','stat-ack-in','stat-tx','stat-logs']
      .forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '—'; });
  }
}

/* ─────────────────────────────────────────────
   Quick Actions — manuele job-triggers
─────────────────────────────────────────────── */
async function runJob(naam) {
  const log = document.getElementById('job-log');
  const tijd = new Date().toLocaleTimeString('nl-BE');
  const div = document.createElement('div');
  div.className = 'log-item info';
  div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ▶ Job '${naam}' wordt uitgevoerd…`;
  log.prepend(div);
  try {
    const res = await apiFetch(`/jobs/run/${naam}`);
    div.className = 'log-item ok';
    const samenvatting = JSON.stringify(res.data || {}).slice(0, 200);
    div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ✓ ${naam}: ${samenvatting}`;
    // ververs dashboard-stats want jobs muteren state
    if (document.querySelector('.sectie.actief')?.id === 'sectie-dashboard') {
      laadDashboard();
    }
  } catch (e) {
    div.className = 'log-item fout';
    div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ✕ ${naam}: ${e.message}`;
  }
}

/* ─────────────────────────────────────────────
   Transacties
─────────────────────────────────────────────── */
async function laadTransacties() {
  const tbody = document.getElementById('tx-rijen');
  tbody.innerHTML = `<tr><td colspan="6" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/transactions'));
    zetTeller('tx-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(t => {
          const bedrag = parseFloat(t.amount || 0);
          const klasse = bedrag >= 0 ? 'badge-ok' : 'badge-fout';
          const teken  = bedrag >= 0 ? '+' : '−';
          const valid  = t.isvalid ? '<span class="badge badge-ok">✓</span>' : '<span class="badge badge-fout">✕</span>';
          const compl  = t.iscomplete ? '<span class="badge badge-ok">✓</span>' : '<span class="badge badge-wacht">…</span>';
          return `
            <tr>
              <td class="cel-mono">${t.po_id ?? '—'}</td>
              <td class="cel-iban">${t.account_id ?? '—'}</td>
              <td><span class="badge ${klasse}">${teken}€${Math.abs(bedrag).toFixed(2)}</span></td>
              <td>${valid}</td>
              <td>${compl}</td>
              <td>${datumCel(t.datetime)}</td>
            </tr>`;
        }).join('')
      : legeRij(6, 'Nog geen transacties');
  } catch {
    tbody.innerHTML = legeRij(6, '⚠️ Fout bij ophalen van transacties');
  }
}

/* ─────────────────────────────────────────────
   Logs (met type-filter)
─────────────────────────────────────────────── */
async function laadLogs() {
  const tbody = document.getElementById('logs-rijen');
  tbody.innerHTML = `<tr><td colspan="4" class="laden">Laden…</td></tr>`;
  const type = document.getElementById('logs-type')?.value || '';
  const limiet = parseInt(document.getElementById('logs-limiet')?.value, 10) || 100;
  const params = new URLSearchParams({ limit: String(limiet) });
  if (type) params.set('type', type);
  try {
    const rijen = normaliseer(await apiFetch(`/logs?${params}`));
    zetTeller('logs-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(l => {
          const isError = (l.type || '').includes('error') || (l.type || '').includes('rejected');
          const isOk    = ['ba_credited','oa_debited','po_internal','ack_processed','ack_pushed','cb_token','po_sent_cb'].includes(l.type);
          const cls     = isError ? 'log-item fout' : (isOk ? 'log-item ok' : 'log-item info');
          return `
            <tr class="${cls}" style="background:transparent">
              <td class="cel-mono">${datumCel(l.datetime)}</td>
              <td class="cel-mono">${l.type ?? '—'}</td>
              <td>${(l.message ?? '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]))}</td>
              <td class="cel-mono">${l.po_id ?? '—'}</td>
            </tr>`;
        }).join('')
      : legeRij(4, 'Geen log-events met dit filter');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout bij ophalen van logs');
  }
}

/* ─────────────────────────────────────────────
   Banks (CB.banks cache)
─────────────────────────────────────────────── */
async function laadBanks() {
  const tbody = document.getElementById('banks-rijen');
  tbody.innerHTML = `<tr><td colspan="3" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/banks'));
    zetTeller('banks-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map((b, i) => {
          const isOurs = b.bic === huidigeBank.bic;
          return `
            <tr ${isOurs ? 'style="background:rgba(80,200,120,.08)"' : ''}>
              <td class="cel-mono">${i + 1}</td>
              <td class="cel-mono">${b.bic ?? '—'}${isOurs ? ' <span class="badge badge-ok">jij</span>' : ''}</td>
              <td>${b.name ?? '—'}</td>
            </tr>`;
        }).join('')
      : legeRij(3, 'Geen banken in CB-lijst');
  } catch {
    tbody.innerHTML = legeRij(3, '⚠️ Fout bij ophalen van banks (CB onbereikbaar?)');
  }
}

/* ─────────────────────────────────────────────
   Accounts
─────────────────────────────────────────────── */
async function laadAccounts() {
  const tbody = document.getElementById('accounts-rijen');
  tbody.innerHTML = `<tr><td colspan="4" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/accounts'));
    zetTeller('accounts-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map((a, i) => `
          <tr>
            <td class="cel-mono">${i + 1}</td>
            <td class="cel-iban">${a.id ?? '—'}</td>
            <td>${a.owner_name ?? '—'}</td>
            <td>${euro(a.balance)}</td>
          </tr>`).join('')
      : legeRij(4, 'Geen accounts gevonden');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout bij ophalen van accounts');
  }
}

/* ─────────────────────────────────────────────
   PO Aanmaken (generator + manueel)
─────────────────────────────────────────────── */
function laadPoNieuw() {
  // Sectie staat al klaar in HTML; geen data te laden
}

async function genereerPos() {
  const aantal = document.getElementById('po-aantal').value;
  try {
    const data = normaliseer(await apiFetch(`/po_new/generate?count=${aantal}`));
    gegenereerdePos = data;
    document.getElementById('po-nieuw-rijen').innerHTML = gegenereerdePos.map(p => `
      <tr>
        <td class="cel-mono">${p.po_id}</td>
        <td>${euro(p.po_amount)}</td>
        <td class="cel-iban">${p.oa_id}</td>
        <td class="cel-mono">${p.bb_id}</td>
        <td class="cel-iban">${p.ba_id}</td>
        <td>${p.po_message}</td>
      </tr>`).join('');
    voegLogToe('ok', `${gegenereerdePos.length} PO's gegenereerd`);
  } catch (e) {
    voegLogToe('fout', 'Genereren mislukt: ' + e.message);
  }
}

async function slaPoNieuwOp() {
  if (!gegenereerdePos.length) { voegLogToe('info', 'Geen POs om op te slaan'); return; }
  try {
    const r = await fetch(huidigeBank.apiBase + '/po_new/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: gegenereerdePos })
    });
    const data = await r.json();
    voegLogToe(data.ok ? 'ok' : 'fout', data.message);
  } catch (e) {
    voegLogToe('fout', 'Opslaan mislukt: ' + e.message);
  }
}

async function verwerkPoNieuw() {
  try {
    const data = await apiFetch('/po_new/process');
    voegLogToe(data.ok ? 'ok' : 'fout', data.message);
    (data.data || []).forEach(r =>
      voegLogToe(r.code >= 4000 ? 'fout' : 'ok',
        `${r.po_id} → ${r.status} (code: ${r.code})`));
  } catch (e) {
    voegLogToe('fout', 'Verwerken mislukt: ' + e.message);
  }
}

async function verstuurManuelePos() {
  const oa_id   = document.getElementById('m-oa-id')?.value?.trim();
  const ba_id   = document.getElementById('m-ba-id')?.value?.trim();
  const bb_id   = document.getElementById('m-bb-id')?.value?.trim() || huidigeBank.bic;
  const amount  = document.getElementById('m-amount')?.value?.trim();
  const message = document.getElementById('m-message')?.value?.trim();

  if (!oa_id || !ba_id || !bb_id || !amount) {
    voegLogToe('fout', 'Vul alle verplichte velden in (OA, BA, BB, bedrag)');
    return;
  }

  if (!huidigeBank.heeftManuelePo) {
    voegLogToe('info',
      `${huidigeBank.naam} heeft geen GUI-endpoint voor manuele PO. ` +
      `Test via: curl -X POST ${huidigeBank.apiBase}/po_new/manual`);
    return;
  }

  try {
    const r = await fetch(huidigeBank.apiBase + '/po_new/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oa_id, ba_id, bb_id, po_amount: parseFloat(amount), po_message: message })
    });
    const data = await r.json();
    if (data.ok) {
      voegLogToe('ok', `Manuele PO aangemaakt: ${data.data?.po_id}`);
    } else {
      voegLogToe('fout', `Geweigerd (code ${data.code}): ${data.message}`);
    }
  } catch (e) {
    voegLogToe('fout', 'Manuele PO mislukt: ' + e.message);
  }
}

/* ─────────────────────────────────────────────
   PO_OUT
─────────────────────────────────────────────── */
async function laadPoUit() {
  const tbody = document.getElementById('po-uit-rijen');
  tbody.innerHTML = `<tr><td colspan="6" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/po_out'));
    zetTeller('po-uit-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(p => `
          <tr>
            <td class="cel-mono">${p.po_id}</td>
            <td>${euro(p.po_amount)}</td>
            <td>${datumCel(p.po_datetime)}</td>
            <td>${badge(p.ob_code)}</td>
            <td>${badge(p.cb_code)}</td>
            <td>${badge(p.bb_code)}</td>
          </tr>`).join('')
      : legeRij(6, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(6, '⚠️ Fout bij ophalen van PO_OUT');
  }
}

/* ─────────────────────────────────────────────
   PO_IN
─────────────────────────────────────────────── */
async function laadPoIn() {
  const tbody = document.getElementById('po-in-rijen');
  tbody.innerHTML = `<tr><td colspan="5" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/po_in'));
    zetTeller('po-in-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(p => `
          <tr>
            <td class="cel-mono">${p.po_id}</td>
            <td>${euro(p.po_amount)}</td>
            <td class="cel-mono">${p.ob_id ?? '—'}</td>
            <td>${badge(p.cb_code)}</td>
            <td>${badge(p.bb_code)}</td>
          </tr>`).join('')
      : legeRij(5, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(5, '⚠️ Fout bij ophalen van PO_IN');
  }
}

/* ─────────────────────────────────────────────
   ACK_IN
─────────────────────────────────────────────── */
async function laadAckIn() {
  const tbody = document.getElementById('ack-in-rijen');
  tbody.innerHTML = `<tr><td colspan="4" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/ack_in'));
    zetTeller('ack-in-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(a => `
          <tr>
            <td class="cel-mono">${a.po_id}</td>
            <td>${badge(a.cb_code)}</td>
            <td>${badge(a.bb_code)}</td>
            <td>${datumCel(a.received_at)}</td>
          </tr>`).join('')
      : legeRij(4, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout bij ophalen van ACK_IN');
  }
}

/* ─────────────────────────────────────────────
   ACK_OUT
─────────────────────────────────────────────── */
async function laadAckUit() {
  const tbody = document.getElementById('ack-uit-rijen');
  tbody.innerHTML = `<tr><td colspan="3" class="laden">Laden…</td></tr>`;
  try {
    const rijen = normaliseer(await apiFetch('/ack_out'));
    zetTeller('ack-uit-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(a => `
          <tr>
            <td class="cel-mono">${a.po_id}</td>
            <td>${badge(a.bb_code)}</td>
            <td>${datumCel(a.sent_at)}</td>
          </tr>`).join('')
      : legeRij(3, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(3, '⚠️ Fout bij ophalen van ACK_OUT');
  }
}

/* ─────────────────────────────────────────────
   Log-paneel
─────────────────────────────────────────────── */
function voegLogToe(type, bericht) {
  const el = document.getElementById('po-log');
  if (!el) return;
  const div = document.createElement('div');
  div.className = `log-item ${type}`;
  const tijd = new Date().toLocaleTimeString('nl-BE');
  div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ${bericht}`;
  el.prepend(div);
}

/* ─────────────────────────────────────────────
   Initialisatie bij paginaladen
─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initialiseerBankSelector();
});
