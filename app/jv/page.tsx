"use client";
import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import { supabase } from "../../lib/supabase";
import NavBar from "../../components/NavBar";
import { format, addDays, startOfWeek, eachDayOfInterval, isToday, parseISO, getDay } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Console = "PS5" | "Switch" | "PC";

type JvJeu = {
  id: string;
  titre: string;
  console: Console;
  genre: string | null;
  annee: number | null;
  editeur: string | null;
  description: string | null;
  image_url: string | null;
  pegi: number | null;
  nb_joueurs: string | null;
  statut: "disponible" | "selection" | "maintenance" | "retire";
  igdb_id: number | null;
  cote_syracuse: string | null;
  created_at: string;
};

type SearchResult = {
  external_id: string;
  igdb_id?: number;
  titre: string;
  description: string | null;
  image_url: string | null;
  annee: number | null;
  editeur: string | null;
  genre: string | null;
  pegi: number | null;
  nb_joueurs: string | null;
  console: Console | null;
};

type SelectionSlot = "PS5" | "Switch_Multi" | "Switch_Solo" | "PC";

type JvSelection = {
  id: string;
  jeu_id: string;
  slot: SelectionSlot;
  console: Console;
  statut: "actif" | "planifie";
  permanent: boolean;
  groupe: number;
  date_debut: string | null;
  date_fin: string | null;
  ordre: number;
  jeu?: JvJeu;
};

type JvRotationConfig = {
  id: string;
  current_slot_index: number;
  week_start: string;
};

type JvReservation = {
  id: string;
  jeu_id: string;
  jeu2_id: string | null;
  poste: string;
  date_creneau: string;
  creneau: string;
  adherent_nom: string;
  nb_joueurs: number;
  statut: "confirmee" | "annulee" | "terminee";
  notes: string | null;
  created_at: string;
  jeu?: JvJeu;
};

