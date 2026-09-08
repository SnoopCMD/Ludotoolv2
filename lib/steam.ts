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

export const urlRechercheSteam = (nom: string) =>
  `https://store.steampowered.com/search/?term=${encodeURIComponent(nom)}`;

/**
 * Cherche un jeu sur la boutique Steam.
 * L'API storesearch est publique et renvoie déjà le prix promo appliqué :
 * inutile d'appeler appdetails pour ce qu'on affiche ici.
 */
export async function chercherSteam(nom: string): Promise<FicheSteam> {
  const vide: FicheSteam = {
    nom_recherche: nom, appid: null, titre: null, image_url: null,
    prix: null, prix_initial: null, remise: null, url: urlRechercheSteam(nom),
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

    // price : montants en centimes, remise en pourcentage
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
