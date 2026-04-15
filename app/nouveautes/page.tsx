"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase"; 
import Link from "next/link";

type JeuNouveaute = {
  id: string | number;
  nom: string;
  ean: string;
  couleur?: string;
  date_entree?: string | null;
  date_sortie?: string | null;
};

const COULEURS = [
  { id: 'vert', bg: 'bg-[#baff29]', text: 'text-black', border: 'border-[#baff29]' },
  { id: 'rose', bg: 'bg-[#f45be0]', text: 'text-white', border: 'border-[#f45be0]' },
  { id: 'bleu', bg: 'bg-[#6ba4ff]', text: 'text-white', border: 'border-[#6ba4ff]' },
  { id: 'rouge', bg: 'bg-[#ff4d79]', text: 'text-white', border: 'border-[#ff4d79]' },
  { id: 'jaune', bg: 'bg-[#ffa600]', text: 'text-black', border: 'border-[#ffa600]' }
];

const MAX_SALLE_JEUX = 12;
const MAX_PREMIERS_JEUX = 10;

const formaterDate = (dateStr?: string | null) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const estDepassee = (dateStr?: string | null) => {
  if (!dateStr) return false;
  const sortie = new Date(dateStr);
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  return sortie <= aujourdhui;
};

export default function NouveautesPage() {
  const [jeux, setJeux] = useState<JeuNouveaute[]>([]);
  const [jeuxDispos, setJeuxDispos] = useState<JeuNouveaute[]>([]);
  const [rechercheAjout, setRechercheAjout] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const fetchDatas = async () => {
    setIsLoading(true);
    
    const { data: stockData, error } = await supabase
      .from('jeux')
      .select('id, nom, ean, etape_nouveaute, date_entree, date_sortie')
      .eq('statut', 'En stock')
      .order('id', { ascending: true });

    if (error) {
      console.error("Erreur:", error);
      setIsLoading(false);
      return;
    }

    const bruts = stockData as any[];

    // Charge tout le catalogue d'un coup (évite les requêtes .in() trop longues)
    let colorMap: Record<string, string> = {};
    const { data: catData } = await supabase.from('catalogue').select('ean, couleur');
    if (catData) catData.forEach(item => { if (item.couleur) colorMap[item.ean] = item.couleur; });

    const tousLesJeux = bruts.map(j => ({ ...j, couleur: colorMap[j.ean] || "" }));
    
    setJeux(tousLesJeux.filter(j => j.etape_nouveaute));
    setJeuxDispos(tousLesJeux.filter(j => !j.etape_nouveaute));
    
    setIsLoading(false);
  };

  useEffect(() => {
    fetchDatas();
  }, []);

  const mettreEnAttente = async (id: string | number) => {
    setRechercheAjout("");
    const { error } = await supabase.from('jeux').update({ etape_nouveaute: true }).eq('id', id);
    if (error) alert("Erreur d'ajout à la file.");
    fetchDatas();
  };

  const validerEntreeEnSalle = async (id: string | number) => {
    const aujourdhui = new Date();
    const sortie = new Date();
    sortie.setDate(aujourdhui.getDate() + 14);

    const dateEntreeStr = aujourdhui.toISOString().split('T')[0];
    const dateSortieStr = sortie.toISOString().split('T')[0];

    const { error } = await supabase.from('jeux').update({ date_entree: dateEntreeStr, date_sortie: dateSortieStr }).eq('id', id);
    if (error) alert("Erreur lors de l'entrée en salle.");
    fetchDatas();
  };

  const retirerDesNouveautes = async (id: string | number) => {
    const { error } = await supabase.from('jeux').update({ etape_nouveaute: false, date_entree: null, date_sortie: null }).eq('id', id);
    if (error) alert("Erreur lors du retrait.");
    fetchDatas();
  };

  const premiersJeuxAttente = useMemo(() => jeux.filter(j => j.couleur === 'vert' && !j.date_entree), [jeux]);
  const premiersJeuxEnSalle = useMemo(() => jeux.filter(j => j.couleur === 'vert' && j.date_entree).sort((a,b) => new Date(a.date_sortie!).getTime() - new Date(b.date_sortie!).getTime()), [jeux]);

  const salleJeuxAttente = useMemo(() => jeux.filter(j => j.couleur !== 'vert' && !j.date_entree), [jeux]);
  const salleJeuxEnSalle = useMemo(() => jeux.filter(j => j.couleur !== 'vert' && j.date_entree).sort((a,b) => new Date(a.date_sortie!).getTime() - new Date(b.date_sortie!).getTime()), [jeux]);

  // Filtre recherche amélioré (EAN + suppression des accents)
  const resultatsRecherche = useMemo(() => {
    if (!rechercheAjout) return [];
    
    // Normaliser la recherche (minuscules, sans accents)
    const termNormalise = rechercheAjout.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    
    return jeuxDispos.filter(j => {
      const nomNormalise = j.nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return nomNormalise.includes(termNormalise) || j.ean.includes(rechercheAjout);
    }).slice(0, 5);
  }, [rechercheAjout, jeuxDispos]);

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8 relative">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
      
      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg gap-1">
          <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Inventaire</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-8">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
          <div>
            <h1 className="text-4xl font-black text-black">🌟 Nouveautés</h1>
            <p className="text-slate-500 font-medium mt-1">Gérez la file d'attente et la rotation des jeux exposés</p>
          </div>
          
          <div className="relative w-full md:w-96 z-20">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">➕</span>
            <input 
              type="text" placeholder="Ajouter par nom ou EAN..." value={rechercheAjout} onChange={(e) => setRechercheAjout(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl pl-10 pr-4 py-3 font-bold outline-none focus:border-black transition-colors"
            />
            {rechercheAjout && (
              <div className="absolute top-full mt-2 w-full bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                {resultatsRecherche.length === 0 ? (
                  <div className="p-4 text-sm text-slate-500 font-bold text-center">Aucun jeu disponible trouvé.</div>
                ) : (
                  resultatsRecherche.map(r => {
                    const cObj = COULEURS.find(c => c.id === r.couleur);
                    return (
                      <button key={r.id} onClick={() => mettreEnAttente(r.id)} className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 border-b border-slate-100 transition-colors text-left">
                        <div className={`w-3 h-3 rounded-full shrink-0 ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                        <span className="font-bold text-sm truncate flex-1">{r.nom}</span>
                        <span className="text-xs font-black bg-black text-white px-2 py-1 rounded-lg">Ajouter</span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
             <p className="font-bold text-slate-400 animate-pulse">Chargement des nouveautés...</p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            
            <section>
              <h2 className="text-2xl font-black text-black mb-4 flex items-center gap-2">
                🎲 Salle Jeux
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <div className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 flex flex-col">
                  <h3 className="text-lg font-black text-slate-700 mb-4 flex justify-between items-center">
                    <span>⏳ File d'attente</span>
                    <span className="bg-white px-2 py-1 rounded-md shadow-sm text-sm">{salleJeuxAttente.length}</span>
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scroll pr-2">
                    {salleJeuxAttente.length === 0 && <p className="text-slate-400 text-sm font-medium text-center mt-10">La file est vide</p>}
                    {salleJeuxAttente.map(jeu => {
                      const cObj = COULEURS.find(c => c.id === jeu.couleur);
                      const isFull = salleJeuxEnSalle.length >= MAX_SALLE_JEUX;
                      return (
                        <div key={jeu.id} className={`bg-white p-3 rounded-2xl border-2 shadow-sm flex items-center justify-between gap-3 ${cObj ? cObj.border : 'border-slate-100'}`}>
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className={`w-4 h-4 rounded-full shrink-0 shadow-inner ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                            <span className="font-bold text-sm truncate">{jeu.nom}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => retirerDesNouveautes(jeu.id)} title="Retirer de la liste" className="text-slate-400 hover:text-rose-500 font-bold px-2 py-1 bg-slate-50 rounded-lg">✕</button>
                            <button onClick={() => validerEntreeEnSalle(jeu.id)} disabled={isFull} className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                              {isFull ? 'Plein 🔒' : 'Valider l\'entrée ✅'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-emerald-50/50 border-2 border-emerald-100 rounded-[2rem] p-6 flex flex-col">
                  <h3 className="text-lg font-black text-emerald-800 mb-4 flex justify-between items-center">
                    <span>👁️ En salle (14 jours)</span>
                    <span className="bg-white px-2 py-1 rounded-md shadow-sm text-sm">{salleJeuxEnSalle.length} / {MAX_SALLE_JEUX}</span>
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scroll pr-2">
                    {Array.from({ length: MAX_SALLE_JEUX }).map((_, i) => {
                      const jeu = salleJeuxEnSalle[i];
                      if (jeu) {
                        const cObj = COULEURS.find(c => c.id === jeu.couleur);
                        const depasse = estDepassee(jeu.date_sortie);
                        return (
                          <div key={jeu.id} className={`bg-white p-3 rounded-2xl border-2 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${depasse ? 'border-rose-400 bg-rose-50/30' : cObj ? cObj.border : 'border-slate-100'}`}>
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className={`w-4 h-4 rounded-full shrink-0 shadow-inner ${cObj ? cObj.bg : 'bg-slate-200'}`}></div>
                              <div className="flex flex-col">
                                <span className="font-bold text-sm truncate">{jeu.nom}</span>
                                <span className="text-[10px] font-medium text-slate-500 mt-0.5">Entré le {formaterDate(jeu.date_entree)}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                              <div className={`text-xs font-black px-2 py-1 rounded-md ${depasse ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                                Sortie: {formaterDate(jeu.date_sortie)}
                              </div>
                              <button onClick={() => retirerDesNouveautes(jeu.id)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm ${depasse ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-black hover:text-black'}`}>
                                {depasse ? "Terminer !" : "Retirer"}
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={`empty-${i}`} className="bg-white/50 p-4 rounded-2xl border-2 border-dashed border-emerald-200 flex items-center justify-center opacity-60">
                          <span className="font-bold text-sm text-emerald-600/50 italic">Place disponible pour une nouveauté</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </section>

            <div className="h-0.5 bg-slate-100 w-full rounded-full"></div>

            <section>
              <h2 className="text-2xl font-black text-black mb-4 flex items-center gap-2">
                🟢 Salle Premiers Jeux
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                <div className="bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-6 flex flex-col">
                  <h3 className="text-lg font-black text-slate-700 mb-4 flex justify-between items-center">
                    <span>⏳ File d'attente</span>
                    <span className="bg-white px-2 py-1 rounded-md shadow-sm text-sm">{premiersJeuxAttente.length}</span>
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scroll pr-2">
                    {premiersJeuxAttente.length === 0 && <p className="text-slate-400 text-sm font-medium text-center mt-10">La file est vide</p>}
                    {premiersJeuxAttente.map(jeu => {
                      const isFull = premiersJeuxEnSalle.length >= MAX_PREMIERS_JEUX;
                      return (
                        <div key={jeu.id} className="bg-white p-3 rounded-2xl border-2 border-[#baff29] shadow-sm flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-4 h-4 rounded-full shrink-0 shadow-inner bg-[#baff29]"></div>
                            <span className="font-bold text-sm truncate">{jeu.nom}</span>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => retirerDesNouveautes(jeu.id)} title="Retirer de la liste" className="text-slate-400 hover:text-rose-500 font-bold px-2 py-1 bg-slate-50 rounded-lg">✕</button>
                            <button onClick={() => validerEntreeEnSalle(jeu.id)} disabled={isFull} className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                              {isFull ? 'Plein 🔒' : 'Valider l\'entrée ✅'}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="bg-emerald-50/50 border-2 border-emerald-100 rounded-[2rem] p-6 flex flex-col">
                  <h3 className="text-lg font-black text-emerald-800 mb-4 flex justify-between items-center">
                    <span>👁️ En salle (14 jours)</span>
                    <span className="bg-white px-2 py-1 rounded-md shadow-sm text-sm">{premiersJeuxEnSalle.length} / {MAX_PREMIERS_JEUX}</span>
                  </h3>
                  <div className="space-y-3 flex-1 overflow-y-auto max-h-[500px] custom-scroll pr-2">
                    {Array.from({ length: MAX_PREMIERS_JEUX }).map((_, i) => {
                      const jeu = premiersJeuxEnSalle[i];
                      if (jeu) {
                        const depasse = estDepassee(jeu.date_sortie);
                        return (
                          <div key={jeu.id} className={`bg-white p-3 rounded-2xl border-2 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${depasse ? 'border-rose-400 bg-rose-50/30' : 'border-[#baff29]'}`}>
                            <div className="flex items-center gap-3 overflow-hidden">
                              <div className="w-4 h-4 rounded-full shrink-0 shadow-inner bg-[#baff29]"></div>
                              <div className="flex flex-col">
                                <span className="font-bold text-sm truncate">{jeu.nom}</span>
                                <span className="text-[10px] font-medium text-slate-500 mt-0.5">Entré le {formaterDate(jeu.date_entree)}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                              <div className={`text-xs font-black px-2 py-1 rounded-md ${depasse ? 'bg-rose-100 text-rose-600' : 'bg-slate-100 text-slate-600'}`}>
                                Sortie: {formaterDate(jeu.date_sortie)}
                              </div>
                              <button onClick={() => retirerDesNouveautes(jeu.id)} className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm ${depasse ? 'bg-rose-500 hover:bg-rose-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-black hover:text-black'}`}>
                                {depasse ? "Terminer !" : "Retirer"}
                              </button>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={`empty-prem-${i}`} className="bg-white/50 p-4 rounded-2xl border-2 border-dashed border-[#baff29]/50 flex items-center justify-center opacity-60">
                          <span className="font-bold text-sm text-[#8ca820] italic">Place disponible pour une nouveauté</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}