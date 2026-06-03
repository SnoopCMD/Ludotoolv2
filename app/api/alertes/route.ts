import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const statut = searchParams.get('statut');
    let sql = 'SELECT * FROM alertes WHERE 1=1';
    const params: string[] = [];
    if (statut) { sql += ' AND statut = ?'; params.push(statut); }
    sql += ' ORDER BY created_at DESC';
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
      `INSERT INTO alertes (${keys.join(',')}) VALUES (${placeholders})`
    ).bind(...values).run();
    const row = await db.prepare('SELECT * FROM alertes WHERE rowid = ?').bind(result.meta.last_row_id).first();
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
