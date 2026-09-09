import { cookies } from 'next/headers';
import { getDB } from './db';

export const COOKIE_SESSION = 'ludotool_session';
const DUREE_SESSION_JOURS = 30;

// PBKDF2-SHA256. 50 000 itérations : ~7 ms de CPU, ce qui reste sous la limite
// d'un Worker tout en restant coûteux à attaquer hors ligne. Toute évolution de
// ce nombre reste rétrocompatible : l'empreinte stockée porte ses itérations.
const ITERATIONS = 50_000;

export type Compte = {
  id: string;
  equipe_id: string;
  identifiant: string;
  nom: string;
  role: string | null;
  groupe: string | null;
  doit_changer_mdp: boolean;
};

const b64 = (u8: Uint8Array) => btoa(String.fromCharCode(...u8));
const debase64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriver(motDePasse: string, sel: Uint8Array, iterations: number) {
  const cle = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sel as BufferSource, iterations, hash: 'SHA-256' }, cle, 256
  );
  return new Uint8Array(bits);
}

export async function hacherMotDePasse(motDePasse: string): Promise<string> {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const empreinte = await deriver(motDePasse, sel, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(sel)}$${b64(empreinte)}`;
}

export async function verifierMotDePasse(motDePasse: string, stocke: string): Promise<boolean> {
  const [algo, iterations, sel, empreinte] = (stocke ?? '').split('$');
  if (algo !== 'pbkdf2' || !iterations || !sel || !empreinte) return false;
  const calcule = await deriver(motDePasse, debase64(sel), Number(iterations));
  const attendu = debase64(empreinte);
  if (calcule.length !== attendu.length) return false;
  // Comparaison à temps constant : pas de sortie anticipée sur la 1re différence.
  let diff = 0;
  for (let i = 0; i < calcule.length; i++) diff |= calcule[i] ^ attendu[i];
  return diff === 0;
}

/** « Léa » et « lea » doivent ouvrir le même compte. */
export function normaliserIdentifiant(valeur: string): string {
  return (valeur ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

export async function creerSession(utilisateurId: string): Promise<void> {
  const db = await getDB();
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const expire = new Date(Date.now() + DUREE_SESSION_JOURS * 86400_000);

  await db.prepare(
    'INSERT INTO utilisateur_sessions (token, utilisateur_id, expire_le) VALUES (?, ?, ?)'
  ).bind(token, utilisateurId, expire.toISOString()).run();

  // Ménage opportuniste : les sessions expirées ne servent plus à rien.
  await db.prepare("DELETE FROM utilisateur_sessions WHERE expire_le < datetime('now')").run();

  const jar = await cookies();
  jar.set(COOKIE_SESSION, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expire,
  });
}

export async function supprimerSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSION)?.value;
  if (token) {
    const db = await getDB();
    await db.prepare('DELETE FROM utilisateur_sessions WHERE token = ?').bind(token).run();
  }
  jar.delete(COOKIE_SESSION);
}

/**
 * Compte rattaché au cookie de session, ou null. Renvoie null sans jamais lever
 * d'erreur : l'application reste utilisable hors connexion, y compris si les
 * tables de comptes n'existent pas encore.
 */
export async function compteCourant(): Promise<Compte | null> {
  try {
    const jar = await cookies();
    const token = jar.get(COOKIE_SESSION)?.value;
    if (!token) return null;

    const db = await getDB();
    const ligne = await db.prepare(
      `SELECT u.id, u.equipe_id, u.identifiant, u.doit_changer_mdp, e.nom, e.role, e.groupe
         FROM utilisateur_sessions s
         JOIN utilisateurs u ON u.id = s.utilisateur_id
         JOIN equipe e       ON e.id = u.equipe_id
        WHERE s.token = ? AND s.expire_le > datetime('now')`
    ).bind(token).first<any>();

    if (!ligne) return null;
    return {
      id: ligne.id,
      equipe_id: ligne.equipe_id,
      identifiant: ligne.identifiant,
      nom: ligne.nom,
      role: ligne.role ?? null,
      groupe: ligne.groupe ?? null,
      doit_changer_mdp: !!ligne.doit_changer_mdp,
    };
  } catch {
    return null;
  }
}
