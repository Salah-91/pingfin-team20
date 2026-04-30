'use strict';

/* ─────────────────────────────────────────────
   Bank-configuratie
   • localhost:8089 / 8090 direct   → /api van die ene bank
   • Railway / productie            → beide Railway-domeinen, dropdown wisselt
─────────────────────────────────────────────── */
const RAILWAY_BANK1 = 'https://pingfin-team20-production.up.railway.app';
const RAILWAY_BANK2 = 'https://pingfin-team20-bank2-production.up.railway.app';

function buildBanken() {
  const o = window.location.origin;
  const isLocalDirect = o.match(/localhost:(8089|8090)$/);

  if (isLocalDirect) {
    const isBank2 = o.endsWith(':8090');
    return {
      [isBank2 ? 'bank2' : 'bank1']: {
        naam: isBank2 ? 'Bank2' : 'Bank1',
        bic:  isBank2 ? 'HOMNBEB1' : 'CEKVBE88',
        apiBase: o + '/api',
        heeftManuelePo: true,
      }
    };
  }
  return {
    bank1: { naam: 'Bank1', bic: 'CEKVBE88', apiBase: RAILWAY_BANK1 + '/api', heeftManuelePo: true },
    bank2: { naam: 'Bank2', bic: 'HOMNBEB1', apiBase: RAILWAY_BANK2 + '/api', heeftManuelePo: true },
  };
}

const BANKEN     = buildBanken();
const EERSTE_KEY = Object.keys(BANKEN)[0];
const POLL_INTERVAL_MS = 5_000;           // auto-refresh elke 5s (sneller demo-feedback)
const TOAST_DUUR_MS    = 7_000;           // toasts blijven 7s zichtbaar

let huidigeBank      = BANKEN[EERSTE_KEY];
let gegenereerdePos  = [];
let pollTimerId      = null;

/* Snapshots voor diff-detectie. Elke key is een set van po_id's of een
   account-IBAN→saldo map. Bij eerste run vullen we ze stilletjes (geen toasts). */
const snapshot = {
  poIn:   new Set(),
  poOut:  new Map(),    // po_id → status
  ackIn:  new Set(),
  ackOut: new Set(),
  saldi:  new Map(),    // iban → balance
  txIds:  new Set(),    // transaction.id (voor interne PO's die geen po_in/po_out triggeren)
  geinitialiseerd: false,
};

/* Cache voor dropdowns */
const cache = {
  accounts: [],
  banks:    [],
};

/* Ongelezen events per sectie (voor pulse-badge in nav) */
const ongelezen = new Set();

/* ─────────────────────────────────────────────
   Toast notifications
─────────────────────────────────────────────── */
const TOAST_ICONEN = { ok: '✅', fout: '⚠️', info: 'ℹ️', waarschuwing: '🔔' };

function toast(type, titel, tekst) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `
    <span class="toast-icoon">${TOAST_ICONEN[type] ?? '🔔'}</span>
    <div class="toast-inhoud">
      <p class="toast-titel">${titel}</p>
      ${tekst ? `<p class="toast-tekst">${escapeHtml(tekst)}</p>` : ''}
      <p class="toast-tijd">${new Date().toLocaleTimeString('nl-BE')}</p>
    </div>`;
  el.addEventListener('click', () => verwijderToast(el));
  container.appendChild(el);
  setTimeout(() => verwijderToast(el), TOAST_DUUR_MS);
}

function verwijderToast(el) {
  if (!el || !el.parentNode) return;
  el.classList.add('toast--leaving');
  setTimeout(() => el.parentNode && el.parentNode.removeChild(el), 400);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
}

/* ─────────────────────────────────────────────
   Nav badge — pulse bij ongelezen events
─────────────────────────────────────────────── */
function markeerNieuw(sectie) {
  ongelezen.add(sectie);
  document.querySelectorAll('nav.sitenav button').forEach(b => {
    const onclickAttr = b.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${sectie}'`)) b.classList.add('heeft-nieuwe');
  });
}

function leesSectie(sectie) {
  ongelezen.delete(sectie);
  document.querySelectorAll('nav.sitenav button').forEach(b => {
    const onclickAttr = b.getAttribute('onclick') || '';
    if (onclickAttr.includes(`'${sectie}'`)) b.classList.remove('heeft-nieuwe');
  });
}

