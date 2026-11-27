"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import NavBar from "../../components/NavBar";
import { useCompte } from "../../components/AuthProvider";
import { useTempsReel } from "../../lib/temps-reel";
import { estMissionAlerte, PRIORITE_ALERTE, validations } from "../../lib/missionsAccueil";
import { useCouleurProfil } from "../../lib/useCouleurProfil";

// ─── Types ────────────────────────────────────────────────────────────────────

type Membre = { id: string; nom: string; couleur?: string | null; groupe?: string | null };

type Statut = "a_faire" | "en_cours" | "fait";

type Fiche = {
  id: string;
  genre: "point" | "mission";
  titre: string;
  description: string | null;
  statut: Statut;
  priorite: number;
  deadline: string | null;
  assignes: string[];
  /** Assignés ayant validé leur part depuis l'accueil (mission à plusieurs). */
  valide_par?: string[];
  evenement_id: string | null;
  seance_id: string | null;
  decision: string | null;
  /** Qui présente le point : id `equipe`, ou nom d'une personne extérieure. */
  intervenant?: string | null;
  cree_par: string | null;
  cree_le: string;
  fait_le: string | null;
};

type EvPrep = {
  id: string;
  titre: string;
  type: string;
  date_debut: string | null;
  date_fin: string | null;
  heure_debut: string | null;
  heure_fin: string | null;
  lieu: string | null;
  description: string | null;
  statut: string;
  responsables: string[];
  agenda_id: string | null;
};

type Seance = {
  id: string;
  date: string;
  titre: string | null;
  statut: "en_cours" | "terminee";
  participants: string[];
  compte_rendu: string | null;
  cree_le: string;
  terminee_le: string | null;
};

type Retour = {
  id: string;
  evenement_id: string;
  frequentation: number | null;
  note: number | null;
  a_refaire: "oui" | "a_voir" | "non" | null;
  positif: string | null;
  ameliorer: string | null;
  idees: string | null;
  cree_par: string | null;
  cree_le: string;
};

type EvAgenda = {
  id: string; parent_id?: string | null; titre: string; type: string;
  date_debut: string; date_fin: string; heure_debut?: string; heure_fin?: string; membres: string[];
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const PRIORITES = [
  { v: 3, label: "Urgente", couleur: "var(--rouge)" },
  { v: 2, label: "Haute",   couleur: "var(--orange)" },
  { v: 1, label: "Normale", couleur: "var(--yellow)" },
  { v: 0, label: "Basse",   couleur: "var(--cream2)" },
];
const priorite = (v: number) => PRIORITES.find(p => p.v === v) ?? PRIORITES[2];

const TYPES_EV: Record<string, { icone: string; couleur: string }> = {
  "Animation":   { icone: "🎪", couleur: "var(--orange)" },
  "Soirée Jeux": { icone: "🌙", couleur: "var(--purple)" },
  "Réunion":     { icone: "💬", couleur: "var(--bleu)" },
  "Sortie":      { icone: "🚌", couleur: "var(--vert)" },
  "Partenariat": { icone: "🤝", couleur: "var(--rose)" },
  "Autre":       { icone: "📌", couleur: "var(--cream2)" },
};
// Types qui n'existent que dans l'agenda : affichés ici (frise « À venir »), pas proposés pour un événement du Bureau.
const TYPES_AGENDA: Record<string, { icone: string; couleur: string }> = {
  "Fermeture exceptionnelle": { icone: "🔒", couleur: "#d4d4d4" },
};
const typeEv = (t: string) => TYPES_EV[t] ?? TYPES_AGENDA[t] ?? TYPES_EV["Autre"];

const STATUTS_EV: { v: string; label: string; couleur: string }[] = [
  { v: "idee",        label: "💡 Idée",           couleur: "var(--cream2)" },
  { v: "preparation", label: "🛠️ En préparation", couleur: "var(--yellow)" },
  { v: "pret",        label: "✅ Prêt",           couleur: "var(--vert)" },
  { v: "termine",     label: "🏁 Terminé",        couleur: "var(--bleu)" },
  { v: "annule",      label: "✖ Annulé",          couleur: "var(--rose)" },
];
const statutEv = (v: string) => STATUTS_EV.find(s => s.v === v) ?? STATUTS_EV[0];
const EV_ARCHIVE = ["termine", "annule"];

/** Passé : clôturé à la main, ou dont la dernière date est derrière nous. */
const evPasse = (e: EvPrep) => EV_ARCHIVE.includes(e.statut) || !!(e.date_fin || e.date_debut) && (e.date_fin || e.date_debut)! < aujourdhui();

const A_REFAIRE: { v: "oui" | "a_voir" | "non"; label: string; couleur: string }[] = [
  { v: "oui",    label: "👍 À refaire",   couleur: "var(--vert)" },
  { v: "a_voir", label: "🤔 À revoir",    couleur: "var(--yellow)" },
  { v: "non",    label: "👎 Pas à refaire", couleur: "var(--rose)" },
];

// Côté agenda, ces types sont des absences ou des heures, pas des événements à préparer.
const estEvenementAgenda = (type: string) =>
  !/Congé|RTT|Récupération|Formation/.test(type) && type !== "Heures Exceptionnelles" && type !== "Glissement horaire";

// ─── Dates ────────────────────────────────────────────────────────────────────

const aujourdhui = () => format(new Date(), "yyyy-MM-dd");
const joursAvant = (date: string) => differenceInCalendarDays(parseISO(date), new Date());
const dateCourte = (d: string) => format(parseISO(d), "d MMM", { locale: fr });
const dateLongue = (d: string) => format(parseISO(d), "EEEE d MMMM yyyy", { locale: fr });

// SQLite rend « 2026-10-07 14:02:11 » (UTC, sans fuseau) ; l'API rend de l'ISO.
const instant = (s: string | null) => {
  if (!s) return 0;
  const iso = s.includes("T") ? s : s.replace(" ", "T") + "Z";
  return new Date(iso).getTime() || 0;
};

const enRetard = (f: Fiche) => f.statut !== "fait" && !!f.deadline && f.deadline < aujourdhui();

/** Ordre de priorité des tâches : en retard, puis priorité, puis échéance la plus proche. */
const comparerFiches = (a: Fiche, b: Fiche) =>
  (a.statut === "fait" ? 1 : 0) - (b.statut === "fait" ? 1 : 0)
  || (enRetard(b) ? 1 : 0) - (enRetard(a) ? 1 : 0)
  || b.priorite - a.priorite
  || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")
  || instant(a.cree_le) - instant(b.cree_le);

// ─── Compte rendu structuré ───────────────────────────────────────────────────

/**
 * Le compte rendu est stocké en JSON : une suite de sections, chacune avec ses
 * paragraphes, les personnes concernées (membres de l'équipe et invités) et
 * l'interlocuteur qui présente le sujet.
 *
 * Formats plus anciens, lus sans perte : la liste à plat de titres et de
 * paragraphes (`{ t: "section" | "p", texte }`) — chaque paragraphe rejoint la
 * section qui le précède, ou une section sans titre en tête — et le texte libre
 * d'avant les sections, qui devient une section sans titre.
 */
type SectionCR = {
  titre: string;
  paragraphes: string[];
  /** Identifiants `equipe`. */
  concernes: string[];
  /** Noms libres des personnes extérieures. */
  invites: string[];
  /** Services concernés en bloc (clés de SERVICES_CR), dont « toute l'équipe ». */
  services: string[];
  /** Identifiant `equipe` ou nom libre : l'interlocuteur n'est pas forcément concerné. */
  interlocuteur: string | null;
};

const SERVICES_CR: { v: string; label: string }[] = [
  { v: "equipe",  label: "Toute l'équipe" },
  { v: "ludo",    label: "Ludo" },
  { v: "jeunesse", label: "Jeunesse" },
  { v: "adulte",  label: "Adulte" },
  { v: "musique_cine", label: "Musique & Ciné" },
  { v: "accueil", label: "Accueil" },
];
const libelleService = (v: string) => SERVICES_CR.find(x => x.v === v)?.label ?? v;
type BlocCR = SectionCR;

const sectionVide = (titre = ""): SectionCR => ({ titre, paragraphes: [], concernes: [], invites: [], services: [], interlocuteur: null });
const chaines = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function lireCR(brut: string | null): BlocCR[] {
  if (!brut?.trim()) return [];
  let v: unknown;
  try { v = JSON.parse(brut); } catch { return [{ ...sectionVide(), paragraphes: [brut] }]; }
  if (!Array.isArray(v)) return [{ ...sectionVide(), paragraphes: [brut] }];
  const out: SectionCR[] = [];
  for (const b of v as Record<string, unknown>[]) {
    if (!b || typeof b !== "object") continue;
    if (b.t === "p") {
      if (typeof b.texte !== "string") continue;
      if (!out.length) out.push(sectionVide());
      out[out.length - 1].paragraphes.push(b.texte);
    } else if (b.t === "section" || "titre" in b) {
      out.push({
        titre: typeof b.titre === "string" ? b.titre : typeof b.texte === "string" ? b.texte : "",
        paragraphes: chaines(b.paragraphes),
        concernes: chaines(b.concernes),
        invites: chaines(b.invites),
        services: chaines(b.services),
        interlocuteur: typeof b.interlocuteur === "string" && b.interlocuteur ? b.interlocuteur : null,
      });
    }
  }
  return out;
}
const ecrireCR = (blocs: BlocCR[]) => JSON.stringify(blocs);
const sectionsCR = (blocs: BlocCR[]) => blocs.filter(b => b.titre.trim()).map(b => b.titre.trim());
const sectionRemplie = (s: SectionCR) =>
  !!(s.titre.trim() || s.paragraphes.some(p => p.trim()) || s.concernes.length || s.invites.length || s.services.length || s.interlocuteur);
/** Nom affiché d'une personne de section : membre de l'équipe ou invité (nom tel quel). */
const nomPersonne = (id: string, equipe: Membre[]) => equipe.find(m => m.id === id)?.nom ?? id;
/** Tout le texte d'une section, pour la recherche. */
const texteSection = (s: SectionCR, equipe: Membre[]) => [
  s.titre, ...s.paragraphes, ...s.services.map(libelleService), ...s.concernes.map(id => nomPersonne(id, equipe)), ...s.invites,
  s.interlocuteur ? nomPersonne(s.interlocuteur, equipe) : "",
].join("\n");

// ─── Recherche ────────────────────────────────────────────────────────────────

/** Casse, accents et espaces multiples ignorés : « reunion » trouve « Réunion ». */
const normaliser = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Met en évidence les occurrences de `q` dans `texte`, accents compris. */
function Surligne({ texte, q }: { texte: string; q: string }) {
  const nq = normaliser(q.trim());
  if (!nq) return <>{texte}</>;
  // Chaque caractère normalisé garde l'indice de son caractère d'origine :
  // « é » devient « e » mais le surlignage porte bien sur « é ».
  let norm = "";
  const origine: number[] = [];
  for (let i = 0; i < texte.length; i++) {
    const n = normaliser(texte[i]);
    for (const c of n) { norm += c; origine.push(i); }
  }
  const morceaux: React.ReactNode[] = [];
  let curseur = 0, depuis = 0, k = 0;
  while ((curseur = norm.indexOf(nq, curseur)) !== -1) {
    const debut = origine[curseur];
    const fin = origine[curseur + nq.length - 1] + 1;
    if (debut >= depuis) {
      morceaux.push(texte.slice(depuis, debut));
      morceaux.push(<mark key={k++} style={{ background: "var(--yellow)", color: "inherit", borderRadius: 3, padding: "0 1px" }}>{texte.slice(debut, fin)}</mark>);
      depuis = fin;
    }
    curseur += nq.length;
  }
  morceaux.push(texte.slice(depuis));
  return <>{morceaux}</>;
}

// ─── Texte mis en forme ───────────────────────────────────────────────────────

/**
 * Les notes de réunion s'écrivent au clavier, sans éditeur riche : on y lit
 * les conventions que l'équipe utilise déjà — tirets et puces, listes
 * numérotées, sous-titres terminés par « : » (« Usagers : », « => Matériel : »),
 * flèches « => » — pour les afficher (et les exporter) comme de vraies listes.
 */
type LigneRiche =
  | { t: "titre"; texte: string }
  | { t: "puce"; texte: string; niveau: number }
  | { t: "num"; texte: string; n: string }
  | { t: "fleche"; texte: string }
  | { t: "p"; texte: string }
  | { t: "vide" };

function lignesRiches(texte: string): LigneRiche[] {
  return texte.replace(/\r/g, "").split("\n").map((brute): LigneRiche => {
    const l = brute.trim();
    if (!l) return { t: "vide" };
    const puce = brute.match(/^(\s*)[-•*–·]\s+(.*)$/);
    if (puce) return { t: "puce", texte: puce[2].trim(), niveau: puce[1].length >= 2 ? 1 : 0 };
    const num = l.match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (num) return { t: "num", texte: num[2], n: num[1] };
    const fleche = l.match(/^=>\s*(.*)$/);
    const corps = fleche ? fleche[1].trim() : l;
    // Un sous-titre : court, terminé par « : », sans phrase après.
    if (/:\s*$/.test(corps) && corps.length <= 70) return { t: "titre", texte: corps.replace(/\s*:\s*$/, "") };
    if (fleche) return { t: "fleche", texte: corps };
    return { t: "p", texte: l };
  });
}

/** Affiche un texte de notes avec ses listes et sous-titres ; la recherche reste surlignée. */
function TexteRiche({ texte, q = "", style }: { texte: string; q?: string; style?: React.CSSProperties }) {
  const lignes = lignesRiches(texte);
  const blocs: React.ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lignes.length) {
    const l = lignes[i];
    if (l.t === "puce" || l.t === "num") {
      // Une liste continue tant que les lignes sont du même genre.
      const genre = l.t;
      const items: LigneRiche[] = [];
      while (i < lignes.length && lignes[i].t === genre) items.push(lignes[i++]);
      const Liste = genre === "num" ? "ol" : "ul";
      blocs.push(
        <Liste key={k++} start={genre === "num" ? Number((items[0] as { n: string }).n) || 1 : undefined}
          style={{ margin: "2px 0", paddingLeft: 22, display: "flex", flexDirection: "column", gap: 2, listStyleType: genre === "num" ? "decimal" : "disc" }}>
          {items.map((it, j) => (
            <li key={j} style={{ display: "list-item", marginLeft: it.t === "puce" && it.niveau ? 16 : 0, listStyleType: it.t === "puce" && it.niveau ? "circle" : undefined }}><Surligne texte={(it as { texte: string }).texte} q={q} /></li>
          ))}
        </Liste>
      );
      continue;
    }
    if (l.t === "titre") blocs.push(<div key={k++} style={{ fontWeight: 900, marginTop: k > 1 ? 6 : 0, fontSize: "0.95em" }}><Surligne texte={l.texte} q={q} /></div>);
    else if (l.t === "fleche") blocs.push(<div key={k++} style={{ display: "flex", gap: 6 }}><span style={{ fontWeight: 900 }}>➜</span><span><Surligne texte={l.texte} q={q} /></span></div>);
    else if (l.t === "p") blocs.push(<div key={k++}><Surligne texte={l.texte} q={q} /></div>);
    else if (l.t === "vide" && blocs.length && lignes[i + 1] && lignes[i + 1].t !== "vide") blocs.push(<div key={k++} style={{ height: 6 }} />);
    i++;
  }
  return <div style={{ lineHeight: 1.5, overflowWrap: "anywhere", ...style }}>{blocs}</div>;
}

// ─── Appels API ───────────────────────────────────────────────────────────────

async function envoyer<T>(url: string, method: string, body?: unknown): Promise<T | null> {
  const r = await fetch(url, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);
  if (!r) { alert("Connexion impossible."); return null; }
  const data = await r.json().catch(() => ({})) as any;
  if (!r.ok) { alert(data?.error ?? "Erreur"); return null; }
  return data as T;
}
const lireListe = <T,>(url: string) =>
  fetch(url, { cache: "no-store" }).then(r => r.json() as Promise<any>).then(d => (Array.isArray(d) ? d : []) as T[]).catch(() => [] as T[]);

// ─── Suggestions d'ordre du jour ──────────────────────────────────────────────

type Suggestion = { cle: string; titre: string; description: string; priorite: number; evenement_id?: string };

/**
 * Sujets proposés quand l'ordre du jour est vide au lancement d'une réunion :
 * ce qui dérape (retards, urgences, tâches sans responsable), ce qui approche
 * (événements à préparer) et ce qui mérite un bilan.
 */
function suggererPoints(fiches: Fiche[], evs: EvPrep[], retours: Retour[], agenda: EvAgenda[], seances: Seance[], nomDe: (id: string) => string): Suggestion[] {
  const out: Suggestion[] = [];
  const auj = aujourdhui();
  const missions = fiches.filter(f => f.genre === "mission" && f.statut !== "fait");

  for (const m of missions.filter(enRetard).sort(comparerFiches).slice(0, 5)) {
    out.push({
      cle: `retard-${m.id}`, titre: `Mission en retard : ${m.titre}`, priorite: 2,
      description: `Échéance dépassée le ${dateCourte(m.deadline!)}${m.assignes.length ? ` — ${m.assignes.map(nomDe).join(", ")}` : ""}.`,
    });
  }
  for (const m of missions.filter(m => m.priorite === 3 && m.statut === "a_faire" && !enRetard(m)).slice(0, 5)) {
    out.push({ cle: `urgent-${m.id}`, titre: `Urgent, pas encore commencé : ${m.titre}`, priorite: 2, description: "Qui s'en charge et quand ?" });
  }
  const orphelines = missions.filter(m => !m.assignes.length);
  if (orphelines.length) {
    out.push({
      cle: "orphelines", priorite: 1,
      titre: `Répartir ${orphelines.length} mission${orphelines.length > 1 ? "s" : ""} sans responsable`,
      description: orphelines.slice(0, 8).map(m => `• ${m.titre}`).join("\n"),
    });
  }

  // Retours à faire : événements passés depuis moins de deux mois, sans retour écrit.
  const avecRetour = new Set(retours.map(r => r.evenement_id));
  const recent = format(addDays(new Date(), -60), "yyyy-MM-dd");
  for (const ev of evs) {
    if (ev.statut === "annule") continue;
    const fin = ev.date_fin || ev.date_debut;
    if (evPasse(ev)) {
      if (!avecRetour.has(ev.id) && (!fin || fin >= recent)) {
        out.push({ cle: `bilan-${ev.id}`, titre: `Retour sur : ${ev.titre}`, priorite: 1, evenement_id: ev.id, description: "Ce qui a marché, ce qu'on change la prochaine fois — à noter ensuite dans Événements › Passés." });
      }
      continue;
    }
    const liees = fiches.filter(f => f.evenement_id === ev.id && f.genre === "mission");
    const faites = liees.filter(f => f.statut === "fait").length;
    if (ev.date_debut && joursAvant(ev.date_debut) <= 30 && ev.statut !== "pret") {
      const j = joursAvant(ev.date_debut);
      out.push({
        cle: `prep-${ev.id}`, evenement_id: ev.id, priorite: j <= 7 ? 2 : 1,
        titre: `Préparation : ${ev.titre} (${j === 0 ? "aujourd'hui" : `J-${j}`})`,
        description: liees.length ? `${faites}/${liees.length} mission${liees.length > 1 ? "s" : ""} terminée${faites > 1 ? "s" : ""}.` : "Aucune mission de préparation pour l'instant.",
      });
    } else if (!ev.date_debut) {
      out.push({ cle: `date-${ev.id}`, titre: `Fixer une date : ${ev.titre}`, priorite: 1, evenement_id: ev.id, description: "Projet sans date pour l'instant." });
    }
  }

  // Événements de l'agenda dans les 3 semaines, hors ceux déjà suivis en préparation.
  const suivis = new Set(evs.map(e => e.agenda_id).filter(Boolean));
  const limite = format(addDays(new Date(), 21), "yyyy-MM-dd");
  const vus = new Set<string>();
  for (const a of agenda) {
    if (!estEvenementAgenda(a.type) || suivis.has(a.id) || a.date_fin < auj || a.date_debut > limite) continue;
    const serie = a.parent_id || a.titre;
    if (vus.has(serie)) continue;
    vus.add(serie);
    out.push({ cle: `agenda-${a.id}`, titre: `À venir : ${a.titre || a.type} (${dateCourte(a.date_debut)})`, priorite: 1, description: `${a.type} prévu à l'agenda.` });
  }

  const derniere = seances.filter(s => s.statut === "terminee").sort((a, b) => instant(b.terminee_le) - instant(a.terminee_le))[0];
  const depuis = derniere ? instant(derniere.terminee_le) : 0;
  const terminees = fiches.filter(f => f.genre === "mission" && f.statut === "fait" && instant(f.fait_le) > depuis);
  if (terminees.length) {
    out.push({
      cle: "terminees", priorite: 0,
      titre: `Point sur ${terminees.length} mission${terminees.length > 1 ? "s" : ""} terminée${terminees.length > 1 ? "s" : ""}${derniere ? " depuis la dernière réunion" : ""}`,
      description: terminees.slice(0, 10).map(m => `• ${m.titre}`).join("\n"),
    });
  }

  if (!out.length) {
    out.push({ cle: "tour", titre: "Tour de table", priorite: 1, description: "Chacun partage ce qui l'occupe et ce qui le bloque." });
    out.push({ cle: "planning", titre: "Planning des prochaines semaines", priorite: 1, description: "Absences, renforts, événements." });
  }
  return out;
}

