require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const pool = require('./db');
const C = require('./codes');

// Verplichte env vars
const REQUIRED = ['CB_TOKEN2', 'DB2_HOST', 'DB2_USER', 'DB2_PASS', 'DB2_NAME'];
const missing = REQUIRED.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[STARTUP] Ontbrekende env vars: ${missing.join(', ')}`);
  console.error('[STARTUP] Kopieer .env.example naar .env en vul de waarden in.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT2 || 3001;
const BIC = process.env.CB_BIC2 || 'HOMNBEB1';
const CB_URL = (process.env.CB_URL2 || 'https://stevenop.be/pingfin/api/v2').replace(/\/$/, '');

app.use(cors());
app.use(express.json());

// ─── helpers ─────────────────────────────────────────────────────────────────

function now() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

function generatePoId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const rand = Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
  return `${BIC}_${rand}`;
}

function validBic(bic) {
  return /^[A-Z]{4}BE[A-Z0-9]{2}$/.test(bic);
}

function validIban(iban) {
  return /^BE\d{14}$/.test(iban);
}

function validAmount(amount) {
  const n = parseFloat(amount);
  if (isNaN(n) || n <= 0) return false;
  if (n > 500) return false;
  if (Math.round(n * 100) !== n * 100) return false;
  return true;
}

async function writeLog(po_id, type, message) {
  try {
    await pool.query(
      'INSERT INTO logs (po_id, type, message, created_at) VALUES (?,?,?,?)',
      [po_id || null, type, message, now()]
    );
  } catch {}
}

async function writeTransaction(po_id, from_iban, to_iban, amount) {
  await pool.query(
    'INSERT INTO transactions (po_id, from_iban, to_iban, amount, processed_at) VALUES (?,?,?,?,?)',
    [po_id, from_iban, to_iban, amount, now()]
  );
}

// ─── GET / — health check ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({ ok: true, status: 200, message: `PingFin Bank2 (${BIC}) draait`, data: null });
});

// ─── GET /accounts ───────────────────────────────────────────────────────────

app.get('/accounts', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, owner_name, balance FROM accounts ORDER BY id');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_in ───────────────────────────────────────────────────────────────

app.get('/po_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_in ORDER BY po_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_out ──────────────────────────────────────────────────────────────

app.get('/po_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM po_out ORDER BY ob_datetime DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /ack_in ──────────────────────────────────────────────────────────────

app.get('/ack_in', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_in ORDER BY received_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /ack_out ─────────────────────────────────────────────────────────────

app.get('/ack_out', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM ack_out ORDER BY sent_at DESC');
    res.json({ ok: true, status: 200, code: null, message: null, data: rows });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_in — ontvang inkomende PO van CB (wij = BB) ────────────────────

app.post('/po_in', async (req, res) => {
  const raw = req.body;
  const poList = Array.isArray(raw.data) ? raw.data : (Array.isArray(raw) ? raw : [raw]);
  const results = [];

  for (const po of poList) {
    const ts = now();

    // Duplicate check
    try {
      const [dup] = await pool.query('SELECT po_id FROM po_in WHERE po_id = ?', [po.po_id]);
      if (dup.length > 0) {
        await writeLog(po.po_id, 'po_rejected', 'Duplicate po_id ontvangen');
        results.push({ po_id: po.po_id, bb_code: C.DUPLICATE_PO, bb_datetime: ts });
        continue;
      }
    } catch (err) {
      await writeLog(po.po_id, 'error', `DB fout bij duplicate check: ${err.message}`);
      results.push({ po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts });
      continue;
    }

    // Valideer bedrag
    if (!validAmount(po.po_amount)) {
      const code = parseFloat(po.po_amount) <= 0 ? C.AMOUNT_INVALID : C.AMOUNT_EXCEEDED;
      await writeLog(po.po_id, 'po_rejected', `Ongeldig bedrag: ${po.po_amount}`);
      try {
        await pool.query(
          'INSERT INTO po_in (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,ob_code,cb_code,bb_id,ba_id,bb_code,bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || ts,
           po.ob_id, po.oa_id, po.ob_code || null, po.cb_code || null,
           po.bb_id || BIC, po.ba_id, code, ts]
        );
      } catch {}
      results.push({ po_id: po.po_id, bb_code: code, bb_datetime: ts });
      continue;
    }

    // Valideer BA — ontvanger mag altijd geld ontvangen, geen saldo-check nodig
    try {
      const [ba] = await pool.query('SELECT id FROM accounts WHERE id = ?', [po.ba_id]);
      if (ba.length === 0) {
        await writeLog(po.po_id, 'po_rejected', `BA onbekend: ${po.ba_id}`);
        await pool.query(
          'INSERT INTO po_in (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,ob_code,cb_code,bb_id,ba_id,bb_code,bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
          [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || ts,
           po.ob_id, po.oa_id, po.ob_code || null, po.cb_code || null,
           po.bb_id || BIC, po.ba_id, C.ACCOUNT_UNKNOWN, ts]
        );
        results.push({ po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts });
        continue;
      }
    } catch (err) {
      await writeLog(po.po_id, 'error', `DB fout bij BA-check: ${err.message}`);
      results.push({ po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts });
      continue;
    }

    // Crediteer BA (balance + amount — NOOIT balance - amount)
    try {
      await pool.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.ba_id]);
      await pool.query(
        'INSERT INTO po_in (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,ob_code,ob_datetime,cb_code,cb_datetime,bb_id,ba_id,bb_code,bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || ts,
         po.ob_id, po.oa_id, po.ob_code || null, po.ob_datetime || null,
         po.cb_code || null, po.cb_datetime || null,
         po.bb_id || BIC, po.ba_id, C.OK, ts]
      );
      await writeTransaction(po.po_id, po.oa_id, po.ba_id, po.po_amount);
      await pool.query(
        'INSERT INTO ack_out (po_id,bb_code,bb_datetime,sent_at) VALUES (?,?,?,?)',
        [po.po_id, C.OK, ts, ts]
      );
      await writeLog(po.po_id, 'ba_credited', `BA ${po.ba_id} gecrediteerd €${po.po_amount}`);
      results.push({ po_id: po.po_id, bb_code: C.OK, bb_datetime: ts });
    } catch (err) {
      await writeLog(po.po_id, 'error', `Fout bij crediteren BA: ${err.message}`);
      results.push({ po_id: po.po_id, bb_code: C.ACCOUNT_UNKNOWN, bb_datetime: ts });
    }
  }

  res.json({ ok: true, status: 200, code: null, message: null, data: results });
});

// ─── POST /ack_in — ontvang ACK van CB voor onze uitgaande PO ─────────────────

app.post('/ack_in', async (req, res) => {
  try {
    const body = req.body;
    const ackList = Array.isArray(body.data) ? body.data : (Array.isArray(body) ? body : [body]);

    for (const ack of ackList) {
      const { po_id, cb_code, cb_datetime, bb_code, bb_datetime } = ack;
      const ts = now();
      if (!po_id) continue;

      await pool.query(
        'INSERT INTO ack_in (po_id,cb_code,cb_datetime,bb_code,bb_datetime,received_at) VALUES (?,?,?,?,?,?)',
        [po_id, cb_code || null, cb_datetime || null, bb_code || null, bb_datetime || null, ts]
      );

      const [poOut] = await pool.query('SELECT * FROM po_out WHERE po_id = ?', [po_id]);
      if (poOut.length === 0) {
        await writeLog(po_id, 'ack_unknown', `ACK voor onbekende PO: ${po_id}`);
        continue;
      }

      const po = poOut[0];
      if (parseInt(bb_code) === C.OK) {
        await pool.query('UPDATE po_out SET bb_code=?,bb_datetime=?,status=? WHERE po_id=?',
          [bb_code, bb_datetime || ts, 'processed', po_id]);
        await writeLog(po_id, 'ack_processed', `ACK ok: betaling bevestigd`);
      } else {
        await pool.query('UPDATE po_out SET bb_code=?,bb_datetime=?,status=? WHERE po_id=?',
          [bb_code, bb_datetime || ts, 'failed', po_id]);
        await pool.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.oa_id]);
        await writeTransaction(po_id, po.ba_id, po.oa_id, po.po_amount);
        await writeLog(po_id, 'oa_refunded', `ACK negatief (${bb_code}): OA ${po.oa_id} teruggestort €${po.po_amount}`);
      }

      if (cb_code !== null && cb_code !== undefined) {
        await pool.query('UPDATE po_out SET cb_code=?,cb_datetime=? WHERE po_id=?',
          [cb_code, cb_datetime || ts, po_id]);
      }
    }

    res.json({ ok: true, status: 200, code: null, message: 'ACK(s) verwerkt', data: null });
  } catch (err) {
    await writeLog(null, 'error', `ack_in fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_new/generate ────────────────────────────────────────────────────

