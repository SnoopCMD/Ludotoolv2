// Couleur de pastille des jeux (catalogue.couleur), pour teinter les cartes
// qui parlent d'un jeu précis : on le retrouve d'un coup d'œil, comme en rayon.
//
// Les tables qui citent un jeu ne le référencent pas toutes de la même façon :
// `reparations.ean` porte un EAN ou un code Syracuse selon la façon dont le jeu
// a été saisi, et `pieces_detachees` n'a que le nom. On résout donc dans cet
// ordre : EAN, code Syracuse, puis nom normalisé.

export const COULEURS_JEU: Record<string, string> = {
  vert: "#a8e063", rose: "#f472b6", bleu: "#60a5fa", rouge: "#f87171", jaune: "#fb923c",
};

export const normaliserNom = (s: string) =>
  (s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export type ResolveurCouleur = (ref: { ean?: string | null; nom?: string | null }) => string | null;

const toArr = (d: any) => (Array.isArray(d) ? d : []);

/** Charge le parc une fois et renvoie une fonction de résolution. Ne lève
 *  jamais : en cas d'échec réseau, tout reste sans couleur. */
export async function chargerResolveurCouleur(): Promise<ResolveurCouleur> {
  const [jeux, catalogue] = await Promise.all([
    fetch("/api/jeux?fields=nom,ean,code_syracuse").then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
    fetch("/api/catalogue?fields=ean,couleur").then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
  ]);

  const parEan: Record<string, string> = {};
  for (const c of catalogue) if (c.ean && COULEURS_JEU[c.couleur]) parEan[c.ean] = COULEURS_JEU[c.couleur];

  const parSyracuse: Record<string, string> = {};
  const parNom: Record<string, string> = {};
  for (const j of jeux) {
    const couleur = parEan[j.ean];
    if (!couleur) continue;
    if (j.code_syracuse) parSyracuse[String(j.code_syracuse)] = couleur;
    const n = normaliserNom(j.nom);
    if (n && !parNom[n]) parNom[n] = couleur;
  }

  return ({ ean, nom }) => {
    if (ean) {
      const code = String(ean).trim();
      if (parEan[code]) return parEan[code];
      if (parSyracuse[code]) return parSyracuse[code];
      // Les codes Syracuse courts sont parfois saisis sans leurs zéros de tête.
      const complete = /^\d+$/.test(code) && code.length < 8 ? code.padStart(8, "0") : null;
      if (complete && parSyracuse[complete]) return parSyracuse[complete];
    }
    if (nom) return parNom[normaliserNom(nom)] ?? null;
    return null;
  };
}