type JvStat = {
  jeu_id: string;
  titre: string;
  console: Console;
  image_url: string | null;
  nb_reservations: number;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONSOLES: Console[] = ["PS5", "Switch", "PC"];

const CONSOLE_COLORS: Record<Console, string> = {
  PS5:    "bg-blue-100 text-blue-700 border-blue-200",
  Switch: "bg-red-100 text-red-700 border-red-200",
  PC:     "bg-slate-100 text-slate-700 border-slate-200",
};

const CONSOLE_DOT: Record<Console, string> = {
  PS5:    "bg-blue-500",
  Switch: "bg-red-500",
  PC:     "bg-slate-500",
};

// ─── Slots de sélection (rotation : PS5 → Switch Multi → Switch Solo → PC → …) ─

const SLOT_CONSOLE: Record<SelectionSlot, Console> = {
  PS5: "PS5",
  Switch_Multi: "Switch",
  Switch_Solo: "Switch",
  PC: "PC",
};
const SLOT_LABEL: Record<SelectionSlot, string> = {
  PS5: "PS5",
  Switch_Multi: "Switch Multi",
  Switch_Solo: "Switch Solo",
  PC: "PC",
};
const SLOT_HAS_PERMANENT: Record<SelectionSlot, boolean> = {
  PS5: true,
  Switch_Multi: false,
  Switch_Solo: false,
  PC: true,
};
const ROTATION_ORDER: SelectionSlot[] = ["PS5", "Switch_Multi", "Switch_Solo", "PC"];

const POSTE_SLOT: Record<string, SelectionSlot> = {
  ps5: "PS5",
  switch_multi: "Switch_Multi",
  switch_solo: "Switch_Solo",
  pc1: "PC",
  pc2: "PC",
};

// Créneaux par jour (getDay : 2=Mar, 3=Mer, 4=Jeu, 5=Ven)
const CRENEAUX_PAR_JOUR: Record<number, string[]> = {
  2: ["16h-17h", "17h-18h"],
  3: ["15h-16h", "16h-17h"],
  4: ["15h-16h", "16h-17h"],
  5: ["16h-17h", "17h-18h"],
};
const JOURS_OUVERTS = [2, 3, 4, 5];

type Poste = { id: string; label: string; console: Console; maxJoueurs: number; multiOnly: boolean };
const POSTES: Poste[] = [
  { id: "ps5",          label: "PS5",          console: "PS5",    maxJoueurs: 2, multiOnly: false },
  { id: "switch_multi", label: "Switch Multi",  console: "Switch", maxJoueurs: 4, multiOnly: true  },
  { id: "switch_solo",  label: "Switch Solo",   console: "Switch", maxJoueurs: 1, multiOnly: false },
  { id: "pc1",          label: "PC 1",          console: "PC",     maxJoueurs: 2, multiOnly: false },
  { id: "pc2",          label: "PC 2",          console: "PC",     maxJoueurs: 2, multiOnly: false },
];
const POSTE_COLORS: Record<string, string> = {
  ps5:          "bg-blue-100 text-blue-800 border-blue-200",
  switch_multi: "bg-red-100 text-red-800 border-red-200",
  switch_solo:  "bg-pink-100 text-pink-800 border-pink-200",
  pc1:          "bg-slate-100 text-slate-600 border-slate-200",
  pc2:          "bg-slate-100 text-slate-600 border-slate-200",
};

function nextOpenDay(): string {
  let d = new Date();
  while (!JOURS_OUVERTS.includes(getDay(d))) d = addDays(d, 1);
  return format(d, "yyyy-MM-dd");
}

const normalizeStr = (s: string) =>
  s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") ?? "";

// ─── Modal : Fiche / Ajout Jeu (avec recherche EAN + PS Store/Nintendo/Steam) ─

function ModalJeu({
  jeu,
  onClose,
  onSaved,
  onDeleted,
}: {
  jeu: JvJeu | null;
  onClose: () => void;
  onSaved: (j: JvJeu) => void;
  onDeleted?: (id: string) => void;
}) {
  const isNew = !jeu;

  // Step 1 = recherche, Step 2 = sélection résultat, Step 3 = formulaire
  const [step, setStep] = useState<1 | 2 | 3>(isNew ? 1 : 3);

  // Recherche
  const [titreRecherche, setTitreRecherche] = useState("");
  const [consoleRecherche, setConsoleRecherche] = useState<Console | "">("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isFetchingDesc, setIsFetchingDesc] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Formulaire
  const [form, setForm] = useState<Partial<JvJeu>>(
    jeu ?? { statut: "disponible", console: "PS5" }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const set = (k: keyof JvJeu, v: any) => setForm(f => ({ ...f, [k]: v }));

  const searchIgdb = async (titre: string, console: Console | string) => {
    if (!titre.trim()) return;
    setIsSearching(true); setSearchError(null); setSearchResults([]);
    try {
      const params = new URLSearchParams({ q: titre, platform: console });
      const res = await fetch(`/api/jv/igdb?${params}`);
      const data = await res.json();
      if (data.error) { setSearchError(data.error); return; }
      if (!data.length) { setSearchError("Aucun résultat — vérifiez le titre ou changez de console"); return; }
      setSearchResults(data as SearchResult[]);
      setStep(2);
    } catch {
      setSearchError("Erreur de connexion");
    } finally {
      setIsSearching(false);
    }
  };

  // Recherche en live (debounce 400ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (titreRecherche.trim().length < 3) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const params = new URLSearchParams({ q: titreRecherche.trim(), platform: consoleRecherche });
        const res = await fetch(`/api/jv/igdb?${params}`);
        const data = await res.json();
        if (!data.error && data.length) setSearchResults(data as SearchResult[]);
      } catch {}
      finally { setIsSearching(false); }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [titreRecherche, consoleRecherche]);

  // ── Étape 2 : sélection du résultat ──────────────────────────────────────

  const selectSearchResult = async (r: SearchResult) => {
    const console_used = (r.console ?? (consoleRecherche || "PS5")) as Console;
    setForm({
      titre: r.titre,
      console: console_used,
      description: r.description,
      image_url: r.image_url,
      annee: r.annee,
      editeur: r.editeur,
      genre: r.genre,
      pegi: r.pegi,
      nb_joueurs: r.nb_joueurs,
      statut: "disponible",
      igdb_id: r.igdb_id ?? null,
    });
    setStep(3);

    // Récupération description FR + PEGI depuis la source plateforme
    setIsFetchingDesc(true);
    try {
      const params = new URLSearchParams({ q: r.titre, platform: console_used });
      const res = await fetch(`/api/jv/search?${params}`);
      const data = await res.json();
      if (Array.isArray(data) && data[0]) {
        const src = data[0];
        setForm(f => ({
          ...f,
          ...(src.description ? { description: src.description } : {}),
          ...(src.pegi && !f.pegi ? { pegi: src.pegi } : {}),
        }));
      }
    } catch {}
    finally { setIsFetchingDesc(false); }
  };

  // ── Étape 3 : sauvegarde ──────────────────────────────────────────────────

  const save = async () => {
    if (!form.titre?.trim() || !form.console) return;
    setIsSaving(true);
    const payload = {
      titre: form.titre.trim(),
      console: form.console,
      genre: form.genre ?? null,
      annee: form.annee ?? null,
      editeur: form.editeur ?? null,
      description: form.description ?? null,
      image_url: form.image_url ?? null,
      pegi: form.pegi ?? null,
      nb_joueurs: form.nb_joueurs ?? null,
      statut: form.statut ?? "disponible",
      igdb_id: form.igdb_id ?? null,
      cote_syracuse: form.cote_syracuse ?? null,
    };
    let result;
    if (isNew) {
      result = await supabase.from("jv_jeux").insert(payload).select().single();
    } else {
      result = await supabase.from("jv_jeux").update(payload).eq("id", jeu!.id).select().single();
    }
    if (result.error) { alert("Erreur : " + result.error.message); setIsSaving(false); return; }
    onSaved(result.data as JvJeu);
    setIsSaving(false);
    onClose();
  };

  const del = async () => {
    if (!jeu) return;
    setIsDeleting(true);
    await supabase.from("jv_jeux").delete().eq("id", jeu.id);
    onDeleted?.(jeu.id);
    setIsDeleting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden mb-8">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
            {form.image_url
              ? <img src={form.image_url} alt={form.titre} className="w-full h-full object-cover" />
              : <span className="text-2xl">🎮</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-xl text-black">{isNew ? "Ajouter un jeu vidéo" : jeu.titre}</h2>
            {isNew && (
              <div className="flex items-center gap-1.5 mt-1">
                {([1, 2, 3] as const).map(s => (
                  <div key={s} className={`h-1.5 rounded-full transition-all ${
                    step >= s ? "bg-black" : "bg-slate-200"
                  } ${s === 1 ? "w-8" : s === 2 ? "w-8" : "w-8"}`} />
                ))}
                <span className="text-[10px] text-slate-400 font-medium ml-1">
                  {step === 1 ? "Recherche" : step === 2 ? "Sélection" : "Détails"}
                </span>
              </div>
            )}
            {!isNew && <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${CONSOLE_COLORS[jeu.console]}`}>{jeu.console}</span>}
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold shrink-0">✕</button>
        </div>

        {/* ── Step 1 : Recherche ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="flex flex-col">
            {/* Barre de recherche — fixe */}
            <div className="flex gap-2 p-6 pb-3">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={titreRecherche}
                  onChange={e => setTitreRecherche(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") searchIgdb(titreRecherche, consoleRecherche);
                    if (e.key === "Escape") setSearchResults([]);
                  }}
                  placeholder="Titre du jeu (3 lettres suffisent)…"
                  autoFocus
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 pr-10 text-sm font-medium outline-none focus:border-black transition-colors"
                />
                {isSearching && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                )}
              </div>
              <select value={consoleRecherche} onChange={e => setConsoleRecherche(e.target.value as Console | "")}
                className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-3 py-3 text-sm font-bold outline-none focus:border-black transition-colors">
                <option value="">Toutes</option>
                {CONSOLES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => searchIgdb(titreRecherche, consoleRecherche)}
                disabled={!titreRecherche.trim() || isSearching}
                className="px-4 py-3 bg-black text-white rounded-2xl text-sm font-bold hover:bg-slate-800 disabled:opacity-40 transition-colors">
                →
              </button>
            </div>

            {/* Résultats inline — scrollables */}
            {searchResults.length > 0 && (
              <div className="flex flex-col overflow-y-auto px-6 pb-4" style={{ maxHeight: "52vh" }}>
                {searchResults.map(r => (
                  <button key={r.external_id} onClick={() => selectSearchResult(r)}
                    className="flex items-center gap-3 w-full px-3 py-2.5 rounded-2xl hover:bg-slate-50 transition-colors text-left border-b border-slate-50 last:border-0">
                    <div className="w-10 h-13 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center" style={{ minHeight: 52 }}>
                      {r.image_url
                        ? <img src={r.image_url} alt={r.titre} className="w-full h-full object-cover" />
                        : <span className="text-lg">🎮</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-black truncate">{r.titre}</p>
                      <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                        {r.annee && <span className="text-[10px] text-slate-400">{r.annee}</span>}
                        {r.editeur && <><span className="text-slate-200 text-[9px]">·</span><span className="text-[10px] text-slate-400 truncate max-w-[130px]">{r.editeur}</span></>}
                        {r.console && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONSOLE_COLORS[r.console]}`}>{r.console}</span>}
                      </div>
                    </div>
                    <span className="text-slate-300 text-lg shrink-0">›</span>
                  </button>
                ))}
              </div>
            )}

            {searchError && (
              <div className="flex items-start gap-2 mx-6 mb-4 p-3 bg-amber-50 rounded-2xl border border-amber-100">
                <span className="text-amber-500 text-sm shrink-0">⚠</span>
                <p className="text-xs font-medium text-amber-700">{searchError}</p>
              </div>
            )}

            <div className="px-6 pb-5 border-t border-slate-100 pt-3">
              <button onClick={() => { setForm({ statut: "disponible", console: (consoleRecherche || "PS5") as Console }); setStep(3); }}
                className="text-xs text-slate-400 font-medium hover:text-black transition-colors">
                Saisir manuellement sans recherche →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 : Résultats ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="flex flex-col">
            <div className="px-6 pt-4 pb-2">
              <button onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-black transition-colors">← Nouvelle recherche</button>
            </div>
            <div className="flex flex-col gap-2 px-6 pb-6 overflow-y-auto custom-scroll" style={{ maxHeight: "60vh" }}>
              {searchResults.map(r => (
                <button key={r.external_id} onClick={() => selectSearchResult(r)}
                  className="flex items-center gap-3 p-3 rounded-2xl border-2 border-slate-100 hover:border-black bg-white transition-all text-left">
                  <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                    {r.image_url
                      ? <img src={r.image_url} alt={r.titre} className="w-full h-full object-cover" />
                      : <span className="text-xl">🎮</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-black">{r.titre}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {r.annee && <span className="text-[10px] text-slate-400">{r.annee}</span>}
                      {r.editeur && <><span className="text-slate-300 text-[10px]">·</span><span className="text-[10px] text-slate-400">{r.editeur}</span></>}
                      {r.genre && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded">{r.genre}</span>}
                      {r.pegi && <span className="text-[10px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5 rounded">PEGI {r.pegi}</span>}
                      {r.console && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONSOLE_COLORS[r.console]}`}>{r.console}</span>}
                    </div>
                    {r.description && (
                      <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">{r.description}</p>
                    )}
                  </div>
                  <span className="text-slate-300 text-xl shrink-0">›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3 : Formulaire ────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="flex flex-col divide-y divide-slate-100 overflow-y-auto custom-scroll" style={{ maxHeight: "60vh" }}>
              <div className="p-6 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Titre *</label>
                  <input type="text" value={form.titre ?? ""} onChange={e => set("titre", e.target.value)}
                    placeholder="Nom du jeu…"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Console *</label>
                    <select value={form.console ?? "PS5"} onChange={e => set("console", e.target.value as Console)}
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors">
                      {CONSOLES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Genre</label>
                    <input type="text" value={form.genre ?? ""} onChange={e => set("genre", e.target.value || null)}
                      placeholder="Action, RPG…"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Année</label>
                    <input type="number" value={form.annee ?? ""} onChange={e => set("annee", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="2024"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">PEGI</label>
                    <select value={form.pegi ?? ""} onChange={e => set("pegi", e.target.value ? parseInt(e.target.value) : null)}
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors">
                      <option value="">—</option>
                      {[3, 7, 12, 16, 18].map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Joueurs</label>
                    <input type="text" value={form.nb_joueurs ?? ""} onChange={e => set("nb_joueurs", e.target.value || null)}
                      placeholder="1-4"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Éditeur</label>
                    <input type="text" value={form.editeur ?? ""} onChange={e => set("editeur", e.target.value || null)}
                      placeholder="Nintendo, Sony…"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Cote Syracuse</label>
                    <input type="text" value={form.cote_syracuse ?? ""} onChange={e => set("cote_syracuse", e.target.value || null)}
                      placeholder="ex. JV-PS5-042"
                      className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Image</label>
                  <div className="flex gap-2 items-start">
                    {form.image_url && (
                      <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                        <img src={form.image_url} alt="" className="w-full h-full object-cover" />
                      </div>
                    )}
                    <input type="text" value={form.image_url ?? ""} onChange={e => set("image_url", e.target.value || null)}
                      placeholder="https://… (auto-rempli par la recherche)"
                      className="flex-1 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Description</label>
                    {isFetchingDesc && (
                      <span className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                        <span className="w-2.5 h-2.5 border border-slate-300 border-t-slate-500 rounded-full animate-spin inline-block" />
                        Récupération FR…
                      </span>
                    )}
                  </div>
                  <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value || null)}
                    rows={3} placeholder="Synopsis, ambiance du jeu…"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors resize-none" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Statut</label>
                  <div className="flex gap-2 flex-wrap">
                    {(["disponible", "selection", "maintenance", "retire"] as const).map(s => (
                      <button key={s} onClick={() => set("statut", s)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border-2 transition-colors capitalize ${
                          form.statut === s ? "bg-black text-white border-black" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                {form.igdb_id && (
                  <p className="text-[10px] text-slate-300 font-medium">IGDB #{form.igdb_id}</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              {!isNew && (
                confirmDelete ? (
                  <button onClick={del} disabled={isDeleting}
                    className="px-4 py-3 rounded-2xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 disabled:opacity-50 transition-colors">
                    {isDeleting ? "Suppression…" : "Confirmer"}
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-rose-50 text-rose-500 font-bold text-sm transition-colors">
                    Supprimer
                  </button>
                )
              )}
              {isNew && step === 3 && (
                <button onClick={() => setStep(1)}
                  className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">
                  ← Retour
                </button>
              )}
              <button onClick={onClose}
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">
                Annuler
              </button>
              <button onClick={save} disabled={isSaving || !form.titre?.trim()}
                className="flex-1 px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors">
                {isSaving ? "Sauvegarde…" : (isNew ? "Ajouter" : "Enregistrer")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Modal : File de rotation (groupes de 3) ─────────────────────────────────

function ModalRotation({
  slot,
  selections,
  jeux,
  onClose,
  onAddToGroup,
  onRemoveSelection,
  onMoveGroup,
}: {
  slot: SelectionSlot;
  selections: JvSelection[];
  jeux: JvJeu[];
  onClose: () => void;
  onAddToGroup: (jeuId: string, groupe: number) => void;
  onRemoveSelection: (selId: string) => void;
  onMoveGroup: (fromGroupe: number, toGroupe: number) => void;
}) {
  const consoleName = SLOT_CONSOLE[slot];

  const planifiees = selections
    .filter(s => s.slot === slot && s.statut === "planifie")
    .sort((a, b) => a.groupe - b.groupe || a.ordre - b.ordre);

  const groupNums = [...new Set(planifiees.map(s => s.groupe))].sort((a, b) => a - b);
  const nextGroupe = groupNums.length > 0 ? Math.max(...groupNums) + 1 : 1;

  const usedPlanifieIds = new Set(planifiees.map(s => s.jeu_id));
  const usedActifIds = new Set(
    selections.filter(s => s.slot === slot && s.statut === "actif").map(s => s.jeu_id)
  );
  const disponibles = jeux.filter(
    j => j.console === consoleName &&
    j.statut !== "retire" &&
    !usedPlanifieIds.has(j.id) &&
    !usedActifIds.has(j.id) &&
    (slot !== "Switch_Multi" || (j.nb_joueurs && j.nb_joueurs !== "1"))
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden mb-8">

        <div className="flex items-center gap-3 p-6 border-b border-slate-100">
          <div className={`w-8 h-8 rounded-full ${CONSOLE_DOT[consoleName]}`} />
          <div>
            <h2 className="font-black text-xl text-black">File d'attente — {SLOT_LABEL[slot]}</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Groupes de 3 jeux · chaque groupe = une rotation</p>
          </div>
          <button onClick={onClose}
            className="ml-auto w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold">✕</button>
        </div>

        <div className="flex flex-col gap-4 p-6 overflow-y-auto custom-scroll" style={{ maxHeight: "60vh" }}>

          {groupNums.length === 0 && (
            <p className="text-sm text-slate-400 font-medium text-center py-6">
              Aucun groupe planifié — créez le premier ci-dessous
            </p>
          )}

          {groupNums.map((g, gIdx) => {
            const games = planifiees.filter(s => s.groupe === g);
            const dispoPourGroupe = disponibles.filter(j => !games.some(s => s.jeu_id === j.id));

            return (
              <div key={g} className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100">
                {/* En-tête groupe */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                    Groupe {gIdx + 1}
                    <span className="normal-case font-medium ml-1 text-slate-300">({games.length}/3)</span>
                  </span>
                  <div className="flex gap-1">
                    {gIdx > 0 && (
                      <button onClick={() => onMoveGroup(g, groupNums[gIdx - 1])}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-slate-400 text-slate-400 hover:text-black text-xs transition-colors">▲</button>
                    )}
                    {gIdx < groupNums.length - 1 && (
                      <button onClick={() => onMoveGroup(g, groupNums[gIdx + 1])}
                        className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-slate-200 hover:border-slate-400 text-slate-400 hover:text-black text-xs transition-colors">▼</button>
                    )}
                  </div>
                </div>

                {/* Jeux du groupe */}
                <div className="flex flex-col gap-1.5">
                  {games.map(sel => {
                    const jeu = jeux.find(j => j.id === sel.jeu_id);
                    if (!jeu) return null;
                    return (
                      <div key={sel.id} className="flex items-center gap-3 p-2.5 bg-white rounded-xl border border-slate-100">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                          {jeu.image_url
                            ? <img src={jeu.image_url} alt={jeu.titre} className="w-full h-full object-cover" />
                            : <span className="text-base">🎮</span>}
                        </div>
                        <p className="font-bold text-sm text-black flex-1 truncate">{jeu.titre}</p>
                        <button onClick={() => onRemoveSelection(sel.id)}
                          className="text-slate-300 hover:text-rose-500 font-black text-sm transition-colors shrink-0">✕</button>
                      </div>
                    );
                  })}

                  {/* Slot vide — ajouter un jeu */}
                  {games.length < 3 && (
                    <select
                      defaultValue=""
                      onChange={e => { if (e.target.value) onAddToGroup(e.target.value, g); }}
                      className="bg-white border-2 border-dashed border-slate-200 rounded-xl px-3 py-2.5 text-xs font-medium outline-none focus:border-[#baff29] transition-colors text-slate-400">
                      <option value="">+ Jeu {games.length + 1}/3…</option>
                      {dispoPourGroupe.length === 0
                        ? <option disabled>Aucun jeu disponible</option>
                        : dispoPourGroupe.map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}

          {/* Nouveau groupe */}
          {disponibles.length > 0 && (
            <button
              onClick={() => {
                const firstDispo = disponibles[0];
                if (firstDispo) onAddToGroup(firstDispo.id, nextGroupe);
              }}
              className="flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed border-slate-200 hover:border-black text-slate-400 hover:text-black text-sm font-bold transition-colors">
              + Nouveau groupe
            </button>
          )}
        </div>

        <div className="p-6 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Planning global de rotation ──────────────────────────────────────

function ModalRotationPlanning({
  selections,
  jeux,
  rotationConfig,
  onUpdateConfig,
  onClose,
}: {
  selections: JvSelection[];
  jeux: JvJeu[];
  rotationConfig: JvRotationConfig;
  onUpdateConfig: (slotIndex: number, weekStart: string) => void;
  onClose: () => void;
}) {
  const [slotIndex, setSlotIndex] = useState(rotationConfig.current_slot_index);
  const [weekStart, setWeekStart] = useState(rotationConfig.week_start);

  // Construit la grille planning : 12 semaines à venir
  const planning = useMemo(() => {
    // Pour chaque slot, les groupes planifiés triés
    const slotGroups: Record<SelectionSlot, number[]> = {
      PS5: [], Switch_Multi: [], Switch_Solo: [], PC: [],
    };
    for (const slot of ROTATION_ORDER) {
      const sels = selections.filter(s => s.slot === slot && s.statut === "planifie");
      slotGroups[slot] = [...new Set(sels.map(s => s.groupe))].sort((a, b) => a - b);
    }

    // Tracker combien de groupes ont été "consommés" par slot
    const consumed: Record<SelectionSlot, number> = { PS5: 0, Switch_Multi: 0, Switch_Solo: 0, PC: 0 };

    return Array.from({ length: 12 }, (_, weekOffset) => {
      const slotIdx = (slotIndex + weekOffset) % 4;
      const slot = ROTATION_ORDER[slotIdx];
      const groupeIdx = consumed[slot];
      const groupeNum = slotGroups[slot][groupeIdx] ?? null;

      const games = groupeNum !== null
        ? selections
            .filter(s => s.slot === slot && s.statut === "planifie" && s.groupe === groupeNum)
            .map(s => jeux.find(j => j.id === s.jeu_id))
            .filter(Boolean) as JvJeu[]
        : [];

      // Si c'est la semaine 0, on montre les actifs (pas les planifiés)
      const activeGames = weekOffset === 0
        ? selections
            .filter(s => s.slot === slot && s.statut === "actif" && !s.permanent)
            .map(s => jeux.find(j => j.id === s.jeu_id))
            .filter(Boolean) as JvJeu[]
        : games;

      consumed[slot] = groupeIdx + (weekOffset > 0 ? 1 : 0);

      const date = addDays(parseISO(weekStart), weekOffset * 7);

      return { weekOffset, slot, date, games: activeGames, isActive: weekOffset === 0, groupeNum };
    });
  }, [selections, jeux, slotIndex, weekStart]);

  const hasChanges = slotIndex !== rotationConfig.current_slot_index || weekStart !== rotationConfig.week_start;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden mb-8">

        <div className="flex items-center gap-3 p-6 border-b border-slate-100">
          <span className="text-2xl">📅</span>
          <div className="flex-1">
            <h2 className="font-black text-xl text-black">Planning de rotation</h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">Vue globale des changements de sélection semaine par semaine</p>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold">✕</button>
        </div>

        {/* Config point de départ */}
        <div className="flex items-center gap-4 px-6 py-4 bg-slate-50 border-b border-slate-100 flex-wrap">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest shrink-0">Point de départ</span>
          <div className="flex gap-2 flex-wrap flex-1">
            {ROTATION_ORDER.map((slot, idx) => (
              <button key={slot} onClick={() => setSlotIndex(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-colors ${
                  slotIndex === idx
                    ? "bg-black text-white border-black"
                    : `${CONSOLE_COLORS[SLOT_CONSOLE[slot]]} hover:opacity-80`
                }`}>
                {SLOT_LABEL[slot]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium shrink-0">Semaine du</span>
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
              className="bg-white border-2 border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium outline-none focus:border-black transition-colors" />
          </div>
          {hasChanges && (
            <button onClick={() => onUpdateConfig(slotIndex, weekStart)}
              className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors">
              Enregistrer
            </button>
          )}
        </div>

        {/* Tableau planning */}
        <div className="overflow-y-auto custom-scroll" style={{ maxHeight: "55vh" }}>
          <table className="w-full">
            <thead className="sticky top-0 bg-white border-b border-slate-100">
              <tr>
                <th className="text-left px-6 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-28">Semaine</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Console</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Jeux</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {planning.map(({ weekOffset, slot, date, games, isActive }) => (
                <tr key={weekOffset} className={isActive ? "bg-[#baff29]/10" : "hover:bg-slate-50"}>
                  <td className="px-6 py-3">
                    <p className={`text-xs font-black ${isActive ? "text-black" : "text-slate-500"}`}>
                      {isActive ? "Cette sem." : `Sem. +${weekOffset}`}
                    </p>
                    <p className="text-[10px] text-slate-400">{format(date, "d MMM", { locale: fr })}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${CONSOLE_COLORS[SLOT_CONSOLE[slot]]}`}>
                      {SLOT_LABEL[slot]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {games.length === 0 ? (
                      <span className="text-[11px] text-slate-300 font-medium italic">— non planifié</span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap">
                        {games.map(j => (
                          <div key={j.id} className="flex items-center gap-1.5">
                            <div className="w-5 h-5 rounded overflow-hidden bg-slate-100 shrink-0">
                              {j.image_url
                                ? <img src={j.image_url} alt={j.titre} className="w-full h-full object-cover" />
                                : <span className="text-[10px] flex items-center justify-center h-full">🎮</span>}
                            </div>
                            <span className="text-[11px] font-bold text-black">{j.titre}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-6 border-t border-slate-100">
          <button onClick={onClose}
            className="w-full py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 transition-colors">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal : Nouvelle réservation ─────────────────────────────────────────────

function ModalReservation({
  jeux,
  selections,
  preDate,
  preCreneau,
  prePoste,
  onClose,
  onSaved,
}: {
  jeux: JvJeu[];
  selections: JvSelection[];
  preDate?: string;
  preCreneau?: string;
  prePoste?: string;
  onClose: () => void;
  onSaved: (r: JvReservation) => void;
}) {
  const [posteId, setPosteId] = useState(prePoste ?? "ps5");
  const [date, setDate] = useState(preDate ?? nextOpenDay());
  const [creneau, setCreneau] = useState("");
  const [jeuId, setJeuId] = useState("");
  const [nom, setNom] = useState("");
  const [nbJoueurs, setNbJoueurs] = useState(1);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const poste = POSTES.find(p => p.id === posteId)!;
  const slot = POSTE_SLOT[posteId];
  const dayOfWeek = getDay(parseISO(date));
  const creneauxDispo = CRENEAUX_PAR_JOUR[dayOfWeek] ?? [];
  const isJourOuvert = JOURS_OUVERTS.includes(dayOfWeek);

  // Initialise le créneau quand la date change
  useEffect(() => {
    if (preCreneau && creneauxDispo.includes(preCreneau)) setCreneau(preCreneau);
    else setCreneau(creneauxDispo[0] ?? "");
  }, [date]);

  // Jeux de la sélection active pour ce slot (rotation + permanent)
  const activeSelections = selections.filter(s => s.slot === slot && s.statut === "actif");
  const jeuxDispo = activeSelections
    .map(s => ({ sel: s, jeu: jeux.find(j => j.id === s.jeu_id) }))
    .filter((x): x is { sel: JvSelection; jeu: JvJeu } => !!x.jeu)
    .filter(x => slot !== "Switch_Multi" || (x.jeu.nb_joueurs && x.jeu.nb_joueurs !== "1"));

  // Reset jeu + nb_joueurs quand le poste change
  useEffect(() => { setJeuId(""); setNbJoueurs(1); }, [posteId]);

  const save = async () => {
    if (!jeuId || !nom.trim() || !creneau || !isJourOuvert || !posteId) return;
    setIsSaving(true);
    const { data, error } = await supabase.from("jv_reservations").insert({
      jeu_id: jeuId, poste: posteId, date_creneau: date, creneau,
      adherent_nom: nom.trim(), nb_joueurs: nbJoueurs,
      notes: notes.trim() || null, statut: "confirmee",
    }).select().single();
    if (error) { alert("Erreur : " + error.message); setIsSaving(false); return; }
    onSaved(data as JvReservation);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden mb-8">
        <div className="flex items-center gap-3 p-6 border-b border-slate-100">
          <span className="text-2xl">📅</span>
          <h2 className="font-black text-xl text-black flex-1">Nouvelle réservation</h2>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold">✕</button>
        </div>
        <div className="p-6 flex flex-col gap-5">

          {/* Poste */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Poste *</label>
            <div className="flex gap-2 flex-wrap">
              {POSTES.map(p => (
                <button key={p.id} onClick={() => setPosteId(p.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold border-2 transition-colors ${
                    posteId === p.id
                      ? "bg-black text-white border-black"
                      : `${POSTE_COLORS[p.id]} hover:opacity-80`}`}>
                  {p.label}
                </button>
              ))}
            </div>
            {poste.multiOnly && (
              <p className="text-[10px] text-slate-400 font-medium">Affiche uniquement les jeux multijoueur de la sélection</p>
            )}
          </div>

          {/* Date + créneau */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className={`bg-slate-50 border-2 rounded-2xl px-4 py-3 text-sm font-medium outline-none transition-colors ${
                  isJourOuvert ? "border-slate-100 focus:border-black" : "border-rose-200 bg-rose-50"}`} />
              {!isJourOuvert && <p className="text-[10px] text-rose-500 font-medium">Ouvert Mar · Mer · Jeu · Ven uniquement</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Créneau *</label>
              {creneauxDispo.length > 0 ? (
                <select value={creneau} onChange={e => setCreneau(e.target.value)}
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors">
                  {creneauxDispo.map(cr => <option key={cr} value={cr}>{cr}</option>)}
                </select>
              ) : (
                <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm text-slate-400 font-medium">—</div>
              )}
            </div>
          </div>

          {/* Jeu — boutons cliquables */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Jeu (sélection active) *</label>
            {jeuxDispo.length === 0 ? (
              <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl px-4 py-3 text-sm text-amber-600 font-medium">
                Aucun jeu en sélection active pour ce poste
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {jeuxDispo.map(({ sel, jeu: j }) => (
                  <button key={j.id} onClick={() => setJeuId(j.id)}
                    className={`flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                      jeuId === j.id
                        ? "border-black bg-slate-50"
                        : "border-slate-100 bg-white hover:border-slate-300"
                    }`}>
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                      {j.image_url
                        ? <img src={j.image_url} alt={j.titre} className="w-full h-full object-cover" />
                        : <span className="text-lg">🎮</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-black truncate">{j.titre}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {j.nb_joueurs && <span className="text-[10px] text-slate-400">👥 {j.nb_joueurs}</span>}
                        {j.genre && <span className="text-[10px] text-slate-400">{j.genre}</span>}
                        {sel.permanent && (
                          <span className="text-[10px] bg-amber-50 text-amber-600 font-bold px-1.5 py-0.5 rounded-md border border-amber-100">Permanent</span>
                        )}
                      </div>
                    </div>
                    {jeuId === j.id && <span className="text-black font-black text-lg shrink-0">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Adhérent */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nom adhérent *</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              placeholder="Prénom NOM…" autoFocus
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
          </div>

          {/* Nb joueurs */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Nb joueurs <span className="normal-case font-medium">(max {poste.maxJoueurs})</span>
            </label>
            <div className="flex gap-2">
              {Array.from({ length: poste.maxJoueurs }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setNbJoueurs(n)}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-colors ${
                    nbJoueurs === n ? "bg-black text-white border-black" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Remarques optionnelles…"
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">
            Annuler
          </button>
          <button onClick={save} disabled={isSaving || !jeuId || !nom.trim() || !creneau || !isJourOuvert}
            className="flex-1 px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {isSaving ? "Sauvegarde…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Statut calculé automatiquement ──────────────────────────────────────────

function parseCreneau(creneau: string): { startH: number; endH: number } {
  const parts = creneau.split("-");
  return { startH: parseInt(parts[0]), endH: parseInt(parts[1]) };
}

type DisplayStatus = "a_venir" | "en_cours" | "passee" | "annulee";

function getDisplayStatus(r: JvReservation): DisplayStatus {
  if (r.statut === "annulee") return "annulee";
  const today = format(new Date(), "yyyy-MM-dd");
  const nowH = new Date().getHours();
  if (r.date_creneau < today) return "passee";
  if (r.date_creneau > today) return "a_venir";
  const { startH, endH } = parseCreneau(r.creneau);
  if (nowH >= startH && nowH < endH) return "en_cours";
  if (nowH >= endH) return "passee";
  return "a_venir";
}

const STATUS_LABEL: Record<DisplayStatus, string> = {
  a_venir: "À venir", en_cours: "En cours", passee: "Passée", annulee: "Annulée",
};
const STATUS_COLORS: Record<DisplayStatus, string> = {
  a_venir: "bg-slate-100 text-slate-500",
  en_cours: "bg-[#baff29]/40 text-black",
  passee: "bg-slate-100 text-slate-400",
  annulee: "bg-rose-50 text-rose-400",
};

// ─── Modal : Détail / modification d'une réservation ─────────────────────────

function ModalReservationDetail({
  reservation,
  jeux,
  selections,
  onClose,
  onSaved,
  onCancelled,
}: {
  reservation: JvReservation;
  jeux: JvJeu[];
  selections: JvSelection[];
  onClose: () => void;
  onSaved: (r: JvReservation) => void;
  onCancelled: (id: string) => void;
}) {
  const [nom, setNom] = useState(reservation.adherent_nom);
  const [nbJoueurs, setNbJoueurs] = useState(reservation.nb_joueurs);
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [jeuId, setJeuId] = useState(reservation.jeu_id);
  const [jeu2Id, setJeu2Id] = useState<string | null>(reservation.jeu2_id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const poste = POSTES.find(p => p.id === reservation.poste)!;
  const slot = POSTE_SLOT[reservation.poste] ?? "PS5";
  const displayStatus = getDisplayStatus(reservation);

  const activeJeux = selections
    .filter(s => s.slot === slot && s.statut === "actif")
    .map(s => jeux.find(j => j.id === s.jeu_id))
    .filter((j): j is JvJeu => !!j);
  const jeuActuel = jeux.find(j => j.id === jeuId);
  const jeuDansSelection = activeJeux.some(j => j.id === jeuId);
  const jeu2Actuel = jeu2Id ? jeux.find(j => j.id === jeu2Id) : null;
  const jeu2DansSelection = jeu2Id ? activeJeux.some(j => j.id === jeu2Id) : true;

  const save = async () => {
    setIsSaving(true);
    const { data, error } = await supabase.from("jv_reservations")
      .update({ adherent_nom: nom.trim(), nb_joueurs: nbJoueurs, notes: notes.trim() || null, jeu_id: jeuId, jeu2_id: jeu2Id })
      .eq("id", reservation.id).select().single();
    if (error) { alert("Erreur : " + error.message); setIsSaving(false); return; }
    onSaved(data as JvReservation);
    setIsSaving(false);
    onClose();
  };

  const cancel = async () => {
    await supabase.from("jv_reservations").update({ statut: "annulee" }).eq("id", reservation.id);
    onCancelled(reservation.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden mb-8">

        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-slate-100">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm border-2 ${POSTE_COLORS[reservation.poste] ?? "bg-slate-100 border-slate-200"}`}>
            {poste?.label ?? reservation.poste}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-black text-base text-black capitalize">
              {format(parseISO(reservation.date_creneau), "EEEE d MMMM", { locale: fr })}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-400">{reservation.creneau}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-lg flex items-center gap-1 ${STATUS_COLORS[displayStatus]}`}>
                {displayStatus === "en_cours" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                {STATUS_LABEL[displayStatus]}
              </span>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold">✕</button>
        </div>

        <div className="p-6 flex flex-col gap-4 overflow-y-auto custom-scroll" style={{ maxHeight: "65vh" }}>

          {/* Jeu 1 */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Jeu</label>
            {activeJeux.map(j => (
              <button key={j.id} onClick={() => setJeuId(j.id)}
                className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 text-left transition-all ${
                  jeuId === j.id ? "border-black bg-slate-50" : "border-slate-100 bg-white hover:border-slate-200"
                }`}>
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {j.image_url ? <img src={j.image_url} alt={j.titre} className="w-full h-full object-cover" /> : <span>🎮</span>}
                </div>
                <span className="font-bold text-sm flex-1 truncate text-black">{j.titre}</span>
                {jeuId === j.id && <span className="font-black text-black">✓</span>}
              </button>
            ))}
            {jeuActuel && !jeuDansSelection && (
              <div className="flex items-center gap-3 p-2.5 rounded-2xl border-2 border-slate-100 bg-slate-50 opacity-60">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {jeuActuel.image_url ? <img src={jeuActuel.image_url} alt={jeuActuel.titre} className="w-full h-full object-cover" /> : <span>🎮</span>}
                </div>
                <span className="font-bold text-sm flex-1 truncate">{jeuActuel.titre}</span>
                <span className="text-[10px] text-slate-400 shrink-0">hors sélection</span>
              </div>
            )}
          </div>

          {/* Jeu 2 — changement en cours de créneau */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Changement de jeu</label>
              {jeu2Id && (
                <button onClick={() => setJeu2Id(null)}
                  className="text-[10px] font-bold text-rose-400 hover:text-rose-600 transition-colors">
                  Supprimer
                </button>
              )}
            </div>
            {!jeu2Id && (
              <p className="text-[11px] text-slate-400 font-medium">
                Optionnel — si les joueurs ont changé de jeu pendant le créneau
              </p>
            )}
            {activeJeux.filter(j => j.id !== jeuId).map(j => (
              <button key={j.id} onClick={() => setJeu2Id(jeu2Id === j.id ? null : j.id)}
                className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 text-left transition-all ${
                  jeu2Id === j.id ? "border-black bg-slate-50" : "border-slate-100 bg-white hover:border-slate-200"
                }`}>
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {j.image_url ? <img src={j.image_url} alt={j.titre} className="w-full h-full object-cover" /> : <span>🎮</span>}
                </div>
                <span className="font-bold text-sm flex-1 truncate text-black">{j.titre}</span>
                {jeu2Id === j.id && <span className="font-black text-black">✓</span>}
              </button>
            ))}
            {jeu2Actuel && !jeu2DansSelection && (
              <div className="flex items-center gap-3 p-2.5 rounded-2xl border-2 border-slate-100 bg-slate-50 opacity-60">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                  {jeu2Actuel.image_url ? <img src={jeu2Actuel.image_url} alt={jeu2Actuel.titre} className="w-full h-full object-cover" /> : <span>🎮</span>}
                </div>
                <span className="font-bold text-sm flex-1 truncate">{jeu2Actuel.titre}</span>
                <span className="text-[10px] text-slate-400 shrink-0">hors sélection</span>
              </div>
            )}
          </div>

          {/* Adhérent */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Adhérent</label>
            <input type="text" value={nom} onChange={e => setNom(e.target.value)}
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
          </div>

          {/* Nb joueurs */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Nb joueurs <span className="normal-case font-medium">(max {poste?.maxJoueurs ?? 2})</span>
            </label>
            <div className="flex gap-2">
              {Array.from({ length: poste?.maxJoueurs ?? 2 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setNbJoueurs(n)}
                  className={`flex-1 py-3 rounded-2xl text-sm font-bold border-2 transition-colors ${
                    nbJoueurs === n ? "bg-black text-white border-black" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Remarques optionnelles…"
              className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors" />
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-slate-100">
          {reservation.statut !== "annulee" && !confirmCancel && (
            <button onClick={() => setConfirmCancel(true)}
              className="px-4 py-3 rounded-2xl bg-slate-100 hover:bg-rose-50 text-rose-400 font-bold text-sm transition-colors">
              Annuler
            </button>
          )}
          {confirmCancel && (
            <button onClick={cancel}
              className="px-4 py-3 rounded-2xl bg-rose-500 text-white font-bold text-sm hover:bg-rose-600 transition-colors">
              Confirmer annulation
            </button>
          )}
          <button onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">
            Fermer
          </button>
          {reservation.statut !== "annulee" && (
            <button onClick={save} disabled={isSaving || !nom.trim() || !jeuId}
              className="flex-1 px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors">
              {isSaving ? "Sauvegarde…" : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Onglet Catalogue ─────────────────────────────────────────────────────────

function TabCatalogue({
  jeux,
  onAdd,
  onEdit,
}: {
  jeux: JvJeu[];
  onAdd: () => void;
  onEdit: (j: JvJeu) => void;
}) {
  const [recherche, setRecherche] = useState("");
  const [filtreConsole, setFiltreConsole] = useState<Console | "Toutes">("Toutes");
  const [filtreStatut, setFiltreStatut] = useState<string>("tous");

  const counts = useMemo(() =>
    CONSOLES.reduce((acc, c) => ({ ...acc, [c]: jeux.filter(j => j.console === c).length }), {} as Record<Console, number>),
    [jeux]
  );

  const filtered = useMemo(() => {
    const q = normalizeStr(recherche);
    return jeux.filter(j => {
      if (filtreConsole !== "Toutes" && j.console !== filtreConsole) return false;
      if (filtreStatut !== "tous" && j.statut !== filtreStatut) return false;
      if (q && !normalizeStr(j.titre).includes(q) && !normalizeStr(j.editeur ?? "").includes(q)) return false;
      return true;
    });
  }, [jeux, recherche, filtreConsole, filtreStatut]);

  return (
    <div className="flex flex-col gap-5">

      {/* Stats consoles */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {CONSOLES.map(c => (
          <button key={c} onClick={() => setFiltreConsole(filtreConsole === c ? "Toutes" : c)}
            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${
              filtreConsole === c ? "border-black bg-black text-white" : "border-slate-100 bg-white hover:border-slate-200"
            }`}>
            <div className={`w-2.5 h-2.5 rounded-full ${filtreConsole === c ? "bg-[#baff29]" : CONSOLE_DOT[c]}`} />
            <span className={`text-lg font-black ${filtreConsole === c ? "text-white" : "text-black"}`}>{counts[c]}</span>
            <span className={`text-[10px] font-bold ${filtreConsole === c ? "text-white/70" : "text-slate-400"}`}>{c}</span>
          </button>
        ))}
      </div>

      {/* Filtres */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un jeu…"
            className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-2.5 pl-10 font-medium text-sm outline-none focus:border-black transition-colors" />
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
        </div>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          className="bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-2.5 text-sm font-medium outline-none focus:border-black transition-colors">
          <option value="tous">Tous statuts</option>
          <option value="disponible">Disponible</option>
          <option value="selection">En sélection</option>
          <option value="maintenance">Maintenance</option>
          <option value="retire">Retiré</option>
        </select>
        <span className="text-sm text-slate-400 font-medium">{filtered.length} jeu{filtered.length > 1 ? "x" : ""}</span>
        <button onClick={onAdd}
          className="flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-2xl text-sm font-bold hover:bg-slate-800 transition-colors">
          + Ajouter
        </button>
      </div>

      {/* Liste */}
      <div className="flex flex-col gap-2 overflow-y-auto custom-scroll" style={{ maxHeight: "calc(100vh - 420px)" }}>
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-300">
            <span className="text-5xl">🎮</span>
            <p className="font-medium text-sm">Aucun jeu trouvé</p>
          </div>
        )}
        {filtered.map(jeu => (
          <div key={jeu.id}
            className="flex items-center gap-3 p-3 rounded-2xl border-2 border-slate-100 hover:border-slate-200 bg-white transition-all">
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
              {jeu.image_url
                ? <img src={jeu.image_url} alt={jeu.titre} className="w-full h-full object-cover" loading="lazy" />
                : <span className="text-xl">🎮</span>}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm text-black truncate">{jeu.titre}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONSOLE_COLORS[jeu.console]}`}>{jeu.console}</span>
                {jeu.genre && <span className="text-[10px] text-slate-400 font-medium">{jeu.genre}</span>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {jeu.editeur && <span className="text-[10px] text-slate-400">{jeu.editeur}</span>}
                {jeu.annee && <><span className="text-slate-200 text-[10px]">·</span><span className="text-[10px] text-slate-400">{jeu.annee}</span></>}
                {jeu.pegi && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded">PEGI {jeu.pegi}</span>}
                {jeu.nb_joueurs && <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded">👥 {jeu.nb_joueurs}</span>}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  jeu.statut === "disponible" ? "bg-emerald-50 text-emerald-600" :
                  jeu.statut === "selection" ? "bg-[#baff29]/30 text-black" :
                  jeu.statut === "maintenance" ? "bg-amber-50 text-amber-600" :
                  "bg-slate-100 text-slate-400"
                }`}>{jeu.statut}</span>
              </div>
            </div>
            <button onClick={() => onEdit(jeu)}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-black hover:text-white text-slate-600 rounded-xl text-xs font-bold transition-colors shrink-0">
              ✏️ Modifier
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Onglet Sélections ────────────────────────────────────────────────────────

function TabSelections({
  jeux,
  selections,
  onRotationOpen,
  onToggleActif,
  onPlanningOpen,
}: {
  jeux: JvJeu[];
  selections: JvSelection[];
  onRotationOpen: (slot: SelectionSlot) => void;
  onToggleActif: (jeuId: string, slot: SelectionSlot, isPermanent: boolean, currentSel: JvSelection | undefined) => void;
  onPlanningOpen: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">

      {/* Cycle de rotation */}
      <div className="flex items-center gap-2 p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 flex-wrap">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0 mr-1">Cycle de rotation</span>
        {ROTATION_ORDER.map((slot, idx) => (
          <span key={slot} className="flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1.5 rounded-xl border-2 ${CONSOLE_COLORS[SLOT_CONSOLE[slot]]}`}>
              {SLOT_LABEL[slot]}
            </span>
            {idx < ROTATION_ORDER.length - 1 && <span className="text-slate-300 font-bold text-sm">→</span>}
          </span>
        ))}
        <span className="text-slate-300 font-bold text-sm">→ …</span>
        <button onClick={onPlanningOpen}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-white border-2 border-slate-200 hover:border-black rounded-xl text-xs font-bold text-slate-600 hover:text-black transition-colors">
          📅 Planning global
        </button>
      </div>

      {/* Cartes par slot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {ROTATION_ORDER.map(slot => {
          const console = SLOT_CONSOLE[slot];
          const actifSels = selections.filter(s => s.slot === slot && s.statut === "actif" && !s.permanent);
          const permanentSels = SLOT_HAS_PERMANENT[slot]
            ? selections.filter(s => s.slot === slot && s.permanent)
            : [];
          const planifies = selections.filter(s => s.slot === slot && s.statut === "planifie").length;

          const usedIds = new Set(selections.filter(s => s.slot === slot).map(s => s.jeu_id));
          const disponibles = jeux.filter(j =>
            j.console === console &&
            j.statut !== "retire" &&
            !usedIds.has(j.id) &&
            (slot !== "Switch_Multi" || (j.nb_joueurs && j.nb_joueurs !== "1"))
          );

          return (
            <div key={slot} className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-100 flex flex-col gap-4">

              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${CONSOLE_DOT[console]}`} />
                  <span className="font-black text-sm text-black">{SLOT_LABEL[slot]}</span>
                </div>
                <button onClick={() => onRotationOpen(slot)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border-2 border-slate-200 hover:border-black rounded-xl text-xs font-bold text-slate-600 hover:text-black transition-colors">
                  🔄
                  {planifies > 0 && (
                    <span className="min-w-[16px] h-4 bg-black text-white text-[9px] font-black rounded-full flex items-center justify-center px-0.5">
                      {planifies}
                    </span>
                  )}
                </button>
              </div>

              {/* Jeux permanents (PS5 / PC) — sans limite */}
              {SLOT_HAS_PERMANENT[slot] && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest">Permanents</span>
                  {permanentSels.map(pSel => {
                    const pJeu = jeux.find(j => j.id === pSel.jeu_id);
                    if (!pJeu) return null;
                    return (
                      <div key={pSel.id} className="flex items-center gap-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                          {pJeu.image_url
                            ? <img src={pJeu.image_url} alt={pJeu.titre} className="w-full h-full object-cover" />
                            : <span className="text-sm">🎮</span>}
                        </div>
                        <p className="font-bold text-xs flex-1 truncate text-black">{pJeu.titre}</p>
                        <button onClick={() => onToggleActif(pJeu.id, slot, true, pSel)}
                          className="text-[11px] text-amber-400 hover:text-rose-500 font-black transition-colors shrink-0 ml-1">✕</button>
                      </div>
                    );
                  })}
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) onToggleActif(e.target.value, slot, true, undefined); }}
                    className="bg-white border-2 border-dashed border-amber-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-amber-400 transition-colors text-slate-500">
                    <option value="">+ Ajouter un jeu permanent…</option>
                    {jeux.filter(j => j.console === console && j.statut !== "retire" && !usedIds.has(j.id))
                      .map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                  </select>
                </div>
              )}

              {/* Sélection rotation (3 jeux) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Sélection <span className="normal-case font-medium">({actifSels.length}/3)</span>
                </span>
                {actifSels.map(sel => {
                  const jeu = jeux.find(j => j.id === sel.jeu_id);
                  if (!jeu) return null;
                  return (
                    <div key={sel.id} className="flex items-center gap-2 p-2.5 bg-white rounded-xl border-2 border-[#baff29]">
                      <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                        {jeu.image_url
                          ? <img src={jeu.image_url} alt={jeu.titre} className="w-full h-full object-cover" />
                          : <span className="text-sm">🎮</span>}
                      </div>
                      <p className="font-bold text-xs flex-1 truncate text-black">{jeu.titre}</p>
                      <button onClick={() => onToggleActif(jeu.id, slot, false, sel)}
                        className="text-[11px] text-slate-300 hover:text-rose-500 font-black transition-colors shrink-0 ml-1">✕</button>
                    </div>
                  );
                })}
                {actifSels.length < 3 && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) onToggleActif(e.target.value, slot, false, undefined); }}
                    className="bg-white border-2 border-dashed border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-[#baff29] transition-colors text-slate-500">
                    <option value="">+ Ajouter ({3 - actifSels.length} place{3 - actifSels.length > 1 ? "s" : ""})…</option>
                    {disponibles.map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                  </select>
                )}
              </div>

              {/* File planifiée (compacte) */}
              {planifies > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">À venir ({planifies})</span>
                  {selections
                    .filter(s => s.slot === slot && s.statut === "planifie")
                    .sort((a, b) => a.ordre - b.ordre)
                    .slice(0, 2)
                    .map((sel, idx) => {
                      const j = jeux.find(x => x.id === sel.jeu_id);
                      if (!j) return null;
                      return (
                        <div key={sel.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-slate-100">
                          <span className="text-[10px] font-black text-slate-300 w-3">{idx + 1}</span>
                          <span className="text-[11px] font-bold text-slate-700 truncate">{j.titre}</span>
                        </div>
                      );
                    })}
                  {planifies > 2 && (
                    <button onClick={() => onRotationOpen(slot)}
                      className="text-[10px] text-slate-400 font-medium text-center py-0.5 hover:text-black transition-colors">
                      +{planifies - 2} autres
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Onglet Réservations ──────────────────────────────────────────────────────

function TabReservations({
  jeux,
  reservations,
  onNouvelle,
  onOpenDetail,
}: {
  jeux: JvJeu[];
  reservations: JvReservation[];
  onNouvelle: (date?: string, creneau?: string, poste?: string) => void;
  onOpenDetail: (r: JvReservation) => void;
}) {
  const [semaine, setSemaine] = useState(new Date());
  const lundi = startOfWeek(semaine, { weekStartsOn: 1 });
  const joursOuverts = eachDayOfInterval({ start: addDays(lundi, 1), end: addDays(lundi, 4) });

  const stats: JvStat[] = useMemo(() => {
    const map: Record<string, { titre: string; console: Console; image_url: string | null; count: number }> = {};
    const addJeu = (jeuId: string) => {
      const jeu = jeux.find(j => j.id === jeuId);
      if (!jeu) return;
      if (!map[jeuId]) map[jeuId] = { titre: jeu.titre, console: jeu.console, image_url: jeu.image_url, count: 0 };
      map[jeuId].count++;
    };
    for (const r of reservations.filter(r => getDisplayStatus(r) !== "annulee")) {
      addJeu(r.jeu_id);
      if (r.jeu2_id) addJeu(r.jeu2_id);
    }
    return Object.entries(map)
      .map(([jeu_id, v]) => ({ jeu_id, titre: v.titre, console: v.console, image_url: v.image_url, nb_reservations: v.count }))
      .sort((a, b) => b.nb_reservations - a.nb_reservations);
  }, [reservations, jeux]);

  const getResaPoste = (date: Date, cr: string, posteId: string) =>
    reservations.find(r =>
      r.date_creneau === format(date, "yyyy-MM-dd") &&
      r.creneau === cr && r.poste === posteId && r.statut !== "annulee"
    );

  const countByStatus = useMemo(() => ({
    en_cours: reservations.filter(r => getDisplayStatus(r) === "en_cours").length,
    a_venir:  reservations.filter(r => getDisplayStatus(r) === "a_venir").length,
    passee:   reservations.filter(r => getDisplayStatus(r) === "passee").length,
  }), [reservations]);

  const sidebarResas = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd");
    return reservations
      .filter(r => r.statut !== "annulee" && r.date_creneau >= today)
      .sort((a, b) => a.date_creneau.localeCompare(b.date_creneau) || a.creneau.localeCompare(b.creneau));
  }, [reservations]);

  const enCoursResas = sidebarResas.filter(r => getDisplayStatus(r) === "en_cours");
  const aVenirResas  = sidebarResas.filter(r => getDisplayStatus(r) === "a_venir");

  return (
    <div className="flex flex-col gap-6">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#baff29]/20 rounded-2xl p-4 border-2 border-[#baff29]/40 flex items-center gap-3">
          {countByStatus.en_cours > 0 && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
          <div>
            <p className="text-3xl font-black text-black">{countByStatus.en_cours}</p>
            <p className="text-xs text-slate-500 font-bold mt-1">En cours</p>
          </div>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-100">
          <p className="text-3xl font-black text-black">{countByStatus.a_venir}</p>
          <p className="text-xs text-slate-400 font-bold mt-1">À venir</p>
        </div>
        <div className="bg-slate-50 rounded-2xl p-4 border-2 border-slate-100">
          <p className="text-3xl font-black text-black">{countByStatus.passee}</p>
          <p className="text-xs text-slate-400 font-bold mt-1">Passées</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Planning */}
        <div className="xl:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-black text-base text-black">Planning semaine</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => setSemaine(d => addDays(d, -7))}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors">‹</button>
              <span className="text-xs font-bold text-slate-500 min-w-[100px] text-center">
                {format(addDays(lundi, 1), "d MMM", { locale: fr })} – {format(addDays(lundi, 4), "d MMM", { locale: fr })}
              </span>
              <button onClick={() => setSemaine(d => addDays(d, 7))}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold transition-colors">›</button>
            </div>
            <button onClick={() => onNouvelle()}
              className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors">
              + Réserver
            </button>
          </div>

          {/* Légende postes */}
          <div className="flex gap-2 flex-wrap">
            {POSTES.map(p => (
              <span key={p.id} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${POSTE_COLORS[p.id]}`}>
                {p.label}
              </span>
            ))}
          </div>

          {/* Jours */}
          <div className="flex flex-col gap-4">
            {joursOuverts.map(d => {
              const dow = getDay(d);
              const creneaux = CRENEAUX_PAR_JOUR[dow] ?? [];
              const dateStr = format(d, "yyyy-MM-dd");
              return (
                <div key={dateStr} className={`rounded-2xl border-2 overflow-hidden ${isToday(d) ? "border-black" : "border-slate-100"}`}>
                  <div className={`flex items-center justify-between px-4 py-2.5 ${isToday(d) ? "bg-black text-white" : "bg-slate-50 text-slate-700"}`}>
                    <span className="font-black text-sm capitalize">{format(d, "EEEE d MMMM", { locale: fr })}</span>
                    {isToday(d) && <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">Aujourd'hui</span>}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {creneaux.map(cr => (
                      <div key={cr} className="flex items-start gap-3 px-4 py-3">
                        <span className="text-xs font-black text-slate-400 w-16 pt-1 shrink-0">{cr}</span>
                        <div className="flex gap-2 flex-wrap flex-1">
                          {POSTES.map(p => {
                            const resa = getResaPoste(d, cr, p.id);
                            const jeu = resa ? jeux.find(j => j.id === resa.jeu_id) : null;
                            const jeu2 = resa?.jeu2_id ? jeux.find(j => j.id === resa.jeu2_id) : null;
                            if (resa) {
                              const ds = getDisplayStatus(resa);
                              const isEnCours = ds === "en_cours";
                              return (
                                <button key={p.id}
                                  onClick={() => onOpenDetail(resa)}
                                  className={`flex flex-col gap-0.5 px-2.5 py-2 rounded-xl border-2 min-w-[90px] max-w-[130px] text-left transition-all hover:brightness-95 ${
                                    isEnCours ? "ring-2 ring-green-400 ring-offset-1" : ""
                                  } ${POSTE_COLORS[p.id]}`}>
                                  <div className="flex items-center gap-1">
                                    {isEnCours && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />}
                                    <span className="text-[9px] font-black uppercase tracking-wide opacity-60">{p.label}</span>
                                  </div>
                                  {jeu2 ? (
                                    <span className="text-[11px] font-bold leading-tight truncate">
                                      {jeu?.titre ?? "?"} <span className="opacity-50">→</span> {jeu2.titre}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-bold leading-tight truncate">{jeu?.titre ?? "?"}</span>
                                  )}
                                  <span className="text-[10px] font-medium opacity-70 truncate">{resa.adherent_nom} · {resa.nb_joueurs}J</span>
                                </button>
                              );
                            }
                            return (
                              <button key={p.id}
                                onClick={() => onNouvelle(dateStr, cr, p.id)}
                                className="flex flex-col items-center justify-center gap-0.5 px-2.5 py-2 rounded-xl border-2 border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition-all min-w-[90px] text-slate-300 hover:text-slate-500">
                                <span className="text-[9px] font-black uppercase tracking-wide">{p.label}</span>
                                <span className="text-lg leading-none">+</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sidebar : top jeux + résa en cours / à venir */}
        <div className="flex flex-col gap-4">
          <h3 className="font-black text-base text-black">Jeux les + joués</h3>
          {stats.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium">Aucune donnée pour l'instant</p>
          ) : (
            <div className="flex flex-col gap-2">
              {stats.slice(0, 8).map((s, idx) => (
                <div key={s.jeu_id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-sm font-black text-slate-300 w-5 text-center">{idx + 1}</span>
                  <div className="w-8 h-8 rounded-lg overflow-hidden bg-slate-200 shrink-0">
                    {s.image_url
                      ? <img src={s.image_url} alt={s.titre} className="w-full h-full object-cover" />
                      : <span className="w-full h-full flex items-center justify-center text-sm">🎮</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-black truncate">{s.titre}</p>
                    <span className={`text-[9px] font-bold px-1 py-0.5 rounded border ${CONSOLE_COLORS[s.console]}`}>{s.console}</span>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-base font-black text-black">{s.nb_reservations}</span>
                    <span className="text-[9px] text-slate-400 font-medium">fois</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {enCoursResas.length > 0 && (
            <>
              <h3 className="font-black text-base text-black mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                En cours
              </h3>
              <div className="flex flex-col gap-2">
                {enCoursResas.map(r => {
                  const jeu = jeux.find(j => j.id === r.jeu_id);
                  const poste = POSTES.find(p => p.id === r.poste);
                  return (
                    <button key={r.id} onClick={() => onOpenDetail(r)}
                      className="flex items-center gap-3 p-3 bg-[#baff29]/20 rounded-xl border border-[#baff29]/40 text-left hover:bg-[#baff29]/30 transition-colors w-full">
                      <div className="flex flex-col items-center shrink-0 w-12">
                        <span className="text-[10px] font-black text-black">{format(parseISO(r.date_creneau), "d MMM", { locale: fr })}</span>
                        <span className="text-[9px] text-slate-500 font-medium">{r.creneau}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-black truncate">{jeu?.titre ?? "?"}</p>
                        <p className="text-[10px] text-slate-500">{r.adherent_nom} · {r.nb_joueurs}J · {poste?.label ?? r.poste}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <h3 className="font-black text-base text-black mt-2">À venir</h3>
          {aVenirResas.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium">Aucune réservation à venir</p>
          ) : (
            <div className="flex flex-col gap-2">
              {aVenirResas.slice(0, 8).map(r => {
                const jeu = jeux.find(j => j.id === r.jeu_id);
                const poste = POSTES.find(p => p.id === r.poste);
                return (
                  <button key={r.id} onClick={() => onOpenDetail(r)}
                    className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100 text-left hover:bg-slate-100 transition-colors w-full">
                    <div className="flex flex-col items-center shrink-0 w-12">
                      <span className="text-[10px] font-black text-black">{format(parseISO(r.date_creneau), "d MMM", { locale: fr })}</span>
                      <span className="text-[9px] text-slate-400 font-medium">{r.creneau}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-black truncate">{jeu?.titre ?? "?"}</p>
                      <p className="text-[10px] text-slate-400">{r.adherent_nom} · {r.nb_joueurs}J · {poste?.label ?? r.poste}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function JvPage() {
  const [onglet, setOnglet] = useState<"catalogue" | "selections" | "reservations">("catalogue");
  const [jeux, setJeux] = useState<JvJeu[]>([]);
  const [selections, setSelections] = useState<JvSelection[]>([]);
  const [reservations, setReservations] = useState<JvReservation[]>([]);
  const [rotationConfig, setRotationConfig] = useState<JvRotationConfig>({
    id: "main", current_slot_index: 0, week_start: format(new Date(), "yyyy-MM-dd"),
  });
  const [isLoading, setIsLoading] = useState(true);

  const [modalJeu, setModalJeu] = useState<{ open: boolean; jeu: JvJeu | null }>({ open: false, jeu: null });
  const [modalRotation, setModalRotation] = useState<SelectionSlot | null>(null);
  const [modalPlanning, setModalPlanning] = useState(false);
  const [modalResa, setModalResa] = useState<{ open: boolean; date?: string; creneau?: string; poste?: string }>({ open: false });
  const [modalResaDetail, setModalResaDetail] = useState<JvReservation | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const [{ data: j }, { data: s }, { data: r }, { data: cfg }] = await Promise.all([
        supabase.from("jv_jeux").select("*").order("titre"),
        supabase.from("jv_selections").select("*").order("groupe").order("ordre"),
        supabase.from("jv_reservations").select("*").order("date_creneau", { ascending: false }),
        supabase.from("jv_rotation_config").select("*").eq("id", "main").single(),
      ]);
      if (j) setJeux(j as JvJeu[]);
      if (s) setSelections(s as JvSelection[]);
      if (r) setReservations(r as JvReservation[]);
      if (cfg) setRotationConfig(cfg as JvRotationConfig);
      setIsLoading(false);
    };
    load();
  }, []);

  // ── Handlers catalogue ────────────────────────────────────────────────────

  const handleJeuSaved = useCallback((jeu: JvJeu) => {
    setJeux(prev => {
      const exists = prev.some(j => j.id === jeu.id);
      return exists ? prev.map(j => j.id === jeu.id ? jeu : j) : [...prev, jeu].sort((a, b) => a.titre.localeCompare(b.titre));
    });
  }, []);

  const handleJeuDeleted = useCallback((id: string) => {
    setJeux(prev => prev.filter(j => j.id !== id));
    setSelections(prev => prev.filter(s => s.jeu_id !== id));
  }, []);

  // ── Handlers sélections ───────────────────────────────────────────────────

  const handleToggleActif = useCallback(async (jeuId: string, slot: SelectionSlot, isPermanent: boolean, currentSel: JvSelection | undefined) => {
    if (currentSel) {
      await supabase.from("jv_selections").delete().eq("id", currentSel.id);
      setSelections(prev => {
        const next = prev.filter(s => s.id !== currentSel.id);
        if (!next.some(s => s.jeu_id === jeuId && s.statut === "actif")) {
          supabase.from("jv_jeux").update({ statut: "disponible" }).eq("id", jeuId);
          setJeux(j => j.map(x => x.id === jeuId ? { ...x, statut: "disponible" } : x));
        }
        return next;
      });
    } else {
      const { data } = await supabase.from("jv_selections").insert({
        jeu_id: jeuId, slot, console: SLOT_CONSOLE[slot],
        statut: "actif", permanent: isPermanent, groupe: 0, ordre: 0,
      }).select().single();
      if (data) setSelections(prev => [...prev, data as JvSelection]);
      await supabase.from("jv_jeux").update({ statut: "selection" }).eq("id", jeuId);
      setJeux(prev => prev.map(j => j.id === jeuId ? { ...j, statut: "selection" } : j));
    }
  }, []);

  // Ajoute un jeu à un groupe planifié spécifique
  const handleAddToGroup = useCallback(async (jeuId: string, slot: SelectionSlot, groupe: number) => {
    const groupSels = selections.filter(s => s.slot === slot && s.statut === "planifie" && s.groupe === groupe);
    if (groupSels.length >= 3) return;
    const ordre = groupSels.length + 1;
    const { data } = await supabase.from("jv_selections").insert({
      jeu_id: jeuId, slot, console: SLOT_CONSOLE[slot],
      statut: "planifie", permanent: false, groupe, ordre,
    }).select().single();
    if (data) setSelections(prev => [...prev, data as JvSelection]);
  }, [selections]);

  const handleRemoveSelection = useCallback(async (selId: string) => {
    await supabase.from("jv_selections").delete().eq("id", selId);
    setSelections(prev => prev.filter(s => s.id !== selId));
  }, []);

  // Échange les groupes fromGroupe et toGroupe (pour les boutons ▲/▼)
  const handleMoveGroup = useCallback(async (slot: SelectionSlot, fromGroupe: number, toGroupe: number) => {
    const TEMP = -9999;
    const fromIds = selections.filter(s => s.slot === slot && s.groupe === fromGroupe).map(s => s.id);
    const toIds = selections.filter(s => s.slot === slot && s.groupe === toGroupe).map(s => s.id);
    await Promise.all([
      ...fromIds.map(id => supabase.from("jv_selections").update({ groupe: TEMP }).eq("id", id)),
    ]);
    await Promise.all([
      ...toIds.map(id => supabase.from("jv_selections").update({ groupe: fromGroupe }).eq("id", id)),
    ]);
    await Promise.all([
      ...fromIds.map(id => supabase.from("jv_selections").update({ groupe: toGroupe }).eq("id", id)),
    ]);
    setSelections(prev => prev.map(s => {
      if (s.slot === slot && s.groupe === fromGroupe) return { ...s, groupe: toGroupe };
      if (s.slot === slot && s.groupe === toGroupe) return { ...s, groupe: fromGroupe };
      return s;
    }));
  }, [selections]);

  // Met à jour le point de départ de la rotation
  const handleUpdateRotationConfig = useCallback(async (slotIndex: number, weekStart: string) => {
    await supabase.from("jv_rotation_config")
      .update({ current_slot_index: slotIndex, week_start: weekStart })
      .eq("id", "main");
    setRotationConfig(prev => ({ ...prev, current_slot_index: slotIndex, week_start: weekStart }));
  }, []);

  // ── Handlers réservations ─────────────────────────────────────────────────

  const handleResaSaved = useCallback((r: JvReservation) => {
    setReservations(prev => [r, ...prev]);
  }, []);

  const handleResaUpdated = useCallback((r: JvReservation) => {
    setReservations(prev => prev.map(x => x.id === r.id ? r : x));
  }, []);

  const handleResaCancelled = useCallback((id: string) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, statut: "annulee" } : r));
  }, []);

  const totalJeux = jeux.length;
  const totalConsolesActives = new Set(jeux.map(j => j.console)).size;
  const totalResasVenir = reservations.filter(r => { const ds = getDisplayStatus(r); return ds === "a_venir" || ds === "en_cours"; }).length;

  return (
    <div className="min-h-screen bg-[#e5e5e5] flex flex-col items-center p-4 sm:p-8 gap-6">
      <style>{`
        .custom-scroll::-webkit-scrollbar{width:4px}
        .custom-scroll::-webkit-scrollbar-track{background:transparent}
        .custom-scroll::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:999px}
      `}</style>

      {/* Nav */}
      <header className="flex justify-between items-center w-full max-w-[96%] mx-auto shrink-0 relative">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <NavBar current="jv" />
        <div className="w-10" />
      </header>

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">

        {/* Titre + stats rapides */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-black text-black">Jeux Vidéo</h1>
            <p className="text-slate-400 font-medium mt-1">Catalogue, sélections par console et réservations</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex flex-col items-center px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xl font-black text-black">{totalJeux}</span>
              <span className="text-[10px] text-slate-400 font-bold">Jeux</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-xl font-black text-black">{totalConsolesActives}</span>
              <span className="text-[10px] text-slate-400 font-bold">Consoles</span>
            </div>
            <div className="flex flex-col items-center px-4 py-2 bg-[#baff29]/20 rounded-2xl border border-[#baff29]/40">
              <span className="text-xl font-black text-black">{totalResasVenir}</span>
              <span className="text-[10px] text-slate-500 font-bold">Résa à venir</span>
            </div>
          </div>
        </div>

        {/* Onglets */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-2xl w-fit">
          {([
            { key: "catalogue", label: "🗂 Catalogue" },
            { key: "selections", label: "⭐ Sélections" },
            { key: "reservations", label: "📅 Réservations" },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setOnglet(t.key)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                onglet === t.key ? "bg-white text-black shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-black rounded-full animate-spin" />
            <p className="text-slate-400 font-medium text-sm">Chargement…</p>
          </div>
        ) : (
          <>
            {onglet === "catalogue" && (
              <TabCatalogue
                jeux={jeux}
                onAdd={() => setModalJeu({ open: true, jeu: null })}
                onEdit={j => setModalJeu({ open: true, jeu: j })}
              />
            )}
            {onglet === "selections" && (
              <TabSelections
                jeux={jeux}
                selections={selections}
                onRotationOpen={slot => setModalRotation(slot)}
                onToggleActif={handleToggleActif}
                onPlanningOpen={() => setModalPlanning(true)}
              />
            )}
            {onglet === "reservations" && (
              <TabReservations
                jeux={jeux}
                reservations={reservations}
                onNouvelle={(date, creneau, poste) => setModalResa({ open: true, date, creneau, poste })}
                onOpenDetail={r => setModalResaDetail(r)}
              />
            )}
          </>
        )}
      </main>

      {/* Modals */}
      {modalJeu.open && (
        <ModalJeu
          jeu={modalJeu.jeu}
          onClose={() => setModalJeu({ open: false, jeu: null })}
          onSaved={handleJeuSaved}
          onDeleted={handleJeuDeleted}
        />
      )}
      {modalRotation && (
        <ModalRotation
          slot={modalRotation}
          selections={selections}
          jeux={jeux}
          onClose={() => setModalRotation(null)}
          onAddToGroup={(jeuId, groupe) => handleAddToGroup(jeuId, modalRotation, groupe)}
          onRemoveSelection={handleRemoveSelection}
          onMoveGroup={(fromG, toG) => handleMoveGroup(modalRotation, fromG, toG)}
        />
      )}
      {modalPlanning && (
        <ModalRotationPlanning
          selections={selections}
          jeux={jeux}
          rotationConfig={rotationConfig}
          onUpdateConfig={handleUpdateRotationConfig}
          onClose={() => setModalPlanning(false)}
        />
      )}
      {modalResa.open && (
        <ModalReservation
          jeux={jeux}
          selections={selections}
          preDate={modalResa.date}
          preCreneau={modalResa.creneau}
          prePoste={modalResa.poste}
          onClose={() => setModalResa({ open: false })}
          onSaved={handleResaSaved}
        />
      )}
      {modalResaDetail && (
        <ModalReservationDetail
          reservation={modalResaDetail}
          jeux={jeux}
          selections={selections}
          onClose={() => setModalResaDetail(null)}
          onSaved={handleResaUpdated}
          onCancelled={handleResaCancelled}
        />
      )}
    </div>
  );
}
