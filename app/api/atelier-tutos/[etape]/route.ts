import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { compteCourant } from '../../../../lib/auth';
import { ETAPES_ATELIER } from '../../../../lib/etapesAtelier';
import {
  MAX_GESTES, MAX_TEXTE, MAX_TITRE, PREFIXE_IMAGE_TUTO, peutModifierTutos, type GesteTuto,
} from '../../../../lib/tutosAtelier';

export const dynamic = 'force-dynamic';

const imageValide = (s: string) => s.startsWith('/tutos/') || s.startsWith(PREFIXE_IMAGE_TUTO);

/** Remplace le tuto d'une étape (liste vide : le supprime). Réservé aux éditeurs des tutos. */
export async function PUT(request: Request, { params }: { params: Promise<{ etape: string }> }) {
  try {
    const compte = await compteCourant();
    if (!peutModifierTutos(compte)) return NextResponse.json({ error: 'Réservé à l\'édition des tutos.' }, { status: 403 });

    const { etape } = await params;
    if (!ETAPES_ATELIER.some(e => e.id === etape)) return NextResponse.json({ error: 'Étape inconnue.' }, { status: 404 });

    const body = await request.json() as { gestes?: unknown };
    if (!Array.isArray(body.gestes) || body.gestes.length > MAX_GESTES) {
      return NextResponse.json({ error: `Entre 0 et ${MAX_GESTES} gestes.` }, { status: 400 });
    }
    const gestes: GesteTuto[] = [];
    for (const g of body.gestes as any[]) {
      const titre = String(g?.titre ?? '').trim().slice(0, MAX_TITRE);
      const texte = String(g?.texte ?? '').trim().slice(0, MAX_TEXTE);
      const image = String(g?.image ?? '').trim();
      if (!titre || !imageValide(image)) return NextResponse.json({ error: 'Chaque geste a besoin d\'un titre et d\'une illustration.' }, { status: 400 });
      gestes.push(texte ? { titre, texte, image } : { titre, image });
    }

    const { env } = await getCloudflareContext({ async: true });
    const ancien = await env.DB.prepare('SELECT gestes FROM atelier_tutos WHERE etape_id = ?').bind(etape).first<{ gestes: string }>();

    if (gestes.length) {
      await env.DB.prepare(
        `INSERT INTO atelier_tutos (etape_id, gestes, modifie_le, modifie_par) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?)
         ON CONFLICT(etape_id) DO UPDATE SET gestes = excluded.gestes, modifie_le = excluded.modifie_le, modifie_par = excluded.modifie_par`
      ).bind(etape, JSON.stringify(gestes), compte!.identifiant).run();
    } else {
      await env.DB.prepare('DELETE FROM atelier_tutos WHERE etape_id = ?').bind(etape).run();
    }

    // Les illustrations de R2 que ce tuto n'utilise plus sont supprimées.
    let anciennes: string[] = [];
    try { anciennes = (JSON.parse(ancien?.gestes ?? '[]') as GesteTuto[]).map(g => g.image); } catch { /* rien */ }
    const gardees = new Set(gestes.map(g => g.image));
    for (const url of anciennes) {
      if (url.startsWith(PREFIXE_IMAGE_TUTO) && !gardees.has(url)) {
        await env.REGLES.delete(`tutos/${url.slice(PREFIXE_IMAGE_TUTO.length)}`).catch(() => {});
      }
    }

    return NextResponse.json({ success: true, gestes });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
