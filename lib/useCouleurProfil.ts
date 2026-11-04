"use client";
import { useEffect, useRef } from "react";
import { EVT_COULEUR_PROFIL, type DetailCouleurProfil } from "./couleurProfil";

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