// ─── Petits composants ────────────────────────────────────────────────────────

const inp: React.CSSProperties = {
  border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px",
  background: "var(--white)", outline: "none", fontSize: 14,
  fontFamily: "inherit", width: "100%", boxSizing: "border-box",
};

const etiquette: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6, marginBottom: 4, display: "block" };

/** `valide` : coche verte, la personne a validé sa part de la mission. */
function Avatar({ m, taille = 24, valide }: { m?: Membre; taille?: number; valide?: boolean }) {
  if (!m) return null;
  const initiales = m.nom.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span title={valide ? `${m.nom} · a validé sa part` : m.nom} style={{
      position: "relative",
      width: taille, height: taille, borderRadius: "50%", flexShrink: 0,
      background: m.couleur || (m.groupe === "A" ? "#f87171" : m.groupe === "B" ? "#60a5fa" : "#a8e063"),
      border: "1.5px solid var(--ink)", fontSize: taille * 0.42, fontWeight: 900,
      display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink)",
    }}>
      {initiales}
      {valide && (
        <span style={{
          position: "absolute", right: -4, bottom: -4, width: Math.max(12, taille * 0.55), height: Math.max(12, taille * 0.55),
          borderRadius: "50%", background: "var(--vert)", border: "1.5px solid var(--ink)", fontSize: Math.max(7, taille * 0.32),
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
        }}>✓</span>
      )}
    </span>
  );
}

/** « Proposé par » : qui a ajouté le point à l'ordre du jour. */
function Auteur({ id, equipe }: { id: string | null; equipe: Membre[] }) {
  const m = id ? equipe.find(x => x.id === id) : undefined;
  if (!m) return null;
  return (
    <span title={`Proposé par ${m.nom}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, opacity: 0.75 }}>
      par <Avatar m={m} taille={16} /> <b>{m.nom}</b>
    </span>
  );
}

function Pastille({ texte, fond, titre }: { texte: string; fond: string; titre?: string }) {
  return (
    <span title={titre} style={{
      fontSize: 11, fontWeight: 800, padding: "2px 7px", borderRadius: 5, whiteSpace: "nowrap",
      background: fond, border: "1.5px solid var(--ink)", lineHeight: 1.4,
    }}>{texte}</span>
  );
}

function BadgeDeadline({ f }: { f: Fiche }) {
  if (!f.deadline) return null;
  if (f.statut === "fait") return <Pastille texte={`📅 ${dateCourte(f.deadline)}`} fond="var(--white)" />;
  const j = joursAvant(f.deadline);
  if (j < 0) return <Pastille texte={`⏰ En retard · ${-j} j`} fond="var(--rouge)" titre={dateLongue(f.deadline)} />;
  if (j === 0) return <Pastille texte="⏰ Aujourd'hui" fond="var(--orange)" />;
  if (j <= 3) return <Pastille texte={`⏰ J-${j}`} fond="var(--orange)" titre={dateLongue(f.deadline)} />;
  return <Pastille texte={`📅 ${dateCourte(f.deadline)}`} fond="var(--white)" titre={dateLongue(f.deadline)} />;
}

function ChoixPriorite({ valeur, onChange, compact }: { valeur: number; onChange: (v: number) => void; compact?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {[...PRIORITES].reverse().map(p => {
        const actif = p.v === valeur;
        return (
          <button key={p.v} type="button" onClick={() => onChange(p.v)} title={p.label}
            style={{
              fontFamily: "inherit", cursor: "pointer", fontWeight: actif ? 900 : 600,
              fontSize: compact ? 11 : 13, padding: compact ? "2px 7px" : "5px 10px", borderRadius: 6,
              background: actif ? p.couleur : "var(--white)",
              border: actif ? "2px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)",
              boxShadow: actif ? "2px 2px 0 var(--ink)" : "none",
            }}>{p.label}</button>
        );
      })}
    </div>
  );
}

function ChoixMembres({ equipe, valeur, onChange }: { equipe: Membre[]; valeur: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {equipe.map(m => {
        const actif = valeur.includes(m.id);
        return (
          <button key={m.id} type="button"
            onClick={() => onChange(actif ? valeur.filter(x => x !== m.id) : [...valeur, m.id])}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontFamily: "inherit",
              padding: "3px 10px 3px 3px", borderRadius: 20, fontSize: 13, fontWeight: actif ? 800 : 500,
              background: actif ? "var(--yellow)" : "var(--white)",
              border: actif ? "2px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)",
              opacity: actif ? 1 : 0.75,
            }}>
            <Avatar m={m} taille={22} />{m.nom}
          </button>
        );
      })}
    </div>
  );
}

function Segments<T extends string>({ options, valeur, onChange }: { options: { v: T; label: string }[]; valeur: T; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "inline-flex", border: "2px solid var(--ink)", borderRadius: 8, overflow: "hidden", flexWrap: "wrap" }}>
      {options.map((o, i) => (
        <button key={o.v} type="button" onClick={() => onChange(o.v)} style={{
          fontFamily: "inherit", cursor: "pointer", padding: "6px 12px", fontSize: 13,
          fontWeight: o.v === valeur ? 800 : 500, border: "none",
          borderLeft: i ? "2px solid var(--ink)" : "none",
          background: o.v === valeur ? "var(--ink)" : "var(--white)",
          color: o.v === valeur ? "var(--cream)" : "var(--ink)",
        }}>{o.label}</button>
      ))}
    </div>
  );
}

// Fenêtres ouvertes, de la plus ancienne à la plus récente : une mission peut
// s'ouvrir par-dessus un événement, et Échap ne doit fermer que celle du dessus.
const pileModales: object[] = [];

function Modal({ titre, onFermer, children, large }: { titre: string; onFermer: () => void; children: React.ReactNode; large?: boolean }) {
  const fermer = useRef(onFermer);
  useEffect(() => { fermer.current = onFermer; });
  useEffect(() => {
    const jeton = {};
    pileModales.push(jeton);
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape" && pileModales[pileModales.length - 1] === jeton) fermer.current(); };
    window.addEventListener("keydown", echap);
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      pileModales.splice(pileModales.indexOf(jeton), 1);
      window.removeEventListener("keydown", echap);
      document.body.style.overflow = precedent;
    };
  }, []);
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onFermer(); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "max(4vh, 12px) 12px", overflowY: "auto",
    }}>
      <div className="pop-card" style={{
        width: "100%", maxWidth: large ? 820 : 560, background: "var(--cream)", padding: 0,
        animation: "fadeInUp 0.15s ease-out",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "2px solid var(--ink)" }}>
          <h2 className="bc" style={{ margin: 0, fontSize: 20, flex: 1, minWidth: 0 }}>{titre}</h2>
          <button onClick={onFermer} aria-label="Fermer" style={{
            width: 32, height: 32, borderRadius: 6, border: "2px solid var(--ink)", background: "var(--white)",
            cursor: "pointer", fontWeight: 900, fontSize: 16, fontFamily: "inherit", flexShrink: 0,
          }}>✕</button>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>
      </div>
    </div>
  );
}

function Section({ titre, droite, children }: { titre: string; droite?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 0 }}>
      <div className="pop-sec-head" style={{ marginBottom: 0 }}>
        <span>{titre}</span><div />{droite}
      </div>
      {children}
    </section>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      border: "2px dashed rgba(0,0,0,0.2)", borderRadius: 10, padding: "18px 14px",
      textAlign: "center", fontSize: 14, opacity: 0.65,
    }}>{children}</div>
  );
}

// ─── Éditeur du compte rendu ──────────────────────────────────────────────────

/** Zone de texte qui grandit avec son contenu : un paragraphe reste lisible d'un bloc. */
function TexteAuto({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 4}px`;
  }, [value]);
  return <textarea ref={ref} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2}
    style={{ ...inp, resize: "none", overflow: "hidden", lineHeight: 1.5, ...style }} />;
}

function EditeurCR({ blocs, equipe, onChange }: { blocs: BlocCR[]; equipe: Membre[]; onChange: (b: BlocCR[]) => void }) {
  // Un seul panneau ouvert à la fois : personnes concernées ou interlocuteur d'une section.
  const [panneau, setPanneau] = useState<{ i: number; quoi: "concernes" | "interlocuteur" } | null>(null);
  const [nouvelInvite, setNouvelInvite] = useState("");

  const majSection = (i: number, champs: Partial<SectionCR>) => onChange(blocs.map((b, j) => j === i ? { ...b, ...champs } : b));
  const deplacer = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= blocs.length) return;
    const n = [...blocs];
    [n[i], n[j]] = [n[j], n[i]];
    onChange(n);
    setPanneau(null);
  };
  const retirer = (i: number) => {
    if (sectionRemplie(blocs[i]) && !confirm("Supprimer cette section et tout son contenu ?")) return;
    onChange(blocs.filter((_, j) => j !== i));
    setPanneau(null);
  };
  const ajouterSection = () => onChange([...blocs, { ...sectionVide(), paragraphes: [""] }]);
  const ajouterParagraphe = (i: number) => majSection(i, { paragraphes: [...blocs[i].paragraphes, ""] });
  const basculerPanneau = (i: number, quoi: "concernes" | "interlocuteur") => {
    setNouvelInvite("");
    setPanneau(p => p?.i === i && p.quoi === quoi ? null : { i, quoi });
  };
  /** Ajoute un invité aux personnes concernées (un nom de l'équipe coche le membre). */
  const ajouterInvite = (i: number) => {
    const nom = nouvelInvite.trim();
    if (!nom) return;
    const s = blocs[i];
    const membre = equipe.find(m => normaliser(m.nom) === normaliser(nom));
    if (membre) majSection(i, { concernes: s.concernes.includes(membre.id) ? s.concernes : [...s.concernes, membre.id] });
    else majSection(i, { invites: s.invites.some(x => normaliser(x) === normaliser(nom)) ? s.invites : [...s.invites, nom] });
    setNouvelInvite("");
  };
  /** Interlocuteur extérieur : il présente le sujet sans être ajouté aux concernés. */
  const choisirInterlocuteurLibre = (i: number) => {
    const nom = nouvelInvite.trim();
    if (!nom) return;
    const membre = equipe.find(m => normaliser(m.nom) === normaliser(nom));
    majSection(i, { interlocuteur: membre ? membre.id : nom });
    setNouvelInvite("");
  };

  const outil: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: "1.5px solid rgba(0,0,0,0.25)", background: "var(--white)",
    cursor: "pointer", fontSize: 12, padding: 0, fontFamily: "inherit", flexShrink: 0,
  };
  const bouton = (actif: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 8, cursor: "pointer",
    fontFamily: "inherit", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap",
    border: "2px solid var(--ink)", background: actif ? "var(--yellow)" : "var(--white)",
    boxShadow: actif ? "2px 2px 0 var(--ink)" : "none",
  });
  const puce = (actif: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, cursor: "pointer",
    fontFamily: "inherit", fontSize: 12, fontWeight: actif ? 800 : 500,
    background: actif ? "var(--yellow)" : "var(--white)", border: actif ? "2px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {blocs.length === 0 && (
        <Vide>Commence par une section (« Planning », « Animations »…).</Vide>
      )}
      {blocs.map((s, i) => {
        const ouvert = panneau?.i === i ? panneau.quoi : null;
        const nbConcernes = s.concernes.length + s.invites.length + s.services.length;
        // L'interlocuteur se choisit parmi l'équipe, les invités de la section ou un nom libre.
        const libres = [...s.invites, ...(s.interlocuteur && !equipe.some(m => m.id === s.interlocuteur) && !s.invites.includes(s.interlocuteur) ? [s.interlocuteur] : [])];
        const choixInterlocuteur = [...equipe.map(m => ({ cle: m.id, nom: m.nom, membre: m as Membre | undefined })), ...libres.map(n => ({ cle: n, nom: n, membre: undefined }))];
        return (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0, border: "2.5px solid var(--ink)", borderRadius: 12, background: "var(--white)", overflow: "hidden" }}>
              {/* En-tête : titre + outils de la section */}
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", padding: 8, background: "var(--cream2)", borderBottom: "2px solid var(--ink)" }}>
                <input value={s.titre} onChange={e => majSection(i, { titre: e.target.value })} placeholder="Titre de la section"
                  style={{ ...inp, flex: "1 1 180px", width: "auto", fontWeight: 900, fontSize: 16, textTransform: "uppercase", letterSpacing: "0.03em" }} />
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  <button type="button" style={bouton(false)} onClick={() => ajouterParagraphe(i)} title="Ajouter un paragraphe à cette section">+ Paragraphe</button>
                  <button type="button" style={bouton(ouvert === "concernes")} onClick={() => basculerPanneau(i, "concernes")} title="Personnes concernées par ce sujet">
                    👥 Concernés{nbConcernes ? ` · ${nbConcernes}` : ""}
                  </button>
                  <button type="button" style={bouton(ouvert === "interlocuteur")} onClick={() => basculerPanneau(i, "interlocuteur")} title="Qui présente ce sujet">
                    🎤 {s.interlocuteur ? nomPersonne(s.interlocuteur, equipe) : "Interlocuteur"}
                  </button>
                </div>
              </div>

              {/* Panneau : personnes concernées */}
              {ouvert === "concernes" && (
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, background: "var(--cream)", borderBottom: "2px dashed rgba(0,0,0,0.2)" }}>
                  <span style={etiquette}>Services</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {SERVICES_CR.map(sv => {
                      const actif = s.services.includes(sv.v);
                      return (
                        <button key={sv.v} type="button" style={puce(actif)}
                          onClick={() => majSection(i, { services: actif ? s.services.filter(x => x !== sv.v) : [...s.services, sv.v] })}>
                          {sv.v === "equipe" ? "👥 " : ""}{sv.label}
                        </button>
                      );
                    })}
                  </div>
                  <span style={etiquette}>Agents concernés</span>
                  <ChoixMembres equipe={equipe} valeur={s.concernes} onChange={v => majSection(i, { concernes: v })} />
                  <span style={etiquette}>Invités</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {s.invites.map(n => (
                      <span key={n} style={puce(true)}>
                        {n}
                        <button type="button" onClick={() => majSection(i, { invites: s.invites.filter(x => x !== n) })}
                          style={{ border: "none", background: "none", cursor: "pointer", fontWeight: 900, color: "#b91c1c", padding: 0 }}>✕</button>
                      </span>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={nouvelInvite} onChange={e => setNouvelInvite(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouterInvite(i); }}
                      placeholder="Nom d'un invité (Entrée)…" style={inp} />
                    <button type="button" className="pop-btn pop-btn-outline" onClick={() => ajouterInvite(i)} disabled={!nouvelInvite.trim()}>+</button>
                  </div>
                </div>
              )}

              {/* Panneau : interlocuteur */}
              {ouvert === "interlocuteur" && (
                <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8, background: "var(--cream)", borderBottom: "2px dashed rgba(0,0,0,0.2)" }}>
                  <span style={etiquette}>Qui présente ce sujet ?</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {choixInterlocuteur.map(c => {
                      const actif = s.interlocuteur === c.cle;
                      return (
                        <button key={c.cle} type="button" style={puce(actif)}
                          onClick={() => majSection(i, { interlocuteur: actif ? null : c.cle })}>
                          {c.membre ? <Avatar m={c.membre} taille={18} /> : <span>🙋</span>}{c.nom}{!c.membre && <span style={{ opacity: 0.5 }}> (invité)</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={nouvelInvite} onChange={e => setNouvelInvite(e.target.value)} onKeyDown={e => { if (e.key === "Enter") choisirInterlocuteurLibre(i); }}
                      placeholder="Ou un intervenant extérieur : son nom (Entrée)…" style={inp} />
                    <button type="button" className="pop-btn pop-btn-outline" onClick={() => choisirInterlocuteurLibre(i)} disabled={!nouvelInvite.trim()}>+</button>
                  </div>
                </div>
              )}

              {/* Corps : qui, puis les paragraphes */}
              <div style={{ padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {(s.interlocuteur || nbConcernes > 0) && !ouvert && (
                  <ResumePersonnes s={s} equipe={equipe} />
                )}
                {s.paragraphes.map((p, k) => (
                  <div key={k} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <TexteAuto value={p} placeholder="Paragraphe…"
                      onChange={v => majSection(i, { paragraphes: s.paragraphes.map((x, j) => j === k ? v : x) })} />
                    <button type="button" style={outil} title="Supprimer ce paragraphe"
                      onClick={() => {
                        if (p.trim() && !confirm("Supprimer ce paragraphe ?")) return;
                        majSection(i, { paragraphes: s.paragraphes.filter((_, j) => j !== k) });
                      }}>✕</button>
                  </div>
                ))}
                {s.paragraphes.length === 0 && (
                  <button type="button" onClick={() => ajouterParagraphe(i)}
                    style={{ padding: 8, border: "2px dashed rgba(0,0,0,0.25)", borderRadius: 8, background: "transparent", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 700, opacity: 0.6 }}>
                    + Ajouter un paragraphe
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <div style={{ display: "flex", gap: 3 }}>
                <button type="button" style={outil} title="Monter" onClick={() => deplacer(i, -1)} disabled={i === 0}>↑</button>
                <button type="button" style={outil} title="Descendre" onClick={() => deplacer(i, 1)} disabled={i === blocs.length - 1}>↓</button>
              </div>
              <button type="button" style={{ ...outil, width: "100%" }} title="Supprimer la section" onClick={() => retirer(i)}>✕</button>
            </div>
          </div>
        );
      })}
      <div>
        <button type="button" className="pop-btn pop-btn-outline" style={{ padding: "4px 12px", fontSize: 13 }} onClick={ajouterSection}>+ Section</button>
      </div>
    </div>
  );
}

/** Interlocuteur et personnes concernées d'une section, en une ligne. */
function ResumePersonnes({ s, equipe, q = "" }: { s: SectionCR; equipe: Membre[]; q?: string }) {
  const membres = s.concernes.map(id => equipe.find(m => m.id === id)).filter((m): m is Membre => !!m);
  const nbConcernes = membres.length + s.invites.length + s.services.length;
  const interlocuteurExterieur = !!s.interlocuteur && !equipe.some(m => m.id === s.interlocuteur);
  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
      {s.interlocuteur && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px 2px 3px", borderRadius: 20, background: "var(--yellow)", border: "1.5px solid var(--ink)", fontWeight: 800 }}>
          {equipe.find(m => m.id === s.interlocuteur)
            ? <Avatar m={equipe.find(m => m.id === s.interlocuteur)} taille={18} />
            : <span style={{ paddingLeft: 4 }}>🎤</span>}
          présenté par <Surligne texte={nomPersonne(s.interlocuteur, equipe)} q={q} />
          {interlocuteurExterieur && <span style={{ fontWeight: 500, opacity: 0.6 }}>(invité)</span>}
        </span>
      )}
      {nbConcernes > 0 && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          <b>👥 Concernés :</b>
          {s.services.map(v => (
            <span key={v} style={{ padding: "0 7px", borderRadius: 5, background: "var(--turquoise)", border: "1.5px solid var(--ink)", fontWeight: 800 }}><Surligne texte={libelleService(v)} q={q} /></span>
          ))}
          {membres.map(m => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><Avatar m={m} taille={16} /><Surligne texte={m.nom} q={q} /></span>
          ))}
          {s.invites.map(n => (
            <span key={n} style={{ padding: "0 7px", borderRadius: 20, border: "1.5px dashed rgba(0,0,0,0.4)" }}><Surligne texte={n} q={q} /> <span style={{ opacity: 0.5 }}>(invité)</span></span>
          ))}
        </span>
      )}
    </div>
  );
}

