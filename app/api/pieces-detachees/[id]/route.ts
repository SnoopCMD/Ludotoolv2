import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

// PUT accepte nom_jeu, description et quantite. Une quantité à 0 supprime la
// ligne : un stock vide n'a pas de raison de rester affiché.
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const body = await request.json() as any;
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (typeof body.nom_jeu === 'string' && body.nom_jeu.trim()) { sets.push('nom_jeu = ?'); values.push(body.nom_jeu.trim()); }
    if (typeof body.description === 'string' && body.description.trim()) { sets.push('description = ?'); values.push(body.description.trim()); }
    if (body.quantite !== undefined) {
      const q = Math.floor(Number(body.quantite));
      if (!Number.isFinite(q) || q < 0) return NextResponse.json({ error: 'quantite doit être un entier ≥ 0' }, { status: 400 });
      if (q === 0) {
        await db.prepare('DELETE FROM pieces_detachees WHERE id = ?').bind(id).run();
        return NextResponse.json({ success: true, deleted: true });
      }
      sets.push('quantite = ?'); values.push(q);
    }
    if (!sets.length) return NextResponse.json({ error: 'rien à modifier' }, { status: 400 });
    await db.prepare(`UPDATE pieces_detachees SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM pieces_detachees WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
