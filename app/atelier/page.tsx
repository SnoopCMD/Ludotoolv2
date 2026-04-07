"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase"; 
import Link from "next/link";

const BarcodeIcon = () => (
  <svg width="22" height="16" viewBox="0 0 24 18" fill="none" stroke="black" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5 opacity-80">
    <line x1="2" y1="2" x2="2" y2="16" /><line x1="5" y1="2" x2="5" y2="16" /><line x1="8" y1="2" x2="8" y2="16" strokeWidth="2.8" /><line x1="12" y1="2" x2="12" y2="16" /><line x1="15" y1="2" x2="15" y2="16" /><line x1="18" y1="2" x2="18" y2="16" strokeWidth="2.8" /><line x1="22" y1="2" x2="22" y2="16" />
  </svg>
);

type JeuType = {
  id: string | number;
  nom: string;
  ean: string;
  statut: string;
  is_double: boolean;
  etape_plastifier: boolean;
  etape_contenu: boolean;
  etape_etiquette: boolean;
  etape_equiper: boolean;
  etape_encoder: boolean;
  etape_notice: boolean;
  etape_nouveaute: boolean;
  couleur?: string;
  [key: string]: string | number | boolean | undefined; 
};

type JeuAttenteType = {
  ean: string;
  nom: string;
  typeAjout: "nouveaute" | "double" | "existant";
  etapes: Record<string, boolean>;
  couleur: string;
};

const defaultEtapes = {
  etape_plastifier: false,
  etape_contenu: false,
  etape_etiquette: false,
  etape_equiper: false,
  etape_encoder: false,
  etape_notice: false
};

const COULEURS = [
  { id: 'vert', bg: 'bg-[#baff29]' },
  { id: 'rose', bg: 'bg-[#f45be0]' },
  { id: 'bleu', bg: 'bg-[#6ba4ff]' },
  { id: 'rouge', bg: 'bg-[#ff4d79]' },
  { id: 'jaune', bg: 'bg-[#ffa600]' }
];

