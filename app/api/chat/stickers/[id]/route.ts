import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';

/**
 * Retire un de ses stickers de la bibliothèque. Le fichier reste : les
 * messages qui l'ont déjà envoyé continuent de l'afficher.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { id } = await params;
    const db = await getDB();
    const r = await db.prepare('UPDATE chat_stickers SET supprime = 1 WHERE id = ? AND auteur_id = ? AND supprime = 0')
      .bind(id, compte.id).run();
    if (!r.meta.changes) return NextResponse.json({ error: 'Sticker introuvable, ou pas le tien.' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
