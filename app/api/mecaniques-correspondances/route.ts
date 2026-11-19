import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { compteCourant } from '../../../lib/auth';
import { MECANIQUES, normaliserLibelle } from '../../../lib/etiquetteJeu';

export const dynamic = 'force-dynamic';

/**
 * Banque de correspondances libellé MyLudo → mécanique d'étiquette
 * (table mecaniques_correspondances, migration 0032). Ouverte à toute
 * l'équipe, comme le reste de l'atelier ; le compte connecté est noté.
 */

type Ligne = { cle: string; libelle: string; mecanique: string; cree_par: string | null; modifie_le: string };

/** Toutes les correspondances, par libellé. */
export async function GET() {
  try {
    const db = await getDB();
    const { results } = await db.prepare('SELECT cle, libelle, mecanique, cree_par, modifie_le FROM mecaniques_correspondances ORDER BY libelle').all<Ligne>();
    return NextResponse.json(results ?? []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Ajoute ou remplace une correspondance : { libelle, mecanique }. */
export async function POST(request: Request) {
  try {
    const body = await request.json() as { libelle?: unknown; mecanique?: unknown };
    const libelle = String(body.libelle ?? '').trim().slice(0, 80);
    const mecanique = String(body.mecanique ?? '').trim();
    const cle = normaliserLibelle(libelle);
    if (!cle) return NextResponse.json({ error: 'Libellé manquant.' }, { status: 400 });
    if (!MECANIQUES.includes(mecanique)) return NextResponse.json({ error: 'Mécanique inconnue.' }, { status: 400 });
    const compte = await compteCourant();
    const db = await getDB();
    await db.prepare(
      `INSERT INTO mecaniques_correspondances (cle, libelle, mecanique, cree_par, modifie_le) VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(cle) DO UPDATE SET libelle = excluded.libelle, mecanique = excluded.mecanique, cree_par = excluded.cree_par, modifie_le = excluded.modifie_le`
    ).bind(cle, libelle, mecanique, compte?.identifiant ?? null).run();
    return NextResponse.json({ success: true, cle, libelle, mecanique });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Retire une correspondance : ?libelle=… (ou ?cle=…). */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const cle = searchParams.get('cle') || normaliserLibelle(searchParams.get('libelle') ?? '');
    if (!cle) return NextResponse.json({ error: 'Libellé manquant.' }, { status: 400 });
    const db = await getDB();
    await db.prepare('DELETE FROM mecaniques_correspondances WHERE cle = ?').bind(cle).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
