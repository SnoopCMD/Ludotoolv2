import { NextRequest, NextResponse } from "next/server";
import { getDB } from "../../../../lib/db";
import { chercherTraderGamesParEan, titreSansPlateforme } from "../../../../lib/tradergames";
import { consoleDepuisPlateforme } from "../../../../lib/consolesJv";

// Préfixes EAN13 des principaux éditeurs de jeux vidéo
// Permet de détecter la console sans API externe
const EAN_PREFIXES: { prefix: string; console: string }[] = [
  // Sony — PS4 / PS5 (mêmes prefixes, on met PS5 par défaut car c'est la cible)
  { prefix: "3665361",  console: "PS5" }, // Sony Interactive Entertainment Europe (Paris)
  { prefix: "3700664",  console: "PS5" }, // Sony Interactive Entertainment (FR)
  { prefix: "711719",   console: "PS5" }, // Sony Interactive Entertainment America
  { prefix: "5021290",  console: "PS5" }, // Sony Computer Entertainment Europe
  { prefix: "5055060",  console: "PS5" }, // Sony (UK)
  { prefix: "5056280",  console: "PS5" }, // Sony PlayStation (EU récent)
  // Nintendo Switch
  { prefix: "0045496",  console: "Switch" },
  { prefix: "045496",   console: "Switch" },
  { prefix: "4902370",  console: "Switch" }, // Nintendo Japan (import)
  { prefix: "9120022",  console: "Switch" }, // Nintendo Switch (EU)
  // PC (éditeurs physiques principaux)
  { prefix: "3307216",  console: "PC" }, // Ubisoft FR
  { prefix: "3701529",  console: "PC" }, // Ubisoft (autre)
  { prefix: "5030917",  console: "PC" }, // Namco Bandai EU
  { prefix: "5055277",  console: "PC" }, // Koch Media / Deep Silver
  { prefix: "4020628",  console: "PC" }, // Koch Media (FR)
  { prefix: "5051892",  console: "PC" }, // THQ Nordic
  { prefix: "9006113",  console: "PC" }, // THQ Nordic (EU)
];

function detectConsole(ean: string): string | null {
  const cleaned = ean.replace(/\D/g, "");
  for (const { prefix, console } of EAN_PREFIXES) {
    if (cleaned.startsWith(prefix)) return console;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const ean = req.nextUrl.searchParams.get("ean")?.replace(/\D/g, "");
  if (!ean) return NextResponse.json({ error: "EAN manquant" }, { status: 400 });

  // Déjà catalogué (autre exemplaire) : on connaît le titre exact.
  let connu: { titre: string; console: string } | null = null;
  try {
    const db = await getDB();
    connu = await db.prepare("SELECT titre, console FROM jv_jeux WHERE ean = ? LIMIT 1")
      .bind(ean).first<{ titre: string; console: string }>();
  } catch {}

  if (connu) return NextResponse.json({ ean, console: connu.console, titre: connu.titre, source: "catalogue" });

  // Sinon Trader Games, qui référence ses jeux par EAN.
  const tg = await chercherTraderGamesParEan(ean);
  if (tg.jeu) {
    return NextResponse.json({
      ean,
      console: consoleDepuisPlateforme(tg.jeu.plateforme) ?? detectConsole(ean),
      titre: titreSansPlateforme(tg.jeu.nom) || tg.jeu.nom,
      image_url: tg.jeu.image_url,
      source: "tradergames",
    });
  }

  // À défaut, le préfixe EAN donne au moins la console — suffisant pour
  // pré-filtrer la recherche par titre.
  return NextResponse.json({ ean, console: detectConsole(ean), titre: null, source: null, bloque: tg.bloque });
}
