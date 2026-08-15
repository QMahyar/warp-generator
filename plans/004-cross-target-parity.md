# Plan 004: Cross-target parity — DNS drift, fetch timeouts, QR privacy

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 68b3da8..HEAD -- config/dns.ts lib/cloudflare-client.ts lib/qr-generator.ts config/formats.ts worker/api-handler.js functions/api/generate.js`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 001 (flips `supportsQR` flags on entries 001 created), 003 (translated error strings in the same files)
- **Category**: security / bug / perf
- **Planned at**: commit `68b3da8`, 2026-08-15
- **Issue**: —

## Why this matters

Three deployment targets carry three near-identical copies of the generation
logic (`lib/*` TS for Vercel/Netlify/Docker, `worker/api-handler.js` for
Cloudflare Workers, `functions/api/generate.js` for Netlify edge). They have
drifted apart in three harmful ways:

1. **DNS drift**: `config/dns.ts` lists 8 providers (cf, google, quad9, malw,
   xbox, geohide, comss, mafioznik) but the two JS copies list only 6. When a
   user picks `quad9` or `mafioznik`, the JS paths silently fall back to
   `1.1.1.1` (`getDnsProvider` returns `DNS_PROVIDERS[0]`).
2. **No fetch timeouts**: `registerClient` and `enableWarp` fetch calls in all
   three implementations have no `AbortSignal`, so a stalled Cloudflare API can
   hang the request indefinitely (the QR fetch already has an 8s timeout —
   `lib/qr-generator.ts:6` — proving the intended pattern).
3. **QR privacy leak**: `generateQR` in the JS copies sends the FULL config —
   including the WireGuard `PrivateKey` — as a URL query parameter to
   `https://api.qrserver.com/v1/create-qr-code/`. The Vercel path never does
   (all formats are `supportsQR: false`). This transmits the user's private key
   to a third party. Fix: generate the QR locally (pure-JS encoder) so the key
   never leaves the server.

After this plan: DNS providers match across all targets, all CF fetches have
timeouts, and QR codes are generated locally on every target (with
`supportsQR` enabled for the same 3 formats the Workers path already
supports).

## Current state

- `config/dns.ts:19-76` — 8 providers; `getDnsProvider` (80-82) falls back to `DNS_PROVIDERS[0]` on unknown id:
  ```ts
  { id: 'quad9', label: 'dns.quad9.net', ipv4: ['9.9.9.9', '149.112.112.112'], ipv6: ['2620:fe::fe', '2620:fe::9'], isCommunity: false },
  ...
  { id: 'mafioznik', label: 'dns.mafioznik.xyz', ipv4: ['103.27.157.38', '103.27.157.100'], ipv6: [], isCommunity: true },
  ```
- `worker/api-handler.js:71-78` and `functions/api/generate.js:68-75` — only 6 providers (missing quad9, mafioznik); identical `getDnsProvider` fallback.
- `lib/cloudflare-client.ts:22-26` (registerClient) and `:43-47` (enableWarp) — fetches with NO `signal`.
- `worker/api-handler.js:253-271` and `functions/api/generate.js:249-267` — same two fetches, no signal.
- `lib/qr-generator.ts:1-20` — `generateQR` with `AbortSignal.timeout(8000)` and `data:` PNG base64 output (leak-free because Vercel path never calls it today).
- `worker/api-handler.js:275-285` and `functions/api/generate.js:270-280`:
  ```js
  async function generateQR(text) {
    try {
      const res = await fetch(`https://api.qrserver.com/v1/create-qr-code/?size=200x200&format=png&data=${encodeURIComponent(text)}`);
      ...
      return `data:image/png;base64,${btoa(binary)}`;
    } catch { return ''; }
  }
  ```
  Called at `worker/api-handler.js:393-396` / `functions/api/generate.js:396-399` guarded by `QR_FORMATS = ['wireguard', 'throne', 'wiresock']` (`:345` / `:339`).
- `config/formats.ts` — after plan 001, all 7 entries exist with `supportsQR: false`.
- `lib/builders/index.ts:31-36` — `buildConfigForQR` exists and handles `throne`, `wireguard`, `wiresock` (strips MTU for wireguard/wiresock, matching the JS `:394`).

Repo conventions: `AbortSignal.timeout` is already used in `lib/qr-generator.ts:6`.
The JS copies use `fetch` with plain options objects. `package.json` has no
QR dependency yet.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `npm install qrcode`     | exit 0              |
| Typecheck | `npm run typecheck`      | exit 0              |
| Build     | `npm run build`          | exit 0              |
| Lint      | `npm run lint`           | exit 0              |
| Workers build | `npx wrangler deploy --dry-run --outdir .wrangler-check` (if wrangler available; otherwise skip) | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `config/dns.ts` — only if needed to make it the canonical 8-provider source (it already is; no change expected)
- `lib/cloudflare-client.ts`, `worker/api-handler.js`, `functions/api/generate.js` — timeouts + QR rewrite
- `lib/qr-generator.ts` — QR rewrite (local generation)
- `config/formats.ts` — flip `supportsQR` for wireguard/throne/wiresock
- `package.json` — add `qrcode` dependency (and `package-lock.json` if present; otherwise generated by install)

**Out of scope** (do NOT touch, even though they look related):
- `scripts/build-ip-ranges.mjs`, `scripts/build-i1-masks.mjs` — separate codegen, not affected.
- DNS provider data itself — copy from `config/dns.ts` verbatim; do not invent values.
- The triplicated QUIC (`quic*`) functions in the JS files — parity refactor is deferred (see plans/README.md).
- `lib/builders/*` — no changes needed.
- Any change to the API response shape (`configBase64`, `qrCodeBase64`, etc.).

## Git workflow

- Branch: `advisor/004-cross-target-parity`
- Commit message style (conventional, matches repo): `fix: align DNS, add fetch timeouts, generate QR locally on all targets`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the missing DNS providers to both JS copies

In `worker/api-handler.js` after line 78 (`{ id: 'comss', ... }` entry) and in
`functions/api/generate.js` after line 75 (same `comss` entry), insert the
`quad9` and `mafioznik` entries copied VERBATIM from `config/dns.ts:34-40` and
`:69-75`. Preserve the existing one-line-per-entry style of the JS files.

**Verify**:
- `rg -n "quad9|mafioznik" worker/api-handler.js functions/api/generate.js` → 2 matches each
- `Get-Content worker/api-handler.js | Select-String "id: '" | Measure-Object` → 8 matches (same for functions copy)

### Step 2: Add fetch timeouts to Cloudflare client calls

Add `signal: AbortSignal.timeout(10000)` to the four fetch calls (10s, matching
the existing 8s QR timeout intent):

- `lib/cloudflare-client.ts:22` (`registerClient`) and `:43` (`enableWarp`)
- `worker/api-handler.js:254` and `:264`
- `functions/api/generate.js:250` and `:260`

The JS copies have no AbortSignal usage today; `AbortSignal.timeout` is
available in all target runtimes (Node 18+, Workers, Netlify edge).

**Verify**: `rg -n "AbortSignal.timeout" lib/cloudflare-client.ts worker/api-handler.js functions/api/generate.js` → 6 matches total.

### Step 3: Generate QR locally in `lib/qr-generator.ts`

Replace the `fetch` to qrserver.com with a local QR encoding using the `qrcode`
package. Install first: `npm install qrcode`.

New implementation shape:

```ts
import QRCode from 'qrcode';

export async function generateQR(text: string): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(text, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    return dataUrl;
  } catch {
    return fallbackSVG();
  }
}
```

Keep `unsupportedQR` and `fallbackSVG` exactly as-is (their strings were
translated to English by plan 003). Remove the `fetch`, the `AbortSignal` from
this function, and the old URL. `qrCodeBase64` consumers are unchanged (still a
`data:` URI).

**Verify**: `npm run typecheck` → exit 0. `rg -n "qrserver" lib/` → no matches.

### Step 4: Generate QR locally in both JS copies

In `worker/api-handler.js:275-285` and `functions/api/generate.js:270-280`,
replace `generateQR` with a local implementation using `qrcode`. These files
already import npm packages at the top (`import nacl from 'tweetnacl'` at
`:1`), so add `import QRCode from 'qrcode';` beside them.

```js
async function generateQR(text) {
  try {
    return await QRCode.toDataURL(text, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
  } catch { return ''; }
}
```

Keep the call sites (`worker/api-handler.js:392-396`, `functions/api/generate.js:395-399`) and `QR_FORMATS` unchanged. Do NOT keep the qrserver URL anywhere.

**Verify**: `rg -n "qrserver" worker functions` → no matches.

### Step 5: Enable QR support on the Vercel/Netlify/Docker path

In `config/formats.ts`, set `supportsQR: true` for exactly `wireguard`,
`throne`, and `wiresock` (matching `worker/api-handler.js:345`). The other four
stay `false`. `lib/warp-service.ts:48-50` will then call `buildConfigForQR`
(which already handles those three formats — `lib/builders/index.ts:31-36`) and
`generateQR` from step 3.

**Verify**: `Get-Content config/formats.ts | Select-String "supportsQR"` → 3 `true`, 4 `false`.
Also confirm the 3 `true` lines belong to `wireguard`, `throne`, `wiresock`.

### Step 6: Final verification

**Verify**:
- `npm run typecheck` → exit 0
- `npm run lint` → exit 0
- `npm run build` → exit 0
- `rg -n "qrserver" . -g '!node_modules' -g '!.next'` → no matches
- `git status` → only in-scope files modified (plus `package-lock.json` if it appeared)

## Test plan

No test runner exists in this repo. Verification is the gates above plus a
manual smoke check if a local server is available:
`npm run dev` then `Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/generate -ContentType 'application/json' -Body '{"configFormat":"throne","siteMode":"all","endpoint":"162.159.195.1:500","deviceType":"awg15"}'`
— expected: HTTP 200 with `success: true`, `content.qrCodeBase64` starting
with `data:image/png;base64,` (may fail on Cloudflare API errors; a 400/500
with a clear message is still evidence the local QR path compiled).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `rg -n "quad9" worker/api-handler.js functions/api/generate.js` → 1 match each
- [ ] `rg -n "mafioznik" worker/api-handler.js functions/api/generate.js` → 1 match each
- [ ] `rg -n "AbortSignal.timeout" lib/cloudflare-client.ts worker/api-handler.js functions/api/generate.js` → 6 matches
- [ ] `rg -n "qrserver" . -g '!node_modules' -g '!.next'` → no matches
- [ ] `config/formats.ts` has exactly 3 `supportsQR: true` (wireguard, throne, wiresock)
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all exit 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 004 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- `npm install qrcode` fails or `qrcode` does not import cleanly in the JS copies (report the error; the QR fix may need a different approach).
- The DNS provider entries in `config/dns.ts` differ from the excerpts (values may have been updated upstream — then copy the LIVE values, and note the change in your report).
- `npm run build` fails and the cause is not in an in-scope file.
- The fix appears to require touching an out-of-scope file.

## Maintenance notes

- The three copies of this logic remain duplicated (deferred unification — see
  `plans/README.md`); future DNS provider additions must be applied to all
  three files, or the codegen scripts extended.
- `qrcode` is the new QR dependency; both JS copies import it from
  `node_modules`, so any deployment must run `npm install` (already true for
  tweetnacl/buffer).
- QR content still contains the private key by design (it's a config-import QR);
  the fix ensures the key is encoded locally and never transmitted to a third
  party.
- If `AbortSignal.timeout` is unsupported in an old Netlify runtime, fall back
  to a manual `AbortController` + `setTimeout` — but only if verification
  actually fails that way.