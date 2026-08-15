# Subscriptions protected by an unguessable path, not a password

Sub clients fetch subscription URLs without credentials — that is how
subscriptions work in every client — so the panel password cannot gate them.
Instead each subscription lives under a token from a `SUB_PATH` secret (e.g.
`/api/<token>/sub`), which is what stope non-subscribers from guessing the
link. The panel prints the ready-to-paste URLs. Response caching
(`s-maxage ~6h`) keeps sub fetches off the worker's free-tier request budget.

Status: accepted.