/* ─────────────────────────────────────────────
   Navigatie
─────────────────────────────────────────────── */
function toonSectie(naam, knop) {
  document.querySelectorAll('.sectie').forEach(s => s.classList.remove('actief'));
  document.querySelectorAll('nav.sitenav button').forEach(b => b.classList.remove('actief'));
  document.getElementById('sectie-' + naam).classList.add('actief');
  knop.classList.add('actief');
  leesSectie(naam);
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

  document.getElementById('header-bic-label').textContent = 'BIC: ' + huidigeBank.bic;
  document.getElementById('aside-bic-waarde').textContent = huidigeBank.bic;
  document.getElementById('aside-banknaam-waarde').textContent = huidigeBank.naam;
  document.title = 'PingFin — ' + huidigeBank.bic;

  // Reset diff-snapshots: andere bank, andere data
  snapshot.poIn.clear();
  snapshot.poOut.clear();
  snapshot.ackIn.clear();
  snapshot.ackOut.clear();
  snapshot.saldi.clear();
  snapshot.geinitialiseerd = false;

  // Refresh caches voor dropdowns
  laadDropdownData();

  const actieveSectie = document.querySelector('.sectie.actief');
  if (actieveSectie) laadSectie(actieveSectie.id.replace('sectie-', ''));
}

function initialiseerBankSelector() {
  const opgeslagen = localStorage.getItem('pingfin_bank');
  const bankKey    = (opgeslagen && BANKEN[opgeslagen]) ? opgeslagen : EERSTE_KEY;
  const selector   = document.getElementById('bank-selector');
  if (selector) {
    Array.from(selector.options).forEach(opt => {
      if (!BANKEN[opt.value]) opt.remove();
    });
    selector.value = bankKey;
    if (Object.keys(BANKEN).length < 2) selector.style.display = 'none';
  }
  wisselBank(bankKey);
}

/* ─────────────────────────────────────────────
   API hulp
─────────────────────────────────────────────── */
async function apiFetch(pad, opties) {
  const antwoord = await fetch(huidigeBank.apiBase + pad, opties);
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  return antwoord.json();
}

function normaliseer(res) {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray(res.data)) return res.data;
  return [];
}

/* ─────────────────────────────────────────────
   Dropdown-data laden (eigen accounts + CB.banks)
─────────────────────────────────────────────── */
async function laadDropdownData() {
  try {
    const [accounts, banks] = await Promise.all([
      apiFetch('/accounts').then(normaliseer).catch(() => []),
      apiFetch('/banks').then(normaliseer).catch(() => []),
    ]);
    cache.accounts = accounts;
    cache.banks    = banks;
    vulManueleDropdowns();
  } catch (err) {
    console.warn('[dropdowns] laden mislukt:', err);
  }
}

function vulManueleDropdowns() {
  // OA: eigen accounts met saldo (XSS-veilig: alle attributen + textContent escapen)
  const oaSel = document.getElementById('m-oa-id');
  if (oaSel) {
    const huidige = oaSel.value;
    oaSel.innerHTML = '<option value="">— kies een eigen rekening —</option>'
      + cache.accounts.map(a =>
          `<option value="${escapeHtml(a.id)}" data-balance="${parseFloat(a.balance ?? 0)}">${escapeHtml(a.id)} — ${escapeHtml(a.owner_name ?? '?')} (€${parseFloat(a.balance ?? 0).toFixed(2)})</option>`
        ).join('');
    if (huidige && cache.accounts.some(a => a.id === huidige)) oaSel.value = huidige;
    updateOaSaldo();
  }

  // BB: bekende banken uit CB + eigen BIC voor interne PO
  const bbSel = document.getElementById('m-bb-id');
  if (bbSel) {
    const huidige = bbSel.value;
    const eigen = `<option value="${escapeHtml(huidigeBank.bic)}">${escapeHtml(huidigeBank.bic)} — ${escapeHtml(huidigeBank.naam)} (intern)</option>`;
    const externen = cache.banks
      .filter(b => (b.bic || b.id) && (b.bic || b.id) !== huidigeBank.bic)
      .map(b => {
        const bic = b.bic || b.id;
        return `<option value="${escapeHtml(bic)}">${escapeHtml(bic)} — ${escapeHtml(b.name ?? '?')}</option>`;
      }).join('');
    bbSel.innerHTML = '<option value="">— kies ontvangende bank —</option>' + eigen + externen;
    if (huidige) bbSel.value = huidige;
    bijBbWijziging();
  }

  // BA: datalist met onze eigen IBANs (handig voor interne PO)
  const baList = document.getElementById('m-ba-suggesties');
  if (baList) {
    baList.innerHTML = cache.accounts.map(a =>
      `<option value="${escapeHtml(a.id)}">${escapeHtml(a.owner_name ?? '?')} — €${parseFloat(a.balance ?? 0).toFixed(2)}</option>`
    ).join('');
  }
}

