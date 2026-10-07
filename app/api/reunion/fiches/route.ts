import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { FICHES, inserer, lireLigne } from '../../../../lib/reunion';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM reunion_fiches ORDER BY cree_le DESC').all();
    return NextResponse.json(result.results.map(r => lireLigne(FICHES, r)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    if (!String(body.titre ?? '').trim()) return NextResponse.json({ error: 'Titre obligatoire.' }, { status: 400 });
    const compte = await compteCourant();
    if (body.statut === 'fait') body.fait_le = new Date().toISOString();
    return NextResponse.json(await inserer(FICHES, body, compte?.equipe_id ?? null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
