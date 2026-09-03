// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// -----------------------------------------------------------------------
// Credenciais: guardadas só neste navegador (localStorage), nunca no
// servidor. Vão em headers a cada chamada pra API ficar stateless
// (funciona em serverless, e cada pessoa usa a própria conta Blip).
// -----------------------------------------------------------------------
const LS_CONTRACT = 'flowdeploy.contract';
const LS_AUTHORIZATION = 'flowdeploy.authorization';

function getLocalCreds() {
  try {
    return {
      contract: localStorage.getItem(LS_CONTRACT) || '',
      authorization: localStorage.getItem(LS_AUTHORIZATION) || '',
    };
  } catch (e) {
    return { contract: '', authorization: '' };
  }
}

function setLocalCreds({ contract, authorization }) {
  try {
    if (contract !== undefined) localStorage.setItem(LS_CONTRACT, contract);
    if (authorization) localStorage.setItem(LS_AUTHORIZATION, authorization);
  } catch (e) { /* ignore (localStorage indisponivel) */ }
}

async function api(path, options = {}) {
  const creds = getLocalCreds();
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (creds.contract) headers['X-Blip-Contract'] = creds.contract;
  if (creds.authorization) headers['X-Blip-Authorization'] = creds.authorization;

  const res = await fetch(path, { ...options, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Erro HTTP ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}

// escapa texto puro para HTML e, de quebra, transforma URLs em links clicáveis.
// Precisa achar as URLs ANTES de escapar (senão aspas viram &quot; e a regex
// engole a entidade, quebrando o atributo href do <a>).
function linkify(rawText) {
  const text = rawText || '';
  const urlRegex = /https?:\/\/[^\s"'<>]+/g;
  let result = '';
  let lastIndex = 0;
  let match;
  while ((match = urlRegex.exec(text)) !== null) {
    result += escapeHtml(text.slice(lastIndex, match.index));
    let url = match[0];
    // remove pontuacao final que provavelmente nao faz parte da URL (ex: `,` `.` `)`)
    const trailingMatch = url.match(/[)\].,;:!?]+$/);
    const trailing = trailingMatch ? trailingMatch[0] : '';
    if (trailing) url = url.slice(0, -trailing.length);
    const safeUrl = escapeHtml(url);
    result += `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>${escapeHtml(trailing)}`;
    lastIndex = match.index + match[0].length;
  }
  result += escapeHtml(text.slice(lastIndex));
  return result;
}

function renderResult(container, { title, ok, error, data }) {
  container.classList.remove('hidden', 'ok', 'error');
  container.classList.add(ok ? 'ok' : 'error');
  let html = `<strong>${title}</strong>`;
  if (error) {
    html += `<div style="margin-top:6px;color:var(--danger)">${linkify(error)}</div>`;
  }
  if (data !== undefined) {
    html += `<pre>${linkify(JSON.stringify(data, null, 2))}</pre>`;
  }
  container.innerHTML = html;
}

// -----------------------------------------------------------------------
// Tema claro/escuro
// -----------------------------------------------------------------------
const themeToggleBtn = document.getElementById('btn-theme-toggle');

const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

function updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  themeToggleBtn.innerHTML = isDark ? SUN_ICON : MOON_ICON;
}

themeToggleBtn.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  updateThemeIcon();
});

updateThemeIcon();

// -----------------------------------------------------------------------
// Navegação entre etapas (progressiva: só libera a próxima quando a
// etapa atual for concluída com sucesso)
// -----------------------------------------------------------------------
let maxUnlockedStep = 1;

function updateStepTabsUI() {
  document.querySelectorAll('.step-tab').forEach((btn) => {
    const step = Number(btn.dataset.step);
    btn.disabled = step > maxUnlockedStep;
    btn.classList.toggle('completed', step < maxUnlockedStep);
  });
}

function unlockStep(step) {
  if (step > maxUnlockedStep) {
    maxUnlockedStep = step;
    updateStepTabsUI();
  }
}

function goToStep(step) {
  document.querySelectorAll('.step-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.step === String(step));
  });
  document.querySelectorAll('.step-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${step}`);
  });
}

document.getElementById('steps-nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.step-tab');
  if (btn && !btn.disabled) goToStep(btn.dataset.step);
});

document.querySelectorAll('.next-step-btn').forEach((btn) => {
  btn.addEventListener('click', () => goToStep(btn.dataset.goto));
});

// -----------------------------------------------------------------------
// Configurações (modal)
// -----------------------------------------------------------------------
const configModal = document.getElementById('config-modal');

async function openConfigModal() {
  const local = getLocalCreds();
  let serverDefault = { contract: '', authorizationConfigured: false };
  try { serverDefault = await api('/api/config'); } catch (e) { /* ignore */ }

  document.getElementById('cfg-contract').value = local.contract || serverDefault.contract || '';
  document.getElementById('cfg-authorization').value = '';
  document.getElementById('cfg-authorization').placeholder = local.authorization
    ? 'Já configurada neste navegador — deixe em branco para manter'
    : serverDefault.authorizationConfigured
      ? 'Usando o padrão do servidor (.env) — deixe em branco para manter'
      : 'Key ZXhhbXBsZWJvdDpzdWFTZW5oYUFxdWk=';
  configModal.classList.remove('hidden');
}

document.getElementById('btn-open-config').addEventListener('click', openConfigModal);
document.getElementById('btn-cfg-cancel').addEventListener('click', () => configModal.classList.add('hidden'));

