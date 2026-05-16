"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

type Reparation = {
  id: number;
  ean: string;
  nom: string;
  type_reparation: string;
  description: string;
  statut: string;
};

export default function ReparationsPage() {
  const [reparations, setReparations] = useState<Reparation[]>([]);
  const [eanJeu, setEanJeu] = useState("");
  const [nomJeu, setNomJeu] = useState("");
  const [typeRep, setTypeRep] = useState("Boîte");
  const [customType, setCustomType] = useState("");
  const [desc, setDesc] = useState("");

  const [typesDispos, setTypesDispos] = useState(["Boîte", "Plateau", "Cartes", "Autre"]);
  const [suggestionsNom, setSuggestionsNom] = useState<{ nom: string; code_syracuse: string; ean: string }[]>([]);

  useEffect(() => { chargerReparations(); }, []);

  const chargerReparations = async () => {
    const { data } = await supabase.from("reparations").select("*").order("id", { ascending: false });
    if (data) setReparations(data);
  };

  const appliquerFiltresTypes = async (ean: string | undefined) => {
    if (!ean) { setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]); setTypeRep("Boîte"); return; }
    const { data: catData } = await supabase.from("catalogue").select("contenu").eq("ean", ean).limit(1).maybeSingle();
    const contenuTexte = catData?.contenu ? catData.contenu.toLowerCase() : "";
    const nouveauxTypes = ["Boîte"];
    if (contenuTexte.includes("plateau")) nouveauxTypes.push("Plateau");
    if (contenuTexte.includes("carte")) nouveauxTypes.push("Cartes");
    nouveauxTypes.push("Autre");
    setTypesDispos(nouveauxTypes);
    setTypeRep("Boîte");
  };

  const chercherJeuViaEan = async (code: string) => {
    if (!code || code.trim() === "") return;
    let codeFormate = code.trim();
    if (/^\d+$/.test(codeFormate) && codeFormate.length < 8) { codeFormate = codeFormate.padStart(8, "0"); setEanJeu(codeFormate); }
    const { data: jeuData } = await supabase.from("jeux").select("nom, ean").eq("code_syracuse", codeFormate).limit(1).maybeSingle();
    if (jeuData?.nom) { setNomJeu(jeuData.nom); appliquerFiltresTypes(jeuData.ean); }
    else { setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]); }
  };

  const handleRechercheNom = async (text: string) => {
    setNomJeu(text);
    if (text.length > 2) {
      const { data } = await supabase.from("jeux").select("nom, code_syracuse, ean").ilike("nom", `%${text}%`).limit(5);
      if (data) setSuggestionsNom(data.filter((v, i, a) => a.findIndex(t => t.nom === v.nom) === i));
    } else setSuggestionsNom([]);
  };

  const selectionnerSuggestion = (jeu: { nom: string; code_syracuse: string; ean: string }) => {
    setNomJeu(jeu.nom);
    if (jeu.code_syracuse) setEanJeu(jeu.code_syracuse);
    setSuggestionsNom([]);
    appliquerFiltresTypes(jeu.ean);
  };

  const ajouterReparation = async () => {
    if (!nomJeu && !eanJeu) return;
    const typeFinal = typeRep === "Autre" && customType ? customType : typeRep;
    await supabase.from("reparations").insert([{ ean: eanJeu, nom: nomJeu, type_reparation: typeFinal, description: desc }]);
    setEanJeu(""); setNomJeu(""); setDesc(""); setCustomType(""); setTypeRep("Boîte");
    setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]);
    setSuggestionsNom([]);
    chargerReparations();
  };

  const changerStatut = async (id: number, statutActuel: string) => {
    const nouveauStatut = statutActuel === "À faire" ? "Terminé" : "À faire";
    await supabase.from("reparations").update({ statut: nouveauStatut }).eq("id", id);
    chargerReparations();
  };

  const supprimer = async (id: number) => {
    await supabase.from("reparations").delete().eq("id", id);
    chargerReparations();
  };

  const aFaire = reparations.filter(r => r.statut === "À faire");
  const termines = reparations.filter(r => r.statut !== "À faire");

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 15,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>

      {/* Mini sticky header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200, height: 56,
        background: "var(--cream)", borderBottom: "2.5px solid var(--ink)",
        display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
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
          fontSize: 24, letterSpacing: "0.03em", margin: 0,
          background: "linear-gradient(90deg, var(--orange), var(--rouge))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Réparations</h1>
        <span style={{
          marginLeft: "auto", background: "var(--orange)", color: "var(--ink)",
          border: "2px solid var(--ink)", borderRadius: 20, padding: "2px 12px",
          fontSize: 14, fontWeight: 700, boxShadow: "2px 2px 0 var(--ink)",
        }}>{aFaire.length} à faire</span>
      </header>

      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 900, width: "100%" }}>

        {/* Formulaire ajout */}
        <div className="pop-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <p className="bc" style={{ fontSize: 18, margin: 0, letterSpacing: "0.03em" }}>Signaler une réparation</p>

          <div style={{ display: "flex", gap: 12 }}>
            {/* Code Syracuse */}
            <input
              type="text" placeholder="Code Syracuse..." value={eanJeu}
              onChange={e => setEanJeu(e.target.value)}
              onBlur={() => chercherJeuViaEan(eanJeu)}
              onKeyDown={e => e.key === "Enter" && chercherJeuViaEan(eanJeu)}
              style={{ ...inp, width: 160, flexShrink: 0 }}
            />
            {/* Nom — avec autocomplétion */}
            <div style={{ flex: 1, position: "relative" }}>
              <input
                type="text" placeholder="Nom du jeu..." value={nomJeu}
                onChange={e => handleRechercheNom(e.target.value)}
                style={{ ...inp, fontWeight: 700 }}
              />
              {suggestionsNom.length > 0 && (
                <div style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50,
                  background: "var(--white)", border: "2px solid var(--ink)",
                  borderRadius: 8, boxShadow: "4px 4px 0 var(--ink)", marginTop: 4,
                  overflow: "hidden",
                }}>
                  {suggestionsNom.map((jeu, i) => (
                    <div key={i} onClick={() => selectionnerSuggestion(jeu)}
                      style={{
                        padding: "10px 14px", cursor: "pointer", fontWeight: 700,
                        fontSize: 15, borderBottom: "1px solid var(--cream2)",
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <span>{jeu.nom}</span>
                      {jeu.code_syracuse && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 400 }}>{jeu.code_syracuse}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {/* Type */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {typesDispos.map(t => (
                <button key={t} onClick={() => setTypeRep(t)}
                  style={{
                    padding: "7px 14px", borderRadius: 20, fontSize: 14, fontWeight: 700,
                    border: "2px solid var(--ink)", cursor: "pointer", fontFamily: "inherit",
                    background: typeRep === t ? "var(--orange)" : "var(--white)",
                    color: "var(--ink)", boxShadow: typeRep === t ? "2px 2px 0 var(--ink)" : "none",
                    transition: "all 0.1s",
                  }}>
                  {t}
                </button>
              ))}
              {typeRep === "Autre" && (
                <input type="text" placeholder="Préciser..." value={customType}
                  onChange={e => setCustomType(e.target.value)}
                  style={{ ...inp, width: 140 }}
                />
              )}
            </div>

            {/* Description */}
            <input
              type="text" placeholder="Coin déchiré, scotch à remettre..."
              value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === "Enter" && ajouterReparation()}
              style={{ ...inp, flex: 1, minWidth: 180 }}
            />

            <button
              onClick={ajouterReparation}
              disabled={!nomJeu && !eanJeu}
              className="pop-btn pop-btn-dark"
              style={{ padding: "9px 20px", fontSize: 15, opacity: (!nomJeu && !eanJeu) ? 0.4 : 1, cursor: (!nomJeu && !eanJeu) ? "not-allowed" : "pointer" }}
            >
              <span className="bc" style={{ fontSize: 16 }}>Ajouter</span>
            </button>
          </div>
        </div>

        {/* Liste — À faire */}
        {aFaire.length === 0 && termines.length === 0 ? (
          <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "40px 0" }}>Aucune réparation en cours !</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {aFaire.map(r => (
              <div key={r.id} className="pop-card" style={{ padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 18 }}>{r.nom || "Jeu inconnu"}</span>
                    {r.ean && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontWeight: 500 }}>({r.ean})</span>}
                    <span style={{
                      fontSize: 12, fontWeight: 800, background: "var(--orange)", color: "var(--ink)",
                      border: "1.5px solid var(--ink)", borderRadius: 6, padding: "2px 8px",
                      boxShadow: "1px 1px 0 var(--ink)", textTransform: "uppercase", letterSpacing: "0.05em",
                    }}>{r.type_reparation}</span>
                  </div>
                  {r.description && <p style={{ color: "rgba(0,0,0,0.55)", fontWeight: 500, fontSize: 15, margin: 0 }}>{r.description}</p>}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => changerStatut(r.id, r.statut)}
                    className="pop-btn"
                    style={{
                      background: "var(--vert)", border: "2px solid var(--ink)",
                      boxShadow: "2px 2px 0 var(--ink)", padding: "7px 16px",
                      fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    }}>
                    Valider ✓
                  </button>
                  <button onClick={() => supprimer(r.id)}
                    style={{
                      background: "none", border: "2px solid var(--ink)", borderRadius: 8,
                      padding: "7px 10px", cursor: "pointer", fontSize: 16,
                      boxShadow: "2px 2px 0 var(--ink)",
                    }}>🗑️</button>
                </div>
              </div>
            ))}

            {/* Terminées (repliées) */}
            {termines.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <p className="bc" style={{ fontSize: 15, color: "rgba(0,0,0,0.35)", letterSpacing: "0.05em", margin: "0 0 8px" }}>
                  TERMINÉES ({termines.length})
                </p>
                {termines.map(r => (
                  <div key={r.id} style={{
                    padding: "12px 20px", marginBottom: 6, borderRadius: 8,
                    border: "2px solid var(--cream2)", background: "var(--white)",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    gap: 12, opacity: 0.55,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.nom}</span>
                      {r.description && <span style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", marginLeft: 8 }}>{r.description}</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => changerStatut(r.id, r.statut)}
                        style={{ background: "none", border: "1.5px solid var(--cream2)", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>
                        Rouvrir
                      </button>
                      <button onClick={() => supprimer(r.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: "4px 6px" }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
