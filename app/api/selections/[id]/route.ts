import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const body = await request.json() as any;
    const normalized: Record<string, any> = { ...body };
    if ('jeux' in normalized && typeof normalized.jeux !== 'string') {
      normalized.jeux = JSON.stringify(normalized.jeux);
    }
    if ('is_permanent' in normalized) {
      normalized.is_permanent = normalized.is_permanent ? 1 : 0;
    }
    const keys = Object.keys(normalized);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE selections SET ${sets} WHERE id = ?`).bind(...keys.map(k => normalized[k]), id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM selections WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
