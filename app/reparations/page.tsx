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
  const [suggestionsNom, setSuggestionsNom] = useState<{nom: string, code_syracuse: string, ean: string}[]>([]);

  useEffect(() => { chargerReparations(); }, []);

  const chargerReparations = async () => {
    const { data } = await supabase.from('reparations').select('*').order('id', { ascending: false });
    if (data) setReparations(data);
  };

  const appliquerFiltresTypes = async (ean: string | undefined) => {
    if (!ean) {
      setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]);
      setTypeRep("Boîte");
      return;
    }
    const { data: catData } = await supabase.from('catalogue').select('contenu').eq('ean', ean).limit(1).maybeSingle();
    let contenuTexte = catData?.contenu ? catData.contenu.toLowerCase() : "";
    
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
    if (/^\d+$/.test(codeFormate) && codeFormate.length < 8) {
      codeFormate = codeFormate.padStart(8, '0');
      setEanJeu(codeFormate); 
    }

    const { data: jeuData } = await supabase.from('jeux').select('nom, ean').eq('code_syracuse', codeFormate).limit(1).maybeSingle();
    
    if (jeuData && jeuData.nom) {
      setNomJeu(jeuData.nom);
      appliquerFiltresTypes(jeuData.ean);
    } else {
      setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]);
    }
  };

  const handleRechercheNom = async (text: string) => {
    setNomJeu(text);
    if (text.length > 2) {
      const { data } = await supabase.from('jeux').select('nom, code_syracuse, ean').ilike('nom', `%${text}%`).limit(5);
      if (data) setSuggestionsNom(data.filter((v, i, a) => a.findIndex(t => (t.nom === v.nom)) === i));
    } else {
      setSuggestionsNom([]);
    }
  };

  const selectionnerSuggestion = (jeu: {nom: string, code_syracuse: string, ean: string}) => {
    setNomJeu(jeu.nom);
    if (jeu.code_syracuse) setEanJeu(jeu.code_syracuse);
    setSuggestionsNom([]);
    appliquerFiltresTypes(jeu.ean);
  };

  const gererEanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      chercherJeuViaEan(eanJeu);
    }
  };

  const ajouterReparation = async () => {
    if (!nomJeu && !eanJeu) return;
    const typeFinal = typeRep === "Autre" && customType ? customType : typeRep;
    await supabase.from('reparations').insert([{ ean: eanJeu, nom: nomJeu, type_reparation: typeFinal, description: desc }]);
    
    setEanJeu(""); setNomJeu(""); setDesc(""); setCustomType(""); setTypeRep("Boîte");
    setTypesDispos(["Boîte", "Plateau", "Cartes", "Autre"]);
    setSuggestionsNom([]);
    chargerReparations();
  };

  const changerStatut = async (id: number, statutActuel: string) => {
    const nouveauStatut = statutActuel === 'À faire' ? 'Terminé' : 'À faire';
    await supabase.from('reparations').update({ statut: nouveauStatut }).eq('id', id);
    chargerReparations();
  };

  const supprimer = async (id: number) => {
    await supabase.from('reparations').delete().eq('id', id);
    chargerReparations();
  };

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-[#e5e5e5] font-sans">
      <header className="flex justify-between items-center mb-6 w-full max-w-screen-xl mx-auto">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg">
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-screen-xl mx-auto shadow-md">
        <h1 className="text-4xl font-black text-black mb-8">🛠️ Réparations</h1>

        <div className="bg-slate-50 border-2 border-slate-100 p-6 rounded-3xl mb-8 flex flex-wrap gap-4 items-end">
          <div className="w-40">
            <label className="block text-sm font-bold text-slate-500 mb-2">Code Syracuse</label>
            <input type="text" placeholder="Scan..." value={eanJeu} onChange={e => setEanJeu(e.target.value)} onBlur={() => chercherJeuViaEan(eanJeu)} onKeyDown={gererEanKeyDown} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black transition-colors" />
          </div>
          
          <div className="flex-1 min-w-[200px] relative">
            <label className="block text-sm font-bold text-slate-500 mb-2">Jeu à réparer</label>
            <input type="text" placeholder="Nom du jeu..." value={nomJeu} onChange={e => handleRechercheNom(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black transition-colors font-bold" />
            
            {/* AUTOCOMPLÉTION */}
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

          <div className="min-w-[150px]">
            <label className="block text-sm font-bold text-slate-500 mb-2">Type</label>
            <div className="flex gap-2">
              <select value={typeRep} onChange={e => setTypeRep(e.target.value)} className="border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black cursor-pointer font-bold">
                {typesDispos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {typeRep === "Autre" && (
                <input type="text" placeholder="Préciser..." value={customType} onChange={e => setCustomType(e.target.value)} className="w-32 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black transition-colors" />
              )}
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-bold text-slate-500 mb-2">Description</label>
            <input type="text" placeholder="Coin déchiré, scotch à remettre..." value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ajouterReparation()} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black transition-colors" />
          </div>
          <button onClick={ajouterReparation} disabled={!nomJeu && !eanJeu} className="bg-[#ff9500] hover:bg-[#e68600] disabled:bg-slate-200 text-white font-black px-8 py-3 rounded-xl transition-colors h-[52px]">
            Ajouter
          </button>
        </div>

        <div className="grid gap-4">
          {reparations.length === 0 ? (
             <p className="text-center text-slate-400 py-10 font-medium">Aucune réparation en cours !</p>
          ) : (
            reparations.map(r => (
              <div key={r.id} className={`p-5 rounded-2xl flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white border-2 transition-opacity ${r.statut === 'À faire' ? 'border-slate-200 hover:border-slate-300' : 'border-emerald-100 opacity-60'}`}>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-bold text-xl">{r.nom || "Jeu inconnu"}</h3>
                    {r.ean && <span className="text-xs font-bold text-slate-400">({r.ean})</span>}
                    <span className="text-xs font-black bg-slate-100 text-slate-500 px-2.5 py-1 rounded-md uppercase tracking-wide">{r.type_reparation}</span>
                  </div>
                  {r.description && <p className="text-slate-500 font-medium">{r.description}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => changerStatut(r.id, r.statut)} className={`px-5 py-2 rounded-xl font-bold transition-colors ${r.statut === 'À faire' ? 'bg-slate-100 hover:bg-slate-200 text-black' : 'bg-emerald-100 text-emerald-700'}`}>
                    {r.statut === 'À faire' ? 'Valider ✓' : 'Annuler'}
                  </button>
                  <button onClick={() => supprimer(r.id)} className="px-4 py-2 text-red-500 bg-red-50 hover:bg-red-100 rounded-xl transition-colors">🗑️</button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}