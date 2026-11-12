/**
 * Valeurs possibles des champs de l'étiquette d'un jeu (table `catalogue`),
 * partagées par la page Étiquettes et la saisie depuis l'atelier.
 */

export const MECANIQUES = [
  "(Dé)placement", "Adresse", "Bluff", "Casse-tête", "Collection",
  "Combinaison", "Communication", "Connaissances", "Conquête", "Course",
  "Deck building", "Déduction", "Dominos", "Draft", "Exploration",
  "Gestion", "Gestion de main", "Gestion de ressources", "Imagination",
  "Lancé de dés", "Livre-aventure", "Loto", "Manipulation", "Mémoire",
  "Multijeux", "Négociation", "Observation", "Paris", "Placement de cartes",
  "Placement de dés", "Placement de tuiles", "Placement d'ouvriers", "Plis",
  "Programmation", "Puzzle", "Rapidité", "Rôles cachés", "Roll & write",
  "Stop ou encore"
];

export const TEMPS_DE_JEU_OPTIONS = ["5-10", "10-20", "20-30", "30-45", "45-60", "1h30", "2h", "4h+"];

export const COOP_VERSUS_OPTIONS = [
  { id: "Coop", label: "🤝 Coop" },
  { id: "Versus", label: "⚔️ Versus" },
  { id: "Solo", label: "👍 Solo" },
] as const;

/** Nombre d'étoiles maximum selon la couleur du jeu : 3 pour vert et jaune, 2 sinon. */
export const etoilesMax = (couleur: string | null | undefined) => (couleur === "vert" || couleur === "jaune" ? 3 : 2);

/** Convertit une durée MyLudo (en minutes) vers l'un des paliers d'étiquette */
export function dureeVersPalier(minutes: number): string {
  if (minutes <= 10) return "5-10";
  if (minutes <= 20) return "10-20";
  if (minutes <= 30) return "20-30";
  if (minutes <= 45) return "30-45";
  if (minutes <= 60) return "45-60";
  if (minutes <= 90) return "1h30";
  if (minutes <= 120) return "2h";
  return "4h+";
}

/** Nombre de joueurs MyLudo au format de l'étiquette (« 2-5 », « 4 »). */
export const joueursDepuisMyLudo = (min?: number | null, max?: number | null) =>
  min ? (max && max !== min ? `${min}-${max}` : `${min}`) : "";

/**
 * Palier de temps de jeu depuis une fiche MyLudo. La durée y est un nombre (30)
 * ou une fourchette (« 30 — 60 ») : on prend le haut de la fourchette.
 */
export function tempsDepuisMyLudo(data: { duree_max?: unknown; duration?: unknown; time_max?: unknown } | null | undefined): string {
  if (!data) return "";
  const nombres = [data.duree_max, data.time_max, data.duration]
    .flatMap(v => String(v ?? "").match(/\d+/g) ?? []).map(Number).filter(n => n > 0);
  return nombres.length ? dureeVersPalier(Math.max(...nombres)) : "";
}

/** Recherche du jeu sur myludo.fr via un moteur de recherche, quand MyLudo ne l'a pas trouvé lui-même. */
export const urlRechercheMyLudo = (nom: string) =>
  `https://www.google.com/search?q=${encodeURIComponent(`site:myludo.fr ${nom}`)}`;
