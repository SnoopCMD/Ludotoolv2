"use client";
import { useSyncExternalStore } from "react";

/** Largeur maximale considérée comme « téléphone ». Doit rester alignée sur
 *  la valeur du même nom dans globals.css (--bp-mobile / les @media). */
export const MOBILE_BREAKPOINT = 640;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT}px)`;

function abonner(rappel: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener("change", rappel);
  return () => mql.removeEventListener("change", rappel);
}

function lire() {
  return window.matchMedia(QUERY).matches;
}

/** Vrai sur téléphone (≤ 640px de large).
 *
 *  Le rendu serveur ne connaît pas la taille de l'écran : il renvoie toujours
 *  `false` (desktop), puis React re-rend côté client avec la vraie valeur.
 *  Utiliser ce hook pour les changements de *structure* (une grille qui devient
 *  une pile, un tableau qui devient des cartes). Pour du simple ajustement
 *  visuel, préférer une classe CSS avec @media : pas de re-rendu, pas de
 *  clignotement au chargement.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(abonner, lire, () => false);
}

export default useIsMobile;
