import bcrypt from 'bcryptjs';
import { x25519 } from '@noble/curves/ed25519';
import { zipSync } from 'fflate';
import YAML from 'js-yaml';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIE = 'session';
const BCRYPT_COST = 10;
const WARP_API_VERSION = 'v0a4005';
const WARP_API_BASE = `https://api.cloudflareclient.com/${WARP_API_VERSION}`;
const WARP_API_TIMEOUT = 10000;
const WARP_PEER_PUBLIC_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=';

const DEFAULT_PRESETS = [
  { id: 'default', name: 'Cloudflare Default', endpoints: [
    { ip: 'engage.cloudflareclient.com', port: 2408 },
    { ip: '162.159.192.1', port: 2408 },
    { ip: '162.159.192.1', port: 500 },
    { ip: '162.159.192.1', port: 1701 },
    { ip: '2606:4700:d0::a29f:c001', port: 2408 }
  ]}
];

const DEFAULT_AMNEZIA = { Jc: 5, Jmin: 50, Jmax: 1000, S1: 0, S2: 0, H1: 1, H2: 2, H3: 3, H4: 4 };

const DEFAULT_SETTINGS_GLOBAL = {
  amnezia: DEFAULT_AMNEZIA
};

const SETUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator — Setup</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
  <div class="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-md shadow-2xl">
    <h1 class="text-2xl font-bold mb-2 text-center">Warp Generator</h1>
    <p class="text-gray-400 text-center mb-6">Create your admin password</p>
    <form method="POST" action="/admin/setup" id="setupForm">
      <div class="mb-4">
        <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input type="password" id="password" name="password" required minlength="8" maxlength="128"
          class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Min 8 characters">
      </div>
      <div class="mb-6">
        <label for="confirm" class="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
        <input type="password" id="confirm" name="confirm" required minlength="8" maxlength="128"
          class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Re-enter password">
      </div>
      <div id="error" class="hidden mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm"></div>
      <button type="submit"
        class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition-colors">
        Set Password
      </button>
    </form>
  </div>
  <script>
    document.getElementById('setupForm').addEventListener('submit', function(e) {
      const pw = document.getElementById('password').value;
      const cf = document.getElementById('confirm').value;
      const err = document.getElementById('error');
      if (pw !== cf) {
        e.preventDefault();
        err.textContent = 'Passwords do not match';
        err.classList.remove('hidden');
      } else if (pw.length < 8) {
        e.preventDefault();
        err.textContent = 'Password must be at least 8 characters';
        err.classList.remove('hidden');
      }
    });
  </script>
