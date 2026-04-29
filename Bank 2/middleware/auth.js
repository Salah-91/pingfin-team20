// Bearer-token verificatie voor inkomende /po_in en /ack_in.
// Vergelijkt met INCOMING_TOKEN uit env.
const cfg = require('../config');

function requireBearer(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/);
  if (!m || m[1] !== cfg.incomingToken) {
    return res.status(401).json({
      ok: false, status: 401, code: null,
      message: 'Ongeldig of ontbrekend Bearer-token',
      data: null,
    });
  }
  next();
}

module.exports = { requireBearer };
