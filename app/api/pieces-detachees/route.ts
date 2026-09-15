import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');
    let sql = 'SELECT * FROM pieces_detachees WHERE 1=1';
    const params: string[] = [];
    if (q) { sql += ' AND (nom_jeu LIKE ? OR description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
    sql += ' ORDER BY nom_jeu COLLATE NOCASE ASC, id ASC';
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
    const nom_jeu = String(body.nom_jeu ?? '').trim();
    const description = String(body.description ?? '').trim();
    const quantite = Math.floor(Number(body.quantite ?? 1));
    if (!nom_jeu || !description) {
      return NextResponse.json({ error: 'nom_jeu et description sont obligatoires' }, { status: 400 });
    }
    if (!Number.isFinite(quantite) || quantite < 1) {
      return NextResponse.json({ error: 'quantite doit être un entier ≥ 1' }, { status: 400 });
    }
    const result = await db.prepare(
      'INSERT INTO pieces_detachees (nom_jeu, description, quantite) VALUES (?, ?, ?)'
    ).bind(nom_jeu, description, quantite).run();
    return NextResponse.json({ id: result.meta.last_row_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
