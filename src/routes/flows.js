const express = require('express');
const { sendCommand, credsFromRequest } = require('../services/blipClient');
const { handleCommandError } = require('../utils/httpErrors');

const router = express.Router();

const DEFAULT_CATEGORIES = ['OTHER'];

// Procura recursivamente por um campo "id" plausivel (string numerica longa,
// como os ids de flow: "1564737008435776") em qualquer profundidade da resposta.
function findLikelyFlowId(obj) {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && /^\d{6,}$/.test(value) && key.toLowerCase().includes('id')) {
      return value;
    }
  }
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findLikelyFlowId(value);
      if (found) return found;
    }
  }
  return null;
}

// 1) Criar flow -> POST /whatsapp-flows
router.post('/', async (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Informe um nome para o flow.' });
  }

  try {
    const result = await sendCommand({
      method: 'set',
      uri: '/whatsapp-flows',
      type: 'application/json',
      resource: { name: name.trim(), categories: DEFAULT_CATEGORIES },
      creds: credsFromRequest(req),
    });
    const suggestedFlowId = findLikelyFlowId(result.responseBody);
    res.json({ ...result, suggestedFlowId });
  } catch (err) {
    handleCommandError(res, err);
  }
});

// 2) Enviar o JSON das telas -> PUT (method "set") /whatsapp-flows/flow-json/{flowId}
router.put('/:flowId/screens', async (req, res) => {
  const { flowId } = req.params;
  const { screens, version } = req.body || {};
  if (!Array.isArray(screens) || screens.length === 0) {
    return res.status(400).json({ error: 'O JSON colado precisa conter um array "screens" com ao menos uma tela.' });
  }

  try {
    const result = await sendCommand({
      method: 'set',
      uri: `/whatsapp-flows/flow-json/${encodeURIComponent(flowId)}`,
      type: 'application/json',
      resource: { screens, version: version || '7.3' },
      creds: credsFromRequest(req),
    });
    res.json(result);
  } catch (err) {
    handleCommandError(res, err);
  }
});

// 3) Publicar flow -> GET /whatsapp-flows/publish/{flowId} (assim mesmo, method "get")
router.post('/:flowId/publish', async (req, res) => {
  const { flowId } = req.params;
  try {
    const result = await sendCommand({
      method: 'get',
      uri: `/whatsapp-flows/publish/${encodeURIComponent(flowId)}`,
      creds: credsFromRequest(req),
    });
    res.json(result);
  } catch (err) {
    handleCommandError(res, err);
  }
});

// 4) Consultar flow -> GET /whatsapp-flows/{flowId}
router.get('/:flowId', async (req, res) => {
  const { flowId } = req.params;
  try {
    const result = await sendCommand({
      method: 'get',
      uri: `/whatsapp-flows/${encodeURIComponent(flowId)}`,
      creds: credsFromRequest(req),
    });
    res.json(result);
  } catch (err) {
    handleCommandError(res, err);
  }
});

module.exports = router;
