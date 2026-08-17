# Single worker with a lean built-in panel UI

The Cloudflare Worker serves everything: a framework-less single-page panel
(login → account → endpoints → subscription links → generator), the API routes,
and the subscription endpoints. The Next.js UI and components remain in the
repo and are actively maintained; the existing `worker/api-handler.js` grows
into the whole app. Rejected: Next.js on Pages (`@cloudflare/next-on-pages`)
for the panel — heavier deploys, known CF integration pain, and a UI/API split
with CORS juggling; the panel is ~4 screens, not a reason to carry a framework.

Status: accepted.