/** « Présenté par » d'un point : avatar pour un membre, 🎤 pour une personne extérieure. */
function Intervenant({ valeur, equipe }: { valeur: string; equipe: Membre[] }) {
  const m = equipe.find(x => x.id === valeur);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "1px 9px 1px 3px", borderRadius: 20, background: "var(--yellow)", border: "1.5px solid var(--ink)", fontWeight: 800, fontSize: 12 }}>
      {m ? <Avatar m={m} taille={16} /> : <span style={{ paddingLeft: 4 }}>🎤</span>}
      présenté par {m ? m.nom : valeur}{!m && <span style={{ fontWeight: 500, opacity: 0.6 }}>(invité)</span>}
    </span>
  );
}

/** Choix de l'intervenant : un membre de l'équipe ou un nom libre (Ariane, une partenaire…). */
function ChoixIntervenant({ valeur, equipe, onChange }: { valeur: string | null; equipe: Membre[]; onChange: (v: string | null) => void }) {
  const [libre, setLibre] = useState("");
  const exterieur = valeur && !equipe.some(m => m.id === valeur) ? valeur : null;
  const puce = (actif: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, cursor: "pointer",
    fontFamily: "inherit", fontSize: 12, fontWeight: actif ? 800 : 500,
    background: actif ? "var(--yellow)" : "var(--white)", border: actif ? "2px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)",
  });
  const valider = () => {
    const nom = libre.trim();
    if (!nom) return;
    const m = equipe.find(x => normaliser(x.nom) === normaliser(nom));
    onChange(m ? m.id : nom);
    setLibre("");
  };
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {equipe.map(m => (
        <button key={m.id} type="button" style={puce(valeur === m.id)} onClick={() => onChange(valeur === m.id ? null : m.id)}>
          <Avatar m={m} taille={18} />{m.nom}
        </button>
      ))}
      {exterieur && (
        <button type="button" style={puce(true)} onClick={() => onChange(null)} title="Retirer">🎤 {exterieur} ✕</button>
      )}
      <input value={libre} onChange={e => setLibre(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); valider(); } }}
        onBlur={valider} placeholder="Ou une personne extérieure…" style={{ ...inp, width: 190, padding: "4px 10px", fontSize: 12 }} />
    </div>
  );
}