/* ─────────────────────────────────────────────
   Dev-only links toggle — alleen op localhost zichtbaar
─────────────────────────────────────────────── */
function toonDevLinks() {
  const isLocaal = /^(localhost|127\.|0\.0\.|::1)/i.test(window.location.hostname);
  if (!isLocaal) return;   // op productie blijven links verborgen

  // Aside dev-blok
  const aside = document.getElementById('dev-links');
  if (aside) {
    aside.style.display = '';
    aside.innerHTML = `
      <h3 class="info-blok-titel">🔗 Dev-links (lokaal)</h3>
      <p class="aside-link-rij"><a class="aside-link" href="https://stevenop.be/pingfin/api/v2/" target="_blank" rel="noopener noreferrer">CB API →</a></p>
      <p class="aside-link-rij"><a class="aside-link" href="https://github.com/Salah-91/pingfin-team20" target="_blank" rel="noopener noreferrer">GitHub repo →</a></p>`;
  }
  // Footer dev-links
  const footer = document.getElementById('footer-dev-links');
  if (footer) {
    footer.style.display = '';
    footer.innerHTML = `
      <a href="https://stevenop.be/pingfin/api/v2/" target="_blank" rel="noopener noreferrer">CB API</a>
      <a href="https://github.com/Salah-91/pingfin-team20" target="_blank" rel="noopener noreferrer">GitHub</a>`;
  }
}

function updateOaSaldo() {
  const sel = document.getElementById('m-oa-id');
  const hint = document.getElementById('m-oa-saldo');
  if (!sel || !hint) return;
  const opt = sel.options[sel.selectedIndex];
  const bal = opt?.getAttribute('data-balance');
  if (bal != null && opt.value) {
    const n = parseFloat(bal);
    hint.textContent = `saldo: €${n.toFixed(2)}`;
    hint.className = n > 0 ? 'form-hint form-hint--ok' : 'form-hint form-hint--fout';
  } else {
    hint.textContent = 'saldo: —';
    hint.className = 'form-hint';
  }
}

function bijBbWijziging() {
  const sel  = document.getElementById('m-bb-id');
  const hint = document.getElementById('m-bb-naam');
  if (!sel || !hint) return;
  const v = sel.value;
  if (!v) { hint.textContent = '—'; return; }
  if (v === huidigeBank.bic) {
    hint.textContent = '↻ interne betaling — geen CB-call';
    hint.className = 'form-hint form-hint--ok';
  } else {
    const bank = cache.banks.find(b => (b.bic || b.id) === v);
    hint.textContent = bank ? `→ ${bank.name ?? 'externe bank'}` : '→ externe bank';
    hint.className = 'form-hint';
  }
}

function bijOpenenManuelePo() {
  const det = document.getElementById('manuele-po-details');
  if (det && det.open) laadDropdownData();
}

