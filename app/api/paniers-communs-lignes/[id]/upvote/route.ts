import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const result = await db.prepare(
      'UPDATE paniers_communs_lignes SET votes = votes + 1 WHERE id = ? RETURNING votes'
    ).bind(id).first() as any;
    return NextResponse.json({ votes: result?.votes ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
