// Recherche du PDF des règles d'un jeu chez Philibert.
//
// La fiche produit se retrouve par EAN via leur moteur Doofinder (même appel
// que /api/recherche) : correspondance exacte, donc pas de faux positif. La
// page produit liste ensuite ses « fichiers joints » (/fr/product/attachment/N),
// dont les règles quand l'éditeur les fournit. Site public, faible volume :
// tout échec renvoie null plutôt qu'une erreur.

const DOOFINDER_URL = 'https://eu1-search.doofinder.com/5/search';
const DOOFINDER_HASHID = 'b220561599a93dfc2d82f89bf6223e54';
const PHILIBERT = 'https://www.philibertnet.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const TIMEOUT_MS = 15000;

export type ReglePhilibert = { url: string; libelle: string; page: string };

export async function trouverFichePhilibert(ean: string): Promise<{ link: string; title: string } | null> {
  try {
    const r = await fetch(`${DOOFINDER_URL}?hashid=${DOOFINDER_HASHID}&query=${encodeURIComponent(ean)}&rpp=1`, {
      headers: { Origin: PHILIBERT, 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) return null;
    const data = await r.json() as { results?: Array<{ ean13?: string; title?: string; link?: string }> };
    const res = data.results?.[0];
    if (!res?.link || res.ean13 !== ean) return null;
    return { link: res.link, title: res.title ?? '' };
  } catch {
    return null;
  }
}

// Priorité aux règles en français ; on écarte ce qui n'est manifestement pas
// la règle de base (FAQ, errata, solutions, aides de jeu, extensions).
function scoreLibelle(libelle: string): number {
  const l = libelle.toLowerCase();
  if (/\b(faq|errata|solution|aide de jeu|carte|scoresheet|feuille de score|extension)\b/.test(l)) return -1;
  let s = 0;
  if (/r[èe]gle|rule|livret|notice/.test(l)) s += 2;
  if (/fran|\bfr\b|multilingue|vf/.test(l)) s += 2;
  if (/anglais|english|\ben\b|deutsch|allemand|italien|espagnol|dutch/.test(l) && !/fran|\bfr\b|multilingue/.test(l)) s -= 2;
  return s;
}

export async function trouverReglePhilibert(ean: string): Promise<ReglePhilibert | null> {
  const fiche = await trouverFichePhilibert(ean);
  if (!fiche) return null;
  let html: string;
  try {
    const r = await fetch(fiche.link, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    html = await r.text();
  } catch {
    return null;
  }
  const vus = new Set<string>();
  const candidats: Array<{ url: string; libelle: string; score: number }> = [];
  for (const m of html.matchAll(/href="(\/fr\/product\/attachment\/\d+)"[^>]*>\s*<span>([^<]*)<\/span>/g)) {
    if (vus.has(m[1])) continue;
    vus.add(m[1]);
    const libelle = m[2].trim();
    candidats.push({ url: PHILIBERT + m[1], libelle, score: scoreLibelle(libelle) });
  }
  const meilleur = candidats.filter(c => c.score >= 0).sort((a, b) => b.score - a.score)[0];
  return meilleur ? { url: meilleur.url, libelle: meilleur.libelle, page: fiche.link } : null;
}

// Télécharge le PDF ; renvoie null si ce n'en est pas un ou s'il est trop lourd.
export async function telechargerPdf(url: string, tailleMax: number): Promise<{ body: ReadableStream | ArrayBuffer; taille: number } | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
    if (!r.ok || !r.body) return null;
    const type = r.headers.get('content-type') || '';
    const taille = Number(r.headers.get('content-length') || 0);
    if (taille > tailleMax) return null;
    if (!type.includes('pdf')) {
      // Pas de Content-Type fiable : on vérifie l'en-tête du fichier.
      const buf = await r.arrayBuffer();
      const tete = new TextDecoder().decode(buf.slice(0, 5));
      if (tete !== '%PDF-' || buf.byteLength > tailleMax) return null;
      return { body: buf, taille: buf.byteLength };
    }
    // R2 exige une longueur connue : le corps d'une réponse avec Content-Length convient.
    if (taille > 0) return { body: r.body, taille };
    const buf = await r.arrayBuffer();
    if (buf.byteLength > tailleMax) return null;
    return { body: buf, taille: buf.byteLength };
  } catch {
    return null;
  }
}