/* ─────────────────────────────────────────────
   Auto-poll loop met diff-detectie
─────────────────────────────────────────────── */
async function pollLoop() {
  const indicator = document.getElementById('poll-indicator');
  try {
    const [poIn, poOut, ackIn, ackOut, accounts, transactions] = await Promise.all([
      apiFetch('/po_in').then(normaliseer),
      apiFetch('/po_out').then(normaliseer),
      apiFetch('/ack_in').then(normaliseer),
      apiFetch('/ack_out').then(normaliseer),
      apiFetch('/accounts').then(normaliseer),
      apiFetch('/transactions').then(normaliseer),
    ]);

    if (snapshot.geinitialiseerd) {
      diffPoIn(poIn);
      diffPoOut(poOut);
      diffAckIn(ackIn);
      diffAckOut(ackOut);
      diffSaldi(accounts);
      diffTransacties(transactions);
    } else {
      // Eerste run: alleen vullen, geen toasts
      poIn.forEach(p => snapshot.poIn.add(p.po_id));
      poOut.forEach(p => snapshot.poOut.set(p.po_id, p.status));
      ackIn.forEach(a => snapshot.ackIn.add(a.po_id));
      ackOut.forEach(a => snapshot.ackOut.add(a.po_id));
      accounts.forEach(a => snapshot.saldi.set(a.id, parseFloat(a.balance ?? 0)));
      transactions.forEach(t => snapshot.txIds.add(t.id));
      snapshot.geinitialiseerd = true;
      cache.accounts = accounts;
      vulManueleDropdowns();
    }

    // Cache accounts altijd bijwerken voor de dropdown saldi
    cache.accounts = accounts;

    // Auto-refresh van zichtbare sectie
    const actief = document.querySelector('.sectie.actief')?.id?.replace('sectie-', '');
    if (actief) laadSectie(actief);

    indicator?.classList.remove('poll-fout');
  } catch (err) {
    indicator?.classList.add('poll-fout');
    console.warn('[poll] fout:', err.message);
  }
}

// Nieuwe functie: trigger toast bij elke nieuwe transaction (interne PO's komen hier)
function diffTransacties(rijen) {
  const nieuwe = rijen.filter(t => !snapshot.txIds.has(t.id));
  // Groepeer per po_id om dubbele toasts (debit + credit) te vermijden
  const perPo = {};
  nieuwe.forEach(t => {
    snapshot.txIds.add(t.id);
    perPo[t.po_id] = perPo[t.po_id] || [];
    perPo[t.po_id].push(t);
  });
  for (const [poId, txs] of Object.entries(perPo)) {
    const debet  = txs.find(t => parseFloat(t.amount) < 0);
    const credit = txs.find(t => parseFloat(t.amount) > 0);
    if (debet && credit) {
      // Interne PO: één debet + één credit in zelfde bank
      const bedrag = Math.abs(parseFloat(debet.amount)).toFixed(2);
      toast('ok', '🔁 Interne betaling voltooid',
            `${poId} · €${bedrag} · ${debet.account_id} → ${credit.account_id}`);
    } else if (debet) {
      toast('info', '➖ Debit (uitgaande betaling)',
            `${poId} · −€${Math.abs(parseFloat(debet.amount)).toFixed(2)} · ${debet.account_id}`);
    } else if (credit) {
      toast('ok', '➕ Credit (inkomende betaling)',
            `${poId} · +€${parseFloat(credit.amount).toFixed(2)} · ${credit.account_id}`);
    }
    markeerNieuw('transacties');
  }
}

function diffPoIn(rijen) {
  const nieuwe = rijen.filter(p => !snapshot.poIn.has(p.po_id));
  nieuwe.forEach(p => {
    snapshot.poIn.add(p.po_id);
    const code = parseInt(p.bb_code, 10);
    const ok   = code === 2000;
    toast(
      ok ? 'ok' : 'fout',
      ok ? '📥 Nieuwe inkomende PO verwerkt' : `📥 Inkomende PO afgewezen (${p.bb_code})`,
      `${p.po_id} · €${parseFloat(p.po_amount ?? 0).toFixed(2)} van ${p.ob_id}`
    );
    markeerNieuw('po-in');
  });
}

