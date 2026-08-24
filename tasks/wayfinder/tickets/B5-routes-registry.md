# B5 — Route table + format registry + listAccounts

Status: OPEN
Type: task (AFK)
Blocked by: B3, B4

## Question / Work

1. Declarative route table at module scope: {method, pattern segments, auth: bool, handler}; exact segment matching; automatic 405 with Allow header on method mismatch (fixes startsWith('/api/account') matching /api/accounting); middleware chain withSession/withRateLimit replacing inline dispatcher if-blocks; single place answering "what does this route do".
2. Format generator registry: FORMATS entries become {contentType, ext, binary, needsAmnezia, gen}; handleSubscription collapses to resolve → expand → gen → respond (~40 lines); kill copy-pasted Amnezia resolution block + unreachable 501 else; normalize addresses/tags/AllowedIPs ONCE in expandEndpoints (dedupe the .includes('/') ternaries, tag-naming ternaries ×4, AllowedIPs literals ×4).
3. listAccounts: parallelize account gets (Promise.all batches of ~20) or maintained accounts:index key; same fix applied to handlePresetDelete referential scan.
4. Per-token DNS setting: replace hardcoded `DNS = 1.1.1.1` with per-account/preset field defaulting to 1.1.1.1 (schema additive).

## Acceptance

- ALL goldens byte-identical after registry refactor (proves refactor safe).
- New route table covered by smoke tests (405, unknown path 404, auth redirect).

## Answer

(resolved on close)
