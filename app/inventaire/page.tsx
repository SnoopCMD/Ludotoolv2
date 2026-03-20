"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase"; 
import Link from "next/link";

type JeuType = {
  id: string | number;
  nom: string;
  ean: string;
  code_syracuse?: string;
  statut: string;
  is_double?: boolean;
  etape_nouveaute?: boolean;
  couleur?: string;
  mecanique?: string;
  nb_de_joueurs?: string;
  etoiles?: string;
  temps_de_jeu?: string;
  coop_versus?: string;
  date_entree?: string | null; 
  date_sortie?: string | null;
};

type SelectionThematique = {
  id: string;
  titre: string;
  is_permanent: boolean;
  date_fin: string | null;
  jeux: JeuType[];
};

type FicheJeuData = JeuType & {
  contenu_boite?: string;
  historique_manquants?: any[];
  historique_reparations?: any[];
  image_url?: string;
  pdf_url?: string;
  description?: string;
  auteurs?: string;
  editeur?: string;
};

const COULEURS = [
  { id: 'vert', bg: 'bg-[#baff29]', text: 'text-black', border: 'border-[#baff29]', shadow: 'shadow-[#baff29]/50', label: 'Vert' },
  { id: 'rose', bg: 'bg-[#f45be0]', text: 'text-white', border: 'border-[#f45be0]', shadow: 'shadow-[#f45be0]/50', label: 'Rose' },
  { id: 'bleu', bg: 'bg-[#6ba4ff]', text: 'text-white', border: 'border-[#6ba4ff]', shadow: 'shadow-[#6ba4ff]/50', label: 'Bleu' },
  { id: 'rouge', bg: 'bg-[#ff4d79]', text: 'text-white', border: 'border-[#ff4d79]', shadow: 'shadow-[#ff4d79]/50', label: 'Rouge' },
  { id: 'jaune', bg: 'bg-[#ffa600]', text: 'text-black', border: 'border-[#ffa600]', shadow: 'shadow-[#ffa600]/50', label: 'Jaune' }
];

const getDuree = (temps?: string) => {
  if (!temps) return { label: "", level: 0 };
  const match = temps.match(/\d+/);
  if (!match) return { label: temps, level: 0 };
  const mins = parseInt(match[0], 10);
  if (mins < 30) return { label: "Rapide", level: 1 };
  if (mins <= 60) return { label: "Moyen", level: 2 };
  return { label: "Long", level: 3 };
};

const DureeGauge = ({ duree }: { duree?: string }) => {
  const { label, level } = getDuree(duree);
  if (level === 0) return null;
  return (
    <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 shrink-0" title={`Durée: ${duree}`}>
      <div className="flex items-end gap-[2px] h-3">
        <div className={`w-1 rounded-sm ${level >= 1 ? 'bg-emerald-400 h-1.5' : 'bg-slate-200 h-1.5'}`}></div>
        <div className={`w-1 rounded-sm ${level >= 2 ? 'bg-amber-400 h-2.5' : 'bg-slate-200 h-2.5'}`}></div>
        <div className={`w-1 rounded-sm ${level >= 3 ? 'bg-rose-500 h-full' : 'bg-slate-200 h-full'}`}></div>
      </div>
      <span className="text-[10px] font-bold text-slate-500 uppercase">{label}</span>
    </div>
  );
};

