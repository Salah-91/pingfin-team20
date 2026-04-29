const express = require('express');
const router = express.Router();

router.get('/help', (req, res) => {
  res.json({
    ok: true, status: 200, code: null,
    message: 'PingFin Bank Team 20 — API documentation',
    data: [
      // public
      { method: 'GET',  url: '/api/help',            auth: false, description: 'Overzicht endpoints' },
      { method: 'GET',  url: '/api/info',            auth: false, description: 'Bank- en teaminfo (BIC, naam, members)' },
      { method: 'GET',  url: '/api/accounts',        auth: false, description: 'Lijst van alle accounts (IBAN + saldo)' },
      { method: 'GET',  url: '/api/accounts/:iban',  auth: false, description: 'Eén account opzoeken' },
      { method: 'GET',  url: '/api/banks',           auth: false, description: 'Cache van CB.banks-lijst' },

      // PO-flow (intern)
      { method: 'GET',  url: '/api/po_new/generate?count=N', auth: false, description: 'Genereer N willekeurige PO\'s (default 5)' },
      { method: 'POST', url: '/api/po_new/add',      auth: false, description: 'Voeg een lijst PO\'s toe aan PO_NEW (body: { data: [PO,…] })' },
      { method: 'POST', url: '/api/po_new/manual',   auth: false, description: 'Maak één manuele PO aan' },
      { method: 'GET',  url: '/api/po_new/process',  auth: false, description: 'Verwerk alle PO\'s uit PO_NEW (intern of doorsturen naar CB)' },

      { method: 'GET',  url: '/api/po_new',          auth: false, description: 'Inhoud PO_NEW' },
      { method: 'GET',  url: '/api/po_out',          auth: false, description: 'Uitgaande PO\'s' },
      { method: 'GET',  url: '/api/po_in',           auth: false, description: 'Inkomende PO\'s' },
      { method: 'GET',  url: '/api/ack_in',          auth: false, description: 'Ontvangen ACK\'s' },
      { method: 'GET',  url: '/api/ack_out',         auth: false, description: 'Verstuurde ACK\'s' },
      { method: 'GET',  url: '/api/transactions',    auth: false, description: 'Saldobewegingen' },
      { method: 'GET',  url: '/api/logs?type=&limit=', auth: false, description: 'Eventlog' },

      // public push (auth verplicht)
      { method: 'POST', url: '/api/po_in',           auth: 'Bearer', description: 'Inkomende PO\'s ontvangen (van CB of andere bank)' },
      { method: 'POST', url: '/api/ack_in',          auth: 'Bearer', description: 'Inkomende ACK ontvangen (van CB)' },

      // ops
      { method: 'GET',  url: '/api/jobs/run/poll-po-out', auth: false, description: 'Manueel BB-poller starten' },
      { method: 'GET',  url: '/api/jobs/run/poll-ack-out',auth: false, description: 'Manueel OB-poller starten' },
      { method: 'GET',  url: '/api/jobs/run/timeout',     auth: false, description: 'Manueel timeout-monitor starten' },
    ]
  });
});

module.exports = router;
