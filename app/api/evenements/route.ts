import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM evenements ORDER BY date_debut').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      membres: typeof r.membres === 'string' ? JSON.parse(r.membres) : (r.membres ?? []),
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const normalized = { ...body };
    if ('membres' in normalized && typeof normalized.membres !== 'string') {
      normalized.membres = JSON.stringify(normalized.membres ?? []);
    }
    const id = normalized.id ?? crypto.randomUUID();
    const keys = ['id', ...Object.keys(normalized).filter(k => k !== 'id')];
    const vals = keys.map(k => k === 'id' ? id : (normalized[k] ?? null));
    await db.prepare(
      `INSERT INTO evenements (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).bind(...vals).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
