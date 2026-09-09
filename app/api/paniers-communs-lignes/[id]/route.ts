import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const body = await request.json() as any;
    // `votes` est un cache recalculé par /vote depuis paniers_communs_votes :
    // le laisser passer ici permettrait de forger un score sans voter.
    delete body.votes;
    const keys = Object.keys(body);
    if (keys.length === 0) return NextResponse.json({ success: true });
    const sets = keys.map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE paniers_communs_lignes SET ${sets} WHERE id = ?`).bind(...keys.map(k => body[k]), id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM paniers_communs_lignes WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
