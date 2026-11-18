/**
 * Ce que partagent les pages d'impression (étiquettes et contenu) : la recherche
 * (nom, EAN ou code Syracuse d'un exemplaire), la construction de l'autre
 * impression pour les mêmes jeux, et la validation de l'étape d'atelier qui
 * correspond à chaque impression.
 */
import { statutApres } from "./etapesAtelier";

export type TypeImpression = "etiquettes" | "contenu";

/** Une ligne du catalogue, telle que la renvoie GET /api/catalogue. */
export type LigneCatalogue = {
  ean: string; nom: string; couleur?: string | null; contenu?: string | null;
  mecanique?: string | null; nb_de_joueurs?: string | null; coop_versus?: string | null;
  temps_de_jeu?: string | null; etoiles?: number | string | null;
};

/** Un jeu choisi pour l'impression, avec sa quantité et sa couleur. */
export type JeuChoisi = { ean: string; nom: string; quantity: number; couleur: string };

export const COULEURS_IMPRESSION = ["vert", "rose", "bleu", "rouge", "jaune"] as const;
const vide = <T,>(): Record<string, T[]> => Object.fromEntries(COULEURS_IMPRESSION.map(c => [c, [] as T[]]));

// ── Recherche ──────────────────────────────────────────────────────────────────

/** Codes Syracuse des exemplaires, par EAN (un jeu peut en avoir plusieurs). */
export async function chargerCodesSyracuse(): Promise<Record<string, string[]>> {
  const lignes = await fetch("/api/jeux?fields=ean,code_syracuse&code_syracuse=notnull")
    .then(r => r.json() as Promise<unknown>).catch(() => []);
  const codes: Record<string, string[]> = {};
  if (Array.isArray(lignes)) {
    for (const l of lignes as { ean?: string; code_syracuse?: string }[]) {
      const code = String(l.code_syracuse ?? "").trim();
      if (!l.ean || !code) continue;
      (codes[l.ean] ??= []).push(code);
    }
  }
  return codes;
}

/**
 * Le jeu correspond-il à la recherche ? Par nom, par EAN, ou par le code
 * Syracuse d'un de ses exemplaires. Renvoie le code trouvé, pour l'afficher.
 */
export function correspondance(recherche: string, nom: string, ean: string, codes: string[] = []): { ok: boolean; code?: string } {
  const r = recherche.trim().toLowerCase();
  if (!r) return { ok: true };
  if (nom.toLowerCase().includes(r) || ean.toLowerCase().includes(r)) return { ok: true };
  const code = codes.find(c => c.toLowerCase().includes(r));
  return code ? { ok: true, code } : { ok: false };
}

// ── L'autre impression ─────────────────────────────────────────────────────────

const etiquetteComplete = (c: LigneCatalogue) =>
  !!(c.nom && c.mecanique && c.nb_de_joueurs && c.coop_versus && c.temps_de_jeu && c.etoiles !== null && c.etoiles !== undefined && c.etoiles !== "");

/**
 * Fiches de contenu des jeux choisis, depuis le catalogue. Un jeu sans contenu
 * renseigné n'est pas imprimé : il est compté dans `ignores`.
 */
export function contenusPour(choisis: JeuChoisi[], catalogue: Map<string, LigneCatalogue>) {
  const parCouleur = vide<{ id: string; ean: string; nom: string; elements: string; quantity: number }>();
  const ignores: string[] = [];
  for (const j of choisis) {
    const c = catalogue.get(j.ean);
    const elements = (c?.contenu ?? "").trim();
    if (!elements) { ignores.push(j.nom); continue; }
    parCouleur[j.couleur in parCouleur ? j.couleur : "vert"].push({ id: j.ean, ean: j.ean, nom: c?.nom || j.nom, elements, quantity: j.quantity });
  }
  return { parCouleur, ignores };
}

/**
 * Étiquettes des jeux choisis, depuis le catalogue. Une étiquette incomplète
 * n'est pas imprimée : elle est comptée dans `ignores`.
 */
export function etiquettesPour(choisis: JeuChoisi[], catalogue: Map<string, LigneCatalogue>) {
  const parCouleur = vide<{
    id: string; ean: string; quantity: number; nom: string; mecanique: string; nb_de_joueurs: string;
    coop_versus: string; temps_de_jeu: string; etoiles: number | "";
  }>();
  const ignores: string[] = [];
  for (const j of choisis) {
    const c = catalogue.get(j.ean);
    if (!c || !etiquetteComplete(c)) { ignores.push(j.nom); continue; }
    parCouleur[j.couleur in parCouleur ? j.couleur : "vert"].push({
      id: j.ean, ean: j.ean, quantity: j.quantity, nom: c.nom || j.nom,
      mecanique: c.mecanique ?? "", nb_de_joueurs: c.nb_de_joueurs ?? "", coop_versus: c.coop_versus ?? "",
      temps_de_jeu: c.temps_de_jeu ?? "", etoiles: Math.round(Number(c.etoiles)) || "",
    });
  }
  return { parCouleur, ignores };
}

// ── Étape d'atelier ────────────────────────────────────────────────────────────

/** Colonne de `jeux` que chaque impression valide : étape 4 (contenu) ou 5 (étiquettes). */
export const ETAPE_IMPRESSION: Record<TypeImpression, "etape_contenu" | "etape_etiquette"> = {
  contenu: "etape_contenu",
  etiquettes: "etape_etiquette",
};

/** Coche l'étape de cette impression pour les exemplaires en préparation des EAN imprimés. */
export async function validerEtapeImpression(type: TypeImpression, eans: string[]) {
  const uniques = [...new Set(eans.filter(Boolean))];
  if (!uniques.length) return;
  const jeux = await fetch(`/api/jeux?eans=${encodeURIComponent(uniques.join(","))}&statut=${encodeURIComponent("En préparation")}`)
    .then(r => r.json() as Promise<unknown>).catch(() => []);
  if (!Array.isArray(jeux)) return;
  const colonne = ETAPE_IMPRESSION[type];
  for (const jeu of jeux as Record<string, unknown>[]) {
    await fetch(`/api/jeux/${jeu.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [colonne]: 1, statut: statutApres(jeu, { [colonne]: 1 }) }),
    }).catch(() => {});
  }
}

// ── Préférence : imprimer aussi l'autre ────────────────────────────────────────

const CLE_DOUBLE = "ludotool.impression-double";

export function lireImpressionDouble(): boolean {
  try { return localStorage.getItem(CLE_DOUBLE) === "1"; } catch { return false; }
}

export function ecrireImpressionDouble(v: boolean) {
  try { localStorage.setItem(CLE_DOUBLE, v ? "1" : "0"); } catch { /* navigation privée : on oublie */ }
}
