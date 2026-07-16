"use client";
import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
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
  config?: { extra_creneaux?: Record<string, string[]> };
};

type JoueurDetail = {
  nom: string;
  sexe: "H" | "F" | "N" | null;
  age: "11-16" | "16-18" | "18+" | "parent" | null;
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
  joueurs_details: JoueurDetail[] | null;
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
  Switch_Multi: true,
  Switch_Solo: true,
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

// Créneaux d'un jour donné = créneaux récurrents + créneaux exceptionnels ajoutés pour cette date précise
function getCreneauxJour(dateStr: string, extraCreneaux: Record<string, string[]> | undefined): string[] {
  const dow = getDay(parseISO(dateStr));
  const base = CRENEAUX_PAR_JOUR[dow] ?? [];
  const extra = extraCreneaux?.[dateStr] ?? [];
  return [...base, ...extra.filter(cr => !base.includes(cr))];
}

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
      const data = await res.json() as any;
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
        const data = await res.json() as any;
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
      const data = await res.json() as any;
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
    let savedJeu: JvJeu;
    if (isNew) {
      const res = await fetch('/api/jv-jeux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
      if (res.error) { alert("Erreur : " + res.error); setIsSaving(false); return; }
      savedJeu = { ...payload, id: res.id, created_at: new Date().toISOString() } as JvJeu;
    } else {
      const res = await fetch(`/api/jv-jeux/${jeu!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
      if (res.error) { alert("Erreur : " + res.error); setIsSaving(false); return; }
      savedJeu = { ...jeu!, ...payload } as JvJeu;
    }
    onSaved(savedJeu);
    setIsSaving(false);
    onClose();
  };

  const del = async () => {
    if (!jeu) return;
    setIsDeleting(true);
    await fetch(`/api/jv-jeux/${jeu.id}`, { method: 'DELETE' });
    onDeleted?.(jeu.id);
    setIsDeleting(false);
    onClose();
  };

  const CONSOLE_BG_M: Record<Console, string> = { PS5: 'var(--bleu)', Switch: 'var(--rouge)', PC: 'var(--cream2)' };
  const STATUS_BG_M: Record<string, string> = {
    disponible: 'var(--vert)', selection: '#baff29', maintenance: 'var(--orange)', retire: 'var(--rose)',
  };
  const headerBg = isNew
    ? (step === 1 ? 'var(--bleu)' : step === 2 ? 'var(--purple)' : 'var(--vert)')
    : (CONSOLE_BG_M[form.console ?? 'PS5'] ?? 'var(--cream2)');

  const Slabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginBottom: 5, display: 'block' };
  const Sbox: React.CSSProperties  = { background: 'var(--cream)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '8px 8px 0 var(--ink)', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)', overflow: 'hidden', marginBottom: 32 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={Sbox}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderBottom: '3px solid var(--ink)', background: headerBg, flexShrink: 0 }}>
          <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: 'var(--cream2)', border: '2.5px solid var(--ink)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '3px 3px 0 var(--ink)' }}>
            {form.image_url
              ? <img src={form.image_url} alt={form.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 24 }}>🎮</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc" style={{ fontSize: 20, textTransform: 'uppercase', lineHeight: 1.1 }}>
              {isNew ? "Ajouter un jeu vidéo" : (jeu?.titre ?? '—')}
            </div>
            {isNew && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6 }}>
                {([1, 2, 3] as const).map(s => (
                  <div key={s} style={{ height: 5, width: step >= s ? 24 : 14, borderRadius: 3, background: step >= s ? 'var(--ink)' : 'rgba(0,0,0,0.2)', transition: 'width .2s' }} />
                ))}
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.5)', marginLeft: 3 }}>
                  {step === 1 ? "Recherche" : step === 2 ? "Sélection" : "Détails"}
                </span>
              </div>
            )}
            {!isNew && (
              <span style={{ background: CONSOLE_BG_M[jeu!.console], border: '2px solid var(--ink)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, boxShadow: '2px 2px 0 var(--ink)', display: 'inline-block', marginTop: 5 }}>{jeu!.console}</span>
            )}
          </div>
          <button onClick={onClose}
            style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: 'pointer', flexShrink: 0, boxShadow: '2px 2px 0 rgba(0,0,0,0.3)' }}>✕</button>
        </div>

        {/* ── Step 1 : Recherche ─────────────────────────────────────────────── */}
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 8, padding: '16px 20px 10px', flexShrink: 0 }}>
              <div style={{ position: 'relative', flex: 1 }}>
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
                  className="pop-input" style={{ width: '100%' }} />
                {isSearching && (
                  <span className="spin" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid var(--cream2)', borderTopColor: 'var(--ink)', borderRadius: '50%', display: 'inline-block' }} />
                )}
              </div>
              <select value={consoleRecherche} onChange={e => setConsoleRecherche(e.target.value as Console | "")}
                className="pop-input" style={{ cursor: 'pointer' }}>
                <option value="">Toutes</option>
                {CONSOLES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button
                onClick={() => searchIgdb(titreRecherche, consoleRecherche)}
                disabled={!titreRecherche.trim() || isSearching}
                className="pop-btn pop-btn-dark" style={{ opacity: (!titreRecherche.trim() || isSearching) ? 0.4 : 1 }}>
                →
              </button>
            </div>

            {searchResults.length > 0 && (
              <div className="custom-scroll" style={{ overflowY: 'auto', padding: '0 20px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {searchResults.map(r => (
                  <button key={r.external_id} onClick={() => selectSearchResult(r)}
                    className="pop-card pop-card-hover"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--white)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                    <div style={{ width: 36, height: 48, borderRadius: 6, overflow: 'hidden', background: 'var(--cream2)', border: '2px solid var(--ink)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {r.image_url ? <img src={r.image_url} alt={r.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14 }}>🎮</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.titre}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                        {r.annee && <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>{r.annee}</span>}
                        {r.editeur && <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', maxWidth: 120 }}>{r.editeur}</span>}
                        {r.console && <span style={{ background: CONSOLE_BG_M[r.console], border: '1.5px solid var(--ink)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{r.console}</span>}
                      </div>
                    </div>
                    <span style={{ color: 'rgba(0,0,0,0.25)', fontSize: 18, flexShrink: 0 }}>›</span>
                  </button>
                ))}
              </div>
            )}

            {searchError && (
              <div style={{ margin: '0 20px 10px', padding: '10px 14px', background: 'var(--yellow)', border: '2px solid var(--ink)', borderRadius: 8, boxShadow: '2px 2px 0 var(--ink)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, flexShrink: 0 }}>⚠</span>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{searchError}</p>
              </div>
            )}

            <div style={{ padding: '10px 20px 14px', borderTop: '2px solid var(--cream2)', marginTop: 'auto', flexShrink: 0 }}>
              <button onClick={() => { setForm({ statut: "disponible", console: (consoleRecherche || "PS5") as Console }); setStep(3); }}
                style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.4)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                Saisir manuellement sans recherche →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 : Résultats ────────────────────────────────────────────── */}
        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <div style={{ padding: '12px 20px 8px', flexShrink: 0 }}>
              <button onClick={() => setStep(1)} className="pop-btn pop-btn-outline" style={{ fontSize: 12 }}>← Nouvelle recherche</button>
            </div>
            <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {searchResults.map(r => (
                <button key={r.external_id} onClick={() => selectSearchResult(r)}
                  className="pop-card pop-card-hover"
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--white)', cursor: 'pointer', width: '100%', textAlign: 'left' }}>
                  <div style={{ width: 48, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', border: '2px solid var(--ink)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {r.image_url ? <img src={r.image_url} alt={r.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 20 }}>🎮</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{r.titre}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                      {r.annee && <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>{r.annee}</span>}
                      {r.editeur && <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)' }}>{r.editeur}</span>}
                      {r.genre && <span style={{ background: 'var(--cream2)', border: '1.5px solid rgba(0,0,0,0.15)', borderRadius: 20, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{r.genre}</span>}
                      {r.pegi && <span style={{ background: 'var(--yellow)', border: '1.5px solid var(--ink)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>PEGI {r.pegi}</span>}
                      {r.console && <span style={{ background: CONSOLE_BG_M[r.console], border: '1.5px solid var(--ink)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{r.console}</span>}
                    </div>
                    {r.description && <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', marginTop: 4, overflow: 'hidden', maxHeight: '2.4em', lineHeight: '1.2em' }}>{r.description}</p>}
                  </div>
                  <span style={{ color: 'rgba(0,0,0,0.25)', fontSize: 18, flexShrink: 0 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3 : Formulaire ────────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>

              <div>
                <label style={Slabel}>Titre *</label>
                <input type="text" value={form.titre ?? ""} onChange={e => set("titre", e.target.value)}
                  placeholder="Nom du jeu…" className="pop-input" style={{ width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={Slabel}>Console *</label>
                  <select value={form.console ?? "PS5"} onChange={e => set("console", e.target.value as Console)}
                    className="pop-input" style={{ width: '100%', cursor: 'pointer' }}>
                    {CONSOLES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={Slabel}>Genre</label>
                  <input type="text" value={form.genre ?? ""} onChange={e => set("genre", e.target.value || null)}
                    placeholder="Action, RPG…" className="pop-input" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div>
                  <label style={Slabel}>Année</label>
                  <input type="number" value={form.annee ?? ""} onChange={e => set("annee", e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="2024" className="pop-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={Slabel}>PEGI</label>
                  <select value={form.pegi ?? ""} onChange={e => set("pegi", e.target.value ? parseInt(e.target.value) : null)}
                    className="pop-input" style={{ width: '100%', cursor: 'pointer' }}>
                    <option value="">—</option>
                    {[3, 7, 12, 16, 18].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label style={Slabel}>Joueurs</label>
                  <input type="text" value={form.nb_joueurs ?? ""} onChange={e => set("nb_joueurs", e.target.value || null)}
                    placeholder="1-4" className="pop-input" style={{ width: '100%' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={Slabel}>Éditeur</label>
                  <input type="text" value={form.editeur ?? ""} onChange={e => set("editeur", e.target.value || null)}
                    placeholder="Nintendo, Sony…" className="pop-input" style={{ width: '100%' }} />
                </div>
                <div>
                  <label style={Slabel}>Cote Syracuse</label>
                  <input type="text" value={form.cote_syracuse ?? ""} onChange={e => set("cote_syracuse", e.target.value || null)}
                    placeholder="ex. JV-PS5-042" className="pop-input" style={{ width: '100%' }} />
                </div>
              </div>

              <div>
                <label style={Slabel}>Image</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {form.image_url && (
                    <div style={{ width: 44, height: 60, borderRadius: 6, overflow: 'hidden', border: '2px solid var(--ink)', flexShrink: 0 }}>
                      <img src={form.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                  )}
                  <input type="text" value={form.image_url ?? ""} onChange={e => set("image_url", e.target.value || null)}
                    placeholder="https://… (auto-rempli par la recherche)"
                    className="pop-input" style={{ flex: 1 }} />
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                  <label style={{ ...Slabel, marginBottom: 0 }}>Description</label>
                  {isFetchingDesc && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.35)' }}>
                      <span className="spin" style={{ width: 10, height: 10, border: '1.5px solid var(--cream2)', borderTopColor: 'var(--ink)', borderRadius: '50%', display: 'inline-block' }} />
                      Récupération FR…
                    </span>
                  )}
                </div>
                <textarea value={form.description ?? ""} onChange={e => set("description", e.target.value || null)}
                  rows={3} placeholder="Synopsis, ambiance du jeu…"
                  className="pop-input" style={{ width: '100%', resize: 'none', fontFamily: 'inherit' }} />
              </div>

              <div>
                <label style={Slabel}>Statut</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {(["disponible", "selection", "maintenance", "retire"] as const).map(s => (
                    <button key={s} onClick={() => set("statut", s)}
                      style={{
                        background: form.statut === s ? (STATUS_BG_M[s] ?? 'var(--cream2)') : 'var(--white)',
                        border: '2.5px solid var(--ink)', borderRadius: 8, padding: '5px 14px',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
                        boxShadow: form.statut === s ? '3px 3px 0 var(--ink)' : 'none',
                        transition: 'background .12s, box-shadow .12s',
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {form.igdb_id && (
                <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)', fontWeight: 600 }}>IGDB #{form.igdb_id}</p>
              )}
            </div>

            <div style={{ display: 'flex', gap: 10, padding: '14px 20px', borderTop: '3px solid var(--ink)', background: 'var(--cream2)', flexShrink: 0 }}>
              {!isNew && (
                confirmDelete ? (
                  <button onClick={del} disabled={isDeleting}
                    className="pop-btn" style={{ background: 'var(--rouge)', opacity: isDeleting ? 0.5 : 1 }}>
                    {isDeleting ? "Suppression…" : "Confirmer"}
                  </button>
                ) : (
                  <button onClick={() => setConfirmDelete(true)}
                    className="pop-btn" style={{ color: 'var(--rouge)' }}>
                    Supprimer
                  </button>
                )
              )}
              {isNew && step === 3 && (
                <button onClick={() => setStep(1)} className="pop-btn pop-btn-outline">← Retour</button>
              )}
              <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: 'center' }}>Annuler</button>
              <button onClick={save} disabled={isSaving || !form.titre?.trim()}
                className="pop-btn pop-btn-dark" style={{ flex: 1, justifyContent: 'center', opacity: (isSaving || !form.titre?.trim()) ? 0.5 : 1 }}>
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
  reservations,
  onClose,
  onAddToGroup,
  onRemoveSelection,
  onMoveGroup,
}: {
  slot: SelectionSlot;
  selections: JvSelection[];
  jeux: JvJeu[];
  reservations: JvReservation[];
  onClose: () => void;
  onAddToGroup: (jeuId: string, groupe: number) => void;
  onRemoveSelection: (selId: string) => void;
  onMoveGroup: (fromGroupe: number, toGroupe: number) => void;
}) {
  const consoleName = SLOT_CONSOLE[slot];
  const [pickerGroupe, setPickerGroupe] = useState<number | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  const pickerRef = useRef<HTMLInputElement>(null);

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

  const openPicker = (groupe: number) => {
    setPickerGroupe(groupe);
    setPickerSearch("");
    setPickerSelected([]);
    setTimeout(() => pickerRef.current?.focus(), 50);
  };

  const closePicker = () => { setPickerGroupe(null); setPickerSearch(""); setPickerSelected([]); };

  const confirmPicker = () => {
    if (pickerGroupe === null) return;
    pickerSelected.forEach(id => onAddToGroup(id, pickerGroupe));
    closePicker();
  };

  const pickerGames = pickerGroupe !== null
    ? disponibles.filter(j => {
        const inGroup = planifiees.filter(s => s.groupe === pickerGroupe).some(s => s.jeu_id === j.id);
        if (inGroup) return false;
        const q = normalizeStr(pickerSearch);
        return q === "" || normalizeStr(j.titre).includes(q);
      })
    : [];

  const CONSOLE_BG_R: Record<string, string> = { PS5: 'var(--bleu)', Switch: 'var(--rouge)', PC: 'var(--cream2)' };
  const headerBgR = CONSOLE_BG_R[consoleName] ?? 'var(--cream2)';

  const selectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    selections.forEach(s => { counts[s.jeu_id] = (counts[s.jeu_id] || 0) + 1; });
    return counts;
  }, [selections]);

  const resaCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    reservations.filter(r => r.statut !== "annulee").forEach(r => {
      counts[r.jeu_id] = (counts[r.jeu_id] || 0) + 1;
      if (r.jeu2_id) counts[r.jeu2_id] = (counts[r.jeu2_id] || 0) + 1;
    });
    return counts;
  }, [reservations]);

  const popularityRank = useMemo(() => {
    const byConsole: Record<string, { id: string; count: number }[]> = {};
    jeux.forEach(j => {
      if (!byConsole[j.console]) byConsole[j.console] = [];
      byConsole[j.console].push({ id: j.id, count: resaCounts[j.id] || 0 });
    });
    const ranks: Record<string, { rank: number; total: number }> = {};
    Object.values(byConsole).forEach(list => {
      const sorted = [...list].sort((a, b) => b.count - a.count);
      sorted.forEach((item, i) => { ranks[item.id] = { rank: i + 1, total: sorted.length }; });
    });
    return ranks;
  }, [jeux, resaCounts]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: 'var(--cream)', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)', overflow: 'hidden', marginBottom: 32, position: 'relative' }}>

        {/* Header */}
        <div style={{ background: headerBgR, padding: '20px 24px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 className="bc" style={{ fontSize: 26, color: 'var(--ink)', margin: 0, lineHeight: 1 }}>
              File d&apos;attente — {SLOT_LABEL[slot]}
            </h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>
              Groupes de 3 jeux · chaque groupe = une rotation
            </p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>

          {groupNums.length === 0 && (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', textAlign: 'center', padding: '24px 0', fontWeight: 600 }}>
              Aucun groupe planifié — créez le premier ci-dessous
            </p>
          )}

          {groupNums.map((g, gIdx) => {
            const games = planifiees.filter(s => s.groupe === g);

            return (
              <div key={g} className="pop-card" style={{ background: 'var(--cream2)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* En-tête groupe */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.45)' }}>
                    Groupe {gIdx + 1}
                    <span style={{ fontWeight: 500, marginLeft: 6, color: 'rgba(0,0,0,0.3)' }}>({games.length}/3)</span>
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {gIdx > 0 && (
                      <button onClick={() => onMoveGroup(g, groupNums[gIdx - 1])}
                        style={{ width: 24, height: 24, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▲</button>
                    )}
                    {gIdx < groupNums.length - 1 && (
                      <button onClick={() => onMoveGroup(g, groupNums[gIdx + 1])}
                        style={{ width: 24, height: 24, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--white)', cursor: 'pointer', fontSize: 10, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>▼</button>
                    )}
                  </div>
                </div>

                {/* Jeux du groupe */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {games.map(sel => {
                    const jeu = jeux.find(j => j.id === sel.jeu_id);
                    if (!jeu) return null;
                    return (
                      <div key={sel.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {jeu.image_url
                            ? <img src={jeu.image_url} alt={jeu.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 16 }}>🎮</span>}
                        </div>
                        <p style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeu.titre}</p>
                        <button onClick={() => onRemoveSelection(sel.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 14, color: 'var(--rouge)', flexShrink: 0 }}>✕</button>
                      </div>
                    );
                  })}

                  {games.length < 3 && (
                    <button onClick={() => openPicker(g)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', border: '2.5px dashed var(--ink)', borderRadius: 10, background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'rgba(0,0,0,0.45)' }}>
                      + Jeu {games.length + 1}/3
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Nouveau groupe */}
          {disponibles.length > 0 && (
            <button onClick={() => openPicker(nextGroupe)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px', border: '2.5px dashed var(--ink)', borderRadius: 12, background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: 'rgba(0,0,0,0.45)' }}>
              + Nouveau groupe
            </button>
          )}
        </div>

        <div style={{ padding: '16px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <button onClick={onClose} className="pop-btn pop-btn-dark" style={{ width: '100%' }}>
            Fermer
          </button>
        </div>

        {/* Picker overlay */}
        {pickerGroupe !== null && (() => {
          const existingInGroup = planifiees.filter(s => s.groupe === pickerGroupe).length;
          const slotsLeft = 3 - existingInGroup - pickerSelected.length;
          const groupLabel = groupNums.indexOf(pickerGroupe) >= 0 ? groupNums.indexOf(pickerGroupe) + 1 : groupNums.length + 1;
          return (
            <div style={{ position: 'absolute', inset: 0, background: 'var(--cream)', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
                <button onClick={closePicker}
                  style={{ width: 32, height: 32, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>←</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 900, fontSize: 14, color: 'var(--ink)', margin: 0 }}>Groupe {groupLabel}</p>
                  <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', margin: 0 }}>
                    {pickerSelected.length > 0
                      ? `${pickerSelected.length} sélectionné${pickerSelected.length > 1 ? "s" : ""} · ${slotsLeft} place${slotsLeft > 1 ? "s" : ""} restante${slotsLeft > 1 ? "s" : ""}`
                      : `${consoleName} · choisir jusqu'à ${slotsLeft} jeu${slotsLeft > 1 ? "x" : ""}`}
                  </p>
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
                <input
                  ref={pickerRef}
                  type="text"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="Rechercher un jeu…"
                  className="pop-input" style={{ width: '100%' }}
                />
              </div>
              <div className="flex-1 overflow-y-auto custom-scroll p-4">
                {pickerGames.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', textAlign: 'center', padding: '32px 0', fontWeight: 600 }}>Aucun jeu disponible</p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {pickerGames.map(j => {
                      const isSelected = pickerSelected.includes(j.id);
                      const isDisabled = !isSelected && slotsLeft === 0;
                      return (
                        <button key={j.id}
                          disabled={isDisabled}
                          onClick={() => setPickerSelected(prev =>
                            prev.includes(j.id) ? prev.filter(id => id !== j.id) : [...prev, j.id]
                          )}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8,
                            border: isSelected ? '2.5px solid var(--ink)' : '2px solid var(--cream2)',
                            borderRadius: 12, background: isSelected ? 'var(--yellow)' : 'var(--white)',
                            cursor: isDisabled ? 'not-allowed' : 'pointer', opacity: isDisabled ? 0.4 : 1,
                            position: 'relative', textAlign: 'left',
                            boxShadow: isSelected ? '3px 3px 0 var(--ink)' : 'none',
                          }}>
                          {isSelected && (
                            <span style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, background: 'var(--ink)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--white)', fontSize: 9, fontWeight: 900, zIndex: 10 }}>✓</span>
                          )}
                          <div style={{ width: '100%', aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--cream2)' }}>
                            {j.image_url
                              ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <span style={{ fontSize: 24 }}>🎮</span>}
                          </div>
                          <p style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', lineHeight: 1.2, overflow: 'hidden', maxHeight: '2.4em', width: '100%' }}>{j.titre}</p>
                          {/* Info pills */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 3, width: '100%', marginTop: 2 }}>
                            <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: 'var(--cream2)', color: 'rgba(0,0,0,0.5)', lineHeight: 1 }}>
                              {(selectionCounts[j.id] || 0) === 0 ? "Inédit" : `${selectionCounts[j.id]}× sél.`}
                            </span>
                            {(() => {
                              const pop = popularityRank[j.id];
                              const count = resaCounts[j.id] || 0;
                              if (!pop || count === 0) return <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: 'var(--cream2)', color: 'rgba(0,0,0,0.4)', lineHeight: 1 }}>0 rés.</span>;
                              const pct = pop.rank / pop.total;
                              const bg = pct <= 0.2 ? 'var(--orange)' : pct <= 0.5 ? 'var(--yellow)' : 'var(--cream2)';
                              const icon = pct <= 0.2 ? "🔥" : pct <= 0.5 ? "⭐" : "";
                              return <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: bg, color: 'var(--ink)', lineHeight: 1 }}>{icon}{icon ? " " : ""}{count} rés.</span>;
                            })()}
                            {j.pegi ? (() => {
                              const bg = j.pegi <= 7 ? 'var(--vert)' : j.pegi <= 12 ? 'var(--yellow)' : j.pegi <= 16 ? 'var(--orange)' : 'var(--rouge)';
                              return <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: bg, color: 'var(--ink)', lineHeight: 1, border: '1px solid var(--ink)' }}>PEGI {j.pegi}</span>;
                            })() : <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 999, background: 'var(--cream2)', color: 'rgba(0,0,0,0.3)', lineHeight: 1 }}>PEGI ?</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div style={{ padding: '14px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0 }}>
                <button
                  onClick={confirmPicker}
                  disabled={pickerSelected.length === 0}
                  className="pop-btn pop-btn-dark"
                  style={{ width: '100%', opacity: pickerSelected.length === 0 ? 0.35 : 1, cursor: pickerSelected.length === 0 ? 'not-allowed' : 'pointer' }}>
                  {pickerSelected.length === 0
                    ? "Sélectionner des jeux"
                    : `Ajouter ${pickerSelected.length} jeu${pickerSelected.length > 1 ? "x" : ""} au groupe`}
                </button>
              </div>
            </div>
          );
        })()}
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
  onApplyRotation,
  onClose,
}: {
  selections: JvSelection[];
  jeux: JvJeu[];
  rotationConfig: JvRotationConfig;
  onUpdateConfig: (slotIndex: number, weekStart: string) => void;
  onApplyRotation: () => Promise<void>;
  onClose: () => void;
}) {
  const [slotIndex, setSlotIndex] = useState(rotationConfig.current_slot_index);
  const [weekStart, setWeekStart] = useState(rotationConfig.week_start);
  const [isApplying, setIsApplying] = useState(false);

  const handleApply = async () => {
    setIsApplying(true);
    await onApplyRotation();
    setIsApplying(false);
  };

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: 'var(--cream)', width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginBottom: 32 }}>

        {/* Header */}
        <div style={{ background: 'var(--purple)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 className="bc" style={{ fontSize: 26, color: 'var(--ink)', margin: 0, lineHeight: 1 }}>Planning de rotation</h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>Vue globale des changements de sélection semaine par semaine</p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        {/* Config point de départ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', background: 'var(--cream2)', borderBottom: '2.5px solid var(--ink)', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.45)', flexShrink: 0 }}>Point de départ</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
            {ROTATION_ORDER.map((s2, idx) => (
              <button key={s2} onClick={() => setSlotIndex(idx)}
                className={slotIndex === idx ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                style={{ fontSize: 11, padding: '5px 12px' }}>
                {SLOT_LABEL[s2]}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 600, flexShrink: 0 }}>Semaine du</span>
            <input type="date" value={weekStart} onChange={e => setWeekStart(e.target.value)}
              className="pop-input" style={{ padding: '6px 10px', fontSize: 12 }} />
          </div>
          {hasChanges && (
            <button onClick={() => onUpdateConfig(slotIndex, weekStart)}
              className="pop-btn pop-btn-dark" style={{ fontSize: 11, padding: '6px 14px' }}>
              Enregistrer
            </button>
          )}
        </div>

        {/* Prochaine rotation — action principale */}
        {(() => {
          const currentSlot = ROTATION_ORDER[rotationConfig.current_slot_index];
          const nextSlotVal = ROTATION_ORDER[(rotationConfig.current_slot_index + 1) % 4];
          const planifiedForNext = selections
            .filter(s => s.slot === nextSlotVal && s.statut === "planifie")
            .sort((a, b) => a.groupe - b.groupe || a.ordre - b.ordre);
          const firstNextGroupe = planifiedForNext.length > 0 ? planifiedForNext[0].groupe : null;
          const nextGroupGames = (firstNextGroupe !== null
            ? planifiedForNext.filter(s => s.groupe === firstNextGroupe)
            : []
          ).map(s => jeux.find(j => j.id === s.jeu_id)).filter(Boolean) as JvJeu[];

          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: '#baff2920', borderBottom: '2.5px solid var(--ink)', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, flexWrap: 'wrap', minWidth: 0 }}>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', flexShrink: 0 }}>Appliquer la rotation</span>
                <span className="pop-sticker" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--cream2)' }}>
                  {SLOT_LABEL[currentSlot]}
                </span>
                <span style={{ fontWeight: 900, fontSize: 14, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>→</span>
                <span className="pop-sticker" style={{ fontSize: 11, padding: '3px 10px', background: '#baff29' }}>
                  {SLOT_LABEL[nextSlotVal]}
                </span>
                {nextGroupGames.length > 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {nextGroupGames.map(j => (
                      <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)' }}>
                          {j.image_url
                            ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>🎮</span>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.titre}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', fontStyle: 'italic' }}>aucun jeu planifié</span>
                )}
              </div>
              <button
                onClick={handleApply}
                disabled={isApplying}
                className="pop-btn pop-btn-dark"
                style={{ flexShrink: 0, opacity: isApplying ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {isApplying ? (
                  <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }} />En cours…</>
                ) : (
                  <>🔄 Valider</>
                )}
              </button>
            </div>
          );
        })()}

        {/* Tableau planning */}
        <div className="custom-scroll" style={{ overflowY: 'auto', maxHeight: '50vh' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--cream)', borderBottom: '2.5px solid var(--ink)', zIndex: 1 }}>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 20px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.4)', width: 110 }}>Semaine</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.4)', width: 120 }}>Console</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.4)' }}>Jeux</th>
              </tr>
            </thead>
            <tbody>
              {planning.map(({ weekOffset, slot: pSlot, date: pDate, games, isActive }) => (
                <tr key={weekOffset} style={{ background: isActive ? '#baff2920' : 'transparent', borderBottom: '1.5px solid var(--cream2)' }}>
                  <td style={{ padding: '10px 20px' }}>
                    <p style={{ fontSize: 12, fontWeight: 900, color: isActive ? 'var(--ink)' : 'rgba(0,0,0,0.4)', margin: 0 }}>
                      {isActive ? "Cette sem." : `Sem. +${weekOffset}`}
                    </p>
                    <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', margin: 0 }}>{format(pDate, "d MMM", { locale: fr })}</p>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span className="pop-sticker" style={{ fontSize: 10, padding: '3px 8px', background: isActive ? '#baff29' : 'var(--cream2)' }}>
                      {SLOT_LABEL[pSlot]}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {games.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.25)', fontStyle: 'italic' }}>— non planifié</span>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        {games.map(j => (
                          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)' }}>
                              {j.image_url
                                ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <span style={{ fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>🎮</span>}
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 700 }}>{j.titre}</span>
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

        <div style={{ padding: '16px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <button onClick={onClose} className="pop-btn pop-btn-dark" style={{ width: '100%' }}>
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
  extraCreneaux,
  onClose,
  onSaved,
}: {
  jeux: JvJeu[];
  selections: JvSelection[];
  preDate?: string;
  preCreneau?: string;
  prePoste?: string;
  extraCreneaux?: Record<string, string[]>;
  onClose: () => void;
  onSaved: (r: JvReservation) => void;
}) {
  const [posteId, setPosteId] = useState(prePoste ?? "ps5");
  const [date, setDate] = useState(preDate ?? nextOpenDay());
  const [creneau, setCreneau] = useState("");
  const [jeuId, setJeuId] = useState("");
  const [nbJoueurs, setNbJoueurs] = useState(1);
  const [joueurs, setJoueurs] = useState<JoueurDetail[]>([{ nom: "", sexe: null, age: null }]);
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const poste = POSTES.find(p => p.id === posteId)!;
  const slot = POSTE_SLOT[posteId];
  const dayOfWeek = getDay(parseISO(date));
  const creneauxDispo = getCreneauxJour(date, extraCreneaux);
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

  // Reset jeu + joueurs quand le poste change
  useEffect(() => { setJeuId(""); setNbJoueurs(1); setJoueurs([{ nom: "", sexe: null, age: null }]); }, [posteId]);

  // Ajuste le tableau joueurs quand nbJoueurs change
  useEffect(() => {
    setJoueurs(prev => {
      if (nbJoueurs > prev.length)
        return [...prev, ...Array.from({ length: nbJoueurs - prev.length }, () => ({ nom: "", sexe: null, age: null } as JoueurDetail))];
      return prev.slice(0, nbJoueurs);
    });
  }, [nbJoueurs]);

  const updateJoueur = (i: number, patch: Partial<JoueurDetail>) =>
    setJoueurs(prev => prev.map((j, idx) => idx === i ? { ...j, ...patch } : j));

  const save = async () => {
    const nomPrincipal = joueurs[0]?.nom.trim() ?? "";
    if (!jeuId || !nomPrincipal || !creneau || !isJourOuvert || !posteId) return;
    setIsSaving(true);
    const payload = {
      jeu_id: jeuId, poste: posteId, date_creneau: date, creneau,
      adherent_nom: nomPrincipal, nb_joueurs: nbJoueurs,
      joueurs_details: JSON.stringify(joueurs),
      notes: notes.trim() || null, statut: "confirmee",
    };
    const res = await fetch('/api/jv-reservations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
    if (res.error) { alert("Erreur : " + res.error); setIsSaving(false); return; }
    onSaved({ ...payload, id: res.id, jeu2_id: null, joueurs_details: joueurs, created_at: new Date().toISOString() } as JvReservation);
    setIsSaving(false);
    onClose();
  };

  const Slabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginBottom: 5, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: 'var(--cream)', width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)', overflow: 'hidden', marginBottom: 32 }}>

        {/* Header */}
        <div style={{ background: 'var(--vert)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 className="bc" style={{ fontSize: 26, color: 'var(--ink)', margin: 0, lineHeight: 1 }}>Nouvelle réservation</h2>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Poste */}
          <div>
            <label style={Slabel}>Poste *</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {POSTES.map(p => (
                <button key={p.id} onClick={() => setPosteId(p.id)}
                  className={posteId === p.id ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                  style={{ fontSize: 12, padding: '7px 14px' }}>
                  {p.label}
                </button>
              ))}
            </div>
            {poste.multiOnly && (
              <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', marginTop: 5, fontWeight: 600 }}>Affiche uniquement les jeux multijoueur de la sélection</p>
            )}
          </div>

          {/* Date + créneau */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={Slabel}>Date *</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="pop-input"
                style={{ width: '100%', background: isJourOuvert ? undefined : 'var(--rose)', borderColor: isJourOuvert ? undefined : 'var(--ink)' }} />
              {!isJourOuvert && <p style={{ fontSize: 10, color: 'var(--rouge)', marginTop: 4, fontWeight: 700 }}>Ouvert Mar · Mer · Jeu · Ven uniquement</p>}
            </div>
            <div>
              <label style={Slabel}>Créneau *</label>
              {creneauxDispo.length > 0 ? (
                <select value={creneau} onChange={e => setCreneau(e.target.value)}
                  className="pop-input" style={{ width: '100%', cursor: 'pointer' }}>
                  {creneauxDispo.map(cr => <option key={cr} value={cr}>{cr}</option>)}
                </select>
              ) : (
                <div className="pop-input" style={{ color: 'rgba(0,0,0,0.3)' }}>—</div>
              )}
            </div>
          </div>

          {/* Jeu */}
          <div>
            <label style={Slabel}>Jeu (sélection active) *</label>
            {jeuxDispo.length === 0 ? (
              <div style={{ background: 'var(--yellow)', border: '2.5px solid var(--ink)', borderRadius: 10, padding: '12px 14px', fontSize: 13, fontWeight: 600, boxShadow: '2px 2px 0 var(--ink)' }}>
                Aucun jeu en sélection active pour ce poste
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {jeuxDispo.map(({ sel, jeu: j }) => (
                  <button key={j.id} onClick={() => setJeuId(j.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', textAlign: 'left',
                      border: jeuId === j.id ? '2.5px solid var(--ink)' : '2px solid var(--cream2)',
                      borderRadius: 12, background: jeuId === j.id ? 'var(--yellow)' : 'var(--white)',
                      cursor: 'pointer', boxShadow: jeuId === j.id ? '3px 3px 0 var(--ink)' : 'none',
                    }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {j.image_url
                        ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <span style={{ fontSize: 18 }}>🎮</span>}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{j.titre}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 3 }}>
                        {j.nb_joueurs && <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>👥 {j.nb_joueurs}</span>}
                        {j.genre && <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.45)' }}>{j.genre}</span>}
                        {sel.permanent && (
                          <span style={{ fontSize: 10, background: 'var(--orange)', border: '1.5px solid var(--ink)', borderRadius: 5, padding: '1px 5px', fontWeight: 700 }}>Permanent</span>
                        )}
                      </div>
                    </div>
                    {jeuId === j.id && <span style={{ fontWeight: 900, fontSize: 16, flexShrink: 0 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Nb joueurs */}
          <div>
            <label style={Slabel}>Nb joueurs (max {poste.maxJoueurs})</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: poste.maxJoueurs }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setNbJoueurs(n)}
                  className={nbJoueurs === n ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Adhérents — un bloc par joueur */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={Slabel}>Adhérent{nbJoueurs > 1 ? "s" : ""} *</label>
            {joueurs.map((jj, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, background: 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 12 }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', margin: 0 }}>
                  {i === 0 ? "1er joueur" : `${i + 1}e joueur`}
                </p>
                <input type="text" value={jj.nom} onChange={e => updateJoueur(i, { nom: e.target.value })}
                  placeholder="Prénom NOM…" autoFocus={i === 0}
                  className="pop-input" style={{ width: '100%', background: 'var(--white)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', width: 30, flexShrink: 0 }}>Sexe</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(["H", "F", "N"] as const).map(s => (
                      <button key={s} onClick={() => updateJoueur(i, { sexe: jj.sexe === s ? null : s })}
                        className={jj.sexe === s ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                        style={{ fontSize: 11, padding: '4px 12px' }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', width: 30, flexShrink: 0 }}>Âge</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([
                      { val: "11-16", label: "11-16" }, { val: "16-18", label: "16-18" },
                      { val: "18+", label: "18+" }, { val: "parent", label: "Parent" },
                    ] as const).map(({ val, label }) => (
                      <button key={val} onClick={() => updateJoueur(i, { age: jj.age === val ? null : val })}
                        className={jj.age === val ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                        style={{ fontSize: 11, padding: '4px 10px' }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label style={Slabel}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Remarques optionnelles…"
              className="pop-input" style={{ width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0, background: 'var(--cream2)' }}>
          <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
            Annuler
          </button>
          <button onClick={save} disabled={isSaving || !jeuId || !joueurs[0]?.nom.trim() || !creneau || !isJourOuvert}
            className="pop-btn pop-btn-dark"
            style={{ flex: 1, justifyContent: 'center', opacity: (isSaving || !jeuId || !joueurs[0]?.nom.trim() || !creneau || !isJourOuvert) ? 0.4 : 1, cursor: (isSaving || !jeuId || !joueurs[0]?.nom.trim() || !creneau || !isJourOuvert) ? 'not-allowed' : 'pointer' }}>
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
  const [nbJoueurs, setNbJoueurs] = useState(reservation.nb_joueurs);
  const [joueurs, setJoueurs] = useState<JoueurDetail[]>(() => {
    if (reservation.joueurs_details && reservation.joueurs_details.length > 0) return reservation.joueurs_details;
    return Array.from({ length: reservation.nb_joueurs }, (_, i) => ({
      nom: i === 0 ? reservation.adherent_nom : "", sexe: null, age: null,
    } as JoueurDetail));
  });
  const [notes, setNotes] = useState(reservation.notes ?? "");
  const [jeuId, setJeuId] = useState(reservation.jeu_id);
  const [jeu2Id, setJeu2Id] = useState<string | null>(reservation.jeu2_id ?? null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  useEffect(() => {
    setJoueurs(prev => {
      if (nbJoueurs > prev.length)
        return [...prev, ...Array.from({ length: nbJoueurs - prev.length }, () => ({ nom: "", sexe: null, age: null } as JoueurDetail))];
      return prev.slice(0, nbJoueurs);
    });
  }, [nbJoueurs]);

  const updateJoueur = (i: number, patch: Partial<JoueurDetail>) =>
    setJoueurs(prev => prev.map((j, idx) => idx === i ? { ...j, ...patch } : j));

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
    const nomPrincipal = joueurs[0]?.nom.trim() ?? "";
    if (!nomPrincipal) return;
    setIsSaving(true);
    const patch = { adherent_nom: nomPrincipal, nb_joueurs: nbJoueurs, joueurs_details: JSON.stringify(joueurs), notes: notes.trim() || null, jeu_id: jeuId, jeu2_id: jeu2Id };
    const res = await fetch(`/api/jv-reservations/${reservation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
    if (res.error) { alert("Erreur : " + res.error); setIsSaving(false); return; }
    onSaved({ ...reservation, ...patch, joueurs_details: joueurs } as JvReservation);
    setIsSaving(false);
    onClose();
  };

  const cancel = async () => {
    await fetch(`/api/jv-reservations/${reservation.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut: "annulee" }),
    });
    onCancelled(reservation.id);
    onClose();
  };

  const SlabelD: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginBottom: 5, display: 'block' };
  const DS_BG: Record<DisplayStatus, string> = { a_venir: 'var(--cream2)', en_cours: '#baff29', passee: 'var(--cream2)', annulee: 'var(--rose)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: 'var(--cream)', width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)', overflow: 'hidden', marginBottom: 32 }}>

        {/* Header */}
        <div style={{ background: DS_BG[displayStatus], padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="bc" style={{ fontSize: 22, color: 'var(--ink)', margin: 0, lineHeight: 1, textTransform: 'capitalize' }}>
              {format(parseISO(reservation.date_creneau), "EEEE d MMMM", { locale: fr })}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
              <span className="pop-sticker" style={{ fontSize: 11, padding: '3px 10px', background: 'var(--white)' }}>{poste?.label ?? reservation.poste}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.5)' }}>{reservation.creneau}</span>
              <span className="pop-sticker" style={{ fontSize: 10, padding: '3px 8px', background: 'var(--white)', display: 'flex', alignItems: 'center', gap: 4 }}>
                {displayStatus === "en_cours" && <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--vert)', display: 'inline-block' }} />}
                {STATUS_LABEL[displayStatus]}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Jeu 1 */}
          <div>
            <label style={SlabelD}>Jeu</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeJeux.map(j => (
                <button key={j.id} onClick={() => setJeuId(j.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left',
                    border: jeuId === j.id ? '2.5px solid var(--ink)' : '2px solid var(--cream2)',
                    borderRadius: 12, background: jeuId === j.id ? 'var(--yellow)' : 'var(--white)',
                    cursor: 'pointer', boxShadow: jeuId === j.id ? '3px 3px 0 var(--ink)' : 'none',
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {j.image_url ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎮</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.titre}</span>
                  {jeuId === j.id && <span style={{ fontWeight: 900 }}>✓</span>}
                </button>
              ))}
              {jeuActuel && !jeuDansSelection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '2px solid var(--cream2)', borderRadius: 12, background: 'var(--cream2)', opacity: 0.6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--cream)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {jeuActuel.image_url ? <img src={jeuActuel.image_url} alt={jeuActuel.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎮</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeuActuel.titre}</span>
                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>hors sélection</span>
                </div>
              )}
            </div>
          </div>

          {/* Jeu 2 */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
              <label style={{ ...SlabelD, marginBottom: 0 }}>Changement de jeu</label>
              {jeu2Id && (
                <button onClick={() => setJeu2Id(null)}
                  style={{ fontSize: 10, fontWeight: 700, color: 'var(--rouge)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Supprimer
                </button>
              )}
            </div>
            {!jeu2Id && (
              <p style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 600, marginBottom: 6 }}>
                Optionnel — si les joueurs ont changé de jeu pendant le créneau
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeJeux.filter(j => j.id !== jeuId).map(j => (
                <button key={j.id} onClick={() => setJeu2Id(jeu2Id === j.id ? null : j.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', textAlign: 'left',
                    border: jeu2Id === j.id ? '2.5px solid var(--ink)' : '2px solid var(--cream2)',
                    borderRadius: 12, background: jeu2Id === j.id ? 'var(--yellow)' : 'var(--white)',
                    cursor: 'pointer', boxShadow: jeu2Id === j.id ? '3px 3px 0 var(--ink)' : 'none',
                  }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {j.image_url ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎮</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.titre}</span>
                  {jeu2Id === j.id && <span style={{ fontWeight: 900 }}>✓</span>}
                </button>
              ))}
              {jeu2Actuel && !jeu2DansSelection && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '2px solid var(--cream2)', borderRadius: 12, background: 'var(--cream2)', opacity: 0.6 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, overflow: 'hidden', background: 'var(--cream)', flexShrink: 0, border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {jeu2Actuel.image_url ? <img src={jeu2Actuel.image_url} alt={jeu2Actuel.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>🎮</span>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeu2Actuel.titre}</span>
                  <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>hors sélection</span>
                </div>
              )}
            </div>
          </div>

          {/* Nb joueurs */}
          <div>
            <label style={SlabelD}>Nb joueurs (max {poste?.maxJoueurs ?? 2})</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: poste?.maxJoueurs ?? 2 }, (_, i) => i + 1).map(n => (
                <button key={n} onClick={() => setNbJoueurs(n)}
                  className={nbJoueurs === n ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                  style={{ flex: 1, justifyContent: 'center' }}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Adhérents */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ ...SlabelD, marginBottom: 0 }}>Adhérent{nbJoueurs > 1 ? "s" : ""}</label>
            {joueurs.map((jj, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, background: 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 10 }}>
                <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', margin: 0 }}>
                  {i === 0 ? "1er joueur" : `${i + 1}e joueur`}
                </p>
                <input type="text" value={jj.nom} onChange={e => updateJoueur(i, { nom: e.target.value })}
                  placeholder="Prénom NOM…"
                  className="pop-input" style={{ width: '100%', background: 'var(--white)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', width: 30, flexShrink: 0 }}>Sexe</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(["H", "F", "N"] as const).map(s => (
                      <button key={s} onClick={() => updateJoueur(i, { sexe: jj.sexe === s ? null : s })}
                        className={jj.sexe === s ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                        style={{ fontSize: 11, padding: '4px 12px' }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.4)', width: 30, flexShrink: 0 }}>Âge</span>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {([
                      { val: "11-16", label: "11-16" }, { val: "16-18", label: "16-18" },
                      { val: "18+", label: "18+" }, { val: "parent", label: "Parent" },
                    ] as const).map(({ val, label }) => (
                      <button key={val} onClick={() => updateJoueur(i, { age: jj.age === val ? null : val })}
                        className={jj.age === val ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
                        style={{ fontSize: 11, padding: '4px 10px' }}>{label}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <label style={SlabelD}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Remarques optionnelles…"
              className="pop-input" style={{ width: '100%' }} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0, background: 'var(--cream2)', flexWrap: 'wrap' }}>
          {reservation.statut !== "annulee" && !confirmCancel && (
            <button onClick={() => setConfirmCancel(true)}
              className="pop-btn"
              style={{ background: 'var(--rose)', color: 'var(--ink)', border: '2.5px solid var(--ink)' }}>
              Annuler rés.
            </button>
          )}
          {confirmCancel && (
            <button onClick={cancel}
              className="pop-btn pop-btn-dark"
              style={{ background: 'var(--rouge)' }}>
              Confirmer annulation
            </button>
          )}
          <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
            Fermer
          </button>
          {reservation.statut !== "annulee" && (
            <button onClick={save} disabled={isSaving || !joueurs[0]?.nom.trim() || !jeuId}
              className="pop-btn pop-btn-dark"
              style={{ flex: 1, justifyContent: 'center', opacity: (isSaving || !joueurs[0]?.nom.trim() || !jeuId) ? 0.4 : 1, cursor: (isSaving || !joueurs[0]?.nom.trim() || !jeuId) ? 'not-allowed' : 'pointer' }}>
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

  const CONSOLE_BG: Record<Console, string> = { PS5: 'var(--bleu)', Switch: 'var(--rouge)', PC: 'var(--cream2)' };
  const STATUS_BG: Record<string, string> = {
    disponible: 'var(--vert)', selection: '#baff29', maintenance: 'var(--orange)', retire: 'var(--rose)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats consoles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {CONSOLES.map(c => {
          const isActive = filtreConsole === c;
          return (
            <button key={c}
              onClick={() => setFiltreConsole(filtreConsole === c ? "Toutes" : c)}
              className="pop-card pop-card-hover"
              style={{ background: isActive ? 'var(--ink)' : CONSOLE_BG[c], padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left', cursor: 'pointer', width: '100%', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.06) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
              <span className="bc" style={{ fontSize: 52, lineHeight: 1, color: isActive ? 'var(--white)' : 'var(--ink)', position: 'relative' }}>{counts[c]}</span>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)', position: 'relative' }}>{c}</span>
            </button>
          );
        })}
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>🔍</span>
          <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Rechercher un jeu…"
            className="pop-input" style={{ width: '100%', paddingLeft: 38 }} />
        </div>
        <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)}
          className="pop-input" style={{ cursor: 'pointer' }}>
          <option value="tous">Tous statuts</option>
          <option value="disponible">Disponible</option>
          <option value="selection">En sélection</option>
          <option value="maintenance">Maintenance</option>
          <option value="retire">Retiré</option>
        </select>
        <span className="pop-sticker" style={{ background: 'var(--cream2)' }}>
          {filtered.length} jeu{filtered.length > 1 ? "x" : ""}
        </span>
        <button onClick={onAdd} className="pop-btn pop-btn-dark">
          + Ajouter
        </button>
      </div>

      {/* Liste */}
      <div className="custom-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 0', gap: 10 }}>
            <span style={{ fontSize: 48 }}>🎮</span>
            <p style={{ fontWeight: 600, color: 'rgba(0,0,0,0.3)' }}>Aucun jeu trouvé</p>
          </div>
        )}
        {filtered.map(jeu => (
          <div key={jeu.id} className="pop-card pop-card-hover"
            style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--white)' }}>
            <div style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', border: '2px solid var(--ink)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {jeu.image_url
                ? <img src={jeu.image_url} alt={jeu.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                : <span style={{ fontSize: 20 }}>🎮</span>}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{jeu.titre}</span>
                <span style={{ background: CONSOLE_BG[jeu.console], border: '2px solid var(--ink)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, boxShadow: '2px 2px 0 var(--ink)', whiteSpace: 'nowrap' }}>{jeu.console}</span>
                {jeu.genre && <span style={{ background: 'var(--cream2)', border: '1.5px solid rgba(0,0,0,0.15)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{jeu.genre}</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {jeu.editeur && <span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>{jeu.editeur}</span>}
                {jeu.annee && <><span style={{ fontSize: 11, color: 'rgba(0,0,0,0.15)' }}>·</span><span style={{ fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>{jeu.annee}</span></>}
                {jeu.pegi && <span style={{ background: 'var(--cream2)', border: '1.5px solid var(--ink)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>PEGI {jeu.pegi}</span>}
                {jeu.nb_joueurs && <span style={{ background: 'var(--cream2)', border: '1.5px solid var(--ink)', borderRadius: 4, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>👥 {jeu.nb_joueurs}</span>}
                <span style={{ background: STATUS_BG[jeu.statut] ?? 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700, boxShadow: '2px 2px 0 var(--ink)' }}>
                  {jeu.statut}
                </span>
              </div>
            </div>
            <button onClick={() => onEdit(jeu)}
              className="pop-btn pop-btn-outline"
              style={{ flexShrink: 0, padding: '8px 12px' }}>
              ✏️
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal : Correction des jeux d'une semaine passée ────────────────────────

function ModalCorrectionSemaine({
  slot,
  jeux,
  reservations,
  onClose,
  onSaved,
}: {
  slot: SelectionSlot;
  jeux: JvJeu[];
  reservations: JvReservation[];
  onClose: () => void;
  onSaved: (updated: JvReservation[]) => void;
}) {
  const consoleName = SLOT_CONSOLE[slot];
  const postes = POSTES.filter(p => POSTE_SLOT[p.id] === slot);
  const consolJeux = jeux.filter(j => j.console === consoleName && j.statut !== "retire");

  const [semaine, setSemaine] = useState(() => addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), -7));
  const lundi = startOfWeek(semaine, { weekStartsOn: 1 });
  const weekStart = format(addDays(lundi, 1), "yyyy-MM-dd");
  const weekEnd   = format(addDays(lundi, 4), "yyyy-MM-dd");

  const resasSemaine = reservations
    .filter(r => postes.some(p => p.id === r.poste) && r.statut !== "annulee" && r.date_creneau >= weekStart && r.date_creneau <= weekEnd)
    .sort((a, b) => a.date_creneau.localeCompare(b.date_creneau) || a.creneau.localeCompare(b.creneau));

  const [jeuMap, setJeuMap] = useState<Record<string, string>>({});
  const weekKey = format(lundi, "yyyy-MM-dd");
  useEffect(() => {
    setJeuMap(Object.fromEntries(resasSemaine.map(r => [r.id, r.jeu_id])));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  const [bulkJeuId, setBulkJeuId] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const applyBulk = () => {
    if (!bulkJeuId) return;
    setJeuMap(Object.fromEntries(resasSemaine.map(r => [r.id, bulkJeuId])));
  };

  const hasChanges = resasSemaine.some(r => (jeuMap[r.id] ?? r.jeu_id) !== r.jeu_id);

  const save = async () => {
    setIsSaving(true);
    const toUpdate = resasSemaine.filter(r => jeuMap[r.id] && jeuMap[r.id] !== r.jeu_id);
    await Promise.all(toUpdate.map(r =>
      fetch(`/api/jv-reservations/${r.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jeu_id: jeuMap[r.id] }),
      })
    ));
    onSaved(resasSemaine.map(r => ({ ...r, jeu_id: jeuMap[r.id] ?? r.jeu_id })));
    setIsSaving(false);
    onClose();
  };

  const CONSOLE_BG_CS: Record<string, string> = { PS5: 'var(--bleu)', Switch: 'var(--rouge)', PC: 'var(--cream2)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '80px 16px 16px', overflowY: 'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: 'var(--cream)', width: '100%', maxWidth: 520, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 96px)', overflow: 'hidden', marginBottom: 32 }}>

        {/* Header */}
        <div style={{ background: CONSOLE_BG_CS[consoleName] ?? 'var(--cream2)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '2.5px solid var(--ink)', flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 className="bc" style={{ fontSize: 24, color: 'var(--ink)', margin: 0, lineHeight: 1 }}>Corriger les réservations</h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.45)', marginTop: 4 }}>{SLOT_LABEL[slot]} · modifier le jeu des créneaux passés</p>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
        </div>

        {/* Sélecteur de semaine */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '2.5px solid var(--ink)', background: 'var(--cream2)', flexShrink: 0 }}>
          <button onClick={() => setSemaine(d => addDays(d, -7))}
            style={{ width: 32, height: 32, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>
            {format(addDays(lundi, 1), "d MMM", { locale: fr })} – {format(addDays(lundi, 4), "d MMM yyyy", { locale: fr })}
          </span>
          <button onClick={() => setSemaine(d => addDays(d, 7))}
            style={{ width: 32, height: 32, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
        </div>

        {/* Appliquer à tous */}
        {resasSemaine.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderBottom: '2px solid var(--cream2)', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>Tout mettre sur</span>
            <select value={bulkJeuId} onChange={e => setBulkJeuId(e.target.value)}
              className="pop-input" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }}>
              <option value="">— choisir un jeu —</option>
              {consolJeux.map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
            </select>
            <button onClick={applyBulk} disabled={!bulkJeuId}
              className="pop-btn pop-btn-dark"
              style={{ fontSize: 11, padding: '6px 12px', opacity: !bulkJeuId ? 0.35 : 1, cursor: !bulkJeuId ? 'not-allowed' : 'pointer', flexShrink: 0 }}>
              Appliquer
            </button>
          </div>
        )}

        {/* Liste des réservations */}
        <div className="custom-scroll" style={{ flex: 1, overflowY: 'auto' }}>
          {resasSemaine.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', textAlign: 'center', padding: '40px 0', fontWeight: 600 }}>Aucune réservation cette semaine</p>
          ) : (
            resasSemaine.map((r, idx) => {
              const posteItem = POSTES.find(p => p.id === r.poste);
              const currentJeuId = jeuMap[r.id] ?? r.jeu_id;
              const isModified = currentJeuId !== r.jeu_id;
              return (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderBottom: idx < resasSemaine.length - 1 ? '1.5px solid var(--cream2)' : 'none' }}>
                  <div style={{ flexShrink: 0, width: 90 }}>
                    <p style={{ fontSize: 10, fontWeight: 900, textTransform: 'capitalize', margin: 0 }}>
                      {format(parseISO(r.date_creneau), "EEE d MMM", { locale: fr })}
                    </p>
                    <p style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', margin: 0 }}>{r.creneau}</p>
                    <p style={{ fontSize: 9, color: 'rgba(0,0,0,0.5)', margin: 0 }}>{posteItem?.label} · {r.adherent_nom} · {r.nb_joueurs}J</p>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <select
                      value={currentJeuId}
                      onChange={e => setJeuMap(prev => ({ ...prev, [r.id]: e.target.value }))}
                      className="pop-input"
                      style={{ width: '100%', padding: '6px 10px', fontSize: 12, background: isModified ? 'var(--yellow)' : undefined, borderColor: isModified ? 'var(--ink)' : undefined }}>
                      {consolJeux.map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                    </select>
                  </div>
                  {isModified && (
                    <span className="pop-sticker" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--orange)', flexShrink: 0 }}>modifié</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, padding: '16px 20px', borderTop: '2.5px solid var(--ink)', flexShrink: 0, background: 'var(--cream2)' }}>
          <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: 'center' }}>
            Annuler
          </button>
          <button onClick={save} disabled={isSaving || !hasChanges}
            className="pop-btn pop-btn-dark"
            style={{ flex: 1, justifyContent: 'center', opacity: (isSaving || !hasChanges) ? 0.4 : 1, cursor: (isSaving || !hasChanges) ? 'not-allowed' : 'pointer' }}>
            {isSaving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
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
  onCorrectionOpen,
}: {
  jeux: JvJeu[];
  selections: JvSelection[];
  onRotationOpen: (slot: SelectionSlot) => void;
  onToggleActif: (jeuId: string, slot: SelectionSlot, isPermanent: boolean, currentSel: JvSelection | undefined) => void;
  onPlanningOpen: () => void;
  onCorrectionOpen: (slot: SelectionSlot) => void;
}) {
  const SLOT_BG: Record<SelectionSlot, string> = { PS5: 'var(--bleu)', Switch_Multi: 'var(--rouge)', Switch_Solo: 'var(--rouge)', PC: 'var(--cream2)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Cycle de rotation */}
      <div className="pop-card" style={{ background: 'var(--cream2)', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.4)', flexShrink: 0 }}>Cycle de rotation</span>
        {ROTATION_ORDER.map((slot, idx) => (
          <span key={slot} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="pop-sticker" style={{ fontSize: 11, padding: '4px 10px', background: SLOT_BG[slot] }}>
              {SLOT_LABEL[slot]}
            </span>
            {idx < ROTATION_ORDER.length - 1 && <span style={{ fontWeight: 900, color: 'rgba(0,0,0,0.3)' }}>→</span>}
          </span>
        ))}
        <span style={{ fontWeight: 900, color: 'rgba(0,0,0,0.3)' }}>→ …</span>
        <button onClick={onPlanningOpen} className="pop-btn pop-btn-outline" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px' }}>
          Planning global
        </button>
      </div>

      {/* Cartes par slot */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 14 }}>
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
            <div key={slot} className="pop-card" style={{ background: 'var(--cream)', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                <span className="pop-sticker" style={{ fontSize: 12, padding: '5px 12px', background: SLOT_BG[slot] }}>{SLOT_LABEL[slot]}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <button onClick={() => onCorrectionOpen(slot)}
                    title="Corriger les jeux d'une semaine passée"
                    style={{ width: 30, height: 30, border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--white)', cursor: 'pointer', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ✎
                  </button>
                  <button onClick={() => onRotationOpen(slot)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '2px solid var(--ink)', borderRadius: 8, background: planifies > 0 ? '#baff29' : 'var(--white)', cursor: 'pointer', fontWeight: 800, fontSize: 12 }}>
                    🔄
                    {planifies > 0 && (
                      <span style={{ background: 'var(--ink)', color: 'var(--white)', fontSize: 9, fontWeight: 900, borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {planifies}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* Permanents */}
              {SLOT_HAS_PERMANENT[slot] && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--orange)' }}>Permanents</span>
                  {permanentSels.map(pSel => {
                    const pJeu = jeux.find(j => j.id === pSel.jeu_id);
                    if (!pJeu) return null;
                    return (
                      <div key={pSel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--yellow)', border: '2px solid var(--ink)', borderRadius: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {pJeu.image_url
                            ? <img src={pJeu.image_url} alt={pJeu.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : <span style={{ fontSize: 12 }}>🎮</span>}
                        </div>
                        <p style={{ fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{pJeu.titre}</p>
                        <button onClick={() => onToggleActif(pJeu.id, slot, true, pSel)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 12, color: 'var(--rouge)', flexShrink: 0 }}>✕</button>
                      </div>
                    );
                  })}
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) onToggleActif(e.target.value, slot, true, undefined); }}
                    className="pop-input"
                    style={{ border: '2px dashed var(--ink)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
                    <option value="">+ Ajouter un jeu permanent…</option>
                    {jeux.filter(j => j.console === console && j.statut !== "retire" && !usedIds.has(j.id))
                      .map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                  </select>
                </div>
              )}

              {/* Sélection rotation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)' }}>
                  Sélection ({actifSels.length}/3)
                </span>
                {actifSels.map(sel => {
                  const jeu = jeux.find(j => j.id === sel.jeu_id);
                  if (!jeu) return null;
                  return (
                    <div key={sel.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '2px 2px 0 var(--ink)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {jeu.image_url
                          ? <img src={jeu.image_url} alt={jeu.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 12 }}>🎮</span>}
                      </div>
                      <p style={{ fontWeight: 700, fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{jeu.titre}</p>
                      <button onClick={() => onToggleActif(jeu.id, slot, false, sel)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 900, fontSize: 12, color: 'var(--rouge)', flexShrink: 0 }}>✕</button>
                    </div>
                  );
                })}
                {actifSels.length < 3 && (
                  <select
                    defaultValue=""
                    onChange={e => { if (e.target.value) onToggleActif(e.target.value, slot, false, undefined); }}
                    className="pop-input"
                    style={{ border: '2px dashed var(--ink)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'rgba(0,0,0,0.4)' }}>
                    <option value="">+ Ajouter ({3 - actifSels.length} place{3 - actifSels.length > 1 ? "s" : ""})…</option>
                    {disponibles.map(j => <option key={j.id} value={j.id}>{j.titre}</option>)}
                  </select>
                )}
              </div>

              {/* File planifiée */}
              {planifies > 0 && (() => {
                const planifiesSorted = selections
                  .filter(s => s.slot === slot && s.statut === "planifie")
                  .sort((a, b) => a.groupe - b.groupe || a.ordre - b.ordre);
                const gNums = [...new Set(planifiesSorted.map(s => s.groupe))].sort((a, b) => a - b);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)' }}>
                      À venir · {gNums.length} groupe{gNums.length > 1 ? "s" : ""}
                    </span>
                    {gNums.map((g, gIdx) => {
                      const gSels = planifiesSorted.filter(s => s.groupe === g);
                      return (
                        <div key={g} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.3)' }}>Groupe {gIdx + 1}</span>
                          <div style={{ display: 'flex', gap: 5 }}>
                            {gSels.map(sel => {
                              const j = jeux.find(x => x.id === sel.jeu_id);
                              return (
                                <div key={sel.id} title={j?.titre}
                                  style={{ width: 44, height: 56, borderRadius: 8, overflow: 'hidden', background: 'var(--cream2)', border: '2px solid var(--ink)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {j?.image_url
                                    ? <img src={j.image_url} alt={j.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : <span style={{ fontSize: 16 }}>🎮</span>}
                                </div>
                              );
                            })}
                            {Array.from({ length: 3 - gSels.length }).map((_, i) => (
                              <div key={i} style={{ width: 44, height: 56, borderRadius: 8, border: '2px dashed var(--ink)', flexShrink: 0, background: 'transparent' }} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    <button onClick={() => onRotationOpen(slot)}
                      style={{ fontSize: 10, fontWeight: 700, color: 'rgba(0,0,0,0.45)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', textDecoration: 'underline', padding: 0, marginTop: 2 }}>
                      Gérer la file →
                    </button>
                  </div>
                );
              })()}
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
  extraCreneaux,
  onAddCreneau,
  onNouvelle,
  onOpenDetail,
}: {
  jeux: JvJeu[];
  reservations: JvReservation[];
  extraCreneaux?: Record<string, string[]>;
  onAddCreneau: (dateStr: string, creneau: string) => void;
  onNouvelle: (date?: string, creneau?: string, poste?: string) => void;
  onOpenDetail: (r: JvReservation) => void;
}) {
  const [semaine, setSemaine] = useState(new Date());
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newCreneau, setNewCreneau] = useState("");
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

  const POSTE_BG: Record<string, string> = { ps5: 'var(--bleu)', switch_multi: 'var(--rouge)', switch_solo: 'var(--rouge)', pc: 'var(--cream2)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <div className="pop-card" style={{ background: '#baff29', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {countByStatus.en_cours > 0 && <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vert)', flexShrink: 0, display: 'inline-block' }} />}
          <div>
            <p className="bc" style={{ fontSize: 40, lineHeight: 1, margin: 0 }}>{countByStatus.en_cours}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)', margin: 0, marginTop: 2 }}>En cours</p>
          </div>
        </div>
        <div className="pop-card" style={{ background: 'var(--cream2)', padding: '16px 20px' }}>
          <p className="bc" style={{ fontSize: 40, lineHeight: 1, margin: 0 }}>{countByStatus.a_venir}</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', margin: 0, marginTop: 2 }}>À venir</p>
        </div>
        <div className="pop-card" style={{ background: 'var(--cream2)', padding: '16px 20px' }}>
          <p className="bc" style={{ fontSize: 40, lineHeight: 1, margin: 0 }}>{countByStatus.passee}</p>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', margin: 0, marginTop: 2 }}>Passées</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20 }} className="xl:grid-cols-3">

        {/* Planning */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }} className="xl:col-span-2">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span className="bc" style={{ fontSize: 20 }}>Planning semaine</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setSemaine(d => addDays(d, -7))}
                style={{ width: 32, height: 32, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.5)', minWidth: 110, textAlign: 'center' }}>
                {format(addDays(lundi, 1), "d MMM", { locale: fr })} – {format(addDays(lundi, 4), "d MMM", { locale: fr })}
              </span>
              <button onClick={() => setSemaine(d => addDays(d, 7))}
                style={{ width: 32, height: 32, border: '2.5px solid var(--ink)', borderRadius: 8, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
            </div>
            <button onClick={() => onNouvelle()} className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: '7px 16px' }}>
              + Réserver
            </button>
          </div>

          {/* Légende postes */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {POSTES.map(p => (
              <span key={p.id} className="pop-sticker" style={{ fontSize: 10, padding: '3px 8px', background: POSTE_BG[p.id] ?? 'var(--cream2)' }}>
                {p.label}
              </span>
            ))}
          </div>

          {/* Jours */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {joursOuverts.map(d => {
              const dateStr = format(d, "yyyy-MM-dd");
              const creneaux = getCreneauxJour(dateStr, extraCreneaux);
              const isAdding = addingFor === dateStr;
              return (
                <div key={dateStr} className="pop-card" style={{ overflow: 'hidden', background: 'var(--cream)', outline: isToday(d) ? '3px solid var(--ink)' : 'none', outlineOffset: isToday(d) ? 2 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '2px solid var(--ink)', background: isToday(d) ? 'var(--ink)' : 'var(--cream2)' }}>
                    <span style={{ fontWeight: 900, fontSize: 13, color: isToday(d) ? 'var(--white)' : 'var(--ink)', textTransform: 'capitalize' }}>{format(d, "EEEE d MMMM", { locale: fr })}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isToday(d) && <span className="pop-sticker" style={{ fontSize: 9, padding: '2px 8px', background: '#baff29' }}>Aujourd&apos;hui</span>}
                      {!isAdding && (
                        <button onClick={() => { setAddingFor(dateStr); setNewCreneau(""); }}
                          title="Ajouter un créneau exceptionnel ce jour-là"
                          style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', border: '1.5px dashed currentColor', borderRadius: 6, background: 'transparent', color: isToday(d) ? 'var(--white)' : 'rgba(0,0,0,0.45)', cursor: 'pointer' }}>
                          + Créneau
                        </button>
                      )}
                    </div>
                  </div>
                  {isAdding && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '8px 16px', borderBottom: '1.5px solid var(--cream2)', background: 'var(--white)' }}>
                      <input
                        type="text"
                        value={newCreneau}
                        onChange={e => setNewCreneau(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && newCreneau.trim()) { onAddCreneau(dateStr, newCreneau.trim()); setAddingFor(null); }
                          if (e.key === "Escape") setAddingFor(null);
                        }}
                        placeholder="ex. 17h-18h"
                        autoFocus
                        className="pop-input" style={{ flex: 1, fontSize: 12, padding: '5px 10px' }} />
                      <button
                        onClick={() => { if (newCreneau.trim()) { onAddCreneau(dateStr, newCreneau.trim()); setAddingFor(null); } }}
                        disabled={!newCreneau.trim()}
                        className="pop-btn pop-btn-dark" style={{ fontSize: 11, padding: '5px 10px', opacity: newCreneau.trim() ? 1 : 0.4 }}>
                        Ajouter
                      </button>
                      <button onClick={() => setAddingFor(null)} className="pop-btn pop-btn-outline" style={{ fontSize: 11, padding: '5px 10px' }}>
                        Annuler
                      </button>
                    </div>
                  )}
                  <div>
                    {creneaux.map((cr, crIdx) => (
                      <div key={cr} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: crIdx < creneaux.length - 1 ? '1.5px solid var(--cream2)' : 'none' }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: 'rgba(0,0,0,0.4)', width: 64, paddingTop: 2, flexShrink: 0 }}>{cr}</span>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
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
                                  style={{
                                    display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 10px', textAlign: 'left',
                                    border: isEnCours ? '2.5px solid var(--vert)' : '2px solid var(--ink)',
                                    borderRadius: 10, background: POSTE_BG[p.id] ?? 'var(--cream2)',
                                    minWidth: 90, maxWidth: 130, cursor: 'pointer',
                                    boxShadow: isEnCours ? '0 0 0 2px var(--vert)' : '2px 2px 0 var(--ink)',
                                  }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    {isEnCours && <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--vert)', flexShrink: 0, display: 'inline-block' }} />}
                                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.05em', opacity: 0.6 }}>{p.label}</span>
                                  </div>
                                  {jeu2 ? (
                                    <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {jeu?.titre ?? "?"} → {jeu2.titre}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{jeu?.titre ?? "?"}</span>
                                  )}
                                  <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resa.adherent_nom} · {resa.nb_joueurs}J</span>
                                </button>
                              );
                            }
                            return (
                              <button key={p.id}
                                onClick={() => onNouvelle(dateStr, cr, p.id)}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '8px 10px', border: '2px dashed rgba(0,0,0,0.2)', borderRadius: 10, background: 'transparent', cursor: 'pointer', minWidth: 90, color: 'rgba(0,0,0,0.25)' }}>
                                <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>{p.label}</span>
                                <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
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

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="bc" style={{ fontSize: 18 }}>Jeux les + joués</span>
          {stats.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>Aucune donnée pour l&apos;instant</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {stats.slice(0, 8).map((s, idx) => (
                <div key={s.jeu_id} className="pop-card" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--cream)' }}>
                  <span className="bc" style={{ fontSize: 18, color: 'rgba(0,0,0,0.2)', width: 20, textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ width: 32, height: 32, borderRadius: 6, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)' }}>
                    {s.image_url
                      ? <img src={s.image_url} alt={s.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🎮</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{s.titre}</p>
                    <span className="pop-sticker" style={{ fontSize: 9, padding: '2px 6px', background: 'var(--cream2)' }}>{s.console}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                    <span className="bc" style={{ fontSize: 22 }}>{s.nb_reservations}</span>
                    <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>fois</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {enCoursResas.length > 0 && (
            <>
              <span className="bc" style={{ fontSize: 18, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--vert)', display: 'inline-block' }} />
                En cours
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {enCoursResas.map(r => {
                  const jeu = jeux.find(j => j.id === r.jeu_id);
                  const poste = POSTES.find(p => p.id === r.poste);
                  return (
                    <button key={r.id} onClick={() => onOpenDetail(r)}
                      className="pop-card pop-card-hover"
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#baff29', textAlign: 'left', width: '100%', cursor: 'pointer' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 48 }}>
                        <span style={{ fontSize: 10, fontWeight: 900 }}>{format(parseISO(r.date_creneau), "d MMM", { locale: fr })}</span>
                        <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.5)', fontWeight: 600 }}>{r.creneau}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{jeu?.titre ?? "?"}</p>
                        <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.5)', margin: 0 }}>{r.adherent_nom} · {r.nb_joueurs}J · {poste?.label ?? r.poste}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <span className="bc" style={{ fontSize: 18, marginTop: 6 }}>À venir</span>
          {aVenirResas.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>Aucune réservation à venir</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {aVenirResas.slice(0, 8).map(r => {
                const jeu = jeux.find(j => j.id === r.jeu_id);
                const poste = POSTES.find(p => p.id === r.poste);
                return (
                  <button key={r.id} onClick={() => onOpenDetail(r)}
                    className="pop-card pop-card-hover"
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--cream)', textAlign: 'left', width: '100%', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 48 }}>
                      <span style={{ fontSize: 10, fontWeight: 900 }}>{format(parseISO(r.date_creneau), "d MMM", { locale: fr })}</span>
                      <span style={{ fontSize: 9, color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>{r.creneau}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>{jeu?.titre ?? "?"}</p>
                      <p style={{ fontSize: 10, color: 'rgba(0,0,0,0.4)', margin: 0 }}>{r.adherent_nom} · {r.nb_joueurs}J · {poste?.label ?? r.poste}</p>
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

// ─── Onglet Stats ─────────────────────────────────────────────────────────────

const MOIS_LABELS = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];

function TabStats({ reservations, jeux }: { reservations: JvReservation[]; jeux: JvJeu[] }) {
  const actives = reservations.filter(r => r.statut !== "annulee");

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [chronoView, setChronoView] = useState<"mois" | "annee">("mois");

  const allJoueurs = actives.flatMap(r =>
    r.joueurs_details && r.joueurs_details.length > 0
      ? r.joueurs_details
      : Array.from({ length: r.nb_joueurs }, () => ({ nom: "", sexe: null, age: null } as JoueurDetail))
  );

  const totalJoueurs = allJoueurs.length;
  const totalResas   = actives.length;

  const years = useMemo(() => {
    const ys = new Set(actives.map(r => parseInt(r.date_creneau.slice(0, 4))));
    return [...ys].sort();
  }, [actives]);

  const monthlyData = useMemo(() => {
    const data = Array.from({ length: 12 }, (_, i) => ({ mois: i, resas: 0, joueurs: 0 }));
    actives
      .filter(r => parseInt(r.date_creneau.slice(0, 4)) === selectedYear)
      .forEach(r => {
        const m = parseInt(r.date_creneau.slice(5, 7)) - 1;
        data[m].resas++;
        data[m].joueurs += r.joueurs_details?.length || r.nb_joueurs;
      });
    return data;
  }, [actives, selectedYear]);

  const yearlyData = useMemo(() => {
    const map: Record<number, { resas: number; joueurs: number }> = {};
    actives.forEach(r => {
      const y = parseInt(r.date_creneau.slice(0, 4));
      if (!map[y]) map[y] = { resas: 0, joueurs: 0 };
      map[y].resas++;
      map[y].joueurs += r.joueurs_details?.length || r.nb_joueurs;
    });
    return Object.entries(map).map(([y, v]) => ({ annee: parseInt(y), ...v })).sort((a, b) => a.annee - b.annee);
  }, [actives]);

  const sexeCounts = { H: 0, F: 0, N: 0, "?": 0 };
  allJoueurs.forEach(j => {
    if (j.sexe === "H" || j.sexe === "F" || j.sexe === "N") sexeCounts[j.sexe]++;
    else sexeCounts["?"]++;
  });

  const ageCounts: Record<string, number> = { "11-16": 0, "16-18": 0, "18+": 0, parent: 0, "?": 0 };
  allJoueurs.forEach(j => {
    if (j.age && ageCounts[j.age] !== undefined) ageCounts[j.age]++;
    else ageCounts["?"]++;
  });

  const jeuMap: Record<string, { titre: string; console: Console; image_url: string | null; count: number }> = {};
  actives.forEach(r => {
    const addJ = (id: string) => {
      const jeu = jeux.find(j => j.id === id);
      if (!jeu) return;
      if (!jeuMap[id]) jeuMap[id] = { titre: jeu.titre, console: jeu.console, image_url: jeu.image_url, count: 0 };
      jeuMap[id].count++;
    };
    addJ(r.jeu_id);
    if (r.jeu2_id) addJ(r.jeu2_id);
  });
  const topJeux = Object.entries(jeuMap).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count).slice(0, 10);
  const maxCount = topJeux[0]?.count || 1;

  const CONSOLE_BG_S: Record<string, string> = { PS5: 'var(--bleu)', Switch: 'var(--rouge)', PC: 'var(--cream2)' };

  const StatBar = ({ label, count, total, color }: { label: string; count: number; total: number; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 12, fontWeight: 700, width: 120, flexShrink: 0, color: 'rgba(0,0,0,0.55)' }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--cream2)', borderRadius: 99, height: 10, overflow: 'hidden', border: '1.5px solid var(--ink)' }}>
        <div style={{ height: '100%', borderRadius: 99, background: color, width: total > 0 ? `${(count / total) * 100}%` : '0%' }} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 900, width: 28, textAlign: 'right', flexShrink: 0 }}>{count}</span>
      <span style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', width: 32 }}>{total > 0 ? `${Math.round((count / total) * 100)}%` : '—'}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }} className="sm:grid-cols-4">
        {[
          { label: "Réservations", value: totalResas, bg: 'var(--cream2)' },
          { label: "Joueurs total", value: totalJoueurs, bg: '#baff29' },
          { label: "Avec profil", value: allJoueurs.filter(j => j.sexe || j.age).length, bg: 'var(--bleu)' },
          { label: "Jeux distincts", value: Object.keys(jeuMap).length, bg: 'var(--purple)' },
        ].map(k => (
          <div key={k.label} className="pop-card" style={{ background: k.bg, padding: '16px 20px' }}>
            <p className="bc" style={{ fontSize: 44, lineHeight: 1, margin: 0 }}>{k.value}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)', margin: 0, marginTop: 2 }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Activité chronologique */}
      <div className="pop-card" style={{ background: 'var(--cream)', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <span className="bc" style={{ fontSize: 18 }}>Activité</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 2, padding: 3, background: 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 10 }}>
              {(["mois", "annee"] as const).map(v => (
                <button key={v} onClick={() => setChronoView(v)}
                  style={{ padding: '5px 12px', borderRadius: 7, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: chronoView === v ? 'var(--ink)' : 'transparent', color: chronoView === v ? 'var(--white)' : 'rgba(0,0,0,0.5)' }}>
                  {v === "mois" ? "Par mois" : "Par année"}
                </button>
              ))}
            </div>
            {chronoView === "mois" && years.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button onClick={() => setSelectedYear(y => Math.max(years[0], y - 1))} disabled={selectedYear <= years[0]}
                  style={{ width: 28, height: 28, border: '2px solid var(--ink)', borderRadius: 7, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedYear <= years[0] ? 0.3 : 1 }}>‹</button>
                <span style={{ fontSize: 13, fontWeight: 900, minWidth: 44, textAlign: 'center' }}>{selectedYear}</span>
                <button onClick={() => setSelectedYear(y => Math.min(currentYear, y + 1))} disabled={selectedYear >= currentYear}
                  style={{ width: 28, height: 28, border: '2px solid var(--ink)', borderRadius: 7, background: 'var(--white)', fontWeight: 900, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: selectedYear >= currentYear ? 0.3 : 1 }}>›</button>
              </div>
            )}
          </div>
        </div>

        {chronoView === "mois" ? (() => {
          const maxVal = Math.max(...monthlyData.map(d => d.resas), 1);
          const totalAnnee = monthlyData.reduce((s, d) => s + d.resas, 0);
          const joueursTotalAnnee = monthlyData.reduce((s, d) => s + d.joueurs, 0);
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                {monthlyData.map((d, i) => {
                  const pct = (d.resas / maxVal) * 100;
                  const isCurMonth = selectedYear === currentYear && i === new Date().getMonth();
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, position: 'relative' }} className="group">
                      <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 96 }}>
                        <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: isCurMonth ? 'var(--ink)' : 'var(--cream2)', border: '1.5px solid var(--ink)', height: `${Math.max(pct, d.resas > 0 ? 4 : 0)}%`, transition: 'height .3s' }} />
                      </div>
                      <span style={{ fontSize: 8, fontWeight: 700, color: isCurMonth ? 'var(--ink)' : 'rgba(0,0,0,0.35)' }}>{MOIS_LABELS[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 20, paddingTop: 8, borderTop: '2px solid var(--cream2)' }}>
                <div><span className="bc" style={{ fontSize: 22 }}>{totalAnnee}</span> <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>réservations</span></div>
                <div><span className="bc" style={{ fontSize: 22 }}>{joueursTotalAnnee}</span> <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>joueurs</span></div>
                <div><span className="bc" style={{ fontSize: 22 }}>{totalAnnee > 0 ? (joueursTotalAnnee / totalAnnee).toFixed(1) : "—"}</span> <span style={{ fontSize: 11, color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>moy./rés.</span></div>
              </div>
            </div>
          );
        })() : (() => {
          const maxVal = Math.max(...yearlyData.map(d => d.resas), 1);
          return yearlyData.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>Aucune donnée</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120 }}>
                {yearlyData.map(d => {
                  const pct = (d.resas / maxVal) * 100;
                  const isCurrent = d.annee === currentYear;
                  return (
                    <div key={d.annee} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 96 }}>
                        <div style={{ width: '100%', borderRadius: '4px 4px 0 0', background: isCurrent ? 'var(--ink)' : 'var(--cream2)', border: '1.5px solid var(--ink)', height: `${Math.max(pct, d.resas > 0 ? 4 : 0)}%`, transition: 'height .3s' }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: isCurrent ? 'var(--ink)' : 'rgba(0,0,0,0.4)' }}>{d.annee}</span>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '2px solid var(--cream2)' }}>
                {yearlyData.map(d => (
                  <div key={d.annee} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                    <span style={{ fontWeight: 900, width: 40 }}>{d.annee}</span>
                    <span style={{ fontWeight: 700 }}>{d.resas} rés.</span>
                    <span style={{ color: 'rgba(0,0,0,0.3)' }}>·</span>
                    <span style={{ fontWeight: 700 }}>{d.joueurs} joueurs</span>
                    <span style={{ color: 'rgba(0,0,0,0.3)' }}>·</span>
                    <span style={{ color: 'rgba(0,0,0,0.45)' }}>{d.resas > 0 ? (d.joueurs / d.resas).toFixed(1) : "—"} moy.</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }} className="xl:grid-cols-2">

        {/* Démographie */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="pop-card" style={{ background: 'var(--cream)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="bc" style={{ fontSize: 18 }}>Répartition par sexe</span>
            <StatBar label="Homme (H)" count={sexeCounts.H} total={totalJoueurs} color="var(--bleu)" />
            <StatBar label="Femme (F)" count={sexeCounts.F} total={totalJoueurs} color="var(--rose)" />
            <StatBar label="Non-binaire (N)" count={sexeCounts.N} total={totalJoueurs} color="var(--purple)" />
            <StatBar label="Non renseigné" count={sexeCounts["?"]} total={totalJoueurs} color="var(--cream2)" />
          </div>
          <div className="pop-card" style={{ background: 'var(--cream)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span className="bc" style={{ fontSize: 18 }}>Tranche d&apos;âge</span>
            <StatBar label="11 – 16 ans" count={ageCounts["11-16"]} total={totalJoueurs} color="var(--vert)" />
            <StatBar label="16 – 18 ans" count={ageCounts["16-18"]} total={totalJoueurs} color="var(--yellow)" />
            <StatBar label="18 ans +" count={ageCounts["18+"]} total={totalJoueurs} color="var(--orange)" />
            <StatBar label="Parent / Adulte" count={ageCounts["parent"]} total={totalJoueurs} color="var(--rouge)" />
            <StatBar label="Non renseigné" count={ageCounts["?"]} total={totalJoueurs} color="var(--cream2)" />
          </div>
        </div>

        {/* Top jeux */}
        <div className="pop-card" style={{ background: 'var(--cream)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span className="bc" style={{ fontSize: 18 }}>Jeux les + joués</span>
          {topJeux.length === 0 ? (
            <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.35)', fontWeight: 600 }}>Aucune donnée</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {topJeux.map((s, idx) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="bc" style={{ fontSize: 18, color: 'rgba(0,0,0,0.2)', width: 22, textAlign: 'right', flexShrink: 0 }}>{idx + 1}</span>
                  <div style={{ width: 28, height: 28, borderRadius: 6, overflow: 'hidden', background: 'var(--cream2)', flexShrink: 0, border: '1.5px solid var(--ink)' }}>
                    {s.image_url
                      ? <img src={s.image_url} alt={s.titre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>🎮</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <p style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0, flex: 1 }}>{s.titre}</p>
                      <span className="pop-sticker" style={{ fontSize: 9, padding: '2px 6px', background: CONSOLE_BG_S[s.console] ?? 'var(--cream2)', flexShrink: 0 }}>{s.console}</span>
                    </div>
                    <div style={{ background: 'var(--cream2)', borderRadius: 99, height: 6, overflow: 'hidden', border: '1px solid var(--ink)' }}>
                      <div style={{ height: '100%', borderRadius: 99, background: 'var(--ink)', width: `${(s.count / maxCount) * 100}%` }} />
                    </div>
                  </div>
                  <span className="bc" style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'right' }}>{s.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function JvPage() {
  const [onglet, setOnglet] = useState<"catalogue" | "selections" | "reservations" | "stats">("catalogue");
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
  const [modalCorrection, setModalCorrection] = useState<SelectionSlot | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const toArr = (d: any) => Array.isArray(d) ? d : [];
      const [j, s, r, cfg] = await Promise.all([
        fetch('/api/jv-jeux').then(res => res.json()).then(toArr).catch(() => []),
        fetch('/api/jv-selections').then(res => res.json()).then(toArr).catch(() => []),
        fetch('/api/jv-reservations').then(res => res.json()).then(toArr).catch(() => []),
        fetch('/api/jv-rotation-config').then(res => res.json()).catch(() => null),
      ]);
      setJeux(j as JvJeu[]);
      setSelections((s as any[]).map(sel => ({ ...sel, permanent: !!sel.permanent })) as JvSelection[]);
      setReservations((r as any[]).map(res => ({
        ...res,
        joueurs_details: typeof res.joueurs_details === 'string' && res.joueurs_details ? JSON.parse(res.joueurs_details) : (res.joueurs_details ?? null),
      })) as JvReservation[]);
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
      await fetch(`/api/jv-selections/${currentSel.id}`, { method: 'DELETE' });
      setSelections(prev => {
        const next = prev.filter(s => s.id !== currentSel.id);
        if (!next.some(s => s.jeu_id === jeuId && s.statut === "actif")) {
          fetch(`/api/jv-jeux/${jeuId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: "disponible" }) });
          setJeux(j => j.map(x => x.id === jeuId ? { ...x, statut: "disponible" } : x));
        }
        return next;
      });
    } else {
      const payload = { jeu_id: jeuId, slot, console: SLOT_CONSOLE[slot], statut: "actif", permanent: isPermanent ? 1 : 0, groupe: 0, ordre: 0 };
      const res = await fetch('/api/jv-selections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json() as Promise<any>).catch(() => null);
      if (res?.id) setSelections(prev => [...prev, { ...payload, id: res.id, permanent: isPermanent, date_debut: null, date_fin: null } as JvSelection]);
      await fetch(`/api/jv-jeux/${jeuId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: "selection" }) });
      setJeux(prev => prev.map(j => j.id === jeuId ? { ...j, statut: "selection" } : j));
    }
  }, []);

  // Ajoute un jeu à un groupe planifié spécifique
  const handleAddToGroup = useCallback(async (jeuId: string, slot: SelectionSlot, groupe: number) => {
    const groupSels = selections.filter(s => s.slot === slot && s.statut === "planifie" && s.groupe === groupe);
    if (groupSels.length >= 3) return;
    const ordre = groupSels.length + 1;
    const payload = { jeu_id: jeuId, slot, console: SLOT_CONSOLE[slot], statut: "planifie", permanent: 0, groupe, ordre };
    const res = await fetch('/api/jv-selections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setSelections(prev => [...prev, { ...payload, id: res.id, permanent: false, date_debut: null, date_fin: null } as JvSelection]);
  }, [selections]);

  const handleRemoveSelection = useCallback(async (selId: string) => {
    await fetch(`/api/jv-selections/${selId}`, { method: 'DELETE' });
    setSelections(prev => prev.filter(s => s.id !== selId));
  }, []);

  // Échange les groupes fromGroupe et toGroupe (pour les boutons ▲/▼)
  const handleMoveGroup = useCallback(async (slot: SelectionSlot, fromGroupe: number, toGroupe: number) => {
    const TEMP = -9999;
    const fromIds = selections.filter(s => s.slot === slot && s.groupe === fromGroupe).map(s => s.id);
    const toIds = selections.filter(s => s.slot === slot && s.groupe === toGroupe).map(s => s.id);
    const put = (id: string, groupe: number) => fetch(`/api/jv-selections/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupe }) });
    await Promise.all(fromIds.map(id => put(id, TEMP)));
    await Promise.all(toIds.map(id => put(id, fromGroupe)));
    await Promise.all(fromIds.map(id => put(id, toGroupe)));
    setSelections(prev => prev.map(s => {
      if (s.slot === slot && s.groupe === fromGroupe) return { ...s, groupe: toGroupe };
      if (s.slot === slot && s.groupe === toGroupe) return { ...s, groupe: fromGroupe };
      return s;
    }));
  }, [selections]);

  // Ajoute un créneau exceptionnel pour une date précise (ne modifie pas les créneaux récurrents)
  const handleAddCreneau = useCallback(async (dateStr: string, creneau: string) => {
    setRotationConfig(prev => {
      const existing = prev.config?.extra_creneaux ?? {};
      const forDate = existing[dateStr] ?? [];
      if (forDate.includes(creneau)) return prev;
      const nextConfig = { ...prev.config, extra_creneaux: { ...existing, [dateStr]: [...forDate, creneau] } };
      fetch('/api/jv-rotation-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: nextConfig }),
      });
      return { ...prev, config: nextConfig };
    });
  }, []);

  // Met à jour le point de départ de la rotation
  const handleUpdateRotationConfig = useCallback(async (slotIndex: number, weekStart: string) => {
    await fetch('/api/jv-rotation-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_slot_index: slotIndex, week_start: weekStart }),
    });
    setRotationConfig(prev => ({ ...prev, current_slot_index: slotIndex, week_start: weekStart }));
  }, []);

  // Applique la rotation : le prochain slot dans le cycle remplace ses actifs par son 1er groupe planifié
  const handleApplyRotation = useCallback(async () => {
    const nextSlotIndex = (rotationConfig.current_slot_index + 1) % 4;
    const nextSlot = ROTATION_ORDER[nextSlotIndex];

    // Actifs non-permanents du prochain slot → seront retirés
    const activeSels = selections.filter(s => s.slot === nextSlot && s.statut === "actif" && !s.permanent);
    const activeIds = activeSels.map(s => s.id);

    // Premier groupe planifié du prochain slot → sera promu
    const planifiedSorted = selections
      .filter(s => s.slot === nextSlot && s.statut === "planifie")
      .sort((a, b) => a.groupe - b.groupe || a.ordre - b.ordre);
    const firstGroupeNum = planifiedSorted.length > 0 ? planifiedSorted[0].groupe : null;
    const nextGroupSels = firstGroupeNum !== null
      ? planifiedSorted.filter(s => s.groupe === firstGroupeNum)
      : [];
    const nextGroupIds = nextGroupSels.map(s => s.id);

    // 1. Supprimer les actifs non-permanents du prochain slot
    if (activeIds.length > 0) {
      await Promise.all(activeIds.map(id => fetch(`/api/jv-selections/${id}`, { method: 'DELETE' })));
    }

    if (nextGroupIds.length > 0) {
      await Promise.all(nextGroupIds.map(id => fetch(`/api/jv-selections/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: "actif", groupe: 0, ordre: 0 }),
      })));
    }

    const removedJeuIds = activeSels.map(s => s.jeu_id);
    const addedJeuIds = nextGroupSels.map(s => s.jeu_id);
    const toDisponible = removedJeuIds.filter(id => !addedJeuIds.includes(id));
    const toSelection = addedJeuIds.filter(id => !removedJeuIds.includes(id));
    await Promise.all([
      ...toDisponible.map(id => fetch(`/api/jv-jeux/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: "disponible" }) })),
      ...toSelection.map(id => fetch(`/api/jv-jeux/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: "selection" }) })),
    ]);

    // 4. Avancer la config
    const newWeekStart = format(addDays(parseISO(rotationConfig.week_start), 7), "yyyy-MM-dd");
    await handleUpdateRotationConfig(nextSlotIndex, newWeekStart);

    // 5. State local
    setSelections(prev => {
      const afterDelete = prev.filter(s => !activeIds.includes(s.id));
      return afterDelete.map(s =>
        nextGroupIds.includes(s.id) ? { ...s, statut: "actif" as const, groupe: 0, ordre: 0 } : s
      );
    });
    setJeux(prev => prev.map(j => {
      if (toDisponible.includes(j.id)) return { ...j, statut: "disponible" as const };
      if (toSelection.includes(j.id)) return { ...j, statut: "selection" as const };
      return j;
    }));
  }, [rotationConfig, selections, handleUpdateRotationConfig]);

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

  const handleCorrectionSaved = useCallback((updated: JvReservation[]) => {
    const map = Object.fromEntries(updated.map(r => [r.id, r]));
    setReservations(prev => prev.map(r => map[r.id] ?? r));
  }, []);

  const totalJeux = jeux.length;
  const totalConsolesActives = new Set(jeux.map(j => j.console)).size;
  const totalResasVenir = reservations.filter(r => { const ds = getDisplayStatus(r); return ds === "a_venir" || ds === "en_cours"; }).length;

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`
        .custom-scroll::-webkit-scrollbar{width:4px}
        .custom-scroll::-webkit-scrollbar-track{background:transparent}
        .custom-scroll::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.15);border-radius:999px}
      `}</style>

      <NavBar current="jv" />

      <div className="pop-page">

        {/* ── PAGE HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: 'uppercase', letterSpacing: '-1px', background: 'linear-gradient(135deg, #0d0d0d 40%, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Jeux<br/>Vidéo
            </div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', marginTop: 6 }}>Catalogue · Sélections · Réservations</div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="pop-card" style={{ padding: '12px 18px', textAlign: 'center', background: 'var(--cream2)', minWidth: 70 }}>
              <div className="bc" style={{ fontSize: 36, lineHeight: 1 }}>{totalJeux}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', letterSpacing: '.07em', marginTop: 4 }}>Jeux</div>
            </div>
            <div className="pop-card" style={{ padding: '12px 18px', textAlign: 'center', background: 'var(--bleu)', minWidth: 70 }}>
              <div className="bc" style={{ fontSize: 36, lineHeight: 1 }}>{totalConsolesActives}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', letterSpacing: '.07em', marginTop: 4 }}>Consoles</div>
            </div>
            <div className="pop-card" style={{ padding: '12px 18px', textAlign: 'center', background: '#baff29', minWidth: 70 }}>
              <div className="bc" style={{ fontSize: 36, lineHeight: 1 }}>{totalResasVenir}</div>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', letterSpacing: '.07em', marginTop: 4 }}>Résa</div>
            </div>
          </div>
        </div>

        {/* ── ONGLETS ── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {([
            { key: "catalogue", label: "Catalogue" },
            { key: "selections", label: "Sélections" },
            { key: "reservations", label: "Réservations" },
            { key: "stats", label: "Stats" },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setOnglet(t.key)}
              className={onglet === t.key ? 'pop-btn pop-btn-dark' : 'pop-btn pop-btn-outline'}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CONTENU ── */}
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 12 }}>
            <div className="spin" style={{ width: 32, height: 32, border: '3px solid var(--cream2)', borderTopColor: 'var(--ink)', borderRadius: '50%' }} />
            <p style={{ color: 'rgba(0,0,0,0.4)', fontWeight: 600 }}>Chargement…</p>
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
                onCorrectionOpen={slot => setModalCorrection(slot)}
              />
            )}
            {onglet === "reservations" && (
              <TabReservations
                jeux={jeux}
                reservations={reservations}
                extraCreneaux={rotationConfig.config?.extra_creneaux}
                onAddCreneau={handleAddCreneau}
                onNouvelle={(date, creneau, poste) => setModalResa({ open: true, date, creneau, poste })}
                onOpenDetail={r => setModalResaDetail(r)}
              />
            )}
            {onglet === "stats" && (
              <TabStats reservations={reservations} jeux={jeux} />
            )}
          </>
        )}
      </div>

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
          reservations={reservations}
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
          onApplyRotation={handleApplyRotation}
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
          extraCreneaux={rotationConfig.config?.extra_creneaux}
          onClose={() => setModalResa({ open: false })}
          onSaved={handleResaSaved}
        />
      )}
      {modalCorrection && (
        <ModalCorrectionSemaine
          slot={modalCorrection}
          jeux={jeux}
          reservations={reservations}
          onClose={() => setModalCorrection(null)}
          onSaved={handleCorrectionSaved}
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
