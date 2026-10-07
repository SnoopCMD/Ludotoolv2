import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { EVENEMENTS, modifier } from '../../../../../lib/reunion';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const ev = await modifier(EVENEMENTS, id, await request.json());
    if (!ev) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
    return NextResponse.json(ev);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Supprimer un projet supprime aussi ses missions de préparation : détachées,
 * elles perdraient leur sens. La copie éventuelle dans l'agenda, elle, reste :
 * l'événement a pu être annoncé, c'est à l'agenda d'en décider.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.batch([
      db.prepare('DELETE FROM reunion_fiches WHERE evenement_id = ?').bind(id),
      db.prepare('DELETE FROM reunion_evenements WHERE id = ?').bind(id),
    ]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
