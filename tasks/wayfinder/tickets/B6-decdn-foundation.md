# B6 — Frontend foundation: de-CDN + shared templates

Status: OPEN
Type: task (AFK)
Blocked by: B5

## Question / Work

Target market (Iran) cannot reliably reach cdn.tailwindcss.com or Google Fonts — both are render-blocking today.
1. Hand-written design-token CSS (custom properties + the ~60 utility patterns actually used) inlined as ONE shared CSS const; zero third-party requests. System font stack (ui-sans-serif etc.) replacing Space Grotesk/JetBrains Mono webfonts.
2. Deduplicate the three templates (SETUP_HTML/LOGIN_HTML/DASHBOARD_HTML): shared head/CSS/icon consts concatenated; all three use String.raw discipline (v1.2 escape bug class); single VERSION const injected everywhere (kills hardcoded v1.3 chip drift).
3. CSP cleanup: remove cdn.tailwindcss.com + fonts sources entirely; keep script-src 'unsafe-inline' 'unsafe-eval'? NO eval needed — self + unsafe-inline only (inline SPA scripts require unsafe-inline until nonces; document why). style-src 'unsafe-inline' retained (inline styles).
4. htmlResponse: add sane Cache-Control (no-store for authed pages).

## Acceptance

- Local dev renders all three pages correctly with ZERO external requests (verify via devtools/network in wrangler dev).
- Visual parity acceptable (dark glass design preserved via tokens); screenshot check via browser QA agent.

## Answer

(resolved on close)
