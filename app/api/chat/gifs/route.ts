import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { compteCourant } from '../../../../lib/auth';
import { mediaGifValide, type ReponseGifs, type ResultatGif } from '../../../../lib/chat';

export const dynamic = 'force-dynamic';

const PAR_PAGE = 24;

/**
 * Recherche de GIF pour la messagerie, via GIPHY. La clé (`GIPHY_API_KEY`,
 * secret du Worker) reste côté serveur : le navigateur n'appelle que cette
 * route. Sans `q`, renvoie les GIF du moment.
 *
 * `rating=pg` : outil de travail, contenu tout public. Les fichiers eux-mêmes
 * sont servis par GIPHY (jamais copiés chez nous), d'où l'attribution
 * « Powered by GIPHY » dans le sélecteur.
 */
export async function GET(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });

    const { env } = await getCloudflareContext({ async: true });
    const cle = (env as unknown as { GIPHY_API_KEY?: string }).GIPHY_API_KEY ?? process.env.GIPHY_API_KEY;
    if (!cle) {
      return NextResponse.json({ error: 'Les GIF ne sont pas encore configurés (clé GIPHY manquante).', code: 'sans_cle' }, { status: 503 });
    }

    const url = new URL(request.url);
    const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50);
    const offset = Math.max(0, Math.min(4900, Number(url.searchParams.get('offset')) || 0));

    const giphy = new URL(`https://api.giphy.com/v1/gifs/${q ? 'search' : 'trending'}`);
    giphy.searchParams.set('api_key', cle);
    giphy.searchParams.set('limit', String(PAR_PAGE));
    giphy.searchParams.set('offset', String(offset));
    giphy.searchParams.set('rating', 'pg');
    giphy.searchParams.set('bundle', 'messaging_non_clips');
    if (q) { giphy.searchParams.set('q', q); giphy.searchParams.set('lang', 'fr'); }

    const r = await fetch(giphy.toString(), { headers: { Accept: 'application/json' } });
    if (!r.ok) return NextResponse.json({ error: `GIPHY ne répond pas (${r.status}).` }, { status: 502 });
    const d = await r.json() as {
      data?: { id: string; title?: string; images?: { fixed_width?: { url?: string; webp?: string; mp4?: string; width?: string; height?: string } } }[];
      pagination?: { total_count?: number; count?: number; offset?: number };
    };

    const gifs: ResultatGif[] = [];
    for (const g of d.data ?? []) {
      const f = g.images?.fixed_width;
      const media = mediaGifValide({ url: f?.webp || f?.url, mp4: f?.mp4 ?? null, largeur: Number(f?.width), hauteur: Number(f?.height) });
      if (media && /^[A-Za-z0-9]{1,64}$/.test(g.id)) gifs.push({ id: g.id, titre: (g.title ?? '').slice(0, 120), ...media });
    }
    const vus = offset + (d.pagination?.count ?? gifs.length);
    const total = d.pagination?.total_count ?? 0;
    const corps: ReponseGifs = { gifs, suite: gifs.length && vus < total ? vus : null };
    return NextResponse.json(corps, { headers: { 'Cache-Control': 'private, max-age=60' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
