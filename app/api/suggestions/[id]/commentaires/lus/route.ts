import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';

/** L'auteur a ouvert sa suggestion : ses commentaires non lus le deviennent. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

    const { id } = await params;
    const db = await getDB();
    // La condition sur l'auteur fait aussi office de contrôle d'accès.
    await db.prepare(
      `UPDATE suggestions_commentaires SET lu_par_auteur = 1
        WHERE suggestion_id = ? AND lu_par_auteur = 0
          AND suggestion_id IN (SELECT id FROM suggestions WHERE auteur_id = ?)`
    ).bind(id, compte.id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
