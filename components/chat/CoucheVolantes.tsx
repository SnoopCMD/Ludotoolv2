"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CompteChat } from "../../lib/chat";
import { envoyerDirect, useEvenementsChat } from "../../lib/chat-canal";
import { couleurParDefaut } from "../../lib/couleurProfil";

/**
 * Réactions volantes : des émotes qui traversent l'écran, par-dessus la page,
 * chez tous les membres de la conversation. Éphémères : rien en base, elles
 * passent par la WebSocket et le Durable Object, qui vérifie et relaie.
 *
 * Montée une fois dans `ChatProvider`. `lancerVolante()` affiche tout de suite
 * chez soi et envoie aux autres ; l'écho qui revient du serveur est reconnu à
 * sa `cle` et ignoré.
 */

/** Deux rendus en lice : montée en fontaine, ou défilement horizontal. */
export type StyleVolantes = "fontaine" | "defilement";
export const STYLE_VOLANTES: StyleVolantes = "fontaine";

type Volante = {
  id: number; emoji: string; nom: string | null; couleur: string;
  /** Position de départ et trajectoire, tirées au hasard. */
  x: number; y: number; derive: number; duree: number; taille: number;
};

const MAX_A_L_ECRAN = 40;
/** Le prénom accompagne la première émote d'une rafale seulement. */
const RAFALE_MS = 1500;

// ── Bus local : ce que cet onglet lance lui-même.
type Lancement = { emoji: string; auteur_id: string };
const lancements = new Set<(l: Lancement) => void>();
const mesCles = new Set<string>();

export function lancerVolante(conversation_id: string, emoji: string, auteur_id: string) {
  const cle = crypto.randomUUID();
  mesCles.add(cle);
  if (mesCles.size > 200) mesCles.delete(mesCles.values().next().value!);
  lancements.forEach(fn => fn({ emoji, auteur_id }));
  envoyerDirect({ type: "volante", conversation_id, emoji, cle });
}

// ── Couper les volantes (préférence de cet appareil).
const CLE_MUET = "ludotool-volantes-muettes";
const ecouteursMuet = new Set<() => void>();
function lireMuet() { try { return localStorage.getItem(CLE_MUET) === "1"; } catch { return false; } }
export function changerMuet(v: boolean) {
  try { localStorage.setItem(CLE_MUET, v ? "1" : "0"); } catch { /* stockage indisponible */ }
  ecouteursMuet.forEach(fn => fn());
}
export function useVolantesMuettes(): boolean {
  return useSyncExternalStore(fn => { ecouteursMuet.add(fn); return () => ecouteursMuet.delete(fn); }, lireMuet, () => false);
}

export default function CoucheVolantes({ moi, comptes, panneauOuvert, style = STYLE_VOLANTES }: {
  moi: CompteChat | null; comptes: CompteChat[]; panneauOuvert: boolean; style?: StyleVolantes;
}) {
  const [volantes, setVolantes] = useState<Volante[]>([]);
  const muet = useVolantesMuettes();
  const suivant = useRef(1);
  const dernierParAuteur = useRef(new Map<string, number>());
  const contexte = useRef({ moi, comptes, panneauOuvert, style, muet });
  useEffect(() => { contexte.current = { moi, comptes, panneauOuvert, style, muet }; });

  const afficher = useRef((emoji: string, auteur_id: string) => {
    // APERÇU : `<html data-style-volantes="…">` force un style, le temps de choisir.
    const force = document.documentElement.dataset.styleVolantes as StyleVolantes | undefined;
    const c = { ...contexte.current, style: force ?? contexte.current.style };
    if (c.muet) return;
    const qui = auteur_id === c.moi?.id ? c.moi : c.comptes.find(x => x.id === auteur_id) ?? null;
    const maintenant = Date.now();
    const debutRafale = maintenant - (dernierParAuteur.current.get(auteur_id) ?? 0) > RAFALE_MS;
    dernierParAuteur.current.set(auteur_id, maintenant);
    const larg = window.innerWidth, haut = window.innerHeight;
    // Fontaine : une colonne en bas à droite de la page (à gauche du panneau
    // s'il est ouvert, sauf sur téléphone où il prend toute la largeur).
    const panneau = c.panneauOuvert && larg > 640 ? Math.min(400, larg) : 0;
    const v: Volante = {
      id: suivant.current++,
      emoji,
      nom: debutRafale && qui ? qui.nom : null,
      couleur: qui ? qui.couleur ?? couleurParDefaut(qui.groupe) : "#a3a3a3",
      x: c.style === "fontaine" ? larg - panneau - 90 - Math.random() * 110 : larg + 20,
      y: c.style === "fontaine" ? haut - 40 : haut * (0.14 + Math.random() * 0.6),
      derive: (Math.random() - 0.5) * 90,
      duree: c.style === "fontaine" ? 2600 + Math.random() * 1400 : 5200 + Math.random() * 2200,
      taille: 30 + Math.random() * 16,
    };
    setVolantes(vs => [...vs.slice(-(MAX_A_L_ECRAN - 1)), v]);
  });

  // Ce que je lance moi-même.
  useEffect(() => {
    const fn = (l: Lancement) => afficher.current(l.emoji, l.auteur_id);
    lancements.add(fn);
    return () => { lancements.delete(fn); };
  }, []);

  // Ce que les autres lancent (mon propre écho est ignoré).
  useEvenementsChat(!!moi, ev => {
    if (ev.type !== "volante" || mesCles.has(ev.cle)) return;
    afficher.current(ev.emoji, ev.auteur_id);
  });

  const retirer = (id: number) => setVolantes(vs => vs.filter(v => v.id !== id));
  if (volantes.length === 0) return null;

  return (
    <div aria-hidden className={`chat-volantes chat-volantes-${document.documentElement.dataset.styleVolantes ?? style}`}>
      {volantes.map(v => (
        <div key={v.id} className="chat-volante" onAnimationEnd={() => retirer(v.id)}
          style={{
            left: v.x, top: v.y, fontSize: v.taille,
            animationDuration: `${v.duree}ms`,
            ["--derive" as string]: `${v.derive}px`,
          }}>
          <span className="chat-volante-emoji">{v.emoji}</span>
          {v.nom && <span className="chat-volante-nom" style={{ background: v.couleur }}>{v.nom}</span>}
        </div>
      ))}
    </div>
  );
}
