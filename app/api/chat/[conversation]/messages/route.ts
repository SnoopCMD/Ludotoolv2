import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';
import { LONGUEUR_MAX_MESSAGE, SELECT_MESSAGE, versMessage } from '../../../../../lib/chat';

/** Envoie un message. Corps : `{ contenu, client_id }`. Renvoie le message enregistré. */
export async function POST(request: Request, { params }: { params: Promise<{ conversation: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour écrire.' }, { status: 401 });
    const { conversation } = await params;
    const body = await request.json().catch(() => ({})) as { contenu?: unknown; client_id?: unknown };
    const contenu = typeof body.contenu === 'string' ? body.contenu.trim() : '';
    const clientId = typeof body.client_id === 'string' && body.client_id.length <= 64 ? body.client_id : null;
    if (!contenu) return NextResponse.json({ error: 'Message vide.' }, { status: 400 });
    if (contenu.length > LONGUEUR_MAX_MESSAGE) {
      return NextResponse.json({ error: `Message trop long (${LONGUEUR_MAX_MESSAGE} caractères au plus).` }, { status: 400 });
    }

    const db = await getDB();
    const conv = await db.prepare('SELECT id FROM chat_conversations WHERE id = ?').bind(conversation).first();
    if (!conv) return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });

    // Renvoi du même message (client_id déjà vu) : on ne crée pas de doublon.
    await db.prepare(
      `INSERT INTO chat_messages (conversation_id, auteur_id, contenu, client_id) VALUES (?, ?, ?, ?)
       ON CONFLICT (auteur_id, client_id) DO NOTHING`
    ).bind(conversation, compte.id, contenu, clientId).run();

    const ligne = clientId
      ? await db.prepare(`${SELECT_MESSAGE} WHERE m.auteur_id = ? AND m.client_id = ?`).bind(compte.id, clientId).first<Record<string, unknown>>()
      : await db.prepare(`${SELECT_MESSAGE} WHERE m.auteur_id = ? ORDER BY m.id DESC LIMIT 1`).bind(compte.id).first<Record<string, unknown>>();
    if (!ligne) return NextResponse.json({ error: "Le message n'a pas été enregistré." }, { status: 500 });

    // Ce qu'on écrit soi-même est lu.
    await db.prepare(
      `INSERT INTO chat_lectures (utilisateur_id, conversation_id, dernier_lu) VALUES (?1, ?2, ?3)
       ON CONFLICT (utilisateur_id, conversation_id) DO UPDATE SET dernier_lu = MAX(dernier_lu, ?3)`
    ).bind(compte.id, conversation, Number(ligne.id)).run();

    return NextResponse.json(versMessage(ligne));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
