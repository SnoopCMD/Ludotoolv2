import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { SEANCES, inserer, lireLigne } from '../../../../lib/reunion';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM reunion_seances ORDER BY date DESC, cree_le DESC').all();
    return NextResponse.json(result.results.map(r => lireLigne(SEANCES, r)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Lance une séance. S'il y en a déjà une en cours, on la renvoie plutôt que d'en ouvrir une seconde. */
export async function POST(request: Request) {
  try {
    const db = await getDB();
    const enCours = await db.prepare("SELECT * FROM reunion_seances WHERE statut = 'en_cours' LIMIT 1").first<any>();
    if (enCours) return NextResponse.json(lireLigne(SEANCES, enCours));
    const body = await request.json() as any;
    const compte = await compteCourant();
    return NextResponse.json(await inserer(SEANCES, {
      date: body.date || new Date().toISOString().slice(0, 10),
      titre: body.titre ?? null,
      participants: body.participants ?? [],
      compte_rendu: body.compte_rendu ?? '',
      statut: 'en_cours',
    }, compte?.equipe_id ?? null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
