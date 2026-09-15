import { NextRequest, NextResponse } from "next/server";

// ─── MyLudo — source de complément (joueurs, âge, durée, visuel) ───────────────
// MyLudo est une SPA : ses données passent par des endpoints internes protégés par
// un jeton CSRF + un cookie de session. On amorce donc une session en chargeant la
// page d'accueil (qui pose le cookie MYLUDO_SESSID et expose le meta csrf-token),
// puis on interroge la recherche et la fiche jeu.

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

const BASE = "https://www.myludo.fr";
const SESSION_TTL = 20 * 60 * 1000; // 20 min

type Session = { cookie: string; csrf: string };
let sessionCache: { at: number; session: Session } | null = null;

async function getSession(): Promise<Session> {
  if (sessionCache && Date.now() - sessionCache.at < SESSION_TTL) {
    return sessionCache.session;
  }
  const resp = await fetch(`${BASE}/`, { headers: HEADERS });
  if (!resp.ok) throw new Error(`MyLudo inaccessible (${resp.status})`);
  const html = await resp.text();

  const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/i);
  if (!csrfMatch) throw new Error("Jeton CSRF MyLudo introuvable");
  const csrf = csrfMatch[1];

  // Concatène tous les cookies posés (MYLUDO_SESSID en particulier)
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const raw = setCookies.length
    ? setCookies
    : (resp.headers.get("set-cookie") ? [resp.headers.get("set-cookie")!] : []);
  const cookie = raw.map(c => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("Cookie de session MyLudo absent");

  const session = { cookie, csrf };
  sessionCache = { at: Date.now(), session };
  return session;
}

function apiHeaders(s: Session): HeadersInit {
  return {
    ...HEADERS,
    "X-Csrf-Token": s.csrf,
    "X-Requested-With": "XMLHttpRequest",
    "Referer": `${BASE}/`,
    "Cookie": s.cookie,
  };
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

/** Mots significatifs (≥ 3 caractères) d'un nom, sans accents ni ponctuation */
const words = (s: string) =>
  (s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? []);

/** Vrai si deux titres partagent au moins un mot significatif */
const titlesRelated = (a: string, b: string) => {
  const nb = norm(b);
  return words(a).some(w => nb.includes(w));
};

type MlGame = {
  id: string; code: string; title: string; subtitle?: string;
  edition?: number; image?: Record<string, string>;
  time_min?: string; time_max?: string;
};

/** Choisit le meilleur résultat en comparant le titre normalisé au nom demandé */
function pickBest(list: MlGame[], nom: string): MlGame | null {
  if (!list.length) return null;
  const target = norm(nom);
  let best: MlGame | null = null;
  let bestScore = -1;
  list.forEach((g, i) => {
    const t = norm(g.title);
    // Score de correspondance du titre ; à défaut on retombe sur l'ordre de
    // pertinence renvoyé par MyLudo (premiers résultats = plus pertinents).
    let score: number;
    if (t === target) score = 100;
    else if (target.includes(t) || t.includes(target)) score = 70;
    else score = 10 - Math.min(i, 9);
    // À correspondance égale, on privilégie l'édition la plus récente.
    const tie = g.edition ?? 0;
    if (score > bestScore || (score === bestScore && best && tie > (best.edition ?? 0))) {
      bestScore = score;
      best = g;
    }
  });
  return best;
}

export async function GET(req: NextRequest) {
  const nom = req.nextUrl.searchParams.get("nom");
  const ean = req.nextUrl.searchParams.get("ean");
  if (!nom && !ean) {
    return NextResponse.json({ error: "Paramètre nom ou ean requis" }, { status: 400 });
  }

  try {
    const session = await getSession();

    // 1. Trouver l'id du jeu — d'abord par code-barres (EAN), puis par le nom
    let game: MlGame | null = null;

    if (ean) {
      const bcResp = await fetch(`${BASE}/views/search/datas.php`, {
        method: "POST",
        headers: { ...apiHeaders(session), "Content-Type": "application/x-www-form-urlencoded" },
        body: `type=barcode&code=${encodeURIComponent(ean)}`,
      });
      if (bcResp.ok) {
        const bc = await bcResp.json().catch(() => null) as any;
        const first = bc?.list?.[0] as MlGame | undefined;
        // Le endpoint code-barres peut renvoyer un résultat approximatif : on ne
        // l'accepte que s'il n'y a pas de nom à confronter, ou si son titre partage
        // au moins un mot significatif avec le nom demandé.
        if (first?.id && (!nom || titlesRelated(nom, first.title))) game = first;
      }
    }

    if (!game && nom) {
      const url = `${BASE}/views/search/datas.php?type=search&tab=games&page=1&words=${encodeURIComponent(nom)}`;
      const sResp = await fetch(url, { headers: apiHeaders(session) });
      if (sResp.ok) {
        const data = await sResp.json().catch(() => null) as any;
        if (Array.isArray(data?.list)) game = pickBest(data.list as MlGame[], nom);
      }
    }

    if (!game) {
      return NextResponse.json({ notFound: true, message: "Aucun jeu trouvé sur MyLudo" });
    }

    // 2. Récupérer la fiche détaillée (joueurs, âge, durée, note)
    const dResp = await fetch(
      `${BASE}/views/game/datas.php?type=game&id=${encodeURIComponent(game.id)}`,
      { headers: apiHeaders(session) },
    );
    const detail = dResp.ok ? await dResp.json().catch(() => null) as any : null;
    const d = detail ?? game;

    const image =
      d.image?.jpg || d.image?.S300 || d.image?.S160 || d.image?.S80 || game.image?.S300 || null;

    // Chaînes prêtes à l'emploi pour les champs du catalogue
    const pMin = d.players_min, pMax = d.players_max;
    const nbJoueurs = pMin
      ? (pMax && pMax !== pMin ? `${pMin} à ${pMax} joueurs` : `${pMin} joueur${pMin > 1 ? "s" : ""}`)
      : null;

    const tMin = d.time_min ?? game.time_min, tMax = d.time_max ?? game.time_max, dur = d.duration;
    let temps: string | null = null;
    if (tMin && tMax && tMin !== tMax) temps = `${tMin} à ${tMax} min`;
    else if (tMin) temps = `${tMin} min`;
    else if (dur) temps = `${dur} min`;

    return NextResponse.json({
      url: `${BASE}/#!/game/${game.code}-${game.id}`,
      id: game.id,
      title: d.title ?? game.title,
      edition: d.edition ?? game.edition ?? null,
      image,
      age: d.age ?? null,
      age_min: d.age_min ?? null,
      players: d.players ?? null,
      players_min: pMin ?? null,
      players_max: pMax ?? null,
      duration: dur ?? null,
      note: d.rating?.game?.note ?? null,
      nb_de_joueurs: nbJoueurs,
      temps_de_jeu: temps,
    });
  } catch (err) {
    console.error("[myludo]", err);
    return NextResponse.json({ error: "Erreur serveur MyLudo" }, { status: 500 });
  }
}
