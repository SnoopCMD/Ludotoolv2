import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';
import { maintenantIso } from '../../../../../../lib/chat';

/**
 * Supprime un de ses propres messages. Suppression douce : la ligne reste
 * (« message supprimé ») et `modifie_le` avance, ce qui la renvoie aux autres
 * postes au prochain tour du flux.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ conversation: string; id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { conversation, id } = await params;
    const db = await getDB();
    const r = await db.prepare(
      `UPDATE chat_messages SET supprime = 1, contenu = '', modifie_le = ?
        WHERE id = ? AND conversation_id = ? AND auteur_id = ? AND supprime = 0`
    ).bind(maintenantIso(), Number(id), conversation, compte.id).run();
    if (!r.meta.changes) return NextResponse.json({ error: 'Message introuvable, ou pas le tien.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
