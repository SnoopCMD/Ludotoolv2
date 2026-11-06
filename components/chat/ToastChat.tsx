"use client";

import { useEffect, useRef } from "react";
import { couleurParDefaut } from "../../lib/couleurProfil";

const DUREE_MS = 6000;

/** Ce qu'une notification affiche : qui, à propos de quoi, et un extrait. */
export type Notification = {
  cle: string;
  conversation_id: string;
  nom: string;
  couleur: string | null;
  groupe: string | null;
  /** « message privé », « a réagi 👍 »… */
  sousTitre: string;
  texte: string;
};

/** Message privé, ou réaction à l'un de ses messages, hors de vue. */
export default function ToastChat({ notif, panneauOuvert, onOuvrir, onFermer }: {
  notif: Notification; panneauOuvert: boolean; onOuvrir: () => void; onFermer: () => void;
}) {
  // Le délai part à l'affichage et ne repart pas à chaque rendu du parent.
  const fermer = useRef(onFermer);
  useEffect(() => { fermer.current = onFermer; });
  useEffect(() => {
    const t = setTimeout(() => fermer.current(), DUREE_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div role="status" className={`pop-card chat-toast${panneauOuvert ? " chat-toast-panneau" : ""}`} style={{
      position: "fixed", zIndex: 130,
      width: "min(320px, calc(100vw - 32px))", padding: 0, overflow: "hidden", display: "flex",
    }}>
      <button onClick={onOuvrir} style={{
        flex: 1, display: "flex", gap: 10, alignItems: "flex-start", textAlign: "left",
        background: "none", border: "none", padding: "10px 12px", cursor: "pointer", fontFamily: "inherit", minWidth: 0,
      }}>
        <span className="bc" style={{
          width: 30, height: 30, borderRadius: "50%", border: "2px solid var(--ink)", flexShrink: 0,
          background: notif.couleur ?? couleurParDefaut(notif.groupe),
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>{notif.nom.trim()[0]?.toUpperCase()}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>
            {notif.nom} <span style={{ fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>· {notif.sousTitre}</span>
          </span>
          <span style={{
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            fontSize: 13, lineHeight: 1.35, marginTop: 2, overflowWrap: "anywhere",
          }}>{notif.texte}</span>
        </span>
      </button>
      <button onClick={onFermer} aria-label="Fermer la notification" style={{
        background: "none", border: "none", borderLeft: "1.5px solid rgba(0,0,0,0.1)", cursor: "pointer",
        padding: "0 10px", fontSize: 13, color: "rgba(0,0,0,0.5)",
      }}>✕</button>
    </div>
  );
}
