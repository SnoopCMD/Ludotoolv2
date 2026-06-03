export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initOpenNextCloudflareForDev } = await import('@opennextjs/cloudflare');
    await initOpenNextCloudflareForDev();
  }
}
