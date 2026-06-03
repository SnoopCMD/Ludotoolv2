export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      // Only available in local dev with `next dev`, not in Cloudflare Workers
      const { initOpenNextCloudflareForDev } = await import(
        /* webpackIgnore: true */ '@opennextjs/cloudflare'
      );
      await initOpenNextCloudflareForDev();
    } catch {
      // wrangler module not available in Workers runtime — safe to ignore
    }
  }
}
