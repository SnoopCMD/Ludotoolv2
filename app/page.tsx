"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
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
  if (hasSwap) return "#c4b5fd";                   // échange de jours → violet
  const countA = membres.filter(m => m.groupe === "A").length;
  const countB = membres.filter(m => m.groupe === "B").length;
  if (countA > 0 && countB > 0) return "#baff29";  // équipe complète → vert
  if (countA > 0) return "#FD495B";                 // équipe A → rouge
  if (countB > 0) return "#5BE0FB";                 // équipe B → bleu
  return "#baff29";                                 // défaut → vert
};

// ─── Helpers couleurs événements ──────────────────────────────────────────────

const getEventStyle = (type: string): string => {
  if (type.includes("RTT")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (type.includes("Congé") || type.includes("Récupération")) return "bg-rose-100 text-rose-800 border-rose-300";
  if (type === "Réunion") return "bg-indigo-100 text-indigo-800 border-indigo-300";
  if (type === "Animation") return "bg-amber-100 text-amber-800 border-amber-300";
  if (type === "Soirée Jeux") return "bg-purple-100 text-purple-800 border-purple-300";
  if (type === "Heures Exceptionnelles") return "bg-teal-100 text-teal-800 border-teal-300";
  return "bg-slate-100 text-slate-700 border-slate-200";
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

// ─── Couleurs jeux ────────────────────────────────────────────────────────────

const COULEURS_JEU: Record<string, { bg: string; border: string }> = {
  vert:   { bg: "bg-[#baff29]", border: "border-[#baff29]" },
  rose:   { bg: "bg-[#f45be0]", border: "border-[#f45be0]" },
  bleu:   { bg: "bg-[#6ba4ff]", border: "border-[#6ba4ff]" },
  rouge:  { bg: "bg-[#ff4d79]", border: "border-[#ff4d79]" },
  jaune:  { bg: "bg-[#ffa600]", border: "border-[#ffa600]" },
};

// ─── Helpers alertes ──────────────────────────────────────────────────────────

const ALERTE_STYLES: Record<string, { bg: string; border: string; badge: string; label: string; icon: string }> = {
  urgent: { bg: "bg-rose-50",  border: "border-rose-200",  badge: "bg-rose-100 text-rose-700",   label: "Urgent", icon: "🚨" },
  info:   { bg: "bg-slate-50", border: "border-slate-200", badge: "bg-slate-100 text-slate-600",  label: "Info",   icon: "💡" },
  jeu:    { bg: "bg-amber-50", border: "border-amber-200", badge: "bg-amber-100 text-amber-700",  label: "Jeu",    icon: "🎲" },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccueilPage() {
  const [alertes, setAlertes] = useState<Alerte[]>([]);
  const [equipe, setEquipe] = useState<MembreEquipe[]>([]);
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [nouveautes, setNouveautes] = useState<Nouveaute[]>([]);
  const [semaineRef, setSemaineRef] = useState(new Date());
  const [isLoading, setIsLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ titre: "", description: "", type: "info", jeu_nom: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);

  // ─── Chargement ─────────────────────────────────────────────────────────────

  useEffect(() => {
    chargerAlertes();
    chargerEquipe();
    chargerNouveautes();
  }, []);

  useEffect(() => {
    chargerEvenements();
  }, [semaineRef]);

  const chargerAlertes = async () => {
    const { data } = await supabase
      .from("alertes")
      .select("*")
      .eq("statut", "active")
      .order("created_at", { ascending: false });
    if (data) setAlertes(data as Alerte[]);
    setIsLoading(false);
  };

  const chargerEquipe = async () => {
    const { data } = await supabase.from("equipe").select("*").order("nom");
    if (data) setEquipe(data as MembreEquipe[]);
  };

  const chargerNouveautes = async () => {
    const { data: jeuxData } = await supabase
      .from("jeux")
      .select("id, nom, ean, date_sortie")
      .eq("statut", "En stock")
      .eq("etape_nouveaute", true)
      .order("id", { ascending: false });

    if (!jeuxData || jeuxData.length === 0) return;

    // Récupérer les images depuis le catalogue
    const eans = [...new Set(jeuxData.map((j: any) => j.ean))];
    const { data: catData } = await supabase
      .from("catalogue")
      .select("ean, image_url, couleur")
      .in("ean", eans);

    const catMap: Record<string, { image_url?: string; couleur?: string }> = {};
    if (catData) catData.forEach((c: any) => { catMap[c.ean] = c; });

    // Dédupliquer par EAN (garder un exemplaire par titre)
    const seen = new Set<string>();
    const list: Nouveaute[] = [];
    for (const j of jeuxData as any[]) {
      if (seen.has(j.ean)) continue;
      seen.add(j.ean);
      list.push({
        id: j.id,
        nom: j.nom,
        ean: j.ean,
        couleur: catMap[j.ean]?.couleur,
        date_sortie: j.date_sortie,
        image_url: catMap[j.ean]?.image_url,
      });
    }
    setNouveautes(list);
  };

  const chargerEvenements = async () => {
    const debut = startOfWeek(semaineRef, { weekStartsOn: 1 });
    const fin = endOfWeek(semaineRef, { weekStartsOn: 1 });
    const { data } = await supabase
      .from("evenements")
      .select("id, titre, type, date_debut, date_fin, heure_debut, heure_fin, membres")
      .lte("date_debut", format(fin, "yyyy-MM-dd"))
      .gte("date_fin", format(debut, "yyyy-MM-dd"))
      .order("heure_debut", { ascending: true });
    if (data) setEvenements(data as Evenement[]);
  };

  // ─── Actions alertes ─────────────────────────────────────────────────────────

  const ouvrirModal = () => {
    setScanCode("");
    setScanError(null);
    setIsModalOpen(true);
  };

  const fermerModal = () => {
    setScanCode("");
    setScanError(null);
    setIsModalOpen(false);
  };

  const rechercherJeuParScan = async (raw: string) => {
    const code = raw.trim();
    if (!code) return;
    setScanError(null);
    // Formatage code Syracuse : numérique court → padding 8 chiffres
    const codeF = /^\d+$/.test(code) && code.length < 8 ? code.padStart(8, "0") : code;
    const { data } = await supabase
      .from("jeux")
      .select("nom, ean")
      .or(`code_syracuse.eq.${codeF},ean.eq.${codeF}`)
      .limit(1)
      .maybeSingle();
    if (data?.nom) {
      const suffix = data.ean ? ` (${String(data.ean).slice(-4)})` : "";
      setForm(f => ({ ...f, jeu_nom: data.nom + suffix, type: "jeu" }));
      setScanCode("");
    } else {
      setScanError(`Aucun jeu trouvé pour le code « ${codeF} »`);
    }
  };

  const creerAlerte = async () => {
    if (!form.titre.trim()) return;
    setIsSaving(true);
    const payload: Record<string, string> = {
      titre: form.titre.trim(),
      type: form.type,
      statut: "active",
    };
    if (form.description.trim()) payload.description = form.description.trim();
    if (form.jeu_nom.trim()) payload.jeu_nom = form.jeu_nom.trim();
    const { data } = await supabase.from("alertes").insert([payload]).select().single();
    if (data) setAlertes([data as Alerte, ...alertes]);
    setForm({ titre: "", description: "", type: "info", jeu_nom: "" });
    setScanCode("");
    setScanError(null);
    setIsModalOpen(false);
    setIsSaving(false);
  };

  const resoudreAlerte = async (id: string) => {
    setResolvingId(id);
    await supabase
      .from("alertes")
      .update({ statut: "resolue", resolved_at: new Date().toISOString() })
      .eq("id", id);
    setTimeout(() => {
      setAlertes(prev => prev.filter(a => a.id !== id));
      setResolvingId(null);
    }, 350);
  };

  // ─── Événements du jour ──────────────────────────────────────────────────────

  const eventsAujourdhui = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return evenements.filter(ev => ev.date_debut <= today && ev.date_fin >= today);
  }, [evenements]);

  // ─── Nouveautés ──────────────────────────────────────────────────────────────

  const dateProchaineRotation = useMemo(() => {
    const dates = nouveautes
      .filter(j => j.date_sortie)
      .map(j => new Date(j.date_sortie!).getTime());
    if (!dates.length) return null;
    return new Date(Math.min(...dates));
  }, [nouveautes]);

  // ─── Calcul semaine ──────────────────────────────────────────────────────────

  // Semaine complète lun–dim, mais on n'affiche que mar–sam (indices 1 à 5)
  const tousLesJours = useMemo(() => eachDayOfInterval({
    start: startOfWeek(semaineRef, { weekStartsOn: 1 }),
    end: endOfWeek(semaineRef, { weekStartsOn: 1 }),
  }), [semaineRef]);

  const joursAffiches = tousLesJours.slice(1, 6); // mardi → samedi

  const labelSemaine = `${format(joursAffiches[0], "d MMM", { locale: fr })} – ${format(joursAffiches[4], "d MMM yyyy", { locale: fr })}`;

  // Calcul des blocs horaires et événements par jour
  const donneesDuJour = useMemo(() => {
    return joursAffiches.map(jour => {
      const dateKey = format(jour, "yyyy-MM-dd");
      const nomJour = format(jour, "EEEE", { locale: fr }).toLowerCase();
      const typeSemaine = getISOWeek(jour) % 2 !== 0 ? "semaineA" : "semaineB";

      const evsDuJour = evenements.filter(
        ev => ev.date_debut <= dateKey && ev.date_fin >= dateKey
      );

      const absences = evsDuJour.filter(e => ABSENCE_TYPES.includes(e.type));
      const eventsGrille = evsDuJour.filter(
        e => !ABSENCE_TYPES.includes(e.type) && e.heure_debut && e.heure_fin && e.date_debut === e.date_fin
      );
      const eventsJournee = evsDuJour.filter(
        e => !ABSENCE_TYPES.includes(e.type) && (!e.heure_debut || !e.heure_fin || e.date_debut !== e.date_fin)
      );

      // Présences des membres (soustraction des absences)
      const presences: { nom: string; groupe?: string; debut: string; fin: string }[] = [];
      equipe.forEach(m => {
        const h = getHoraireForDay(m, dateKey, nomJour, typeSemaine);
        if (!h) return;
        let segments = [{ debut: h.debut, fin: h.fin }];
        absences
          .filter(e => !e.membres.length || e.membres.includes(m.id))
          .forEach(ev => {
            if (!ev.heure_debut || !ev.heure_fin) {
              segments = [];
            } else {
              const next: typeof segments = [];
              segments.forEach(seg =>
                next.push(...soustraireHeures(seg.debut, seg.fin, ev.heure_debut!, ev.heure_fin!))
              );
              segments = next;
            }
          });
        segments.forEach(seg => presences.push({ nom: m.nom, groupe: m.groupe, debut: seg.debut, fin: seg.fin }));
      });

      const blocs = genererBlocsHoraires(presences);

      return { jour, dateKey, blocs, absences, eventsGrille, eventsJournee };
    });
  }, [joursAffiches, equipe, evenements]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col items-center p-6 gap-6">
      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        @keyframes slide-out { to { opacity: 0; transform: translateX(40px); } }
        .animate-slide-out { animation: slide-out 0.3s ease-in forwards; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
      `}</style>

      {/* ── Navigation ── */}
      <header className="flex justify-between items-center w-full max-w-[96%] mx-auto shrink-0 relative">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="absolute left-1/2 -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
          <Link href="/" className="px-6 py-2.5 rounded-full bg-[#baff29] text-black shadow-sm">Accueil</Link>
          <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Inventaire</Link>
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Atelier</Link>
          <Link href="/agenda" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Agenda</Link>
          <Link href="/store" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Store</Link>
        </nav>
        <div className="w-10" />
      </header>

      {/* ── Contenu principal ── */}
      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-8">

        {/* Titre */}
        <div>
          <h1 className="text-4xl font-black text-black">Tableau de bord</h1>
          <p className="text-slate-400 font-medium mt-1 capitalize">
            {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
          </p>
        </div>

        {/* ── Aujourd'hui ── */}
        {eventsAujourdhui.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Aujourd'hui</h2>
            <div className="flex flex-wrap gap-2">
              {/* Absences */}
              {eventsAujourdhui.filter(e => ABSENCE_TYPES.includes(e.type)).map(ev => {
                const noms = ev.membres.length === 0
                  ? equipe.map(m => m.nom)
                  : equipe.filter(m => ev.membres.includes(m.id)).map(m => m.nom);
                return (
                  <div
                    key={ev.id}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold ${getEventStyle(ev.type)}`}
                  >
                    <span>{getEventIcon(ev.type)}</span>
                    <span>{ev.type}</span>
                    {noms.length > 0 && (
                      <span className="opacity-60 font-medium">· {noms.join(", ")}</span>
                    )}
                  </div>
                );
              })}
              {/* Événements planifiés */}
              {eventsAujourdhui.filter(e => !ABSENCE_TYPES.includes(e.type)).map(ev => {
                const noms = ev.membres.length === 0
                  ? []
                  : equipe.filter(m => ev.membres.includes(m.id)).map(m => m.nom);
                return (
                  <div
                    key={ev.id}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl border text-sm font-bold ${getEventStyle(ev.type)}`}
                  >
                    <span>{getEventIcon(ev.type)}</span>
                    <span>{ev.titre}</span>
                    {ev.heure_debut && ev.heure_fin && (
                      <span className="opacity-60 font-medium">· {ev.heure_debut}–{ev.heure_fin}</span>
                    )}
                    {noms.length > 0 && (
                      <span className="opacity-60 font-medium">· {noms.join(", ")}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Deux colonnes ── */}
        <div className="flex flex-col lg:flex-row gap-6 flex-1">

          {/* ══ Vue hebdomadaire ══════════════════════════════════════════════ */}
          <section className="flex-1 flex flex-col gap-4 min-w-0">

            {/* Header semaine */}
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-black">Semaine en cours</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSemaineRef(subWeeks(semaineRef, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 transition-colors"
                >‹</button>
                <span className="text-sm font-bold text-slate-500 min-w-[170px] text-center">{labelSemaine}</span>
                <button
                  onClick={() => setSemaineRef(addWeeks(semaineRef, 1))}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-600 transition-colors"
                >›</button>
                <button
                  onClick={() => setSemaineRef(new Date())}
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                >Auj.</button>
                <Link href="/agenda" className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                  Agenda →
                </Link>
              </div>
            </div>

            {/* Grille planning */}
            <div className="flex flex-col flex-1 border-2 border-slate-100 rounded-2xl overflow-hidden">

              {/* En-têtes jours */}
              <div className="grid border-b-2 border-slate-100 bg-slate-50" style={{ gridTemplateColumns: "44px repeat(5, 1fr)" }}>
                <div />
                {joursAffiches.map(jour => {
                  const today = isToday(jour);
                  return (
                    <div key={jour.toISOString()} className="py-3 flex flex-col items-center gap-0.5">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${today ? "text-black" : "text-slate-400"}`}>
                        {format(jour, "EEE", { locale: fr })}
                      </span>
                      <span className={`text-lg font-black leading-none flex items-center justify-center w-8 h-8 rounded-full ${
                        today ? "bg-black text-[#baff29]" : "text-slate-600"
                      }`}>
                        {format(jour, "d")}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Corps grille temporelle */}
              <div className="flex flex-1 relative" style={{ minHeight: "480px" }}>

                {/* Lignes horizontales horaires */}
                <div className="absolute inset-0 pointer-events-none" style={{ left: "44px" }}>
                  {HEURES_GRILLE.map(h => (
                    <div
                      key={h}
                      className="absolute w-full border-t border-slate-100"
                      style={{ top: `${calculerPositionTop(`${h}:00`)}%` }}
                    />
                  ))}
                </div>

                {/* Colonne labels heures */}
                <div className="w-[44px] shrink-0 relative border-r-2 border-slate-100 bg-white z-10">
                  {HEURES_GRILLE.map(h => (
                    <div
                      key={h}
                      className="absolute w-full text-[10px] font-bold text-slate-400 text-right pr-2"
                      style={{ top: `${calculerPositionTop(`${h}:00`)}%`, marginTop: "-8px" }}
                    >
                      {h}h
                    </div>
                  ))}
                </div>

                {/* Colonnes jours */}
                <div className="flex-1 grid relative" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>

                  {/* Séparateurs verticaux */}
                  <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="border-r border-slate-100" />
                    ))}
                  </div>

                  {/* Contenu de chaque jour */}
                  {donneesDuJour.map(({ jour, dateKey, blocs, absences, eventsGrille, eventsJournee }) => {
                    const today = isToday(jour);
                    return (
                      <div
                        key={dateKey}
                        className={`relative overflow-hidden ${today ? "bg-[#baff29]/5" : ""}`}
                      >
                        {/* Événements journée entière (sans horaire) */}
                        {eventsJournee.length > 0 && (
                          <div className="absolute top-1 left-1 right-1 flex flex-col gap-0.5 z-30">
                            {eventsJournee.map(ev => (
                              <div
                                key={ev.id}
                                title={ev.titre}
                                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border truncate ${getEventStyle(ev.type)}`}
                              >
                                {getEventIcon(ev.type)} {ev.titre}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Absences totales sans horaire (affiché si pas de blocs) */}
                        {blocs.length === 0 && absences.filter(a => !a.heure_debut).length > 0 && (
                          <div className="absolute top-8 left-1 right-1 z-20 flex flex-col gap-0.5">
                            {absences.filter(a => !a.heure_debut).map(abs => (
                              <div key={abs.id} className="text-[9px] font-bold bg-rose-100 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded truncate">
                                {abs.type}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Blocs de présence */}
                        {blocs.map((bloc, idx) => {
                          const top = calculerPositionTop(bloc.debut);
                          const bottom = calculerPositionTop(bloc.fin, true);
                          const height = Math.max(bottom - top, 2);
                          const bgColor = getBlocColor(bloc.membres);
                          return (
                            <div
                              key={idx}
                              className="absolute left-1 right-1 rounded border-l-4 px-1.5 py-1 flex flex-col justify-between overflow-hidden shadow-sm"
                              style={{
                                top: `${top}%`,
                                height: `${height}%`,
                                backgroundColor: bgColor,
                                borderColor: bgColor,
                                zIndex: 10 + idx,
                                opacity: 0.9,
                              }}
                            >
                              <span className="text-[9px] font-bold text-black leading-tight line-clamp-2">
                                {bloc.membres.map(m => m.nom).join(", ")}
                              </span>
                              {height > 6 && (
                                <span className="text-[8px] font-black text-black/50 leading-none mt-auto">
                                  {bloc.debut}–{bloc.fin}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {/* Événements avec horaire sur la grille */}
                        {eventsGrille.map((ev, idx) => {
                          const top = calculerPositionTop(ev.heure_debut!);
                          const bottom = calculerPositionTop(ev.heure_fin!, true);
                          const height = Math.max(bottom - top, 2);
                          return (
                            <div
                              key={ev.id}
                              className={`absolute left-1 right-1 rounded border-l-4 px-1.5 py-1 flex flex-col overflow-hidden shadow-sm ${getEventStyle(ev.type)}`}
                              style={{
                                top: `${top}%`,
                                height: `${height}%`,
                                borderColor: getEventBorderColor(ev.type),
                                zIndex: 20 + idx,
                              }}
                              title={`${ev.titre} · ${ev.heure_debut}–${ev.heure_fin}`}
                            >
                              <span className="text-[9px] font-bold leading-tight truncate">
                                {getEventIcon(ev.type)} {ev.titre}
                              </span>
                              {height > 5 && (
                                <span className="text-[8px] font-medium opacity-70 leading-none mt-auto">
                                  {ev.heure_debut}–{ev.heure_fin}
                                </span>
                              )}
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

          {/* ══ Alertes ═══════════════════════════════════════════════════════ */}
          <section className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-black flex items-center gap-2">
                Alertes
                {alertes.length > 0 && (
                  <span className="text-sm font-black bg-rose-500 text-white w-6 h-6 rounded-full flex items-center justify-center">
                    {alertes.length}
                  </span>
                )}
              </h2>
              <button
                onClick={ouvrirModal}
                className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 bg-black text-white rounded-xl hover:bg-slate-800 transition-colors"
              >
                + Nouvelle
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto custom-scroll pr-1" style={{ maxHeight: "calc(100vh - 300px)" }}>
              {isLoading ? (
                <p className="text-slate-400 font-medium text-sm text-center py-8">Chargement…</p>
              ) : alertes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                  <span className="text-3xl">✅</span>
                  <p className="font-bold text-slate-400 text-sm">Aucune alerte active</p>
                </div>
              ) : (
                alertes.map(alerte => {
                  const style = ALERTE_STYLES[alerte.type] ?? ALERTE_STYLES.info;
                  const isResolving = resolvingId === alerte.id;
                  return (
                    <div
                      key={alerte.id}
                      className={`${style.bg} border ${style.border} rounded-2xl p-4 flex flex-col gap-2 animate-fade-in ${isResolving ? "animate-slide-out" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                          <span className={`text-xs font-black px-2 py-0.5 rounded-full shrink-0 ${style.badge}`}>
                            {style.icon} {style.label}
                          </span>
                          {alerte.jeu_nom && (
                            <span className="text-xs font-bold text-slate-500 truncate">
                              🎲 {alerte.jeu_nom}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => resoudreAlerte(alerte.id)}
                          title="Marquer comme résolu"
                          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/80 hover:bg-white border border-slate-200 text-slate-500 hover:text-emerald-600 transition-colors shrink-0 text-sm"
                        >✓</button>
                      </div>
                      <p className="font-bold text-sm text-black leading-snug">{alerte.titre}</p>
                      {alerte.description && (
                        <p className="text-xs text-slate-600 leading-relaxed">{alerte.description}</p>
                      )}
                      <p className="text-[10px] text-slate-400 font-medium">
                        {format(new Date(alerte.created_at), "d MMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        {/* ── Nouveautés ── */}
        {nouveautes.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-black flex items-center gap-3">
                Nouveautés en salle
                <span className="text-sm font-bold text-slate-400">({nouveautes.length})</span>
              </h2>
              <div className="flex items-center gap-3">
                {dateProchaineRotation && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Prochaine rotation</span>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-xl ${
                      dateProchaineRotation <= new Date()
                        ? "bg-rose-100 text-rose-700 border border-rose-200"
                        : "bg-amber-50 text-amber-700 border border-amber-200"
                    }`}>
                      {dateProchaineRotation <= new Date() ? "⚠️ " : "⏳ "}
                      {format(dateProchaineRotation, "d MMM yyyy", { locale: fr })}
                    </span>
                  </div>
                )}
                <Link
                  href="/nouveautes"
                  className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                >
                  Gérer →
                </Link>
              </div>
            </div>

            {/* Scroll horizontal de covers */}
            <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: "thin" }}>
              {nouveautes.map(jeu => {
                const coul = COULEURS_JEU[jeu.couleur ?? ""] ?? null;
                const estExpire = jeu.date_sortie && new Date(jeu.date_sortie) <= new Date();
                return (
                  <div
                    key={jeu.id}
                    className={`shrink-0 flex flex-col gap-2 w-[90px] group cursor-default`}
                    title={jeu.nom}
                  >
                    {/* Cover */}
                    <div className={`w-[90px] h-[90px] rounded-2xl overflow-hidden border-2 shadow-sm relative ${coul ? coul.border : "border-slate-200"}`}>
                      {jeu.image_url
                        ? <img src={jeu.image_url} alt={jeu.nom} className="w-full h-full object-cover" loading="lazy" />
                        : <div className={`w-full h-full flex items-center justify-center text-2xl ${coul ? coul.bg : "bg-slate-100"}`}>🎲</div>
                      }
                      {/* Badge rotation expirée */}
                      {estExpire && (
                        <div className="absolute inset-0 bg-rose-500/20 flex items-end justify-center pb-1">
                          <span className="text-[9px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded">À sortir</span>
                        </div>
                      )}
                    </div>
                    {/* Nom */}
                    <p className="text-[10px] font-bold text-slate-700 leading-tight text-center line-clamp-2">
                      {jeu.nom}
                    </p>
                    {/* Date sortie */}
                    {jeu.date_sortie && (
                      <p className={`text-[9px] font-bold text-center ${estExpire ? "text-rose-500" : "text-slate-400"}`}>
                        {format(new Date(jeu.date_sortie), "d MMM", { locale: fr })}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>

      {/* ── Modale nouvelle alerte ── */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) fermerModal(); }}
        >
          <div className="bg-white rounded-3xl p-8 w-full max-w-md shadow-2xl animate-fade-in flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-black">Nouvelle alerte</h3>
              <button
                onClick={fermerModal}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 font-bold text-slate-500"
              >✕</button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Type</label>
                <div className="flex gap-2">
                  {(["urgent", "info", "jeu"] as const).map(t => {
                    const s = ALERTE_STYLES[t];
                    return (
                      <button
                        key={t}
                        onClick={() => setForm({ ...form, type: t })}
                        className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border-2 transition-colors ${
                          form.type === t ? `${s.bg} ${s.border}` : "bg-slate-50 border-slate-100 text-slate-400"
                        }`}
                      >
                        {s.icon} {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Titre *</label>
                <input
                  type="text"
                  value={form.titre}
                  onChange={e => setForm({ ...form, titre: e.target.value })}
                  placeholder="Ex : Vérifier le contenu de Catan…"
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-black transition-colors"
                  autoFocus
                  onKeyDown={e => { if (e.key === "Enter" && form.titre.trim()) creerAlerte(); }}
                />
              </div>

              {form.type === "jeu" && (
                <div className="flex flex-col gap-3">
                  {/* Scan EAN / code Syracuse */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      Scanner EAN / code Syracuse
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={scanCode}
                        onChange={e => { setScanCode(e.target.value); setScanError(null); }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); rechercherJeuParScan(scanCode); } }}
                        placeholder="Scannez ou tapez le code…"
                        className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-black transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => rechercherJeuParScan(scanCode)}
                        className="px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 transition-colors shrink-0"
                      >
                        🔍
                      </button>
                    </div>
                    {scanError && (
                      <p className="text-xs font-bold text-rose-500">{scanError}</p>
                    )}
                  </div>
                  {/* Nom du jeu (pré-rempli par le scan, éditable manuellement) */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">
                      Jeu concerné
                    </label>
                    <input
                      type="text"
                      value={form.jeu_nom}
                      onChange={e => setForm({ ...form, jeu_nom: e.target.value })}
                      placeholder="Nom du jeu (rempli automatiquement par le scan)"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-black transition-colors"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Description (optionnel)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder="Détails supplémentaires…"
                  rows={3}
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 font-bold text-sm outline-none focus:border-black transition-colors resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={fermerModal}
                className="flex-1 px-4 py-3 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >Annuler</button>
              <button
                onClick={creerAlerte}
                disabled={!form.titre.trim() || isSaving}
                className="flex-1 px-4 py-3 rounded-2xl font-bold text-sm bg-black text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? "Création…" : "Créer l'alerte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
