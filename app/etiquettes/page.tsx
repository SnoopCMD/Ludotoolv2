"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { EtiquettesPDF } from "../../components/EtiquettesPDF";

const CATEGORIES = [
  { id: "vert",  nom: "Vert",  hex: "#a8e063", maxStars: 3 },
  { id: "rose",  nom: "Rose",  hex: "#f472b6", maxStars: 2 },
  { id: "bleu",  nom: "Bleu",  hex: "#60a5fa", maxStars: 2 },
  { id: "rouge", nom: "Rouge", hex: "#f87171", maxStars: 2 },
  { id: "jaune", nom: "Jaune", hex: "#fb923c", maxStars: 3 },
];

const MECANIQUES = [
  "(Dé)placement", "Adresse", "Bluff", "Casse-tête", "Collection",
  "Combinaison", "Communication", "Connaissances", "Conquête", "Course",
  "Deck building", "Déduction", "Dominos", "Draft", "Exploration",
  "Gestion", "Gestion de main", "Gestion de ressources", "Imagination",
  "Lancé de dés", "Livre-aventure", "Loto", "Manipulation", "Mémoire",
  "Multijeux", "Négociation", "Observation", "Paris", "Placement de cartes",
  "Placement de dés", "Placement de tuiles", "Placement d'ouvriers", "Plis",
  "Programmation", "Puzzle", "Rapidité", "Rôles cachés", "Roll & write",
  "Stop ou encore"
];

const TEMPS_DE_JEU_OPTIONS = ["5-10", "10-20", "20-30", "30-45", "45-60", "1h30", "2h", "4h+"];

type Etiquette = {
  id: string | number;
  ean: string;
  quantity: number;
  nom: string;
  mecanique: string;
  nb_de_joueurs: string;
  coop_versus: "Coop" | "Versus" | "Solo" | "";
  temps_de_jeu: string;
  etoiles: number | "";
};

const S = {
  inp: {
    border: "2px solid var(--ink)",
    borderRadius: 6,
    padding: "6px 10px",
    background: "var(--white)",
    outline: "none",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
  } as React.CSSProperties,
  sel: {
    border: "2px solid var(--ink)",
    borderRadius: 6,
    padding: "6px 8px",
    background: "var(--white)",
    outline: "none",
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    cursor: "pointer",
  } as React.CSSProperties,
  inpErr: {
    border: "2px solid var(--rouge)",
    background: "#fff5f5",
  } as React.CSSProperties,
};

