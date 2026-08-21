import bcrypt from 'bcryptjs';
import { x25519 } from '@noble/curves/ed25519';
import { zipSync } from 'fflate';
import YAML from 'js-yaml';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'session';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_HASH_BITS = 256;
const PBKDF2_SALT_BYTES = 16;
const PASSWORD_MAX_BYTES = 72;
const WARP_API_VERSION = 'v0a4005';
const WARP_API_BASE = `https://api.cloudflareclient.com/${WARP_API_VERSION}`;
const WARP_API_TIMEOUT = 10000;
const WARP_PEER_PUBLIC_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';
const WG_MTU = 1280;
const WG_KEEPALIVE = 25;
const MAX_ENDPOINTS = 200;

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

const DEFAULT_AMNEZIA = { Jc: 5, Jmin: 50, Jmax: 1000, S1: 0, S2: 0, H1: 0, H2: 0, H3: 0, H4: 0 };

const DEFAULT_SETTINGS_GLOBAL = {
  amnezia: DEFAULT_AMNEZIA
};

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator - Setup</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M18.5 5L9 18h6l-1.5 9L23 14h-6z' fill='white' opacity='0.95'/%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }
    @keyframes glow-pulse {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.7; }
    }
    .animate-fade-in {
      animation: fade-in 0.4s ease-out both;
    }
    .animate-delay-1 { animation-delay: 0.1s; }
    .animate-delay-2 { animation-delay: 0.2s; }
    .strength-bar { transition: width 0.3s ease, background-color 0.3s ease; }
  </style>
