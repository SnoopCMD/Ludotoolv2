"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase"; 
import { PDFDownloadLink } from "@react-pdf/renderer";
import { EtiquettesPDF } from "../../components/EtiquettesPDF";

const CATEGORIES = [
  { id: "vert", nom: "Vert", color: "bg-[#baff29] text-black", maxStars: 3 },
  { id: "rose", nom: "Rose", color: "bg-[#f45be0] text-white", maxStars: 2 },
  { id: "bleu", nom: "Bleu", color: "bg-[#6ba4ff] text-white", maxStars: 2 },
  { id: "rouge", nom: "Rouge", color: "bg-[#ff4d79] text-white", maxStars: 2 },
  { id: "jaune", nom: "Jaune", color: "bg-[#ffa600] text-black", maxStars: 3 }
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

  // NOUVEAU: Auto-scroll parfait en haut de la catégorie
  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => {
      const isOpening = !prev[id];
      if (isOpening) {
        setTimeout(() => {
          const el = document.getElementById(`category-${id}`);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 10; // 10px de marge pour respirer
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 50); // Délai très court pour laisser le DOM se déployer
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
        // Décalage pour compenser le header et le sub-header sticky
        const y = target.getBoundingClientRect().top + window.scrollY - 150;
        window.scrollTo({ top: y, behavior: "smooth" });
        return;
      }
    }
  };

  const totalEtiquettes = Object.values(etiquettes).flat().reduce((sum, eti) => sum + eti.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8 relative">
      <header className="flex justify-between items-center mb-6 w-full max-w-screen-2xl mx-auto shrink-0 relative z-50">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg gap-1">
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <div className="flex gap-4 w-full max-w-screen-2xl mx-auto items-start relative z-0">
        
        {/* On enlève les overflow-hidden pour permettre au sticky de se repérer à la fenêtre entière */}
        <main className="bg-white rounded-[3rem] p-6 lg:p-10 flex-1 shadow-md flex flex-col gap-6 border-2 border-slate-100 relative z-0 min-w-0">
          <h1 className="text-4xl font-black text-black mb-2">Impression des étiquettes</h1>

          <div className="flex flex-col gap-8">
            {CATEGORIES.map((cat) => {
              const nbIncomplets = etiquettes[cat.id].filter(eti => 
                !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === ""
              ).length;

              return (
              <div key={cat.id} id={`category-${cat.id}`} className="border-2 border-slate-100 rounded-[1.5rem] shadow-sm bg-slate-50 relative z-20">
                
                {/* EN-TÊTE PRINCIPAL STICKY */}
                <div 
                  onClick={() => toggleSection(cat.id)} 
                  className={`sticky top-0 z-40 ${cat.color} p-5 flex justify-between items-center cursor-pointer select-none shadow-md ${sectionsOuvertes[cat.id] ? 'rounded-t-[1.5rem]' : 'rounded-[1.5rem]'}`}
                >
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    {cat.nom} 
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm text-inherit">{etiquettes[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-red-600">{nbIncomplets} incomplet(s)</span>}
                  </h2>
                  <div className="flex items-center gap-4">
                    {sectionsOuvertes[cat.id] && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); ajouterLigne(cat.id); }}
                        className="w-8 h-8 flex items-center justify-center bg-black/10 hover:bg-black/20 rounded-full font-black text-xl transition-colors"
                        title="Ajouter une étiquette"
                      >
                        +
                      </button>
                    )}
                    <span className="font-bold text-xl w-6 text-center">{sectionsOuvertes[cat.id] ? "−" : "+"}</span>
                  </div>
                </div>

                {sectionsOuvertes[cat.id] && (
                  <div className="bg-slate-50 rounded-b-[1.5rem] pb-6 flex gap-4 items-start relative">
                    
                    {/* ASCENSEUR ALPHABÉTIQUE INTÉGRÉ AU TABLEAU */}
                    <div className="hidden sm:flex flex-col items-center justify-between sticky top-[130px] h-[calc(100vh-180px)] bg-white rounded-full py-2 px-1 shadow-sm border border-slate-200 z-30 w-8 shrink-0 ml-4 mt-6">
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                        <button 
                          key={l} 
                          onClick={() => scrollToLetter(l, cat.id)} 
                          className="text-[9px] font-black text-slate-400 hover:text-black hover:scale-150 transition-all flex-1 flex items-center justify-center w-full"
                        >
                          {l}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 flex flex-col min-w-0 pr-6 overflow-x-auto">
                      
                      <table className="w-full text-left border-collapse min-w-[1000px] relative z-10 mt-4">
                        
                        {/* SOUS-HEADER STICKY (Opaque & Solide) */}
                        <thead className="sticky top-0 z-10 bg-white shadow-sm">
                          <tr className="bg-slate-200 text-xs text-slate-600 uppercase tracking-wider border-b-4 border-slate-300">
                            <th className="p-3 font-black w-16 text-center bg-slate-200">Qte</th>
                            <th className="p-3 font-black w-32 bg-slate-200">EAN</th>
                            <th className="p-3 font-black w-48 bg-slate-200">Nom</th>
                            <th className="p-3 font-black w-32 bg-slate-200">Mécanique</th>
                            <th className="p-3 font-black w-24 text-center bg-slate-200">Joueurs</th>
                            <th className="p-3 font-black w-28 text-center bg-slate-200">Coop/VS</th>
                            <th className="p-3 font-black w-24 text-center bg-slate-200">Temps</th>
                            <th className="p-3 font-black w-20 text-center bg-slate-200">Étoiles</th>
                            <th className="p-3 font-black w-12 text-center bg-slate-200"></th>
                          </tr>
                        </thead>
                        
                        <tbody className="bg-slate-50">
                          {etiquettes[cat.id].length === 0 ? (
                            <tr>
                              <td colSpan={9} className="text-center py-10 text-slate-400 font-bold">Aucune étiquette. Appuyez sur le + dans l'en-tête.</td>
                            </tr>
                          ) : (
                            etiquettes[cat.id].map((eti) => {
                              const isIncomplet = !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === "";
                              const ligneClasses = eti.quantity > 0 ? (isIncomplet ? 'bg-red-50/40 border-l-4 border-l-red-500' : 'bg-emerald-50/30 border-l-4 border-l-black') : 'bg-white hover:bg-slate-100';
                              
                              const startLetter = eti.nom ? eti.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

                              return (
                                <tr 
                                  key={eti.id} 
                                  data-letter={startLetter}
                                  data-category={cat.id}
                                  className={`border-b border-slate-200 transition-colors scroll-mt-[130px] ${ligneClasses}`}
                                >
                                  <td className="p-2"><input type="number" min="0" value={eti.quantity} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "quantity", parseInt(e.target.value) || 0)} className={`w-full p-2 rounded-lg outline-none font-bold text-center border focus:border-slate-300 ${eti.quantity > 0 ? 'bg-black text-white' : 'bg-slate-100 border-transparent text-black'}`} /></td>
                                  <td className="p-2"><input type="text" value={eti.ean} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "ean", e.target.value)} onBlur={(e) => chercherEan(cat.id, eti.id, e.target.value)} placeholder="Code-barres..." className="w-full bg-slate-50 p-2 rounded-lg outline-none border border-slate-200 focus:border-black text-xs shadow-inner" /></td>
                                  <td className="p-2"><input type="text" value={eti.nom} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nom", e.target.value)} onBlur={() => sauvegarderLigneEnBase(eti, cat.id)} placeholder="Nom du jeu..." className={`w-full p-2 rounded-lg outline-none font-bold border focus:border-black shadow-inner ${!eti.nom ? 'bg-red-50 border-red-300 text-red-700' : 'bg-slate-50 border-slate-200'}`} /></td>
                                  <td className="p-2">
                                    <select value={eti.mecanique} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "mecanique", e.target.value)} className={`w-full p-2 rounded-lg outline-none cursor-pointer border focus:border-black text-xs font-bold text-slate-700 shadow-inner ${!eti.mecanique ? 'bg-red-50 border-red-300 text-red-500' : 'bg-slate-50 border-slate-200'}`}>
                                      <option value="">Sélectionner...</option>
                                      {MECANIQUES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </td>
                                  <td className="p-2"><input type="text" value={eti.nb_de_joueurs} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nb_de_joueurs", e.target.value)} onBlur={() => sauvegarderLigneEnBase(eti, cat.id)} placeholder="Ex: 2-6" className={`w-full p-2 rounded-lg outline-none text-center border focus:border-black text-sm font-bold text-slate-700 shadow-inner ${!eti.nb_de_joueurs ? 'bg-red-50 border-red-300 text-red-700' : 'bg-slate-50 border-slate-200'}`} /></td>
                                  <td className="p-2">
                                    <select value={eti.coop_versus} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "coop_versus", e.target.value)} className={`w-full p-2 rounded-lg outline-none font-bold text-xs cursor-pointer border focus:border-black text-slate-700 shadow-inner ${!eti.coop_versus ? 'bg-red-50 border-red-300 text-red-500' : 'bg-slate-50 border-slate-200'}`}>
                                      <option value="">Sélect...</option><option value="Coop">🤝 Coop</option><option value="Versus">⚔️ Versus</option><option value="Solo">👍 Solo</option>
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    <select value={eti.temps_de_jeu} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "temps_de_jeu", e.target.value)} className={`w-full p-2 rounded-lg outline-none text-center font-bold text-xs cursor-pointer border focus:border-black text-slate-700 shadow-inner ${!eti.temps_de_jeu ? 'bg-red-50 border-red-300 text-red-700' : 'bg-slate-50 border-slate-200'}`}>
                                      <option value="">Sélect...</option>
                                      {TEMPS_DE_JEU_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </td>
                                  <td className="p-2">
                                    <select value={eti.etoiles} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "etoiles", e.target.value === "" ? "" : Number(e.target.value))} className={`w-full p-2 rounded-lg outline-none text-center font-bold text-lg cursor-pointer border focus:border-black tracking-widest shadow-inner ${eti.etoiles === "" ? 'bg-red-50 border-red-300 text-red-500' : 'bg-slate-50 border-slate-200'}`}>
                                      <option value="">-</option><option value={1}>★</option><option value={2}>★★</option>{cat.maxStars === 3 && <option value={3}>★★★</option>}
                                    </select>
                                  </td>
                                  <td className="p-2 text-center"><button onClick={() => supprimerLigne(cat.id, eti.id)} className="text-red-500 hover:bg-red-100 p-2 rounded-lg transition-colors" title="Supprimer la ligne">🗑️</button></td>
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
          </div>
        </main>

        <aside className="w-[350px] bg-white rounded-[2rem] shadow-md flex flex-col h-[calc(100vh-8rem)] sticky top-8 shrink-0 overflow-hidden border-2 border-slate-100 z-10">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-800 mb-4">Générateur d&apos;étiquettes</h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Rechercher un jeu..." value={recherche} onChange={(e) => setRecherche(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-black transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 custom-scroll">
            {CATEGORIES.map(cat => {
              const items = etiquettes[cat.id].filter(eti => eti.nom.toLowerCase().includes(recherche.toLowerCase()));
              if (items.length === 0) return null;
              return (
                <div key={`side-${cat.id}`} className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{cat.nom}</h3>
                    <span className="text-xs font-medium text-slate-400">({items.length})</span>
                  </div>
                  {items.map(eti => (
                    <div key={`side-item-${eti.id}`} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
                      <span className="text-sm font-bold text-slate-700 truncate mr-2 flex-1">{eti.nom || <span className="italic text-slate-400">Sans nom</span>}</span>
                      <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
                        <button onClick={() => modifierQuantite(cat.id, eti.id, -1)} className="px-2.5 py-1 text-slate-500 hover:text-black font-bold text-lg leading-none hover:bg-slate-50 rounded-l-lg">−</button>
                        <span className="w-8 text-center font-bold text-sm border-x border-slate-100">{eti.quantity}</span>
                        <button onClick={() => modifierQuantite(cat.id, eti.id, 1)} className="px-2.5 py-1 text-slate-500 hover:text-black font-bold text-lg leading-none hover:bg-slate-50 rounded-r-lg">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-slate-100 bg-white shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] relative z-10">
            <p className="text-center text-sm font-bold text-slate-500 mb-4">{totalEtiquettes} étiquette(s)</p>
            {isClient ? (
              <PDFDownloadLink document={<EtiquettesPDF etiquettesParCouleur={etiquettes} />} fileName="etiquettes_ludo.pdf">
                {({ loading }) => (
                  <button onClick={genererPDF} disabled={totalEtiquettes === 0 || loading} className="w-full bg-[#d63031] hover:bg-[#b02627] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-xl transition-colors shadow-md">
                    {loading ? 'PRÉPARATION PDF...' : 'GÉNÉRER LES ÉTIQUETTES'}
                  </button>
                )}
              </PDFDownloadLink>
            ) : (<button disabled className="w-full bg-slate-200 text-slate-400 font-black py-4 rounded-xl">CHARGEMENT...</button>)}
          </div>
        </aside>
      </div>
    </div>
  );
}