/** Lecture du compte rendu : une carte par section, paragraphes dedans, recherche surlignée. */
function LectureCR({ blocs, equipe, q }: { blocs: BlocCR[]; equipe: Membre[]; q: string }) {
  const visibles = blocs.filter(sectionRemplie);
  if (!visibles.length) return <div style={{ fontSize: 14, opacity: 0.5 }}>Pas de notes.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {visibles.map((s, i) => (
        <div key={i} style={{ border: "2px solid var(--ink)", borderRadius: 10, overflow: "hidden" }}>
          {s.titre.trim() && (
            <h3 className="bc" style={{ margin: 0, fontSize: 16, padding: "6px 10px", background: "var(--cream2)", borderBottom: "2px solid var(--ink)" }}>
              <Surligne texte={s.titre} q={q} />
            </h3>
          )}
          <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
            {(s.interlocuteur || s.concernes.length > 0 || s.invites.length > 0 || s.services.length > 0) && <ResumePersonnes s={s} equipe={equipe} q={q} />}
            {s.paragraphes.filter(p => p.trim()).map((p, k) => (
              <TexteRiche key={k} texte={p} q={q} style={{ fontSize: 14 }} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Carte d'une fiche (point ou mission) ─────────────────────────────────────

function CarteFiche({ f, equipe, evenements, onOuvrir, onBasculer }: {
  f: Fiche; equipe: Membre[]; evenements: EvPrep[];
  onOuvrir: () => void; onBasculer: () => void;
}) {
  const p = priorite(f.priorite);
  const ev = f.evenement_id ? evenements.find(e => e.id === f.evenement_id) : null;
  const fait = f.statut === "fait";
  return (
    <div className="pop-card" onClick={onOuvrir} style={{
      display: "flex", gap: 10, padding: "10px 12px 10px 0", cursor: "pointer", alignItems: "flex-start",
      background: fait ? "var(--cream2)" : "var(--white)", opacity: fait ? 0.65 : 1, overflow: "hidden", flexShrink: 0,
    }}>
      <div style={{ width: 6, alignSelf: "stretch", background: fait ? "transparent" : p.couleur, marginTop: -10, marginBottom: -10, flexShrink: 0 }} />
      <button
        onClick={e => { e.stopPropagation(); onBasculer(); }}
        title={fait ? "Rouvrir" : f.genre === "point" ? "Marquer comme abordé" : "Marquer comme fait"}
        style={{
          width: 24, height: 24, borderRadius: f.genre === "point" ? "50%" : 6, flexShrink: 0, marginTop: 1,
          border: "2px solid var(--ink)", background: fait ? "var(--vert)" : "var(--white)",
          cursor: "pointer", fontWeight: 900, fontSize: 13, padding: 0, fontFamily: "inherit",
        }}>{fait ? "✓" : ""}</button>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.25, textDecoration: fait ? "line-through" : "none", overflowWrap: "anywhere" }}>{f.titre}</div>
        {f.description && (
          <div style={{
            fontSize: 13, opacity: 0.7, whiteSpace: "pre-wrap", overflow: "hidden",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}>{f.description}</div>
        )}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          {!fait && f.priorite !== 1 && <Pastille texte={p.label} fond={p.couleur} />}
          {estMissionAlerte(f) && (
            <Pastille texte="📣 À l'accueil" fond="var(--white)"
              titre={`Affichée dans les alertes de l'accueil de ${f.assignes.map(id => equipe.find(m => m.id === id)?.nom ?? "?").join(", ")}`} />
          )}
          {f.statut === "en_cours" && <Pastille texte="▶ En cours" fond="var(--bleu)" />}
          <BadgeDeadline f={f} />
          {ev && <Pastille texte={`${typeEv(ev.type).icone} ${ev.titre}`} fond="var(--cream)" />}
          {f.genre === "point" && <Auteur id={f.cree_par} equipe={equipe} />}
          {f.assignes.length > 0 && (
            <span style={{ display: "inline-flex", marginLeft: "auto" }}>
              {f.assignes.map((id, i) => (
                <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={22} valide={!fait && f.assignes.length > 1 && validations(f).includes(id)} /></span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Fenêtre d'édition d'une fiche ────────────────────────────────────────────

function ModalFiche({ initial, equipe, evenements, onFermer, onEnregistre, onSupprime }: {
  initial: Partial<Fiche>; equipe: Membre[]; evenements: EvPrep[];
  onFermer: () => void; onEnregistre: (f: Fiche) => void; onSupprime: (id: string) => void;
}) {
  const [f, setF] = useState<Partial<Fiche>>({ genre: "point", statut: "a_faire", priorite: 1, assignes: [], ...initial });
  const [envoi, setEnvoi] = useState(false);
  const maj = (champs: Partial<Fiche>) => setF(prev => ({ ...prev, ...champs }));
  const evsChoisissables = evenements.filter(e => !EV_ARCHIVE.includes(e.statut) || e.id === f.evenement_id);

  const enregistrer = async () => {
    if (!f.titre?.trim() || envoi) return;
    setEnvoi(true);
    const corps = {
      genre: f.genre, titre: f.titre.trim(), description: f.description ?? "", statut: f.statut,
      priorite: f.priorite, deadline: f.deadline ?? null, assignes: f.assignes ?? [],
      evenement_id: f.evenement_id ?? null, seance_id: f.seance_id ?? null, decision: f.decision ?? "",
      intervenant: estPoint ? (f.intervenant ?? null) : null,
    };
    const res = f.id
      ? await envoyer<Fiche>(`/api/reunion/fiches/${f.id}`, "PUT", corps)
      : await envoyer<Fiche>("/api/reunion/fiches", "POST", corps);
    setEnvoi(false);
    if (res) onEnregistre(res);
  };

  const supprimer = async () => {
    if (!f.id || !confirm(`Supprimer « ${f.titre} » ?`)) return;
    if (await envoyer(`/api/reunion/fiches/${f.id}`, "DELETE")) onSupprime(f.id);
  };

  const estPoint = f.genre === "point";
  return (
    <Modal titre={f.id ? (estPoint ? "Point à aborder" : "Mission") : (estPoint ? "Nouveau point à aborder" : "Nouvelle mission")} onFermer={onFermer}>
      <Segments<"point" | "mission">
        options={[{ v: "point", label: "💬 Point à aborder" }, { v: "mission", label: "🎯 Mission" }]}
        valeur={f.genre ?? "point"} onChange={v => maj({ genre: v })} />
      <div>
        <label style={etiquette}>Titre</label>
        <input autoFocus value={f.titre ?? ""} onChange={e => maj({ titre: e.target.value })}
          onKeyDown={e => { if (e.key === "Enter") enregistrer(); }}
          placeholder={estPoint ? "Ex. : horaires d'ouverture pendant les vacances" : "Ex. : commander les lots du tournoi"} style={inp} />
      </div>
      <div>
        <label style={etiquette}>Détails</label>
        <textarea value={f.description ?? ""} onChange={e => maj({ description: e.target.value })} rows={3} style={{ ...inp, resize: "vertical" }} />
      </div>
      <div>
        <label style={etiquette}>Priorité</label>
        <ChoixPriorite valeur={f.priorite ?? 1} onChange={v => maj({ priorite: v })} />
        {!estPoint && (f.priorite ?? 1) >= PRIORITE_ALERTE && f.statut !== "fait" && (
          <p style={{ fontSize: 12, fontWeight: 700, margin: "6px 0 0", color: "rgba(0,0,0,0.55)" }}>
            📣 {(f.assignes ?? []).length > 0
              ? (() => {
                  const ok = validations({ ...f, assignes: f.assignes ?? [] } as Fiche);
                  const restants = (f.assignes ?? []).filter(id => !ok.includes(id));
                  return restants.length
                    ? `Apparaît dans les alertes de l'accueil de ${restants.map(id => equipe.find(m => m.id === id)?.nom ?? "?").join(", ")}, jusqu'à ce que chacun valide sa part ou qu'elle soit faite.`
                    : "Tout le monde a validé sa part.";
                })()
              : "Assigne-la à quelqu'un pour qu'elle apparaisse dans ses alertes de l'accueil."}
          </p>
        )}
      </div>
      <div className="pop-grid-2" style={{ gap: 12 }}>
        <div>
          <label style={etiquette}>Deadline (facultative)</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input type="date" value={f.deadline ?? ""} onChange={e => maj({ deadline: e.target.value || null })} style={inp} />
            {f.deadline && <button type="button" className="pop-btn pop-btn-outline" onClick={() => maj({ deadline: null })} style={{ padding: "4px 10px" }}>✕</button>}
          </div>
        </div>
        <div>
          <label style={etiquette}>Événement lié</label>
          <select value={f.evenement_id ?? ""} onChange={e => maj({ evenement_id: e.target.value || null })} style={inp}>
            <option value="">— Aucun —</option>
            {evsChoisissables.map(e => <option key={e.id} value={e.id}>{typeEv(e.type).icone} {e.titre}</option>)}
          </select>
        </div>
      </div>
      {estPoint && (
        <div>
          <label style={etiquette}>Présenté par (en réunion)</label>
          <ChoixIntervenant valeur={f.intervenant ?? null} equipe={equipe} onChange={v => maj({ intervenant: v })} />
        </div>
      )}
      <div>
        <label style={etiquette}>{estPoint ? "Porté par" : "Assignée à"}</label>
        <ChoixMembres equipe={equipe} valeur={f.assignes ?? []} onChange={v => maj({ assignes: v })} />
        {!estPoint && f.id && (f.assignes ?? []).length > 1 && f.statut !== "fait" && (() => {
          const ok = validations({ ...f, assignes: f.assignes ?? [] } as Fiche);
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8, fontSize: 12 }}>
              <b>Validé depuis l&apos;accueil :</b>
              {ok.length === 0 ? <span style={{ opacity: 0.55 }}>personne pour l&apos;instant</span>
                : ok.map(id => <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Avatar m={equipe.find(m => m.id === id)} taille={20} valide />{equipe.find(m => m.id === id)?.nom}</span>)}
              <span style={{ opacity: 0.55 }}>· {ok.length}/{(f.assignes ?? []).length}. « Fait » ci-dessous termine la mission pour tout le monde.</span>
            </div>
          );
        })()}
      </div>
      <div>
        <label style={etiquette}>Statut</label>
        <Segments<Statut>
          options={estPoint
            ? [{ v: "a_faire", label: "À aborder" }, { v: "fait", label: "Abordé" }]
            : [{ v: "a_faire", label: "À faire" }, { v: "en_cours", label: "En cours" }, { v: "fait", label: "Fait" }]}
          valeur={estPoint && f.statut === "en_cours" ? "a_faire" : (f.statut ?? "a_faire")}
          onChange={v => maj({ statut: v })} />
      </div>
      {(estPoint || f.decision) && (
        <div>
          <label style={etiquette}>Décision / suite donnée</label>
          <textarea value={f.decision ?? ""} onChange={e => maj({ decision: e.target.value })} rows={2} style={{ ...inp, resize: "vertical" }} />
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", marginTop: 4 }}>
        {f.id && <button className="pop-btn pop-btn-outline" onClick={supprimer} style={{ marginRight: "auto", color: "#b91c1c" }}>Supprimer</button>}
        <button className="pop-btn pop-btn-outline" onClick={onFermer}>Annuler</button>
        <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!f.titre?.trim() || envoi}>{envoi ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ─── Fenêtre d'un événement en préparation ────────────────────────────────────

function ModalEvenement({ initial, equipe, evenements, fiches, retour, connecte, onFermer, onEvenement, onEvSupprime, onFiche, onOuvrirFiche, onBasculerFiche, onOuvrirRetour }: {
  initial: Partial<EvPrep>; equipe: Membre[]; evenements: EvPrep[]; fiches: Fiche[]; retour?: Retour; connecte: boolean;
  onFermer: () => void; onEvenement: (e: EvPrep) => void; onEvSupprime: (id: string) => void;
  onFiche: (f: Fiche) => void; onOuvrirFiche: (f: Partial<Fiche>) => void; onBasculerFiche: (f: Fiche) => void;
  onOuvrirRetour: (e: EvPrep) => void;
}) {
  const [ev, setEv] = useState<Partial<EvPrep>>({ type: "Animation", statut: "idee", responsables: [], ...initial });
  const [modifie, setModifie] = useState(!initial.id);
  // Tant qu'on n'a rien touché, la fenêtre suit la base : écrire le retour
  // passe l'événement « terminé », un autre poste peut aussi l'avoir modifié.
  const externe = ev.id ? evenements.find(x => x.id === ev.id) : undefined;
  const [externeVu, setExterneVu] = useState(externe);
  if (externe !== externeVu) {
    setExterneVu(externe);
    if (externe && !modifie) setEv(externe);
  }
  const [envoi, setEnvoi] = useState(false);
  const [nouvelle, setNouvelle] = useState("");
  const maj = (c: Partial<EvPrep>) => { setEv(p => ({ ...p, ...c })); setModifie(true); };
  const missions = fiches.filter(f => f.evenement_id === ev.id).sort(comparerFiches);
  const faites = missions.filter(m => m.statut === "fait").length;

  const enregistrer = async (): Promise<EvPrep | null> => {
    if (!ev.titre?.trim()) return null;
    setEnvoi(true);
    const corps = {
      titre: ev.titre.trim(), type: ev.type, date_debut: ev.date_debut || null,
      date_fin: ev.date_fin && ev.date_debut && ev.date_fin >= ev.date_debut ? ev.date_fin : null,
      heure_debut: ev.heure_debut || null, heure_fin: ev.heure_fin || null,
      lieu: ev.lieu ?? "", description: ev.description ?? "", statut: ev.statut, responsables: ev.responsables ?? [],
    };
    const res = ev.id
      ? await envoyer<EvPrep>(`/api/reunion/evenements/${ev.id}`, "PUT", corps)
      : await envoyer<EvPrep>("/api/reunion/evenements", "POST", corps);
    setEnvoi(false);
    if (res) { setEv(res); setModifie(false); onEvenement(res); }
    return res;
  };

  const versAgenda = async () => {
    const base = modifie ? await enregistrer() : (ev as EvPrep);
    if (!base?.id) return;
    const res = await envoyer<EvPrep>(`/api/reunion/evenements/${base.id}/agenda`, "POST");
    if (res) { setEv(res); onEvenement(res); alert(base.agenda_id ? "📅 Agenda mis à jour." : "📅 Ajouté à l'agenda."); }
  };

  const supprimer = async () => {
    if (!ev.id) return;
    const msg = missions.length
      ? `Supprimer « ${ev.titre} » et ses ${missions.length} mission(s) de préparation ?`
      : `Supprimer « ${ev.titre} » ?`;
    if (!confirm(msg + (ev.agenda_id ? "\n\nL'événement reste dans l'agenda." : ""))) return;
    if (await envoyer(`/api/reunion/evenements/${ev.id}`, "DELETE")) onEvSupprime(ev.id);
  };

  const ajouterMission = async () => {
    const titre = nouvelle.trim();
    if (!titre || !ev.id) return;
    const res = await envoyer<Fiche>("/api/reunion/fiches", "POST", { genre: "mission", titre, evenement_id: ev.id, priorite: 1 });
    if (res) { onFiche(res); setNouvelle(""); }
  };

  return (
    <Modal titre={ev.id ? `${typeEv(ev.type ?? "").icone} ${ev.titre || "Événement"}` : "Nouvel événement à préparer"} onFermer={onFermer} large>
      <div className="pop-grid-2" style={{ gap: 12 }}>
        <div>
          <label style={etiquette}>Titre</label>
          <input autoFocus={!ev.id} value={ev.titre ?? ""} onChange={e => maj({ titre: e.target.value })} placeholder="Ex. : Fête du jeu" style={inp} />
        </div>
        <div>
          <label style={etiquette}>Type</label>
          <select value={ev.type} onChange={e => maj({ type: e.target.value })} style={inp}>
            {Object.entries(TYPES_EV).map(([t, d]) => <option key={t} value={t}>{d.icone} {t}</option>)}
          </select>
        </div>
      </div>
      <div className="pop-grid-4" style={{ gap: 12 }}>
        <div><label style={etiquette}>Début</label><input type="date" value={ev.date_debut ?? ""} onChange={e => maj({ date_debut: e.target.value || null })} style={inp} /></div>
        <div><label style={etiquette}>Fin (si plusieurs jours)</label><input type="date" min={ev.date_debut ?? undefined} value={ev.date_fin ?? ""} onChange={e => maj({ date_fin: e.target.value || null })} style={inp} /></div>
        <div><label style={etiquette}>De</label><input type="time" value={ev.heure_debut ?? ""} onChange={e => maj({ heure_debut: e.target.value || null })} style={inp} /></div>
        <div><label style={etiquette}>À</label><input type="time" value={ev.heure_fin ?? ""} onChange={e => maj({ heure_fin: e.target.value || null })} style={inp} /></div>
      </div>
      <div>
        <label style={etiquette}>Lieu</label>
        <input value={ev.lieu ?? ""} onChange={e => maj({ lieu: e.target.value })} placeholder="Ludothèque, parc, école…" style={inp} />
      </div>
      <div>
        <label style={etiquette}>Description / notes de préparation</label>
        <textarea value={ev.description ?? ""} onChange={e => maj({ description: e.target.value })} rows={3} style={{ ...inp, resize: "vertical" }} />
      </div>
      <div>
        <label style={etiquette}>Avancement</label>
        <Segments options={STATUTS_EV.map(s => ({ v: s.v, label: s.label }))} valeur={ev.statut ?? "idee"} onChange={v => maj({ statut: v })} />
      </div>
      <div>
        <label style={etiquette}>Responsables</label>
        <ChoixMembres equipe={equipe} valeur={ev.responsables ?? []} onChange={v => maj({ responsables: v })} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {ev.id && <button className="pop-btn pop-btn-outline" onClick={supprimer} style={{ color: "#b91c1c" }}>Supprimer</button>}
        <span style={{ flex: 1 }} />
        {ev.id && connecte && (
          <button className="pop-btn pop-btn-outline" onClick={versAgenda} disabled={!ev.date_debut}
            title={ev.date_debut ? "Les responsables y figurent comme participants" : "Il faut une date"}>
            📅 {ev.agenda_id ? "Mettre à jour l'agenda" : "Ajouter à l'agenda"}
          </button>
        )}
        <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!ev.titre?.trim() || envoi || !modifie}>
          {envoi ? "…" : ev.id ? (modifie ? "Enregistrer" : "Enregistré ✓") : "Créer"}
        </button>
      </div>

      {ev.id && ev.statut !== "annule" && evPasse(ev as EvPrep) && (
        <Section titre="📝 Retour sur l'événement" droite={(retour || connecte) &&
          <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => onOuvrirRetour(ev as EvPrep)}>
            {retour ? "✏️ Modifier" : "+ Faire le retour"}
          </button>}>
          {retour ? <ResumeRetour r={retour} equipe={equipe} complet /> : <Vide>Pas encore de retour. Ce qui a marché, ce qu’on change la prochaine fois ?</Vide>}
        </Section>
      )}

      {ev.id && (
        <Section titre={`Missions de préparation${missions.length ? ` · ${faites}/${missions.length}` : ""}`}
          droite={connecte && <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }}
            onClick={() => onOuvrirFiche({ genre: "mission", evenement_id: ev.id })}>+ Détaillée</button>}>
          {missions.length > 0 && (
            <div style={{ height: 8, borderRadius: 4, border: "1.5px solid var(--ink)", background: "var(--white)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(faites / missions.length) * 100}%`, background: "var(--vert)" }} />
            </div>
          )}
          {connecte && <div style={{ display: "flex", gap: 6 }}>
            <input value={nouvelle} onChange={e => setNouvelle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouterMission(); }}
              placeholder="Ajouter une mission (Entrée)…" style={inp} />
            <button className="pop-btn pop-btn-yellow" onClick={ajouterMission} disabled={!nouvelle.trim()}>+</button>
          </div>}
          {missions.map(m => (
            <CarteFiche key={m.id} f={m} equipe={equipe} evenements={evenements}
              onOuvrir={() => onOuvrirFiche(m)} onBasculer={() => onBasculerFiche(m)} />
          ))}
        </Section>
      )}
    </Modal>
  );
}

// ─── Retour sur événement ─────────────────────────────────────────────────────

function Etoiles({ valeur, onChange, taille = 22 }: { valeur: number | null; onChange?: (v: number | null) => void; taille?: number }) {
  return (
    <span style={{ display: "inline-flex", gap: 2 }} title={valeur ? `${valeur}/5` : "Pas de note"}>
      {[1, 2, 3, 4, 5].map(n => {
        const plein = !!valeur && n <= valeur;
        const style: React.CSSProperties = { fontSize: taille, lineHeight: 1, color: plein ? "#f59e0b" : "rgba(0,0,0,0.2)" };
        return onChange
          ? <button key={n} type="button" onClick={() => onChange(valeur === n ? null : n)} aria-label={`${n} sur 5`}
              style={{ ...style, border: "none", background: "none", cursor: "pointer", padding: 0, fontFamily: "inherit" }}>★</button>
          : <span key={n} style={style}>★</span>;
      })}
    </span>
  );
}

/** Le retour en lecture : condensé sur les cartes, complet dans la fiche de l'événement. */
function ResumeRetour({ r, equipe, complet }: { r: Retour; equipe: Membre[]; complet?: boolean }) {
  const refaire = A_REFAIRE.find(a => a.v === r.a_refaire);
  const rubriques = [
    { titre: "👍 Ce qui a marché", texte: r.positif },
    { titre: "🔧 À améliorer", texte: r.ameliorer },
    { titre: "💡 Pour la prochaine fois", texte: r.idees },
  ].filter(x => x.texte?.trim());
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {r.note && <Etoiles valeur={r.note} taille={16} />}
        {r.frequentation != null && <Pastille texte={`👥 ${r.frequentation} personne${r.frequentation > 1 ? "s" : ""}`} fond="var(--white)" />}
        {refaire && <Pastille texte={refaire.label} fond={refaire.couleur} />}
        {complet && <Auteur id={r.cree_par} equipe={equipe} />}
      </div>
      {complet
        ? rubriques.map(x => (
            <div key={x.titre}>
              <div style={etiquette}>{x.titre}</div>
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{x.texte}</div>
            </div>
          ))
        : rubriques[0] && (
            <div style={{ fontSize: 13, opacity: 0.75, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", whiteSpace: "pre-wrap" }}>
              {rubriques[0].texte}
            </div>
          )}
    </div>
  );
}

/** L'événement visé par un retour : un événement du Bureau, ou de l'agenda seul (importé à l'enregistrement). */
type CibleRetour = { titre: string; type: string; date: string | null; date_fin?: string | null; evenement_id?: string; agenda_id?: string };

function ModalRetour({ cible, initial, equipe, onFermer, onEnregistre, onSupprime }: {
  cible: CibleRetour; initial?: Retour; equipe: Membre[];
  onFermer: () => void; onEnregistre: (r: Retour, ev?: EvPrep) => void; onSupprime: (id: string) => void;
}) {
  const [r, setR] = useState<Partial<Retour>>(initial ?? {});
  const [envoi, setEnvoi] = useState(false);
  const maj = (c: Partial<Retour>) => setR(p => ({ ...p, ...c }));
  const t = typeEv(cible.type);

  const enregistrer = async () => {
    if (envoi) return;
    setEnvoi(true);
    const corps = {
      frequentation: r.frequentation ?? null, note: r.note ?? null, a_refaire: r.a_refaire ?? null,
      positif: r.positif ?? "", ameliorer: r.ameliorer ?? "", idees: r.idees ?? "",
    };
    if (initial) {
      const res = await envoyer<Retour>(`/api/reunion/retours/${initial.id}`, "PUT", corps);
      if (res) onEnregistre(res);
    } else {
      const res = await envoyer<{ retour: Retour; evenement: EvPrep }>("/api/reunion/retours", "POST",
        { ...corps, evenement_id: cible.evenement_id ?? null, agenda_id: cible.agenda_id ?? null });
      if (res) onEnregistre(res.retour, res.evenement);
    }
    setEnvoi(false);
  };

  const supprimer = async () => {
    if (!initial || !confirm("Supprimer ce retour ?")) return;
    if (await envoyer(`/api/reunion/retours/${initial.id}`, "DELETE")) onSupprime(initial.id);
  };

  return (
    <Modal titre={`📝 Retour · ${cible.titre}`} onFermer={onFermer} large>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 14 }}>
        <Pastille texte={`${t.icone} ${cible.type}`} fond={t.couleur} />
        {cible.date && <span style={{ fontWeight: 600 }}>
          {dateLongue(cible.date)}{cible.date_fin && cible.date_fin !== cible.date ? ` → ${dateLongue(cible.date_fin)}` : ""}
        </span>}
        {initial && <span style={{ marginLeft: "auto" }}><Auteur id={initial.cree_par} equipe={equipe} /></span>}
      </div>
      {!initial && cible.agenda_id && !cible.evenement_id && (
        <div style={{ fontSize: 13, opacity: 0.7 }}>
          Cet événement vient de l’agenda : il rejoindra les événements du Bureau, marqué terminé.
        </div>
      )}
      <div className="pop-grid-2" style={{ gap: 12 }}>
        <div>
          <label style={etiquette}>Ressenti global</label>
          <Etoiles valeur={r.note ?? null} onChange={v => maj({ note: v })} taille={28} />
        </div>
        <div>
          <label style={etiquette}>Fréquentation (personnes accueillies)</label>
          <input type="number" min={0} inputMode="numeric" value={r.frequentation ?? ""} style={inp}
            onChange={e => maj({ frequentation: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} />
        </div>
      </div>
      <div>
        <label style={etiquette}>À refaire ?</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {A_REFAIRE.map(a => {
            const actif = r.a_refaire === a.v;
            return (
              <button key={a.v} type="button" onClick={() => maj({ a_refaire: actif ? null : a.v })} style={{
                fontFamily: "inherit", cursor: "pointer", fontSize: 13, padding: "5px 10px", borderRadius: 6,
                fontWeight: actif ? 900 : 600, background: actif ? a.couleur : "var(--white)",
                border: actif ? "2px solid var(--ink)" : "2px solid rgba(0,0,0,0.15)",
                boxShadow: actif ? "2px 2px 0 var(--ink)" : "none",
              }}>{a.label}</button>
            );
          })}
        </div>
      </div>
      <div>
        <label style={etiquette}>👍 Ce qui a marché</label>
        <TexteAuto value={r.positif ?? ""} onChange={v => maj({ positif: v })} placeholder="Ambiance, jeux qui ont plu, organisation…" />
      </div>
      <div>
        <label style={etiquette}>🔧 À améliorer</label>
        <TexteAuto value={r.ameliorer ?? ""} onChange={v => maj({ ameliorer: v })} placeholder="Ce qui a coincé, ce qui a manqué…" />
      </div>
      <div>
        <label style={etiquette}>💡 Idées pour la prochaine fois</label>
        <TexteAuto value={r.idees ?? ""} onChange={v => maj({ idees: v })} placeholder="À garder en tête si on le refait" />
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {initial && <button className="pop-btn pop-btn-outline" onClick={supprimer} style={{ marginRight: "auto", color: "#b91c1c" }}>Supprimer</button>}
        <button className="pop-btn pop-btn-outline" onClick={onFermer}>Annuler</button>
        <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={envoi}>{envoi ? "…" : "Enregistrer"}</button>
      </div>
    </Modal>
  );
}

// ─── Lancement d'une réunion ──────────────────────────────────────────────────

function ModalLancement({ equipe, points, suggestions, moi, onFermer, onLancer }: {
  equipe: Membre[]; points: Fiche[]; suggestions: Suggestion[]; moi: string | null;
  onFermer: () => void; onLancer: (p: { titre: string; participants: string[]; retenues: Suggestion[]; ajouts: string[] }) => Promise<void>;
}) {
  const [titre, setTitre] = useState("");
  const [participants, setParticipants] = useState<string[]>(moi ? [moi] : []);
  const [voirSuggestions, setVoirSuggestions] = useState(points.length === 0);
  // Ordre du jour vide : les suggestions sont cochées d'office, il n'y a plus qu'à décocher.
  const [cochees, setCochees] = useState<Set<string>>(() => new Set(points.length === 0 ? suggestions.map(s => s.cle) : []));
  const [ajouts, setAjouts] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [envoi, setEnvoi] = useState(false);

  const basculer = (cle: string) => setCochees(prev => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const ajouter = () => { const t = saisie.trim(); if (t) { setAjouts(a => [...a, t]); setSaisie(""); } };
  const total = points.length + cochees.size + ajouts.length;

  return (
    <Modal titre="▶ Lancer une réunion" onFermer={onFermer} large>
      <div className="pop-grid-2" style={{ gap: 12 }}>
        <div>
          <label style={etiquette}>Titre (facultatif)</label>
          <input value={titre} onChange={e => setTitre(e.target.value)} placeholder={`Réunion du ${format(new Date(), "d MMMM", { locale: fr })}`} style={inp} />
        </div>
      </div>
      <div>
        <label style={etiquette}>Participants</label>
        <ChoixMembres equipe={equipe} valeur={participants} onChange={setParticipants} />
      </div>

      <Section titre={`Ordre du jour · ${total} point${total > 1 ? "s" : ""}`}>
        {points.length === 0 && ajouts.length === 0 && (
          <div style={{ fontSize: 14, padding: "8px 12px", borderRadius: 8, background: "var(--yellow)", border: "2px solid var(--ink)" }}>
            Aucun point n’est prévu. Voici des sujets repérés dans les missions et les événements : décoche ce qui n’est pas utile.
          </div>
        )}
        {[...points].sort(comparerFiches).map(p => (
          <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: priorite(p.priorite).couleur, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
            <span style={{ fontWeight: 600 }}>{p.titre}</span>
          </div>
        ))}
        {ajouts.map((t, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: "var(--yellow)", border: "1.5px solid var(--ink)", flexShrink: 0 }} />
            <span style={{ fontWeight: 600, flex: 1 }}>{t}</span>
            <button onClick={() => setAjouts(a => a.filter((_, j) => j !== i))} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14 }}>✕</button>
          </div>
        ))}
        <div style={{ display: "flex", gap: 6 }}>
          <input value={saisie} onChange={e => setSaisie(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouter(); }} placeholder="Ajouter un point (Entrée)…" style={inp} />
          <button className="pop-btn pop-btn-yellow" onClick={ajouter} disabled={!saisie.trim()}>+</button>
        </div>
        {!voirSuggestions && suggestions.length > 0 && (
          <button className="pop-btn pop-btn-outline" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={() => setVoirSuggestions(true)}>
            💡 Voir {suggestions.length} suggestion{suggestions.length > 1 ? "s" : ""}
          </button>
        )}
        {voirSuggestions && suggestions.map(s => {
          const ok = cochees.has(s.cle);
          return (
            <label key={s.cle} style={{
              display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer", padding: "8px 10px", borderRadius: 8,
              border: ok ? "2px solid var(--ink)" : "2px dashed rgba(0,0,0,0.25)", background: ok ? "var(--white)" : "transparent",
            }}>
              <input type="checkbox" checked={ok} onChange={() => basculer(s.cle)} style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>💡 {s.titre}</span>
                {s.description && <span style={{ display: "block", fontSize: 12, opacity: 0.65, whiteSpace: "pre-wrap" }}>{s.description}</span>}
              </span>
            </label>
          );
        })}
      </Section>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button className="pop-btn pop-btn-outline" onClick={onFermer}>Annuler</button>
        <button className="pop-btn pop-btn-dark" disabled={envoi} onClick={async () => {
          setEnvoi(true);
          await onLancer({ titre, participants, retenues: suggestions.filter(s => cochees.has(s.cle)), ajouts });
          setEnvoi(false);
        }}>{envoi ? "…" : "▶ Démarrer la réunion"}</button>
      </div>
    </Modal>
  );
}

// ─── Ligne de notes → mission ─────────────────────────────────────────────────

const MOIS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];

/** Membres de l'équipe nommés dans une ligne (« Léa demande à l'ALF » → Léa), par prénom. */
function personnesDansLigne(ligne: string, equipe: Membre[]) {
  const mots = new Set(normaliser(ligne).split(/[^a-z0-9]+/).filter(Boolean));
  return equipe.filter(m => mots.has(normaliser(m.nom.trim().split(/\s+/)[0]))).map(m => m.id);
}

/**
 * Date écrite dans une ligne : « 27 novembre », « vendredi 27/11 », « 13/11/2026 ».
 * Sans année, la prochaine occurrence (à une semaine près : une date tout juste
 * passée reste dans l'année en cours).
 */
function dateDansLigne(ligne: string): string | null {
  const t = normaliser(ligne);
  let j: number, m: number, a: number | null = null;
  const num = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  const lettres = t.match(new RegExp(`\\b(\\d{1,2})(?:er)?\\s+(${MOIS_FR.join("|")})(?:\\s+(\\d{4}))?`));
  if (lettres) { j = +lettres[1]; m = MOIS_FR.indexOf(lettres[2]) + 1; a = lettres[3] ? +lettres[3] : null; }
  else if (num) { j = +num[1]; m = +num[2]; a = num[3] ? (num[3].length === 2 ? 2000 + +num[3] : +num[3]) : null; }
  else return null;
  if (m < 1 || m > 12 || j < 1 || j > 31) return null;
  if (a === null) {
    const now = new Date();
    a = now.getFullYear();
    if (new Date(a, m - 1, j) < addDays(now, -7)) a++;
  }
  const d = new Date(a, m - 1, j);
  return d.getMonth() === m - 1 ? format(d, "yyyy-MM-dd") : null;
}

/** Lignes d'un texte de notes qui peuvent devenir une mission (pas les sous-titres ni les vides). */
const lignesActionnables = (texte: string) =>
  lignesRiches(texte).flatMap(l => l.t === "puce" || l.t === "num" || l.t === "fleche" || l.t === "p" ? [l.texte] : []);

// ─── Point traité en séance ───────────────────────────────────────────────────

function PointEnSeance({ p, equipe, seanceId, ouvertParDefaut = false, onMaj, onOuvrir, onNouvelleMission }: {
  p: Fiche; equipe: Membre[]; seanceId: string; ouvertParDefaut?: boolean; onMaj: (f: Fiche) => void; onOuvrir: () => void;
  /** Ouvre la fiche d'une nouvelle mission, préremplie depuis une ligne des notes. */
  onNouvelleMission: (f: Partial<Fiche>) => void;
}) {
  // Replié par défaut : l'ordre du jour tient sur un écran, on déplie le point qu'on traite.
  const [ouvert, setOuvert] = useState(ouvertParDefaut);
  const [decision, setDecision] = useState(p.decision ?? "");
  const [versMission, setVersMission] = useState(false);
  const [assignes, setAssignes] = useState<string[]>(p.assignes);
  const [deadline, setDeadline] = useState(p.deadline ?? "");
  const [prio, setPrio] = useState(p.priorite);
  const [outil, setOutil] = useState<null | "intervenant" | "apercu" | "missions">(null);
  const traite = p.statut === "fait" || p.genre === "mission";

  const sauver = async (champs: Partial<Fiche>) => {
    const res = await envoyer<Fiche>(`/api/reunion/fiches/${p.id}`, "PUT", champs);
    if (res) onMaj(res);
  };

  // Les notes d'un point peuvent être longues : enregistrées au fil de la frappe, pas seulement en quittant le champ.
  const sauverRef = useRef(sauver);
  useEffect(() => { sauverRef.current = sauver; });
  useEffect(() => {
    if (decision === (p.decision ?? "")) return;
    const t = setTimeout(() => sauverRef.current({ decision }), 1500);
    return () => clearTimeout(t);
  }, [decision, p.decision]);

  const versMissionDepuis = (ligne: string) => onNouvelleMission({
    genre: "mission", statut: "a_faire", priorite: 1, titre: ligne.replace(/[.;]\s*$/, ""),
    assignes: personnesDansLigne(ligne, equipe), deadline: dateDansLigne(ligne),
    description: `Issue du point « ${p.titre} »`, seance_id: seanceId, evenement_id: p.evenement_id,
  });
  const lignes = lignesActionnables(decision);
  const outilBtn = (o: NonNullable<typeof outil>, label: string) => (
    <button type="button" onClick={() => setOutil(x => x === o ? null : o)} style={{
      fontFamily: "inherit", cursor: "pointer", fontSize: 12, fontWeight: 800, padding: "3px 9px", borderRadius: 8,
      border: "2px solid var(--ink)", background: outil === o ? "var(--yellow)" : "var(--white)",
    }}>{label}</button>
  );

  return (
    <div className="pop-card" style={{ padding: ouvert ? 12 : "8px 12px", display: "flex", flexDirection: "column", gap: 8, background: traite ? "var(--cream2)" : "var(--white)", flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <button onClick={() => setOuvert(o => !o)} aria-expanded={ouvert}
          style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left", border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", color: "inherit" }}>
          <span style={{ fontSize: 14, lineHeight: "22px", flexShrink: 0, width: 12 }}>{ouvert ? "▾" : "▸"}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontWeight: 800, fontSize: ouvert ? 16 : 15, overflowWrap: "anywhere" }}>
              {p.genre === "mission" ? "🎯 " : traite ? "✓ " : ""}{p.titre}
            </span>
            {!ouvert && (p.priorite !== 1 && !traite || p.decision?.trim() || p.intervenant) && (
              <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 3, fontSize: 11 }}>
                {p.intervenant && <Intervenant valeur={p.intervenant} equipe={equipe} />}
                {p.priorite !== 1 && !traite && <Pastille texte={priorite(p.priorite).label} fond={priorite(p.priorite).couleur} />}
                {p.decision?.trim() && <span style={{ opacity: 0.6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>📝 {p.decision.trim().split("\n")[0]}</span>}
              </span>
            )}
          </span>
        </button>
        <button onClick={onOuvrir} title="Modifier" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✏️</button>
      </div>
      {ouvert && <>
      {(p.description || p.cree_par) && (
        <div style={{ paddingLeft: 20 }}>
          {p.description && <div style={{ fontSize: 13, opacity: 0.7, whiteSpace: "pre-wrap" }}>{p.description}</div>}
          <div style={{ marginTop: 4 }}><Auteur id={p.cree_par} equipe={equipe} /></div>
        </div>
      )}

      {!traite && <ChoixPriorite compact valeur={p.priorite} onChange={v => sauver({ priorite: v })} />}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {p.intervenant && outil !== "intervenant" && <Intervenant valeur={p.intervenant} equipe={equipe} />}
        {outilBtn("intervenant", p.intervenant ? "🎤 Changer" : "🎤 Présenté par")}
        {decision.trim() && outilBtn("apercu", "👁 Aperçu")}
        {lignes.length > 0 && outilBtn("missions", `🎯 Ligne → mission`)}
      </div>
      {outil === "intervenant" && (
        <ChoixIntervenant valeur={p.intervenant ?? null} equipe={equipe} onChange={v => { sauver({ intervenant: v }); setOutil(null); }} />
      )}

      {/* Les notes du point sont le compte rendu : une grande zone, mise en forme à la lecture
          (« - » puces, « 1. » listes, « Titre : » sous-titres, « => » flèches). */}
      <TexteAuto value={decision} onChange={setDecision}
        placeholder={"Notes du point : ce qui s'est dit, ce qui est décidé…\n- une puce par idée\nSous-titre :\n=> à retenir"}
        style={{ fontSize: 13, minHeight: 96 }} />
      {decision !== (p.decision ?? "") && <span style={{ fontSize: 11, opacity: 0.5, marginTop: -4 }}>Enregistrement…</span>}

      {outil === "apercu" && decision.trim() && (
        <div style={{ padding: "8px 10px", borderRadius: 8, border: "2px dashed rgba(0,0,0,0.2)", fontSize: 13, background: "var(--cream)" }}>
          <TexteRiche texte={decision} />
        </div>
      )}
      {outil === "missions" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8, borderRadius: 8, border: "2px dashed var(--ink)", background: "var(--cream)" }}>
          <span style={{ fontSize: 11, opacity: 0.6 }}>Clique une ligne pour en faire une mission (personnes et date repérées dans la ligne, à vérifier).</span>
          {lignes.map((l, i) => {
            const qui = personnesDansLigne(l, equipe);
            const quand = dateDansLigne(l);
            return (
              <button key={i} type="button" onClick={() => versMissionDepuis(l)} style={{
                display: "flex", gap: 8, alignItems: "center", textAlign: "left", fontFamily: "inherit", fontSize: 12, cursor: "pointer",
                padding: "5px 8px", borderRadius: 6, border: "1.5px solid rgba(0,0,0,0.15)", background: "var(--white)",
              }}>
                <span style={{ fontWeight: 900 }}>🎯</span>
                <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{l}</span>
                {qui.map(id => <Avatar key={id} m={equipe.find(m => m.id === id)} taille={18} />)}
                {quand && <Pastille texte={`📅 ${dateCourte(quand)}`} fond="var(--white)" />}
              </button>
            );
          })}
        </div>
      )}

      {!traite && !versMission && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button className="pop-btn pop-btn-green" style={{ fontSize: 13, padding: "5px 12px" }}
            onClick={() => sauver({ statut: "fait", decision, seance_id: seanceId })}>✓ Abordé</button>
          <button className="pop-btn pop-btn-yellow" style={{ fontSize: 13, padding: "5px 12px" }}
            onClick={() => setVersMission(true)}>🎯 En faire une mission</button>
        </div>
      )}

      {!traite && versMission && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 8, border: "2px dashed var(--ink)" }}>
          <div><label style={etiquette}>Priorité</label><ChoixPriorite compact valeur={prio} onChange={setPrio} /></div>
          <div><label style={etiquette}>Qui ?</label><ChoixMembres equipe={equipe} valeur={assignes} onChange={setAssignes} /></div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={etiquette}>Deadline (facultative)</label>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} style={inp} />
            </div>
            <button className="pop-btn pop-btn-outline" onClick={() => setVersMission(false)}>Annuler</button>
            <button className="pop-btn pop-btn-dark" onClick={() => sauver({
              genre: "mission", statut: "a_faire", priorite: prio, assignes, deadline: deadline || null, decision, seance_id: seanceId,
            })}>Créer la mission</button>
          </div>
        </div>
      )}

      {traite && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
          {p.genre === "mission" && <Pastille texte={priorite(p.priorite).label} fond={priorite(p.priorite).couleur} />}
          <BadgeDeadline f={p} />
          {p.assignes.map(id => <Avatar key={id} m={equipe.find(m => m.id === id)} taille={20} />)}
          {p.genre === "point" && (
            <button onClick={() => sauver({ statut: "a_faire", seance_id: null })}
              style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", textDecoration: "underline", fontSize: 12, fontFamily: "inherit" }}>
              Remettre à l’ordre du jour
            </button>
          )}
        </div>
      )}
      </>}
    </div>
  );
}

