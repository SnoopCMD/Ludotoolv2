import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const ean = searchParams.get('ean');
    let sql = 'SELECT * FROM pieces_manquantes WHERE 1=1';
    const params: string[] = [];
    if (ean) { sql += ' AND ean = ?'; params.push(ean); }
    sql += ' ORDER BY id DESC';
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
    const body = await request.json();
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
