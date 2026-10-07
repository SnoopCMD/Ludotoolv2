import { getDB } from './db';

/**
 * Accès aux tables de la page Réunion. Les colonnes modifiables sont listées
 * explicitement : contrairement aux routes génériques historiques, les noms de
 * colonnes ne viennent jamais du corps de la requête.
 */
type Table = {
  nom: string;
  colonnes: string[];
  json: string[];
};

export const FICHES: Table = {
  nom: 'reunion_fiches',
  colonnes: ['genre', 'titre', 'description', 'statut', 'priorite', 'deadline', 'assignes', 'evenement_id', 'seance_id', 'decision', 'fait_le'],
  json: ['assignes'],
};

export const EVENEMENTS: Table = {
  nom: 'reunion_evenements',
  colonnes: ['titre', 'type', 'date_debut', 'date_fin', 'heure_debut', 'heure_fin', 'lieu', 'description', 'statut', 'responsables', 'agenda_id'],
  json: ['responsables'],
};

export const SEANCES: Table = {
  nom: 'reunion_seances',
  colonnes: ['date', 'titre', 'statut', 'participants', 'compte_rendu', 'terminee_le'],
  json: ['participants'],
};

/** Les tableaux JSON sortent de la base en texte : on les rend au client parsés. */
export function lireLigne(t: Table, r: any) {
  const out = { ...r };
  for (const k of t.json) {
    try { out[k] = typeof r[k] === 'string' ? JSON.parse(r[k]) : (r[k] ?? []); }
    catch { out[k] = []; }
  }
  return out;
}

function valeursAutorisees(t: Table, body: any) {
  const champs: Record<string, unknown> = {};
  for (const k of t.colonnes) {
    if (!(k in body)) continue;
    const v = body[k];
    champs[k] = t.json.includes(k) ? JSON.stringify(Array.isArray(v) ? v : []) : (v === '' ? null : v ?? null);
  }
  return champs;
}

export async function inserer(t: Table, body: any, creePar: string | null) {
  const db = await getDB();
  const id = crypto.randomUUID();
  const champs: Record<string, unknown> = { ...valeursAutorisees(t, body), id, cree_par: creePar };
  const cles = Object.keys(champs);
  await db.prepare(
    `INSERT INTO ${t.nom} (${cles.join(',')}) VALUES (${cles.map(() => '?').join(',')})`
  ).bind(...cles.map(k => champs[k])).run();
  const ligne = await db.prepare(`SELECT * FROM ${t.nom} WHERE id = ?`).bind(id).first<any>();
  return lireLigne(t, ligne);
}

export async function modifier(t: Table, id: string, body: any) {
  const db = await getDB();
  const champs = valeursAutorisees(t, body);
  const cles = Object.keys(champs);
  if (cles.length) {
    // reunion_seances n'a pas de maj_le : l'horodatage utile y est terminee_le.
    const maj = t.nom === SEANCES.nom ? '' : ", maj_le = datetime('now')";
    await db.prepare(`UPDATE ${t.nom} SET ${cles.map(k => `${k} = ?`).join(', ')}${maj} WHERE id = ?`)
      .bind(...cles.map(k => champs[k]), id).run();
  }
  const ligne = await db.prepare(`SELECT * FROM ${t.nom} WHERE id = ?`).bind(id).first<any>();
  return ligne ? lireLigne(t, ligne) : null;
}
