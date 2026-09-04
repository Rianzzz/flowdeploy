const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');

const DEFAULT_TO = 'postmaster@wa.gw.msging.net';

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

// O servidor NAO guarda credenciais em disco — cada requisicao carrega as
// suas proprias, via headers "X-Blip-Contract" / "X-Blip-Authorization"
// (o navegador de cada usuario guarda a propria chave, ex: localStorage).
// BLIP_CONTRACT / BLIP_AUTHORIZATION no .env servem de valor padrao (uso solo),
// usados so quando o navegador nao manda os headers.
function credsFromRequest(req) {
  const contract = normalizeContract(req.get('X-Blip-Contract') || process.env.BLIP_CONTRACT || process.env.BLIP_HOST || '');
  const authorization = (req.get('X-Blip-Authorization') || process.env.BLIP_AUTHORIZATION || '').trim();
  return { contract, authorization };
}

// Envia um "command" Lime para a API HTTP do Blip (msging.net).
// Sempre um POST para https://{contrato}.http.msging.net/commands, variando
// apenas o "method" (set/get) e a "uri" dentro do corpo — exatamente como na
// collection original do Postman.
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

module.exports = { sendCommand, normalizeContract, credsFromRequest };
