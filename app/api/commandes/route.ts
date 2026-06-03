import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM commandes ORDER BY created_at DESC').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      lignes: typeof r.lignes === 'string' ? JSON.parse(r.lignes) : (r.lignes ?? []),
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json();
    const keys = Object.keys(body);
    const normalized = { ...body };
    if ('lignes' in normalized && typeof normalized.lignes !== 'string') {
      normalized.lignes = JSON.stringify(normalized.lignes);
    }
    const placeholders = keys.map(() => '?').join(',');
    const values = keys.map(k => normalized[k] ?? null);
    const result = await db.prepare(
      `INSERT INTO commandes (${keys.join(',')}) VALUES (${placeholders})`
    ).bind(...values).run();
    return NextResponse.json({ id: result.meta.last_row_id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
