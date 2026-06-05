import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

const FALLBACK_A = '#FD495B';
const FALLBACK_B = '#5BE0FB';

export async function GET() {
  try {
    const db = await getDB();

    const [communRows, profilRows, equipeRows] = await Promise.all([
      db.prepare(`
        SELECT panier_commun_id,
               COUNT(*) as nb,
               COALESCE(SUM(prix_unitaire * quantite), 0) as total
        FROM paniers_communs_lignes
        GROUP BY panier_commun_id
      `).all(),
      db.prepare(`
        SELECT p.profil,
               COUNT(DISTINCT p.id) as nb_paniers,
               COUNT(pl.id)         as nb_jeux
        FROM paniers p
        LEFT JOIN panier_lignes pl ON pl.panier_id = p.id
        WHERE p.profil IS NOT NULL AND p.profil != ''
        GROUP BY p.profil
        ORDER BY p.profil
      `).all(),
      db.prepare(`
        SELECT nom,
               groupe,
               json_extract(horaires, '$.couleur') as couleur
        FROM equipe
        ORDER BY nom
      `).all(),
    ]);

    const communStats: Record<string, { nb: number; total: number }> = {};
    for (const row of communRows.results as any[]) {
      communStats[row.panier_commun_id] = { nb: row.nb, total: row.total };
    }

    const profilStats: Record<string, { paniers: number; jeux: number }> = {};
    for (const row of profilRows.results as any[]) {
      profilStats[row.profil] = { paniers: row.nb_paniers, jeux: row.nb_jeux };
    }

    const membres = (equipeRows.results as any[]).map(r => ({
      nom: r.nom as string,
      couleur: (r.couleur as string | null) ?? (r.groupe === 'A' ? FALLBACK_A : FALLBACK_B),
    }));

    return NextResponse.json({ communStats, profilStats, membres });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
