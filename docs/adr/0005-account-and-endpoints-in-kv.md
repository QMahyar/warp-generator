# WARP account and endpoints live in KV

Two pieces of mutable state, both stored in a KV binding, both written only by
panel actions: the WARP account (Register/Rotate) and the endpoint list (the
editor's Save). Not env secrets (rotation would mean redeploying), not memory
(a redeploy would wipe the account and break every subscriber). On an empty
endpoint list the subscriptions fall back to two known-good endpoints so a
fresh deploy's links still work.

Status: accepted.