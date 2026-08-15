# Research task: subscription format per client for WARP/WireGuard configs

We are building a Cloudflare Worker (repo: warp-generator) that registers one
WARP account and serves subscription links — one WireGuard config per endpoint
— in **different formats, one per client family**. We need the facts on what
each client accepts in a subscription.

Context: read `docs/research/bpb-panel.md` first.

## Research these clients — primary sources only (official docs, wikis, repos)

1. **v2rayN** (github.com/2dust/v2rayN wiki) — does it import WireGuard/WARP
   from a subscription URL? What link syntax (wg:// , base64 list, json)?
2. **NekoRay / NekoBox** (github.com/MatsuriDayo/nekoray) — WireGuard import
   from subscriptions; its config json.
3. **Husi** — subscription format; how WARP/WireGuard profiles appear.
4. **sing-box** (sing-box.sagernet.org docs) — wireguard outbound; subscription
   formats it accepts.
5. **Clash Meta / Mihomo** (wiki.metacubex.one) — `proxies:` wireguard entries;
   how YAML subscriptions are served (raw yaml vs base64).
6. **Karing** (github.com/KaringX/karing) — subscription formats.
7. **AmneziaWG** — awg:// link scheme and .conf.
8. **Official WireGuard app** — .conf files / zip import; what a "subscription"
   means for it (typically none — confirm).
9. **WARP-specific subscription tooling** — what do existing WARP sub
   generators/panels actually serve (bf panels, warp sub repos, the fscarmen
   WARP scripts)? Look at one or two real examples and describe the payload.

## Deliverable

Write `docs/research/sub-formats.md` (in this repo) containing:

1. A table: client | accepts subscription URL (yes/no/how) | WireGuard/WARP
   link format | import method | notes.
2. For each client that takes subscriptions: the exact payload shape (sample
   line/block), and which fields a wg:// URL supports (public key, endpoint,
   reserved, mtu, etc.).
3. A recommended v1 format set for our worker: one sub endpoint per client
   family (e.g. `/sub` wg:// base64, `/sub/clash` yaml, `/sub/singbox` json,
   …) with justification, plus which formats can be merged into one endpoint.
4. Sources: every claim cited with its URL.

Cite each claim to its primary source. Prefer reading actual docs over
summaries. Keep the file under ~200 lines. Reply with exactly DONE when
`docs/research/sub-formats.md` is written.