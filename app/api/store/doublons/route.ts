import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

/** Même normalisation que côté pages : casse, accents et ponctuation ignorées. */
const normaliser = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export type Doublon = {
  possede: boolean;
  exemplaires: number;
  /** Ce qu'on affiche à côté de la ligne : « 2 exemplaires · En stock » */
  detail: string;
};

type LigneJeu = { nom: string; statut: string | null };
type LigneJv = { titre: string; console: string | null; statut: string | null };

/**
 * Dit, pour chaque nom envoyé, si la ludothèque possède déjà le jeu.
 * La comparaison se fait en mémoire côté serveur (normalisation identique à
 * celle des pages) : une requête SQL avec LIKE raterait les variantes d'accents
 * et de ponctuation, très fréquentes entre le catalogue et les fiches boutique.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'JdS';
    const noms = (searchParams.get('noms') ?? '')
      .split('|').map(n => n.trim()).filter(Boolean).slice(0, 200);

    if (noms.length === 0) return NextResponse.json({ doublons: {} });

    const db = await getDB();
    const doublons: Record<string, Doublon> = {};

    if (type === 'JV') {
      const rows = await db.prepare(
        `SELECT titre, console, statut FROM jv_jeux WHERE COALESCE(statut, '') != 'retire'`
      ).all();
      const parNom = new Map<string, LigneJv[]>();
      for (const r of rows.results as LigneJv[]) {
        const cle = normaliser(r.titre);
        if (!cle) continue;
        parNom.set(cle, [...(parNom.get(cle) ?? []), r]);
      }
      for (const nom of noms) {
        const trouves = parNom.get(normaliser(nom)) ?? [];
        doublons[nom] = trouves.length === 0
          ? { possede: false, exemplaires: 0, detail: '' }
          : {
              possede: true,
              exemplaires: trouves.length,
              detail: [...new Set(trouves.map(t => t.console).filter(Boolean))].join(', ') || 'au catalogue',
            };
      }
    } else {
      const rows = await db.prepare(
        `SELECT nom, statut FROM jeux WHERE COALESCE(statut, '') != 'Retiré'`
      ).all();
      const parNom = new Map<string, LigneJeu[]>();
      for (const r of rows.results as LigneJeu[]) {
        const cle = normaliser(r.nom);
        if (!cle) continue;
        parNom.set(cle, [...(parNom.get(cle) ?? []), r]);
      }
      for (const nom of noms) {
        const trouves = parNom.get(normaliser(nom)) ?? [];
        doublons[nom] = trouves.length === 0
          ? { possede: false, exemplaires: 0, detail: '' }
          : {
              possede: true,
              exemplaires: trouves.length,
              detail: `${trouves.length} exemplaire${trouves.length > 1 ? 's' : ''}`,
            };
      }
    }

    return NextResponse.json({ doublons });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
