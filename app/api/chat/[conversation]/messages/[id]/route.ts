import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';
import { SELECT_MESSAGE, maintenantIso, versMessage } from '../../../../../../lib/chat';
import { conversationAccessible, destinataires, diffuser } from '../../../../../../lib/chat-serveur';

/**
 * Supprime un de ses propres messages. Suppression douce : la ligne reste
 * (« message supprimé »), elle est poussée en direct aux membres, et
 * `modifie_le` avance pour les postes qui sondent.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ conversation: string; id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { conversation, id } = await params;
    const db = await getDB();
    const conv = await conversationAccessible(db, compte, conversation);
    if (!conv) return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    const r = await db.prepare(
      `UPDATE chat_messages SET supprime = 1, contenu = '', modifie_le = ?
        WHERE id = ? AND conversation_id = ? AND auteur_id = ? AND supprime = 0`
    ).bind(maintenantIso(), Number(id), conversation, compte.id).run();
    if (!r.meta.changes) return NextResponse.json({ error: 'Message introuvable, ou pas le tien.' }, { status: 404 });
    const ligne = await db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).bind(Number(id)).first<Record<string, unknown>>();
    if (ligne) await diffuser({ type: 'message', message: versMessage(ligne) }, await destinataires(db, conv));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
