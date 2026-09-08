import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

// D1 accepte au maximum 100 paramètres liés par requête.
const EAN_CHUNK = 80;

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const statut = searchParams.get('statut');
    const ean = searchParams.get('ean');
    const eans = searchParams.get('eans');
    const code_syracuse = searchParams.get('code_syracuse');
    const notes_rappel = searchParams.get('notes_rappel');
    const nom_like = searchParams.get('nom_like');
    const fields = searchParams.get('fields') ?? '*';
    const limit = searchParams.get('limit');

    let where = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (statut) { where += ' AND statut = ?'; params.push(statut); }
    if (ean) { where += ' AND ean = ?'; params.push(ean); }
    if (code_syracuse === 'notnull') {
      where += ` AND code_syracuse IS NOT NULL AND code_syracuse != ''`;
    } else if (code_syracuse) {
      where += ' AND code_syracuse LIKE ?'; params.push(`%${code_syracuse}%`);
    }
    if (notes_rappel === 'true') { where += ' AND notes_rappel = 1'; }
    if (nom_like) { where += ' AND nom LIKE ?'; params.push(`%${nom_like}%`); }

    const max = limit ? parseInt(limit) : null;
    const list = eans ? eans.split(',').map(e => e.trim()).filter(Boolean) : null;

    // D1 limite le nombre de paramètres liés par requête (100) : on découpe le IN.
    if (list && list.length) {
      const rows: any[] = [];
      for (let i = 0; i < list.length; i += EAN_CHUNK) {
        const part = list.slice(i, i + EAN_CHUNK);
        const sql = `SELECT ${fields} FROM jeux ${where} AND ean IN (${part.map(() => '?').join(',')}) ORDER BY nom`;
        const res = await db.prepare(sql).bind(...params, ...part).all();
        rows.push(...(res.results as any[]));
      }
      if (rows.length && rows[0]?.nom !== undefined) rows.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
      return NextResponse.json(max ? rows.slice(0, max) : rows);
    }

    let sql = `SELECT ${fields} FROM jeux ${where} ORDER BY nom`;
    if (max) sql += ` LIMIT ${max}`;

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
    const {
      ean, statut = 'En préparation', nom = '',
      etape_notice = 0, etape_plastifier = 0, etape_contenu = 0,
      etape_etiquette = 0, etape_equiper = 0, etape_encoder = 0,
      etape_nouveaute = 0, is_double = 0, code_syracuse = null,
      date_entree = null, date_sortie = null, notes = '[]', notes_rappel = 0
    } = body;
    const result = await db.prepare(
      `INSERT INTO jeux (ean,statut,nom,etape_notice,etape_plastifier,etape_contenu,
       etape_etiquette,etape_equiper,etape_encoder,etape_nouveaute,is_double,
       code_syracuse,date_entree,date_sortie,notes,notes_rappel)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(ean, statut, nom, etape_notice, etape_plastifier, etape_contenu,
      etape_etiquette, etape_equiper, etape_encoder, etape_nouveaute, is_double,
      code_syracuse, date_entree, date_sortie, notes, notes_rappel).run();
    return NextResponse.json({ id: result.meta.last_row_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