app.get('/po_new/generate', async (req, res) => {
  try {
    const [accounts] = await pool.query('SELECT id FROM accounts');
    if (accounts.length === 0)
      return res.status(500).json({ ok: false, status: 500, code: null, message: 'Geen accounts in DB', data: null });

    const ibans = accounts.map(a => a.id);
    let banks = ['GKCCBEBB', 'BBRUBEBB', 'CEKVBE88'];
    try {
      const resp = await fetch(`${CB_URL}/banks`, {
        headers: { 'Authorization': `Bearer ${process.env.CB_TOKEN2 || ''}` }
      });
      const data = await resp.json();
      const fetched = (data.data || []).map(b => b.bic || b.id).filter(b => b && b !== BIC);
      if (fetched.length > 0) banks = fetched;
    } catch {}

    const count = Math.min(parseInt(req.query.count) || 5, 50);
    const messages = ['Huurkosten april', 'Factuur 2026-001', 'Aankoop materiaal', 'Terugbetaling', 'Projectbijdrage'];
    const pos = [];

    for (let i = 0; i < count; i++) {
      const oa = ibans[Math.floor(Math.random() * ibans.length)];
      const bb = banks[Math.floor(Math.random() * banks.length)];
      const ba = `BE${Math.floor(Math.random() * 90 + 10)}${String(Math.floor(Math.random() * 1e14)).padStart(14, '0')}`;
      const amount = Math.round((Math.random() * 499 + 1) * 100) / 100;
      pos.push({
        po_id: generatePoId(),
        po_amount: amount,
        po_message: messages[i % messages.length],
        po_datetime: now(),
        ob_id: BIC,
        oa_id: oa,
        ob_code: null, ob_datetime: null,
        cb_code: null, cb_datetime: null,
        bb_id: bb,
        ba_id: ba,
        bb_code: null, bb_datetime: null,
      });
    }

    await writeLog(null, 'po_generated', `${count} POs automatisch gegenereerd`);
    res.json({ ok: true, status: 200, code: null, message: `Generated ${count} POs`, data: pos });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_new/add ────────────────────────────────────────────────────────

app.post('/po_new/add', async (req, res) => {
  try {
    const pos = req.body.data;
    if (!Array.isArray(pos) || pos.length === 0)
      return res.status(400).json({ ok: false, status: 400, code: null, message: 'data moet een niet-lege array zijn', data: null });

    for (const po of pos) {
      await pool.query(
        'INSERT INTO po_new (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message || null, po.po_datetime || now(), po.ob_id || BIC, po.oa_id, po.bb_id, po.ba_id]
      );
    }
    await writeLog(null, 'po_added', `${pos.length} POs toegevoegd aan po_new`);
    res.json({ ok: true, status: 200, code: null, message: `${pos.length} POs toegevoegd aan PO_NEW`, data: null });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── POST /po_new/manual — manuele PO ────────────────────────────────────────

app.post('/po_new/manual', async (req, res) => {
  try {
    const { po_amount, po_message, oa_id, ob_id, ba_id, bb_id } = req.body;

    if (!oa_id || !ba_id || !bb_id)
      return res.status(400).json({ ok: false, status: 400, code: C.ACCOUNT_UNKNOWN, message: 'oa_id, ba_id en bb_id zijn verplicht', data: null });
    if (!validAmount(po_amount)) {
      const code = parseFloat(po_amount) <= 0 ? C.AMOUNT_INVALID : C.AMOUNT_EXCEEDED;
      return res.status(400).json({ ok: false, status: 400, code, message: 'Ongeldig bedrag', data: null });
    }
    if (!validBic(bb_id))
      return res.status(400).json({ ok: false, status: 400, code: C.BB_UNKNOWN, message: 'Ongeldige BB BIC', data: null });

    const po_id = generatePoId();
    const ts = now();

    await pool.query(
      'INSERT INTO po_new (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,bb_id,ba_id) VALUES (?,?,?,?,?,?,?,?)',
      [po_id, po_amount, po_message || null, ts, ob_id || BIC, oa_id, bb_id, ba_id]
    );
    await writeLog(po_id, 'po_manual', `Manuele PO aangemaakt: ${po_id}`);
    res.json({ ok: true, status: 200, code: null, message: 'Manuele PO toegevoegd aan PO_NEW', data: { po_id } });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── GET /po_new/process ─────────────────────────────────────────────────────

app.get('/po_new/process', async (req, res) => {
  try {
    const [pos] = await pool.query('SELECT * FROM po_new');
    if (pos.length === 0)
      return res.json({ ok: true, status: 200, code: null, message: 'Geen POs te verwerken', data: [] });

    const results = [];

    for (const po of pos) {
      const isInternal = po.bb_id === BIC;

      // Validatie
      let errorCode = null;
      if (parseFloat(po.po_amount) <= 0 || isNaN(parseFloat(po.po_amount))) {
        errorCode = C.AMOUNT_INVALID;
      } else if (parseFloat(po.po_amount) > 500) {
        errorCode = C.AMOUNT_EXCEEDED;
      } else {
        const [oa] = await pool.query('SELECT id, balance FROM accounts WHERE id = ?', [po.oa_id]);
        if (oa.length === 0) errorCode = C.ACCOUNT_UNKNOWN;
        else if (parseFloat(oa[0].balance) < parseFloat(po.po_amount)) errorCode = C.INSUFFICIENT_BALANCE;
      }

      if (errorCode !== null) {
        await writeLog(po.po_id, 'po_rejected', `Validatie mislukt: code ${errorCode}`);
        await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
        results.push({ po_id: po.po_id, status: 'REJECTED', code: errorCode });
        continue;
      }

      // Interne betaling
      if (isInternal) {
        if (po.oa_id === po.ba_id) {
          await writeLog(po.po_id, 'po_rejected', 'OA en BA zijn dezelfde rekening');
          await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
          results.push({ po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN, message: 'OA en BA mogen niet gelijk zijn' });
          continue;
        }
        const [ba] = await pool.query('SELECT id FROM accounts WHERE id = ?', [po.ba_id]);
        if (ba.length === 0) {
          await writeLog(po.po_id, 'po_rejected', `BA onbekend: ${po.ba_id}`);
          await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
          results.push({ po_id: po.po_id, status: 'REJECTED', code: C.ACCOUNT_UNKNOWN });
          continue;
        }

        const conn = await pool.getConnection();
        await conn.beginTransaction();
        try {
          await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.oa_id]);
          await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [po.po_amount, po.ba_id]);
          await conn.query(
            'INSERT INTO transactions (po_id,from_iban,to_iban,amount,processed_at) VALUES (?,?,?,?,?)',
            [po.po_id, po.oa_id, po.ba_id, po.po_amount, now()]
          );
          await conn.commit();
        } catch (e) {
          await conn.rollback();
          conn.release();
          await writeLog(po.po_id, 'error', `Interne transactie mislukt: ${e.message}`);
          await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
          results.push({ po_id: po.po_id, status: 'FAILED', code: C.INTERNAL_TX });
          continue;
        }
        conn.release();
        await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
        await writeLog(po.po_id, 'po_internal', `Interne betaling: ${po.oa_id} → ${po.ba_id} €${po.po_amount}`);
        results.push({ po_id: po.po_id, status: 'COMPLETED', code: C.OK, type: 'internal' });
        continue;
      }

      // Externe betaling
      const ts = now();
      await pool.query(
        `INSERT INTO po_out
          (po_id,po_amount,po_message,po_datetime,ob_id,oa_id,ob_code,ob_datetime,bb_id,ba_id,status)
          VALUES (?,?,?,?,?,?,?,?,?,?,'pending')`,
        [po.po_id, po.po_amount, po.po_message, po.po_datetime, po.ob_id, po.oa_id,
         C.OK, ts, po.bb_id, po.ba_id]
      );
      await pool.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.oa_id]);
      await writeTransaction(po.po_id, po.oa_id, po.ba_id, po.po_amount);
      await writeLog(po.po_id, 'oa_debited', `OA ${po.oa_id} gedebiteerd €${po.po_amount}`);

      let cbCode = null;
      try {
        const cbResp = await fetch(`${CB_URL}/po_in`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.CB_TOKEN2 || ''}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ data: [po] })
        });
        const cbData = await cbResp.json();
        cbCode = (cbData.data && cbData.data[0] && cbData.data[0].cb_code) || cbData.code || null;
        await pool.query('UPDATE po_out SET cb_code=?,cb_datetime=? WHERE po_id=?', [cbCode, now(), po.po_id]);
        await writeLog(po.po_id, 'po_sent_cb', `PO verstuurd naar CB, cb_code: ${cbCode}`);
      } catch (cbErr) {
        await writeLog(po.po_id, 'cb_error', `CB-call mislukt: ${cbErr.message}`);
      }

      await pool.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      results.push({ po_id: po.po_id, status: 'PENDING', code: C.OK, type: 'external', cb_code: cbCode });
    }

    res.json({ ok: true, status: 200, code: null, message: `${pos.length} POs verwerkt`, data: results });
  } catch (err) {
    await writeLog(null, 'error', `po_new/process fout: ${err.message}`);
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

// ─── 404 ─────────────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ ok: false, status: 404, code: null, message: 'Endpoint niet gevonden', data: null });
});

app.listen(PORT, () => console.log(`Bank2 (${BIC}) draait op poort ${PORT}`));
