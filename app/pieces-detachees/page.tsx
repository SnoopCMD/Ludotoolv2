"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useIsMobile } from "../../lib/useIsMobile";

type PieceDetachee = { id: number; nom_jeu: string; description: string; created_at: string };

const normaliser = (str: string) =>
  str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function PiecesDetacheesPage() {
  const isMobile = useIsMobile();
  const [pieces, setPieces] = useState<PieceDetachee[]>([]);
  const [recherche, setRecherche] = useState("");

  // Ajout
  const [nomJeu, setNomJeu] = useState("");
  const [desc, setDesc] = useState("");
  const [suggestionsNom, setSuggestionsNom] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Édition en ligne
  const [editId, setEditId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");

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

  const ajouter = async () => {
    if (!nomJeu.trim() || !desc.trim() || isSaving) return;
    setIsSaving(true);
    // On réutilise la casse d'un nom déjà présent pour éviter les doublons « Azul » / « azul ».
    const nomFinal = nomsExistants.find(nom => normaliser(nom) === normaliser(nomJeu)) ?? nomJeu.trim();
    await fetch('/api/pieces-detachees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nom_jeu: nomFinal, description: desc }) });
    setDesc("");
    setSuggestionsNom([]);
    setIsSaving(false);
    chargerPieces();
  };

  const supprimer = async (id: number) => {
    await fetch(`/api/pieces-detachees/${id}`, { method: 'DELETE' });
    setPieces(prev => prev.filter(p => p.id !== id));
  };

  const commencerEdition = (p: PieceDetachee) => { setEditId(p.id); setEditDesc(p.description); };

  const validerEdition = async () => {
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

  const nbJeux = useMemo(() => new Set(pieces.map(p => normaliser(p.nom_jeu))).size, [pieces]);

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 15,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
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
        }}>{nbJeux} jeu{nbJeux > 1 ? "x" : ""}</span>
      </header>

      <div style={{ padding: "var(--page-pad-y) var(--page-pad-x)", display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, width: "100%" }}>

        {/* Formulaire ajout */}
        <div className="pop-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="bc" style={{ fontSize: 18, margin: 0, letterSpacing: "0.03em" }}>Ranger une pièce</p>
          <p style={{ margin: 0, fontSize: 14, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>
            Les pièces en surplus conservées à la ludothèque, dans lesquelles on pioche quand un jeu est incomplet.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Nom du jeu — avec autocomplétion sur les jeux déjà en stock */}
            <div style={{ flex: isMobile ? "1 1 100%" : "0 0 260px", position: "relative" }}>
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

            {/* Description : quantité + pièce */}
            <input
              type="text" placeholder="3 pions rouges, 1 dé, 12 cartes..."
              value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ajouter()}
              style={{ ...inp, flex: 1, minWidth: isMobile ? 0 : 180 }}
            />

            <button
              onClick={ajouter}
              disabled={!nomJeu.trim() || !desc.trim() || isSaving}
              className="pop-btn pop-btn-dark"
              style={{ padding: "9px 20px", fontSize: 15, flex: isMobile ? "1 1 100%" : undefined, justifyContent: "center", opacity: (!nomJeu.trim() || !desc.trim()) ? 0.4 : 1, cursor: (!nomJeu.trim() || !desc.trim()) ? "not-allowed" : "pointer" }}
            >
              <span className="bc" style={{ fontSize: 16 }}>Ajouter</span>
            </button>
          </div>
        </div>

        {/* Recherche */}
        <input
          type="text" placeholder="🔍 Rechercher un jeu ou une pièce..."
          value={recherche} onChange={e => setRecherche(e.target.value)}
          style={{ ...inp, fontSize: 16, padding: "11px 16px" }}
        />

        {/* Liste par jeu */}
        {groupes.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "40px 0" }}>
            {pieces.length === 0 ? "Aucune pièce détachée en stock." : "Aucun jeu ne correspond."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groupes.map(g => (
              <div key={g.nom} className="pop-card" style={{ padding: "14px 20px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 18 }}>{g.nom}</span>
                  <span style={{
                    fontSize: 12, fontWeight: 800, background: "var(--orange)", color: "var(--ink)",
                    border: "1.5px solid var(--ink)", borderRadius: 6, padding: "2px 8px",
                    boxShadow: "1px 1px 0 var(--ink)",
                  }}>{g.pieces.length}</span>
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  {g.pieces.map(p => (
                    <li key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0", borderTop: "1px solid var(--cream2)" }}>
                      {editId === p.id ? (
                        <input
                          autoFocus type="text" value={editDesc}
                          onChange={e => setEditDesc(e.target.value)}
                          onBlur={validerEdition}
                          onKeyDown={e => { if (e.key === "Enter") validerEdition(); if (e.key === "Escape") setEditId(null); }}
                          style={{ ...inp, padding: "5px 10px", flex: 1 }}
                        />
                      ) : (
                        <span onClick={() => commencerEdition(p)} title="Cliquer pour modifier"
                          style={{ flex: 1, minWidth: 0, fontWeight: 500, fontSize: 15, color: "rgba(0,0,0,0.75)", cursor: "text" }}>
                          {p.description}
                        </span>
                      )}
                      <button onClick={() => supprimer(p.id)} title="Retirer du stock"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: "2px 6px", opacity: 0.6 }}>🗑️</button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
