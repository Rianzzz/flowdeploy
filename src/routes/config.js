const express = require('express');
const { normalizeContract } = require('../services/blipClient');

const router = express.Router();

// informativo pro frontend pre-preencher o modal quando ha padrao via .env
router.get('/', (req, res) => {
  res.json({
    contract: normalizeContract(process.env.BLIP_CONTRACT || process.env.BLIP_HOST || ''),
    authorizationConfigured: Boolean(process.env.BLIP_AUTHORIZATION),
  });
});

module.exports = router;
