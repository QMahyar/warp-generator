# B8 — Install moment: QR, deep links, client picker, safety nets

Status: OPEN
Type: task (AFK)
Blocked by: B7

## Question / Work

1. Inline QR generator (~10KB, no CDN) + per-format QR modal for every subscription URL.
2. Deep links per format: hiddify://import-subscription?url=, singbox://import-remote-profile?url=, clash://install-subscription?url=, throne:// import variant, wireguard:///throne:// URI formats where applicable — "Open in {client}" buttons alongside Copy.
3. Guided client picker replacing flat 10-row dump as primary view: "What are you using? Hiddify/NekoBox/Throne/WireSock/WireGuard…" → recommended URL (+alternates); maps clients to correct format (e.g. Hiddify → singbox-legacy).
4. Pre-destructive safety nets: account delete confirm offers "Download all configs (.zip)" inline; token regen confirm states how many client URLs it breaks.
5. Import accepts drag-drop .conf/.zip file input in addition to paste.

## Acceptance

- QR decodes to correct URL (scan-test via QA agent screenshot or zxing check).
- Deep links present for all client-supported formats; picker flow reaches a working import in ≤2 taps after page load.

## Answer

(resolved on close)
