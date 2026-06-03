import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM jv_jeux ORDER BY titre').all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const normalized = { ...body };
    for (const k of ['plateformes', 'photos']) {
      if (k in normalized && typeof normalized[k] !== 'string') {
        normalized[k] = JSON.stringify(normalized[k] ?? []);
      }
    }
    const id = normalized.id ?? crypto.randomUUID();
    const keys = Object.keys({ ...normalized, id });
    const vals = keys.map(k => k === 'id' ? id : (normalized[k] ?? null));
    await db.prepare(
      `INSERT OR REPLACE INTO jv_jeux (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).bind(...vals).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