</head>
<body class="bg-[#070b14] text-gray-100 min-h-screen flex items-center justify-center relative overflow-hidden">

  <!-- Background glow -->
  <div class="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/10 blur-[120px]" style="animation: glow-pulse 6s ease-in-out infinite;"></div>
    <div class="absolute top-1/4 left-1/4 w-[300px] h-[300px] rounded-full bg-cyan-500/5 blur-[100px]"></div>
  </div>

  <div class="relative z-10 w-full max-w-md mx-4">

    <!-- Logo tile + brand -->
    <div class="flex items-center justify-center gap-3 mb-8 animate-fade-in">
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
        <svg class="w-5 h-5 text-white" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M11.5 2L4 12h5.5L7.5 18 14 8H8.5L11.5 2z"/>
        </svg>
      </div>
      <span class="text-lg font-semibold tracking-tight">Warp Generator</span>
    </div>

    <!-- Card -->
    <div class="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-8 shadow-2xl shadow-black/40 animate-fade-in animate-delay-1">
      <h1 class="text-xl font-semibold text-center mb-1">Create admin password</h1>
      <p class="text-sm text-gray-400 text-center mb-6">You only need to do this once</p>

      <form method="POST" action="/admin/setup" id="setupForm" novalidate>

        <!-- Password field -->
        <div class="mb-4">
          <label for="password" class="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
          <div class="relative">
            <input
              type="password"
              id="password"
              name="password"
              required
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              autofocus
              class="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
              placeholder="Min 8 characters"
              aria-label="Password"
            >
            <button
              type="button"
              id="togglePw"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
              aria-label="Toggle password visibility"
              tabindex="-1"
            >
              <svg class="w-5 h-5" id="eyeOpen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg class="w-5 h-5 hidden" id="eyeClosed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <!-- Strength indicator -->
          <div class="mt-2 flex items-center gap-2">
            <div class="flex-1 h-1 rounded-full bg-white/10 overflow-hidden">
              <div id="strengthBar" class="h-full strength-bar rounded-full bg-gray-500 w-0"></div>
            </div>
            <span id="strengthText" class="text-xs text-gray-500 min-w-[60px] text-right"></span>
          </div>
        </div>

        <!-- Confirm field -->
        <div class="mb-5">
          <label for="confirm" class="block text-sm font-medium text-gray-300 mb-1.5">Confirm password</label>
          <div class="relative">
            <input
              type="password"
              id="confirm"
              name="confirm"
              required
              minlength="8"
              maxlength="128"
              autocomplete="new-password"
              class="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
              placeholder="Re-enter password"
              aria-label="Confirm password"
            >
            <button
              type="button"
              id="toggleCf"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
              aria-label="Toggle confirm password visibility"
              tabindex="-1"
            >
              <svg class="w-5 h-5" id="eyeOpenCf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg class="w-5 h-5 hidden" id="eyeClosedCf" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Setup secret field (optional — only required when server sets ADMIN_SETUP_SECRET) -->
        <div class="mb-5">
          <label for="secret" class="block text-sm font-medium text-gray-300 mb-1.5">Setup secret <span class="text-gray-500 font-normal">(if configured)</span></label>
          <div class="relative">
            <input
              type="password"
              id="secret"
              name="secret"
              autocomplete="off"
              class="w-full px-4 py-2.5 pr-11 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all"
              placeholder="Leave empty if not required"
              aria-label="Setup secret"
            >
            <button
              type="button"
              id="toggleSecret"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors"
              aria-label="Toggle setup secret visibility"
              tabindex="-1"
            >
              <svg class="w-5 h-5" id="eyeOpenSecret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg class="w-5 h-5 hidden" id="eyeClosedSecret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Error alert (hidden by default, shown via server redirect or client validation) -->
        <div id="error" class="hidden mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center gap-2" role="alert">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
          </svg>
          <span id="errorText"></span>
        </div>

        <!-- Submit -->
        <button type="submit" id="submitBtn"
          class="w-full py-2.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          <span id="btnLabel">Set Password</span>
          <svg id="btnSpinner" class="w-4 h-4 animate-spin hidden" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        </button>
      </form>
    </div>

    <!-- Footer link -->
    <p class="text-center text-sm text-gray-500 mt-6 animate-fade-in animate-delay-2">
      Already set up?
      <a href="/admin/login" class="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors">Go to login</a>
    </p>
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
    function wireToggle(btnId, inputId, openId, closedId) {
      var btn = document.getElementById(btnId);
      var inp = document.getElementById(inputId);
      var open = document.getElementById(openId);
      var closed = document.getElementById(closedId);
      btn.addEventListener('click', function() {
        var isPw = inp.type === 'password';
        inp.type = isPw ? 'text' : 'password';
        open.classList.toggle('hidden', !isPw);
        closed.classList.toggle('hidden', isPw);
      });
    }
    wireToggle('togglePw', 'password', 'eyeOpen', 'eyeClosed');
    wireToggle('toggleCf', 'confirm', 'eyeOpenCf', 'eyeClosedCf');
    wireToggle('toggleSecret', 'secret', 'eyeOpenSecret', 'eyeClosedSecret');

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
      strengthBar.className = 'h-full strength-bar rounded-full ' + color;
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
</html>
`;



const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator - Login</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M17 6L10 18h5l-2 8 9-12h-5l2-8z' fill='white'/%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes fadeSlideIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes glowPulse {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 0.25; }
    }
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .animate-fade-slide-in {
      animation: fadeSlideIn 0.5s ease-out both;
    }
    .animate-glow-pulse {
      animation: glowPulse 4s ease-in-out infinite;
    }
    .spinner {
      animation: spin 0.8s linear infinite;
    }
  </style>
</head>
<body class="bg-[#070b14] text-gray-100 min-h-screen flex items-center justify-center overflow-hidden">
  <!-- Background glow -->
  <div class="fixed inset-0 pointer-events-none" aria-hidden="true">
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[120px] animate-glow-pulse"></div>
  </div>

  <!-- Login card -->
  <div class="relative z-10 w-full max-w-md mx-4 animate-fade-slide-in">
    <div class="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-black/40">
      <!-- Logo + brand -->
      <div class="flex flex-col items-center mb-8">
        <div class="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/25 mb-4">
          <svg class="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <h1 class="text-2xl font-bold tracking-tight text-white">Warp Generator</h1>
        <p class="text-gray-400 text-sm mt-1">Sign in to admin panel</p>
      </div>

      <!-- Error alert (hidden by default) -->
      <div id="error" class="hidden mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2.5" role="alert">
        <svg class="w-4 h-4 shrink-0 text-red-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <span id="error-text"></span>
      </div>

      <!-- Form -->
      <form method="POST" action="/admin/login" id="login-form">
        <!-- Password field -->
        <div class="mb-6">
          <label for="password" class="block text-sm font-medium text-gray-300 mb-2">Password</label>
          <div class="relative">
            <input
              type="password"
              id="password"
              name="password"
              required
              autofocus
              autocomplete="current-password"
              placeholder="Enter your password"
              class="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm placeholder:text-gray-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 transition-all duration-200"
            >
            <button
              type="button"
              id="toggle-password"
              aria-label="Show password"
              class="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
            >
              <!-- Eye open icon -->
              <svg id="eye-open" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <!-- Eye closed icon (hidden initially) -->
              <svg id="eye-closed" class="w-5 h-5 hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Submit button -->
        <button
          type="submit"
          id="submit-btn"
          class="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <span id="btn-text">Login</span>
          <svg id="btn-spinner" class="hidden w-4 h-4 spinner" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
          </svg>
        </button>
      </form>

      <!-- Session hint -->
      <p class="text-center text-xs text-gray-600 mt-5">Session lasts 24 hours</p>
    </div>
  </div>

  <script>
    // --- Error handling: read ?error= query param ---
    (function() {
      var params = new URLSearchParams(window.location.search);
      var code = params.get('error');
      if (!code) return;

      var messages = {
        'invalid_password': 'Invalid password. Please try again.',
        'rate_limited': 'Too many login attempts. Try again in 15 minutes.',
        'no_password': 'Account not set up yet. Create a password first.',
        'generic': 'Login failed. Try again.'
      };
      var msg = messages[code] || messages['generic'];
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
    (function() {
      var toggleBtn = document.getElementById('toggle-password');
      var pwField = document.getElementById('password');
      var eyeOpen = document.getElementById('eye-open');
      var eyeClosed = document.getElementById('eye-closed');
      if (!toggleBtn || !pwField) return;

      toggleBtn.addEventListener('click', function() {
        var isPassword = pwField.type === 'password';
        pwField.type = isPassword ? 'text' : 'password';
        eyeOpen.classList.toggle('hidden', !isPassword);
        eyeClosed.classList.toggle('hidden', isPassword);
        toggleBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        pwField.focus();
      });
    })();

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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator - Admin</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0%25' stop-color='%233b82f6'/%3E%3Cstop offset='100%25' stop-color='%2306b6d4'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='32' height='32' rx='8' fill='url(%23g)'/%3E%3Cpath d='M18 6L10 18h5l-2 8 8-12h-5z' fill='white'/%3E%3C/svg%3E">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @keyframes toast-in { from { opacity: 0; transform: translateX(100%); } to { opacity: 1; transform: translateX(0); } }
    @keyframes toast-out { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(100%); } }
    @keyframes modal-pop { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    .toast-in { animation: toast-in 0.3s ease-out; }
    .toast-out { animation: toast-out 0.3s ease-in forwards; }
    .modal-pop { animation: modal-pop 0.2s ease-out; }
    .skeleton {
      background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
    }
    .card-hover { transition: border-color 0.2s, box-shadow 0.2s; }
    .card-hover:hover { border-color: rgba(59,130,246,0.3); box-shadow: 0 0 20px rgba(59,130,246,0.08); }
    input:focus, select:focus, textarea:focus { outline: none; }
  </style>
</head>
<body class="bg-[#070b14] text-gray-100 min-h-screen font-sans">
  <!-- Ambient glow -->
  <div class="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
    <div class="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-blue-500/[0.04] rounded-full blur-[120px]"></div>
    <div class="absolute -bottom-40 -right-40 w-[600px] h-[400px] bg-cyan-500/[0.03] rounded-full blur-[100px]"></div>
  </div>

  <!-- Toast container -->
  <div id="toast-container" class="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"></div>

  <!-- App shell -->
  <div class="relative max-w-6xl mx-auto px-4 py-4 md:px-8 md:py-6">

    <!-- Sticky header -->
    <header class="sticky top-0 z-30 -mx-4 px-4 py-3 md:-mx-8 md:px-8 md:py-4 bg-[#070b14]/80 backdrop-blur-xl border-b border-white/[0.06] mb-6 md:mb-8">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <svg class="w-4.5 h-4.5 text-white" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          </div>
          <h1 class="text-base md:text-lg font-bold tracking-tight">Warp Generator</h1>
        </div>
        <nav class="flex items-center gap-1.5 md:gap-2">
          <button onclick="navigate('accounts')" class="nav-btn px-3 py-1.5 rounded-lg text-sm transition-colors" data-view="accounts" aria-label="Accounts view">Accounts</button>
          <button onclick="navigate('settings')" class="nav-btn px-3 py-1.5 rounded-lg text-sm transition-colors" data-view="settings" aria-label="Settings view">Settings</button>
          <div class="w-px h-4 bg-white/10 mx-1 hidden md:block"></div>
          <form method="POST" action="/admin/logout" class="inline">
            <button type="submit" class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 hover:bg-white/10 transition-colors" aria-label="Logout">Logout</button>
          </form>
        </nav>
      </div>
      <!-- Stats chips -->
      <div id="stats-row" class="flex items-center gap-2 mt-3 text-xs text-gray-500">
        <span id="stat-accounts" class="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5"></span>
        <span id="stat-presets" class="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5"></span>
        <span class="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/5">10 formats</span>
      </div>
    </header>

    <!-- ============ ACCOUNTS VIEW ============ -->
    <div id="view-accounts">
      <div class="flex items-center justify-between mb-5">
        <h2 class="text-xl font-semibold tracking-tight">Accounts</h2>
        <div class="flex gap-2">
          <button onclick="showCreateModal()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all">Create Account</button>
          <button onclick="showImportModal()" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm font-medium transition-colors">Import Config</button>
        </div>
      </div>
      <div id="accounts-grid" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"></div>
    </div>

    <!-- ============ DETAIL VIEW ============ -->
    <div id="view-detail" class="hidden">
      <!-- Top bar -->
      <div class="flex items-center gap-3 mb-6">
        <button onclick="navigate('accounts')" class="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors" aria-label="Back to accounts">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg>
        </button>
        <div class="min-w-0 flex-1">
          <h2 id="detail-name" class="text-xl font-semibold tracking-tight truncate"></h2>
        </div>
      </div>

      <!-- Token row -->
      <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 md:p-5 mb-5">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Token</div>
            <div id="detail-token" class="text-sm font-mono text-gray-300 truncate"></div>
          </div>
          <button onclick="copyToken()" class="shrink-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs text-gray-300 transition-colors" aria-label="Copy token">Copy</button>
        </div>
      </div>

      <!-- Account settings -->
      <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 md:p-5 mb-5">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Account Settings</h3>
        <div class="space-y-4">
          <div>
            <label for="edit-name" class="block text-sm text-gray-400 mb-1.5">Account Name</label>
            <div class="flex gap-2">
              <input id="edit-name" type="text" autocomplete="off" class="flex-1 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors">
              <button onclick="updateAccountName()" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors" id="btn-save-name">Save</button>
            </div>
          </div>
          <div>
            <label for="edit-preset" class="block text-sm text-gray-400 mb-1.5">Endpoint Preset</label>
            <select id="edit-preset" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" onchange="updatePreset()"></select>
          </div>
        </div>
      </div>

      <!-- Subscription URLs -->
      <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 md:p-5 mb-5">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Subscription URLs</h3>
        <div id="sub-urls" class="space-y-2"></div>
      </div>

      <!-- Danger zone -->
      <div class="bg-white/[0.03] border border-red-500/10 rounded-2xl p-4 md:p-5">
        <h3 class="text-xs font-semibold text-red-400/80 uppercase tracking-wider mb-4">Danger Zone</h3>
        <div class="flex flex-wrap gap-3">
          <button onclick="regenerateToken()" class="px-4 py-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 text-sm font-medium transition-colors" id="btn-regen-token">Regenerate Token</button>
          <button onclick="deleteAccount()" class="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 text-sm font-medium transition-colors" id="btn-delete-account">Delete Account</button>
        </div>
      </div>
    </div>

    <!-- ============ SETTINGS VIEW ============ -->
    <div id="view-settings" class="hidden">
      <h2 class="text-xl font-semibold tracking-tight mb-6">Settings</h2>

      <!-- Presets -->
      <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 md:p-5 mb-5">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Endpoint Presets</h3>
          <button onclick="showAddPresetForm()" class="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-xs font-medium shadow-lg shadow-blue-500/20 transition-all" id="btn-add-preset">Add Preset</button>
        </div>
        <div id="presets-list" class="space-y-2"></div>
        <!-- Add preset form -->
        <div id="add-preset-form" class="hidden mt-4 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <input id="preset-name" type="text" placeholder="Preset name" autocomplete="off" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm mb-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors">
          <div id="preset-endpoints" class="space-y-2 mb-3"></div>
          <button onclick="addPresetEndpointRow()" class="text-xs text-blue-400 hover:text-blue-300 mb-3 transition-colors">+ Add endpoint</button>
          <div class="flex gap-2">
            <button onclick="savePreset()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all" id="btn-save-preset">Save</button>
            <button onclick="hideAddPresetForm()" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Amnezia Defaults -->
      <div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 md:p-5">
        <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Amnezia Defaults</h3>
        <div id="amn-error" class="hidden mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"></div>
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div>
            <label for="amn-jc" class="block text-xs text-gray-500 mb-1">Jc <span class="text-gray-600">(0-128)</span></label>
            <input id="amn-jc" type="number" min="0" max="128" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-jmin" class="block text-xs text-gray-500 mb-1">Jmin <span class="text-gray-600">(0-1280)</span></label>
            <input id="amn-jmin" type="number" min="0" max="1280" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-jmax" class="block text-xs text-gray-500 mb-1">Jmax <span class="text-gray-600">(0-1280)</span></label>
            <input id="amn-jmax" type="number" min="0" max="1280" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-s1" class="block text-xs text-gray-500 mb-1">S1 <span class="text-gray-600">(0-255)</span></label>
            <input id="amn-s1" type="number" min="0" max="255" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-s2" class="block text-xs text-gray-500 mb-1">S2 <span class="text-gray-600">(0-255)</span></label>
            <input id="amn-s2" type="number" min="0" max="255" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-h1" class="block text-xs text-gray-500 mb-1">H1 <span class="text-gray-600">(0-2147483647)</span></label>
            <input id="amn-h1" type="number" min="0" max="2147483647" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-h2" class="block text-xs text-gray-500 mb-1">H2 <span class="text-gray-600">(0-2147483647)</span></label>
            <input id="amn-h2" type="number" min="0" max="2147483647" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-h3" class="block text-xs text-gray-500 mb-1">H3 <span class="text-gray-600">(0-2147483647)</span></label>
            <input id="amn-h3" type="number" min="0" max="2147483647" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
          <div>
            <label for="amn-h4" class="block text-xs text-gray-500 mb-1">H4 <span class="text-gray-600">(0-2147483647)</span></label>
            <input id="amn-h4" type="number" min="0" max="2147483647" class="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autocomplete="off">
          </div>
        </div>
        <button onclick="saveAmnezia()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all" id="btn-save-amnezia">Save Amnezia Defaults</button>
      </div>
    </div>

    <!-- ============ CREATE MODAL ============ -->
    <div id="modal-create" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4" onclick="if(event.target===this)closeModal('modal-create')">
      <div class="modal-pop bg-[#0f1520] border border-white/[0.08] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Create New Account</h3>
        <label for="create-name" class="block text-sm text-gray-400 mb-1.5">Account Name</label>
        <input id="create-name" type="text" placeholder="e.g. Home ISP" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm mb-4 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autofocus>
        <div id="create-error" class="hidden mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"></div>
        <div class="flex gap-2 justify-end">
          <button onclick="closeModal('modal-create')" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors">Cancel</button>
          <button onclick="createAccount()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all" id="btn-create">Create</button>
        </div>
      </div>
    </div>

    <!-- ============ IMPORT MODAL ============ -->
    <div id="modal-import" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-40 p-4" onclick="if(event.target===this)closeModal('modal-import')">
      <div class="modal-pop bg-[#0f1520] border border-white/[0.08] rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Import Config</h3>
        <label for="import-name" class="block text-sm text-gray-400 mb-1.5">Account Name</label>
        <input id="import-name" type="text" placeholder="Account name" autocomplete="off" class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm mb-3 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors" autofocus>
        <label for="import-config" class="block text-sm text-gray-400 mb-1.5">Configuration</label>
        <textarea id="import-config" rows="8" placeholder="Paste WireGuard .conf or wg:// URI..." class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-gray-100 text-sm font-mono mb-1 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"></textarea>
        <p class="text-xs text-gray-600 mb-3">Supports WireGuard .conf and wg:// URI formats</p>
        <div id="import-error" class="hidden mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs"></div>
        <div class="flex gap-2 justify-end">
          <button onclick="closeModal('modal-import')" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors">Cancel</button>
          <button onclick="importAccount()" class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all" id="btn-import">Import</button>
        </div>
      </div>
    </div>

    <!-- ============ CONFIRM MODAL ============ -->
    <div id="modal-confirm" class="hidden fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onclick="if(event.target===this)confirmAction(false)">
      <div class="modal-pop bg-[#0f1520] border border-white/[0.08] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h3 id="confirm-title" class="text-lg font-semibold mb-2"></h3>
        <p id="confirm-message" class="text-sm text-gray-400 mb-6"></p>
        <div class="flex gap-2 justify-end">
          <button onclick="confirmAction(false)" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors" id="confirm-cancel">Cancel</button>
          <button onclick="confirmAction(true)" class="px-4 py-2 rounded-xl text-sm font-medium transition-colors" id="confirm-ok">Confirm</button>
        </div>
      </div>
    </div>

  </div><!-- /app shell -->

  <script>
    /* =============== CONSTANTS =============== */
    var SUB_FORMATS = [
      { key: 'wireguard-conf', label: 'WireGuard .conf (ZIP)', icon: '\uD83D\uDCE6' },
      { key: 'wireguard-conf-amnezia', label: 'WireGuard .conf Amnezia (ZIP)', icon: '\uD83D\uDCE6' },
      { key: 'throne', label: 'Throne wg:// URI', icon: '\uD83D\uDD17' },
      { key: 'throne-amnezia', label: 'Throne wg:// Amnezia', icon: '\uD83D\uDD17' },
      { key: 'wireguard-uri', label: 'wireguard:// URI', icon: '\uD83D\uDD17' },
      { key: 'singbox', label: 'Sing-box JSON', icon: '{ }' },
      { key: 'singbox-legacy', label: 'Sing-box Legacy JSON', icon: '{ }' },
      { key: 'xray', label: 'Xray JSON', icon: '{ }' },
      { key: 'clash', label: 'Clash YAML', icon: '~' },
      { key: 'v2rayn', label: 'V2RayN Base64', icon: 'b64' }
    ];

    var GRADIENTS = [
      'from-blue-500 to-cyan-400',
      'from-purple-500 to-pink-400',
      'from-orange-500 to-red-400',
      'from-emerald-500 to-teal-400',
      'from-indigo-500 to-violet-400',
      'from-amber-500 to-yellow-400'
    ];

    /* =============== STATE =============== */
    var currentView = 'accounts';
    var accounts = [];
    var presets = [];
    var currentAccountId = null;
    var currentAccount = null;

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
      document.getElementById('stat-accounts').textContent = accounts.length + ' account' + (accounts.length !== 1 ? 's' : '');
      document.getElementById('stat-presets').textContent = presets.length + ' preset' + (presets.length !== 1 ? 's' : '');
    }

    function setLoading(btn, loading) {
      if (loading) {
        btn.disabled = true;
        btn.dataset.origText = btn.textContent;
        btn.innerHTML = '<svg class="animate-spin h-4 w-4 inline-block mr-1 -mt-0.5" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Loading...';
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
        ? '<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        : '<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
      el.className = 'pointer-events-auto flex items-center gap-2.5 pl-3 pr-2 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-sm toast-in ' +
        (isErr ? 'bg-red-500/90 text-white border border-red-400/30' : 'bg-emerald-500/90 text-white border border-emerald-400/30');
      el.innerHTML = icon + '<span class="flex-1">' + escHtml(msg) + '</span>' +
        '<button onclick="this.parentElement.remove()" class="p-1 rounded-lg hover:bg-white/20 transition-colors shrink-0" aria-label="Dismiss">' +
        '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>';
      container.appendChild(el);
      setTimeout(function() {
        el.classList.remove('toast-in');
        el.classList.add('toast-out');
        setTimeout(function() { if (el.parentNode) el.remove(); }, 300);
      }, 3500);
    }

    /* =============== CONFIRM DIALOG =============== */
    var _confirmResolve = null;

    function confirmDialog(title, message, isDestructive) {
      return new Promise(function(resolve) {
        _confirmResolve = resolve;
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        var okBtn = document.getElementById('confirm-ok');
        if (isDestructive) {
          okBtn.className = 'px-4 py-2 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 text-sm font-medium transition-colors';
          okBtn.textContent = 'Delete';
        } else {
          okBtn.className = 'px-4 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-medium transition-colors';
          okBtn.textContent = 'Confirm';
        }
        document.getElementById('modal-confirm').classList.remove('hidden');
        okBtn.focus();
      });
    }

    function confirmAction(result) {
      document.getElementById('modal-confirm').classList.add('hidden');
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
    async function api(path, opts) {
      opts = opts || {};
      var res = await fetch(path, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    /* =============== NAVIGATION =============== */
    function navigate(view, data) {
      currentView = view;
      document.getElementById('view-accounts').classList.toggle('hidden', view !== 'accounts');
      document.getElementById('view-detail').classList.toggle('hidden', view !== 'detail');
      document.getElementById('view-settings').classList.toggle('hidden', view !== 'settings');
      var btns = document.querySelectorAll('.nav-btn');
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        var isActive = b.dataset.view === view;
        b.classList.toggle('bg-white/10', isActive);
        b.classList.toggle('text-white', isActive);
        b.classList.toggle('text-gray-400', !isActive);
      }
      if (view === 'accounts') loadAccounts();
      if (view === 'detail' && data) loadAccountDetail(data);
      if (view === 'settings') loadSettings();
    }

    /* =============== ACCOUNTS VIEW =============== */
    function renderSkeleton() {
      var grid = document.getElementById('accounts-grid');
      var html = '';
      for (var i = 0; i < 6; i++) {
        html += '<div class="rounded-2xl border border-white/[0.06] p-4 space-y-3">' +
          '<div class="flex items-center gap-3">' +
            '<div class="w-10 h-10 rounded-xl skeleton"></div>' +
            '<div class="flex-1 space-y-2">' +
              '<div class="h-3 w-24 rounded skeleton"></div>' +
              '<div class="h-2.5 w-16 rounded skeleton"></div>' +
            '</div>' +
          '</div>' +
          '<div class="h-2.5 w-32 rounded skeleton"></div>' +
          '<div class="flex gap-1.5">' +
            '<div class="h-5 w-14 rounded-full skeleton"></div>' +
          '</div>' +
        '</div>';
      }
      grid.innerHTML = html;
    }

    function renderEmpty() {
      var grid = document.getElementById('accounts-grid');
      grid.innerHTML =
        '<div class="col-span-full flex flex-col items-center justify-center py-16">' +
          '<div class="w-20 h-20 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-5">' +
            '<svg class="w-10 h-10 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="2" y="6" width="20" height="12" rx="2"/>' +
              '<path d="M12 12h.01"/>' +
              '<path d="M17 12h.01"/>' +
              '<path d="M7 12h.01"/>' +
            '</svg>' +
          '</div>' +
          '<h3 class="text-base font-medium text-gray-300 mb-1">No accounts yet</h3>' +
          '<p class="text-sm text-gray-500 mb-5">Create or import a WireGuard account to get started.</p>' +
          '<button onclick="showCreateModal()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-sm font-medium shadow-lg shadow-blue-500/20 transition-all">Create Account</button>' +
        '</div>';
    }

    async function loadAccounts() {
      renderSkeleton();
      try {
        accounts = await api('/api/account');
        renderAccounts();
        updateStats();
      } catch (e) {
        document.getElementById('accounts-grid').innerHTML =
          '<div class="col-span-full text-center py-12">' +
            '<div class="text-red-400 text-sm mb-3">' + escHtml(e.message) + '</div>' +
            '<button onclick="loadAccounts()" class="px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition-colors">Retry</button>' +
          '</div>';
      }
      // Preset stat chip needs presets even before the Settings/Detail views are visited
      api('/api/presets').then(function(p) { presets = p; updateStats(); }).catch(function() {});
    }

    function renderAccounts() {
      var grid = document.getElementById('accounts-grid');
      if (accounts.length === 0) { renderEmpty(); return; }
      grid.innerHTML = accounts.map(function(a) {
        var created = new Date(a.created_at).toLocaleDateString();
        var tokenShort = a.token.substring(0, 8) + '...';
        var initials = avatarInitials(a.name || 'UN');
        var grad = avatarGradient(a.name || '');
        var isPreset = a.endpoint_list && a.endpoint_list.type === 'preset';
        var hasAmn = !!a.amnezia_overrides;
        return '<div class="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 card-hover cursor-pointer transition-all" onclick="navigate(\'detail\', \'' + a.id + '\')">' +
          '<div class="flex items-start gap-3 mb-3">' +
            '<div class="w-10 h-10 rounded-xl bg-gradient-to-br ' + grad + ' flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-lg">' + escHtml(initials) + '</div>' +
            '<div class="min-w-0 flex-1">' +
              '<h3 class="font-semibold text-sm truncate">' + escHtml(a.name) + '</h3>' +
              '<span class="text-xs text-gray-500">' + created + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="text-xs text-gray-500 font-mono mb-3 px-1">' + escHtml(tokenShort) + '</div>' +
          '<div class="flex gap-1.5">' +
            '<span class="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-xs text-gray-400">' + (isPreset ? 'Preset' : 'Custom') + '</span>' +
            (hasAmn ? '<span class="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs text-purple-300">Amnezia</span>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    /* =============== ACCOUNT DETAIL =============== */
    async function loadAccountDetail(id) {
      currentAccountId = id;
      try {
        currentAccount = await api('/api/account/' + id);
        document.getElementById('detail-name').textContent = currentAccount.name;
        document.getElementById('detail-token').textContent = currentAccount.token;
        document.getElementById('edit-name').value = currentAccount.name;
        renderSubUrls();
        await loadPresetsForSelect();
      } catch (e) {
        toast(e.message, 'error');
        navigate('accounts');
      }
    }

    function copyToken() {
      var token = currentAccount ? currentAccount.token : '';
      copyToClipboard(token, 'Token copied!');
    }

    function copyToClipboard(text, successMsg) {
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

    function renderSubUrls() {
      var container = document.getElementById('sub-urls');
      var token = currentAccount.token;
      var baseUrl = location.origin;
      container.innerHTML = SUB_FORMATS.map(function(f) {
        var url = baseUrl + '/sub/' + token + '/' + f.key;
        var safeUrl = escHtml(url);
        return '<div class="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:border-white/[0.08] transition-colors">' +
          '<span class="text-base w-7 text-center opacity-40 shrink-0">' + f.icon + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-xs font-medium text-gray-300">' + escHtml(f.label) + '</div>' +
            '<div class="text-[11px] text-gray-500 font-mono truncate">' + safeUrl + '</div>' +
          '</div>' +
          '<button onclick="event.stopPropagation(); copyToClipboard(\'' + safeUrl + '\', \'URL copied!\')" class="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] text-gray-300 transition-colors shrink-0" aria-label="Copy URL">Copy</button>' +
          '<a href="' + safeUrl + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" class="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-[11px] text-gray-300 transition-colors shrink-0" aria-label="Open URL">Open</a>' +
        '</div>';
      }).join('');
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
      var ok = await confirmDialog('Regenerate Token', 'The old subscription URLs will stop working immediately. This cannot be undone.', false);
      if (!ok) return;
      var btn = document.getElementById('btn-regen-token');
      setLoading(btn, true);
      try {
        var data = await api('/api/account/' + currentAccountId + '/regenerate-token', { method: 'POST' });
        currentAccount.token = data.token;
        document.getElementById('detail-token').textContent = data.token;
        renderSubUrls();
        toast('Token regenerated');
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    async function deleteAccount() {
      var ok = await confirmDialog('Delete Account', 'This will permanently delete this account and all its data. This cannot be undone.', true);
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
          sel.innerHTML = '<option value="" selected>Custom endpoints</option>' + sel.innerHTML;
        }
        updateStats();
      } catch (e) { /* silent */ }
    }

    async function updatePreset() {
      var sel = document.getElementById('edit-preset');
      var presetId = sel.value;
      if (!presetId) return;
      try {
        await api('/api/account/' + currentAccountId, {
          method: 'PUT',
          body: { endpoint_list: { type: 'preset', preset_id: presetId } }
        });
        currentAccount.endpoint_list = { type: 'preset', preset_id: presetId };
        toast('Preset updated');
      } catch (e) { toast(e.message, 'error'); }
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
    async function loadSettings() {
      try {
        presets = await api('/api/presets');
        renderPresets();
        var amn = await api('/api/settings/amnezia');
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
      } catch (e) { toast(e.message, 'error'); }
    }

    function renderPresets() {
      var list = document.getElementById('presets-list');
      if (presets.length === 0) {
        list.innerHTML = '<div class="text-gray-500 text-center py-6 text-sm">No presets configured. Add one to get started.</div>';
        return;
      }
      list.innerHTML = presets.map(function(p) {
        var preview = p.endpoints.slice(0, 3).map(function(e) { return e.ip + ':' + e.port; }).join(', ');
        if (p.endpoints.length > 3) preview += ' +' + (p.endpoints.length - 3) + ' more';
        return '<div class="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.04] hover:border-white/[0.08] transition-colors">' +
          '<div class="min-w-0 flex-1">' +
            '<div class="text-sm font-medium">' + escHtml(p.name) + '</div>' +
            '<div class="text-xs text-gray-500 font-mono truncate">' + escHtml(preview) + '</div>' +
          '</div>' +
          '<span class="text-xs text-gray-600 mx-3 shrink-0">' + p.endpoints.length + ' ep</span>' +
          '<button onclick="deletePreset(\'' + escHtml(p.id) + '\')" class="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:bg-red-500/10 border border-red-500/10 transition-colors shrink-0" aria-label="Delete preset">Delete</button>' +
        '</div>';
      }).join('');
    }

    function showAddPresetForm() {
      document.getElementById('add-preset-form').classList.remove('hidden');
      document.getElementById('preset-name').value = '';
      document.getElementById('preset-endpoints').innerHTML = '';
      addPresetEndpointRow();
      document.getElementById('preset-name').focus();
    }

    function hideAddPresetForm() {
      document.getElementById('add-preset-form').classList.add('hidden');
    }

    function addPresetEndpointRow() {
      var container = document.getElementById('preset-endpoints');
      var row = document.createElement('div');
      row.className = 'flex gap-2';
      row.innerHTML =
        '<input type="text" placeholder="IP or domain" autocomplete="off" class="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-100 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors ep-ip">' +
        '<input type="number" placeholder="Port" min="1" max="65535" autocomplete="off" class="w-20 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-100 text-xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors ep-port">' +
        '<button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs px-2 rounded-lg transition-colors" aria-label="Remove endpoint">&times;</button>';
      container.appendChild(row);
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
        await api('/api/presets', { method: 'POST', body: { name: name, endpoints: endpoints } });
        hideAddPresetForm();
        toast('Preset created');
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
      } catch (e) { toast(e.message, 'error'); }
      setLoading(btn, false);
    }

    /* =============== KEYBOARD SHORTCUTS =============== */
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        if (!document.getElementById('modal-confirm').classList.contains('hidden')) {
          confirmAction(false);
        } else if (!document.getElementById('modal-create').classList.contains('hidden')) {
          closeModal('modal-create');
        } else if (!document.getElementById('modal-import').classList.contains('hidden')) {
          closeModal('modal-import');
        }
      }
    });

    /* =============== INIT =============== */
    navigate('accounts');
  </script>
</body>
</html>
`;


