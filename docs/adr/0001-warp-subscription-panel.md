# Pivot to a WARP subscription panel

The repo was a stateless config generator (register a fresh WARP per request,
return one config, discard keys). We pivoted: the product is now a
password-gated subscription panel — one WARP account kept alive, rendered as a
config per endpoint behind stable subscription URLs — modelled on BPB
Worker-Panel's Warp subscription but deliberately without BPB's VLESS, Trojan,
DoH, chain-proxy and routing machinery (`docs/research/bpb-panel.md`). The
generator survives as a secondary tab in the same panel because its engine
already runs in the worker bundle.

Status: accepted. Considered options: extend the generator with a sub feature
(rejected — the two have opposite state models: stateless-per-request vs
one-account-persistent).