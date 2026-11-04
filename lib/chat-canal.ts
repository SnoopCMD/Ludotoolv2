"use client";

import type { EvenementChat, ReponseFlux } from "./chat";

/**
 * Transport de la messagerie, côté navigateur.
 *
 * Le panneau ne sait pas *comment* les messages arrivent : il ouvre un canal
 * sur une conversation à partir d'un curseur, et reçoit des `EvenementChat`.
 * Cette version sonde `/api/chat/<conversation>/flux` toutes les
 * `INTERVALLE_MS` (seulement onglet visible). Pour passer au vrai direct, il
 * suffira d'écrire un `ouvrirCanal` qui ouvre un WebSocket (Durable Object par
 * conversation) avec la même signature : le curseur `apres` sert alors à
 * rattraper ce qui a été manqué pendant une coupure.
 */
export type Canal = {
  /** Demande un tour immédiat (après un envoi, au retour sur l'onglet…). */
  reveiller(): void;
  fermer(): void;
};

export type Curseur = { apres: number; depuis: string };

const INTERVALLE_MS = 2500;

export function ouvrirCanal(conversation: string, depart: Curseur, recevoir: (e: EvenementChat) => void): Canal {
  let { apres, depuis } = depart;
  let minuteur: ReturnType<typeof setTimeout> | null = null;
  let enCours = false;
  let encore = false;
  let ferme = false;
  let connecte = true;

  const signalerEtat = (ok: boolean) => {
    if (ok === connecte) return;
    connecte = ok;
    recevoir({ type: "etat", connecte: ok });
  };

  const planifier = () => {
    if (minuteur) clearTimeout(minuteur);
    minuteur = null;
    if (ferme || document.visibilityState !== "visible") return;
    minuteur = setTimeout(tour, INTERVALLE_MS);
  };

  async function tour() {
    if (ferme) return;
    if (enCours) { encore = true; return; }
    enCours = true;
    try {
      const url = `/api/chat/${encodeURIComponent(conversation)}/flux?apres=${apres}&depuis=${encodeURIComponent(depuis)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const d = await res.json() as ReponseFlux;
      signalerEtat(true);
      depuis = d.maintenant;
      if (d.messages.length) {
        apres = Math.max(apres, ...d.messages.map(m => m.id));
        if (!ferme) recevoir({ type: "messages", messages: d.messages });
      }
    } catch {
      signalerEtat(false);
    } finally {
      enCours = false;
      if (encore) { encore = false; tour(); } else planifier();
    }
  }

  const auRetour = () => {
    if (document.visibilityState === "visible") tour();
    else planifier();
  };
  document.addEventListener("visibilitychange", auRetour);
  window.addEventListener("focus", auRetour);
  window.addEventListener("online", auRetour);
  planifier();

  return {
    reveiller: () => { tour(); },
    fermer: () => {
      ferme = true;
      if (minuteur) clearTimeout(minuteur);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", auRetour);
      window.removeEventListener("online", auRetour);
    },
  };
}