// --- KV Helpers ---

let _kvInitialized = false;
async function initializeKV(env) {
  if (_kvInitialized) return;
  _kvInitialized = true;
  const [globalRaw, presetsRaw] = await Promise.all([
    env.WARP_KV.get('settings:global'),
    env.WARP_KV.get('presets')
  ]);
  if (globalRaw && presetsRaw) return;

  try {
    if (!presetsRaw) await env.WARP_KV.put('presets', JSON.stringify(DEFAULT_PRESETS));
    if (!globalRaw) await env.WARP_KV.put('settings:global', JSON.stringify(DEFAULT_SETTINGS_GLOBAL));
  } catch {
    // Non-fatal: handlers fall back to DEFAULT_PRESETS / DEFAULT_SETTINGS_GLOBAL
  }
}

// --- Session Helpers ---

function parseCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
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

  const data = await env.WARP_KV.get(`session:${token}`, { type: 'json' });
  if (!data) return null;
  if (Date.now() > data.expires_at) {
    await env.WARP_KV.delete(`session:${token}`);
    return null;
  }
  return token;
}

async function createSession(env) {
  const token = crypto.randomUUID();
  const expires_at = Date.now() + SESSION_DURATION_MS;
  await env.WARP_KV.put(`session:${token}`, JSON.stringify({ expires_at }));
  return { token, expires_at };
}

