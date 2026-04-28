const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT2 || 3001;
const BIC = 'HOMNBEB1';
const CB_TOKEN = process.env.CB_TOKEN2 || 'TIoGqcquxBsXM47B4LjkCKd67CqIQxWv';
const CB_URL = 'https://stevenop.be/pingfin/api/v2';

app.use(cors());
app.use(express.json());

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function generatePoId() {
  return BIC + '-' + Date.now() + '-' + Math.floor(Math.random() * 9000 + 1000);
}

function randomAccount(accounts) {
  return accounts[Math.floor(Math.random() * accounts.length)];
}

function randomAmount() {
  return parseFloat((Math.random() * 990 + 10).toFixed(2));
}

function randomMessage() {
  const msgs = ['Betaling factuur', 'Maandelijkse bijdrage', 'Terugbetaling', 'Aankoop', 'Overmaking', 'Gift', 'Reservering', 'Abonnement'];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

async function cbRequest(method, path, body) {
  const res = await fetch(CB_URL + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + CB_TOKEN },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

// ─── INFO ──────────────────────────────────────────────────────────────────────

app.get('/api/info', (req, res) => {
  res.json({
    ok: true,
    data: {
      bic: BIC,
      bank_name: 'PingFin Bank 2 — Team 20',
      team: 'Team 20',
      members: [
        { name: 'Salaheddine Sennouni', role: 'developer' },
        { name: 'Abdallah Azouagh', role: 'developer' },
        { name: 'Ayoub Abdeddoun', role: 'developer' }
      ]
    }
  });
});

// ─── ACCOUNTS ─────────────────────────────────────────────────────────────────

app.get('/api/accounts', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM accounts ORDER BY id');
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── PO_NEW ───────────────────────────────────────────────────────────────────

app.get('/api/po_new/generate', async (req, res) => {
  try {
    const count = parseInt(req.query.count) || 5;
    const [accounts] = await db.query('SELECT id FROM accounts');
    const [banks] = await fetch(CB_URL + '/banks', { headers: { Authorization: 'Bearer ' + CB_TOKEN } }).then(r => r.json()).then(d => [d.data || []]);
    const otherBanks = banks.filter(b => b.bic !== BIC);
    const pos = [];
    for (let i = 0; i < count; i++) {
      const oa = randomAccount(accounts);
      const targetBank = otherBanks.length ? otherBanks[Math.floor(Math.random() * otherBanks.length)] : null;
      pos.push({
        po_id: generatePoId(),
        po_amount: randomAmount(),
        po_message: randomMessage(),
        po_datetime: new Date().toISOString().slice(0, 19).replace('T', ' '),
        ob_id: BIC,
        oa_id: oa.id,
        bb_id: targetBank ? targetBank.bic : BIC,
        ba_id: 'BE11000000000001'
      });
    }
    res.json({ ok: true, data: pos });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.post('/api/po_new/add', async (req, res) => {
  try {
    const pos = req.body.data || [];
    for (const po of pos) {
      await db.query(
        'INSERT IGNORE INTO po_new (po_id, po_amount, po_message, po_datetime, ob_id, oa_id, bb_id, ba_id) VALUES (?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message, po.po_datetime, po.ob_id, po.oa_id, po.bb_id, po.ba_id]
      );
    }
    res.json({ ok: true, message: pos.length + ' POs toegevoegd aan po_new' });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get('/api/po_new/process', async (req, res) => {
  try {
    const [pos] = await db.query('SELECT * FROM po_new');
    if (!pos.length) return res.json({ ok: true, message: 'Geen POs in po_new', data: [] });
    const results = [];
    for (const po of pos) {
      // Stuur naar CB
      const cbRes = await cbRequest('POST', '/po', {
        po_id: po.po_id, po_amount: po.po_amount, po_message: po.po_message,
        po_datetime: po.po_datetime, ob_id: po.ob_id, oa_id: po.oa_id,
        bb_id: po.bb_id, ba_id: po.ba_id
      });
      const ob_code = cbRes.ob_code || (cbRes.ok ? '2000' : 'ERR');
      const ob_datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
      // Zet in po_out
      await db.query(
        'INSERT IGNORE INTO po_out (po_id, po_amount, po_message, po_datetime, ob_id, oa_id, bb_id, ba_id, ob_code, ob_datetime) VALUES (?,?,?,?,?,?,?,?,?,?)',
        [po.po_id, po.po_amount, po.po_message, po.po_datetime, po.ob_id, po.oa_id, po.bb_id, po.ba_id, ob_code, ob_datetime]
      );
      // Verwijder uit po_new
      await db.query('DELETE FROM po_new WHERE po_id = ?', [po.po_id]);
      results.push({ po_id: po.po_id, status: cbRes.ok ? 'SENT' : 'REJECTED', code: ob_code });
    }
    res.json({ ok: true, message: results.length + ' POs verwerkt', data: results });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── PO_OUT ───────────────────────────────────────────────────────────────────

app.get('/api/po_out', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM po_out ORDER BY po_datetime DESC');
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── PO_IN ────────────────────────────────────────────────────────────────────

app.get('/api/po_in', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM po_in ORDER BY po_datetime DESC');
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// CB stuurt inkomende PO naar onze bank
app.post('/api/po_in', async (req, res) => {
  try {
    const po = req.body;
    // Controleer of ba_id bestaat
    const [acc] = await db.query('SELECT id, balance FROM accounts WHERE id = ?', [po.ba_id]);
    if (!acc.length) return res.json({ ok: false, bb_code: 'REJECTED', bb_message: 'Onbekende rekening' });
    if (acc[0].balance < po.po_amount) return res.json({ ok: false, bb_code: 'REJECTED', bb_message: 'Onvoldoende saldo' });
    const bb_code = '2000';
    const bb_datetime = new Date().toISOString().slice(0, 19).replace('T', ' ');
    // Saldo aanpassen
    await db.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [po.po_amount, po.ba_id]);
    // Opslaan in po_in
    await db.query(
      'INSERT IGNORE INTO po_in (po_id, po_amount, po_message, po_datetime, ob_id, oa_id, ob_code, ob_datetime, bb_id, ba_id, bb_code, bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [po.po_id, po.po_amount, po.po_message, po.po_datetime, po.ob_id, po.oa_id, po.ob_code || null, po.ob_datetime || null, BIC, po.ba_id, bb_code, bb_datetime]
    );
    res.json({ ok: true, bb_code, bb_datetime });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── ACK_IN ───────────────────────────────────────────────────────────────────

app.get('/api/ack_in', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ack_in ORDER BY po_datetime DESC');
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// CB bevestigt onze uitgaande PO
app.post('/api/ack_in', async (req, res) => {
  try {
    const ack = req.body;
    await db.query(
      'INSERT IGNORE INTO ack_in (po_id, po_amount, po_message, po_datetime, ob_id, oa_id, ob_code, ob_datetime, cb_code, cb_datetime, bb_id, ba_id, bb_code, bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [ack.po_id, ack.po_amount, ack.po_message, ack.po_datetime, ack.ob_id, ack.oa_id, ack.ob_code, ack.ob_datetime, ack.cb_code, ack.cb_datetime, ack.bb_id, ack.ba_id, ack.bb_code, ack.bb_datetime]
    );
    // Update po_out met cb en bb codes
    await db.query(
      'UPDATE po_out SET cb_code=?, cb_datetime=?, bb_code=?, bb_datetime=? WHERE po_id=?',
      [ack.cb_code, ack.cb_datetime, ack.bb_code, ack.bb_datetime, ack.po_id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── ACK_OUT ──────────────────────────────────────────────────────────────────

app.get('/api/ack_out', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM ack_out ORDER BY po_datetime DESC');
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// CB vraagt ons ack_out te bevestigen
app.post('/api/ack_out', async (req, res) => {
  try {
    const ack = req.body;
    await db.query(
      'INSERT IGNORE INTO ack_out (po_id, po_amount, po_message, po_datetime, ob_id, oa_id, ob_code, ob_datetime, cb_code, cb_datetime, bb_id, ba_id, bb_code, bb_datetime) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [ack.po_id, ack.po_amount, ack.po_message, ack.po_datetime, ack.ob_id, ack.oa_id, ack.ob_code, ack.ob_datetime, ack.cb_code, ack.cb_datetime, ack.bb_id, ack.ba_id, ack.bb_code, ack.bb_datetime]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

// ─── SERVER START ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('Bank 2 (' + BIC + ') draait op poort ' + PORT);
});
