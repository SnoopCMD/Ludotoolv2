import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM equipe ORDER BY nom').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      horaires: typeof r.horaires === 'string' ? JSON.parse(r.horaires) : (r.horaires ?? {}),
      absences_hs: typeof r.absences_hs === 'string' ? JSON.parse(r.absences_hs) : (r.absences_hs ?? []),
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
    for (const k of ['horaires', 'absences_hs']) {
      if (k in normalized && typeof normalized[k] !== 'string') {
        normalized[k] = JSON.stringify(normalized[k] ?? (k === 'horaires' ? {} : []));
      }
    }
    const id = normalized.id ?? crypto.randomUUID();
    const keys = ['id', ...Object.keys(normalized).filter(k => k !== 'id')];
    const vals = keys.map(k => k === 'id' ? id : (normalized[k] ?? null));
    await db.prepare(
      `INSERT INTO equipe (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`
    ).bind(...vals).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
