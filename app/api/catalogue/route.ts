import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// D1 accepte au maximum 100 paramètres liés par requête.
const EAN_CHUNK = 80;

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const ean = searchParams.get('ean');
    const eans = searchParams.get('eans');
    const fields = searchParams.get('fields') ?? '*';

    let where = 'WHERE 1=1';
    const params: string[] = [];

    if (ean) { where += ' AND ean = ?'; params.push(ean); }

    const list = eans ? eans.split(',').map(e => e.trim()).filter(Boolean) : null;

    // D1 limite le nombre de paramètres liés par requête (100) : on découpe le IN.
    if (list && list.length) {
      const rows: any[] = [];
      for (let i = 0; i < list.length; i += EAN_CHUNK) {
        const part = list.slice(i, i + EAN_CHUNK);
        const sql = `SELECT ${fields} FROM catalogue ${where} AND ean IN (${part.map(() => '?').join(',')}) ORDER BY nom`;
        const res = await db.prepare(sql).bind(...params, ...part).all();
        rows.push(...(res.results as any[]));
      }
      if (rows.length && rows[0]?.nom !== undefined) rows.sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
      return NextResponse.json(rows);
    }

    const sql = `SELECT ${fields} FROM catalogue ${where} ORDER BY nom`;
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
    const rows: any[] = Array.isArray(body) ? body : [body];
    for (const row of rows) {
      const keys = Object.keys(row);
      const placeholders = keys.map(() => '?').join(',');
      const values = keys.map(k => row[k] ?? null);
      // ON CONFLICT: update uniquement les champs fournis, sans écraser les autres
      const updateSets = keys.filter(k => k !== 'ean').map(k => `${k} = excluded.${k}`).join(', ');
      const sql = updateSets
        ? `INSERT INTO catalogue (${keys.join(',')}) VALUES (${placeholders}) ON CONFLICT(ean) DO UPDATE SET ${updateSets}`
        : `INSERT OR IGNORE INTO catalogue (${keys.join(',')}) VALUES (${placeholders})`;
      await db.prepare(sql).bind(...values).run();
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
