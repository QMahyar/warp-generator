import bcrypt from 'bcryptjs';
import { x25519 } from '@noble/curves/ed25519';
import { zipSync } from 'fflate';
import YAML from 'js-yaml';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_DURATION_MS / 1000;
const LOGIN_FAIL_TTL_SECONDS = 900;
const SESSION_COOKIE = 'session';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_BITS = 256;
const PBKDF2_SALT_BYTES = 16;
const PASSWORD_MAX_BYTES = 72;
const WARP_API_VERSION = 'v0a4005';
const WARP_API_BASE = `https://api.cloudflareclient.com/${WARP_API_VERSION}`;
const WARP_API_TIMEOUT = 10000;
const DEFAULT_WARP_USER_AGENT = 'okhttp/3.12.1';
const DEFAULT_WARP_CLIENT_VERSION = 'a-6.30-3596';
const WARP_MAX_RETRIES = 2;
const WARP_RETRY_BASE_MS = 500;
const WARP_RETRY_CAP_MS = 5000;
const WARP_PEER_PUBLIC_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';
const WG_MTU = 1280;
const WG_KEEPALIVE = 25;
const MAX_ENDPOINTS = 200;
const DEFAULT_DNS = '1.1.1.1';
const ACCOUNT_BATCH_SIZE = 20;
const VERSION = '1.0.3';
const BACKUP_MAGIC = 'WGENC1';
const BACKUP_SALT_BYTES = 16;
const BACKUP_IV_BYTES = 12;
const BACKUP_PASSWORD_MIN = 8;
const BACKUP_PASSWORD_MAX = 128;
const AGG_KEY_PREFIX = 'agg:';
const AGG_MAX_GROUPS = 50;
const GROUP_NAME_MAX = 50;
const PROBE_TIMEOUT_MS = 3000;

const DEFAULT_PRESETS = [
  { id: 'default', name: 'Cloudflare Default', endpoints: [
    { ip: 'engage.cloudflareclient.com', port: 2408 },
    { ip: '162.159.192.1', port: 2408 },
    { ip: '162.159.192.1', port: 500 },
    { ip: '162.159.192.1', port: 1701 },
    { ip: '2606:4700:d0::a29f:c001', port: 2408 }
  ]},
  { id: 'iran', name: 'Iran', endpoints: [
    { ip: '162.159.192.1', port: 2408 }, { ip: '162.159.192.2', port: 2408 }, { ip: '162.159.192.3', port: 2408 }, { ip: '162.159.192.4', port: 2408 }, { ip: '162.159.192.5', port: 2408 }, { ip: '162.159.192.6', port: 2408 }, { ip: '162.159.192.7', port: 2408 }, { ip: '162.159.192.8', port: 2408 }, { ip: '162.159.192.9', port: 2408 }, { ip: '162.159.192.10', port: 2408 }, { ip: '162.159.192.11', port: 2408 }, { ip: '162.159.192.12', port: 2408 }, { ip: '162.159.192.13', port: 2408 }, { ip: '162.159.192.14', port: 2408 }, { ip: '162.159.192.15', port: 2408 }, { ip: '162.159.192.16', port: 2408 }, { ip: '162.159.192.17', port: 2408 }, { ip: '162.159.192.18', port: 2408 }, { ip: '162.159.192.19', port: 2408 }, { ip: '162.159.192.20', port: 2408 }, { ip: '162.159.195.1', port: 2408 }, { ip: '162.159.195.2', port: 2408 }, { ip: '162.159.195.3', port: 2408 }, { ip: '162.159.195.4', port: 2408 }, { ip: '162.159.195.5', port: 2408 }, { ip: '162.159.195.6', port: 2408 }, { ip: '162.159.195.7', port: 2408 }, { ip: '162.159.195.8', port: 2408 }, { ip: '162.159.195.9', port: 2408 }, { ip: '162.159.195.10', port: 2408 }, { ip: '162.159.195.11', port: 2408 }, { ip: '162.159.195.12', port: 2408 }, { ip: '162.159.195.13', port: 2408 }, { ip: '162.159.195.14', port: 2408 }, { ip: '162.159.195.15', port: 2408 }, { ip: '162.159.195.16', port: 2408 }, { ip: '162.159.195.17', port: 2408 }, { ip: '162.159.195.18', port: 2408 }, { ip: '162.159.195.19', port: 2408 }, { ip: '162.159.195.20', port: 2408 }, { ip: '162.159.204.1', port: 2408 }, { ip: '162.159.204.2', port: 2408 }, { ip: '162.159.204.3', port: 2408 }, { ip: '162.159.204.4', port: 2408 }, { ip: '162.159.204.5', port: 2408 }, { ip: '162.159.204.6', port: 2408 }, { ip: '162.159.204.7', port: 2408 }, { ip: '162.159.204.8', port: 2408 }, { ip: '162.159.204.9', port: 2408 }, { ip: '162.159.204.10', port: 2408 }
  ]},
  { id: 'china', name: 'China', endpoints: [
    { ip: '162.159.192.21', port: 2408 }, { ip: '162.159.192.22', port: 2408 }, { ip: '162.159.192.23', port: 2408 }, { ip: '162.159.192.24', port: 2408 }, { ip: '162.159.192.25', port: 2408 }, { ip: '162.159.192.26', port: 2408 }, { ip: '162.159.192.27', port: 2408 }, { ip: '162.159.192.28', port: 2408 }, { ip: '162.159.192.29', port: 2408 }, { ip: '162.159.192.30', port: 2408 }, { ip: '162.159.192.31', port: 2408 }, { ip: '162.159.192.32', port: 2408 }, { ip: '162.159.192.33', port: 2408 }, { ip: '162.159.192.34', port: 2408 }, { ip: '162.159.192.35', port: 2408 }, { ip: '162.159.192.36', port: 2408 }, { ip: '162.159.192.37', port: 2408 }, { ip: '162.159.192.38', port: 2408 }, { ip: '162.159.192.39', port: 2408 }, { ip: '162.159.192.40', port: 2408 }, { ip: '162.159.195.21', port: 2408 }, { ip: '162.159.195.22', port: 2408 }, { ip: '162.159.195.23', port: 2408 }, { ip: '162.159.195.24', port: 2408 }, { ip: '162.159.195.25', port: 2408 }, { ip: '162.159.195.26', port: 2408 }, { ip: '162.159.195.27', port: 2408 }, { ip: '162.159.195.28', port: 2408 }, { ip: '162.159.195.29', port: 2408 }, { ip: '162.159.195.30', port: 2408 }, { ip: '162.159.195.31', port: 2408 }, { ip: '162.159.195.32', port: 2408 }, { ip: '162.159.195.33', port: 2408 }, { ip: '162.159.195.34', port: 2408 }, { ip: '162.159.195.35', port: 2408 }, { ip: '162.159.195.36', port: 2408 }, { ip: '162.159.195.37', port: 2408 }, { ip: '162.159.195.38', port: 2408 }, { ip: '162.159.195.39', port: 2408 }, { ip: '162.159.195.40', port: 2408 }, { ip: '162.159.204.11', port: 2408 }, { ip: '162.159.204.12', port: 2408 }, { ip: '162.159.204.13', port: 2408 }, { ip: '162.159.204.14', port: 2408 }, { ip: '162.159.204.15', port: 2408 }, { ip: '162.159.204.16', port: 2408 }, { ip: '162.159.204.17', port: 2408 }, { ip: '162.159.204.18', port: 2408 }, { ip: '162.159.204.19', port: 2408 }, { ip: '162.159.204.20', port: 2408 }
  ]}
];

const DEFAULT_AMNEZIA = { Jc: 5, Jmin: 50, Jmax: 1000, S1: 0, S2: 0, S3: 0, S4: 0, H1: 0, H2: 0, H3: 0, H4: 0, I1: '' };

// AWG 2.0 init-packet junk notation: "<r N>" random bytes or "<b 0x..>" hex blob
const AWG_INIT_PACKET_RE = /^(?:<r \d+>|<b 0x[0-9a-fA-F]+>)$/;

const DEFAULT_SETTINGS_GLOBAL = {
  amnezia: DEFAULT_AMNEZIA
};

const HEAD_META = `<meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M18.5 5L9 18h6l-1.5 9L23 14h-6z' fill='white' opacity='0.95'/%3E%3C/svg%3E">`;

const SHARED_CSS = String.raw`:root {
  --bg: #05080f;
  --bg-raised: #0b111d;
  --surface: rgba(255,255,255,.03);
  --surface-2: rgba(255,255,255,.05);
  --line: rgba(255,255,255,.06);
  --line-strong: rgba(255,255,255,.10);
  --text: #f3f4f6;
  --text-mid: #d1d5db;
  --text-dim: #9ca3af;
  --text-faint: #94a3b8;
  --text-ghost: #76808f;
  --cyan: #22d3ee;
  --cyan-bright: #67e8f9;
  --accent-ink: #03141c;
  --blue: #3b82f6;
  --red: #ef4444;
  --red-soft: #f87171;
  --amber: #fbbf24;
  --violet: #c4b5fd;
  --font-sans: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Consolas, monospace;
  --ease: cubic-bezier(.16,1,.3,1);
}
*, *::before, *::after { box-sizing: border-box; }
html { color-scheme: dark; scroll-behavior: smooth; }
body {
  margin: 0; min-height: 100dvh; background: var(--bg); color: var(--text);
  font-family: var(--font-sans); font-size: 16px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
  overflow-x: hidden;
}
h1, h2, h3, p, ul { margin: 0; }
ul { list-style: none; padding: 0; }
a { color: inherit; text-decoration: none; }
button { cursor: pointer; font: inherit; color: inherit; background: none; border: none; padding: 0; }
input, select, textarea { font: inherit; color: var(--text); }
input:focus, select:focus, textarea:focus { outline: none; }
svg { display: block; flex-shrink: 0; }
::selection { background: rgba(34,211,238,.28); color: #eafcff; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 8px; border: 2px solid var(--bg); }
::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.16); }
:focus-visible { outline: 2px solid rgba(34,211,238,.65); outline-offset: 2px; }

@keyframes fade-up { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
@keyframes pulse-ring { 0% { transform: scale(.8); opacity: .45; } 100% { transform: scale(1.55); opacity: 0; } }
@keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@keyframes kf-toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
@keyframes kf-toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
@keyframes modal-pop-kf { from { opacity: 0; transform: scale(.95) translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes toast-progress { from { width: 100%; } to { width: 0%; } }

.hidden { display: none !important; }
.fade-up { animation: fade-up .55s var(--ease) both; }
.view-enter { animation: fade-up .45s var(--ease) both; }
.d1 { animation-delay: .07s; } .d2 { animation-delay: .14s; } .d3 { animation-delay: .21s; } .d4 { animation-delay: .28s; }
.pulse-ring { animation: pulse-ring 3.2s cubic-bezier(.2,.6,.3,1) infinite; }
.spinner { animation: spin .8s linear infinite; }
.modal-pop { animation: modal-pop-kf .22s var(--ease); }
.toast-in { animation: kf-toast-in .3s var(--ease); }
.toast-out { animation: kf-toast-out .3s ease-in forwards; }
.strength-bar { transition: width .3s ease, background-color .3s ease; }

.texture-wrap { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
.dotgrid {
  position: absolute; inset: 0;
  background-image: radial-gradient(rgba(148,163,184,.11) 1px, transparent 1px);
  background-size: 26px 26px;
  -webkit-mask-image: radial-gradient(ellipse 80% 70% at 55% 25%, black 22%, transparent 76%);
  mask-image: radial-gradient(ellipse 80% 70% at 55% 25%, black 22%, transparent 76%);
}
.noise {
  position: absolute; inset: 0; opacity: .04;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.3'/%3E%3C/svg%3E");
  background-size: 180px 180px;
}
.blob { position: absolute; border-radius: 9999px; pointer-events: none; }
.blob-cyan-auth { top: -13rem; left: 28%; width: 760px; height: 520px; background: rgba(6,182,212,.06); filter: blur(140px); }
.blob-blue-auth { bottom: -14rem; right: -10rem; width: 620px; height: 460px; background: rgba(37,99,235,.05); filter: blur(130px); }
.blob-cyan-app { top: -10rem; left: 50%; transform: translateX(-50%); width: 900px; height: 500px; background: rgba(6,182,212,.04); filter: blur(130px); }
.blob-blue-app { bottom: -10rem; right: -10rem; width: 600px; height: 400px; background: rgba(37,99,235,.03); filter: blur(110px); }

.auth-shell { position: relative; z-index: 10; min-height: 100dvh; display: flex; }
.brand-panel { display: none; position: relative; overflow: hidden; }
.brand-head { display: flex; align-items: center; gap: .75rem; animation: fade-up .55s var(--ease) both; }
.logo-tile {
  width: 2.5rem; height: 2.5rem; border-radius: .75rem;
  background: linear-gradient(to bottom right, #2563eb, #06b6d4);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 10px 15px -3px rgba(59,130,246,.2);
}
.logo-tile svg { width: 20px; height: 20px; color: #fff; }
.logo-tile-lg { width: 3rem; height: 3rem; margin-bottom: .75rem; box-shadow: 0 10px 15px -3px rgba(59,130,246,.25); }
.logo-tile-lg svg { width: 24px; height: 24px; }
.logo-tile-sm { width: 2.25rem; height: 2.25rem; background: linear-gradient(to bottom right, #3b82f6, #22d3ee); }
.logo-tile-sm svg { width: 18px; height: 18px; color: #fff; }
.brand-name { font-size: 1.125rem; font-weight: 600; letter-spacing: -.01em; }
.version-chip {
  margin-left: .25rem; padding: .125rem .5rem; border-radius: .375rem;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.06);
  font-family: var(--font-mono); font-size: 11px; color: var(--text-faint);
}
@media (min-width: 1024px) {
  .brand-panel {
    display: flex; width: 44%; flex-shrink: 0; flex-direction: column;
    justify-content: space-between; padding: 3rem;
    border-right: 1px solid rgba(255,255,255,.04);
  }
}
@media (min-width: 1280px) { .brand-panel { padding: 4rem; } }

.hero { position: relative; padding: 2.5rem 0; }
.ring-stack { pointer-events: none; position: absolute; left: -70px; top: 50%; transform: translateY(-50%); }
.ring {
  position: absolute; width: 380px; height: 380px; border-radius: 9999px;
  border: 1px solid rgba(34,211,238,.07);
  animation: pulse-ring 3.2s cubic-bezier(.2,.6,.3,1) infinite;
}
.ring.r2 { inset: 1.5rem; border-color: rgba(34,211,238,.06); animation-delay: 1s; }
.ring.r3 { inset: 3.5rem; border-color: rgba(59,130,246,.05); animation-delay: 2s; }
.hero-title {
  position: relative; font-size: 2.25rem; line-height: 1.08; font-weight: 600;
  letter-spacing: -.025em; text-wrap: balance;
  animation: fade-up .55s var(--ease) both; animation-delay: .07s;
}
.accent-text { color: var(--cyan-bright); }
.hero-sub {
  position: relative; margin-top: 1.25rem; max-width: 24rem; font-size: .875rem;
  line-height: 1.625; color: var(--text-dim);
  animation: fade-up .55s var(--ease) both; animation-delay: .14s;
}
.spec-list {
  position: relative; margin-top: 2.25rem; display: flex; flex-direction: column;
  gap: .75rem; animation: fade-up .55s var(--ease) both; animation-delay: .21s;
}
.spec-row { display: flex; align-items: baseline; gap: 1rem; }
.spec-key { width: 6rem; flex-shrink: 0; font-family: var(--font-mono); font-size: 11px; letter-spacing: .1em; color: rgba(103,232,249,.8); }
.spec-val { font-size: 12px; color: var(--text-faint); }
.brand-foot {
  display: flex; align-items: center; gap: .5rem; font-family: var(--font-mono);
  font-size: 10px; letter-spacing: .25em; text-transform: uppercase; color: var(--text-ghost);
  animation: fade-up .55s var(--ease) both; animation-delay: .28s;
}
.foot-dot { width: 6px; height: 6px; border-radius: 9999px; background: rgba(34,211,238,.6); }

.auth-main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 1.5rem; }
.form-box { width: 100%; max-width: 28rem; }
.mobile-brand { display: flex; align-items: center; justify-content: center; gap: .75rem; margin-bottom: 2rem; animation: fade-up .55s var(--ease) both; }
.mobile-brand.stacked { flex-direction: column; text-align: center; }
.mobile-title { font-size: 1.25rem; font-weight: 700; letter-spacing: -.01em; }
.mobile-sub { margin-top: .125rem; font-size: .875rem; color: var(--text-dim); }
@media (min-width: 1024px) { .mobile-brand { display: none; } }

.glass-card {
  position: relative; border-radius: 20px; border: 1px solid rgba(255,255,255,.07);
  background: rgba(255,255,255,.03); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  padding: 2rem; box-shadow: 0 25px 50px -12px rgba(0,0,0,.5);
  animation: fade-up .55s var(--ease) both; animation-delay: .07s;
}
.card-topline { position: absolute; top: -1px; left: 2.5rem; right: 2.5rem; height: 1px; background: linear-gradient(to right, transparent, rgba(34,211,238,.4), transparent); }
.card-title { font-size: 1.25rem; font-weight: 600; text-align: center; letter-spacing: -.01em; margin-bottom: .25rem; }
.card-sub { font-size: .875rem; color: var(--text-dim); text-align: center; margin-bottom: 1.5rem; }
.desktop-heading { display: none; margin-bottom: 1.75rem; }
.heading-lg { font-size: 1.5rem; font-weight: 600; letter-spacing: -.01em; }
.heading-sub { margin-top: .25rem; font-size: .875rem; color: var(--text-dim); }
@media (min-width: 1024px) { .desktop-heading { display: block; } }

.field-label { display: block; font-size: .875rem; font-weight: 500; color: var(--text-mid); margin-bottom: .375rem; }
.label-hint { font-weight: 400; color: var(--text-faint); }
.field { margin-bottom: 1rem; }
.field-lg { margin-bottom: 1.25rem; }
.input-wrap { position: relative; }
.field-input {
  width: 100%; padding: .625rem 1rem; font-size: .875rem; border-radius: .75rem;
  background: var(--surface-2); border: 1px solid var(--line-strong); color: var(--text);
  transition: border-color .15s ease, box-shadow .15s ease;
}
.field-input::placeholder { color: var(--text-faint); }
.field-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.28); }
.with-eye { padding-right: 2.75rem; }
.eye-btn {
  position: absolute; right: .625rem; top: 50%; transform: translateY(-50%);
  padding: .25rem; border-radius: .5rem; color: var(--text-dim);
  transition: color .15s, background-color .15s;
}
.eye-btn:hover { color: #e5e7eb; background: rgba(255,255,255,.05); }
.eye-icon { width: 20px; height: 20px; }

.strength-wrap { margin-top: .5rem; display: flex; align-items: center; gap: .5rem; }
.strength-track { flex: 1; height: 4px; border-radius: 9999px; background: rgba(255,255,255,.1); overflow: hidden; }
.h-full { height: 100%; }
.rounded-full { border-radius: 9999px; }
.w-0 { width: 0; }
.bg-gray-500 { background: #6b7280; }
.bg-red-500 { background: var(--red); }
.bg-orange-500 { background: #f97316; }
.bg-yellow-500 { background: #eab308; }
.bg-green-500 { background: #22c55e; }
.border-red-500\/50 { border-color: rgba(239,68,68,.5); }
.border-green-500\/50 { border-color: rgba(34,197,94,.5); }
.strength-hint { font-size: 12px; color: var(--text-faint); min-width: 60px; text-align: right; }

.alert-error {
  display: flex; align-items: center; gap: .5rem; margin-bottom: 1rem;
  padding: .75rem 1rem; border-radius: .75rem;
  background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.3); color: var(--red-soft);
  font-size: .875rem;
}
.alert-icon { width: 16px; height: 16px; }

.btn-primary {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  padding: .5rem 1rem; border-radius: .75rem;
  background: var(--cyan); color: var(--accent-ink);
  font-size: .875rem; font-weight: 600;
  box-shadow: 0 10px 15px -3px rgba(34,211,238,.25), 0 4px 6px -4px rgba(34,211,238,.2);
  transition: all .18s var(--ease);
}
.btn-primary:hover { background: var(--cyan-bright); box-shadow: 0 10px 20px -3px rgba(34,211,238,.35), 0 4px 8px -4px rgba(34,211,238,.3); }
.btn-primary:active { transform: scale(.98); }
.btn-primary:disabled { opacity: .5; cursor: not-allowed; }
.btn-sm { padding: .375rem .75rem; font-size: 12px; }
.btn-secondary {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  padding: .5rem 1rem; border-radius: .75rem;
  background: var(--surface-2); border: 1px solid var(--line-strong); color: var(--text);
  font-size: .875rem; font-weight: 500;
  transition: background-color .15s, border-color .15s;
}
.btn-secondary:hover { background: rgba(255,255,255,.1); }
.btn-block { width: 100%; padding: .625rem 1rem; }
.spin-icon { width: 16px; height: 16px; animation: spin .8s linear infinite; }
.spin-icon circle { opacity: .25; }
.spin-icon path { opacity: .75; }
.spinner-icon {
  width: 1rem; height: 1rem; display: inline-block; vertical-align: middle;
  margin-right: .25rem; margin-top: -2px; animation: spin .8s linear infinite;
}
.spinner-icon circle { opacity: .25; }
.spinner-icon path { opacity: .75; }

.foot-link { text-align: center; font-size: .875rem; color: var(--text-faint); margin-top: 1.5rem; animation: fade-up .55s var(--ease) both; animation-delay: .21s; }
.link {
  color: rgba(103,232,249,.9); text-decoration: underline; text-underline-offset: 4px;
  text-decoration-color: rgba(34,211,238,.3); transition: color .15s;
}
.link:hover { color: var(--cyan-pale, #a5f3fc); }
.session-note { text-align: center; font-size: 12px; color: var(--text-ghost); margin-top: 1.25rem; }
.auth-alt { display: none; justify-content: center; margin-top: 1.5rem; font-size: 12px; color: var(--text-ghost); animation: fade-up .55s var(--ease) both; animation-delay: .14s; }
@media (min-width: 1024px) { .auth-alt { display: flex; gap: .25rem; } }
.opacity-70 { opacity: .7; }
.cursor-not-allowed { cursor: not-allowed; }

.app-shell { position: relative; max-width: 72rem; margin: 0 auto; padding: 1rem; }
.app-header {
  position: sticky; top: 0; z-index: 30;
  margin: -1rem -1rem 1.5rem; padding: .75rem 1rem;
  background: rgba(5,8,15,.8); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
  border-bottom: 1px solid rgba(255,255,255,.05);
}
.header-row { display: flex; align-items: center; justify-content: space-between; }
.brand-lockup { display: flex; align-items: center; gap: .75rem; }
.app-title { font-size: 1rem; font-weight: 700; letter-spacing: -.01em; line-height: 1.25; }
.app-subline {
  display: none; align-items: center; gap: .5rem; margin-top: 2px;
  font-family: var(--font-mono); font-size: 10px; letter-spacing: .22em;
  text-transform: uppercase; color: var(--text-ghost); line-height: 1;
}
.stats-row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-top: .75rem; }
.stat-chip {
  display: inline-flex; align-items: center; gap: .375rem; padding: .25rem .625rem;
  border-radius: .5rem; background: var(--surface); border: 1px solid rgba(255,255,255,.05);
  font-family: var(--font-mono); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-dim);
}
.stat-chip.dim { color: var(--text-ghost); }
.dot { width: 4px; height: 4px; border-radius: 9999px; display: inline-block; }
.dot-cyan { background: rgba(34,211,238,.7); }
.dot-violet { background: rgba(167,139,250,.7); }
.top-nav { display: flex; align-items: center; gap: .5rem; }
.nav-tabs {
  align-items: center; gap: .5rem; padding: .25rem; border-radius: .75rem;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.05);
}
.tabs-desktop { display: none; }
.tabs-mobile { display: flex; }
.nav-btn {
  padding: .375rem .75rem; font-size: .875rem; border-radius: .6rem;
  color: rgb(156 163 175);
  transition: color .2s, background-color .2s, box-shadow .2s;
}
.nav-btn-sm { padding: .375rem .625rem; font-size: 12px; }
.nav-btn:hover { color: rgb(229 231 235); background: rgba(255,255,255,.04); }
.nav-btn.nav-active { color: #a5f3fc; background: rgba(34,211,238,.09); box-shadow: inset 0 0 0 1px rgba(34,211,238,.18); }
.logout-btn {
  padding: .375rem .75rem; border-radius: .75rem; font-size: .875rem; color: var(--text-dim);
  transition: color .15s, background-color .15s, transform .15s;
}
.logout-btn:hover { color: var(--text); background: rgba(255,255,255,.06); }
.logout-btn:active { transform: scale(.98); }
@media (min-width: 640px) {
  .app-subline { display: flex; }
  .tabs-desktop { display: flex; }
  .tabs-mobile { display: none; }
}
@media (min-width: 768px) {
  .app-shell { padding: 1.5rem 2rem; }
  .app-header { margin: -1.5rem -2rem 2rem; padding: 1rem 2rem; }
  .app-title { font-size: 1.125rem; }
}

.view-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem; }
.view-title { font-size: 1.25rem; font-weight: 600; letter-spacing: -.01em; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.btn-row { display: flex; gap: .5rem; flex-shrink: 0; }
.accounts-grid { display: grid; gap: 1rem; }
@media (min-width: 640px) { .accounts-grid { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1024px) { .accounts-grid { grid-template-columns: repeat(3, 1fr); } }

.panel {
  background: var(--surface); border: 1px solid var(--line); border-radius: 1rem;
  padding: 1rem; margin-bottom: 1.25rem;
}
.panel.danger-zone { border-color: rgba(239,68,68,.1); margin-bottom: 0; }
.panel-label {
  font-size: 11px; font-weight: 600; font-family: var(--font-mono); color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .1em; margin-bottom: 1rem;
}
.panel-label.red-label { color: rgba(248,113,113,.8); }
.section-heading { font-size: 12px; font-weight: 600; color: var(--text-faint); text-transform: uppercase; letter-spacing: .05em; }
.stack-sm > * + * { margin-top: .5rem; }
.stack-md > * + * { margin-top: .75rem; }
.stack-lg > * + * { margin-top: 1rem; }
.detail-head { display: flex; align-items: center; gap: .75rem; margin-bottom: 1.5rem; }
.back-btn {
  padding: .5rem; border-radius: .75rem; color: var(--text-dim); flex-shrink: 0;
  background: var(--surface-2); border: 1px solid var(--line-strong);
  transition: background-color .15s;
}
.back-btn:hover { background: rgba(255,255,255,.1); }
.back-btn svg { width: 16px; height: 16px; }
.token-panel {
  position: relative; overflow: hidden; border-radius: 1rem; padding: 1rem; margin-bottom: 1.25rem;
  border: 1px solid var(--line);
  background: linear-gradient(to bottom right, rgba(34,211,238,.04), transparent);
}
.token-panel::before {
  content: ''; position: absolute; top: 0; left: 2rem; right: 2rem; height: 1px;
  background: linear-gradient(to right, transparent, rgba(34,211,238,.3), transparent);
}
.token-row { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.token-meta { min-width: 0; }
.token-label {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .1em; margin-bottom: .375rem;
}
.token-value {
  font-family: var(--font-mono); font-size: .875rem; color: rgba(165,243,252,.9);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.copy-btn {
  width: 2rem; height: 2rem; border-radius: .5rem; display: flex; align-items: center; justify-content: center;
  color: var(--text-dim); border: 1px solid var(--line); flex-shrink: 0;
  transition: all .15s;
}
.copy-btn:hover { color: var(--cyan-bright); background: rgba(34,211,238,.1); }
.copy-btn:active { transform: scale(.95); }
.copy-btn svg { width: 14px; height: 14px; }
.token-actions { display: flex; align-items: center; gap: .5rem; flex-shrink: 0; }
.token-facts {
  margin-top: .875rem; border-top: 1px solid var(--line); padding-top: .625rem;
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: .25rem 2rem;
}
.tf-row { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; padding: .3125rem 0; min-width: 0; }
.tf-key {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-faint);
  text-transform: uppercase; letter-spacing: .08em; flex-shrink: 0;
}
.tf-val {
  font-size: .875rem; color: rgba(226,232,240,.85); text-align: right; min-width: 0;
  overflow-wrap: anywhere; display: flex; align-items: baseline; justify-content: flex-end; gap: .5rem;
}
.tf-dim { color: var(--text-ghost); }
.tf-hint { font-size: 11px; color: var(--text-faint); }
.tchip {
  display: inline-block; padding: .125rem .5625rem; border-radius: 999px; font-size: 11px; font-weight: 600;
  border: 1px solid var(--line); background: rgba(255,255,255,.04); color: var(--text-dim);
}
.tchip-ok { color: #34d399; border-color: rgba(52,211,153,.25); background: rgba(52,211,153,.08); }
.tchip-warn { color: var(--amber); border-color: rgba(245,158,11,.3); background: rgba(245,158,11,.08); }
.tchip-red { color: var(--red-soft); border-color: rgba(239,68,68,.3); background: rgba(239,68,68,.08); }
.acct-status-dot {
  position: absolute; top: .75rem; left: .75rem; width: 8px; height: 8px; border-radius: 999px;
  background: rgba(34,211,238,.7); flex-shrink: 0;
}
.acct-status-dot.dot-bad { background: #ef4444; box-shadow: 0 0 6px rgba(239,68,68,.65); }
.input-row { display: flex; gap: .5rem; }
.input-row .field-input { flex: 1; min-width: 0; }
.zone-buttons { display: flex; flex-wrap: wrap; gap: .75rem; }
.zone-btn {
  padding: .5rem 1rem; border-radius: .75rem; font-size: .875rem; font-weight: 500;
  transition: background-color .15s;
}
.zone-btn-warn { background: rgba(245,158,11,.1); color: var(--amber); border: 1px solid rgba(245,158,11,.2); }
.zone-btn-warn:hover { background: rgba(245,158,11,.2); }
.zone-btn-red { background: rgba(239,68,68,.1); color: var(--red-soft); border: 1px solid rgba(239,68,68,.2); }
.zone-btn-red:hover { background: rgba(239,68,68,.2); }

.inline-form { margin-top: 1rem; padding: 1rem; border-radius: .75rem; background: var(--surface); border: 1px solid var(--line); }
.inline-form input[type="text"] { margin-bottom: .75rem; }
.form-error {
  margin-bottom: .75rem; padding: .5rem; border-radius: .5rem;
  background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.2); color: var(--red-soft); font-size: 12px;
}
.amn-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: .75rem; margin-bottom: 1rem; }
.amn-field label { display: block; font-size: 12px; color: var(--text-faint); margin-bottom: .25rem; }
.amn-field .field-input { padding: .5rem .75rem; font-size: .875rem; }
.hint { color: var(--text-ghost); }
.link-btn { display: inline-block; font-size: 12px; color: var(--blue); margin-bottom: .75rem; transition: color .15s; }
.link-btn:hover { color: #93c5fd; }
.mini-input {
  padding: .375rem .75rem; font-size: 12px; border-radius: .5rem;
  background: var(--surface-2); border: 1px solid var(--line-strong); color: var(--text);
  transition: border-color .15s, box-shadow .15s;
}
.mini-input::placeholder { color: var(--text-faint); }
.mini-input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(59,130,246,.2); }
.ep-row { display: flex; gap: .5rem; align-items: center; }
.ep-ip { flex: 1; min-width: 0; }
.ep-port { width: 5rem; flex: none; }
.ep-del { font-size: 12px; color: var(--red-soft); padding: 0 .5rem; border-radius: .5rem; transition: color .15s, background-color .15s; }
.ep-del:hover { color: #fca5a5; background: rgba(239,68,68,.1); }
.mono-area { font-family: var(--font-mono); }
.mono-hint { font-family: var(--font-mono); font-size: 11px; }

.overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(0,0,0,.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  display: flex; align-items: flex-end; justify-content: center;
}
.overlay-top { z-index: 50; }
.sheet {
  background: var(--bg-raised); border: 1px solid rgba(255,255,255,.08);
  border-radius: 22px 22px 0 0; padding: 1.5rem; width: 100%;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,.6);
  animation: modal-pop-kf .22s var(--ease);
}
.sheet-md { max-width: 28rem; }
.sheet-lg { max-width: 32rem; }
.sheet-sm { max-width: 24rem; }
.sheet-title { font-size: 1.125rem; font-weight: 600; margin-bottom: 1rem; }
.sheet .field-input { margin-bottom: .5rem; }
.sheet-msg { font-size: .875rem; color: var(--text-dim); margin-bottom: 1.5rem; }
.modal-note { font-size: 12px; color: var(--text-ghost); margin-bottom: .75rem; }
.sheet-actions { display: flex; gap: .5rem; justify-content: flex-end; margin-top: 1rem; }
.confirm-btn {
  padding: .5rem 1rem; border-radius: .75rem; font-size: .875rem; font-weight: 500;
  transition: background-color .15s;
}
.confirm-danger { background: rgba(239,68,68,.2); color: var(--red-soft); border: 1px solid rgba(239,68,68,.3); }
.confirm-danger:hover { background: rgba(239,68,68,.3); }
.confirm-warn { background: rgba(245,158,11,.2); color: var(--amber); border: 1px solid rgba(245,158,11,.3); }
.confirm-warn:hover { background: rgba(245,158,11,.3); }
@media (min-width: 640px) {
  .overlay { align-items: center; padding: 1rem; }
  .sheet { border-radius: 20px; }
}

#toast-container { position: fixed; top: 1rem; right: 1rem; z-index: 50; display: flex; flex-direction: column; gap: .5rem; pointer-events: none; }
.toast {
  pointer-events: auto; position: relative; overflow: hidden;
  display: flex; align-items: center; gap: .625rem; padding: .625rem .5rem .625rem .75rem;
  border-radius: .75rem; font-size: .875rem; font-weight: 500;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,.5); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(34,211,238,.2); background: rgba(10,20,27,.95); color: var(--text);
}
.toast.toast-error { background: rgba(23,13,17,.95); border-color: rgba(248,113,113,.25); color: #fee2e2; }
.ticon { width: 16px; height: 16px; }
.ticon-ok { color: var(--cyan-bright); }
.ticon-err { color: var(--red-soft); }
.toast-body { flex: 1; }
.toast-close { padding: .25rem; border-radius: .5rem; transition: background-color .15s; flex-shrink: 0; }
.toast-close:hover { background: rgba(255,255,255,.1); }
.toast-close svg { width: 14px; height: 14px; }
.toast-bar { position: absolute; bottom: 0; left: 0; height: 2px; border-radius: 9999px; background: rgba(34,211,238,.6); animation: toast-progress 3.5s linear forwards; }
.toast-bar-err { background: rgba(248,113,113,.6); }

.spot { position: relative; }
.spot::after {
  content: ''; position: absolute; inset: 0; border-radius: inherit;
  opacity: 0; transition: opacity .35s ease; pointer-events: none;
  background: radial-gradient(420px circle at var(--mx, 50%) var(--my, 50%), rgba(34,211,238,.07), transparent 65%);
}
.spot:hover::after { opacity: 1; }
.card-hover { transition: border-color .25s, box-shadow .25s, transform .25s cubic-bezier(.16,1,.3,1); }
.card-hover:hover { border-color: rgba(34,211,238,.28); box-shadow: 0 8px 32px -12px rgba(34,211,238,.15), 0 0 0 1px rgba(34,211,238,.08); transform: translateY(-2px); }
.card-hover:active { transform: translateY(0); }
.skeleton {
  background: linear-gradient(90deg, rgba(255,255,255,.03) 25%, rgba(255,255,255,.06) 50%, rgba(255,255,255,.03) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.acct-card {
  position: relative; border-radius: 1rem; border: 1px solid var(--line);
  background: rgba(255,255,255,.02); padding: 1rem; cursor: pointer;
}
button.acct-card { display: block; width: 100%; text-align: left; color: inherit; }
.acct-card:hover { border-color: rgba(255,255,255,.1); }
.acct-head { display: flex; align-items: flex-start; gap: .75rem; }
.avatar {
  width: 2.5rem; height: 2.5rem; border-radius: .75rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: #fff; font-size: 12px; font-weight: 700;
  box-shadow: 0 10px 15px -3px rgba(0,0,0,.35);
}
.grad-1 { background-image: linear-gradient(to bottom right, #3b82f6, #22d3ee); }
.grad-2 { background-image: linear-gradient(to bottom right, #a855f7, #f472b6); }
.grad-3 { background-image: linear-gradient(to bottom right, #f97316, #f87171); }
.grad-4 { background-image: linear-gradient(to bottom right, #10b981, #2dd4bf); }
.grad-5 { background-image: linear-gradient(to bottom right, #6366f1, #a78bfa); }
.grad-6 { background-image: linear-gradient(to bottom right, #f59e0b, #facc15); }
.acct-meta { min-width: 0; flex: 1; padding-top: 2px; display: block; }
.acct-name {
  display: block;
  font-size: .875rem; font-weight: 600; color: var(--text-mid);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .15s;
}
.acct-card:hover .acct-name { color: #ecfeff; }
.acct-date { display: block; font-family: var(--font-mono); font-size: 11px; font-variant-numeric: tabular-nums; color: var(--text-ghost); }
.chevron {
  width: 16px; height: 16px; margin-top: .25rem; flex-shrink: 0;
  color: rgba(103,232,249,.8); opacity: 0; transform: translateX(-4px); transition: all .15s;
}
.acct-card:hover .chevron { opacity: 1; transform: translateX(0); }
.acct-token {
  margin-top: .875rem; display: inline-flex; max-width: 100%; align-items: center; gap: .375rem;
  padding: .25rem .5rem; border-radius: .5rem;
  background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.04);
  font-family: var(--font-mono); font-size: 11px; color: var(--text-faint);
}
.acct-token svg { width: 12px; height: 12px; color: var(--text-ghost); }
.badge-row { margin-top: .75rem; display: flex; gap: .375rem; }
.badge {
  padding: .125rem .5rem; border-radius: .375rem;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.05);
  font-family: var(--font-mono); font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--text-dim);
}
.badge-amz { background: rgba(139,92,246,.1); border-color: rgba(167,139,250,.2); color: var(--violet); }

.sub-row {
  display: flex; align-items: center; gap: .75rem; padding: .75rem; border-radius: .75rem;
  background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); transition: all .15s;
}
.sub-row:hover { border-color: rgba(34,211,238,.25); background: rgba(255,255,255,.04); }
.fmt-box {
  width: 2rem; height: 2rem; flex-shrink: 0; border-radius: .5rem;
  background: var(--surface); border: 1px solid rgba(255,255,255,.05);
  display: flex; align-items: center; justify-content: center; color: var(--text-faint);
  transition: color .15s, border-color .15s;
}
.fmt-box svg { width: 16px; height: 16px; }
.sub-row:hover .fmt-box { color: var(--cyan-bright); border-color: rgba(34,211,238,.25); }
.sub-info { flex: 1; min-width: 0; }
.sub-name { font-size: 12px; font-weight: 500; color: #e5e7eb; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sub-url { font-family: var(--font-mono); font-size: 11px; color: var(--text-faint); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.icon-btn {
  width: 1.75rem; height: 1.75rem; flex-shrink: 0; border-radius: .5rem;
  display: flex; align-items: center; justify-content: center; color: var(--text-faint);
  transition: all .15s;
}
.icon-btn:hover { color: var(--cyan-bright); background: rgba(34,211,238,.1); }
.icon-btn:active { transform: scale(.95); }
.icon-btn svg { width: 14px; height: 14px; }
.amz-tag {
  display: inline-block; vertical-align: middle; margin-left: .375rem; padding: 1px 6px;
  border-radius: 4px; background: rgba(139,92,246,.15); border: 1px solid rgba(167,139,250,.2);
  color: var(--violet); font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
}
.rec-tag {
  display: inline-block; vertical-align: middle; margin-left: .375rem; padding: 1px 6px;
  border-radius: 4px; background: rgba(34,211,238,.12); border: 1px solid rgba(34,211,238,.25);
  color: var(--cyan-bright); font-family: var(--font-mono); font-size: 9px; text-transform: uppercase; letter-spacing: .08em;
}
.sub-hint { font-size: 11px; color: var(--text-dim); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pill-row { display: flex; flex-wrap: wrap; gap: .375rem; margin-bottom: .75rem; }
.pill {
  padding: .35rem .75rem; border-radius: 9999px; font-size: 12px; line-height: 1;
  color: var(--text-dim); background: var(--surface); border: 1px solid var(--line-strong);
  transition: color .15s, border-color .15s, background-color .15s;
}
.pill:hover { color: #e5e7eb; border-color: rgba(34,211,238,.35); }
.pill:active { transform: scale(.97); }
.pill-active { background: rgba(34,211,238,.12); border-color: rgba(34,211,238,.45); color: var(--cyan-bright); }
.picker-hint { font-size: 12px; color: var(--text-faint); margin: -.125rem 0 .5rem; }
.qr-box {
  display: flex; justify-content: center; align-items: center;
  padding: .75rem; background: #ffffff; border-radius: .75rem; margin-bottom: .75rem;
}
.qr-box svg { width: 200px; height: 200px; }
.qr-url {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-faint);
  word-break: break-all; line-height: 1.6; margin-bottom: .5rem;
  max-height: 4.4em; overflow-y: auto;
}
.drop-zone {
  border: 1px dashed var(--line-strong); border-radius: .5rem;
  padding: .6rem .75rem; margin-bottom: .5rem;
  font-size: 12px; color: var(--text-faint); text-align: center;
  transition: border-color .15s, background-color .15s, color .15s;
}
.drop-zone.drag { border-color: rgba(34,211,238,.55); background: rgba(34,211,238,.06); color: var(--cyan-bright); }
.confirm-extra { display: inline-flex; align-items: center; justify-content: center; }

.check-banner {
  border: 1px solid rgba(34,211,238,.25); background: rgba(34,211,238,.06);
  border-radius: .875rem; padding: .85rem 1rem; margin-bottom: 1.25rem;
}
.check-banner-head { display: flex; align-items: center; justify-content: space-between; font-size: .875rem; margin-bottom: .5rem; }
.chk-item { display: flex; align-items: center; gap: .5rem; font-size: .8125rem; color: var(--text-dim); padding: .2rem 0; }
.chk-item .link-btn { margin-left: auto; font-size: 12px; padding: .1rem .4rem; }
.chk-done { color: var(--text-faint); text-decoration: line-through; text-decoration-color: rgba(255,255,255,.25); }
.chk-mark { color: var(--cyan-bright); font-size: .75rem; width: 1rem; text-align: center; }
.chk-done .chk-mark { color: #34d399; }
.lat-table { width: 100%; border-collapse: collapse; font-size: .8125rem; }
.lat-table th { text-align: left; font-weight: 500; color: var(--text-faint); padding: .4rem .5rem; border-bottom: 1px solid rgba(255,255,255,.08); }
.lat-table td { padding: .45rem .5rem; border-bottom: 1px solid rgba(255,255,255,.04); font-family: var(--font-mono); }
.warn-note { color: #fbbf24; font-size: 12.5px; line-height: 1.5; }

.preset-row {
  display: flex; align-items: center; justify-content: space-between; padding: .75rem;
  border-radius: .75rem; background: var(--surface); border: 1px solid rgba(255,255,255,.04);
  transition: border-color .15s;
}
.preset-row:hover { border-color: rgba(255,255,255,.08); }
.preset-info { min-width: 0; flex: 1; }
.preset-name { font-size: .875rem; font-weight: 500; }
.preset-preview { font-family: var(--font-mono); font-size: 12px; color: var(--text-faint); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.preset-count { font-size: 12px; color: var(--text-ghost); margin: 0 .75rem; flex-shrink: 0; }
.preset-del {
  padding: .25rem .625rem; border-radius: .5rem; font-size: 12px; color: var(--red-soft); flex-shrink: 0;
  transition: background-color .15s;
}
.preset-del:hover { background: rgba(239,68,68,.1); }
.preset-edit { color: var(--blue); }
.preset-edit:hover { background: rgba(59,130,246,.12); }
.preset-row-actions { display: flex; gap: .5rem; flex-shrink: 0; align-items: center; }

.empty-cell { grid-column: 1 / -1; }
.empty-card {
  position: relative; overflow: hidden; border-radius: 1rem;
  border: 1px dashed rgba(255,255,255,.09); background: rgba(255,255,255,.015);
  padding: 4rem 2rem; display: flex; flex-direction: column; align-items: center; text-align: center;
}
.empty-icon {
  position: relative; width: 3.5rem; height: 3.5rem; border-radius: 1rem;
  background: rgba(34,211,238,.08); border: 1px solid rgba(34,211,238,.2);
  display: flex; align-items: center; justify-content: center; margin-bottom: 1.25rem;
  box-shadow: 0 0 40px -10px rgba(34,211,238,.25);
}
.empty-icon svg { width: 28px; height: 28px; color: rgba(103,232,249,.9); }
.empty-title { position: relative; font-size: 1rem; font-weight: 600; letter-spacing: -.01em; color: #e5e7eb; margin-bottom: .375rem; }
.empty-msg { position: relative; font-size: .875rem; color: var(--text-faint); max-width: 20rem; line-height: 1.625; }
.empty-actions { position: relative; margin-top: 1.5rem; display: flex; gap: .5rem; }
.error-cell { grid-column: 1 / -1; text-align: center; padding: 3rem 0; }
.error-text { color: var(--red-soft); font-size: .875rem; margin-bottom: .75rem; }

.skel-card {
  border-radius: 1rem; border: 1px solid var(--line); background: rgba(255,255,255,.02);
  padding: 1rem; display: flex; flex-direction: column; gap: .75rem;
}
.skel-row { display: flex; align-items: center; gap: .75rem; }
.skel-col { flex: 1; display: flex; flex-direction: column; gap: .5rem; }
.skeleton { border-radius: .375rem; }
.skel-avatar { width: 2.5rem; height: 2.5rem; border-radius: .75rem; }
.skel-a { height: .75rem; width: 6rem; }
.skel-b { height: .625rem; width: 4rem; }
.skel-c { height: .625rem; width: 8rem; }
.skel-pill { height: 1.25rem; width: 3.5rem; border-radius: 9999px; }

#accounts-grid > * { animation: fade-up .55s var(--ease) both; animation-delay: calc(var(--i, 0) * 60ms); }
#sub-urls > * { animation: fade-up .4s var(--ease) both; animation-delay: calc(var(--i, 0) * 35ms); }

.field-input:disabled, .mini-input:disabled { opacity: .45; cursor: not-allowed; }
.amn-toggle-row {
  display: flex; align-items: center; gap: .625rem;
  font-size: .875rem; color: var(--text-mid); margin-bottom: .75rem; cursor: pointer;
}
.amn-toggle-row input { width: 1rem; height: 1rem; accent-color: var(--cyan); cursor: pointer; }
.amn-effective {
  font-family: var(--font-mono); font-size: 11px; color: var(--text-dim);
  padding: .5rem .75rem; border-radius: .5rem; background: rgba(255,255,255,.03);
  border: 1px solid var(--line); margin-bottom: .75rem; line-height: 1.7;
}
.preset-actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; margin-top: 1rem; }
.bulk-label { display: block; font-size: 12px; color: var(--text-faint); margin: .75rem 0 .25rem; }
.token-value.masked { letter-spacing: .08em; cursor: pointer; user-select: none; }
.btn-sm-tap { min-height: 44px; }

@media (max-width: 640px), (pointer: coarse) {
  .nav-btn, .nav-btn-sm, .logout-btn { min-height: 44px; min-width: 44px; }
  .icon-btn { width: 44px; height: 44px; }
  .icon-btn svg { width: 16px; height: 16px; }
  .pill { min-height: 44px; display: inline-flex; align-items: center; }
  .ep-del { min-width: 44px; min-height: 44px; }
  .toast-close { min-width: 44px; min-height: 44px; }
  .sub-row { gap: .5rem; }
}
`;

