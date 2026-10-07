import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { EVENEMENTS, inserer, lireLigne } from '../../../../lib/reunion';

export async function GET() {
  try {
    const db = await getDB();
    // Les projets sans date passent après les datés.
    const result = await db.prepare(
      'SELECT * FROM reunion_evenements ORDER BY date_debut IS NULL, date_debut, cree_le'
    ).all();
    return NextResponse.json(result.results.map(r => lireLigne(EVENEMENTS, r)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    if (!String(body.titre ?? '').trim()) return NextResponse.json({ error: 'Titre obligatoire.' }, { status: 400 });
    const compte = await compteCourant();
    return NextResponse.json(await inserer(EVENEMENTS, body, compte?.equipe_id ?? null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
