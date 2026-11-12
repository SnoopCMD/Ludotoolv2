import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import type { TutosAtelier } from '../../../lib/tutosAtelier';

export const dynamic = 'force-dynamic';

/** Tous les tutos, par étape. Lecture libre, comme le reste de l'atelier. */
export async function GET() {
  try {
    const db = await getDB();
    const { results } = await db.prepare('SELECT etape_id, gestes FROM atelier_tutos').all<{ etape_id: string; gestes: string }>();
    const tutos: TutosAtelier = {};
    for (const r of results ?? []) {
      try {
        const g = JSON.parse(r.gestes);
        if (Array.isArray(g) && g.length) tutos[r.etape_id] = g;
      } catch { /* ligne illisible : on l'ignore */ }
    }
    return NextResponse.json(tutos);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
