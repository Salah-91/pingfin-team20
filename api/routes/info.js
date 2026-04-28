const express = require('express');
const router = express.Router();

router.get('/help', (req, res) => {
  res.json({
    ok: true, status: 200, code: null, message: 'PingFin Bank Team 20 API Documentation',
    data: [
      { method: 'GET',  url: '/api/help',            description: 'Returns overview of all API methods' },
      { method: 'GET',  url: '/api/info',            description: 'Returns team info, BIC and bank name' },
      { method: 'GET',  url: '/api/accounts',        description: 'Returns list of all accounts' },
      { method: 'GET',  url: '/api/po_new/generate', description: 'Generate random payment orders' },
      { method: 'POST', url: '/api/po_new/add',      description: 'Add new POs to PO_NEW table' },
      { method: 'GET',  url: '/api/po_new/process',  description: 'Process all POs in PO_NEW' },
      { method: 'GET',  url: '/api/po_out',          description: 'Returns list of outgoing POs' },
      { method: 'GET',  url: '/api/po_in',           description: 'Returns list of incoming POs' },
      { method: 'GET',  url: '/api/ack_in',          description: 'Returns list of received ACKs' },
      { method: 'GET',  url: '/api/ack_out',         description: 'Returns list of sent ACKs' },
    ]
  });
});

router.get('/info', (req, res) => {
  res.json({
    ok: true, status: 200, code: null, message: null,
    data: {
      bank_name: 'PingFin Bank Team 20',
      bic: 'CEKVBE88',
      team: 20,
      members: [
        { name: 'Salaheddine Sennouni', role: 'Developer - GitHub, API' },
        { name: 'Abdallah Azouagh',     role: 'Team Lead - Trello, Coordination' },
        { name: 'Ayoub Abdeddoun',      role: 'Analyst - Exceptions, Documentation' },
      ],
      api_version: 'v1',
      cb_url: 'https://stevenop.be/pingfin/api/v2/',
    }
  });
});

module.exports = router;
