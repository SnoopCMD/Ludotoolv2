import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const ean = searchParams.get('ean');
    // ?avec_editeur=1 : joint l'éditeur du catalogue en une seule requête (au lieu
    // de 2 à 4 appels par pièce côté client). Même logique que l'ancienne recherche :
    // jeu trouvé par code Syracuse, sinon par nom ; on garde le premier éditeur non vide.
    // instr() plutôt que LIKE : D1 refuse les motifs LIKE de plus de 50 octets.
    const avecEditeur = searchParams.get('avec_editeur') === '1';
    const editeurSql = `,
      COALESCE(
        NULLIF((SELECT c.editeur FROM catalogue c WHERE c.ean = (
          SELECT j.ean FROM jeux j
          WHERE pm.ean IS NOT NULL AND pm.ean != '' AND instr(j.code_syracuse, pm.ean) > 0
          ORDER BY j.nom LIMIT 1)), ''),
        NULLIF((SELECT c.editeur FROM catalogue c WHERE c.ean = (
          SELECT j.ean FROM jeux j
          WHERE pm.nom IS NOT NULL AND pm.nom != '' AND instr(lower(j.nom), lower(pm.nom)) > 0
          ORDER BY j.nom LIMIT 1)), '')
      ) AS editeur_catalogue`;
    let sql = avecEditeur
      ? `SELECT pm.*${editeurSql} FROM pieces_manquantes pm WHERE pm.statut IN ('Manquant', 'Commandé')`
      : 'SELECT * FROM pieces_manquantes pm WHERE 1=1';
    const params: string[] = [];
    if (ean) { sql += ' AND pm.ean = ?'; params.push(ean); }
    sql += ' ORDER BY pm.id DESC';
    const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
    const result = await stmt.all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const keys = Object.keys(body);
    const placeholders = keys.map(() => '?').join(',');
    const values = keys.map(k => body[k] ?? null);
    const result = await db.prepare(
      `INSERT INTO pieces_manquantes (${keys.join(',')}) VALUES (${placeholders})`
    ).bind(...values).run();
    return NextResponse.json({ id: result.meta.last_row_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
