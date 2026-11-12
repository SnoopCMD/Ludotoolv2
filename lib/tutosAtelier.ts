/**
 * Tutos des étapes de préparation de l'atelier.
 *
 * Ils sont en base (table `atelier_tutos`, une ligne par étape) pour être
 * modifiés depuis l'atelier, sans déploiement. Les illustrations ajoutées
 * depuis l'atelier sont dans R2 (bucket REGLES, préfixe `tutos/`) et servies
 * par /api/atelier-tutos/image/<clé> ; celles livrées avec l'app sont dans
 * public/tutos.
 *
 * Partagé par le client et le serveur : rien d'importé côté serveur ici.
 */

/** Un geste d'un tuto : une illustration et ce qu'il faut faire. */
export type GesteTuto = { titre: string; texte?: string; image: string };

/** Tutos par identifiant d'étape (celui de lib/etapesAtelier.ts). */
export type TutosAtelier = Record<string, GesteTuto[]>;

/** Comptes autorisés à créer et modifier les tutos (identifiant sans accent). */
export const EDITEURS_TUTOS = ["timothe"];

export const peutModifierTutos = (compte: { identifiant: string } | null | undefined) =>
  !!compte && EDITEURS_TUTOS.includes(compte.identifiant);

export const PREFIXE_IMAGE_TUTO = "/api/atelier-tutos/image/";

export const MAX_GESTES = 12;
export const MAX_TITRE = 120;
export const MAX_TEXTE = 400;
/** Taille maximale d'une illustration envoyée (après réduction côté navigateur). */
export const TAILLE_MAX_IMAGE = 3 * 1024 * 1024;