function diffPoOut(rijen) {
  rijen.forEach(p => {
    const oudeStatus = snapshot.poOut.get(p.po_id);
    if (oudeStatus === undefined) {
      snapshot.poOut.set(p.po_id, p.status);
      toast('info', '📤 PO verstuurd', `${p.po_id} · €${parseFloat(p.po_amount ?? 0).toFixed(2)} naar ${p.bb_id}`);
      markeerNieuw('po-uit');
    } else if (oudeStatus !== p.status) {
      snapshot.poOut.set(p.po_id, p.status);
      const map = {
        processed: ['ok',     '✅ PO afgerond'],
        failed:    ['fout',   '✕ PO mislukt'],
        timeout:   ['waarschuwing', '⏰ PO getimeout (1u)'],
      };
      const [type, titel] = map[p.status] || ['info', `PO status → ${p.status}`];
      toast(type, titel, `${p.po_id} · €${parseFloat(p.po_amount ?? 0).toFixed(2)}`);
      markeerNieuw('po-uit');
    }
  });
}

function diffAckIn(rijen) {
  const nieuwe = rijen.filter(a => !snapshot.ackIn.has(a.po_id));
  nieuwe.forEach(a => {
    snapshot.ackIn.add(a.po_id);
    const code = parseInt(a.bb_code, 10);
    const ok   = code === 2000;
    toast(
      ok ? 'ok' : 'fout',
      ok ? '✅ ACK ontvangen' : `✕ Negatieve ACK (${a.bb_code})`,
      `${a.po_id}`
    );
    markeerNieuw('ack-in');
  });
}

function diffAckOut(rijen) {
  const nieuwe = rijen.filter(a => !snapshot.ackOut.has(a.po_id));
  // Bij eerste run zijn er er soms 1000+ ack_out rijen — niet als spam tonen,
  // alleen meldingen geven over écht nieuwe exemplaren ná init
  if (nieuwe.length > 0 && nieuwe.length <= 5) {
    nieuwe.forEach(a => toast('info', '📨 ACK verstuurd', `${a.po_id} (bb_code ${a.bb_code})`));
  } else if (nieuwe.length > 5) {
    toast('info', `📨 ${nieuwe.length} ACKs verstuurd`, 'Bekijk ACK_OUT voor details');
  }
  nieuwe.forEach(a => snapshot.ackOut.add(a.po_id));
  if (nieuwe.length) markeerNieuw('ack-uit');
}

function diffSaldi(accounts) {
  accounts.forEach(a => {
    const nieuw = parseFloat(a.balance ?? 0);
    const oud   = snapshot.saldi.get(a.id);
    if (oud != null && Math.abs(nieuw - oud) > 0.001) {
      const delta = nieuw - oud;
      const teken = delta > 0 ? '+' : '';
      toast(
        delta > 0 ? 'ok' : 'waarschuwing',
        `💰 Saldo gewijzigd · ${a.owner_name ?? a.id}`,
        `${a.id}: €${oud.toFixed(2)} → €${nieuw.toFixed(2)} (${teken}€${delta.toFixed(2)})`
      );
      markeerNieuw('accounts');
    }
    snapshot.saldi.set(a.id, nieuw);
  });
}

