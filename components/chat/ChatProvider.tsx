"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useCompte } from "../AuthProvider";
import { useTempsReel } from "../../lib/temps-reel";
import { useEvenementsChat } from "../../lib/chat-canal";
import type { CompteChat, ReponseConversations, ResumeConversation } from "../../lib/chat";
import PanneauChat from "./PanneauChat";
import ToastChat, { type Notification } from "./ToastChat";
import CoucheVolantes from "./CoucheVolantes";

type ChatContextValue = {
  ouvert: boolean;
  basculer: () => void;
  fermer: () => void;
  /** Conversation affichée dans le panneau ; null = la liste des discussions. */
  active: string | null;
  ouvrirConversation: (id: string | null) => void;
  /** Ouvre (en la créant au besoin) la discussion privée avec ce compte. */
  ouvrirPrivee: (compteId: string) => Promise<void>;
  conversations: ResumeConversation[];
  comptes: CompteChat[];
  /** Messages des autres pas encore lus, toutes conversations confondues. */
  nonLus: number;
  /** Relit la liste et les compteurs (après avoir marqué lu, par exemple). */
  rafraichir: () => void;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat doit être utilisé dans <ChatProvider>");
  return ctx;
}

/**
 * Messagerie, montée une fois dans le layout : le panneau survit aux
 * changements de page, et le direct (une WebSocket par onglet) reste ouvert
 * tant qu'on est connecté, pour la pastille et les notifications. C'est aussi
 * ici que sont montées les couches globales : notifications et réactions
 * volantes par-dessus la page.
 */
export default function ChatProvider({ children }: { children: React.ReactNode }) {
  const { compte } = useCompte();
  const compteId = compte?.id ?? null;
  const [ouvert, setOuvert] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [donnees, setDonnees] = useState<ReponseConversations & { pour: string | null }>({ conversations: [], comptes: [], pour: null });
  const [toast, setToast] = useState<Notification | null>(null);

  const rafraichir = useCallback(() => {
    if (!compteId) return;
    fetch("/api/chat/conversations", { cache: "no-store" })
      .then(r => r.ok ? r.json() as Promise<ReponseConversations> : Promise.reject())
      .then(d => setDonnees({ ...d, pour: compteId }))
      .catch(() => {});
  }, [compteId]);
  useEffect(() => { rafraichir(); }, [rafraichir]);
  // Filet de sécurité si le direct est coupé : le compteur « chat » de /api/maj.
  useTempsReel("chat", rafraichir);

  // Plusieurs messages d'affilée : une seule relecture de la liste.
  const differe = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafraichirBientot = useCallback(() => {
    if (differe.current) clearTimeout(differe.current);
    differe.current = setTimeout(rafraichir, 250);
  }, [rafraichir]);

  // Conversation que l'utilisateur a sous les yeux : pas de notification pour elle.
  const visible = useRef<string | null>(null);
  useEffect(() => { visible.current = ouvert ? active : null; }, [ouvert, active]);

  useEvenementsChat(!!compteId, ev => {
    if (ev.type === "message") {
      rafraichirBientot();
      const m = ev.message;
      // Notification pour les messages privés seulement : la générale peut
      // être bavarde, sa pastille suffit.
      const prive = m.conversation_id.startsWith("prive-");
      if (prive && m.auteur_id !== compteId && !m.supprime && !m.modifie_le && m.conversation_id !== visible.current) {
        setToast({
          cle: `m-${m.id}`, conversation_id: m.conversation_id, nom: m.auteur_nom,
          couleur: m.auteur_couleur, groupe: m.auteur_groupe, sousTitre: "message privé", texte: m.contenu,
        });
      }
    } else if (ev.type === "reaction") {
      // Quelqu'un a réagi à un de mes messages (le serveur ne l'envoie qu'à moi).
      if (ev.conversation_id !== visible.current) {
        setToast({
          cle: `r-${ev.message_id}-${ev.par.id}-${ev.emoji}`, conversation_id: ev.conversation_id, nom: ev.par.nom,
          couleur: ev.par.couleur, groupe: ev.par.groupe, sousTitre: `a réagi ${ev.emoji}`, texte: `« ${ev.extrait} »`,
        });
      }
    } else if (ev.type === "conversation" || ev.type === "reconnecte") {
      rafraichirBientot();
    }
  });

  const ouvrirConversation = useCallback((id: string | null) => {
    setActive(id);
    setOuvert(true);
    setToast(t => (t && t.conversation_id === id ? null : t));
  }, []);

  const ouvrirPrivee = useCallback(async (avec: string) => {
    const r = await fetch("/api/chat/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avec }),
    });
    const d = await r.json() as { id?: string; error?: string };
    if (!r.ok || !d.id) throw new Error(d.error || "Impossible d'ouvrir la discussion.");
    ouvrirConversation(d.id);
    rafraichir();
  }, [ouvrirConversation, rafraichir]);

  // Après une déconnexion, rien de l'ancien compte ne doit rester affiché.
  const aJour = compteId && donnees.pour === compteId;
  const conversations = aJour ? donnees.conversations : [];
  const value: ChatContextValue = {
    ouvert,
    basculer: () => setOuvert(o => !o),
    fermer: () => setOuvert(false),
    active,
    ouvrirConversation,
    ouvrirPrivee,
    conversations,
    comptes: aJour ? donnees.comptes : [],
    nonLus: conversations.reduce((n, c) => n + c.non_lus, 0),
    rafraichir,
  };

  return (
    <ChatContext.Provider value={value}>
      {children}
      {ouvert && <PanneauChat />}
      {compte && (
        <CoucheVolantes panneauOuvert={ouvert} comptes={aJour ? donnees.comptes : []}
          moi={{ id: compte.id, equipe_id: compte.equipe_id, nom: compte.nom, groupe: compte.groupe, couleur: compte.couleur }} />
      )}
      {toast && compteId && (
        <ToastChat key={toast.cle} notif={toast} panneauOuvert={ouvert}
          onOuvrir={() => { ouvrirConversation(toast.conversation_id); setToast(null); }}
          onFermer={() => setToast(null)} />
      )}
    </ChatContext.Provider>
  );
}
