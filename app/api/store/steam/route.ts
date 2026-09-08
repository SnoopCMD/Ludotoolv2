import { NextResponse } from "next/server";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type FicheSteam = {
  nom_recherche: string;
  appid: number | null;
  titre: string | null;
  image_url: string | null;
  /** Prix courant en euros, promotion déduite */
  prix: number | null;
  /** Prix avant promotion, uniquement si une remise est en cours */
  prix_initial: number | null;
  remise: number | null;
  /** Page boutique, ou recherche Steam si le jeu n'a pas été identifié */
  url: string;
};

const urlRecherche = (nom: string) =>
  `https://store.steampowered.com/search/?term=${encodeURIComponent(nom)}`;

/**
 * Cherche un jeu sur la boutique Steam.
 * L'API storesearch est publique et renvoie déjà le prix promo appliqué :
 * inutile d'appeler appdetails pour ce qu'on affiche ici.
 */
async function chercherSteam(nom: string): Promise<FicheSteam> {
  const vide: FicheSteam = {
    nom_recherche: nom, appid: null, titre: null, image_url: null,
    prix: null, prix_initial: null, remise: null, url: urlRecherche(nom),
  };

  const url = `https://store.steampowered.com/api/storesearch/?${new URLSearchParams({
    term: nom, l: "french", cc: "FR",
  })}`;

  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return vide;
    const data = await res.json() as { items?: Array<Record<string, any>> };
    const item = (data.items ?? [])[0];
    if (!item?.id) return vide;

    // price_overview : montants en centimes, remise en pourcentage
    const p = item.price as { final?: number; initial?: number; discount_percent?: number } | undefined;
    const final = typeof p?.final === "number" ? p.final / 100 : null;
    const initial = typeof p?.initial === "number" ? p.initial / 100 : null;
    const remise = typeof p?.discount_percent === "number" && p.discount_percent > 0 ? p.discount_percent : null;

    return {
      nom_recherche: nom,
      appid: Number(item.id),
      titre: item.name ?? null,
      image_url: item.tiny_image ?? null,
      prix: final,
      prix_initial: remise ? initial : null,
      remise,
      url: `https://store.steampowered.com/app/${item.id}/`,
    };
  } catch {
    return vide;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const noms = (searchParams.get("noms") ?? "")
    .split("|")
    .map(n => n.trim())
    .filter(Boolean)
    .slice(0, 30);

  if (noms.length === 0) {
    return NextResponse.json({ error: "Paramètre 'noms' requis" }, { status: 400 });
  }

  const fiches = await Promise.all(noms.map(chercherSteam));
  return NextResponse.json({ fiches });
}
