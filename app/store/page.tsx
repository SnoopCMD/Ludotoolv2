"use client";
import { useState, useEffect, useRef } from "react";
import NavBar from "../../components/NavBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanierType = "JdS" | "JV" | "jouet";
type View = "dashboard" | "profil" | "basket";

type Panier = {
  id: string; nom: string;
  statut: "En cours" | "Commandé" | "Reçu";
  notes: string | null; created_at: string;
  type: PanierType; tags: string | null; profil: string | null;
};

type PanierLigne = {
  id: string; panier_id: string; nom: string;
  editeur: string | null; image_url: string | null; ean: string | null;
  prix_unitaire: number | null; quantite: number; notes: string | null;
  tags: string | null;
};

type PanierCommunLigne = {
  id: string; panier_commun_id: string; nom: string;
  editeur: string | null; image_url: string | null; ean: string | null;
  prix_unitaire: number | null; quantite: number; notes: string | null;
  profil: string | null; votes: number; created_at: string;
};

type JeuRechercheStore = {
  nom: string; editeur: string | null; image_url: string | null;
  prix: number | null; url_source: string | null; extra?: string;
};

type PanierCommun = { id: string; type: PanierType; nom: string };

type MembreSummary = { nom: string; couleur: string };

type StoreSummary = {
  communStats: Record<string, { nb: number; total: number }>;
  profilStats: Record<string, { paniers: number; jeux: number }>;
  membres: MembreSummary[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUTS: Panier["statut"][] = ["En cours", "Commandé", "Reçu"];

const STATUT_STYLE: Record<Panier["statut"], React.CSSProperties> = {
  "En cours": { background: "var(--yellow)", color: "var(--ink)" },
  "Commandé": { background: "var(--bleu)",   color: "var(--ink)" },
  "Reçu":     { background: "var(--vert)",   color: "var(--ink)" },
};

const TYPE_INFO: Record<PanierType, { emoji: string; bg: string }> = {
  JdS:   { emoji: "🎲", bg: "var(--bleu)" },
  JV:    { emoji: "🎮", bg: "var(--purple)" },
  jouet: { emoji: "🧸", bg: "var(--rose)" },
};

const PANIERS_COMMUNS: PanierCommun[] = [
  { id: "commun-jds",   type: "JdS",   nom: "Commande commune JdS" },
  { id: "commun-jv",    type: "JV",    nom: "Commande commune JV" },
  { id: "commun-jouet", type: "jouet", nom: "Commande commune Jouets" },
];

// ─── ModalPanier ──────────────────────────────────────────────────────────────

function ModalPanier({
  initial, defaultProfil, onClose, onSaved,
}: {
  initial?: Panier | null;
  defaultProfil?: string;
  onClose: () => void;
  onSaved: (p: Panier) => void;
}) {
  const isEdit = !!initial;
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [type, setType] = useState<PanierType>(initial?.type ?? "JdS");
  const [profil, setProfil] = useState(initial?.profil ?? defaultProfil ?? "");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    const payload = {
      nom: nom.trim(), type,
      profil: profil.trim() || null,
      tags: tags.trim() || null,
      notes: notes.trim() || null,
    };
    if (isEdit) {
      await fetch(`/api/paniers/${initial!.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSaved({ ...initial!, ...payload });
    } else {
      const res = await fetch("/api/paniers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, statut: "En cours" }),
      }).then(r => r.json() as Promise<any>).catch(() => null);
      if (res?.id) onSaved({ id: res.id, statut: "En cours", created_at: new Date().toISOString(), ...payload } as Panier);
    }
    setSaving(false);
    onClose();
  };

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", display: "block", marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}>
        <div style={{ background: "var(--ink)", padding: "16px 20px" }}>
          <h2 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>{isEdit ? "Modifier le panier" : "Nouveau panier"}</h2>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={lbl}>Nom</label>
            <input autoFocus type="text" placeholder="Nom du panier…" value={nom}
              onChange={e => setNom(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
              className="pop-input" style={{ width: "100%" }} /></div>
          <div><label style={lbl}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["JdS", "JV", "jouet"] as PanierType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  style={{ flex: 1, padding: "8px 4px", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                    background: type === t ? TYPE_INFO[t].bg : "var(--cream)",
                    border: type === t ? "2.5px solid var(--ink)" : "2px solid var(--cream2)",
                    borderRadius: 8, cursor: "pointer", boxShadow: type === t ? "3px 3px 0 var(--ink)" : "none" }}>
                  {TYPE_INFO[t].emoji} {t}
                </button>
              ))}
            </div></div>
          <div><label style={lbl}>Profil</label>
            <input type="text" placeholder="Nom de la personne…" value={profil}
              onChange={e => setProfil(e.target.value)} className="pop-input" style={{ width: "100%" }} /></div>
          <div><label style={lbl}>Tags</label>
            <input type="text" placeholder="tag1, tag2, tag3…" value={tags}
              onChange={e => setTags(e.target.value)} className="pop-input" style={{ width: "100%" }} />
            {parseTags(tags).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {parseTags(tags).map(t => <span key={t} className="pop-sticker" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)", fontSize: 12 }}>{t}</span>)}
              </div>
            )}</div>
          <div><label style={lbl}>Notes</label>
            <textarea placeholder="Informations complémentaires…" value={notes}
              onChange={e => setNotes(e.target.value)} className="pop-input" rows={3}
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
            <button onClick={save} disabled={!nom.trim() || saving}
              className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: (!nom.trim() || saving) ? 0.4 : 1 }}>
              {saving ? "Enregistrement…" : isEdit ? "Sauvegarder" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ModalEnvoiCommun ─────────────────────────────────────────────────────────

function ModalEnvoiCommun({
  ligne, panierType, panierProfil, onClose, onSent,
}: {
  ligne: PanierLigne; panierType: PanierType; panierProfil: string | null;
  onClose: () => void;
  onSent: (panierCommunId: string, newLigne: PanierCommunLigne) => void;
}) {
  const [targetId, setTargetId] = useState(PANIERS_COMMUNS.find(p => p.type === panierType)?.id ?? PANIERS_COMMUNS[0].id);
  const [profil, setProfil] = useState(panierProfil ?? "");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    const payload = {
      panier_commun_id: targetId, nom: ligne.nom, editeur: ligne.editeur,
      image_url: ligne.image_url, ean: ligne.ean, prix_unitaire: ligne.prix_unitaire,
      quantite: ligne.quantite, profil: profil.trim() || null,
    };
    const res = await fetch("/api/paniers-communs-lignes", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) onSent(targetId, { ...payload, id: res.id, notes: null, votes: 0, created_at: new Date().toISOString() } as PanierCommunLigne);
    setSending(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ background: "var(--ink)", padding: "16px 20px" }}>
          <h2 className="bc" style={{ fontSize: 20, color: "var(--cream)", margin: 0 }}>Envoyer vers panier commun</h2>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--cream2)", borderRadius: 8, fontWeight: 700, fontSize: 14 }}>{ligne.nom}</div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", marginBottom: 6 }}>Panier cible</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PANIERS_COMMUNS.map(p => (
                <button key={p.id} onClick={() => setTargetId(p.id)}
                  style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontWeight: 700, fontSize: 14,
                    background: targetId === p.id ? TYPE_INFO[p.type].bg : "var(--cream)",
                    border: targetId === p.id ? "2.5px solid var(--ink)" : "2px solid var(--cream2)",
                    boxShadow: targetId === p.id ? "3px 3px 0 var(--ink)" : "none" }}>
                  {TYPE_INFO[p.type].emoji} {p.nom}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>Profil</p>
            <input type="text" placeholder="Qui fait cette demande ?" value={profil}
              onChange={e => setProfil(e.target.value)} className="pop-input" style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
            <button onClick={send} disabled={sending} className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: sending ? 0.4 : 1 }}>
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StorePage() {
  const [view, setView] = useState<View>("dashboard");
  const [activeProfil, setActiveProfil] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [paniers, setPaniers] = useState<Panier[]>([]);
  const [communLignes, setCommunLignes] = useState<Record<string, PanierCommunLigne[]>>({});
  const [lignes, setLignes] = useState<PanierLigne[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<StoreSummary>({ communStats: {}, profilStats: {}, membres: [] as MembreSummary[] });

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState<Panier | null>(null);
  const [modalEnvoi, setModalEnvoi] = useState<PanierLigne | null>(null);

  const [recherche, setRecherche] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [resultats, setResultats] = useState<JeuRechercheStore[]>([]);
  const [showResultats, setShowResultats] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedCommunIds = useRef<Set<string>>(new Set());

  const [localPrix, setLocalPrix] = useState<Record<string, string>>({});
  const [localQte, setLocalQte] = useState<Record<string, string>>({});
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tagEdit, setTagEdit] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  // ─── Dérivés ──────────────────────────────────────────────────────────────────

  const isCommun = selectedId?.startsWith("commun-") ?? false;
  const panierActuel = (view === "basket" && !isCommun) ? (paniers.find(p => p.id === selectedId) ?? null) : null;
  const panierCommunActuel = (view === "basket" && isCommun) ? (PANIERS_COMMUNS.find(p => p.id === selectedId) ?? null) : null;
  const lignesCommun = (isCommun && selectedId) ? (communLignes[selectedId] ?? []) : [];
  const profilPaniers = activeProfil ? paniers.filter(p => p.profil === activeProfil) : [];

  const totalEstime = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
  const nbSansPrix = lignes.filter(l => l.prix_unitaire == null).length;

  // ─── Chargement ───────────────────────────────────────────────────────────────

  const chargerPaniers = async () => {
    const data = await fetch("/api/paniers").then(r => r.json() as Promise<any>)
      .then(d => Array.isArray(d) ? d : []).catch(() => []);
    setPaniers(data as Panier[]);
    setIsLoading(false);
  };

  const chargerSummary = async () => {
    const data = await fetch("/api/store/summary").then(r => r.json() as Promise<StoreSummary>).catch(() => null);
    if (data) setSummary(data);
  };

  const chargerLignes = async (id: string) => {
    const data = await fetch(`/api/panier-lignes?panier_id=${id}`).then(r => r.json() as Promise<any>)
      .then(d => Array.isArray(d) ? d : []).catch(() => []);
    setLignes(data as PanierLigne[]);
  };

  const chargerCommunLignes = async (id: string) => {
    if (loadedCommunIds.current.has(id)) return;
    loadedCommunIds.current.add(id);
    const data = await fetch(`/api/paniers-communs-lignes?panier_commun_id=${id}`)
      .then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setCommunLignes(prev => ({ ...prev, [id]: data as PanierCommunLigne[] }));
  };

  useEffect(() => { chargerPaniers(); chargerSummary(); }, []);

  useEffect(() => {
    setFilterTag(null);
    setTagEdit(null);
    if (view !== "basket" || !selectedId) { setLignes([]); return; }
    if (isCommun) { setLignes([]); chargerCommunLignes(selectedId); }
    else chargerLignes(selectedId);
  }, [view, selectedId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResultats(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────────────

  const goToDashboard = () => { setView("dashboard"); setSelectedId(null); setActiveProfil(null); setLignes([]); };
  const goToProfil = (p: string) => { setView("profil"); setActiveProfil(p); setSelectedId(null); setLignes([]); };
  const goToBasket = (id: string) => { setView("basket"); setSelectedId(id); };

  const handleBack = () => {
    if (view === "basket") {
      if (isCommun) goToDashboard();
      else if (activeProfil) goToProfil(activeProfil);
      else goToDashboard();
    } else if (view === "profil") {
      goToDashboard();
    }
  };

  // ─── CRUD Paniers ─────────────────────────────────────────────────────────────

  const handlePanierSaved = (p: Panier) => {
    setPaniers(prev => {
      const exists = prev.find(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    goToBasket(p.id);
    chargerSummary();
  };

  const changerStatut = async (id: string, statut: Panier["statut"]) => {
    await fetch(`/api/paniers/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    setPaniers(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
  };

  const supprimerPanier = async (id: string) => {
    if (!confirm("Supprimer ce panier et toutes ses lignes ?")) return;
    await fetch(`/api/paniers/${id}`, { method: "DELETE" });
    setPaniers(prev => prev.filter(p => p.id !== id));
    if (activeProfil) goToProfil(activeProfil); else goToDashboard();
    chargerSummary();
  };

  // ─── Recherche ────────────────────────────────────────────────────────────────

  const lancerRecherche = (val: string) => {
    setRecherche(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setResultats([]); setShowResultats(false); return; }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true); setShowResultats(true);
      try {
        if (panierActuel?.type === "JV") {
          const data = await fetch(`/api/jv/search?q=${encodeURIComponent(val.trim())}`).then(r => r.json() as Promise<any[]>);
          setResultats((Array.isArray(data) ? data : []).map((g: any) => ({
            nom: g.titre, editeur: g.editeur, image_url: g.image_url, prix: null, url_source: null, extra: g.console,
          })));
        } else {
          const data = await fetch(`/api/store/recherche?nom=${encodeURIComponent(val.trim())}`).then(r => r.json() as Promise<any>);
          setResultats((data.resultats ?? []).map((r: any) => ({
            nom: r.nom, editeur: r.editeur, image_url: r.image_url, prix: r.prix, url_source: r.url_source ?? null,
          })));
        }
      } catch { setResultats([]); }
      finally { setIsSearching(false); }
    }, 500);
  };

  const ajouterJeu = async (jeu: JeuRechercheStore) => {
    if (!panierActuel) return;
    const payload = { panier_id: panierActuel.id, nom: jeu.nom, editeur: jeu.editeur ?? null,
      image_url: jeu.image_url ?? null, prix_unitaire: jeu.prix ?? null, quantite: 1, notes: jeu.url_source ?? null };
    const res = await fetch("/api/panier-lignes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setLignes(prev => [...prev, { ...payload, id: res.id, ean: null } as PanierLigne]);
    setRecherche(""); setResultats([]); setShowResultats(false);
    chargerSummary();
  };

  const ajouterJeuManuel = async () => {
    if (!panierActuel || !recherche.trim()) return;
    const payload = { panier_id: panierActuel.id, nom: recherche.trim(), quantite: 1 };
    const res = await fetch("/api/panier-lignes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setLignes(prev => [...prev, { ...payload, id: res.id, editeur: null, image_url: null, ean: null, prix_unitaire: null, notes: null } as PanierLigne]);
    setRecherche(""); setResultats([]); setShowResultats(false);
    chargerSummary();
  };

  // ─── CRUD Lignes ──────────────────────────────────────────────────────────────

  const supprimerLigne = async (id: string) => {
    await fetch(`/api/panier-lignes/${id}`, { method: "DELETE" });
    setLignes(prev => prev.filter(l => l.id !== id));
    chargerSummary();
  };

  const sauvegarderPrix = async (id: string, valeur: string) => {
    const prix = valeur.trim() ? parseFloat(valeur.replace(",", ".")) : null;
    if (isNaN(prix as number) && prix !== null) return;
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prix_unitaire: prix }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, prix_unitaire: prix } : l));
  };

  const sauvegarderQte = async (id: string, valeur: string) => {
    const qte = Math.max(1, parseInt(valeur) || 1);
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantite: qte }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, quantite: qte } : l));
  };

  const ajouterTag = async (ligneId: string, tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const ligne = lignes.find(l => l.id === ligneId);
    if (!ligne) return;
    const existing = parseTags(ligne.tags);
    if (existing.includes(t)) return;
    const newTags = [...existing, t].join(",");
    await fetch(`/api/panier-lignes/${ligneId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }),
    });
    setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, tags: newTags } : l));
  };

  const supprimerTag = async (ligneId: string, tag: string) => {
    const ligne = lignes.find(l => l.id === ligneId);
    if (!ligne) return;
    const newTags = parseTags(ligne.tags).filter(t => t !== tag).join(",") || null;
    await fetch(`/api/panier-lignes/${ligneId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }),
    });
    setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, tags: newTags } : l));
  };

  const allTags = [...new Set(lignes.flatMap(l => parseTags(l.tags)))].sort();
  const lignesFiltrees = filterTag ? lignes.filter(l => parseTags(l.tags).includes(filterTag)) : lignes;

  // ─── CRUD Commun ──────────────────────────────────────────────────────────────

  const handleEnvoiCommun = (panierCommunId: string, newLigne: PanierCommunLigne) => {
    setCommunLignes(prev => ({ ...prev, [panierCommunId]: [...(prev[panierCommunId] ?? []), newLigne] }));
    chargerSummary();
  };

  const upvoterLigne = async (ligne: PanierCommunLigne) => {
    setCommunLignes(prev => ({
      ...prev,
      [ligne.panier_commun_id]: (prev[ligne.panier_commun_id] ?? [])
        .map(l => l.id === ligne.id ? { ...l, votes: l.votes + 1 } : l)
        .sort((a, b) => b.votes - a.votes),
    }));
    await fetch(`/api/paniers-communs-lignes/${ligne.id}/upvote`, { method: "POST" });
  };

  const supprimerCommunLigne = async (ligne: PanierCommunLigne) => {
    await fetch(`/api/paniers-communs-lignes/${ligne.id}`, { method: "DELETE" });
    setCommunLignes(prev => ({
      ...prev,
      [ligne.panier_commun_id]: (prev[ligne.panier_commun_id] ?? []).filter(l => l.id !== ligne.id),
    }));
    chargerSummary();
  };

  // ─── PDF ──────────────────────────────────────────────────────────────────────

  const exporterPDF = () => {
    if (!panierActuel) return;
    const total = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis – ${panierActuel.nom}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
h1{font-size:22px;font-weight:900;margin-bottom:4px}.meta{color:#666;font-size:12px;margin-bottom:32px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#111;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #e5e5e5;vertical-align:middle}.right{text-align:right}
.total-row td{font-weight:900;font-size:15px;border-top:2px solid #111;padding-top:14px}
@media print{body{padding:20px}}</style></head><body>
<h1>Devis – ${panierActuel.nom}</h1>
<p class="meta">Généré le ${date} · ${lignes.length} article${lignes.length > 1 ? "s" : ""} · Statut : ${panierActuel.statut}</p>
<table><thead><tr><th>Jeu</th><th>Éditeur</th><th class="right">P.U.</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
<tbody>${lignes.map(l => `<tr>
  <td>${l.nom}${l.notes?.startsWith("http") ? ` <a href="${l.notes}" style="color:#666;font-size:10px;" target="_blank">↗</a>` : ""}</td>
  <td>${l.editeur ?? "—"}</td><td class="right">${l.prix_unitaire != null ? l.prix_unitaire.toFixed(2) + " €" : "—"}</td>
  <td class="right">${l.quantite}</td><td class="right">${l.prix_unitaire != null ? (l.prix_unitaire * l.quantite).toFixed(2) + " €" : "—"}</td>
</tr>`).join("")}
<tr class="total-row"><td colspan="4">Total estimé</td><td class="right">${total.toFixed(2)} €</td></tr>
</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ─── Styles communs ───────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 10px",
    background: "var(--white)", outline: "none", fontSize: 14, fontFamily: "inherit", textAlign: "right",
  };

  const backBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
    background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 8,
    fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer",
    marginBottom: 20,
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar current="store" />

      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Titre */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: "uppercase", letterSpacing: "-1px", background: "linear-gradient(135deg, #0d0d0d 40%, var(--rose))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Store</div>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 6 }}>Devis et recherche de jeux</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[{ href: "https://www.myludo.fr", label: "MyLudo" }, { href: "https://www.espritjeu.com", label: "Esprit Jeu" }, { href: "https://www.ludifolie.com", label: "Ludifolie" }]
              .map(({ href, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>{label} ↗</a>
              ))}
          </div>
        </div>

        {/* ── VUE DASHBOARD ── */}
        {view === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Paniers communs */}
            <div>
              <h2 className="bc" style={{ fontSize: 22, marginBottom: 16 }}>Paniers communs</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {PANIERS_COMMUNS.map(p => {
                  const stats = summary.communStats[p.id];
                  return (
                    <button key={p.id} onClick={() => goToBasket(p.id)}
                      style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 14, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden", transition: "transform 0.1s, box-shadow 0.1s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "6px 6px 0 var(--ink)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "4px 4px 0 var(--ink)"; }}>
                      <div style={{ background: TYPE_INFO[p.type].bg, padding: "20px 22px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 36 }}>{TYPE_INFO[p.type].emoji}</span>
                        <span className="bc" style={{ fontSize: 20 }}>{p.nom}</span>
                      </div>
                      <div style={{ padding: "16px 22px", display: "flex", gap: 28 }}>
                        <div>
                          <p className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{stats?.nb ?? 0}</p>
                          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>article{(stats?.nb ?? 0) !== 1 ? "s" : ""}</p>
                        </div>
                        <div>
                          <p className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{(stats?.total ?? 0).toFixed(0)} €</p>
                          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>estimé</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Équipe */}
            {(summary.membres.length > 0 || !isLoading) && (
              <div>
                <h2 className="bc" style={{ fontSize: 22, marginBottom: 16 }}>Équipe</h2>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(summary.membres.length, 1)}, 1fr)`, gap: 16 }}>
                  {summary.membres.map(membre => {
                    const stats = summary.profilStats[membre.nom];
                    return (
                      <button key={membre.nom} onClick={() => goToProfil(membre.nom)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 16px", gap: 10, cursor: "pointer", fontFamily: "inherit", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 14, boxShadow: "3px 3px 0 var(--ink)", transition: "transform 0.1s, box-shadow 0.1s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--ink)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)"; }}>
                        <div style={{ width: 76, height: 76, borderRadius: "50%", background: membre.couleur, border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span className="bc" style={{ fontSize: 34, color: "var(--ink)" }}>{membre.nom[0].toUpperCase()}</span>
                        </div>
                        <p style={{ fontWeight: 900, fontSize: 17, color: "var(--ink)" }}>{membre.nom}</p>
                        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>
                            {stats?.paniers ?? 0} panier{(stats?.paniers ?? 0) !== 1 ? "s" : ""}
                          </p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>
                            {stats?.jeux ?? 0} jeu{(stats?.jeux ?? 0) > 1 ? "x" : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VUE PROFIL ── */}
        {view === "profil" && activeProfil && (() => {
          const membreInfo = summary.membres.find(m => m.nom === activeProfil);
          const profilColor = membreInfo?.couleur ?? "#ccc";
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button onClick={handleBack} style={backBtn}>← Retour</button>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: profilColor, border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="bc" style={{ fontSize: 24 }}>{activeProfil[0].toUpperCase()}</span>
                </div>
                <h2 className="bc" style={{ fontSize: 28, margin: 0 }}>{activeProfil}</h2>
                <span style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>
                  {profilPaniers.length} panier{profilPaniers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button onClick={() => setModalCreate(true)} className="pop-btn pop-btn-dark" style={{ fontSize: 14 }}>+ Nouveau panier</button>
            </div>

            {profilPaniers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <span style={{ fontSize: 40, opacity: 0.2 }}>🛒</span>
                <p style={{ fontWeight: 700, color: "rgba(0,0,0,0.3)", marginTop: 12 }}>Aucun panier — crée-en un !</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                {profilPaniers.map(p => {
                  const ptype = (p.type || "JdS") as PanierType;
                  return (
                    <button key={p.id} onClick={() => goToBasket(p.id)}
                      style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 12, boxShadow: "3px 3px 0 var(--ink)", overflow: "hidden", transition: "transform 0.1s, box-shadow 0.1s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--ink)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)"; }}>
                      <div style={{ background: TYPE_INFO[ptype].bg, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{TYPE_INFO[ptype].emoji}</span>
                        <span style={{ fontWeight: 900, fontSize: 15, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
                      </div>
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <span className="pop-sticker" style={{ ...STATUT_STYLE[p.statut], border: "1.5px solid var(--ink)", fontSize: 11, alignSelf: "flex-start" }}>{p.statut}</span>
                        {parseTags(p.tags).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {parseTags(p.tags).slice(0, 3).map(t => (
                              <span key={t} style={{ fontSize: 10, background: "var(--cream2)", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{t}</span>
                            ))}
                          </div>
                        )}
                        <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontWeight: 600, marginTop: "auto" }}>{new Date(p.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── VUE BASKET ── */}
        {view === "basket" && selectedId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <button onClick={handleBack} style={backBtn}>
                ← {isCommun ? "Store" : (activeProfil ?? "Store")}
              </button>
            </div>

            {isCommun ? (
              /* Panier commun */
              <>
                <div className="pop-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 30 }}>{panierCommunActuel ? TYPE_INFO[panierCommunActuel.type].emoji : ""}</span>
                    <div>
                      <h1 className="bc" style={{ fontSize: 24, margin: 0 }}>{panierCommunActuel?.nom}</h1>
                      <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, marginTop: 2 }}>
                        {lignesCommun.length} article{lignesCommun.length !== 1 ? "s" : ""} · classé par votes
                      </p>
                    </div>
                  </div>
                  <span className="pop-sticker" style={{ background: TYPE_INFO[panierCommunActuel!.type].bg, border: "2px solid var(--ink)", fontSize: 13 }}>{panierCommunActuel?.type}</span>
                </div>

                {lignesCommun.length === 0 ? (
                  <div className="pop-card" style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 15 }}>Panier commun vide — envoie des jeux depuis tes paniers personnels</p>
                  </div>
                ) : (
                  <div className="pop-card" style={{ overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--ink)", color: "var(--cream)" }}>
                          {["Jeu", "Éditeur", "Profil", "Prix", "Votes", ""].map((h, i) => (
                            <th key={i} style={{ textAlign: i >= 3 ? "center" : "left", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", width: i === 5 ? 40 : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lignesCommun.map((ligne, i) => (
                          <tr key={ligne.id} style={{ borderBottom: "1px solid var(--cream2)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {i < 3 && <span style={{ fontSize: 14, flexShrink: 0 }}>{["🥇", "🥈", "🥉"][i]}</span>}
                                {ligne.image_url ? <img src={ligne.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{ligne.nom}</p>
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{ligne.editeur ?? "—"}</td>
                            <td style={{ padding: "10px 16px" }}>
                              {ligne.profil && <span style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>{ligne.profil}</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "center" }}>
                              <span className="bc" style={{ fontSize: 15 }}>{ligne.prix_unitaire != null ? `${ligne.prix_unitaire.toFixed(2)} €` : <span style={{ color: "var(--cream2)" }}>—</span>}</span>
                            </td>
                            <td style={{ padding: "8px 16px", textAlign: "center" }}>
                              <button onClick={() => upvoterLigne(ligne)}
                                style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 14px", borderRadius: 20, cursor: "pointer", background: ligne.votes > 0 ? "var(--yellow)" : "var(--cream2)", border: "2px solid var(--ink)", fontWeight: 900, fontSize: 14, fontFamily: "inherit" }}>
                                ▲ {ligne.votes}
                              </button>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <button onClick={() => supprimerCommunLigne(ligne)}
                                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              /* Panier personnel */
              <>
                <div className="pop-card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <h1 className="bc" style={{ fontSize: 24, margin: 0 }}>{panierActuel?.nom}</h1>
                      {panierActuel && (
                        <span className="pop-sticker" style={{ background: TYPE_INFO[(panierActuel.type || "JdS") as PanierType].bg, border: "1.5px solid var(--ink)", fontSize: 12 }}>
                          {TYPE_INFO[(panierActuel.type || "JdS") as PanierType].emoji} {panierActuel.type ?? "JdS"}
                        </span>
                      )}
                      {panierActuel?.profil && (
                        <span style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}>{panierActuel.profil}</span>
                      )}
                    </div>
                    {parseTags(panierActuel?.tags).length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {parseTags(panierActuel?.tags).map(t => (
                          <span key={t} className="pop-sticker" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)", fontSize: 11 }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {STATUTS.map(s => (
                        <button key={s} onClick={() => changerStatut(panierActuel!.id, s)} className="pop-btn"
                          style={{ padding: "5px 14px", fontSize: 13, ...STATUT_STYLE[s], boxShadow: panierActuel!.statut === s ? "3px 3px 0 var(--ink)" : "none", border: panierActuel!.statut === s ? "2.5px solid var(--ink)" : "2px solid var(--cream2)", opacity: panierActuel!.statut === s ? 1 : 0.5 }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setModalEdit(panierActuel)} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>✏️ Modifier</button>
                    <button onClick={exporterPDF} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>📄 PDF</button>
                    <button onClick={() => supprimerPanier(panierActuel!.id)} className="pop-btn" style={{ fontSize: 13, background: "var(--rouge)", color: "var(--white)" }}>Supprimer</button>
                  </div>
                </div>

                {/* Recherche */}
                <div ref={searchRef} style={{ position: "relative" }}>
                  <input type="text" placeholder={panierActuel?.type === "JV" ? "Rechercher un jeu vidéo…" : "Rechercher un jeu à ajouter…"}
                    value={recherche} onChange={e => lancerRecherche(e.target.value)}
                    onFocus={() => resultats.length > 0 && setShowResultats(true)}
                    className="pop-input" style={{ width: "100%" }} />
                  {recherche.trim().length >= 2 && !isSearching && (
                    <button onClick={ajouterJeuManuel} className="pop-btn pop-btn-outline"
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, padding: "4px 10px" }}>+ Ajouter tel quel</button>
                  )}
                  {isSearching && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, border: "2px solid var(--cream2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                  {showResultats && (
                    <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden" }}>
                      {isSearching ? (
                        <div style={{ padding: 14, textAlign: "center", fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Recherche{panierActuel?.type === "JV" ? " de jeux vidéo" : " sur Philibert"}…</div>
                      ) : resultats.length === 0 ? (
                        <div style={{ padding: 14, textAlign: "center" }}>
                          <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Aucun résultat trouvé</p>
                          <button onClick={ajouterJeuManuel} className="pop-btn pop-btn-dark" style={{ marginTop: 8, fontSize: 12, padding: "5px 12px" }}>Ajouter « {recherche} »</button>
                        </div>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {resultats.map((r, i) => (
                            <li key={i}>
                              <button onClick={() => ajouterJeu(r)}
                                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", background: "none", border: "none", borderBottom: "1px solid var(--cream2)", textAlign: "left", fontFamily: "inherit" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                {r.image_url ? <img src={r.image_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{r.nom}</p>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    {r.editeur && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{r.editeur}</p>}
                                    {r.extra && <span className="pop-sticker" style={{ background: "var(--cream2)", border: "1px solid var(--ink)", fontSize: 10 }}>{r.extra}</span>}
                                  </div>
                                </div>
                                {r.prix != null && <span className="bc" style={{ fontSize: 16, flexShrink: 0 }}>{r.prix.toFixed(2)} €</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Barre de filtres par tag */}
                {allTags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tags</span>
                    <button onClick={() => setFilterTag(null)}
                      style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                        background: filterTag === null ? "var(--ink)" : "var(--cream2)",
                        color: filterTag === null ? "var(--cream)" : "var(--ink)",
                        border: "2px solid var(--ink)" }}>Tous ({lignes.length})</button>
                    {allTags.map(tag => (
                      <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                          background: filterTag === tag ? "var(--ink)" : "var(--cream2)",
                          color: filterTag === tag ? "var(--cream)" : "var(--ink)",
                          border: "2px solid var(--ink)" }}>
                        #{tag} ({lignes.filter(l => parseTags(l.tags).includes(tag)).length})
                      </button>
                    ))}
                  </div>
                )}

                {/* Lignes */}
                {lignes.length === 0 ? (
                  <div className="pop-card" style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 15 }}>Panier vide — cherche un jeu ci-dessus</p>
                  </div>
                ) : (
                  <div className="pop-card" style={{ overflow: "hidden" }}>
                    {lignesFiltrees.length === 0 && (
                      <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 14 }}>
                        Aucun jeu avec le tag #{filterTag}
                      </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--ink)", color: "var(--cream)" }}>
                          {["Jeu", "Éditeur", "P.U.", "Qté", "Total", ""].map((h, i) => (
                            <th key={i} style={{ textAlign: i >= 2 && i <= 4 ? "right" : "left", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", width: i === 5 ? 100 : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lignesFiltrees.map(ligne => {
                          const lTags = parseTags(ligne.tags);
                          const isEditingTag = tagEdit === ligne.id;
                          return (
                          <tr key={ligne.id} style={{ borderBottom: "1px solid var(--cream2)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {ligne.image_url ? <img src={ligne.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <div>
                                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{ligne.nom}</p>
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: lTags.length > 0 || isEditingTag ? 4 : 0 }}>
                                    {lTags.map(t => (
                                      <button key={t} onClick={() => supprimerTag(ligne.id, t)}
                                        title="Retirer ce tag"
                                        style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: filterTag === t ? "var(--ink)" : "var(--cream2)", color: filterTag === t ? "var(--cream)" : "var(--ink)", border: "1.5px solid var(--ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                                        #{t} ×
                                      </button>
                                    ))}
                                    {isEditingTag ? (
                                      <input autoFocus type="text" placeholder="nouveau tag…"
                                        value={tagInput} onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={async e => {
                                          if (e.key === "Enter" && tagInput.trim()) {
                                            await ajouterTag(ligne.id, tagInput);
                                            setTagInput("");
                                          }
                                          if (e.key === "Escape") { setTagEdit(null); setTagInput(""); }
                                        }}
                                        onBlur={() => { setTagEdit(null); setTagInput(""); }}
                                        style={{ fontSize: 11, padding: "1px 6px", border: "1.5px solid var(--ink)", borderRadius: 10, outline: "none", width: 100, fontFamily: "inherit" }} />
                                    ) : (
                                      <button onClick={() => { setTagEdit(ligne.id); setTagInput(""); }}
                                        style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "transparent", color: "rgba(0,0,0,0.3)", border: "1.5px dashed rgba(0,0,0,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
                                        + tag
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{ligne.editeur ?? "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input type="text" inputMode="decimal"
                                value={localPrix[ligne.id] ?? (ligne.prix_unitaire != null ? String(ligne.prix_unitaire) : "")}
                                onChange={e => setLocalPrix(p => ({ ...p, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderPrix(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                placeholder="—" style={{ ...inp, width: 80 }} />
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input type="number" min={1}
                                value={localQte[ligne.id] ?? String(ligne.quantite)}
                                onChange={e => setLocalQte(q => ({ ...q, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderQte(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                style={{ ...inp, width: 60 }} />
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <span className="bc" style={{ fontSize: 16 }}>
                                {ligne.prix_unitaire != null ? `${(ligne.prix_unitaire * ligne.quantite).toFixed(2)} €` : <span style={{ color: "var(--cream2)" }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                {ligne.notes && ligne.notes.startsWith("http") && (
                                  <a href={ligne.notes} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--cream2)", color: "var(--ink)", textDecoration: "none", border: "1.5px solid var(--ink)" }}>↗</a>
                                )}
                                <button onClick={() => setModalEnvoi(ligne)} title="Envoyer vers panier commun"
                                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--cream2)", color: "var(--ink)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>→</button>
                                <button onClick={() => supprimerLigne(ligne.id)}
                                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>✕</button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ borderTop: "2.5px solid var(--ink)", padding: "12px 16px 14px", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: 13, color: "var(--cream2)", fontWeight: 600 }}>
                        {lignes.length} article{lignes.length > 1 ? "s" : ""}{nbSansPrix > 0 && ` · ${nbSansPrix} sans prix`}
                      </p>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 11, color: "var(--cream2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total estimé</p>
                        <p className="bc" style={{ fontSize: 28, color: "var(--yellow)", lineHeight: 1 }}>{totalEstime.toFixed(2)} €</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modalCreate && (
        <ModalPanier defaultProfil={activeProfil ?? undefined} onClose={() => setModalCreate(false)} onSaved={handlePanierSaved} />
      )}
      {modalEdit && (
        <ModalPanier initial={modalEdit} onClose={() => setModalEdit(null)} onSaved={handlePanierSaved} />
      )}
      {modalEnvoi && panierActuel && (
        <ModalEnvoiCommun ligne={modalEnvoi} panierType={(panierActuel.type || "JdS") as PanierType}
          panierProfil={panierActuel.profil ?? null} onClose={() => setModalEnvoi(null)} onSent={handleEnvoiCommun} />
      )}
    </div>
  );
}
