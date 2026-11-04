import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

/**
 * Pastille du bouton de messagerie : messages des autres, non supprimés, après
 * le dernier lu, toutes conversations confondues. Sans les tables (migration
 * 0024 pas encore passée), on répond 0 : la barre reste propre.
 */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ count: 0 });
    const db = await getDB();
    const r = await db.prepare(
      `SELECT COUNT(*) AS count
         FROM chat_messages m
         LEFT JOIN chat_lectures l ON l.utilisateur_id = ?1 AND l.conversation_id = m.conversation_id
        WHERE m.auteur_id <> ?1 AND m.supprime = 0 AND m.id > COALESCE(l.dernier_lu, 0)`
    ).bind(compte.id).first<{ count: number }>();
    return NextResponse.json({ count: r?.count ?? 0 }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
