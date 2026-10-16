import { NextRequest, NextResponse } from 'next/server';
import { assemblerFiche } from '../../../../lib/ficheJv';
import { consoleDepuisPlateforme } from '../../../../lib/consolesJv';

export const dynamic = 'force-dynamic';

/** Fiche assemblée depuis toutes les sources (voir lib/ficheJv.ts).
 *  `?titre=…&console=PS5&igdb_id=123&image=…` */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const titre = sp.get('titre')?.trim();
  if (!titre) return NextResponse.json({ error: 'Paramètre titre manquant' }, { status: 400 });
  try {
    const fiche = await assemblerFiche({
      titre,
      console: consoleDepuisPlateforme(sp.get('console')),
      igdbId: Number(sp.get('igdb_id')) || null,
      imageSecours: sp.get('image'),
    });
    return NextResponse.json(fiche);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 502 });
  }
}
