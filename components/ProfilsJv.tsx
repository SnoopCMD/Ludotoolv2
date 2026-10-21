"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import BoutonScan from "./ScanCodeBarre";

/**
 * Profils des usagers du pôle jeux vidéo : on scanne la carte (ou on cherche
 * le prénom) et le bloc joueur de la réservation se remplit tout seul.
 * Les lecteurs USB se comportent comme un clavier qui tape le numéro puis
 * Entrée : le champ de recherche les reçoit tels quels.
 */

export type Sexe = "H" | "F" | "N";
export type TrancheAge = "11-16" | "16-18" | "18+" | "parent";

export type JoueurDetail = {
  nom: string;
  sexe: Sexe | null;
  age: TrancheAge | null;
  /** Profil lié, et carte saisie pour un profil encore à créer. */
  profil_id?: string | null;
  carte?: string | null;
};

export type ProfilJv = {
  id: string;
  prenom: string;
  numero_carte: string | null;
  sexe: Sexe | null;
  age: TrancheAge | null;
  cree_le: string;
  utilise_le: string | null;
};

export const joueurVide = (): JoueurDetail => ({ nom: "", sexe: null, age: null, profil_id: null, carte: null });

const SEXES: Sexe[] = ["H", "F", "N"];
const AGES: { val: TrancheAge; label: string }[] = [
  { val: "11-16", label: "11-16" }, { val: "16-18", label: "16-18" },
  { val: "18+", label: "18+" }, { val: "parent", label: "Parent" },
];

const normaliserCarte = (s: string) => s.replace(/\s+/g, "").toUpperCase();
/** Un numéro de carte : un seul bloc, avec au moins un chiffre. Un prénom n'en a pas. */
const ressembleACarte = (s: string) => /^[A-Za-z0-9-]{4,}$/.test(s.trim()) && /\d/.test(s);

async function json<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store", ...init });
    if (!r.ok) return null;
    return await r.json() as T;
  } catch { return null; }
}

