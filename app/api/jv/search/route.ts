import { NextRequest, NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

type GameResult = {
  external_id: string;
  titre: string;
  description: string | null;
  image_url: string | null;
  annee: number | null;
  editeur: string | null;
  genre: string | null;
  pegi: number | null;
  console: string;
};

// ── PS5 : PlayStation Store (NEXT_DATA JSON embarqué) ─────────────────────────

async function searchPS5(query: string): Promise<GameResult[]> {
  const url = `https://store.playstation.com/fr-fr/search/${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
    redirect: "follow",
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const html = await res.text();

  const m = html.match(/id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];

  let data: any;
  try { data = JSON.parse(m[1]); } catch { return []; }

  const results: GameResult[] = [];

  function walk(obj: any, depth = 0) {
    if (depth > 12 || results.length >= 8) return;
    if (Array.isArray(obj)) { obj.forEach(v => walk(v, depth + 1)); return; }
    if (typeof obj !== "object" || !obj) return;

    if (
      obj.__typename === "Product" &&
      obj.storeDisplayClassification === "FULL_GAME" &&
      Array.isArray(obj.platforms) && obj.platforms.includes("PS5")
    ) {
      const cover = (obj.media ?? []).find((m: any) => m.role === "MASTER" && m.type === "IMAGE")
        ?? (obj.media ?? []).find((m: any) => m.role === "GAMEHUB_COVER_ART" && m.type === "IMAGE");
      const imageUrl = cover?.url ? `${cover.url}.png` : null;
      results.push({
        external_id: obj.id ?? "",
        titre: obj.name ?? "",
        description: null,
        image_url: imageUrl,
        annee: null,
        editeur: null,
        genre: null,
        pegi: null,
        console: "PS5",
      });
      return;
    }
    Object.values(obj).forEach(v => walk(v, depth + 1));
  }
  walk(data);

  // Enrichit le premier résultat avec publisher/desc depuis sa fiche produit
  if (results.length > 0 && results[0].external_id) {
    const detail = await fetchPS5Detail(results[0].external_id);
    if (detail) {
      results[0] = { ...results[0], ...detail };
    }
  }

  return results;
}

async function fetchPS5Detail(productId: string): Promise<Partial<GameResult> | null> {
  try {
    const url = `https://store.playstation.com/fr-fr/product/${encodeURIComponent(productId)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const pub = html.match(/"publisherName":"([^"]+)"/)?.[1] ?? null;
    const cr = html.match(/"contentRating":"([^"]+)"/)?.[1] ?? null;
    const pegiNum = cr ? parsePegi(cr) : null;

    const schemaMatch = html.match(/type="application\/ld\+json">([\s\S]*?)<\/script>/);
    let desc: string | null = null;
    let image: string | null = null;
    if (schemaMatch) {
      try {
        const schema = JSON.parse(schemaMatch[1]);
        desc = schema.description ?? null;
        image = schema.image ?? null;
      } catch {}
    }

    return { editeur: pub, pegi: pegiNum, description: desc, image_url: image };
  } catch {
    return null;
  }
}

function parsePegi(str: string): number | null {
  const m = str.match(/(\d+)/);
  if (!m) return null;
  const n = parseInt(m[1]);
  return [3, 7, 12, 16, 18].includes(n) ? n : null;
}

// ── Switch : Nintendo eShop Europe (API Solr publique) ────────────────────────

async function searchSwitch(query: string): Promise<GameResult[]> {
  const url = `https://searching.nintendo-europe.com/fr/select?${new URLSearchParams({
    q: query,
    "fq": "type:GAME AND playable_on_txt:HAC",
    start: "0",
    rows: "8",
    wt: "json",
  })}`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  const docs = data?.response?.docs ?? [];

  return docs.map((doc: any): GameResult => {
    const pegiRaw = doc.age_rating_value ?? null;
    const pegi = pegiRaw ? parsePegi(String(pegiRaw)) : null;
    const genres: string[] = doc.pretty_game_categories_txt ?? doc.game_categories_txt ?? [];
    const dateStr: string = (doc.dates_released_dts ?? [])[0] ?? "";
    const annee = dateStr ? new Date(dateStr).getFullYear() : null;
    const image = doc.image_url_sq_s ?? doc.image_url ?? null;

    return {
      external_id: String(doc.nsuid_txt?.[0] ?? doc.fs_id ?? ""),
      titre: doc.title ?? "",
      description: doc.excerpt ?? doc.product_catalog_description_s ?? null,
      image_url: image ? `${image}` : null,
      annee: isNaN(annee as any) ? null : annee,
      editeur: doc.publisher ?? null,
      genre: genres[0] ?? null,
      pegi,
      console: "Switch",
    };
  });
}

// ── PC : Steam Store API (entièrement publique) ───────────────────────────────

async function searchPC(query: string): Promise<GameResult[]> {
  const searchUrl = `https://store.steampowered.com/api/storesearch/?${new URLSearchParams({
    term: query,
    l: "french",
    cc: "FR",
  })}`;
  const searchRes = await fetch(searchUrl, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) return [];
  const searchData = await searchRes.json();
  const items: any[] = (searchData?.items ?? []).slice(0, 5);
  if (!items.length) return [];

  // Récupère les détails du premier jeu (description + image HD)
  const firstId = items[0]?.id;
  let firstDetail: any = null;
  if (firstId) {
    try {
      const detailRes = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${firstId}&l=french&cc=FR&filters=basic,short_description,genres,publishers,release_date,header_image`,
        { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) }
      );
      if (detailRes.ok) {
        const dd = await detailRes.json();
        firstDetail = dd?.[String(firstId)]?.data ?? null;
      }
    } catch {}
  }

  return items.map((item: any, idx: number): GameResult => {
    const detail = idx === 0 ? firstDetail : null;
    const genres: string[] = detail?.genres?.map((g: any) => g.description) ?? [];
    const publishers: string[] = detail?.publishers ?? [];
    const dateStr: string = detail?.release_date?.date ?? "";
    let annee: number | null = null;
    if (dateStr) {
      const y = dateStr.match(/\d{4}/);
      if (y) annee = parseInt(y[0]);
    }
    return {
      external_id: String(item.id ?? ""),
      titre: item.name ?? (detail?.name ?? ""),
      description: detail?.short_description ?? null,
      image_url: detail?.header_image ?? item.tiny_image ?? null,
      annee,
      editeur: publishers[0] ?? null,
      genre: genres[0] ?? null,
      pegi: null,
      console: "PC",
    };
  });
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  const platform = req.nextUrl.searchParams.get("platform") ?? "";

  if (!q) return NextResponse.json({ error: "Paramètre q manquant" }, { status: 400 });

  try {
    let results: GameResult[] = [];

    if (platform === "PS5") results = await searchPS5(q);
    else if (platform === "Switch") results = await searchSwitch(q);
    else if (platform === "PC") results = await searchPC(q);
    else {
      // Recherche multi-plateformes en parallèle
      const [ps5, sw, pc] = await Promise.all([searchPS5(q), searchSwitch(q), searchPC(q)]);
      results = [...ps5, ...sw, ...pc];
    }

    return NextResponse.json(results);
  } catch (err: any) {
    console.error("[jv/search]", err?.message);
    return NextResponse.json({ error: err?.message ?? "Erreur serveur" }, { status: 502 });
  }
}
