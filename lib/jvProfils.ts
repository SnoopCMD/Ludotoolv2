import { NextResponse } from 'next/server';
import { getDB } from './db';

export const SEXES = ['H', 'F', 'N'] as const;
export const AGES = ['11-16', '16-18', '18+', 'parent'] as const;

/** Minuscules, sans accents ni ponctuation : « Léa-Rose » se trouve avec « lea rose ». */
export const pourRecherche = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Le lecteur peut ajouter espaces ou retour chariot autour du numéro. */
export const normaliserCarte = (s: unknown) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

/** Champs d'un profil tirés du corps de requête, validés. `partiel` : seuls les champs présents. */
export function champsProfil(body: any, partiel: boolean) {
  const champs: Record<string, string | null> = {};
  if (!partiel || 'prenom' in body) {
    const prenom = String(body.prenom ?? '').trim();
    if (!prenom) throw new ErreurProfil('Prénom obligatoire.');
    champs.prenom = prenom;
    champs.recherche = pourRecherche(prenom);
  }
  if (!partiel || 'numero_carte' in body) champs.numero_carte = normaliserCarte(body.numero_carte) || null;
  if (!partiel || 'sexe' in body) champs.sexe = (SEXES as readonly string[]).includes(body.sexe) ? body.sexe : null;
  if (!partiel || 'age' in body) champs.age = (AGES as readonly string[]).includes(body.age) ? body.age : null;
  if (body.utilise === true) champs.utilise_le = new Date().toISOString();
  return champs;
}

export class ErreurProfil extends Error {}

export function reponseErreur(e: any) {
  if (e instanceof ErreurProfil) return NextResponse.json({ error: e.message }, { status: 400 });
  if (String(e?.message).includes('UNIQUE')) return NextResponse.json({ error: 'Cette carte est déjà liée à un autre profil.' }, { status: 409 });
  return NextResponse.json({ error: e?.message ?? 'Erreur' }, { status: 500 });
}

export async function lireProfil(id: string) {
  const db = await getDB();
  return db.prepare('SELECT id, prenom, numero_carte, sexe, age, cree_le, utilise_le FROM jv_profils WHERE id = ?').bind(id).first();
}
