import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { couleurValide } from '../../../../lib/couleurProfil';

/**
 * Couleur de profil du compte connecté, rangée dans `equipe.horaires.couleur`
 * (là où l'agenda la lit déjà). `null` revient à la couleur du groupe. On ne
 * peut changer que la sienne : l'agenda reste le seul endroit pour les autres.
 */
export async function PUT(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour changer ta couleur.' }, { status: 401 });
    const body = await request.json() as { couleur?: unknown };
    const couleur = body.couleur === null ? null : couleurValide(body.couleur) ? body.couleur.toLowerCase() : undefined;
    if (couleur === undefined) return NextResponse.json({ error: 'Couleur invalide (#rrggbb attendu).' }, { status: 400 });
    const db = await getDB();
    await db.prepare(
      couleur
        ? `UPDATE equipe SET horaires = json_set(COALESCE(NULLIF(horaires, ''), '{}'), '$.couleur', ?) WHERE id = ?`
        : `UPDATE equipe SET horaires = json_remove(COALESCE(NULLIF(horaires, ''), '{}'), '$.couleur') WHERE id = ?`
    ).bind(...(couleur ? [couleur, compte.equipe_id] : [compte.equipe_id])).run();
    return NextResponse.json({ compte: { ...compte, couleur } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
