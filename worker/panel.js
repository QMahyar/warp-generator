/**
 * Framework-less panel UI (ADR 0004): worker-rendered HTML strings.
 * Ticket 01 ships two pages: a login page (served without auth) and an
 * authenticated shell that later tickets fill (account card, endpoint
 * editor, subscription links, generator). Ticket 02 adds the account card;
 * ticket 03 adds the Endpoints card (textarea of host:port lines →
 * ENDPOINTS KV) and the AmneziaWG card (toggle + Jc/Jmin/Jmax/S1–S4/H1–H4/
 * I1–I5 → AWG KV; I1 prefill pool comes from the worker's I1 mask pool).
 *
 * No JS framework, no external assets, no build step. All styling is one
 * inline <style> block; the shell's logout is a plain form POST. Dynamic
 * values are injected via textContent / input.value — never innerHTML.
 */

import { I1_MASKS } from './api-handler.js';

function page(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root {
    --bg: #0f1420;
    --panel: #1a2233;
    --border: #2a3550;
    --text: #c9d4e8;
    --muted: #7a88a6;
    --accent: #7aa2f7;
    --danger: #f7768e;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: var(--bg);
    color: var(--text);
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .card {
    width: min(92vw, 380px);
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
  }
  h1 { margin: 0 0 4px; font-size: 20px; color: #e8eefc; }
  .sub { margin: 0 0 20px; color: var(--muted); font-size: 13px; }
  label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  input[type="password"] {
    width: 100%;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font-size: 15px;
  }
  input[type="password"]:focus { outline: 2px solid var(--accent); border-color: transparent; }
  button {
    width: 100%;
    margin-top: 16px;
    padding: 10px 12px;
    border: 0;
    border-radius: 8px;
    background: var(--accent);
    color: #0b1220;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
  }
  button:hover { filter: brightness(1.1); }
  .error {
    margin-top: 14px;
    padding: 8px 10px;
    border: 1px solid rgba(247, 118, 142, 0.4);
    border-radius: 8px;
    background: rgba(247, 118, 142, 0.08);
    color: var(--danger);
    font-size: 13px;
  }
  header {
    position: fixed;
    inset: 0 0 auto 0;
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 0 24px;
    height: 56px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  header .brand { font-weight: 700; color: #e8eefc; }
  nav { display: flex; gap: 16px; font-size: 14px; }
  nav span { color: var(--muted); cursor: default; }
  nav span.active { color: var(--text); }
  header form { margin-left: auto; }
  header form button { width: auto; margin: 0; padding: 6px 14px; font-size: 13px; background: transparent; color: var(--muted); border: 1px solid var(--border); }
  header form button:hover { color: var(--danger); border-color: var(--danger); filter: none; }
  main {
    margin-top: 56px;
    width: min(92vw, 720px);
    padding: 36px 0;
  }
  [hidden] { display: none !important; }
  .card-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 24px;
  }
  .card-panel + .card-panel { margin-top: 20px; }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .card-head h2 { margin: 0; font-size: 16px; color: #e8eefc; }
  .badge {
    font-size: 12px;
    padding: 3px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--muted);
    white-space: nowrap;
  }
  .badge.ok {
    color: #9ece6a;
    border-color: rgba(158, 206, 106, 0.4);
    background: rgba(158, 206, 106, 0.08);
  }
  .badge.err {
    color: var(--danger);
    border-color: rgba(247, 118, 142, 0.4);
    background: rgba(247, 118, 142, 0.08);
  }
  .card-panel .meta { margin: 10px 0 0; color: var(--muted); font-size: 13px; }
  .actions { display: flex; gap: 10px; margin-top: 18px; }
  .actions button { width: auto; margin: 0; flex: 1; }
  .actions button:disabled { opacity: 0.55; cursor: wait; }
  .actions #account-rotate-button {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .actions #account-rotate-button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  textarea {
    width: 100%;
    min-height: 130px;
    padding: 10px 12px;
    margin-top: 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    resize: vertical;
  }
  textarea:focus, .awg-grid input:focus, .i-row input:focus { outline: 2px solid var(--accent); border-color: transparent; }
  textarea.invalid, .awg-grid input.invalid, .i-row input.invalid { border-color: var(--danger); }
  .awg-grid {
    display: grid;
    grid-template-columns: 56px 1fr 56px 1fr;
    gap: 10px 12px;
    align-items: center;
    margin-top: 14px;
  }
  .awg-grid label { margin: 0; font-size: 12px; }
  .awg-grid input, .i-row input {
    width: 100%;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .i-row { display: flex; gap: 8px; align-items: center; grid-column: 1 / -1; }
  .i-row label { flex: 0 0 56px; }
  .i-row input { flex: 1; }
  .i-row button.pick {
    width: auto;
    margin: 0;
    padding: 7px 12px;
    font-size: 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 8px;
    cursor: pointer;
  }
  .i-row button.pick:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    max-width: 55%;
    font-size: 13px;
    color: var(--text);
    cursor: pointer;
  }
  .toggle input { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
  #awg-card.off .awg-grid { opacity: 0.45; }
  .flags {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(247, 118, 142, 0.06);
  }
  .flags p { margin: 2px 0; color: var(--danger); font-size: 12px; }
  .flags .flag-head { color: var(--muted); }
  .feed { margin-top: 12px; padding: 6px 10px; border-radius: 8px; font-size: 12px; }
  .feed.ok { color: #9ece6a; background: rgba(158, 206, 106, 0.08); }
  .feed.err { color: var(--danger); background: rgba(247, 118, 142, 0.08); }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Public page shown for any unauthenticated request (ticket 01). */
export function loginPage({ error = null } = {}) {
  const message =
    error === 'config' ? 'Panel is not configured: PASSWORD secret is missing.'
    : error === 'invalid' ? 'Incorrect password. Try again.'
    : null;
  return page('WARP Panel — sign in', `
<div class="card">
  <h1>WARP Panel</h1>
  <p class="sub">Sign in to manage the subscription panel</p>
  <form method="post" action="/api/auth/login">
    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" autofocus required>
    <button type="submit">Unlock</button>
  </form>
  ${message ? `<div class="error">${message}</div>` : ''}
</div>
`);
}

/**
 * Authenticated shell with the account card (ticket 02). The card fetches
 * /api/account on load, and Register/Rotate POST to /api/account/register|
 * rotate; the inline script owns the in-flight state (network ~1-2 s) and
 * error rendering. Framework-less per ADR 0004 — dynamic values are injected
 * via textContent, never innerHTML.
 */
export function panelShell() {
  return page('WARP Panel', `
<header>
  <span class="brand">WARP Panel</span>
  <nav>
    <span class="active">Account</span>
    <span>Endpoints</span>
    <span>Subscriptions</span>
    <span>Generator</span>
  </nav>
  <form method="post" action="/api/auth/logout">
    <button type="submit">Log out</button>
  </form>
</header>
<main>
  <section class="card-panel" id="account-card">
    <div class="card-head">
      <h2>WARP account</h2>
      <span id="account-status" class="badge">…</span>
    </div>
    <p id="account-meta" class="meta">Loading account state…</p>
    <div class="actions">
      <button type="button" id="account-register-button">Register account</button>
      <button type="button" id="account-rotate-button">Rotate account</button>
    </div>
    <div id="account-error" class="error" hidden></div>
  </section>
  <section class="card-panel" id="endpoints-card">
    <div class="card-head">
      <h2>Endpoints</h2>
      <span id="endpoints-status" class="badge">…</span>
    </div>
    <p class="meta">One host:port per line — IPv4, hostname, or [IPv6], any port. A flagged line never blocks the valid ones; an empty list falls back to default endpoints.</p>
    <textarea id="endpoints-input" rows="8" spellcheck="false" placeholder="162.159.192.1:2408&#10;engage.cloudflareclient.com:2408&#10;[2606:4700:4700::1111]:2408"></textarea>
    <div id="endpoints-flags" class="flags" hidden></div>
    <div class="actions">
      <button type="button" id="endpoints-save-button">Save endpoints</button>
    </div>
    <p id="endpoints-feedback" class="meta feed" hidden></p>
  </section>
  <section class="card-panel" id="awg-card">
    <div class="card-head">
      <h2>AmneziaWG</h2>
      <label class="toggle">
        <input type="checkbox" id="awg-enabled">
        <span>Obfuscation on — carried by the clash, wg-zip and awg formats</span>
      </label>
    </div>
    <p class="meta">Empty fields are omitted from configs; H1–H4 ranges must not overlap. When enabled with I1 empty, renderers pick a mask at serve time.</p>
    <div id="awg-params" class="awg-grid">
      <label for="awg-Jc">Jc</label>
      <input type="text" id="awg-Jc" inputmode="numeric" placeholder="4">
      <label for="awg-Jmin">Jmin</label>
      <input type="text" id="awg-Jmin" inputmode="numeric" placeholder="40">
      <label for="awg-Jmax">Jmax</label>
      <input type="text" id="awg-Jmax" inputmode="numeric" placeholder="70">
      <label for="awg-S1">S1</label>
      <input type="text" id="awg-S1" inputmode="numeric" placeholder="0">
      <label for="awg-S2">S2</label>
      <input type="text" id="awg-S2" inputmode="numeric" placeholder="0">
      <label for="awg-S3">S3</label>
      <input type="text" id="awg-S3" inputmode="numeric" placeholder="">
      <label for="awg-S4">S4</label>
      <input type="text" id="awg-S4" inputmode="numeric" placeholder="">
      <label for="awg-H1">H1</label>
      <input type="text" id="awg-H1" inputmode="numeric" placeholder="1">
      <label for="awg-H2">H2</label>
      <input type="text" id="awg-H2" inputmode="numeric" placeholder="2">
      <label for="awg-H3">H3</label>
      <input type="text" id="awg-H3" inputmode="numeric" placeholder="3">
      <label for="awg-H4">H4</label>
      <input type="text" id="awg-H4" inputmode="numeric" placeholder="4">
      <div class="i-row">
        <label for="awg-I1">I1</label>
        <input type="text" id="awg-I1" spellcheck="false" placeholder="I1 = &lt;b 0x…&gt;">
        <button type="button" id="awg-I1-pick" class="pick" title="Pick a random mask from the I1 pool">Pick</button>
      </div>
      <div class="i-row">
        <label for="awg-I2">I2</label>
        <input type="text" id="awg-I2" spellcheck="false" placeholder="I2 = &lt;b 0x…&gt;">
      </div>
      <div class="i-row">
        <label for="awg-I3">I3</label>
        <input type="text" id="awg-I3" spellcheck="false" placeholder="I3 = &lt;b 0x…&gt;">
      </div>
      <div class="i-row">
        <label for="awg-I4">I4</label>
        <input type="text" id="awg-I4" spellcheck="false" placeholder="I4 = &lt;b 0x…&gt;">
      </div>
      <div class="i-row">
        <label for="awg-I5">I5</label>
        <input type="text" id="awg-I5" spellcheck="false" placeholder="I5 = &lt;b 0x…&gt;">
      </div>
    </div>
    <div id="awg-flags" class="flags" hidden></div>
    <div class="actions">
      <button type="button" id="awg-save-button">Save AWG settings</button>
    </div>
    <p id="awg-feedback" class="meta feed" hidden></p>
  </section>
</main>
<script>
(() => {
  const statusEl = document.getElementById('account-status');
  const metaEl = document.getElementById('account-meta');
  const errorEl = document.getElementById('account-error');
  const registerBtn = document.getElementById('account-register-button');
  const rotateBtn = document.getElementById('account-rotate-button');
  const buttons = [registerBtn, rotateBtn];
  const LABELS = { register: ['Register account', 'Registering…'], rotate: ['Rotate account', 'Rotating…'] };

  function fmt(dateStr) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleString();
  }

  function render(account) {
    if (!account) {
      statusEl.textContent = 'No account';
      statusEl.className = 'badge';
      metaEl.textContent = 'No WARP account yet. Register one — subscriptions need it.';
    } else {
      statusEl.textContent = 'Registered';
      statusEl.className = 'badge ok';
      metaEl.textContent = 'Registered ' + fmt(account.registeredAt) + ' · ' + (account.v4 || '—');
    }
    errorEl.hidden = true;
  }

  function setBusy(busy, active) {
    buttons.forEach(function (b) { b.disabled = busy; });
    if (active) active.textContent = busy ? LABELS[active.id === 'account-register-button' ? 'register' : 'rotate'][1]
                                         : LABELS[active.id === 'account-register-button' ? 'register' : 'rotate'][0];
  }

  async function run(action) {
    const active = action === 'register' ? registerBtn : rotateBtn;
    errorEl.hidden = true;
    metaEl.textContent = 'Contacting Cloudflare — this takes a couple of seconds…';
    setBusy(true, active);
    try {
      const res = await fetch('/api/account/' + action, { method: 'POST' });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      render(data.account);
    } catch (err) {
      errorEl.textContent = err.message || 'Unknown error';
      errorEl.hidden = false;
      metaEl.textContent = 'Action failed — the stored account was not changed.';
    } finally {
      setBusy(false, active);
    }
  }

  registerBtn.addEventListener('click', function () { run('register'); });
  rotateBtn.addEventListener('click', function () { run('rotate'); });

  fetch('/api/account')
    .then(function (r) { return r.json(); })
    .then(function (data) { render(data.account); })
    .catch(function () {
      statusEl.textContent = 'Unavailable';
      statusEl.className = 'badge err';
      metaEl.textContent = 'Could not load account state — is the panel configured?';
    });
})();
</script>
<script>
(() => {
  // Settings cards (ticket 03): Endpoints textarea + AmneziaWG toggle/params.
  // Validation mirrors worker/settings.js (flag, never block). All dynamic
  // values go through textContent / .value — never innerHTML. I1 defaults
  // come from the worker's I1 mask pool (embedded at render time).
  const I1_POOL = ${JSON.stringify(I1_MASKS)};
  const AWG_FIELDS = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'I1', 'I2', 'I3', 'I4', 'I5'];
  const AWG_DEFAULTS = { Jc: '4', Jmin: '40', Jmax: '70', S1: '0', S2: '0', S3: '', S4: '', H1: '1', H2: '2', H3: '3', H4: '4', I1: '', I2: '', I3: '', I4: '', I5: '' };
  const AWG_RANGES = { Jc: [0, 10], Jmin: [1, 4096], Jmax: [1, 4096], S1: [0, 64], S2: [0, 64], S3: [0, 64], S4: [0, 32], H1: [0, 4294967295], H2: [0, 4294967295], H3: [0, 4294967295], H4: [0, 4294967295] };

  const inputEl = document.getElementById('endpoints-input');
  const statusEl = document.getElementById('endpoints-status');
  const flagsEl = document.getElementById('endpoints-flags');
  const saveBtn = document.getElementById('endpoints-save-button');
  const feedbackEl = document.getElementById('endpoints-feedback');

  // ---- endpoint line validation (mirror of worker/settings.js) ----
  function isV4(h) { return /^\d{1,3}(\.\d{1,3}){3}$/.test(h) && h.split('.').every(function (o) { return Number(o) <= 255; }); }
  function isHostname(h) { return h.length <= 253 && /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(h); }
  function isV6(h) {
    if (!h || h.length > 45) return false;
    const parts = h.split(':');
    const empty = parts.filter(function (p) { return p === ''; }).length;
    const dbl = h.indexOf('::') !== -1;
    if (empty > 2 || (!dbl && empty > 0)) return false;
    if (empty === 0 && parts.length !== 8) return false;
    if (empty > 0 && parts.length > 8) return false;
    let seen = false;
    for (let i = 0; i < h.length - 1; i++) {
      if (h[i] === ':' && h[i + 1] === ':') { if (seen || h[i + 2] === ':') return false; seen = true; }
    }
    if (empty > 0 && !seen) return false;
    return parts.every(function (p) { return p === '' || /^[0-9a-fA-F]{1,4}$/.test(p); });
  }
  function portOk(p) { return /^\d+$/.test(p) && Number(p) >= 1 && Number(p) <= 65535; }
  function lineResult(line) {
    const m = line.match(/^\[([^\]]+)\]:\d+$/);
    if (m) {
      if (!isV6(m[1])) return 'Invalid IPv6 address.';
      const p = line.slice(line.lastIndexOf(':') + 1);
      if (!portOk(p)) return 'Port out of range (1–65535).';
      return null;
    }
    const colons = (line.match(/:/g) || []).length;
    if (colons === 0) return 'Missing port — expected host:port.';
    if (line.indexOf('://') !== -1) return 'Not a host:port line — schemes and paths are not allowed.';
    if (line.charAt(0) === '[') return 'Bracketed IPv6 must include a port: [addr]:port.';
    if (colons > 1) return 'IPv6 endpoints need brackets: [addr]:port.';
    const idx = line.lastIndexOf(':');
    const host = line.slice(0, idx), portPart = line.slice(idx + 1);
    if (!host) return 'Missing host before the port.';
    if (!portOk(portPart)) return 'Port out of range (1–65535).';
    if (isV4(host) || (isHostname(host) && /[a-zA-Z]/.test(host.slice(host.lastIndexOf('.') + 1)))) return null;
    return 'Not a valid host (IPv4, hostname, or [IPv6]).';
  }
  function validateEndpointText(text) {
    const invalid = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const reason = lineResult(line);
      if (reason) invalid.push({ index: i, line: line, reason: reason });
    }
    return invalid;
  }

  function renderEndpointFlags(invalid) {
    flagsEl.textContent = '';
    if (invalid.length) {
      const head = document.createElement('p');
      head.className = 'flag-head';
      head.textContent = 'Flagged lines — saved as-is, skipped by subscription renderers:';
      flagsEl.appendChild(head);
    }
    invalid.forEach(function (f) {
      const p = document.createElement('p');
      p.textContent = 'Line ' + (f.index + 1) + ' "' + f.line + '" — ' + f.reason;
      flagsEl.appendChild(p);
    });
    flagsEl.hidden = invalid.length === 0;
  }

  function refreshEndpointBadge() {
    const invalid = validateEndpointText(inputEl.value);
    const nonBlank = inputEl.value.split('\n').filter(function (l) { return l.trim() !== ''; }).length;
    const valid = nonBlank - invalid.length;
    inputEl.classList.toggle('invalid', invalid.length > 0);
    renderEndpointFlags(invalid);
    if (nonBlank === 0) {
      statusEl.textContent = 'No endpoints';
      statusEl.className = 'badge';
    } else if (invalid.length === 0) {
      statusEl.textContent = valid + (valid === 1 ? ' endpoint' : ' endpoints');
      statusEl.className = 'badge ok';
    } else {
      statusEl.textContent = valid + (valid === 1 ? ' endpoint' : ' endpoints') + ' · ' + invalid.length + ' flagged';
      statusEl.className = 'badge err';
    }
  }

  function setEndpointFeedback(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = 'meta feed' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    feedbackEl.hidden = false;
  }

  async function saveEndpoints() {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/settings/endpoints', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputEl.value }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      const e = data.endpoints || { text: inputEl.value, count: 0, invalid: [] };
      inputEl.value = e.text;
      refreshEndpointBadge();
      setEndpointFeedback('Saved — ' + e.count + (e.count === 1 ? ' endpoint' : ' endpoints') + (e.invalid.length ? ' · ' + e.invalid.length + ' flagged' : ''), 'ok');
    } catch (err) {
      setEndpointFeedback(err.message || 'Failed to save endpoints.', 'err');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save endpoints';
    }
  }
  inputEl.addEventListener('input', refreshEndpointBadge);
  saveBtn.addEventListener('click', saveEndpoints);

  // ---- AmneziaWG card ----
  const awgCard = document.getElementById('awg-card');
  const awgEnabledEl = document.getElementById('awg-enabled');
  const awgFlagsEl = document.getElementById('awg-flags');
  const awgSaveBtn = document.getElementById('awg-save-button');
  const awgFeedbackEl = document.getElementById('awg-feedback');
  const awgPickBtn = document.getElementById('awg-I1-pick');
  const awgInputs = {};
  AWG_FIELDS.forEach(function (f) { awgInputs[f] = document.getElementById('awg-' + f); });

  function awgFieldError(f, value) {
    if (!value) return null;
    if (f.charAt(0) === 'I') {
      return /^I[1-5]\s*=\s*<b 0x[0-9a-fA-F]+>(?:\s*<[^<>]+>)*\s*$/i.test(value) ? null : 'CPS line expected, e.g. "I1 = <b 0x…>".';
    }
    const range = AWG_RANGES[f];
    return /^\d+$/.test(value) && Number(value) >= range[0] && Number(value) <= range[1] ? null : 'Integer ' + range[0] + '–' + range[1] + ' expected.';
  }

  function collectAwgErrors() {
    const errors = [];
    AWG_FIELDS.forEach(function (f) {
      const err = awgFieldError(f, awgInputs[f].value.trim());
      awgInputs[f].classList.toggle('invalid', Boolean(err));
      if (err) errors.push({ field: f, reason: err });
    });
    const jmin = awgInputs.Jmin.value.trim(), jmax = awgInputs.Jmax.value.trim();
    if (/^\d+$/.test(jmin) && /^\d+$/.test(jmax) && Number(jmin) > Number(jmax)) {
      errors.push({ field: 'Jmin', reason: 'Jmin must be ≤ Jmax.' });
      awgInputs.Jmin.classList.add('invalid');
    }
    return errors;
  }

  function renderAwgFlags(errors) {
    awgFlagsEl.textContent = '';
    errors.forEach(function (e) {
      const p = document.createElement('p');
      p.textContent = e.field + ' — ' + e.reason;
      awgFlagsEl.appendChild(p);
    });
    awgFlagsEl.hidden = errors.length === 0;
  }

  function setAwgEnabled(on, prefill) {
    awgEnabledEl.checked = on;
    awgCard.classList.toggle('off', !on);
    AWG_FIELDS.forEach(function (f) { awgInputs[f].disabled = !on; });
    awgPickBtn.disabled = !on;
    if (on && prefill) {
      // Real toggle-on: fill defaults + pick an I1 mask from the pool.
      // (Loading stored state never mutates fields.)
      AWG_FIELDS.forEach(function (f) { if (!awgInputs[f].value && AWG_DEFAULTS[f]) awgInputs[f].value = AWG_DEFAULTS[f]; });
      if (!awgInputs.I1.value && I1_POOL.length) awgInputs.I1.value = I1_POOL[Math.floor(Math.random() * I1_POOL.length)];
    }
    renderAwgFlags(collectAwgErrors());
  }
  awgEnabledEl.addEventListener('change', function () { setAwgEnabled(awgEnabledEl.checked, true); });
  AWG_FIELDS.forEach(function (f) { awgInputs[f].addEventListener('input', function () { collectAwgErrors(); }); });
  awgPickBtn.addEventListener('click', function () {
    if (!I1_POOL.length) return;
    awgInputs.I1.value = I1_POOL[Math.floor(Math.random() * I1_POOL.length)];
    collectAwgErrors();
  });

  function setAwgFeedback(text, kind) {
    awgFeedbackEl.textContent = text;
    awgFeedbackEl.className = 'meta feed' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    awgFeedbackEl.hidden = false;
  }

  async function saveAwg() {
    const body = { enabled: awgEnabledEl.checked };
    if (body.enabled) AWG_FIELDS.forEach(function (f) { body[f] = awgInputs[f].value; });
    awgSaveBtn.disabled = true;
    awgSaveBtn.textContent = 'Saving…';
    try {
      const res = await fetch('/api/settings/awg', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      const invalid = (data.invalid || []).map(function (x) { return { field: x.field, reason: x.reason }; });
      renderAwgFlags(invalid.length ? invalid : collectAwgErrors());
      setAwgFeedback(data.awg ? 'Saved — AmneziaWG enabled.' : 'Saved — AmneziaWG off.', 'ok');
    } catch (err) {
      setAwgFeedback(err.message || 'Failed to save AWG settings.', 'err');
    } finally {
      awgSaveBtn.disabled = false;
      awgSaveBtn.textContent = 'Save AWG settings';
    }
  }
  awgSaveBtn.addEventListener('click', saveAwg);

  // ---- load current state ----
  fetch('/api/settings')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const s = data.settings || {};
      if (s.endpoints) inputEl.value = s.endpoints.text;
      refreshEndpointBadge();
      if (s.awg) {
        AWG_FIELDS.forEach(function (f) { awgInputs[f].value = s.awg[f] || ''; });
        setAwgEnabled(true);
      } else {
        setAwgEnabled(false);
      }
    })
    .catch(function () {
      setEndpointFeedback('Could not load settings — is the panel configured?', 'err');
    });
})();
</script>
`);
}