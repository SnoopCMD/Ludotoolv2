import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { sansChampsServeur } from '../../../../lib/suggestions';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    // Auteur et statut « vue » ne se modifient pas depuis le client.
    const body = sansChampsServeur(await request.json()) as any;
    const keys = Object.keys(body);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE suggestions SET ${sets} WHERE id = ?`).bind(...keys.map(k => body[k]), id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM suggestions WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