function startAutoPoll() {
  if (pollTimerId) clearInterval(pollTimerId);
  pollLoop();   // direct éérste keer
  pollTimerId = setInterval(pollLoop, POLL_INTERVAL_MS);
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

/* ─────────────────────────────────────────────
   Dashboard
─────────────────────────────────────────────── */
async function laadDashboard() {
  try {
    const res = await apiFetch('/info');
    const d   = res.data ?? res ?? {};
    // XSS-veilig: alle backend-velden eerst escapen
    document.getElementById('info-inhoud').innerHTML = `
      <div class="info-rij"><span class="info-label">Banknaam</span><span class="info-waarde">${escapeHtml(d.bank_name ?? '—')}</span></div>
      <div class="info-rij"><span class="info-label">BIC</span><span class="info-waarde">${escapeHtml(d.bic ?? '—')}</span></div>
      <div class="info-rij"><span class="info-label">Team</span><span class="info-waarde">${escapeHtml(d.team ?? '—')}</span></div>
      <div class="leden-raster">
        ${(d.members || []).map(m => `
          <div class="lid-kaart">
            <div class="lid-avatar">${escapeHtml((m.name ?? '?')[0])}</div>
            <div class="lid-naam">${escapeHtml(m.name ?? '')}</div>
            <div class="lid-rol">${escapeHtml(m.role ?? '')}</div>
          </div>`).join('')}
      </div>`;
  } catch {
    document.getElementById('info-inhoud').innerHTML =
      '<div class="leeg"><div class="leeg-icoon">⚠️</div><div class="leeg-tekst">API niet bereikbaar — controleer de server</div></div>';
  }

  try {
    const [acc, poUit, poIn, ackIn, tx, logs] = await Promise.all([
      apiFetch('/accounts'), apiFetch('/po_out'),
      apiFetch('/po_in'),    apiFetch('/ack_in'),
      apiFetch('/transactions'), apiFetch('/logs?limit=1000'),
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
   Quick Actions
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
    toast('ok', `Job '${naam}' uitgevoerd`, samenvatting);
    pollLoop();   // forceer een poll-pass om events op te pikken
  } catch (e) {
    div.className = 'log-item fout';
    div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ✕ ${naam}: ${e.message}`;
    toast('fout', `Job '${naam}' mislukt`, e.message);
  }
}

/* ─────────────────────────────────────────────
   Tabel-laders (worden bij elke poll opnieuw gerenderd)
─────────────────────────────────────────────── */
async function laadAccounts() {
  const tbody = document.getElementById('accounts-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/accounts'));
    zetTeller('accounts-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map((a, i) => `
          <tr>
            <td class="cel-mono">${i + 1}</td>
            <td class="cel-iban">${escapeHtml(a.id ?? '—')}</td>
            <td>${escapeHtml(a.owner_name ?? '—')}</td>
            <td>${euro(a.balance)}</td>
          </tr>`).join('')
      : legeRij(4, 'Geen accounts');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout bij ophalen van accounts');
  }
}

async function laadTransacties() {
  const tbody = document.getElementById('tx-rijen');
  if (!tbody) return;
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
          return `<tr>
            <td class="cel-mono">${escapeHtml(t.po_id ?? '—')}</td>
            <td class="cel-iban">${escapeHtml(t.account_id ?? '—')}</td>
            <td><span class="badge ${klasse}">${teken}€${Math.abs(bedrag).toFixed(2)}</span></td>
            <td>${valid}</td><td>${compl}</td>
            <td>${datumCel(t.datetime)}</td></tr>`;
        }).join('')
      : legeRij(6, 'Nog geen transacties');
  } catch {
    tbody.innerHTML = legeRij(6, '⚠️ Fout bij ophalen van transacties');
  }
}

async function laadLogs() {
  const tbody = document.getElementById('logs-rijen');
  if (!tbody) return;
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
          return `<tr class="${cls}" style="background:transparent">
            <td class="cel-mono">${datumCel(l.datetime)}</td>
            <td class="cel-mono">${escapeHtml(l.type ?? '—')}</td>
            <td>${escapeHtml(l.message ?? '')}</td>
            <td class="cel-mono">${escapeHtml(l.po_id ?? '—')}</td></tr>`;
        }).join('')
      : legeRij(4, 'Geen log-events');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout bij ophalen van logs');
  }
}

async function laadBanks() {
  const tbody = document.getElementById('banks-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/banks'));
    cache.banks = rijen;
    zetTeller('banks-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map((b, i) => {
          const isOurs = (b.bic || b.id) === huidigeBank.bic;
          return `<tr ${isOurs ? 'style="background:rgba(80,200,120,.08)"' : ''}>
            <td class="cel-mono">${i + 1}</td>
            <td class="cel-mono">${escapeHtml(b.bic ?? b.id ?? '—')}${isOurs ? ' <span class="badge badge-ok">jij</span>' : ''}</td>
            <td>${escapeHtml(b.name ?? '—')}</td></tr>`;
        }).join('')
      : legeRij(3, 'Geen banken in CB-lijst');
  } catch {
    tbody.innerHTML = legeRij(3, '⚠️ Fout bij ophalen van banks');
  }
}

/* PO-tabellen */
async function laadPoUit() {
  const tbody = document.getElementById('po-uit-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/po_out'));
    zetTeller('po-uit-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(p => `<tr>
          <td class="cel-mono">${escapeHtml(p.po_id)}</td>
          <td>${euro(p.po_amount)}</td>
          <td>${datumCel(p.po_datetime)}</td>
          <td>${badge(p.ob_code)}</td>
          <td>${badge(p.cb_code)}</td>
          <td>${badge(p.bb_code)}</td></tr>`).join('')
      : legeRij(6, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(6, '⚠️ Fout');
  }
}

async function laadPoIn() {
  const tbody = document.getElementById('po-in-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/po_in'));
    zetTeller('po-in-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(p => `<tr>
          <td class="cel-mono">${escapeHtml(p.po_id)}</td>
          <td>${euro(p.po_amount)}</td>
          <td class="cel-mono">${escapeHtml(p.ob_id ?? '—')}</td>
          <td>${badge(p.cb_code)}</td>
          <td>${badge(p.bb_code)}</td></tr>`).join('')
      : legeRij(5, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(5, '⚠️ Fout');
  }
}

async function laadAckIn() {
  const tbody = document.getElementById('ack-in-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/ack_in'));
    zetTeller('ack-in-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(a => `<tr>
          <td class="cel-mono">${escapeHtml(a.po_id)}</td>
          <td>${badge(a.cb_code)}</td>
          <td>${badge(a.bb_code)}</td>
          <td>${datumCel(a.received_at)}</td></tr>`).join('')
      : legeRij(4, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(4, '⚠️ Fout');
  }
}

async function laadAckUit() {
  const tbody = document.getElementById('ack-uit-rijen');
  if (!tbody) return;
  try {
    const rijen = normaliseer(await apiFetch('/ack_out'));
    zetTeller('ack-uit-teller', rijen);
    tbody.innerHTML = rijen.length
      ? rijen.map(a => `<tr>
          <td class="cel-mono">${escapeHtml(a.po_id)}</td>
          <td>${badge(a.bb_code)}</td>
          <td>${datumCel(a.sent_at)}</td></tr>`).join('')
      : legeRij(3, 'Geen data');
  } catch {
    tbody.innerHTML = legeRij(3, '⚠️ Fout');
  }
}

/* ─────────────────────────────────────────────
   PO Aanmaken (generator + manueel)
─────────────────────────────────────────────── */
function laadPoNieuw() { /* statisch HTML; auto-poll vult dropdowns */ }

async function genereerPos() {
  const aantal = document.getElementById('po-aantal').value;
  try {
    const data = normaliseer(await apiFetch(`/po_new/generate?count=${aantal}`));
    gegenereerdePos = data;
    document.getElementById('po-nieuw-rijen').innerHTML = gegenereerdePos.map(p => `
      <tr>
        <td class="cel-mono">${escapeHtml(p.po_id)}</td>
        <td>${euro(p.po_amount)}</td>
        <td class="cel-iban">${escapeHtml(p.oa_id)}</td>
        <td class="cel-mono">${escapeHtml(p.bb_id)}</td>
        <td class="cel-iban">${escapeHtml(p.ba_id)}</td>
        <td>${escapeHtml(p.po_message ?? '')}</td>
      </tr>`).join('');
    voegLogToe('ok', `${gegenereerdePos.length} PO's gegenereerd`);
    toast('ok', `${gegenereerdePos.length} PO's gegenereerd`, 'Klik op Opslaan om ze in PO_NEW te plaatsen');
  } catch (e) {
    voegLogToe('fout', 'Genereren mislukt: ' + e.message);
    toast('fout', 'Genereren mislukt', e.message);
  }
}

async function slaPoNieuwOp() {
  if (!gegenereerdePos.length) {
    toast('info', 'Niets om op te slaan', 'Genereer eerst PO\'s');
    return;
  }
  try {
    const r = await fetch(huidigeBank.apiBase + '/po_new/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: gegenereerdePos })
    });
    const data = await r.json();
    voegLogToe(data.ok ? 'ok' : 'fout', data.message);
    toast(data.ok ? 'ok' : 'fout', data.ok ? 'PO\'s opgeslagen' : 'Opslaan mislukt', data.message);
  } catch (e) {
    voegLogToe('fout', 'Opslaan mislukt: ' + e.message);
    toast('fout', 'Opslaan mislukt', e.message);
  }
}

async function verwerkPoNieuw() {
  try {
    const data = await apiFetch('/po_new/process');
    voegLogToe(data.ok ? 'ok' : 'fout', data.message);
    toast(data.ok ? 'ok' : 'fout', 'PO_NEW verwerkt', data.message);
    (data.data || []).forEach(r =>
      voegLogToe(r.code >= 4000 ? 'fout' : 'ok',
        `${r.po_id} → ${r.status} (code: ${r.code})`));
    pollLoop();
  } catch (e) {
    voegLogToe('fout', 'Verwerken mislukt: ' + e.message);
    toast('fout', 'Verwerken mislukt', e.message);
  }
}

async function verstuurManuelePos() {
  const oa_id   = document.getElementById('m-oa-id')?.value?.trim();
  const ba_id   = document.getElementById('m-ba-id')?.value?.trim();
  const bb_id   = document.getElementById('m-bb-id')?.value?.trim() || huidigeBank.bic;
  const amount  = document.getElementById('m-amount')?.value?.trim();
  const message = document.getElementById('m-message')?.value?.trim();

  // Inline-validatie met directe feedback
  if (!oa_id) { toast('fout', 'OA niet geselecteerd', 'Kies een eigen rekening'); return; }
  if (!ba_id) { toast('fout', 'BA IBAN ontbreekt', 'Vul de ontvangende rekening in'); return; }
  if (!bb_id) { toast('fout', 'BB BIC ontbreekt', 'Kies een ontvangende bank'); return; }
  if (!amount) { toast('fout', 'Bedrag ontbreekt', 'Vul een bedrag in'); return; }

  const bedrag = parseFloat(amount);
  if (!(bedrag > 0))      { toast('fout', 'Ongeldig bedrag', 'Moet > 0 zijn'); return; }
  if (bedrag > 500)       { toast('fout', 'Bedrag te hoog', 'Max €500 per PO'); return; }
  if (oa_id === ba_id && bb_id === huidigeBank.bic) {
    toast('fout', 'Zelfde rekening', 'OA en BA moeten verschillen bij interne PO'); return;
  }

  // Lokale saldo-check (preventieve UX-warning, server valideert opnieuw)
  const oaAcc = cache.accounts.find(a => a.id === oa_id);
  if (oaAcc && parseFloat(oaAcc.balance) < bedrag) {
    toast('waarschuwing', 'Saldo waarschijnlijk te laag', `${oa_id} heeft €${parseFloat(oaAcc.balance).toFixed(2)} (nodig: €${bedrag.toFixed(2)})`);
    // doorgaan — server geeft 4102 als 't echt niet kan
  }

  try {
    const r = await fetch(huidigeBank.apiBase + '/po_new/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oa_id, ba_id, bb_id, po_amount: bedrag, po_message: message })
    });
    const data = await r.json();
    if (data.ok) {
      voegLogToe('ok', `Manuele PO aangemaakt: ${data.data?.po_id}`);
      toast('ok', 'Manuele PO aangemaakt', `${data.data?.po_id} — wordt automatisch verwerkt…`);
      // Velden leegmaken voor volgende
      document.getElementById('m-amount').value = '';
      document.getElementById('m-message').value = '';
      document.getElementById('m-ba-id').value = '';

      // Auto-trigger process zodat user niet ook nog op "Verwerk" moet klikken
      try {
        const r2 = await apiFetch('/po_new/process');
        toast(r2.ok ? 'ok' : 'fout', '⚙️ Auto-verwerkt', r2.message ?? '');
      } catch {}

      // Force poll-pass om saldo/tx-toasts meteen te tonen
      pollLoop();
    } else {
      voegLogToe('fout', `Geweigerd (code ${data.code}): ${data.message}`);
      toast('fout', `PO geweigerd (${data.code})`, data.message);
    }
  } catch (e) {
    voegLogToe('fout', 'Manuele PO mislukt: ' + e.message);
    toast('fout', 'Manuele PO mislukt', e.message);
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
  div.innerHTML = `<span class="log-tijd">[${tijd}]</span> ${escapeHtml(bericht)}`;
  el.prepend(div);
}

/* ─────────────────────────────────────────────
   Init
─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initialiseerBankSelector();
  toonDevLinks();
  startAutoPoll();
});
