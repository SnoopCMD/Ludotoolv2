import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM jv_selections ORDER BY groupe, ordre').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      permanent: !!r.permanent,
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json();
    const normalized = { ...body };
    if ('jeux_ids' in normalized && typeof normalized.jeux_ids !== 'string') {
      normalized.jeux_ids = JSON.stringify(normalized.jeux_ids ?? []);
    }
    const id = normalized.id ?? crypto.randomUUID();
    const keys = Object.keys({ ...normalized, id });
    const vals = keys.map(k => k === 'id' ? id : (normalized[k] ?? null));
    await db.prepare(
      `INSERT OR REPLACE INTO jv_selections (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).bind(...vals).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