const ICONS = {
  bolt: '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M11.5 2L4 12h5.5L7.5 18 14 8H8.5L11.5 2z"/></svg>',
  errorInfo: '<svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
  errorAlert: '<svg class="alert-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>'
};

function iconEyePair(openId, closedId) {
  return '<svg id="' + openId + '" class="eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
         '<svg id="' + closedId + '" class="eye-icon hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
}

const EYE_TOGGLE_JS = String.raw`function wireEyeToggle(btnId, inputId, openId, closedId) {
      var btn = document.getElementById(btnId);
      var inp = document.getElementById(inputId);
      var open = document.getElementById(openId);
      var closed = document.getElementById(closedId);
      if (!btn || !inp || !open || !closed) return;
      btn.addEventListener('click', function() {
        var isPw = inp.type === 'password';
        inp.type = isPw ? 'text' : 'password';
        open.classList.toggle('hidden', !isPw);
        closed.classList.toggle('hidden', isPw);
        btn.setAttribute('aria-label', isPw ? 'Hide password' : 'Show password');
        inp.focus();
      });
    }`;

// --- Client-side pure helpers (single source of truth: exported for tests,
// serialized into the admin SPA via CLIENT_HELPERS_JS). Must stay self-contained:
// no outer-scope references, no template literals (injected through String.raw).

function parseEndpointLine(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { error: 'empty line' };
  var m = s.match(/^\[([0-9A-Fa-f:.]+)\]:(\d{1,5})$/);
  if (m) {
    var v6 = m[1];
    if (!/^[0-9A-Fa-f:]*:[0-9A-Fa-f:.]*$/.test(v6) || v6.indexOf(':') === -1) return { error: 'invalid IPv6 address' };
    return finishEndpoint(v6, m[2]);
  }
  var idx = s.lastIndexOf(':');
  if (idx === -1) return { error: 'missing :port' };
  var host = s.slice(0, idx);
  var portStr = s.slice(idx + 1);
  if (!host) return { error: 'missing host' };
  if (/^[0-9A-Fa-f:.]+$/.test(host) && host.indexOf(':') !== -1) return { error: 'bracket IPv6 as [addr]:port' };
  var hostErr = checkEndpointHost(host);
  if (hostErr) return { error: hostErr };
  return finishEndpoint(host, portStr);
}

function checkEndpointHost(host) {
  if (host.length > 253) return 'host too long';
  if (/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(host)) {
    var parts = host.split('.');
    for (var i = 0; i < 4; i++) {
      var o = parseInt(parts[i], 10);
      if (o > 255 || String(o) !== parts[i]) return 'invalid IPv4 address';
    }
    return null;
  }
  if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/.test(host)) {
    return 'invalid host';
  }
  return null;
}

function finishEndpoint(host, portStr) {
  var port = Number(portStr);
  if (portStr === '' || !Number.isInteger(port) || port < 1 || port > 65535) return { error: 'port must be 1-65535' };
  return { endpoint: { ip: host, port: port } };
}

function parseEndpointBulk(text) {
  var lines = String(text == null ? '' : text).split(/\r?\n/);
  var endpoints = [];
  var errors = [];
  var seen = {};
  for (var i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var r = parseEndpointLine(lines[i]);
    if (r.error) { errors.push({ line: i + 1, error: r.error }); continue; }
    var k = r.endpoint.ip.toLowerCase() + ':' + r.endpoint.port;
    if (seen[k]) { errors.push({ line: i + 1, error: 'duplicate entry' }); continue; }
    seen[k] = true;
    endpoints.push(r.endpoint);
  }
  return { endpoints: endpoints, errors: errors };
}

function validateAmneziaValues(v) {
  if (!v || typeof v !== 'object') return 'Invalid Amnezia values';
  var fields = [['Jc', 0, 128], ['Jmin', 0, 1280], ['Jmax', 0, 1280], ['S1', 0, 255], ['S2', 0, 255], ['H1', 0, 2147483647], ['H2', 0, 2147483647], ['H3', 0, 2147483647], ['H4', 0, 2147483647]];
  for (var i = 0; i < fields.length; i++) {
    var n = Number(v[fields[i][0]]);
    if (v[fields[i][0]] === '' || v[fields[i][0]] === null || v[fields[i][0]] === undefined || !Number.isInteger(n) || n < fields[i][1] || n > fields[i][2]) {
      return fields[i][0] + ' must be a whole number ' + fields[i][1] + '-' + fields[i][2];
    }
  }
  var optionalInts = [['S3', 0, 255], ['S4', 0, 255]];
  for (var j = 0; j < optionalInts.length; j++) {
    var raw = v[optionalInts[j][0]];
    if (raw === '' || raw === null || raw === undefined) continue;
    var on = Number(raw);
    if (!Number.isInteger(on) || on < optionalInts[j][1] || on > optionalInts[j][2]) {
      return optionalInts[j][0] + ' must be a whole number ' + optionalInts[j][1] + '-' + optionalInts[j][2];
    }
  }
  if (v.I1 !== undefined && v.I1 !== null && v.I1 !== '') {
    if (typeof v.I1 !== 'string' || !/^(?:<r \d+>|<b 0x[0-9a-fA-F]+>)$/.test(v.I1.trim())) {
      return 'I1 must be empty or use <r N> / <b 0x..> notation';
    }
  }
  if (Number(v.Jmin) > Number(v.Jmax)) return 'Jmin must be <= Jmax';
  return null;
}

const AMNEZIA_UI_PRESETS = {
  mild: { Jc: 4, Jmin: 40, Jmax: 70, S1: 15, S2: 30, H1: 1237, H2: 3456, H3: 5280, H4: 8912 },
  aggressive: { Jc: 128, Jmin: 1000, Jmax: 1200, S1: 200, S2: 200, H1: 8291, H2: 4903, H3: 12345, H4: 60013 }
};

function deepLinkUrl(subUrl, scheme) {
  if (typeof subUrl !== 'string' || !subUrl) return null;
  if (typeof scheme !== 'string' || !scheme) return null;
  const encoded = encodeURIComponent(subUrl);
  // Template-style schemes embed the target as <url> (e.g. hiddify://import/<url>)
  if (scheme.indexOf('<url>') !== -1) return scheme.replace('<url>', encoded);
  // Query-param schemes must end in url= or sub= so we never append into an existing query
  if (!/[?&](?:url|sub)=$/.test(scheme)) return null;
  return scheme + encoded;
}

function formatsForClient(formats, clientId) {
  const list = Array.isArray(formats) ? formats : [];
  if (!clientId || clientId === 'all') return list.slice();
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    if (f && Array.isArray(f.clients) && f.clients.indexOf(clientId) !== -1) out.push(f);
  }
  return out;
}

function zipFindEntry(bytes, matchName) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  function u16(off) { return bytes[off] | (bytes[off + 1] << 8); }
  function u32(off) { return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0; }
  let eocd = -1;
  const minPos = Math.max(0, bytes.length - 22 - 65536);
  for (let i = bytes.length - 22; i >= minPos; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) return null;
  let count = u16(eocd + 10);
  let p = u32(eocd + 16);
  while (count-- > 0) {
    if (p + 46 > bytes.length || u32(p) !== 0x02014b50) break;
    const method = u16(p + 10);
    const csize = u32(p + 20);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commLen = u16(p + 32);
    const lho = u32(p + 42);
    let name = '';
    for (let k = 0; k < nameLen; k++) name += String.fromCharCode(bytes[p + 46 + k]);
    if (matchName(name)) {
      if (lho + 30 > bytes.length || u32(lho) !== 0x04034b50) return null;
      const lNameLen = u16(lho + 26);
      const lExtraLen = u16(lho + 28);
      const start = lho + 30 + lNameLen + lExtraLen;
      if (start + csize > bytes.length) return null;
      return { name: name, method: method, data: bytes.slice(start, start + csize) };
    }
    p += 46 + nameLen + extraLen + commLen;
  }
  return null;
}

const CLIENT_HELPERS_JS = [parseEndpointLine, checkEndpointHost, finishEndpoint, parseEndpointBulk, validateAmneziaValues, deepLinkUrl, formatsForClient, zipFindEntry].map(fn => fn.toString()).join('\n\n');

// --- Inline QR generator (byte mode, ECC level M, versions 1-20, auto mask).
// Algorithm: Reed-Solomon over GF(256) + standard module placement/masking,
// condensed from the MIT-licensed qrcodegen algorithm (Project Nayuki).
// Self-contained: no outer-scope references, no template literals (injected
// through String.raw into the admin SPA). qrSvg(text, px) -> SVG string or null.
const QR_LIB_JS = String.raw`
function qrSvg(text, px) {
  var ECC_CB = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26];
  var NUM_B = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16];
  var EXP = new Array(256);
  var LOG = new Array(256);
  (function() {
    var xg = 1;
    for (var ig = 0; ig < 255; ig++) {
      EXP[ig] = xg;
      LOG[xg] = ig;
      xg <<= 1;
      if ((xg & 0x100) !== 0) xg ^= 0x11D;
    }
  })();
  function gmul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[(LOG[a] + LOG[b]) % 255];
  }
  function rsDivisor(degree) {
    var result = new Array(degree);
    for (var i = 0; i < degree; i++) result[i] = 0;
    result[degree - 1] = 1;
    var root = 1;
    for (var i2 = 0; i2 < degree; i2++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = gmul(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = gmul(root, 2);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = new Array(divisor.length);
    for (var ir = 0; ir < result.length; ir++) result[ir] = 0;
    for (var b = 0; b < data.length; b++) {
      var factor = data[b] ^ result.shift();
      result.push(0);
      for (var jr = 0; jr < divisor.length; jr++) result[jr] ^= gmul(divisor[jr], factor);
    }
    return result;
  }
  function rawDataModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var na = Math.floor(ver / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) {
    return Math.floor(rawDataModules(ver) / 8) - ECC_CB[ver] * NUM_B[ver];
  }
  function alignPos(ver, size) {
    if (ver === 1) return [];
    var na = Math.floor(ver / 7) + 2;
    var step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    var res = [6];
    for (var pos = size - 7; res.length < na; pos -= step) res.splice(1, 0, pos);
    return res;
  }
  function maskBit(mask, y, x) {
    if (mask === 0) return (y + x) % 2 === 0;
    if (mask === 1) return y % 2 === 0;
    if (mask === 2) return x % 3 === 0;
    if (mask === 3) return (y + x) % 3 === 0;
    if (mask === 4) return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    if (mask === 5) return ((y * x) % 2) + ((y * x) % 3) === 0;
    if (mask === 6) return (((y * x) % 2) + ((y * x) % 3)) % 2 === 0;
    return (((y + x) % 2) + ((y * x) % 3)) % 2 === 0;
  }
  function formatBits(mask) {
    var data = mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function versionBits(ver) {
    var rem = ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    return (ver << 12) | rem;
  }
  function finderRuns(seq, len) {
    var count = 0;
    for (var p = 0; p + 7 <= len; p++) {
      if (!seq[p] || seq[p + 1] || !seq[p + 2] || !seq[p + 3] || !seq[p + 4] || seq[p + 5] || !seq[p + 6]) continue;
      var leftRun = 0;
      for (var q = p - 1; q >= 0 && !seq[q]; q--) leftRun++;
      if (leftRun >= 4) { count++; continue; }
      var rightRun = 0;
      for (var q2 = p + 7; q2 < len && !seq[q2]; q2++) rightRun++;
      if (rightRun >= 4) count++;
    }
    return count;
  }
  function getPenalty(m, size) {
    var res = 0, row, col, c;
    for (row = 0; row < size; row++) {
      var rc = m[row][0], rl = 1;
      for (col = 1; col < size; col++) {
        if (m[row][col] === rc) {
          rl++;
          if (rl === 5) res += 3; else if (rl > 5) res++;
        } else { rc = m[row][col]; rl = 1; }
      }
    }
    for (col = 0; col < size; col++) {
      var cc = m[0][col], cl = 1;
      for (row = 1; row < size; row++) {
        if (m[row][col] === cc) {
          cl++;
          if (cl === 5) res += 3; else if (cl > 5) res++;
        } else { cc = m[row][col]; cl = 1; }
      }
    }
    for (row = 0; row < size - 1; row++)
      for (col = 0; col < size - 1; col++) {
        c = m[row][col];
        if (c === m[row][col + 1] && c === m[row + 1][col] && c === m[row + 1][col + 1]) res += 3;
      }
    for (row = 0; row < size; row++) res += finderRuns(m[row], size) * 40;
    for (col = 0; col < size; col++) {
      var colSeq = new Array(size);
      for (row = 0; row < size; row++) colSeq[row] = m[row][col];
      res += finderRuns(colSeq, size) * 40;
    }
    var dark = 0;
    for (row = 0; row < size; row++)
      for (col = 0; col < size; col++)
        if (m[row][col]) dark++;
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return res + k * 10;
  }
  function build(text) {
    if (text === null || text === undefined || text === '') throw new Error('empty input');
    var bytes = new TextEncoder().encode(String(text));
    var ver = 0;
    for (var v = 1; v <= 20; v++) {
      var ccBits = v <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCodewords(v) * 8) { ver = v; break; }
    }
    if (ver === 0) throw new Error('URL too long for QR');
    var bits = [];
    function ab(val, n) {
      for (var i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1);
    }
    ab(4, 4);
    ab(bytes.length, ver <= 9 ? 8 : 16);
    for (var bi = 0; bi < bytes.length; bi++) ab(bytes[bi], 8);
    var cap = dataCodewords(ver) * 8;
    ab(0, Math.min(4, cap - bits.length));
    ab(0, (8 - (bits.length % 8)) % 8);
    var padByte = 0xEC;
    while (bits.length < cap) {
      ab(padByte, 8);
      padByte ^= 0xEC ^ 0x11;
    }
    var dataCw = new Array(cap >> 3);
    for (var di = 0; di < dataCw.length; di++) {
      var w = 0;
      for (var wj = 0; wj < 8; wj++) w = (w << 1) | bits[di * 8 + wj];
      dataCw[di] = w;
    }
    var numBlocks = NUM_B[ver];
    var eccLen = ECC_CB[ver];
    var shortLen = Math.floor(dataCw.length / numBlocks);
    var numShorter = numBlocks - (dataCw.length % numBlocks);
    var divisor = rsDivisor(eccLen);
    var blocks = [], eccs = [], off = 0, nb;
    for (nb = 0; nb < numBlocks; nb++) {
      var bl = nb < numShorter ? shortLen : shortLen + 1;
      var blk = dataCw.slice(off, off + bl);
      off += bl;
      blocks.push(blk);
      eccs.push(rsRemainder(blk, divisor));
    }
    var cw = [];
    var j2, nb2;
    for (j2 = 0; j2 <= shortLen; j2++)
      for (nb2 = 0; nb2 < numBlocks; nb2++)
        if (j2 < blocks[nb2].length) cw.push(blocks[nb2][j2]);
    for (j2 = 0; j2 < eccLen; j2++)
      for (nb2 = 0; nb2 < numBlocks; nb2++)
        cw.push(eccs[nb2][j2]);
    var size = ver * 4 + 17;
    var mods = [], funcM = [];
    for (var mr = 0; mr < size; mr++) {
      var rowF = [], rowG = [];
      for (var mc = 0; mc < size; mc++) { rowF.push(false); rowG.push(false); }
      mods.push(rowF);
      funcM.push(rowG);
    }
    function setF(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      funcM[y][x] = true;
      mods[y][x] = dark;
    }
    var ap = alignPos(ver, size), ai, aj, dx, dy;
    for (ai = 0; ai < size; ai++) {
      setF(6, ai, ai % 2 === 0);
      setF(ai, 6, ai % 2 === 0);
    }
    function finder(cx, cy) {
      for (dy = -4; dy <= 4; dy++)
        for (dx = -4; dx <= 4; dx++) {
          var dist = Math.max(Math.abs(dx), Math.abs(dy));
          setF(cx + dx, cy + dy, dist !== 2 && dist !== 4);
        }
    }
    finder(3, 3);
    finder(size - 4, 3);
    finder(3, size - 4);
    var lastA = ap.length - 1;
    for (ai = 0; ai < ap.length; ai++)
      for (aj = 0; aj < ap.length; aj++) {
        if ((ai === 0 && aj === 0) || (ai === 0 && aj === lastA) || (ai === lastA && aj === 0)) continue;
        for (dy = -2; dy <= 2; dy++)
          for (dx = -2; dx <= 2; dx++) {
            var d2 = Math.max(Math.abs(dx), Math.abs(dy));
            setF(ap[aj] + dx, ap[ai] + dy, d2 !== 1);
          }
      }
    function drawFormat(maskVal) {
      var fbits = formatBits(maskVal);
      var gi;
      for (gi = 0; gi <= 5; gi++) setF(8, gi, ((fbits >>> gi) & 1) !== 0);
      setF(8, 7, ((fbits >>> 6) & 1) !== 0);
      setF(8, 8, ((fbits >>> 7) & 1) !== 0);
      setF(7, 8, ((fbits >>> 8) & 1) !== 0);
      for (gi = 9; gi < 15; gi++) setF(14 - gi, 8, ((fbits >>> gi) & 1) !== 0);
      for (gi = 0; gi < 8; gi++) setF(size - 1 - gi, 8, ((fbits >>> gi) & 1) !== 0);
      for (gi = 8; gi < 15; gi++) setF(8, size - 15 + gi, ((fbits >>> gi) & 1) !== 0);
      setF(8, size - 8, true);
    }
    drawFormat(0);
    if (ver >= 7) {
      var vbits = versionBits(ver);
      for (var vi = 0; vi < 18; vi++) {
        var vb = ((vbits >>> vi) & 1) !== 0;
        var va = size - 11 + vi % 3;
        var vd = Math.floor(vi / 3);
        setF(va, vd, vb);
        setF(vd, va, vb);
      }
    }
    var ci = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var cj = 0; cj < 2; cj++) {
          var cx = right - cj;
          var upward = ((right + 1) & 2) === 0;
          var cy = upward ? size - 1 - vert : vert;
          if (!funcM[cy][cx] && ci < cw.length * 8) {
            mods[cy][cx] = ((cw[ci >>> 3] >>> (7 - (ci & 7))) & 1) !== 0;
            ci++;
          }
        }
      }
    }
    function applyMask(mv) {
      for (var y4 = 0; y4 < size; y4++)
        for (var x4 = 0; x4 < size; x4++)
          if (!funcM[y4][x4] && maskBit(mv, y4, x4)) mods[y4][x4] = !mods[y4][x4];
    }
    var bestMask = 0, bestScore = Infinity, mv2;
    for (mv2 = 0; mv2 < 8; mv2++) {
      applyMask(mv2);
      drawFormat(mv2);
      var score = getPenalty(mods, size);
      if (score < bestScore) { bestScore = score; bestMask = mv2; }
      applyMask(mv2);
    }
    applyMask(bestMask);
    drawFormat(bestMask);
    var parts = [];
    for (var y5 = 0; y5 < size; y5++)
      for (var x5 = 0; x5 < size; x5++)
        if (mods[y5][x5]) parts.push('M' + (x5 + 4) + ' ' + (y5 + 4) + 'h1v1h-1z');
    var dim = size + 8;
    var pxN = parseInt(px, 10);
    if (!pxN || pxN < 50 || pxN > 600) pxN = 200;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + pxN + '" height="' + pxN + '" viewBox="0 0 ' + dim + ' ' + dim + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="#ffffff"/>' +
      '<path d="' + parts.join('') + '" fill="#0b1220"/></svg>';
  }
  try {
    return build(text);
  } catch (e) {
    return null;
  }
}
`;

const SETUP_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Warp Generator — Setup</title>
  ${HEAD_META}
  <style>
${SHARED_CSS}
  </style>
