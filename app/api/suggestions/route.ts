import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { compteCourant } from '../../../lib/auth';
import { sansChampsServeur, suitLesSuggestions } from '../../../lib/suggestions';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare(
      `SELECT s.*, e.nom AS auteur_nom
         FROM suggestions s
         LEFT JOIN utilisateurs u ON u.id = s.auteur_id
         LEFT JOIN equipe e       ON e.id = u.equipe_id
        ORDER BY s.updated_at DESC`
    ).all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const compte = await compteCourant();
    // Auteur et statut « vue » viennent du serveur, pas du client.
    const body = sansChampsServeur(await request.json()) as any;
    const champs = {
      ...body,
      id: body.id ?? crypto.randomUUID(),
      auteur_id: compte?.id ?? null,
      // Inutile de signaler à Timothé ses propres suggestions.
      vue: suitLesSuggestions(compte) ? 1 : 0,
    };
    const keys = Object.keys(champs);
    await db.prepare(
      `INSERT OR REPLACE INTO suggestions (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).bind(...keys.map(k => champs[k] ?? null)).run();
    return NextResponse.json({ id: champs.id, auteur_nom: compte?.nom ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
