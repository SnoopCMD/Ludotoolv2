import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';

/** Chacun ne peut effacer que ses propres commentaires. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; commentaireId: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

    const { id, commentaireId } = await params;
    const db = await getDB();

    const commentaire = await db.prepare(
      'SELECT utilisateur_id FROM paniers_communs_commentaires WHERE id = ? AND ligne_id = ?'
    ).bind(commentaireId, id).first<any>();
    if (!commentaire) return NextResponse.json({ error: 'Commentaire introuvable.' }, { status: 404 });
    if (commentaire.utilisateur_id !== compte.id) {
      return NextResponse.json({ error: 'Ce commentaire n\'est pas le tien.' }, { status: 403 });
    }

    await db.prepare('DELETE FROM paniers_communs_commentaires WHERE id = ?').bind(commentaireId).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
