import { NextResponse } from "next/server";

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

async function recupererTokenTG(force = false): Promise<string | null> {
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

async function appelerRechercheTG(nom: string, token: string): Promise<{ ok: boolean; produits: TGProduit[] }> {
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

function detecterPlateforme(nom: string): string | null {
  for (const [re, label] of PLATEFORMES) if (re.test(nom)) return label;
  return null;
}

function detecterEtat(nom: string): string | null {
  if (/\bOCCASION\b/i.test(nom)) return "Occasion";
  if (/\bNEW\b|\bNEUF\b/i.test(nom)) return "Neuf";
  return null;
}

/** Retire les parenthèses de fin (« (GAME IN ENGLISH/…) », « (OFFICIAL NINTENDO) »). */
function nettoyerTitre(nom: string): string {
  let out = nom.trim();
  while (/\s*\([^()]*\)\s*$/.test(out)) out = out.replace(/\s*\([^()]*\)\s*$/, "");
  return out.replace(/\s{2,}/g, " ").trim();
}

async function chercherTraderGames(nom: string): Promise<{ resultats: JeuRecherche[]; bloque: boolean }> {
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

// ─── Ludifolie (jeux de société et jouets) ────────────────────────────────────
// Boutique fournisseur, sous PrestaShop : le contrôleur de recherche accepte
// ajax=1 et renvoie alors un tableau de produits déjà structuré (nom français,
// éditeur, prix TTC, jaquette, lien). Une seule requête, contrairement à BGG qui
// enchaîne une recherche puis une fiche par résultat — et qui n'a aucun prix.

const LUDIFOLIE_BASE = "https://www.ludifolie.com";

type LudifolieProduit = {
  id_product?: string;
  name?: string;
  url?: string;
  price_amount?: number;
  reference?: string;
  manufacturer_name?: string | null;
  cover?: { bySize?: Record<string, { url?: string }> } | null;
};

/** Le JSON ne porte pas le stock : il est dans le HTML rendu joint à la réponse. */
function idsEnRupture(html: string): Set<string> {
  const ids = new Set<string>();
  for (const bloc of html.split("js-product-miniature").slice(1)) {
    const m = bloc.match(/data-id-product="(\d+)"/);
    if (m && /out-of-stock/i.test(bloc.slice(0, 3000))) ids.add(m[1]);
  }
  return ids;
}

async function chercherLudifolie(nom: string): Promise<JeuRecherche[]> {
  const url = `${LUDIFOLIE_BASE}/recherche?controller=search&s=${encodeURIComponent(nom)}&ajax=1`;
  try {
    const res = await fetchAvecTimeout(url, {
      headers: {
        "User-Agent": UA,
        "X-Requested-With": "XMLHttpRequest",
        "Accept": "application/json",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { products?: LudifolieProduit[]; rendered_products?: string };
    const produits = Array.isArray(data.products) ? data.products : [];
    if (produits.length === 0) return [];

    const rupture = idsEnRupture(data.rendered_products ?? "");

    return produits.slice(0, 10).map(p => {
      const tailles = p.cover?.bySize ?? {};
      return {
        nom: (p.name ?? "").trim(),
        editeur: p.manufacturer_name ?? null,
        image_url: tailles.home_default?.url ?? tailles.medium_default?.url ?? tailles.small_default?.url ?? null,
        prix: typeof p.price_amount === "number" ? p.price_amount : null,
        url_source: p.url ?? null,
        bgg_id: null,
        reference: p.reference ?? null,
        rupture: rupture.has(String(p.id_product ?? "")),
      } as JeuRecherche;
    }).filter(r => r.nom.length > 0);
  } catch { return []; }
}

// ─── BoardGameGeek (jeux de société) ──────────────────────────────────────────

/** Cherche des jeux BGG via leur API interne, puis récupère les détails en parallèle. */
async function chercherBGG(nom: string): Promise<JeuRecherche[]> {
  const url = `https://api.geekdo.com/api/geekitems?objecttype=thing&subtype=boardgame&nosession=1&pageid=1&search=${encodeURIComponent(nom)}`;
  const BGG_HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Origin": "https://boardgamegeek.com",
    "Referer": "https://boardgamegeek.com/",
  };

  let ids: number[] = [];
  try {
    const res = await fetchAvecTimeout(url, { headers: BGG_HEADERS });
    if (!res.ok) return [];
    const data = await res.json() as { items?: Array<{ objectid: string; name: string }> };
    // Filtrer les accessoires/sleeves (noms avec dimensions ou mots-clés parasites)
    const EXCLUSIONS = /^\d+x\d+mm|sleeve|insert|organizer|overlay|token|dice|storage/i;
    const pertinents = (data.items ?? []).filter(it => !EXCLUSIONS.test(it.name));
    ids = (pertinents.length > 0 ? pertinents : (data.items ?? [])).slice(0, 6).map(it => Number(it.objectid));
  } catch { return []; }

  if (ids.length === 0) return [];

  // Récupérer images + éditeur pour chaque ID en parallèle
  const fiches = (await Promise.all(ids.map(fetchInfosBGG)))
    .filter((f): f is JeuRecherche => f !== null && f.nom.length > 0);

  // Préférer les résultats avec éditeur (jeux réels vs accessoires sans publisher)
  const avecEditeur = fiches.filter(f => f.editeur !== null);
  return avecEditeur.length > 0 ? avecEditeur : fiches;
}

/** Récupère les infos d'un jeu BGG via l'API geekdo (pas de clé requise). */
async function fetchInfosBGG(id: number): Promise<JeuRecherche | null> {
  const url = `https://api.geekdo.com/api/geekitems?objecttype=thing&subtype=boardgame&objectid=${id}&nosession=1`;
  try {
    const res = await fetchAvecTimeout(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Origin": "https://boardgamegeek.com",
        "Referer": "https://boardgamegeek.com/",
      },
    });
    if (!res.ok) return null;
    const data = await res.json() as { item?: Record<string, unknown> };
    const item = data.item;
    if (!item) return null;

    const links = (item.links || {}) as Record<string, Array<{ name: string }>>;
    const editeur = (links.boardgamepublisher?.[0]?.name) ?? null;
    const images = item.images as Record<string, string> | undefined;
    const image_url = images?.square200 || images?.original || null;

    return {
      nom: (item.name as string) || "",
      editeur,
      image_url,
      prix: null,
      url_source: `https://boardgamegeek.com/boardgame/${id}`,
      bgg_id: id,
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nom = searchParams.get("nom");
  const type = searchParams.get("type") ?? "JdS";
  const debug = searchParams.get("debug") === "true";

  if (!nom || nom.trim().length < 2) {
    return NextResponse.json({ error: "Paramètre 'nom' requis" }, { status: 400 });
  }

  if (debug) {
    const q = encodeURIComponent(nom.trim());
    const bggHeaders = { "User-Agent": UA, "Accept": "application/json", "Origin": "https://boardgamegeek.com", "Referer": "https://boardgamegeek.com/" };
    const urls = [
      `https://api.geekdo.com/api/geekitems?objecttype=thing&subtype=boardgame&nosession=1&pageid=1&search=${q}`,
      `https://api.geekdo.com/api/suggest?q=${q}&objecttype=boardgame&nosession=1`,
    ];
    const results: Record<string, unknown> = {};
    for (const url of urls) {
      try {
        const res = await fetchAvecTimeout(url, { headers: bggHeaders });
        const text = await res.text();
        results[url] = { status: res.status, ct: res.headers.get("content-type"), body: text.slice(0, 600) };
      } catch (e) { results[url] = { error: String(e) }; }
    }
    const token = await recupererTokenTG(true);
    results["tradergames:token"] = token ?? "introuvable";
    if (token) results["tradergames:search"] = await appelerRechercheTG(nom.trim(), token);
    return NextResponse.json({ debug: results });
  }

  if (type === "JV") {
    const { resultats, bloque } = await chercherTraderGames(nom.trim());
    return NextResponse.json({ resultats, source: "tradergames", bloque });
  }

  // Le fournisseur d'abord (prix réels), BGG en filet quand le jeu n'est pas
  // référencé chez lui — le prix devra alors être saisi à la main.
  const boutique = await chercherLudifolie(nom.trim());
  if (boutique.length > 0) {
    return NextResponse.json({ resultats: boutique, source: "ludifolie", bloque: false });
  }

  const resultats = await chercherBGG(nom.trim());
  return NextResponse.json({ resultats, source: "bgg", bloque: false });
}
