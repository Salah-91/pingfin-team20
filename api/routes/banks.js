// Read-only doorkijk naar CB.banks (handig voor de GUI om geldige BB BICs te tonen).
// Kort gecached zodat we de CB niet hameren.
const express = require('express');
const router = express.Router();
const cb = require('../lib/cbClient');
const cfg = require('../config');

let cache = { at: 0, data: [] };
const TTL = 60_000; // 1 min

router.get('/banks', async (req, res) => {
  if (Date.now() - cache.at < TTL) {
    return res.json({ ok: true, status: 200, code: null, message: 'cached', data: cache.data });
  }
  try {
    const r = await cb.banks();
    const list = (r.body?.data || r.body || []).map(b => ({
      bic:  b.bic || b.id,
      name: b.name || null,
    })).filter(b => b.bic);
    cache = { at: Date.now(), data: list };
    res.json({ ok: true, status: 200, code: null, message: null, data: list });
  } catch (err) {
    res.status(502).json({
      ok: false, status: 502, code: null,
      message: `CB onbereikbaar: ${err.message}`,
      data: cache.data || [],
    });
  }
});

module.exports = router;
