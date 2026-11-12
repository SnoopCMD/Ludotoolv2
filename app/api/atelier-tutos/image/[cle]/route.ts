import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

/** Une illustration de tuto. Chaque envoi a sa propre clé : le contenu ne change jamais. */
export async function GET(_: Request, { params }: { params: Promise<{ cle: string }> }) {
  try {
    const { cle } = await params;
    if (!/^[0-9a-f-]{36}\.(webp|jpg|png)$/.test(cle)) return NextResponse.json({ error: 'Clé invalide.' }, { status: 400 });
    const { env } = await getCloudflareContext({ async: true });
    const objet = await env.REGLES.get(`tutos/${cle}`);
    if (!objet) return NextResponse.json({ error: 'Image introuvable.' }, { status: 404 });
    const headers = new Headers();
    headers.set('Content-Type', objet.httpMetadata?.contentType ?? 'application/octet-stream');
    headers.set('ETag', objet.httpEtag);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return new Response(objet.body, { headers });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
