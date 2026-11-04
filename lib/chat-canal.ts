"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import type { EvenementDirect } from "./chat";

/**
 * Le direct de la messagerie, côté navigateur : **une seule** WebSocket par
 * onglet (`/api/chat/ws`, prise par `worker.ts` puis le Durable Object),
 * partagée par tous les abonnés (pastille, liste des discussions, fil ouvert).
 *
 * Le direct n'est qu'un accélérateur : la base reste la vérité. Quand il
 * tombe (réseau, veille, déploiement) ou n'existe pas (`next dev`), `direct`
 * passe à faux et les abonnés sondent en HTTP ; quand il revient, l'événement
 * `reconnecte` leur dit de rattraper ce qu'ils ont manqué (curseur `apres`).
 */
export type EvenementCanal =
  | EvenementDirect
  | { type: "reconnecte" };

type Abonne = (e: EvenementCanal) => void;

const abonnes = new Set<Abonne>();
const ecouteursEtat = new Set<() => void>();
let ws: WebSocket | null = null;
let direct = false;
let tentatives = 0;
let reconnexion: ReturnType<typeof setTimeout> | null = null;
let battement: ReturnType<typeof setInterval> | null = null;
let attentePong: ReturnType<typeof setTimeout> | null = null;

const BATTEMENT_MS = 25_000;
const DELAI_PONG_MS = 10_000;
const ATTENTE_MAX_MS = 30_000;

function changerEtat(v: boolean) {
  if (v === direct) return;
  direct = v;
  ecouteursEtat.forEach(fn => fn());
}

const emettre = (e: EvenementCanal) => abonnes.forEach(fn => { try { fn(e); } catch (err) { console.error(err); } });

function arreterBattement() {
  if (battement) clearInterval(battement);
  if (attentePong) clearTimeout(attentePong);
  battement = attentePong = null;
}

function connecter() {
  if (ws || abonnes.size === 0) return;
  if (reconnexion) { clearTimeout(reconnexion); reconnexion = null; }
  const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/chat/ws`;
  let socket: WebSocket;
  try { socket = new WebSocket(url); } catch { planifierReconnexion(); return; }
  ws = socket;

  socket.onopen = () => {
    tentatives = 0;
    changerEtat(true);
    emettre({ type: "reconnecte" });
    // Maintien en vie : le Durable Object répond « pong » sans se réveiller.
    // Pas de réponse = connexion morte (Wi-Fi coupé…) : on la relance.
    battement = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) return;
      socket.send("ping");
      if (attentePong) clearTimeout(attentePong);
      attentePong = setTimeout(() => socket.close(), DELAI_PONG_MS);
    }, BATTEMENT_MS);
  };

  socket.onmessage = ev => {
    if (ev.data === "pong") { if (attentePong) clearTimeout(attentePong); attentePong = null; return; }
    try { emettre(JSON.parse(String(ev.data)) as EvenementDirect); } catch { /* message illisible : ignoré */ }
  };

  socket.onclose = () => {
    if (ws === socket) ws = null;
    arreterBattement();
    changerEtat(false);
    planifierReconnexion();
  };
}

function planifierReconnexion() {
  if (abonnes.size === 0 || reconnexion) return;
  // 1 s, 2 s, 4 s… jusqu'à 30 s, avec un peu de hasard pour que tous les
  // postes ne reviennent pas à la même seconde après un déploiement.
  const delai = Math.min(ATTENTE_MAX_MS, 1000 * 2 ** tentatives++) * (0.75 + Math.random() * 0.5);
  reconnexion = setTimeout(() => { reconnexion = null; connecter(); }, delai);
}

/** Retour sur l'onglet ou sur le réseau : inutile d'attendre la fin du délai. */
function relancer() {
  if (document.visibilityState !== "visible" || ws) return;
  tentatives = 0;
  connecter();
}

function deconnecter() {
  if (reconnexion) clearTimeout(reconnexion);
  reconnexion = null;
  arreterBattement();
  const s = ws;
  ws = null;
  if (s) { s.onclose = null; s.close(1000); }
  changerEtat(false);
  document.removeEventListener("visibilitychange", relancer);
  window.removeEventListener("online", relancer);
}

/** S'abonne au direct ; renvoie la fonction de désabonnement. */
export function abonnerChat(fn: Abonne): () => void {
  abonnes.add(fn);
  if (abonnes.size === 1) {
    document.addEventListener("visibilitychange", relancer);
    window.addEventListener("online", relancer);
    connecter();
  }
  return () => {
    abonnes.delete(fn);
    if (abonnes.size === 0) deconnecter();
  };
}

/** Appelle `fn` à chaque événement du direct, tant que `actif`. */
export function useEvenementsChat(actif: boolean, fn: Abonne) {
  const ref = useRef(fn);
  useEffect(() => { ref.current = fn; });
  useEffect(() => {
    if (!actif) return;
    return abonnerChat(e => ref.current(e));
  }, [actif]);
}

/** Vrai quand le direct est ouvert ; faux = les abonnés doivent sonder. */
export function useDirect(): boolean {
  return useSyncExternalStore(
    fn => { ecouteursEtat.add(fn); return () => ecouteursEtat.delete(fn); },
    () => direct,
    () => false,
  );
}
