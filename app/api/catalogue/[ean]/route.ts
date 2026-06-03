import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const db = await getDB();
    const { ean } = await params;
    const row = await db.prepare('SELECT * FROM catalogue WHERE ean = ?').bind(ean).first();
    if (!row) return NextResponse.json(null);
    return NextResponse.json(row);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const db = await getDB();
    const { ean } = await params;
    await db.prepare('DELETE FROM catalogue WHERE ean = ?').bind(ean).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ ean: string }> }) {
  try {
    const db = await getDB();
    const { ean } = await params;
    const body = await request.json();
    const keys = Object.keys(body);
    if (!keys.length) return NextResponse.json({ error: 'no fields' }, { status: 400 });
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => body[k]);
    await db.prepare(`UPDATE catalogue SET ${sets} WHERE ean = ?`).bind(...values, ean).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
