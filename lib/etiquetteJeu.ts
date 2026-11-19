/**
 * Valeurs possibles des champs de l'étiquette d'un jeu (table `catalogue`),
 * partagées par la page Étiquettes et la saisie depuis l'atelier.
 */

export const MECANIQUES = [
  "(Dé)placement", "Adresse", "Bluff", "Casse-tête", "Collection",
  "Combinaison", "Communication", "Connaissances", "Conquête", "Course",
  "Deck building", "Déduction", "Dominos", "Draft", "Exploration",
  "Gestion", "Gestion de main", "Gestion de ressources", "Imagination",
  "Jeu de rôle", "Lancé de dés", "Livre-aventure", "Loto", "Manipulation", "Mémoire",
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

// ── Étiquettes MyLudo → champs de l'étiquette ──────────────────────────────────

const normal = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Libellés MyLudo écrits autrement que nos mécaniques. */
const SYNONYMES_MECANIQUES: Record<string, string> = {
  "deplacement": "(Dé)placement",
  "lancer de des": "Lancé de dés", "lance de des": "Lancé de dés", "des": "Lancé de dés",
  "pose d ouvriers": "Placement d'ouvriers", "placement d ouvrier": "Placement d'ouvriers",
  "pose de tuiles": "Placement de tuiles", "tuiles": "Placement de tuiles",
  "deckbuilding": "Deck building", "construction de deck": "Deck building",
  "roll and write": "Roll & write", "roll write": "Roll & write", "flip and write": "Roll & write",
  "levees": "Plis", "jeu de plis": "Plis",
  "memoire": "Mémoire", "rapidite": "Rapidité", "reflexe": "Rapidité", "reflexes": "Rapidité",
  "role cache": "Rôles cachés", "roles caches": "Rôles cachés", "identites cachees": "Rôles cachés",
  "connaissance": "Connaissances", "culture generale": "Connaissances", "quiz": "Connaissances",
  "jeu d adresse": "Adresse", "dexterite": "Adresse", "enquete": "Déduction",
  "gestion de ressource": "Gestion de ressources", "majorite": "Conquête", "controle de territoire": "Conquête",
  "stop ou encore": "Stop ou encore", "push your luck": "Stop ou encore",
  "pari": "Paris", "paris": "Paris", "jeu de role": "Jeu de rôle", "livre jeu": "Livre-aventure",
};

/**
 * Mécaniques de notre liste reconnues parmi les étiquettes MyLudo, dans l'ordre
 * où MyLudo les donne. La première est celle qu'on propose.
 */
export function mecaniquesDepuisEtiquettes(etiquettes: string[]): string[] {
  const parNom = new Map(MECANIQUES.map(m => [normal(m), m]));
  const trouvees: string[] = [];
  for (const e of etiquettes) {
    const n = normal(e);
    const m = parNom.get(n) ?? SYNONYMES_MECANIQUES[n];
    if (m && !trouvees.includes(m)) trouvees.push(m);
  }
  return trouvees;
}

/**
 * Type de partie déduit de MyLudo : coopératif si une étiquette le dit, solo
 * pour un jeu à 1 joueur, sinon versus. `sur` vaut faux pour le versus
 * déduit par défaut (rien ne dit coopératif).
 */
export function typePartieDepuisMyLudo(etiquettes: string[], joueursMax?: number | null): { valeur: "Coop" | "Versus" | "Solo"; sur: boolean } {
  const n = etiquettes.map(normal);
  if (n.some(e => e.includes("coop") || e.includes("collaboratif"))) return { valeur: "Coop", sur: true };
  if (joueursMax === 1 || n.some(e => e === "solo" || e === "jeu solo")) return { valeur: "Solo", sur: true };
  if (n.some(e => e.includes("competitif") || e.includes("affrontement") || e.includes("versus") || e.includes("par equipe"))) return { valeur: "Versus", sur: true };
  return { valeur: "Versus", sur: false };
}

/** Nombre de votes minimum pour se fier à la complexité MyLudo. */
export const VOTES_COMPLEXITE_MIN = 3;

/**
 * Étoiles depuis la complexité MyLudo (note sur 5) : jusqu'à 2 → ★, jusqu'à
 * 3,4 → ★★, au-delà → ★★★ (ramené au maximum de la couleur). Rien sans assez
 * de votes.
 */
export function etoilesDepuisComplexite(note: number | null | undefined, votes: number | null | undefined, couleur?: string | null): number | null {
  if (!note || !votes || votes < VOTES_COMPLEXITE_MIN) return null;
  const e = note <= 2 ? 1 : note <= 3.4 ? 2 : 3;
  return Math.min(e, etoilesMax(couleur));
}
