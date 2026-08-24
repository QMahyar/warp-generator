# C1 — P0: Subscription headers + deep links + clash-amnezia

Status: TODO
Priority: P0 — DPI bypass + subscription UX
Depends: none (research done by 10 scouts 2026-08-23)

## Scope
Scout verdict: 10 scouts confirm gaps. Implement all three together (same code regions, one golden update).

### 1) Subscription headers (`_worker.js:6211` subscriptionHeaders)
Add to every `/sub/{token}/{format}` response:
- `profile-title: <base64(account.label || tokenMeta.label || group)>` — Sub-Store/Shadowrocket/Clash Verge show name. Encode via `btoa(unescape(encodeURIComponent(label)))` or plain if ASCII-safe.
- `subscription-userinfo: upload=0; download=0; total=0; expire=<tokenMeta.expiresAt unix>` — use 0s for unlimited WARP, expire only if tokenMeta.expiresAt set (Math.floor(new Date(expiresAt)/1000)). Omit if no expiry.
- `profile-web-page-url: <origin>/admin` — only when UA contains `clash` (Verge gating) OR always (safe). Keep existing `Profile-Update-Interval` + `Content-Disposition: filename=` for non-ZIP too.
- Respect `X-WG-Version` already present.

### 2) Deep links (`_worker.js:2046-2052` SUB_FORMATS + `_worker.js:884` deepLinkUrl)
Add twins/aliases without new FORMATS:
- `stash://install-config?url=` alongside `clash://install-subscription?url=` for `clash` format (Stash listens on both, native `stash://` preferred)
- `clash://install-config?url=` alias alongside `clash://install-subscription?url=`
- `hiddify://import/<url>` (current) alongside legacy `hiddify://import-subscription?url=` for `singbox-legacy`
- `loon://import?sub=` for clash YAML (Loon major iOS)

### 3) clash-amnezia (`_worker.js:6102` generateClashYaml, `_worker.js:6198` FORMATS)
New `FORMATS['clash-amnezia'] = { contentType:'application/x-yaml', ext:'yaml', binary:false, needsAmnezia:true, gen: generateClashYaml }`
- Extend `generateClashYaml(configs, amnezia)` to emit `amnezia-wg-option:` block when hasAmnezia (same amneziaSet logic as wireguard-conf): `jc,jmin,jmax,s1,s2,h1-4` (omit zeros, H as string). Reference: https://wiki.metacubex.one/en/config/proxies/wg/
- Add to dashboard SUB_FORMATS, update FORMATS parity.

## Acceptance
- `node --check _worker.js` + `npm test` (218 → ~219-220) + `npm run goldens:update` (new clash-amnezia.txt + header goldens if any) + `npx wrangler deploy --dry-run --outdir=dist`
- Manual: import clash-amnezia.yaml in Mihomo/Verge + Stash deep link one-tap + Sub-Store shows title

## References
- Scouts: clash/mihomo, SIP008/URI, surge/loon/qx reports 2026-08-23
- https://wiki.metacubex.one/en/config/proxies/wg/
- https://github.com/KaringX/clashmi/issues/395
