"use client";

import { useEffect, useRef } from "react";

/**
 * Mises à jour en temps réel : un seul sondage de `/api/maj` par onglet, partagé
 * par tous les composants abonnés. Quand le compteur d'un domaine change (une
 * écriture faite depuis n'importe quel poste), ses abonnés rechargent leurs
 * données. Le sondage s'arrête quand l'onglet est caché et repart dès qu'on y
 * revient.
 */
export type Domaine = "alertes" | "jv" | "suggestions" | "reunion" | "agenda";

const INTERVALLE_MS = 8000;

const abonnes = new Map<Domaine, Set<() => void>>();
let versions: Record<string, number> | null = null;
let minuteur: ReturnType<typeof setTimeout> | null = null;
let enCours = false;

async function sonder() {
  if (enCours) return;
  enCours = true;
  try {
    const res = await fetch("/api/maj", { cache: "no-store" });
    const nouvelles = await res.json() as Record<string, number>;
    if (versions) {
      for (const [domaine, fns] of abonnes) {
        if (nouvelles[domaine] !== undefined && nouvelles[domaine] !== versions[domaine]) fns.forEach(fn => fn());
      }
    }
    versions = nouvelles;
  } catch {
    // Réseau coupé : on réessaie au prochain tour.
  } finally {
    enCours = false;
  }
}

function planifier() {
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
  if (abonnes.size === 0 || document.visibilityState !== "visible") return;
  minuteur = setTimeout(async () => { await sonder(); planifier(); }, INTERVALLE_MS);
}

function auRetour() {
  if (document.visibilityState === "visible") sonder().then(planifier);
  else planifier();
}

function demarrer() {
  document.addEventListener("visibilitychange", auRetour);
  window.addEventListener("focus", auRetour);
  sonder().then(planifier);
}

function arreter() {
  document.removeEventListener("visibilitychange", auRetour);
  window.removeEventListener("focus", auRetour);
  if (minuteur) clearTimeout(minuteur);
  minuteur = null;
}

/** Appelle `recharger` chaque fois que des données du domaine changent en base. */
export function useTempsReel(domaine: Domaine, recharger: () => void) {
  const ref = useRef(recharger);
  useEffect(() => { ref.current = recharger; });

  useEffect(() => {
    const fn = () => ref.current();
    const etaitVide = abonnes.size === 0;
    if (!abonnes.has(domaine)) abonnes.set(domaine, new Set());
    abonnes.get(domaine)!.add(fn);
    if (etaitVide) demarrer();
    return () => {
      const fns = abonnes.get(domaine);
      fns?.delete(fn);
      if (fns && fns.size === 0) abonnes.delete(domaine);
      if (abonnes.size === 0) arreter();
    };
  }, [domaine]);
}
