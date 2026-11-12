/**
 * Étapes de préparation d'un jeu dans l'atelier, dans l'ordre où elles se font.
 *
 * Une étape peut couvrir plusieurs colonnes de `jeux` (l'étape 1 réunit la
 * plastification et l'équipement code-barre + puce RFID, qui étaient deux étapes
 * séparées) : elle est faite quand toutes ses colonnes sont à 1, et la valider
 * les met toutes à 1.
 *
 * Les étapes se font dans l'ordre : un jeu se trouve à sa première étape non
 * faite. Une étape plus loin déjà cochée (faite en avance) reste acquise.
 *
 * L'étape 7 (nouveauté) ne concerne pas les doubles : ils sortent de l'atelier
 * après l'étape 6.
 */

export type EtapeAtelier = {
  /** Numéro affiché, de 1 à 7. */
  num: number;
  /** Clé de l'étape : sa première colonne. */
  id: string;
  /** Colonnes de `jeux` cochées par cette étape. */
  colonnes: string[];
  nom: string;
  /** Intitulé complet, ce que l'on fait concrètement. */
  detail: string;
  hex: string;
  /** Étape réservée aux nouveautés (pas aux doubles). */
  nouveauteSeulement?: boolean;
};

export const ETAPES_ATELIER: EtapeAtelier[] = [
  { num: 1, id: "etape_plastifier",   colonnes: ["etape_plastifier", "etape_equiper"], nom: "Plastification et équiper", detail: "Plastification, code-barre et puce RFID",            hex: "#a8e063" },
  { num: 2, id: "etape_encoder",      colonnes: ["etape_encoder"],      nom: "Encoder",                   detail: "Encodage de la puce",                                 hex: "#f87171" },
  { num: 3, id: "etape_verification", colonnes: ["etape_verification"], nom: "Vérification et contenu",   detail: "Vérification des pièces et création du contenu sur LudoTool", hex: "#2dd4bf" },
  { num: 4, id: "etape_contenu",      colonnes: ["etape_contenu"],      nom: "Contenu",                   detail: "Impression et collage du contenu",                    hex: "#60a5fa" },
  { num: 5, id: "etape_etiquette",    colonnes: ["etape_etiquette"],    nom: "Étiquettes",                detail: "Impression et collage des étiquettes",                hex: "#c084fc" },
  { num: 6, id: "etape_notice",       colonnes: ["etape_notice"],       nom: "Notice Syracuse et piège",  detail: "Notice Syracuse, création de l'exemplaire et piège sur l'exemplaire", hex: "#fb923c" },
  { num: 7, id: "etape_nouveaute",    colonnes: ["etape_nouveaute"],    nom: "Nouveauté",                 detail: "Collage de l'étiquette nouveauté et jeu sur place",   hex: "#facc15", nouveauteSeulement: true },
];

/** Toutes les colonnes d'étape de `jeux`. */
export const COLONNES_ETAPES = [...new Set(ETAPES_ATELIER.flatMap(e => e.colonnes))];

type JeuEtapes = { is_double?: unknown } & Record<string, unknown>;

/** L'étape s'applique-t-elle à ce jeu ? (la nouveauté ne concerne pas les doubles) */
export const etapeConcerne = (jeu: JeuEtapes, etape: EtapeAtelier) => !(etape.nouveauteSeulement && jeu.is_double);

export const etapeFaite = (jeu: JeuEtapes, etape: EtapeAtelier) => etape.colonnes.every(c => !!jeu[c]);

/** Les étapes qui concernent ce jeu, dans l'ordre. */
export const etapesDuJeu = (jeu: JeuEtapes) => ETAPES_ATELIER.filter(e => etapeConcerne(jeu, e));

/** Première étape non faite, ou null si le jeu a tout fait (il peut sortir de l'atelier). */
export const etapeCourante = (jeu: JeuEtapes): EtapeAtelier | null =>
  etapesDuJeu(jeu).find(e => !etapeFaite(jeu, e)) ?? null;

/** Étapes déjà faites au-delà de l'étape courante : faites en avance. */
export const etapesEnAvance = (jeu: JeuEtapes): EtapeAtelier[] => {
  const courante = etapeCourante(jeu);
  if (!courante) return [];
  return etapesDuJeu(jeu).filter(e => e.num > courante.num && etapeFaite(jeu, e));
};

export const jeuTermine = (jeu: JeuEtapes) => etapeCourante(jeu) === null;

/** Colonnes à envoyer pour cocher (ou décocher) une étape. */
export const colonnesEtape = (etape: EtapeAtelier, valeur: boolean) =>
  Object.fromEntries(etape.colonnes.map(c => [c, valeur ? 1 : 0]));

/** Toutes les étapes de préparation faites (sauf la nouveauté) : un jeu déjà prêt. */
export const ETAPES_FAITES_SAUF_NOUVEAUTE: Record<string, number> = {
  ...Object.fromEntries(COLONNES_ETAPES.map(c => [c, 1])),
  etape_nouveaute: 0,
};

/** Aucune étape faite : un jeu qui entre dans l'atelier. */
export const ETAPES_A_ZERO: Record<string, number> = Object.fromEntries(COLONNES_ETAPES.map(c => [c, 0]));

/** Statut d'un jeu une fois `maj` appliqué à ses colonnes d'étape. */
export const statutApres = (jeu: JeuEtapes, maj: Record<string, unknown> = {}) =>
  jeuTermine({ ...jeu, ...maj }) ? "En stock" : "En préparation";

/** Champs du catalogue qui forment l'étiquette d'un jeu (voir app/etiquettes). */
export const CHAMPS_ETIQUETTE = ["mecanique", "nb_de_joueurs", "coop_versus", "temps_de_jeu", "etoiles"] as const;

export const etiquetteComplete = (cat: Record<string, unknown> | null | undefined) =>
  !!cat && CHAMPS_ETIQUETTE.every(c => cat[c] !== null && cat[c] !== undefined && String(cat[c]).trim() !== "");
