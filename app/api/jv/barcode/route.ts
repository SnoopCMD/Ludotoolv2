import { NextRequest, NextResponse } from "next/server";

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
  const ean = req.nextUrl.searchParams.get("ean")?.trim();
  if (!ean) return NextResponse.json({ error: "EAN manquant" }, { status: 400 });

  const console_detected = detectConsole(ean);

  // Pas d'API externe fiable pour les EAN de JV côté serveur cloud.
  // On retourne la console détectée depuis le préfixe EAN — suffisant pour
  // pré-filtrer la recherche et accélérer le catalogage.
  return NextResponse.json({
    ean,
    console: console_detected,
    // notFound reste false : on a au moins le préfixe, l'EAN sera stocké
  });
}
