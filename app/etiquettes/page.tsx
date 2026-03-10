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
  { id: "jaune", nom: "Jaune", color: "bg-[#ffa600] text-white", maxStars: 3 }
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

type Etiquette = {
  id: string | number;
  ean: string;
  quantity: number;
  name: string;
  mecanique: string;
  nb_de_joueurs: string;
  coop_versus: "Coop" | "Versus" | "Solo";
  temps_de_jeu: string;
  etoiles: number;
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

  // NOUVEAU : Fonction qui charge les jeux au démarrage
  const chargerCatalogue = async () => {
    const { data, error } = await supabase.from('catalogue').select('*');
    
    if (data) {
      const dbEtiquettes: Record<string, Etiquette[]> = {
        vert: [], rose: [], bleu: [], rouge: [], jaune: []
      };

      data.forEach(item => {
        // On place dans la bonne couleur, ou "vert" par défaut
        const couleur = item.couleur && dbEtiquettes[item.couleur] ? item.couleur : "vert";
        
        dbEtiquettes[couleur].push({
          id: item.ean || Date.now() + Math.random(),
          ean: item.ean || "",
          quantity: 0, // Par défaut à 0
          name: item.name || "",
          mecanique: item.mecanique || "",
          nb_de_joueurs: item.nb_de_joueurs || "",
          coop_versus: (item.coop_versus as "Coop" | "Versus" | "Solo") || "Coop",
          temps_de_jeu: item.temps_de_jeu || "",
          etoiles: item.etoiles || 1
        });
      });

      setEtiquettes(dbEtiquettes);
    }
  };

  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const ajouterLigne = (couleurId: string) => {
    const nouvelleEtiquette: Etiquette = {
      id: Date.now(),
      ean: "",
      quantity: 1, // Une nouvelle ligne ajoutée manuellement a 1 par défaut
      name: "",
      mecanique: "",
      nb_de_joueurs: "",
      coop_versus: "Coop",
      temps_de_jeu: "",
      etoiles: 1
    };
    
    setEtiquettes(prev => ({
      ...prev,
      [couleurId]: [nouvelleEtiquette, ...prev[couleurId]] // Ajoute au début de la liste
    }));
    
    if (!sectionsOuvertes[couleurId]) toggleSection(couleurId);
  };

  const mettreAJourLigne = (couleurId: string, id: string | number, champ: keyof Etiquette, valeur: string | number) => {
    setEtiquettes(prev => ({
      ...prev,
      [couleurId]: prev[couleurId].map(eti => eti.id === id ? { ...eti, [champ]: valeur } : eti)
    }));
  };

  const modifierQuantite = (couleurId: string, id: string | number, delta: number) => {
    setEtiquettes(prev => ({
      ...prev,
      [couleurId]: prev[couleurId].map(eti => {
        if (eti.id === id) {
          const newQte = Math.max(0, eti.quantity + delta);
          return { ...eti, quantity: newQte };
        }
        return eti;
      })
    }));
  };

  const supprimerLigne = (couleurId: string, id: string | number) => {
    setEtiquettes(prev => ({
      ...prev,
      [couleurId]: prev[couleurId].filter(eti => eti.id !== id)
    }));
  };

  const chercherEan = async (couleurId: string, id: string | number, ean: string) => {
    if (!ean) return;

    let nomTrouve = "";
    let dataCatalogue = null;

    const { data } = await supabase.from('catalogue').select('*').eq('ean', ean).single();
    
    if (data) {
      dataCatalogue = data;
      nomTrouve = data.name; 
    } else {
      const { data: dataJeux } = await supabase.from('jeux').select('nom').eq('ean', ean).limit(1).single();
      if (dataJeux) {
        nomTrouve = dataJeux.nom;
      }
    }

    if (nomTrouve || dataCatalogue) {
      setEtiquettes(prev => ({
        ...prev,
        [couleurId]: prev[couleurId].map(eti => eti.id === id ? {
          ...eti,
          name: nomTrouve || eti.name,
          mecanique: dataCatalogue?.mecanique || eti.mecanique,
          nb_de_joueurs: dataCatalogue?.nb_de_joueurs || eti.nb_de_joueurs,
          coop_versus: (dataCatalogue?.coop_versus as "Coop" | "Versus" | "Solo") || eti.coop_versus,
          temps_de_jeu: dataCatalogue?.temps_de_jeu || eti.temps_de_jeu,
          etoiles: dataCatalogue?.etoiles || eti.etoiles
        } : eti)
      }));
    }
  };

  // NOUVEAU : Sauvegarde de la couleur dans le catalogue
  const genererPDF = async () => {
    const catalogueData: any[] = [];
    
    Object.entries(etiquettes).forEach(([couleurId, liste]) => {
      liste.forEach(e => {
        if (e.ean && e.name) {
          catalogueData.push({
            ean: e.ean,
            name: e.name, 
            mecanique: e.mecanique,
            nb_de_joueurs: e.nb_de_joueurs,
            coop_versus: e.coop_versus,
            temps_de_jeu: e.temps_de_jeu,
            etoiles: e.etoiles,
            couleur: couleurId // Sauvegarde la catégorie du jeu !
          });
        }
      });
    });

    const uniqueCatalogue = Array.from(new Map(catalogueData.map(item => [item.ean, item])).values());
    
    if (uniqueCatalogue.length > 0) {
      const { error } = await supabase.from('catalogue').upsert(uniqueCatalogue);
      if (error) {
        alert("Erreur de sauvegarde dans le catalogue : " + error.message);
      } else {
        console.log("Catalogue mis à jour avec succès !");
      }
    }
  };

  const totalEtiquettes = Object.values(etiquettes).flat().reduce((sum, eti) => sum + eti.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8">
      
      <header className="flex justify-between items-center mb-6 w-full max-w-screen-2xl mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg gap-1">
          <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <div className="flex gap-6 w-full max-w-screen-2xl mx-auto items-start">
        <main className="bg-white rounded-[3rem] p-8 lg:p-10 flex-1 shadow-md flex flex-col gap-6 overflow-hidden">
          <h1 className="text-4xl font-black text-black mb-4">Impression des étiquettes</h1>

          <div className="flex flex-col gap-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                
                <div 
                  onClick={() => toggleSection(cat.id)}
                  className={`${cat.color} p-5 flex justify-between items-center cursor-pointer select-none`}
                >
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    {cat.nom} 
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                      {etiquettes[cat.id].length} jeu(x)
                    </span>
                  </h2>
                  <span className="font-bold text-xl">{sectionsOuvertes[cat.id] ? "−" : "+"}</span>
                </div>

                {sectionsOuvertes[cat.id] && (
                  <div className="p-6 bg-slate-50">
                    {etiquettes[cat.id].length === 0 ? (
                      <p className="text-slate-400 font-medium text-center py-4">Aucune étiquette dans cette catégorie.</p>
                    ) : (
                      <div className="overflow-x-auto mb-4">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                          <thead>
                            <tr className="text-sm text-slate-500 border-b-2 border-slate-200">
                              <th className="p-3 font-bold w-16 text-center">QTE</th>
                              <th className="p-3 font-bold w-32">EAN</th>
                              <th className="p-3 font-bold w-48">NOM</th>
                              <th className="p-3 font-bold w-32">MÉCANIQUE</th>
                              <th className="p-3 font-bold w-24">JOUEURS</th>
                              <th className="p-3 font-bold w-28">COOP/VS</th>
                              <th className="p-3 font-bold w-24">TEMPS</th>
                              <th className="p-3 font-bold w-20">ÉTOILES</th>
                              <th className="p-3 font-bold w-12 text-center"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {etiquettes[cat.id].map((eti) => (
                              <tr key={eti.id} className={`border-b border-slate-200 bg-white hover:bg-slate-50 transition-colors ${eti.quantity > 0 ? 'border-l-4 border-l-black' : ''}`}>
                                <td className="p-2">
                                  <input type="number" min="0" value={eti.quantity} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "quantity", parseInt(e.target.value) || 0)} className={`w-full p-2 rounded-lg outline-none font-bold text-center border focus:border-slate-300 ${eti.quantity > 0 ? 'bg-black text-white' : 'bg-slate-100 border-transparent text-black'}`} />
                                </td>
                                <td className="p-2">
                                  <input type="text" value={eti.ean} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "ean", e.target.value)} onBlur={(e) => chercherEan(cat.id, eti.id, e.target.value)} placeholder="Code-barres..." className="w-full bg-slate-100 p-2 rounded-lg outline-none border border-transparent focus:border-slate-300 text-xs" />
                                </td>
                                <td className="p-2">
                                  <input type="text" value={eti.name} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "name", e.target.value)} placeholder="Nom du jeu..." className="w-full bg-slate-100 p-2 rounded-lg outline-none font-bold border border-transparent focus:border-slate-300" />
                                </td>
                                <td className="p-2">
                                  <select 
                                    value={eti.mecanique} 
                                    onChange={(e) => mettreAJourLigne(cat.id, eti.id, "mecanique", e.target.value)} 
                                    className="w-full bg-slate-100 p-2 rounded-lg outline-none cursor-pointer border border-transparent focus:border-slate-300 text-sm"
                                  >
                                    <option value="">Sélectionner...</option>
                                    {MECANIQUES.map(m => (
                                      <option key={m} value={m}>{m}</option>
                                    ))}
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input type="text" value={eti.nb_de_joueurs} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nb_de_joueurs", e.target.value)} placeholder="Ex: 2-6" className="w-full bg-slate-100 p-2 rounded-lg outline-none text-center border border-transparent focus:border-slate-300" />
                                </td>
                                <td className="p-2">
                                  <select value={eti.coop_versus} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "coop_versus", e.target.value)} className="w-full bg-slate-100 p-2 rounded-lg outline-none font-bold cursor-pointer border border-transparent focus:border-slate-300">
                                    <option value="Coop">🤝 Coop</option>
                                    <option value="Versus">⚔️ Versus</option>
                                    <option value="Solo">👍 Solo</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input type="text" value={eti.temps_de_jeu} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "temps_de_jeu", e.target.value)} placeholder="Ex: 10-20" className="w-full bg-slate-100 p-2 rounded-lg outline-none text-center border border-transparent focus:border-slate-300" />
                                </td>
                                <td className="p-2">
                                  <select value={eti.etoiles} onChange={(e) => mettreAJourLigne(cat.id, eti.id, "etoiles", Number(e.target.value))} className="w-full bg-slate-100 p-2 rounded-lg outline-none text-center font-bold text-lg cursor-pointer border border-transparent focus:border-slate-300 tracking-widest">
                                    <option value={1}>★</option>
                                    <option value={2}>★★</option>
                                    {cat.maxStars === 3 && <option value={3}>★★★</option>}
                                  </select>
                                </td>
                                <td className="p-2 text-center">
                                  <button onClick={() => supprimerLigne(cat.id, eti.id)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Supprimer la ligne">🗑️</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    <button 
                      onClick={() => ajouterLigne(cat.id)}
                      className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-black hover:bg-slate-200 px-4 py-2 rounded-lg transition-colors mt-2"
                    >
                      ➕ Nouvelle ligne {cat.nom}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-[350px] bg-white rounded-[2rem] shadow-md flex flex-col h-[calc(100vh-8rem)] sticky top-8 shrink-0 overflow-hidden border-2 border-slate-100">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-800 mb-4">Générateur d&apos;étiquettes</h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input 
                type="text" 
                placeholder="Rechercher un jeu..." 
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-black transition-colors"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {CATEGORIES.map(cat => {
              const items = etiquettes[cat.id].filter(eti => eti.name.toLowerCase().includes(recherche.toLowerCase()));
              if (items.length === 0) return null;

              return (
                <div key={`side-${cat.id}`} className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{cat.nom}</h3>
                    <span className="text-xs font-medium text-slate-400">({items.length})</span>
                  </div>
                  
                  {items.map(eti => (
                    <div key={`side-item-${eti.id}`} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 hover:border-slate-300 transition-colors">
                      <span className="text-sm font-bold text-slate-700 truncate mr-2 flex-1">
                        {eti.name || <span className="italic text-slate-400">Sans nom</span>}
                      </span>
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
            <p className="text-center text-sm font-bold text-slate-500 mb-4">
              {totalEtiquettes} étiquette(s)
            </p>
            
            {isClient ? (
              <PDFDownloadLink
                document={<EtiquettesPDF etiquettesParCouleur={etiquettes} />}
                fileName="etiquettes_ludo.pdf"
              >
                {({ loading }) => (
                  <button 
                    onClick={genererPDF}
                    disabled={totalEtiquettes === 0 || loading}
                    className="w-full bg-[#d63031] hover:bg-[#b02627] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-xl transition-colors shadow-md"
                  >
                    {loading ? 'PRÉPARATION PDF...' : 'GÉNÉRER LES ÉTIQUETTES'}
                  </button>
                )}
              </PDFDownloadLink>
            ) : (
              <button disabled className="w-full bg-slate-200 text-slate-400 font-black py-4 rounded-xl">
                CHARGEMENT...
              </button>
            )}

          </div>
        </aside>
      </div>
    </div>
  );
}