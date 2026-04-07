"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

type PieceManquante = { id: number; ean: string; nom: string; element_manquant: string; statut: string; };
type PieceTrouvee = { id: number; description: string; nom_suppose: string; statut: string; };

const normaliser = (str: string) => {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/s$/, "").trim();
};

const TYPES_PIECES = [
  { id: "carte", label: "🃏 Cartes", keywords: ["carte", "cartes"] },
  { id: "pion", label: "♟️ Pions", keywords: ["pion", "pions", "meeple", "figurine", "personnage", "jeton personnage"] },
  { id: "jeton", label: "🪙 Jetons", keywords: ["jeton", "jetons", "pièce", "piece", "ressource", "marqueur"] },
  { id: "de", label: "🎲 Dés", keywords: ["dé", "dés", "de", "des"] },
  { id: "plateau", label: "🗺️ Plateaux", keywords: ["plateau", "plateaux", "support", "tuile", "tuiles", "planche"] },
  { id: "regle", label: "📖 Règles", keywords: ["règle", "regle", "livret", "notice"] },
  { id: "cube", label: "🧊 Cubes", keywords: ["cube", "cubes", "bloc"] },
  { id: "bille", label: "🔮 Billes", keywords: ["bille", "billes", "boule"] },
];

export default function PiecesPage() {
  const [manquantes, setManquantes] = useState<PieceManquante[]>([]);
  const [trouvees, setTrouvees] = useState<PieceTrouvee[]>([]);
  const [filtreType, setFiltreType] = useState<string | null>(null);

  const [codeManq, setCodeManq] = useState("");
  const [nomManq, setNomManq] = useState("");
  const [contenuJeu, setContenuJeu] = useState<string[]>([]);
  const [qteManq, setQteManq] = useState<number | "">("");
  const [itemManq, setItemManq] = useState("");
  const [elemManqManuel, setElemManqManuel] = useState("");
  const [saisieManuelle, setSaisieManuelle] = useState(false);

  const [descTrouvee, setDescTrouvee] = useState("");
  const [nomSuppo, setNomSuppo] = useState("");

  const [suggestionsNom, setSuggestionsNom] = useState<{nom: string, code_syracuse: string, ean: string}[]>([]);
  const [selectedManquant, setSelectedManquant] = useState<number | null>(null);
  const [selectedTrouvees, setSelectedTrouvees] = useState<number[]>([]);

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    const { data: d1 } = await supabase.from('pieces_manquantes').select('*').in('statut', ['Manquant', 'Commandé']).order('id', { ascending: false });
    const { data: d2 } = await supabase.from('pieces_trouvees').select('*').eq('statut', 'En attente').order('id', { ascending: false });
    if (d1) setManquantes(d1);
    if (d2) setTrouvees(d2);
  };

  const verifierMatch = (m: PieceManquante, t: PieceTrouvee) => {
    const matchNom = t.nom_suppose && normaliser(m.nom).includes(normaliser(t.nom_suppose));
    const mNum = parseInt(m.element_manquant) || 0;
    const tNum = parseInt(t.description) || 0;
    const mTexte = normaliser(m.element_manquant.replace(/^\d+\s*/, ''));
    const tTexte = normaliser(t.description.replace(/^\d+\s*/, ''));
    const matchPiece = (mNum === tNum) && mNum > 0 && (mTexte.includes(tTexte) || tTexte.includes(mTexte));
    return matchNom || matchPiece;
  };

  const manquantesTriees = useMemo(() => {
    let listeFinale = manquantes.map(m => {
      const aUnMatchGeneral = trouvees.some(t => verifierMatch(m, t));
      let isSuggestion = false;
      if (selectedTrouvees.length > 0) {
        isSuggestion = selectedTrouvees.some(tId => {
          const t = trouvees.find(tr => tr.id === tId);
          return t ? verifierMatch(m, t) : false;
        });
      }
      return { ...m, hasMatch: aUnMatchGeneral, isSuggestion };
    });

    listeFinale.sort((a, b) => {
      if (a.statut === 'Commandé' && b.statut !== 'Commandé') return 1;
      if (a.statut !== 'Commandé' && b.statut === 'Commandé') return -1;
      if (selectedTrouvees.length > 0) {
        return Number(b.isSuggestion) - Number(a.isSuggestion);
      }
      return 0;
    });

    return listeFinale;
  }, [manquantes, trouvees, selectedTrouvees]);

  const trouveesTriees = useMemo(() => {
    let liste = [...trouvees];

    // Filtre intelligent sur les pièces trouvées
    if (filtreType) {
      const cat = TYPES_PIECES.find(t => t.id === filtreType);
      if (cat) {
        liste = liste.filter(t => {
          const txt = normaliser(t.description);
          return cat.keywords.some(kw => txt.includes(kw));
        });
      }
    }

    let listeFinale = liste.map(t => {
      let isSuggestion = false;
      if (selectedManquant) {
        const m = manquantes.find(ma => ma.id === selectedManquant);
        if (m) isSuggestion = verifierMatch(m, t);
      }
      return { ...t, isSuggestion };
    });

    if (selectedManquant) {
      listeFinale.sort((a, b) => Number(b.isSuggestion) - Number(a.isSuggestion));
    }
    return listeFinale;
  }, [trouvees, manquantes, selectedManquant, filtreType]);

  const fetchContenuJeu = async (eanTrouve: string) => {
    if (!eanTrouve) { setContenuJeu([]); return; }
    const { data } = await supabase.from('catalogue').select('contenu').eq('ean', eanTrouve).maybeSingle();
    if (data?.contenu) {
      const items = data.contenu.split('\n').map((l: string) => l.replace(/^[\s\-\*\u2022]*\d*\s*/, '').trim()).filter((l: string) => l.length > 0);
      setContenuJeu(items);
      if (items.length > 0) { setItemManq(items[0]); setSaisieManuelle(false); }
    } else {
      setContenuJeu([]); setSaisieManuelle(true);
    }
  };

  const chercherNom = async (code: string) => {
    if (!code) return;
    let codeF = code.trim();
    if (/^\d+$/.test(codeF) && codeF.length < 8) codeF = codeF.padStart(8, '0');
    const { data } = await supabase.from('jeux').select('nom, ean').eq('code_syracuse', codeF).limit(1).maybeSingle();
    if (data?.nom) { setNomManq(data.nom); if (data.ean) fetchContenuJeu(data.ean); }
  };

  const handleRechercheNom = async (text: string) => {
    setNomManq(text);
    if (text.length > 2) {
      const { data } = await supabase.from('jeux').select('nom, code_syracuse, ean').ilike('nom', `%${text}%`).limit(5);
      if (data) setSuggestionsNom(data.filter((v, i, a) => a.findIndex(t => (t.nom === v.nom)) === i));
    } else setSuggestionsNom([]);
  };

  const selectionnerSuggestion = (jeu: {nom: string, code_syracuse: string, ean: string}) => {
    setNomManq(jeu.nom);
    if (jeu.code_syracuse) setCodeManq(jeu.code_syracuse);
    if (jeu.ean) fetchContenuJeu(jeu.ean);
    setSuggestionsNom([]);
  };

  const ajouterManquant = async () => {
    if (!nomManq) return;
    let pieceFinale = "";
    if (contenuJeu.length > 0 && !saisieManuelle) {
      if (!qteManq || !itemManq) return;
      pieceFinale = `${qteManq} ${itemManq}`;
    } else {
      if (!elemManqManuel) return;
      if (!/^\d+/.test(elemManqManuel.trim())) { alert("⚠️ L'élément doit commencer par un chiffre."); return; }
      pieceFinale = elemManqManuel;
    }
    await supabase.from('pieces_manquantes').insert([{ ean: codeManq, nom: nomManq, element_manquant: pieceFinale }]);
    setCodeManq(""); setNomManq(""); setElemManqManuel(""); setQteManq(""); setContenuJeu([]); setSuggestionsNom([]);
    chargerDonnees();
  };

  const ajouterTrouve = async () => {
    if (!descTrouvee) return;
    if (!/^\d+/.test(descTrouvee.trim())) { alert("⚠️ La description doit commencer par un chiffre."); return; }
    await supabase.from('pieces_trouvees').insert([{ description: descTrouvee, nom_suppose: nomSuppo }]);
    setDescTrouvee(""); setNomSuppo("");
    chargerDonnees();
  };

  const commanderPiece = async (id: number) => {
    await supabase.from('pieces_manquantes').update({ statut: 'Commandé' }).eq('id', id);
    if (selectedManquant === id) setSelectedManquant(null);
    chargerDonnees();
  };

  const resoudreManquant = async (id: number) => {
    await supabase.from('pieces_manquantes').update({ statut: 'Résolu' }).eq('id', id);
    if (selectedManquant === id) setSelectedManquant(null);
    chargerDonnees();
  };

  const resoudreTrouve = async (id: number) => {
    await supabase.from('pieces_trouvees').update({ statut: 'Réaffecté' }).eq('id', id);
    setSelectedTrouvees(prev => prev.filter(tId => tId !== id));
    chargerDonnees();
  };

  const lierElements = async () => {
    if (!selectedManquant || selectedTrouvees.length === 0) return;
    await supabase.from('pieces_manquantes').update({ statut: 'Résolu' }).eq('id', selectedManquant);
    for (const tId of selectedTrouvees) { await supabase.from('pieces_trouvees').update({ statut: 'Réaffecté' }).eq('id', tId); }
    setSelectedManquant(null); setSelectedTrouvees([]); chargerDonnees();
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-[#e5e5e5] font-sans relative">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
      
      <header className="flex justify-between items-center mb-6 w-full max-w-screen-2xl mx-auto">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg">
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <main className="w-full max-w-screen-2xl mx-auto flex flex-col lg:flex-row gap-6 pb-24">
        
        {/* COLONNE GAUCHE : JEUX INCOMPLETS */}
        <div className="bg-white rounded-[3rem] p-8 lg:p-10 flex-1 shadow-md border-t-8 border-[#ff4d79] overflow-hidden flex flex-col">
          <h1 className="text-3xl font-black text-black mb-6">Jeux incomplets</h1>
          
          <div className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl mb-4 flex flex-col gap-3 shrink-0">
            <div className="flex gap-3 relative">
              <input type="text" placeholder="Code Syracuse..." value={codeManq} onChange={e => setCodeManq(e.target.value)} onBlur={() => chercherNom(codeManq)} className="w-1/3 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black" />
              <div className="relative w-2/3">
                <input type="text" placeholder="Nom du jeu..." value={nomManq} onChange={e => handleRechercheNom(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold" />
                {suggestionsNom.length > 0 && (
                  <div className="absolute top-full left-0 w-full mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                    {suggestionsNom.map((jeu, i) => (
                      <div key={i} onClick={() => selectionnerSuggestion(jeu)} className="p-3 hover:bg-slate-50 cursor-pointer font-bold border-b border-slate-100 last:border-none flex justify-between items-center">
                        <span>{jeu.nom}</span>
                        {jeu.code_syracuse && <span className="text-xs font-normal text-slate-400">{jeu.code_syracuse}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-3">
              {contenuJeu.length > 0 && !saisieManuelle ? (
                <>
                  <input type="number" placeholder="Qté" value={qteManq} onChange={e => setQteManq(Number(e.target.value))} className="w-20 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold text-center" min="1" />
                  <select value={itemManq} onChange={e => setItemManq(e.target.value)} className="flex-1 min-w-0 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-semibold bg-white truncate">
                    {contenuJeu.map((item, idx) => (
                      <option key={idx} value={item}>{item}</option>
                    ))}
                  </select>
                  <button onClick={() => setSaisieManuelle(true)} className="px-3 text-sm text-slate-400 hover:text-black underline shrink-0">Manuel</button>
                </>
              ) : (
                <input type="text" placeholder="Pièce (ex: 1 dé rouge)..." value={elemManqManuel} onChange={e => setElemManqManuel(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouterManquant()} className="flex-1 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black" />
              )}
              <button onClick={ajouterManquant} disabled={!nomManq || (saisieManuelle ? !elemManqManuel : !qteManq)} className="bg-[#ff4d79] hover:bg-[#e03a64] disabled:bg-slate-200 text-white font-black px-6 rounded-xl transition-colors">Ajouter</button>
            </div>
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto custom-scroll pr-2 flex-1 min-h-[300px] max-h-[600px]">
            {manquantesTriees.map(m => {
              const isSelected = selectedManquant === m.id;
              const isSuggestion = m.isSuggestion && selectedTrouvees.length > 0 && !isSelected;
              const isCommande = m.statut === 'Commandé';
              
              return (
                <div 
                  key={m.id} 
                  onClick={() => !isCommande && setSelectedManquant(isSelected ? null : m.id)}
                  className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all relative 
                    ${isCommande ? 'bg-slate-50 border-slate-200 opacity-80' : 
                      isSelected ? 'bg-white border-[#ff4d79] ring-4 ring-[#ff4d79]/30 shadow-md cursor-pointer' : 
                      isSuggestion ? 'bg-rose-50 border-[#ff4d79] border-dashed shadow-sm cursor-pointer' : 
                      'bg-white border-slate-100 hover:border-slate-300 cursor-pointer'}`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg leading-tight flex items-center gap-2 flex-wrap">
                      <span className="truncate">{m.nom}</span>
                      {isCommande && <span className="text-orange-500 text-xs font-black bg-orange-100 px-2.5 py-1 rounded-md uppercase tracking-wide border border-orange-200 shrink-0">📦 Commandé</span>}
                      {m.hasMatch && !isSuggestion && !isCommande && <span title="Une pièce correspondante a été trouvée !" className="text-xl animate-pulse">💡</span>}
                      {isSuggestion && !isCommande && <span className="text-[#ff4d79] text-xs font-black bg-white px-2 py-0.5 rounded-full border border-[#ff4d79] shrink-0">✨ Suggestion</span>}
                    </h3>
                    <div className="mt-2 pr-1">
                    <p className={`${isCommande ? 'text-slate-500' : 'text-[#ff4d79]'} font-bold text-sm line-clamp-2`} title={m.element_manquant}>
                      Manque : {m.element_manquant}
                    </p>
                  </div>
                  </div>
                  
                  <div className="flex gap-2 shrink-0 self-end sm:self-center">
                    {isCommande ? (
                      <button onClick={(e) => { e.stopPropagation(); resoudreManquant(m.id); }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">
                        📦 Reçue ✓
                      </button>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); commanderPiece(m.id); }} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">
                        🛒 Commander
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); resoudreManquant(m.id); }} title="Retirer de la liste" className="bg-slate-100 hover:bg-slate-200 text-slate-500 px-4 py-2 rounded-xl text-sm font-bold transition-colors">
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
            {manquantes.length === 0 && <p className="text-slate-400 text-center py-4">Aucun jeu incomplet !</p>}
          </div>
        </div>

        {/* COLONNE DROITE : PIÈCES ORPHELINES */}
        <div className="bg-white rounded-[3rem] p-8 lg:p-10 flex-1 shadow-md border-t-8 border-[#baff29] overflow-hidden flex flex-col">
          <h1 className="text-3xl font-black text-black mb-6">Pièces orphelines</h1>
          
          <div className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl mb-4 flex flex-col gap-3 shrink-0">
            <input type="text" placeholder="Description (ex: 1 bille noire)..." value={descTrouvee} onChange={e => setDescTrouvee(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold" />
            <div className="flex gap-3">
              <input type="text" placeholder="Jeu supposé (optionnel)..." value={nomSuppo} onChange={e => setNomSuppo(e.target.value)} onKeyDown={e => e.key === 'Enter' && ajouterTrouve()} className="flex-1 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black text-sm" />
              <button onClick={ajouterTrouve} disabled={!descTrouvee} className="bg-[#baff29] hover:bg-[#a1e619] disabled:bg-slate-200 text-black font-black px-6 rounded-xl transition-colors">Ajouter</button>
            </div>
          </div>

          {/* BARRE DE FILTRES INTELLIGENTS */}
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scroll shrink-0 mb-4">
            <button 
              onClick={() => setFiltreType(null)} 
              className={`whitespace-nowrap px-3 py-1.5 rounded-xl font-bold text-xs transition-colors border-2 ${filtreType === null ? 'bg-[#baff29] text-black border-[#baff29]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#baff29]'}`}
            >
              Tous
            </button>
            {TYPES_PIECES.map(type => (
              <button 
                key={type.id}
                onClick={() => setFiltreType(type.id === filtreType ? null : type.id)} 
                className={`whitespace-nowrap px-3 py-1.5 rounded-xl font-bold text-xs transition-colors border-2 ${filtreType === type.id ? 'bg-[#baff29] text-black border-[#baff29]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#baff29]'}`}
              >
                {type.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 overflow-y-auto custom-scroll pr-2 flex-1 min-h-[300px] max-h-[600px]">
            {trouveesTriees.map(t => {
              const isSelected = selectedTrouvees.includes(t.id);
              const isSuggestion = t.isSuggestion && selectedManquant !== null && !isSelected;

              return (
                <div 
                  key={t.id} 
                  onClick={() => setSelectedTrouvees(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                  className={`p-4 rounded-2xl border-2 cursor-pointer flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all 
                    ${isSelected ? 'bg-white border-[#baff29] ring-4 ring-[#baff29]/50 shadow-md' : 
                      isSuggestion ? 'bg-[#f4fce3] border-[#baff29] border-dashed shadow-sm' : 
                      'bg-white border-slate-100 hover:border-slate-300'}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="pr-1">
                    <h3 className="font-bold text-lg leading-tight flex items-center gap-2 flex-wrap line-clamp-2" title={t.description}>
                      {t.description}
                      {isSuggestion && <span className="text-[#84b506] text-xs font-black bg-white px-2 py-0.5 rounded-full border border-[#baff29] shrink-0 ml-1">✨ Suggestion</span>}
                    </h3>
                  </div>
                    {t.nom_suppose && <p className="text-slate-500 text-sm mt-1 truncate">Peut-être : <span className="italic">{t.nom_suppose}</span></p>}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); resoudreTrouve(t.id); }} className="shrink-0 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-bold transition-colors self-end sm:self-center">
                    Retirer seule ✕
                  </button>
                </div>
              );
            })}
            {trouvees.length === 0 && <p className="text-slate-400 text-center py-4">Le bac des pièces seules est vide !</p>}
            {trouvees.length > 0 && trouveesTriees.length === 0 && <p className="text-slate-400 text-center py-4">Aucune pièce ne correspond à ce filtre.</p>}
          </div>
        </div>

      </main>

      {/* BARRE DE FUSION FLOTTANTE */}
      {selectedManquant !== null && selectedTrouvees.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-black text-white px-8 py-5 rounded-full shadow-2xl flex items-center gap-6 z-50">
          <span className="font-bold text-lg whitespace-nowrap">🔗 Lier 1 jeu et {selectedTrouvees.length} pièce(s) ?</span>
          <button onClick={lierElements} className="bg-[#baff29] text-black px-6 py-2.5 rounded-xl font-black hover:scale-105 transition-transform shadow-[0_0_15px_rgba(186,255,41,0.5)] whitespace-nowrap">
            Valider la fusion ✓
          </button>
        </div>
      )}
    </div>
  );
}