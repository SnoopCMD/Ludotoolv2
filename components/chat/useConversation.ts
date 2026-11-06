"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageChat, ReactionChat, ReponseFlux } from "../../lib/chat";
import { useDirect, useEvenementsChat } from "../../lib/chat-canal";

/** Message affiché : enregistré, ou encore en cours d'envoi côté client. */
export type MessageAffiche = MessageChat & { etat?: "envoi" | "echec" };

type Etat = {
  messages: MessageAffiche[];
  chargement: boolean;
  erreur: string | null;
  plusAnciens: boolean;
};

/** Sans direct, on sonde le fil ouvert à ce rythme (onglet visible seulement). */
const SONDAGE_MS = 2500;

/** Fusionne par id (et reconnaît un message en attente à son client_id), trie par id. */
function fusionner(actuels: MessageAffiche[], recus: MessageChat[]): MessageAffiche[] {
  const parId = new Map<number, MessageAffiche>();
  const enAttente = new Map<string, MessageAffiche>();
  for (const m of actuels) {
    if (m.etat && m.client_id) enAttente.set(m.client_id, m);
    else parId.set(m.id, m);
  }
  for (const m of recus) {
    parId.set(m.id, m);
    if (m.client_id) enAttente.delete(m.client_id);
  }
  // Les messages en attente restent en bas, dans leur ordre d'envoi.
  return [...[...parId.values()].sort((a, b) => a.id - b.id), ...enAttente.values()];
}

/** Ajoute ou retire le compte sur une émote (sans toucher à l'ordre des autres). */
function basculer(reactions: ReactionChat[], emoji: string, moi: { id: string; nom: string }): ReactionChat[] {
  const r = reactions.find(x => x.emoji === emoji);
  if (!r) return [...reactions, { emoji, comptes: [{ id: moi.id, nom: moi.nom }] }];
  const dedans = r.comptes.some(c => c.id === moi.id);
  const comptes = dedans ? r.comptes.filter(c => c.id !== moi.id) : [...r.comptes, { id: moi.id, nom: moi.nom }];
  return comptes.length
    ? reactions.map(x => x.emoji === emoji ? { ...x, comptes } : x)
    : reactions.filter(x => x.emoji !== emoji);
}

type Moi = { id: string; equipe_id: string; nom: string; couleur: string | null; groupe: string | null };

/**
 * État d'un fil de discussion : chargement, historique, envoi optimiste,
 * suppression. Reçoit les nouveautés par le direct ; sans direct, sonde.
 * À monter avec `key={conversation}` : changer de conversation repart de zéro.
 */
