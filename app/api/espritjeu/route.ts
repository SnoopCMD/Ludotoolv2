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

function extractCarac(html: string): { auteurs: string[]; illustrateurs: string[] } {
  const auteurs: string[] = [];
  const illustrateurs: string[] = [];
  const zone = zoneFrom(html, /id="tableau_carac"/i, 5000);
  if (!zone) return { auteurs, illustrateurs };
  for (const li of zone.matchAll(/<li[^>]*class="row"[^>]*>([\s\S]{0,600}?)<\/li>/gi)) {
    const liHtml = li[1];
    const labelMatch = liHtml.match(/label_carac[^"]*"[^>]*>([\s\S]{0,80}?)<\/span>/i);
    if (!labelMatch) continue;
    const label = stripHtml(labelMatch[1]).toLowerCase();
    const names = [...liHtml.matchAll(/<a[^>]*>([^<]+)<\/a>/gi)]
      .map(m => m[1].trim()).filter(Boolean);
    if (label.includes("auteur")) auteurs.push(...names);
    else if (label.includes("illustrateur")) illustrateurs.push(...names);
  }
  return { auteurs, illustrateurs };
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
    // 1. Trouver la page produit
    let productUrl: string | null = null;

    // Essai 1 : slug direct depuis le nom complet
    if (nom) {
      const slug = nameToSlug(nom);
      const directUrl = `https://www.espritjeu.com/${slug}.html`;
      const headResp = await fetch(directUrl, { headers: HEADERS, method: "HEAD" });
      if (headResp.ok) productUrl = directUrl;
    }

    // Essai 2 : slug des 2-3 premiers mots significatifs (ignore articles/tirets)
    if (!productUrl && nom) {
      const words = nom.split(/[\s\-–—]+/).filter(w => w.length > 2).slice(0, 3);
      if (words.length >= 2) {
        const shortSlug = nameToSlug(words.join(" "));
        const shortUrl = `https://www.espritjeu.com/${shortSlug}.html`;
        const headResp = await fetch(shortUrl, { headers: HEADERS, method: "HEAD" });
        if (headResp.ok) productUrl = shortUrl;
      }
    }

    // Essai 3 : recherche par mots-clés (EAN prioritaire, sinon 2 premiers mots du nom)
    if (!productUrl) {
      const keywords = ean ?? (nom ? nom.split(/[\s\-–—]+/).filter(w => w.length > 2).slice(0, 2).join(" ") : "");
      if (keywords) {
        const searchUrl = `https://www.espritjeu.com/dhtml/resultat_recherche.php?keywords=${encodeURIComponent(keywords)}`;
        const searchResp = await fetch(searchUrl, { headers: HEADERS });
        if (searchResp.ok) {
          const searchHtml = await searchResp.text();
          const firstLink = searchHtml.match(/href="(https?:\/\/www\.espritjeu\.com\/[a-z0-9][a-z0-9-]*\.html)"/i);
          if (firstLink) productUrl = firstLink[1];
        }
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
    const { auteurs, illustrateurs } = extractCarac(productHtml);

    return NextResponse.json({
      url: productUrl,
      resume: resume || null,
      description: description || null,
      auteurs,
      illustrateurs,
    });
  } catch (err) {
    console.error("[espritjeu]", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
