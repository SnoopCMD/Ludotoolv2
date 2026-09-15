import { NextRequest, NextResponse } from "next/server";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const HTML_ENTITIES: Record<string, string> = {
  amp:"&",lt:"<",gt:">",nbsp:" ",quot:'"',apos:"'",
  eacute:"é",Eacute:"É",egrave:"è",Egrave:"È",ecirc:"ê",Ecirc:"Ê",euml:"ë",
  agrave:"à",Agrave:"À",acirc:"â",Acirc:"Â",auml:"ä",
  igrave:"ì",icirc:"î",Icirc:"Î",iuml:"ï",
  ograve:"ò",ocirc:"ô",Ocirc:"Ô",ouml:"ö",
  ugrave:"ù",Ugrave:"Ù",ucirc:"û",Ucirc:"Û",uuml:"ü",
  ccedil:"ç",Ccedil:"Ç",ntilde:"ñ",
  oelig:"œ",OElig:"Œ",aelig:"æ",AElig:"Æ",
  laquo:"«",raquo:"»",hellip:"…",mdash:"—",ndash:"–",
  rsquo:"'",lsquo:"'",rdquo:"”",ldquo:"“",
  euro:"€",copy:"©",reg:"®",trade:"™",
};

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&([a-zA-Z]+);/g, (_, name) => HTML_ENTITIES[name] ?? "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, " ").trim();
}

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Résolution d'URL produit via le sitemap Esprit Jeu ────────────────────────
// Les fiches produit ont un préfixe de catégorie variable
// (ex. /jeux-de-strategie/le-renard-des-bois-duo.html), impossible à deviner à
// partir du seul nom. On s'appuie donc sur le sitemap produit officiel, qui liste
// toutes les URLs canoniques, pour retrouver la bonne fiche de façon fiable.

const SITEMAP_URL = "https://www.espritjeu.com/siteMapsFRProduit1.xml";
const SITEMAP_TTL = 6 * 60 * 60 * 1000; // 6 h

type SitemapEntry = { slug: string; tokens: string[] };
type Sitemap = { entries: (SitemapEntry & { url: string; weight: number })[]; idf: (t: string) => number };
let sitemapCache: { at: number; sitemap: Sitemap } | null = null;

/** Découpe un slug en tokens significatifs (≥ 2 caractères, sans mots vides) */
const STOPWORDS = new Set(["le", "la", "les", "un", "une", "des", "de", "du", "et", "a", "the", "au", "aux", "en", "pour", "avec", "sur", "dans", "ou"]);
// Mots génériques de catégorie/format : jamais distinctifs d'un titre. Ils sont
// exclus de la comparaison (sinon « Azul - Jeu de société » matcherait n'importe
// quelle fiche « …-jeu-de-societe ») et servent à nettoyer un suffixe descriptif
// du type « Mistigri - Jeu de cartes ».
const GENERIC = new Set(["jeu", "jeux", "de", "du", "des", "la", "le", "les", "un", "une", "d", "cartes", "carte", "societe", "plateau", "ambiance", "ambiances", "familial", "enfant", "enfants", "strategie", "cooperatif"]);
const IGNORE = new Set([...STOPWORDS, ...GENERIC]);

function slugTokens(slug: string): string[] {
  return slug.split("-").filter(t => t.length >= 2 && !IGNORE.has(t));
}

/** Retire un suffixe descriptif générique (« - Jeu de cartes », « : jeu d'ambiance »…) */
function stripDescriptor(nom: string): string {
  const parts = nom.split(/\s[-–—:]\s|\s?:\s/);
  if (parts.length < 2) return nom;
  while (parts.length > 1) {
    const words = parts[parts.length - 1].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) ?? [];
    if (words.length && words.every(w => GENERIC.has(w))) parts.pop();
    else break;
  }
  return parts.join(" - ").trim();
}