async function destroySession(token, env) {
  await env.WARP_KV.delete(`session:${token}`);
}

// --- HTML Response Helpers ---

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; img-src 'self' data:"
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
  const headers = { 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' };
  // Subscription responses manage their own caching headers — skip no-store there
  if (!options.skipNoStore) headers['Cache-Control'] = 'no-store';
  if (options.headers) Object.assign(headers, options.headers);
  return new Response(JSON.stringify(data), { status, headers });
}

function errorResponse(message, status = 400, options = {}) {
  return jsonResponse({ error: message }, status, options);
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
  try {
    const bytes = base64ToBytes(value);
    if (bytes.length !== 32) return `Invalid ${fieldName} (must be 32 bytes)`;
  } catch {
    return `Invalid ${fieldName} (must be base64)`;
  }
  return null;
}

// --- Warp API Client (Task 6) ---

async function registerWarpAccount() {
  const { privateKey, publicKey } = generateKeypair();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WARP_API_TIMEOUT);

  let response;
  try {
    response = await fetch(`${WARP_API_BASE}/reg`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'User-Agent': 'okhttp/3.12.1',
        'CF-Client-Version': 'a-6.30-3596'
      },
      body: JSON.stringify({
        key: publicKey,
        install_id: '',
        fcm_token: '',
        tos: '2021-01-01T00:00:00.000Z',
        model: 'PC',
        type: 'Windows',
        locale: 'en_US'
      }),
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { error: 'Warp API timeout', status: 504 };
    }
    return { error: 'Warp API connection failed', status: 502 };
  } finally {
    clearTimeout(timeoutId);
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After');
    const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
    return { error: `Warp API rate limited, retry after ${Number.isFinite(seconds) ? seconds : 60}s`, status: 503 };
  }
  if (response.status >= 500) {
    return { error: 'Warp API error, try again later', status: 503 };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.log(`WARP registration failed: ${response.status} ${text}`);
    return { error: 'WARP registration failed', status: 502 };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { error: 'Warp API returned invalid JSON', status: 502 };
  }

  const config = data.config;
  if (!config || !config.interface || !config.interface.addresses || !config.peers || !config.peers[0]) {
    return { error: 'Warp API returned unexpected response structure', status: 502 };
  }

  // Decode client_id → reserved bytes (3 bytes, base64). [0,0,0] only when field absent.
  let reserved = [0, 0, 0];
  if (config.client_id && typeof config.client_id === 'string') {
    let raw;
    try {
      raw = base64ToBytes(config.client_id);
    } catch (err) {
      console.log(`WARP registration: client_id decode failed: ${err.message}`);
      return { error: 'WARP registration failed', status: 502 };
    }
    if (raw.length !== 3) {
      console.log(`WARP registration: unexpected client_id length ${raw.length}`);
      return { error: 'WARP registration failed', status: 502 };
    }
    reserved = [raw[0], raw[1], raw[2]];
  }

  const peerPublicKey = config.peers[0].public_key || WARP_PEER_PUBLIC_KEY;

  return {
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

// --- Config Parsers (Task 7) ---

function parseAmneziaValue(raw) {
  const v = String(raw).trim();
  if (/^\d+-\d+$/.test(v)) return v; // keep 'lo-hi' range string
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

const ALLOWED_INTERFACE_KEYS = new Set([
  'privatekey', 'address', 'dns', 'mtu', 'listenport',
  'jc', 'jmin', 'jmax', 's1', 's2', 'h1', 'h2', 'h3', 'h4'
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
      return { error: `Invalid config: ClientId base64 decode failed (${err.message})` };
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
    // Check if comma-separated decimals or base64
    const decimals = raw.split(',').map(s => parseInt(s.trim(), 10));
    if (decimals.length === 3 && decimals.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) {
      reserved = decimals;
    } else {
      let bytes;
      try {
        const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, '=');
        bytes = base64ToBytes(padded);
      } catch (err) {
        return { error: `Invalid wg:// URI: reserved base64 decode failed (${err.message})` };
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
  try {
    await env.WARP_KV.put(`account:${account.id}`, JSON.stringify(account));
    await env.WARP_KV.put(`token:${account.token}`, account.id);
    return true;
  } catch {
    return false;
  }
}

async function getAccount(env, id) {
  return await env.WARP_KV.get(`account:${id}`, { type: 'json' });
}

async function deleteAccount(env, account) {
  try {
    await env.WARP_KV.delete(`account:${account.id}`);
    await env.WARP_KV.delete(`token:${account.token}`);
    return true;
  } catch {
    return false;
  }
}

async function listAccounts(env) {
  const accounts = [];
  let cursor = undefined;
  do {
    const result = await env.WARP_KV.list({ prefix: 'account:', cursor, limit: 100 });
    for (const key of result.keys) {
      const account = await env.WARP_KV.get(key.name, { type: 'json' });
      if (account) accounts.push(account);
    }
    cursor = result.cursor;
  } while (cursor);
  return accounts;
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
    amnezia_overrides: account.amnezia_overrides
  };
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
    if (el.custom_endpoints.length > MAX_ENDPOINTS) return `Too many endpoints (max ${MAX_ENDPOINTS})`;
    for (let i = 0; i < el.custom_endpoints.length; i++) {
      const ep = el.custom_endpoints[i];
      if (!ep || typeof ep !== 'object') return `Endpoint ${i + 1}: invalid endpoint`;
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
    validateAmneziaParam(a.H1, 'H1', 0, 2147483647, true),
    validateAmneziaParam(a.H2, 'H2', 0, 2147483647, true),
    validateAmneziaParam(a.H3, 'H3', 0, 2147483647, true),
    validateAmneziaParam(a.H4, 'H4', 0, 2147483647, true)
  ];
  for (const err of checks) { if (err) return err; }
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
    const ipErr = validateIPv4OrIPv6OrDomain(ep.ip);
    if (ipErr) return `Endpoint ${i + 1}: ${ipErr}`;
    const portErr = validatePort(ep.port);
    if (portErr) return `Endpoint ${i + 1}: ${portErr}`;
  }
  return null;
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

  const raw = await env.WARP_KV.get('presets', { type: 'json' });
  const presets = raw || [...DEFAULT_PRESETS];

  const id = crypto.randomUUID();
  const preset = { id, name: body.name.trim(), endpoints: body.endpoints };
  presets.push(preset);

  try {
    await env.WARP_KV.put('presets', JSON.stringify(presets));
  } catch {
    return errorResponse('Failed to save preset', 500);
  }

  return jsonResponse(preset, 201);
}

async function handlePresetUpdate(id, request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const raw = await env.WARP_KV.get('presets', { type: 'json' });
  const presets = raw || [...DEFAULT_PRESETS];
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

  try {
    await env.WARP_KV.put('presets', JSON.stringify(presets));
  } catch {
    return errorResponse('Failed to save preset', 500);
  }

  // Invalidate cached subscriptions for accounts using this preset
  await bumpCacheVersion(env);

  return jsonResponse(presets[idx]);
}

async function handlePresetDelete(id, env) {
  const raw = await env.WARP_KV.get('presets', { type: 'json' });
  const presets = raw || [...DEFAULT_PRESETS];
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
  try {
    await env.WARP_KV.put('presets', JSON.stringify(presets));
  } catch {
    return errorResponse('Failed to delete preset', 500);
  }

  return jsonResponse({ success: true });
}

async function handlePresetAPI(request, env, path) {
  const method = request.method;
  const idMatch = path.match(/^\/api\/presets\/([^/]+)$/);

  if (path === '/api/presets' && method === 'GET') return handlePresetList(env);
  if (path === '/api/presets' && method === 'POST') return handlePresetCreate(request, env);
  if (idMatch && method === 'PUT') return handlePresetUpdate(idMatch[1], request, env);
  if (idMatch && method === 'DELETE') return handlePresetDelete(idMatch[1], env);

  return errorResponse('Not Found', 404);
}

// --- Amnezia Settings API (Task 21) ---

async function handleAmneziaGet(env) {
  const raw = await env.WARP_KV.get('settings:global', { type: 'json' });
  const amnezia = raw?.amnezia || DEFAULT_AMNEZIA;
  return jsonResponse(amnezia);
}

async function handleAmneziaUpdate(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  const err = validateAmneziaSettings(body);
  if (err) return errorResponse(err);

  const raw = await env.WARP_KV.get('settings:global', { type: 'json' }) || {};
  raw.amnezia = { ...DEFAULT_AMNEZIA, ...raw.amnezia, ...body };

  try {
    await env.WARP_KV.put('settings:global', JSON.stringify(raw));
  } catch {
    return errorResponse('Failed to save settings', 500);
  }

  // Invalidate cached subscriptions for all accounts (global amnezia affects all)
  await bumpCacheVersion(env);

  return jsonResponse(raw.amnezia);
}

async function handleSettingsAPI(request, env, path) {
  const method = request.method;

  if (path === '/api/settings/amnezia' && method === 'GET') return handleAmneziaGet(env);
  if (path === '/api/settings/amnezia' && method === 'PUT') return handleAmneziaUpdate(request, env);

  return errorResponse('Not Found', 404);
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

  const result = await registerWarpAccount();
  if (result.error) return errorResponse(result.error, result.status);

  const account = createAccountObject(body.name, result.config);

  if (!(await storeAccount(env, account))) {
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

async function handleAccountUpdate(id, request, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  if (body.name !== undefined) {
    const nameErr = validateName(body.name);
    if (nameErr) return errorResponse(nameErr);
    account.name = body.name.trim();
  }

  if (body.endpoint_list !== undefined) {
    const epErr = validateEndpointList(body.endpoint_list);
    if (epErr) return errorResponse(epErr);
    account.endpoint_list = body.endpoint_list;
  }

  if (body.amnezia_overrides !== undefined) {
    if (body.amnezia_overrides !== null) {
      const aErr = validateAmneziaSettings(body.amnezia_overrides);
      if (aErr) return errorResponse(`Amnezia overrides: ${aErr}`);
    }
    account.amnezia_overrides = body.amnezia_overrides;
  }

  try {
    await env.WARP_KV.put(`account:${account.id}`, JSON.stringify(account));
  } catch {
    return errorResponse('Failed to save account', 500);
  }

  await bumpCacheVersion(env);

  return jsonResponse(sanitizeAccount(account));
}

async function handleAccountDelete(id, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  await bumpCacheVersion(env);

  if (!(await deleteAccount(env, account))) {
    return errorResponse('Failed to delete account', 500);
  }

  return jsonResponse({ success: true });
}

async function handleAccountRegenerateToken(id, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  const oldToken = account.token;
  await bumpCacheVersion(env);
  account.token = crypto.randomUUID();

  try {
    await env.WARP_KV.delete(`token:${oldToken}`);
    await env.WARP_KV.put(`account:${account.id}`, JSON.stringify(account));
    await env.WARP_KV.put(`token:${account.token}`, account.id);
  } catch {
    return errorResponse('Failed to regenerate token', 500);
  }

  return jsonResponse({ token: account.token });
}

async function handleAccountAPI(request, env, path) {
  const method = request.method;

  if (path === '/api/account/generate' && method === 'POST') {
    return handleAccountGenerate(request, env);
  }
  if (path === '/api/account/import' && method === 'POST') {
    return handleAccountImport(request, env);
  }
  if (path === '/api/account' && method === 'GET') {
    return handleAccountList(env);
  }

  const idMatch = path.match(/^\/api\/account\/([a-f0-9-]+)\/regenerate-token$/);
  if (idMatch && method === 'POST') {
    return handleAccountRegenerateToken(idMatch[1], env);
  }

  const accountMatch = path.match(/^\/api\/account\/([a-f0-9-]+)$/);
  if (accountMatch) {
    const id = accountMatch[1];
    if (method === 'GET') return handleAccountGet(id, env);
    if (method === 'PUT') return handleAccountUpdate(id, request, env);
    if (method === 'DELETE') return handleAccountDelete(id, env);
  }

  return errorResponse('Not Found', 404);
}

// --- Subscription Helpers (Tasks 9-11) ---

async function resolveToken(token, env) {
  const accountId = await env.WARP_KV.get(`token:${token}`);
  if (!accountId) return { error: 'Subscription not found', status: 404 };

  const account = await getAccount(env, accountId);
  if (!account) return { error: 'Account no longer exists', status: 404 };

  return { account };
}

async function expandEndpoints(account, env) {
  let endpoints;

  if (account.endpoint_list.type === 'preset') {
    const presetsRaw = await env.WARP_KV.get('presets', { type: 'json' });
    const presets = presetsRaw || DEFAULT_PRESETS;
    // Fall back to seed presets: 'default' may have been legitimately deleted
    // while unused, but new accounts still reference it as the default.
    const preset = presets.find(p => p.id === account.endpoint_list.preset_id) ||
                   DEFAULT_PRESETS.find(p => p.id === account.endpoint_list.preset_id);
    if (!preset) return { error: 'Endpoint preset missing', status: 500 };
    endpoints = preset.endpoints;
  } else {
    endpoints = account.endpoint_list.custom_endpoints;
  }

  // Dedupe by ip:port once here so proxy/outbound names can't collide in ANY format
  const seen = new Set();
  const configs = [];
  for (const ep of endpoints) {
    const key = `${ep.ip}:${ep.port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    configs.push({
      name: account.name,
      endpoint: (() => { const ip = String(ep.ip).replace(/^\[|\]$/g, ''); return ip.includes(':') ? `[${ip}]:${ep.port}` : `${ip}:${ep.port}`; })(),
      ip: ep.ip,
      port: ep.port,
      private_key: account.config.private_key,
      addresses: account.config.addresses,
      peer_public_key: account.config.peer_public_key,
      mtu: account.config.mtu,
      reserved: account.config.reserved
    });
  }

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
    content += `Address = ${[cfg.addresses.ipv4, cfg.addresses.ipv6].filter(Boolean).join(', ')}\n`;
    content += `DNS = 1.1.1.1\n`;
    content += `MTU = ${cfg.mtu}\n`;

    if (amneziaParams) {
      const p = amneziaParams;
      const hasAmnezia = [p.Jc, p.Jmin, p.Jmax, p.S1, p.S2, p.H1, p.H2, p.H3, p.H4].some(amneziaSet);
      if (hasAmnezia) {
        if (amneziaSet(p.Jc)) content += `Jc = ${p.Jc}\n`;
        if (amneziaSet(p.Jmin)) content += `Jmin = ${p.Jmin}\n`;
        if (amneziaSet(p.Jmax)) content += `Jmax = ${p.Jmax}\n`;
        if (amneziaSet(p.S1)) content += `S1 = ${p.S1}\n`;
        if (amneziaSet(p.S2)) content += `S2 = ${p.S2}\n`;
        if (amneziaSet(p.H1)) content += `H1 = ${p.H1}\n`;
        if (amneziaSet(p.H2)) content += `H2 = ${p.H2}\n`;
        if (amneziaSet(p.H3)) content += `H3 = ${p.H3}\n`;
        if (amneziaSet(p.H4)) content += `H4 = ${p.H4}\n`;
      }
    }

    content += `\n[Peer]\n`;
    content += `PublicKey = ${cfg.peer_public_key}\n`;
    content += `AllowedIPs = 0.0.0.0/0, ::/0\n`;
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
    const localAddress = [cfg.addresses.ipv4, cfg.addresses.ipv6].filter(Boolean).join('-');
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
        if (typeof value === 'string' && value.includes('-')) continue;
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
    const encodedAddress = encodeURIComponent(`${cfg.addresses.ipv4},${cfg.addresses.ipv6}`);
    const encodedReserved = encodeURIComponent(cfg.reserved ? cfg.reserved.join(',') : '0,0,0');
    const configName = encodeURIComponent(cfg.name);

    const uri = `wireguard://${encodedPrivateKey}@${cfg.endpoint}?publickey=${encodedPublicKey}&address=${encodedAddress}&mtu=${cfg.mtu}&reserved=${encodedReserved}#${configName}`;

    lines.push(uri);
  }

  return lines.join('\n');
}

// Task 14: Sing-box JSON generator (endpoint format — sing-box v1.11+ / Throne 1.13+)
function generateSingboxJson(configs) {
  const endpoints = configs.map(cfg => {
    const addresses = [cfg.addresses.ipv4, cfg.addresses.ipv6]
      .filter(Boolean)
      .map(addr => addr.includes('/') ? addr : addr.includes(':') ? `${addr}/128` : `${addr}/32`);
    const tag = configs.length > 1 ? `${cfg.name} ${cfg.ip}:${cfg.port}` : cfg.name;
    return {
      type: 'wireguard',
      tag,
      address: addresses,
      private_key: cfg.private_key,
      mtu: cfg.mtu,
      workers: 4,
      peers: [{
        address: cfg.ip,
        port: cfg.port,
        public_key: cfg.peer_public_key,
        allowed_ips: ['0.0.0.0/0', '::/0'],
        persistent_keepalive_interval: WG_KEEPALIVE,
        reserved: cfg.reserved
      }]
    };
  });
  const route = endpoints.length ? { final: endpoints[0].tag } : {};
  return JSON.stringify({ endpoints, route }, null, 2);
}

// Legacy sing-box outbound format for NekoBox / Hiddify / sing-box ≤1.10
function generateSingboxLegacyJson(configs) {
  const outbounds = configs.map(cfg => ({
    type: 'wireguard',
    tag: configs.length > 1 ? `${cfg.name} ${cfg.ip}:${cfg.port}` : cfg.name,
    server: cfg.ip,
    server_port: cfg.port,
    local_address: [cfg.addresses.ipv4, cfg.addresses.ipv6]
      .filter(Boolean)
      .map(addr => addr.includes('/') ? addr : addr.includes(':') ? `${addr}/128` : `${addr}/32`),
    private_key: cfg.private_key,
    peer_public_key: cfg.peer_public_key,
    pre_shared_key: '',
    mtu: cfg.mtu,
    reserved: cfg.reserved,
    workers: 4
  }));
  return JSON.stringify({ outbounds }, null, 2);
}

// Task 15: Xray JSON generator
function generateXrayJson(configs) {
  const outbounds = configs.map(cfg => ({
    protocol: 'wireguard',
    tag: configs.length > 1 ? `${cfg.name} ${cfg.ip}:${cfg.port}` : cfg.name,
    settings: {
      secretKey: cfg.private_key,
      address: [cfg.addresses.ipv4, cfg.addresses.ipv6].filter(Boolean),
      peers: [{
        endpoint: cfg.endpoint,
        publicKey: cfg.peer_public_key,
        preSharedKey: '',
        keepAlive: WG_KEEPALIVE,
        allowedIPs: ['0.0.0.0/0', '::/0']
      }],
      mtu: cfg.mtu,
      reserved: cfg.reserved
    }
  }));

  return JSON.stringify({ outbounds }, null, 2);
}

// Task 16: Clash YAML generator (Clash Meta / Mihomo format)
function generateClashYaml(configs) {
  const proxies = configs.map(cfg => {
    const proxy = {
      name: configs.length > 1 ? `${cfg.name} ${cfg.ip}:${cfg.port}` : cfg.name,
      type: 'wireguard',
      server: cfg.ip,
      port: cfg.port
    };
    if (cfg.addresses.ipv4) proxy['ip'] = cfg.addresses.ipv4.replace(/\/\d+$/, '');
    if (cfg.addresses.ipv6) proxy['ipv6'] = cfg.addresses.ipv6.replace(/\/\d+$/, '');
    proxy['private-key'] = cfg.private_key;
    proxy['public-key'] = cfg.peer_public_key;
    proxy['allowed-ips'] = ['0.0.0.0/0', '::/0'];
    proxy.udp = true;
    proxy.reserved = cfg.reserved ? cfg.reserved.slice() : [0, 0, 0];
    proxy.mtu = cfg.mtu;
    proxy['persistent-keepalive'] = WG_KEEPALIVE;
    return proxy;
  });

  return YAML.dump({ proxies }, { lineWidth: -1 });
}

// Task 17: V2RayN base64 generator
function generateV2raynBase64(configs) {
  const uris = generateWireguardUri(configs);
  return btoa(uris);
}

// --- Subscription Caching (Task 19) ---

const CACHE_TTL_MS = 300000; // 5 minutes

async function getCacheVersion(env) {
  const raw = await env.WARP_KV.get('settings:cachever');
  const ver = parseInt(raw || '', 10);
  return Number.isInteger(ver) && ver > 0 ? ver : 1;
}

// Invalidation = bump the version (one KV write); old-version entries age out via TTL
async function bumpCacheVersion(env) {
  const current = await getCacheVersion(env);
  try {
    await env.WARP_KV.put('settings:cachever', String(current + 1));
  } catch {
    // Non-fatal: stale entries still expire via cache TTL
  }
}

async function getCachedSubscription(token, format, env) {
  const ver = await getCacheVersion(env);
  const timeBucket = Math.floor(Date.now() / CACHE_TTL_MS);
  return await env.WARP_KV.get(`cache:${ver}:${token}:${format}:${timeBucket}`);
}

async function setCachedSubscription(token, format, data, env) {
  const ver = await getCacheVersion(env);
  const timeBucket = Math.floor(Date.now() / CACHE_TTL_MS);
  await env.WARP_KV.put(`cache:${ver}:${token}:${format}:${timeBucket}`, data, { expirationTtl: 86400 });
}

// --- Subscription Route Handlers ---

const FORMATS = {
  'wireguard-conf': { contentType: 'application/zip', extension: 'zip', isBinary: true },
  'wireguard-conf-amnezia': { contentType: 'application/zip', extension: 'zip', isBinary: true },
  'throne': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'throne-amnezia': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'wireguard-uri': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'singbox': { contentType: 'application/json', extension: 'json', isBinary: false },
  'singbox-legacy': { contentType: 'application/json', extension: 'json', isBinary: false },
  'xray': { contentType: 'application/json', extension: 'json', isBinary: false },
  'clash': { contentType: 'application/x-yaml; charset=utf-8', extension: 'yaml', isBinary: false },
  'v2rayn': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false }
};

async function handleSubscription(request, env, path) {
  const match = path.match(/^\/sub\/([a-f0-9-]+)\/(.+)$/);
  if (!match) return errorResponse('Invalid subscription URL', 400, { skipNoStore: true });

  const token = match[1];
  const format = match[2].replace(/\/+$/, '');

  const formatInfo = FORMATS[format];
  if (!formatInfo) {
    return jsonResponse({ error: 'Unknown format', validFormats: Object.keys(FORMATS) }, 404, { skipNoStore: true });
  }

  if (request.method !== 'GET') {
    if (request.method === 'HEAD') {
      const headResolved = await resolveToken(token, env);
      if (headResolved.error) return errorResponse(headResolved.error, headResolved.status, { skipNoStore: true });
      return new Response(null, { status: 200, headers: { 'Content-Type': formatInfo.contentType } });
    }
    return errorResponse('Method Not Allowed', 405, { skipNoStore: true });
  }

  const resolved = await resolveToken(token, env);
  if (resolved.error) return errorResponse(resolved.error, resolved.status, { skipNoStore: true });

  const { account } = resolved;

  const cached = await getCachedSubscription(token, format, env);
  if (cached) {
    const safeName = sanitizeFilename(account.name) || 'warp';
    const headers = {
      'Content-Type': formatInfo.contentType,
      'Content-Disposition': `attachment; filename="${safeName}-${format}.${formatInfo.extension}"; filename*=utf-8''${safeName}-${format}.${formatInfo.extension}`,
      'Profile-Update-Interval': '24',
      'Cache-Control': 'max-age=300'
    };
    const body = formatInfo.isBinary ? Uint8Array.from(atob(cached), c => c.charCodeAt(0)) : cached;
    return new Response(body, { status: 200, headers });
  }

  const expanded = await expandEndpoints(account, env);
  if (expanded.error) return errorResponse(expanded.error, expanded.status, { skipNoStore: true });

  const configs = expanded.configs;
  if (configs.length === 0) return errorResponse('Account has no endpoints configured', 500, { skipNoStore: true });

  let body;
  let cacheData;

  if (format === 'wireguard-conf') {
    const zip = generateWireGuardConf(configs);
    body = zip;
    cacheData = bytesToBase64(zip);
  } else if (format === 'wireguard-conf-amnezia') {
    const globalRaw = await env.WARP_KV.get('settings:global', { type: 'json' });
    const globalAmnezia = globalRaw?.amnezia || null;
    const amneziaParams = resolveAmnezia(account, globalAmnezia);
    const zip = generateWireGuardConf(configs, amneziaParams);
    body = zip;
    cacheData = bytesToBase64(zip);
  } else if (format === 'throne') {
    body = generateThroneUri(configs);
    cacheData = body;
  } else if (format === 'throne-amnezia') {
    const globalRaw = await env.WARP_KV.get('settings:global', { type: 'json' });
    const globalAmnezia = globalRaw?.amnezia || null;
    const amneziaParams = resolveAmnezia(account, globalAmnezia);
    body = generateThroneUri(configs, amneziaParams);
    cacheData = body;
  } else if (format === 'wireguard-uri') {
    body = generateWireguardUri(configs);
    cacheData = body;
  } else if (format === 'singbox') {
    body = generateSingboxJson(configs);
    cacheData = body;
  } else if (format === 'singbox-legacy') {
    body = generateSingboxLegacyJson(configs);
    cacheData = body;
  } else if (format === 'xray') {
    body = generateXrayJson(configs);
    cacheData = body;
  } else if (format === 'clash') {
    body = generateClashYaml(configs);
    cacheData = body;
  } else if (format === 'v2rayn') {
    body = generateV2raynBase64(configs);
    cacheData = body;
  } else {
    return errorResponse('Format not implemented', 501, { skipNoStore: true });
  }

  try {
    await setCachedSubscription(token, format, cacheData, env);
  } catch (e) {
    console.error('Cache write failed (serving uncached):', e);
  }

  const safeName = sanitizeFilename(account.name) || 'warp';
  const headers = {
    'Content-Type': formatInfo.contentType,
    'Content-Disposition': `attachment; filename="${safeName}-${format}.${formatInfo.extension}"; filename*=utf-8''${safeName}-${format}.${formatInfo.extension}`,
    'Profile-Update-Interval': '24',
    'Cache-Control': 'max-age=300'
  };

  return new Response(body, { status: 200, headers });
}

// --- Route Handlers ---

async function handleSetup(request, env) {
  const existing = await env.WARP_KV.get('settings:password');
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

  const hash = await env.WARP_KV.get('settings:password');
  if (!hash) {
    return redirect('/admin/setup');
  }

  // Rate limiting: check failed attempts
  const failKey = `auth:fail:${ip}`;
  const fails = parseInt(await env.WARP_KV.get(failKey) || '0', 10);
  if (fails >= 5) {
    return redirect('/admin/login?error=rate_limited');
  }

  const effectivePassword = password ? password.slice(0, PASSWORD_MAX_BYTES) : '';
  let verifyResult;
  try {
    verifyResult = await verifyPassword(effectivePassword, hash);
  } catch {
    return redirect('/admin/login?error=invalid_password');
  }
  if (!verifyResult.valid) {
    // Increment failure counter (15-minute TTL)
    await env.WARP_KV.put(failKey, String(fails + 1), { expirationTtl: 900 });
    return redirect('/admin/login?error=invalid_password');
  }

  // Legacy bcrypt hash → re-hash as PBKDF2 and overwrite (one-time migration)
  if (verifyResult.migratedHash) {
    try {
      await env.WARP_KV.put('settings:password', verifyResult.migratedHash);
    } catch {
      // Non-fatal: legacy hash still verifies; migration retries on next login
    }
  }

  // Clear failure counter on success
  await env.WARP_KV.delete(failKey).catch(() => {});

  const { token } = await createSession(env);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);
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
    await destroySession(token, env);
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

async function handleDashboard() {
  return htmlResponse(DASHBOARD_HTML);
}

// --- Main Router ---

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  await initializeKV(env);

  // Root redirects to admin panel
  if (path === '/') return redirect('/admin');

  // Public routes
  if (path === '/admin/setup') return handleSetup(request, env);
  if (path === '/admin/login' && request.method === 'GET') return handleLogin(request, env);
  if (path === '/admin/login' && request.method === 'POST') return handleLogin(request, env);

  // Protected routes — check session
  if (path.startsWith('/admin') || path.startsWith('/api')) {
    const session = await validateSession(request, env);
    if (!session) {
      // First-run: no password set yet → go to setup
      const passwordSet = await env.WARP_KV.get('settings:password');
      if (!passwordSet) return redirect('/admin/setup');
      return redirect('/admin/login');
    }
  }

  // Session-protected admin routes
  if (path === '/admin/logout' && request.method === 'POST') return handleLogout(request, env);
  if (path === '/admin') return handleDashboard();

  // API routes
  if (path.startsWith('/api/account')) return handleAccountAPI(request, env, path);
  if (path.startsWith('/api/presets')) return handlePresetAPI(request, env, path);
  if (path.startsWith('/api/settings')) return handleSettingsAPI(request, env, path);
  if (path.startsWith('/api/')) return errorResponse('API not implemented yet', 501);
  if (path.startsWith('/sub/')) return handleSubscription(request, env, path);

  return errorResponse('Not Found', 404);
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env);
    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('Internal Server Error', 500);
    }
  }
};