</body>
</html>`;

const LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator — Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen flex items-center justify-center">
  <div class="bg-gray-900 border border-gray-700 rounded-xl p-8 w-full max-w-md shadow-2xl">
    <h1 class="text-2xl font-bold mb-2 text-center">Warp Generator</h1>
    <p class="text-gray-400 text-center mb-6">Sign in to admin panel</p>
    <form method="POST" action="/admin/login">
      <div class="mb-4">
        <label for="password" class="block text-sm font-medium text-gray-300 mb-1">Password</label>
        <input type="password" id="password" name="password" required
          class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Enter password">
      </div>
      <div id="error" class="hidden mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm"></div>
      <button type="submit"
        class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-semibold transition-colors">
        Login
      </button>
    </form>
  </div>
</body>
</html>`;

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Warp Generator — Admin</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 min-h-screen">
  <!-- Toast -->
  <div id="toast" class="fixed top-4 right-4 z-50 hidden px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all"></div>

  <!-- App Shell -->
  <div class="max-w-5xl mx-auto p-4 md:p-8">
    <!-- Header -->
    <header class="flex items-center justify-between mb-8">
      <h1 class="text-2xl font-bold tracking-tight">Warp Generator</h1>
      <nav class="flex items-center gap-3">
        <button onclick="navigate('accounts')" class="nav-btn px-3 py-1.5 rounded-lg text-sm hover:bg-gray-800 transition-colors" data-view="accounts">Accounts</button>
        <button onclick="navigate('settings')" class="nav-btn px-3 py-1.5 rounded-lg text-sm hover:bg-gray-800 transition-colors" data-view="settings">Settings</button>
        <form method="POST" action="/admin/logout" class="inline">
          <button type="submit" class="px-3 py-1.5 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 transition-colors">Logout</button>
        </form>
      </nav>
    </header>

    <!-- Accounts View -->
    <div id="view-accounts">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-semibold">Accounts</h2>
        <div class="flex gap-2">
          <button onclick="showCreateModal()" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">Create Account</button>
          <button onclick="showImportModal()" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors">Import Config</button>
        </div>
      </div>
      <div id="accounts-grid" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div class="text-gray-500 col-span-full text-center py-12">Loading accounts...</div>
      </div>
    </div>

    <!-- Account Detail View -->
    <div id="view-detail" class="hidden">
      <div class="flex items-center gap-3 mb-6">
        <button onclick="navigate('accounts')" class="p-2 rounded-lg hover:bg-gray-800 transition-colors">&larr;</button>
        <h2 id="detail-name" class="text-xl font-semibold"></h2>
        <span id="detail-token" class="text-xs text-gray-500 font-mono"></span>
      </div>

      <!-- Subscription URLs -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Subscription URLs</h3>
        <div id="sub-urls" class="space-y-3"></div>
      </div>

      <!-- Account Actions -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Account Settings</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm text-gray-400 mb-1">Account Name</label>
            <div class="flex gap-2">
              <input id="edit-name" type="text" class="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <button onclick="updateAccountName()" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Save</button>
            </div>
          </div>
          <div>
            <label class="block text-sm text-gray-400 mb-1">Endpoint Preset</label>
            <select id="edit-preset" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></select>
          </div>
          <div class="flex gap-2">
            <button onclick="regenerateToken()" class="px-4 py-2 rounded-lg bg-yellow-600/20 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-600/30 text-sm transition-colors">Regenerate Token</button>
            <button onclick="deleteAccount()" class="px-4 py-2 rounded-lg bg-red-600/20 text-red-400 border border-red-600/30 hover:bg-red-600/30 text-sm transition-colors">Delete Account</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings View -->
    <div id="view-settings" class="hidden">
      <h2 class="text-xl font-semibold mb-6">Settings</h2>

      <!-- Presets -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-6">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider">Endpoint Presets</h3>
          <button onclick="showAddPresetForm()" class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium transition-colors">Add Preset</button>
        </div>
        <div id="presets-list" class="space-y-3">
          <div class="text-gray-500 text-center py-4">Loading presets...</div>
        </div>
        <!-- Add preset form (hidden by default) -->
        <div id="add-preset-form" class="hidden mt-4 p-4 rounded-lg bg-gray-800 border border-gray-700">
          <input id="preset-name" type="text" placeholder="Preset name" class="w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-gray-100 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
          <div id="preset-endpoints" class="space-y-2 mb-3"></div>
          <button onclick="addPresetEndpointRow()" class="text-xs text-blue-400 hover:text-blue-300 mb-3">+ Add endpoint</button>
          <div class="flex gap-2">
            <button onclick="savePreset()" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm transition-colors">Save</button>
            <button onclick="hideAddPresetForm()" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
          </div>
        </div>
      </div>

      <!-- Amnezia Defaults -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Amnezia Defaults</h3>
        <div class="grid grid-cols-3 gap-3 mb-4">
          <div><label class="block text-xs text-gray-500 mb-1">Jc (0-200)</label><input id="amn-jc" type="number" min="0" max="200" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">Jmin (0-1280)</label><input id="amn-jmin" type="number" min="0" max="1280" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">Jmax (0-1280)</label><input id="amn-jmax" type="number" min="0" max="1280" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">S1 (0-255)</label><input id="amn-s1" type="number" min="0" max="255" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">S2 (0-255)</label><input id="amn-s2" type="number" min="0" max="255" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">H1 (0-4294967295)</label><input id="amn-h1" type="number" min="0" max="4294967295" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">H2 (0-4294967295)</label><input id="amn-h2" type="number" min="0" max="4294967295" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">H3 (0-4294967295)</label><input id="amn-h3" type="number" min="0" max="4294967295" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
          <div><label class="block text-xs text-gray-500 mb-1">H4 (0-4294967295)</label><input id="amn-h4" type="number" min="0" max="4294967295" class="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"></div>
        </div>
        <button onclick="saveAmnezia()" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">Save Amnezia Defaults</button>
      </div>
    </div>

    <!-- Create Account Modal -->
    <div id="modal-create" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-40">
      <div class="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Create New Account</h3>
        <input id="create-name" type="text" placeholder="Account name (e.g. Home ISP)" class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <div id="create-error" class="hidden mb-3 p-2 rounded bg-red-900/50 border border-red-700 text-red-300 text-xs"></div>
        <div class="flex gap-2 justify-end">
          <button onclick="closeModal('modal-create')" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
          <button onclick="createAccount()" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">Create</button>
        </div>
      </div>
    </div>

    <!-- Import Account Modal -->
    <div id="modal-import" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-40">
      <div class="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <h3 class="text-lg font-semibold mb-4">Import Config</h3>
        <input id="import-name" type="text" placeholder="Account name" class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500">
        <textarea id="import-config" rows="8" placeholder="Paste WireGuard .conf or wg:// URI..." class="w-full px-4 py-2 rounded-lg bg-gray-800 border border-gray-600 text-gray-100 text-sm font-mono mb-1 focus:outline-none focus:ring-2 focus:ring-blue-500"></textarea>
        <p class="text-xs text-gray-500 mb-3">Supports WireGuard .conf and wg:// URI formats</p>
        <div id="import-error" class="hidden mb-3 p-2 rounded bg-red-900/50 border border-red-700 text-red-300 text-xs"></div>
        <div class="flex gap-2 justify-end">
          <button onclick="closeModal('modal-import')" class="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-colors">Cancel</button>
          <button onclick="importAccount()" class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium transition-colors">Import</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const SUB_FORMATS = [
      { key: 'wireguard-conf', label: 'WireGuard .conf (ZIP)', icon: '📦' },
      { key: 'wireguard-conf-amnezia', label: 'WireGuard .conf Amnezia (ZIP)', icon: '📦' },
      { key: 'throne', label: 'Throne wg:// URI', icon: '🔗' },
      { key: 'throne-amnezia', label: 'Throne wg:// Amnezia', icon: '🔗' },
      { key: 'wireguard-uri', label: 'wireguard:// URI', icon: '🔗' },
      { key: 'singbox', label: 'Sing-box JSON', icon: '{ }' },
      { key: 'xray', label: 'Xray JSON', icon: '{ }' },
      { key: 'clash', label: 'Clash YAML', icon: '~' },
      { key: 'v2rayn', label: 'V2RayN Base64', icon: 'b64' }
    ];

    let currentView = 'accounts';
    let accounts = [];
    let presets = [];
    let currentAccountId = null;
    let currentAccount = null;

    function toast(msg, type = 'success') {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.className = 'fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ' +
        (type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white');
      t.classList.remove('hidden');
      setTimeout(() => t.classList.add('hidden'), 3000);
    }

    function closeModal(id) {
      document.getElementById(id).classList.add('hidden');
    }

    function navigate(view, data) {
      currentView = view;
      document.getElementById('view-accounts').classList.toggle('hidden', view !== 'accounts');
      document.getElementById('view-detail').classList.toggle('hidden', view !== 'detail');
      document.getElementById('view-settings').classList.toggle('hidden', view !== 'settings');
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('bg-gray-800', b.dataset.view === view));
      if (view === 'accounts') loadAccounts();
      if (view === 'detail' && data) loadAccountDetail(data);
      if (view === 'settings') loadSettings();
    }

    async function api(path, opts = {}) {
      const res = await fetch(path, {
        method: opts.method || 'GET',
        headers: opts.body ? { 'Content-Type': 'application/json' } : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    async function loadAccounts() {
      try {
        accounts = await api('/api/account');
        renderAccounts();
      } catch (e) {
        document.getElementById('accounts-grid').innerHTML =
          '<div class="text-red-400 col-span-full text-center py-12">' + e.message + '</div>';
      }
    }

    function renderAccounts() {
      const grid = document.getElementById('accounts-grid');
      if (accounts.length === 0) {
        grid.innerHTML = '<div class="text-gray-500 col-span-full text-center py-12">No accounts yet. Create or import one.</div>';
        return;
      }
      grid.innerHTML = accounts.map(a => {
        const created = new Date(a.created_at).toLocaleDateString();
        const tokenShort = a.token.substring(0, 8) + '...';
        return '<div class="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer" onclick="navigate(\\'detail\\', \\'' + a.id + '\\')">' +
          '<div class="flex items-start justify-between mb-3">' +
            '<h3 class="font-semibold text-sm truncate">' + escHtml(a.name) + '</h3>' +
            '<span class="text-xs text-gray-500">' + created + '</span>' +
          '</div>' +
          '<div class="text-xs text-gray-500 font-mono mb-3">' + tokenShort + '</div>' +
          '<div class="flex gap-1">' +
            '<span class="px-2 py-0.5 rounded bg-gray-800 text-xs text-gray-400">' + (a.endpoint_list?.type === 'preset' ? 'Preset' : 'Custom') + '</span>' +
            (a.amnezia_overrides ? '<span class="px-2 py-0.5 rounded bg-purple-900/50 text-xs text-purple-300">Amnezia</span>' : '') +
          '</div>' +
        '</div>';
      }).join('');
    }

    function escHtml(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showCreateModal() {
      document.getElementById('create-name').value = '';
      document.getElementById('create-error').classList.add('hidden');
      document.getElementById('modal-create').classList.remove('hidden');
    }

    function showImportModal() {
      document.getElementById('import-name').value = '';
      document.getElementById('import-config').value = '';
      document.getElementById('import-error').classList.add('hidden');
      document.getElementById('modal-import').classList.remove('hidden');
    }

    async function createAccount() {
      const name = document.getElementById('create-name').value.trim();
      const errEl = document.getElementById('create-error');
      if (!name) { errEl.textContent = 'Name required'; errEl.classList.remove('hidden'); return; }
      try {
        const account = await api('/api/account/generate', { method: 'POST', body: { name } });
        closeModal('modal-create');
        toast('Account created');
        navigate('detail', account.id);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
    }

    async function importAccount() {
      const name = document.getElementById('import-name').value.trim();
      const config = document.getElementById('import-config').value.trim();
      const errEl = document.getElementById('import-error');
      if (!name) { errEl.textContent = 'Name required'; errEl.classList.remove('hidden'); return; }
      if (!config) { errEl.textContent = 'Config required'; errEl.classList.remove('hidden'); return; }
      try {
        const account = await api('/api/account/import', { method: 'POST', body: { name, config } });
        closeModal('modal-import');
        toast('Account imported');
        navigate('detail', account.id);
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
    }

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

    function renderSubUrls() {
      const container = document.getElementById('sub-urls');
      const token = currentAccount.token;
      const baseUrl = location.origin;
      container.innerHTML = SUB_FORMATS.map(f => {
        const url = baseUrl + '/sub/' + token + '/' + f.key;
        return '<div class="flex items-center gap-2">' +
          '<span class="text-lg w-6 text-center opacity-50">' + f.icon + '</span>' +
          '<div class="flex-1 min-w-0">' +
            '<div class="text-xs font-medium text-gray-300">' + f.label + '</div>' +
            '<div class="text-xs text-gray-500 font-mono truncate">' + escHtml(url) + '</div>' +
          '</div>' +
          '<button onclick="copyUrl(\\'' + escHtml(url) + '\\')" class="px-2 py-1 rounded bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 transition-colors shrink-0">Copy</button>' +
        '</div>';
      }).join('');
    }

    function copyUrl(url) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(() => toast('Copied!'));
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        toast('Copied!');
      }
    }

    async function updateAccountName() {
      const name = document.getElementById('edit-name').value.trim();
      if (!name) return toast('Name required', 'error');
      try {
        await api('/api/account/' + currentAccountId, { method: 'PUT', body: { name } });
        currentAccount.name = name;
        document.getElementById('detail-name').textContent = name;
        toast('Name updated');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function regenerateToken() {
      if (!confirm('Regenerate token? Old subscription URLs will stop working.')) return;
      try {
        const data = await api('/api/account/' + currentAccountId + '/regenerate-token', { method: 'POST' });
        currentAccount.token = data.token;
        document.getElementById('detail-token').textContent = data.token;
        renderSubUrls();
        toast('Token regenerated');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function deleteAccount() {
      if (!confirm('Delete this account permanently?')) return;
      try {
        await api('/api/account/' + currentAccountId, { method: 'DELETE' });
        toast('Account deleted');
        navigate('accounts');
      } catch (e) { toast(e.message, 'error'); }
    }

    async function loadPresetsForSelect() {
      try {
        presets = await api('/api/presets');
        const sel = document.getElementById('edit-preset');
        sel.innerHTML = presets.map(p =>
          '<option value="' + p.id + '"' + (currentAccount.endpoint_list?.preset_id === p.id ? ' selected' : '') + '>' + escHtml(p.name) + ' (' + p.endpoints.length + ' endpoints)</option>'
        ).join('');
        if (currentAccount.endpoint_list?.type === 'custom') {
          sel.innerHTML = '<option value="" selected>Custom endpoints</option>' + sel.innerHTML;
        }
      } catch (e) {}
    }

    // Settings
    async function loadSettings() {
      try {
        presets = await api('/api/presets');
        renderPresets();
        const amn = await api('/api/settings/amnezia');
        document.getElementById('amn-jc').value = amn.Jc;
        document.getElementById('amn-jmin').value = amn.Jmin;
        document.getElementById('amn-jmax').value = amn.Jmax;
        document.getElementById('amn-s1').value = amn.S1;
        document.getElementById('amn-s2').value = amn.S2;
        document.getElementById('amn-h1').value = amn.H1;
        document.getElementById('amn-h2').value = amn.H2;
        document.getElementById('amn-h3').value = amn.H3;
        document.getElementById('amn-h4').value = amn.H4;
      } catch (e) { toast(e.message, 'error'); }
    }

    function renderPresets() {
      const list = document.getElementById('presets-list');
      if (presets.length === 0) {
        list.innerHTML = '<div class="text-gray-500 text-center py-4">No presets</div>';
        return;
      }
      list.innerHTML = presets.map(p => {
        const eps = p.endpoints.map(e => e.ip + ':' + e.port).join(', ');
        return '<div class="flex items-center justify-between p-3 rounded-lg bg-gray-800">' +
          '<div class="min-w-0">' +
            '<div class="text-sm font-medium">' + escHtml(p.name) + '</div>' +
            '<div class="text-xs text-gray-500 font-mono truncate">' + escHtml(eps) + '</div>' +
          '</div>' +
          '<button onclick="deletePreset(\\'' + p.id + '\\')" class="px-2 py-1 rounded text-xs text-red-400 hover:bg-red-900/30 transition-colors">Delete</button>' +
        '</div>';
      }).join('');
    }

    function showAddPresetForm() {
      document.getElementById('add-preset-form').classList.remove('hidden');
      document.getElementById('preset-name').value = '';
      document.getElementById('preset-endpoints').innerHTML = '';
      addPresetEndpointRow();
    }
    function hideAddPresetForm() { document.getElementById('add-preset-form').classList.add('hidden'); }

    function addPresetEndpointRow() {
      const container = document.getElementById('preset-endpoints');
      const row = document.createElement('div');
      row.className = 'flex gap-2';
      row.innerHTML = '<input type="text" placeholder="IP or domain" class="flex-1 px-3 py-1.5 rounded bg-gray-900 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ep-ip">' +
        '<input type="number" placeholder="Port" min="1" max="65535" class="w-20 px-3 py-1.5 rounded bg-gray-900 border border-gray-700 text-gray-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 ep-port">' +
        '<button onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-300 text-xs px-1">&times;</button>';
      container.appendChild(row);
    }

    async function savePreset() {
      const name = document.getElementById('preset-name').value.trim();
      if (!name) return toast('Name required', 'error');
      const rows = document.getElementById('preset-endpoints').children;
      const endpoints = [];
      for (const row of rows) {
        const ip = row.querySelector('.ep-ip').value.trim();
        const port = parseInt(row.querySelector('.ep-port').value);
        if (!ip || !port) return toast('Fill all endpoint fields', 'error');
        endpoints.push({ ip, port });
      }
      try {
        await api('/api/presets', { method: 'POST', body: { name, endpoints } });
        hideAddPresetForm();
        toast('Preset created');
        loadSettings();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function deletePreset(id) {
      if (!confirm('Delete this preset?')) return;
      try {
        await api('/api/presets/' + id, { method: 'DELETE' });
        toast('Preset deleted');
        loadSettings();
      } catch (e) { toast(e.message, 'error'); }
    }

    async function saveAmnezia() {
      const body = {
        Jc: parseInt(document.getElementById('amn-jc').value) || 0,
        Jmin: parseInt(document.getElementById('amn-jmin').value) || 0,
        Jmax: parseInt(document.getElementById('amn-jmax').value) || 0,
        S1: parseInt(document.getElementById('amn-s1').value) || 0,
        S2: parseInt(document.getElementById('amn-s2').value) || 0,
        H1: parseInt(document.getElementById('amn-h1').value) || 0,
        H2: parseInt(document.getElementById('amn-h2').value) || 0,
        H3: parseInt(document.getElementById('amn-h3').value) || 0,
        H4: parseInt(document.getElementById('amn-h4').value) || 0
      };
      try {
        await api('/api/settings/amnezia', { method: 'PUT', body });
        toast('Amnezia defaults saved');
      } catch (e) { toast(e.message, 'error'); }
    }

    // Init
    navigate('accounts');
  </script>
</body>
</html>`;

// --- KV Helpers ---

async function initializeKV(env) {
  const existing = await env.WARP_KV.get('settings:global');
  if (existing) return;

  await env.WARP_KV.put('presets', JSON.stringify(DEFAULT_PRESETS));
  await env.WARP_KV.put('settings:global', JSON.stringify(DEFAULT_SETTINGS_GLOBAL));
}

// --- Session Helpers ---

function parseCookie(request) {
  const header = request.headers.get('Cookie') || '';
  const match = header.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}; Path=/`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Max-Age=0; Path=/`;
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
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: { Location: location }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
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
    return { error: 'Warp API rate limited, try again in 60s', status: 503 };
  }
  if (response.status >= 500) {
    return { error: 'Warp API error, try again later', status: 503 };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    return { error: `Warp API error: ${response.status} ${text}`, status: 502 };
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

  return {
    config: {
      private_key: privateKey,
      public_key: publicKey,
      addresses: {
        ipv4: config.interface.addresses.v4,
        ipv6: config.interface.addresses.v6
      },
      peer_public_key: config.peers[0].public_key,
      mtu: 1280,
      reserved: [0, 0, 0]
    }
  };
}

// --- Config Parsers (Task 7) ---

function parseWireGuardConf(text) {
  if (typeof text !== 'string') return { error: 'Invalid config: not a string' };
  if (text.length < 100) return { error: 'Invalid config (too short)' };
  if (text.length > 10240) return { error: 'Config too large (max 10KB)' };

  const sections = {};
  let currentSection = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

    const sectionMatch = trimmed.match(/^\[(\w+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1].toLowerCase();
      if (!sections[currentSection]) sections[currentSection] = {};
      continue;
    }

    if (!currentSection) continue;

    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (kvMatch) {
      const key = kvMatch[1].toLowerCase();
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
  const mtu = iface['mtu'] ? parseInt(iface['mtu'], 10) : 1280;

  const amneziaOverrides = {};
  if (iface['jc'] !== undefined) amneziaOverrides.Jc = parseInt(iface['jc'], 10);
  if (iface['jmin'] !== undefined) amneziaOverrides.Jmin = parseInt(iface['jmin'], 10);
  if (iface['jmax'] !== undefined) amneziaOverrides.Jmax = parseInt(iface['jmax'], 10);
  if (iface['s1'] !== undefined) amneziaOverrides.S1 = parseInt(iface['s1'], 10);
  if (iface['s2'] !== undefined) amneziaOverrides.S2 = parseInt(iface['s2'], 10);
  if (iface['h1'] !== undefined) amneziaOverrides.H1 = parseInt(iface['h1'], 10);
  if (iface['h2'] !== undefined) amneziaOverrides.H2 = parseInt(iface['h2'], 10);
  if (iface['h3'] !== undefined) amneziaOverrides.H3 = parseInt(iface['h3'], 10);
  if (iface['h4'] !== undefined) amneziaOverrides.H4 = parseInt(iface['h4'], 10);

  return {
    config: {
      private_key: privateKey,
      public_key: publicKey,
      addresses,
      peer_public_key: peer['publickey'],
      mtu: isNaN(mtu) ? 1280 : mtu,
      reserved: [0, 0, 0]
    },
    amnezia_overrides: Object.keys(amneziaOverrides).length ? amneziaOverrides : null
  };
}

function parseWgUri(uri) {
  if (typeof uri !== 'string') return { error: 'Invalid wg:// URI: not a string' };

  let url;
  try {
    url = new URL(uri);
  } catch {
    return { error: 'Invalid wg:// URI format' };
  }

  if (url.protocol !== 'wg:') return { error: 'Invalid wg:// URI format: must start with wg://' };

  const params = parseWgUriParams(url.search);
  const privateKey = params.private_key;
  const localAddress = params.local_address;
  const mtuParam = params.mtu;
  const publicKey = params.public_key;

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
  const mtu = mtuParam ? parseInt(mtuParam, 10) : 1280;

  const amneziaOverrides = {};
  if (params.enable_amnezia === 'true' || params.enable_amnezia === '1') {
    if (params.jc !== undefined) amneziaOverrides.Jc = parseInt(params.jc, 10);
    if (params.jmin !== undefined) amneziaOverrides.Jmin = parseInt(params.jmin, 10);
    if (params.jmax !== undefined) amneziaOverrides.Jmax = parseInt(params.jmax, 10);
  }

  return {
    config: {
      private_key: privateKey,
      public_key: derivedPublicKey,
      addresses,
      peer_public_key: publicKey,
      mtu: isNaN(mtu) ? 1280 : mtu,
      reserved: [0, 0, 0]
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

function parseAddresses(addressStr) {
  const parts = addressStr.split(',').map(s => s.trim()).filter(Boolean);
  let ipv4 = null;
  let ipv6 = null;

  for (const part of parts) {
    if (part.includes(':') && part.includes('/')) {
      ipv6 = part;
    } else if (part.includes('.')) {
      ipv4 = part;
    }
  }

  if (!ipv4 && !ipv6) return { error: 'Invalid config: no valid addresses found' };
  return { ipv4: ipv4 || '', ipv6: ipv6 || '' };
}

function parseAddressPair(addressStr) {
  const parts = addressStr.split('-').map(s => s.trim()).filter(Boolean);
  let ipv4 = null;
  let ipv6 = null;

  for (const part of parts) {
    if (part.includes(':') && part.includes('/')) {
      ipv6 = part;
    } else if (part.includes('.')) {
      ipv4 = part;
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
  // IPv6 (simplified check)
  if (ip.includes(':') && /^[\da-fA-F:]+$/.test(ip)) return null;
  // Domain
  if (/^[a-zA-Z0-9]([a-zA-Z0-9\-\.]*[a-zA-Z0-9])?$/.test(ip)) return null;
  return 'Invalid IP address or domain';
}

function validatePort(port) {
  if (port === undefined || port === null) return 'Port required';
  const n = Number(port);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'Port must be 1-65535';
  return null;
}

function validateAmneziaParam(value, name, min, max) {
  if (value === undefined || value === null) return null; // optional
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
    for (let i = 0; i < el.custom_endpoints.length; i++) {
      const ep = el.custom_endpoints[i];
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
    validateAmneziaParam(a.Jc, 'Jc', 0, 200),
    validateAmneziaParam(a.Jmin, 'Jmin', 0, 1280),
    validateAmneziaParam(a.Jmax, 'Jmax', 0, 1280),
    validateAmneziaParam(a.S1, 'S1', 0, 255),
    validateAmneziaParam(a.S2, 'S2', 0, 255),
    validateAmneziaParam(a.H1, 'H1', 0, 4294967295),
    validateAmneziaParam(a.H2, 'H2', 0, 4294967295),
    validateAmneziaParam(a.H3, 'H3', 0, 4294967295),
    validateAmneziaParam(a.H4, 'H4', 0, 4294967295)
  ];
  for (const err of checks) { if (err) return err; }
  return null;
}

// --- Preset Management API (Task 20) ---

async function handlePresetList(env) {
  const raw = await env.WARP_KV.get('presets', { type: 'json' });
  return jsonResponse(raw || DEFAULT_PRESETS);
}

async function handlePresetCreate(request, env) {
  let body;
  try { body = await request.json(); } catch { return errorResponse('Invalid JSON body'); }

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return errorResponse('Preset name required');
  }
  if (body.name.length > 100) return errorResponse('Preset name too long (max 100)');
  if (!Array.isArray(body.endpoints) || body.endpoints.length === 0) {
    return errorResponse('At least one endpoint required');
  }
  for (let i = 0; i < body.endpoints.length; i++) {
    const ep = body.endpoints[i];
    const ipErr = validateIPv4OrIPv6OrDomain(ep.ip);
    if (ipErr) return errorResponse(`Endpoint ${i + 1}: ${ipErr}`);
    const portErr = validatePort(ep.port);
    if (portErr) return errorResponse(`Endpoint ${i + 1}: ${portErr}`);
  }

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
    if (!Array.isArray(body.endpoints) || body.endpoints.length === 0) {
      return errorResponse('At least one endpoint required');
    }
    for (let i = 0; i < body.endpoints.length; i++) {
      const ep = body.endpoints[i];
      const ipErr = validateIPv4OrIPv6OrDomain(ep.ip);
      if (ipErr) return errorResponse(`Endpoint ${i + 1}: ${ipErr}`);
      const portErr = validatePort(ep.port);
      if (portErr) return errorResponse(`Endpoint ${i + 1}: ${portErr}`);
    }
    presets[idx].endpoints = body.endpoints;
  }

  try {
    await env.WARP_KV.put('presets', JSON.stringify(presets));
  } catch {
    return errorResponse('Failed to save preset', 500);
  }

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
  const idMatch = path.match(/^\/api\/presets\/([a-f0-9-]+)$/);

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
  if (typeof body.config === 'string' && body.config.trim().startsWith('wg://')) {
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

  await invalidateSubscriptionCache(account.token, env);

  return jsonResponse(sanitizeAccount(account));
}

async function handleAccountDelete(id, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  await invalidateSubscriptionCache(account.token, env);

  if (!(await deleteAccount(env, account))) {
    return errorResponse('Failed to delete account', 500);
  }

  return jsonResponse({ success: true });
}

async function handleAccountRegenerateToken(id, env) {
  const account = await getAccount(env, id);
  if (!account) return errorResponse('Account not found', 404);

  const oldToken = account.token;
  await invalidateSubscriptionCache(oldToken, env);
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
    const preset = presets.find(p => p.id === account.endpoint_list.preset_id);
    if (!preset) return { error: 'Endpoint preset missing', status: 500 };
    endpoints = preset.endpoints;
  } else {
    endpoints = account.endpoint_list.custom_endpoints;
  }

  return {
    configs: endpoints.map(ep => ({
      name: account.name,
      endpoint: `${ep.ip}:${ep.port}`,
      ip: ep.ip,
      port: ep.port,
      private_key: account.config.private_key,
      addresses: account.config.addresses,
      peer_public_key: account.config.peer_public_key,
      mtu: account.config.mtu,
      reserved: account.config.reserved
    }))
  };
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
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
    content += `Address = ${cfg.addresses.ipv4}, ${cfg.addresses.ipv6}\n`;
    content += `DNS = 1.1.1.1\n`;
    content += `MTU = ${cfg.mtu}\n`;

    if (amneziaParams) {
      content += `Jc = ${amneziaParams.Jc}\n`;
      content += `Jmin = ${amneziaParams.Jmin}\n`;
      content += `Jmax = ${amneziaParams.Jmax}\n`;
      content += `S1 = ${amneziaParams.S1}\n`;
      content += `S2 = ${amneziaParams.S2}\n`;
      content += `H1 = ${amneziaParams.H1}\n`;
      content += `H2 = ${amneziaParams.H2}\n`;
      content += `H3 = ${amneziaParams.H3}\n`;
      content += `H4 = ${amneziaParams.H4}\n`;
    }

    content += `\n[Peer]\n`;
    content += `PublicKey = ${cfg.peer_public_key}\n`;
    content += `AllowedIPs = 0.0.0.0/0, ::/0\n`;
    content += `Endpoint = ${cfg.endpoint}\n`;
    content += `PersistentKeepalive = 25\n`;

    files[filename] = textEncoderEncode(content);
  }

  return zipSync(files);
}

// --- Format Generators (Tasks 12-17) ---

// Task 12: Throne wg:// URI generator (vanilla + Amnezia)
function generateThroneUri(configs, amneziaParams = null) {
  const lines = [];

  for (const cfg of configs) {
    const encodedPrivateKey = encodeURIComponent(cfg.private_key);
    const addressPair = `${cfg.addresses.ipv4}-${cfg.addresses.ipv6}`;
    const encodedAddress = encodeURIComponent(addressPair);
    const encodedPublicKey = encodeURIComponent(cfg.peer_public_key);
    const configName = encodeURIComponent(cfg.name);

    let uri = `wg://${cfg.endpoint}?private_key=${encodedPrivateKey}&local_address=${encodedAddress}&mtu=${cfg.mtu}&public_key=${encodedPublicKey}&persistent_keepalive_interval=25#${configName}`;

    if (amneziaParams) {
      uri = `wg://${cfg.endpoint}?private_key=${encodedPrivateKey}&local_address=${encodedAddress}&mtu=${cfg.mtu}&enable_amnezia=true&jc=${amneziaParams.Jc}&jmin=${amneziaParams.Jmin}&jmax=${amneziaParams.Jmax}&s1=${amneziaParams.S1}&s2=${amneziaParams.S2}&h1=${amneziaParams.H1}&h2=${amneziaParams.H2}&h3=${amneziaParams.H3}&h4=${amneziaParams.H4}&public_key=${encodedPublicKey}&persistent_keepalive_interval=25#${configName}`;
    }

    lines.push(uri);
  }

  return lines.join('\n');
}

// Task 13: wireguard:// URI generator (no Amnezia)
function generateWireguardUri(configs) {
  const lines = [];

  for (const cfg of configs) {
    const encodedPrivateKey = encodeURIComponent(cfg.private_key);
    const encodedPublicKey = encodeURIComponent(cfg.peer_public_key);
    const address = encodeURIComponent(cfg.addresses.ipv4);
    const allowedIps = encodeURIComponent('0.0.0.0/0,::/0');
    const configName = encodeURIComponent(cfg.name);

    const uri = `wireguard://${encodedPrivateKey}@${cfg.endpoint}?publickey=${encodedPublicKey}&address=${address}&allowedips=${allowedIps}&mtu=${cfg.mtu}#${configName}`;

    lines.push(uri);
  }

  return lines.join('\n');
}

// Task 14: Sing-box JSON generator (legacy outbound format)
function generateSingboxJson(configs) {
  const outbounds = configs.map(cfg => ({
    type: 'wireguard',
    tag: cfg.name,
    server: cfg.ip,
    server_port: cfg.port,
    local_address: [cfg.addresses.ipv4, cfg.addresses.ipv6],
    private_key: cfg.private_key,
    peer_public_key: cfg.peer_public_key,
    mtu: cfg.mtu,
    reserved: cfg.reserved
  }));

  return JSON.stringify({ outbounds }, null, 2);
}

// Task 15: Xray JSON generator
function generateXrayJson(configs) {
  const outbounds = configs.map(cfg => ({
    protocol: 'wireguard',
    tag: cfg.name,
    settings: {
      secretKey: cfg.private_key,
      address: [cfg.addresses.ipv4, cfg.addresses.ipv6],
      peers: [{
        endpoint: cfg.endpoint,
        publicKey: cfg.peer_public_key,
        keepAlive: 25
      }],
      mtu: cfg.mtu,
      reserved: cfg.reserved
    }
  }));

  return JSON.stringify({ outbounds }, null, 2);
}

// Task 16: Clash YAML generator
function generateClashYaml(configs) {
  const proxies = configs.map(cfg => ({
    name: cfg.name,
    type: 'wireguard',
    server: cfg.ip,
    port: cfg.port,
    'ip': cfg.addresses.ipv4.replace(/\/\d+$/, ''),
    'ipv6': cfg.addresses.ipv6.replace(/\/\d+$/, ''),
    'private-key': cfg.private_key,
    'public-key': cfg.peer_public_key,
    udp: true,
    reserved: cfg.reserved,
    mtu: cfg.mtu
  }));

  return YAML.dump({ proxies }, { lineWidth: -1 });
}

// Task 17: V2RayN base64 generator
function generateV2raynBase64(configs) {
  const uris = generateWireguardUri(configs);
  return btoa(uris);
}

// --- Subscription Caching (Task 19) ---

const CACHE_TTL_MS = 300000; // 5 minutes

function getCacheKey(token, format) {
  const timeBucket = Math.floor(Date.now() / CACHE_TTL_MS);
  return `cache:${token}:${format}:${timeBucket}`;
}

async function getCachedSubscription(token, format, env) {
  const key = getCacheKey(token, format);
  return await env.WARP_KV.get(key);
}

async function setCachedSubscription(token, format, data, env) {
  const key = getCacheKey(token, format);
  await env.WARP_KV.put(key, data, { expirationTtl: 600 });
}

async function invalidateSubscriptionCache(token, env) {
  let cursor;
  do {
    const result = await env.WARP_KV.list({ prefix: `cache:${token}:`, cursor });
    for (const key of result.keys) {
      await env.WARP_KV.delete(key.name);
    }
    cursor = result.cursor;
  } while (cursor);
}

// --- Subscription Route Handlers ---

const FORMATS = {
  'wireguard-conf': { contentType: 'application/zip', extension: 'zip', isBinary: true },
  'wireguard-conf-amnezia': { contentType: 'application/zip', extension: 'zip', isBinary: true },
  'throne': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'throne-amnezia': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'wireguard-uri': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false },
  'singbox': { contentType: 'application/json', extension: 'json', isBinary: false },
  'xray': { contentType: 'application/json', extension: 'json', isBinary: false },
  'clash': { contentType: 'application/x-yaml; charset=utf-8', extension: 'yaml', isBinary: false },
  'v2rayn': { contentType: 'text/plain; charset=utf-8', extension: 'txt', isBinary: false }
};

async function handleSubscription(request, env, path) {
  const match = path.match(/^\/sub\/([a-f0-9-]+)\/(.+)$/);
  if (!match) return errorResponse('Invalid subscription URL', 400);

  const token = match[1];
  const format = match[2];

  const formatInfo = FORMATS[format];
  if (!formatInfo) return errorResponse('Unknown format', 404);

  const resolved = await resolveToken(token, env);
  if (resolved.error) return errorResponse(resolved.error, resolved.status);

  const { account } = resolved;

  const cached = await getCachedSubscription(token, format, env);
  if (cached) {
    const headers = {
      'Content-Type': formatInfo.contentType,
      'Content-Disposition': `attachment; filename*=utf-8''${sanitizeFilename(account.name)}-${format}.${formatInfo.extension}`,
      'Profile-Update-Interval': '24',
      'Subscription-Userinfo': 'upload=0; download=0; total=104857600; expire=4102329600',
      'Cache-Control': 'max-age=300'
    };
    const body = formatInfo.isBinary ? Uint8Array.from(atob(cached), c => c.charCodeAt(0)) : cached;
    return new Response(body, { status: 200, headers });
  }

  const expanded = await expandEndpoints(account, env);
  if (expanded.error) return errorResponse(expanded.error, expanded.status);

  const configs = expanded.configs;
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
    return errorResponse('Format not implemented', 501);
  }

  await setCachedSubscription(token, format, cacheData, env);

  const headers = {
    'Content-Type': formatInfo.contentType,
    'Content-Disposition': `attachment; filename*=utf-8''${sanitizeFilename(account.name)}-${format}.${formatInfo.extension}`,
    'Profile-Update-Interval': '24',
    'Subscription-Userinfo': 'upload=0; download=0; total=104857600; expire=4102329600',
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

  const formData = await request.formData();
  const password = formData.get('password');

  if (!password || password.length < 8 || password.length > 128) {
    const errorPage = SETUP_HTML.replace(
      '<div id="error" class="hidden mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm"></div>',
      '<div class="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">Password must be at least 8 characters</div>'
    );
    return htmlResponse(errorPage, 400);
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST);
  await env.WARP_KV.put('settings:password', hash);

  return redirect('/admin/login');
}

async function handleLogin(request, env) {
  if (request.method === 'GET') {
    return htmlResponse(LOGIN_HTML);
  }

  const formData = await request.formData();
  const password = formData.get('password');

  const hash = await env.WARP_KV.get('settings:password');
  if (!hash) {
    return redirect('/admin/setup');
  }

  const valid = await bcrypt.compare(password, hash);
  if (!valid) {
    const errorPage = LOGIN_HTML.replace(
      '<div id="error" class="hidden mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm"></div>',
      '<div class="mb-4 p-3 rounded-lg bg-red-900/50 border border-red-700 text-red-300 text-sm">Invalid password</div>'
    );
    return htmlResponse(errorPage, 400);
  }

  const { token } = await createSession(env);
  const maxAge = Math.floor(SESSION_DURATION_MS / 1000);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin',
      'Set-Cookie': sessionCookie(token, maxAge)
    }
  });
}

async function handleLogout(request, env) {
  const token = parseCookie(request);
  if (token) {
    await destroySession(token, env);
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/admin/login',
      'Set-Cookie': clearSessionCookie()
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
