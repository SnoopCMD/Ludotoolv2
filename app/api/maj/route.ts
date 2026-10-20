import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export const dynamic = 'force-dynamic';

/**
 * Compteurs de version par domaine, tenus à jour par les déclencheurs de
 * `migrations/0017_temps_reel.sql`. Interrogé en boucle par `lib/temps-reel.ts`.
 * Sans la migration, on renvoie un objet vide : les pages restent simplement
 * telles qu'elles sont chargées.
 */
export async function GET() {
  try {
    const db = await getDB();
    const { results } = await db.prepare('SELECT domaine, version FROM maj_versions').all<{ domaine: string; version: number }>();
    return NextResponse.json(Object.fromEntries(results.map(r => [r.domaine, r.version])), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({}, { headers: { 'Cache-Control': 'no-store' } });
  }
}
