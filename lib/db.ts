import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getDB() {
  const ctx = await getCloudflareContext({ async: true });
  return ctx.env.DB;
}