export default function Home() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isListeOpen, setIsListeOpen] = useState(false);
  const [etapeActive, setEtapeActive] = useState<string | null>(null);
  
  const [nbReparations, setNbReparations] = useState(0);
  const [nbManquants, setNbManquants] = useState(0);
  const [nbOrphelines, setNbOrphelines] = useState(0); 

  const [jeuxAttente, setJeuxAttente] = useState<JeuAttenteType[]>([]);
  const [jeuxEnPrepa, setJeuxEnPrepa] = useState<JeuType[]>([]);
  const [jeuxSelectionnes, setJeuxSelectionnes] = useState<(string | number)[]>([]);

  const [eanInput, setEanInput] = useState("");
  const [manuelInput, setManuelInput] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingEanIndex, setEditingEanIndex] = useState<number | null>(null);
  
  const [totalEnPrepa, setTotalEnPrepa] = useState(0);
  const [comptesEtapes, setComptesEtapes] = useState<Record<string, number>>({});

  const [rechercheJeu, setRechercheJeu] = useState("");
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  const fetchDashboardData = async () => {
    const { data: jeuxData, error: jeuxError } = await supabase
      .from('jeux')
      .select('*')
      .eq('statut', 'En préparation')
      .order('id', { ascending: false });

    if (jeuxError) {
      console.error("Erreur Supabase jeux:", jeuxError.message);
      return;
    }

    const jeuxBruts = (jeuxData as JeuType[]).sort((a, b) => a.nom.localeCompare(b.nom));
    const eans = [...new Set(jeuxBruts.map(j => j.ean))];
    
    let colorMap: Record<string, string> = {};
    if (eans.length > 0) {
      const { data: catData } = await supabase.from('catalogue').select('ean, couleur').in('ean', eans);
      if (catData) {
        catData.forEach(item => {
          if (item.couleur) colorMap[item.ean] = item.couleur;
        });
      }
    }

    const jeux = jeuxBruts.map(j => ({ ...j, couleur: colorMap[j.ean] || "" }));
    
    setJeuxEnPrepa(jeux);
    setTotalEnPrepa(jeux.length);

    setComptesEtapes({
      etape_plastifier: jeux.filter(j => !j.etape_plastifier).length,
      etape_contenu: jeux.filter(j => !j.etape_contenu).length,
      etape_etiquette: jeux.filter(j => !j.etape_etiquette).length,
      etape_equiper: jeux.filter(j => !j.etape_equiper).length,
      etape_encoder: jeux.filter(j => !j.etape_encoder).length,
      etape_notice: jeux.filter(j => !j.etape_notice).length,
      etape_nouveaute: jeux.filter(j => !j.is_double && !j.etape_nouveaute).length, // Ne compte plus les doubles
    });

    const { count: countRep } = await supabase.from('reparations').select('*', { count: 'exact', head: true }).eq('statut', 'À faire');
    const { count: countManq } = await supabase.from('pieces_manquantes').select('*', { count: 'exact', head: true }).in('statut', ['Manquant', 'Commandé']);
    const { count: countOrp } = await supabase.from('pieces_trouvees').select('*', { count: 'exact', head: true }).eq('statut', 'En attente');

    setNbReparations(countRep || 0);
    setNbManquants(countManq || 0);
    setNbOrphelines(countOrp || 0); 
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const etapesVisuelles = [
    { nom: "Plastification", id: "etape_plastifier", color: "bg-[#baff29] text-white" }, 
    { nom: "Contenu", id: "etape_contenu", color: "bg-[#6ba4ff] text-white" },       
    { nom: "Étiquette", id: "etape_etiquette", color: "bg-[#9b51e0] text-white" },     
    { nom: "Équiper", id: "etape_equiper", color: "bg-[#f45be0] text-white" },         
    { nom: "Encoder", id: "etape_encoder", color: "bg-[#ff4d79] text-white" },         
    { nom: "Notice", id: "etape_notice", color: "bg-[#ff5e00] text-white" },           
    { nom: "Nouveauté", id: "etape_nouveaute", color: "bg-[#ffa600] text-white" }       
  ];

  const formatNum = (num: number) => num < 10 ? `0${num}` : num;

  const ajouterEan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && eanInput.trim() !== "") {
      const codeScan = eanInput.trim();
      setEanInput(""); 
      setJeuxAttente(prev => [...prev, { ean: codeScan, nom: "⏳ Recherche en cours...", typeAjout: "nouveaute", etapes: { ...defaultEtapes }, couleur: "" }]);
      try {
        const res = await fetch(`/api/recherche?ean=${codeScan}`);
        const data = await res.json();
        setJeuxAttente(prev => prev.map(jeu => jeu.ean === codeScan ? { ...jeu, nom: data.nom || "" } : jeu));
      } catch (err) {
        setJeuxAttente(prev => prev.map(jeu => jeu.ean === codeScan ? { ...jeu, nom: "" } : jeu));
      }
    }
  };

  const ajouterManuel = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && manuelInput.trim() !== "") {
      setJeuxAttente([...jeuxAttente, { ean: "Manuel", nom: manuelInput, typeAjout: "nouveaute", etapes: { ...defaultEtapes }, couleur: "" }]);
      setManuelInput("");
    }
  };

  const changerTypeAjout = (index: number, nouveauType: "nouveaute" | "double" | "existant") => {
    setJeuxAttente(prev => prev.map((jeu, i) => {
      if (i === index) {
        let nouvellesEtapes = { ...jeu.etapes };
        if (nouveauType === "existant") {
           nouvellesEtapes = {
             etape_plastifier: true, etape_contenu: true, etape_etiquette: true,
             etape_equiper: true, etape_encoder: true, etape_notice: true
           };
        } else if (jeu.typeAjout === "existant") {
           nouvellesEtapes = { ...defaultEtapes };
        }
        return { ...jeu, typeAjout: nouveauType, etapes: nouvellesEtapes };
      }
      return jeu;
    }));
  };

  const toggleEtapeAttente = (index: number, etapeId: string) => {
    if (etapeId === 'etape_nouveaute') return; 
    setJeuxAttente(prev => prev.map((jeu, i) => {
      if (i === index) return { ...jeu, etapes: { ...jeu.etapes, [etapeId]: !jeu.etapes[etapeId] } };
      return jeu;
    }));
  };

  const validerEtEnvoyer = async () => {
    const jeuxAInserer = jeuxAttente.map(jeu => {
      const isExistant = jeu.typeAjout === "existant";
      const isDouble = jeu.typeAjout === "double";
      
      const basesOk = jeu.etapes.etape_plastifier && jeu.etapes.etape_contenu && 
                      jeu.etapes.etape_etiquette && jeu.etapes.etape_equiper && 
                      jeu.etapes.etape_encoder && jeu.etapes.etape_notice;
                      
      // Un double va en stock si les bases sont faites. Un existant y va direct.
      const isTermine = isExistant || (isDouble && basesOk);

      return { 
        nom: jeu.nom, 
        ean: jeu.ean, 
        statut: isTermine ? "En stock" : "En préparation",
        is_double: isDouble || isExistant,
        etape_nouveaute: false, // JAMAIS true lors de l'ajout ! Se débloque manuellement pour les nouveautés dans l'atelier.
        etape_plastifier: isExistant ? true : jeu.etapes.etape_plastifier,
        etape_contenu: isExistant ? true : jeu.etapes.etape_contenu,
        etape_etiquette: isExistant ? true : jeu.etapes.etape_etiquette,
        etape_equiper: isExistant ? true : jeu.etapes.etape_equiper,
        etape_encoder: isExistant ? true : jeu.etapes.etape_encoder,
        etape_notice: isExistant ? true : jeu.etapes.etape_notice
      };
    });
    
    const { error: jeuxError } = await supabase.from('jeux').insert(jeuxAInserer);
    
    if (jeuxError) {
      console.error(jeuxError);
      alert("Erreur d'envoi dans jeux : " + jeuxError.message); 
      return;
    } 

    const catalogueUpdates = jeuxAttente.filter(j => j.couleur !== "").map(j => ({
      ean: j.ean,
      nom: j.nom,
      couleur: j.couleur
    }));

    if (catalogueUpdates.length > 0) {
      const { error: catError } = await supabase.from('catalogue').upsert(catalogueUpdates, { onConflict: 'ean' });
      if (catError) console.error("Erreur mise à jour catalogue:", catError.message);
    }

    setJeuxAttente([]); 
    setIsModalOpen(false); 
    fetchDashboardData(); 
  };

  const verifierSiTermine = (jeu: JeuType) => {
    const bases = jeu.etape_plastifier && jeu.etape_contenu && jeu.etape_etiquette && 
                  jeu.etape_equiper && jeu.etape_encoder && jeu.etape_notice;
    // Si c'est un double, il ne nécessite pas l'étape nouveauté pour être "Terminé"
    return jeu.is_double ? bases : (bases && jeu.etape_nouveaute);
  };

  const toggleEtapeUnique = async (id: string | number, colonne: string, valeurActuelle: boolean) => {
    const jeuActuel = jeuxEnPrepa.find(j => j.id === id);
    if (!jeuActuel) return;

    if (colonne === 'etape_nouveaute' && jeuActuel.is_double) return;

    const updatedVal = !valeurActuelle;
    const updatedJeu = { ...jeuActuel, [colonne]: updatedVal };
    
    const estFini = verifierSiTermine(updatedJeu);
    const newStatut = estFini ? "En stock" : "En préparation";

    if (estFini) {
      setJeuxEnPrepa(prev => prev.filter(j => j.id !== id));
      setTotalEnPrepa(prev => prev - 1);
    } else {
      setJeuxEnPrepa(prev => prev.map(j => j.id === id ? updatedJeu : j));
    }

    const { error } = await supabase.from('jeux').update({ [colonne]: updatedVal, statut: newStatut }).eq('id', id);
    if (error) alert("Erreur de synchronisation !");
    
    fetchDashboardData();
  };

  const validerSelectionEtape = async () => {
    if (!etapeActive || jeuxSelectionnes.length === 0) return;
    
    for (const id of jeuxSelectionnes) {
      const jeuActuel = jeuxEnPrepa.find(j => j.id === id);
      if (!jeuActuel) continue;

      const updatedJeu = { ...jeuActuel, [etapeActive]: true };
      const estFini = verifierSiTermine(updatedJeu);
      const newStatut = estFini ? "En stock" : "En préparation";

      await supabase.from('jeux').update({ [etapeActive]: true, statut: newStatut }).eq('id', id);
    }

    setEtapeActive(null);
    setJeuxSelectionnes([]);
    fetchDashboardData();
  };

  const toggleSelection = (id: string | number) => {
    setJeuxSelectionnes(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const etapeActiveInfo = etapesVisuelles.find(e => e.id === etapeActive);
  
  // NOUVEAU: On exclut les doubles de la modale de validation si l'étape active est "Nouveauté"
  const jeuxPourEtapeActive = jeuxEnPrepa.filter(j => {
    if (!etapeActive) return false;
    if (etapeActive === 'etape_nouveaute' && j.is_double) return false;
    return !j[etapeActive];
  });

  const changerCouleurJeu = async (idJeu: string | number, ean: string, nom: string, nouvelleCouleur: string) => {
    setJeuxEnPrepa(prev => prev.map(j => j.id === idJeu ? { ...j, couleur: nouvelleCouleur } : j));

    const { error } = await supabase
      .from('catalogue')
      .upsert({ ean, nom, couleur: nouvelleCouleur }, { onConflict: 'ean' });
      
    if (error) {
      console.error("Erreur màj couleur:", error);
      alert("Erreur de sauvegarde de la couleur");
    }
  };
  
  const jeuxEnPrepaFiltres = jeuxEnPrepa.filter(jeu => 
    jeu.nom.toLowerCase().includes(rechercheJeu.toLowerCase()) || 
    jeu.ean.includes(rechercheJeu)
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8 relative">
      <style>{`
        input[type="checkbox"].custom-cb { accent-color: black; width: 1.25rem; height: 1.25rem; cursor: pointer; }
        input[type="checkbox"].custom-cb:disabled { cursor: default; opacity: 0.6; }
      `}</style>
      
      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="absolute left-1/2 transform -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
        <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Accueil</Link>
        <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Inventaire</Link>
        <Link href="/atelier" className="px-6 py-2.5 rounded-full bg-[#baff29] text-black shadow-sm">Atelier</Link>
        <Link href="/agenda" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Agenda</Link>
        <Link href="/store" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Store</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">
        
        <div className="flex justify-end w-full">
          <button onClick={() => setIsModalOpen(true)} className="bg-black hover:bg-gray-800 text-white px-8 py-3 rounded-full font-bold transition-colors shadow-sm">
            + Ajouter un jeu
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div 
            onClick={() => { setIsListeOpen(true); setRechercheJeu(""); }}
            className="group bg-white border-2 border-slate-100 rounded-[2.5rem] p-10 flex flex-col items-center justify-center shadow-sm relative cursor-pointer hover:border-[#baff29] transition-colors"
          >
            <div className="absolute top-6 right-8 text-slate-300 group-hover:text-[#baff29] transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            </div>
            <h1 className="text-[10rem] leading-none font-black text-[#baff29] tracking-tighter group-hover:scale-105 transition-transform">
              {formatNum(totalEnPrepa)}
            </h1>
            <p className="text-3xl font-bold text-black mt-2 mb-6">Jeux en préparation</p>

            {/* Barre de recherche sur la carte */}
            <div className="w-full relative z-20" onClick={(e) => e.stopPropagation()}>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
                <input 
                  type="text" 
                  placeholder="Rechercher un jeu précis..." 
                  value={rechercheJeu}
                  onChange={(e) => {
                    setRechercheJeu(e.target.value);
                    setIsSearchDropdownOpen(true);
                  }}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-12 pr-4 py-3 text-black outline-none focus:border-[#baff29] transition-colors font-medium shadow-sm"
                />
                
                {/* Menu déroulant des résultats rapides */}
                {rechercheJeu && isSearchDropdownOpen && (
                  <div className="absolute top-full left-0 w-full bg-white border border-slate-200 rounded-xl shadow-xl mt-2 max-h-48 overflow-y-auto z-30">
                    {jeuxEnPrepaFiltres.length === 0 ? (
                      <div className="p-4 text-center text-slate-500 text-sm font-medium">Aucun jeu trouvé</div>
                    ) : (
                      jeuxEnPrepaFiltres.map(jeu => (
                        <div 
                          key={jeu.id} 
                          onClick={() => { 
                            setRechercheJeu(jeu.nom); 
                            setIsSearchDropdownOpen(false); 
                            setIsListeOpen(true); 
                          }}
                          className="p-3 hover:bg-[#baff29]/20 cursor-pointer border-b border-slate-100 last:border-0 flex flex-col transition-colors"
                        >
                          <span className="font-bold text-black text-left">{jeu.nom}</span>
                          <span className="text-xs font-medium text-slate-400 text-left">EAN: {jeu.ean}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#cdff66] rounded-[2.5rem] p-10 flex flex-col items-start justify-center shadow-sm">
            <h2 className="text-3xl font-bold text-black mb-8">Impression</h2>
            <div className="flex flex-col gap-4">
              <Link href="/etiquettes">
               <button className="bg-[#4d4d4d] hover:bg-[#333] transition-colors text-white py-3 px-8 rounded-full font-bold text-lg w-max shadow-sm text-center">
                Etiquettes
                </button>
              </Link>
              <Link href="/contenu">
              <button className="bg-[#4d4d4d] hover:bg-[#333] transition-colors text-white py-3 px-8 rounded-full font-bold text-lg w-max shadow-sm text-center">
                Contenu
              </button>
              </Link>
            </div>
          </div>

          <div className="bg-gradient-to-br from-[#ffaa00] to-[#ff7b00] rounded-[2.5rem] p-8 flex flex-col shadow-sm">
            <h2 className="text-3xl font-bold text-black/90 mb-6">Réparation</h2>
            <div className="flex flex-col gap-3 w-full">
              <Link href="/reparations" className="bg-black/10 hover:bg-black/20 transition-colors p-4 rounded-2xl flex justify-between items-center text-black">
                <span className="font-bold text-lg">🛠️ À réparer</span>
                <span className="bg-white text-[#ff7b00] px-3 py-1 rounded-full text-sm font-black shadow-sm">{nbReparations}</span>
              </Link>
              <Link href="/pieces" className="bg-black/10 hover:bg-black/20 transition-colors p-4 rounded-2xl flex justify-between items-center text-black">
                <span className="font-bold text-lg">🧩 Jeux incomplets</span>
                <span className="bg-white text-[#ff7b00] px-3 py-1 rounded-full text-sm font-black shadow-sm">{nbManquants}</span>
              </Link>
              <Link href="/pieces" className="bg-black/10 hover:bg-black/20 transition-colors p-4 rounded-2xl flex justify-between items-center text-black">
                <span className="font-bold text-lg">🔍 Pièces trouvées</span>
                <span className="bg-white text-[#ff7b00] px-3 py-1 rounded-full text-sm font-black shadow-sm">{nbOrphelines}</span>
              </Link>
            </div>
          </div>

        </div>

        <div className="bg-[#4d4d4d] border-2 border-slate-100 rounded-[2.5rem] p-8 lg:p-10 shadow-sm w-full mt-4">
          <h2 className="text-3xl font-bold text-white mb-8">Préparations à faire</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {etapesVisuelles.map((etape) => (
              <div 
                key={etape.id} 
                onClick={() => {
                  setEtapeActive(etape.id);
                  setJeuxSelectionnes([]); 
                }}
                className={`${etape.color} rounded-[2rem] p-5 flex flex-col justify-between aspect-square shadow-sm cursor-pointer hover:scale-105 hover:shadow-md transition-all`}
              >
               <span className="text-base font-bold">{etape.nom}</span>
                <span className="text-6xl font-black self-start mt-auto">{formatNum(comptesEtapes[etape.id] || 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      {etapeActive && etapeActiveInfo && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <div className={`${etapeActiveInfo.color} px-4 py-2 rounded-xl font-bold text-base`}>
                  {etapeActiveInfo.nom}
                </div>
                <h2 className="text-2xl font-black text-slate-800">
                  {jeuxPourEtapeActive.length} jeu(x) en attente
                </h2>
              </div>
              <button onClick={() => setEtapeActive(null)} className="text-slate-400 hover:text-black font-bold text-xl px-4 py-2 bg-slate-100 rounded-full">✕ Fermer</button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6">
              {jeuxPourEtapeActive.length === 0 ? (
                <p className="text-center text-slate-400 mt-10 font-medium">Tous les jeux ont validé cette étape ! 🎉</p>
              ) : (
                jeuxPourEtapeActive.map((jeu) => (
                  <label key={jeu.id} className={`flex items-center gap-4 bg-white p-5 rounded-xl shadow-sm mb-3 border cursor-pointer transition-colors ${jeuxSelectionnes.includes(jeu.id) ? 'border-black' : 'border-slate-100 hover:border-slate-300'}`}>
                    <input 
                      type="checkbox" 
                      className="custom-cb"
                      checked={jeuxSelectionnes.includes(jeu.id)}
                      onChange={() => toggleSelection(jeu.id)}
                    />
                    <div className="flex-1">
                      <span className="font-bold text-lg text-black block">{jeu.nom}</span>
                      <span className="text-sm font-medium text-slate-400 block mt-0.5">EAN: {jeu.ean}</span>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-between items-center gap-4">
              <button 
                onClick={() => setJeuxSelectionnes(jeuxPourEtapeActive.length === jeuxSelectionnes.length ? [] : jeuxPourEtapeActive.map(j => j.id))}
                className="font-bold text-slate-500 hover:text-black transition-colors"
              >
                {jeuxPourEtapeActive.length === jeuxSelectionnes.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              
              <button 
                onClick={validerSelectionEtape} 
                disabled={jeuxSelectionnes.length === 0} 
                className="bg-black hover:bg-gray-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 px-8 rounded-xl transition-colors"
              >
                ✓ Valider {jeuxSelectionnes.length > 0 ? `(${jeuxSelectionnes.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {isListeOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-black text-slate-800">📋 Jeux en préparation</h2>
              <button onClick={() => { setIsListeOpen(false); setRechercheJeu(""); }} className="text-slate-400 hover:text-black font-bold text-xl px-4 py-2 bg-slate-100 rounded-full">✕ Fermer</button>
            </div>

            {/* Barre de recherche dans la modale */}
            <div className="mb-4 relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
              <input 
                type="text" 
                placeholder="Rechercher dans la liste..." 
                value={rechercheJeu}
                onChange={(e) => setRechercheJeu(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-12 pr-4 py-3 text-black outline-none focus:border-black transition-colors font-medium shadow-sm"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-4 border border-slate-100">
              {jeuxEnPrepaFiltres.length === 0 ? (
                <p className="text-center text-slate-400 mt-10 font-medium">Aucun jeu trouvé.</p>
              ) : (
                jeuxEnPrepaFiltres.map((jeu) => {
                  const couleurObj = COULEURS.find(c => c.id === jeu.couleur);
                  return (
                    <div key={jeu.id} className="bg-white p-5 rounded-xl shadow-sm mb-3 border border-slate-100 flex flex-col lg:flex-row justify-between lg:items-center gap-4 hover:border-slate-300 transition-colors">
                      <div className="flex-1 min-w-[200px]">
                        <div className="flex items-center gap-3 mb-1">
                          <span className="font-bold text-xl text-black block leading-tight">{jeu.nom}</span>
                          
                          <div className="flex gap-1 bg-slate-50 p-1 rounded-full border border-slate-200">
                            {COULEURS.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => changerCouleurJeu(jeu.id, jeu.ean, jeu.nom, jeu.couleur === c.id ? "" : c.id)}
                                className={`w-4 h-4 rounded-full border transition-transform hover:scale-110 ${
                                  jeu.couleur === c.id ? 'border-black scale-125 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
                                } ${c.bg}`}
                                title={c.id}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center text-sm font-medium text-slate-400">
                          <BarcodeIcon /> EAN: {jeu.ean}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-2">
                        {etapesVisuelles.map((etape) => {
                          const estFait = jeu[etape.id] === true;
                          const isEtapeNouveaute = etape.id === 'etape_nouveaute';
                          
                          let labelText = estFait ? `✓ ${etape.nom}` : etape.nom;
                          let btnStyle = estFait 
                            ? `${etape.color} border-transparent shadow-sm scale-95 opacity-50 hover:opacity-100` 
                            : `bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-black`;
                          let isClickable = true;

                          if (isEtapeNouveaute && jeu.is_double) {
                            labelText = "🔄 Double";
                            btnStyle = "bg-slate-100 border-transparent text-slate-400 cursor-not-allowed";
                            isClickable = false; 
                          }

                          return (
                            <button
                              key={etape.id}
                              onClick={() => isClickable && toggleEtapeUnique(jeu.id, etape.id, estFait)}
                              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all border-2 ${btnStyle}`}
                              disabled={!isClickable}
                            >
                              {labelText}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-800">➕ Ajouter des jeux</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-black font-bold text-xl px-3 py-1 bg-slate-100 rounded-full">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">🔫 Scanner un EAN</label>
                <input type="text" value={eanInput} onChange={(e) => setEanInput(e.target.value)} onKeyDown={ajouterEan} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-black transition-colors" placeholder="Ex: 3770001874241" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">✍️ Taper un nom (EAN inconnu)</label>
                <input type="text" value={manuelInput} onChange={(e) => setManuelInput(e.target.value)} onKeyDown={ajouterManuel} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-black transition-colors" placeholder="Nom du jeu..." />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-6 min-h-[200px]">
              {jeuxAttente.length === 0 ? (
                <p className="text-center text-slate-400 mt-10 font-medium">La liste d&apos;attente est vide.</p>
              ) : (
                jeuxAttente.map((jeu, index) => (
                  <div key={index} className="group relative bg-white p-5 rounded-xl shadow-sm mb-3 border border-slate-100 hover:border-slate-300 transition-colors">
                    
                    <div className="flex justify-between items-start mb-2.5">
                      <div className="flex-1 mr-12">
                        
                        <div className="flex items-center gap-4">
                          {jeu.nom === "⏳ Recherche en cours..." ? (
                            <span className="font-bold text-lg text-slate-400">{jeu.nom}</span>
                          ) : editingIndex === index || jeu.nom === "" ? (
                            <input type="text" value={jeu.nom} onChange={(e) => setJeuxAttente(prev => {const l = [...prev]; l[index].nom = e.target.value; return l;})} onBlur={() => setEditingIndex(null)} onKeyDown={(e) => e.key === "Enter" && setEditingIndex(null)} autoFocus className="font-bold text-lg w-full max-w-[200px] bg-transparent border-b border-black text-black outline-none pb-1" />
                          ) : (
                            <span className="font-bold text-lg text-black block leading-tight">{jeu.nom}</span>
                          )}

                          <div className="flex gap-1.5 bg-slate-50 p-1.5 rounded-full border border-slate-200">
                            {COULEURS.map(c => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setJeuxAttente(prev => prev.map((j, i) => i === index ? { ...j, couleur: j.couleur === c.id ? "" : c.id } : j))}
                                className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 shadow-sm ${
                                  jeu.couleur === c.id ? 'border-black scale-110' : 'border-transparent'
                                } ${c.bg}`}
                                title={c.id}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center text-sm font-medium text-black/80 mt-1">
                          <BarcodeIcon />
                          {editingEanIndex === index ? (
                            <input type="text" value={jeu.ean === "Manuel" ? "" : jeu.ean} onChange={(e) => setJeuxAttente(prev => {const l = [...prev]; l[index].ean = e.target.value || "Manuel"; return l;})} onBlur={() => setEditingEanIndex(null)} onKeyDown={(e) => e.key === "Enter" && setEditingEanIndex(null)} autoFocus className="bg-transparent border-b border-black outline-none w-48 text-black" />
                          ) : (
                            <span>EAN: {jeu.ean}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mb-3 bg-slate-50 p-1.5 rounded-xl w-max border border-slate-200">
                      <button 
                        onClick={() => changerTypeAjout(index, 'nouveaute')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${jeu.typeAjout === 'nouveaute' ? 'bg-[#ffa600] text-white shadow-sm scale-105' : 'text-slate-500 hover:text-black hover:bg-slate-200'}`}
                      >
                        🌟 Nouveauté
                      </button>
                      <button 
                        onClick={() => changerTypeAjout(index, 'double')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${jeu.typeAjout === 'double' ? 'bg-blue-500 text-white shadow-sm scale-105' : 'text-slate-500 hover:text-black hover:bg-slate-200'}`}
                      >
                        🔄 Double
                      </button>
                      <button 
                        onClick={() => changerTypeAjout(index, 'existant')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${jeu.typeAjout === 'existant' ? 'bg-emerald-500 text-white shadow-sm scale-105' : 'text-slate-500 hover:text-black hover:bg-slate-200'}`}
                      >
                        ✅ Existant
                      </button>
                    </div>

                    <div className="flex gap-x-5 gap-y-1.5 flex-wrap border-t border-slate-100 pt-3">
                      {etapesVisuelles.map((etape) => {
                        const isExistant = jeu.typeAjout === 'existant';
                        const isDouble = jeu.typeAjout === 'double';
                        const isEtapeNouv = etape.id === 'etape_nouveaute';
                        
                        let disabled = isExistant || isEtapeNouv;
                        let checked = jeu.etapes[etape.id];
                        let label = etape.nom;

                        if (isExistant) {
                          checked = true;
                          if (isEtapeNouv) {
                             checked = false;
                             label = "🚫 Pas une nouveauté";
                          }
                        } else if (isDouble) {
                          if (isEtapeNouv) {
                            checked = false;
                            label = "🔄 Double";
                          }
                        } else {
                          if (isEtapeNouv) {
                            checked = false;
                            label = "🌟 Nouveauté (Atelier)";
                          }
                        }

                        return (
                          <label key={etape.id} className={`flex items-center gap-1.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                            <input 
                              type="checkbox" 
                              className="custom-cb" 
                              disabled={disabled} 
                              checked={checked} 
                              onChange={() => toggleEtapeAttente(index, etape.id)}
                            />
                            <span className="text-sm font-semibold leading-none text-black">
                              {label}
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="absolute top-4 right-4 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-white p-1 rounded-lg shadow-inner border border-slate-100">
                      <button onClick={() => setEditingEanIndex(index)} title="Modifier EAN" className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded">🏷️</button>
                      <button onClick={() => setEditingIndex(index)} title="Modifier Nom" className="text-blue-500 hover:bg-blue-50 p-1.5 rounded">✏️</button>
                      <button onClick={() => setJeuxAttente(prev => prev.filter((_, i) => i !== index))} title="Supprimer" className="text-red-500 hover:bg-red-50 p-1.5 rounded">🗑️</button>
                    </div>

                  </div>
                ))
              )}
            </div>
            
            <button onClick={validerEtEnvoyer} disabled={jeuxAttente.length === 0 || jeuxAttente.some(j => j.nom === "" || j.nom.includes("⏳"))} className="w-full bg-[#baff29] hover:bg-[#9de30b] disabled:bg-slate-200 text-black font-black py-4 rounded-xl transition-colors shadow-md">
              💾 Valider et envoyer à l'Atelier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}