import { NextResponse } from "next/server";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10000;

// ─── helpers ──────────────────────────────────────────────────────────────────

function normaliser(texte: string): string {
  return texte
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugifier(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Même logique que formaterTexte() dans app/contenu/page.tsx (sans sansRegle) */
function formaterContenu(texte: string): string {
  if (!texte || texte.trim() === "") return "- 1 règle du jeu";

  let lignes = texte
    .split("\n")
    .map((l) => {
      if (l.trim() === "") return "";
      if (l.trim().endsWith(":")) return l.trim();          // en-têtes de section
      if (l.match(/^\s+[-*•]/)) return l;                  // sous-listes indentées
      if (l.trim().match(/^[-*•]\s*/))
        return "- " + l.trim().replace(/^[-*•]\s*/, "");   // normalise le tiret
      return "- " + l.trim();
    })
    .filter((l) => l !== "");

  const texteNorm = lignes
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!texteNorm.match(/(regle|livret|notice)/)) {
    lignes.push("- 1 règle du jeu");
  }

  return lignes.join("\n");
}

async function fetchAvecTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const reponse = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!reponse.ok) return null;
    const ct = reponse.headers.get("content-type") ?? "";
    const charsetMatch = ct.match(/charset=([\w-]+)/i);
    const charset = charsetMatch?.[1]?.toLowerCase() ?? "utf-8";
    const buf = await reponse.arrayBuffer();
    const html = new TextDecoder(charset).decode(buf);
    return { html, finalUrl: reponse.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtmlEntities(texte: string): string {
  return texte
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

// ─── types ────────────────────────────────────────────────────────────────────

type Candidat = { titre: string; url: string; image?: string };

type MeilleurMatch = {
  titre: string;
  auteurs: string;
  editeur: string;
  description: string;
  contenu: string;
  nb_de_joueurs: string;
  temps_de_jeu: string;
  age: string;
  image_url: string;
  url_source: string;
  mecaniques: string[];
  coop_versus: string;
};

// ─── parseurs spécifiques Esprit Jeu ─────────────────────────────────────────

function extraireResultatsRecherche(html: string): Candidat[] {
  const $ = cheerio.load(html);
  const candidats: Candidat[] = [];

  const sels = [
    "article.product-miniature",
    ".product-miniature",
    ".js-product-miniature",
    ".product_list .product",
    ".products-grid .item",
    ".product-container",
  ];

  for (const sel of sels) {
    if ($(sel).length === 0) continue;
    $(sel).each((i, el) => {
      if (i >= 5) return false;
      const $el = $(el);
      const titreBrut =
        $el.find(".product-title a, h2 a, h3 a, .product_name a, a.product-title").first().text().trim() ||
        $el.find(".product-title, h2, h3").first().text().trim();
      const lien =
        $el.find(".product-title a, h2 a, h3 a, a.product-title").first().attr("href") ||
        $el.find("a").first().attr("href") ||
        "";
      const src =
        $el.find("img.lazyload").first().attr("data-src") ||
        $el.find("img").first().attr("data-src") ||
        $el.find("img").first().attr("src") ||
        "";
      if (titreBrut && lien) {
        const url = lien.startsWith("http") ? lien : `https://www.espritjeu.com${lien}`;
        const image = src
          ? src.startsWith("http")
            ? src
            : `https://www.espritjeu.com${src}`
          : undefined;
        candidats.push({ titre: titreBrut, url, image });
      }
    });
    if (candidats.length > 0) break;
  }

  return candidats;
}

function extraireCaracteristique($: cheerio.CheerioAPI, motsCles: string[]): string {
  let valeur = "";

  $(".label_carac").each((_, el) => {
    const label = $(el)
      .text()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (motsCles.some((m) => label.includes(m))) {
      valeur = $(el).siblings(".label_valeur").text().trim();
      return false;
    }
  });
  if (valeur) return valeur;

  $("table tr").each((_, el) => {
    const cells = $(el).find("td, th");
    if (cells.length >= 2) {
      const label = cells
        .first()
        .text()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (motsCles.some((m) => label.includes(m))) {
        valeur = cells.eq(1).text().trim();
        return false;
      }
    }
  });

  return valeur;
}

function extraireFicheProduitEJ(html: string, urlSource: string): Partial<MeilleurMatch> {
  const $ = cheerio.load(html);

  const titre = $("h1.fa_designation, h1").first().text().trim();
  const auteurs = extraireCaracteristique($, ["auteur", "designer", "createur"]);
  const editeur = extraireCaracteristique($, ["editeur", "publisher"]);

  const nb_de_joueurs = $("li.fa_joueurs").text().replace(/\s+/g, " ").trim() ||
    extraireCaracteristique($, ["joueur", "nb joueur"]);
  const temps_de_jeu = $("li.fa_duree").text().replace(/\s+/g, " ").trim() ||
    extraireCaracteristique($, ["duree", "temps"]);
  const age = $("li.fa_age").text().replace(/\s+/g, " ").trim() ||
    extraireCaracteristique($, ["age", "ans"]);

  const description = $(".fa_description_boite_produit").text().replace(/\s+/g, " ").trim() ||
    $(".fa_description").text().replace(/\s+/g, " ").trim();

  let contenuBrut = "";
  $("h2, h3, h4, strong, b").each((_, el) => {
    const txt = $(el)
      .text()
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (txt.match(/\b(contenu|materiel|composant|dans la boite|contenu de la boite)\b/)) {
      const $suivant = $(el).next();
      if ($suivant.is("ul, ol")) {
        contenuBrut = $suivant.find("li").map((_, li) => $(li).text().trim()).get().join("\n");
      } else if ($suivant.is("p, div")) {
        contenuBrut = $suivant.text().trim();
      }
      return false;
    }
  });

  if (!contenuBrut) {
    $(".fa_contenu p, .fa_onglet p, .onglet_contenu p").each((_, el) => {
      const txt = $(el).text();
      if (txt.includes("-") && txt.length > 30) {
        contenuBrut = txt.trim();
        return false;
      }
    });
  }

  let image_url = "";
  const imgSelectors = [
    ".fa_bloc-image-principale a img",
    ".fa_bloc-image-principale img",
    ".fa_image_principale img",
    "meta[property='og:image']",
  ];
  for (const sel of imgSelectors) {
    if (sel.startsWith("meta")) {
      const content = $(sel).attr("content") || "";
      if (content) { image_url = content; break; }
    } else {
      const el = $(sel).first();
      const src = el.attr("src") || el.attr("data-src") || "";
      if (src) {
        image_url = src.startsWith("http") ? src : `https://www.espritjeu.com${src}`;
        break;
      }
    }
  }

  return {
    titre: titre || "",
    auteurs,
    editeur,
    description,
    contenu: formaterContenu(contenuBrut),
    nb_de_joueurs,
    temps_de_jeu,
    age,
    image_url,
    url_source: urlSource,
    mecaniques: [],
    coop_versus: "",
  };
}

// ─── Esprit Jeu : recherche complète ─────────────────────────────────────────

async function fetchEspritJeu(nom: string): Promise<{ candidats: Candidat[]; fiche: Partial<MeilleurMatch> | null }> {
  const candidats: Candidat[] = [];

  // 1. Accès direct via slug
  const slug = slugifier(nom);
  const urlDirecte = `https://www.espritjeu.com/${slug}.html`;
  const direct = await fetchHtml(urlDirecte);
  if (direct) {
    const $ = cheerio.load(direct.html);
    const titre = $("h1").first().text().trim();
    if (titre) {
      const fiche = extraireFicheProduitEJ(direct.html, direct.finalUrl);
      candidats.push({ titre: fiche.titre || nom, url: direct.finalUrl });
      return { candidats, fiche };
    }
  }

  // 2. Fallback : autocomplete AJAX
  try {
    const urlAuto = `https://www.espritjeu.com/ajax/recherche_autocomplete.php?term=${encodeURIComponent(nom)}`;
    const reponse = await fetchAvecTimeout(urlAuto, {
      headers: {
        "User-Agent": USER_AGENT,
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (reponse.ok) {
      const data = await reponse.json() as { result?: { label: string; lien: string; image?: string }[] };
      for (const item of data.result ?? []) {
        if (!item.lien) continue;
        const url = item.lien.startsWith("http") ? item.lien : `https://www.espritjeu.com${item.lien}`;
        candidats.push({ titre: item.label, url, image: item.image });
      }
    }
  } catch {
    // ignore
  }

  if (candidats.length === 0) return { candidats, fiche: null };

  // Choisir le meilleur candidat
  const nomNorm = normaliser(nom);
  let meilleurIdx = 0;
  let meilleurScore = -1;
  for (let i = 0; i < candidats.length; i++) {
    const titreNorm = normaliser(candidats[i].titre);
    if (titreNorm === nomNorm) { meilleurIdx = i; break; }
    const score = titreNorm.includes(nomNorm) ? 10
      : nomNorm.split(" ").filter((w) => w.length > 2 && titreNorm.includes(w)).length;
    if (score > meilleurScore) { meilleurScore = score; meilleurIdx = i; }
  }

  const urlProduit = candidats[meilleurIdx].url;
  const ficheResult = await fetchHtml(urlProduit);
  if (!ficheResult) return { candidats, fiche: null };

  const fiche = extraireFicheProduitEJ(ficheResult.html, ficheResult.finalUrl);
  return { candidats, fiche };
}

// ─── BGG ──────────────────────────────────────────────────────────────────────

async function trouverIdBGG(nom: string): Promise<number | null> {
  const query = `site:boardgamegeek.com/boardgame ${nom}`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const result = await fetchHtml(url);
  if (!result) return null;
  const match = result.html.match(/boardgamegeek\.com\/boardgame\/(\d+)\//);
  if (!match) return null;
  return parseInt(match[1], 10);
}

async function fetchBGG(nom: string): Promise<Partial<MeilleurMatch> & { url_source: string } | null> {
  const id = await trouverIdBGG(nom);
  if (!id) return null;

  const url = `https://api.geekdo.com/api/geekitems?objecttype=thing&subtype=boardgame&objectid=${id}&nosession=1`;
  let reponse: Response;
  try {
    reponse = await fetchAvecTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
        "Origin": "https://boardgamegeek.com",
        "Referer": "https://boardgamegeek.com/",
      },
    });
  } catch {
    return null;
  }

  if (!reponse.ok) return null;
  const data = await reponse.json() as { item?: Record<string, unknown> };
  const item = data.item;
  if (!item) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const links = (item.links || {}) as Record<string, any[]>;

  const mecaniques: string[] = (links.boardgamemechanic || []).map((m) => m.name as string);
  const designers = (links.boardgamedesigner || []).map((d) => d.name as string).join(", ");
  const publishers: string[] = (links.boardgamepublisher || []).map((p) => p.name as string);

  // Format nb_de_joueurs
  const minJ = item.minplayers as number | undefined;
  const maxJ = item.maxplayers as number | undefined;
  let nb_de_joueurs = "";
  if (minJ && maxJ) {
    nb_de_joueurs = minJ === maxJ
      ? `${minJ} joueur${minJ > 1 ? "s" : ""}`
      : `${minJ}-${maxJ} joueurs`;
  }

  // Format temps_de_jeu
  const minT = item.minplaytime as number | undefined;
  const maxT = item.maxplaytime as number | undefined;
  let temps_de_jeu = "";
  if (minT && maxT) {
    temps_de_jeu = minT === maxT ? `${minT} min` : `${minT}-${maxT} min`;
  }

  // Format age
  const minage = item.minage as number | undefined;
  const age = minage ? `${minage}+` : "";

  // Coop detection via mechanics
  const mechLower = mecaniques.map((m) => m.toLowerCase());
  let coop_versus = "";
  if (mechLower.some((m) => m.includes("cooperative game"))) {
    coop_versus = "coop";
  } else if (mechLower.some((m) => m.includes("semi-cooperative"))) {
    coop_versus = "semi-coop";
  } else if (mechLower.some((m) => m.includes("team-based"))) {
    coop_versus = "equipe";
  }

  // Image
  const images = item.images as Record<string, string> | undefined;
  const image_url = images?.original || images?.square200 || "";

  // Description (strip HTML tags + decode entities)
  const rawDesc = (item.description as string) || "";
  const description = decodeHtmlEntities(rawDesc.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

  return {
    titre: (item.name as string) || "",
    auteurs: designers,
    editeur: publishers[0] || "",
    description,
    contenu: "",
    nb_de_joueurs,
    temps_de_jeu,
    age,
    image_url,
    url_source: `https://boardgamegeek.com/boardgame/${id}/`,
    mecaniques,
    coop_versus,
  };
}

// ─── fusion des sources ───────────────────────────────────────────────────────

function fusionner(
  ej: Partial<MeilleurMatch> | null,
  bgg: Partial<MeilleurMatch> | null,
  nomFallback: string,
): MeilleurMatch {
  const choisir = (a: string | undefined, b: string | undefined): string =>
    (a && a.trim()) ? a.trim() : (b && b.trim()) ? b.trim() : "";

  return {
    titre:         choisir(ej?.titre, bgg?.titre) || nomFallback,
    auteurs:       choisir(ej?.auteurs, bgg?.auteurs),
    editeur:       choisir(ej?.editeur, bgg?.editeur),
    description:   choisir(ej?.description, bgg?.description),
    contenu:       ej?.contenu || formaterContenu(""),
    nb_de_joueurs: choisir(ej?.nb_de_joueurs, bgg?.nb_de_joueurs),
    temps_de_jeu:  choisir(ej?.temps_de_jeu, bgg?.temps_de_jeu),
    age:           choisir(ej?.age, bgg?.age),
    // Image : EJ prioritaire sauf si vide
    image_url:     choisir(ej?.image_url, bgg?.image_url),
    url_source:    ej?.url_source || bgg?.url_source || "",
    // Mécaniques et coop : BGG prioritaire
    mecaniques:    bgg?.mecaniques?.length ? bgg.mecaniques : (ej?.mecaniques ?? []),
    coop_versus:   choisir(bgg?.coop_versus, ej?.coop_versus),
  };
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nom = searchParams.get("nom");

  if (!nom) {
    return NextResponse.json({ error: "Paramètre 'nom' requis" }, { status: 400 });
  }

  // Lancer les deux sources en parallèle
  const [ejResult, bggResult] = await Promise.allSettled([
    fetchEspritJeu(nom),
    fetchBGG(nom),
  ]);

  const ej = ejResult.status === "fulfilled" ? ejResult.value : { candidats: [], fiche: null };
  const bgg = bggResult.status === "fulfilled" ? bggResult.value : null;

  const meilleur_match = fusionner(ej.fiche, bgg, nom);

  return NextResponse.json({
    sources: {
      espritjeu: ej.fiche ? ej.fiche.url_source : null,
      bgg: bgg ? bgg.url_source : null,
    },
    resultats: ej.candidats,
    meilleur_match,
  });
}
