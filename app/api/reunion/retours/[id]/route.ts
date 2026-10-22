import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { RETOURS, modifier } from '../../../../../lib/reunion';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const retour = await modifier(RETOURS, id, await request.json());
    if (!retour) return NextResponse.json({ error: 'Retour introuvable.' }, { status: 404 });
    return NextResponse.json(retour);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** L'événement reste « terminé » : seul le retour disparaît. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM reunion_retours WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
