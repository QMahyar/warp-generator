// Fake X25519 keypair for `node --test` — tweetnacl is a bundle-time
// dependency (wrangler bundles it for the worker) but is not installed
// locally, so account.js lazy-imports it (see its module header). This stub
// is wired in via module.register() from accounts.test.js; the worker
// bundle keeps resolving the real dependency.
const nacl = {
  box: {
    keyPair: () => ({
      secretKey: Uint8Array.from({ length: 32 }, (_, i) => (i * 7) % 256),
      publicKey: Uint8Array.from({ length: 32 }, (_, i) => (i * 13) % 256),
    }),
  },
};
export default nacl;