import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const body = await request.json();
    const normalized = { ...body };
    if ('membres' in normalized && typeof normalized.membres !== 'string') {
      normalized.membres = JSON.stringify(normalized.membres ?? []);
    }
    const keys = Object.keys(normalized);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE evenements SET ${sets} WHERE id = ?`).bind(...keys.map(k => normalized[k]), id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM evenements WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