export default function InventairePage() {
  const [jeux, setJeux] = useState<JeuType[]>([]);
  const [selections, setSelections] = useState<SelectionThematique[]>([]); 
  
  const [recherche, setRecherche] = useState("");
  const [couleurFiltre, setCouleurFiltre] = useState<string | null>(null);
  
  const [tri, setTri] = useState("A-Z");
  const [filtreMeca, setFiltreMeca] = useState("");
  const [filtreJoueurs, setFiltreJoueurs] = useState(""); 
  const [filtreEtoiles, setFiltreEtoiles] = useState("");
  const [filtreTemps, setFiltreTemps] = useState("");
  const [filtreType, setFiltreType] = useState(""); 

  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [nbReparations, setNbReparations] = useState(0);
  const [nbManquants, setNbManquants] = useState(0);

  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isAgrandirOpen, setIsAgrandirOpen] = useState(false);
  const [editSelection, setEditSelection] = useState<Partial<SelectionThematique> | null>(null);
  const [scanInput, setScanInput] = useState("");
  const [rechercheAjout, setRechercheAjout] = useState("");

  // Fiche Jeu
  const [ficheJeu, setFicheJeu] = useState<FicheJeuData | null>(null);
  const [isLoadingFiche, setIsLoadingFiche] = useState(false);
  // NOUVEAU: Mode édition de la fiche
  const [isEditingFiche, setIsEditingFiche] = useState(false);
  const [editedFiche, setEditedFiche] = useState<FicheJeuData | null>(null);

  const fetchInventaire = async () => {
    setIsLoading(true);
    const { data: jeuxData, error: jeuxError } = await supabase
      .from('jeux')
      .select('id, nom, ean, code_syracuse, statut, is_double, etape_nouveaute, date_entree, date_sortie')
      .order('id', { ascending: false });

    const { count: countRep } = await supabase.from('reparations').select('*', { count: 'exact', head: true }).eq('statut', 'À faire');
    const { count: countManq } = await supabase.from('pieces_manquantes').select('*', { count: 'exact', head: true }).eq('statut', 'Manquant');
    setNbReparations(countRep || 0);
    setNbManquants(countManq || 0);

    const { data: selData } = await supabase.from('selections').select('*').order('is_permanent', { ascending: false });
    if (selData) setSelections(selData as SelectionThematique[]);

    if (jeuxError) {
      console.error("Erreur chargement inventaire:", jeuxError);
      setIsLoading(false);
      return;
    }

    const jeuxBruts = jeuxData as JeuType[];
    const eans = [...new Set(jeuxBruts.map(j => j.ean))];
    
    if (eans.length > 0) {
      const { data: catData } = await supabase.from('catalogue').select('ean, couleur, mecanique, nb_de_joueurs, etoiles, temps_de_jeu, coop_versus').in('ean', eans);
      if (catData) {
        setJeux(jeuxBruts.map(j => {
          const catInfo = catData.find(c => c.ean === j.ean);
          return {
            ...j,
            couleur: catInfo?.couleur || "",
            mecanique: catInfo?.mecanique || "",
            nb_de_joueurs: catInfo?.nb_de_joueurs || "",
            etoiles: catInfo?.etoiles || "",
            temps_de_jeu: catInfo?.temps_de_jeu || "",
            coop_versus: catInfo?.coop_versus || "",
          };
        }));
      }
    } else {
      setJeux(jeuxBruts);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchInventaire();
  }, []);

  const synchroniserBase = async () => { /* ... */ };
  const nettoyerMecaniques = async () => { /* ... */ };

  const mecasDispos = useMemo(() => [...new Set(jeux.map(j => j.mecanique).filter(Boolean))].sort(), [jeux]);

  const verifierJoueurs = (jeuNbStr?: string, filtreNbStr?: string) => {
    if (!filtreNbStr) return true;
    if (!jeuNbStr) return false;
    const cible = parseInt(filtreNbStr, 10);
    if (isNaN(cible)) return true;
    const nums = jeuNbStr.match(/\d+/g);
    if (!nums) return false;
    if (nums.length === 1) return jeuNbStr.includes("+") ? cible >= parseInt(nums[0], 10) : cible === parseInt(nums[0], 10);
    if (nums.length >= 2) return cible >= parseInt(nums[0], 10) && cible <= parseInt(nums[1], 10);
    return false;
  };

  const jeuxFiltres = useMemo(() => {
    let filtrés = jeux;
    if (couleurFiltre) filtrés = filtrés.filter(j => j.couleur === couleurFiltre);
    if (filtreMeca) filtrés = filtrés.filter(j => j.mecanique === filtreMeca);
    if (filtreJoueurs) filtrés = filtrés.filter(j => verifierJoueurs(j.nb_de_joueurs, filtreJoueurs));
    if (filtreEtoiles) filtrés = filtrés.filter(j => String(j.etoiles) === String(filtreEtoiles));
    if (filtreTemps) filtrés = filtrés.filter(j => getDuree(j.temps_de_jeu).label === filtreTemps);
    if (filtreType) filtrés = filtrés.filter(j => j.coop_versus === filtreType);
    if (recherche) {
      const term = recherche.toLowerCase();
      filtrés = filtrés.filter(j => j.nom.toLowerCase().includes(term) || j.ean.includes(term));
    }
    if (tri === "A-Z") filtrés.sort((a,b) => a.nom.localeCompare(b.nom));
    else if (tri === "Z-A") filtrés.sort((a,b) => b.nom.localeCompare(a.nom));
    return filtrés;
  }, [jeux, recherche, couleurFiltre, tri, filtreMeca, filtreJoueurs, filtreEtoiles, filtreTemps, filtreType]);

  const clearAllFilters = () => {
    setRecherche(""); setCouleurFiltre(null); setFiltreMeca(""); 
    setFiltreJoueurs(""); setFiltreEtoiles(""); setFiltreTemps(""); setFiltreType(""); setTri("A-Z");
  };

  const isListView = recherche !== "" || couleurFiltre !== null || filtreMeca !== "" || filtreJoueurs !== "" || filtreEtoiles !== "" || filtreTemps !== "" || filtreType !== "" || tri !== "A-Z";

  const jeuxEnStock = useMemo(() => jeux.filter(j => j.statut === 'En stock'), [jeux]);
  const atelierEnPrepa = useMemo(() => jeux.filter(j => j.statut === 'En préparation'), [jeux]);
  const totalAtelier = atelierEnPrepa.length + nbReparations + nbManquants;

  const nouveautesEnSalle = useMemo(() => jeuxEnStock.filter(j => j.etape_nouveaute && j.date_entree), [jeuxEnStock]);
  const nouveautesSalleJeux = useMemo(() => nouveautesEnSalle.filter(j => j.couleur !== 'vert').slice(0, 12), [nouveautesEnSalle]);
  const nouveautesPremiersJeux = useMemo(() => nouveautesEnSalle.filter(j => j.couleur === 'vert').slice(0, 10), [nouveautesEnSalle]);

  const dateProchaineRotation = useMemo(() => {
    const datesSorties = nouveautesEnSalle.filter(j => j.date_sortie).map(j => new Date(j.date_sortie!).getTime());
    if (datesSorties.length === 0) return null;
    return new Date(Math.min(...datesSorties)).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }, [nouveautesEnSalle]);

  // Gestion des Sélections
  const ouvrirCreationSelection = () => { setEditSelection({ id: crypto.randomUUID(), titre: "", is_permanent: true, date_fin: "", jeux: [] }); setIsSelectionModalOpen(true); };
  const ouvrirModificationSelection = (sel: SelectionThematique) => { setEditSelection({ ...sel }); setIsSelectionModalOpen(true); };
  const sauvegarderSelection = async () => {
    if (!editSelection || !editSelection.titre) return alert("Veuillez donner un titre à la sélection.");
    const { error } = await supabase.from('selections').upsert({ id: editSelection.id, titre: editSelection.titre, is_permanent: editSelection.is_permanent, date_fin: editSelection.is_permanent ? null : editSelection.date_fin, jeux: editSelection.jeux });
    if (error) alert("Erreur de sauvegarde : " + error.message);
    else { setIsSelectionModalOpen(false); fetchInventaire(); }
  };
  const supprimerSelection = async (id: string) => {
    if (!confirm("Voulez-vous vraiment supprimer cette sélection ?")) return;
    await supabase.from('selections').delete().eq('id', id);
    if(isSelectionModalOpen) setIsSelectionModalOpen(false);
    fetchInventaire();
  };
  const ajouterJeuSelection = (jeu: JeuType) => {
    if (!editSelection) return;
    if (editSelection.jeux?.find(j => j.id === jeu.id)) return;
    setEditSelection({ ...editSelection, jeux: [...(editSelection.jeux || []), jeu] });
    setRechercheAjout(""); setScanInput("");
  };
  const retirerJeuSelection = (idJeu: string | number) => {
    if (!editSelection) return;
    setEditSelection({ ...editSelection, jeux: editSelection.jeux?.filter(j => j.id !== idJeu) });
  };
  const handleScanSyracuse = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim() !== "") {
      let codeF = scanInput.trim();
      if (/^\d+$/.test(codeF) && codeF.length < 8) codeF = codeF.padStart(8, '0');
      const jeuTrouve = jeux.find(j => j.code_syracuse === codeF || j.ean === codeF);
      if (jeuTrouve) ajouterJeuSelection(jeuTrouve);
      else alert("Aucun jeu trouvé avec ce code Syracuse / EAN.");
    }
  };
  const resultatsRechercheAjout = useMemo(() => {
    if (!rechercheAjout) return [];
    const term = rechercheAjout.toLowerCase();
    return jeux.filter(j => j.nom.toLowerCase().includes(term) || j.code_syracuse?.includes(term)).slice(0, 5);
  }, [rechercheAjout, jeux]);


  // --- FICHE JEU ---
  const ouvrirFicheJeu = async (jeu: JeuType) => {
    setIsLoadingFiche(true);
    setIsEditingFiche(false); // Réinitialise le mode édition
    setFicheJeu({ ...jeu }); 
    
    try {
      const { data: catData } = await supabase.from('catalogue').select('contenu').eq('ean', jeu.ean).maybeSingle();
      const { data: manqData } = await supabase.from('pieces_manquantes').select('*').eq('ean', jeu.ean).order('id', { ascending: false });
      const { data: repData } = await supabase.from('reparations').select('*').eq('nom_jeu', jeu.nom).order('id', { ascending: false });

      setFicheJeu(prev => {
        if (!prev) return null;
        return {
          ...prev,
          contenu_boite: catData?.contenu || "",
          historique_manquants: manqData || [],
          historique_reparations: repData || []
        };
      });
    } catch (error) {
      console.error("Erreur lors de la récupération des détails du jeu:", error);
    } finally {
      setIsLoadingFiche(false);
    }
  };

  const activerEditionFiche = () => {
    if (!ficheJeu) return;
    setEditedFiche({ ...ficheJeu });
    setIsEditingFiche(true);
  };

  const sauvegarderFicheJeu = async () => {
    if (!editedFiche) return;

    // 1. MAJ de la table "jeux" (nom, ean, code_syracuse)
    const { error: errJeux } = await supabase.from('jeux').update({
      nom: editedFiche.nom,
      ean: editedFiche.ean,
      code_syracuse: editedFiche.code_syracuse || null
    }).eq('id', editedFiche.id);

    // 2. MAJ de la table "catalogue" (toutes les métadonnées)
    const { error: errCat } = await supabase.from('catalogue').upsert({
      ean: editedFiche.ean,
      nom: editedFiche.nom,
      couleur: editedFiche.couleur,
      mecanique: editedFiche.mecanique,
      nb_de_joueurs: editedFiche.nb_de_joueurs,
      etoiles: editedFiche.etoiles,
      temps_de_jeu: editedFiche.temps_de_jeu,
      coop_versus: editedFiche.coop_versus
      // auteurs, editeur, description, image_url... à ajouter quand tu auras les colonnes dans Supabase !
    });

    if (errJeux || errCat) {
      alert("Erreur lors de la sauvegarde.");
      console.error(errJeux, errCat);
    } else {
      setFicheJeu(editedFiche);
      setIsEditingFiche(false);
      fetchInventaire(); // Rafraîchit la liste principale en arrière-plan
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8 relative">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
      
      {/* HEADER */}
      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="absolute left-1/2 transform -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
        <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Accueil</Link>
        <Link href="/inventaire" className="px-6 py-2.5 rounded-full bg-[#baff29] text-black shadow-sm">Inventaire</Link>
        <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Atelier</Link>
        <Link href="/agenda" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Agenda</Link>
        <Link href="/store" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Store</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      {/* MAIN INVENTAIRE */}
      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl font-black text-black">📦 Inventaire</h1>
              <p className="text-slate-500 font-medium mt-1">{jeuxEnStock.length} jeux actuellement en stock</p>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto items-center">
              <div className="relative flex-1 md:w-80">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
                <input 
                  type="text" placeholder="Chercher un jeu, un code-barres..." value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-10 pr-4 py-3.5 font-bold outline-none focus:border-black transition-colors"
                />
                {recherche && <button onClick={() => setRecherche("")} className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-200 text-slate-600 rounded-full font-bold text-xs hover:bg-slate-300">✕</button>}
              </div>
              <button onClick={() => alert("Module d'import Syracuse en construction ! 🚧")} className="bg-black hover:bg-gray-800 text-white px-6 py-3.5 rounded-2xl font-bold transition-colors shadow-sm shrink-0 flex items-center gap-2">
                📥 Import
              </button>
              <div className="relative">
                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`w-12 h-12 flex items-center justify-center rounded-2xl border-2 transition-colors ${isSettingsOpen ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-100 hover:border-slate-300'}`} title="Outils de maintenance">
                  <span className={`text-xl transition-transform duration-300 ${isSettingsOpen ? 'rotate-90' : ''}`}>⚙️</span>
                </button>
                {isSettingsOpen && (
                  <div className="absolute right-0 top-full mt-3 bg-white shadow-xl rounded-2xl border border-slate-100 p-2 flex flex-col gap-1 z-50 min-w-[240px] animate-fade-in">
                    <span className="text-xs font-black text-slate-400 uppercase px-3 py-2">Maintenance</span>
                    <button onClick={synchroniserBase} disabled={isSyncing} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🧹 Synchroniser Catalogue</button>
                    <button onClick={nettoyerMecaniques} disabled={isSyncing} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🧽 Nettoyer Mécaniques</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {isLoading ? (
           <div className="flex-1 flex items-center justify-center"><p className="font-bold text-slate-400 animate-pulse">Chargement de l'inventaire...</p></div>
        ) : !isListView ? (
          <div className="animate-fade-in flex flex-col gap-8 flex-1 mt-2">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {COULEURS.map(c => {
                const count = jeuxEnStock.filter(j => j.couleur === c.id).length;
                return (
                  <div key={c.id} onClick={() => setCouleurFiltre(c.id)} className={`${c.bg} ${c.text} rounded-[2rem] p-6 flex flex-col items-center justify-center shadow-sm hover:scale-105 hover:brightness-95 transition-all cursor-pointer`}>
                    <span className="text-5xl font-black tracking-tighter">{count}</span>
                    <span className="text-xs font-bold uppercase tracking-widest mt-1 opacity-90">En stock</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-[400px]">
              
              {/* COLONNE NOUVEAUTÉS */}
              <div className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 flex flex-col max-h-[500px]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                  <h3 className="text-2xl font-black text-black flex items-center gap-2">🌟 Nouveautés</h3>
                  <div className="flex items-center gap-2">
                    {dateProchaineRotation && (
                      <span className="text-[10px] font-black bg-rose-100 text-rose-600 px-2 py-1.5 rounded-md uppercase shadow-sm">⏳ {dateProchaineRotation}</span>
                    )}
                    <Link href="/nouveautes" className="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-black transition-colors">Gérer</Link>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scroll pr-2 space-y-6">
                  {nouveautesEnSalle.length === 0 ? (
                    <p className="text-slate-400 font-medium text-sm">Aucune nouveauté en salle.</p>
                  ) : (
                    <>
                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          🎲 Salle Jeux <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{nouveautesSalleJeux.length}/12</span>
                        </h4>
                        <div className="space-y-2.5">
                          {Array.from({ length: 12 }).map((_, i) => {
                            const jeu = nouveautesSalleJeux[i];
                            if (jeu) {
                              const cObj = COULEURS.find(c => c.id === jeu.couleur);
                              return (
                                <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)} className={`bg-white p-3 rounded-xl border-2 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow ${cObj ? cObj.border : 'border-slate-100'}`}>
                                  <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                                  <span className="font-bold text-sm truncate flex-1">{jeu.nom}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={`empty-salle-${i}`} className="bg-slate-50 p-3 rounded-xl border-2 border-dashed border-slate-200 flex items-center gap-3 opacity-60">
                                <div className="w-3.5 h-3.5 rounded-full shrink-0 bg-slate-200"></div>
                                <span className="font-bold text-sm text-slate-400 italic">Place disponible</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                          🟢 Premiers Jeux <span className="bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">{nouveautesPremiersJeux.length}/10</span>
                        </h4>
                        <div className="space-y-2.5">
                          {Array.from({ length: 10 }).map((_, i) => {
                            const jeu = nouveautesPremiersJeux[i];
                            if (jeu) {
                              const cObj = COULEURS.find(c => c.id === jeu.couleur);
                              return (
                                <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)} className={`bg-white p-3 rounded-xl border-2 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow ${cObj ? cObj.border : 'border-slate-100'}`}>
                                  <div className={`w-3.5 h-3.5 rounded-full shrink-0 ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                                  <span className="font-bold text-sm truncate flex-1">{jeu.nom}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={`empty-prem-${i}`} className="bg-slate-50 p-3 rounded-xl border-2 border-dashed border-[#baff29] flex items-center gap-3 opacity-60">
                                <div className="w-3.5 h-3.5 rounded-full shrink-0 bg-[#baff29]"></div>
                                <span className="font-bold text-sm text-slate-400 italic">Place disponible</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* COLONNE SÉLECTION */}
              <div className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 flex flex-col max-h-[500px]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                  <h3 className="text-2xl font-black text-black flex items-center gap-2">❤️ Sélection</h3>
                  <div className="flex gap-2">
                    {selections.length > 0 && (
                      <button onClick={() => setIsAgrandirOpen(true)} className="px-3 py-1.5 bg-white border border-slate-200 text-xs font-bold rounded-lg hover:border-black transition-colors shadow-sm">
                        Agrandir
                      </button>
                    )}
                    <button onClick={ouvrirCreationSelection} className="w-8 h-8 flex items-center justify-center rounded-full bg-white border border-slate-200 font-bold hover:border-black hover:bg-black hover:text-white transition-colors shadow-sm">
                      +
                    </button>
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col gap-3 overflow-y-auto custom-scroll pr-1">
                  {selections.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl text-slate-400 font-medium text-sm p-6 text-center">
                      Créez des sélections thématiques
                    </div>
                  ) : (
                    selections.map(sel => (
                      <div key={sel.id} onClick={() => ouvrirModificationSelection(sel)} className="bg-white border-2 border-slate-200 rounded-2xl p-3 flex flex-col flex-1 min-h-[140px] max-h-full shadow-sm hover:border-[#ff4d79] transition-colors cursor-pointer group">
                        
                        <div className="flex justify-between items-start mb-2 shrink-0">
                          <div className="flex flex-col min-w-0 pr-2">
                            <h4 className="font-black text-sm text-slate-800 truncate group-hover:text-[#ff4d79] transition-colors">{sel.titre}</h4>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">
                              {sel.is_permanent ? 'Permanente' : `Jusqu'au ${sel.date_fin ? new Date(sel.date_fin).toLocaleDateString('fr-FR') : '?'}`}
                            </span>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{sel.jeux?.length || 0} jeux</span>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scroll pr-1 space-y-1.5">
                          {sel.jeux?.map(j => {
                            const c = COULEURS.find(col => col.id === j.couleur);
                            return (
                              <div key={j.id} onClick={(e) => { e.stopPropagation(); ouvrirFicheJeu(j); }} className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-100 hover:border-slate-300 transition-colors">
                                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${c ? c.bg : 'bg-slate-300'}`}></div>
                                <span className="font-bold text-[11px] text-slate-700 truncate flex-1">{j.nom}</span>
                              </div>
                            )
                          })}
                          {(!sel.jeux || sel.jeux.length === 0) && <span className="text-xs italic text-slate-400">Sélection vide</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* COLONNE ATELIER */}
              <div className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 flex flex-col max-h-[500px]">
                <div className="flex justify-between items-center mb-6 shrink-0">
                   <h3 className="text-2xl font-black text-black flex items-center gap-2">🛠️ Atelier</h3>
                   <div className="flex items-center gap-2">
                     <span className="text-[10px] font-black bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-md uppercase shadow-sm">Total: {totalAtelier}</span>
                     <Link href="/atelier" className="text-xs font-bold bg-white border border-slate-200 px-3 py-1.5 rounded-lg hover:border-black transition-colors">Voir tout</Link>
                   </div>
                </div>
                <div className="space-y-3 flex-1 overflow-y-auto custom-scroll pr-2">
                  {atelierEnPrepa.length === 0 ? <p className="text-slate-400 font-medium text-sm">Aucun jeu en préparation.</p> : null}
                  {atelierEnPrepa.map(jeu => {
                    const cObj = COULEURS.find(c => c.id === jeu.couleur);
                    return (
                      <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)} className={`bg-white p-3.5 rounded-xl border-2 shadow-sm flex items-center gap-3 cursor-pointer hover:shadow-md transition-shadow ${cObj ? cObj.border : 'border-slate-100'}`}>
                        <div className={`w-4 h-4 rounded-full shrink-0 ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                        <div className="flex flex-col overflow-hidden">
                           <span className="font-bold text-sm truncate">{jeu.nom}</span>
                           <span className="text-[10px] font-bold text-amber-500 uppercase mt-0.5">En prépa</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        ) : (
          <div className={`flex-1 bg-slate-50 rounded-[2rem] border-[3px] overflow-hidden flex flex-col animate-fade-in mt-2 transition-colors ${couleurFiltre ? COULEURS.find(c => c.id === couleurFiltre)?.border : 'border-slate-100'}`}>
            <div className="bg-white border-b-2 border-slate-100 flex flex-col p-4 gap-4">
              {couleurFiltre && (
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-500">Filtré par couleur :</span>
                    <div className={`px-3 py-1.5 rounded-md text-xs font-black uppercase shadow-sm ${COULEURS.find(c => c.id === couleurFiltre)?.bg} ${COULEURS.find(c => c.id === couleurFiltre)?.text}`}>
                      {couleurFiltre}
                    </div>
                  </div>
                  <button onClick={() => setCouleurFiltre(null)} className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-xl transition-colors">✕ Retirer</button>
                </div>
              )}
              <div className="flex flex-wrap lg:flex-nowrap justify-between items-center gap-4">
                <div className="flex items-center min-w-[200px]">
                  <button onClick={() => setTri(tri === "A-Z" ? "Z-A" : "A-Z")} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase px-4 py-2.5 rounded-xl transition-colors">Nom du jeu<span className="text-base leading-none">{tri === "A-Z" ? "↓" : "↑"}</span></button>
                </div>
                <div className="flex items-center gap-2 flex-wrap flex-1 justify-end">
                  <div className="relative flex items-center">
                    <span className="absolute left-3 text-sm">👥</span>
                    <input type="number" min="1" max="99" placeholder="Joueurs" value={filtreJoueurs} onChange={e => setFiltreJoueurs(e.target.value)} className="w-28 pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:border-black shadow-sm" />
                  </div>
                  <select value={filtreType} onChange={e => setFiltreType(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-black cursor-pointer shadow-sm w-36">
                    <option value="">⚔️ Type</option><option value="Coop">🤝 Coop</option><option value="Versus">⚔️ Versus</option><option value="Solo">👤 Solo</option>
                  </select>
                  <select value={filtreMeca} onChange={e => setFiltreMeca(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-black cursor-pointer shadow-sm w-44">
                    <option value="">⚙️ Toutes méca.</option>
                    {mecasDispos.map(m => <option key={m as string} value={m as string}>{m}</option>)}
                  </select>
                  <select value={filtreTemps} onChange={e => setFiltreTemps(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-black cursor-pointer shadow-sm">
                    <option value="">⏳ Durée</option><option value="Rapide">Rapide ({"<"} 30m)</option><option value="Moyen">Moyen (30-60m)</option><option value="Long">Long ({">"} 60m)</option>
                  </select>
                  <select value={filtreEtoiles} onChange={e => setFiltreEtoiles(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-black cursor-pointer shadow-sm">
                    <option value="">⭐ Étoiles</option><option value="1">1 Étoile</option><option value="2">2 Étoiles</option>
                    {(!couleurFiltre || ['vert', 'jaune'].includes(couleurFiltre)) && <option value="3">3 Étoiles</option>}
                  </select>
                  {(filtreJoueurs || filtreMeca || filtreTemps || filtreEtoiles || filtreType) && (
                    <button onClick={clearAllFilters} className="text-xs font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl transition-colors ml-2" title="Réinitialiser les filtres">✕</button>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 custom-scroll">
              {jeuxFiltres.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 mt-10"><span className="text-4xl mb-2">🤔</span><p className="font-bold">Aucun jeu ne correspond à vos filtres.</p></div>
              ) : (
                jeuxFiltres.map(jeu => {
                  const couleurObj = COULEURS.find(c => c.id === jeu.couleur);
                  return (
                    <div 
                      key={jeu.id} 
                      onClick={() => ouvrirFicheJeu(jeu)}
                      className="grid grid-cols-12 gap-4 p-4 mb-3 bg-white rounded-2xl border shadow-sm items-center hover:shadow-md hover:border-slate-300 transition-all group border-slate-100 cursor-pointer"
                    >
                      <div className="col-span-12 md:col-span-7 lg:col-span-6 font-bold text-black flex flex-col gap-1.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-4 h-4 rounded-full shadow-inner shrink-0 ${couleurObj ? couleurObj.bg : 'bg-slate-200'}`} title={jeu.couleur || 'Aucune couleur'}></div>
                          <span className="truncate text-base group-hover:text-blue-600 transition-colors">{jeu.nom}</span>
                        </div>
                        <div className="flex items-center gap-2 ml-7 mt-0.5 flex-wrap">
                          {jeu.mecanique && <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{jeu.mecanique}</span>}
                          {jeu.coop_versus && <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded">{jeu.coop_versus === 'Coop' ? '🤝 Coop' : jeu.coop_versus === 'Solo' ? '👤 Solo' : '⚔️ Versus'}</span>}
                          {jeu.nb_de_joueurs && <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded">👥 {jeu.nb_de_joueurs}</span>}
                          {jeu.etoiles && <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">⭐ {jeu.etoiles}</span>}
                          <DureeGauge duree={jeu.temps_de_jeu} />
                        </div>
                      </div>
                      <div className="col-span-6 md:col-span-3 lg:col-span-3 font-medium text-slate-500 font-mono text-sm">{jeu.ean}</div>
                      <div className="col-span-6 md:col-span-2 lg:col-span-2">
                        <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-md uppercase ${jeu.statut === 'En stock' ? 'bg-emerald-100 text-emerald-700' : jeu.statut === 'En préparation' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>{jeu.statut}</span>
                      </div>
                      <div className="col-span-12 lg:col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => e.stopPropagation()} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors">✏️</button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* --- MODAL GESTIONNAIRE DE SÉLECTION --- */}
      {isSelectionModalOpen && editSelection && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <h2 className="text-2xl font-black text-slate-800">
                {editSelection.titre ? '✏️ Modifier la sélection' : '✨ Nouvelle sélection'}
              </h2>
              <button onClick={() => setIsSelectionModalOpen(false)} className="text-slate-400 hover:text-black font-bold text-xl px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm hover:border-black transition-colors">✕ Fermer</button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 md:p-8 flex flex-col gap-8 custom-scroll">
              <div className="flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-slate-600 mb-2">Titre de la sélection</label>
                  <input 
                    type="text" value={editSelection.titre} onChange={e => setEditSelection({...editSelection, titre: e.target.value})}
                    placeholder="Ex: Soirée Frissons, Jeux Rapides..."
                    className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold text-lg"
                  />
                </div>
                <div className="md:w-1/3 border-2 border-slate-100 rounded-xl p-4 bg-slate-50">
                  <label className="flex items-center gap-3 cursor-pointer mb-3">
                    <input 
                      type="checkbox" checked={editSelection.is_permanent} 
                      onChange={e => setEditSelection({...editSelection, is_permanent: e.target.checked, date_fin: e.target.checked ? null : editSelection.date_fin})}
                      className="w-5 h-5 accent-black cursor-pointer"
                    />
                    <span className="font-bold text-slate-700">Sélection permanente</span>
                  </label>
                  {!editSelection.is_permanent && (
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">Date de fin</label>
                      <input 
                        type="date" value={editSelection.date_fin || ""} onChange={e => setEditSelection({...editSelection, date_fin: e.target.value})}
                        className="w-full bg-white border border-slate-200 p-2 rounded-lg outline-none focus:border-black text-sm font-bold text-slate-600"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="h-0.5 bg-slate-100 w-full rounded-full"></div>

              <div>
                <h3 className="text-xl font-black text-black mb-4">Ajouter des jeux</h3>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-slate-500 mb-1">🔫 Scanner Syracuse / EAN</label>
                    <input 
                      type="text" placeholder="Scanner et appuyer sur Entrée..." value={scanInput} 
                      onChange={e => setScanInput(e.target.value)} onKeyDown={handleScanSyracuse}
                      className="w-full bg-[#f4fce3] border-2 border-[#baff29] p-3 rounded-xl outline-none focus:border-black font-mono font-bold text-slate-700 placeholder:text-slate-400 placeholder:font-sans"
                    />
                  </div>
                  <div className="flex-1 relative">
                    <label className="block text-xs font-bold text-slate-500 mb-1">🔍 Recherche manuelle</label>
                    <input 
                      type="text" placeholder="Chercher par nom..." value={rechercheAjout} onChange={e => setRechercheAjout(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold"
                    />
                    {rechercheAjout && (
                      <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden z-20">
                        {resultatsRechercheAjout.map(j => (
                          <div key={j.id} onClick={() => ajouterJeuSelection(j)} className="p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer flex justify-between items-center">
                            <span className="font-bold text-sm text-slate-800">{j.nom}</span>
                            <span className="text-[10px] bg-black text-white px-2 py-1 rounded-md font-bold">Ajouter</span>
                          </div>
                        ))}
                        {resultatsRechercheAjout.length === 0 && <div className="p-3 text-sm text-slate-400 text-center font-bold">Aucun jeu trouvé</div>}
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 min-h-[150px]">
                  <h4 className="text-sm font-bold text-slate-500 mb-3">Dans la sélection ({editSelection.jeux?.length || 0})</h4>
                  <div className="flex flex-col gap-2">
                    {editSelection.jeux?.length === 0 ? (
                      <p className="text-slate-400 italic text-center py-4">Scannez ou cherchez des jeux pour les ajouter.</p>
                    ) : (
                      editSelection.jeux?.map(j => {
                        const c = COULEURS.find(col => col.id === j.couleur);
                        return (
                          <div key={j.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className={`w-3 h-3 rounded-full ${c ? c.bg : 'bg-slate-300'}`}></div>
                              <span className="font-bold text-slate-800">{j.nom}</span>
                              {j.code_syracuse && <span className="text-[10px] text-slate-400 font-mono">Syr: {j.code_syracuse}</span>}
                            </div>
                            <button onClick={() => retirerJeuSelection(j.id)} className="text-rose-500 hover:bg-rose-50 px-3 py-1.5 rounded-md font-bold text-sm transition-colors">
                              ✕
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t-2 border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
              {editSelection.titre && editSelection.id.length > 30 ? (
                <button onClick={() => supprimerSelection(editSelection.id)} className="text-rose-500 font-bold hover:bg-rose-50 px-4 py-2 rounded-xl transition-colors">
                  Supprimer la sélection
                </button>
              ) : <div></div>}
              <button onClick={sauvegarderSelection} className="bg-[#baff29] hover:bg-[#a0dc1b] text-black font-black px-8 py-3 rounded-xl shadow-md transition-transform hover:scale-105">
                💾 Sauvegarder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL AGRANDIR (Vue détaillée des sélections) --- */}
      {isAgrandirOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-8 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-6xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-6 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <h2 className="text-3xl font-black text-slate-800">🌟 Toutes les Sélections</h2>
                <p className="text-slate-500 font-medium mt-1">{selections.length} sélections actives</p>
              </div>
              <button onClick={() => setIsAgrandirOpen(false)} className="text-slate-400 hover:text-black font-black text-xl px-5 py-2.5 bg-white rounded-full border-2 border-slate-200 shadow-sm hover:border-black transition-colors">
                ✕ Fermer
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#e5e5e5] custom-scroll">
              <div className="flex flex-col gap-8">
                {selections.length === 0 ? (
                  <div className="text-center py-20 text-slate-400">
                    <span className="text-5xl mb-4 block">📭</span>
                    <p className="font-bold text-xl">Aucune sélection n'a été créée.</p>
                  </div>
                ) : (
                  selections.map(sel => (
                    <div key={sel.id} className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border-2 border-slate-200 flex flex-col">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end border-b-2 border-slate-100 pb-4 mb-6 gap-4">
                        <div>
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-3xl font-black text-black">{sel.titre}</h3>
                            {sel.is_permanent ? (
                              <span className="bg-emerald-100 text-emerald-700 text-xs font-black px-3 py-1 rounded-lg uppercase">Permanente</span>
                            ) : (
                              <span className="bg-orange-100 text-orange-700 text-xs font-black px-3 py-1 rounded-lg uppercase border border-orange-200">
                                Jusqu'au {sel.date_fin ? new Date(sel.date_fin).toLocaleDateString('fr-FR') : '?'}
                              </span>
                            )}
                          </div>
                          <p className="text-slate-500 font-bold">{sel.jeux?.length || 0} jeux dans cette sélection</p>
                        </div>
                        <button onClick={() => {setIsAgrandirOpen(false); ouvrirModificationSelection(sel);}} className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-5 py-2.5 rounded-xl transition-colors shrink-0">
                          ✏️ Modifier
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                        {sel.jeux?.map(j => {
                          const c = COULEURS.find(col => col.id === j.couleur);
                          return (
                            <div key={j.id} onClick={() => {setIsAgrandirOpen(false); ouvrirFicheJeu(j);}} className={`bg-slate-50 p-4 rounded-2xl border-2 flex items-start gap-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${c ? c.border : 'border-slate-200'}`}>
                              <div className={`w-4 h-4 rounded-full shrink-0 mt-0.5 shadow-inner ${c ? c.bg : 'bg-slate-300'}`}></div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-sm text-slate-800 truncate">{j.nom}</span>
                                {j.code_syracuse && <span className="text-[10px] font-mono text-slate-500 mt-1">Syr: {j.code_syracuse}</span>}
                              </div>
                            </div>
                          )
                        })}
                        {(!sel.jeux || sel.jeux.length === 0) && <p className="text-slate-400 italic text-sm py-2">Sélection vide.</p>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL FICHE JEU DÉTAILLÉE --- */}
      {ficheJeu && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
          <div className="bg-[#e5e5e5] rounded-[2.5rem] w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden relative border border-slate-200">
            
            {/* Header de la Fiche */}
            <div className="bg-white p-6 md:p-8 flex justify-between items-start border-b-2 border-slate-100 shrink-0">
              <div className="flex items-center gap-5">
                <div className={`w-8 h-8 rounded-full shadow-inner border-4 border-slate-100 ${COULEURS.find(c => c.id === (isEditingFiche && editedFiche ? editedFiche.couleur : ficheJeu.couleur))?.bg || 'bg-slate-300'}`}></div>
                <div className="flex flex-col gap-2">
                  {isEditingFiche && editedFiche ? (
                    <input 
                      type="text" 
                      value={editedFiche.nom} 
                      onChange={e => setEditedFiche({...editedFiche, nom: e.target.value})} 
                      className="text-3xl sm:text-4xl font-black text-slate-800 leading-none bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-2 outline-none focus:border-blue-500 w-full md:w-[400px]"
                    />
                  ) : (
                    <h2 className="text-3xl sm:text-4xl font-black text-slate-800 leading-none">{ficheJeu.nom}</h2>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className={`text-xs font-black px-2.5 py-1 rounded-md uppercase tracking-wider ${ficheJeu.statut === 'En stock' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {ficheJeu.statut}
                    </span>
                    {ficheJeu.is_double && <span className="text-xs font-black px-2.5 py-1 bg-blue-100 text-blue-700 rounded-md uppercase tracking-wider">Double</span>}
                    {ficheJeu.etape_nouveaute && <span className="text-xs font-black px-2.5 py-1 bg-[#baff29] text-black rounded-md uppercase tracking-wider shadow-sm">Nouveauté</span>}
                    
                    {isEditingFiche && editedFiche && (
                      <select 
                        value={editedFiche.couleur || ''} 
                        onChange={e => setEditedFiche({...editedFiche, couleur: e.target.value})}
                        className="text-xs font-bold bg-white border-2 border-slate-200 rounded-lg px-2 py-1 outline-none ml-2"
                      >
                        <option value="">Couleur...</option>
                        {COULEURS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setFicheJeu(null)} className="text-slate-400 hover:text-black font-black text-2xl w-12 h-12 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition-colors shrink-0">✕</button>
            </div>

            {/* Corps de la Fiche */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scroll flex flex-col lg:flex-row gap-6 md:gap-8">
              
              {/* Colonne Gauche (1/3) */}
              <div className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0">
                <div className="aspect-[3/4] bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm flex items-center justify-center overflow-hidden relative group">
                  {ficheJeu.image_url ? (
                    <img src={ficheJeu.image_url} alt={`Cover de ${ficheJeu.nom}`} className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-300 gap-4">
                      <span className="text-6xl">🖼️</span>
                      <p className="font-bold text-sm">Image MyLudo à venir</p>
                    </div>
                  )}
                </div>
                
                <button onClick={() => alert("Récupération du PDF via API (BGG/Philibert) bientôt disponible !")} className="w-full py-4 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-700 hover:border-black hover:text-black transition-colors shadow-sm flex items-center justify-center gap-3">
                  <span className="text-xl">📖</span> Voir les règles (PDF)
                </button>
              </div>

              {/* Colonne Droite (2/3) */}
              <div className="w-full lg:w-2/3 flex flex-col gap-6">
                
                {/* Bloc 1 : Infos de base */}
                <div className="bg-white rounded-[2rem] p-6 md:p-8 border-2 border-slate-100 shadow-sm">
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">📊 Informations</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-6 gap-x-4">
                    
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">EAN</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.ean} onChange={e => setEditedFiche({...editedFiche, ean: e.target.value})} className="font-mono font-bold text-slate-800 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full" />
                      ) : (
                        <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2 py-1 rounded w-max border border-slate-100">{ficheJeu.ean}</span>
                      )}
                    </div>
                    
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Syracuse</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.code_syracuse || ''} onChange={e => setEditedFiche({...editedFiche, code_syracuse: e.target.value})} className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border-2 border-blue-200 outline-none w-full" placeholder="Code..." />
                      ) : (
                        ficheJeu.code_syracuse ? <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-max border border-blue-100">{ficheJeu.code_syracuse}</span> : <span className="text-slate-300 font-bold">—</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mécanique</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.mecanique || ''} onChange={e => setEditedFiche({...editedFiche, mecanique: e.target.value})} className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full" placeholder="Méca..." />
                      ) : (
                        <span className="font-bold text-slate-700">{ficheJeu.mecanique || "—"}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Type</span>
                      {isEditingFiche && editedFiche ? (
                        <select value={editedFiche.coop_versus || ''} onChange={e => setEditedFiche({...editedFiche, coop_versus: e.target.value})} className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full">
                          <option value="">—</option><option value="Coop">Coop</option><option value="Versus">Versus</option><option value="Solo">Solo</option>
                        </select>
                      ) : (
                        <span className="font-bold text-slate-700">{ficheJeu.coop_versus || "—"}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Joueurs</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.nb_de_joueurs || ''} onChange={e => setEditedFiche({...editedFiche, nb_de_joueurs: e.target.value})} className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full" placeholder="Ex: 2-4" />
                      ) : (
                        <span className="font-bold text-slate-700">{ficheJeu.nb_de_joueurs ? `👥 ${ficheJeu.nb_de_joueurs}` : "—"}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Temps</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.temps_de_jeu || ''} onChange={e => setEditedFiche({...editedFiche, temps_de_jeu: e.target.value})} className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full" placeholder="Ex: 30" />
                      ) : (
                        <span className="font-bold text-slate-700">{ficheJeu.temps_de_jeu ? `⏳ ${ficheJeu.temps_de_jeu}` : "—"}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Difficulté</span>
                      {isEditingFiche && editedFiche ? (
                        <select value={editedFiche.etoiles || ''} onChange={e => setEditedFiche({...editedFiche, etoiles: e.target.value})} className="font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border-2 border-amber-200 outline-none w-full">
                          <option value="">—</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
                        </select>
                      ) : (
                        <span className="font-bold text-amber-500">{ficheJeu.etoiles ? `⭐ ${ficheJeu.etoiles}` : "—"}</span>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-slate-100 w-full my-6"></div>

                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Auteurs</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.auteurs || ''} onChange={e => setEditedFiche({...editedFiche, auteurs: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded p-2 text-sm outline-none" placeholder="Auteurs..." />
                      ) : (
                        <p className="font-medium text-slate-600 italic">{ficheJeu.auteurs || "Non renseigné"}</p>
                      )}
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Éditeur</span>
                      {isEditingFiche && editedFiche ? (
                        <input type="text" value={editedFiche.editeur || ''} onChange={e => setEditedFiche({...editedFiche, editeur: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded p-2 text-sm outline-none" placeholder="Editeur..." />
                      ) : (
                        <p className="font-medium text-slate-600 italic">{ficheJeu.editeur || "Non renseigné"}</p>
                      )}
                    </div>
                  </div>
                  
                  <div className="mt-6">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Description courte</span>
                    {isEditingFiche && editedFiche ? (
                      <textarea value={editedFiche.description || ''} onChange={e => setEditedFiche({...editedFiche, description: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg p-3 text-sm outline-none min-h-[100px]" placeholder="Description du jeu..." />
                    ) : (
                      <p className="font-medium text-slate-600 text-sm leading-relaxed">
                        {ficheJeu.description || "La description textuelle sera importée depuis la base de données Syracuse ou BGG."}
                      </p>
                    )}
                  </div>
                </div>

                {/* Bloc 2 : Contenu */}
                <div className="bg-white rounded-[2rem] p-6 md:p-8 border-2 border-slate-100 shadow-sm flex flex-col max-h-[350px]">
                  <div className="flex justify-between items-center mb-4 shrink-0">
                    <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">📦 Contenu de la boîte</h3>
                    <Link href="/contenu" className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg transition-colors">Modifier</Link>
                  </div>
                  <div className="overflow-y-auto custom-scroll pr-4 bg-slate-50 border border-slate-100 p-4 rounded-xl flex-1">
                    {isLoadingFiche ? (
                       <p className="text-slate-400 font-bold animate-pulse">Chargement du contenu...</p>
                    ) : ficheJeu.contenu_boite ? (
                      <p className="font-mono text-sm text-slate-700 whitespace-pre-wrap leading-loose">
                        {ficheJeu.contenu_boite}
                      </p>
                    ) : (
                      <p className="text-slate-400 font-medium italic">Aucun contenu renseigné pour ce jeu.</p>
                    )}
                  </div>
                </div>

                {/* Bloc 3 : Historique / Suivi */}
                <div className="bg-white rounded-[2rem] p-6 md:p-8 border-2 border-slate-100 shadow-sm">
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">🕰️ Suivi & Historique</h3>
                  
                  {/* Dates */}
                  <div className="flex gap-4 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Entrée en salle</span>
                      <span className="font-black text-emerald-600">{ficheJeu.date_entree ? new Date(ficheJeu.date_entree).toLocaleDateString('fr-FR') : "Pas en salle"}</span>
                    </div>
                    <div className="w-px bg-slate-200"></div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Sortie prévue</span>
                      <span className="font-black text-rose-500">{ficheJeu.date_sortie ? new Date(ficheJeu.date_sortie).toLocaleDateString('fr-FR') : "—"}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-bold text-slate-500 uppercase mb-3 flex justify-between items-center">
                        Pièces Manquantes
                        <span className="bg-rose-100 text-rose-600 px-2 py-0.5 rounded text-[10px]">{ficheJeu.historique_manquants?.length || 0}</span>
                      </h4>
                      <div className="space-y-2">
                        {isLoadingFiche ? (
                          <p className="text-xs text-slate-400">Chargement...</p>
                        ) : !ficheJeu.historique_manquants || ficheJeu.historique_manquants.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Aucun incident déclaré.</p>
                        ) : (
                          ficheJeu.historique_manquants.map((manq: any) => (
                            <div key={manq.id} className="bg-rose-50 border border-rose-100 p-2 rounded-lg flex justify-between items-center">
                              <span className="text-sm font-bold text-rose-700 truncate">{manq.element_manquant}</span>
                              <span className="text-[10px] font-black uppercase bg-white text-rose-500 px-1.5 py-0.5 rounded shadow-sm">{manq.statut}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-slate-500 uppercase mb-3 flex justify-between items-center">
                        Réparations
                        <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px]">{ficheJeu.historique_reparations?.length || 0}</span>
                      </h4>
                      <div className="space-y-2">
                        {isLoadingFiche ? (
                          <p className="text-xs text-slate-400">Chargement...</p>
                        ) : !ficheJeu.historique_reparations || ficheJeu.historique_reparations.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">Aucune réparation.</p>
                        ) : (
                          ficheJeu.historique_reparations.map((rep: any) => (
                            <div key={rep.id} className="bg-amber-50 border border-amber-100 p-2 rounded-lg flex justify-between items-center">
                              <span className="text-sm font-bold text-amber-700 truncate pr-2">{rep.description}</span>
                              <span className="text-[10px] font-black uppercase bg-white text-amber-600 px-1.5 py-0.5 rounded shadow-sm shrink-0">{rep.statut}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                </div>

              </div>
            </div>

            {/* Footer de la Fiche */}
            <div className="bg-white p-6 border-t-2 border-slate-100 flex justify-end gap-3 shrink-0">
              {isEditingFiche ? (
                <>
                  <button onClick={() => setIsEditingFiche(false)} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors shadow-sm">
                    Annuler
                  </button>
                  <button onClick={sauvegarderFicheJeu} className="px-6 py-2.5 bg-[#baff29] hover:bg-[#a1e619] text-black font-black rounded-xl transition-colors shadow-md">
                    💾 Enregistrer
                  </button>
                </>
              ) : (
                <>
                  <button onClick={activerEditionFiche} className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors shadow-sm">
                    ✏️ Editer les infos
                  </button>
                  <button className="px-6 py-2.5 bg-black hover:bg-slate-800 text-white font-black rounded-xl transition-colors shadow-md">
                    🖨️ Imprimer Étiquette
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}