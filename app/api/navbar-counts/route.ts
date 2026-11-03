import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { compteCourant } from '../../../lib/auth';
import { PRIORITE_ALERTE } from '../../../lib/missionsAccueil';

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

    // Missions haute / urgente du Bureau assignées au compte connecté (lib/missionsAccueil.ts)
    const compte = await compteCourant();
    const missions = compte
      ? await db.prepare(
          `SELECT COUNT(*) as count FROM reunion_fiches
            WHERE genre = 'mission' AND statut != 'fait' AND priorite >= ?
              AND EXISTS (SELECT 1 FROM json_each(reunion_fiches.assignes) WHERE value = ?)
              AND NOT EXISTS (SELECT 1 FROM json_each(reunion_fiches.valide_par) WHERE value = ?)`
        ).bind(PRIORITE_ALERTE, compte.equipe_id, compte.equipe_id).first<{ count: number }>().catch(() => null)
      : null;

    const total = (alertes?.count ?? 0) + (rappels?.count ?? 0) + (nouveautes?.count ?? 0) + (missions?.count ?? 0);
    return NextResponse.json({ total, alertes: alertes?.count ?? 0, rappels: rappels?.count ?? 0, nouveautes: nouveautes?.count ?? 0, missions: missions?.count ?? 0 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
