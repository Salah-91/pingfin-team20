// Wrappers rond CB-endpoints. Elke call krijgt automatisch een geldig Bearer-token.
const fetch = require('node-fetch');
const cfg = require('../config');
const { getToken } = require('./cbToken');

async function cbFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const resp = await fetch(`${cfg.cb.url}${path}`, { ...options, headers });
  let json = null;
  try { json = await resp.json(); } catch {}
  return { status: resp.status, ok: resp.ok, body: json };
}

const cb = {
  banks:        ()        => cbFetch('/banks',          { method: 'GET'  }),
  registerBank: (info)    => cbFetch('/banks',          { method: 'POST', body: JSON.stringify(info) }),
  sendPos:      (poList)  => cbFetch('/po_in',          { method: 'POST', body: JSON.stringify({ data: poList }) }),
  fetchPos:     ()        => cbFetch('/po_out',         { method: 'GET'  }),
  sendAcks:     (ackList) => cbFetch('/ack_in',         { method: 'POST', body: JSON.stringify({ data: ackList }) }),
  fetchAcks:    ()        => cbFetch('/ack_out',        { method: 'GET'  }),
};

module.exports = cb;