// ─── Vue « réunion en cours » ─────────────────────────────────────────────────

function VueSeance({ seance, equipe, fiches, evenements, connecte, onSeance, onFiche, onOuvrirFiche, onBasculerFiche, onQuitter }: {
  seance: Seance; equipe: Membre[]; fiches: Fiche[]; evenements: EvPrep[]; connecte: boolean;
  onSeance: (s: Seance) => void; onFiche: (f: Fiche) => void;
  onOuvrirFiche: (f: Partial<Fiche>) => void; onBasculerFiche: (f: Fiche) => void; onQuitter: () => void;
}) {
  const [blocs, setBlocs] = useState<BlocCR[]>(() => lireCR(seance.compte_rendu));
  const cr = ecrireCR(blocs);
  const [envoye, setEnvoye] = useState(() => ecrireCR(lireCR(seance.compte_rendu)));
  const [envoi, setEnvoi] = useState(false);
  const [saisie, setSaisie] = useState("");
  const [voirNotes, setVoirNotes] = useState(false);
  // « Tout déplier / replier » : la clé change, les points repartent dans cet état.
  const [depli, setDepli] = useState({ ouvert: false, n: 0 });
  const etat = envoi ? "envoi" : cr === envoye ? "ok" : "attente";

  // Sauvegarde automatique du compte rendu, une seconde après la dernière frappe.
  useEffect(() => {
    if (cr === envoye) return;
    const t = setTimeout(async () => {
      setEnvoi(true);
      const res = await envoyer<Seance>(`/api/reunion/seances/${seance.id}`, "PUT", { compte_rendu: cr });
      if (res) { setEnvoye(cr); onSeance(res); }
      setEnvoi(false);
    }, 1000);
    return () => clearTimeout(t);
  }, [cr, envoye, seance.id, onSeance]);

  const aTraiter = fiches.filter(f => f.genre === "point" && f.statut !== "fait").sort(comparerFiches);
  const traites = fiches.filter(f => f.seance_id === seance.id && (f.genre === "mission" ? true : f.statut === "fait"));
  const missions = fiches.filter(f => f.genre === "mission" && f.statut !== "fait").sort(comparerFiches);

  const majSeance = async (champs: Partial<Seance>) => {
    const res = await envoyer<Seance>(`/api/reunion/seances/${seance.id}`, "PUT", champs);
    if (res) onSeance(res);
  };

  const ajouterPoint = async () => {
    const titre = saisie.trim();
    if (!titre) return;
    const res = await envoyer<Fiche>("/api/reunion/fiches", "POST", { genre: "point", titre, priorite: 1 });
    if (res) { onFiche(res); setSaisie(""); }
  };

  const terminer = async () => {
    const restants = aTraiter.length;
    if (!confirm(restants
      ? `Terminer la réunion ? ${restants} point${restants > 1 ? "s restent" : " reste"} à l'ordre du jour pour la prochaine fois.`
      : "Terminer la réunion ?")) return;
    const res = await envoyer<Seance>(`/api/reunion/seances/${seance.id}`, "PUT", { compte_rendu: cr, statut: "terminee" });
    if (res) { setEnvoye(cr); onSeance(res); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div className="pop-card" style={{ padding: "14px 16px", background: "var(--turquoise)", display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {/* Titre sur sa propre ligne quand la place manque : les boutons passent dessous. */}
          <h2 className="bc" style={{ margin: 0, fontSize: 24, flex: "1 1 260px", minWidth: 0, display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="pulse" style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--rouge)", border: "2px solid var(--ink)", flexShrink: 0, alignSelf: "center" }} />
            {seance.titre || "Réunion en cours"} <span style={{ fontSize: 16, opacity: 0.7 }}>{dateLongue(seance.date)}</span>
          </h2>
          <button className="pop-btn pop-btn-outline" onClick={onQuitter} style={{ background: "var(--white)" }}>Aperçu</button>
          <button className="pop-btn pop-btn-dark" onClick={terminer}>■ Terminer la réunion</button>
        </div>
        <ChoixMembres equipe={equipe} valeur={seance.participants} onChange={v => majSeance({ participants: v })} />
      </div>

      <div className="pop-grid-2" style={{ alignItems: "start", gap: 20 }}>
        <Section titre={`Ordre du jour · ${aTraiter.length}`} droite={(aTraiter.length + traites.length) > 0 &&
          <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 12 }}
            onClick={() => setDepli(d => ({ ouvert: !d.ouvert, n: d.n + 1 }))}>
            {depli.ouvert ? "▸ Tout replier" : "▾ Tout déplier"}
          </button>}>
          {connecte && (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={saisie} onChange={e => setSaisie(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouterPoint(); }} placeholder="Ajouter un point (Entrée)…" style={inp} />
              <button className="pop-btn pop-btn-yellow" onClick={ajouterPoint} disabled={!saisie.trim()}>+</button>
            </div>
          )}
          {aTraiter.length === 0 && <Vide>Tous les points ont été abordés 🎉</Vide>}
          {aTraiter.map(p => (
            <PointEnSeance key={`${p.id}-${depli.n}`} p={p} equipe={equipe} seanceId={seance.id} ouvertParDefaut={depli.ouvert} onMaj={onFiche} onOuvrir={() => onOuvrirFiche(p)} onNouvelleMission={onOuvrirFiche} />
          ))}
          {traites.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.5, marginTop: 6 }}>Traités pendant cette réunion · {traites.length}</div>
              {traites.map(p => (
                <PointEnSeance key={`${p.id}-${depli.n}`} p={p} equipe={equipe} seanceId={seance.id} ouvertParDefaut={depli.ouvert} onMaj={onFiche} onOuvrir={() => onOuvrirFiche(p)} onNouvelleMission={onOuvrirFiche} />
              ))}
            </>
          )}
        </Section>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <Section titre="Notes hors ordre du jour" droite={
            <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>
              {etat === "ok" ? "Enregistré ✓" : etat === "envoi" ? "Enregistrement…" : "Modifié"}
            </span>}>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: -4 }}>
              Le compte rendu, ce sont les notes de chaque point (à gauche) : ici, seulement ce qui ne rentre dans aucun point.
            </div>
            {voirNotes || blocs.some(sectionRemplie)
              ? <EditeurCR blocs={blocs} equipe={equipe} onChange={setBlocs} />
              : <button className="pop-btn pop-btn-outline" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={() => setVoirNotes(true)}>+ Ajouter des notes libres</button>}
          </Section>

          <Section titre={`Missions à prioriser · ${missions.length}`} droite={connecte &&
            <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }}
              onClick={() => onOuvrirFiche({ genre: "mission", seance_id: seance.id })}>+ Mission</button>}>
            {missions.length === 0 && <Vide>Aucune mission en cours.</Vide>}
            {missions.map(m => (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <CarteFiche f={m} equipe={equipe} evenements={evenements} onOuvrir={() => onOuvrirFiche(m)} onBasculer={() => onBasculerFiche(m)} />
                <div style={{ paddingLeft: 6 }}>
                  <ChoixPriorite compact valeur={m.priorite} onChange={async v => {
                    const res = await envoyer<Fiche>(`/api/reunion/fiches/${m.id}`, "PUT", { priorite: v });
                    if (res) onFiche(res);
                  }} />
                </div>
              </div>
            ))}
          </Section>
        </div>
      </div>
    </div>
  );
}

// ─── Compte rendu archivé ─────────────────────────────────────────────────────

/** Tout le texte d'un compte rendu, pour la recherche : titre, présents, notes, points et missions. */
function texteCompteRendu(s: Seance, fiches: Fiche[], nomDe: (id: string) => string, equipeCR: Membre[]) {
  const liees = fiches.filter(f => f.seance_id === s.id);
  return [
    s.titre ?? "", dateLongue(s.date), ...s.participants.map(nomDe),
    ...lireCR(s.compte_rendu).map(b => texteSection(b, equipeCR)),
    ...liees.flatMap(f => [f.titre, f.description ?? "", f.decision ?? "", ...f.assignes.map(nomDe)]),
  ].join("\n");
}

// ─── Export PDF d'un compte rendu ─────────────────────────────────────────────

/**
 * Les polices standard de jsPDF ne connaissent que le Latin-1 (WinAnsi) : les
 * apostrophes typographiques passent en droites et les émojis disparaissent,
 * sinon ils sortent en caractères illisibles.
 */
const textePdf = (t: string) => t
  .replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/…/g, "...").replace(/[–—]/g, "-")
  .replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/€/g, " EUR").replace(/[\u00A0\u202F]/g, " ")
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
  .replace(/[ \t]+\n/g, "\n").trim();

