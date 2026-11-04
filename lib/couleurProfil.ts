import { useEffect, useRef } from "react";

/**
 * Couleur de profil d'un membre de l'équipe. Une seule source :
 * `equipe.horaires.couleur` (déjà utilisée par l'agenda). Sans couleur choisie,
 * la couleur du groupe (A rouge, B bleu) sert de repli.
 *
 * Quand un membre change sa couleur depuis le menu de son compte, l'événement
 * `EVT_COULEUR_PROFIL` prévient les pages ouvertes, qui mettent à jour leurs
 * avatars sans recharger.
 */
export const COULEURS_PROFIL = [
  "#f87171", "#fb923c", "#fde047", "#a8e063", "#4ade80", "#2dd4bf",
  "#60a5fa", "#818cf8", "#c084fc", "#f472b6", "#a3a3a3", "#d6b38a",
];

export const couleurValide = (c: unknown): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c);

export const couleurParDefaut = (groupe?: string | null) =>
  groupe === "A" ? "#f87171" : groupe === "B" ? "#60a5fa" : "#a8e063";

export const EVT_COULEUR_PROFIL = "couleur-profil";
export type DetailCouleurProfil = { equipe_id: string; couleur: string | null };


/** Appelle `fn` quand un membre change sa couleur de profil (depuis n'importe quelle page de l'onglet). */
export function useCouleurProfil(fn: (d: DetailCouleurProfil) => void) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    const ecoute = (e: Event) => ref.current((e as CustomEvent<DetailCouleurProfil>).detail);
    window.addEventListener(EVT_COULEUR_PROFIL, ecoute);
    return () => window.removeEventListener(EVT_COULEUR_PROFIL, ecoute);
  }, []);
}
