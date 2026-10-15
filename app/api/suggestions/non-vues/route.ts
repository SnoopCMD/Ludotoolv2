import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { suitLesSuggestions } from '../../../../lib/suggestions';

export const dynamic = 'force-dynamic';

/** Nombre de suggestions pas encore vues — toujours 0 pour les autres comptes. */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!suitLesSuggestions(compte)) return NextResponse.json({ count: 0 });
    const db = await getDB();
    const ligne = await db.prepare('SELECT COUNT(*) AS count FROM suggestions WHERE vue = 0').first<{ count: number }>();
    return NextResponse.json({ count: ligne?.count ?? 0 });
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
