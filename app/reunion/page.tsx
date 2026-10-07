"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { format, parseISO, differenceInCalendarDays, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import NavBar from "../../components/NavBar";
import { useCompte } from "../../components/AuthProvider";

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
  evenement_id: string | null;
  seance_id: string | null;
  decision: string | null;
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
const typeEv = (t: string) => TYPES_EV[t] ?? TYPES_EV["Autre"];

const STATUTS_EV: { v: string; label: string; couleur: string }[] = [
  { v: "idee",        label: "💡 Idée",           couleur: "var(--cream2)" },
  { v: "preparation", label: "🛠️ En préparation", couleur: "var(--yellow)" },
  { v: "pret",        label: "✅ Prêt",           couleur: "var(--vert)" },
  { v: "termine",     label: "🏁 Terminé",        couleur: "var(--bleu)" },
  { v: "annule",      label: "✖ Annulé",          couleur: "var(--rose)" },
];
const statutEv = (v: string) => STATUTS_EV.find(s => s.v === v) ?? STATUTS_EV[0];
const EV_ARCHIVE = ["termine", "annule"];

// Côté agenda, ces types sont des absences ou des heures, pas des événements à préparer.
const estEvenementAgenda = (type: string) =>
  !/Congé|RTT|Récupération|Formation/.test(type) && type !== "Heures Exceptionnelles";

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
function suggererPoints(fiches: Fiche[], evs: EvPrep[], agenda: EvAgenda[], seances: Seance[], nomDe: (id: string) => string): Suggestion[] {
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

  for (const ev of evs) {
    if (EV_ARCHIVE.includes(ev.statut)) continue;
    const liees = fiches.filter(f => f.evenement_id === ev.id && f.genre === "mission");
    const faites = liees.filter(f => f.statut === "fait").length;
    const fin = ev.date_fin || ev.date_debut;
    if (fin && fin < auj) {
      out.push({ cle: `bilan-${ev.id}`, titre: `Bilan : ${ev.titre}`, priorite: 1, evenement_id: ev.id, description: "Ce qui a marché, ce qu'on change la prochaine fois." });
    } else if (ev.date_debut && joursAvant(ev.date_debut) <= 30 && ev.statut !== "pret") {
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

function Avatar({ m, taille = 24 }: { m?: Membre; taille?: number }) {
  if (!m) return null;
  const initiales = m.nom.split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span title={m.nom} style={{
      width: taille, height: taille, borderRadius: "50%", flexShrink: 0,
      background: m.couleur || (m.groupe === "A" ? "#f87171" : m.groupe === "B" ? "#60a5fa" : "#a8e063"),
      border: "1.5px solid var(--ink)", fontSize: taille * 0.42, fontWeight: 900,
      display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink)",
    }}>{initiales}</span>
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
          {f.statut === "en_cours" && <Pastille texte="▶ En cours" fond="var(--bleu)" />}
          <BadgeDeadline f={f} />
          {ev && <Pastille texte={`${typeEv(ev.type).icone} ${ev.titre}`} fond="var(--cream)" />}
          {f.assignes.length > 0 && (
            <span style={{ display: "inline-flex", marginLeft: "auto" }}>
              {f.assignes.map((id, i) => (
                <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={22} /></span>
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
      <div>
        <label style={etiquette}>{estPoint ? "Porté par" : "Assignée à"}</label>
        <ChoixMembres equipe={equipe} valeur={f.assignes ?? []} onChange={v => maj({ assignes: v })} />
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

function ModalEvenement({ initial, equipe, evenements, fiches, onFermer, onEvenement, onEvSupprime, onFiche, onOuvrirFiche, onBasculerFiche }: {
  initial: Partial<EvPrep>; equipe: Membre[]; evenements: EvPrep[]; fiches: Fiche[];
  onFermer: () => void; onEvenement: (e: EvPrep) => void; onEvSupprime: (id: string) => void;
  onFiche: (f: Fiche) => void; onOuvrirFiche: (f: Partial<Fiche>) => void; onBasculerFiche: (f: Fiche) => void;
}) {
  const [ev, setEv] = useState<Partial<EvPrep>>({ type: "Animation", statut: "idee", responsables: [], ...initial });
  const [modifie, setModifie] = useState(!initial.id);
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
        {ev.id && (
          <button className="pop-btn pop-btn-outline" onClick={versAgenda} disabled={!ev.date_debut}
            title={ev.date_debut ? "Les responsables y figurent comme participants" : "Il faut une date"}>
            📅 {ev.agenda_id ? "Mettre à jour l'agenda" : "Ajouter à l'agenda"}
          </button>
        )}
        <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!ev.titre?.trim() || envoi || !modifie}>
          {envoi ? "…" : ev.id ? (modifie ? "Enregistrer" : "Enregistré ✓") : "Créer"}
        </button>
      </div>

      {ev.id && (
        <Section titre={`Missions de préparation${missions.length ? ` · ${faites}/${missions.length}` : ""}`}
          droite={<button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }}
            onClick={() => onOuvrirFiche({ genre: "mission", evenement_id: ev.id })}>+ Détaillée</button>}>
          {missions.length > 0 && (
            <div style={{ height: 8, borderRadius: 4, border: "1.5px solid var(--ink)", background: "var(--white)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(faites / missions.length) * 100}%`, background: "var(--vert)" }} />
            </div>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <input value={nouvelle} onChange={e => setNouvelle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouterMission(); }}
              placeholder="Ajouter une mission (Entrée)…" style={inp} />
            <button className="pop-btn pop-btn-yellow" onClick={ajouterMission} disabled={!nouvelle.trim()}>+</button>
          </div>
          {missions.map(m => (
            <CarteFiche key={m.id} f={m} equipe={equipe} evenements={evenements}
              onOuvrir={() => onOuvrirFiche(m)} onBasculer={() => onBasculerFiche(m)} />
          ))}
        </Section>
      )}
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

// ─── Point traité en séance ───────────────────────────────────────────────────

function PointEnSeance({ p, equipe, seanceId, onMaj, onOuvrir }: {
  p: Fiche; equipe: Membre[]; seanceId: string; onMaj: (f: Fiche) => void; onOuvrir: () => void;
}) {
  const [decision, setDecision] = useState(p.decision ?? "");
  const [versMission, setVersMission] = useState(false);
  const [assignes, setAssignes] = useState<string[]>(p.assignes);
  const [deadline, setDeadline] = useState(p.deadline ?? "");
  const [prio, setPrio] = useState(p.priorite);
  const traite = p.statut === "fait" || p.genre === "mission";

  const sauver = async (champs: Partial<Fiche>) => {
    const res = await envoyer<Fiche>(`/api/reunion/fiches/${p.id}`, "PUT", champs);
    if (res) onMaj(res);
  };

  return (
    <div className="pop-card" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, background: traite ? "var(--cream2)" : "var(--white)", flexShrink: 0 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 16, overflowWrap: "anywhere" }}>
            {p.genre === "mission" ? "🎯 " : traite ? "✓ " : ""}{p.titre}
          </div>
          {p.description && <div style={{ fontSize: 13, opacity: 0.7, whiteSpace: "pre-wrap", marginTop: 2 }}>{p.description}</div>}
        </div>
        <button onClick={onOuvrir} title="Modifier" style={{ border: "none", background: "none", cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✏️</button>
      </div>

      {!traite && <ChoixPriorite compact valeur={p.priorite} onChange={v => sauver({ priorite: v })} />}

      <textarea value={decision} onChange={e => setDecision(e.target.value)}
        onBlur={() => { if (decision !== (p.decision ?? "")) sauver({ decision }); }}
        placeholder="Décision, remarques…" rows={2} style={{ ...inp, resize: "vertical", fontSize: 13 }} />

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
    </div>
  );
}

// ─── Vue « réunion en cours » ─────────────────────────────────────────────────

function VueSeance({ seance, equipe, fiches, evenements, onSeance, onFiche, onOuvrirFiche, onBasculerFiche, onQuitter }: {
  seance: Seance; equipe: Membre[]; fiches: Fiche[]; evenements: EvPrep[];
  onSeance: (s: Seance) => void; onFiche: (f: Fiche) => void;
  onOuvrirFiche: (f: Partial<Fiche>) => void; onBasculerFiche: (f: Fiche) => void; onQuitter: () => void;
}) {
  const [cr, setCr] = useState(seance.compte_rendu ?? "");
  const [envoye, setEnvoye] = useState(seance.compte_rendu ?? "");
  const [envoi, setEnvoi] = useState(false);
  const [saisie, setSaisie] = useState("");
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
        <Section titre={`Ordre du jour · ${aTraiter.length}`}>
          <div style={{ display: "flex", gap: 6 }}>
            <input value={saisie} onChange={e => setSaisie(e.target.value)} onKeyDown={e => { if (e.key === "Enter") ajouterPoint(); }} placeholder="Ajouter un point (Entrée)…" style={inp} />
            <button className="pop-btn pop-btn-yellow" onClick={ajouterPoint} disabled={!saisie.trim()}>+</button>
          </div>
          {aTraiter.length === 0 && <Vide>Tous les points ont été abordés 🎉</Vide>}
          {aTraiter.map(p => (
            <PointEnSeance key={p.id} p={p} equipe={equipe} seanceId={seance.id} onMaj={onFiche} onOuvrir={() => onOuvrirFiche(p)} />
          ))}
          {traites.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", opacity: 0.5, marginTop: 6 }}>Traités pendant cette réunion · {traites.length}</div>
              {traites.map(p => (
                <PointEnSeance key={p.id} p={p} equipe={equipe} seanceId={seance.id} onMaj={onFiche} onOuvrir={() => onOuvrirFiche(p)} />
              ))}
            </>
          )}
        </Section>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          <Section titre="Compte rendu" droite={
            <span style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>
              {etat === "ok" ? "Enregistré ✓" : etat === "envoi" ? "Enregistrement…" : "Modifié"}
            </span>}>
            <textarea value={cr} onChange={e => setCr(e.target.value)} rows={12}
              placeholder="Notes libres de la réunion. Les points abordés, décisions et missions créées s'ajoutent d'eux-mêmes au compte rendu."
              style={{ ...inp, resize: "vertical", fontSize: 14, lineHeight: 1.5, minHeight: 220 }} />
          </Section>

          <Section titre={`Missions à prioriser · ${missions.length}`} droite={
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

function CarteCompteRendu({ s, equipe, fiches, onMaj, onSupprime }: {
  s: Seance; equipe: Membre[]; fiches: Fiche[]; onMaj: (s: Seance) => void; onSupprime: (id: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(s.compte_rendu ?? "");
  const nomDe = (id: string) => equipe.find(m => m.id === id)?.nom ?? "?";
  const points = fiches.filter(f => f.seance_id === s.id && f.genre === "point");
  const missions = fiches.filter(f => f.seance_id === s.id && f.genre === "mission");

  const sauver = async () => {
    const res = await envoyer<Seance>(`/api/reunion/seances/${s.id}`, "PUT", { compte_rendu: texte });
    if (res) { onMaj(res); setEdition(false); }
  };
  const supprimer = async () => {
    if (!confirm("Supprimer ce compte rendu ? Les points et missions sont conservés.")) return;
    if (await envoyer(`/api/reunion/seances/${s.id}`, "DELETE")) onSupprime(s.id);
  };

  return (
    <div className="pop-card" style={{ padding: 0, background: "var(--white)", overflow: "hidden", flexShrink: 0 }}>
      <button onClick={() => setOuvert(o => !o)} style={{
        width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "12px 14px",
        background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", color: "inherit", flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 18 }}>{ouvert ? "▾" : "▸"}</span>
        <span style={{ fontWeight: 800, fontSize: 15, flex: 1, minWidth: 160 }}>
          {s.titre || "Réunion"} <span style={{ fontWeight: 500, opacity: 0.6 }}>· {dateLongue(s.date)}</span>
        </span>
        <span style={{ fontSize: 12, opacity: 0.65 }}>{points.length} point{points.length > 1 ? "s" : ""} · {missions.length} mission{missions.length > 1 ? "s" : ""}</span>
        <span style={{ display: "inline-flex" }}>
          {s.participants.map((id, i) => <span key={id} style={{ marginLeft: i ? -6 : 0 }}><Avatar m={equipe.find(m => m.id === id)} taille={22} /></span>)}
        </span>
      </button>
      {ouvert && (
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12, borderTop: "2px solid var(--cream2)" }}>
          {s.participants.length > 0 && <div style={{ fontSize: 13, marginTop: 10 }}><b>Présents :</b> {s.participants.map(nomDe).join(", ")}</div>}
          {points.length > 0 && (
            <div>
              <div style={etiquette}>Points abordés</div>
              {points.map(p => (
                <div key={p.id} style={{ fontSize: 14, marginBottom: 4 }}>
                  • <b>{p.titre}</b>{p.decision && <span style={{ opacity: 0.75 }}> — {p.decision}</span>}
                </div>
              ))}
            </div>
          )}
          {missions.length > 0 && (
            <div>
              <div style={etiquette}>Missions décidées</div>
              {missions.map(m => (
                <div key={m.id} style={{ fontSize: 14, marginBottom: 4, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <span>{m.statut === "fait" ? "✅" : "🎯"} <b>{m.titre}</b></span>
                  {m.assignes.length > 0 && <span style={{ opacity: 0.7 }}>→ {m.assignes.map(nomDe).join(", ")}</span>}
                  {m.deadline && <span style={{ opacity: 0.7 }}>· avant le {dateCourte(m.deadline)}</span>}
                  {m.decision && <span style={{ opacity: 0.6, width: "100%", paddingLeft: 20, fontSize: 13 }}>{m.decision}</span>}
                </div>
              ))}
            </div>
          )}
          <div>
            <div style={etiquette}>Notes</div>
            {edition ? (
              <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={8} style={{ ...inp, resize: "vertical" }} />
            ) : (
              <div style={{ fontSize: 14, whiteSpace: "pre-wrap", lineHeight: 1.5, opacity: s.compte_rendu ? 1 : 0.5 }}>{s.compte_rendu || "Pas de notes."}</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="pop-btn pop-btn-outline" onClick={supprimer} style={{ color: "#b91c1c", marginRight: "auto" }}>Supprimer</button>
            {edition
              ? <><button className="pop-btn pop-btn-outline" onClick={() => { setTexte(s.compte_rendu ?? ""); setEdition(false); }}>Annuler</button>
                  <button className="pop-btn pop-btn-dark" onClick={sauver}>Enregistrer</button></>
              : <button className="pop-btn pop-btn-outline" onClick={() => setEdition(true)}>✏️ Modifier les notes</button>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Aperçu des événements à venir ────────────────────────────────────────────

type ItemAVenir = { cle: string; date: string | null; titre: string; type: string; prep?: EvPrep; avancement?: [number, number] };

function ApercuEvenements({ items, onOuvrir }: { items: ItemAVenir[]; onOuvrir: (e: EvPrep) => void }) {
  if (!items.length) return <Vide>Rien de prévu pour les deux prochains mois.</Vide>;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

type Onglet = "taches" | "evenements" | "comptes-rendus";

export default function ReunionPage() {
  const { compte } = useCompte();
  const moi = compte?.equipe_id ?? null;

  const [equipe, setEquipe] = useState<Membre[]>([]);
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [evenements, setEvenements] = useState<EvPrep[]>([]);
  const [seances, setSeances] = useState<Seance[]>([]);
  const [agenda, setAgenda] = useState<EvAgenda[]>([]);
  const [charge, setCharge] = useState(false);

  const [onglet, setOnglet] = useState<Onglet>("taches");
  const [filtreMembre, setFiltreMembre] = useState<string>("tous");
  const [voirFaites, setVoirFaites] = useState(false);
  const [voirArchives, setVoirArchives] = useState(false);
  const [vueSeance, setVueSeance] = useState(true);

  const [ficheEditee, setFicheEditee] = useState<Partial<Fiche> | null>(null);
  const [evOuvert, setEvOuvert] = useState<Partial<EvPrep> | null>(null);
  const [lancement, setLancement] = useState(false);

  useEffect(() => {
    Promise.all([
      lireListe<Membre>("/api/equipe").then(setEquipe),
      lireListe<Fiche>("/api/reunion/fiches").then(setFiches),
      lireListe<EvPrep>("/api/reunion/evenements").then(setEvenements),
      lireListe<Seance>("/api/reunion/seances").then(setSeances),
      lireListe<EvAgenda>("/api/evenements").then(setAgenda),
    ]).then(() => setCharge(true));
  }, []);

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
    const limite = format(addDays(new Date(), 60), "yyyy-MM-dd");
    const items: ItemAVenir[] = [];
    for (const e of evenements) {
      if (EV_ARCHIVE.includes(e.statut)) continue;
      if (e.date_debut && (e.date_fin || e.date_debut) < auj) continue;
      items.push({ cle: `p-${e.id}`, date: e.date_debut, titre: e.titre, type: e.type, prep: e, avancement: avancement(e.id) });
    }
    const suivis = new Set(evenements.map(e => e.agenda_id).filter(Boolean));
    const series = new Set<string>();
    for (const a of [...agenda].sort((x, y) => x.date_debut.localeCompare(y.date_debut))) {
      if (!estEvenementAgenda(a.type) || suivis.has(a.id) || a.date_fin < auj || a.date_debut > limite) continue;
      // Une série récurrente n'apparaît qu'une fois : sa prochaine occurrence.
      if (a.parent_id) { if (series.has(a.parent_id)) continue; series.add(a.parent_id); }
      items.push({ cle: `a-${a.id}`, date: a.date_debut < auj ? auj : a.date_debut, titre: a.titre || a.type, type: a.type });
    }
    return items.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evenements, agenda, fiches]);

  const evsAffiches = evenements.filter(e => voirArchives || !EV_ARCHIVE.includes(e.statut));
  const comptesRendus = seances.filter(s => s.statut === "terminee");

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
    return suggererPoints(fiches, evenements, agenda, seances, nomDe).filter(s => !existants.has(s.titre.toLowerCase()));
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
          <VueSeance key={seanceEnCours.id} seance={seanceEnCours} equipe={equipe} fiches={fiches} evenements={evenements}
            onSeance={majSeance} onFiche={majFiche} onOuvrirFiche={setFicheEditee} onBasculerFiche={basculerFiche}
            onQuitter={() => setVueSeance(false)} />
        ) : (
          <>
            {/* En-tête */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <h1 className="bc" style={{ margin: 0, fontSize: 34, lineHeight: 1 }}>Réunion</h1>
                <div style={{ fontSize: 14, opacity: 0.6, marginTop: 4 }}>L’équipe, ses missions et ses événements en un coup d’œil</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="pop-btn pop-btn-outline" onClick={() => setFicheEditee({ genre: "point" })}>+ Point</button>
                <button className="pop-btn pop-btn-outline" onClick={() => setFicheEditee({ genre: "mission", assignes: moi ? [moi] : [] })}>+ Mission</button>
                <button className="pop-btn pop-btn-outline" onClick={() => setEvOuvert({})}>+ Événement</button>
                {seanceEnCours
                  ? <button className="pop-btn pop-btn-dark" onClick={() => setVueSeance(true)}>● Reprendre la réunion</button>
                  : <button className="pop-btn pop-btn-dark" onClick={() => setLancement(true)} disabled={!charge}>▶ Lancer une réunion</button>}
              </div>
            </div>

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
              {ongletBtn("evenements", "Préparation d'événements", evenements.filter(e => !EV_ARCHIVE.includes(e.statut)).length)}
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
                    droite={<button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => setFicheEditee({ genre: "point" })}>+</button>}>
                    {points.length === 0 && <Vide>Rien à l’ordre du jour. Une idée, un souci ? Ajoute un point.</Vide>}
                    {points.map(f => (
                      <CarteFiche key={f.id} f={f} equipe={equipe} evenements={evenements} onOuvrir={() => setFicheEditee(f)} onBasculer={() => basculerFiche(f)} />
                    ))}
                  </Section>
                  <Section titre={`🎯 Missions à prioriser · ${missions.filter(p => p.statut !== "fait").length}`}
                    droite={<button className="pop-btn pop-btn-outline" style={{ padding: "3px 10px", fontSize: 13 }} onClick={() => setFicheEditee({ genre: "mission", assignes: moi ? [moi] : [] })}>+</button>}>
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
                  <button className="pop-btn pop-btn-yellow" onClick={() => setEvOuvert({})}>+ Nouvel événement</button>
                  <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>
                    <input type="checkbox" checked={voirArchives} onChange={e => setVoirArchives(e.target.checked)} /> Afficher terminés et annulés
                  </label>
                </div>
                {evsAffiches.length === 0 && <Vide>Aucun événement en préparation. Une animation, une soirée jeux, un partenariat ? Crée-le ici, prépare-le avec des missions, puis ajoute-le à l’agenda.</Vide>}
                <div className="pop-grid-3">
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
                </div>
              </>
            )}

            {onglet === "comptes-rendus" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {comptesRendus.length === 0 && <Vide>Pas encore de compte rendu. Lance une réunion pour en créer un.</Vide>}
                {comptesRendus.map(s => (
                  <CarteCompteRendu key={s.id} s={s} equipe={equipe} fiches={fiches} onMaj={majSeance}
                    onSupprime={id => setSeances(prev => prev.filter(x => x.id !== id))} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {lancement && (
        <ModalLancement equipe={equipe} moi={moi} suggestions={suggestions}
          points={fiches.filter(f => f.genre === "point" && f.statut !== "fait")}
          onFermer={() => setLancement(false)} onLancer={lancer} />
      )}

      {evOuvert && (
        <ModalEvenement key={evOuvert.id ?? "nouveau"} initial={evOuvert} equipe={equipe} evenements={evenements} fiches={fiches}
          onFermer={() => setEvOuvert(null)}
          onEvenement={e => { majEvenement(e); if (!evOuvert.id) setEvOuvert(e); }}
          onEvSupprime={id => { setEvenements(prev => prev.filter(x => x.id !== id)); setFiches(prev => prev.filter(f => f.evenement_id !== id)); setEvOuvert(null); }}
          onFiche={majFiche} onOuvrirFiche={setFicheEditee} onBasculerFiche={basculerFiche} />
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
