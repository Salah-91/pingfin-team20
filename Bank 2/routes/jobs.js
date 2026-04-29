// Manuele job-trigger endpoints (handig voor demo + tijdens dev — geen Bearer nodig).
const express = require('express');
const router = express.Router();
const { manualRoutes } = require('../jobs');

router.get('/jobs/run/:name', async (req, res) => {
  const fn = manualRoutes[req.params.name];
  if (!fn) {
    return res.status(404).json({ ok: false, status: 404, code: null, message: `Onbekende job: ${req.params.name}`, data: { available: Object.keys(manualRoutes) } });
  }
  try {
    const result = await fn();
    res.json({ ok: true, status: 200, code: null, message: `Job ${req.params.name} uitgevoerd`, data: result });
  } catch (err) {
    res.status(500).json({ ok: false, status: 500, code: null, message: err.message, data: null });
  }
});

module.exports = router;
