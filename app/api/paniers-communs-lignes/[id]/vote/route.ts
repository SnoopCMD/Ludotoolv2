import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';

/**
 * Vote nominatif sur une ligne de panier commun.
 *
 * `valeur` vaut 1 (pour), -1 (contre) ou 0 (retirer sa voix). Revoter la même
 * valeur revient à la retirer : le bouton fonctionne comme une bascule.
 * `paniers_communs_lignes.votes` est réécrit depuis la somme réelle plutôt
 * qu'incrémenté, pour qu'il ne puisse pas dériver.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) {
      return NextResponse.json({ error: 'Connecte-toi pour voter.' }, { status: 401 });
    }

    const { id } = await params;
    const { valeur } = await request.json() as { valeur?: number };
    if (![1, -1, 0].includes(valeur as number)) {
      return NextResponse.json({ error: 'valeur doit être 1, -1 ou 0.' }, { status: 400 });
    }

    const db = await getDB();
    const ligne = await db.prepare('SELECT id FROM paniers_communs_lignes WHERE id = ?')
      .bind(id).first<any>();
    if (!ligne) return NextResponse.json({ error: 'Ligne introuvable.' }, { status: 404 });

    const actuel = await db.prepare(
      'SELECT valeur FROM paniers_communs_votes WHERE ligne_id = ? AND utilisateur_id = ?'
    ).bind(id, compte.id).first<any>();

    const cible = (valeur === 0 || actuel?.valeur === valeur) ? 0 : valeur as number;

    if (cible === 0) {
      await db.prepare('DELETE FROM paniers_communs_votes WHERE ligne_id = ? AND utilisateur_id = ?')
        .bind(id, compte.id).run();
    } else {
      await db.prepare(
        `INSERT INTO paniers_communs_votes (ligne_id, utilisateur_id, valeur) VALUES (?, ?, ?)
         ON CONFLICT (ligne_id, utilisateur_id) DO UPDATE SET valeur = excluded.valeur, cree_le = datetime('now')`
      ).bind(id, compte.id, cible).run();
    }

    const somme = await db.prepare(
      'SELECT COALESCE(SUM(valeur), 0) AS total FROM paniers_communs_votes WHERE ligne_id = ?'
    ).bind(id).first<any>();
    const total = Number(somme?.total ?? 0);

    await db.prepare('UPDATE paniers_communs_lignes SET votes = ? WHERE id = ?').bind(total, id).run();

    const votants = await db.prepare(
      `SELECT v.utilisateur_id, v.valeur, e.nom
         FROM paniers_communs_votes v
         JOIN utilisateurs u ON u.id = v.utilisateur_id
         JOIN equipe e       ON e.id = u.equipe_id
        WHERE v.ligne_id = ?`
    ).bind(id).all();

    return NextResponse.json({ votes: total, mon_vote: cible, votants: votants.results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
