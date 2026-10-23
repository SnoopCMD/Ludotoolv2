import { getDB } from './db';

/**
 * Accès aux blocs spéciaux du planning. Comme pour le Bureau, les colonnes
 * écrites sont listées ici : les noms de colonnes ne viennent jamais du corps
 * de la requête.
 */
const COLONNES = ['nom', 'icone', 'couleur', 'nb_personnes', 'repetition', 'date_debut', 'date_fin', 'creneaux', 'ordre'];
const REPETITIONS = ['hebdo', 'semaineA', 'semaineB', 'ponctuel'];

export function lireBloc(r: any) {
  let creneaux = [];
  try { creneaux = JSON.parse(r.creneaux ?? '[]'); } catch { /* vide */ }
  return { ...r, creneaux };
}

function valeurs(body: any) {
  const champs: Record<string, unknown> = {};
  for (const k of COLONNES) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === 'creneaux') {
      const liste = Array.isArray(v) ? v : [];
      champs[k] = JSON.stringify(liste
        .filter((c: any) => Number.isInteger(c?.jour) && /^\d\d:\d\d$/.test(c?.debut ?? '') && /^\d\d:\d\d$/.test(c?.fin ?? '') && c.debut < c.fin)
        .map((c: any) => ({ jour: c.jour, debut: c.debut, fin: c.fin })));
    } else if (k === 'repetition') {
      champs[k] = REPETITIONS.includes(v) ? v : 'hebdo';
    } else if (k === 'nb_personnes' || k === 'ordre') {
      champs[k] = Math.max(0, parseInt(v, 10) || 0);
    } else {
      champs[k] = v === '' ? null : v ?? null;
    }
  }
  return champs;
}

export async function insererBloc(body: any) {
  const db = await getDB();
  const id = crypto.randomUUID();
  const champs = { ...valeurs(body), id };
  const cles = Object.keys(champs);
  await db.prepare(`INSERT INTO planning_blocs (${cles.join(',')}) VALUES (${cles.map(() => '?').join(',')})`)
    .bind(...cles.map(k => (champs as any)[k])).run();
  return lireBloc(await db.prepare('SELECT * FROM planning_blocs WHERE id = ?').bind(id).first());
}

export async function modifierBloc(id: string, body: any) {
  const db = await getDB();
  const champs = valeurs(body);
  const cles = Object.keys(champs);
  if (cles.length) {
    await db.prepare(`UPDATE planning_blocs SET ${cles.map(k => `${k} = ?`).join(', ')}, maj_le = datetime('now') WHERE id = ?`)
      .bind(...cles.map(k => champs[k]), id).run();
  }
  const r = await db.prepare('SELECT * FROM planning_blocs WHERE id = ?').bind(id).first();
  return r ? lireBloc(r) : null;
}
