"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { envoyerDirect, useEvenementsChat } from "../../lib/chat-canal";

/**
 * Réactions volantes : des émotes qui montent en fontaine au milieu de
 * l'écran, par-dessus la page, chez toute l'équipe (conversation générale
 * seulement). Éphémères : rien en base, elles
 * passent par la WebSocket et le Durable Object, qui vérifie et relaie.
 *
 * Montée une fois dans `ChatProvider`. `lancerVolante()` affiche tout de suite
 * chez soi et envoie aux autres ; l'écho qui revient du serveur est reconnu à
 * sa `cle` et ignoré.
 */

type Volante = {
  id: number; emoji: string;
  /** Position de départ et trajectoire, tirées au hasard. */
  x: number; y: number; derive: number; duree: number; taille: number;
};

const MAX_A_L_ECRAN = 40;

// ── Bus local : ce que cet onglet lance lui-même.
type Lancement = { emoji: string };
const lancements = new Set<(l: Lancement) => void>();
const mesCles = new Set<string>();

export function lancerVolante(conversation_id: string, emoji: string) {
  const cle = crypto.randomUUID();
  mesCles.add(cle);
  if (mesCles.size > 200) mesCles.delete(mesCles.values().next().value!);
  lancements.forEach(fn => fn({ emoji }));
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

export default function CoucheVolantes({ actif, panneauOuvert }: { actif: boolean; panneauOuvert: boolean }) {
  const [volantes, setVolantes] = useState<Volante[]>([]);
  const muet = useVolantesMuettes();
  const suivant = useRef(1);
  const contexte = useRef({ panneauOuvert, muet });
  useEffect(() => { contexte.current = { panneauOuvert, muet }; });

  const afficher = useRef((emoji: string) => {
    const c = contexte.current;
    if (c.muet) return;
    const larg = window.innerWidth, haut = window.innerHeight;
    // Centrée sur la page visible : à gauche du panneau s'il est ouvert, sauf
    // sur téléphone où il prend toute la largeur.
    const panneau = c.panneauOuvert && larg > 640 ? Math.min(400, larg) : 0;
    const v: Volante = {
      id: suivant.current++,
      emoji,
      x: (larg - panneau) / 2 - 20 + (Math.random() - 0.5) * 140,
      y: haut - 40,
      derive: (Math.random() - 0.5) * 90,
      duree: 2600 + Math.random() * 1400,
      taille: 30 + Math.random() * 16,
    };
    setVolantes(vs => [...vs.slice(-(MAX_A_L_ECRAN - 1)), v]);
  });

  // Ce que je lance moi-même.
  useEffect(() => {
    const fn = (l: Lancement) => afficher.current(l.emoji);
    lancements.add(fn);
    return () => { lancements.delete(fn); };
  }, []);

  // Ce que les autres lancent (mon propre écho est ignoré).
  useEvenementsChat(actif, ev => {
    if (ev.type !== "volante" || mesCles.has(ev.cle)) return;
    afficher.current(ev.emoji);
  });

  const retirer = (id: number) => setVolantes(vs => vs.filter(v => v.id !== id));
  if (volantes.length === 0) return null;

  return (
    <div aria-hidden className="chat-volantes">
      {volantes.map(v => (
        <div key={v.id} className="chat-volante" onAnimationEnd={() => retirer(v.id)}
          style={{
            left: v.x, top: v.y, fontSize: v.taille,
            animationDuration: `${v.duree}ms`,
            ["--derive" as string]: `${v.derive}px`,
          }}>
          <span className="chat-volante-emoji">{v.emoji}</span>
        </div>
      ))}
    </div>
  );
}
