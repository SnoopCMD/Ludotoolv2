import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';
import { conversationAccessible } from '../../../../../lib/chat-serveur';

/** Marque la conversation lue jusqu'au message `jusqua` (jamais en arrière). */
export async function POST(request: Request, { params }: { params: Promise<{ conversation: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { conversation } = await params;
    const { jusqua } = await request.json().catch(() => ({})) as { jusqua?: unknown };
    const n = Number(jusqua);
    if (!Number.isFinite(n) || n <= 0) return NextResponse.json({ error: 'jusqua manquant.' }, { status: 400 });
    const db = await getDB();
    if (!await conversationAccessible(db, compte, conversation)) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }
    await db.prepare(
      `INSERT INTO chat_lectures (utilisateur_id, conversation_id, dernier_lu) VALUES (?1, ?2, ?3)
       ON CONFLICT (utilisateur_id, conversation_id) DO UPDATE SET dernier_lu = MAX(dernier_lu, ?3)`
    ).bind(compte.id, conversation, n).run();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
