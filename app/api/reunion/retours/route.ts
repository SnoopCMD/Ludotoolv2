import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { EVENEMENTS, RETOURS, inserer, lireLigne, refusAnonyme } from '../../../../lib/reunion';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM reunion_retours ORDER BY cree_le DESC').all();
    return NextResponse.json(result.results.map(r => lireLigne(RETOURS, r)));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Crée le retour d'un événement passé. Le corps désigne l'événement soit par
 * `evenement_id`, soit par `agenda_id` pour un événement saisi directement dans
 * l'agenda : il est alors importé dans le Bureau (ou retrouvé s'il l'a déjà
 * été). Écrire un retour vaut clôture : l'événement passe « terminé ».
 */
export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return refusAnonyme();
    const db = await getDB();
    const body = await request.json() as any;

    let evId: string | null = body.evenement_id ?? null;
    if (!evId && body.agenda_id) {
      const deja = await db.prepare('SELECT id FROM reunion_evenements WHERE agenda_id = ?').bind(body.agenda_id).first<any>();
      if (deja) evId = deja.id;
      else {
        const a = await db.prepare('SELECT * FROM evenements WHERE id = ?').bind(body.agenda_id).first<any>();
        if (!a) return NextResponse.json({ error: "Événement de l'agenda introuvable." }, { status: 404 });
        let membres: string[] = [];
        try { membres = typeof a.membres === 'string' ? JSON.parse(a.membres) : (a.membres ?? []); } catch { /* vide */ }
        const ev = await inserer(EVENEMENTS, {
          titre: a.titre || a.type, type: a.type, date_debut: a.date_debut, date_fin: a.date_fin,
          heure_debut: a.heure_debut, heure_fin: a.heure_fin, statut: 'termine', responsables: membres, agenda_id: a.id,
        }, compte.equipe_id);
        evId = ev.id;
      }
    }
    if (!evId) return NextResponse.json({ error: 'Événement manquant.' }, { status: 400 });

    const ev = await db.prepare('SELECT statut FROM reunion_evenements WHERE id = ?').bind(evId).first<any>();
    if (!ev) return NextResponse.json({ error: 'Événement introuvable.' }, { status: 404 });
    if (ev.statut === 'annule') return NextResponse.json({ error: 'Cet événement a été annulé.' }, { status: 400 });
    const existant = await db.prepare('SELECT id FROM reunion_retours WHERE evenement_id = ?').bind(evId).first<any>();
    if (existant) return NextResponse.json({ error: 'Cet événement a déjà un retour.' }, { status: 409 });

    const retour = await inserer(RETOURS, body, compte.equipe_id, { evenement_id: evId });
    await db.prepare("UPDATE reunion_evenements SET statut = 'termine', maj_le = datetime('now') WHERE id = ? AND statut <> 'termine'")
      .bind(evId).run();
    const evenement = await db.prepare('SELECT * FROM reunion_evenements WHERE id = ?').bind(evId).first<any>();
    return NextResponse.json({ retour, evenement: lireLigne(EVENEMENTS, evenement) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
