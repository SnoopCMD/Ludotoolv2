import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM paniers ORDER BY created_at DESC').all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const { nom, statut = 'En cours', notes = null } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO paniers (id,nom,statut,notes) VALUES (?,?,?,?)`
    ).bind(id, nom, statut, notes).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
