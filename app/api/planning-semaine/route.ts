import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const fields = searchParams.get('fields') ?? 'slots,vacataires';

    if (key) {
      const row = await db.prepare(
        `SELECT ${fields} FROM planning_semaine WHERE semaine_key = ?`
      ).bind(key).first() as any;
      if (!row) return NextResponse.json(null);
      return NextResponse.json({
        ...row,
        slots: typeof row.slots === 'string' ? JSON.parse(row.slots) : (row.slots ?? []),
        vacataires: typeof row.vacataires === 'string' ? JSON.parse(row.vacataires) : (row.vacataires ?? []),
      });
    }

    const result = await db.prepare('SELECT * FROM planning_semaine').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      slots: typeof r.slots === 'string' ? JSON.parse(r.slots) : (r.slots ?? []),
      vacataires: typeof r.vacataires === 'string' ? JSON.parse(r.vacataires) : (r.vacataires ?? []),
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const { semaine_key, slots, vacataires, updated_at } = body;
    await db.prepare(
      `INSERT OR REPLACE INTO planning_semaine (semaine_key, slots, vacataires, updated_at)
       VALUES (?, ?, ?, ?)`
    ).bind(
      semaine_key,
      typeof slots === 'string' ? slots : JSON.stringify(slots),
      typeof vacataires === 'string' ? vacataires : JSON.stringify(vacataires),
      updated_at ?? new Date().toISOString()
    ).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
