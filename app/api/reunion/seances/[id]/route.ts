import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { SEANCES, modifier } from '../../../../../lib/reunion';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as any;
    if (body.statut === 'terminee') body.terminee_le = new Date().toISOString();
    const seance = await modifier(SEANCES, id, body);
    if (!seance) return NextResponse.json({ error: 'Séance introuvable.' }, { status: 404 });
    return NextResponse.json(seance);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Les fiches traitées pendant la séance restent ; elles perdent seulement leur rattachement. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.batch([
      db.prepare('UPDATE reunion_fiches SET seance_id = NULL WHERE seance_id = ?').bind(id),
      db.prepare('DELETE FROM reunion_seances WHERE id = ?').bind(id),
    ]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
