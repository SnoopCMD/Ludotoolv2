"use client";

import { useEffect, useRef } from "react";
import type { MessageChat } from "../../lib/chat";
import { couleurParDefaut } from "../../lib/couleurProfil";

const DUREE_MS = 6000;

/** Message privé reçu alors que la discussion n'est pas sous les yeux. */
export default function ToastChat({ message, panneauOuvert, onOuvrir, onFermer }: {
  message: MessageChat; panneauOuvert: boolean; onOuvrir: () => void; onFermer: () => void;
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
          background: message.auteur_couleur ?? couleurParDefaut(message.auteur_groupe),
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
        }}>{message.auteur_nom.trim()[0]?.toUpperCase()}</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 12, fontWeight: 800 }}>
            {message.auteur_nom} <span style={{ fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>· message privé</span>
          </span>
          <span style={{
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
            fontSize: 13, lineHeight: 1.35, marginTop: 2, overflowWrap: "anywhere",
          }}>{message.contenu}</span>
        </span>
      </button>
      <button onClick={onFermer} aria-label="Fermer la notification" style={{
        background: "none", border: "none", borderLeft: "1.5px solid rgba(0,0,0,0.1)", cursor: "pointer",
        padding: "0 10px", fontSize: 13, color: "rgba(0,0,0,0.5)",
      }}>✕</button>
    </div>
  );
}
