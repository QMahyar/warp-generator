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
  .placeholder {
    padding: 48px 32px;
    text-align: center;
    background: var(--panel);
    border: 1px dashed var(--border);
    border-radius: 12px;
    color: var(--muted);
  }
  .placeholder strong { display: block; color: var(--text); margin-bottom: 6px; font-size: 16px; }
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

/** Authenticated empty shell — account, endpoints, subscriptions and the
 * generator land in later tickets. */
export function panelShell() {
  return page('WARP Panel', `
<header>
  <span class="brand">WARP Panel</span>
  <nav>
    <span>Account</span>
    <span>Endpoints</span>
    <span>Subscriptions</span>
    <span>Generator</span>
  </nav>
  <form method="post" action="/api/auth/logout">
    <button type="submit">Log out</button>
  </form>
</header>
<main>
  <div class="placeholder">
    <strong>Panel shell ready</strong>
    Registration, endpoints, subscriptions and the generator land in later tickets.
  </div>
</main>
`);
}