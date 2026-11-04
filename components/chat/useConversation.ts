"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MessageChat, ReponseFlux } from "../../lib/chat";
import { ouvrirCanal, type Canal } from "../../lib/chat-canal";

/** Message affiché : enregistré, ou encore en cours d'envoi côté client. */
export type MessageAffiche = MessageChat & { etat?: "envoi" | "echec" };

type Etat = {
  messages: MessageAffiche[];
  chargement: boolean;
  erreur: string | null;
  plusAnciens: boolean;
  connecte: boolean;
};

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

/**
 * État d'une conversation : chargement initial, historique, envoi optimiste,
 * suppression, et abonnement au canal tant que `actif` est vrai.
 */
export function useConversation(conversation: string, actif: boolean, moi: { id: string; equipe_id: string; nom: string; couleur: string | null; groupe: string | null } | null) {
  const [etat, setEtat] = useState<Etat>({ messages: [], chargement: true, erreur: null, plusAnciens: false, connecte: true });
  const canal = useRef<Canal | null>(null);
  const base = `/api/chat/${encodeURIComponent(conversation)}`;

  useEffect(() => {
    if (!actif || !moi) return;
    let annule = false;
    setEtat(e => ({ ...e, chargement: e.messages.length === 0, erreur: null }));
    fetch(`${base}/flux`, { cache: "no-store" })
      .then(async r => {
        const d = await r.json() as ReponseFlux & { error?: string };
        if (!r.ok) throw new Error(d.error || "Impossible de charger la conversation.");
        return d;
      })
      .then(d => {
        if (annule) return;
        setEtat(e => ({ ...e, messages: fusionner(e.messages.filter(m => m.etat), d.messages), plusAnciens: !!d.plus_anciens, chargement: false }));
        const apres = d.messages.length ? d.messages[d.messages.length - 1].id : 0;
        canal.current = ouvrirCanal(conversation, { apres, depuis: d.maintenant }, ev => {
          if (ev.type === "messages") setEtat(e => ({ ...e, messages: fusionner(e.messages, ev.messages) }));
          else if (ev.type === "etat") setEtat(e => ({ ...e, connecte: ev.connecte }));
        });
      })
      .catch((err: Error) => { if (!annule) setEtat(e => ({ ...e, chargement: false, erreur: err.message })); });
    return () => {
      annule = true;
      canal.current?.fermer();
      canal.current = null;
    };
    // `moi` change d'objet à chaque rendu : seul le compte compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, actif, moi?.id, base]);

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
      setEtat(e => ({ ...e, messages: fusionner(e.messages, [d]) }));
      canal.current?.reveiller();
    } catch {
      setEtat(e => ({ ...e, messages: e.messages.map(m => m.client_id === provisoire.client_id && m.etat ? { ...m, etat: "echec" } : m) }));
    }
  }, [base]);

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

  const marquerLu = useCallback((jusqua: number) => {
    return fetch(`${base}/lu`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jusqua }),
    }).catch(() => null);
  }, [base]);

  return { ...etat, chargerPlusAnciens, envoyer, reessayer, abandonner, supprimer, marquerLu };
}