export default function EtiquettesPage() {
  const [isClient, setIsClient] = useState(false);

  const [etiquettes, setEtiquettes] = useState<Record<string, Etiquette[]>>({
    vert: [], rose: [], bleu: [], rouge: [], jaune: []
  });
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Record<string, boolean>>({
    vert: false, rose: false, bleu: false, rouge: false, jaune: false
  });
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    setIsClient(true);
    chargerCatalogue();
  }, []);

  const chargerCatalogue = async () => {
    const { data } = await supabase.from('catalogue').select('*');
    if (data) {
      const dbEtiquettes: Record<string, Etiquette[]> = { vert: [], rose: [], bleu: [], rouge: [], jaune: [] };
      data.forEach(item => {
        const couleur = item.couleur && dbEtiquettes[item.couleur] ? item.couleur : "vert";
        dbEtiquettes[couleur].push({
          id: item.ean || Date.now() + Math.random(),
          ean: item.ean || "",
          quantity: 0,
          nom: item.nom || "",
          mecanique: item.mecanique || "",
          nb_de_joueurs: item.nb_de_joueurs || "",
          coop_versus: (item.coop_versus as "Coop" | "Versus" | "Solo" | "") || "",
          temps_de_jeu: item.temps_de_jeu || "",
          etoiles: item.etoiles || ""
        });
      });
      Object.keys(dbEtiquettes).forEach(k => dbEtiquettes[k].sort((a, b) => a.nom.localeCompare(b.nom)));
      setEtiquettes(dbEtiquettes);
    }
  };

  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => {
      const isOpening = !prev[id];
      if (isOpening) {
        setTimeout(() => {
          const el = document.getElementById(`category-${id}`);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 10;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 50);
      }
      return { ...prev, [id]: isOpening };
    });
  };

  const ajouterLigne = (couleurId: string) => {
    const nouvelleEtiquette: Etiquette = { id: Date.now(), ean: "", quantity: 1, nom: "", mecanique: "", nb_de_joueurs: "", coop_versus: "", temps_de_jeu: "", etoiles: "" };
    setEtiquettes(prev => ({ ...prev, [couleurId]: [nouvelleEtiquette, ...prev[couleurId]] }));
    if (!sectionsOuvertes[couleurId]) toggleSection(couleurId);
  };

  const sauvegarderLigneEnBase = async (eti: Etiquette, couleurId: string) => {
    if (!eti.ean || !eti.nom) return;
    const dataToSave = {
      ean: eti.ean, nom: eti.nom, mecanique: eti.mecanique, nb_de_joueurs: eti.nb_de_joueurs,
      coop_versus: eti.coop_versus === "" ? null : eti.coop_versus,
      temps_de_jeu: eti.temps_de_jeu, etoiles: eti.etoiles === "" ? null : eti.etoiles, couleur: couleurId
    };
    const { error } = await supabase.from('catalogue').upsert(dataToSave);
    if (error) console.error("Erreur auto-save catalogue:", error.message);

    const { data: jeuxExistants } = await supabase.from('jeux').select('id').eq('ean', eti.ean).limit(1);
    if (!jeuxExistants || jeuxExistants.length === 0) {
      const { error: errJeu } = await supabase.from('jeux').insert([{
        ean: eti.ean,
        nom: eti.nom,
        statut: 'En préparation',
        is_double: false,
        etape_nouveaute: false,
        etape_plastifier: false,
        etape_contenu: false,
        etape_etiquette: false,
        etape_equiper: false,
        etape_encoder: false,
        etape_notice: false
      }]);
      if (errJeu) console.error("Erreur création auto inventaire:", errJeu.message);
    }
  };

  const mettreAJourLigne = (couleurId: string, id: string | number, champ: keyof Etiquette, valeur: string | number) => {
    setEtiquettes(prev => ({
      ...prev, [couleurId]: prev[couleurId].map(eti => {
        if (eti.id === id) {
          const updated = { ...eti, [champ]: valeur };
          if (['mecanique', 'coop_versus', 'etoiles', 'temps_de_jeu'].includes(champ as string)) sauvegarderLigneEnBase(updated, couleurId);
          return updated;
        }
        return eti;
      })
    }));
  };

  const modifierQuantite = (couleurId: string, id: string | number, delta: number) => {
    setEtiquettes(prev => ({ ...prev, [couleurId]: prev[couleurId].map(eti => eti.id === id ? { ...eti, quantity: Math.max(0, eti.quantity + delta) } : eti) }));
  };

  const supprimerLigne = (couleurId: string, id: string | number) => {
    setEtiquettes(prev => ({ ...prev, [couleurId]: prev[couleurId].filter(eti => eti.id !== id) }));
  };

  const chercherEan = async (couleurId: string, id: string | number, ean: string) => {
    if (!ean) return;
    let nomTrouve = "";
    let dataCatalogue = null;

    const { data } = await supabase.from('catalogue').select('*').eq('ean', ean).single();
    if (data) { dataCatalogue = data; nomTrouve = data.nom; }
    else {
      const { data: dataJeux } = await supabase.from('jeux').select('nom').eq('ean', ean).limit(1).single();
      if (dataJeux) nomTrouve = dataJeux.nom;
    }

    setEtiquettes(prev => ({
      ...prev, [couleurId]: prev[couleurId].map(eti => {
        if (eti.id === id) {
          const updated: Etiquette = {
            ...eti, nom: nomTrouve || eti.nom, mecanique: dataCatalogue?.mecanique || eti.mecanique,
            nb_de_joueurs: dataCatalogue?.nb_de_joueurs || eti.nb_de_joueurs,
            coop_versus: (dataCatalogue?.coop_versus || eti.coop_versus || "") as any,
            temps_de_jeu: dataCatalogue?.temps_de_jeu || eti.temps_de_jeu,
            etoiles: dataCatalogue?.etoiles || eti.etoiles || ""
          };
          sauvegarderLigneEnBase(updated, couleurId);
          return updated;
        }
        return eti;
      })
    }));
  };

  const genererPDF = async () => {
    const catalogueData: any[] = [];
    const eansCompletsAImprimer: string[] = [];

    Object.entries(etiquettes).forEach(([couleurId, liste]) => {
      liste.forEach(e => {
        if (e.ean && e.nom) {
          catalogueData.push({
            ean: e.ean, nom: e.nom, mecanique: e.mecanique, nb_de_joueurs: e.nb_de_joueurs,
            coop_versus: e.coop_versus === "" ? null : e.coop_versus,
            temps_de_jeu: e.temps_de_jeu, etoiles: e.etoiles === "" ? null : e.etoiles, couleur: couleurId
          });
          const isIncomplet = !e.nom || !e.mecanique || !e.nb_de_joueurs || !e.coop_versus || !e.temps_de_jeu || e.etoiles === "";
          if (!isIncomplet && e.quantity > 0) eansCompletsAImprimer.push(e.ean);
        }
      });
    });

    const uniqueCatalogue = Array.from(new Map(catalogueData.map(item => [item.ean, item])).values());
    if (uniqueCatalogue.length > 0) await supabase.from('catalogue').upsert(uniqueCatalogue);

    if (eansCompletsAImprimer.length > 0) {
      const { data: jeuxEnPrepa } = await supabase.from('jeux').select('*').in('ean', eansCompletsAImprimer).eq('statut', 'En préparation');
      if (jeuxEnPrepa && jeuxEnPrepa.length > 0) {
        for (const jeu of jeuxEnPrepa) {
          const isTermine = jeu.etape_plastifier && jeu.etape_contenu && true && jeu.etape_equiper && jeu.etape_encoder && jeu.etape_notice && jeu.etape_nouveaute;
          await supabase.from('jeux').update({ etape_etiquette: true, statut: isTermine ? 'En stock' : 'En préparation' }).eq('id', jeu.id);
        }
      }
    }
  };

  const scrollToLetter = (letter: string, catId: string) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const startIndex = letters.indexOf(letter);
    for (let i = startIndex; i < letters.length; i++) {
      const target = document.querySelector(`tr[data-category="${catId}"][data-letter="${letters[i]}"]`);
      if (target) {
        const y = target.getBoundingClientRect().top + window.scrollY - 150;
        window.scrollTo({ top: y, behavior: "smooth" });
        return;
      }
    }
  };

  const totalEtiquettes = Object.values(etiquettes).flat().reduce((sum, eti) => sum + eti.quantity, 0);

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>

      {/* Mini sticky header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200,
        height: 56, background: "var(--cream)",
        borderBottom: "2.5px solid var(--ink)",
        display: "flex", alignItems: "center",
        padding: "0 24px", gap: 16,
      }}>
        <Link href="/atelier" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--ink)", color: "var(--cream)",
          border: "2px solid var(--ink)", borderRadius: 6,
          padding: "4px 12px", fontWeight: 700, fontSize: 13,
          textDecoration: "none", boxShadow: "2px 2px 0 rgba(0,0,0,0.3)",
          fontFamily: "inherit",
        }}>
          ← Atelier
        </Link>
        <h1 className="bc" style={{ fontSize: 24, letterSpacing: "0.03em", margin: 0,
          background: "linear-gradient(90deg, var(--rouge), var(--orange))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>
          Impression étiquettes
        </h1>
      </header>

      {/* Main layout */}
      <div style={{ display: "flex", gap: 20, padding: "20px 24px", alignItems: "flex-start", flex: 1 }}>

        {/* Accordions */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          {CATEGORIES.map((cat) => {
            const nbIncomplets = etiquettes[cat.id].filter(eti =>
              !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === ""
            ).length;
            const isOpen = sectionsOuvertes[cat.id];

            return (
              <div key={cat.id} id={`category-${cat.id}`} className="pop-card" style={{ borderRadius: 10, overflow: "visible", position: "relative", zIndex: 20 }}>

                {/* Category header */}
                <div
                  onClick={() => toggleSection(cat.id)}
                  style={{
                    position: "sticky", top: 56, zIndex: 40,
                    background: cat.hex,
                    border: "2.5px solid var(--ink)",
                    borderRadius: isOpen ? "10px 10px 0 0" : 10,
                    padding: "12px 18px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: "pointer", userSelect: "none",
                    boxShadow: isOpen ? "none" : "4px 4px 0 var(--ink)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="bc" style={{ fontSize: 20, color: "var(--ink)", letterSpacing: "0.02em" }}>{cat.nom}</span>
                    <span style={{
                      background: "rgba(0,0,0,0.12)", color: "var(--ink)",
                      borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700,
                    }}>{etiquettes[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && (
                      <span style={{
                        background: "var(--rouge)", color: "var(--white)",
                        borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700,
                        border: "1.5px solid var(--ink)", boxShadow: "1px 1px 0 var(--ink)",
                      }}>{nbIncomplets} incomplet(s)</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isOpen && (
                      <button
                        onClick={(e) => { e.stopPropagation(); ajouterLigne(cat.id); }}
                        style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "rgba(0,0,0,0.15)", border: "1.5px solid rgba(0,0,0,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 20, fontWeight: 900, cursor: "pointer", lineHeight: 1,
                        }}
                        title="Ajouter une étiquette"
                      >+</button>
                    )}
                    <span className="bc" style={{ fontSize: 22, width: 24, textAlign: "center" }}>{isOpen ? "−" : "+"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{
                    background: "var(--white)",
                    borderLeft: "2.5px solid var(--ink)",
                    borderRight: "2.5px solid var(--ink)",
                    borderBottom: "2.5px solid var(--ink)",
                    borderRadius: "0 0 10px 10px",
                    display: "flex", gap: 0, alignItems: "flex-start",
                    position: "relative",
                  }}>

                    {/* Alpha scroll sidebar */}
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "space-between",
                      position: "sticky", top: 130,
                      height: "calc(100vh - 180px)",
                      background: "var(--cream2)",
                      borderRight: "2px solid var(--ink)",
                      borderRadius: "0 0 0 10px",
                      padding: "6px 0", width: 28, flexShrink: 0,
                    }}>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                        <button
                          key={l}
                          onClick={() => scrollToLetter(l, cat.id)}
                          style={{
                            fontSize: 8, fontWeight: 900, color: "rgba(0,0,0,0.4)",
                            background: "none", border: "none", cursor: "pointer",
                            flex: 1, width: "100%", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            transition: "color 0.1s, transform 0.1s",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--ink)"; (e.target as HTMLElement).style.transform = "scale(1.5)"; }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = "rgba(0,0,0,0.4)"; (e.target as HTMLElement).style.transform = "scale(1)"; }}
                        >{l}</button>
                      ))}
                    </div>

                    {/* Table */}
                    <div style={{ flex: 1, overflowX: "auto", paddingBottom: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                          <tr style={{ background: "var(--cream2)", borderBottom: "2.5px solid var(--ink)" }}>
                            {["Qte", "EAN", "Nom", "Mécanique", "Joueurs", "Coop/VS", "Temps", "Étoiles", ""].map((h, i) => (
                              <th key={i} className="bc" style={{
                                padding: "10px 12px", textAlign: i === 0 || i >= 4 ? "center" : "left",
                                fontSize: 13, letterSpacing: "0.05em", color: "var(--ink)",
                                whiteSpace: "nowrap",
                                width: [64, 128, 180, 140, 90, 110, 90, 80, 48][i],
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {etiquettes[cat.id].length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: "center", padding: "32px 0", color: "rgba(0,0,0,0.35)", fontWeight: 700, fontSize: 14 }}>
                                Aucune étiquette — appuyez sur + dans l'en-tête.
                              </td>
                            </tr>
                          ) : (
                            etiquettes[cat.id].map((eti) => {
                              const isIncomplet = !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === "";
                              const startLetter = eti.nom ? eti.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
                              const rowBg = eti.quantity > 0
                                ? (isIncomplet ? "#fff0f0" : "#f0fff4")
                                : "var(--white)";
                              const rowBorder = eti.quantity > 0
                                ? (isIncomplet ? "3px solid var(--rouge)" : "3px solid var(--vert)")
                                : "3px solid transparent";

                              return (
                                <tr
                                  key={eti.id}
                                  data-letter={startLetter}
                                  data-category={cat.id}
                                  style={{
                                    borderBottom: "1px solid var(--cream2)",
                                    borderLeft: rowBorder,
                                    background: rowBg,
                                    scrollMarginTop: 130,
                                  }}
                                >
                                  {/* Qte */}
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <input
                                      type="number" min="0" value={eti.quantity}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "quantity", parseInt(e.target.value) || 0)}
                                      style={{
                                        ...S.inp, width: 52, textAlign: "center", fontWeight: 700,
                                        background: eti.quantity > 0 ? "var(--ink)" : "var(--cream2)",
                                        color: eti.quantity > 0 ? "var(--white)" : "var(--ink)",
                                      }}
                                    />
                                  </td>
                                  {/* EAN */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      type="text" value={eti.ean}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "ean", e.target.value)}
                                      onBlur={(e) => chercherEan(cat.id, eti.id, e.target.value)}
                                      placeholder="Code-barres..."
                                      style={{ ...S.inp, fontSize: 12 }}
                                    />
                                  </td>
                                  {/* Nom */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      type="text" value={eti.nom}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nom", e.target.value)}
                                      onBlur={() => sauvegarderLigneEnBase(eti, cat.id)}
                                      placeholder="Nom du jeu..."
                                      style={{ ...S.inp, fontWeight: 700, ...(!eti.nom ? S.inpErr : {}) }}
                                    />
                                  </td>
                                  {/* Mécanique */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.mecanique}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "mecanique", e.target.value)}
                                      style={{ ...S.sel, ...(!eti.mecanique ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélectionner...</option>
                                      {MECANIQUES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </td>
                                  {/* Joueurs */}
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <input
                                      type="text" value={eti.nb_de_joueurs}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nb_de_joueurs", e.target.value)}
                                      onBlur={() => sauvegarderLigneEnBase(eti, cat.id)}
                                      placeholder="2-6"
                                      style={{ ...S.inp, textAlign: "center", fontWeight: 700, ...(!eti.nb_de_joueurs ? S.inpErr : {}) }}
                                    />
                                  </td>
                                  {/* Coop/VS */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.coop_versus}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "coop_versus", e.target.value)}
                                      style={{ ...S.sel, fontWeight: 700, ...(!eti.coop_versus ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélect...</option>
                                      <option value="Coop">🤝 Coop</option>
                                      <option value="Versus">⚔️ Versus</option>
                                      <option value="Solo">👍 Solo</option>
                                    </select>
                                  </td>
                                  {/* Temps */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.temps_de_jeu}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "temps_de_jeu", e.target.value)}
                                      style={{ ...S.sel, textAlign: "center", fontWeight: 700, ...(!eti.temps_de_jeu ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélect...</option>
                                      {TEMPS_DE_JEU_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </td>
                                  {/* Étoiles */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.etoiles}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "etoiles", e.target.value === "" ? "" : Number(e.target.value))}
                                      style={{ ...S.sel, textAlign: "center", fontWeight: 700, fontSize: 15, letterSpacing: 2, ...(eti.etoiles === "" ? S.inpErr : {}) }}
                                    >
                                      <option value="">-</option>
                                      <option value={1}>★</option>
                                      <option value={2}>★★</option>
                                      {cat.maxStars === 3 && <option value={3}>★★★</option>}
                                    </select>
                                  </td>
                                  {/* Delete */}
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <button
                                      onClick={() => supprimerLigne(cat.id, eti.id)}
                                      title="Supprimer la ligne"
                                      style={{
                                        background: "none", border: "none", cursor: "pointer",
                                        fontSize: 18, padding: "4px 6px", borderRadius: 4,
                                        transition: "background 0.1s",
                                      }}
                                      onMouseEnter={e => (e.currentTarget.style.background = "#fff0f0")}
                                      onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                    >🗑️</button>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </main>

        {/* Aside */}
        <aside className="pop-card" style={{
          width: 300, borderRadius: 10,
          display: "flex", flexDirection: "column",
          height: "calc(100vh - 96px)",
          position: "sticky", top: 76,
          flexShrink: 0, overflow: "hidden",
        }}>
          {/* Aside header */}
          <div style={{ padding: "16px 18px", borderBottom: "2.5px solid var(--ink)", background: "var(--cream2)" }}>
            <h2 className="bc" style={{ fontSize: 18, margin: "0 0 12px", letterSpacing: "0.03em" }}>Générateur d&apos;étiquettes</h2>
            <input
              type="text"
              placeholder="🔍  Rechercher un jeu..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="pop-input"
              style={{ width: "100%", fontSize: 14, boxSizing: "border-box" }}
            />
          </div>

          {/* Game list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
            {CATEGORIES.map(cat => {
              const items = etiquettes[cat.id].filter(eti => eti.nom.toLowerCase().includes(recherche.toLowerCase()));
              if (items.length === 0) return null;
              return (
                <div key={`side-${cat.id}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Category label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.hex, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat.nom}</span>
                    <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 600 }}>({items.length})</span>
                  </div>
                  {items.map(eti => (
                    <div key={`side-item-${eti.id}`} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--cream2)", padding: "8px 10px",
                      borderRadius: 7, border: "2px solid var(--ink)",
                      boxShadow: "2px 2px 0 var(--ink)",
                    }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", flex: 1, marginRight: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {eti.nom || <span style={{ fontStyle: "italic", color: "rgba(0,0,0,0.35)" }}>Sans nom</span>}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", border: "2px solid var(--ink)", borderRadius: 6, background: "var(--white)", flexShrink: 0 }}>
                        <button onClick={() => modifierQuantite(cat.id, eti.id, -1)} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 15, lineHeight: 1, borderRight: "1.5px solid var(--ink)" }}>−</button>
                        <span style={{ width: 28, textAlign: "center", fontWeight: 700, fontSize: 14 }}>{eti.quantity}</span>
                        <button onClick={() => modifierQuantite(cat.id, eti.id, 1)} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 15, lineHeight: 1, borderLeft: "1.5px solid var(--ink)" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* PDF footer */}
          <div style={{ padding: "14px 16px", borderTop: "2.5px solid var(--ink)", background: "var(--cream2)" }}>
            <p style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)", margin: "0 0 10px" }}>
              {totalEtiquettes} étiquette(s)
            </p>
            {isClient ? (
              <PDFDownloadLink document={<EtiquettesPDF etiquettesParCouleur={etiquettes} />} fileName="etiquettes_ludo.pdf">
                {({ loading }) => (
                  <button
                    onClick={genererPDF}
                    disabled={totalEtiquettes === 0 || loading}
                    className="pop-btn pop-btn-dark"
                    style={{
                      width: "100%", padding: "12px 0",
                      fontSize: 14, letterSpacing: "0.04em",
                      opacity: (totalEtiquettes === 0 || loading) ? 0.45 : 1,
                      cursor: (totalEtiquettes === 0 || loading) ? "not-allowed" : "pointer",
                    }}
                  >
                    <span className="bc" style={{ fontSize: 15 }}>
                      {loading ? "PRÉPARATION PDF..." : "GÉNÉRER LES ÉTIQUETTES"}
                    </span>
                  </button>
                )}
              </PDFDownloadLink>
            ) : (
              <button disabled className="pop-btn pop-btn-dark" style={{ width: "100%", padding: "12px 0", opacity: 0.45, cursor: "not-allowed" }}>
                <span className="bc" style={{ fontSize: 15 }}>CHARGEMENT...</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
