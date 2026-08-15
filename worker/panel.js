/**
 * Framework-less panel UI (ADR 0004): worker-rendered HTML strings.
 * Ticket 01 ships two pages: a login page (served without auth) and an
 * empty authenticated shell that later tickets fill (account card, endpoint
 * editor, subscription links, generator).
 *
 * No JS framework, no external assets, no build step. All styling is one
 * inline <style> block; the shell's logout is a plain form POST.
 */

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
`);
}