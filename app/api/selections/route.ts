import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM selections ORDER BY titre').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      jeux: typeof r.jeux === 'string' ? JSON.parse(r.jeux) : r.jeux,
      is_permanent: Boolean(r.is_permanent),
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json();
    const { titre, is_permanent = true, date_fin = null, jeux = [] } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO selections (id,titre,is_permanent,date_fin,jeux) VALUES (?,?,?,?,?)`
    ).bind(id, titre, is_permanent ? 1 : 0, date_fin, JSON.stringify(jeux)).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
