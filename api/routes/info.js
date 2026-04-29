const express = require('express');
const router = express.Router();
const cfg = require('../config');

router.get('/info', (req, res) => {
  res.json({
    ok: true, status: 200, code: null, message: null,
    data: {
      bank_name: cfg.bankName,
      bic:       cfg.bic,
      team:      20,
      members:   cfg.members,
      api_version: 'v3',
      cb_url: cfg.cb.url,
    }
  });
});

module.exports = router;
