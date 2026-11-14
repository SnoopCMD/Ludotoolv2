// Outils texte pour la page « Pièces manquantes » : classement des pièces par
// type, recherche, correspondances entre jeux incomplets et pièces orphelines.
// Tout se compare mot à mot (sans accents, majuscules ni pluriel) pour éviter
// qu'un bout de mot fasse correspondre deux textes sans rapport
// (« regle DE jeu » classée en Dés, « chamPION » classé en Pions…).

/** Minuscules sans accents. */
export const sansAccents = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mots bruts (minuscules, accents conservés). */
const motsBruts = (s: string) =>
  s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Singulier approximatif : « plateaux » → « plateau », « billes » → « bille ». */
const singulier = (mot: string) => (mot.length > 3 ? mot.replace(/[sx]$/, "") : mot);

/** Mots normalisés (sans accents, au singulier). */
export const mots = (s: string) => motsBruts(s).map(m => singulier(sansAccents(m)));

/** Quantité ou numéro (« 2 », « 2x », « 10e »). */
const estNombre = (mot: string) => /^\d+[a-z]{0,2}$/.test(mot);

// ─── Types de pièces ─────────────────────────────────────────────────────────

export type TypePiece = { id: string; label: string; motsCles: string[] };

// Mots-clés au singulier et sans accents. « de » / « des » sont traités à part
// (voir typeDePiece) car ce sont aussi des mots courants (« règle de jeu »).
export const TYPES_PIECES: TypePiece[] = [
  { id: "carte",   label: "Cartes",   motsCles: ["carte"] },
  { id: "pion",    label: "Pions",    motsCles: ["pion", "meeple", "figurine", "personnage"] },
  { id: "jeton",   label: "Jetons",   motsCles: ["jeton", "piece", "ressource", "marqueur", "billet", "monnaie"] },
  { id: "de",      label: "Dés",      motsCles: [] },
  { id: "plateau", label: "Plateaux", motsCles: ["plateau", "support", "tuile", "planche"] },
  { id: "regle",   label: "Règles",   motsCles: ["regle", "livret", "notice"] },
  { id: "cube",    label: "Cubes",    motsCles: ["cube", "bloc"] },
  { id: "bille",   label: "Billes",   motsCles: ["bille", "boule"] },
];

export const AUTRES = "autres";

const typeDuMot = (brut: string, norm: string, motPrincipal: boolean): string | null => {
  // « dé » / « dés » écrits avec l'accent : toujours un dé.
  if (brut === "dé" || brut === "dés") return "de";
  // Sans accent, seulement en mot principal : « 2 des rouges », pas « règle de jeu ».
  if ((norm === "de" || norm === "des") && motPrincipal) return "de";
  // « pièce de puzzle » n'est pas un jeton.
  for (const t of TYPES_PIECES) if (t.motsCles.includes(norm)) return t.id;
  return null;
};

/**
 * Type d'une pièce d'après sa description : d'abord le mot principal (le
 * premier après la quantité), sinon le premier mot reconnu dans le texte.
 * Renvoie AUTRES si rien n'est reconnu.
 */
export const typeDePiece = (description: string): string => {
  const bruts = motsBruts(description).filter(m => !estNombre(m));
  if (bruts.length === 0) return AUTRES;
  const norms = bruts.map(m => singulier(sansAccents(m)));
  const puzzle = norms.includes("puzzle");
  const filtrer = (id: string | null) => (id === "jeton" && puzzle ? null : id);
  const principal = filtrer(typeDuMot(bruts[0], norms[0], true));
  if (principal) return principal;
  for (let i = 1; i < bruts.length; i++) {
    const id = filtrer(typeDuMot(bruts[i], norms[i], false));
    if (id) return id;
  }
  return AUTRES;
};

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Tous les mots de la recherche doivent apparaître (début de mot) dans un des champs. */
export const correspondRecherche = (recherche: string, ...champs: (string | null | undefined)[]) => {
  const termes = sansAccents(recherche).split(/\s+/).filter(Boolean);
  if (termes.length === 0) return true;
  const texte = " " + champs.filter(Boolean).map(c => sansAccents(String(c)).replace(/[^\p{L}\p{N}]+/gu, " ")).join(" ") + " ";
  return termes.every(t => {
    const terme = t.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    if (!terme) return true;
    return texte.includes(" " + terme) || /^\d+$/.test(terme) && texte.includes(terme);
  });
};

// ─── Correspondances ─────────────────────────────────────────────────────────

/** Vrai si la suite de mots `aiguille` apparaît telle quelle dans `botte`. */
const contientSuite = (botte: string[], aiguille: string[]) => {
  if (aiguille.length === 0 || aiguille.length > botte.length) return false;
  return (" " + botte.join(" ") + " ").includes(" " + aiguille.join(" ") + " ");
};

/** Le jeu supposé d'une pièce orpheline correspond-il au nom du jeu ? */
export const memeJeu = (nomJeu: string, nomSuppose: string | null | undefined) => {
  if (!nomSuppose || sansAccents(nomSuppose).replace(/[^a-z0-9]/g, "").length < 3) return false;
  const a = mots(nomJeu), b = mots(nomSuppose);
  return contientSuite(a, b) || contientSuite(b, a);
};

/** Quantité en tête de texte et reste de la description. */
export const extraireQte = (texte: string): { qte: number; nom: string } => {
  const m = texte.trim().match(/^(\d+)\s*(.*)/);
  return m ? { qte: parseInt(m[1]), nom: m[2].trim() } : { qte: 1, nom: texte.trim() };
};

/**
 * Une pièce orpheline peut-elle combler ce jeu incomplet ?
 * - jeu supposé renseigné : il doit correspondre au nom du jeu ;
 * - sinon : même quantité et même pièce (mots entiers).
 */
export const piecesCorrespondent = (
  jeu: { nom: string; element_manquant: string },
  orpheline: { description: string; nom_suppose: string | null },
) => {
  if (orpheline.nom_suppose && orpheline.nom_suppose.trim()) return memeJeu(jeu.nom, orpheline.nom_suppose);
  const m = extraireQte(jeu.element_manquant), t = extraireQte(orpheline.description);
  if (m.qte !== t.qte) return false;
  const mm = mots(m.nom), tm = mots(t.nom);
  return contientSuite(mm, tm) || contientSuite(tm, mm);
};

// ─── Affichage ───────────────────────────────────────────────────────────────

/** « 1 REGLE DE JEU » → « 1 regle de jeu » ; met une majuscule au premier mot. */
export const formaterTexte = (s: string | null | undefined) => {
  if (!s) return "";
  const t = /\p{Ll}/u.test(s) ? s : s.toLowerCase();
  return t.replace(/^\p{L}/u, c => c.toUpperCase());
};

/** Nom de jeu saisi tout en majuscules (« DOBBLE KIDS ») → « Dobble Kids ». */
export const formaterNomJeu = (s: string | null | undefined) => {
  if (!s) return "";
  if (/\p{Ll}/u.test(s)) return s.replace(/\p{L}/u, c => c.toUpperCase());
  return s.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, c) => sep + c.toUpperCase());
};
