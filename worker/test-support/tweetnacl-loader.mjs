// Loader: resolve the 'tweetnacl' bare specifier to the local stub above.
// Only active under `node --test` (via module.register()); it never affects
// the wrangler bundle.
export async function resolve(specifier, context, next) {
  if (specifier === 'tweetnacl') {
    return { url: new URL('./tweetnacl-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return next(specifier, context);
}