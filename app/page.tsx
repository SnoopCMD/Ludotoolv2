"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import NavBar from "../components/NavBar";
import {
  format, startOfWeek, endOfWeek, eachDayOfInterval,
  isToday, addWeeks, subWeeks, getISOWeek,
} from "date-fns";
import { fr } from "date-fns/locale";

// ─── Constantes planning ──────────────────────────────────────────────────────

const HEURE_DEBUT = 8;
const HEURE_FIN = 21;
const HEURES_GRILLE = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const ABSENCE_TYPES = ["Congé", "Demi-Congé", "RTT", "Demi-RTT", "Récupération", "Demi-Récupération"];

// ─── Types ────────────────────────────────────────────────────────────────────

type MembreEquipe = {
  id: string;
  nom: string;
  role: string;
  heures_hebdo_base: number;
  groupe?: string;
  horaires: Record<string, any>;
};

type Evenement = {
  id: string;
  titre: string;
  type: string;
  date_debut: string;
  date_fin: string;
  heure_debut?: string | null;
  heure_fin?: string | null;
  membres: string[];
};

type Nouveaute = {
  id: string | number;
  nom: string;
  ean: string;
  couleur?: string;
  date_sortie?: string | null;
  image_url?: string;
};

type Alerte = {
  id: string;
  titre: string;
  description: string | null;
  type: "urgent" | "info" | "jeu";
  jeu_nom: string | null;
  statut: "active" | "resolue";
  created_at: string;
};

type JeuNote = { texte: string; rappel: boolean };
type RappelItem = { jeu_id: string | number; nom: string; texte: string; code_syracuse?: string };

// ─── Helpers planning ─────────────────────────────────────────────────────────

const timeToMins = (t: string, isEnd = false): number => {
  if (!t) return 0;
  const parts = t.split(":").map(Number);
  let h = parts[0], m = parts[1] ?? 0;
  if (isEnd && h === 0 && m === 0) h = 24;
  return h * 60 + m;
};

const soustraireHeures = (
  debutA: string, finA: string, debutB: string, finB: string
): { debut: string; fin: string }[] => {
  const startA = timeToMins(debutA), endA = timeToMins(finA, true);
  const startB = timeToMins(debutB), endB = timeToMins(finB, true);
  if (startB >= endA || endB <= startA) return [{ debut: debutA, fin: finA }];
  const res: { debut: string; fin: string }[] = [];
  const pad = (mins: number) => {
    const hh = Math.floor(mins / 60).toString().padStart(2, "0");
    const mm = (mins % 60).toString().padStart(2, "0");
    return `${hh}:${mm}`;
  };
  if (startA < startB) res.push({ debut: debutA, fin: pad(startB) });
  if (endA > endB) res.push({ debut: pad(endB), fin: finA });
  return res;
};

const getHoraireForDay = (
  membre: MembreEquipe, dateKey: string, nomJour: string, typeSemaine: string
): { debut: string; fin: string; pause: number } | null => {
  if (membre.horaires?.exceptions?.[dateKey]) {
    const ex = membre.horaires.exceptions[dateKey];
    if (!ex.debut || !ex.fin) return null;
    return { ...ex, pause: ex.pause ?? 1 };
  }
  const h = membre.horaires?.[typeSemaine]?.[nomJour];
  if (h && h.debut && h.fin) return { ...h, pause: h.pause ?? 1 };
  return null;
};

const genererBlocsHoraires = (membres: { nom: string; groupe?: string; debut: string; fin: string }[]) => {
  const points = new Set<string>();
  membres.forEach(m => { if (m.debut && m.fin) { points.add(m.debut); points.add(m.fin); } });
  const timepoints = Array.from(points).sort((a, b) => timeToMins(a, true) - timeToMins(b, true));
  const blocs: { debut: string; fin: string; membres: typeof membres }[] = [];
  for (let i = 0; i < timepoints.length - 1; i++) {
    const start = timepoints[i], end = timepoints[i + 1];
    const startMins = timeToMins(start, true), endMins = timeToMins(end, true);
    const presents = membres.filter(
      m => timeToMins(m.debut) <= startMins && timeToMins(m.fin, true) >= endMins
    );
    if (presents.length > 0) blocs.push({ debut: start, fin: end, membres: presents });
  }
  return blocs;
};