</head>
<body>

  <div class="texture-wrap" aria-hidden="true">
    <div class="dotgrid"></div>
    <div class="blob blob-cyan-auth"></div>
    <div class="blob blob-blue-auth"></div>
    <div class="noise"></div>
  </div>

  <div class="auth-shell">

    <aside class="brand-panel">
      <div class="brand-head">
        <div class="logo-tile">${ICONS.bolt}</div>
        <span class="brand-name">Warp Generator</span>
        <span class="version-chip">v${VERSION}</span>
      </div>

      <div class="hero">
        <div class="ring-stack" aria-hidden="true">
          <div class="ring pulse-ring"></div>
          <div class="ring r2 pulse-ring"></div>
          <div class="ring r3 pulse-ring"></div>
        </div>
        <h2 class="hero-title">One panel for<br>every WireGuard<br><span class="accent-text">client.</span></h2>
        <p class="hero-sub">Generate WARP accounts, shape endpoint presets, and serve subscriptions your apps can import directly.</p>
        <ul class="spec-list">
          <li class="spec-row"><span class="spec-key">FORMATS</span><span class="spec-val">sing-box · clash · xray · throne · wireguard · v2rayn</span></li>
          <li class="spec-row"><span class="spec-key">AMNEZIA</span><span class="spec-val">per-account obfuscation overrides</span></li>
          <li class="spec-row"><span class="spec-key">STACK</span><span class="spec-val">one worker file · KV-backed · edge-native</span></li>
        </ul>
      </div>

      <div class="brand-foot">
        <span class="foot-dot"></span>
        Self-hosted admin console
      </div>
    </aside>

    <main class="auth-main">
      <div class="form-box">

        <div class="mobile-brand">
          <div class="logo-tile">${ICONS.bolt}</div>
          <span class="brand-name">Warp Generator</span>
        </div>

        <div class="glass-card">
          <div class="card-topline" aria-hidden="true"></div>
          <h1 class="card-title">Create admin password</h1>
          <p class="card-sub">You only need to do this once</p>

          <form method="POST" action="/admin/setup" id="setupForm" novalidate>

            <div class="field">
              <label for="password" class="field-label">Password</label>
              <div class="input-wrap">
                <input type="password" id="password" name="password" required minlength="8" maxlength="128" autocomplete="new-password" autofocus class="field-input with-eye" placeholder="Min 8 characters" aria-label="Password">
                <button type="button" id="togglePw" class="eye-btn" aria-label="Toggle password visibility">${iconEyePair('eyeOpen', 'eyeClosed')}</button>
              </div>
              <div class="strength-wrap">
                <div class="strength-track"><div id="strengthBar" class="h-full w-0 rounded-full bg-gray-500 strength-bar"></div></div>
                <span id="strengthText" class="strength-hint"></span>
              </div>
            </div>

            <div class="field-lg">
              <label for="confirm" class="field-label">Confirm password</label>
              <div class="input-wrap">
                <input type="password" id="confirm" name="confirm" required minlength="8" maxlength="128" autocomplete="new-password" class="field-input with-eye" placeholder="Re-enter password" aria-label="Confirm password">
                <button type="button" id="toggleCf" class="eye-btn" aria-label="Toggle confirm password visibility">${iconEyePair('eyeOpenCf', 'eyeClosedCf')}</button>
              </div>
            </div>

            <div class="field-lg">
              <label for="secret" class="field-label">Setup secret <span class="label-hint">(if configured)</span></label>
              <div class="input-wrap">
                <input type="password" id="secret" name="secret" autocomplete="off" class="field-input with-eye" placeholder="Leave empty if not required" aria-label="Setup secret">
                <button type="button" id="toggleSecret" class="eye-btn" aria-label="Toggle setup secret visibility">${iconEyePair('eyeOpenSecret', 'eyeClosedSecret')}</button>
              </div>
            </div>

            <div id="error" class="alert-error hidden" role="alert">
              ${ICONS.errorInfo}
              <span id="errorText"></span>
            </div>

            <button type="submit" id="submitBtn" class="btn-primary btn-block">
              <span id="btnLabel">Set Password</span>
              <svg id="btnSpinner" class="spin-icon hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </button>
          </form>
        </div>

        <p class="foot-link">
          Already set up?
          <a href="/admin/login" class="link">Go to login</a>
        </p>
      </div>
    </main>
  </div>

  <script>
    // ---- Error mapping from query param ----
    (function() {
      var params = new URLSearchParams(window.location.search);
      var code = params.get('error');
      if (!code) return;
      var map = {
        weak_password: 'Password must be at least 8 characters',
        invalid_secret: 'Invalid setup secret',
        generic: 'Setup failed. Try again.'
      };
      var msg = map[code] || map['generic'];
      showError(msg);
    })();

    function showError(msg) {
      var el = document.getElementById('error');
      var txt = document.getElementById('errorText');
      txt.textContent = msg;
      el.classList.remove('hidden');
    }

    function hideError() {
      var el = document.getElementById('error');
      el.classList.add('hidden');
    }

    // ---- Show/hide password toggles ----
    ${EYE_TOGGLE_JS}
    wireEyeToggle('togglePw', 'password', 'eyeOpen', 'eyeClosed');
    wireEyeToggle('toggleCf', 'confirm', 'eyeOpenCf', 'eyeClosedCf');
    wireEyeToggle('toggleSecret', 'secret', 'eyeOpenSecret', 'eyeClosedSecret');

    // ---- Live password strength bar ----
    var strengthBar = document.getElementById('strengthBar');
    var strengthText = document.getElementById('strengthText');
    var pwInput = document.getElementById('password');
    var cfInput = document.getElementById('confirm');

    pwInput.addEventListener('input', updateStrength);

    function updateStrength() {
      var pw = pwInput.value;
      var len = pw.length;
      var w = 0;
      var color = 'bg-gray-500';
      var label = '';
      if (len === 0) {
        w = 0;
        label = '';
      } else if (len < 4) {
        w = 15;
        color = 'bg-red-500';
        label = 'Weak';
      } else if (len < 8) {
        w = 40;
        color = 'bg-orange-500';
        label = 'Fair';
      } else if (len < 12) {
        w = 70;
        color = 'bg-yellow-500';
        label = 'Good';
      } else {
        w = 100;
        color = 'bg-green-500';
        label = 'Strong';
      }
      // Bonus for mixed chars
      if (len >= 8) {
        var hasLower = /[a-z]/.test(pw);
        var hasUpper = /[A-Z]/.test(pw);
        var hasDigit = /[0-9]/.test(pw);
        var hasSpecial = /[^a-zA-Z0-9]/.test(pw);
        var variety = (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
        if (variety >= 3 && w < 100) {
          w = Math.min(w + 15, 100);
          if (w >= 85) { color = 'bg-green-500'; label = 'Strong'; }
        }
      }
      strengthBar.style.width = w + '%';
      strengthBar.className = 'h-full rounded-full ' + color + ' strength-bar';
      strengthText.textContent = label;
    }

    // ---- Confirm match visual hint ----
    cfInput.addEventListener('input', function() {
      var pw = pwInput.value;
      var cf = cfInput.value;
      if (cf.length === 0) return;
      if (pw === cf) {
        cfInput.classList.remove('border-red-500/50');
        cfInput.classList.add('border-green-500/50');
      } else {
        cfInput.classList.remove('border-green-500/50');
        cfInput.classList.add('border-red-500/50');
      }
    });
    pwInput.addEventListener('input', function() {
      if (cfInput.value.length > 0) {
        cfInput.dispatchEvent(new Event('input'));
      }
    });

    // ---- Form submit with client-side validation + loading state ----
    var form = document.getElementById('setupForm');
    form.addEventListener('submit', function(e) {
      hideError();
      var pw = pwInput.value;
      var cf = cfInput.value;

      if (pw.length < 8) {
        e.preventDefault();
        showError('Password must be at least 8 characters');
        pwInput.focus();
        return;
      }
      if (pw !== cf) {
        e.preventDefault();
        showError('Passwords do not match');
        cfInput.focus();
        return;
      }

      // Show loading state
      var btn = document.getElementById('submitBtn');
      var label = document.getElementById('btnLabel');
      var spinner = document.getElementById('btnSpinner');
      btn.disabled = true;
      label.textContent = 'Setting up...';
      spinner.classList.remove('hidden');
    });
  </script>
</body>
</html>`;

const LOGIN_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Warp Generator — Login</title>
  ${HEAD_META}
  <style>
${SHARED_CSS}
  </style>
</head>
<body>

  <div class="texture-wrap" aria-hidden="true">
    <div class="dotgrid"></div>
    <div class="blob blob-cyan-auth"></div>
    <div class="blob blob-blue-auth"></div>
    <div class="noise"></div>
  </div>

  <div class="auth-shell">

    <aside class="brand-panel">
      <div class="brand-head">
        <div class="logo-tile">${ICONS.bolt}</div>
        <span class="brand-name">Warp Generator</span>
        <span class="version-chip">v${VERSION}</span>
      </div>

      <div class="hero">
        <div class="ring-stack" aria-hidden="true">
          <div class="ring pulse-ring"></div>
          <div class="ring r2 pulse-ring"></div>
          <div class="ring r3 pulse-ring"></div>
        </div>
        <h2 class="hero-title">Welcome back.<br><span class="accent-text">Your tunnels</span><br>missed you.</h2>
        <p class="hero-sub">Sign in to manage accounts, presets, and subscription endpoints.</p>
        <ul class="spec-list">
          <li class="spec-row"><span class="spec-key">SESSION</span><span class="spec-val">24 hours, single admin</span></li>
          <li class="spec-row"><span class="spec-key">GUARDED</span><span class="spec-val">bcrypt password · rate-limited logins</span></li>
        </ul>
      </div>

      <div class="brand-foot">
        <span class="foot-dot"></span>
        Self-hosted admin console
      </div>
    </aside>

    <main class="auth-main">
      <div class="form-box">

        <div class="mobile-brand stacked">
          <div class="logo-tile logo-tile-lg">${ICONS.bolt}</div>
          <h1 class="mobile-title">Warp Generator</h1>
          <p class="mobile-sub">Sign in to admin panel</p>
        </div>

        <div class="glass-card">
          <div class="card-topline" aria-hidden="true"></div>

          <div class="desktop-heading">
            <h1 class="heading-lg">Sign in</h1>
            <p class="heading-sub">Enter your admin password to continue.</p>
          </div>

          <div id="error" class="alert-error hidden" role="alert">
            ${ICONS.errorAlert}
            <span id="error-text"></span>
          </div>

          <form method="POST" action="/admin/login" id="login-form">
            <div class="field">
              <label for="password" class="field-label">Password</label>
              <div class="input-wrap">
                <input type="password" id="password" name="password" required autofocus autocomplete="current-password" placeholder="Enter your password" class="field-input with-eye">
                <button type="button" id="toggle-password" aria-label="Show password" class="eye-btn">${iconEyePair('eye-open', 'eye-closed')}</button>
              </div>
            </div>

            <button type="submit" id="submit-btn" class="btn-primary btn-block" style="margin-top:.75rem;">
              <span id="btn-text">Login</span>
              <svg id="btn-spinner" class="spin-icon hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/>
                <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
              </svg>
            </button>
          </form>

          <p class="session-note">Session lasts 24 hours</p>
        </div>

        <p class="auth-alt">
          Not set up yet?
          <a href="/admin/setup" class="link">Run setup</a>
        </p>
      </div>
    </main>
  </div>

  <script>
    // --- Error handling: read ?error= query param ---
    (function() {
      var params = new URLSearchParams(window.location.search);
      var code = params.get('error');
      if (!code) return;

      var messages = {
        'invalid_password': 'Invalid password. Please try again.',
        'rate_limited': 'Too many login attempts. Try again later.',
        'no_password': 'Account not set up yet. Create a password first.',
        'session': 'Your session expired. Please log in again.',
        'generic': 'Login failed. Try again.'
      };
      var msg = messages[code] || messages['generic'];
      if (code === 'rate_limited') {
        var retrySeconds = parseInt(params.get('retry'), 10);
        if (Number.isInteger(retrySeconds) && retrySeconds > 0) {
          var mins = Math.max(1, Math.ceil(retrySeconds / 60));
          msg = 'Too many login attempts. Try again in ' + mins + ' minute' + (mins === 1 ? '' : 's') + '.';
        }
      }
      var errorDiv = document.getElementById('error');
      var errorText = document.getElementById('error-text');
      if (errorDiv && errorText) {
        errorText.textContent = msg;
        errorDiv.classList.remove('hidden');
      }
      // Clean the URL so the error doesn't reappear on refresh
      if (window.history && window.history.replaceState) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();

    // --- Password show/hide toggle ---
    ${EYE_TOGGLE_JS}
    wireEyeToggle('toggle-password', 'password', 'eye-open', 'eye-closed');

    // --- Loading state on submit ---
    (function() {
      var form = document.getElementById('login-form');
      var btn = document.getElementById('submit-btn');
      var btnText = document.getElementById('btn-text');
      var spinner = document.getElementById('btn-spinner');
      if (!form || !btn) return;

      form.addEventListener('submit', function() {
        btn.disabled = true;
        btnText.textContent = 'Logging in...';
        spinner.classList.remove('hidden');
        btn.classList.add('opacity-70', 'cursor-not-allowed');
      });
    })();
  </script>
</body>
</html>`;

const DASHBOARD_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
  <title>Warp Generator - Admin</title>
  ${HEAD_META}
  <style>
${SHARED_CSS}
  </style>
</head>
<body>
  <div class="texture-wrap" aria-hidden="true">
    <div class="dotgrid"></div>
    <div class="blob blob-cyan-app"></div>
    <div class="blob blob-blue-app"></div>
    <div class="noise"></div>
  </div>

  <div id="toast-container" role="status" aria-live="polite"></div>

  <div class="app-shell">

    <header class="app-header">
      <div class="header-row">
        <div class="brand-lockup">
          <div class="logo-tile logo-tile-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <div>
            <h1 class="app-title">Warp Generator</h1>
            <p class="app-subline">Admin console<span class="version-chip">v${VERSION}</span></p>
          </div>
        </div>
        <nav class="top-nav">
          <div class="nav-tabs tabs-desktop">
            <button onclick="navigate('accounts')" class="nav-btn" data-view="accounts" aria-label="Accounts view">Accounts</button>
            <button onclick="navigate('settings')" class="nav-btn" data-view="settings" aria-label="Settings view">Settings</button>
          </div>
          <div class="nav-tabs tabs-mobile">
            <button onclick="navigate('accounts')" class="nav-btn nav-btn-sm" data-view="accounts" aria-label="Accounts view">Accts</button>
            <button onclick="navigate('settings')" class="nav-btn nav-btn-sm" data-view="settings" aria-label="Settings view">Config</button>
          </div>
          <form method="POST" action="/admin/logout" style="display:inline;">
            <button type="submit" class="logout-btn" aria-label="Logout">Logout</button>
          </form>
        </nav>
      </div>
      <div id="stats-row" class="stats-row">
        <span id="stat-accounts" class="stat-chip"></span>
        <span id="stat-presets" class="stat-chip"></span>
        <span class="stat-chip dim"><span class="dot dot-cyan"></span>10 formats</span>
        <span id="stat-warp" class="stat-chip dim" title="Checking WARP API status..."><span class="dot" style="background:var(--text-dim);"></span>WARP</span>
      </div>
    </header>

    <div id="checklist-banner"></div>

    <div id="view-accounts">
      <div class="view-head">
        <h2 class="view-title">Accounts</h2>
        <div class="btn-row">
          <button onclick="showCreateModal()" class="btn-primary">Create Account</button>
          <button onclick="showImportModal()" class="btn-secondary">Import Config</button>
        </div>
      </div>
      <div id="accounts-grid" class="accounts-grid"></div>
    </div>

    <div id="view-detail" class="hidden">
      <div class="detail-head">
        <button onclick="navigate('accounts')" class="back-btn" aria-label="Back to accounts">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <h2 id="detail-name" class="view-title"></h2>
      </div>

      <div class="token-panel">
        <div class="token-row">
          <div class="token-meta">
            <div class="token-label">Subscription token</div>
            <div id="detail-token" class="token-value masked" role="button" tabindex="0" aria-pressed="false" aria-label="Subscription token hidden. Activate to reveal."></div>
          </div>
          <div class="token-actions">
            <button onclick="showTokenEditModal()" class="btn-secondary btn-sm-tap" id="btn-edit-token">Edit Token</button>
            <button onclick="copyToken()" title="Copy token" class="copy-btn" aria-label="Copy token">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
          </div>
        </div>
        <div id="token-facts" class="token-facts"></div>
      </div>

      <div class="panel">
        <h3 class="panel-label">Account Settings</h3>
        <div class="stack-lg">
          <div>
            <label for="edit-name" class="field-label">Account Name</label>
            <div class="input-row">
              <input id="edit-name" type="text" autocomplete="off" class="field-input">
              <button onclick="updateAccountName()" class="btn-secondary" id="btn-save-name">Save</button>
            </div>
          </div>
          <div>
            <label for="edit-preset" class="field-label">Endpoint Preset</label>
            <div class="input-row">
              <select id="edit-preset" class="field-input"></select>
              <button onclick="updatePreset()" class="btn-secondary" id="btn-save-preset">Save</button>
            </div>
          </div>
          <div>
            <label for="edit-group" class="field-label">Group Tag <span class="hint">(optional, groups feed Group Subscriptions)</span></label>
            <div class="input-row">
              <input id="edit-group" type="text" maxlength="50" placeholder="e.g. home" autocomplete="off" class="field-input">
              <button onclick="updateAccountGroup()" class="btn-secondary" id="btn-save-group">Save</button>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-label">Amnezia Obfuscation</h3>
        <p class="amn-effective" id="amn-acct-effective"></p>
        <label class="amn-toggle-row" for="amn-acct-toggle">
          <input id="amn-acct-toggle" type="checkbox" onchange="amnToggleOverride(this.checked)">
          Override global defaults for this account
        </label>
        <div id="amn-acct-error" class="form-error hidden" role="alert"></div>
        <div class="amn-grid">
          <div class="amn-field"><label for="aac-jc">Jc <span class="hint">(0-128)</span></label><input id="aac-jc" type="number" min="0" max="128" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-jmin">Jmin <span class="hint">(0-1280)</span></label><input id="aac-jmin" type="number" min="0" max="1280" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-jmax">Jmax <span class="hint">(0-1280)</span></label><input id="aac-jmax" type="number" min="0" max="1280" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-s1">S1 <span class="hint">(0-255)</span></label><input id="aac-s1" type="number" min="0" max="255" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-s2">S2 <span class="hint">(0-255)</span></label><input id="aac-s2" type="number" min="0" max="255" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-h1">H1 <span class="hint">(0-2147483647)</span></label><input id="aac-h1" type="number" min="0" max="2147483647" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-h2">H2 <span class="hint">(0-2147483647)</span></label><input id="aac-h2" type="number" min="0" max="2147483647" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-h3">H3 <span class="hint">(0-2147483647)</span></label><input id="aac-h3" type="number" min="0" max="2147483647" class="field-input" autocomplete="off" disabled></div>
          <div class="amn-field"><label for="aac-h4">H4 <span class="hint">(0-2147483647)</span></label><input id="aac-h4" type="number" min="0" max="2147483647" class="field-input" autocomplete="off" disabled></div>
        </div>
        <div class="preset-actions">
          <button onclick="amnApplyPreset('mild')" class="btn-secondary btn-sm-tap">Mild</button>
          <button onclick="amnApplyPreset('aggressive')" class="btn-secondary btn-sm-tap">Aggressive</button>
          <button onclick="amnResetToGlobal()" class="btn-secondary btn-sm-tap">Reset to global</button>
          <button onclick="saveAccountAmnezia()" class="btn-primary btn-sm-tap" id="btn-save-amn-acct">Save</button>
        </div>
      </div>

      <div class="panel">
        <h3 class="panel-label">Subscription URLs</h3>
        <div id="client-pills" class="pill-row" role="group" aria-label="Show URLs for a specific app"></div>
        <div id="picker-hint" class="picker-hint hidden"></div>
        <div id="sub-urls" class="stack-sm"></div>
      </div>

      <div class="panel danger-zone">
        <h3 class="panel-label red-label">Danger Zone</h3>
        <div class="zone-buttons">
          <button onclick="regenerateToken()" class="zone-btn zone-btn-warn" id="btn-regen-token">Regenerate Token</button>
          <button onclick="deleteAccount()" class="zone-btn zone-btn-red" id="btn-delete-account">Delete Account</button>
        </div>
      </div>
    </div>

    <div id="view-settings" class="hidden">
      <h2 class="view-title" style="margin-bottom:1.5rem;">Settings</h2>

      <div class="panel">
        <div class="view-head" style="margin-bottom:1rem;">
          <h3 class="section-heading">Endpoint Presets</h3>
          <button onclick="showAddPresetForm()" class="btn-primary btn-sm" id="btn-add-preset">Add Preset</button>
        </div>
        <div id="presets-list" class="stack-sm"></div>
        <div id="add-preset-form" class="inline-form hidden">
          <input id="preset-name" type="text" placeholder="Preset name" autocomplete="off" class="field-input" aria-label="Preset name">
          <div id="preset-endpoints" class="stack-sm" style="margin-bottom:.75rem;"></div>
          <button onclick="addPresetEndpointRow()" class="link-btn">+ Add endpoint</button>
          <label for="preset-bulk" class="bulk-label">Bulk paste — one endpoint per line: <span class="mono-hint">ip:port</span>, <span class="mono-hint">host:port</span> or <span class="mono-hint">[ipv6]:port</span></label>
          <textarea id="preset-bulk" rows="4" autocomplete="off" spellcheck="false" class="field-input mono-area" placeholder="162.159.192.1:2408&#10;[2606:4700:d0::a29f:c001]:2408" aria-label="Bulk paste endpoints"></textarea>
          <div id="bulk-error" class="form-error hidden" role="alert"></div>
          <button onclick="applyBulkEndpoints()" class="link-btn">Apply lines to endpoint list</button>
          <div class="sheet-actions" style="justify-content:flex-start;">
            <button onclick="savePreset()" class="btn-primary" id="btn-save-preset">Save</button>
            <button onclick="hideAddPresetForm()" class="btn-secondary">Cancel</button>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:0;">
        <h3 class="panel-label">Amnezia Defaults</h3>
        <div id="amn-error" class="form-error hidden"></div>
        <div class="amn-grid">
          <div class="amn-field">
            <label for="amn-jc">Jc <span class="hint">(0-128)</span></label>
            <input id="amn-jc" type="number" min="0" max="128" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-jmin">Jmin <span class="hint">(0-1280)</span></label>
            <input id="amn-jmin" type="number" min="0" max="1280" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-jmax">Jmax <span class="hint">(0-1280)</span></label>
            <input id="amn-jmax" type="number" min="0" max="1280" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-s1">S1 <span class="hint">(0-255)</span></label>
            <input id="amn-s1" type="number" min="0" max="255" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-s2">S2 <span class="hint">(0-255)</span></label>
            <input id="amn-s2" type="number" min="0" max="255" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-h1">H1 <span class="hint">(0-2147483647)</span></label>
            <input id="amn-h1" type="number" min="0" max="2147483647" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-h2">H2 <span class="hint">(0-2147483647)</span></label>
            <input id="amn-h2" type="number" min="0" max="2147483647" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-h3">H3 <span class="hint">(0-2147483647)</span></label>
            <input id="amn-h3" type="number" min="0" max="2147483647" class="field-input" autocomplete="off">
          </div>
          <div class="amn-field">
            <label for="amn-h4">H4 <span class="hint">(0-2147483647)</span></label>
            <input id="amn-h4" type="number" min="0" max="2147483647" class="field-input" autocomplete="off">
          </div>
        </div>
        <button onclick="saveAmnezia()" class="btn-primary" id="btn-save-amnezia">Save Amnezia Defaults</button>
      </div>

      <div class="panel">
        <h3 class="panel-label">Group Subscriptions</h3>
        <p class="modal-note">Merge every account sharing a group tag into one subscription URL. Set tags on accounts in their detail view first.</p>
        <div id="agg-groups-row" class="pill-row" role="group" aria-label="Pick groups to merge"></div>
        <div class="input-row" style="margin-top:.75rem;">
          <input id="agg-label" type="text" maxlength="100" placeholder="Label (optional)" autocomplete="off" class="field-input">
          <input id="agg-expiry" type="date" class="field-input" style="max-width:11rem;">
          <button onclick="createAggSub()" class="btn-primary" id="btn-agg-create">Create</button>
        </div>
        <div id="agg-error" class="form-error hidden" role="alert"></div>
        <div id="agg-list" class="stack-sm" style="margin-top:1rem;"></div>
      </div>

      <div class="panel" style="margin-bottom:0;">
        <h3 class="panel-label">Backup &amp; Restore</h3>
        <p class="modal-note">Export bundles every account (including private keys), presets and settings into one AES-GCM encrypted file.</p>
        <div class="btn-row" style="margin-bottom:1rem;">
          <button onclick="showBackupExport()" class="btn-secondary" id="btn-backup-export">Export Encrypted Backup</button>
        </div>
        <label for="backup-import-file" class="field-label">Restore from backup file</label>
        <div class="input-row">
          <input id="backup-import-file" type="file" accept=".wgenc,.bin,application/octet-stream" class="field-input" style="padding:.45rem;">
        </div>
        <label for="backup-import-password" class="field-label">Backup password</label>
        <div class="input-row">
          <input id="backup-import-password" type="password" autocomplete="off" class="field-input">
          <button type="button" onclick="togglePwInput('backup-import-password', this)" class="btn-secondary" aria-label="Show or hide password">Show</button>
        </div>
        <label for="backup-mode" class="field-label">If an account ID already exists</label>
        <select id="backup-mode" class="field-input">
          <option value="skip">Keep existing (skip incoming)</option>
          <option value="overwrite">Overwrite existing with incoming</option>
        </select>
        <p class="warn-note" style="margin-top:.75rem;">This file IS the credentials — anyone holding it and the password controls every account.</p>
        <button onclick="importBackup()" class="btn-primary" id="btn-backup-import">Restore Backup</button>
      </div>
    </div>

    <div id="modal-create" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-create" onclick="if(event.target===this)closeModal('modal-create')">
      <div class="sheet sheet-md modal-pop">
        <h3 id="t-create" class="sheet-title">Create New Account</h3>
        <label for="create-name" class="field-label">Account Name</label>
        <input id="create-name" type="text" placeholder="e.g. Home ISP" autocomplete="off" class="field-input" autofocus>
        <div id="create-error" class="form-error hidden"></div>
        <div class="sheet-actions">
          <button onclick="closeModal('modal-create')" class="btn-secondary">Cancel</button>
          <button onclick="createAccount()" class="btn-primary" id="btn-create">Create</button>
        </div>
      </div>
    </div>

    <div id="modal-import" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-import" onclick="if(event.target===this)closeModal('modal-import')">
      <div class="sheet sheet-lg modal-pop">
        <h3 id="t-import" class="sheet-title">Import Config</h3>
        <label for="import-name" class="field-label">Account Name</label>
        <input id="import-name" type="text" placeholder="Account name" autocomplete="off" class="field-input">
        <label for="import-config" class="field-label">Configuration</label>
        <div id="import-drop" class="drop-zone">
          Drop <span class="mono-hint">.conf</span>, <span class="mono-hint">.txt</span> or <span class="mono-hint">.zip</span> here, or <label for="import-file" class="link-btn">choose a file</label>
          <input id="import-file" type="file" accept=".conf,.txt,.zip" class="hidden">
        </div>
        <textarea id="import-config" rows="8" placeholder="Paste WireGuard .conf or wg:// URI..." class="field-input mono-area"></textarea>
        <p class="modal-note">Supports WireGuard .conf and wg:// URI formats</p>
        <div id="import-error" class="form-error hidden"></div>
        <div class="sheet-actions">
          <button onclick="closeModal('modal-import')" class="btn-secondary">Cancel</button>
          <button onclick="importAccount()" class="btn-primary" id="btn-import">Import</button>
        </div>
      </div>
    </div>

    <div id="modal-qr" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-qr" onclick="if(event.target===this)closeModal('modal-qr')">
      <div class="sheet sheet-sm modal-pop">
        <h3 id="t-qr" class="sheet-title">Scan to Import</h3>
        <div id="qr-box" class="qr-box"></div>
        <div id="qr-url" class="qr-url"></div>
        <div class="sheet-actions">
          <button onclick="copyQrUrl()" class="btn-secondary" id="btn-copy-qr">Copy URL</button>
          <button onclick="closeModal('modal-qr')" class="btn-primary">Done</button>
        </div>
      </div>
    </div>

    <div id="modal-confirm" class="overlay overlay-top hidden" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onclick="if(event.target===this)confirmAction(false)">
      <div class="sheet sheet-sm modal-pop">
        <h3 id="confirm-title" class="sheet-title"></h3>
        <p id="confirm-message" class="sheet-msg"></p>
        <div class="sheet-actions">
          <a id="confirm-extra" class="btn-secondary confirm-extra hidden" download></a>
          <button onclick="confirmAction(false)" class="btn-secondary" id="confirm-cancel">Cancel</button>
          <button onclick="confirmAction(true)" class="confirm-btn confirm-warn" id="confirm-ok">Confirm</button>
        </div>
      </div>
    </div>

    <div id="modal-token-edit" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-token-edit" onclick="if(event.target===this)closeModal('modal-token-edit')">
      <div class="sheet sheet-sm modal-pop">
        <h3 id="t-token-edit" class="sheet-title">Edit Token</h3>
        <label for="token-label-input" class="field-label">Label</label>
        <input id="token-label-input" type="text" maxlength="100" placeholder="Optional — e.g. Phone" autocomplete="off" class="field-input">
        <label for="token-expiry-input" class="field-label">Expires</label>
        <div class="input-row">
          <input id="token-expiry-input" type="date" class="field-input">
          <button onclick="clearTokenExpiry()" class="btn-secondary">Never</button>
        </div>
        <label class="amn-toggle-row" for="token-enabled-toggle">
          <input id="token-enabled-toggle" type="checkbox">
          Enabled
        </label>
        <p class="modal-note">Disabling revokes all subscription URLs for this account immediately.</p>
        <div id="token-edit-error" class="form-error hidden" role="alert"></div>
        <div class="sheet-actions">
          <button onclick="closeModal('modal-token-edit')" class="btn-secondary">Cancel</button>
          <button onclick="saveTokenEdit()" class="btn-primary" id="btn-save-token">Save</button>
        </div>
      </div>
    </div>

    <div id="modal-latency" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-latency" onclick="if(event.target===this)closeModal('modal-latency')">
      <div class="sheet sheet-md modal-pop">
        <h3 id="t-latency" class="sheet-title">Endpoint Reachability</h3>
        <p class="modal-note">Approximate reachability timing only — browsers cannot ping UDP WireGuard endpoints. Fast failures usually mean the host answered; 3s timeouts mean a blackhole. Not a true latency measurement.</p>
        <div id="lat-status" class="picker-hint"></div>
        <div id="lat-table-wrap" style="max-height:40vh;overflow:auto;">
          <table class="lat-table">
            <thead><tr><th>Endpoint</th><th style="text-align:right;">ms</th></tr></thead>
            <tbody id="lat-tbody"></tbody>
          </table>
        </div>
        <div class="sheet-actions">
          <button onclick="closeModal('modal-latency')" class="btn-secondary">Close</button>
          <button onclick="saveLatencyOrder()" class="btn-primary" id="btn-save-order" disabled>Save Order</button>
        </div>
      </div>
    </div>

    <div id="modal-backup-export" class="overlay hidden" role="dialog" aria-modal="true" aria-labelledby="t-backup-export" onclick="if(event.target===this)closeModal('modal-backup-export')">
      <div class="sheet sheet-sm modal-pop">
        <h3 id="t-backup-export" class="sheet-title">Export Encrypted Backup</h3>
        <label for="backup-export-password" class="field-label">Backup password (min 8 characters)</label>
        <div class="input-row">
          <input id="backup-export-password" type="password" autocomplete="new-password" class="field-input">
          <button type="button" onclick="togglePwInput('backup-export-password', this)" class="btn-secondary" aria-label="Show or hide password">Show</button>
        </div>
        <p class="warn-note">Losing this password means losing the backup forever. There is no recovery.</p>
        <div id="backup-export-error" class="form-error hidden" role="alert"></div>
        <div class="sheet-actions">
          <button onclick="closeModal('modal-backup-export')" class="btn-secondary">Cancel</button>
          <button onclick="doBackupExport()" class="btn-primary" id="btn-do-export">Download backup.wgenc</button>
        </div>
      </div>
    </div>

  </div>


  <script>
    /* =============== CONSTANTS =============== */
    var FMT_ICONS = {
      zip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>',
      uri: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>',
      json: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1"/><path d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1"/></svg>',
      yaml: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16"/><path d="M4 12h9"/><path d="M4 18h12"/></svg>',
      b64: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l10 6-10 6L2 8z"/><path d="M2 13l10 6 10-6"/></svg>'
    };
    var ICON_KEY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.778 7.778 5.5 5.5 0 017.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L16 9"/></svg>';
    var ICON_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>';
    var ICON_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg>';

    var SUB_FORMATS = [
      { key: 'wireguard-conf', label: 'WireGuard .conf (ZIP)', icon: 'zip', kind: 'std', clients: ['wireguard', 'wiresock'], rec: true, dl: [], hint: 'Standard WireGuard configs — works in every client' },
      { key: 'wireguard-conf-amnezia', label: 'WireGuard .conf Amnezia (ZIP)', icon: 'zip', kind: 'amz', clients: ['wiresock'], rec: false, dl: [], hint: 'AmneziaWG variant — pick this if you use junk params' },
      { key: 'throne', label: 'Throne wg:// URI', icon: 'uri', kind: 'std', clients: [], rec: false, dl: ['throne://install-subscription?url='], hint: 'Native wg:// URI list' },
      { key: 'throne-amnezia', label: 'Throne wg:// Amnezia', icon: 'uri', kind: 'amz', clients: ['throne'], rec: false, dl: ['throne://install-subscription?url='], hint: 'wg:// URIs with Amnezia junk params' },
      { key: 'wireguard-uri', label: 'wireguard:// URI', icon: 'uri', kind: 'std', clients: [], rec: false, dl: [], hint: '' },
      { key: 'singbox', label: 'Sing-box JSON', icon: 'json', kind: 'std', clients: ['throne'], rec: true, dl: ['singbox://import-remote-profile?url='], hint: 'Recommended for Throne 1.13+ (endpoint schema)' },
      { key: 'singbox-amnezia', label: 'Sing-box JSON Amnezia', icon: 'json', kind: 'amz', clients: [], rec: false, dl: ['singbox://import-remote-profile?url='], hint: 'AWG forks (sing-box-awg) — endpoint schema with amnezia_wg junk params' },
      { key: 'singbox-legacy', label: 'Sing-box Legacy JSON', icon: 'json', kind: 'std', clients: ['hiddify', 'nekobox'], rec: true, dl: ['hiddify://import/<url>', 'hiddify://import-subscription?url='], hint: 'Recommended for Hiddify and NekoBox' },
      { key: 'singbox-legacy-amnezia', label: 'Sing-box Legacy Amnezia', icon: 'json', kind: 'amz', clients: [], rec: false, dl: ['hiddify://import/<url>', 'hiddify://import-subscription?url='], hint: 'AWG forks on legacy outbounds with amnezia_wg junk params' },
      { key: 'xray', label: 'Xray JSON', icon: 'json', kind: 'std', clients: [], rec: false, dl: [], hint: '' },
      { key: 'clash', label: 'Clash YAML', icon: 'yaml', kind: 'std', clients: ['clash'], rec: true, dl: ['clash://install-subscription?url=', 'clash://install-config?url=', 'stash://install-config?url=', 'loon://import?sub='], hint: 'Recommended for Clash Meta clients' },
      { key: 'clash-amnezia', label: 'Clash YAML Amnezia', icon: 'yaml', kind: 'amz', clients: ['clash'], rec: false, dl: ['clash://install-config?url=', 'stash://install-config?url=', 'loon://import?sub='], hint: 'Mihomo/Clash Meta with amnezia-wg-option junk params' },
      { key: 'v2rayn', label: 'V2RayN Base64', icon: 'b64', kind: 'std', clients: [], rec: false, dl: [], hint: '' },
      { key: 'surge', label: 'Surge INI', icon: 'uri', kind: 'std', clients: [], rec: false, dl: ['surge:///install-config?url='], hint: 'Dual-section INI for Surge 5 (iOS/macOS)' },
      { key: 'loon', label: 'Loon INI', icon: 'uri', kind: 'std', clients: [], rec: false, dl: ['loon://import?sub='], hint: 'One-liner wireguard proxies for Loon (iOS)' },
      { key: 'surfboard', label: 'Surfboard INI', icon: 'uri', kind: 'std', clients: [], rec: false, dl: ['surfboard:///install-config?url='], hint: 'Dual-section INI for Surfboard (iOS)' },
      { key: 'egern', label: 'Egern YAML', icon: 'yaml', kind: 'std', clients: [], rec: false, dl: [], hint: 'WireGuard proxies for Egern (iOS)' }
    ];

    var CLIENTS = [
      { id: 'hiddify', label: 'Hiddify' },
      { id: 'nekobox', label: 'NekoBox' },
      { id: 'throne', label: 'Throne' },
      { id: 'wiresock', label: 'WireSock' },
      { id: 'wireguard', label: 'WireGuard' },
      { id: 'clash', label: 'Clash' }
    ];
    var DL_LABELS = { 'clash://install-subscription?url=': 'Open in Clash', 'clash://install-config?url=': 'Open in Clash', 'stash://install-config?url=': 'Open in Stash', 'hiddify://import/<url>': 'Open in Hiddify', 'hiddify://import-subscription?url=': 'Open in Hiddify', 'singbox://import-remote-profile?url=': 'Open in Sing-box', 'throne://install-subscription?url=': 'Open in Throne', 'loon://import?sub=': 'Open in Loon', 'surge:///install-config?url=': 'Open in Surge', 'surfboard:///install-config?url=': 'Open in Surfboard' };

    var GRADIENTS = [
      'grad-1',
      'grad-2',
      'grad-3',
      'grad-4',
      'grad-5',
      'grad-6'
    ];

    ${CLIENT_HELPERS_JS}

    ${QR_LIB_JS}

    var AMN_PRESETS = ${JSON.stringify(AMNEZIA_UI_PRESETS)};
    var PROBE_TIMEOUT_MS = ${PROBE_TIMEOUT_MS};

    /* =============== STATE =============== */
    var currentView = 'accounts';
    var accounts = [];
    var presets = [];
    var currentAccountId = null;
    var currentAccount = null;
    var globalAmnezia = null;
    var routeSeq = 0;
    var tokenRevealed = false;
    var editingPresetId = null;
    var _confirmOpener = null;
    var accountsLoadedOnce = false;
    var clientFilter = 'all';
    var subUrlsCache = [];
    var currentQrUrl = '';
    var warpStatus = null;
    var aggSubs = [];
    var aggSelectedGroups = [];
    var aggUrlsCache = {};
    var latencyState = { presetId: null, preset: null, results: [], probing: false };

    /* =============== UTILITIES =============== */
    function escHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function avatarInitials(name) {
      var parts = name.trim().split(/\s+/);
      if (parts.length >= 2 && parts[0] && parts[1]) {
        return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
      }
      return name.substring(0, 2).toUpperCase();
    }

    function avatarGradient(name) {
      var hash = 0;
      for (var i = 0; i < name.length; i++) {
        hash = ((hash << 5) - hash) + name.charCodeAt(i);
        hash = hash & hash;
      }
      return GRADIENTS[Math.abs(hash) % GRADIENTS.length];
    }

    function updateStats() {
      if (accountsLoadedOnce) {
        document.getElementById('stat-accounts').innerHTML = '<span class="dot dot-cyan"></span>' + accounts.length + ' account' + (accounts.length !== 1 ? 's' : '');
      }
      document.getElementById('stat-presets').innerHTML = '<span class="dot dot-violet"></span>' + presets.length + ' presets';
    }

    function setLoading(btn, loading) {
      if (loading) {
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = '<svg class="spinner-icon" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading...';
      } else {
        btn.disabled = false;
        btn.textContent = btn.dataset.origText || 'Save';
      }
    }

    /* =============== TOAST SYSTEM =============== */
    function toast(msg, type) {
      type = type || 'success';
      var container = document.getElementById('toast-container');
      var el = document.createElement('div');
      var isErr = type === 'error';
      var icon = isErr
        ? '<svg class="ticon ticon-err" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg class="ticon ticon-ok" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      el.className = 'toast toast-in' + (isErr ? ' toast-error' : '');
      el.innerHTML = icon + '<span class="toast-body">' + escHtml(msg) + '</span>' +
        '<button onclick="this.parentElement.remove()" class="toast-close" aria-label="Dismiss">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '<span class="toast-bar' + (isErr ? ' toast-bar-err' : '') + '" style="animation: toast-progress 3.5s linear forwards;"></span>';
      container.appendChild(el);
      setTimeout(function() {
        el.classList.remove('toast-in');
        el.classList.add('toast-out');
        setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
      }, 3500);
    }

    /* =============== CONFIRM DIALOG =============== */
    var _confirmResolve = null;

    function confirmDialog(title, message, isDestructive, extra) {
      return new Promise(function(resolve) {
        _confirmResolve = resolve;
        _confirmOpener = document.activeElement;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        var ex = document.getElementById('confirm-extra');
        if (extra && extra.href) {
          ex.href = extra.href;
          ex.textContent = extra.label || 'Download';
          ex.classList.remove('hidden');
        } else {
          ex.classList.add('hidden');
          ex.removeAttribute('href');
        }
        var okBtn = document.getElementById('confirm-ok');
        if (isDestructive) {
          okBtn.className = 'confirm-btn confirm-danger';
          okBtn.textContent = 'Delete';
        } else {
          okBtn.className = 'confirm-btn confirm-warn';
          okBtn.textContent = 'Confirm';
        }
        document.getElementById('modal-confirm').classList.remove('hidden');
        document.getElementById('confirm-cancel').focus();
      });
    }

    function confirmAction(result) {
      document.getElementById('modal-confirm').classList.add('hidden');
      if (_confirmOpener && typeof _confirmOpener.focus === 'function' && document.contains(_confirmOpener)) {
        _confirmOpener.focus();
      }
      _confirmOpener = null;
      if (_confirmResolve) {
        var r = _confirmResolve;
        _confirmResolve = null;
        r(result);
      }
    }

    /* =============== MODALS =============== */
    function closeModal(id) {
      document.getElementById(id).classList.add('hidden');
    }

    function showCreateModal() {
      document.getElementById('create-name').value = '';
      document.getElementById('create-error').classList.add('hidden');
      document.getElementById('modal-create').classList.remove('hidden');
      document.getElementById('create-name').focus();
    }

    function showImportModal() {
      document.getElementById('import-name').value = '';
      document.getElementById('import-config').value = '';
      document.getElementById('import-error').classList.add('hidden');
      document.getElementById('modal-import').classList.remove('hidden');
      document.getElementById('import-name').focus();
    }

    /* =============== API HELPER =============== */
    function sessionExpired() {
      location.assign('/admin/login?error=session');
    }

    async function api(path, opts) {
      opts = opts || {};
      var res = await fetch(path, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      var ctype = res.headers.get('content-type') || '';
      if (res.status === 401 || ctype.indexOf('text/html') !== -1) {
        sessionExpired();
        throw new Error('Session expired');
      }
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    /* =============== HASH ROUTER =============== */
    function hashForView(view, data) {
      if (view === 'detail' && data) return '#/account/' + data;
      if (view === 'settings') return '#/settings';
      if (view === 'presets') return '#/presets';
      return '#/accounts';
    }

    function navigate(view, data) {
      var h = hashForView(view, data);
      if (location.hash === h) { applyRoute(); return; }
      location.hash = h;
    }

    function applyRoute() {
      var seq = ++routeSeq;
      var h = location.hash || '#/accounts';
      var view, id = null;
      var m = h.match(/^#\/account\/([A-Za-z0-9-]+)/);
      if (m) { view = 'detail'; id = m[1]; }
      else if (h.indexOf('#/settings') === 0 || h.indexOf('#/presets') === 0) { view = 'settings'; }
      else { view = 'accounts'; }

      currentView = view;
      document.getElementById('view-accounts').classList.toggle('hidden', view !== 'accounts');
      document.getElementById('view-detail').classList.toggle('hidden', view !== 'detail');
      document.getElementById('view-settings').classList.toggle('hidden', view !== 'settings');
      var btns = document.querySelectorAll('.nav-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle('nav-active', btns[i].dataset.view === view);
      }
      if (view === 'accounts' || view === 'settings') {
        var vEl = document.getElementById('view-' + view);
        vEl.classList.remove('view-enter');
        void vEl.offsetWidth;
        vEl.classList.add('view-enter');
      }
      if (view === 'accounts') loadAccounts(seq);
      else if (view === 'detail') loadAccountDetail(id, seq);
      else loadSettings(seq);
    }

    /* =============== ACCOUNTS VIEW =============== */
    function renderSkeleton() {
      var grid = document.getElementById('accounts-grid');
      var html = '';
      for (var i = 0; i < 6; i++) {
        html += '<div style="--i:' + i + '" class="skel-card">' +
          '<div class="skel-row">' +
            '<div class="skel-avatar skeleton"></div>' +
            '<div class="skel-col">' +
              '<div class="skel-a skeleton"></div>' +
              '<div class="skel-b skeleton"></div>' +
            '</div>' +
          '</div>' +
          '<div class="skel-c skeleton"></div>' +
          '<div><div class="skel-pill skeleton"></div></div>' +
        '</div>';
      }
      grid.innerHTML = html;
    }

    function renderEmpty() {
      var grid = document.getElementById('accounts-grid');
      grid.innerHTML =
        '<div class="empty-cell fade-up">' +
          '<div class="empty-card">' +
            '<div class="dotgrid" style="opacity:.7;" aria-hidden="true"></div>' +
            '<div class="empty-icon">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>' +
              '</svg>' +
            '</div>' +
            '<h3 class="empty-title">No accounts yet</h3>' +
            '<p class="empty-msg">Generate a fresh WARP account or import an existing WireGuard config to start serving subscriptions.</p>' +
            '<div class="empty-actions">' +
              '<button onclick="showCreateModal()" class="btn-primary">Create Account</button>' +
              '<button onclick="showImportModal()" class="btn-secondary">Import Config</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }

    async function loadAccounts(seq) {
      if (seq === undefined) seq = ++routeSeq;
      function isStale() { return seq !== routeSeq; }
      var skelTimer = setTimeout(function() { if (!isStale()) renderSkeleton(); }, 400);
      try {
        var list = await api('/api/account');
        clearTimeout(skelTimer);
        if (isStale()) return;
        accounts = list;
        accountsLoadedOnce = true;
        renderAccounts();
        updateStats();
        renderChecklist();
      } catch (e) {
        clearTimeout(skelTimer);
        if (isStale()) return;
        document.getElementById('accounts-grid').innerHTML =
          '<div class="error-cell">' +
            '<div class="error-text">' + escHtml(e.message) + '</div>' +
            '<button onclick="loadAccounts()" class="btn-secondary">Retry</button>' +
          '</div>';
        return;
      }
      // Preset stat chip needs presets even before the Settings/Detail views are visited
      api('/api/presets').then(function(p) {
        if (isStale()) return;
        presets = p;
        updateStats();
      }).catch(function() {});
    }

    function renderAccounts() {
      var grid = document.getElementById('accounts-grid');
      if (accounts.length === 0) { renderEmpty(); return; }
      grid.innerHTML = accounts.map(function(a, i) {
        var created = new Date(a.created_at).toLocaleDateString();
        var tokenShort = a.token.substring(0, 8) + '\u2026';
        var initials = avatarInitials(a.name || 'UN');
        var grad = avatarGradient(a.name || '');
        var isPreset = a.endpoint_list && a.endpoint_list.type === 'preset';
        var hasAmn = !!a.amnezia_overrides;
        var life = tokenLifecycle(a);
        var dotTitle = life === 'expired' ? 'Token expired' : (life === 'revoked' ? 'Token revoked' : 'Active');
        return '<button type="button" class="acct-card spot card-hover" style="--i:' + i + '" onclick="navigate(\'detail\', \'' + a.id + '\')" aria-label="Open account ' + escHtml(a.name) + '">' +
          '<span class="acct-status-dot' + (life === 'active' ? '' : ' dot-bad') + '" title="' + dotTitle + '" aria-hidden="true"></span>' +
          '<span class="acct-head">' +
            '<span class="avatar ' + grad + '">' + escHtml(initials) + '</span>' +
            '<span class="acct-meta">' +
              '<span class="acct-name">' + escHtml(a.name) + '</span>' +
              '<span class="acct-date">' + created + '</span>' +
            '</span>' +
            '<svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
          '</span>' +
          '<span class="acct-token">' + ICON_KEY + '<span style="overflow:hidden;text-overflow:ellipsis;">' + escHtml(tokenShort) + '</span></span>' +
          '<span class="badge-row">' +
            '<span class="badge">' + (isPreset ? 'Preset' : 'Custom') + '</span>' +
            (hasAmn ? '<span class="badge badge-amz">Amnezia</span>' : '') +
          '</span>' +
        '</button>';
      }).join('');
    }

    /* =============== ACCOUNT DETAIL =============== */
    async function loadAccountDetail(id, seq) {
      if (seq === undefined) seq = ++routeSeq;
      function isStale() { return seq !== routeSeq; }
      currentAccountId = id;
      tokenRevealed = false;
      clientFilter = 'all';
      try {
        var acct = await api('/api/account/' + id);
        if (isStale()) return;
        currentAccount = acct;
        document.getElementById('detail-name').textContent = currentAccount.name;
        renderSubUrls();
        renderToken();
        renderTokenFacts();
        document.getElementById('edit-name').value = currentAccount.name;
        document.getElementById('edit-group').value = currentAccount.group || '';
        await loadPresetsForSelect();
        if (isStale()) return;
        await loadAccountAmnezia();
      } catch (e) {
        if (isStale()) return;
        toast(e.message, 'error');
        navigate('accounts');
      }
    }

    function maskToken(token) {
      return '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022' + String(token).slice(-4);
    }

    function renderToken() {
      var el = document.getElementById('detail-token');
      var t = currentAccount ? currentAccount.token : '';
      el.textContent = tokenRevealed ? t : maskToken(t);
      el.classList.toggle('masked', !tokenRevealed);
      el.setAttribute('aria-pressed', tokenRevealed ? 'true' : 'false');
      el.setAttribute('aria-label', tokenRevealed
        ? 'Subscription token revealed. Activate to hide.'
        : 'Subscription token hidden. Activate to reveal.');
    }

    function toggleTokenReveal() {
      if (!currentAccount) return;
      tokenRevealed = !tokenRevealed;
      renderToken();
    }

    function copyToken() {
      var token = currentAccount ? currentAccount.token : '';
      copyToClipboard(token, 'Token copied!');
    }

    /* =============== TOKEN LIFECYCLE =============== */
    function tokenLifecycle(acct) {
      if (!acct) return 'active';
      var meta = acct.tokenMeta;
      if (meta && meta.disabled === true) return 'revoked';
      if (meta && typeof meta.expiresAt === 'string') {
        var exp = Date.parse(meta.expiresAt);
        if (!isNaN(exp) && exp <= Date.now()) return 'expired';
      }
      return 'active';
    }

    function fmtFactDate(iso) {
      var d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function tokenExpiryChip(acct) {
      var meta = acct.tokenMeta || {};
      if (!meta.expiresAt || isNaN(Date.parse(meta.expiresAt))) {
        return '<span class="tchip">Never</span>';
      }
      var soonMs = 7 * 24 * 60 * 60 * 1000;
      var soon = Date.parse(meta.expiresAt) - Date.now() < soonMs;
      var label = new Date(meta.expiresAt).toLocaleDateString();
      if (soon) {
        return '<span class="tchip tchip-warn" title="Expires in under 7 days">' + escHtml(label) + '</span>';
      }
      return '<span class="tchip">' + escHtml(label) + '</span>';
    }

    function tokenStatusChipHtml(acct) {
      var s = tokenLifecycle(acct);
      if (s === 'expired') return '<span class="tchip tchip-red">Expired</span>';
      if (s === 'revoked') return '<span class="tchip tchip-red">Revoked</span>';
      return '<span class="tchip tchip-ok">Active</span>';
    }

    function renderTokenFacts() {
      var el = document.getElementById('token-facts');
      if (!el || !currentAccount) return;
      var meta = currentAccount.tokenMeta || {};
      var hits = Number(currentAccount.fetchCount) || 0;
      var rows = [
        ['Label', meta.label ? escHtml(meta.label) : '<span class="tf-dim">&mdash;</span>'],
        ['Created', escHtml(fmtFactDate(currentAccount.created_at))],
        ['Expires', tokenExpiryChip(currentAccount)],
        ['Hits', escHtml(String(hits)) + ' <span class="tf-hint">origin serves &mdash; cached fetches not counted</span>'],
        ['Status', tokenStatusChipHtml(currentAccount)]
      ];
      var html = '';
      for (var i = 0; i < rows.length; i++) {
        html += '<div class="tf-row"><span class="tf-key">' + rows[i][0] + '</span><span class="tf-val">' + rows[i][1] + '</span></div>';
      }
      el.innerHTML = html;
    }

    function showTokenEditModal() {
      if (!currentAccount) return;
      var meta = currentAccount.tokenMeta || {};
      document.getElementById('token-label-input').value = meta.label || '';
      var expInput = document.getElementById('token-expiry-input');
      expInput.value = (meta.expiresAt && !isNaN(Date.parse(meta.expiresAt)))
        ? new Date(meta.expiresAt).toISOString().slice(0, 10)
        : '';
      document.getElementById('token-enabled-toggle').checked = meta.disabled !== true;
      document.getElementById('token-edit-error').classList.add('hidden');
      document.getElementById('modal-token-edit').classList.remove('hidden');
      document.getElementById('token-label-input').focus();
    }

    function clearTokenExpiry() {
      document.getElementById('token-expiry-input').value = '';
    }

    function syncAccountsEntry(acct) {
      for (var i = 0; i < accounts.length; i++) {
        if (accounts[i].id === acct.id) { accounts[i] = acct; break; }
      }
      updateStats();
      if (currentView === 'accounts') renderAccounts();
    }

    async function saveTokenEdit() {
      var errEl = document.getElementById('token-edit-error');
      errEl.classList.add('hidden');
      var labelRaw = document.getElementById('token-label-input').value.trim();
      var expRaw = document.getElementById('token-expiry-input').value;
      var enabled = document.getElementById('token-enabled-toggle').checked;
      var body = {
        tokenMeta: {
          label: labelRaw || null,
          expiresAt: expRaw ? new Date(expRaw + 'T23:59:59').toISOString() : null,
          disabled: !enabled
        }
      };
      var btn = document.getElementById('btn-save-token');
      setLoading(btn, true);
      try {
        var updated = await api('/api/account/' + currentAccountId, { method: 'PUT', body: body });
        currentAccount = updated;
        closeModal('modal-token-edit');
        renderTokenFacts();
        syncAccountsEntry(updated);
        toast(enabled ? 'Token updated' : 'Token revoked');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
      setLoading(btn, false);
    }

    function copyToClipboard(text, successMsg) {
      try { localStorage.setItem('wg_checklist_url_copied', '1'); } catch {}
      if (successMsg === 'URL copied!') renderChecklist();
      function legacyCopy() {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast(successMsg || 'Copied!');
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function() { toast(successMsg || 'Copied!'); }).catch(function() { legacyCopy(); });
      } else {
        legacyCopy();
      }
    }

    var ICON_QR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM21 14v.01M14 21v.01M17.5 17.5h3v3h-3z"/></svg>';

    function renderClientPills() {
      var wrap = document.getElementById('client-pills');
      if (!wrap) return;
      var html = '<button type="button" class="pill' + (clientFilter === 'all' ? ' pill-active' : '') + '" onclick="setClientFilter(\'all\')" aria-pressed="' + (clientFilter === 'all') + '">All</button>';
      for (var i = 0; i < CLIENTS.length; i++) {
        var c = CLIENTS[i];
        html += '<button type="button" class="pill' + (clientFilter === c.id ? ' pill-active' : '') + '" onclick="setClientFilter(\'' + c.id + '\')" aria-pressed="' + (clientFilter === c.id) + '">' + escHtml(c.label) + '</button>';
      }
      wrap.innerHTML = html;
    }

    function setClientFilter(id) {
      clientFilter = id || 'all';
      renderSubUrls();
    }

    function subUrlFor(token, formatKey) {
      return location.origin + '/sub/' + token + '/' + formatKey;
    }

    function renderSubUrls() {
      renderClientPills();
      var container = document.getElementById('sub-urls');
      var hintEl = document.getElementById('picker-hint');
      var token = currentAccount.token;
      var visible = formatsForClient(SUB_FORMATS, clientFilter);
      subUrlsCache = [];
      if (hintEl) {
        if (clientFilter !== 'all') {
          var recs = [];
          for (var ri = 0; ri < visible.length; ri++) if (visible[ri].rec) recs.push(visible[ri].label);
          hintEl.textContent = recs.length ? 'Recommended for ' + (CLIENTS.filter(function(c) { return c.id === clientFilter; })[0] || { label: clientFilter }).label + ': ' + recs.join(', ') : '';
          hintEl.classList.toggle('hidden', !recs.length);
        } else {
          hintEl.classList.add('hidden');
        }
      }
      container.innerHTML = visible.map(function(f) {
        var url = subUrlFor(token, f.key);
        var idx = subUrlsCache.length;
        subUrlsCache.push(url);
        var safeUrl = escHtml(url);
        var amnBadge = f.kind === 'amz'
          ? ' <span class="amz-tag">AMZ</span>'
          : '';
        var recBadge = clientFilter !== 'all' && f.rec
          ? ' <span class="rec-tag">Rec</span>'
          : '';
        var hintText = clientFilter !== 'all' && f.hint
          ? '<div class="sub-hint">' + escHtml(f.hint) + '</div>'
          : '';
        var dlBtns = '';
        for (var di = 0; di < f.dl.length; di++) {
          var href = deepLinkUrl(url, f.dl[di]);
          if (!href) continue;
          var lbl = DL_LABELS[f.dl[di]] || 'Open in app';
          dlBtns += '<a href="' + escHtml(href) + '" title="' + escHtml(lbl) + '" class="icon-btn" aria-label="' + escHtml(lbl) + '">' + ICON_OPEN + '</a>';
        }
        return '<div class="sub-row spot">' +
          '<span class="fmt-box">' + FMT_ICONS[f.icon] + '</span>' +
          '<div class="sub-info">' +
            '<div class="sub-name">' + escHtml(f.label) + amnBadge + recBadge + '</div>' +
            '<div class="sub-url">' + safeUrl + '</div>' +
            hintText +
          '</div>' +
          '<button onclick="copyToClipboard(subUrlsCache[' + idx + '], \'URL copied!\')" title="Copy URL" class="icon-btn" aria-label="Copy URL">' + ICON_COPY + '</button>' +
          '<button onclick="openQr(' + idx + ')" title="Show QR code" class="icon-btn" aria-label="Show QR code">' + ICON_QR + '</button>' +
          dlBtns +
          '<a href="' + safeUrl + '" target="_blank" rel="noopener" title="Open URL" class="icon-btn" aria-label="Open URL">' + ICON_OPEN + '</a>' +
        '</div>';
      }).join('');
    }

    function openQr(idx) {
      openQrUrl(subUrlsCache[idx]);
    }

    function openQrUrl(url) {
      if (!url) return;
      var box = document.getElementById('qr-box');
      var svg = qrSvg(url, 200);
      box.innerHTML = svg || '<p style="color:#ef4444;font-size:13px;">URL too long for QR</p>';
      currentQrUrl = url;
      document.getElementById('qr-url').textContent = url;
      document.getElementById('modal-qr').classList.remove('hidden');
    }

    function copyQrUrl() {
      copyToClipboard(currentQrUrl, 'URL copied!');
    }

    /* =============== WARP STATUS CHIP (B10) =============== */
    function relTime(iso) {
      if (!iso) return 'never';
      var ms = Date.now() - Date.parse(iso);
      if (isNaN(ms) || ms < 0) return 'just now';
      var m = Math.floor(ms / 60000);
      if (m < 1) return 'just now';
      if (m < 60) return m + 'm ago';
      var h = Math.floor(m / 60);
      if (h < 24) return h + 'h ago';
      return Math.floor(h / 24) + 'd ago';
    }

    async function loadWarpStatus() {
      try {
        warpStatus = await api('/api/settings/warpstatus');
      } catch (e) { warpStatus = null; }
      renderWarpChip();
    }

    function renderWarpChip() {
      var el = document.getElementById('stat-warp');
      if (!el) return;
      if (!warpStatus || warpStatus.ok === null || !warpStatus.checkedAt) {
        el.innerHTML = '<span class="dot" style="background:var(--text-dim);"></span>WARP: not checked yet';
        el.title = 'No WARP registration has been attempted yet. Status updates after you create an account.';
        return;
      }
      var up = warpStatus.ok === true;
      el.innerHTML = '<span class="dot" style="background:' + (up ? '#34d399' : '#ef4444') + ';"></span>WARP: ' +
        (up ? 'up' : 'down') + ' &middot; ' + escHtml(relTime(warpStatus.checkedAt));
      var tip = 'Last WARP registration attempt: ' + new Date(warpStatus.checkedAt).toLocaleString();
      if (!up && warpStatus.lastError) tip += '\nError: ' + warpStatus.lastError;
      el.title = tip;
    }

    /* =============== SETUP CHECKLIST (B10) =============== */
    function checklistDismissed() {
      try { return localStorage.getItem('wg_checklist_dismissed') === '1'; } catch { return true; }
    }

    function dismissChecklist() {
      try { localStorage.setItem('wg_checklist_dismissed', '1'); } catch {}
      renderChecklist();
    }

    function checklistCopiedFlag() {
      try { return localStorage.getItem('wg_checklist_url_copied') === '1'; } catch { return false; }
    }

    function renderChecklist() {
      var el = document.getElementById('checklist-banner');
      if (!el) return;
      if (checklistDismissed()) { el.innerHTML = ''; return; }
      var accountDone = accountsLoadedOnce && accounts.length > 0;
      var copyDone = checklistCopiedFlag();
      if (accountDone && copyDone) { el.innerHTML = ''; return; }
      function item(done, label, actionHtml) {
        return '<div class="chk-item' + (done ? ' chk-done' : '') + '">' +
          '<span class="chk-mark">' + (done ? '&#10003;' : '&#9675;') + '</span>' +
          '<span>' + escHtml(label) + '</span>' +
          (actionHtml || '') +
        '</div>';
      }
      var createAction = accountDone ? '' : '<button onclick="showCreateModal()" class="link-btn">Do it</button>';
      var copyAction = '';
      if (!copyDone && accountDone && accounts[0] && accounts[0].id) {
        copyAction = '<button onclick="navigate(\'detail\', \'' + escHtml(accounts[0].id) + '\')" class="link-btn">Do it</button>';
      }
      el.innerHTML =
        '<div class="check-banner fade-up">' +
          '<div class="check-banner-head">' +
            '<strong>Getting started</strong>' +
            '<button onclick="dismissChecklist()" class="toast-close" aria-label="Dismiss checklist">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
          item(true, 'Admin password set', '') +
          item(accountDone, 'Create your first account', createAction) +
          item(copyDone, 'Copy a subscription URL', copyAction) +
        '</div>';
    }

    async function updateAccountName() {
      var name = document.getElementById('edit-name').value.trim();
      if (!name) return toast('Name required', 'error');
      var btn = document.getElementById('btn-save-name');
      setLoading(btn, true);
      try {
        await api('/api/account/' + currentAccountId, { method: 'PUT', body: { name: name } });
        currentAccount.name = name;
        document.getElementById('detail-name').textContent = name;
        toast('Name updated');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    async function regenerateToken() {
      var urlCount = SUB_FORMATS.length;
      var ok = await confirmDialog('Regenerate Token', 'The old subscription URLs will stop working immediately. This will invalidate ' + urlCount + ' client URLs. This cannot be undone.', false);
      if (!ok) return;
      var btn = document.getElementById('btn-regen-token');
      setLoading(btn, true);
      try {
        var data = await api('/api/account/' + currentAccountId + '/regenerate-token', { method: 'POST' });
        currentAccount.token = data.token;
        tokenRevealed = true;
        renderToken();
        renderSubUrls();
        toast('Token regenerated');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    function accountHasConfigs(acct) {
      if (!acct || !acct.endpoint_list) return false;
      var el = acct.endpoint_list;
      if (el.type === 'custom') return Array.isArray(el.endpoints) && el.endpoints.length > 0;
      return !!el.preset_id;
    }

    async function deleteAccount() {
      var msg = 'This will permanently delete this account and all its data. This cannot be undone.';
      var extra = null;
      if (accountHasConfigs(currentAccount) && currentAccount.token) {
        extra = { label: 'Download all configs (.zip)', href: subUrlFor(currentAccount.token, 'wireguard-conf') };
        msg = 'Your configs will be lost forever. Download them first if you still need them. This will permanently delete this account and cannot be undone.';
      }
      var ok = await confirmDialog('Delete Account', msg, true, extra);
      if (!ok) return;
      var btn = document.getElementById('btn-delete-account');
      setLoading(btn, true);
      try {
        await api('/api/account/' + currentAccountId, { method: 'DELETE' });
        toast('Account deleted');
        navigate('accounts');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    /* =============== PRESETS (detail view select) =============== */
    async function loadPresetsForSelect() {
      try {
        presets = await api('/api/presets');
        var sel = document.getElementById('edit-preset');
        sel.innerHTML = presets.map(function(p) {
          var selected = currentAccount.endpoint_list && currentAccount.endpoint_list.preset_id === p.id;
          return '<option value="' + escHtml(p.id) + '"' + (selected ? ' selected' : '') + '>' + escHtml(p.name) + ' (' + p.endpoints.length + ' endpoints)</option>';
        }).join('');
        if (currentAccount.endpoint_list && currentAccount.endpoint_list.type === 'custom') {
          sel.innerHTML = '<option value="" selected disabled>Custom endpoints</option>' + sel.innerHTML;
        }
        updateStats();
      } catch (e) { /* silent */ }
    }

    async function updatePreset() {
      var sel = document.getElementById('edit-preset');
      var presetId = sel.value;
      if (!presetId) return;
      var btn = document.getElementById('btn-save-preset');
      setLoading(btn, true);
      try {
        await api('/api/account/' + currentAccountId, {
          method: 'PUT',
          body: { endpoint_list: { type: 'preset', preset_id: presetId } }
        });
        currentAccount.endpoint_list = { type: 'preset', preset_id: presetId };
        toast('Preset updated');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    async function updateAccountGroup() {
      var raw = document.getElementById('edit-group').value.trim();
      var btn = document.getElementById('btn-save-group');
      setLoading(btn, true);
      try {
        var updated = await api('/api/account/' + currentAccountId, { method: 'PUT', body: { group: raw || null } });
        currentAccount = updated;
        document.getElementById('edit-group').value = updated.group || '';
        toast(updated.group ? 'Group tag saved' : 'Group tag cleared');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    /* =============== CREATE / IMPORT =============== */
    async function createAccount() {
      var name = document.getElementById('create-name').value.trim();
      var errEl = document.getElementById('create-error');
      if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
      var btn = document.getElementById('btn-create');
      setLoading(btn, true);
      try {
        var account = await api('/api/account/generate', { method: 'POST', body: { name: name } });
        closeModal('modal-create');
        toast('Account created');
        navigate('detail', account.id);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
      setLoading(btn, false);
    }

    async function importAccount() {
      var name = document.getElementById('import-name').value.trim();
      var config = document.getElementById('import-config').value.trim();
      var errEl = document.getElementById('import-error');
      if (!name) { errEl.textContent = 'Name is required'; errEl.classList.remove('hidden'); return; }
      if (!config) { errEl.textContent = 'Config is required'; errEl.classList.remove('hidden'); return; }
      var btn = document.getElementById('btn-import');
      setLoading(btn, true);
      try {
        var account = await api('/api/account/import', { method: 'POST', body: { name: name, config: config } });
        closeModal('modal-import');
        toast('Account imported');
        navigate('detail', account.id);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
      setLoading(btn, false);
    }

    /* =============== SETTINGS VIEW =============== */
    async function loadSettings(seq) {
      if (seq === undefined) seq = ++routeSeq;
      function isStale() { return seq !== routeSeq; }
      try {
        var p = await api('/api/presets');
        if (isStale()) return;
        presets = p;
        renderPresets();
        var amn = await api('/api/settings/amnezia');
        if (isStale()) return;
        globalAmnezia = amn;
        document.getElementById('amn-jc').value = amn.Jc;
        document.getElementById('amn-jmin').value = amn.Jmin;
        document.getElementById('amn-jmax').value = amn.Jmax;
        document.getElementById('amn-s1').value = amn.S1;
        document.getElementById('amn-s2').value = amn.S2;
        document.getElementById('amn-h1').value = amn.H1;
        document.getElementById('amn-h2').value = amn.H2;
        document.getElementById('amn-h3').value = amn.H3;
        document.getElementById('amn-h4').value = amn.H4;
        updateStats();
      } catch (e) {
        if (!isStale()) toast(e.message, 'error');
      }
      api('/api/account').then(function(list) {
        if (isStale()) return;
        accounts = list;
        accountsLoadedOnce = true;
        renderAggPicker();
        updateStats();
        renderChecklist();
      }).catch(function() {});
      loadAggSubs();
    }

    function renderPresets() {
      var list = document.getElementById('presets-list');
      if (presets.length === 0) {
        list.innerHTML = '<div style="color:var(--text-dim);text-align:center;padding:1.5rem 0;font-size:.875rem;">No presets configured. Add one to get started.</div>';
        return;
      }
      list.innerHTML = presets.map(function(p) {
        var preview = p.endpoints.slice(0, 3).map(function(e) { return e.ip + ':' + e.port; }).join(', ');
        if (p.endpoints.length > 3) preview += ' +' + (p.endpoints.length - 3) + ' more';
        var orderNote = Array.isArray(p.preferredOrder) && p.preferredOrder.length > 1
          ? ' <span class="tchip tchip-ok" title="Custom order from reachability test">ordered</span>'
          : '';
        return '<div class="preset-row">' +
          '<div class="preset-info">' +
            '<div class="preset-name">' + escHtml(p.name) + orderNote + '</div>' +
            '<div class="preset-preview">' + escHtml(preview) + '</div>' +
          '</div>' +
          '<span class="preset-count">' + p.endpoints.length + ' ep</span>' +
          '<span class="preset-row-actions">' +
            '<button onclick="testLatency(\'' + escHtml(p.id) + '\')" class="preset-del preset-edit" aria-label="Test latency for ' + escHtml(p.name) + '">Latency</button>' +
            '<button onclick="editPreset(\'' + escHtml(p.id) + '\')" class="preset-del preset-edit" aria-label="Edit preset ' + escHtml(p.name) + '">Edit</button>' +
            '<button onclick="deletePreset(\'' + escHtml(p.id) + '\')" class="preset-del" aria-label="Delete preset ' + escHtml(p.name) + '">Delete</button>' +
          '</span>' +
        '</div>';
      }).join('');
    }

    /* =============== ENDPOINT REACHABILITY PROBE (B10) =============== */
    function probeEndpoint(host, port) {
      return new Promise(function(resolve) {
        var ctrl = new AbortController();
        var timedOut = false;
        var timer = setTimeout(function() {
          timedOut = true;
          ctrl.abort();
        }, PROBE_TIMEOUT_MS);
        var start = performance.now();
        fetch('https://' + host + ':' + port + '/', { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
          .then(function() {
            clearTimeout(timer);
            resolve({ ms: Math.round(performance.now() - start), timeout: false });
          })
          .catch(function() {
            clearTimeout(timer);
            var ms = Math.round(performance.now() - start);
            resolve({ ms: timedOut || ms >= PROBE_TIMEOUT_MS ? -1 : ms, timeout: timedOut });
          });
      });
    }

    async function testLatency(id) {
      var p = null;
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === id) { p = presets[i]; break; }
      }
      if (!p) return toast('Preset not found', 'error');
      if (!p.endpoints.length) return toast('Preset has no endpoints', 'error');
      latencyState = { presetId: id, preset: p, results: [], probing: true };
      document.getElementById('lat-tbody').innerHTML = '';
      document.getElementById('lat-status').textContent = 'Probing ' + p.endpoints.length + ' endpoint' + (p.endpoints.length !== 1 ? 's' : '') + '...';
      document.getElementById('btn-save-order').disabled = true;
      document.getElementById('modal-latency').classList.remove('hidden');
      var probes = p.endpoints.map(function(ep, idx) {
        return probeEndpoint(String(ep.ip).replace(/^\[|\]$/g, ''), ep.port).then(function(r) {
          return { idx: idx, label: ep.ip + ':' + ep.port, ms: r.ms, timeout: r.timeout };
        });
      });
      var settled = await Promise.all(probes);
      if (latencyState.presetId !== id) return;
      latencyState.results = settled;
      latencyState.probing = false;
      renderLatencyTable();
    }

    function renderLatencyTable(sorted) {
      var rows = latencyState.results.slice();
      if (sorted !== false) {
        rows.sort(function(a, b) {
          if (a.timeout !== b.timeout) return a.timeout ? 1 : -1;
          return a.ms - b.ms;
        });
      }
      var body = document.getElementById('lat-tbody');
      body.innerHTML = rows.map(function(r) {
        var msCell = r.timeout ? '<span style="color:#ef4444;">timeout</span>' : String(r.ms);
        return '<tr><td>' + escHtml(r.label) + '</td><td style="text-align:right;">' + msCell + '</td></tr>';
      }).join('');
      document.getElementById('lat-status').textContent = 'Sorted by measured time. Saving writes this order into the preset as preferred order.';
      document.getElementById('btn-save-order').disabled = false;
    }

    async function saveLatencyOrder() {
      if (!latencyState.presetId || latencyState.probing) return;
      var ordered = latencyState.results
        .filter(function(r) { return !r.timeout; })
        .sort(function(a, b) { return a.ms - b.ms; })
        .map(function(r) { return r.idx; });
      var timedOutIdx = latencyState.results
        .filter(function(r) { return r.timeout; })
        .sort(function(a, b) { return a.idx - b.idx; })
        .map(function(r) { return r.idx; });
      var btn = document.getElementById('btn-save-order');
      setLoading(btn, true);
      try {
        await api('/api/presets/' + latencyState.presetId, {
          method: 'PUT',
          body: { preferredOrder: ordered.concat(timedOutIdx) }
        });
        toast('Preferred endpoint order saved');
        closeModal('modal-latency');
        await loadSettings();
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    function setPresetFormVisible(visible) {
      document.getElementById('add-preset-form').classList.toggle('hidden', !visible);
    }

    function resetPresetForm(editingId) {
      editingPresetId = editingId || null;
      document.getElementById('preset-name').value = '';
      document.getElementById('preset-endpoints').innerHTML = '';
      document.getElementById('preset-bulk').value = '';
      document.getElementById('bulk-error').classList.add('hidden');
      document.getElementById('btn-save-preset').textContent = editingPresetId ? 'Update' : 'Save';
    }

    function makeEpRow(ip, port) {
      var row = document.createElement('div');
      row.className = 'ep-row';
      row.innerHTML =
        '<input type="text" placeholder="IP or domain" autocomplete="off" class="mini-input ep-ip">' +
        '<input type="number" placeholder="Port" min="1" max="65535" autocomplete="off" class="mini-input ep-port">' +
        '<button type="button" onclick="this.parentElement.remove()" class="ep-del" aria-label="Remove endpoint">&times;</button>';
      row.querySelector('.ep-ip').value = ip || '';
      row.querySelector('.ep-port').value = (port === undefined || port === null) ? '' : String(port);
      return row;
    }

    function showAddPresetForm() {
      resetPresetForm(null);
      setPresetFormVisible(true);
      addPresetEndpointRow();
      document.getElementById('preset-name').focus();
    }

    function editPreset(id) {
      var p = null;
      for (var i = 0; i < presets.length; i++) {
        if (presets[i].id === id) { p = presets[i]; break; }
      }
      if (!p) return toast('Preset not found', 'error');
      resetPresetForm(id);
      setPresetFormVisible(true);
      for (var j = 0; j < p.endpoints.length; j++) {
        document.getElementById('preset-endpoints').appendChild(makeEpRow(p.endpoints[j].ip, p.endpoints[j].port));
      }
      document.getElementById('preset-name').value = p.name;
      document.getElementById('preset-name').focus();
      document.getElementById('add-preset-form').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideAddPresetForm() {
      setPresetFormVisible(false);
      editingPresetId = null;
    }

    function addPresetEndpointRow() {
      document.getElementById('preset-endpoints').appendChild(makeEpRow('', ''));
    }

    function applyBulkEndpoints() {
      var ta = document.getElementById('preset-bulk');
      var errEl = document.getElementById('bulk-error');
      var res = parseEndpointBulk(ta.value);
      errEl.classList.add('hidden');
      if (res.endpoints.length === 0 && res.errors.length === 0) {
        errEl.textContent = 'Nothing to apply — enter one ip:port per line';
        errEl.classList.remove('hidden');
        return;
      }
      var container = document.getElementById('preset-endpoints');
      for (var i = 0; i < res.endpoints.length; i++) {
        container.appendChild(makeEpRow(res.endpoints[i].ip, res.endpoints[i].port));
      }
      if (res.errors.length > 0) {
        var parts = [];
        for (var k = 0; k < res.errors.length; k++) {
          parts.push('line ' + res.errors[k].line + ': ' + res.errors[k].error);
        }
        errEl.textContent = 'Rejected ' + res.errors.length + ' line' + (res.errors.length !== 1 ? 's' : '') + ' — ' + parts.join('; ');
        errEl.classList.remove('hidden');
        ta.value = '';
      } else {
        ta.value = '';
        toast(res.endpoints.length + ' endpoint' + (res.endpoints.length !== 1 ? 's' : '') + ' added to list');
      }
    }

    async function savePreset() {
      var name = document.getElementById('preset-name').value.trim();
      if (!name) return toast('Name is required', 'error');
      var rows = document.getElementById('preset-endpoints').children;
      var endpoints = [];
      for (var i = 0; i < rows.length; i++) {
        var ip = rows[i].querySelector('.ep-ip').value.trim();
        var port = parseInt(rows[i].querySelector('.ep-port').value, 10);
        if (!ip || !port) return toast('Fill all endpoint fields', 'error');
        endpoints.push({ ip: ip, port: port });
      }
      if (endpoints.length === 0) return toast('Add at least one endpoint', 'error');
      var btn = document.getElementById('btn-save-preset');
      setLoading(btn, true);
      try {
        if (editingPresetId) {
          await api('/api/presets/' + editingPresetId, { method: 'PUT', body: { name: name, endpoints: endpoints } });
          toast('Preset updated');
        } else {
          await api('/api/presets', { method: 'POST', body: { name: name, endpoints: endpoints } });
          toast('Preset created');
        }
        hideAddPresetForm();
        await loadSettings();
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    async function deletePreset(id) {
      var ok = await confirmDialog('Delete Preset', 'This preset will be removed. Accounts using it will keep their current endpoints until reassigned.', true);
      if (!ok) return;
      try {
        await api('/api/presets/' + id, { method: 'DELETE' });
        toast('Preset deleted');
        await loadSettings();
      } catch (e) { toast(e.message, 'error'); }
    }

    /* =============== AMNEZIA =============== */
    function validateAmnezia() {
      var jc = parseInt(document.getElementById('amn-jc').value, 10);
      var jmin = parseInt(document.getElementById('amn-jmin').value, 10);
      var jmax = parseInt(document.getElementById('amn-jmax').value, 10);
      var s1 = parseInt(document.getElementById('amn-s1').value, 10);
      var s2 = parseInt(document.getElementById('amn-s2').value, 10);
      var h1 = parseInt(document.getElementById('amn-h1').value, 10);
      var h2 = parseInt(document.getElementById('amn-h2').value, 10);
      var h3 = parseInt(document.getElementById('amn-h3').value, 10);
      var h4 = parseInt(document.getElementById('amn-h4').value, 10);
      var maxU32 = 2147483647;
      var errEl = document.getElementById('amn-error');

      if (isNaN(jc) || jc < 0 || jc > 128) { errEl.textContent = 'Jc must be 0-128'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(jmin) || jmin < 0 || jmin > 1280) { errEl.textContent = 'Jmin must be 0-1280'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(jmax) || jmax < 0 || jmax > 1280) { errEl.textContent = 'Jmax must be 0-1280'; errEl.classList.remove('hidden'); return null; }
      if (jmin > jmax) { errEl.textContent = 'Jmin must be <= Jmax'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(s1) || s1 < 0 || s1 > 255) { errEl.textContent = 'S1 must be 0-255'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(s2) || s2 < 0 || s2 > 255) { errEl.textContent = 'S2 must be 0-255'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(h1) || h1 < 0 || h1 > maxU32) { errEl.textContent = 'H1 must be 0-2147483647'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(h2) || h2 < 0 || h2 > maxU32) { errEl.textContent = 'H2 must be 0-2147483647'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(h3) || h3 < 0 || h3 > maxU32) { errEl.textContent = 'H3 must be 0-2147483647'; errEl.classList.remove('hidden'); return null; }
      if (isNaN(h4) || h4 < 0 || h4 > maxU32) { errEl.textContent = 'H4 must be 0-2147483647'; errEl.classList.remove('hidden'); return null; }

      errEl.classList.add('hidden');
      return { Jc: jc, Jmin: jmin, Jmax: jmax, S1: s1, S2: s2, H1: h1, H2: h2, H3: h3, H4: h4 };
    }

    async function saveAmnezia() {
      var body = validateAmnezia();
      if (!body) return;
      var btn = document.getElementById('btn-save-amnezia');
      setLoading(btn, true);
      try {
        await api('/api/settings/amnezia', { method: 'PUT', body: body });
        toast('Amnezia defaults saved');
        globalAmnezia = body;
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    /* =============== BACKUP & RESTORE (B10) =============== */
    function togglePwInput(inputId, btn) {
      var inp = document.getElementById(inputId);
      var show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
    }

    function showBackupExport() {
      document.getElementById('backup-export-password').value = '';
      document.getElementById('backup-export-error').classList.add('hidden');
      document.getElementById('modal-backup-export').classList.remove('hidden');
      document.getElementById('backup-export-password').focus();
    }

    async function doBackupExport() {
      var password = document.getElementById('backup-export-password').value;
      var errEl = document.getElementById('backup-export-error');
      errEl.classList.add('hidden');
      if (password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters';
        errEl.classList.remove('hidden');
        return;
      }
      var btn = document.getElementById('btn-do-export');
      setLoading(btn, true);
      try {
        var res = await fetch('/api/backup/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password })
        });
        var ctype = res.headers.get('content-type') || '';
        if (res.status === 401 || ctype.indexOf('text/html') !== -1) {
          sessionExpired();
          return;
        }
        if (!res.ok) {
          var data = await res.json().catch(function() { return {}; });
          throw new Error(data.error || 'Export failed');
        }
        var blob = await res.blob();
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'backup.wgenc';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
        closeModal('modal-backup-export');
        toast('Backup downloaded — store it and the password safely');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
      setLoading(btn, false);
    }

    function arrayBufferToBase64(buffer) {
      var bytes = new Uint8Array(buffer);
      var binary = '';
      var chunk = 0x8000;
      for (var i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
      }
      return btoa(binary);
    }

    async function importBackup() {
      var fileInput = document.getElementById('backup-import-file');
      var password = document.getElementById('backup-import-password').value;
      var mode = document.getElementById('backup-mode').value;
      if (!fileInput.files || !fileInput.files[0]) return toast('Choose a backup file first', 'error');
      if (password.length < 8) return toast('Password must be at least 8 characters', 'error');
      var ok = await confirmDialog(
        'Restore Backup',
        mode === 'overwrite'
          ? 'Incoming accounts will OVERWRITE existing ones with the same ID. This file contains all private keys — treat it like a password manager export.'
          : 'Existing accounts with the same ID are kept. This file contains all private keys — treat it like a password manager export.',
        mode === 'overwrite'
      );
      if (!ok) return;
      var btn = document.getElementById('btn-backup-import');
      setLoading(btn, true);
      try {
        var buffer = await fileInput.files[0].arrayBuffer();
        var report = await api('/api/backup/import', {
          method: 'POST',
          body: { blob: arrayBufferToBase64(buffer), password: password, mode: mode }
        });
        var msg = 'Restored ' + report.imported + ' account(s)';
        if (report.skipped) msg += ', skipped ' + report.skipped;
        if (report.errors && report.errors.length) msg += ', ' + report.errors.length + ' error(s)';
        toast(msg, report.errors && report.errors.length ? 'error' : 'success');
        fileInput.value = '';
        document.getElementById('backup-import-password').value = '';
        accountsLoadedOnce = false;
        navigate('accounts');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    /* =============== GROUP SUBSCRIPTIONS (B10) =============== */
    function distinctAccountGroups() {
      var seen = {};
      var out = [];
      for (var i = 0; i < accounts.length; i++) {
        var g = accounts[i].group;
        if (g && !seen[g]) { seen[g] = true; out.push(g); }
      }
      out.sort();
      return out;
    }

    function renderAggPicker() {
      var row = document.getElementById('agg-groups-row');
      if (!row) return;
      var groups = distinctAccountGroups();
      aggSelectedGroups = aggSelectedGroups.filter(function(g) { return groups.indexOf(g) !== -1; });
      if (!groups.length) {
        row.innerHTML = '<span class="picker-hint" style="display:inline;">No account has a group tag yet.</span>';
        return;
      }
      row.innerHTML = groups.map(function(g) {
        var active = aggSelectedGroups.indexOf(g) !== -1;
        return '<button type="button" class="pill' + (active ? ' pill-active' : '') + '" onclick="toggleAggGroup(\'' + escHtml(g) + '\')" aria-pressed="' + active + '">' + escHtml(g) + '</button>';
      }).join('');
    }

    function toggleAggGroup(name) {
      var idx = aggSelectedGroups.indexOf(name);
      if (idx === -1) aggSelectedGroups.push(name); else aggSelectedGroups.splice(idx, 1);
      renderAggPicker();
    }

    async function createAggSub() {
      var errEl = document.getElementById('agg-error');
      errEl.classList.add('hidden');
      if (!aggSelectedGroups.length) {
        errEl.textContent = 'Select at least one group';
        errEl.classList.remove('hidden');
        return;
      }
      var label = document.getElementById('agg-label').value.trim();
      var expiryRaw = document.getElementById('agg-expiry').value;
      var btn = document.getElementById('btn-agg-create');
      setLoading(btn, true);
      try {
        var record = await api('/api/agg', {
          method: 'POST',
          body: {
            groups: aggSelectedGroups.slice(),
            label: label || null,
            expiresAt: expiryRaw ? new Date(expiryRaw + 'T23:59:59').toISOString() : null
          }
        });
        aggSubs.push(record);
        document.getElementById('agg-label').value = '';
        document.getElementById('agg-expiry').value = '';
        renderAggSubs();
        toast('Group subscription created');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
      setLoading(btn, false);
    }

    async function loadAggSubs() {
      try {
        aggSubs = await api('/api/agg');
      } catch (e) { aggSubs = []; }
      renderAggSubs();
    }

    function renderAggSubs() {
      var list = document.getElementById('agg-list');
      if (!list) return;
      if (!aggSubs.length) {
        list.innerHTML = '<div style="color:var(--text-dim);font-size:.875rem;">No group subscriptions yet.</div>';
        return;
      }
      list.innerHTML = aggSubs.map(function(r) {
        var state = r.tokenMeta && r.tokenMeta.disabled === true ? 'revoked'
          : (r.tokenMeta && typeof r.tokenMeta.expiresAt === 'string' && !isNaN(Date.parse(r.tokenMeta.expiresAt)) && Date.parse(r.tokenMeta.expiresAt) <= Date.now() ? 'expired' : 'active');
        var cached = aggUrlsCache[r.token] || {};
        var format = cached.format || 'singbox';
        aggUrlsCache[r.token] = { format: format };
        var url = location.origin + '/sub/' + r.token + '/' + format;
        var opts = SUB_FORMATS.map(function(f) {
          return '<option value="' + f.key + '"' + (f.key === format ? ' selected' : '') + '>' + escHtml(f.label) + '</option>';
        }).join('');
        var deepLinks = '';
        var fmtDef = null;
        for (var fi = 0; fi < SUB_FORMATS.length; fi++) {
          if (SUB_FORMATS[fi].key === format) { fmtDef = SUB_FORMATS[fi]; break; }
        }
        if (fmtDef) {
          for (var di = 0; di < fmtDef.dl.length; di++) {
            var href = deepLinkUrl(url, fmtDef.dl[di]);
            if (!href) continue;
            var lbl = DL_LABELS[fmtDef.dl[di]] || 'Open in app';
            deepLinks += '<a href="' + escHtml(href) + '" title="' + escHtml(lbl) + '" class="icon-btn" aria-label="' + escHtml(lbl) + '">' + ICON_OPEN + '</a>';
          }
        }
        return '<div class="sub-row spot">' +
          '<span class="fmt-box">' + FMT_ICONS.uri + '</span>' +
          '<div class="sub-info">' +
            '<div class="sub-name">' + escHtml(r.label || r.groups.join(', ')) +
              ' <span class="tchip">' + escHtml(r.groups.join(', ')) + '</span>' +
              (r.tokenMeta && typeof (r.tokenMeta || {}).expiresAt === 'string' && !isNaN(Date.parse(r.tokenMeta.expiresAt)) ? tokenExpiryChip(r) : '') +
              (state !== 'active' ? ' <span class="tchip tchip-red">' + state + '</span>' : '') +
            '</div>' +
            '<div class="sub-url">' + escHtml(url) + '</div>' +
          '</div>' +
          '<select onchange="onAggFormat(\'' + escHtml(r.token) + '\', this.value)" class="mini-input" style="max-width:11rem;" aria-label="Subscription format">' + opts + '</select>' +
          '<button onclick="copyToClipboard(aggUrl(\'' + escHtml(r.token) + '\'), \'URL copied!\')" title="Copy URL" class="icon-btn" aria-label="Copy URL">' + ICON_COPY + '</button>' +
          '<button onclick="openQrUrl(aggUrl(\'' + escHtml(r.token) + '\'))" title="Show QR code" class="icon-btn" aria-label="Show QR code">' + ICON_QR + '</button>' +
          deepLinks +
          '<a href="' + escHtml(url) + '" target="_blank" rel="noopener" title="Open URL" class="icon-btn" aria-label="Open URL">' + ICON_OPEN + '</a>' +
          '<button onclick="revokeAggSub(\'' + escHtml(r.token) + '\')" title="Revoke group subscription" class="icon-btn" aria-label="Revoke group subscription" style="color:#ef4444;">&times;</button>' +
        '</div>';
      }).join('');
    }

    function aggUrl(token) {
      var fmt = aggUrlsCache[token] ? aggUrlsCache[token].format : 'singbox';
      return location.origin + '/sub/' + token + '/' + fmt;
    }

    function onAggFormat(token, format) {
      aggUrlsCache[token] = { format: format };
      renderAggSubs();
    }

    async function revokeAggSub(token) {
      var ok = await confirmDialog('Revoke Group Subscription', 'All client URLs using this group subscription token will stop working immediately.', true);
      if (!ok) return;
      try {
        await api('/api/agg/' + token, { method: 'DELETE' });
        aggSubs = aggSubs.filter(function(r) { return r.token !== token; });
        delete aggUrlsCache[token];
        renderAggSubs();
        toast('Group subscription revoked');
      } catch (e) { toast(e.message, 'error'); }
    }

    /* =============== PER-ACCOUNT AMNEZIA EDITOR =============== */
    var AMN_ACCT_IDS = { Jc: 'aac-jc', Jmin: 'aac-jmin', Jmax: 'aac-jmax', S1: 'aac-s1', S2: 'aac-s2', H1: 'aac-h1', H2: 'aac-h2', H3: 'aac-h3', H4: 'aac-h4' };

    function amnAcctFields() {
      var out = [];
      for (var k in AMN_ACCT_IDS) out.push(document.getElementById(AMN_ACCT_IDS[k]));
      return out;
    }

    function amnFillFields(values) {
      for (var k in AMN_ACCT_IDS) {
        document.getElementById(AMN_ACCT_IDS[k]).value = values && values[k] !== undefined && values[k] !== null ? values[k] : '';
      }
    }

    function amnCollectValues() {
      var v = {};
      for (var k in AMN_ACCT_IDS) v[k] = document.getElementById(AMN_ACCT_IDS[k]).value.trim();
      return v;
    }

    function amnSetEnabled(enabled) {
      var fields = amnAcctFields();
      for (var i = 0; i < fields.length; i++) fields[i].disabled = !enabled;
    }

    function amnShowError(msg) {
      var el = document.getElementById('amn-acct-error');
      if (!msg) { el.classList.add('hidden'); return; }
      el.textContent = msg;
      el.classList.remove('hidden');
    }

    function amnEffectiveText() {
      if (!globalAmnezia) return '';
      return 'Global defaults — Jc ' + globalAmnezia.Jc + ' · Jmin ' + globalAmnezia.Jmin + ' · Jmax ' + globalAmnezia.Jmax +
        ' · S1 ' + globalAmnezia.S1 + ' · S2 ' + globalAmnezia.S2 +
        ' · H1 ' + globalAmnezia.H1 + ' · H2 ' + globalAmnezia.H2 + ' · H3 ' + globalAmnezia.H3 + ' · H4 ' + globalAmnezia.H4;
    }

    function renderAccountAmneziaState() {
      var overrides = currentAccount && currentAccount.amnezia_overrides;
      var on = !!overrides;
      document.getElementById('amn-acct-toggle').checked = on;
      document.getElementById('amn-acct-effective').textContent =
        amnEffectiveText() + (on ? '  →  override active' : '  →  using globals');
      amnFillFields(on ? overrides : globalAmnezia);
      amnSetEnabled(on);
      amnShowError(null);
    }

    async function loadAccountAmnezia() {
      try {
        if (!globalAmnezia) globalAmnezia = await api('/api/settings/amnezia');
      } catch (e) {
        toast(e.message, 'error');
        return;
      }
      renderAccountAmneziaState();
    }

    function amnToggleOverride(on) {
      amnShowError(null);
      if (!on) {
        amnFillFields(globalAmnezia);
        amnSetEnabled(false);
        return;
      }
      amnFillFields(currentAccount.amnezia_overrides || globalAmnezia);
      amnSetEnabled(true);
      document.getElementById('aac-jc').focus();
    }

    function amnApplyPreset(kind) {
      var p = AMN_PRESETS[kind];
      if (!p) return;
      document.getElementById('amn-acct-toggle').checked = true;
      amnFillFields(p);
      amnSetEnabled(true);
      amnShowError(null);
    }

    async function persistAccountAmnezia(overrides) {
      var btn = document.getElementById('btn-save-amn-acct');
      setLoading(btn, true);
      try {
        await api('/api/account/' + currentAccountId, { method: 'PUT', body: { amnezia_overrides: overrides } });
        currentAccount.amnezia_overrides = overrides;
        renderAccountAmneziaState();
        toast(overrides ? 'Amnezia overrides saved' : 'Reverted to global defaults');
      } catch (e) {
        toast(e.message, 'error');
      }
      setLoading(btn, false);
    }

    async function saveAccountAmnezia() {
      var on = document.getElementById('amn-acct-toggle').checked;
      if (!on) return persistAccountAmnezia(null);
      var vals = amnCollectValues();
      var err = validateAmneziaValues(vals);
      if (err) return amnShowError(err);
      var numeric = {};
      for (var k in vals) numeric[k] = Number(vals[k]);
      persistAccountAmnezia(numeric);
    }

    function amnResetToGlobal() {
      document.getElementById('amn-acct-toggle').checked = false;
      persistAccountAmnezia(null);
    }

    /* =============== KEYBOARD SHORTCUTS & FOCUS TRAP =============== */
    function getOpenOverlay() {
      var overlays = document.querySelectorAll('.overlay');
      for (var i = 0; i < overlays.length; i++) {
        if (!overlays[i].classList.contains('hidden')) return overlays[i];
      }
      return null;
    }

    function focusTrapTargets(overlay) {
      var sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
      var nodes = overlay.querySelectorAll(sel);
      var out = [];
      for (var i = 0; i < nodes.length; i++) {
        if (!nodes[i].disabled && nodes[i].offsetParent !== null) out.push(nodes[i]);
      }
      return out;
    }

    document.addEventListener('keydown', function(e) {
      var overlay = getOpenOverlay();
      if (!overlay) return;
      if (e.key === 'Escape') {
        if (overlay.id === 'modal-confirm') confirmAction(false);
        else closeModal(overlay.id);
        return;
      }
      if (e.key === 'Tab') {
        var list = focusTrapTargets(overlay);
        if (list.length === 0) return;
        var first = list[0];
        var last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !overlay.contains(document.activeElement))) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    /* =============== SPOTLIGHT =============== */
    var spotlightDisabled = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (!spotlightDisabled) {
      document.addEventListener('pointermove', function(e) {
        var t = e.target && e.target.closest ? e.target.closest('.spot') : null;
        if (!t) return;
        var r = t.getBoundingClientRect();
        t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        t.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    }

    /* =============== IMPORT FILE INPUT =============== */
    function isZipBytes(bytes) {
      return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07);
    }

    async function inflateRaw(bytes) {
      var ds = new DecompressionStream('deflate-raw');
      var stream = new Blob([bytes]).stream().pipeThrough(ds);
      var buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    }

    function loadImportFile(file) {
      var ta = document.getElementById('import-config');
      if (!ta || !file) return;
      var name = (file.name || '').toLowerCase();
      var reader = new FileReader();
      reader.onload = function() {
        var finish = function(text, label) {
          ta.value = text;
          toast('Loaded ' + (label || file.name));
        };
        var fail = function(msg) {
          toast(msg, 'error');
        };
        if (name.indexOf('.zip') !== -1 || isZipBytes(new Uint8Array(reader.result))) {
          var bytes = new Uint8Array(reader.result);
          var entry = zipFindEntry(bytes, function(n) { return n.toLowerCase().indexOf('.conf') !== -1; });
          if (!entry) { fail('No .conf file found inside the ZIP'); return; }
          if (entry.method === 0) {
            finish(new TextDecoder().decode(entry.data), entry.name);
          } else if (entry.method === 8 && typeof DecompressionStream !== 'undefined') {
            inflateRaw(entry.data).then(function(raw) {
              finish(new TextDecoder().decode(raw), entry.name);
            }).catch(function() {
              fail('Failed to unzip ' + entry.name);
            });
          } else {
            fail('Unsupported ZIP compression for ' + entry.name);
          }
        } else {
          finish(String(reader.result));
        }
      };
      if (name.indexOf('.zip') !== -1) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
    }

    function wireImportDrop() {
      var zone = document.getElementById('import-drop');
      var input = document.getElementById('import-file');
      if (!zone || !input) return;
      ['dragenter', 'dragover'].forEach(function(ev) {
        zone.addEventListener(ev, function(e) {
          e.preventDefault();
          zone.classList.add('drag');
        });
      });
      ['dragleave', 'drop'].forEach(function(ev) {
        zone.addEventListener(ev, function(e) {
          e.preventDefault();
          zone.classList.remove('drag');
        });
      });
      zone.addEventListener('drop', function(e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) loadImportFile(f);
      });
      input.addEventListener('change', function() {
        if (input.files && input.files[0]) {
          loadImportFile(input.files[0]);
          input.value = '';
        }
      });
    }

    /* =============== INIT =============== */
    (function() {
      wireImportDrop();
      loadWarpStatus();
      renderChecklist();
      var tokEl = document.getElementById('detail-token');
      tokEl.addEventListener('click', toggleTokenReveal);
      tokEl.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleTokenReveal();
        }
      });
    })();
    window.addEventListener('hashchange', applyRoute);
    applyRoute();
  </script>
</body>
</html>`;


// --- KV Helpers ---

let _kvInitialized = false;
async function initializeKV(env) {
  if (_kvInitialized) return;
  try {
    const [globalRaw, presetsRaw] = await Promise.all([
      env.WARP_KV.get('settings:global'),
      env.WARP_KV.get('presets')
    ]);
    if (!(globalRaw && presetsRaw)) {
      try {
        if (!presetsRaw) await env.WARP_KV.put('presets', JSON.stringify(DEFAULT_PRESETS));
        if (!globalRaw) await env.WARP_KV.put('settings:global', JSON.stringify(DEFAULT_SETTINGS_GLOBAL));
      } catch {
        // Non-fatal: handlers fall back to DEFAULT_PRESETS / DEFAULT_SETTINGS_GLOBAL
      }
    }
    _kvInitialized = true;
  } catch {
  }
}

// --- Safe KV Helpers ---

function kvKeyClass(key) {
  return String(key).split(':')[0];
}

function logKvFailure(op, key) {
  console.error(JSON.stringify({ event: 'kv_error', op, key_class: kvKeyClass(key) }));
}

async function kvGet(env, key, opts) {
  try {
    return await env.WARP_KV.get(key, opts);
  } catch {
    logKvFailure('get', key);
    return null;
  }
}

async function kvPut(env, key, value, opts) {
  try {
    await env.WARP_KV.put(key, value, opts);
    return true;
  } catch {
    logKvFailure('put', key);
    return false;
  }
}

async function kvDelete(env, key) {
  try {
    await env.WARP_KV.delete(key);
    return true;
  } catch {
    logKvFailure('delete', key);
    return false;
  }
}

// --- Session Helpers ---

const SESSION_COOKIE_RE = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`);

function parseCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(SESSION_COOKIE_RE);
  return match ? match[1] : null;
}

function sessionCookie(token, maxAge, isHttps) {
  const secure = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly${secure}; SameSite=Strict; Max-Age=${maxAge}; Path=/`;
}

function clearSessionCookie(isHttps) {
  const secure = isHttps ? '; Secure' : '';
  return `${SESSION_COOKIE}=; HttpOnly${secure}; SameSite=Strict; Max-Age=0; Path=/`;
}

async function validateSession(request, env) {
  const token = parseCookie(request);
  if (!token) return null;

  const data = await kvGet(env, `session:${token}`, { type: 'json' });
  if (!data) return null;
  if (Date.now() > data.expires_at) {
    await kvDelete(env, `session:${token}`);
    return null;
  }
  return token;
}

async function createSession(env) {
  const token = crypto.randomUUID();
  const expires_at = Date.now() + SESSION_DURATION_MS;
  const stored = await kvPut(env, `session:${token}`, JSON.stringify({ expires_at }), { expirationTtl: SESSION_TTL_SECONDS });
  if (!stored) return null;
  return { token, expires_at };
}

async function destroySession(token, env) {
  await kvDelete(env, `session:${token}`);
}

// --- HTML Response Helpers ---

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: location }
  });
}

function jsonResponse(data, status = 200, options = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff', 'X-WG-Version': VERSION };
  // Subscription responses manage their own caching headers — skip no-store there
  if (!options.skipNoStore) headers['Cache-Control'] = 'no-store';
  if (options.headers) Object.assign(headers, options.headers);
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400, options = {}) {
  return jsonResponse({ error: message }, status, options);
}

function goneResponse(message) {
  return new Response(message, {
    status: 410,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// --- Base64 Helpers ---

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// --- Password Hashing (PBKDF2 via WebCrypto; bcryptjs kept only for legacy migration) ---

async function pbkdf2DeriveBits(password, saltBytes, iterations) {
  const pwBytes = textEncoderEncode(password);
  const key = await crypto.subtle.importKey('raw', pwBytes, 'PBKDF2', false, ['deriveBits']);
  return await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: saltBytes, iterations },
    key,
    PBKDF2_HASH_BITS
  );
}

function constantTimeEquals(a, b) {
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    diff |= (a[i] || 0) ^ (b[i] || 0);
  }
  return diff === 0;
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const bits = await pbkdf2DeriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password, stored) {
  // Legacy bcrypt hash ($2...) — verify once, caller migrates to PBKDF2 on success
  if (typeof stored === 'string' && stored.startsWith('$2')) {
    const valid = await bcrypt.compare(password, stored);
    return { valid, migratedHash: valid ? await hashPassword(password) : null };
  }

  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return { valid: false };
  const iterations = parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 1) return { valid: false };
  let saltBytes, storedHash;
  try {
    saltBytes = base64ToBytes(parts[2]);
    storedHash = base64ToBytes(parts[3]);
  } catch {
    return { valid: false };
  }
  const bits = new Uint8Array(await pbkdf2DeriveBits(password, saltBytes, iterations));
  return { valid: constantTimeEquals(bits, storedHash) };
}

// --- Keypair Generation (Task 5) ---

function generateKeypair() {
  const privateKeyBytes = x25519.utils.randomPrivateKey();
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);
  return {
    privateKey: bytesToBase64(privateKeyBytes),
    publicKey: bytesToBase64(publicKeyBytes)
  };
}

function derivePublicKey(privateKeyB64) {
  const privateKeyBytes = base64ToBytes(privateKeyB64);
  const publicKeyBytes = x25519.getPublicKey(privateKeyBytes);
  return bytesToBase64(publicKeyBytes);
}

// --- Encrypted Backup (AES-GCM, PBKDF2 key) ---

async function encryptBackupJson(jsonString, password) {
  const salt = crypto.getRandomValues(new Uint8Array(BACKUP_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(BACKUP_IV_BYTES));
  const bits = await pbkdf2DeriveBits(password, salt, PBKDF2_ITERATIONS);
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, textEncoderEncode(jsonString));
  const magic = textEncoderEncode(BACKUP_MAGIC);
  const out = new Uint8Array(magic.length + salt.length + iv.length + ciphertext.byteLength);
  let off = 0;
  out.set(magic, off); off += magic.length;
  out.set(salt, off); off += salt.length;
  out.set(iv, off); off += iv.length;
  out.set(new Uint8Array(ciphertext), off);
  return out;
}

async function decryptBackupBytes(bytes, password) {
  try {
    if (!(bytes instanceof Uint8Array)) return { error: 'Not a valid backup file' };
    const ivStart = BACKUP_MAGIC.length + BACKUP_SALT_BYTES;
    const ctStart = ivStart + BACKUP_IV_BYTES + 16;
    if (bytes.length < ctStart) return { error: 'Not a valid backup file' };
    const magic = new TextDecoder().decode(bytes.slice(0, BACKUP_MAGIC.length));
    if (magic !== BACKUP_MAGIC) return { error: 'Not a valid backup file' };
    const salt = bytes.slice(BACKUP_MAGIC.length, ivStart);
    const iv = bytes.slice(ivStart, ivStart + BACKUP_IV_BYTES);
    const bits = await pbkdf2DeriveBits(password, salt, PBKDF2_ITERATIONS);
    const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, bytes.slice(ivStart + BACKUP_IV_BYTES));
    return { json: new TextDecoder().decode(plain) };
  } catch {
    return { error: 'Decryption failed — wrong password or corrupted file' };
  }
}

// --- Validation Helpers ---

function validateName(name) {
  if (!name || typeof name !== 'string') return 'Account name required';
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Account name required';
  if (trimmed.length > 100) return 'Account name too long (max 100)';
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return 'Account name contains invalid characters';
  if (/[<>]/.test(trimmed)) return 'Account name contains invalid characters';
  return null;
}

function validateBase64Key(value, fieldName) {
  if (!value) return `${fieldName} required`;
  if (typeof value !== 'string' || /\s/.test(value) || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return `Invalid ${fieldName} (must be base64)`;
  }
  try {
    const bytes = base64ToBytes(value);
    if (bytes.length !== 32) return `Invalid ${fieldName} (must be 32 bytes)`;
  } catch {
    return `Invalid ${fieldName} (must be base64)`;
  }
  return null;
}

function sanitizeTokenLabel(label) {
  return String(label).replace(/[\x00-\x1f\x7f<>]/g, '').trim();
}

function tokenStatus(account, now) {
  const ref = now === undefined || now === null
    ? new Date()
    : (now instanceof Date ? now : new Date(now));
  const meta = account && typeof account === 'object' ? account.tokenMeta : null;
  if (!meta || typeof meta !== 'object') return { state: 'active' };
  if (meta.disabled === true) return { state: 'revoked' };
  if (typeof meta.expiresAt === 'string') {
    const expiryMs = Date.parse(meta.expiresAt);
    if (!Number.isNaN(expiryMs)) {
      if (expiryMs <= ref.getTime()) return { state: 'expired', msRemaining: 0 };
      return { state: 'active', msRemaining: expiryMs - ref.getTime() };
    }
  }
  return { state: 'active' };
}

function validateTokenMeta(meta, now, current) {
  if (meta === undefined || meta === null) return null;
  if (typeof meta !== 'object' || Array.isArray(meta)) return 'tokenMeta must be an object';
  const ref = now === undefined || now === null ? new Date() : (now instanceof Date ? now : new Date(now));
  const cur = current && typeof current === 'object' ? current : {};
  if (meta.label !== undefined && meta.label !== null) {
    if (typeof meta.label !== 'string') return 'Token label must be a string';
    const label = sanitizeTokenLabel(meta.label);
    if (label.length < 1 || label.length > 100) return 'Token label must be 1-100 characters';
  }
  if (meta.expiresAt !== undefined && meta.expiresAt !== null) {
    if (typeof meta.expiresAt !== 'string') return 'Expiry date must be an ISO date string or null';
    const expiryMs = Date.parse(meta.expiresAt);
    if (Number.isNaN(expiryMs)) return 'Expiry date must be a valid ISO date';
    if (cur.expiresAt !== meta.expiresAt && expiryMs <= ref.getTime()) {
      return 'Expiry date must be in the future';
    }
  }
  if (meta.disabled !== undefined && meta.disabled !== null && typeof meta.disabled !== 'boolean') {
    return 'Disabled flag must be true or false';
  }
  return null;
}

// --- Warp API Client (Task 6) ---

function validateWarpAddresses(v4, v6) {
  if (typeof v4 !== 'string' || !v4 || typeof v6 !== 'string' || !v6) {
    return 'interface addresses missing or not strings';
  }
  if (!/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.test(v4)) {
    return `malformed IPv4 address "${v4}"`;
  }
  const [v4Addr, v4Cidr] = v4.split('/');
  if (v4Addr.split('.').some(o => Number(o) > 255) || Number(v4Cidr) > 32) {
    return `malformed IPv4 address "${v4}"`;
  }
  if (!v6.includes(':') || v6.length > 50 || !/^[0-9a-fA-F:./]+$/.test(v6)) {
    return `malformed IPv6 address "${v6}"`;
  }
  if (v6.includes(':::')) {
    return `malformed IPv6 address "${v6}"`;
  }
  if (v6.includes('/')) {
    const parts = v6.split('/');
    const cidrStr = parts[parts.length - 1];
    if (!/^\d+$/.test(cidrStr) || Number(cidrStr) > 128) {
      return `malformed IPv6 address "${v6}"`;
    }
    const addrPart = parts.slice(0, -1).join('/');
    if (!addrPart.includes(':')) {
      return `malformed IPv6 address "${v6}"`;
    }
  }
  return null;
}

function warpApiHeaders(env, extra = {}) {
  return {
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': (env && env.WARP_USER_AGENT) || DEFAULT_WARP_USER_AGENT,
    'CF-Client-Version': (env && env.WARP_CLIENT_VERSION) || DEFAULT_WARP_CLIENT_VERSION,
    ...extra
  };
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WARP_API_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerValue) {
  if (typeof headerValue !== 'string' || !headerValue.trim()) return null;
  const trimmed = headerValue.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    return seconds > 0 ? seconds * 1000 : null;
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    return delta > 0 ? delta : null;
  }
  return null;
}

function warpRetryDecision(statusOrNull, attempt, retryAfterHeader) {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= WARP_MAX_RETRIES) {
    return { retry: false, delayMs: 0 };
  }
  const networkError = statusOrNull === null || statusOrNull === undefined;
  const retryableStatus = !networkError &&
    (statusOrNull === 429 || (statusOrNull >= 500 && statusOrNull <= 599));
  if (!networkError && !retryableStatus) {
    return { retry: false, delayMs: 0 };
  }

  if (!networkError && (statusOrNull === 429 || statusOrNull === 503)) {
    const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
    if (retryAfterMs !== null) {
      return { retry: true, delayMs: Math.min(retryAfterMs, WARP_RETRY_CAP_MS) };
    }
  }

  const exponential = Math.min(WARP_RETRY_BASE_MS * Math.pow(2, attempt), WARP_RETRY_CAP_MS);
  const floorMs = Math.floor(exponential / 2);
  return { retry: true, delayMs: floorMs + Math.floor(Math.random() * (exponential - floorMs + 1)) };
}

function logUpstreamFailure(event, response) {
  const contentType = response.headers.get('content-type') || 'unknown';
  const lengthHeader = parseInt(response.headers.get('content-length'), 10);
  console.log(JSON.stringify({
    event,
    status: response.status,
    contentType,
    length: Number.isFinite(lengthHeader) ? lengthHeader : null
  }));
}

async function deleteWarpRegistration(env, deviceId, apiToken) {
  if (!deviceId || !apiToken) return;
  let response = null;
  try {
    response = await fetchWithTimeout(`${WARP_API_BASE}/reg/${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
      headers: warpApiHeaders(env, { Authorization: `Bearer ${apiToken}` })
    });
  } catch {
    response = null;
  }
  if (!response || !response.ok) {
    console.log(JSON.stringify({
      event: 'warp_orphan_delete_failed',
      idPrefix: String(deviceId).slice(0, 8),
      ...(response ? { status: response.status } : {})
    }));
  }
}

async function performWarpRegistration(env) {
  const { privateKey, publicKey } = generateKeypair();

  for (let attempt = 0; attempt <= WARP_MAX_RETRIES; attempt++) {
    let response;
    try {
      response = await fetchWithTimeout(`${WARP_API_BASE}/reg`, {
        method: 'POST',
        headers: warpApiHeaders(env),
        body: JSON.stringify({
          key: publicKey,
          install_id: '',
          fcm_token: '',
          tos: '2021-01-01T00:00:00.000Z',
          model: 'PC',
          type: 'Windows',
          locale: 'en_US'
        })
      });
    } catch (err) {
      const decision = warpRetryDecision(null, attempt, null);
      if (decision.retry) {
        await sleep(decision.delayMs);
        continue;
      }
      if (err.name === 'AbortError') {
        return { ok: false, error: 'Warp API timeout', status: 504, retryable: true };
      }
      return { ok: false, error: 'Warp API connection failed', status: 502, retryable: true };
    }

    const decision = warpRetryDecision(response.status, attempt, response.headers.get('Retry-After'));
    if (decision.retry) {
      try {
        if (response.body) await response.body.cancel();
      } catch {}
      await sleep(decision.delayMs);
      continue;
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      const cooldownSeconds = Math.max(1, Math.round(Math.min(retryAfterMs ?? 60000, WARP_RETRY_CAP_MS) / 1000));
      logUpstreamFailure('warp_register_rate_limited', response);
      return {
        ok: false,
        error: `Warp API rate limited, try again in about ${cooldownSeconds} seconds`,
        status: 429,
        retryable: true,
        retryAfterSeconds: cooldownSeconds
      };
    }
    if (response.status >= 500) {
      return { ok: false, error: 'Warp API error, try again later', status: 503, retryable: true };
    }
    if (!response.ok) {
      logUpstreamFailure('warp_register_rejected', response);
      return { ok: false, error: 'WARP registration failed', status: 502, retryable: false };
    }

    let data;
    try {
      data = await response.json();
    } catch {
      logUpstreamFailure('warp_register_invalid_json', response);
      return { ok: false, error: 'Warp API returned invalid JSON', status: 502, retryable: false };
    }

    const raw = (data && typeof data === 'object' && (data.result || data.data)) ? (data.result || data.data) : data;
    const candidateConfig = raw.config || raw.result?.config || raw.data?.config;
    const effectiveConfig = candidateConfig || (raw.interface && raw.peers ? raw : null);
    const config = effectiveConfig;
    const warpIdCandidate = typeof raw.id === 'string' ? raw.id : (typeof data.id === 'string' ? data.id : '');
    const warpTokenCandidate = typeof raw.token === 'string' ? raw.token : (typeof data.token === 'string' ? data.token : '');
    if (!config || !config.interface || !config.interface.addresses || !config.peers || !config.peers[0]) {
      console.log(JSON.stringify({
        event: 'warp_unexpected_structure',
        keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 20) : [],
        rawKeys: raw && typeof raw === 'object' ? Object.keys(raw).slice(0, 20) : [],
        hasConfig: !!candidateConfig
      }));
      await deleteWarpRegistration(env, warpIdCandidate, warpTokenCandidate);
      return { ok: false, error: 'Warp API returned unexpected response structure', status: 502, retryable: false };
    }

    const addrErr = validateWarpAddresses(config.interface.addresses.v4, config.interface.addresses.v6);
    if (addrErr) {
      console.log(JSON.stringify({ event: 'warp_malformed_addresses', error: addrErr }));
      await deleteWarpRegistration(env, warpIdCandidate, warpTokenCandidate);
      return { ok: false, error: 'Warp API returned unexpected response structure', status: 502, retryable: false };
    }

    // Decode client_id → reserved bytes (3 bytes, base64). [0,0,0] only when field absent.
    let reserved = [0, 0, 0];
    const clientIdRaw = config.client_id ?? config.clientId ?? config.ClientID ?? config.clientID;
    if (clientIdRaw && typeof clientIdRaw === 'string') {
      let rawBytes;
      try {
        rawBytes = base64ToBytes(clientIdRaw);
      } catch (err) {
        console.log(JSON.stringify({ event: 'warp_client_id_decode_failed' }));
        await deleteWarpRegistration(env, warpIdCandidate, warpTokenCandidate);
        return { ok: false, error: 'WARP registration failed', status: 502, retryable: false };
      }
      if (rawBytes.length !== 3) {
        console.log(JSON.stringify({ event: 'warp_client_id_bad_length', length: rawBytes.length }));
        await deleteWarpRegistration(env, warpIdCandidate, warpTokenCandidate);
        return { ok: false, error: 'WARP registration failed', status: 502, retryable: false };
      }
      reserved = [rawBytes[0], rawBytes[1], rawBytes[2]];
    }

    const peerEntry = config.peers[0] || {};
    const peerPublicKey = peerEntry.public_key ?? peerEntry.publicKey ?? peerEntry.PublicKey ?? WARP_PEER_PUBLIC_KEY;
    if (!peerEntry.public_key && !peerEntry.publicKey && !peerEntry.PublicKey) {
      console.log(JSON.stringify({ event: 'warp_peer_key_fallback' }));
    }

    return {
      ok: true,
      warpId: warpIdCandidate,
      warpToken: warpTokenCandidate,
      config: {
        private_key: privateKey,
        public_key: publicKey,
        addresses: {
          ipv4: config.interface.addresses.v4,
          ipv6: config.interface.addresses.v6
        },
        peer_public_key: peerPublicKey,
        mtu: WG_MTU,
        reserved
      }
    };
  }

  return { ok: false, error: 'Warp API connection failed', status: 502, retryable: true };
}

async function registerWarpAccount(env) {
  const result = await performWarpRegistration(env);
  const status = { ok: result.ok === true, checkedAt: new Date().toISOString() };
  if (!result.ok && result.error) status.lastError = String(result.error).slice(0, 200);
  await kvPut(env, 'settings:warpstatus', JSON.stringify(status));
  return result;
}

// --- Config Parsers (Task 7) ---

function parseAmneziaValue(raw) {
  const v = String(raw).trim();
  if (v.includes('-')) {
    if (/^\d+-\d+$/.test(v)) return v;
    return null;
  }
  if (!/^\d+$/.test(v)) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

const ALLOWED_INTERFACE_KEYS = new Set([
  'privatekey', 'address', 'dns', 'mtu', 'listenport',
  'jc', 'jmin', 'jmax', 's1', 's2', 's3', 's4', 'h1', 'h2', 'h3', 'h4', 'i1'
]);
const ALLOWED_PEER_KEYS = new Set([
  'publickey', 'presharedkey', 'allowedips', 'endpoint', 'persistentkeepalive', 'reserved', 'clientid'
]);

function parseWireGuardConf(text) {
  if (typeof text !== 'string') return { error: 'Invalid config: not a string' };
  if (text.length < 100) return { error: 'Invalid config (too short)' };
  if (text.length > 10240) return { error: 'Config too large (max 10KB)' };

  const sections = {};
  let currentSection = null;
  let hasInterface = false;
  let hasPeer = false;
  let skipSection = false;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      const name = sectionMatch[1].toLowerCase();
      skipSection = false;
      if (name === 'interface') {
        if (hasInterface) return { error: 'Invalid config: duplicate [Interface] section' };
        hasInterface = true;
        currentSection = 'interface';
        sections['interface'] = {};
      } else if (name === 'peer') {
        if (hasPeer) { skipSection = true; continue; }
        hasPeer = true;
        currentSection = 'peer';
        sections['peer'] = {};
      } else {
        currentSection = name;
        if (!sections[name]) sections[name] = {};
      }
      continue;
    }

    if (!currentSection || skipSection) continue;

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
      if (currentSection === 'interface' && !ALLOWED_INTERFACE_KEYS.has(key)) {
        return { error: `Invalid config: unknown key "${kvMatch[1]}" in [Interface]` };
      }
      if (currentSection === 'peer' && !ALLOWED_PEER_KEYS.has(key)) {
        return { error: `Invalid config: unknown key "${kvMatch[1]}" in [Peer]` };
      }
      const value = kvMatch[2].trim();
      sections[currentSection][key] = value;
    }
  }

  const iface = sections['interface'];
  if (!iface) return { error: 'Invalid config: missing [Interface] section' };

  if (!iface['privatekey']) return { error: 'Invalid config: PrivateKey required' };
  const privKeyErr = validateBase64Key(iface['privatekey'], 'PrivateKey');
  if (privKeyErr) return { error: `Invalid config: ${privKeyErr}` };

  if (!iface['address']) return { error: 'Invalid config: Address required' };

  const peer = sections['peer'];
  if (!peer) return { error: 'Invalid config: missing [Peer] section' };
  if (!peer['publickey']) return { error: 'Invalid config: PublicKey required' };
  const pubKeyErr = validateBase64Key(peer['publickey'], 'PublicKey');
  if (pubKeyErr) return { error: `Invalid config: ${pubKeyErr}` };

  const addresses = parseAddresses(iface['address']);
  if (addresses.error) return { error: addresses.error };

  const privateKey = iface['privatekey'];
  const publicKey = derivePublicKey(privateKey);
  const mtu = iface['mtu'] ? parseInt(iface['mtu'], 10) : WG_MTU;

  const amneziaOverrides = {};
  const amneziaKeys = [
    ['jc', 'Jc'], ['jmin', 'Jmin'], ['jmax', 'Jmax'],
    ['s1', 'S1'], ['s2', 'S2'],
    ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4']
  ];
  for (const [rawKey, outKey] of amneziaKeys) {
    if (iface[rawKey] !== undefined) {
      const v = parseAmneziaValue(iface[rawKey]);
      if (v !== null) amneziaOverrides[outKey] = v;
    }
  }

  // Preserve reserved from [Peer] Reserved = a,b,c or ClientId = <base64>
  let reserved = [0, 0, 0];
  if (peer['reserved']) {
    const bytes = String(peer['reserved']).split(/[\s,]+/).map(s => parseInt(s.trim(), 10));
    if (bytes.length === 3 && bytes.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      reserved = bytes;
    } else {
      return { error: 'Invalid config: Reserved must be exactly 3 bytes (0-255)' };
    }
  } else if (peer['clientid']) {
    let raw;
    try {
      const s = String(peer['clientid']);
      const padded = s.padEnd(Math.ceil(s.length / 4) * 4, '=');
      raw = base64ToBytes(padded);
    } catch (err) {
      return { error: 'Invalid config: ClientId base64 decode failed' };
    }
    if (raw.length !== 3) {
      return { error: `Invalid config: ClientId must decode to 3 bytes (got ${raw.length})` };
    }
    reserved = [raw[0], raw[1], raw[2]];
  }

  return {
    config: {
      private_key: privateKey,
      public_key: publicKey,
      addresses,
      peer_public_key: peer['publickey'],
      mtu: isNaN(mtu) ? WG_MTU : mtu,
      reserved
    },
    amnezia_overrides: Object.keys(amneziaOverrides).length ? amneziaOverrides : null
  };
}

function parseWgUri(uri) {
  if (typeof uri !== 'string') return { error: 'Invalid wg:// URI: not a string' };
  if (uri.length > 10240) return { error: 'Invalid wg:// URI: too large (max 10KB)' };

  let url;
  try {
    url = new URL(uri);
  } catch {
    return { error: 'Invalid wg:// URI format' };
  }

  if (url.protocol !== 'wg:' && url.protocol !== 'wireguard:') {
    return { error: 'Invalid wg:// URI format: must start with wg:// or wireguard://' };
  }

  const params = parseWgUriParams(url.search);
  // wireguard:// URIs put private_key in userinfo (before @), not in query params
  let userKey = url.username;
  try { userKey = decodeURIComponent(url.username); } catch { /* keep raw */ }
  const privateKey = params.private_key || userKey;
  const localAddress = params.local_address || params.address;
  const mtuParam = params.mtu;
  const publicKey = params.public_key || params.publickey;

  if (!privateKey) return { error: 'Invalid wg:// URI: missing private_key' };
  const privKeyErr = validateBase64Key(privateKey, 'PrivateKey');
  if (privKeyErr) return { error: `Invalid wg:// URI: ${privKeyErr}` };

  if (!localAddress) return { error: 'Invalid wg:// URI: missing local_address' };
  if (!publicKey) return { error: 'Invalid wg:// URI: missing public_key' };
  const pubKeyErr = validateBase64Key(publicKey, 'PublicKey');
  if (pubKeyErr) return { error: `Invalid wg:// URI: ${pubKeyErr}` };

  const addresses = parseAddressPair(localAddress);
  if (addresses.error) return { error: addresses.error };

  const derivedPublicKey = derivePublicKey(privateKey);
  const mtu = mtuParam ? parseInt(mtuParam, 10) : WG_MTU;

  const amneziaOverrides = {};
  if (params.enable_amnezia === 'true' || params.enable_amnezia === '1') {
    const amUriKeys = [['jc', 'Jc'], ['jmin', 'Jmin'], ['jmax', 'Jmax'],
      ['s1', 'S1'], ['s2', 'S2'], ['h1', 'H1'], ['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4']];
    for (const [paramKey, outKey] of amUriKeys) {
      if (params[paramKey] !== undefined) {
        const v = parseAmneziaValue(params[paramKey]);
        if (v !== null) amneziaOverrides[outKey] = v;
      }
    }
  }

  // Preserve reserved from query params
  let reserved = [0, 0, 0];
  if (params.reserved) {
    const raw = params.reserved;
    const decimals = raw.split(',').map(s => parseInt(s.trim(), 10));
    if (decimals.length === 3 && decimals.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      reserved = decimals;
    } else if (/^\d{1,3}-\d{1,3}-\d{1,3}$/.test(raw)) {
      const dashed = raw.split('-').map(Number);
      if (!dashed.every(n => n >= 0 && n <= 255)) {
        return { error: 'Invalid wg:// URI: reserved bytes must be 0-255' };
      }
      reserved = dashed;
    } else {
      let bytes;
      try {
        const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=');
        bytes = base64ToBytes(padded);
      } catch (err) {
        return { error: 'Invalid wg:// URI: reserved base64 decode failed' };
      }
      if (bytes.length !== 3) {
        return { error: `Invalid wg:// URI: reserved must decode to 3 bytes (got ${bytes.length})` };
      }
      reserved = [bytes[0], bytes[1], bytes[2]];
    }
  }

  return {
    config: {
      private_key: privateKey,
      public_key: derivedPublicKey,
      addresses,
      peer_public_key: publicKey,
      mtu: isNaN(mtu) ? WG_MTU : mtu,
      reserved
    },
    amnezia_overrides: Object.keys(amneziaOverrides).length ? amneziaOverrides : null
  };
}

function parseWgUriParams(rawQuery) {
  const params = {};
  if (!rawQuery) return params;
  const query = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq === -1) continue;
    const key = pair.slice(0, eq);
    let value = pair.slice(eq + 1);
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep raw value on malformed encoding
    }
    params[key] = value;
  }
  return params;
}

function isValidIpv4Part(part) {
  const m = part.match(/^(\d{1,3})(\.\d{1,3}){3}(\/(3[0-2]|[12]?\d))?$/);
  if (!m) return false;
  return part.split('/')[0].split('.').every(o => Number(o) <= 255);
}

function isValidIpv6Part(part) {
  if (!part.includes(':')) return false;
  let addr = part;
  if (part.includes('/')) {
    const slash = part.lastIndexOf('/');
    const cidr = part.slice(slash + 1);
    if (!/^\d{1,3}$/.test(cidr) || Number(cidr) > 128) return false;
    addr = part.slice(0, slash);
  }
  if ((addr.match(/::/g) || []).length > 1) return false;
  if (!addr.includes('::') && (addr.startsWith(':') || addr.endsWith(':'))) return false;
  return addr.split(':').every(g => g === '' || /^[0-9a-fA-F]{1,4}$/.test(g));
}

function parseAddresses(addressStr) {
  const parts = addressStr.split(',').map(s => s.trim()).filter(Boolean);
  let ipv4 = null;
  let ipv6 = null;

  for (const part of parts) {
    if (part.includes(':')) {
      if (!isValidIpv6Part(part)) return { error: `Invalid config: invalid IPv6 address "${part}"` };
      ipv6 = part;
    } else if (isValidIpv4Part(part)) {
      ipv4 = part;
    } else {
      return { error: `Invalid config: invalid IP address "${part}"` };
    }
  }

  if (!ipv4 && !ipv6) return { error: 'Invalid config: no valid addresses found' };
  return { ipv4: ipv4 || '', ipv6: ipv6 || '' };
}

function parseAddressPair(addressStr) {
  const parts = String(addressStr).split(/[,-]/).map(s => s.trim()).filter(Boolean);
  let ipv4 = null;
  let ipv6 = null;

  for (const part of parts) {
    if (part.includes(':')) {
      if (!isValidIpv6Part(part)) return { error: `Invalid wg:// URI: invalid IPv6 address "${part}"` };
      ipv6 = part;                               // IPv6 (CIDR optional)
    } else if (isValidIpv4Part(part)) {
      ipv4 = part;                               // IPv4 (CIDR optional)
    } else {
      return { error: `Invalid wg:// URI: invalid IP address "${part}"` };
    }
  }

  if (!ipv4 && !ipv6) return { error: 'Invalid wg:// URI: no valid addresses found' };
  return { ipv4: ipv4 || '', ipv6: ipv6 || '' };
}

// --- Account Helpers (Task 8) ---

function createAccountObject(name, config) {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();

  return {
    id,
    name: name.trim(),
    token,
    created_at: now,
    config,
    endpoint_list: { type: 'preset', preset_id: 'default' },
    amnezia_overrides: null
  };
}

async function storeAccount(env, account) {
  if (!(await kvPut(env, `account:${account.id}`, JSON.stringify(account)))) {
    return false;
  }
  if (!(await kvPut(env, `token:${account.token}`, account.id))) {
    await kvDelete(env, `account:${account.id}`);
    return false;
  }
  return true;
}

async function loadPresets(env) {
  const raw = await kvGet(env, 'presets', { type: 'json' });
  return raw || [...DEFAULT_PRESETS];
}

// ponytail: KV-down reads bubble as 500s here (deliberate — distinguishes outage from missing);
// new code should use kvGet and decide the HTTP response itself.
async function getAccount(env, id) {
  return await env.WARP_KV.get(`account:${id}`, { type: 'json' });
}

async function deleteAccount(env, account) {
  const a = await kvDelete(env, `account:${account.id}`);
  const t = await kvDelete(env, `token:${account.token}`);
  return a || t;
}

async function fetchAccountsBatched(ids, getter, batchSize = ACCOUNT_BATCH_SIZE) {
  const accounts = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const results = await Promise.all(ids.slice(i, i + batchSize).map(id => getter(id)));
    for (const account of results) {
      if (account) accounts.push(account);
    }
  }
  return accounts;
}

async function listAccountKeyNames(env) {
  const names = [];
  let cursor = undefined;
  do {
    const result = await env.WARP_KV.list({ prefix: 'account:', cursor, limit: 100 });
    for (const key of result.keys) {
      names.push(key.name);
    }
    cursor = result.cursor;
  } while (cursor);
  return names;
}

async function listAccounts(env) {
  return await fetchAccountsBatched(
    await listAccountKeyNames(env),
    key => env.WARP_KV.get(key, { type: 'json' })
  );
}

function sanitizeAccount(account) {
  return {
    id: account.id,
    name: account.name,
    token: account.token,
    created_at: account.created_at,
    config: {
      public_key: account.config.public_key,
      addresses: account.config.addresses,
      peer_public_key: account.config.peer_public_key,
      mtu: account.config.mtu,
      reserved: account.config.reserved
    },
    endpoint_list: account.endpoint_list,
    amnezia_overrides: account.amnezia_overrides,
    dns: account.dns || null,
    tokenMeta: account.tokenMeta || null,
    fetchCount: Number(account.fetchCount) || 0,
    group: account.group || null
  };
}

// --- Product Features (B10): backup payload, group merge, preferred order ---

function validateBackupPassword(password) {
  if (typeof password !== 'string' || password.length < BACKUP_PASSWORD_MIN) {
    return `Password must be at least ${BACKUP_PASSWORD_MIN} characters`;
  }
  if (password.length > BACKUP_PASSWORD_MAX) {
    return `Password too long (max ${BACKUP_PASSWORD_MAX} characters)`;
  }
  return null;
}

function buildBackupPayload(accounts, presets, settings, exportedAt) {
  if (!Array.isArray(accounts)) return { error: 'accounts must be an array' };
  if (!Array.isArray(presets)) return { error: 'presets must be an array' };
  const payload = {
    version: 1,
    exportedAt: typeof exportedAt === 'string' && !Number.isNaN(Date.parse(exportedAt))
      ? exportedAt
      : new Date().toISOString(),
    accounts,
    presets,
    settings: settings && typeof settings === 'object' ? settings : null
  };
  return { payload };
}

function validateBackupPayloadStructure(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'Backup payload must be an object';
  if (payload.version !== 1) return 'Unsupported backup version';
  if (!Array.isArray(payload.accounts)) return 'Backup accounts section is missing';
  if (!Array.isArray(payload.presets)) return 'Backup presets section is missing';
  if (payload.accounts.length > MAX_ENDPOINTS * 10) return 'Backup contains too many accounts';
  if (payload.settings !== undefined && payload.settings !== null &&
      (typeof payload.settings !== 'object' || Array.isArray(payload.settings))) {
    return 'Backup settings section is invalid';
  }
  return null;
}

function validateBackupAccount(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return 'not an object';
  if (typeof account.id !== 'string' || !account.id || account.id.length > 100) return 'invalid id';
  const nameErr = validateName(account.name);
  if (nameErr) return nameErr;
  if (typeof account.token !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(account.token)) return 'invalid token';
  const shapeErr = validateAccountConfigShape(account.config);
  if (shapeErr) return shapeErr;
  const keyErr = validateBase64Key(account.config.private_key, 'private key');
  if (keyErr) return keyErr;
  const peerErr = validateBase64Key(account.config.peer_public_key, 'peer public key');
  if (peerErr) return peerErr;
  if (account.endpoint_list === undefined || account.endpoint_list === null) return 'missing endpoint_list';
  const elErr = validateEndpointList(account.endpoint_list);
  if (elErr) return elErr;
  if (account.amnezia_overrides !== undefined && account.amnezia_overrides !== null) {
    const aErr = validateAmneziaSettings(account.amnezia_overrides);
    if (aErr) return `amnezia_overrides: ${aErr}`;
  }
  if (account.dns !== undefined && account.dns !== null) {
    const dnsErr = validateDns(account.dns);
    if (dnsErr) return dnsErr;
  }
  const groupErr = validateGroupTag(account.group);
  if (groupErr) return groupErr;
  if (account.tokenMeta !== undefined && account.tokenMeta !== null && typeof account.tokenMeta === 'object') {
    const tmErr = validateTokenMeta(account.tokenMeta, new Date(), {});
    if (tmErr) return tmErr;
  }
  return null;
}

function normalizeImportedAccount(account) {
  const out = Object.assign({}, account);
  if (out.created_at === undefined || typeof out.created_at !== 'string' || Number.isNaN(Date.parse(out.created_at))) {
    out.created_at = new Date().toISOString();
  }
  if (out.amnezia_overrides === undefined) out.amnezia_overrides = null;
  if (out.dns === undefined) out.dns = null;
  if (out.group === undefined) out.group = null;
  if (out.tokenMeta === undefined) out.tokenMeta = {};
  out.fetchCount = Number(out.fetchCount) || 0;
  return out;
}

function mergeAccounts(existingAccounts, incomingAccounts, mode) {
  if (mode !== 'skip' && mode !== 'overwrite') {
    return { error: "mode must be 'skip' or 'overwrite'" };
  }
  if (!Array.isArray(existingAccounts) || !Array.isArray(incomingAccounts)) {
    return { error: 'existing and incoming must be arrays' };
  }
  const byId = new Map(existingAccounts.map(a => [a.id, a]));
  const ownerOfToken = new Map();
  for (const acc of existingAccounts) {
    if (acc && typeof acc.token === 'string') ownerOfToken.set(acc.token, acc.id);
  }
  const result = [];
  const errors = [];
  const replacedOldTokens = new Set();
  let imported = 0;
  let skipped = 0;

  incomingAccounts.forEach((acc, index) => {
    if (!acc || typeof acc !== 'object') {
      errors.push({ index, error: 'not an object' });
      return;
    }
    const vErr = validateBackupAccount(acc);
    if (vErr) {
      errors.push({ index, id: typeof acc.id === 'string' ? acc.id : undefined, error: vErr });
      return;
    }
    const current = byId.get(acc.id);
    if (current) {
      if (mode === 'skip') {
        skipped++;
        return;
      }
      const ownerId = ownerOfToken.get(acc.token);
      if (ownerId && ownerId !== acc.id) {
        errors.push({ index, id: acc.id, error: `token already used by account ${ownerId}` });
        return;
      }
      if (current.token !== acc.token) replacedOldTokens.add(current.token);
      byId.set(acc.id, acc);
      result.push(acc);
      imported++;
      return;
    }
    const ownerId = ownerOfToken.get(acc.token);
    if (ownerId) {
      errors.push({ index, id: acc.id, error: `token already used by account ${ownerId}` });
      return;
    }
    ownerOfToken.set(acc.token, acc.id);
    byId.set(acc.id, acc);
    result.push(acc);
    imported++;
  });

  return { result, errors, imported, skipped, replacedOldTokens: [...replacedOldTokens] };
}

function sanitizeGroupName(raw) {
  return String(raw).replace(/[\x00-\x1f\x7f<>"'\\`]/g, '').trim();
}

function validateGroupTag(group) {
  if (group === undefined || group === null) return null;
  if (typeof group !== 'string') return 'Group must be a string';
  const sanitized = sanitizeGroupName(group);
  if (sanitized.length < 1 || sanitized.length > GROUP_NAME_MAX) {
    return `Group tag must be 1-${GROUP_NAME_MAX} characters`;
  }
  return null;
}

function applyPreferredOrder(configs, preferredOrder) {
  if (!Array.isArray(configs) || !Array.isArray(preferredOrder) || preferredOrder.length === 0) return configs;
  const n = configs.length;
  const seen = new Set();
  const ordered = [];
  for (const idx of preferredOrder) {
    if (Number.isInteger(idx) && idx >= 0 && idx < n && !seen.has(idx)) {
      seen.add(idx);
      ordered.push(configs[idx]);
    }
  }
  if (ordered.length === 0) return configs;
  for (let i = 0; i < n; i++) {
    if (!seen.has(i)) ordered.push(configs[i]);
  }
  return ordered;
}

function expandGroupConfigs(configLists) {
  const merged = [];
  const seen = new Set();
  for (const list of configLists) {
    if (!Array.isArray(list)) continue;
    for (const cfg of list) {
      if (!cfg || typeof cfg !== 'object') continue;
      const key = `${cfg.ip}:${cfg.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(cfg);
    }
  }
  // Clients (mihomo, sing-box) reject duplicate proxy names — qualify collisions
  const tagSeen = new Map();
  for (const cfg of merged) {
    if (!cfg.tag) continue;
    const n = tagSeen.get(cfg.tag) || 0;
    tagSeen.set(cfg.tag, n + 1);
    if (n > 0) cfg.tag = `${cfg.tag} ${n + 1}`;
  }
  return merged;
}

function validateAggRecord(record, now) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return 'agg record must be an object';
  if (typeof record.token !== 'string' || record.token.length < 8 || record.token.length > 100) {
    return 'invalid agg token';
  }
  if (!Array.isArray(record.groups) || record.groups.length === 0) return 'at least one group required';
  if (record.groups.length > AGG_MAX_GROUPS) return `too many groups (max ${AGG_MAX_GROUPS})`;
  for (const g of record.groups) {
    if (typeof g !== 'string' || sanitizeGroupName(g).length < 1) return 'invalid group name in groups';
  }
  if (record.label !== undefined && record.label !== null && record.label !== '') {
    if (typeof record.label !== 'string') return 'label must be a string';
    const label = sanitizeTokenLabel(record.label);
    if (label.length < 1 || label.length > 100) return 'label must be 1-100 characters';
  }
  const tmErr = validateTokenMeta(record.tokenMeta, now);
  if (tmErr) return tmErr;
  return null;
}

function validatePreferredOrder(order) {
  if (!Array.isArray(order)) return 'preferredOrder must be an array of endpoint indexes';
  if (order.length > MAX_ENDPOINTS) return `preferredOrder too long (max ${MAX_ENDPOINTS})`;
  const seen = new Set();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= MAX_ENDPOINTS) {
      return 'preferredOrder entries must be integers 0-199';
    }
    if (seen.has(idx)) return 'preferredOrder entries must be unique';
    seen.add(idx);
  }
  return null;
}

function sanitizePreferredOrder(order, endpointCount) {
  const seen = new Set();
  const out = [];
  for (const idx of order) {
    if (Number.isInteger(idx) && idx >= 0 && idx < endpointCount && !seen.has(idx)) {
      seen.add(idx);
      out.push(idx);
    }
  }
  return out;
}

// --- Validation Helpers (extended) ---

function validateIPv4OrIPv6OrDomain(ip) {
  if (!ip || typeof ip !== 'string') return 'IP address required';
  if (ip.length > 253) return 'IP address too long (max 253 chars)';
  // IPv4
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    const parts = ip.split('.');
    for (const p of parts) { if (parseInt(p) > 255) return 'Invalid IPv4 address'; }
    return null;
  }
  // IPv6 (including embedded IPv4 like ::ffff:1.2.3.4)
  let v6 = ip;
  if (v6.startsWith('[') && v6.endsWith(']')) v6 = v6.slice(1, -1);
  if (v6.includes(':')) {
    // Embedded IPv4: last segment contains dots
    const lastColon = v6.lastIndexOf(':');
    const lastSeg = v6.slice(lastColon + 1);
    if (lastSeg.includes('.')) {
      if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(lastSeg)) return 'Invalid IPv6 address';
      for (const p of lastSeg.split('.')) { if (parseInt(p) > 255) return 'Invalid IPv6 address'; }
      const prefix = v6.slice(0, lastColon);
      if (prefix.length > 0) {
        if ((prefix.match(/::/g) || []).length > 1) return 'Invalid IPv6 address';
        const groups = prefix.split(':');
        const nonEmpty = groups.filter(g => g.length > 0);
        if (!prefix.includes('::') && nonEmpty.length !== 6) return 'Invalid IPv6 address';
        for (const g of nonEmpty) {
          if (g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) return 'Invalid IPv6 address';
        }
      }
      return null;
    }
    // Pure IPv6
    if ((v6.match(/::/g) || []).length > 1) return 'Invalid IPv6 address';
    const groups = v6.split(':');
    if (groups.length > 8) return 'Invalid IPv6 address';
    const nonEmpty = groups.filter(g => g.length > 0);
    for (const g of nonEmpty) {
      if (g.length > 4 || !/^[0-9a-fA-F]+$/.test(g)) return 'Invalid IPv6 address';
    }
    if (!v6.includes('::') && nonEmpty.length !== 8) return 'Invalid IPv6 address';
    return null;
  }
  // Domain — each label 1-63 chars, start/end with alphanum
  if (ip.startsWith('.') || ip.endsWith('.')) return 'Invalid domain';
  const labels = ip.split('.');
  if (labels.length < 2) return 'Invalid domain';
  for (const label of labels) {
    if (label.length === 0 || label.length > 63) return 'Invalid domain';
    if (!/^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) return 'Invalid domain';
  }
  return null;
}

function validatePort(port) {
  if (port === undefined || port === null) return 'Port required';
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Port must be 1-65535';
  return null;
}

function validateDns(dns) {
  if (dns === undefined || dns === null || dns === '') return null;
  if (typeof dns !== 'string') return 'DNS must be a hostname or IP address';
  if (dns.length > 253) return 'DNS too long (max 253 chars)';
  const ipErr = validateIPv4OrIPv6OrDomain(dns);
  return ipErr ? `Invalid DNS: ${ipErr}` : null;
}

function normalizeDns(dns) {
  return (typeof dns === 'string' && dns.trim() !== '') ? dns.trim() : null;
}

function validateAmneziaParam(value, name, min, max, allowRange = false) {
  if (value === undefined || value === null) return null; // optional
  // Range string support (e.g., '123-456') for H1-H4
  if (allowRange && typeof value === 'string' && /^\d+-\d+$/.test(value)) {
    const [lo, hi] = value.split('-').map(Number);
    if (lo < min || hi > max || lo > hi) return `${name} range invalid (lo<=hi, ${min}-${max})`;
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return `${name} must be ${min}-${max}`;
  return null;
}

function validateEndpointList(el) {
  if (!el || typeof el !== 'object') return 'Invalid endpoint_list';
  if (el.type === 'preset') {
    if (typeof el.preset_id !== 'string' || !el.preset_id) return 'Invalid preset_id';
    return null;
  }
  if (el.type === 'custom') {
    if (!Array.isArray(el.custom_endpoints)) return 'Invalid custom_endpoints';
    if (el.custom_endpoints.length < 1) return 'At least one endpoint required';
    if (el.custom_endpoints.length > MAX_ENDPOINTS) return `Too many endpoints (max ${MAX_ENDPOINTS})`;
    for (let i = 0; i < el.custom_endpoints.length; i++) {
      const ep = el.custom_endpoints[i];
      if (!ep || typeof ep !== 'object') return `Endpoint ${i + 1}: invalid endpoint`;
      ep.ip = normalizeEndpointIp(ep.ip);
      const ipErr = validateIPv4OrIPv6OrDomain(ep.ip);
      if (ipErr) return `Endpoint ${i + 1}: ${ipErr}`;
      const portErr = validatePort(ep.port);
      if (portErr) return `Endpoint ${i + 1}: ${portErr}`;
    }
    return null;
  }
  return 'Invalid endpoint_list type';
}

function validateAmneziaSettings(a) {
  if (!a || typeof a !== 'object') return 'Invalid Amnezia settings';
  const checks = [
    validateAmneziaParam(a.Jc, 'Jc', 0, 128),
    validateAmneziaParam(a.Jmin, 'Jmin', 0, 1280),
    validateAmneziaParam(a.Jmax, 'Jmax', 0, 1280),
    validateAmneziaParam(a.S1, 'S1', 0, 255),
    validateAmneziaParam(a.S2, 'S2', 0, 255),
    validateAmneziaParam(a.S3, 'S3', 0, 255),
    validateAmneziaParam(a.S4, 'S4', 0, 255),
    validateAmneziaParam(a.H1, 'H1', 0, 2147483647, true),
    validateAmneziaParam(a.H2, 'H2', 0, 2147483647, true),
    validateAmneziaParam(a.H3, 'H3', 0, 2147483647, true),
    validateAmneziaParam(a.H4, 'H4', 0, 2147483647, true)
  ];
  for (const err of checks) { if (err) return err; }
  if (a.I1 !== undefined && a.I1 !== null && a.I1 !== '') {
    if (typeof a.I1 !== 'string' || !AWG_INIT_PACKET_RE.test(a.I1.trim())) {
      return 'I1 must be empty or use <r N> / <b 0x..> notation';
    }
  }
  // Jmin <= Jmax
  if (a.Jmin != null && a.Jmax != null && Number(a.Jmin) > Number(a.Jmax)) {
    return 'Jmin must be <= Jmax';
  }
  // H1-H4 overlap check — parse each into [lo,hi] ranges, skip zeros
  function _parseHRange(v) {
    if (v == null || v === 0 || v === '0') return null;
    if (typeof v === 'string' && /^\d+-\d+$/.test(v)) {
      const [lo, hi] = v.split('-').map(Number);
      return [lo, hi];
    }
    const n = Number(v);
    return (Number.isInteger(n) && n > 0) ? [n, n] : null;
  }
  const hRanges = [a.H1, a.H2, a.H3, a.H4].map(_parseHRange).filter(r => r !== null);
  for (let i = 0; i < hRanges.length; i++) {
    for (let j = i + 1; j < hRanges.length; j++) {
      if (hRanges[i][0] <= hRanges[j][1] && hRanges[j][0] <= hRanges[i][1]) {
        return 'H1-H4 magic headers must not overlap';
      }
    }
  }
  // H1-H4 all-or-none: any nonzero header requires all four set and pairwise distinct
  const hasAnyH = [a.H1, a.H2, a.H3, a.H4].some(v => !_isZeroH(v));
  if (hasAnyH) {
    const missing = [a.H1, a.H2, a.H3, a.H4].some(_isZeroH);
    if (missing) return 'H1-H4 must all be set together (all-or-none)';
    const lows = hRanges.map(r => r[0]);
    if (new Set(lows).size !== lows.length) {
      return 'H1-H4 magic headers must be pairwise distinct';
    }
  }
  return null;
}

function _isZeroH(v) {
  return v == null || v === 0 || v === '' || v === '0';
}

// --- Preset Management API (Task 20) ---

async function handlePresetList(env) {
  const raw = await env.WARP_KV.get('presets', { type: 'json' });
  return jsonResponse(raw || DEFAULT_PRESETS);
}

function validatePresetEndpoints(endpoints) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return 'At least one endpoint required';
  }
  if (endpoints.length > MAX_ENDPOINTS) return `Too many endpoints (max ${MAX_ENDPOINTS})`;
  for (let i = 0; i < endpoints.length; i++) {
    const ep = endpoints[i];
    if (!ep || typeof ep !== 'object') return `Endpoint ${i + 1}: invalid endpoint`;
    ep.ip = normalizeEndpointIp(ep.ip);
    const ipErr = validateIPv4OrIPv6OrDomain(ep.ip);
    if (ipErr) return `Endpoint ${i + 1}: ${ipErr}`;
    const portErr = validatePort(ep.port);
    if (portErr) return `Endpoint ${i + 1}: ${portErr}`;
  }
  return null;
}

function normalizeEndpointIp(ip) {
  return typeof ip === 'string' ? ip.replace(/^\[/, '').replace(/\]$/, '') : ip;
}

async function handlePresetCreate(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return errorResponse('Preset name required');
  }
  if (body.name.length > 100) return errorResponse('Preset name too long (max 100)');
  const epErr = validatePresetEndpoints(body.endpoints);
  if (epErr) return errorResponse(epErr);
  const dnsErr = validateDns(body.dns);
  if (dnsErr) return errorResponse(dnsErr);

  const presets = await loadPresets(env);

  const id = crypto.randomUUID();
  const preset = { id, name: body.name.trim(), endpoints: body.endpoints };
  const presetDns = normalizeDns(body.dns);
  if (presetDns) preset.dns = presetDns;
  presets.push(preset);

  if (!(await kvPut(env, 'presets', JSON.stringify(presets)))) {
    return errorResponse('Failed to save preset', 500);
  }

  return jsonResponse(preset, 201);
}

async function handlePresetUpdate(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const presets = await loadPresets(env);
  const idx = presets.findIndex(p => p.id === id);
  if (idx === -1) return errorResponse('Preset not found', 404);

  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
      return errorResponse('Preset name required');
    }
    if (body.name.length > 100) return errorResponse('Preset name too long (max 100)');
    presets[idx].name = body.name.trim();
  }

  if (body.endpoints !== undefined) {
    const epErr = validatePresetEndpoints(body.endpoints);
    if (epErr) return errorResponse(epErr);
    presets[idx].endpoints = body.endpoints;
  }

  if (body.dns !== undefined) {
    const dnsErr = validateDns(body.dns);
    if (dnsErr) return errorResponse(dnsErr);
    const presetDns = normalizeDns(body.dns);
    if (presetDns) presets[idx].dns = presetDns;
    else delete presets[idx].dns;
  }

  if (body.preferredOrder !== undefined) {
    if (body.preferredOrder === null) {
      delete presets[idx].preferredOrder;
    } else {
      const poErr = validatePreferredOrder(body.preferredOrder);
      if (poErr) return errorResponse(poErr);
      const target = body.endpoints !== undefined ? body.endpoints : presets[idx].endpoints;
      const order = sanitizePreferredOrder(body.preferredOrder, target.length);
      if (order.length > 1) presets[idx].preferredOrder = order;
      else delete presets[idx].preferredOrder;
    }
  }

  if (!(await kvPut(env, 'presets', JSON.stringify(presets)))) {
    return errorResponse('Failed to save preset', 500);
  }

  await purgeAllCachedSubscriptions(request, env);

  return jsonResponse(presets[idx]);
}

async function handlePresetDelete(id, request, env) {
  const presets = await loadPresets(env);
  const idx = presets.findIndex(p => p.id === id);
  if (idx === -1) return errorResponse('Preset not found', 404);

  // Check if any account uses this preset
  const accounts = await listAccounts(env);
  for (const acc of accounts) {
    if (acc.endpoint_list && acc.endpoint_list.type === 'preset' && acc.endpoint_list.preset_id === id) {
      return errorResponse(`Preset in use by account "${acc.name}"`, 400);
    }
  }

  presets.splice(idx, 1);
  if (!(await kvPut(env, 'presets', JSON.stringify(presets)))) {
    return errorResponse('Failed to delete preset', 500);
  }

  await purgeAllCachedSubscriptions(request, env);

  return jsonResponse({ success: true });
}

// --- Amnezia Settings API (Task 21) ---

async function handleAmneziaGet(env) {
  const raw = await kvGet(env, 'settings:global', { type: 'json' });
  const amnezia = raw?.amnezia || DEFAULT_AMNEZIA;
  return jsonResponse(amnezia);
}

const AMNEZIA_SETTING_KEYS = ['Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'I1'];

async function handleAmneziaUpdate(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const clean = {};
  for (const key of AMNEZIA_SETTING_KEYS) {
    if (body[key] !== undefined) clean[key] = body[key];
  }

  const err = validateAmneziaSettings(clean);
  if (err) return errorResponse(err);

  const raw = (await kvGet(env, 'settings:global', { type: 'json' })) || {};
  raw.amnezia = { ...DEFAULT_AMNEZIA, ...raw.amnezia, ...clean };

  if (!(await kvPut(env, 'settings:global', JSON.stringify(raw)))) {
    return errorResponse('Failed to save settings', 500);
  }

  await purgeAllCachedSubscriptions(request, env);

  return jsonResponse(raw.amnezia);
}

// --- Backup API (B10) ---

async function handleBackupExport(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const pwErr = validateBackupPassword(body.password);
  if (pwErr) return errorResponse(pwErr);

  const [accounts, presetsRaw, settingsRaw] = await Promise.all([
    listAccounts(env),
    kvGet(env, 'presets', { type: 'json' }),
    kvGet(env, 'settings:global', { type: 'json' })
  ]);

  const built = buildBackupPayload(accounts, presetsRaw || DEFAULT_PRESETS, settingsRaw);
  if (built.error) return errorResponse(built.error, 500);

  const blob = await encryptBackupJson(JSON.stringify(built.payload), body.password);

  console.log(JSON.stringify({ event: 'backup_exported', n_accounts: accounts.length }));

  return new Response(blob, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="backup.wgenc"',
      'Cache-Control': 'no-store'
    }
  });
}

function validateImportedPreset(preset) {
  if (!preset || typeof preset !== 'object' || Array.isArray(preset)) return { error: 'not an object' };
  if (typeof preset.id !== 'string' || !preset.id || preset.id.length > 100) return { error: 'invalid id' };
  if (typeof preset.name !== 'string' || !preset.name.trim() || preset.name.length > 100) {
    return { error: 'invalid name' };
  }
  const epErr = validatePresetEndpoints(preset.endpoints);
  if (epErr) return { error: epErr };
  const dnsErr = validateDns(preset.dns);
  if (dnsErr) return { error: dnsErr };
  if (preset.preferredOrder !== undefined && preset.preferredOrder !== null) {
    const poErr = validatePreferredOrder(preset.preferredOrder);
    if (poErr) return { error: poErr };
  }
  return { value: preset };
}

async function handleBackupImport(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const pwErr = validateBackupPassword(body.password);
  if (pwErr) return errorResponse(pwErr);

  const mode = body.mode === 'overwrite' ? 'overwrite' : 'skip';

  if (typeof body.blob !== 'string' || !body.blob) return errorResponse('Backup file content required');
  if (body.blob.length > 2800000) return errorResponse('Backup file too large');
  let bytes;
  try { bytes = base64ToBytes(body.blob); } catch { return errorResponse('Invalid backup blob encoding'); }
  if (bytes.length > 2 * 1024 * 1024) return errorResponse('Backup file too large');

  const decrypted = await decryptBackupBytes(bytes, body.password);
  if (decrypted.error) return errorResponse(decrypted.error);

  let payload;
  try { payload = JSON.parse(decrypted.json); } catch { return errorResponse('Backup payload is not valid JSON'); }

  const structErr = validateBackupPayloadStructure(payload);
  if (structErr) return errorResponse(structErr);

  const merge = mergeAccounts(await listAccounts(env), payload.accounts, mode);
  if (merge.error) return errorResponse(merge.error);

  for (const rawAccount of merge.result) {
    const account = normalizeImportedAccount(rawAccount);
    if (!(await storeAccount(env, account))) {
      return errorResponse('Failed to save imported account', 500);
    }
  }
  for (const oldToken of merge.replacedOldTokens) {
    await kvDelete(env, `token:${oldToken}`);
  }

  const presetsRaw = await kvGet(env, 'presets', { type: 'json' });
  const presets = presetsRaw || [...DEFAULT_PRESETS];
  const presetById = new Map(presets.map(p => [p.id, p]));
  let presetsImported = 0;
  let presetsSkipped = 0;
  let presetsDirty = false;

  payload.presets.forEach((p, index) => {
    const checked = validateImportedPreset(p);
    if (checked.error || !checked.value) {
      merge.errors.push({ section: 'presets', index, error: checked.error || 'invalid preset' });
      return;
    }
    const incoming = checked.value;
    const current = presetById.get(incoming.id);
    if (current && mode === 'skip') {
      presetsSkipped++;
      return;
    }
    const clean = {
      id: incoming.id,
      name: incoming.name.trim(),
      endpoints: incoming.endpoints
    };
    const dns = normalizeDns(incoming.dns);
    if (dns) clean.dns = dns;
    if (Array.isArray(incoming.preferredOrder)) {
      const order = sanitizePreferredOrder(incoming.preferredOrder, clean.endpoints.length);
      if (order.length > 0) clean.preferredOrder = order;
    }
    if (current) {
      Object.assign(current, clean);
    } else {
      presets.push(clean);
      presetById.set(clean.id, clean);
    }
    presetsImported++;
    presetsDirty = true;
  });

  if (presetsDirty) {
    if (!(await kvPut(env, 'presets', JSON.stringify(presets)))) {
      return errorResponse('Failed to save imported presets', 500);
    }
  }

  let settingsApplied = false;
  if (payload.settings && typeof payload.settings === 'object') {
    const currentGlobal = (await kvGet(env, 'settings:global', { type: 'json' })) || {};
    const mergedGlobal = { ...currentGlobal };
    const ALLOWED_SETTINGS_KEYS = new Set(['amnezia']);
    for (const key of Object.keys(payload.settings)) {
      if (!ALLOWED_SETTINGS_KEYS.has(key)) {
        merge.errors.push({ section: 'settings', error: `unknown settings key: ${key}` });
        continue;
      }
      // skip mode keeps existing global amnezia (mirrors per-account skip semantics)
      if (mode === 'skip' && currentGlobal.amnezia !== undefined && currentGlobal.amnezia !== null) {
        continue;
      }
      mergedGlobal[key] = payload.settings[key];
    }
    if (mergedGlobal.amnezia !== undefined && mergedGlobal.amnezia !== null) {
      const amnErr = validateAmneziaSettings(mergedGlobal.amnezia);
      if (amnErr) {
        delete mergedGlobal.amnezia;
        merge.errors.push({ section: 'settings', error: `amnezia: ${amnErr}` });
      }
    }
    if (!(await kvPut(env, 'settings:global', JSON.stringify(mergedGlobal)))) {
      merge.errors.push({ section: 'settings', error: 'failed to persist settings' });
    } else {
      settingsApplied = true;
    }
  }

  await purgeAllCachedSubscriptions(request, env);

  console.log(JSON.stringify({
    event: 'backup_imported',
    mode,
    imported: merge.imported,
    skipped: merge.skipped,
    errors: merge.errors.length
  }));

  return jsonResponse({
    mode,
    imported: merge.imported,
    skipped: merge.skipped,
    errors: merge.errors,
    presetsImported,
    presetsSkipped,
    settingsApplied
  });
}

// --- WARP status surface (B10) ---

async function handleWarpStatusGet(env) {
  const raw = await kvGet(env, 'settings:warpstatus', { type: 'json' });
  if (!raw || typeof raw !== 'object') return jsonResponse({ ok: null, checkedAt: null, lastError: null });
  return jsonResponse({
    ok: raw.ok === true,
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : null
  });
}

// --- Aggregate (group) subscriptions via agg tokens (B10) ---

async function listAggRecords(env) {
  const names = [];
  let cursor;
  do {
    const page = await env.WARP_KV.list({ prefix: AGG_KEY_PREFIX, cursor, limit: 100 });
    for (const key of page.keys) names.push(key.name);
    cursor = page.cursor;
  } while (cursor);
  return await fetchAccountsBatched(names, key => env.WARP_KV.get(key, { type: 'json' }));
}

function sanitizeAggRecord(record) {
  return {
    token: record.token,
    groups: Array.isArray(record.groups) ? record.groups : [],
    label: record.label ?? null,
    created_at: record.created_at || null,
    tokenMeta: record.tokenMeta || null,
    fetchCount: Number(record.fetchCount) || 0
  };
}

async function handleAggList(env) {
  const records = await listAggRecords(env);
  return jsonResponse(records.map(sanitizeAggRecord));
}

async function handleAggCreate(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  if (!Array.isArray(body.groups) || body.groups.length === 0) {
    return errorResponse('Select at least one group');
  }
  if (body.groups.length > AGG_MAX_GROUPS) {
    return errorResponse(`Too many groups (max ${AGG_MAX_GROUPS})`);
  }
  const groups = [];
  const seenGroups = new Set();
  for (const rawGroup of body.groups) {
    if (typeof rawGroup !== 'string') return errorResponse('Group names must be strings');
    const g = sanitizeGroupName(rawGroup);
    const gErr = validateGroupTag(g);
    if (gErr) return errorResponse(`Invalid group "${rawGroup.slice(0, GROUP_NAME_MAX)}": ${gErr}`);
    if (!seenGroups.has(g)) {
      seenGroups.add(g);
      groups.push(g);
    }
  }

  let label = null;
  if (body.label !== undefined && body.label !== null && body.label !== '') {
    if (typeof body.label !== 'string') return errorResponse('Label must be a string');
    label = sanitizeTokenLabel(body.label);
    if (label.length < 1 || label.length > 100) return errorResponse('Label must be 1-100 characters');
  }

  let expiresAtRaw = null;
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
    expiresAtRaw = String(body.expiresAt);
    const expiryCheck = validateTokenMeta({ expiresAt: expiresAtRaw }, new Date(), {});
    if (expiryCheck) return errorResponse(expiryCheck);
  }

  const now = new Date();
  const token = crypto.randomUUID();
  const record = {
    token,
    groups,
    label,
    created_at: now.toISOString()
  };
  if (expiresAtRaw) record.tokenMeta = { expiresAt: new Date(expiresAtRaw).toISOString() };

  const recErr = validateAggRecord(record, now);
  if (recErr) return errorResponse(recErr);

  if (!(await kvPut(env, `${AGG_KEY_PREFIX}${token}`, JSON.stringify(record)))) {
    return errorResponse('Failed to create group subscription', 500);
  }

  console.log(JSON.stringify({ event: 'agg_created', tokenPrefix: token.slice(0, 8), n_groups: groups.length }));

  return jsonResponse(sanitizeAggRecord(record), 201);
}

async function handleAggDelete(token, request, env) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9-]{8,100}$/.test(token)) {
    return errorResponse('Invalid group subscription token');
  }
  const record = await kvGet(env, `${AGG_KEY_PREFIX}${token}`, { type: 'json' });
  if (!record) return errorResponse('Group subscription not found', 404);

  if (!(await kvDelete(env, `${AGG_KEY_PREFIX}${token}`))) {
    return errorResponse('Failed to delete group subscription', 500);
  }

  await purgeCachedSubscriptions(new URL(request.url).origin, [token]);

  return jsonResponse({ success: true });
}

// --- Account API Handlers (Task 8) ---

async function handleAccountGenerate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const nameErr = validateName(body.name);
  if (nameErr) return errorResponse(nameErr);

  const result = await registerWarpAccount(env);
  if (!result.ok) return errorResponse(result.error, result.status);

  const account = createAccountObject(body.name, result.config);

  if (!(await storeAccount(env, account))) {
    await deleteWarpRegistration(env, result.warpId, result.warpToken);
    return errorResponse('Failed to save account', 500);
  }

  return jsonResponse(sanitizeAccount(account), 201);
}

async function handleAccountImport(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const nameErr = validateName(body.name);
  if (nameErr) return errorResponse(nameErr);

  if (!body.config) return errorResponse('Config required');

  let result;
  if (typeof body.config === 'string' && /^w(?:g|ireguard):\/\//.test(body.config.trim())) {
    result = parseWgUri(body.config.trim());
  } else if (typeof body.config === 'string') {
    result = parseWireGuardConf(body.config);
  } else {
    return errorResponse('Invalid config format');
  }

  if (result.error) return errorResponse(result.error);

  const account = createAccountObject(body.name, result.config);
  if (result.amnezia_overrides) {
    const aErr = validateAmneziaSettings(result.amnezia_overrides);
    if (aErr) return errorResponse(`Invalid Amnezia settings: ${aErr}`);
    account.amnezia_overrides = result.amnezia_overrides;
  }

  if (!(await storeAccount(env, account))) {
    return errorResponse('Failed to save account', 500);
  }

  return jsonResponse(sanitizeAccount(account), 201);
}

async function handleAccountList(env) {
  const accounts = await listAccounts(env);
  return jsonResponse(accounts.map(sanitizeAccount));
}

async function handleAccountGet(id, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);
  return jsonResponse(sanitizeAccount(account));
}

async function purgeAggTokensForGroups(request, env, groups) {
  const clean = [...new Set((groups || []).filter(g => typeof g === 'string' && g))];
  if (clean.length === 0) return;
  let aggs;
  try {
    aggs = await listAggRecords(env);
  } catch {
    return;
  }
  const wanted = new Set(clean.map(g => sanitizeGroupName(g)));
  const affected = aggs
    .filter(r => Array.isArray(r.groups) && r.groups.some(g => wanted.has(sanitizeGroupName(g))))
    .map(r => r.token);
  await purgeCachedSubscriptions(new URL(request.url).origin, affected);
}

async function handleAccountUpdate(id, request, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  // changed = anything mutated (needs KV write); outputChanged = fields that feed
  // generated subscriptions (need aggregate-cache purge too)
  let changed = false;
  let outputChanged = false;
  const previousGroup = account.group || null;

  if (body.name !== undefined) {
    const nameErr = validateName(body.name);
    if (nameErr) return errorResponse(nameErr);
    const name = body.name.trim();
    if (account.name !== name) {
      account.name = name;
      changed = true;
      outputChanged = true;
    }
  }

  if (body.endpoint_list !== undefined) {
    const epErr = validateEndpointList(body.endpoint_list);
    if (epErr) return errorResponse(epErr);
    if (body.endpoint_list.type === 'preset') {
      const presets = await loadPresets(env);
      const pid = body.endpoint_list.preset_id;
      if (!presets.some(p => p.id === pid) && !DEFAULT_PRESETS.some(p => p.id === pid)) {
        return errorResponse('Unknown preset', 400);
      }
    }
    if (JSON.stringify(account.endpoint_list) !== JSON.stringify(body.endpoint_list)) {
      account.endpoint_list = body.endpoint_list;
      changed = true;
      outputChanged = true;
    }
  }

  if (body.amnezia_overrides !== undefined) {
    if (body.amnezia_overrides !== null) {
      const aErr = validateAmneziaSettings(body.amnezia_overrides);
      if (aErr) return errorResponse(`Amnezia overrides: ${aErr}`);
    }
    if (JSON.stringify(account.amnezia_overrides ?? null) !== JSON.stringify(body.amnezia_overrides ?? null)) {
      account.amnezia_overrides = body.amnezia_overrides;
      changed = true;
      outputChanged = true;
    }
  }

  if (body.dns !== undefined) {
    const dnsErr = validateDns(body.dns);
    if (dnsErr) return errorResponse(dnsErr);
    const dns = normalizeDns(body.dns);
    if ((account.dns || null) !== dns) {
      account.dns = dns;
      changed = true;
      outputChanged = true;
    }
  }

  if (body.group !== undefined) {
    if (body.group === null || body.group === '') {
      if (account.group) {
        delete account.group;
        changed = true;
        outputChanged = true;
      }
    } else {
      if (typeof body.group !== 'string') return errorResponse('Group tag must be a string');
      const g = sanitizeGroupName(body.group);
      const gErr = validateGroupTag(g);
      if (gErr) return errorResponse(gErr);
      if (account.group !== g) {
        account.group = g;
        changed = true;
        outputChanged = true;
      }
    }
  }

  if (body.tokenMeta !== undefined) {
    const tmErr = validateTokenMeta(body.tokenMeta, new Date(), account.tokenMeta);
    if (tmErr) return errorResponse(tmErr);
    if (body.tokenMeta === null) {
      if (Object.keys(account.tokenMeta || {}).length > 0) {
        account.tokenMeta = {};
        changed = true;
      }
    } else {
      const nextMeta = Object.assign({}, account.tokenMeta || {});
      const incoming = body.tokenMeta;
      if (incoming.label !== undefined) {
        const label = incoming.label === null ? '' : sanitizeTokenLabel(incoming.label);
        if (label) nextMeta.label = label; else delete nextMeta.label;
      }
      if (incoming.expiresAt !== undefined) {
        if (incoming.expiresAt === null) delete nextMeta.expiresAt;
        else nextMeta.expiresAt = new Date(incoming.expiresAt).toISOString();
      }
      if (incoming.disabled !== undefined) {
        if (incoming.disabled === null) delete nextMeta.disabled;
        else nextMeta.disabled = incoming.disabled;
      }
      if (JSON.stringify(nextMeta) !== JSON.stringify(account.tokenMeta || {})) {
        account.tokenMeta = nextMeta;
        changed = true;
      }
    }
  }

  if (!changed) return jsonResponse(sanitizeAccount(account));

  if (!(await kvPut(env, `account:${account.id}`, JSON.stringify(account)))) {
    return errorResponse('Failed to save account', 500);
  }

  if (outputChanged) {
    await purgeAggTokensForGroups(request, env, [previousGroup, account.group]);
  }

  await purgeCachedSubscriptions(new URL(request.url).origin, [account.token]);

  return jsonResponse(sanitizeAccount(account));
}

async function handleAccountDelete(id, request, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  const previousGroup = account.group || null;

  if (!(await deleteAccount(env, account))) {
    return errorResponse('Failed to delete account', 500);
  }

  await purgeAggTokensForGroups(request, env, [previousGroup]);
  await purgeCachedSubscriptions(new URL(request.url).origin, [account.token]);

  return jsonResponse({ success: true });
}

async function handleAccountRegenerateToken(id, request, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  // Order matters: map the new token FIRST, then flip the account record, then
  // retire the old mapping — a failure at any step leaves a working state behind.
  const oldToken = account.token;
  const newToken = crypto.randomUUID();

  if (!(await kvPut(env, `token:${newToken}`, account.id))) {
    return errorResponse('Failed to regenerate token', 500);
  }
  account.token = newToken;
  if (!(await kvPut(env, `account:${account.id}`, JSON.stringify(account)))) {
    await kvDelete(env, `token:${newToken}`);
    return errorResponse('Failed to regenerate token', 500);
  }
  await kvDelete(env, `token:${oldToken}`);

  await purgeCachedSubscriptions(new URL(request.url).origin, [oldToken]);

  return jsonResponse({ token: account.token });
}

// --- Subscription Helpers (Tasks 9-11) ---

async function resolveToken(token, env) {
  const accountId = await kvGet(env, `token:${token}`);
  if (accountId) {
    const account = await kvGet(env, `account:${accountId}`, { type: 'json' });
    if (!account) return { error: 'Account no longer exists', status: 404 };
    return { account };
  }
  const agg = await kvGet(env, `${AGG_KEY_PREFIX}${token}`, { type: 'json' });
  if (agg && typeof agg === 'object' && Array.isArray(agg.groups)) {
    return { agg };
  }
  return { error: 'Subscription not found', status: 404 };
}

async function incrementFetchCount(env, record, ctx, keyPath) {
  // Re-read and merge into the FRESH record — the caller's snapshot may be stale
  // by the time this deferred write lands (admin edits must not be resurrected).
  // ponytail: concurrent fetches can still undercount (last-write-wins); a
  // dedicated counter key is the fix if exact counts ever matter.
  const path = keyPath || `account:${record.id}`;
  const write = (async () => {
    try {
      const fresh = await env.WARP_KV.get(path, { type: 'json' });
      if (!fresh) return;
      fresh.fetchCount = (Number(fresh.fetchCount) || 0) + 1;
      await env.WARP_KV.put(path, JSON.stringify(fresh));
    } catch {
    }
  })();
  if (ctx && typeof ctx.waitUntil === 'function') {
    try {
      ctx.waitUntil(write);
    } catch {
      await write;
    }
    return;
  }
  await write;
}

function validateAccountConfigShape(cfg) {
  if (!cfg || typeof cfg !== 'object') return 'missing config';
  if (typeof cfg.private_key !== 'string' || !cfg.private_key) return 'missing private_key';
  if (!cfg.addresses || typeof cfg.addresses !== 'object') return 'missing addresses';
  if (typeof cfg.peer_public_key !== 'string' || !cfg.peer_public_key) return 'missing peer_public_key';
  return null;
}

async function expandEndpoints(account, env, presetsHint = null) {
  const configErr = validateAccountConfigShape(account.config);
  if (configErr) return { error: `Account configuration is invalid (${configErr})`, status: 500 };

  let endpoints;
  let presetDns = null;

  if (account.endpoint_list.type === 'preset') {
    // presetsHint lets aggregate serving read 'presets' ONCE for all members
    const presets = presetsHint || await loadPresets(env);
    // Fall back to seed presets: 'default' may have been legitimately deleted
    // while unused, but new accounts still reference it as the default.
    const preset = presets.find(p => p.id === account.endpoint_list.preset_id) ||
                   DEFAULT_PRESETS.find(p => p.id === account.endpoint_list.preset_id);
    if (!preset) return { error: 'Endpoint preset missing', status: 500 };
    endpoints = applyPreferredOrder(preset.endpoints, preset.preferredOrder);
    presetDns = normalizeDns(preset.dns);
  } else {
    endpoints = account.endpoint_list.custom_endpoints;
  }

  const dns = normalizeDns(account.dns) || presetDns || DEFAULT_DNS;

  // Dedupe by ip:port once here so proxy/outbound names can't collide in ANY format
  const seen = new Set();
  const rows = [];
  for (const ep of endpoints) {
    if (!ep || typeof ep !== 'object' || ep.ip === undefined || ep.ip === null || ep.port === undefined) continue;
    const bareIp = normalizeEndpointIp(String(ep.ip));
    const key = `${bareIp}:${ep.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      name: account.name,
      endpoint: bareIp.includes(':') ? `[${bareIp}]:${ep.port}` : `${bareIp}:${ep.port}`,
      ip: bareIp,
      port: ep.port,
      private_key: account.config.private_key,
      addresses: account.config.addresses,
      peer_public_key: account.config.peer_public_key,
      mtu: account.config.mtu,
      reserved: account.config.reserved
    });
  }

  // Normalize derived fields ONCE so every generator consumes identical shapes
  const configs = rows.map(cfg => ({
    ...cfg,
    dns,
    addressList: [cfg.addresses.ipv4, cfg.addresses.ipv6].filter(Boolean),
    addressCidr: [cfg.addresses.ipv4, cfg.addresses.ipv6]
      .filter(Boolean)
      .map(addr => addr.includes('/') ? addr : addr.includes(':') ? `${addr}/128` : `${addr}/32`),
    v4Host: cfg.addresses.ipv4 ? cfg.addresses.ipv4.replace(/\/\d+$/, '') : '',
    v6Host: cfg.addresses.ipv6 ? cfg.addresses.ipv6.replace(/\/\d+$/, '') : '',
    tag: rows.length > 1 ? `${cfg.name} ${cfg.ip}:${cfg.port}` : cfg.name,
    allowedIps: ['0.0.0.0/0', '::/0']
  }));

  return { configs };
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function amneziaSet(v) {
  if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'string' && /^\d+-\d+$/.test(v)) return true; // range string counts as set
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

function resolveAmnezia(account, globalAmnezia) {
  return { ...DEFAULT_AMNEZIA, ...globalAmnezia, ...account.amnezia_overrides };
}

function textEncoderEncode(text) {
  return new TextEncoder().encode(text);
}

function generateWireGuardConf(configs, amneziaParams = null) {
  const files = {};

  for (const cfg of configs) {
    const filename = `${sanitizeFilename(cfg.name)}-${sanitizeFilename(cfg.ip)}-${cfg.port}.conf`;

    let content = `[Interface]\n`;
    content += `PrivateKey = ${cfg.private_key}\n`;
    content += `Address = ${cfg.addressList.join(', ')}\n`;
    content += `DNS = ${cfg.dns}\n`;
    content += `MTU = ${cfg.mtu}\n`;

    if (amneziaParams) {
      const p = amneziaParams;
      const i1 = typeof p.I1 === 'string' && AWG_INIT_PACKET_RE.test(p.I1.trim()) ? p.I1.trim() : '';
      const hasAmnezia = [p.Jc, p.Jmin, p.Jmax, p.S1, p.S2, p.S3, p.S4, p.H1, p.H2, p.H3, p.H4].some(amneziaSet) || i1 !== '';
      if (hasAmnezia) {
        if (amneziaSet(p.Jc)) content += `Jc = ${p.Jc}\n`;
        if (amneziaSet(p.Jmin)) content += `Jmin = ${p.Jmin}\n`;
        if (amneziaSet(p.Jmax)) content += `Jmax = ${p.Jmax}\n`;
        if (amneziaSet(p.S1)) content += `S1 = ${p.S1}\n`;
        if (amneziaSet(p.S2)) content += `S2 = ${p.S2}\n`;
        if (amneziaSet(p.S3)) content += `S3 = ${p.S3}\n`;
        if (amneziaSet(p.S4)) content += `S4 = ${p.S4}\n`;
        if (amneziaSet(p.H1)) content += `H1 = ${p.H1}\n`;
        if (amneziaSet(p.H2)) content += `H2 = ${p.H2}\n`;
        if (amneziaSet(p.H3)) content += `H3 = ${p.H3}\n`;
        if (amneziaSet(p.H4)) content += `H4 = ${p.H4}\n`;
        if (i1) content += `I1 = ${i1}\n`;
      }
    }

    content += `\n[Peer]\n`;
    content += `PublicKey = ${cfg.peer_public_key}\n`;
    content += `AllowedIPs = ${cfg.allowedIps.join(', ')}\n`;
    content += `Endpoint = ${cfg.endpoint}\n`;
    content += `PersistentKeepalive = ${WG_KEEPALIVE}\n`;
    if (cfg.reserved && cfg.reserved.some(b => b > 0)) {
      content += `# Reserved = ${cfg.reserved.join(',')}\n`;
    }

    files[filename] = textEncoderEncode(content);
  }

  return zipSync(files);
}

// --- Format Generators (Tasks 12-17) ---

// Task 12: Throne wg:// URI generator (vanilla + Amnezia)
// Format: wg://host:port?private_key=<key>&public_key=<pub>&local_address=<addr1-addr2>&mtu=<mtu>&reserved=<b1-b2-b3>&persistent_keepalive_interval=25#<name>
// Source: throneproj/Throne src/configs/outbounds/wireguard.cpp
// Key: local_address and reserved use DASH (-) separator, NOT comma!
// Key: param names are private_key, public_key (with underscore), NOT pk/peer_pk
// Key: Throne does NOT URL-decode query values — emit base64 keys RAW.
//   Base64 chars (A-Z a-z 0-9 + / =) are all URI-safe in query values, none are & # ? % space.
//   Percent-encoding them (e.g. %2B for +) makes sing-box fail with "illegal base64 data".
function generateThroneUri(configs, amneziaParams = null) {
  const lines = [];

  for (const cfg of configs) {
    // Raw base64 — do NOT encodeURIComponent (Throne passes query values through undecoded)
    const privateKey = cfg.private_key;
    // Addresses use DASH separator per Throne's ParseFromLink: rawLocalAddr.split("-")
    const localAddress = cfg.addressList.join('-');
    const publicKey = cfg.peer_public_key;
    const configName = encodeURIComponent(cfg.name);
    // Reserved uses DASH separator per Throne: rawReserved.split("-")
    const reserved = cfg.reserved ? cfg.reserved.join('-') : '0-0-0';

    // Base parameters for wg:// URI (Throne/NekoBox/Sing-box format)
    let uri = `wg://${cfg.endpoint}?private_key=${privateKey}&public_key=${publicKey}&local_address=${localAddress}&mtu=${cfg.mtu}`;

    // Add AmneziaWG parameters if present. Throne wg:// Amnezia gets junk params
    // (Jc/Jmin/Jmax) only, as plain ints — range strings are skipped. S1/S2 + H1-H4
    // corrupt handshakes against vanilla WARP and are never emitted here.
    if (amneziaParams) {
      const p = amneziaParams;
      const parts = [];
      for (const [key, value] of [['jc', p.Jc], ['jmin', p.Jmin], ['jmax', p.Jmax]]) {
        if (typeof value === 'string' && /^\d+-\d+$/.test(value)) continue;
        if (amneziaSet(value)) parts.push(`${key}=${value}`);
      }
      if (parts.length) {
        uri += `&enable_amnezia=true&${parts.join('&')}`;
      }
    }

    uri += `&persistent_keepalive_interval=${WG_KEEPALIVE}&reserved=${reserved}#${configName}`;

    lines.push(uri);
  }

  return lines.join('\n');
}

// Task 13: wireguard:// URI generator (v2rayN/Xray format)
// Format: wireguard://PrivateKey@host:port?publickey=<key>&address=<addrs>&mtu=<mtu>&reserved=<r,g,b>#<name>
// Source: v2rayN ServiceLib/Handler/Fmt/WireguardFmt.cs
// Key: all query values are UrlEncode'd; reading uses GetQueryDecoded
// Key: private key goes in user info part (UrlEncoded)
function generateWireguardUri(configs) {
  const lines = [];

  for (const cfg of configs) {
    // Private key in user info part, URL-encoded
    const encodedPrivateKey = encodeURIComponent(cfg.private_key);
    const encodedPublicKey = encodeURIComponent(cfg.peer_public_key);
    // Addresses are comma-separated and URL-encoded for v2rayN
    const encodedAddress = encodeURIComponent(cfg.addressList.join(','));
    const encodedReserved = encodeURIComponent(cfg.reserved ? cfg.reserved.join(',') : '0,0,0');
    const configName = encodeURIComponent(cfg.name);

    let uri = `wireguard://${encodedPrivateKey}@${cfg.endpoint}?publickey=${encodedPublicKey}&address=${encodedAddress}&mtu=${cfg.mtu}&reserved=${encodedReserved}`;
    // v2rayN WireguardFmt.cs parses presharedkey; WARP accounts carry "" so it stays omitted
    if (cfg.pre_shared_key) {
      uri += `&presharedkey=${encodeURIComponent(cfg.pre_shared_key)}`;
    }
    uri += `#${configName}`;

    lines.push(uri);
  }

  return lines.join('\n');
}

// Task 14: Sing-box JSON generator (endpoint format — sing-box v1.11+ / Throne 1.13+)
// AWG forks (spoofi/sing-box-awg, amnezia-box) read an `amnezia_wg` object on the
// endpoint/outbound: https://github.com/spoofi/sing-box-awg/blob/main/docs/configuration/endpoint/wireguard.md
function singboxAmneziaBlock(amneziaParams) {
  if (!amneziaParams || typeof amneziaParams !== 'object') return null;
  const p = amneziaParams;
  const isRange = v => typeof v === 'string' && /^\d+-\d+$/.test(v);
  const block = {};
  for (const [key, value] of [
    ['jc', p.Jc], ['jmin', p.Jmin], ['jmax', p.Jmax],
    ['s1', p.S1], ['s2', p.S2], ['s3', p.S3], ['s4', p.S4],
    ['h1', p.H1], ['h2', p.H2], ['h3', p.H3], ['h4', p.H4]
  ]) {
    if (isRange(value)) continue;
    if (amneziaSet(value)) block[key] = Number(value);
  }
  if (typeof p.I1 === 'string' && AWG_INIT_PACKET_RE.test(p.I1.trim())) block.i1 = p.I1.trim();
  return Object.keys(block).length > 0 ? block : null;
}

function generateSingboxJson(configs, amneziaParams = null) {
  const awg = singboxAmneziaBlock(amneziaParams);
  const endpoints = configs.map(cfg => {
    const ep = {
      type: 'wireguard',
      tag: cfg.tag,
      address: cfg.addressCidr,
      private_key: cfg.private_key,
      mtu: cfg.mtu,
      workers: 4,
      peers: [{
        address: cfg.ip,
        port: cfg.port,
        public_key: cfg.peer_public_key,
        allowed_ips: cfg.allowedIps,
        persistent_keepalive_interval: WG_KEEPALIVE,
        reserved: cfg.reserved
      }]
    };
    if (awg) ep.amnezia_wg = { ...awg };
    return ep;
  });
  const route = endpoints.length ? { final: endpoints[0].tag } : {};
  return JSON.stringify({ endpoints, route }, null, 2);
}

// Legacy sing-box outbound format for NekoBox / Hiddify / sing-box ≤1.10
function generateSingboxLegacyJson(configs, amneziaParams = null) {
  const awg = singboxAmneziaBlock(amneziaParams);
  const outbounds = configs.map(cfg => {
    const ob = {
      type: 'wireguard',
      tag: cfg.tag,
      server: cfg.ip,
      server_port: cfg.port,
      local_address: cfg.addressCidr,
      private_key: cfg.private_key,
      peer_public_key: cfg.peer_public_key,
      pre_shared_key: '',
      mtu: cfg.mtu,
      reserved: cfg.reserved,
      workers: 4
    };
    if (awg) ob.amnezia_wg = { ...awg };
    return ob;
  });
  return JSON.stringify({ outbounds }, null, 2);
}

// Task 15: Xray JSON generator
function generateXrayJson(configs) {
  const outbounds = configs.map(cfg => ({
    protocol: 'wireguard',
    tag: cfg.tag,
    settings: {
      secretKey: cfg.private_key,
      address: cfg.addressList,
      peers: [{
        endpoint: cfg.endpoint,
        publicKey: cfg.peer_public_key,
        preSharedKey: '',
        keepAlive: WG_KEEPALIVE,
        allowedIPs: cfg.allowedIps
      }],
      mtu: cfg.mtu,
      reserved: cfg.reserved
    }
  }));

  return JSON.stringify({ outbounds }, null, 2);
}

// Task 16: Clash YAML generator (Clash Meta / Mihomo format)
// clash-amnezia variant emits `amnezia-wg-option:` per https://wiki.metacubex.one/en/config/proxies/wg/
// Key: mihomo accepts plain ints only — range strings ("100-150") are skipped,
// same conservative policy as the Throne generator. Zeros omitted; H values as strings.
function generateClashYaml(configs, amneziaParams = null) {
  const proxies = configs.map(cfg => {
    const proxy = {
      name: cfg.tag,
      type: 'wireguard',
      server: cfg.ip,
      port: cfg.port
    };
    if (cfg.v4Host) proxy['ip'] = cfg.v4Host;
    if (cfg.v6Host) proxy['ipv6'] = cfg.v6Host;
    proxy['private-key'] = cfg.private_key;
    proxy['public-key'] = cfg.peer_public_key;
    proxy['allowed-ips'] = cfg.allowedIps;
    proxy.udp = true;
    proxy.reserved = cfg.reserved ? cfg.reserved.slice() : [0, 0, 0];
    proxy.mtu = cfg.mtu;
    proxy['persistent-keepalive'] = WG_KEEPALIVE;

    if (amneziaParams) {
      const p = amneziaParams;
      const awg = {};
      const isRange = v => typeof v === 'string' && /^\d+-\d+$/.test(v);
      for (const [key, value] of [['jc', p.Jc], ['jmin', p.Jmin], ['jmax', p.Jmax], ['s1', p.S1], ['s2', p.S2]]) {
        if (!amneziaSet(value) || isRange(value)) continue;
        awg[key] = Number(value);
      }
      for (const [key, value] of [['h1', p.H1], ['h2', p.H2], ['h3', p.H3], ['h4', p.H4]]) {
        if (!amneziaSet(value) || isRange(value)) continue;
        awg[key] = String(value);
      }
      if (Object.keys(awg).length > 0) proxy['amnezia-wg-option'] = awg;
    }

    return proxy;
  });

  return YAML.dump({ proxies }, { lineWidth: -1 });
}

// Task 17: V2RayN base64 generator
function generateV2raynBase64(configs) {
  const uris = generateWireguardUri(configs);
  return btoa(uris);
}

// --- iOS INI/YAML generators (C2 P1): Surge / Loon / Surfboard / Egern ---
// All vanilla WG (no Amnezia); consume the normalize-once cfg shape
// (v4Host/v6Host/addresses/endpoint already bracketed for IPv6).

function reservedTriplet(reserved) {
  return Array.isArray(reserved) && reserved.length === 3 ? reserved : [0, 0, 0];
}

function splitDnsStack(dns) {
  const parts = String(dns || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    v4: parts.find(p => !p.includes(':')) || '',
    v6: parts.find(p => p.includes(':')) || ''
  };
}

// Surge: https://manual.nssurge.com/policy/wireguard.html
// Dual-section INI: one [Proxy] line + one [WireGuard <tag>] section per config.
// client-id is the reserved bytes in slash form (b1/b2/b3).
function generateSurgeConf(configs) {
  const proxyLines = [];
  const sections = [];

  for (const cfg of configs) {
    proxyLines.push(`${cfg.tag} = wireguard, section-name=${cfg.tag}`);

    const lines = [`private-key = ${cfg.private_key}`];
    if (cfg.v4Host) lines.push(`self-ip = ${cfg.v4Host}`);
    if (cfg.addresses.ipv6) lines.push(`self-ip-v6 = ${cfg.addresses.ipv6}`);
    if (cfg.dns) lines.push(`dns-server = ${cfg.dns}`);
    lines.push(`mtu = ${cfg.mtu}`);
    const reserved = reservedTriplet(cfg.reserved);
    lines.push(`peer = (public-key = ${cfg.peer_public_key}, allowed-ips = "${cfg.allowedIps.join(', ')}", endpoint = ${cfg.endpoint}, keepalive = ${WG_KEEPALIVE}, client-id = ${reserved.join('/')})`);

    sections.push(`[WireGuard ${cfg.tag}]\n${lines.join('\n')}`);
  }

  return `[Proxy]\n${proxyLines.join('\n')}\n\n${sections.join('\n\n')}\n`;
}

// Loon: one-liner per config, comma-joined params, quoted keys.
// peers=[{...}] closes after reserved; DNS split into dns= (v4/domain) + dnsv6=.
// Source: github.com/As-Lucky/Lucky Lucky-Loon.conf / nsloon.app
function generateLoonConf(configs) {
  const lines = [];

  for (const cfg of configs) {
    const parts = [];
    if (cfg.v4Host) parts.push(`interface-ip=${cfg.v4Host}`);
    if (cfg.v6Host) parts.push(`interface-ipv6=${cfg.v6Host}`);
    parts.push(`private-key="${cfg.private_key}"`);
    if (cfg.mtu !== undefined && cfg.mtu !== null) parts.push(`mtu=${cfg.mtu}`);
    const { v4, v6 } = splitDnsStack(cfg.dns);
    if (v4) parts.push(`dns=${v4}`);
    if (v6) parts.push(`dnsv6=${v6}`);
    parts.push(`keepalive=${WG_KEEPALIVE}`);
    const reserved = reservedTriplet(cfg.reserved);
    parts.push(`peers=[{public-key="${cfg.peer_public_key}",allowed-ips="${cfg.allowedIps.join(', ')}",endpoint=${cfg.endpoint},reserved=[${reserved.join(',')}]}]`);
    lines.push(`${cfg.tag} = wireguard,${parts.join(',')}`);
  }

  return `[Proxy]\n${lines.join('\n')}\n`;
}

// Surfboard: same dual-section shape as Surge but no client-id and bare
// self-ip-v6 per getsurfboard.com/docs/profile-format/proxy/external-proxy/wireguard
function generateSurfboardConf(configs) {
  const proxyLines = [];
  const sections = [];

  for (const cfg of configs) {
    proxyLines.push(`${cfg.tag} = wireguard, section-name=${cfg.tag}`);

    const lines = [`private-key = ${cfg.private_key}`];
    if (cfg.v4Host) lines.push(`self-ip = ${cfg.v4Host}`);
    if (cfg.v6Host) lines.push(`self-ip-v6 = ${cfg.v6Host}`);
    if (cfg.dns) lines.push(`dns-server = ${cfg.dns}`);
    lines.push(`mtu = ${cfg.mtu}`);
    lines.push(`peer = (public-key = ${cfg.peer_public_key}, allowed-ips = "${cfg.allowedIps.join(', ')}", endpoint = ${cfg.endpoint}, keepalive = ${WG_KEEPALIVE})`);

    sections.push(`[WireGuard ${cfg.tag}]\n${lines.join('\n')}`);
  }

  return `[Proxy]\n${proxyLines.join('\n')}\n\n${sections.join('\n\n')}\n`;
}

// Egern: YAML proxies list with snake_case wireguard keys.
// local_ipv4/local_ipv6 keep their CIDR; omit whichever stack is absent.
// Source: egernapp.com/docs/configuration/proxies
function generateEgernYaml(configs) {
  const proxies = configs.map(cfg => {
    const wg = {
      name: cfg.tag,
      server: cfg.ip,
      port: cfg.port
    };
    wg.private_key = cfg.private_key;
    wg.peer_public_key = cfg.peer_public_key;
    if (cfg.addresses.ipv4) wg.local_ipv4 = cfg.addresses.ipv4;
    if (cfg.addresses.ipv6) wg.local_ipv6 = cfg.addresses.ipv6;
    wg.reserved = reservedTriplet(cfg.reserved).slice();
    return { wireguard: wg };
  });

  return YAML.dump({ proxies }, { lineWidth: -1 });
}

// --- Subscription Cache (Workers Cache API) ---

function subscriptionCacheRequest(request, token, format) {
  const origin = new URL(request.url).origin;
  return new Request(`${origin}/sub/${token}/${format}`);
}

async function cacheMatchSubscription(cacheReq) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    return (await caches.default.match(cacheReq)) || null;
  } catch {
    return null;
  }
}

async function cachePutSubscription(cacheReq, response) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return false;
    await caches.default.put(cacheReq, response);
    return true;
  } catch {
    return false;
  }
}

function buildPurgeUrls(tokens, formats, origin = '') {
  const base = String(origin || '').replace(/\/+$/, '');
  const urls = [];
  const seen = new Set();
  for (const token of Array.isArray(tokens) ? tokens : []) {
    if (!token || typeof token !== 'string') continue;
    for (const format of Array.isArray(formats) ? formats : []) {
      const url = `${base}/sub/${token}/${format}`;
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

async function purgeCachedSubscriptions(origin, tokens) {
  const urls = buildPurgeUrls(tokens, Object.keys(FORMATS), origin);
  let purged = 0;
  await Promise.all(urls.map(async url => {
    try {
      if (typeof caches !== 'undefined' && caches.default && await caches.default.delete(new Request(url))) purged++;
    } catch {
    }
  }));
  return { total: urls.length, purged };
}

async function purgeAllCachedSubscriptions(request, env) {
  let tokens = [];
  try {
    const accounts = await listAccounts(env);
    tokens = accounts.map(a => a.token);
    try {
      const aggs = await listAggRecords(env);
      for (const rec of aggs) {
        if (rec && typeof rec.token === 'string' && rec.token) tokens.push(rec.token);
      }
    } catch {}
  } catch {
  }
  return await purgeCachedSubscriptions(new URL(request.url).origin, tokens);
}

// --- Subscription Route Handlers ---

const FORMATS = {
  'wireguard-conf': { contentType: 'application/zip', ext: 'zip', binary: true, needsAmnezia: false, gen: generateWireGuardConf },
  'wireguard-conf-amnezia': { contentType: 'application/zip', ext: 'zip', binary: true, needsAmnezia: true, gen: generateWireGuardConf },
  'throne': { contentType: 'text/plain; charset=utf-8', ext: 'txt', binary: false, needsAmnezia: false, gen: generateThroneUri },
  'throne-amnezia': { contentType: 'text/plain; charset=utf-8', ext: 'txt', binary: false, needsAmnezia: true, gen: generateThroneUri },
  'wireguard-uri': { contentType: 'text/plain; charset=utf-8', ext: 'txt', binary: false, needsAmnezia: false, gen: generateWireguardUri },
  'singbox': { contentType: 'application/json', ext: 'json', binary: false, needsAmnezia: false, gen: generateSingboxJson },
  'singbox-amnezia': { contentType: 'application/json', ext: 'json', binary: false, needsAmnezia: true, gen: generateSingboxJson },
  'singbox-legacy': { contentType: 'application/json', ext: 'json', binary: false, needsAmnezia: false, gen: generateSingboxLegacyJson },
  'singbox-legacy-amnezia': { contentType: 'application/json', ext: 'json', binary: false, needsAmnezia: true, gen: generateSingboxLegacyJson },
  'xray': { contentType: 'application/json', ext: 'json', binary: false, needsAmnezia: false, gen: generateXrayJson },
  'clash': { contentType: 'application/x-yaml; charset=utf-8', ext: 'yaml', binary: false, needsAmnezia: false, gen: generateClashYaml },
  'clash-amnezia': { contentType: 'application/x-yaml; charset=utf-8', ext: 'yaml', binary: false, needsAmnezia: true, gen: generateClashYaml },
  'v2rayn': { contentType: 'text/plain; charset=utf-8', ext: 'txt', binary: false, needsAmnezia: false, gen: generateV2raynBase64 },
  'surge': { contentType: 'text/plain; charset=utf-8', ext: 'conf', binary: false, needsAmnezia: false, gen: generateSurgeConf },
  'loon': { contentType: 'text/plain; charset=utf-8', ext: 'conf', binary: false, needsAmnezia: false, gen: generateLoonConf },
  'surfboard': { contentType: 'text/plain; charset=utf-8', ext: 'conf', binary: false, needsAmnezia: false, gen: generateSurfboardConf },
  'egern': { contentType: 'application/x-yaml; charset=utf-8', ext: 'yaml', binary: false, needsAmnezia: false, gen: generateEgernYaml }
};

function profileTitleValue(label) {
  const s = String(label ?? '').trim();
  if (!s) return null;
  if (/^[\x20-\x7E]+$/.test(s)) return s;
  const bytes = textEncoderEncode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function subscriptionUserinfoValue(expiresAt) {
  let value = 'upload=0; download=0; total=0';
  if (expiresAt) {
    const ts = Date.parse(expiresAt);
    if (Number.isFinite(ts)) value += `; expire=${Math.floor(ts / 1000)}`;
  }
  return value;
}

function subscriptionHeaders(formatInfo, format, safeName, extras = {}) {
  // Cap cache freshness at token expiry so a naturally-expiring token can't keep
  // serving its cached 200 long after expiresAt passes (no purge trigger exists then)
  let maxAge = 300;
  const expiryTs = Date.parse(extras.expiresAt);
  if (Number.isFinite(expiryTs)) {
    maxAge = Math.max(0, Math.min(maxAge, Math.floor((expiryTs - Date.now()) / 1000)));
  }
  const headers = {
    'Content-Type': formatInfo.contentType,
    'Profile-Update-Interval': '24',
    'Cache-Control': `max-age=${maxAge}`,
    'X-WG-Version': VERSION
  };
  const filename = `${safeName}-${format}.${formatInfo.ext}`;
  headers['Content-Disposition'] = `attachment; filename="${filename}"; filename*=utf-8''${filename}`;
  const title = profileTitleValue(extras.label);
  if (title) headers['profile-title'] = title;
  headers['subscription-userinfo'] = subscriptionUserinfoValue(extras.expiresAt);
  if (extras.origin) headers['profile-web-page-url'] = `${extras.origin}/admin`;
  return headers;
}

async function handleSubscription(request, env, params, ctx) {
  const response = await serveSubscription(request, env, params.token, params.format, ctx);
  if (request.method === 'HEAD' && response.body) {
    return new Response(null, { status: response.status, headers: response.headers });
  }
  return response;
}

async function serveSubscription(request, env, token, rawFormat, ctx) {
  const format = rawFormat.replace(/\/+$/, '');

  const formatInfo = FORMATS[format];
  if (!formatInfo) {
    return jsonResponse({ error: 'Unknown format', validFormats: Object.keys(FORMATS) }, 404, { skipNoStore: true });
  }

  const cacheReq = subscriptionCacheRequest(request, token, format);
  const cached = await cacheMatchSubscription(cacheReq);
  if (cached) return cached;

  const resolved = await resolveToken(token, env);
  if (resolved.error) return errorResponse(resolved.error, resolved.status, { skipNoStore: true });

  let memberAccounts;
  let aggRecord = null;
  if (resolved.agg) {
    aggRecord = resolved.agg;
    const aggLifecycle = tokenStatus(aggRecord);
    if (aggLifecycle.state === 'expired') return goneResponse('Subscription expired');
    if (aggLifecycle.state === 'revoked') return goneResponse('Subscription revoked');

    const allAccounts = await listAccounts(env);
    const groupSet = new Set(aggRecord.groups.map(g => sanitizeGroupName(g)));
    memberAccounts = allAccounts.filter(a => {
      if (!a || !a.group) return false;
      if (!groupSet.has(sanitizeGroupName(a.group))) return false;
      return tokenStatus(a).state === 'active';
    });
    if (memberAccounts.length === 0) {
      return errorResponse('No active accounts in this group', 404, { skipNoStore: true });
    }
  } else {
    const lifecycle = tokenStatus(resolved.account);
    if (lifecycle.state === 'expired') return goneResponse('Subscription expired');
    if (lifecycle.state === 'revoked') return goneResponse('Subscription revoked');
    memberAccounts = [resolved.account];
  }

  // One 'presets' read for all members; expansion runs concurrently
  const needsPresets = memberAccounts.some(a => a.endpoint_list && a.endpoint_list.type === 'preset');
  const presetsHint = needsPresets ? await loadPresets(env) : null;
  const expandedResults = await Promise.all(memberAccounts.map(a => expandEndpoints(a, env, presetsHint)));
  for (const expanded of expandedResults) {
    if (expanded.error) return errorResponse(expanded.error, expanded.status, { skipNoStore: true });
  }
  const expandedLists = expandedResults.map(r => r.configs);

  const configs = aggRecord ? expandGroupConfigs(expandedLists) : (expandedLists[0] || []);
  if (configs.length === 0) return errorResponse('Account has no endpoints configured', 500, { skipNoStore: true });

  let amneziaParams = null;
  if (formatInfo.needsAmnezia) {
    const globalRaw = await kvGet(env, 'settings:global', { type: 'json' });
    amneziaParams = resolveAmnezia(memberAccounts[0], globalRaw?.amnezia || null);
  }

  const body = formatInfo.gen(configs, amneziaParams);

  const bytes = body.byteLength !== undefined ? body.byteLength : textEncoderEncode(body).length;

  console.log(JSON.stringify({
    event: 'sub_generated',
    tokenPrefix: token.slice(0, 8),
    format,
    n_configs: configs.length,
    aggregate: !!aggRecord,
    bytes
  }));

  const safeName = aggRecord
    ? (sanitizeFilename(String(aggRecord.label ?? '')) || sanitizeFilename(aggRecord.groups.join('-')) || 'group')
    : (sanitizeFilename(resolved.account.name) || 'warp');
  const tokenMeta = aggRecord ? aggRecord.tokenMeta : resolved.account.tokenMeta;
  const displayLabel = aggRecord
    ? (String(aggRecord.label ?? '').trim() || aggRecord.groups.join(', '))
    : (String(resolved.account.tokenMeta?.label ?? '').trim() || String(resolved.account.name ?? '').trim());
  const headers = subscriptionHeaders(formatInfo, format, safeName, {
    origin: new URL(request.url).origin,
    label: displayLabel,
    expiresAt: tokenMeta?.expiresAt ?? null
  });
  headers['Content-Length'] = String(bytes);

  const response = new Response(body, { status: 200, headers });

  if (request.method === 'GET') {
    await incrementFetchCount(
      env,
      aggRecord || resolved.account,
      ctx,
      aggRecord ? `${AGG_KEY_PREFIX}${aggRecord.token}` : undefined
    );
    const clone = response.clone();
    if (ctx && typeof ctx.waitUntil === 'function') {
      try {
        ctx.waitUntil(cachePutSubscription(cacheReq, clone));
      } catch {
      }
    } else {
      await cachePutSubscription(cacheReq, clone);
    }
  }

  return response;
}

// --- Route Handlers ---

async function handleSetup(request, env) {
  let existing;
  try {
    existing = await env.WARP_KV.get('settings:password');
  } catch {
    return errorResponse('Service temporarily unavailable', 503);
  }
  if (existing) {
    return redirect('/admin/login');
  }

  if (request.method === 'GET') {
    return htmlResponse(SETUP_HTML);
  }

  let formData;
  try { formData = await request.formData(); } catch { return errorResponse('Invalid form data', 400); }

  // Setup secret gate — when ADMIN_SETUP_SECRET is set, require it
  if (env.ADMIN_SETUP_SECRET) {
    const secret = formData.get('secret') || '';
    if (secret !== env.ADMIN_SETUP_SECRET) {
      return redirect('/admin/setup?error=invalid_secret');
    }
  }

  const password = formData.get('password');
  if (!password || password.length < 8 || password.length > 128) {
    return redirect('/admin/setup?error=weak_password');
  }

  const effectivePassword = password.slice(0, PASSWORD_MAX_BYTES);
  let hash;
  try {
    hash = await hashPassword(effectivePassword);
  } catch {
    return errorResponse('Failed to hash password', 500);
  }
  try {
    await env.WARP_KV.put('settings:password', hash);
  } catch {
    return errorResponse('Failed to save password', 500);
  }

  return redirect('/admin/login');
}

async function handleLogin(request, env) {
  if (request.method === 'GET') {
    return htmlResponse(LOGIN_HTML);
  }

  let formData;
  try { formData = await request.formData(); } catch { return errorResponse('Invalid form data', 400); }

  const password = formData.get('password');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  let hash;
  try {
    hash = await env.WARP_KV.get('settings:password');
  } catch {
    return redirect('/admin/login?error=generic');
  }
  if (!hash) {
    return redirect('/admin/setup');
  }

  // Rate limiting: check failed attempts
  const failKey = `auth:fail:${ip}`;
  const fails = parseInt(await kvGet(env, failKey) || '0', 10);
  if (fails >= 5) {
    return redirect(`/admin/login?error=rate_limited&retry=${LOGIN_FAIL_TTL_SECONDS}`);
  }

  const effectivePassword = password ? password.slice(0, PASSWORD_MAX_BYTES) : '';
  let verifyResult;
  try {
    verifyResult = await verifyPassword(effectivePassword, hash);
  } catch {
    return redirect('/admin/login?error=invalid_password');
  }
  if (!verifyResult.valid) {
    await kvPut(env, failKey, String(fails + 1), { expirationTtl: LOGIN_FAIL_TTL_SECONDS });
    return redirect('/admin/login?error=invalid_password');
  }

  // Legacy bcrypt hash → re-hash as PBKDF2 and overwrite (one-time migration)
  if (verifyResult.migratedHash) {
    await kvPut(env, 'settings:password', verifyResult.migratedHash);
  }

  // Clear failure counter on success
  await env.WARP_KV.delete(failKey).catch(() => {});

  let session;
  try {
    session = await createSession(env);
  } catch {
    session = null;
  }
  if (!session) {
    return redirect('/admin/login?error=generic');
  }
  const { token } = session;
  const maxAge = SESSION_TTL_SECONDS;
  const isHttps = new URL(request.url).protocol === 'https:';

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin',
      'Set-Cookie': sessionCookie(token, maxAge, isHttps)
    }
  });
}

async function handleLogout(request, env) {
  const token = parseCookie(request);
  if (token) {
    try {
      await destroySession(token, env);
    } catch {
    }
  }
  const isHttps = new URL(request.url).protocol === 'https:';

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/login',
      'Set-Cookie': clearSessionCookie(isHttps)
    }
  });
}

async function handleDashboard(request) {
  // Dashboard HTML is immutable between deploys and VERSION changes on each deploy,
  // so a matching If-None-Match skips re-sending ~200KB
  const etag = `"${VERSION}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  const res = htmlResponse(DASHBOARD_HTML);
  res.headers.set('ETag', etag);
  return res;
}

async function handleHealthz(env) {
  const started = Date.now();
  let ok = true;
  let error = null;
  try {
    await env.WARP_KV.get('settings:global');
  } catch (err) {
    ok = false;
    error = err && err.name ? err.name : 'UnknownError';
  }
  const payload = { ok, version: VERSION, kv_ms: Date.now() - started };
  if (!ok) payload.error = error;
  return jsonResponse(payload, 200, { skipNoStore: true });
}

// --- Route Table ---

const UUID_SEG = '[a-f0-9-]+';

function compileSegment(seg) {
  if (typeof seg === 'string') {
    if (seg.startsWith('*')) return { type: 'tail', name: seg.slice(1) || 'rest' };
    return { type: 'literal', value: seg };
  }
  const [name, pattern] = Object.entries(seg)[0];
  return { type: 'param', name, re: pattern ? new RegExp(`^(?:${pattern})$`) : null };
}

const ROUTES = [
  { method: '*', segments: [], auth: false, handler: () => redirect('/admin') },
  { method: 'GET', segments: ['healthz'], auth: false, handler: (_req, env) => handleHealthz(env) },
  { method: ['GET', 'POST'], segments: ['admin', 'setup'], auth: false, handler: handleSetup },
  { method: ['GET', 'POST'], segments: ['admin', 'login'], auth: false, handler: handleLogin },
  { method: 'POST', segments: ['admin', 'logout'], auth: true, handler: handleLogout },
  { method: '*', segments: ['admin'], auth: true, handler: handleDashboard },
  { method: 'POST', segments: ['api', 'account', 'generate'], auth: true, handler: handleAccountGenerate },
  { method: 'POST', segments: ['api', 'account', 'import'], auth: true, handler: handleAccountImport },
  { method: 'GET', segments: ['api', 'account'], auth: true, handler: (_req, env) => handleAccountList(env) },
  { method: 'POST', segments: ['api', 'account', { id: UUID_SEG }, 'regenerate-token'], auth: true,
    handler: (req, env, p) => handleAccountRegenerateToken(p.id, req, env) },
  { method: 'GET', segments: ['api', 'account', { id: UUID_SEG }], auth: true,
    handler: (req, env, p) => handleAccountGet(p.id, env) },
  { method: 'PUT', segments: ['api', 'account', { id: UUID_SEG }], auth: true,
    handler: (req, env, p) => handleAccountUpdate(p.id, req, env) },
  { method: 'DELETE', segments: ['api', 'account', { id: UUID_SEG }], auth: true,
    handler: (req, env, p) => handleAccountDelete(p.id, req, env) },
  { method: 'GET', segments: ['api', 'presets'], auth: true, handler: (_req, env) => handlePresetList(env) },
  { method: 'POST', segments: ['api', 'presets'], auth: true, handler: handlePresetCreate },
  { method: 'PUT', segments: ['api', 'presets', { id: '.+' }], auth: true,
    handler: (req, env, p) => handlePresetUpdate(p.id, req, env) },
  { method: 'DELETE', segments: ['api', 'presets', { id: '.+' }], auth: true,
    handler: (req, env, p) => handlePresetDelete(p.id, req, env) },
  { method: 'GET', segments: ['api', 'settings', 'amnezia'], auth: true, handler: (_req, env) => handleAmneziaGet(env) },
  { method: 'PUT', segments: ['api', 'settings', 'amnezia'], auth: true, handler: handleAmneziaUpdate },
  { method: 'GET', segments: ['api', 'settings', 'warpstatus'], auth: true, handler: (_req, env) => handleWarpStatusGet(env) },
  { method: 'POST', segments: ['api', 'backup', 'export'], auth: true, handler: handleBackupExport },
  { method: 'POST', segments: ['api', 'backup', 'import'], auth: true, handler: handleBackupImport },
  { method: 'GET', segments: ['api', 'agg'], auth: true, handler: (_req, env) => handleAggList(env) },
  { method: 'POST', segments: ['api', 'agg'], auth: true, handler: handleAggCreate },
  { method: 'DELETE', segments: ['api', 'agg', { token: '[A-Za-z0-9-]+' }], auth: true,
    handler: (req, env, p) => handleAggDelete(p.token, req, env) },
  { method: ['GET', 'HEAD'], segments: ['sub', { token: UUID_SEG }, '*format'], auth: false, handler: handleSubscription },
  { method: ['GET', 'HEAD'], segments: ['sub', '*rest'], auth: false,
    handler: () => errorResponse('Invalid subscription URL', 400, { skipNoStore: true }) }
];

function withSession(handler) {
  return async (request, env, params, ctx) => {
    const session = await validateSession(request, env);
    if (!session) {
      let passwordSet;
      try {
        passwordSet = await env.WARP_KV.get('settings:password');
      } catch {
        return redirect('/admin/login?error=generic');
      }
      if (!passwordSet) return redirect('/admin/setup');
      return redirect('/admin/login');
    }
    return handler(request, env, params, ctx);
  };
}

const ROUTE_TABLE = ROUTES.map(route => ({
  methods: Array.isArray(route.method) ? route.method : [route.method],
  segments: route.segments.map(compileSegment),
  auth: !!route.auth,
  handler: route.auth ? withSession(route.handler) : route.handler
}));

function matchRouteSegments(compiled, segs) {
  const params = {};
  for (let i = 0; i < compiled.length; i++) {
    const pat = compiled[i];
    const seg = segs[i];
    if (pat.type === 'tail') {
      const rest = segs.slice(i).join('/');
      if (!rest) return null;
      params[pat.name] = rest;
      return params;
    }
    if (seg === undefined) return null;
    if (pat.type === 'param') {
      if (!pat.re.test(seg)) return null;
      params[pat.name] = seg;
    } else if (seg !== pat.value) {
      return null;
    }
  }
  return compiled.length === segs.length ? params : null;
}

async function dispatchRequest(request, env, ctx, routes) {
  const url = new URL(request.url);
  const path = url.pathname;
  const segs = path === '/' ? [] : path.slice(1).split('/');

  let pathMatched = false;
  const allowedMethods = [];

  for (const route of routes) {
    const params = matchRouteSegments(route.segments, segs);
    if (!params) continue;
    pathMatched = true;
    const acceptsMethod = route.methods.includes('*') || route.methods.includes(request.method);
    if (!acceptsMethod) {
      for (const m of route.methods) {
        if (!allowedMethods.includes(m)) allowedMethods.push(m);
      }
      continue;
    }
    return await route.handler(request, env, params, ctx);
  }

  if (pathMatched) {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        Allow: allowedMethods.join(', ')
      }
    });
  }

  if (path.startsWith('/api/')) return errorResponse('API not implemented yet', 501);
  return errorResponse('Not Found', 404);
}

// --- Main Router ---

async function handleRequest(request, env, ctx) {
  await initializeKV(env);
  return await dispatchRequest(request, env, ctx, ROUTE_TABLE);
}

function classifyRoute(pathname) {
  if (pathname === '/healthz') return 'health';
  if (pathname.startsWith('/sub/')) return 'sub';
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname.startsWith('/admin/setup')) return 'setup';
  if (pathname.startsWith('/admin/login')) return 'login';
  if (pathname.startsWith('/admin')) return 'admin';
  return 'other';
}

export default {
  async fetch(request, env, ctx) {
    const startMs = Date.now();
    let response;
    try {
      response = await handleRequest(request, env, ctx);
    } catch (err) {
      console.error(JSON.stringify({ event: 'worker_error', message: err && err.message, stack: err && err.stack }));
      response = errorResponse('Internal Server Error', 500);
    }
    console.log(JSON.stringify({
      route: classifyRoute(new URL(request.url).pathname),
      method: request.method,
      status: response.status,
      ms: Date.now() - startMs
    }));
    return response;
  }
};

// --- Test harness exports (additive; Workers ignores extra named exports) ---

export {
  parseWireGuardConf,
  parseWgUri,
  parseAddresses,
  parseAddressPair,
  isValidIpv6Part,
  validateName,
  validateIPv4OrIPv6OrDomain,
  validatePort,
  validateAmneziaSettings,
  validateEndpointList,
  validateWarpAddresses,
  warpRetryDecision,
  normalizeEndpointIp,
  expandEndpoints,
  generateWireGuardConf,
  generateThroneUri,
  generateWireguardUri,
  generateSingboxJson,
  generateSingboxLegacyJson,
  generateXrayJson,
  generateClashYaml,
  generateV2raynBase64,
  generateSurgeConf,
  generateLoonConf,
  generateSurfboardConf,
  generateEgernYaml,
  sanitizeFilename,
  resolveAmnezia,
  buildPurgeUrls,
  classifyRoute,
  createSession,
  storeAccount,
  dispatchRequest,
  fetchAccountsBatched,
  validateDns,
  normalizeDns,
  parseEndpointLine,
  parseEndpointBulk,
  validateAmneziaValues,
  deepLinkUrl,
  formatsForClient,
  zipFindEntry,
  tokenStatus,
  validateTokenMeta,
  buildBackupPayload,
  validateBackupPayloadStructure,
  validateBackupAccount,
  validateBackupPassword,
  mergeAccounts,
  applyPreferredOrder,
  expandGroupConfigs,
  sanitizeGroupName,
  validateGroupTag,
  validateAggRecord,
  validatePreferredOrder,
  sanitizePreferredOrder,
  registerWarpAccount,
  encryptBackupJson,
  decryptBackupBytes,
  subscriptionHeaders,
  profileTitleValue,
  subscriptionUserinfoValue
};

export function testHooks() {
  return {
    FORMATS, VERSION, DEFAULT_DNS, ROUTES, ROUTE_TABLE,
    parseEndpointLine, parseEndpointBulk, validateAmneziaValues,
    AMNEZIA_UI_PRESETS, DASHBOARD_HTML, CLIENT_HELPERS_JS,
    deepLinkUrl, formatsForClient, zipFindEntry, tokenStatus, validateTokenMeta,
    buildBackupPayload, validateBackupPayloadStructure, validateBackupAccount,
    validateBackupPassword, mergeAccounts, applyPreferredOrder, expandGroupConfigs,
    sanitizeGroupName, validateGroupTag, validateAggRecord,
    validatePreferredOrder, sanitizePreferredOrder
  };
}