async function exporterCompteRenduPdf(s: Seance, fiches: Fiche[], equipe: Membre[]) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marge = 16, largeur = 210 - marge * 2, basPage = 297 - 16;
  let y = 20;
  const nomDe = (id: string) => nomPersonne(id, equipe);

  const place = (h: number) => { if (y + h > basPage) { doc.addPage(); y = 18; } };
  /** Écrit un texte coupé à la largeur disponible, ligne à ligne, avec saut de page. */
  const ecrire = (texte: string, o: { taille?: number; gras?: boolean; gris?: boolean; retrait?: number; interligne?: number; apres?: number } = {}) => {
    const t = textePdf(texte);
    if (!t) return;
    const taille = o.taille ?? 10.5, retrait = o.retrait ?? 0;
    doc.setFont("helvetica", o.gras ? "bold" : "normal");
    doc.setFontSize(taille);
    doc.setTextColor(o.gris ? 110 : 20);
    const h = taille * 0.42 * (o.interligne ?? 1.25);
    for (const ligne of doc.splitTextToSize(t, largeur - retrait) as string[]) {
      place(h);
      doc.text(ligne, marge + retrait, y);
      y += h;
    }
    y += o.apres ?? 0;
  };
  /** Notes mises en forme : sous-titres en gras, listes en retrait (comme à l'écran). */
  const ecrireRiche = (texte: string, retrait: number, taille = 10.5, gris = false) => {
    for (const l of lignesRiches(texte)) {
      if (l.t === "vide") { y += 1.2; continue; }
      if (l.t === "titre") ecrire(l.texte, { gras: true, retrait, taille, gris, apres: 0.3 });
      else if (l.t === "puce") ecrire(`•  ${l.texte}`, { retrait: retrait + 3 + l.niveau * 4, taille, gris });
      else if (l.t === "num") ecrire(`${l.n}.  ${l.texte}`, { retrait: retrait + 3, taille, gris });
      else if (l.t === "fleche") ecrire(`->  ${l.texte}`, { retrait: retrait + 1, taille, gris });
      else ecrire(l.texte, { retrait, taille, gris });
    }
    y += 0.5;
  };
  const titreBloc = (t: string) => {
    place(14);
    y += 3;
    doc.setDrawColor(20); doc.setLineWidth(0.5);
    ecrire(t.toUpperCase(), { taille: 11, gras: true, apres: 0.5 });
    doc.line(marge, y - 2.6, marge + largeur, y - 2.6);
    y += 2;
  };

  // En-tête
  ecrire(s.titre || "Réunion", { taille: 18, gras: true, apres: 1 });
  ecrire(dateLongue(s.date).replace(/^./, c => c.toUpperCase()), { taille: 11, gris: true, apres: 2 });
  if (s.participants.length) ecrire(`Présents : ${s.participants.map(nomDe).join(", ")}`, { apres: 2 });

  const points = fiches.filter(f => f.seance_id === s.id && f.genre === "point");
  const missions = fiches.filter(f => f.seance_id === s.id && f.genre === "mission");

  if (points.length) {
    titreBloc("Points abordés");
    for (const p of points) {
      ecrire(p.titre, { gras: true, apres: 0.5 });
      if (p.intervenant) {
        const ext = !equipe.some(m => m.id === p.intervenant);
        ecrire(`Présenté par ${nomDe(p.intervenant)}${ext ? " (invité)" : ""}`, { gris: true, retrait: 5, taille: 9.5 });
      }
      if (p.description?.trim()) ecrireRiche(p.description, 5, 9.5, true);
      if (p.decision?.trim()) ecrireRiche(p.decision, 5);
      y += 1.5;
    }
  }

  if (missions.length) {
    titreBloc("Missions décidées");
    for (const m of missions) {
      const infos = [
        m.assignes.length ? `Pour : ${m.assignes.map(nomDe).join(", ")}` : "",
        m.deadline ? `avant le ${dateCourte(m.deadline)}` : "",
        `priorité ${priorite(m.priorite).label.toLowerCase()}`,
        m.statut === "fait" ? "faite" : "",
      ].filter(Boolean).join(" · ");
      ecrire(m.titre, { gras: true, apres: 0.5 });
      ecrire(infos, { gris: true, retrait: 5, taille: 9.5, apres: 0.5 });
      if (m.decision?.trim()) ecrireRiche(m.decision, 5);
      y += 1.5;
    }
  }

  const sectionsRemplies = lireCR(s.compte_rendu).filter(sectionRemplie);
  if (sectionsRemplies.length) {
    titreBloc("Notes");
    for (const sec of sectionsRemplies) {
      if (sec.titre.trim()) ecrire(sec.titre.toUpperCase(), { taille: 11, gras: true, apres: 0.8 });
      if (sec.interlocuteur) {
        const ext = !equipe.some(m => m.id === sec.interlocuteur);
        ecrire(`Présenté par ${nomDe(sec.interlocuteur)}${ext ? " (invité)" : ""}`, { gris: true, taille: 9.5 });
      }
      const concernes = [...sec.services.map(libelleService), ...sec.concernes.map(nomDe), ...sec.invites.map(n => `${n} (invité)`)];
      if (concernes.length) ecrire(`Concernés : ${concernes.join(", ")}`, { gris: true, taille: 9.5 });
      for (const p of sec.paragraphes.filter(x => x.trim())) { ecrireRiche(p, 0); y += 1; }
      y += 2;
    }
  }

  // Pied de page : numéros
  const nb = doc.getNumberOfPages();
  for (let i = 1; i <= nb; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
    doc.text(textePdf(`${s.titre || "Réunion"} · ${dateCourte(s.date)} · ${i}/${nb}`), 210 - marge, 297 - 8, { align: "right" });
  }
  const nom = `Compte rendu ${s.date} ${s.titre || "Réunion"}`.replace(/[/\\?%*:|"<>]/g, "-");
  doc.save(`${nom}.pdf`);
}

function CarteCompteRendu({ s, equipe, fiches, q, onMaj, onSupprime, onOuvrirFiche }: {
  s: Seance; equipe: Membre[]; fiches: Fiche[]; q: string; onMaj: (s: Seance) => void; onSupprime: (id: string) => void;
  /** Ouvre la fiche d'un point ou d'une mission (ou en crée une rattachée à ce compte rendu). */
  onOuvrirFiche: (f: Partial<Fiche>) => void;
}) {
  // null : ouverture automatique pendant une recherche, sinon fermé.
  const [ouvertManuel, setOuvertManuel] = useState<boolean | null>(null);
  const ouvert = ouvertManuel ?? !!q.trim();
  const [edition, setEdition] = useState(false);
  const [blocs, setBlocs] = useState<BlocCR[]>(() => lireCR(s.compte_rendu));
  // Réédition : titre, date et présents se modifient avec les notes.
  const [titre, setTitre] = useState(s.titre ?? "");
  const [date, setDate] = useState(s.date);
  const [presents, setPresents] = useState<string[]>(s.participants);
  const [envoi, setEnvoi] = useState(false);
  const [export_, setExport] = useState(false);
  const commencerEdition = () => {
    setBlocs(lireCR(s.compte_rendu)); setTitre(s.titre ?? ""); setDate(s.date); setPresents(s.participants);
    setEdition(true); setOuvertManuel(true);
  };
  const exporter = async () => {
    setExport(true);
    try { await exporterCompteRenduPdf(s, fiches, equipe); }
    catch { alert("Le PDF n'a pas pu être généré."); }
    finally { setExport(false); }
  };
  const nomDe = (id: string) => equipe.find(m => m.id === id)?.nom ?? "?";
  const points = fiches.filter(f => f.seance_id === s.id && f.genre === "point");
  const missions = fiches.filter(f => f.seance_id === s.id && f.genre === "mission");
  const enregistres = lireCR(s.compte_rendu);
  const sections = sectionsCR(enregistres);

  const sauver = async () => {
    if (!date) return;
    setEnvoi(true);
    const res = await envoyer<Seance>(`/api/reunion/seances/${s.id}`, "PUT", {
      compte_rendu: ecrireCR(blocs), titre: titre.trim() || null, date, participants: presents,
    });
    setEnvoi(false);
    if (res) { onMaj(res); setEdition(false); }
  };
  const supprimer = async () => {
    if (!confirm("Supprimer ce compte rendu ? Les points et missions sont conservés.")) return;
    if (await envoyer(`/api/reunion/seances/${s.id}`, "DELETE")) onSupprime(s.id);
  };

  return (
    <div className="pop-card" style={{ padding: 0, background: "var(--white)", overflow: "hidden", flexShrink: 0 }}>
      <button onClick={() => setOuvertManuel(!ouvert)} style={{
        width: "100%", textAlign: "left", display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "inherit",
      }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", width: "100%" }}>
          <span style={{ fontSize: 18 }}>{ouvert ? "▾" : "▸"}</span>
          <span style={{ fontWeight: 800, fontSize: 15, flex: 1, minWidth: 160 }}>
            <Surligne texte={s.titre || "Réunion"} q={q} /> <span style={{ fontWeight: 500, opacity: 0.6 }}>· <Surligne texte={dateLongue(s.date)} q={q} /></span>
          </span>
          <span style={{ fontSize: 12, opacity: 0.65 }}>{points.length} point{points.length > 1 ? "s" : ""} · {missions.length} mission{missions.length > 1 ? "s" : ""}</span>
          <span style={{ display: "inline-flex" }}>
            {s.participants.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={22} /></span>)}
          </span>
        </div>
        {/* Aperçu : seulement le sommaire, le texte est dans la vue détaillée. */}
        {sections.length > 0 && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", paddingLeft: 28 }}>
            {sections.map((t, i) => (
              <span key={i} style={{
                fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.03em",
                padding: "2px 8px", borderRadius: 5, background: "var(--cream2)", border: "1.5px solid var(--ink)",
              }}><Surligne texte={t} q={q} /></span>
            ))}
          </div>
        )}
      </button>
      {ouvert && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 14, borderTop: "2px solid var(--cream2)" }}>
          {edition && (
            <div className="pop-grid-2" style={{ gap: 12, marginTop: 10 }}>
              <div>
                <label style={etiquette}>Titre</label>
                <input value={titre} onChange={e => setTitre(e.target.value)} placeholder="Réunion" style={inp} />
              </div>
              <div>
                <label style={etiquette}>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
              </div>
            </div>
          )}
          {edition ? (
            <div>
              <label style={etiquette}>Présents</label>
              <ChoixMembres equipe={equipe} valeur={presents} onChange={setPresents} />
            </div>
          ) : s.participants.length > 0 && <div style={{ fontSize: 13, marginTop: 10 }}><b>Présents :</b> <Surligne texte={s.participants.map(nomDe).join(", ")} q={q} /></div>}
          {(points.length > 0 || edition) && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ ...etiquette, marginBottom: 0 }}>Points abordés</div>
                {edition && (
                  <button className="pop-btn pop-btn-outline" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }}
                    onClick={() => onOuvrirFiche({ genre: "point", statut: "fait", seance_id: s.id })}>+ Point</button>
                )}
              </div>
              {edition && points.length === 0 && <div style={{ fontSize: 13, opacity: 0.5, margin: "6px 0" }}>Aucun point rattaché à cette réunion.</div>}
              {points.map(p => (
                <div key={p.id} style={{ fontSize: 14, margin: "6px 0 8px", display: "flex", flexDirection: "column", gap: 3 }}>
                  <span style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ flex: 1, minWidth: 0 }}>• <b style={{ whiteSpace: "pre-wrap" }}><Surligne texte={p.titre} q={q} /></b></span>
                    {edition && <button onClick={() => onOuvrirFiche(p)} title="Modifier ce point (titre, détail, décision…)"
                      style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>✏️</button>}
                  </span>
                  {p.intervenant && <div style={{ paddingLeft: 14 }}><Intervenant valeur={p.intervenant} equipe={equipe} /></div>}
                  {p.description?.trim() && (
                    <TexteRiche texte={p.description} q={q} style={{ paddingLeft: 14, fontSize: 13, opacity: 0.6 }} />
                  )}
                  {p.decision?.trim() && (
                    <TexteRiche texte={p.decision} q={q} style={{ marginLeft: 14, paddingLeft: 10, borderLeft: "3px solid var(--turquoise)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
          {(missions.length > 0 || edition) && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ ...etiquette, marginBottom: 0 }}>Missions décidées</div>
                {edition && (
                  <button className="pop-btn pop-btn-outline" style={{ marginLeft: "auto", padding: "2px 10px", fontSize: 12 }}
                    onClick={() => onOuvrirFiche({ genre: "mission", seance_id: s.id })}>+ Mission</button>
                )}
              </div>
              {missions.map(m => (
                <div key={m.id} style={{ fontSize: 14, marginBottom: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  {edition && <button onClick={() => onOuvrirFiche(m)} title="Modifier cette mission"
                    style={{ border: "none", background: "none", cursor: "pointer", fontSize: 14, padding: 0 }}>✏️</button>}
                  <span>{m.statut === "fait" ? "✅" : "🎯"} <b><Surligne texte={m.titre} q={q} /></b></span>
                  {m.assignes.length > 0 && <span style={{ opacity: 0.7 }}>→ <Surligne texte={m.assignes.map(nomDe).join(", ")} q={q} /></span>}
                  {m.deadline && <span style={{ opacity: 0.7 }}>· avant le {dateCourte(m.deadline)}</span>}
                  {m.decision?.trim() && <TexteRiche texte={m.decision} q={q} style={{ opacity: 0.7, width: "100%", paddingLeft: 20, fontSize: 13 }} />}
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={etiquette}>Notes</div>
            {edition ? <EditeurCR blocs={blocs} equipe={equipe} onChange={setBlocs} /> : <LectureCR blocs={enregistres} equipe={equipe} q={q} />}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="pop-btn pop-btn-outline" onClick={supprimer} style={{ color: "#b91c1c", marginRight: "auto" }}>Supprimer</button>
            {edition
              ? <><button className="pop-btn pop-btn-outline" onClick={() => setEdition(false)}>Annuler</button>
                  <button className="pop-btn pop-btn-dark" onClick={sauver} disabled={envoi || !date}>{envoi ? "…" : "Enregistrer"}</button></>
              : <>
                  <button className="pop-btn pop-btn-outline" onClick={exporter} disabled={export_}>{export_ ? "…" : "📄 PDF"}</button>
                  <button className="pop-btn pop-btn-outline" onClick={commencerEdition}>✏️ Modifier le compte rendu</button>
                </>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aperçu des événements à venir ────────────────────────────────────────────

type ItemAVenir = { cle: string; date: string | null; titre: string; type: string; prep?: EvPrep; avancement?: [number, number] };

function ApercuEvenements({ items, onOuvrir }: { items: ItemAVenir[]; onOuvrir: (e: EvPrep) => void }) {
  if (!items.length) return <Vide>Rien de prévu pour l’instant.</Vide>;
  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 6px 8px 2px", margin: "0 -6px 0 0" }}>
      {items.map(it => {
        const t = typeEv(it.type);
        const j = it.date ? joursAvant(it.date) : null;
        const contenu = (
          <>
            <div style={{ background: t.couleur, borderBottom: "2px solid var(--ink)", padding: "6px 10px", display: "flex", alignItems: "baseline", gap: 6 }}>
              {it.date ? (
                <>
                  <span className="bc" style={{ fontSize: 26, lineHeight: 1 }}>{format(parseISO(it.date), "d")}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>{format(parseISO(it.date), "MMM", { locale: fr })}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 800, background: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 5, padding: "1px 6px" }}>
                    {j! <= 0 ? "Auj." : `J-${j}`}
                  </span>
                </>
              ) : <span style={{ fontSize: 13, fontWeight: 800 }}>💡 Sans date</span>}
            </div>
            <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2, overflowWrap: "anywhere" }}>{t.icone} {it.titre}</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: "auto" }}>
                {it.prep ? statutEv(it.prep.statut).label : `${it.type} · agenda`}
              </div>
              {it.avancement && it.avancement[1] > 0 && (
                <div style={{ height: 6, borderRadius: 3, border: "1.5px solid var(--ink)", background: "var(--cream)", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(it.avancement[0] / it.avancement[1]) * 100}%`, background: "var(--vert)" }} />
                </div>
              )}
            </div>
          </>
        );
        const style: React.CSSProperties = {
          width: 170, minWidth: 170, padding: 0, overflow: "hidden", display: "flex", flexDirection: "column",
          background: "var(--white)", cursor: "pointer", textDecoration: "none", color: "inherit", textAlign: "left", fontFamily: "inherit",
        };
        return it.prep
          ? <button key={it.cle} className="pop-card pop-card-hover" style={style} onClick={() => onOuvrir(it.prep!)}>{contenu}</button>
          : <Link key={it.cle} href="/agenda" className="pop-card pop-card-hover" style={style}>{contenu}</Link>;
      })}
    </div>
  );
}

// ─── Événements passés ────────────────────────────────────────────────────────

type ItemPasse = CibleRetour & { cle: string; prep?: EvPrep; retour?: Retour; annule: boolean };

function LignePasse({ it, equipe, connecte, onOuvrirEv, onRetour }: {
  it: ItemPasse; equipe: Membre[]; connecte: boolean; onOuvrirEv: (e: EvPrep) => void; onRetour: (it: ItemPasse) => void;
}) {
  const t = typeEv(it.type);
  const membres = it.prep?.responsables ?? [];
  return (
    <div className="pop-card" style={{ padding: 0, overflow: "hidden", display: "flex", background: "var(--white)", opacity: it.annule ? 0.6 : 1, flexShrink: 0 }}>
      <div style={{
        width: 64, flexShrink: 0, background: t.couleur, borderRight: "2px solid var(--ink)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "8px 4px",
      }}>
        {it.date ? <>
          <span className="bc" style={{ fontSize: 24, lineHeight: 1 }}>{format(parseISO(it.date), "d")}</span>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" }}>{format(parseISO(it.date), "MMM yy", { locale: fr })}</span>
        </> : <span style={{ fontSize: 20 }}>{t.icone}</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "10px 12px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ fontWeight: 800, fontSize: 15, overflowWrap: "anywhere" }}>
            {t.icone} {it.prep
              ? <button onClick={() => onOuvrirEv(it.prep!)} style={{ border: "none", background: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left", textDecoration: "underline", textDecorationColor: "rgba(0,0,0,0.25)" }}>{it.titre}</button>
              : it.titre}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
            {it.annule && <Pastille texte={statutEv("annule").label} fond={statutEv("annule").couleur} />}
            {!it.prep && <span style={{ opacity: 0.6 }}>{it.type} · agenda</span>}
            {it.date_fin && it.date && it.date_fin !== it.date && <span style={{ opacity: 0.6 }}>jusqu’au {dateCourte(it.date_fin)}</span>}
            {membres.length > 0 && (
              <span style={{ display: "inline-flex" }}>
                {membres.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={20} /></span>)}
              </span>
            )}
          </div>
        </div>
        {!it.annule && (it.retour ? (
          <button onClick={() => onRetour(it)} title="Voir et modifier le retour" style={{
            flex: "1 1 220px", minWidth: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
            border: "2px solid var(--cream2)", borderRadius: 8, background: "var(--cream)", padding: "6px 10px",
          }}>
            <ResumeRetour r={it.retour} equipe={equipe} />
          </button>
        ) : connecte ? (
          <button className="pop-btn pop-btn-yellow" style={{ fontSize: 13, padding: "5px 12px", alignSelf: "center" }} onClick={() => onRetour(it)}>
            📝 Faire le retour
          </button>
        ) : <span style={{ fontSize: 12, opacity: 0.5, alignSelf: "center" }}>Pas de retour</span>)}
      </div>
    </div>
  );
}

// ─── Import d'un compte rendu ─────────────────────────────────────────────────

/** Ce que renvoie l'analyse (noms tels qu'écrits dans le document). */
type AnalyseCR = {
  titre: string; date: string; participants: string[];
  points: { titre: string; intervenant: string; notes: string }[];
  missions: { titre: string; description: string; personnes: string[]; echeance: string }[];
  notes_libres: string; remarques: string;
};

/** Brouillon modifiable avant l'import : les noms reconnus deviennent des membres de l'équipe. */
type BrouillonCR = {
  titre: string; date: string; participants: string[]; inconnus: string[];
  points: { titre: string; intervenant: string | null; notes: string }[];
  missions: { titre: string; description: string; assignes: string[]; deadline: string }[];
  notes_libres: string; remarques: string;
};

/** Un nom du document → l'id d'un membre (nom complet ou prénom, sans accents ni casse). */
function membreParNom(nom: string, equipe: Membre[]) {
  const n = normaliser(nom.trim());
  if (!n) return undefined;
  return equipe.find(m => normaliser(m.nom) === n)
    ?? equipe.find(m => normaliser(m.nom.split(/\s+/)[0]) === n.split(/\s+/)[0]);
}

function versBrouillon(a: AnalyseCR, equipe: Membre[]): BrouillonCR {
  const participants: string[] = [], inconnus: string[] = [];
  for (const nom of a.participants) {
    const m = membreParNom(nom, equipe);
    if (m) { if (!participants.includes(m.id)) participants.push(m.id); } else inconnus.push(nom);
  }
  return {
    titre: a.titre, date: /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? a.date : "", participants, inconnus,
    points: a.points.map(p => ({ titre: p.titre, notes: p.notes, intervenant: p.intervenant.trim() ? (membreParNom(p.intervenant, equipe)?.id ?? p.intervenant.trim()) : null })),
    missions: a.missions.map(m => {
      const assignes = m.personnes.map(n => membreParNom(n, equipe)?.id).filter((x): x is string => !!x);
      const autres = m.personnes.filter(n => !membreParNom(n, equipe));
      return {
        titre: m.titre, assignes, deadline: /^\d{4}-\d{2}-\d{2}$/.test(m.echeance) ? m.echeance : "",
        description: [m.description, autres.length ? `Pour : ${autres.join(", ")}` : ""].filter(Boolean).join("\n"),
      };
    }),
    notes_libres: a.notes_libres, remarques: a.remarques,
  };
}

const enBase64 = (f: File) => new Promise<string>((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => ko(new Error("Lecture du fichier impossible."));
  r.readAsDataURL(f);
});

function ModalImportCR({ equipe, onFermer, onImporte }: { equipe: Membre[]; onFermer: () => void; onImporte: () => void }) {
  const [etape, setEtape] = useState<"choix" | "analyse" | "apercu" | "envoi">("choix");
  const [erreur, setErreur] = useState<string | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [b, setB] = useState<BrouillonCR | null>(null);
  const [apercus, setApercus] = useState<Set<number>>(new Set());
  const maj = (c: Partial<BrouillonCR>) => setB(x => x ? { ...x, ...c } : x);

  const analyser = async (fichier: File) => {
    setErreur(null); setNomFichier(fichier.name);
    const ext = fichier.name.toLowerCase().split(".").pop();
    if (ext !== "docx" && ext !== "pdf") { setErreur("Choisis un document Word (.docx) ou un PDF."); return; }
    if (fichier.size > 25 * 1024 * 1024) { setErreur("Fichier trop lourd (25 Mo au plus)."); return; }
    setEtape("analyse");
    try {
      const corps = ext === "pdf"
        ? { pdf: await enBase64(fichier), nom: fichier.name }
        : { texte: await (await import("../../lib/docxTexte")).texteDocx(fichier), nom: fichier.name };
      if ("texte" in corps && !corps.texte?.trim()) throw new Error("Ce document Word ne contient pas de texte.");
      const r = await fetch("/api/reunion/import/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const data = await r.json().catch(() => ({})) as AnalyseCR & { error?: string };
      if (!r.ok) throw new Error(data.error ?? "L'analyse a échoué.");
      setB(versBrouillon(data, equipe));
      setEtape("apercu");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L'analyse a échoué.");
      setEtape("choix");
    }
  };

  const importer = async () => {
    if (!b?.date) return;
    setEtape("envoi");
    const notes = b.notes_libres.trim();
    const res = await envoyer<{ seance: Seance }>("/api/reunion/import", "POST", {
      titre: b.titre, date: b.date, participants: b.participants,
      compte_rendu: notes ? ecrireCR([{ ...sectionVide(), paragraphes: [notes] }]) : "[]",
      points: b.points.map(p => ({ titre: p.titre, intervenant: p.intervenant, notes: p.notes })),
      missions: b.missions.map(m => ({ titre: m.titre, description: m.description, assignes: m.assignes, deadline: m.deadline || null })),
    });
    if (res) onImporte(); else setEtape("apercu");
  };

  const carte: React.CSSProperties = { border: "2px solid var(--ink)", borderRadius: 10, background: "var(--white)", padding: 10, display: "flex", flexDirection: "column", gap: 8 };
  const supprimerBtn: React.CSSProperties = { border: "none", background: "none", cursor: "pointer", fontSize: 14, color: "#b91c1c", fontWeight: 900, flexShrink: 0 };

  return (
    <Modal titre="📥 Importer un compte rendu" onFermer={onFermer} large>
      {(etape === "choix" || etape === "analyse") && (
        <>
          <div style={{ fontSize: 14 }}>
            Un compte rendu existant (Word ou PDF) est lu puis remis au format du Bureau par Claude : la réunion, ses points avec qui les a présentés, leurs notes mises en forme, et les missions décidées. Tu vérifies et corriges tout avant l’import.
          </div>
          <label style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "26px 16px", cursor: etape === "analyse" ? "wait" : "pointer",
            border: "2.5px dashed var(--ink)", borderRadius: 12, background: "var(--cream)", textAlign: "center",
          }}>
            {etape === "analyse" ? (
              <>
                <span className="pulse" style={{ fontSize: 26 }}>🧠</span>
                <b>Analyse de « {nomFichier} »…</b>
                <span style={{ fontSize: 12, opacity: 0.6 }}>Compter 30 secondes à 2 minutes selon la longueur.</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 26 }}>📄</span>
                <b>Choisir un fichier .docx ou .pdf</b>
                <span style={{ fontSize: 12, opacity: 0.6 }}>Le document est envoyé à l’API d’Anthropic pour l’analyse.</span>
                <input type="file" accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) analyser(f); }} />
              </>
            )}
          </label>
          {erreur && <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--rose)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700 }}>{erreur}</div>}
        </>
      )}

      {b && (etape === "apercu" || etape === "envoi") && (
        <>
          {b.remarques.trim() && (
            <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--yellow)", border: "2px solid var(--ink)", fontSize: 13 }}>
              <b>Note de l’analyse :</b> {b.remarques}
            </div>
          )}
          <div className="pop-grid-2" style={{ gap: 12 }}>
            <div><label style={etiquette}>Titre</label><input value={b.titre} onChange={e => maj({ titre: e.target.value })} style={inp} /></div>
            <div>
              <label style={etiquette}>Date de la réunion</label>
              <input type="date" value={b.date} onChange={e => maj({ date: e.target.value })} style={{ ...inp, borderColor: b.date ? "var(--ink)" : "#b91c1c" }} />
            </div>
          </div>
          <div>
            <label style={etiquette}>Présents</label>
            <ChoixMembres equipe={equipe} valeur={b.participants} onChange={v => maj({ participants: v })} />
            {b.inconnus.length > 0 && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Aussi présents (hors équipe) : {b.inconnus.join(", ")}</div>}
          </div>

          <Section titre={`Points · ${b.points.length}`}>
            {b.points.map((p, i) => {
              const setP = (c: Partial<typeof p>) => maj({ points: b.points.map((x, j) => j === i ? { ...x, ...c } : x) });
              return (
                <div key={i} style={carte}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input value={p.titre} onChange={e => setP({ titre: e.target.value })} style={{ ...inp, fontWeight: 800 }} />
                    <button type="button" onClick={() => setApercus(a => { const n = new Set(a); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                      className="pop-btn pop-btn-outline" style={{ padding: "3px 9px", fontSize: 12, flexShrink: 0 }}>{apercus.has(i) ? "✏️ Texte" : "👁 Aperçu"}</button>
                    <button type="button" title="Retirer ce point" style={supprimerBtn}
                      onClick={() => maj({ points: b.points.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                  <div>
                    <label style={etiquette}>Présenté par</label>
                    <ChoixIntervenant valeur={p.intervenant} equipe={equipe} onChange={v => setP({ intervenant: v })} />
                  </div>
                  {apercus.has(i)
                    ? <div style={{ padding: "6px 10px", borderRadius: 8, background: "var(--cream)", fontSize: 13 }}><TexteRiche texte={p.notes} /></div>
                    : <TexteAuto value={p.notes} onChange={v => setP({ notes: v })} style={{ fontSize: 13 }} />}
                </div>
              );
            })}
            <button className="pop-btn pop-btn-outline" style={{ alignSelf: "flex-start", fontSize: 13 }}
              onClick={() => maj({ points: [...b.points, { titre: "", intervenant: null, notes: "" }] })}>+ Point</button>
          </Section>

          <Section titre={`Missions · ${b.missions.length}`}>
            {b.missions.length === 0 && <Vide>Aucune mission repérée.</Vide>}
            {b.missions.map((m, i) => {
              const setM = (c: Partial<typeof m>) => maj({ missions: b.missions.map((x, j) => j === i ? { ...x, ...c } : x) });
              return (
                <div key={i} style={carte}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span>🎯</span>
                    <input value={m.titre} onChange={e => setM({ titre: e.target.value })} style={{ ...inp, fontWeight: 700 }} />
                    <input type="date" value={m.deadline} onChange={e => setM({ deadline: e.target.value })} style={{ ...inp, width: 150, flexShrink: 0 }} />
                    <button type="button" title="Retirer cette mission" style={supprimerBtn}
                      onClick={() => maj({ missions: b.missions.filter((_, j) => j !== i) })}>✕</button>
                  </div>
                  <ChoixMembres equipe={equipe} valeur={m.assignes} onChange={v => setM({ assignes: v })} />
                  {m.description && <div style={{ fontSize: 12, opacity: 0.65, whiteSpace: "pre-wrap" }}>{m.description}</div>}
                </div>
              );
            })}
          </Section>

          {b.notes_libres.trim() && (
            <div>
              <label style={etiquette}>Notes hors ordre du jour</label>
              <TexteAuto value={b.notes_libres} onChange={v => maj({ notes_libres: v })} style={{ fontSize: 13 }} />
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", alignItems: "center" }}>
            {!b.date && <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 700, marginRight: "auto" }}>Indique la date de la réunion.</span>}
            <button className="pop-btn pop-btn-outline" onClick={() => { setB(null); setEtape("choix"); }}>Autre fichier</button>
            <button className="pop-btn pop-btn-dark" onClick={importer} disabled={!b.date || etape === "envoi"}>
              {etape === "envoi" ? "…" : `Importer (${b.points.length} point${b.points.length > 1 ? "s" : ""}, ${b.missions.length} mission${b.missions.length > 1 ? "s" : ""})`}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Onglet = "taches" | "evenements" | "comptes-rendus";

export default function ReunionPage() {
  const { compte, chargement: chargementCompte } = useCompte();
  const connecte = !!compte;
  const moi = compte?.equipe_id ?? null;

  const [equipe, setEquipe] = useState<Membre[]>([]);
  // Couleur de profil changée depuis le menu du compte : repeint les avatars sans recharger.
  useCouleurProfil(({ equipe_id, couleur }) => setEquipe(prev => prev.map(m => m.id === equipe_id ? { ...m, couleur } : m)));
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [evenements, setEvenements] = useState<EvPrep[]>([]);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [retours, setRetours] = useState<Retour[]>([]);
  const [agenda, setAgenda] = useState<EvAgenda[]>([]);
  const [charge, setCharge] = useState(false);

  const [onglet, setOnglet] = useState<Onglet>("taches");
  const [filtreMembre, setFiltreMembre] = useState<string>("tous");
  const [voirFaites, setVoirFaites] = useState(false);
  const [periodeEv, setPeriodeEv] = useState<"a-venir" | "passes">("a-venir");
  const [filtreRetour, setFiltreRetour] = useState<"tous" | "a_faire" | "faits">("tous");
  const [nbPasses, setNbPasses] = useState(30);
  const [rechercheCR, setRechercheCR] = useState("");
  const [vueSeance, setVueSeance] = useState(true);

  const [ficheEditee, setFicheEditee] = useState<Partial<Fiche> | null>(null);
  const [evOuvert, setEvOuvert] = useState<Partial<EvPrep> | null>(null);
  const [lancement, setLancement] = useState(false);
  const [importCR, setImportCR] = useState(false);
  const [retourOuvert, setRetourOuvert] = useState<CibleRetour | null>(null);

  useEffect(() => {
    Promise.all([
      lireListe<Membre>("/api/equipe").then(setEquipe),
      lireListe<Fiche>("/api/reunion/fiches").then(setFiches),
      lireListe<EvPrep>("/api/reunion/evenements").then(setEvenements),
      lireListe<Seance>("/api/reunion/seances").then(setSeances),
      lireListe<Retour>("/api/reunion/retours").then(setRetours),
      lireListe<EvAgenda>("/api/evenements").then(setAgenda),
    ]).then(() => setCharge(true));
  }, []);
  // Lien depuis l'accueil (/reunion?fiche=…) : ouvre directement la mission.
  useEffect(() => {
    if (!charge) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("fiche");
    if (!id) return;
    const cible = fiches.find(f => f.id === id);
    if (cible) { setOnglet("taches"); setFicheEditee(cible); }
    params.delete("fiche");
    const reste = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (reste ? `?${reste}` : ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charge]);
  useTempsReel("reunion", () => {
    lireListe<Fiche>("/api/reunion/fiches").then(setFiches);
    lireListe<EvPrep>("/api/reunion/evenements").then(setEvenements);
    lireListe<Seance>("/api/reunion/seances").then(setSeances);
    lireListe<Retour>("/api/reunion/retours").then(setRetours);
  });
  useTempsReel("agenda", () => { lireListe<EvAgenda>("/api/evenements").then(setAgenda); });

  const nomDe = (id: string) => equipe.find(m => m.id === id)?.nom ?? "?";
  const seanceEnCours = seances.find(s => s.statut === "en_cours") ?? null;

  const majFiche = (f: Fiche) => setFiches(prev => prev.some(x => x.id === f.id) ? prev.map(x => x.id === f.id ? f : x) : [f, ...prev]);
  const majEvenement = (e: EvPrep) => setEvenements(prev => prev.some(x => x.id === e.id) ? prev.map(x => x.id === e.id ? e : x) : [...prev, e]);
  // Référence stable : la sauvegarde automatique du compte rendu en dépend.
  const majSeanceRef = useRef((s: Seance) => setSeances(prev => prev.some(x => x.id === s.id) ? prev.map(x => x.id === s.id ? s : x) : [s, ...prev]));
  const majSeance = majSeanceRef.current;

  const basculerFiche = async (f: Fiche) => {
    const res = await envoyer<Fiche>(`/api/reunion/fiches/${f.id}`, "PUT", { statut: f.statut === "fait" ? "a_faire" : "fait" });
    if (res) majFiche(res);
  };

  // ── Listes dérivées
  const filtrer = (f: Fiche) =>
    (voirFaites || f.statut !== "fait")
    && (filtreMembre === "tous" || (filtreMembre === "moi" ? !!moi && f.assignes.includes(moi) : f.assignes.includes(filtreMembre)));
  const points = useMemo(() => fiches.filter(f => f.genre === "point").filter(filtrer).sort(comparerFiches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fiches, voirFaites, filtreMembre, moi]);
  const missions = useMemo(() => fiches.filter(f => f.genre === "mission").filter(filtrer).sort(comparerFiches),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fiches, voirFaites, filtreMembre, moi]);

  const ouvertes = fiches.filter(f => f.statut !== "fait");
  const kpi = {
    points: ouvertes.filter(f => f.genre === "point").length,
    missions: ouvertes.filter(f => f.genre === "mission").length,
    retard: ouvertes.filter(enRetard).length,
    urgentes: ouvertes.filter(f => f.genre === "mission" && f.priorite === 3).length,
    miennes: moi ? ouvertes.filter(f => f.genre === "mission" && f.assignes.includes(moi)).length : 0,
  };

  const avancement = (id: string): [number, number] => {
    const liees = fiches.filter(f => f.evenement_id === id && f.genre === "mission");
    return [liees.filter(f => f.statut === "fait").length, liees.length];
  };

  const aVenir = useMemo<ItemAVenir[]>(() => {
    const auj = aujourdhui();
    const items: ItemAVenir[] = [];
    for (const e of evenements) {
      if (EV_ARCHIVE.includes(e.statut)) continue;
      if (e.date_debut && (e.date_fin || e.date_debut) < auj) continue;
      items.push({ cle: `p-${e.id}`, date: e.date_debut, titre: e.titre, type: e.type, prep: e, avancement: avancement(e.id) });
    }
    const suivis = new Set(evenements.map(e => e.agenda_id).filter(Boolean));
    const series = new Set<string>();
    // Pas d'horizon : les événements du Bureau n'en ont pas non plus, et un trou
    // dans la frise laisserait croire qu'un événement de l'agenda manque.
    for (const a of [...agenda].sort((x, y) => x.date_debut.localeCompare(y.date_debut))) {
      if (!estEvenementAgenda(a.type) || suivis.has(a.id) || a.date_fin < auj) continue;
      // Une série récurrente n'apparaît qu'une fois : sa prochaine occurrence.
      if (a.parent_id) { if (series.has(a.parent_id)) continue; series.add(a.parent_id); }
      items.push({ cle: `a-${a.id}`, date: a.date_debut < auj ? auj : a.date_debut, titre: a.titre || a.type, type: a.type });
    }
    return items.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenements, agenda, fiches]);

  const evsAffiches = evenements.filter(e => !evPasse(e));
  const retourDe = (evId: string) => retours.find(r => r.evenement_id === evId);
  const majRetour = (r: Retour) => setRetours(prev => prev.some(x => x.id === r.id) ? prev.map(x => x.id === r.id ? r : x) : [r, ...prev]);

  // Passés : les événements du Bureau terminés, annulés ou dont la date est
  // dépassée, et ceux de l'agenda qui n'y ont pas de fiche (hors réunions).
  const passes = useMemo<ItemPasse[]>(() => {
    const auj = aujourdhui();
    const items: ItemPasse[] = evenements.filter(evPasse).map(e => ({
      cle: `p-${e.id}`, titre: e.titre, type: e.type, date: e.date_debut, date_fin: e.date_fin,
      evenement_id: e.id, prep: e, retour: retours.find(r => r.evenement_id === e.id), annule: e.statut === "annule",
    }));
    const suivis = new Set(evenements.map(e => e.agenda_id).filter(Boolean));
    for (const a of agenda) {
      if (!estEvenementAgenda(a.type) || a.type === "Réunion" || suivis.has(a.id) || (a.date_fin || a.date_debut) >= auj) continue;
      items.push({ cle: `a-${a.id}`, titre: a.titre || a.type, type: a.type, date: a.date_debut, date_fin: a.date_fin, agenda_id: a.id, annule: false });
    }
    return items.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
  }, [evenements, agenda, retours]);
  const retoursAFaire = passes.filter(p => !p.annule && !p.retour).length;
  const passesAffiches = passes.filter(p =>
    filtreRetour === "tous" || (filtreRetour === "faits" ? !!p.retour : !p.annule && !p.retour));

  const ouvrirRetour = (c: CibleRetour) => setRetourOuvert(c);
  const comptesRendus = seances.filter(s => s.statut === "terminee");
  const crTrouves = useMemo(() => {
    const q = normaliser(rechercheCR.trim());
    if (!q) return comptesRendus;
    const nomDe = (id: string) => equipe.find(m => m.id === id)?.nom ?? "";
    return comptesRendus.filter(s => normaliser(texteCompteRendu(s, fiches, nomDe, equipe)).includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seances, fiches, equipe, rechercheCR]);

  // ── Lancement d'une réunion
  const lancer = async ({ titre, participants, retenues, ajouts }: { titre: string; participants: string[]; retenues: Suggestion[]; ajouts: string[] }) => {
    const nouveaux = [
      ...retenues.map(s => ({ genre: "point", titre: s.titre, description: s.description, priorite: s.priorite, evenement_id: s.evenement_id ?? null })),
      ...ajouts.map(t => ({ genre: "point", titre: t, priorite: 1 })),
    ];
    for (const n of nouveaux) {
      const f = await envoyer<Fiche>("/api/reunion/fiches", "POST", n);
      if (f) majFiche(f);
    }
    const s = await envoyer<Seance>("/api/reunion/seances", "POST", { titre: titre.trim() || null, participants, date: aujourdhui() });
    if (s) { majSeance(s); setVueSeance(true); setLancement(false); }
  };

  const suggestions = useMemo(() => {
    if (!lancement) return [];
    const existants = new Set(fiches.filter(f => f.genre === "point" && f.statut !== "fait").map(f => f.titre.toLowerCase()));
    return suggererPoints(fiches, evenements, retours, agenda, seances, nomDe).filter(s => !existants.has(s.titre.toLowerCase()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancement]);

  const ongletBtn = (o: Onglet, label: string, n?: number) => (
    <button key={o} onClick={() => setOnglet(o)} style={{
      fontFamily: "inherit", cursor: "pointer", padding: "7px 14px", borderRadius: 8, fontSize: 14,
      fontWeight: onglet === o ? 800 : 600, whiteSpace: "nowrap",
      background: onglet === o ? "var(--turquoise)" : "var(--white)",
      border: "2px solid var(--ink)", boxShadow: onglet === o ? "3px 3px 0 var(--ink)" : "none",
      transform: onglet === o ? "translateY(-1px)" : "none",
    }}>{label}{n !== undefined && <span style={{ opacity: 0.55, marginLeft: 6 }}>{n}</span>}</button>
  );

  const filtreChip = (v: string, label: React.ReactNode) => (
    <button key={v} onClick={() => setFiltreMembre(v)} style={{
      fontFamily: "inherit", cursor: "pointer", padding: "4px 10px", borderRadius: 20, fontSize: 13,
      display: "inline-flex", alignItems: "center", gap: 5,
      fontWeight: filtreMembre === v ? 800 : 500,
      background: filtreMembre === v ? "var(--ink)" : "var(--white)", color: filtreMembre === v ? "var(--cream)" : "var(--ink)",
      border: "2px solid var(--ink)",
    }}>{label}</button>
  );

  return (
    <>
      <NavBar current="reunion" />
      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 22 }}>

        {seanceEnCours && vueSeance ? (
          <VueSeance key={seanceEnCours.id} seance={seanceEnCours} equipe={equipe} fiches={fiches} evenements={evenements} connecte={connecte}
            onSeance={majSeance} onFiche={majFiche} onOuvrirFiche={setFicheEditee} onBasculerFiche={basculerFiche}
            onQuitter={() => setVueSeance(false)} />
        ) : (
          <>
            {/* En-tête */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <h1 className="bc" style={{ margin: 0, fontSize: 34, lineHeight: 1 }}>Bureau</h1>
                <div style={{ fontSize: 14, opacity: 0.6, marginTop: 4 }}>L’équipe, ses missions et ses événements en un coup d’œil</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {connecte && <>
                  <button className="pop-btn pop-btn-outline" onClick={() => setFicheEditee({ genre: "point" })}>+ Point</button>
                  <button className="pop-btn pop-btn-outline" onClick={() => setFicheEditee({ genre: "mission", assignes: moi ? [moi] : [] })}>+ Mission</button>
                  <button className="pop-btn pop-btn-outline" onClick={() => setEvOuvert({})}>+ Événement</button>
                </>}
                {seanceEnCours
                  ? <button className="pop-btn pop-btn-dark" onClick={() => setVueSeance(true)}>● Reprendre la réunion</button>
                  : connecte && <button className="pop-btn pop-btn-dark" onClick={() => setLancement(true)} disabled={!charge}>▶ Lancer une réunion</button>}
              </div>
            </div>

            {!connecte && !chargementCompte && (
              <div style={{ fontSize: 14, padding: "8px 12px", borderRadius: 8, border: "2px dashed var(--ink)", background: "var(--white)" }}>
                🔒 Consultation libre. Pour créer un point, une mission, un événement ou lancer une réunion, connecte-toi avec « Se connecter » en haut à droite.
              </div>
            )}

            {seanceEnCours && (
              <button onClick={() => setVueSeance(true)} className="pop-card" style={{
                background: "var(--turquoise)", padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer", fontFamily: "inherit", fontSize: 15, fontWeight: 700, textAlign: "left",
              }}>
                <span className="pulse" style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--rouge)", border: "2px solid var(--ink)" }} />
                Une réunion est en cours depuis le {dateCourte(seanceEnCours.date)} — reprendre →
              </button>
            )}

            {/* Indicateurs */}
            <div className="pop-grid-4 keep-2">
              {[
                { n: kpi.points, label: "points à aborder", fond: "var(--bleu)" },
                { n: kpi.missions, label: "missions ouvertes", fond: "var(--yellow)" },
                { n: kpi.retard, label: "en retard", fond: kpi.retard ? "var(--rouge)" : "var(--white)" },
                moi
                  ? { n: kpi.miennes, label: "pour moi", fond: "var(--vert)" }
                  : { n: kpi.urgentes, label: "urgentes", fond: kpi.urgentes ? "var(--orange)" : "var(--white)" },
              ].map(k => (
                <div key={k.label} className="pop-card" style={{ background: k.fond, padding: "10px 14px", display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="bc" style={{ fontSize: 30, lineHeight: 1 }}>{k.n}</span>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{k.label}</span>
                </div>
              ))}
            </div>

            {/* À venir */}
            <Section titre="À venir" droite={<Link href="/agenda" style={{ fontSize: 13, color: "inherit" }}>Agenda →</Link>}>
              {charge ? <ApercuEvenements items={aVenir} onOuvrir={setEvOuvert} /> : <Vide>Chargement…</Vide>}
            </Section>

            {/* Onglets */}
            <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 4px 4px 0" }}>
              {ongletBtn("taches", "Points & missions", kpi.points + kpi.missions)}
              {ongletBtn("evenements", "Événements", evsAffiches.length)}
              {ongletBtn("comptes-rendus", "Comptes rendus", comptesRendus.length)}
            </div>

            {onglet === "taches" && (
              <>
                <div className="pop-toolbar">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {filtreChip("tous", "Toute l'équipe")}
                    {moi && filtreChip("moi", "Moi")}
                    {equipe.filter(m => m.id !== moi).map(m => filtreChip(m.id, <><Avatar m={m} taille={18} />{m.nom}</>))}
                  </div>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={voirFaites} onChange={e => setVoirFaites(e.target.checked)} /> Afficher ce qui est terminé
                  </label>
                </div>
                <div className="pop-grid-2" style={{ alignItems: "start", gap: 20 }}>
                  <Section titre={`💬 Points à aborder · ${points.filter(p => p.statut !== "fait").length}`}
                    droite={connecte && <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => setFicheEditee({ genre: "point" })}>+</button>}>
                    {points.length === 0 && <Vide>Rien à l’ordre du jour. Une idée, un souci ? Ajoute un point.</Vide>}
                    {points.map(f => (
                      <CarteFiche key={f.id} f={f} equipe={equipe} evenements={evenements} onOuvrir={() => setFicheEditee(f)} onBasculer={() => basculerFiche(f)} />
                    ))}
                  </Section>
                  <Section titre={`🎯 Missions à prioriser · ${missions.filter(p => p.statut !== "fait").length}`}
                    droite={connecte && <button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => setFicheEditee({ genre: "mission", assignes: moi ? [moi] : [] })}>+</button>}>
                    {missions.length === 0 && <Vide>Aucune mission{filtreMembre !== "tous" ? " pour ce filtre" : ""}.</Vide>}
                    {missions.map(f => (
                      <CarteFiche key={f.id} f={f} equipe={equipe} evenements={evenements} onOuvrir={() => setFicheEditee(f)} onBasculer={() => basculerFiche(f)} />
                    ))}
                  </Section>
                </div>
              </>
            )}

            {onglet === "evenements" && (
              <>
                <div className="pop-toolbar">
                  <Segments<"a-venir" | "passes">
                    options={[
                      { v: "a-venir", label: `À venir · ${evsAffiches.length}` },
                      { v: "passes", label: `Passés${retoursAFaire ? ` · ${retoursAFaire} retour${retoursAFaire > 1 ? "s" : ""} à faire` : ""}` },
                    ]}
                    valeur={periodeEv} onChange={setPeriodeEv} />
                  {periodeEv === "a-venir" && connecte && <button className="pop-btn pop-btn-yellow" style={{ marginLeft: "auto" }} onClick={() => setEvOuvert({})}>+ Nouvel événement</button>}
                  {periodeEv === "passes" && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginLeft: "auto" }}>
                      {([["tous", "Tous"], ["a_faire", "Retour à faire"], ["faits", "Avec retour"]] as const).map(([v, label]) => (
                        <button key={v} onClick={() => { setFiltreRetour(v); setNbPasses(30); }} style={{
                          fontFamily: "inherit", cursor: "pointer", padding: "4px 10px", borderRadius: 20, fontSize: 13,
                          fontWeight: filtreRetour === v ? 800 : 500, border: "2px solid var(--ink)",
                          background: filtreRetour === v ? "var(--ink)" : "var(--white)", color: filtreRetour === v ? "var(--cream)" : "var(--ink)",
                        }}>{label}</button>
                      ))}
                    </div>
                  )}
                </div>
                {periodeEv === "passes" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {passesAffiches.length === 0 && <Vide>{filtreRetour === "a_faire" ? "Tous les retours sont faits 🎉" : "Aucun événement passé."}</Vide>}
                    {passesAffiches.slice(0, nbPasses).map(it => (
                      <LignePasse key={it.cle} it={it} equipe={equipe} connecte={connecte} onOuvrirEv={setEvOuvert} onRetour={ouvrirRetour} />
                    ))}
                    {passesAffiches.length > nbPasses && (
                      <button className="pop-btn pop-btn-outline" style={{ alignSelf: "center" }} onClick={() => setNbPasses(n => n + 30)}>
                        Afficher plus ({passesAffiches.length - nbPasses} restants)
                      </button>
                    )}
                  </div>
                )}
                {periodeEv === "a-venir" && evsAffiches.length === 0 && <Vide>Aucun événement en préparation. Une animation, une soirée jeux, un partenariat ? Crée-le ici, prépare-le avec des missions, puis ajoute-le à l’agenda.</Vide>}
                {periodeEv === "a-venir" && <div className="pop-grid-3">
                  {evsAffiches.map(e => {
                    const t = typeEv(e.type);
                    const [faites, total] = avancement(e.id);
                    const j = e.date_debut ? joursAvant(e.date_debut) : null;
                    return (
                      <button key={e.id} className="pop-card pop-card-hover" onClick={() => setEvOuvert(e)} style={{
                        padding: 0, overflow: "hidden", textAlign: "left", cursor: "pointer", fontFamily: "inherit", color: "inherit",
                        background: "var(--white)", display: "flex", flexDirection: "column", opacity: EV_ARCHIVE.includes(e.statut) ? 0.6 : 1,
                      }}>
                        <div style={{ background: t.couleur, borderBottom: "2px solid var(--ink)", padding: "8px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 20 }}>{t.icone}</span>
                          <span style={{ fontWeight: 800, fontSize: 16, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{e.titre}</span>
                          {e.agenda_id && <span title="Dans l'agenda">📅</span>}
                        </div>
                        <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, width: "100%", boxSizing: "border-box" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <Pastille texte={statutEv(e.statut).label} fond={statutEv(e.statut).couleur} />
                            {e.date_debut
                              ? <span style={{ fontSize: 13, fontWeight: 600 }}>
                                  {dateCourte(e.date_debut)}{e.date_fin && e.date_fin !== e.date_debut ? ` → ${dateCourte(e.date_fin)}` : ""}
                                  {j !== null && j >= 0 && !EV_ARCHIVE.includes(e.statut) && <span style={{ opacity: 0.55 }}> · {j === 0 ? "aujourd'hui" : `J-${j}`}</span>}
                                </span>
                              : <span style={{ fontSize: 13, opacity: 0.55 }}>Pas encore daté</span>}
                          </div>
                          {e.lieu && <div style={{ fontSize: 13, opacity: 0.7 }}>📍 {e.lieu}</div>}
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 8, borderRadius: 4, border: "1.5px solid var(--ink)", background: "var(--cream)", overflow: "hidden" }}>
                              <div style={{ height: "100%", width: total ? `${(faites / total) * 100}%` : 0, background: "var(--vert)" }} />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>{total ? `${faites}/${total}` : "0 mission"}</span>
                            <span style={{ display: "inline-flex" }}>
                              {e.responsables.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={22} /></span>)}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>}
              </>
            )}

            {onglet === "comptes-rendus" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {connecte && (
                  <button className="pop-btn pop-btn-outline" style={{ alignSelf: "flex-start" }} onClick={() => setImportCR(true)}>📥 Importer un compte rendu (Word, PDF)</button>
                )}
                {comptesRendus.length > 0 && (
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5, pointerEvents: "none" }}>🔍</span>
                    <input type="search" value={rechercheCR} onChange={e => setRechercheCR(e.target.value)}
                      placeholder="Rechercher dans les comptes rendus : un mot, un nom, une décision…"
                      style={{ ...inp, paddingLeft: 36 }} />
                  </div>
                )}
                {rechercheCR.trim() && (
                  <div style={{ fontSize: 13, opacity: 0.65 }}>
                    {crTrouves.length
                      ? `${crTrouves.length} compte${crTrouves.length > 1 ? "s" : ""} rendu${crTrouves.length > 1 ? "s" : ""} sur ${comptesRendus.length}`
                      : "Aucun compte rendu ne contient ce texte."}
                  </div>
                )}
                {comptesRendus.length === 0 && <Vide>Pas encore de compte rendu. Lance une réunion pour en créer un.</Vide>}
                {crTrouves.map(s => (
                  <CarteCompteRendu key={s.id} s={s} equipe={equipe} fiches={fiches} q={rechercheCR} onMaj={majSeance}
                    onOuvrirFiche={f => setFicheEditee(f)}
                    onSupprime={id => setSeances(prev => prev.filter(x => x.id !== id))} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {importCR && (
        <ModalImportCR equipe={equipe} onFermer={() => setImportCR(false)} onImporte={() => {
          setImportCR(false);
          lireListe<Fiche>("/api/reunion/fiches").then(setFiches);
          lireListe<Seance>("/api/reunion/seances").then(setSeances);
        }} />
      )}

      {lancement && (
        <ModalLancement equipe={equipe} moi={moi} suggestions={suggestions}
          points={fiches.filter(f => f.genre === "point" && f.statut !== "fait")}
          onFermer={() => setLancement(false)} onLancer={lancer} />
      )}

      {evOuvert && (
        <ModalEvenement key={evOuvert.id ?? "nouveau"} initial={evOuvert} equipe={equipe} evenements={evenements} fiches={fiches} connecte={connecte}
          retour={evOuvert.id ? retourDe(evOuvert.id) : undefined}
          onOuvrirRetour={e => ouvrirRetour({ titre: e.titre, type: e.type, date: e.date_debut, date_fin: e.date_fin, evenement_id: e.id })}
          onFermer={() => setEvOuvert(null)}
          onEvenement={e => { majEvenement(e); if (!evOuvert.id) setEvOuvert(e); }}
          onEvSupprime={id => {
            setEvenements(prev => prev.filter(x => x.id !== id));
            setFiches(prev => prev.filter(f => f.evenement_id !== id));
            setRetours(prev => prev.filter(r => r.evenement_id !== id));
            setEvOuvert(null);
          }}
          onFiche={majFiche} onOuvrirFiche={setFicheEditee} onBasculerFiche={basculerFiche} />
      )}

      {/* Après la fenêtre d'événement : le retour ouvert depuis elle s'affiche par-dessus. */}
      {retourOuvert && (
        <ModalRetour key={`retour-${retourOuvert.evenement_id ?? retourOuvert.agenda_id}`} cible={retourOuvert} equipe={equipe}
          initial={retourOuvert.evenement_id ? retourDe(retourOuvert.evenement_id) : undefined}
          onFermer={() => setRetourOuvert(null)}
          onEnregistre={(r, ev) => { majRetour(r); if (ev) majEvenement(ev); setRetourOuvert(null); }}
          onSupprime={id => { setRetours(prev => prev.filter(x => x.id !== id)); setRetourOuvert(null); }} />
      )}

      {/* Après la fenêtre d'événement : une mission ouverte depuis elle s'affiche par-dessus. */}
      {ficheEditee && (
        <ModalFiche key={ficheEditee.id ?? "nouvelle"} initial={ficheEditee} equipe={equipe} evenements={evenements}
          onFermer={() => setFicheEditee(null)}
          onEnregistre={f => { majFiche(f); setFicheEditee(null); }}
          onSupprime={id => { setFiches(prev => prev.filter(x => x.id !== id)); setFicheEditee(null); }} />
      )}
    </>
  );
}
