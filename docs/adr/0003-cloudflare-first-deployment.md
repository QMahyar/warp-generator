# Cloudflare-first deployment

Cloudflare Worker is the production target (Pages Function kept in parity).
Vercel, Netlify and Docker builds still pass CI but receive no new features —
maintaining four targets in parity was the old product's cost (plans 001–004)
and the subscription service is Cloudflare-shaped: KV for state, edge caching,
sub clients fetching worker URLs.

Status: accepted.