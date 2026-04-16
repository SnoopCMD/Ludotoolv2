import { NextResponse } from "next/server";

const TIMEOUT_MS = 10000;

async function fetchAvecTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const JSON_HEADERS = {
  "Accept": "application/json",
  "User-Agent": "LudoTool/1.0",
};

/** Cherche une image via l'EAN (code-barres) sur UPCitemdb. */
async function fetchParEAN(ean: string): Promise<{ image_url: string; source_url: string } | null> {
  const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`;
  let res: Response;
  try {
    res = await fetchAvecTimeout(url, { headers: JSON_HEADERS });
  } catch { return null; }
  if (!res.ok) return null;

  let data: Record<string, unknown>;
  try { data = await res.json(); } catch { return null; }

  const items = data?.items as Array<{ images?: string[]; offers?: Array<{ domain?: string }> }> | undefined;
  const item = items?.[0];
  if (!item) return null;

  const image_url = item.images?.find(img => img && img.startsWith("http")) ?? null;
  if (!image_url) return null;

  return {
    image_url,
    source_url: `https://www.upcitemdb.com/upc/${ean}`,
  };
}

/** Cherche une image via le nom du jeu sur Open Library (fallback générique). */
async function fetchParNom(nom: string): Promise<{ image_url: string; source_url: string } | null> {
  // Recherche Open Library — peu de jeux de société mais utile pour certains titres
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(nom)}&limit=1`;
  let res: Response;
  try {
    res = await fetchAvecTimeout(url, { headers: JSON_HEADERS });
  } catch { return null; }
  if (!res.ok) return null;

  let data: Record<string, unknown>;
  try { data = await res.json(); } catch { return null; }

  const docs = data?.docs as Array<{ cover_i?: number; key?: string; title?: string }> | undefined;
  const doc = docs?.[0];
  if (!doc?.cover_i) return null;

  return {
    image_url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
    source_url: `https://openlibrary.org${doc.key}`,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const nom = searchParams.get("nom");
  const ean = searchParams.get("ean");
  const debug = searchParams.get("debug") === "true";

  if (!nom) return NextResponse.json({ error: "Paramètre 'nom' requis" }, { status: 400 });

  // Mode debug : teste les endpoints et retourne les réponses brutes
  if (debug) {
    const results: Record<string, unknown> = {};

    if (ean) {
      const url = `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(ean)}`;
      try {
        const res = await fetchAvecTimeout(url, { headers: JSON_HEADERS });
        const text = await res.text();
        results["upcitemdb"] = { status: res.status, body: text.slice(0, 800) };
      } catch (e) {
        results["upcitemdb"] = { error: String(e) };
      }
    }

    return NextResponse.json({ debug: results });
  }

  // 1. Chercher par EAN (plus précis)
  if (ean) {
    const found = await fetchParEAN(ean);
    if (found) return NextResponse.json(found);
  }

  // 2. Fallback par nom
  const found = await fetchParNom(nom);
  if (found) return NextResponse.json(found);

  return NextResponse.json({ image_url: null, source_url: null });
}
