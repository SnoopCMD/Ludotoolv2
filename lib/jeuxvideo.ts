// Recherche et fiches de jeux sur jeuxvideo.com, pour pré-remplir l'ajout
// d'un jeu vidéo en français (synopsis, genres, éditeur, sortie, PEGI).
//
// Pas d'API publique : on lit les pages. Deux particularités du site :
// - les liens internes sont masqués (« JvCare ») : une classe `JvCare <hex>`
//   porte l'URL encodée dans un alphabet hexadécimal mélangé ;
// - le site est derrière une protection Cloudflare qui refuse les clients
//   non-navigateurs (403 « Just a moment… »), y compris le Worker déployé
//   (constaté le 16/10/2026, comme pour Trader Games). En cas de refus, on
//   renvoie `bloque: true` plutôt qu'une erreur et l'interface se rabat sur IGDB.

const JVC_BASE = 'https://www.jeuxvideo.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const TIMEOUT_MS = 10000;

export type ResultatJvc = { titre: string; url: string; image_url: string | null };

export type FicheJvc = {
  titre: string;
  url: string;
  image_url: string | null;
  description: string | null;
  genres: string[];
  plateformes: string[];
  editeur: string | null;
  annee: number | null;
  pegi: number | null;
};

const ALPHABET_JVCARE = '0A12B34C56D78E9F';

/** Décode l'URL d'un lien « JvCare ». */
export function decoderJvCare(code: string): string {
  let url = '';
  for (let i = 0; i + 1 < code.length; i += 2) {
    const h = ALPHABET_JVCARE.indexOf(code[i]);
    const l = ALPHABET_JVCARE.indexOf(code[i + 1]);
    if (h < 0 || l < 0) return '';
    url += String.fromCharCode(h * 16 + l);
  }
  return url;
}

