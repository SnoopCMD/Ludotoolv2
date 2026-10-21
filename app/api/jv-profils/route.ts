import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { champsProfil, lireProfil, normaliserCarte, pourRecherche, reponseErreur } from '../../../lib/jvProfils';

export const dynamic = 'force-dynamic';

const COLONNES = 'id, prenom, numero_carte, sexe, age, cree_le, utilise_le';

/**
 * ?carte=… : le profil de cette carte exactement (scan), ou null.
 * ?q=…     : recherche par prénom ou début de numéro de carte.
 * sans rien : tous les profils, les plus récemment venus d'abord.
 */
export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const carte = url.searchParams.get('carte');
    if (carte !== null) {
      const p = await db.prepare(`SELECT ${COLONNES} FROM jv_profils WHERE numero_carte = ?`).bind(normaliserCarte(carte)).first();
      return NextResponse.json(p ?? null);
    }
    const q = (url.searchParams.get('q') ?? '').trim();
    const limite = Math.min(Number(url.searchParams.get('limit')) || 500, 500);
    const ordre = 'ORDER BY utilise_le IS NULL, utilise_le DESC, prenom COLLATE NOCASE';
    if (!q) {
      const { results } = await db.prepare(`SELECT ${COLONNES} FROM jv_profils ${ordre} LIMIT ?`).bind(limite).all();
      return NextResponse.json(results);
    }
    const { results } = await db.prepare(
      `SELECT ${COLONNES} FROM jv_profils WHERE recherche LIKE ? OR numero_carte LIKE ? ${ordre} LIMIT ?`
    ).bind(`%${pourRecherche(q)}%`, `${normaliserCarte(q)}%`, limite).all();
    return NextResponse.json(results);
  } catch (e: any) {
    return reponseErreur(e);
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const champs = { ...champsProfil(await request.json(), false), id: crypto.randomUUID() };
    const cles = Object.keys(champs);
    await db.prepare(`INSERT INTO jv_profils (${cles.join(',')}) VALUES (${cles.map(() => '?').join(',')})`)
      .bind(...cles.map(k => champs[k as keyof typeof champs])).run();
    return NextResponse.json(await lireProfil(champs.id));
  } catch (e: any) {
    return reponseErreur(e);
  }
}
