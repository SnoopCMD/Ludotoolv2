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
};

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
    return NextResponse.json({ debug: results });
  }

  const resultats = await chercherBGG(nom.trim());
  return NextResponse.json({ resultats });
}