function decoderEntites(s: string): string {
  return s
    .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

const texte = (html: string) => decoderEntites(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function lirePage(url: string): Promise<{ html: string | null; bloque: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const html = await res.text();
    if (res.status === 403 || /<title>Just a moment/i.test(html)) return { html: null, bloque: true };
    if (!res.ok) return { html: null, bloque: false };
    return { html, bloque: false };
  } catch {
    return { html: null, bloque: false };
  }
}

/** Cartes « jeu » d'une page de résultats (les articles et vidéos sont ignorés). */
export function analyserRecherche(html: string): ResultatJvc[] {
  const resultats: ResultatJvc[] = [];
  for (const bloc of html.split('card--game').slice(1)) {
    const lien = bloc.match(/JvCare ([0-9A-F]+)[^>]*title="([^"]*)"/);
    if (!lien) continue;
    const chemin = decoderJvCare(lien[1]);
    if (!/^\/jeux\//.test(chemin)) continue;
    const image = bloc.match(/data-src="([^"]+)"/)?.[1] ?? bloc.match(/<img[^>]+src="(https:[^"]+)"/)?.[1] ?? null;
    resultats.push({ titre: decoderEntites(lien[2]), url: JVC_BASE + chemin, image_url: image });
  }
  return resultats;
}

export async function chercherJvc(q: string): Promise<{ resultats: ResultatJvc[]; bloque: boolean }> {
  const { html, bloque } = await lirePage(`${JVC_BASE}/rechercher.php?q=${encodeURIComponent(q)}`);
  if (!html) return { resultats: [], bloque };
  return { resultats: analyserRecherche(html).slice(0, 8), bloque: false };
}

/** Lignes du tableau « Caractéristiques détaillées » : libellé → valeurs. */
function caracteristiques(html: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const debut = html.indexOf('gameCharacteristicsDetailed__table');
  if (debut < 0) return out;
  const zone = html.slice(debut, debut + 15000);
  for (const ligne of zone.split('gameCharacteristicsDetailed__tr').slice(1)) {
    const libelle = ligne.match(/__td--th">([\s\S]*?)<\/div>/)?.[1];
    if (!libelle) continue;
    const valeurs = [...ligne.matchAll(/__characValue[^>]*>([\s\S]*?)<\/span>/g)].map(m => texte(m[1])).filter(Boolean);
    out[texte(libelle)] = valeurs;
  }
  return out;
}

export function analyserFiche(html: string, url: string): FicheJvc | null {
  let ld: { name?: string; image?: { url?: string } | string; genre?: string[] | string; gamePlatform?: string[] | string } | null = null;
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      if (d?.['@type'] === 'VideoGame') { ld = d; break; }
    } catch { /* bloc JSON-LD invalide : on passe au suivant */ }
  }
  const carac = caracteristiques(html);
  const titre = ld?.name ?? texte(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '');
  if (!titre) return null;

  const liste = (v: string[] | string | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map(x => x.trim()).filter(Boolean);
  const image = typeof ld?.image === 'string' ? ld.image : ld?.image?.url
    ?? html.match(/<meta property="og:image" content="([^"]+)"/)?.[1] ?? null;

  const synopsis = html.match(/gameCharacteristicsMain__synopsis[^>]*>([\s\S]*?)<\/p>/)?.[1];
  // Le site tronque le synopsis en plein milieu : on s'arrête à la dernière
  // phrase complète quand il y en a une.
  let description = synopsis ? texte(synopsis) : null;
  if (description && !/[.!?…»]$/.test(description)) {
    const fin = Math.max(description.lastIndexOf('. '), description.lastIndexOf('! '), description.lastIndexOf('? '));
    description = fin > 40 ? description.slice(0, fin + 1) : description + '…';
  }

  const sortie = (Object.entries(carac).find(([k]) => /^Sortie/i.test(k))?.[1] ?? [])[0]
    ?? html.match(/gameCharacteristicsMain__releaseDate[\s\S]*?<\/span>([^<]+)/)?.[1]?.trim() ?? '';
  const an = sortie.match(/\b(19|20)\d{2}\b/)?.[0];
  const annee = an ? Number(an) : null;

  const classification = (Object.entries(carac).find(([k]) => /Classification/i.test(k))?.[1] ?? []).join(' ');
  const age = Number(classification.match(/\+?\s*(\d{1,2})\s*ans/)?.[1]);
  const pegi = [3, 7, 12, 16, 18].includes(age) ? age : null;

  const editeurs = Object.entries(carac).find(([k]) => /diteur/i.test(k))?.[1] ?? [];

  return {
    titre: decoderEntites(titre),
    url,
    image_url: image,
    description,
    genres: liste(ld?.genre),
    plateformes: liste(ld?.gamePlatform),
    editeur: editeurs[0] ?? null,
    annee,
    pegi,
  };
}

/** Fiche d'un jeu. Accepte une URL de fiche jeuxvideo.com uniquement. */
export async function ficheJvc(url: string): Promise<{ fiche: FicheJvc | null; bloque: boolean }> {
  if (!url.startsWith(`${JVC_BASE}/jeux/`)) return { fiche: null, bloque: false };
  const { html, bloque } = await lirePage(url);
  if (!html) return { fiche: null, bloque };
  return { fiche: analyserFiche(html, url), bloque: false };
}

const normaliser = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();

/** Meilleure fiche pour un titre : correspondance exacte d'abord, sinon le
 *  premier résultat qui contient tous les mots cherchés, sinon le premier. */
export async function completerDepuisJvc(titre: string): Promise<{ fiche: FicheJvc | null; bloque: boolean }> {
  const { resultats, bloque } = await chercherJvc(titre);
  if (!resultats.length) return { fiche: null, bloque };
  const cible = normaliser(titre);
  const mots = cible.split(' ').filter(m => m.length > 1);
  const choisi = resultats.find(r => normaliser(r.titre) === cible)
    ?? resultats.find(r => { const t = normaliser(r.titre); return mots.every(m => t.includes(m)); })
    ?? resultats[0];
  return ficheJvc(choisi.url);
}