const envoyer = (url: string, method: string, body: unknown) =>
  json<ProfilJv>(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const chercherProfils = (q: string, limite = 8) =>
  json<ProfilJv[]>(`/api/jv-profils?q=${encodeURIComponent(q)}&limit=${limite}`).then(r => r ?? []);

export const profilDeCarte = (carte: string) =>
  json<ProfilJv | null>(`/api/jv-profils?carte=${encodeURIComponent(carte)}`);

export const joueurDepuisProfil = (p: ProfilJv): JoueurDetail =>
  ({ nom: p.prenom, sexe: p.sexe, age: p.age, profil_id: p.id, carte: p.numero_carte });

/**
 * À la validation d'une réservation : crée le profil des cartes inconnues et
 * met à jour ceux qu'on a retouchés. Un échec ne bloque pas la réservation :
 * le joueur reste simplement sans profil lié.
 */
export async function enregistrerProfils(joueurs: JoueurDetail[], { venue = true } = {}): Promise<JoueurDetail[]> {
  return Promise.all(joueurs.map(async j => {
    const prenom = j.nom.trim();
    if (!prenom) return j;
    // `venue` : faux quand on rattache une carte à une réservation passée, pour
    // ne pas faire passer cette vieille venue pour la dernière en date.
    const champs = { prenom, sexe: j.sexe, age: j.age, utilise: venue, ...(j.carte ? { numero_carte: j.carte } : {}) };
    if (j.profil_id) {
      const p = await envoyer(`/api/jv-profils/${j.profil_id}`, "PUT", champs);
      return p ? { ...j, carte: p.numero_carte } : j;
    }
    if (!j.carte) return j;
    const p = await envoyer("/api/jv-profils", "POST", champs) ?? await profilDeCarte(j.carte);
    return p ? { ...j, profil_id: p.id, carte: p.numero_carte } : j;
  }));
}

// ─── Avancement du rattachement ───────────────────────────────────────────────

/** Ce qu'il faut d'une réservation pour savoir où en sont ses profils. */
export type ResaProfils = {
  id: string;
  date_creneau: string;
  statut: string;
  nb_joueurs: number;
  adherent_nom: string;
  joueurs_details: JoueurDetail[] | null;
};

/** Les joueurs d'une réservation ; les anciennes n'ont que `nb_joueurs` et le nom du premier. */
export function joueursDe(r: ResaProfils): JoueurDetail[] {
  const det = r.joueurs_details ?? [];
  if (det.length >= r.nb_joueurs) return det;
  return [...det, ...Array.from({ length: r.nb_joueurs - det.length }, (_, i) =>
    ({ ...joueurVide(), nom: det.length + i === 0 ? r.adherent_nom ?? "" : "" }))];
}

export function etatProfils(r: ResaProfils) {
  const joueurs = joueursDe(r);
  return { lies: joueurs.filter(j => j.profil_id).length, total: joueurs.length };
}

/** Une pastille par joueur : verte s'il est rattaché à un profil, rouge sinon. */
export function PastillesProfils({ resa, taille = 7 }: { resa: ResaProfils; taille?: number }) {
  const joueurs = joueursDe(resa);
  const { lies, total } = etatProfils(resa);
  return (
    <span title={lies === total ? "Tous les joueurs ont un profil" : `${lies}/${total} profil${total > 1 ? "s" : ""} rattaché${lies > 1 ? "s" : ""}`}
      style={{ display: "inline-flex", gap: Math.max(2, taille / 3), alignItems: "center", flexShrink: 0 }}>
      {joueurs.map((j, i) => (
        <span key={i} style={{
          width: taille, height: taille, borderRadius: "50%", display: "inline-block",
          background: j.profil_id ? "#22c55e" : "#ef4444", border: "1px solid var(--ink)",
        }} />
      ))}
    </span>
  );
}

// ─── Recherche / scan d'un profil ─────────────────────────────────────────────

function RechercheProfil({ autoFocus, exclus, onProfil, onCarteInconnue }: {
  autoFocus?: boolean;
  /** Profils déjà pris par un autre joueur de la réservation. */
  exclus: string[];
  onProfil: (p: ProfilJv) => void;
  onCarteInconnue: (carte: string) => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [resultats, setResultats] = useState<ProfilJv[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const derniere = useRef("");

  useEffect(() => {
    const q = saisie.trim();
    derniere.current = q;
    if (!q) { setResultats([]); return; }
    const t = setTimeout(() => {
      chercherProfils(q).then(r => { if (derniere.current === q) setResultats(r.filter(p => !exclus.includes(p.id))); });
    }, 180);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saisie]);

  const choisir = (p: ProfilJv) => {
    if (exclus.includes(p.id)) { setMessage(`${p.prenom} est déjà dans cette réservation.`); return; }
    setSaisie(""); setResultats([]); setMessage(null); onProfil(p);
  };

  const valider = async (brut: string) => {
    const v = brut.trim();
    if (!v) return;
    if (!ressembleACarte(v)) { if (resultats.length === 1) choisir(resultats[0]); return; }
    const carte = normaliserCarte(v);
    const p = await profilDeCarte(carte);
    if (p) { choisir(p); return; }
    setSaisie(""); setResultats([]); setMessage(null);
    onCarteInconnue(carte);
  };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input type="search" value={saisie} autoFocus={autoFocus}
          onChange={e => { setSaisie(e.target.value); setMessage(null); }}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); valider(saisie); } }}
          placeholder="🪪 Scanner la carte ou chercher un prénom…"
          className="pop-input" style={{ flex: 1, minWidth: 0, background: "var(--white)" }} />
        <BoutonScan titre="Scanner la carte de l'usager" onScan={valider} />
      </div>
      {resultats.length > 0 && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 5, background: "var(--white)",
          border: "2px solid var(--ink)", borderRadius: 10, boxShadow: "3px 3px 0 var(--ink)", overflow: "hidden",
        }}>
          {resultats.map(p => (
            <button key={p.id} type="button" onClick={() => choisir(p)} style={{
              display: "flex", width: "100%", gap: 8, alignItems: "center", padding: "8px 12px", textAlign: "left",
              border: "none", borderBottom: "1px solid var(--cream2)", background: "none", cursor: "pointer", fontFamily: "inherit",
            }}>
              <span style={{ fontWeight: 800, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.prenom}</span>
              <span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
                {[p.sexe, p.age === "parent" ? "Parent" : p.age, p.numero_carte && `n° ${p.numero_carte}`].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>
      )}
      {message && <p style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", margin: "5px 0 0" }}>{message}</p>}
    </div>
  );
}

// ─── Bloc joueur d'une réservation ────────────────────────────────────────────

export function BlocJoueur({ joueur, index, autoFocus, exclus, onChange, radius = 12, padding = 14, existant = false, ouvrirRecherche = false }: {
  joueur: JoueurDetail;
  index: number;
  autoFocus?: boolean;
  exclus: string[];
  onChange: (patch: Partial<JoueurDetail>) => void;
  radius?: number;
  padding?: number;
  /** Joueur d'une réservation déjà enregistrée : la recherche reste repliée
   *  derrière un bouton, et lier une carte garde ce qui a été saisi à l'époque. */
  existant?: boolean;
  /** Recherche dépliée et prête à scanner dès l'ouverture (mode « Compléter »). */
  ouvrirRecherche?: boolean;
}) {
  const lie = !!joueur.profil_id;
  const [rechercheOuverte, setRechercheOuverte] = useState(!existant || !joueur.nom.trim() || ouvrirRecherche);
  const detacher = () => existant
    ? onChange({ profil_id: null, carte: null })
    : onChange(joueurVide());
  const lier = (p: ProfilJv) => existant
    // Le profil complète la réservation sans écraser ce qu'elle disait déjà.
    ? onChange({ profil_id: p.id, carte: p.numero_carte, nom: p.prenom, sexe: joueur.sexe ?? p.sexe, age: joueur.age ?? p.age })
    : onChange(joueurDepuisProfil(p));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding, background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: radius }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <p style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".07em", color: "rgba(0,0,0,0.45)", margin: 0, flex: 1 }}>
          {index === 0 ? "1er joueur" : `${index + 1}e joueur`}
        </p>
        {(lie || joueur.carte) && (
          <span style={{ fontSize: 10, fontWeight: 800, background: lie ? "var(--vert)" : "var(--yellow)", border: "1.5px solid var(--ink)", borderRadius: 5, padding: "1px 6px" }}>
            {lie ? "👤 Profil" : "＋ Nouveau profil"}{joueur.carte ? ` · n° ${joueur.carte}` : ""}
          </span>
        )}
        {(lie || joueur.carte) && (
          <button type="button" title="Détacher le profil" onClick={detacher}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: 12, fontWeight: 900, padding: 0 }}>✕</button>
        )}
      </div>

      {!lie && joueur.carte && (
        <p style={{ fontSize: 11, fontWeight: 700, color: "#c2410c", margin: 0 }}>
          Carte inconnue : complète le prénom, le profil sera créé à la validation.
        </p>
      )}
      {!lie && !joueur.carte && !rechercheOuverte && (
        <button type="button" onClick={() => setRechercheOuverte(true)} className="pop-btn pop-btn-outline"
          style={{ alignSelf: "flex-start", fontSize: 12, padding: "5px 12px", background: "var(--white)" }}>
          🔗 Lier une carte
        </button>
      )}
      {!lie && !joueur.carte && rechercheOuverte && (
        <RechercheProfil autoFocus={autoFocus || existant} exclus={exclus}
          onProfil={lier}
          onCarteInconnue={carte => onChange({ carte })} />
      )}

      <input type="text" value={joueur.nom} onChange={e => onChange({ nom: e.target.value })}
        placeholder="Prénom…"
        className="pop-input" style={{ width: "100%", background: "var(--white)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)", width: 30, flexShrink: 0 }}>Sexe</span>
        <div style={{ display: "flex", gap: 6 }}>
          {SEXES.map(s => (
            <button key={s} type="button" onClick={() => onChange({ sexe: joueur.sexe === s ? null : s })}
              className={joueur.sexe === s ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
              style={{ fontSize: 11, padding: "4px 12px" }}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)", width: 30, flexShrink: 0 }}>Âge</span>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {AGES.map(({ val, label }) => (
            <button key={val} type="button" onClick={() => onChange({ age: joueur.age === val ? null : val })}
              className={joueur.age === val ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"}
              style={{ fontSize: 11, padding: "4px 10px" }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

const sansAccents = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ─── Rattachement par prénom ──────────────────────────────────────────────────

type Occurrence = { resa: ResaProfils; index: number; joueur: JoueurDetail };
type Groupe = { cle: string; nom: string; occurrences: Occurrence[] };

/**
 * Participations sans profil regroupées par prénom : « Malik » venu 12 fois
 * se rattache en une fois, en scannant sa carte. Les homonymes se décochent.
 */
function RattachementParPrenom({ reservations, onReservationMaj, onRattache }: {
  reservations: ResaProfils[];
  onReservationMaj: (r: ResaProfils) => void;
  /** Un rattachement a eu lieu : la liste des profils peut avoir changé. */
  onRattache: () => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [tout, setTout] = useState(false);

  const groupes = useMemo(() => {
    const map = new Map<string, Groupe>();
    for (const r of reservations) {
      if (r.statut === "annulee") continue;
      joueursDe(r).forEach((joueur, index) => {
        const cle = sansAccents(joueur.nom.trim());
        if (joueur.profil_id || !cle) return;
        const g = map.get(cle) ?? { cle, nom: joueur.nom.trim(), occurrences: [] };
        g.occurrences.push({ resa: r, index, joueur });
        map.set(cle, g);
      });
    }
    return [...map.values()]
      .map(g => ({ ...g, occurrences: g.occurrences.sort((a, b) => b.resa.date_creneau.localeCompare(a.resa.date_creneau)) }))
      .sort((a, b) => b.occurrences.length - a.occurrences.length || a.nom.localeCompare(b.nom));
  }, [reservations]);

  if (groupes.length === 0) return null;
  const visibles = tout ? groupes : groupes.slice(0, 12);

  return (
    <div className="pop-card" style={{ background: "var(--cream)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span className="bc" style={{ fontSize: 18 }}>À rattacher</span>
        <span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", fontWeight: 600 }}>
          Prénoms des participations sans profil, les plus fréquents d’abord : un scan rattache toutes leurs venues.
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visibles.map(g => (
          <div key={g.cle} style={{ background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 10, overflow: "visible" }}>
            <button type="button" onClick={() => setOuvert(o => o === g.cle ? null : g.cle)} style={{
              display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "8px 12px", border: "none",
              background: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left",
            }}>
              <span style={{ fontWeight: 800, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nom}</span>
              <span style={{ fontSize: 11, color: "rgba(0,0,0,0.5)", whiteSpace: "nowrap" }}>
                ×{g.occurrences.length} · dernière le {format(parseISO(g.occurrences[0].resa.date_creneau), "d MMM yyyy", { locale: fr })}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800 }}>{ouvert === g.cle ? "▴" : "🔗"}</span>
            </button>
            {ouvert === g.cle && (
              <PanneauRattachement key={g.cle} groupe={g} onReservationMaj={onReservationMaj}
                onFini={fait => { setOuvert(null); if (fait) onRattache(); }} />
            )}
          </div>
        ))}
      </div>
      {groupes.length > 12 && (
        <button type="button" onClick={() => setTout(t => !t)} className="pop-btn pop-btn-outline" style={{ alignSelf: "flex-start", fontSize: 12, padding: "5px 12px" }}>
          {tout ? "Réduire" : `Voir les ${groupes.length} prénoms`}
        </button>
      )}
    </div>
  );
}

function PanneauRattachement({ groupe, onFini, onReservationMaj }: {
  groupe: Groupe;
  onFini: (fait: boolean) => void;
  onReservationMaj: (r: ResaProfils) => void;
}) {
  const recent = groupe.occurrences[0].joueur;
  const [profil, setProfil] = useState<ProfilJv | null>(null);
  // Carte inconnue : le profil est créé avec le prénom, le sexe et l'âge de la venue la plus récente.
  const [nouveau, setNouveau] = useState<{ carte: string; prenom: string; sexe: Sexe | null; age: TrancheAge | null } | null>(null);
  const [coches, setCoches] = useState<Set<number>>(() => new Set(groupe.occurrences.map((_, i) => i)));
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (i: number) => setCoches(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });

  const lier = async () => {
    if (envoi || coches.size === 0 || (!profil && !nouveau?.prenom.trim())) return;
    setEnvoi(true); setErreur(null);
    let cible = profil;
    if (!cible && nouveau) {
      cible = await envoyer("/api/jv-profils", "POST", { prenom: nouveau.prenom, numero_carte: nouveau.carte, sexe: nouveau.sexe, age: nouveau.age });
      if (!cible) { setErreur("Création du profil impossible (carte déjà utilisée ?)."); setEnvoi(false); return; }
    }
    // Plusieurs occurrences peuvent tomber dans la même réservation : on les applique ensemble.
    const parResa = new Map<string, { resa: ResaProfils; index: number[] }>();
    groupe.occurrences.forEach((o, i) => {
      if (!coches.has(i)) return;
      const e = parResa.get(o.resa.id) ?? { resa: o.resa, index: [] };
      e.index.push(o.index);
      parResa.set(o.resa.id, e);
    });
    for (const { resa, index } of parResa.values()) {
      const joueurs = joueursDe(resa).map((j, k) => index.includes(k) ? { ...j, profil_id: cible!.id, carte: cible!.numero_carte } : j);
      const ok = await fetch(`/api/jv-reservations/${resa.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ joueurs_details: JSON.stringify(joueurs) }),
      }).then(r => r.ok).catch(() => false);
      if (ok) onReservationMaj({ ...resa, joueurs_details: joueurs });
    }
    setEnvoi(false);
    onFini(true);
  };

  return (
    <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 10, borderTop: "1.5px solid var(--cream2)" }}>
      {!profil && !nouveau && (
        <RechercheProfil autoFocus exclus={[]} onProfil={setProfil}
          onCarteInconnue={carte => setNouveau({ carte, prenom: groupe.nom, sexe: recent.sexe, age: recent.age })} />
      )}
      {profil && (
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          👤 Vers le profil <b>{profil.prenom}</b>{profil.numero_carte && ` · n° ${profil.numero_carte}`}{" "}
          <button type="button" onClick={() => setProfil(null)} style={{ border: "none", background: "none", cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: "inherit" }}>changer</button>
        </div>
      )}
      {nouveau && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 12, fontWeight: 700 }}>
          <span>＋ Nouveau profil · n° {nouveau.carte}</span>
          <input value={nouveau.prenom} onChange={e => setNouveau({ ...nouveau, prenom: e.target.value })} className="pop-input" style={{ flex: "1 1 140px", padding: "4px 8px", fontSize: 13 }} />
          <span style={{ color: "rgba(0,0,0,0.5)" }}>{[nouveau.sexe, nouveau.age === "parent" ? "Parent" : nouveau.age].filter(Boolean).join(" · ")}</span>
          <button type="button" onClick={() => setNouveau(null)} style={{ border: "none", background: "none", cursor: "pointer", textDecoration: "underline", fontSize: 11, fontFamily: "inherit" }}>changer</button>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 220, overflowY: "auto" }}>
        <span style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(0,0,0,0.45)" }}>
          Venues à rattacher — décoche les homonymes
        </span>
        {groupe.occurrences.map((o, i) => (
          <label key={`${o.resa.id}-${o.index}`} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, cursor: "pointer", padding: "2px 0" }}>
            <input type="checkbox" checked={coches.has(i)} onChange={() => basculer(i)} />
            <span style={{ fontWeight: 700, width: 110 }}>{format(parseISO(o.resa.date_creneau), "EEE d MMM yyyy", { locale: fr })}</span>
            <span style={{ color: "rgba(0,0,0,0.55)" }}>{[o.joueur.sexe, o.joueur.age === "parent" ? "Parent" : o.joueur.age].filter(Boolean).join(" · ") || "sexe et âge non renseignés"}</span>
          </label>
        ))}
      </div>
      {erreur && <p style={{ color: "var(--rouge)", fontWeight: 700, fontSize: 12, margin: 0 }}>{erreur}</p>}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button type="button" onClick={() => onFini(false)} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "5px 12px" }}>Annuler</button>
        <button type="button" onClick={lier} disabled={envoi || coches.size === 0 || (!profil && !nouveau?.prenom.trim())}
          className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "5px 12px", opacity: envoi || coches.size === 0 || (!profil && !nouveau) ? 0.4 : 1 }}>
          {envoi ? "…" : `Rattacher ${coches.size} venue${coches.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── Onglet Profils ───────────────────────────────────────────────────────────

export function TabProfils({ venues, reservations, onReservationMaj }: {
  /** Nombre de réservations par profil, tiré des réservations déjà chargées. */
  venues: Record<string, number>;
  reservations: ResaProfils[];
  onReservationMaj: (r: ResaProfils) => void;
}) {
  const [profils, setProfils] = useState<ProfilJv[] | null>(null);
  const [q, setQ] = useState("");
  const [edite, setEdite] = useState<Partial<ProfilJv> | null>(null);

  const charger = () => json<ProfilJv[]>("/api/jv-profils").then(r => setProfils(r ?? []));
  useEffect(() => { charger(); }, []);

  const filtres = useMemo(() => {
    const t = sansAccents(q.trim());
    const carte = normaliserCarte(q);
    if (!profils || !t) return profils ?? [];
    return profils.filter(p => sansAccents(p.prenom).includes(t) || (p.numero_carte ?? "").startsWith(carte));
  }, [profils, q]);

  /** Un scan dans la barre de recherche ouvre directement la fiche, ou en crée une. */
  const valider = (brut: string) => {
    const v = brut.trim();
    if (!ressembleACarte(v)) return;
    const carte = normaliserCarte(v);
    const p = profils?.find(x => x.numero_carte === carte);
    setEdite(p ?? { numero_carte: carte, prenom: "", sexe: null, age: null });
    setQ("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <RattachementParPrenom reservations={reservations} onReservationMaj={onReservationMaj} onRattache={charger} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 6, flex: "1 1 260px", minWidth: 0 }}>
          <input type="search" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") valider(q); }}
            placeholder="🔍 Prénom ou numéro de carte…" className="pop-input" style={{ flex: 1, minWidth: 0 }} />
          <BoutonScan titre="Scanner une carte" onScan={valider} />
        </div>
        <button className="pop-btn pop-btn-dark" onClick={() => setEdite({ prenom: "", numero_carte: "", sexe: null, age: null })}>+ Nouveau profil</button>
      </div>

      {profils === null ? (
        <p style={{ color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Chargement…</p>
      ) : filtres.length === 0 ? (
        <div className="pop-card" style={{ padding: 20, textAlign: "center", fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>
          {profils.length === 0 ? "Aucun profil pour l'instant : ils se créent en scannant une carte lors d'une réservation." : "Aucun profil ne correspond."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {filtres.map(p => (
            <button key={p.id} type="button" onClick={() => setEdite(p)} className="pop-card" style={{
              display: "flex", flexDirection: "column", gap: 4, padding: "12px 14px", textAlign: "left", cursor: "pointer",
              background: "var(--white)", fontFamily: "inherit",
            }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>{p.prenom}</span>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
                {[p.sexe, p.age === "parent" ? "Parent" : p.age].filter(Boolean).join(" · ") || "—"}
                {p.numero_carte && <> · n° {p.numero_carte}</>}
              </span>
              <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>
                {venues[p.id] ? `${venues[p.id]} réservation${venues[p.id] > 1 ? "s" : ""}` : "Aucune réservation"}
                {p.utilise_le && ` · dernière le ${format(parseISO(p.utilise_le), "d MMM yyyy", { locale: fr })}`}
              </span>
            </button>
          ))}
        </div>
      )}

      {edite && (
        <ModalProfil initial={edite} onFermer={() => setEdite(null)}
          onEnregistre={p => { setProfils(prev => prev?.some(x => x.id === p.id) ? prev.map(x => x.id === p.id ? p : x) : [p, ...(prev ?? [])]); setEdite(null); }}
          onSupprime={id => { setProfils(prev => prev?.filter(x => x.id !== id) ?? null); setEdite(null); }} />
      )}
    </div>
  );
}

function ModalProfil({ initial, onFermer, onEnregistre, onSupprime }: {
  initial: Partial<ProfilJv>;
  onFermer: () => void;
  onEnregistre: (p: ProfilJv) => void;
  onSupprime: (id: string) => void;
}) {
  const [p, setP] = useState(initial);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const maj = (champs: Partial<ProfilJv>) => setP(prev => ({ ...prev, ...champs }));

  const enregistrer = async () => {
    if (!p.prenom?.trim() || envoi) return;
    setEnvoi(true); setErreur(null);
    const corps = { prenom: p.prenom, numero_carte: p.numero_carte ?? "", sexe: p.sexe, age: p.age };
    const r = await fetch(p.id ? `/api/jv-profils/${p.id}` : "/api/jv-profils", {
      method: p.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps),
    }).then(r => r.json() as Promise<any>).catch(() => ({ error: "Réseau indisponible." }));
    setEnvoi(false);
    if (r?.error) { setErreur(r.error); return; }
    onEnregistre(r as ProfilJv);
  };

  const supprimer = async () => {
    if (!p.id || !confirm(`Supprimer le profil de ${p.prenom} ? Ses réservations passées sont conservées.`)) return;
    await fetch(`/api/jv-profils/${p.id}`, { method: "DELETE" });
    onSupprime(p.id);
  };

  const Slabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "rgba(0,0,0,0.4)", marginBottom: 5, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 50, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "calc(var(--nav-h) + 12px) 12px 12px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="pop-card" style={{ background: "var(--cream)", width: "100%", maxWidth: 420, overflow: "hidden" }}>
        <div style={{ background: "var(--vert)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "2.5px solid var(--ink)" }}>
          <h2 className="bc" style={{ fontSize: 24, margin: 0, lineHeight: 1, flex: 1 }}>{p.id ? "Profil" : "Nouveau profil"}</h2>
          <button onClick={onFermer} style={{ width: 34, height: 34, border: "2.5px solid var(--ink)", borderRadius: 8, background: "var(--white)", fontWeight: 900, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={Slabel}>Prénom *</label>
            <input autoFocus value={p.prenom ?? ""} onChange={e => maj({ prenom: e.target.value })}
              onKeyDown={e => { if (e.key === "Enter") enregistrer(); }} className="pop-input" style={{ width: "100%" }} />
          </div>
          <div>
            <label style={Slabel}>Numéro de carte</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={p.numero_carte ?? ""} onChange={e => maj({ numero_carte: e.target.value })}
                placeholder="Scanner ou saisir…" className="pop-input" style={{ flex: 1, minWidth: 0 }} />
              <BoutonScan titre="Scanner la carte" onScan={code => maj({ numero_carte: normaliserCarte(code) })} />
            </div>
          </div>
          <div>
            <label style={Slabel}>Sexe</label>
            <div style={{ display: "flex", gap: 6 }}>
              {SEXES.map(s => (
                <button key={s} type="button" onClick={() => maj({ sexe: p.sexe === s ? null : s })}
                  className={p.sexe === s ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"} style={{ fontSize: 12, padding: "5px 14px" }}>{s}</button>
              ))}
            </div>
          </div>
          <div>
            <label style={Slabel}>Tranche d’âge</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {AGES.map(({ val, label }) => (
                <button key={val} type="button" onClick={() => maj({ age: p.age === val ? null : val })}
                  className={p.age === val ? "pop-btn pop-btn-dark" : "pop-btn pop-btn-outline"} style={{ fontSize: 12, padding: "5px 12px" }}>{label}</button>
              ))}
            </div>
          </div>
          {erreur && <p style={{ color: "var(--rouge)", fontWeight: 700, fontSize: 13, margin: 0 }}>{erreur}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "2.5px solid var(--ink)", background: "var(--cream2)" }}>
          {p.id && <button onClick={supprimer} className="pop-btn pop-btn-outline" style={{ color: "var(--rouge)" }}>Supprimer</button>}
          <span style={{ flex: 1 }} />
          <button onClick={onFermer} className="pop-btn pop-btn-outline">Annuler</button>
          <button onClick={enregistrer} disabled={!p.prenom?.trim() || envoi} className="pop-btn pop-btn-dark"
            style={{ opacity: !p.prenom?.trim() || envoi ? 0.4 : 1 }}>{envoi ? "…" : "Enregistrer"}</button>
        </div>
      </div>
    </div>
  );
}
