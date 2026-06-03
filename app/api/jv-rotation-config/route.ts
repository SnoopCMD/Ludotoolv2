import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM jv_rotation_config LIMIT 1').first() as any;
    if (!result) return NextResponse.json(null);
    return NextResponse.json({
      ...result,
      config: typeof result.config === 'string' ? JSON.parse(result.config) : (result.config ?? {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json();
    const normalized = { ...body };
    if ('config' in normalized && typeof normalized.config !== 'string') {
      normalized.config = JSON.stringify(normalized.config ?? {});
    }
    const keys = Object.keys(normalized);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    const count = await db.prepare('SELECT COUNT(*) as n FROM jv_rotation_config').first() as any;
    if (count?.n > 0) {
      await db.prepare(`UPDATE jv_rotation_config SET ${sets}`).bind(...keys.map(k => normalized[k])).run();
    } else {
      const placeholders = keys.map(() => '?').join(',');
      await db.prepare(`INSERT INTO jv_rotation_config (${keys.join(',')}) VALUES (${placeholders})`).bind(...keys.map(k => normalized[k])).run();
    }
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
