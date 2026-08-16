/**
 * Framework-less panel UI (ADR 0004): worker-rendered HTML strings.
 * Ticket 01 ships two pages: a login page (served without auth) and an
 * authenticated shell that later tickets fill (account card, endpoint
 * editor, subscription links, generator). Ticket 02 adds the account card;
 * ticket 03 adds the Endpoints card (textarea of host:port lines →
 * ENDPOINTS KV) and the AmneziaWG card (toggle + Jc/Jmin/Jmax/S1–S4/H1–H4/
 * I1–I5 → AWG KV; I1 prefill pool comes from the worker's I1 mask pool).
 * Ticket 09 adds the Generator card: the single-config flow carried over
 * from the legacy UI (format/device/endpoint/DNS/site-mode/IPv6/keepalive/
 * custom I1) POSTing to the gated /api/generator which renders from the
 * STORED account — no per-request registration. The format/DNS/service
 * lists are embedded from worker/generate.js (FORMATS, DNS_PROVIDERS,
 * SERVICES); the community-DNS "all sites" rule and the 503 missing-account
 * message are mirrored in the page.
 * Ticket 04 adds the account picker: the card lists the stored accounts
 * (fed by /api/accounts) and sends accountId when a specific one is chosen;
 * the default option keeps the first-account behaviour.
 *
 * No JS framework, no external assets, no build step. All styling is one
 * inline <style> block; the shell's logout is a plain form POST. Dynamic
 * values are injected via textContent / input.value — never innerHTML.
 */

import { DNS_PROVIDERS, FORMATS, I1_MASKS, SERVICES } from './generate.js';

