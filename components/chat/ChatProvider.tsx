"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useCompte } from "../AuthProvider";
import { useTempsReel } from "../../lib/temps-reel";
import PanneauChat from "./PanneauChat";

type ChatContextValue = {
  ouvert: boolean;
  basculer: () => void;
  fermer: () => void;
  /** Messages des autres pas encore lus, toutes conversations confondues. */
  nonLus: number;
  /** Relit le compteur (le panneau l'appelle après avoir marqué lu). */
  rafraichirNonLus: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat doit être utilisé dans <ChatProvider>");
  return ctx;
}

/**
 * Messagerie, montée une fois dans le layout : le panneau survit aux
 * changements de page. C'est aussi ici que se brancheront les couches
 * globales à venir (réactions qui défilent par-dessus la page).
 */
export default function ChatProvider({ children }: { children: React.ReactNode }) {
  const { compte } = useCompte();
  const [ouvert, setOuvert] = useState(false);
  const [nonLus, setNonLus] = useState(0);

  // Monté dans le layout : ouvert, le panneau le reste d'une page à l'autre.
  const changer = useCallback((v: boolean) => setOuvert(v), []);

  const compteId = compte?.id ?? null;
  const rafraichirNonLus = useCallback(() => {
    if (!compteId) return;
    fetch("/api/chat/non-lus", { cache: "no-store" })
      .then(r => r.json() as Promise<{ count?: number }>)
      .then(d => setNonLus(d.count ?? 0))
      .catch(() => {});
  }, [compteId]);
  useEffect(() => { rafraichirNonLus(); }, [rafraichirNonLus]);
  useTempsReel("chat", rafraichirNonLus);

  const value: ChatContextValue = {
    ouvert,
    basculer: () => changer(!ouvert),
    fermer: () => changer(false),
    nonLus: compteId ? nonLus : 0,
    rafraichirNonLus,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
      {ouvert && <PanneauChat />}
    </ChatContext.Provider>
  );
}
