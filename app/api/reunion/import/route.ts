import { NextResponse } from 'next/server';
import { compteCourant } from '../../../../lib/auth';
import { FICHES, SEANCES, inserer, refusAnonyme } from '../../../../lib/reunion';

/**
 * Enregistre un compte rendu importé, tel que validé dans l'aperçu : une
 * séance terminée, ses points (abordés pendant cette séance) et ses missions.
 * Rien ne passe par l'état « en cours » : l'import ne gêne pas une réunion
 * ouverte au même moment.
 */
type Import = {
  titre?: string; date?: string; participants?: string[]; compte_rendu?: string;
  points?: { titre: string; intervenant?: string | null; notes?: string }[];
  missions?: { titre: string; description?: string; assignes?: string[]; deadline?: string | null }[];
};

export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return refusAnonyme();
    const body = await request.json() as Import;
    if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) return NextResponse.json({ error: 'Date de réunion manquante.' }, { status: 400 });
    const points = (body.points ?? []).filter(p => p.titre?.trim());
    const missions = (body.missions ?? []).filter(m => m.titre?.trim());

    const seance = await inserer(SEANCES, {
      date: body.date, titre: body.titre?.trim() || null, participants: body.participants ?? [],
      compte_rendu: body.compte_rendu ?? '[]', statut: 'terminee', terminee_le: new Date().toISOString(),
    }, compte.equipe_id);

    // Les points ont été « abordés » le jour de la réunion, pas le jour de l'import.
    const faitLe = `${body.date}T12:00:00.000Z`;
    for (const p of points) {
      await inserer(FICHES, {
        genre: 'point', titre: p.titre.trim(), statut: 'fait', priorite: 1, decision: p.notes ?? '',
        intervenant: p.intervenant || null, seance_id: seance.id, fait_le: faitLe,
      }, compte.equipe_id);
    }
    for (const m of missions) {
      await inserer(FICHES, {
        genre: 'mission', titre: m.titre.trim(), statut: 'a_faire', priorite: 1, description: m.description ?? '',
        assignes: m.assignes ?? [], deadline: m.deadline || null, seance_id: seance.id,
      }, compte.equipe_id);
    }
    return NextResponse.json({ seance, points: points.length, missions: missions.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