// Static option lists for the generator card (ticket 09) — values come from
// our own constant registries, so building them into the shell is safe.
const FORMAT_OPTIONS = FORMATS.map((f) => `<option value="${f.id}">${f.name}</option>`).join('\n');
const DNS_OPTIONS = DNS_PROVIDERS.map((d) => `<option value="${d.id}">${d.label}${d.isCommunity ? ' •' : ''}</option>`).join('\n');

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
  nav a { color: var(--muted); text-decoration: none; }
  nav a.active { color: var(--text); }
  nav a:hover { color: var(--text); }
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
  .account-row {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
  }
  .account-row .label-row { display: flex; align-items: center; gap: 10px; }
  .account-row .label-row input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .account-row .label-row input:hover { border-color: var(--border); }
  .account-row .label-row input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-color: transparent;
    background: #12192b;
  }
  .account-row .label-row .badge { flex: 0 0 auto; }
  .account-row .meta { margin: 8px 0 0; }
  .account-row .actions { margin-top: 10px; }
  .account-row .actions button {
    flex: 0 0 auto;
    width: auto;
    padding: 5px 12px;
    font-size: 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .account-row .actions button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .account-row .actions button.danger { color: var(--danger); border-color: var(--danger); }
  .account-row .actions button.danger:hover { background: rgba(247, 118, 142, 0.08); filter: none; }
  .account-row .actions button:disabled { opacity: 0.55; cursor: wait; }
  .account-row textarea { margin-top: 10px; min-height: 70px; }
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
  /* ---- Subscriptions card (ticket 02) ---- */
  .subs-new { margin-top: 14px; }
  .subs-new input[type="text"] {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font-size: 14px;
  }
  .subs-new input[type="text"]:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .subs-new .actions { margin-top: 10px; }
  .subs-new .actions button {
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .subs-new .actions button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .subs-new .actions button:disabled { opacity: 0.55; cursor: wait; }
  #subs-list { list-style: none; margin: 14px 0 0; padding: 0; }
  .sub-row {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.02);
  }
  .sub-row .head { display: flex; align-items: center; gap: 10px; }
  .sub-row .head input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-size: 14px;
    font-weight: 600;
  }
  .sub-row .head input:hover { border-color: var(--border); }
  .sub-row .head input:focus {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
    border-color: transparent;
    background: #12192b;
  }
  .sub-row .head .badge { flex: 0 0 auto; }
  .subs-pin { margin-top: 10px; }
  .subs-pin label { margin-bottom: 4px; }
  .subs-pin select {
    width: 100%;
    padding: 7px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font-size: 13px;
  }
  .subs-pin select:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .sub-row .meta { margin: 8px 0 0; }
  .sub-row .actions { margin-top: 10px; }
  .sub-row .actions button {
    flex: 0 0 auto;
    width: auto;
    padding: 5px 12px;
    font-size: 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  .sub-row .actions button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .sub-row .actions button.danger { color: var(--danger); border-color: var(--danger); }
  .sub-row .actions button.danger:hover { background: rgba(247, 118, 142, 0.08); filter: none; }
  .sub-row .actions button:disabled { opacity: 0.55; cursor: wait; }
  .subs-created {
    margin-top: 14px;
    padding: 12px 14px;
    border: 1px solid rgba(158, 206, 106, 0.4);
    border-radius: 10px;
    background: rgba(158, 206, 106, 0.06);
  }
  .subs-created .warn { margin: 0; color: var(--danger); font-size: 13px; }
  .subs-created .token-line { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
  .subs-created .token-line code {
    display: block;
    margin-top: 4px;
    color: var(--accent);
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    overflow-wrap: anywhere;
  }
  .subs-created ul { list-style: none; margin: 10px 0 0; padding: 0; }
  .subs-created li {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 0;
    border-bottom: 1px solid var(--border);
  }
  .subs-created li:last-child { border-bottom: 0; }
  .subs-created li .lname { flex: 0 0 160px; font-size: 13px; color: #e8eefc; }
  .subs-created li .lname small { display: block; color: var(--muted); font-size: 11px; }
  .subs-created li code {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    color: var(--accent);
  }
  .subs-created li button {
    width: auto;
    margin: 0;
    padding: 5px 12px;
    font-size: 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
    border-radius: 8px;
    cursor: pointer;
    flex: 0 0 auto;
  }
  .subs-created li button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .subs-created li button.copied { color: #9ece6a; border-color: rgba(158, 206, 106, 0.4); }
  .subs-created .actions { margin-top: 10px; }
  .subs-created .actions button {
    flex: 0 0 auto;
    width: auto;
    padding: 5px 12px;
    font-size: 12px;
    background: transparent;
    color: var(--accent);
    border: 1px solid var(--accent);
  }
  /* ---- Generator card (ticket 09) ---- */
  .gen-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 14px;
  }
  .gen-wide { grid-column: 1 / -1; }
  .gen-field label { margin-bottom: 4px; }
  .gen-field select,
  .gen-field input[type="text"] {
    width: 100%;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font-size: 14px;
  }
  .gen-field select:focus, .gen-field input[type="text"]:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .gen-field input[type="text"] { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .gen-field select:disabled, .gen-field input:disabled { opacity: 0.5; }
  .gen-toggles { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 14px; align-items: center; }
  .gen-toggles .toggle { max-width: none; white-space: nowrap; }
  .gen-toggles input[type="text"] {
    width: 90px;
    padding: 6px 8px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: #12192b;
    color: var(--text);
    font: 13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .gen-toggles input[type="text"]:focus { outline: 2px solid var(--accent); border-color: transparent; }
  .gen-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .gen-chips button {
    width: auto;
    margin: 0;
    padding: 6px 12px;
    font-size: 13px;
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 999px;
    cursor: pointer;
  }
  .gen-chips button:hover { border-color: var(--accent); filter: none; }
  .gen-chips button.on { background: rgba(122, 162, 247, 0.18); border-color: var(--accent); color: #e8eefc; }
  .gen-result { margin-top: 12px; padding: 12px 14px; border: 1px solid rgba(158, 206, 106, 0.4); border-radius: 8px; background: rgba(158, 206, 106, 0.06); }
  .gen-result .actions { margin-top: 10px; }
  .gen-result .actions button { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .gen-result .actions button:hover { background: rgba(122, 162, 247, 0.12); filter: none; }
  .gen-result .meta { margin: 0; }
  .gen-result img { display: block; margin-top: 12px; max-width: 200px; image-rendering: pixelated; border-radius: 8px; }
  .gen-hint { margin: 10px 0 0; }
  .gen-hint a { color: var(--accent); }
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
 * Authenticated shell with the accounts card (ticket 02 → ticket 01). The
 * card fetches /api/accounts on load; Register/Import-append POST to
 * /api/accounts/register|import, and per-row actions POST to
 * /api/accounts/:id/{rotate|import|rename|delete}; the inline script owns
 * the in-flight state (network ~1-2 s) and error rendering. Framework-less
 * per ADR 0004 — dynamic values are injected via textContent, never
 * innerHTML.
 */
export function panelShell({ origin = '' } = {}) {
  // String.raw: the inline scripts carry regex/string escapes (\d, \n, …)
  // that an ordinary template literal would cook away and break in the
  // browser — keep them byte-exact. ${…} interpolation still works.
  return page('WARP Panel', String.raw`
<header>
  <span class="brand">WARP Panel</span>
  <nav>
    <a href="#accounts-card" class="active">Accounts</a>
    <a href="#endpoints-card">Endpoints</a>
    <a href="#subscriptions-card">Subscriptions</a>
    <a href="#generator-card">Generator</a>
  </nav>
  <form method="post" action="/api/auth/logout">
    <button type="submit">Log out</button>
  </form>
</header>
<main>
  <section class="card-panel" id="accounts-card">
    <div class="card-head">
      <h2>WARP accounts</h2>
      <span id="accounts-status" class="badge">…</span>
    </div>
    <p class="meta">Each account is a separate WARP registration. A subscription is pinned to one account — re-pin or rotate to fail over without touching the other accounts.</p>
    <div id="accounts-list"></div>
    <div class="actions">
      <button type="button" id="accounts-register-button">Register account</button>
    </div>
    <p class="meta">…or import one registered from your own network (paste a WireGuard .conf or the registration JSON from warp-reg):</p>
    <textarea id="accounts-import-input" rows="3" spellcheck="false" placeholder="Paste a WireGuard .conf or the registration JSON from warp-reg — adds a new account."></textarea>
    <div class="actions">
      <button type="button" id="accounts-import-button">Import new account</button>
    </div>
    <p id="accounts-verdict" class="meta feed" hidden></p>
    <div id="accounts-error" class="error" hidden></div>
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
  <section class="card-panel" id="subscriptions-card">
    <div class="card-head">
      <h2>Subscriptions</h2>
      <span id="subs-status" class="badge">…</span>
    </div>
    <p class="meta">One subscription per client family — the token inside its links <strong>is</strong> the credential (no password, ADR 0006): anyone holding a link can fetch it, so share only with people you trust. Links stay stable across re-pins, rotations and endpoint edits.</p>
    <div class="subs-new">
      <input type="text" id="subs-name-input" spellcheck="false" maxlength="60" placeholder="Subscription name (e.g. Home)">
      <div class="actions">
        <button type="button" id="subs-create-button">New subscription</button>
      </div>
    </div>
    <div id="subs-created" class="subs-created" hidden></div>
    <ul id="subs-list" class="sub-list"></ul>
    <div id="subs-error" class="error" hidden></div>
  </section>
  <section class="card-panel" id="generator-card">
    <div class="card-head">
      <h2>Generator</h2>
      <span id="generator-status" class="badge">Single config</span>
    </div>
    <p class="meta">One config for one client, rendered from the account you pick — no new WARP registration happens here.</p>
    <div class="gen-grid">
      <div class="gen-field gen-wide">
        <label for="gen-account">Account</label>
        <select id="gen-account" disabled>
          <option value="">First account (default)</option>
        </select>
      </div>
      <div class="gen-field">
        <label for="gen-format">Config format</label>
        <select id="gen-format">
${FORMAT_OPTIONS}
        </select>
      </div>
      <div class="gen-field">
        <label for="gen-device">Connection settings</label>
        <select id="gen-device">
          <option value="awg15">AmneziaWG 1.5</option>
        </select>
      </div>
      <div class="gen-field gen-wide">
        <label for="gen-endpoint">Endpoint override</label>
        <input type="text" id="gen-endpoint" spellcheck="false" placeholder="162.159.192.1:2408">
      </div>
      <div class="gen-field">
        <label for="gen-dns">DNS</label>
        <select id="gen-dns">
${DNS_OPTIONS}
        </select>
      </div>
      <div class="gen-field">
        <label for="gen-sitemode">Config type</label>
        <select id="gen-sitemode">
          <option value="all">All sites</option>
          <option value="specific">Specific sites</option>
        </select>
      </div>
    </div>
    <div id="gen-services" class="gen-chips" hidden></div>
    <div class="gen-toggles">
      <label class="toggle"><input type="checkbox" id="gen-ipv6" checked><span>IPv6 addresses</span></label>
      <label class="toggle"><input type="checkbox" id="gen-exclude-lan"><span>Exclude LAN / link-local</span></label>
      <label class="toggle"><input type="checkbox" id="gen-keepalive-enabled"><span>Persistent keepalive</span></label>
      <input type="text" id="gen-keepalive" inputmode="numeric" placeholder="25" disabled>
    </div>
    <div class="gen-field gen-wide" id="gen-i1-row" hidden>
      <label for="gen-i1-domain">Custom I1 domain (advanced) — QUIC initial mask, only for the AmneziaWG format</label>
      <input type="text" id="gen-i1-domain" spellcheck="false" placeholder="ozon.ru">
    </div>
    <div class="actions">
      <button type="button" id="gen-generate-button">Generate config</button>
    </div>
    <p class="meta gen-hint">Needs an account from the <a href="#accounts-card">accounts card</a> — if you have not registered or imported one yet, do that first.</p>
    <p id="gen-feedback" class="meta feed" hidden></p>
    <div id="gen-result" class="gen-result" hidden>
      <p id="gen-result-file" class="meta"></p>
      <div class="actions">
        <button type="button" id="gen-copy-button">Copy config</button>
        <button type="button" id="gen-download-button">Download</button>
        <button type="button" id="gen-qr-button" hidden>Show QR</button>
      </div>
      <img id="gen-qr" alt="QR code" hidden>
    </div>
  </section>
</main>
<script>
(() => {
  // Accounts card (ticket 01): multiple WARP accounts with per-row actions.
  // Rows are built with createElement / textContent — never innerHTML.
  // Label edits commit on Enter/blur and revert on failure; every button
  // disables in flight. Delete warns that pinned subscriptions will 503.
  const statusEl = document.getElementById('accounts-status');
  const listEl = document.getElementById('accounts-list');
  const errorEl = document.getElementById('accounts-error');
  const registerBtn = document.getElementById('accounts-register-button');
  const importBtn = document.getElementById('accounts-import-button');
  const importInput = document.getElementById('accounts-import-input');
  const verdictEl = document.getElementById('accounts-verdict');

  let accounts = [];

  function fmt(dateStr) {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime()) ? dateStr : d.toLocaleString();
  }

  function metaText(account) {
    const imported = account.source === 'import';
    let meta = (imported ? 'Imported ' : 'Registered ') + fmt(account.registeredAt) + ' · ' + (account.v4 || '—');
    if (imported) {
      meta += account.verified === true ? ' · Verified with Cloudflare'
        : account.verifiedAt ? ' · Verification failed — stored anyway'
        : ' · Unverified (no credentials in the import)';
    }
    return meta;
  }

  function rowActions(account) {
    const wrap = document.createElement('div');
    wrap.className = 'actions';

    const rotate = document.createElement('button');
    rotate.type = 'button';
    rotate.textContent = 'Rotate';
    rotate.addEventListener('click', function () { runPerAccount(account.id, 'rotate'); });
    wrap.appendChild(rotate);

    const toggleImport = document.createElement('button');
    toggleImport.type = 'button';
    toggleImport.textContent = 'Import…';
    const replaceWrap = document.createElement('div');
    replaceWrap.hidden = true;
    const replaceInput = document.createElement('textarea');
    replaceInput.rows = 3;
    replaceInput.spellcheck = false;
    replaceInput.placeholder = 'Paste a .conf or registration JSON — replaces this account.';
    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.textContent = 'Replace this account';
    replaceBtn.addEventListener('click', function () {
      if (!replaceInput.value.trim()) return;
      if (!window.confirm('Import replaces this account only. Continue?')) return;
      runPerAccount(account.id, 'import', replaceInput.value);
    });
    replaceWrap.appendChild(replaceInput);
    replaceWrap.appendChild(replaceBtn);
    toggleImport.addEventListener('click', function () { replaceWrap.hidden = !replaceWrap.hidden; });
    wrap.appendChild(toggleImport);
    wrap.appendChild(replaceWrap);

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.className = 'danger';
    del.addEventListener('click', function () {
      const msg = 'Delete account "' + account.label + '"? Any subscription pinned to it will return 503 until re-pinned.';
      if (window.confirm(msg)) runPerAccount(account.id, 'delete');
    });
    wrap.appendChild(del);
    return wrap;
  }

  function row(account) {
    const wrap = document.createElement('div');
    wrap.className = 'account-row';
    wrap.dataset.accountId = account.id;

    const labelRow = document.createElement('div');
    labelRow.className = 'label-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = account.label;
    input.spellcheck = false;
    input.title = 'Rename — Enter or blur to save';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { input.value = account.label; input.blur(); }
    });
    input.addEventListener('change', function () {
      const next = input.value.trim();
      if (!next || next === account.label) { input.value = account.label; return; }
      runPerAccount(account.id, 'rename', null, next).catch(function () { input.value = account.label; });
    });
    const b = document.createElement('span');
    b.className = account.source === 'import' ? 'badge' : 'badge ok';
    b.textContent = account.source === 'import' ? 'Imported' : 'Registered';
    labelRow.appendChild(input);
    labelRow.appendChild(b);
    wrap.appendChild(labelRow);

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = metaText(account);
    wrap.appendChild(meta);

    wrap.appendChild(rowActions(account));
    return wrap;
  }

  function render() {
    listEl.textContent = '';
    if (!accounts.length) {
      const p = document.createElement('p');
      p.className = 'meta';
      p.textContent = 'No WARP accounts yet — register one or import an existing account.';
      listEl.appendChild(p);
      statusEl.textContent = 'No accounts';
      statusEl.className = 'badge';
      return;
    }
    statusEl.textContent = accounts.length + (accounts.length === 1 ? ' account' : ' accounts');
    statusEl.className = 'badge ok';
    accounts.forEach(function (a) { listEl.appendChild(row(a)); });
  }

  async function runPerAccount(id, action, text, label) {
    errorEl.hidden = true;
    const path = '/api/accounts/' + encodeURIComponent(id) + '/' + action;
    const body = action === 'rename' ? { label: label }
      : action === 'import' ? { text: text }
      : undefined;
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      await load();
    } catch (err) {
      errorEl.textContent = err.message || 'Unknown error';
      errorEl.hidden = false;
    }
  }

  function setBusy(busy) {
    registerBtn.disabled = busy;
    importBtn.disabled = busy;
  }

  async function load() {
    try {
      const res = await fetch('/api/accounts');
      const data = await res.json().catch(function () { return {}; });
      accounts = (data && data.accounts) || [];
    } catch {
      statusEl.textContent = 'Unavailable';
      statusEl.className = 'badge err';
      accounts = [];
    }
    render();
  }

  async function runRegister() {
    errorEl.hidden = true;
    setBusy(true);
    registerBtn.textContent = 'Registering…';
    try {
      const res = await fetch('/api/accounts/register', { method: 'POST' });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      await load();
    } catch (err) {
      errorEl.textContent = err.message || 'Unknown error';
      errorEl.hidden = false;
    } finally {
      setBusy(false);
      registerBtn.textContent = 'Register account';
    }
  }

  async function runImportAppend() {
    errorEl.hidden = true;
    if (!importInput.value.trim()) return;
    setBusy(true);
    importBtn.textContent = 'Importing…';
    try {
      const res = await fetch('/api/accounts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: importInput.value }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      if (data.verdict) {
        verdictEl.textContent = data.verdict.verified
          ? 'Import stored. Credentials verified against Cloudflare — subscriptions using it are live.'
          : data.verdict.verifiedAt
            ? 'Import stored, but verification failed — subscriptions still work; the account may stop connecting.'
            : 'Import stored as unverified (conf-only, no client id/token) — subscriptions still work.';
        verdictEl.hidden = false;
      }
      importInput.value = '';
      await load();
    } catch (err) {
      errorEl.textContent = err.message || 'Unknown error';
      errorEl.hidden = false;
    } finally {
      setBusy(false);
      importBtn.textContent = 'Import new account';
    }
  }

  registerBtn.addEventListener('click', runRegister);
  importBtn.addEventListener('click', runImportAppend);
  load();
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
<script>
(() => {
  // Generator card (ticket 09): the legacy single-config flow POSTing to the
  // gated /api/generator, which renders from the STORED account — no /reg
  // calls. Mirrors hooks/use-generator.ts: community DNS forces "all sites"
  // (same rule the server enforces), "specific" turns off exclude-LAN,
  // picking any service turns off exclude-LAN. Dynamic values go through
  // textContent / .value / img.src — never innerHTML.
  const SERVICES_LIST = ${JSON.stringify(SERVICES)};
  const FORMATS_LIST = ${JSON.stringify(FORMATS)};
  const DNS_LIST = ${JSON.stringify(DNS_PROVIDERS)};

  const formatEl = document.getElementById('gen-format');
  const accountEl = document.getElementById('gen-account');
  const deviceEl = document.getElementById('gen-device');
  const endpointEl = document.getElementById('gen-endpoint');
  const dnsEl = document.getElementById('gen-dns');
  const siteModeEl = document.getElementById('gen-sitemode');
  const servicesEl = document.getElementById('gen-services');
  const ipv6El = document.getElementById('gen-ipv6');
  const excludeLanEl = document.getElementById('gen-exclude-lan');
  const keepaliveEnabledEl = document.getElementById('gen-keepalive-enabled');
  const keepaliveEl = document.getElementById('gen-keepalive');
  const i1RowEl = document.getElementById('gen-i1-row');
  const i1DomainEl = document.getElementById('gen-i1-domain');
  const generateBtn = document.getElementById('gen-generate-button');
  const statusEl = document.getElementById('generator-status');
  const feedbackEl = document.getElementById('gen-feedback');
  const resultEl = document.getElementById('gen-result');
  const resultFileEl = document.getElementById('gen-result-file');
  const copyBtn = document.getElementById('gen-copy-button');
  const downloadBtn = document.getElementById('gen-download-button');
  const qrBtn = document.getElementById('gen-qr-button');
  const qrImg = document.getElementById('gen-qr');

  let selectedServices = [];
  let result = null; // { configBase64, qrCodeBase64, configFormat, fileName }
  let qrVisible = false;

  function dnsProvider(id) { return DNS_LIST.find(function (d) { return d.id === id; }) || DNS_LIST[0]; }
  function isCommunityDns(id) { return dnsProvider(id).isCommunity === true; }

  function setFeedback(text, kind) {
    feedbackEl.textContent = text;
    feedbackEl.className = 'meta feed' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
    feedbackEl.hidden = false;
  }

  function hideResult() {
    resultEl.hidden = true;
    result = null;
    qrVisible = false;
  }

  // ---- site picker (name-only chips, static list from worker/generate.js) ----
  function renderServices() {
    servicesEl.textContent = '';
    const visible = siteModeEl.value === 'specific' && !isCommunityDns(dnsEl.value);
    servicesEl.hidden = !visible;
    if (!visible) return;
    SERVICES_LIST.forEach(function (s) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.textContent = s.name;
      chip.className = selectedServices.includes(s.id) ? 'on' : '';
      chip.addEventListener('click', function () {
        if (isCommunityDns(dnsEl.value)) return;
        const i = selectedServices.indexOf(s.id);
        if (i === -1) selectedServices.push(s.id);
        else selectedServices.splice(i, 1);
        if (selectedServices.length) excludeLanEl.checked = false; // legacy use-generator behavior
        renderServices();
      });
      servicesEl.appendChild(chip);
    });
  }

  function refreshSiteModeUI() {
    const community = isCommunityDns(dnsEl.value);
    if (community) {
      siteModeEl.value = 'all'; // community DNS forbids split tunneling (server rule mirrored)
      selectedServices = [];
      siteModeEl.querySelector('option[value="specific"]').disabled = true;
    } else {
      siteModeEl.querySelector('option[value="specific"]').disabled = false;
    }
    renderServices();
  }

  dnsEl.addEventListener('change', function () {
    if (isCommunityDns(dnsEl.value)) selectedServices = [];
    refreshSiteModeUI();
  });
  siteModeEl.addEventListener('change', function () {
    if (siteModeEl.value === 'specific' && isCommunityDns(dnsEl.value)) {
      siteModeEl.value = 'all'; // refuses (legacy setSiteMode guard)
      return;
    }
    if (siteModeEl.value === 'specific') excludeLanEl.checked = false; // exclude-LAN is an all-sites option
    renderServices();
  });
  formatEl.addEventListener('change', function () {
    // Custom I1 is only meaningful where I1 lands: the AmneziaWG wireguard format.
    i1RowEl.hidden = formatEl.value !== 'wireguard';
  });
  keepaliveEnabledEl.addEventListener('change', function () {
    keepaliveEl.disabled = !keepaliveEnabledEl.checked;
  });

  function setBusy(busy) {
    generateBtn.disabled = busy;
    generateBtn.textContent = busy ? 'Generating…' : 'Generate config';
  }

  async function generate() {
    setFeedback('', '');
    hideResult();
    setBusy(true);
    try {
      const endpoint = endpointEl.value.trim() || 'engage.cloudflareclient.com:4500';
      const persistentKeepalive = keepaliveEnabledEl.checked
        ? (parseInt(keepaliveEl.value, 10) || 25)
        : null;
      const customI1Domain = i1RowEl.hidden ? '' : i1DomainEl.value.trim();
      const body = {
        selectedServices: selectedServices,
        siteMode: siteModeEl.value,
        deviceType: deviceEl.value,
        endpoint: endpoint,
        configFormat: formatEl.value,
        dnsId: dnsEl.value,
        ipv6: ipv6El.checked,
        excludeLan: excludeLanEl.checked,
        persistentKeepalive: persistentKeepalive,
        customI1Domain: customI1Domain,
      };
      if (accountEl.value) body.accountId = accountEl.value;
      const res = await fetch('/api/generator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success || !data.content) {
        throw new Error(data.message || ('Generation failed (HTTP ' + res.status + ')'));
      }
      result = data.content;
      const info = FORMATS_LIST.find(function (f) { return f.id === result.configFormat; }) || FORMATS_LIST[0];
      resultFileEl.textContent = 'Your ' + info.name + ' configuration is ready — file: ' + result.fileName;
      resultEl.hidden = false;
      qrBtn.hidden = !result.qrCodeBase64;
      qrVisible = false;
      qrImg.hidden = true;
    } catch (err) {
      setFeedback(err.message || 'Generation failed.', 'err');
    } finally {
      setBusy(false);
    }
  }

  copyBtn.addEventListener('click', function () {
    if (!result) return;
    navigator.clipboard.writeText(atob(result.configBase64))
      .then(function () { setFeedback('Config copied to clipboard.', 'ok'); })
      .catch(function () { setFeedback('Could not copy — copy it manually from the download.', 'err'); });
  });
  downloadBtn.addEventListener('click', function () {
    if (!result) return;
    const a = document.createElement('a');
    a.href = 'data:application/octet-stream;base64,' + result.configBase64;
    a.download = result.fileName;
    a.click();
  });
  qrBtn.addEventListener('click', function () {
    qrVisible = !qrVisible;
    qrImg.src = result && result.qrCodeBase64 ? result.qrCodeBase64 : '';
    qrImg.hidden = !qrVisible;
    qrBtn.textContent = qrVisible ? 'Hide QR' : 'Show QR';
  });
  generateBtn.addEventListener('click', generate);

  // ---- load current state: endpoints feed the endpoint override default ----
  Promise.all([
    fetch('/api/settings').then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch('/api/accounts').then(function (r) { return r.json(); }).catch(function () { return {}; }),
  ]).then(function (results) {
    const settings = results[0].settings || {};
    if (settings.endpoints && settings.endpoints.text) {
      const first = settings.endpoints.text.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)[0];
      if (first) endpointEl.value = first;
    }
    const accounts = results[1].accounts || [];
    accountEl.textContent = '';
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'First account (default)';
    accountEl.appendChild(defaultOpt);
    if (!accounts.length) {
      statusEl.textContent = 'No account';
      statusEl.className = 'badge err';
      generateBtn.disabled = true;
      accountEl.disabled = true;
    } else {
      accounts.forEach(function (a) {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = a.label;
        accountEl.appendChild(opt);
      });
      accountEl.disabled = false;
    }
  });
})();
</script>
<script>
(() => {
  // ---- Subs card (ticket 02) ----
  // Fetches /api/subs + /api/accounts on load. Rows are built with
  // createElement / textContent — never innerHTML. Creating a subscription
  // (or resetting its token) returns the raw token + the full link list
  // exactly once, shown in #subs-created; the list itself only ever shows
  // the tokenHashPrefix fingerprint.
  const statusEl = document.getElementById('subs-status');
  const listEl = document.getElementById('subs-list');
  const errorEl = document.getElementById('subs-error');
  const nameInput = document.getElementById('subs-name-input');
  const createBtn = document.getElementById('subs-create-button');
  const createdEl = document.getElementById('subs-created');

  let subs = [];
  let accounts = [];

  function setError(msg) {
    errorEl.textContent = msg || '';
    errorEl.hidden = !msg;
  }

  function accountById(id) {
    for (let i = 0; i < accounts.length; i++) if (accounts[i].id === id) return accounts[i];
    return null;
  }

  function copyText(btn, text) {
    const done = function () {
      btn.textContent = 'Copied';
      btn.classList.add('copied');
      setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      done(); // no clipboard API — the row stays visible for manual copying
    }
  }

  // One link row inside the once-only panel: name + description + copy button.
  function linkRow(link) {
    const li = document.createElement('li');
    const name = document.createElement('span');
    name.className = 'lname';
    name.textContent = link.name;
    const desc = document.createElement('small');
    desc.textContent = link.description;
    name.appendChild(desc);
    const code = document.createElement('code');
    code.textContent = link.href;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy';
    copy.addEventListener('click', function () { copyText(copy, link.href); });
    li.appendChild(name);
    li.appendChild(code);
    li.appendChild(copy);
    return li;
  }

  // Show the raw token + all links exactly once (create / reset-token).
  function showOnce(sub, heading) {
    createdEl.textContent = '';
    const warn = document.createElement('p');
    warn.className = 'warn';
    warn.textContent = heading + ' Copy the links and the token now — the token is shown only once; the list below shows just a fingerprint afterwards.';
    createdEl.appendChild(warn);

    const tokenLine = document.createElement('p');
    tokenLine.className = 'token-line';
    tokenLine.textContent = 'Token (the links above already carry it — keep it to rebuild a client manually)';
    const tokenCode = document.createElement('code');
    tokenCode.textContent = sub.token;
    tokenLine.appendChild(tokenCode);
    createdEl.appendChild(tokenLine);

    const list = document.createElement('ul');
    sub.links.forEach(function (link) { list.appendChild(linkRow(link)); });
    createdEl.appendChild(list);

    const actions = document.createElement('div');
    actions.className = 'actions';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Done';
    close.addEventListener('click', function () {
      createdEl.hidden = true;
      createdEl.textContent = '';
    });
    actions.appendChild(close);
    createdEl.appendChild(actions);
    createdEl.hidden = false;
    createdEl.scrollIntoView({ block: 'nearest' });
  }

  function pinSelect(sub) {
    const wrap = document.createElement('div');
    wrap.className = 'subs-pin';
    const label = document.createElement('label');
    label.textContent = 'Pinned account';
    const select = document.createElement('select');
    select.title = 'Pin this subscription to an account — re-pin anytime, its URL never changes.';

    const unpin = document.createElement('option');
    unpin.value = '';
    unpin.textContent = 'Unpinned';
    select.appendChild(unpin);

    const selected = sub.accountId;
    const known = accountById(selected);
    if (selected && !known) {
      const missing = document.createElement('option');
      missing.value = selected;
      missing.textContent = '(deleted account)';
      select.appendChild(missing);
    }
    accounts.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.label;
      select.appendChild(opt);
    });
    select.value = selected || '';
    select.addEventListener('change', function () {
      runSubAction(sub.id, 'pin', { accountId: select.value || null });
    });
    wrap.appendChild(label);
    wrap.appendChild(select);
    return wrap;
  }

  function metaText(sub) {
    const created = new Date(sub.createdAt);
    const when = Number.isNaN(created.getTime()) ? '' : ' · created ' + created.toLocaleString();
    if (sub.accountId && sub.accountLabel) return 'Pinned to ' + sub.accountLabel + when;
    if (sub.accountId) return 'Pinned to a deleted account — returns 503 until re-pinned' + when;
    return 'Unpinned — returns 503 until an account is pinned' + when;
  }

  function rowActions(sub) {
    const wrap = document.createElement('div');
    wrap.className = 'actions';

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Reset token';
    reset.addEventListener('click', function () {
      const msg = 'Reset the token for "' + sub.name + '"? Its old links stop working; the new links are shown only once.';
      if (window.confirm(msg)) runSubAction(sub.id, 'reset-token', null, true);
    });
    wrap.appendChild(reset);

    const del = document.createElement('button');
    del.type = 'button';
    del.textContent = 'Delete';
    del.className = 'danger';
    del.addEventListener('click', function () {
      if (window.confirm('Delete subscription "' + sub.name + '"? Its links stop working immediately.')) {
        runSubAction(sub.id, 'delete');
      }
    });
    wrap.appendChild(del);
    return wrap;
  }

  function row(sub) {
    const wrap = document.createElement('div');
    wrap.className = 'sub-row';
    wrap.dataset.subId = sub.id;

    const head = document.createElement('div');
    head.className = 'head';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = sub.name;
    input.spellcheck = false;
    input.title = 'Rename — Enter or blur to save';
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') input.blur();
      else if (e.key === 'Escape') { input.value = sub.name; input.blur(); }
    });
    input.addEventListener('change', function () {
      const next = input.value.trim();
      if (!next || next === sub.name) { input.value = sub.name; return; }
      runSubAction(sub.id, 'rename', { name: next }).then(function (ok) {
        if (!ok) input.value = sub.name; // revert on failure
      });
    });
    const fingerprint = document.createElement('span');
    fingerprint.className = 'badge';
    fingerprint.title = 'Token fingerprint — the raw token is shown only when you create or reset it.';
    fingerprint.textContent = sub.tokenHashPrefix;
    head.appendChild(input);
    head.appendChild(fingerprint);
    wrap.appendChild(head);

    wrap.appendChild(pinSelect(sub));

    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = metaText(sub);
    wrap.appendChild(meta);

    wrap.appendChild(rowActions(sub));
    return wrap;
  }

  function render() {
    listEl.textContent = '';
    if (!subs.length) {
      const p = document.createElement('p');
      p.className = 'meta';
      p.textContent = 'No subscriptions yet — create one to get links for your clients.';
      listEl.appendChild(p);
      statusEl.textContent = 'No subscriptions';
      statusEl.className = 'badge';
      return;
    }
    statusEl.textContent = subs.length + (subs.length === 1 ? ' subscription' : ' subscriptions');
    statusEl.className = 'badge ok';
    subs.forEach(function (s) { listEl.appendChild(row(s)); });
  }

  function setBusy(busy) {
    createBtn.disabled = busy;
    createBtn.textContent = busy ? 'Creating…' : 'New subscription';
  }

  // Resolves true on success, false on failure (after setting the error box).
  async function runSubAction(id, action, body, showOnceResult) {
    setError('');
    try {
      const res = await fetch('/api/subs/' + encodeURIComponent(id) + '/' + action, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      if (showOnceResult && data.sub) showOnce(data.sub, 'Token reset — the old links are retired.');
      await load();
      return true;
    } catch (err) {
      setError(err.message || 'Unknown error');
      return false;
    }
  }

  async function createSub() {
    setError('');
    const name = nameInput.value.trim();
    if (!name) { setError('Give the subscription a name first.'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/subs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name }),
      });
      const data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) throw new Error(data.message || ('Request failed (HTTP ' + res.status + ')'));
      nameInput.value = '';
      showOnce(data.sub, 'Subscription created — these links are not shown again.');
      await load();
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    try {
      const results = await Promise.all([
        fetch('/api/subs').then(function (r) { return r.json(); }).catch(function () { return {}; }),
        fetch('/api/accounts').then(function (r) { return r.json(); }).catch(function () { return {}; }),
      ]);
      subs = results[0].subs || [];
      accounts = results[1].accounts || [];
    } catch {
      statusEl.textContent = 'Unavailable';
      statusEl.className = 'badge err';
      subs = [];
      accounts = [];
    }
    render();
  }

  createBtn.addEventListener('click', createSub);
  nameInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createSub();
  });
  load();
})();
</script>
`);
}