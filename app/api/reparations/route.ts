import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM reparations ORDER BY id DESC').all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const { ean, nom, type_reparation, description } = body;
    await db.prepare(
      `INSERT INTO reparations (ean,nom,type_reparation,description) VALUES (?,?,?,?)`
    ).bind(ean, nom, type_reparation, description ?? null).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
