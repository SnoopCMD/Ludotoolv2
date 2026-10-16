// Recherche chez Trader Games (jeux vidéo), partagée par le Store (paniers)
// et l'ajout de jeux de la page Jeux Vidéo.

import { casseTitre } from './casseTitre';
import { variantesEan } from './ean';

const TIMEOUT_MS = 10000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function fetchAvecTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type JeuRecherche = {
  nom: string;
  editeur: string | null;
  image_url: string | null;
  prix: number | null;
  url_source: string | null;
  bgg_id: number | null;
  /** Plateforme détectée (jeux vidéo) : PS5, Switch, PS4… */
  plateforme?: string | null;
  /** Neuf / Occasion */
  etat?: string | null;
  /** Zone du produit telle qu'annoncée par la boutique (France, Japon…) */
  region?: string | null;
  /** Référence fournisseur, utile pour passer commande */
  reference?: string | null;
  /** Annoncé en rupture chez le fournisseur */
  rupture?: boolean;
};

// ─── Trader Games (jeux vidéo) ────────────────────────────────────────────────
// La boutique tourne sous PrestaShop + module Leo Product Search. Son endpoint
// d'autocomplétion renvoie directement nom, prix, image et lien : c'est bien
// plus rapide et plus fiable que de parser la page de résultats, dont les
// titres sont tronqués à l'affichage.

const TG_BASE = "https://www.tradergames.fr";
const TG_SEARCH = `${TG_BASE}/fr/module/leoproductsearch/productsearch`;
const TG_HEADERS = {
  "User-Agent": UA,
  "Accept-Language": "fr-FR,fr;q=0.9",
};

// Le token est propre à la boutique (pas à la session) : on le garde en mémoire
// et on ne le recharge que s'il est refusé.
let tgToken: { valeur: string; recupereA: number } | null = null;
const TG_TOKEN_TTL = 30 * 60 * 1000;

export async function recupererTokenTG(force = false): Promise<string | null> {
  if (!force && tgToken && Date.now() - tgToken.recupereA < TG_TOKEN_TTL) return tgToken.valeur;
  try {
    const res = await fetchAvecTimeout(`${TG_BASE}/fr/`, { headers: { ...TG_HEADERS, Accept: "text/html" } });
    if (!res.ok) return null;
    const html = await res.text();
    const m = html.match(/leoproductsearch_static_token\s*=\s*"([a-f0-9]+)"/i);
    if (!m) return null;
    tgToken = { valeur: m[1], recupereA: Date.now() };
    return m[1];
  } catch { return null; }
}

type TGProduit = {
  id_product?: string;
  name?: string;
  url?: string;
  price_amount?: number;
  reference?: string;
  manufacturer_name?: string | null;
  cover?: { bySize?: Record<string, { url?: string }> } | null;
};

export async function appelerRechercheTG(nom: string, token: string): Promise<{ ok: boolean; produits: TGProduit[] }> {
  const params = new URLSearchParams({
    q: nom,
    ajaxSearch: "1",
    id_lang: "1",
    limit: "24",
    leoproductsearch_static_token: token,
  });
  try {
    const res = await fetchAvecTimeout(`${TG_SEARCH}?${params}`, {
      headers: { ...TG_HEADERS, "X-Requested-With": "XMLHttpRequest", Accept: "application/json, text/javascript, */*" },
    });
    if (!res.ok) return { ok: false, produits: [] };
    const data = await res.json() as { total_items?: number | string; products?: TGProduit[] };
    // Un token refusé renvoie {"products":[]} sans total_items : on distingue
    // ce cas d'une recherche réellement vide pour ne retenter qu'à bon escient.
    if (data.total_items === undefined) return { ok: false, produits: [] };
    return { ok: true, produits: Array.isArray(data.products) ? data.products : [] };
  } catch { return { ok: false, produits: [] }; }
}

// Les titres encodent la plateforme ; l'ordre compte (Switch 2 avant Switch…).
const PLATEFORMES: [RegExp, string][] = [
  [/\bSWITCH\s*2\b/i, "Switch 2"],
  [/\bSWITCH\b/i, "Switch"],
  [/\bPS5\b/i, "PS5"],
  [/\bPS4\b/i, "PS4"],
  [/\bPS3\b/i, "PS3"],
  [/\bPS2\b/i, "PS2"],
  [/\bPS1\b|\bPSX\b|\bPLAYSTATION 1\b/i, "PS1"],
  [/\bPS ?VITA\b/i, "PS Vita"],
  [/\bPSP\b/i, "PSP"],
  [/\bXBOX SERIES\b/i, "Xbox Series"],
  [/\bXBOX ONE\b/i, "Xbox One"],
  [/\bXBOX 360\b/i, "Xbox 360"],
  [/\bXBOX\b/i, "Xbox"],
  [/\bWII ?U\b/i, "Wii U"],
  [/\bWII\b/i, "Wii"],
  [/\b3DS\b/i, "3DS"],
  [/\bNINTENDO DS\b|\bNDS\b/i, "DS"],
  [/\bGAMECUBE\b|\bNGC\b/i, "GameCube"],
  [/\bN64\b|\bNINTENDO 64\b/i, "N64"],
  [/\bSNES\b|\bSUPER NINTENDO\b/i, "SNES"],
  [/\bNES\b/i, "NES"],
  [/\bGAME ?BOY ADVANCE\b|\bGBA\b/i, "Game Boy Advance"],
  [/\bGAME ?BOY\b|\bGBC\b/i, "Game Boy"],
  [/\bPC\b/i, "PC"],
];

