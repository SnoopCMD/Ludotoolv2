"use client";

import { useState } from "react";
import type { FavoriChat } from "../../lib/chat";
import { basculerFavori, useFavoris } from "./favoris";

/** Étoile posée dans le coin d'un GIF ou d'un sticker : ajoute ou retire des favoris. */
export default function EtoileFavori({ piece }: { piece: FavoriChat }) {
  const { estFavori } = useFavoris();
  const [erreur, setErreur] = useState<string | null>(null);
  const actif = estFavori(piece);
  return (
    <button
      onClick={e => { e.stopPropagation(); setErreur(null); basculerFavori(piece).catch(err => setErreur((err as Error).message)); }}
      aria-pressed={actif} aria-label={actif ? "Retirer des favoris" : "Ajouter aux favoris"}
      title={erreur ?? (actif ? "Retirer des favoris" : "Ajouter aux favoris")}
      className={`chat-etoile${actif ? " active" : ""}${erreur ? " erreur" : ""}`}>
      {actif ? "★" : "☆"}
    </button>
  );
}
