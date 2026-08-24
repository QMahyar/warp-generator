# B1 — Test harness, golden files, CI

Status: OPEN
Type: task (AFK)
Blocked by: B0

## Question / Work

Zero tests today; this gates every later batch.
1. Append named-exports block to `_worker.js` (additive; Workers ignores extra exports): parseWireGuardConf, parseWgUri, parseAddresses, parseAddressPair, isValidIpv6Part, validateName, validateIPv4OrIPv6OrDomain, validatePort, validateAmneziaSettings, validateEndpointList, expandEndpoints, all 7+ format generators, sanitizeFilename, resolveAmnezia, FORMATS.
2. `node:test` harness (`test/*.mjs`, script `npm test`), zero new deps.
3. Golden files `test/golden/{format}.txt`: fixed fixture (SPEC's known key, v4+v6 CIDR addresses, reserved:[1,2,3], name "Home ISP", 5-endpoint preset covering domain/IPv4/bracketed-IPv6). Byte-compare; UPDATE_GOLDEN=1 regenerates. ZIP asserted via unzipSync members.
4. Structural contracts per format: JSON parses + unique tags + route.final === first tag; YAML round-trips unique names; base64 decodes to N lines; conf re-parses through own parser.
5. Edge matrix: 1 config, unicode name, 100-char name, IPv4-only, IPv6-only, reserved [0,0,0], amnezia range strings.
6. Parity test: UI SUB_FORMATS keys === server FORMATS keys.
7. `.github/workflows/ci.yml`: checkout → node 22 → npm ci → `node --check _worker.js` → `npm test` → `npx wrangler deploy --dry-run --outdir=dist`; deploy job on push to master behind secret CLOUDFLARE_API_TOKEN (job may stay red until secret set — acceptable).

## Acceptance

- `npm test` green locally on current behavior (goldens = baseline truth).
- Dry-run passes in CI config.

## Answer

(resolved on close)