export function detecterPlateforme(nom: string): string | null {
  for (const [re, label] of PLATEFORMES) if (re.test(nom)) return label;
  return null;
}

function detecterEtat(nom: string): string | null {
  if (/\bOCCASION\b/i.test(nom)) return "Occasion";
  if (/\bNEW\b|\bNEUF\b/i.test(nom)) return "Neuf";
  return null;
}

/** Retire les parenthèses de fin (« (GAME IN ENGLISH/…) », « (OFFICIAL NINTENDO) »). */
export function nettoyerTitre(nom: string): string {
  let out = nom.trim();
  while (/\s*\([^()]*\)\s*$/.test(out)) out = out.replace(/\s*\([^()]*\)\s*$/, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

export async function chercherTraderGames(nom: string): Promise<{ resultats: JeuRecherche[]; bloque: boolean }> {
  let token = await recupererTokenTG();
  if (!token) return { resultats: [], bloque: true };

  let reponse = await appelerRechercheTG(nom, token);
  if (!reponse.ok) {
    token = await recupererTokenTG(true);
    if (!token) return { resultats: [], bloque: true };
    reponse = await appelerRechercheTG(nom, token);
    if (!reponse.ok) return { resultats: [], bloque: true };
  }

  const resultats = reponse.produits.map(p => {
    const brut = (p.name ?? "").trim();
    const tailles = p.cover?.bySize ?? {};
    return {
      nom: nettoyerTitre(brut) || brut,
      editeur: p.manufacturer_name ?? null,
      image_url: tailles.home_default?.url ?? tailles.medium_default?.url ?? tailles.small_default?.url ?? null,
      prix: typeof p.price_amount === "number" ? p.price_amount : null,
      url_source: p.url ?? null,
      bgg_id: null,
      plateforme: detecterPlateforme(brut),
      etat: detecterEtat(brut),
      region: p.manufacturer_name ?? null,
      reference: p.reference ?? null,
    } as JeuRecherche;
  }).filter(r => r.nom.length > 0);

  // La boutique vend aussi figurines, peluches et accessoires : les vrais jeux
  // (plateforme identifiable) passent devant, le reste reste accessible en bas.
  const jeux = resultats.filter(r => r.plateforme);
  const autres = resultats.filter(r => !r.plateforme);
  return { resultats: [...jeux, ...autres].slice(0, 10), bloque: false };
}

/** Titre sans plateforme ni état, en casse de titre (« ZELDA BOTW SWITCH OCCASION » → « Zelda Botw »),
 *  pour retrouver le jeu ailleurs (jeuxvideo.com). */
export function titreSansPlateforme(nom: string): string {
  // La boutique tronque parfois ses titres en pleine parenthèse
  // (« (GAME IN ENGLISH/ /DE/ES… ») : tout ce qui suit la première est du détail.
  let t = nettoyerTitre(nom).replace(/\s*\(.*$/, '');
  for (const [re] of PLATEFORMES) t = t.replace(new RegExp(re.source, 'gi'), ' ');
  return t
    .replace(/\b(OCCASION|NEUF|NEW|EDITION STANDARD|VERSION FRAN[CÇ]AISE|FR|UK|EU|EUR|PAL|JAP|JP|US|USA|ASIA|ASIE)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    // « … NINTENDO SWITCH » : la marque reste une fois la console retirée.
    .replace(/\s+(NINTENDO|SONY|PLAYSTATION)$/i, '')
    .replace(/\s*[-–|/]+$/, '')
    .trim()
    .replace(/^.*$/, casseTitre);
}

/** Jeu vendu par Trader Games sous cet EAN, s'il est retrouvable par la
 *  recherche de la boutique : on n'accepte qu'une référence identique à l'EAN,
 *  ou un résultat unique. */
export async function chercherTraderGamesParEan(ean: string): Promise<{ jeu: JeuRecherche | null; bloque: boolean }> {
  // La boutique peut référencer un jeu Nintendo sous son UPC (12 chiffres).
  const variantes = variantesEan(ean);
  let { resultats, bloque } = await chercherTraderGames(ean);
  if (!bloque && !resultats.length && variantes[1]) ({ resultats, bloque } = await chercherTraderGames(variantes[1]));
  if (bloque) return { jeu: null, bloque };
  const exact = resultats.find(r => variantes.includes((r.reference ?? '').replace(/\D/g, '')));
  if (exact) return { jeu: exact, bloque: false };
  const jeux = resultats.filter(r => r.plateforme);
  return { jeu: jeux.length === 1 ? jeux[0] : null, bloque: false };
}
