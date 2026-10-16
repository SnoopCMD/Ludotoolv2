import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { suitLesSuggestions } from '../../../../lib/suggestions';

export const dynamic = 'force-dynamic';

/** Pastille du bouton Suggestions pour le compte connecté : nouvelles
 *  suggestions (Timothé seul) + commentaires non lus sur ses propres suggestions. */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ count: 0, suggestions: 0, commentaires: 0 });
    const db = await getDB();
    const [nouvelles, commentaires] = await Promise.all([
      suitLesSuggestions(compte)
        ? db.prepare('SELECT COUNT(*) AS count FROM suggestions WHERE vue = 0').first<{ count: number }>()
        : Promise.resolve({ count: 0 }),
      db.prepare(
        `SELECT COUNT(*) AS count FROM suggestions_commentaires c
           JOIN suggestions s ON s.id = c.suggestion_id
          WHERE s.auteur_id = ? AND c.lu_par_auteur = 0`
      ).bind(compte.id).first<{ count: number }>(),
    ]);
    const n = nouvelles?.count ?? 0, c = commentaires?.count ?? 0;
    return NextResponse.json({ count: n + c, suggestions: n, commentaires: c });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Timothé a ouvert la page : tout est vu. */
export async function POST() {
  try {
    const compte = await compteCourant();
    if (!suitLesSuggestions(compte)) return NextResponse.json({ error: 'Réservé.' }, { status: 403 });
    const db = await getDB();
    await db.prepare('UPDATE suggestions SET vue = 1 WHERE vue = 0').run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
