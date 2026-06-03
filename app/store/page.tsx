"use client";
import { useState, useEffect, useRef } from "react";
import type { JeuRecherche } from "../api/store/recherche/route";
import NavBar from "../../components/NavBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Panier = {
  id: string;
  nom: string;
  statut: "En cours" | "Commandé" | "Reçu";
  notes: string | null;
  created_at: string;
};

type PanierLigne = {
  id: string;
  panier_id: string;
  nom: string;
  editeur: string | null;
  image_url: string | null;
  ean: string | null;
  prix_unitaire: number | null;
  quantite: number;
  notes: string | null;
};

const STATUTS: Panier["statut"][] = ["En cours", "Commandé", "Reçu"];

const STATUT_STYLE: Record<Panier["statut"], React.CSSProperties> = {
  "En cours": { background: "var(--yellow)", color: "var(--ink)" },
  "Commandé": { background: "var(--bleu)",   color: "var(--ink)" },
  "Reçu":     { background: "var(--vert)",   color: "var(--ink)" },
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function StorePage() {
  const [paniers, setPaniers] = useState<Panier[]>([]);
  const [panierId, setPanierId] = useState<string | null>(null);
  const [lignes, setLignes] = useState<PanierLigne[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isNouveauOpen, setIsNouveauOpen] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [isSavingPanier, setIsSavingPanier] = useState(false);

  const [recherche, setRecherche] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [resultats, setResultats] = useState<JeuRecherche[]>([]);
  const [showResultats, setShowResultats] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [localPrix, setLocalPrix] = useState<Record<string, string>>({});
  const [localQte, setLocalQte] = useState<Record<string, string>>({});

  // ─── Chargement ──────────────────────────────────────────────────────────────

  const chargerPaniers = async () => {
    const data = await fetch('/api/paniers').then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setPaniers(data as Panier[]);
    setIsLoading(false);
  };

  const chargerLignes = async (id: string) => {
    const data = await fetch(`/api/panier-lignes?panier_id=${id}`).then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setLignes(data as PanierLigne[]);
  };

  useEffect(() => { chargerPaniers(); }, []);
  useEffect(() => { if (panierId) chargerLignes(panierId); else setLignes([]); }, [panierId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResultats(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Panier CRUD ─────────────────────────────────────────────────────────────

  const creerPanier = async () => {
    if (!nouveauNom.trim()) return;
    setIsSavingPanier(true);
    const res = await fetch('/api/paniers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: nouveauNom.trim() }),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) {
      const newPanier: Panier = { id: res.id, nom: nouveauNom.trim(), statut: 'En cours', notes: null, created_at: new Date().toISOString() };
      setPaniers(prev => [newPanier, ...prev]);
      setPanierId(res.id);
    }
    setNouveauNom(""); setIsNouveauOpen(false); setIsSavingPanier(false);
  };

  const changerStatut = async (id: string, statut: Panier["statut"]) => {
    await fetch(`/api/paniers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statut }),
    });
    setPaniers(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
  };

  const supprimerPanier = async (id: string) => {
    if (!confirm("Supprimer ce panier et toutes ses lignes ?")) return;
    await fetch(`/api/paniers/${id}`, { method: 'DELETE' });
    setPaniers(prev => prev.filter(p => p.id !== id));
    if (panierId === id) setPanierId(null);
  };

  // ─── Recherche ───────────────────────────────────────────────────────────────

  const lancerRecherche = (val: string) => {
    setRecherche(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setResultats([]); setShowResultats(false); return; }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true); setShowResultats(true);
      try {
        const res = await fetch(`/api/store/recherche?nom=${encodeURIComponent(val.trim())}`);
        const data = await res.json() as any;
        setResultats(data.resultats ?? []);
      } catch { setResultats([]); }
      finally { setIsSearching(false); }
    }, 500);
  };

  const ajouterJeu = async (jeu: JeuRecherche) => {
    if (!panierId) return;
    const payload = { panier_id: panierId, nom: jeu.nom, editeur: jeu.editeur, image_url: jeu.image_url, prix_unitaire: jeu.prix, quantite: 1, notes: jeu.url_source ?? null };
    const res = await fetch('/api/panier-lignes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setLignes(prev => [...prev, { ...payload, id: res.id, ean: null } as PanierLigne]);
    setRecherche(""); setResultats([]); setShowResultats(false);
  };

  const ajouterJeuManuel = async () => {
    if (!panierId || !recherche.trim()) return;
    const payload = { panier_id: panierId, nom: recherche.trim(), quantite: 1 };
    const res = await fetch('/api/panier-lignes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setLignes(prev => [...prev, { ...payload, id: res.id, editeur: null, image_url: null, ean: null, prix_unitaire: null, notes: null } as PanierLigne]);
    setRecherche(""); setResultats([]); setShowResultats(false);
  };

  // ─── Lignes CRUD ─────────────────────────────────────────────────────────────

  const supprimerLigne = async (id: string) => {
    await fetch(`/api/panier-lignes/${id}`, { method: 'DELETE' });
    setLignes(prev => prev.filter(l => l.id !== id));
  };

  const sauvegarderPrix = async (id: string, valeur: string) => {
    const prix = valeur.trim() ? parseFloat(valeur.replace(",", ".")) : null;
    if (isNaN(prix as number) && prix !== null) return;
    await fetch(`/api/panier-lignes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prix_unitaire: prix }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, prix_unitaire: prix } : l));
  };

  const sauvegarderQte = async (id: string, valeur: string) => {
    const qte = Math.max(1, parseInt(valeur) || 1);
    await fetch(`/api/panier-lignes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantite: qte }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, quantite: qte } : l));
  };

  // ─── PDF ─────────────────────────────────────────────────────────────────────

  const exporterPDF = () => {
    const panier = paniers.find(p => p.id === panierId);
    if (!panier) return;
    const total = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Devis – ${panier.nom}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 40px; color: #111; font-size: 13px; }
    h1 { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; background: #111; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #111; padding-top: 14px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Devis – ${panier.nom}</h1>
  <p class="meta">Généré le ${date} · ${lignes.length} article${lignes.length > 1 ? "s" : ""} · Statut : ${panier.statut}</p>
  <table>
    <thead><tr><th>Jeu</th><th>Éditeur</th><th class="right">P.U.</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
    <tbody>
      ${lignes.map(l => `
      <tr>
        <td>${l.nom}${l.notes?.startsWith("http") ? ` <a href="${l.notes}" style="color:#666;font-size:10px;" target="_blank">↗</a>` : ""}</td>
        <td>${l.editeur ?? "—"}</td>
        <td class="right">${l.prix_unitaire != null ? l.prix_unitaire.toFixed(2) + " €" : "—"}</td>
        <td class="right">${l.quantite}</td>
        <td class="right">${l.prix_unitaire != null ? (l.prix_unitaire * l.quantite).toFixed(2) + " €" : "—"}</td>
      </tr>`).join("")}
      <tr class="total-row"><td colspan="4">Total estimé</td><td class="right">${total.toFixed(2)} €</td></tr>
    </tbody>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ─── Calculs ─────────────────────────────────────────────────────────────────

  const panierActuel = paniers.find(p => p.id === panierId) ?? null;
  const totalEstime = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
  const nbSansPrix = lignes.filter(l => l.prix_unitaire == null).length;

  const inp: React.CSSProperties = {
    border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 10px",
    background: "var(--white)", outline: "none", fontSize: 14,
    fontFamily: "inherit", textAlign: "right",
  };

  // ─── Rendu ───────────────────────────────────────────────────────────────────

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
          {/* Liens rapides */}
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {[
            { href: "https://www.myludo.fr", label: "MyLudo" },
            { href: "https://www.espritjeu.com", label: "Esprit Jeu" },
            { href: "https://www.ludifolie.com", label: "Ludifolie" },
          ].map(({ href, label }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>
              {label} ↗
            </a>
          ))}
          </div>
        </div>

        {/* Layout principal */}
        <div style={{ display: "flex", gap: 20, flex: 1, alignItems: "flex-start" }}>

          {/* ── Sidebar paniers ── */}
          <aside style={{ width: 240, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span className="bc" style={{ fontSize: 18 }}>Paniers</span>
              <button
                onClick={() => setIsNouveauOpen(true)}
                className="pop-btn pop-btn-dark"
                style={{ width: 32, height: 32, padding: 0, fontSize: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
              >+</button>
            </div>

            {isLoading ? (
              <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Chargement…</p>
            ) : paniers.length === 0 ? (
              <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Aucun panier. Crée-en un !</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {paniers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setPanierId(p.id)}
                    style={{
                      width: "100%", textAlign: "left", padding: "12px 14px",
                      background: panierId === p.id ? "var(--yellow)" : "var(--white)",
                      border: "2.5px solid var(--ink)", borderRadius: 10,
                      boxShadow: panierId === p.id ? "4px 4px 0 var(--ink)" : "2px 2px 0 var(--ink)",
                      cursor: "pointer", fontFamily: "inherit",
                      transition: "all 0.1s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <p style={{ fontWeight: 800, fontSize: 14, color: "var(--ink)", lineHeight: 1.3 }}>{p.nom}</p>
                      <span className="pop-sticker" style={{ ...STATUT_STYLE[p.statut], border: "1.5px solid var(--ink)", flexShrink: 0 }}>
                        {p.statut}
                      </span>
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", fontWeight: 500, marginTop: 4 }}>
                      {new Date(p.created_at).toLocaleDateString("fr-FR")}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* ── Zone principale ── */}
          <main style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {!panierActuel ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 12, textAlign: "center" }}>
                <span style={{ fontSize: 48, opacity: 0.25 }}>🛒</span>
                <p style={{ fontWeight: 800, color: "rgba(0,0,0,0.3)", fontSize: 16 }}>Sélectionne ou crée un panier</p>
              </div>
            ) : (
              <>
                {/* En-tête panier */}
                <div className="pop-card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div>
                    <h1 className="bc" style={{ fontSize: 26, margin: 0 }}>{panierActuel.nom}</h1>
                    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      {STATUTS.map(s => (
                        <button
                          key={s}
                          onClick={() => changerStatut(panierActuel.id, s)}
                          className="pop-btn"
                          style={{
                            padding: "5px 14px", fontSize: 13,
                            ...STATUT_STYLE[s],
                            boxShadow: panierActuel.statut === s ? "3px 3px 0 var(--ink)" : "none",
                            border: panierActuel.statut === s ? "2.5px solid var(--ink)" : "2px solid var(--cream2)",
                            opacity: panierActuel.statut === s ? 1 : 0.5,
                          }}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={exporterPDF} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>📄 PDF</button>
                    <button onClick={() => supprimerPanier(panierActuel.id)} className="pop-btn" style={{ fontSize: 13, background: "var(--rouge)", color: "var(--white)" }}>
                      Supprimer
                    </button>
                  </div>
                </div>

                {/* Barre de recherche */}
                <div ref={searchRef} style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Rechercher un jeu à ajouter…"
                    value={recherche}
                    onChange={e => lancerRecherche(e.target.value)}
                    onFocus={() => resultats.length > 0 && setShowResultats(true)}
                    className="pop-input"
                    style={{ width: "100%" }}
                  />
                  {recherche.trim().length >= 2 && !isSearching && (
                    <button
                      onClick={ajouterJeuManuel}
                      className="pop-btn pop-btn-outline"
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, padding: "4px 10px" }}
                    >+ Ajouter tel quel</button>
                  )}
                  {isSearching && (
                    <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, border: "2px solid var(--cream2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                  )}

                  {showResultats && (
                    <div style={{
                      position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0,
                      background: "var(--white)", border: "2.5px solid var(--ink)",
                      borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden",
                    }}>
                      {isSearching ? (
                        <div style={{ padding: "14px", textAlign: "center", fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Recherche sur Philibert…</div>
                      ) : resultats.length === 0 ? (
                        <div style={{ padding: "14px", textAlign: "center" }}>
                          <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Aucun résultat trouvé</p>
                          <button onClick={ajouterJeuManuel} className="pop-btn pop-btn-dark" style={{ marginTop: 8, fontSize: 12, padding: "5px 12px" }}>
                            Ajouter « {recherche} »
                          </button>
                        </div>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {resultats.map((r, i) => (
                            <li key={i}>
                              <button
                                onClick={() => ajouterJeu(r)}
                                style={{
                                  width: "100%", display: "flex", alignItems: "center", gap: 12,
                                  padding: "10px 16px", cursor: "pointer", background: "none",
                                  border: "none", borderBottom: "1px solid var(--cream2)",
                                  textAlign: "left", fontFamily: "inherit",
                                }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                              >
                                {r.image_url ? (
                                  <img src={r.image_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{r.nom}</p>
                                  {r.editeur && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{r.editeur}</p>}
                                </div>
                                {r.prix != null && (
                                  <span className="bc" style={{ fontSize: 16, flexShrink: 0 }}>{r.prix.toFixed(2)} €</span>
                                )}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Tableau lignes */}
                {lignes.length === 0 ? (
                  <div className="pop-card" style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 15 }}>Panier vide — cherche un jeu ci-dessus</p>
                  </div>
                ) : (
                  <div className="pop-card" style={{ overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--ink)", color: "var(--cream)" }}>
                          <th style={{ textAlign: "left", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Jeu</th>
                          <th style={{ textAlign: "left", padding: "10px 12px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Éditeur</th>
                          <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>P.U.</th>
                          <th style={{ textAlign: "right", padding: "10px 12px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Qté</th>
                          <th style={{ textAlign: "right", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total</th>
                          <th style={{ width: 40 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {lignes.map(ligne => (
                          <tr key={ligne.id} style={{ borderBottom: "1px solid var(--cream2)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          >
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {ligne.image_url ? (
                                  <img src={ligne.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                ) : (
                                  <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                )}
                                <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{ligne.nom}</p>
                              </div>
                            </td>
                            <td style={{ padding: "10px 12px", fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{ligne.editeur ?? "—"}</td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input
                                type="text" inputMode="decimal"
                                value={localPrix[ligne.id] ?? (ligne.prix_unitaire != null ? String(ligne.prix_unitaire) : "")}
                                onChange={e => setLocalPrix(p => ({ ...p, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderPrix(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                placeholder="—"
                                style={{ ...inp, width: 80 }}
                              />
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input
                                type="number" min={1}
                                value={localQte[ligne.id] ?? String(ligne.quantite)}
                                onChange={e => setLocalQte(q => ({ ...q, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderQte(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                style={{ ...inp, width: 60 }}
                              />
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <span className="bc" style={{ fontSize: 16 }}>
                                {ligne.prix_unitaire != null
                                  ? `${(ligne.prix_unitaire * ligne.quantite).toFixed(2)} €`
                                  : <span style={{ color: "var(--cream2)" }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                {ligne.notes && ligne.notes.startsWith("http") && (
                                  <a href={ligne.notes} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--cream2)", color: "var(--ink)", textDecoration: "none", border: "1.5px solid var(--ink)" }}>↗</a>
                                )}
                                <button onClick={() => supprimerLigne(ligne.id)}
                                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>✕</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Total */}
                    <div style={{ borderTop: "2.5px solid var(--ink)", padding: "12px 16px 14px", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: 13, color: "var(--cream2)", fontWeight: 600 }}>
                        {lignes.length} article{lignes.length > 1 ? "s" : ""}
                        {nbSansPrix > 0 && ` · ${nbSansPrix} sans prix`}
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
          </main>
        </div>
      </div>

      {/* ── Modal nouveau panier ── */}
      {isNouveauOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80,
          display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px",
        }}
          onClick={e => { if (e.target === e.currentTarget) { setIsNouveauOpen(false); setNouveauNom(""); } }}
        >
          <div className="pop-card" style={{ width: "100%", maxWidth: 400, maxHeight: "calc(100vh - 96px)", overflow: "hidden" }}>
            <div style={{ background: "var(--ink)", padding: "16px 20px" }}>
              <h2 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>Nouveau panier</h2>
            </div>
            <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <input
                autoFocus type="text" placeholder="Nom du panier…"
                value={nouveauNom}
                onChange={e => setNouveauNom(e.target.value)}
                onKeyDown={e => e.key === "Enter" && creerPanier()}
                className="pop-input"
                style={{ width: "100%" }}
              />
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => { setIsNouveauOpen(false); setNouveauNom(""); }}
                  className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
                <button onClick={creerPanier} disabled={!nouveauNom.trim() || isSavingPanier}
                  className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: (!nouveauNom.trim() || isSavingPanier) ? 0.4 : 1 }}>
                  {isSavingPanier ? "Création…" : "Créer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