async function getSitemap(): Promise<Sitemap> {
  if (sitemapCache && Date.now() - sitemapCache.at < SITEMAP_TTL) {
    return sitemapCache.sitemap;
  }
  const resp = await fetch(SITEMAP_URL, {
    headers: HEADERS,
    // met en cache le sitemap au niveau de l'edge Cloudflare
    cf: { cacheTtl: SITEMAP_TTL / 1000, cacheEverything: true },
  } as RequestInit);
  if (!resp.ok) {
    if (sitemapCache) return sitemapCache.sitemap; // on garde l'ancien cache si dispo
    throw new Error(`Sitemap inaccessible (${resp.status})`);
  }
  const xml = await resp.text();
  const base: (SitemapEntry & { url: string })[] = [];
  const seen = new Set<string>();
  const df = new Map<string, number>();
  for (const m of xml.matchAll(/<loc>\s*(https:\/\/www\.espritjeu\.com\/[^<\s]+\.html)\s*<\/loc>/gi)) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    const slug = url.replace(/^.*\//, "").replace(/\.html$/i, "");
    const tokens = slugTokens(slug);
    base.push({ slug, tokens, url });
    for (const t of new Set(tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  // IDF : un mot rare (ex. « mistigri ») pèse bien plus qu'un mot courant (« jeu »)
  const N = base.length;
  const idf = (t: string) => Math.log((N + 1) / ((df.get(t) ?? 0) + 1));
  const entries = base.map(e => ({ ...e, weight: e.tokens.reduce((s, t) => s + idf(t), 0) }));
  const sitemap: Sitemap = { entries, idf };
  sitemapCache = { at: Date.now(), sitemap };
  return sitemap;
}

/**
 * Retrouve l'URL de la fiche produit correspondant le mieux au nom fourni.
 * Stratégie :
 *  1. correspondance exacte du slug ;
 *  2. sinon, fiche contenant TOUS les mots de la requête (la plus courte) ;
 *  3. sinon, meilleure couverture PONDÉRÉE (IDF) des mots, à condition que le mot
 *     le plus distinctif de la requête soit présent — pour éviter qu'un simple
 *     « jeu de cartes » commun ne fasse matcher n'importe quelle fiche.
 */
function resolveProductUrl(nom: string, sitemap: Sitemap): string | null {
  const { entries, idf } = sitemap;
  const targetSlug = nameToSlug(nom);
  if (!targetSlug) return null;

  // 1. slug exact
  const exact = entries.find(e => e.slug === targetSlug);
  if (exact) return exact.url;

  const target = slugTokens(targetSlug);
  if (!target.length) return null;
  const targetWeight = target.reduce((s, t) => s + idf(t), 0);
  const maxIdf = Math.max(...target.map(idf));

  let bestFull: (typeof entries)[number] | null = null;
  let bestPartial: (typeof entries)[number] | null = null;
  let bestPartialScore = 0;

  for (const e of entries) {
    if (!e.tokens.length) continue;
    const set = new Set(e.tokens);
    let matched = 0, matchedWeight = 0, maxMatchedIdf = 0;
    for (const t of target) {
      if (set.has(t)) { matched++; matchedWeight += idf(t); maxMatchedIdf = Math.max(maxMatchedIdf, idf(t)); }
    }
    if (matched === 0) continue;

    if (matched === target.length) {
      if (!bestFull || e.tokens.length < bestFull.tokens.length) bestFull = e;
    } else {
      const coverage = matchedWeight / targetWeight;
      // le mot le plus rare de la requête doit être présent
      const distinctiveMatched = maxMatchedIdf >= maxIdf * 0.999;
      if (coverage >= 0.6 && distinctiveMatched) {
        const precision = matchedWeight / e.weight;
        const combined = coverage * 0.7 + precision * 0.3;
        if (combined > bestPartialScore) { bestPartialScore = combined; bestPartial = e; }
      }
    }
  }

  if (bestFull) return bestFull.url;
  return bestPartial ? bestPartial.url : null;
}

/** Retourne le HTML à partir de la première occurrence du pattern, sur maxLen caractères */
function zoneFrom(html: string, pattern: RegExp, maxLen = 6000): string | null {
  const idx = html.search(pattern);
  if (idx < 0) return null;
  return html.slice(idx, idx + maxLen);
}

/** Extrait les textes des <p> dans une zone HTML */
function getParagraphs(zone: string): string[] {
  return [...zone.matchAll(/<p[^>]*>([\s\S]{20,}?)<\/p>/gi)]
    .map(m => stripHtml(m[1]))
    .filter(t => t.length > 20);
}

function extractCarac(html: string): { auteurs: string[]; illustrateurs: string[]; editeur: string | null } {
  const auteurs: string[] = [];
  const illustrateurs: string[] = [];
  let editeur: string | null = null;
  const zone = zoneFrom(html, /id="tableau_carac"/i, 5000);
  if (!zone) return { auteurs, illustrateurs, editeur };
  for (const li of zone.matchAll(/<li[^>]*class="row"[^>]*>([\s\S]{0,600}?)<\/li>/gi)) {
    const liHtml = li[1];
    const labelMatch = liHtml.match(/label_carac[^"]*"[^>]*>([\s\S]{0,80}?)<\/span>/i);
    if (!labelMatch) continue;
    const label = stripHtml(labelMatch[1]).toLowerCase();
    const names = [...liHtml.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)]
      .map(m => m[1].trim()).filter(Boolean);
    if (label.includes("auteur")) auteurs.push(...names);
    else if (label.includes("illustrateur")) illustrateurs.push(...names);
    else if (label.includes("diteur")) {
      if (names.length) {
        editeur = names[0];
      } else {
        const valSpan = liHtml.match(/label_valeur[^"]*"[^>]*>([\s\S]{0,300}?)<\/span>/i);
        if (valSpan) editeur = stripHtml(valSpan[1]).trim() || null;
      }
    }
  }
  return { auteurs, illustrateurs, editeur };
}

function extractTexts(html: string) {
  // --- Résumé court : ancré sur div.fa_description_boite_produit ---
  let resume: string | null = null;
  const boiteZone = zoneFrom(html, /class="fa_description_boite_produit"/i, 3000);
  if (boiteZone) {
    const paras = getParagraphs(boiteZone);
    if (paras.length) resume = paras.join(" ");
  }

  // --- Description longue : ancré sur div#div_description_longue ---
  let description: string | null = null;
  const descZone = zoneFrom(html, /id="div_description_longue"/i, 8000);
  if (descZone) {
    const emMatch = descZone.match(/<p[^>]*>\s*<em>([\s\S]{30,}?)<\/em>\s*<\/p>/i);
    if (emMatch) {
      const intro = stripHtml(emMatch[1]);
      const afterEm = descZone.slice(descZone.indexOf(emMatch[0]) + emMatch[0].length);
      const paras = getParagraphs(afterEm).slice(0, 6);
      description = intro + (paras.length ? "\n\n" + paras.join("\n\n") : "");
    } else {
      const paras = getParagraphs(descZone).slice(0, 6);
      if (paras.length) description = paras.join("\n\n");
    }
  }

  return { resume, description };
}

export async function GET(req: NextRequest) {
  const nom = req.nextUrl.searchParams.get("nom");
  const ean = req.nextUrl.searchParams.get("ean");
  if (!nom && !ean) {
    return NextResponse.json({ error: "Paramètre nom ou ean requis" }, { status: 400 });
  }

  try {
    // 1. Trouver la page produit via le sitemap officiel (URLs canoniques fiables)
    let productUrl: string | null = null;

    if (nom) {
      const sitemap = await getSitemap();
      productUrl = resolveProductUrl(nom, sitemap);

      // Repli : on retire un suffixe descriptif générique (« - Jeu de cartes »,
      // « : jeu d'ambiance »…) qui n'appartient pas au titre et fausse la recherche.
      if (!productUrl) {
        const stripped = stripDescriptor(nom);
        if (stripped && stripped !== nom) productUrl = resolveProductUrl(stripped, sitemap);
      }
    }

    if (!productUrl) {
      return NextResponse.json({ notFound: true, message: "Aucun jeu trouvé sur Esprit Jeu" });
    }

    // 2. Récupérer la page produit
    const productResp = await fetch(productUrl, { headers: HEADERS });
    if (!productResp.ok) {
      return NextResponse.json({ error: `Page produit inaccessible (${productResp.status})` }, { status: 502 });
    }
    const productHtml = await productResp.text();

    // 3. Extraire les textes et les auteurs
    const { resume, description } = extractTexts(productHtml);
    const { auteurs, illustrateurs, editeur } = extractCarac(productHtml);

    // Vignette + titre du produit (og:*) pour vérification visuelle côté client
    const ogImage = productHtml.match(/og:image['"]\s+content=['"]([^'"]+)['"]/i);
    const ogTitle = productHtml.match(/og:title['"]\s+content=['"]([^'"]+)['"]/i);
    const titre = ogTitle ? stripHtml(ogTitle[1]).replace(/\s*-\s*Espritjeu\.com\s*$/i, "").trim() : null;

    return NextResponse.json({
      url: productUrl,
      titre,
      image: ogImage ? ogImage[1] : null,
      resume: resume || null,
      description: description || null,
      auteurs,
      illustrateurs,
      editeur: editeur || null,
    });
  } catch (err) {
    console.error("[espritjeu]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
