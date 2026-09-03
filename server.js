require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DEFAULT_TO = 'postmaster@wa.gw.msging.net';
const DEFAULT_CATEGORIES = ['OTHER'];

// ---------------------------------------------------------------------------
// Credenciais (contrato + Authorization key)
//
// O servidor NAO guarda credenciais em disco — cada requisicao carrega as
// suas proprias, via headers "X-Blip-Contract" / "X-Blip-Authorization"
// (o navegador de cada usuario guarda a propria chave, ex: localStorage).
// Isso deixa o app stateless e apto a rodar em serverless (Vercel etc),
// com varias pessoas usando contas/contratos diferentes na mesma instancia.
//
// BLIP_CONTRACT / BLIP_AUTHORIZATION no .env continuam funcionando como
// valor padrao (uso solo/local), usados só quando o navegador nao manda
// os headers.
// ---------------------------------------------------------------------------

// Aceita tanto o identificador puro ("wlck") quanto valores antigos salvos
// como host completo ("wlck.http.msging.net"), com ou sem protocolo/path.
function normalizeContract(value) {
  if (!value) return '';
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/commands\/?$/, '')
    .split('.')[0];
}

function credsFromRequest(req) {
  const contract = normalizeContract(req.get('X-Blip-Contract') || process.env.BLIP_CONTRACT || process.env.BLIP_HOST || '');
  const authorization = (req.get('X-Blip-Authorization') || process.env.BLIP_AUTHORIZATION || '').trim();
  return { contract, authorization };
}

// informativo pro frontend pre-preencher o modal quando ha padrao via .env
app.get('/api/config', (req, res) => {
  res.json({
    contract: normalizeContract(process.env.BLIP_CONTRACT || process.env.BLIP_HOST || ''),
    authorizationConfigured: Boolean(process.env.BLIP_AUTHORIZATION),
  });
});

// ---------------------------------------------------------------------------
// Helper: envia um "command" Lime para a API HTTP do Blip (msging.net)
// Sempre um POST para https://{host}/commands, variando apenas o "method"
// (set/get) e a "uri" dentro do corpo — exatamente como na collection do Postman.
// ---------------------------------------------------------------------------

async function sendCommand({ method, uri, resource, type, creds }) {
  if (!creds.contract) {
    const err = new Error('Configure o contrato (ex: wlck) na tela de Configurações antes de continuar.');
    err.code = 'MISSING_CONFIG';
    throw err;
  }
  if (!creds.authorization) {
    const err = new Error('Configure a Authorization Key na tela de Configurações antes de continuar.');
    err.code = 'MISSING_CONFIG';
    throw err;
  }

  const body = {
    id: uuidv4(),
    to: DEFAULT_TO,
    method,
    uri,
  };
  if (type) body.type = type;
  if (resource !== undefined) body.resource = resource;

  const url = `https://${creds.contract}.http.msging.net/commands`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: creds.authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    const err = new Error(`Falha de rede ao chamar ${url}: ${networkErr.message}`);
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch (e) {
    json = { raw: text };
  }

  return { httpStatus: response.status, requestSent: body, responseBody: json };
}

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

function handleCommandError(res, err) {
  if (err.code === 'MISSING_CONFIG') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === 'NETWORK_ERROR') {
    return res.status(502).json({ error: err.message });
  }
  console.error(err);
  return res.status(500).json({ error: err.message || 'Erro inesperado.' });
}

// ---------------------------------------------------------------------------
// 1) Criar flow  ->  POST /whatsapp-flows
// ---------------------------------------------------------------------------
app.post('/api/flows', async (req, res) => {
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

// ---------------------------------------------------------------------------
// 2) Enviar o JSON das telas -> PUT (method "set") /whatsapp-flows/flow-json/{flowId}
// ---------------------------------------------------------------------------
app.put('/api/flows/:flowId/screens', async (req, res) => {
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

// ---------------------------------------------------------------------------
// 3) Publicar flow -> GET /whatsapp-flows/publish/{flowId}  (assim mesmo, method "get")
// ---------------------------------------------------------------------------
app.post('/api/flows/:flowId/publish', async (req, res) => {
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

// ---------------------------------------------------------------------------
// 4) Consultar flow -> GET /whatsapp-flows/{flowId}
// ---------------------------------------------------------------------------
app.get('/api/flows/:flowId', async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('  FlowDeploy rodando!');
  console.log(`  Abra http://localhost:${PORT} no navegador`);
  console.log('');
});
