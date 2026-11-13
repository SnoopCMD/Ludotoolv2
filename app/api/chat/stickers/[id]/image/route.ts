import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { compteCourant } from '../../../../../../lib/auth';
import { cleR2Sticker } from '../../../../../../lib/chat-serveur';

/**
 * L'image d'un sticker, pour les comptes connectés. Un sticker ne change
 * jamais (nouvel import = nouvel id) : le navigateur peut le garder en cache.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await compteCourant()) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: 'Sticker introuvable.' }, { status: 404 });
    const { env } = await getCloudflareContext({ async: true });
    const objet = await env.REGLES.get(cleR2Sticker(id));
    if (!objet) return NextResponse.json({ error: 'Sticker introuvable.' }, { status: 404 });
    const headers = new Headers();
    headers.set('Content-Type', objet.httpMetadata?.contentType ?? 'application/octet-stream');
    headers.set('Content-Length', String(objet.size));
    headers.set('ETag', objet.httpEtag);
    headers.set('Cache-Control', 'private, max-age=31536000, immutable');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(objet.body, { headers });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