export function useConversation(conversation: string, moi: Moi | null) {
  const [etat, setEtat] = useState<Etat>({ messages: [], chargement: true, erreur: null, plusAnciens: false });
  const base = `/api/chat/${encodeURIComponent(conversation)}`;
  const direct = useDirect();
  // Curseur : dernier id reçu et horloge serveur du dernier rattrapage.
  const curseur = useRef<{ apres: number; depuis: string } | null>(null);
  const actif = !!moi;

  const recevoir = useCallback((recus: MessageChat[]) => {
    if (!recus.length) return;
    if (curseur.current) curseur.current.apres = Math.max(curseur.current.apres, ...recus.map(m => m.id));
    setEtat(e => ({ ...e, messages: fusionner(e.messages, recus) }));
  }, []);

  // Chargement initial.
  useEffect(() => {
    if (!actif) return;
    let annule = false;
    fetch(`${base}/flux`, { cache: "no-store" })
      .then(async r => {
        const d = await r.json() as ReponseFlux & { error?: string };
        if (!r.ok) throw new Error(d.error || "Impossible de charger la conversation.");
        return d;
      })
      .then(d => {
        if (annule) return;
        curseur.current = { apres: 0, depuis: d.maintenant };
        recevoir(d.messages);
        setEtat(e => ({ ...e, plusAnciens: !!d.plus_anciens, chargement: false }));
      })
      .catch((err: Error) => { if (!annule) setEtat(e => ({ ...e, chargement: false, erreur: err.message })); });
    return () => { annule = true; };
  }, [base, actif, recevoir]);

  // Rattrapage : tout ce qui a bougé depuis le curseur (nouveaux, supprimés).
  const enCours = useRef(false);
  const rattraper = useCallback(async () => {
    const c = curseur.current;
    if (!c || enCours.current) return;
    enCours.current = true;
    try {
      const r = await fetch(`${base}/flux?apres=${c.apres}&depuis=${encodeURIComponent(c.depuis)}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json() as ReponseFlux;
      c.depuis = d.maintenant;
      recevoir(d.messages);
    } catch { /* réseau : on réessaiera */ }
    finally { enCours.current = false; }
  }, [base, recevoir]);

  // Direct : les messages de cette conversation arrivent un par un.
  useEvenementsChat(actif, ev => {
    if (ev.type === "message" && ev.message.conversation_id === conversation) recevoir([ev.message]);
    else if (ev.type === "reconnecte") rattraper();
  });

  // Sans direct : sondage, et un tour dès qu'on revient sur l'onglet.
  useEffect(() => {
    if (!actif || direct) return;
    const minuteur = setInterval(() => { if (document.visibilityState === "visible") rattraper(); }, SONDAGE_MS);
    const auRetour = () => { if (document.visibilityState === "visible") rattraper(); };
    document.addEventListener("visibilitychange", auRetour);
    return () => { clearInterval(minuteur); document.removeEventListener("visibilitychange", auRetour); };
  }, [actif, direct, rattraper]);

  const chargerPlusAnciens = useCallback(async () => {
    const premier = etat.messages.find(m => !m.etat);
    if (!premier) return;
    const r = await fetch(`${base}/flux?avant=${premier.id}`, { cache: "no-store" });
    if (!r.ok) return;
    const d = await r.json() as ReponseFlux;
    setEtat(e => ({ ...e, messages: fusionner(e.messages, d.messages), plusAnciens: !!d.plus_anciens }));
  }, [etat.messages, base]);

  const poster = useCallback(async (provisoire: MessageAffiche) => {
    try {
      const r = await fetch(`${base}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contenu: provisoire.contenu, client_id: provisoire.client_id }),
      });
      const d = await r.json() as MessageChat & { error?: string };
      if (!r.ok) throw new Error(d.error);
      recevoir([d]);
    } catch {
      setEtat(e => ({ ...e, messages: e.messages.map(m => m.client_id === provisoire.client_id && m.etat ? { ...m, etat: "echec" } : m) }));
    }
  }, [base, recevoir]);

  const envoyer = useCallback((contenu: string) => {
    if (!moi) return;
    const provisoire: MessageAffiche = {
      id: Number.MAX_SAFE_INTEGER,
      conversation_id: conversation,
      auteur_id: moi.id,
      auteur_equipe_id: moi.equipe_id,
      auteur_nom: moi.nom,
      auteur_couleur: moi.couleur,
      auteur_groupe: moi.groupe,
      contenu,
      client_id: crypto.randomUUID(),
      cree_le: new Date().toISOString(),
      modifie_le: null,
      supprime: false,
      reactions: [],
      etat: "envoi",
    };
    setEtat(e => ({ ...e, messages: [...e.messages, provisoire] }));
    poster(provisoire);
  }, [conversation, moi, poster]);

  const reessayer = useCallback((m: MessageAffiche) => {
    setEtat(e => ({ ...e, messages: e.messages.map(x => x.client_id === m.client_id && x.etat ? { ...x, etat: "envoi" } : x) }));
    poster(m);
  }, [poster]);

  const abandonner = useCallback((m: MessageAffiche) => {
    setEtat(e => ({ ...e, messages: e.messages.filter(x => !(x.etat && x.client_id === m.client_id)) }));
  }, []);

  const supprimer = useCallback(async (m: MessageAffiche) => {
    setEtat(e => ({ ...e, messages: e.messages.map(x => x.id === m.id ? { ...x, supprime: true, contenu: "" } : x) }));
    const r = await fetch(`${base}/messages/${m.id}`, { method: "DELETE" }).catch(() => null);
    // Échec : on remet le message tel qu'il était, sans toucher aux autres.
    if (!r || !r.ok) setEtat(e => ({ ...e, messages: e.messages.map(x => x.id === m.id ? m : x) }));
  }, [base]);

  /**
   * Pose ou retire `emoji` sur un message, tout de suite à l'écran ; la
   * réponse du serveur (ou le direct) remet ensuite l'état exact. En cas
   * d'échec, on revient à ce qui était affiché.
   */
  const reagir = useCallback(async (m: MessageAffiche, emoji: string) => {
    if (!moi || m.etat || m.supprime) return;
    setEtat(e => ({ ...e, messages: e.messages.map(x => x.id === m.id ? { ...x, reactions: basculer(x.reactions, emoji, moi) } : x) }));
    try {
      const r = await fetch(`${base}/messages/${m.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emoji }),
      });
      const d = await r.json() as MessageChat & { error?: string };
      if (!r.ok) throw new Error(d.error);
      recevoir([d]);
    } catch {
      setEtat(e => ({ ...e, messages: e.messages.map(x => x.id === m.id ? { ...x, reactions: m.reactions } : x) }));
    }
  }, [base, moi, recevoir]);

  const marquerLu = useCallback((jusqua: number) => {
    return fetch(`${base}/lu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jusqua }),
    }).catch(() => null);
  }, [base]);

  return { ...etat, direct, chargerPlusAnciens, envoyer, reessayer, abandonner, supprimer, reagir, marquerLu };
}
