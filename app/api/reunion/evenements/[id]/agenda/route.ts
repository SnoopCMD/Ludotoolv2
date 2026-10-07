import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';
import { EVENEMENTS, lireLigne, refusAnonyme } from '../../../../../../lib/reunion';

// Types que l'agenda sait colorer et classer. Les autres y deviennent « Autre » :
// surtout pas un type d'absence, qui retirerait des heures au planning.
const TYPES_AGENDA = ['Réunion', 'Animation', 'Soirée Jeux'];

/**
 * Pousse l'événement dans l'agenda, ou met à jour sa copie. Si la copie a été
 * supprimée côté agenda, elle est recréée.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await compteCourant())) return refusAnonyme();
    const db = await getDB();
    const { id } = await params;
    const brut = await db.prepare('SELECT * FROM reunion_evenements WHERE id = ?').bind(id).first<any>();
    if (!brut) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
    const ev = lireLigne(EVENEMENTS, brut);
    if (!ev.date_debut) return NextResponse.json({ error: "Il faut une date pour l'ajouter à l'agenda." }, { status: 400 });

    const champs: Record<string, string> = {
      titre: ev.titre,
      type: TYPES_AGENDA.includes(ev.type) ? ev.type : 'Autre',
      date_debut: ev.date_debut,
      date_fin: ev.date_fin || ev.date_debut,
      heure_debut: ev.heure_debut ?? '',
      heure_fin: ev.heure_fin ?? '',
      membres: JSON.stringify(ev.responsables ?? []),
    };
    const cles = Object.keys(champs);

    const existe = ev.agenda_id
      ? await db.prepare('SELECT id FROM evenements WHERE id = ?').bind(ev.agenda_id).first<any>()
      : null;
    let agendaId: string = ev.agenda_id;
    if (existe) {
      await db.prepare(`UPDATE evenements SET ${cles.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
        .bind(...cles.map(k => champs[k]), agendaId).run();
    } else {
      agendaId = crypto.randomUUID();
      await db.batch([
        db.prepare(`INSERT INTO evenements (id, ${cles.join(',')}) VALUES (?, ${cles.map(() => '?').join(',')})`)
          .bind(agendaId, ...cles.map(k => champs[k])),
        db.prepare("UPDATE reunion_evenements SET agenda_id = ?, maj_le = datetime('now') WHERE id = ?")
          .bind(agendaId, id),
      ]);
    }
    return NextResponse.json({ ...ev, agenda_id: agendaId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
