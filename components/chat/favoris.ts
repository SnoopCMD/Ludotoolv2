"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cleFavori, type FavoriChat } from "../../lib/chat";

/**
 * Favoris du compte (GIF et stickers), partagés par tous les sélecteurs de
 * l'onglet : chargés une fois, puis tenus à jour sur place à chaque bascule.
 */
let favoris: FavoriChat[] | null = null;
let charge: Promise<void> | null = null;
const ecouteurs = new Set<() => void>();
const prevenir = () => ecouteurs.forEach(fn => fn());

function charger() {
  if (!charge) {
    charge = fetch("/api/chat/favoris", { cache: "no-store" })
      .then(r => r.ok ? r.json() as Promise<{ favoris: FavoriChat[] }> : Promise.reject())
      .then(d => { favoris = d.favoris; prevenir(); })
      .catch(() => { charge = null; });
  }
  return charge;
}

/** À appeler à la déconnexion : les favoris de l'ancien compte ne restent pas. */
export function oublierFavoris() { favoris = null; charge = null; prevenir(); }

/** Ajoute ou retire, tout de suite à l'écran ; revient en arrière si le serveur refuse. */
export async function basculerFavori(piece: FavoriChat): Promise<void> {
  const avant = favoris ?? [];
  const cle = cleFavori(piece);
  const deja = avant.some(f => cleFavori(f) === cle);
  favoris = deja ? avant.filter(f => cleFavori(f) !== cle) : [piece, ...avant];
  prevenir();
  const r = await fetch("/api/chat/favoris", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ piece }),
  }).catch(() => null);
  if (!r?.ok) {
    favoris = avant;
    prevenir();
    const d = await r?.json().catch(() => ({})) as { error?: string } | undefined;
    throw new Error(d?.error || "Favori non enregistré.");
  }
}

const VIDE: FavoriChat[] = [];

/** Les favoris (chargés au premier usage) et un test « est-ce un favori ? ». */
export function useFavoris() {
  useEffect(() => { charger(); }, []);
  const liste = useSyncExternalStore(
    fn => { ecouteurs.add(fn); return () => ecouteurs.delete(fn); },
    () => favoris ?? VIDE,
    () => VIDE,
  );
  const cles = new Set(liste.map(cleFavori));
  return { favoris: liste, estFavori: (p: { type: string; id: string }) => cles.has(cleFavori(p)) };
}