document.getElementById('btn-cfg-save').addEventListener('click', () => {
  const contract = document.getElementById('cfg-contract').value.trim();
  const authorization = document.getElementById('cfg-authorization').value.trim();
  setLocalCreds({ contract, authorization });
  configModal.classList.add('hidden');
});

// checa configuração ao carregar; se este navegador ainda não tem
// credenciais e o servidor também não tem um padrão (.env), abre o modal
(async function checkConfigOnLoad() {
  const local = getLocalCreds();
  if (local.contract && local.authorization) return;
  try {
    const serverDefault = await api('/api/config');
    if (!serverDefault.contract || !serverDefault.authorizationConfigured) {
      openConfigModal();
    }
  } catch (e) {
    openConfigModal();
  }
})();

// -----------------------------------------------------------------------
// ETAPA 1: criar flow
// -----------------------------------------------------------------------
document.getElementById('btn-create-flow').addEventListener('click', async () => {
  const name = document.getElementById('flow-name').value.trim();
  const resultBox = document.getElementById('create-flow-result');

  if (!name) return alert('Informe um nome para o flow.');

  const btn = document.getElementById('btn-create-flow');
  btn.disabled = true;
  btn.textContent = 'Criando...';
  try {
    const result = await api('/api/flows', { method: 'POST', body: JSON.stringify({ name }) });
    renderResult(resultBox, { title: 'Flow criado (resposta da API)', ok: true, data: result.responseBody });
    if (result.suggestedFlowId) {
      document.getElementById('flow-id').value = result.suggestedFlowId;
    }
    unlockStep(2);
    document.getElementById('btn-next-1').classList.remove('hidden');
  } catch (err) {
    renderResult(resultBox, { title: 'Erro ao criar flow', ok: false, error: err.message, data: err.body });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar flow';
  }
});

function getFlowId() {
  return document.getElementById('flow-id').value.trim();
}

// -----------------------------------------------------------------------
// ETAPA 2: colar JSON e enviar
// -----------------------------------------------------------------------
document.getElementById('btn-send-screens').addEventListener('click', async () => {
  const flowId = getFlowId();
  const resultBox = document.getElementById('screens-result');
  if (!flowId) return alert('Informe o ID do flow na etapa 1 antes de enviar o JSON.');

  const raw = document.getElementById('flow-json').value.trim();
  if (!raw) return alert('Cole o JSON do flow antes de enviar.');

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return alert(`JSON inválido: ${e.message}`);
  }

  // aceita tanto { screens, version } quanto o envelope completo do Postman
  // ({ id, to, method, uri, resource: { screens, version } }) ou so o array de screens
  let source = parsed;
  if (!Array.isArray(parsed) && parsed && parsed.resource && Array.isArray(parsed.resource.screens)) {
    source = parsed.resource;
  }
  const screens = Array.isArray(source) ? source : source.screens;
  const version = Array.isArray(source) ? undefined : source.version;
  if (!Array.isArray(screens) || screens.length === 0) {
    return alert('O JSON precisa conter um array "screens" com ao menos uma tela.');
  }

  const btn = document.getElementById('btn-send-screens');
  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    const result = await api(`/api/flows/${encodeURIComponent(flowId)}/screens`, {
      method: 'PUT',
      body: JSON.stringify({ screens, version }),
    });
    renderResult(resultBox, { title: 'JSON enviado (resposta da API)', ok: true, data: result.responseBody });
    unlockStep(3);
    document.getElementById('btn-next-2').classList.remove('hidden');
  } catch (err) {
    renderResult(resultBox, { title: 'Erro ao enviar JSON', ok: false, error: err.message, data: err.body });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar JSON para o flow';
  }
});

// -----------------------------------------------------------------------
// ETAPA 3: publicar
// -----------------------------------------------------------------------
document.getElementById('btn-publish').addEventListener('click', async () => {
  const flowId = getFlowId();
  const resultBox = document.getElementById('publish-result');
  if (!flowId) return alert('Informe o ID do flow na etapa 1 antes de publicar.');

  const btn = document.getElementById('btn-publish');
  btn.disabled = true;
  btn.textContent = 'Publicando...';
  try {
    const result = await api(`/api/flows/${encodeURIComponent(flowId)}/publish`, { method: 'POST' });
    renderResult(resultBox, { title: 'Flow publicado (resposta da API)', ok: true, data: result.responseBody });
    unlockStep(4);
    document.getElementById('btn-next-3').classList.remove('hidden');
  } catch (err) {
    renderResult(resultBox, { title: 'Erro ao publicar', ok: false, error: err.message, data: err.body });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Publicar flow';
  }
});

// -----------------------------------------------------------------------
// ETAPA 4: consultar / exibir o flow
// -----------------------------------------------------------------------
document.getElementById('btn-query').addEventListener('click', async () => {
  const flowId = getFlowId();
  const resultBox = document.getElementById('query-result');
  if (!flowId) return alert('Informe o ID do flow na etapa 1 antes de consultar.');

  const btn = document.getElementById('btn-query');
  btn.disabled = true;
  btn.textContent = 'Consultando...';
  try {
    const result = await api(`/api/flows/${encodeURIComponent(flowId)}`);
    renderResult(resultBox, { title: 'Dados do flow', ok: true, data: result.responseBody });
  } catch (err) {
    renderResult(resultBox, { title: 'Erro ao consultar', ok: false, error: err.message, data: err.body });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Consultar flow';
  }
});
