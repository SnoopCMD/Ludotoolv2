import { NextResponse } from 'next/server';
import { getDB } from '../../../../../../lib/db';
import { compteCourant } from '../../../../../../lib/auth';
import { FICHES, lireLigne } from '../../../../../../lib/reunion';

/**
 * Validation personnelle d'une mission (depuis l'accueil) : le compte connecté
 * coche sa part. Une mission à une seule personne, ou dont tous les assignés
 * ont validé, passe à « fait ». DELETE retire sa validation.
 */
async function basculer(id: string, valider: boolean) {
  const compte = await compteCourant();
  if (!compte) return NextResponse.json({ error: 'Connecte-toi pour valider.' }, { status: 401 });
  const db = await getDB();
  const ligne = await db.prepare('SELECT * FROM reunion_fiches WHERE id = ?').bind(id).first<any>();
  if (!ligne) return NextResponse.json({ error: 'Fiche introuvable.' }, { status: 404 });
  const f = lireLigne(FICHES, ligne) as { assignes: string[]; valide_par: string[]; statut: string };
  const moi = compte.equipe_id;
  if (!f.assignes.includes(moi)) return NextResponse.json({ error: "Tu n'es pas assigné à cette mission." }, { status: 403 });

  const valide = valider
    ? [...new Set([...f.valide_par.filter(x => f.assignes.includes(x)), moi])]
    : f.valide_par.filter(x => x !== moi && f.assignes.includes(x));
  const tous = f.assignes.every(x => valide.includes(x));
  const statut = tous ? 'fait' : (f.statut === 'fait' ? 'en_cours' : f.statut);
  const faitLe = statut === 'fait' ? (f.statut === 'fait' ? ligne.fait_le : new Date().toISOString()) : null;

  await db.prepare(`UPDATE reunion_fiches SET valide_par = ?, statut = ?, fait_le = ?, maj_le = datetime('now') WHERE id = ?`)
    .bind(JSON.stringify(valide), statut, faitLe, id).run();
  const maj = await db.prepare('SELECT * FROM reunion_fiches WHERE id = ?').bind(id).first<any>();
  return NextResponse.json(lireLigne(FICHES, maj));
}

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await basculer((await params).id, true); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return await basculer((await params).id, false); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