const calculerPositionTop = (heureStr: string, isEnd = false): number => {
  if (!heureStr) return 0;
  const parts = heureStr.split(":").map(Number);
  let h = parts[0], m = parts[1] ?? 0;
  if (isEnd && h === 0 && m === 0) h = 24;
  return Math.max(0, Math.min(100, (((h - HEURE_DEBUT) * 60 + m) / ((HEURE_FIN - HEURE_DEBUT) * 60)) * 100));
};

const getBlocColor = (membres: { groupe?: string; isSwap?: boolean }[]): string => {
  const hasSwap = membres.some(m => m.isSwap);
  if (hasSwap) return "#c4b5fd";
  const countA = membres.filter(m => m.groupe === "A").length;
  const countB = membres.filter(m => m.groupe === "B").length;
  if (countA > 0 && countB > 0) return "#a8e063";
  if (countA > 0) return "#f87171";
  if (countB > 0) return "#60a5fa";
  return "#a8e063";
};

// ─── Helpers événements ───────────────────────────────────────────────────────

const getEventStyle = (type: string): React.CSSProperties => {
  if (type.includes("RTT")) return { background: "var(--vert)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
  if (type.includes("Congé") || type.includes("Récupération")) return { background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)" };
  if (type === "Réunion") return { background: "var(--bleu)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
  if (type === "Animation") return { background: "var(--orange)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
  if (type === "Soirée Jeux") return { background: "var(--purple)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
  if (type === "Heures Exceptionnelles") return { background: "var(--yellow)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
  return { background: "var(--cream2)", color: "var(--ink)", border: "1.5px solid var(--ink)" };
};

const getEventBorderColor = (type: string): string => {
  if (type.includes("RTT")) return "#34d399";
  if (type.includes("Congé") || type.includes("Récupération")) return "#f87171";
  if (type === "Réunion") return "#818cf8";
  if (type === "Animation") return "#fbbf24";
  if (type === "Soirée Jeux") return "#c084fc";
  if (type === "Heures Exceptionnelles") return "#2dd4bf";
  return "#94a3b8";
};

const getEventIcon = (type: string): string => {
  if (type.includes("Congé")) return "🏖️";
  if (type.includes("RTT")) return "🌴";
  if (type.includes("Récupération")) return "🛋️";
  if (type === "Réunion") return "💬";
  if (type === "Animation") return "🎪";
  if (type === "Soirée Jeux") return "🌙";
  if (type === "Heures Exceptionnelles") return "⭐";
  return "📌";
};

// ─── Couleurs jeux & alertes ──────────────────────────────────────────────────

const COULEURS_JEU: Record<string, string> = {
  vert: "#a8e063", rose: "#f472b6", bleu: "#60a5fa", rouge: "#f87171", jaune: "#fb923c",
};

const ALERTE_STYLES: Record<string, { card: React.CSSProperties; badge: React.CSSProperties; label: string; icon: string }> = {
  urgent: { card: { background: "#fecaca", border: "2.5px solid var(--ink)" }, badge: { background: "var(--rouge)", color: "var(--white)" }, label: "Urgent", icon: "🚨" },
  info:   { card: { background: "var(--cream)", border: "2.5px solid var(--ink)" }, badge: { background: "var(--bleu)", color: "var(--ink)" }, label: "Info", icon: "💡" },
  jeu:    { card: { background: "#fef9c3", border: "2.5px solid var(--ink)" }, badge: { background: "var(--orange)", color: "var(--ink)" }, label: "Jeu", icon: "🎲" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccueilPage() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [rappels, setRappels] = useState<RappelItem[]>([]);
  const [equipe, setEquipe] = useState<MembreEquipe[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [nouveautes, setNouveautes] = useState<Nouveaute[]>([]);
  const [semaineRef, setSemaineRef] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ titre: "", description: "", type: "info", jeu_nom: "", jeu_id: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => { chargerAlertes(); chargerEquipe(); chargerNouveautes(); }, []);
  useEffect(() => { chargerEvenements(); }, [semaineRef]);

  const chargerAlertes = async () => {
    const [{ data: alertesData }, { data: rappelsData }] = await Promise.all([
      supabase.from("alertes").select("*").eq("statut", "active").order("created_at", { ascending: false }),
      supabase.from("jeux").select("id, nom, notes, code_syracuse").eq("notes_rappel", true),
    ]);
    if (alertesData) setAlertes(alertesData as Alerte[]);
    const flat: RappelItem[] = [];
    for (const r of (rappelsData ?? []) as any[]) {
      for (const note of ((r.notes as JeuNote[]) || [])) {
        if (note.rappel) flat.push({ jeu_id: r.id, nom: r.nom, texte: note.texte, code_syracuse: r.code_syracuse || undefined });
      }
    }
    setRappels(flat);
    setIsLoading(false);
  };

  const resolveRappel = async (jeu_id: string | number, texte: string) => {
    const { data } = await supabase.from("jeux").select("notes").eq("id", jeu_id).maybeSingle();
    const current: JeuNote[] = (data?.notes as JeuNote[]) || [];
    const idx = current.findIndex(n => n.rappel && n.texte === texte);
    if (idx >= 0) {
      const newNotes = current.filter((_, i) => i !== idx);
      await supabase.from("jeux").update({ notes: newNotes, notes_rappel: newNotes.some(n => n.rappel) }).eq("id", jeu_id);
    }
    setRappels(prev => {
      const i = prev.findIndex(r => r.jeu_id === jeu_id && r.texte === texte);
      return i >= 0 ? prev.filter((_, j) => j !== i) : prev;
    });
  };

  const chargerEquipe = async () => {
    const { data } = await supabase.from("equipe").select("*").order("nom");
    if (data) setEquipe(data as MembreEquipe[]);
  };

  const chargerNouveautes = async () => {
    const { data: jeuxData } = await supabase.from("jeux").select("id, nom, ean, date_sortie")
      .eq("statut", "En stock").eq("etape_nouveaute", true).not("date_sortie", "is", null).order("id", { ascending: false });
    if (!jeuxData || jeuxData.length === 0) return;
    const eans = [...new Set(jeuxData.map((j: any) => j.ean))];
    const { data: catData } = await supabase.from("catalogue").select("ean, image_url, couleur").in("ean", eans);
    const catMap: Record<string, { image_url?: string; couleur?: string }> = {};
    if (catData) catData.forEach((c: any) => { catMap[c.ean] = c; });
    const seen = new Set<string>();
    const list: Nouveaute[] = [];
    for (const j of jeuxData as any[]) {
      if (seen.has(j.ean)) continue;
      seen.add(j.ean);
      list.push({ id: j.id, nom: j.nom, ean: j.ean, couleur: catMap[j.ean]?.couleur, date_sortie: j.date_sortie, image_url: catMap[j.ean]?.image_url });
    }
    setNouveautes(list);
  };

  const chargerEvenements = async () => {
    const debut = startOfWeek(semaineRef, { weekStartsOn: 1 });
    const fin = endOfWeek(semaineRef, { weekStartsOn: 1 });
    const { data } = await supabase.from("evenements")
      .select("id, titre, type, date_debut, date_fin, heure_debut, heure_fin, membres")
      .lte("date_debut", format(fin, "yyyy-MM-dd")).gte("date_fin", format(debut, "yyyy-MM-dd"))
      .order("heure_debut", { ascending: true });
    if (data) setEvenements(data as Evenement[]);
  };

  const ouvrirModal = () => { setScanCode(""); setScanError(null); setIsModalOpen(true); };
  const fermerModal = () => {
    setScanCode(""); setScanError(null);
    setForm({ titre: "", description: "", type: "info", jeu_nom: "", jeu_id: "" });
    setIsModalOpen(false);
  };

  const rechercherJeuParScan = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setScanError(null);
    const codeF = /^\d+$/.test(code) && code.length < 8 ? code.padStart(8, "0") : code;
    const { data } = await supabase.from("jeux").select("id, nom, code_syracuse")
      .or(`code_syracuse.eq.${codeF},ean.eq.${codeF}`).limit(1).maybeSingle();
    if (data?.nom) {
      const suffix = data.code_syracuse ? ` (${String(data.code_syracuse).slice(-4)})` : "";
      setForm(f => ({ ...f, jeu_nom: data.nom + suffix, type: "jeu", jeu_id: String(data.id) }));
      setScanCode("");
    } else {
      setScanError(`Aucun jeu trouvé pour le code « ${codeF} »`);
    }
  };

  const creerAlerte = async () => {
    if (!form.titre.trim()) return;
    setIsSaving(true);
    if (form.type === "jeu" && form.jeu_id) {
      const noteText = [form.titre.trim(), form.description.trim()].filter(Boolean).join("\n");
      const { data: jeuData } = await supabase.from("jeux").select("notes").eq("id", form.jeu_id).maybeSingle();
      const existing: JeuNote[] = (jeuData?.notes as JeuNote[]) || [];
      const newNotes: JeuNote[] = [...existing, { texte: noteText, rappel: true }];
      await supabase.from("jeux").update({ notes: newNotes, notes_rappel: true }).eq("id", form.jeu_id);
      await chargerAlertes();
    } else {
      const payload: Record<string, string> = { titre: form.titre.trim(), type: form.type, statut: "active" };
      if (form.description.trim()) payload.description = form.description.trim();
      if (form.jeu_nom.trim()) payload.jeu_nom = form.jeu_nom.trim();
      const { data } = await supabase.from("alertes").insert([payload]).select().single();
      if (data) setAlertes([data as Alerte, ...alertes]);
    }
    setForm({ titre: "", description: "", type: "info", jeu_nom: "", jeu_id: "" });
    setScanCode(""); setScanError(null); setIsModalOpen(false); setIsSaving(false);
  };

  const resoudreAlerte = async (id: string) => {
    setResolvingId(id);
    await supabase.from("alertes").update({ statut: "resolue", resolved_at: new Date().toISOString() }).eq("id", id);
    setTimeout(() => { setAlertes(prev => prev.filter(a => a.id !== id)); setResolvingId(null); }, 350);
  };

  const eventsAujourdhui = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return evenements.filter(ev => ev.date_debut <= today && ev.date_fin >= today);
  }, [evenements]);

  const dateProchaineRotation = useMemo(() => {
    const dates = nouveautes.filter(j => j.date_sortie).map(j => new Date(j.date_sortie!).getTime());
    if (!dates.length) return null;
    return new Date(Math.min(...dates));
  }, [nouveautes]);

  const tousLesJours = useMemo(() => eachDayOfInterval({
    start: startOfWeek(semaineRef, { weekStartsOn: 1 }),
    end: endOfWeek(semaineRef, { weekStartsOn: 1 }),
  }), [semaineRef]);

  const joursAffiches = tousLesJours.slice(1, 6);
  const labelSemaine = `${format(joursAffiches[0], "d MMM", { locale: fr })} – ${format(joursAffiches[4], "d MMM yyyy", { locale: fr })}`;

  const donneesDuJour = useMemo(() => {
    return joursAffiches.map(jour => {
      const dateKey = format(jour, "yyyy-MM-dd");
      const nomJour = format(jour, "EEEE", { locale: fr }).toLowerCase();
      const typeSemaine = getISOWeek(jour) % 2 !== 0 ? "semaineA" : "semaineB";
      const evsDuJour = evenements.filter(ev => ev.date_debut <= dateKey && ev.date_fin >= dateKey);
      const absences = evsDuJour.filter(e => ABSENCE_TYPES.includes(e.type));
      const eventsGrille = evsDuJour.filter(e => !ABSENCE_TYPES.includes(e.type) && e.heure_debut && e.heure_fin && e.date_debut === e.date_fin);
      const eventsJournee = evsDuJour.filter(e => !ABSENCE_TYPES.includes(e.type) && (!e.heure_debut || !e.heure_fin || e.date_debut !== e.date_fin));
      const presences: { nom: string; groupe?: string; debut: string; fin: string }[] = [];
      equipe.forEach(m => {
        const h = getHoraireForDay(m, dateKey, nomJour, typeSemaine);
        if (!h) return;
        let segments = [{ debut: h.debut, fin: h.fin }];
        absences.filter(e => !e.membres.length || e.membres.includes(m.id)).forEach(ev => {
          if (!ev.heure_debut || !ev.heure_fin) { segments = []; }
          else {
            const next: typeof segments = [];
            segments.forEach(seg => next.push(...soustraireHeures(seg.debut, seg.fin, ev.heure_debut!, ev.heure_fin!)));
            segments = next;
          }
        });
        segments.forEach(seg => presences.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin }));
      });
      return { jour, dateKey, blocs: genererBlocsHoraires(presences), absences, eventsGrille, eventsJournee };
    });
  }, [joursAffiches, equipe, evenements]);

  const rotationAlertes = nouveautes.filter(j => j.date_sortie && new Date(j.date_sortie) <= new Date());
  const totalCount = alertes.length + rappels.length + rotationAlertes.length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar current="accueil" />

      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        <div>
          <h1 className="bc" style={{ fontSize: 32, margin: 0 }}>Tableau de bord</h1>
          <p style={{ color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 4, fontSize: 15 }}>
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr }).replace(/^\w/, c => c.toUpperCase())}
          </p>
        </div>

        {/* Aujourd'hui */}
        {eventsAujourdhui.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="pop-sec-head"><span>Aujourd'hui</span><div /></div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {eventsAujourdhui.filter(e => ABSENCE_TYPES.includes(e.type)).map(ev => {
                const noms = ev.membres.length === 0 ? equipe.map(m => m.nom) : equipe.filter(m => ev.membres.includes(m.id)).map(m => m.nom);
                return (
                  <div key={ev.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...getEventStyle(ev.type), padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                    {getEventIcon(ev.type)} {ev.type}
                    {noms.length > 0 && <span style={{ opacity: 0.65, fontWeight: 500 }}>· {noms.join(", ")}</span>}
                  </div>
                );
              })}
              {eventsAujourdhui.filter(e => !ABSENCE_TYPES.includes(e.type)).map(ev => {
                const noms = ev.membres.length === 0 ? [] : equipe.filter(m => ev.membres.includes(m.id)).map(m => m.nom);
                return (
                  <div key={ev.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, ...getEventStyle(ev.type), padding: "6px 14px", borderRadius: 20, fontSize: 13, fontWeight: 700 }}>
                    {getEventIcon(ev.type)} {ev.titre}
                    {ev.heure_debut && ev.heure_fin && <span style={{ opacity: 0.65, fontWeight: 500 }}>· {ev.heure_debut}–{ev.heure_fin}</span>}
                    {noms.length > 0 && <span style={{ opacity: 0.65, fontWeight: 500 }}>· {noms.join(", ")}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Planning + Alertes */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* Planning */}
          <section style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="bc" style={{ fontSize: 18 }}>Semaine en cours</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button onClick={() => setSemaineRef(subWeeks(semaineRef, 1))} className="pop-btn pop-btn-outline" style={{ width: 30, height: 30, padding: 0, fontSize: 16 }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.45)", minWidth: 170, textAlign: "center" }}>{labelSemaine}</span>
                <button onClick={() => setSemaineRef(addWeeks(semaineRef, 1))} className="pop-btn pop-btn-outline" style={{ width: 30, height: 30, padding: 0, fontSize: 16 }}>›</button>
                <button onClick={() => setSemaineRef(new Date())} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "4px 10px" }}>Auj.</button>
                <a href="/agenda" className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>Agenda →</a>
              </div>
            </div>

            <div className="pop-card" style={{ overflow: "hidden" }}>
              {/* En-têtes jours */}
              <div style={{ display: "grid", gridTemplateColumns: "44px repeat(5, 1fr)", borderBottom: "2.5px solid var(--ink)", background: "var(--cream)" }}>
                <div />
                {joursAffiches.map(jour => {
                  const today = isToday(jour);
                  return (
                    <div key={jour.toISOString()} style={{ padding: "10px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: today ? "var(--ink)" : "rgba(0,0,0,0.38)" }}>
                        {format(jour, "EEE", { locale: fr })}
                      </span>
                      <span style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: today ? "var(--ink)" : "transparent", color: today ? "var(--yellow)" : "rgba(0,0,0,0.6)" }}>
                        {format(jour, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Grille temporelle */}
              <div style={{ display: "flex", position: "relative", minHeight: 480 }}>
                <div style={{ position: "absolute", inset: 0, left: 44, pointerEvents: "none" }}>
                  {HEURES_GRILLE.map(h => (
                    <div key={h} style={{ position: "absolute", width: "100%", borderTop: "1px solid var(--cream2)", top: `${calculerPositionTop(`${h}:00`)}%` }} />
                  ))}
                </div>
                <div style={{ width: 44, flexShrink: 0, position: "relative", borderRight: "2px solid var(--cream2)", background: "var(--white)", zIndex: 10 }}>
                  {HEURES_GRILLE.map(h => (
                    <div key={h} style={{ position: "absolute", width: "100%", textAlign: "right", paddingRight: 6, fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.3)", top: `${calculerPositionTop(`${h}:00`)}%`, marginTop: -7 }}>{h}h</div>
                  ))}
                </div>
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", position: "relative" }}>
                  <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", pointerEvents: "none" }}>
                    {Array.from({ length: 5 }).map((_, i) => <div key={i} style={{ borderRight: "1px solid var(--cream2)" }} />)}
                  </div>
                  {donneesDuJour.map(({ jour, dateKey, blocs, absences, eventsGrille, eventsJournee }) => {
                    const today = isToday(jour);
                    return (
                      <div key={dateKey} style={{ position: "relative", overflow: "hidden", background: today ? "rgba(168,224,99,0.05)" : "transparent" }}>
                        {eventsJournee.length > 0 && (
                          <div style={{ position: "absolute", top: 2, left: 2, right: 2, display: "flex", flexDirection: "column", gap: 2, zIndex: 30 }}>
                            {eventsJournee.map(ev => (
                              <div key={ev.id} title={ev.titre} style={{ fontSize: 9, fontWeight: 700, padding: "2px 4px", borderRadius: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", ...getEventStyle(ev.type) }}>
                                {getEventIcon(ev.type)} {ev.titre}
                              </div>
                            ))}
                          </div>
                        )}
                        {blocs.length === 0 && absences.filter(a => !a.heure_debut).length > 0 && (
                          <div style={{ position: "absolute", top: 28, left: 2, right: 2, zIndex: 20, display: "flex", flexDirection: "column", gap: 2 }}>
                            {absences.filter(a => !a.heure_debut).map(abs => (
                              <div key={abs.id} style={{ fontSize: 9, fontWeight: 700, padding: "2px 4px", borderRadius: 4, background: "var(--rouge)", color: "var(--white)", overflow: "hidden" }}>{abs.type}</div>
                            ))}
                          </div>
                        )}
                        {blocs.map((bloc, idx) => {
                          const top = calculerPositionTop(bloc.debut);
                          const height = Math.max(calculerPositionTop(bloc.fin, true) - top, 2);
                          const bgColor = getBlocColor(bloc.membres);
                          return (
                            <div key={idx} style={{ position: "absolute", left: 2, right: 2, borderRadius: 4, borderLeft: `4px solid ${bgColor}`, paddingLeft: 4, paddingTop: 2, overflow: "hidden", top: `${top}%`, height: `${height}%`, backgroundColor: bgColor, zIndex: 10 + idx, opacity: 0.88 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: "var(--ink)", lineHeight: 1.2, display: "block" }}>{bloc.membres.map(m => m.nom).join(", ")}</span>
                              {height > 6 && <span style={{ fontSize: 8, fontWeight: 900, color: "rgba(0,0,0,0.5)", display: "block" }}>{bloc.debut}–{bloc.fin}</span>}
                            </div>
                          );
                        })}
                        {eventsGrille.map((ev, idx) => {
                          const top = calculerPositionTop(ev.heure_debut!);
                          const height = Math.max(calculerPositionTop(ev.heure_fin!, true) - top, 2);
                          return (
                            <div key={ev.id} title={`${ev.titre} · ${ev.heure_debut}–${ev.heure_fin}`}
                              style={{ position: "absolute", left: 2, right: 2, borderRadius: 4, borderLeft: `4px solid ${getEventBorderColor(ev.type)}`, paddingLeft: 4, paddingTop: 2, overflow: "hidden", top: `${top}%`, height: `${height}%`, zIndex: 20 + idx, ...getEventStyle(ev.type) }}>
                              <span style={{ fontSize: 9, fontWeight: 700, lineHeight: 1.2, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getEventIcon(ev.type)} {ev.titre}</span>
                              {height > 5 && <span style={{ fontSize: 8, fontWeight: 500, opacity: 0.7, display: "block" }}>{ev.heure_debut}–{ev.heure_fin}</span>}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* Alertes */}
          <section style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="bc" style={{ fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}>
                Alertes
                {totalCount > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 900, background: "var(--rouge)", color: "var(--white)", width: 24, height: 24, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid var(--ink)" }}>
                    {totalCount}
                  </span>
                )}
              </span>
              <button onClick={ouvrirModal} className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "5px 12px" }}>+ Nouvelle</button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, overflow: "auto", maxHeight: "calc(100vh - 300px)" }}>
              {isLoading ? (
                <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 14, textAlign: "center", padding: "30px 0" }}>Chargement…</p>
              ) : totalCount === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "40px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 28 }}>✅</span>
                  <p style={{ fontWeight: 700, color: "rgba(0,0,0,0.35)", fontSize: 14 }}>Aucune alerte active</p>
                </div>
              ) : (
                <>
                  {alertes.map(alerte => {
                    const s = ALERTE_STYLES[alerte.type] ?? ALERTE_STYLES.info;
                    return (
                      <div key={alerte.id} style={{ ...s.card, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8, opacity: resolvingId === alerte.id ? 0 : 1, transition: "opacity 0.3s" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", flex: 1, minWidth: 0 }}>
                            <span className="pop-sticker" style={{ ...s.badge, border: "1.5px solid var(--ink)", fontSize: 10 }}>{s.icon} {s.label}</span>
                            {alerte.jeu_nom && <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>🎲 {alerte.jeu_nom}</span>}
                          </div>
                          <button onClick={() => resoudreAlerte(alerte.id)} title="Marquer comme résolu"
                            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--vert)", border: "2px solid var(--ink)", cursor: "pointer", fontSize: 13, flexShrink: 0, boxShadow: "1px 1px 0 var(--ink)" }}>✓</button>
                        </div>
                        <p style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)", lineHeight: 1.3 }}>{alerte.titre}</p>
                        {alerte.description && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", lineHeight: 1.5 }}>{alerte.description}</p>}
                        <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 500 }}>{format(new Date(alerte.created_at), "d MMM yyyy", { locale: fr })}</p>
                      </div>
                    );
                  })}
                  {rotationAlertes.map(jeu => (
                    <div key={`rot-${jeu.id}`} style={{ background: "#fecaca", border: "2.5px solid var(--ink)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span className="pop-sticker" style={{ background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", fontSize: 10 }}>🔄 Rotation</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>🎲 {jeu.nom}</span>
                      </div>
                      <p style={{ fontWeight: 800, fontSize: 14 }}>Nouveauté à sortir</p>
                      <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>Sortie le {jeu.date_sortie ? format(new Date(jeu.date_sortie), "d MMM yyyy", { locale: fr }) : ""}</p>
                    </div>
                  ))}
                  {rappels.map((r, idx) => {
                    const suffix = r.code_syracuse ? ` (${String(r.code_syracuse).slice(-4)})` : "";
                    return (
                      <div key={`rappel-${r.jeu_id}-${idx}`} style={{ background: "#fef9c3", border: "2.5px solid var(--ink)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0, flexWrap: "wrap" }}>
                            <span className="pop-sticker" style={{ background: "var(--orange)", color: "var(--ink)", border: "1.5px solid var(--ink)", fontSize: 10 }}>🎲 Jeu</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>🎲 {r.nom}{suffix}</span>
                          </div>
                          <button onClick={() => resolveRappel(r.jeu_id, r.texte)} title="Marquer comme traité"
                            style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "var(--vert)", border: "2px solid var(--ink)", cursor: "pointer", fontSize: 13, flexShrink: 0, boxShadow: "1px 1px 0 var(--ink)" }}>✓</button>
                        </div>
                        <p style={{ fontWeight: 800, fontSize: 14 }}>{r.texte}</p>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </section>
        </div>

        {/* Nouveautés */}
        {nouveautes.length > 0 && (
          <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="bc" style={{ fontSize: 18 }}>
                Nouveautés en salle
                <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.4)", marginLeft: 10 }}>({nouveautes.length})</span>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {dateProchaineRotation && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Prochaine rotation</span>
                    <span className="pop-sticker" style={{ background: dateProchaineRotation <= new Date() ? "var(--rouge)" : "var(--orange)", color: dateProchaineRotation <= new Date() ? "var(--white)" : "var(--ink)", fontSize: 12 }}>
                      {dateProchaineRotation <= new Date() ? "⚠️ " : "⏳ "}
                      {format(dateProchaineRotation, "d MMM yyyy", { locale: fr })}
                    </span>
                  </div>
                )}
                <a href="/nouveautes" className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "4px 12px", textDecoration: "none" }}>Gérer →</a>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
              {nouveautes.map(jeu => {
                const couleur = COULEURS_JEU[jeu.couleur ?? ""] ?? null;
                const estExpire = jeu.date_sortie && new Date(jeu.date_sortie) <= new Date();
                return (
                  <div key={jeu.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, width: 90 }} title={jeu.nom}>
                    <div style={{ width: 90, height: 90, borderRadius: 10, overflow: "hidden", border: "2.5px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", position: "relative" }}>
                      {jeu.image_url
                        ? <img src={jeu.image_url} alt={jeu.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                        : <div style={{ width: "100%", height: "100%", background: couleur ?? "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎲</div>}
                      {estExpire && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(248,113,113,0.25)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, background: "var(--rouge)", color: "var(--white)", padding: "1px 6px", borderRadius: 4 }}>À sortir</span>
                        </div>
                      )}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", textAlign: "center", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{jeu.nom}</p>
                    {jeu.date_sortie && <p style={{ fontSize: 10, fontWeight: 700, textAlign: "center", color: estExpire ? "var(--rouge)" : "rgba(0,0,0,0.4)" }}>{format(new Date(jeu.date_sortie), "d MMM", { locale: fr })}</p>}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Modal alerte */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
          onClick={e => { if (e.target === e.currentTarget) fermerModal(); }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 480, maxHeight: "calc(100vh - 96px)", overflow: "auto" }}>
            <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>Nouvelle alerte</h3>
              <button onClick={fermerModal} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--cream)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Type</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["urgent", "info", "jeu"] as const).map(t => {
                    const s = ALERTE_STYLES[t];
                    const isActive = form.type === t;
                    return (
                      <button key={t} onClick={() => setForm({ ...form, type: t })} className="pop-btn"
                        style={{ flex: 1, fontSize: 13, justifyContent: "center", ...(isActive ? { ...s.badge, ...s.card } : { background: "var(--cream2)", color: "rgba(0,0,0,0.4)" }) }}>
                        {s.icon} {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Titre *</label>
                <input type="text" value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })}
                  placeholder="Ex : Vérifier le contenu de Catan…" className="pop-input" style={{ width: "100%" }}
                  autoFocus onKeyDown={e => { if (e.key === "Enter" && form.titre.trim()) creerAlerte(); }} />
              </div>
              {form.type === "jeu" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Scanner EAN / code Syracuse</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={scanCode} onChange={e => { setScanCode(e.target.value); setScanError(null); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); rechercherJeuParScan(scanCode); } }}
                        placeholder="Scannez ou tapez le code…" className="pop-input" style={{ flex: 1 }} />
                      <button onClick={() => rechercherJeuParScan(scanCode)} className="pop-btn pop-btn-dark" style={{ padding: "8px 14px" }}>🔍</button>
                    </div>
                    {scanError && <p style={{ fontSize: 13, fontWeight: 700, color: "var(--rouge)" }}>{scanError}</p>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Jeu concerné</label>
                    <input type="text" value={form.jeu_nom} onChange={e => setForm({ ...form, jeu_nom: e.target.value })}
                      placeholder="Nom du jeu (rempli par le scan)" className="pop-input" style={{ width: "100%" }} />
                  </div>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Description (optionnel)</label>
                <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Détails supplémentaires…" rows={3}
                  style={{ border: "2.5px solid var(--ink)", borderRadius: 8, padding: "9px 14px", fontFamily: "inherit", fontSize: 14, background: "var(--white)", outline: "none", resize: "vertical", width: "100%", boxSizing: "border-box" }} />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={fermerModal} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
                <button onClick={creerAlerte} disabled={!form.titre.trim() || isSaving} className="pop-btn pop-btn-dark"
                  style={{ flex: 1, opacity: (!form.titre.trim() || isSaving) ? 0.4 : 1, cursor: (!form.titre.trim() || isSaving) ? "not-allowed" : "pointer" }}>
                  {isSaving ? "Création…" : "Créer l'alerte"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
