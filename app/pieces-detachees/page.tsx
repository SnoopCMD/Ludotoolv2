"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useIsMobile } from "../../lib/useIsMobile";

type PieceDetachee = { id: number; nom_jeu: string; description: string; quantite: number; created_at: string };

const normaliser = (str: string) =>
  str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function PiecesDetacheesPage() {
  const isMobile = useIsMobile();
  const [pieces, setPieces] = useState<PieceDetachee[]>([]);
  const [recherche, setRecherche] = useState("");

  // Ajout
  const [nomJeu, setNomJeu] = useState("");
  const [qte, setQte] = useState<number | "">(1);
  const [desc, setDesc] = useState("");
  const [suggestionsNom, setSuggestionsNom] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Édition en ligne (description ou quantité)
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editQteId, setEditQteId] = useState<number | null>(null);
  const [editQte, setEditQte] = useState("");

  useEffect(() => { chargerPieces(); }, []);

  const chargerPieces = async () => {
    const data = await fetch('/api/pieces-detachees').then(r => r.json() as Promise<any>).catch(() => []);
    if (Array.isArray(data)) setPieces(data);
  };

  // Noms de jeux déjà en stock : l'autocomplétion pousse à réutiliser
  // exactement la même orthographe pour que les pièces restent groupées.
  const nomsExistants = useMemo(() => {
    const vus = new Map<string, string>();
    for (const p of pieces) { const k = normaliser(p.nom_jeu); if (!vus.has(k)) vus.set(k, p.nom_jeu); }
    return [...vus.values()].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [pieces]);

  const handleNomJeu = (text: string) => {
    setNomJeu(text);
    const n = normaliser(text);
    setSuggestionsNom(n.length > 1 ? nomsExistants.filter(nom => normaliser(nom).includes(n) && normaliser(nom) !== n).slice(0, 6) : []);
  };

  const formulaireValide = !!nomJeu.trim() && !!desc.trim() && Number(qte) >= 1;

  const ajouter = async () => {
    if (!formulaireValide || isSaving) return;
    setIsSaving(true);
    // On réutilise la casse d'un nom déjà présent pour éviter les doublons « Azul » / « azul ».
    const nomFinal = nomsExistants.find(nom => normaliser(nom) === normaliser(nomJeu)) ?? nomJeu.trim();
    await fetch('/api/pieces-detachees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_jeu: nomFinal, description: desc, quantite: Number(qte) }) });
    setDesc(""); setQte(1);
    setSuggestionsNom([]);
    setIsSaving(false);
    chargerPieces();
  };

  const supprimer = async (id: number) => {
    await fetch(`/api/pieces-detachees/${id}`, { method: 'DELETE' });
    setPieces(prev => prev.filter(p => p.id !== id));
  };

  // Changement de quantité : à 0 la ligne disparaît (l'API la supprime).
  const changerQuantite = async (p: PieceDetachee, nouvelle: number) => {
    const q = Math.max(0, Math.floor(nouvelle));
    if (q === p.quantite) return;
    if (q === 0 && !confirm(`Plus aucun(e) « ${p.description} » pour ${p.nom_jeu} : retirer la ligne ?`)) return;
    await fetch(`/api/pieces-detachees/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantite: q }) });
    setPieces(prev => q === 0 ? prev.filter(x => x.id !== p.id) : prev.map(x => x.id === p.id ? { ...x, quantite: q } : x));
  };

  const validerEditQte = (p: PieceDetachee) => {
    const q = parseInt(editQte, 10);
    setEditQteId(null);
    if (Number.isFinite(q)) changerQuantite(p, q);
  };

  const validerEditDesc = async () => {
    if (editId === null) return;
    const description = editDesc.trim();
    if (description) {
      await fetch(`/api/pieces-detachees/${editId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description }) });
      setPieces(prev => prev.map(p => p.id === editId ? { ...p, description } : p));
    }
    setEditId(null);
  };

  // Regroupement par jeu, filtré par la recherche (sur le nom ou la pièce)
  const groupes = useMemo(() => {
    const q = normaliser(recherche);
    const parJeu = new Map<string, { nom: string; pieces: PieceDetachee[] }>();
    for (const p of pieces) {
      if (q && !normaliser(p.nom_jeu).includes(q) && !normaliser(p.description).includes(q)) continue;
      const k = normaliser(p.nom_jeu);
      if (!parJeu.has(k)) parJeu.set(k, { nom: p.nom_jeu, pieces: [] });
      parJeu.get(k)!.pieces.push(p);
    }
    return [...parJeu.values()].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  }, [pieces, recherche]);

  // Disposition « Pinterest » : les jeux restent triés par ordre alphabétique,
  // mais chaque carte va dans la colonne la moins haute pour combler les trous.
  // La hauteur est estimée (en-tête + une ligne par pièce, deux si le libellé
  // est long) : suffisant pour équilibrer, sans mesurer le DOM.
  const gridRef = useRef<HTMLDivElement>(null);
  const [nbColonnes, setNbColonnes] = useState(1);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const calc = () => setNbColonnes(isMobile ? 1 : Math.max(1, Math.floor((el.clientWidth + 14) / (300 + 14))));
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  const colonnes = useMemo(() => {
    const cols: { hauteur: number; items: typeof groupes }[] = Array.from({ length: nbColonnes }, () => ({ hauteur: 0, items: [] }));
    for (const g of groupes) {
      const h = 48 + g.pieces.reduce((s, p) => s + (p.description.length > 26 ? 52 : 38), 0) + 14;
      const cible = cols.reduce((min, c) => c.hauteur < min.hauteur ? c : min, cols[0]);
      cible.items.push(g);
      cible.hauteur += h;
    }
    return cols.map(c => c.items);
  }, [groupes, nbColonnes]);

  const nbJeux = useMemo(() => new Set(pieces.map(p => normaliser(p.nom_jeu))).size, [pieces]);
  const nbPieces = useMemo(() => pieces.reduce((s, p) => s + (p.quantite || 0), 0), [pieces]);

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 15,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  const stepBtn: React.CSSProperties = {
    width: 26, height: 26, borderRadius: 6, border: "2px solid var(--ink)",
    background: "var(--white)", cursor: "pointer", fontWeight: 800, fontSize: 15,
    lineHeight: 1, padding: 0, fontFamily: "inherit", flexShrink: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  };

  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>

      {/* Mini sticky header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200, height: 56,
        background: "var(--cream)", borderBottom: "2.5px solid var(--ink)",
        display: "flex", alignItems: "center", padding: "0 var(--page-pad-x)", gap: isMobile ? 8 : 16,
      }}>
        <Link href="/atelier" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--ink)", color: "var(--cream)",
          border: "2px solid var(--ink)", borderRadius: 6,
          padding: "4px 12px", fontWeight: 700, fontSize: 14,
          textDecoration: "none", boxShadow: "2px 2px 0 rgba(0,0,0,0.3)",
          fontFamily: "inherit",
        }}>← Atelier</Link>
        <h1 className="bc" style={{
          fontSize: isMobile ? 19 : 24, letterSpacing: "0.03em", margin: 0,
          background: "linear-gradient(90deg, var(--orange), var(--rouge))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Pièces détachées</h1>
        <span style={{
          marginLeft: "auto", background: "var(--orange)", color: "var(--ink)",
          border: "2px solid var(--ink)", borderRadius: 20, padding: "2px 12px",
          fontSize: 14, fontWeight: 700, boxShadow: "2px 2px 0 var(--ink)", whiteSpace: "nowrap",
        }}>{nbJeux} jeu{nbJeux > 1 ? "x" : ""}{!isMobile && ` · ${nbPieces} pièces`}</span>
      </header>

      <div style={{ padding: "var(--page-pad-y) var(--page-pad-x)", display: "flex", flexDirection: "column", gap: 20, width: "100%", boxSizing: "border-box" }}>

        {/* Formulaire ajout + recherche, côte à côte sur grand écran */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr)", gap: 16, alignItems: "stretch" }}>
          <div className="pop-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
            <p className="bc" style={{ fontSize: 18, margin: 0, letterSpacing: "0.03em" }}>Ranger une pièce</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {/* Nom du jeu — avec autocomplétion sur les jeux déjà en stock */}
              <div style={{ flex: isMobile ? "1 1 100%" : "1 1 220px", position: "relative" }}>
                <input
                  type="text" placeholder="Nom du jeu..." value={nomJeu}
                  onChange={e => handleNomJeu(e.target.value)}
                  onBlur={() => setTimeout(() => setSuggestionsNom([]), 150)}
                  style={{ ...inp, fontWeight: 700 }}
                />
                {suggestionsNom.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                    background: "var(--white)", border: "2px solid var(--ink)",
                    borderRadius: 8, boxShadow: "4px 4px 0 var(--ink)", marginTop: 4,
                    overflow: "hidden",
                  }}>
                    {suggestionsNom.map(nom => (
                      <div key={nom} onMouseDown={() => { setNomJeu(nom); setSuggestionsNom([]); }}
                        style={{ padding: "10px 14px", cursor: "pointer", fontWeight: 700, fontSize: 15, borderBottom: "1px solid var(--cream2)" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                      >{nom}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quantité */}
              <input
                type="number" min={1} inputMode="numeric" placeholder="Qté" value={qte}
                onChange={e => setQte(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={{ ...inp, width: isMobile ? 80 : 90, flex: "0 0 auto", textAlign: "center", fontWeight: 800 }}
              />

              {/* Nature de la pièce */}
              <input
                type="text" placeholder="pions rouges, cartes, dé..."
                value={desc} onChange={e => setDesc(e.target.value)}
                onKeyDown={e => e.key === "Enter" && ajouter()}
                style={{ ...inp, flex: "1 1 200px", minWidth: 0 }}
              />

              <button
                onClick={ajouter}
                disabled={!formulaireValide || isSaving}
                className="pop-btn pop-btn-dark"
                style={{ padding: "9px 20px", fontSize: 15, flex: isMobile ? "1 1 100%" : "0 0 auto", justifyContent: "center", opacity: formulaireValide ? 1 : 0.4, cursor: formulaireValide ? "pointer" : "not-allowed" }}
              >
                <span className="bc" style={{ fontSize: 16 }}>Ajouter</span>
              </button>
            </div>
          </div>

          <div className="pop-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}>
            <p className="bc" style={{ fontSize: 18, margin: 0, letterSpacing: "0.03em" }}>Chercher</p>
            <input
              type="text" placeholder="🔍 Jeu ou pièce..."
              value={recherche} onChange={e => setRecherche(e.target.value)}
              style={{ ...inp, fontSize: 16 }}
            />
            {recherche && <span style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", fontWeight: 600 }}>{groupes.length} jeu{groupes.length > 1 ? "x" : ""} trouvé{groupes.length > 1 ? "s" : ""}</span>}
          </div>
        </div>

        {/* Grille des jeux */}
        <div ref={gridRef} style={{ width: "100%" }}>
        {groupes.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "40px 0" }}>
            {pieces.length === 0 ? "Aucune pièce détachée en stock." : "Aucun jeu ne correspond."}
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${nbColonnes}, minmax(0, 1fr))`, gap: 14, alignItems: "start" }}>
            {colonnes.map((items, ci) => (
            <div key={ci} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {items.map(g => (
              <div key={g.nom} className="pop-card" style={{ padding: "12px 16px 8px", background: "var(--white)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontWeight: 800, fontSize: 17, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.nom}>{g.nom}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 800, background: "var(--orange)", color: "var(--ink)",
                    border: "1.5px solid var(--ink)", borderRadius: 6, padding: "1px 7px",
                    boxShadow: "1px 1px 0 var(--ink)", whiteSpace: "nowrap",
                  }}>{g.pieces.length} type{g.pieces.length > 1 ? "s" : ""}</span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.pieces.map(p => (
                    <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--cream2)" }}>
                      {/* Stepper de quantité : − / valeur éditable / + */}
                      <button onClick={() => changerQuantite(p, p.quantite - 1)} title="En retirer une" style={stepBtn}>−</button>
                      {editQteId === p.id ? (
                        <input
                          autoFocus type="number" min={0} inputMode="numeric" value={editQte}
                          onChange={e => setEditQte(e.target.value)}
                          onBlur={() => validerEditQte(p)}
                          onKeyDown={e => { if (e.key === "Enter") validerEditQte(p); if (e.key === "Escape") setEditQteId(null); }}
                          style={{ ...inp, width: 56, padding: "2px 4px", textAlign: "center", fontWeight: 800, fontSize: 15 }}
                        />
                      ) : (
                        <span onClick={() => { setEditQteId(p.id); setEditQte(String(p.quantite)); }} title="Cliquer pour saisir la quantité"
                          className="bc" style={{ minWidth: 34, textAlign: "center", fontSize: 19, cursor: "text", lineHeight: 1 }}>
                          {p.quantite}
                        </span>
                      )}
                      <button onClick={() => changerQuantite(p, p.quantite + 1)} title="En ajouter une" style={stepBtn}>+</button>

                      {editId === p.id ? (
                        <input
                          autoFocus type="text" value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          onBlur={validerEditDesc}
                          onKeyDown={e => { if (e.key === "Enter") validerEditDesc(); if (e.key === "Escape") setEditId(null); }}
                          style={{ ...inp, padding: "4px 8px", flex: 1, fontSize: 14 }}
                        />
                      ) : (
                        <span onClick={() => { setEditId(p.id); setEditDesc(p.description); }} title="Cliquer pour modifier"
                          style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 14, color: "rgba(0,0,0,0.75)", cursor: "text", lineHeight: 1.25 }}>
                          {p.description}
                        </span>
                      )}
                      <button onClick={() => { if (confirm(`Retirer toute la ligne « ${p.quantite} ${p.description} » de ${p.nom_jeu} ?`)) supprimer(p.id); }} title="Retirer toute la ligne"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "2px 4px", opacity: 0.5, flexShrink: 0 }}>🗑️</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
