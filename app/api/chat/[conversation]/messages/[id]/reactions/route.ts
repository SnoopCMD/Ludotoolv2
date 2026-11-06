import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../../lib/db';
import { compteCourant } from '../../../../../../../lib/auth';
import { REACTIONS_MAX_PAR_MESSAGE, SELECT_MESSAGE, emojiValide, maintenantIso, versMessage } from '../../../../../../../lib/chat';
import { conversationAccessible, destinataires, diffuser } from '../../../../../../../lib/chat-serveur';

/**
 * Pose ou retire une réaction (bascule). Corps : `{ emoji }`. Renvoie le
 * message à jour, après l'avoir poussé en direct aux membres.
 */
export async function POST(request: Request, { params }: { params: Promise<{ conversation: string; id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour réagir.' }, { status: 401 });
    const { conversation, id } = await params;
    const { emoji } = await request.json().catch(() => ({})) as { emoji?: unknown };
    if (!emojiValide(emoji)) return NextResponse.json({ error: 'Émote invalide.' }, { status: 400 });

    const db = await getDB();
    const conv = await conversationAccessible(db, compte, conversation);
    if (!conv) return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    const messageId = Number(id);
    const message = await db.prepare(
      'SELECT supprime FROM chat_messages WHERE id = ? AND conversation_id = ?'
    ).bind(messageId, conversation).first<{ supprime: number }>();
    if (!message) return NextResponse.json({ error: 'Message introuvable.' }, { status: 404 });
    if (message.supprime) return NextResponse.json({ error: 'Ce message a été supprimé.' }, { status: 409 });

    const existe = await db.prepare(
      'SELECT 1 FROM chat_reactions WHERE message_id = ? AND utilisateur_id = ? AND emoji = ?'
    ).bind(messageId, compte.id, emoji).first();

    const ajout = !existe;
    if (existe) {
      await db.batch([
        db.prepare('DELETE FROM chat_reactions WHERE message_id = ? AND utilisateur_id = ? AND emoji = ?').bind(messageId, compte.id, emoji),
        db.prepare('UPDATE chat_messages SET modifie_le = ? WHERE id = ?').bind(maintenantIso(), messageId),
      ]);
    } else {
      const { n } = await db.prepare(
        'SELECT COUNT(DISTINCT emoji) AS n FROM chat_reactions WHERE message_id = ? AND emoji <> ?'
      ).bind(messageId, emoji).first<{ n: number }>() ?? { n: 0 };
      if (n >= REACTIONS_MAX_PAR_MESSAGE) {
        return NextResponse.json({ error: 'Ce message a déjà beaucoup de réactions différentes.' }, { status: 409 });
      }
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO chat_reactions (message_id, utilisateur_id, emoji) VALUES (?, ?, ?)').bind(messageId, compte.id, emoji),
        db.prepare('UPDATE chat_messages SET modifie_le = ? WHERE id = ?').bind(maintenantIso(), messageId),
      ]);
    }

    const ligne = await db.prepare(`${SELECT_MESSAGE} WHERE m.id = ?`).bind(messageId).first<Record<string, unknown>>();
    if (!ligne) return NextResponse.json({ error: 'Message introuvable.' }, { status: 404 });
    const maj = versMessage(ligne);
    await diffuser({ type: 'message', message: maj }, await destinataires(db, conv));
    // L'auteur du message est prévenu qu'on a réagi (pas pour un retrait, ni à soi-même).
    if (ajout && maj.auteur_id !== compte.id) {
      await diffuser({
        type: 'reaction', conversation_id: conversation, message_id: messageId, emoji,
        par: { id: compte.id, equipe_id: compte.equipe_id, nom: compte.nom, groupe: compte.groupe, couleur: compte.couleur },
        extrait: maj.contenu.slice(0, 100),
      }, [maj.auteur_id]);
    }
    return NextResponse.json(maj);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
