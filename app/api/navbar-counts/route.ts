import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDB();
    const today = new Date().toISOString().split('T')[0];

    const [alertes, rappels, nouveautes] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as count FROM alertes WHERE statut = 'active'`).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) as count FROM jeux WHERE notes_rappel = 1`).first<{ count: number }>(),
      db.prepare(`SELECT COUNT(*) as count FROM jeux WHERE etape_nouveaute = 1 AND statut = 'En stock' AND date_sortie IS NOT NULL AND date_sortie <= ?`).bind(today).first<{ count: number }>(),
    ]);

    const total = (alertes?.count ?? 0) + (rappels?.count ?? 0) + (nouveautes?.count ?? 0);
    return NextResponse.json({ total, alertes: alertes?.count ?? 0, rappels: rappels?.count ?? 0, nouveautes: nouveautes?.count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
