"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase"; 
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ContenuPDF } from "../../components/ContenuPDF";

const CATEGORIES = [
  { id: "vert", nom: "Vert", color: "bg-[#baff29] text-black" },
  { id: "rose", nom: "Rose", color: "bg-[#f45be0] text-white" },
  { id: "bleu", nom: "Bleu", color: "bg-[#6ba4ff] text-white" },
  { id: "rouge", nom: "Rouge", color: "bg-[#ff4d79] text-white" },
  { id: "jaune", nom: "Jaune", color: "bg-[#ffa600] text-white" }
];

export type ContenuType = {
  id: string | number;
  ean: string;
  nom: string;
  elements: string;
  quantity: number;
  isOpen: boolean; 
};

export default function ContenuPage() {
  const [isClient, setIsClient] = useState(false); 

  const [contenus, setContenus] = useState<Record<string, ContenuType[]>>({
    vert: [], rose: [], bleu: [], rouge: [], jaune: []
  });

  const [sectionsOuvertes, setSectionsOuvertes] = useState<Record<string, boolean>>({
    vert: true, rose: false, bleu: false, rouge: false, jaune: false
  });

  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    setIsClient(true);
    chargerCatalogue();
  }, []);

  const chargerCatalogue = async () => {
    const { data } = await supabase.from('catalogue').select('*');
    if (data) {
      const dbContenus: Record<string, ContenuType[]> = { vert: [], rose: [], bleu: [], rouge: [], jaune: [] };
      data.forEach(item => {
        const couleur = item.couleur && dbContenus[item.couleur] ? item.couleur : "vert";
        dbContenus[couleur].push({
          id: item.ean || Date.now() + Math.random(),
          ean: item.ean || "",
          nom: item.nom || "",
          elements: item.contenu || "", 
          quantity: 0,
          isOpen: false 
        });
      });
      setContenus(dbContenus);
    }
  };

  const sauvegarderJeuDansBDD = async (jeu: ContenuType, couleurId: string) => {
    if (!jeu.ean || !jeu.nom) return; 
    const { error } = await supabase.from('catalogue').upsert({
      ean: jeu.ean,
      nom: jeu.nom,
      contenu: jeu.elements,
      couleur: couleurId
    });
    if (error) console.error("Erreur auto-save:", error);
  };

  const formaterTexte = (texte: string) => {
    if (!texte || texte.trim() === "") return "- \n\n- 1 règle du jeu";

    let lignes = texte.split('\n');

    lignes = lignes.map(l => {
      if (l.trim() === '') return ''; 
      if (l.trim().endsWith(':')) return l.trim(); 
      if (l.match(/^\s+[-*•]/)) return l; 
      if (l.trim().match(/^[-*•]\s*/)) return '- ' + l.trim().replace(/^[-*•]\s*/, ''); 
      return '- ' + l.trim(); 
    });

    const aRegle = lignes.some(l => l.toLowerCase().includes('règle du jeu'));
    if (!aRegle) {
      if (lignes[lignes.length - 1] !== '') lignes.push('');
      lignes.push('- 1 règle du jeu');
    }

    return lignes.join('\n');
  };

  const toggleSection = (id: string) => setSectionsOuvertes(prev => ({ ...prev, [id]: !prev[id] }));

  const toggleLigne = (couleurId: string, id: string | number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, isOpen: !c.isOpen } : c) }));
  };

  const ajouterLigne = (couleurId: string) => {
    const nouveauContenu: ContenuType = {
      id: Date.now(), ean: "", nom: "", elements: "", quantity: 1, isOpen: true, 
    };
    setContenus(prev => ({ ...prev, [couleurId]: [nouveauContenu, ...prev[couleurId]] }));
    if (!sectionsOuvertes[couleurId]) toggleSection(couleurId);
  };

  const mettreAJourLigne = (couleurId: string, id: string | number, champ: keyof ContenuType, valeur: string | number | boolean) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, [champ]: valeur } : c) }));
  };

  const gererBlur = (couleurId: string, jeu: ContenuType) => {
    const texteFormate = formaterTexte(jeu.elements);
    mettreAJourLigne(couleurId, jeu.id, "elements", texteFormate);
    sauvegarderJeuDansBDD({ ...jeu, elements: texteFormate }, couleurId);
  };

  const modifierQuantite = (couleurId: string, id: string | number, delta: number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c) }));
  };

  const supprimerLigne = (couleurId: string, id: string | number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].filter(c => c.id !== id) }));
  };

  // NOUVEAU : Fonction de validation automatique de l'étape contenu
  const genererPDF = async () => {
    const eansCompletsAImprimer: string[] = [];

    Object.values(contenus).forEach((liste) => {
      liste.forEach(c => {
        const estVide = !c.elements || c.elements.trim() === "";
        // On valide si le jeu a un nom, un ean, un contenu rempli et qu'on l'imprime
        if (!estVide && c.nom && c.ean && c.quantity > 0) {
          eansCompletsAImprimer.push(c.ean);
        }
      });
    });

    if (eansCompletsAImprimer.length > 0) {
      const { data: jeuxEnPrepa } = await supabase
        .from('jeux')
        .select('*')
        .in('ean', eansCompletsAImprimer)
        .eq('statut', 'En préparation');

      if (jeuxEnPrepa && jeuxEnPrepa.length > 0) {
        for (const jeu of jeuxEnPrepa) {
          const isTermine = jeu.etape_plastifier && true && jeu.etape_etiquette && jeu.etape_equiper && jeu.etape_encoder && jeu.etape_notice && jeu.etape_nouveaute;
          
          await supabase
            .from('jeux')
            .update({ 
              etape_contenu: true,
              statut: isTermine ? 'En stock' : 'En préparation'
            })
            .eq('id', jeu.id);
        }
      }
    }
  };

  const totalContenus = Object.values(contenus).flat().reduce((sum, c) => sum + c.quantity, 0);

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
          <h1 className="text-4xl font-black text-black mb-4">Fiches de contenu</h1>

          <div className="flex flex-col gap-4">
            {CATEGORIES.map((cat) => (
              <div key={cat.id} className="border-2 border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <div onClick={() => toggleSection(cat.id)} className={`${cat.color} p-5 flex justify-between items-center cursor-pointer select-none`}>
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    {cat.nom} <span className="bg-white/20 px-3 py-1 rounded-full text-sm">{contenus[cat.id].length} jeu(x)</span>
                  </h2>
                  <span className="font-bold text-xl">{sectionsOuvertes[cat.id] ? "−" : "+"}</span>
                </div>

                {sectionsOuvertes[cat.id] && (
                  <div className="p-6 bg-slate-50 flex flex-col gap-3">
                    {contenus[cat.id].length === 0 ? (
                      <p className="text-slate-400 font-medium text-center py-4">Aucune fiche.</p>
                    ) : (
                      contenus[cat.id].map((c) => {
                        const estVide = !c.elements || c.elements.trim() === "";

                        return (
                          <div key={c.id} className={`flex flex-col rounded-xl border-2 transition-colors overflow-hidden ${c.quantity > 0 ? 'border-black' : 'border-slate-200'} ${estVide && !c.isOpen ? 'bg-orange-50' : 'bg-white'}`}>
                            
                            <div className="flex items-center gap-4 p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleLigne(cat.id, c.id)}>
                              <div className="flex flex-col items-center gap-1 w-16 shrink-0" onClick={e => e.stopPropagation()}>
                                <span className="text-[10px] font-bold text-slate-400">QTE</span>
                                <input type="number" min="0" value={c.quantity} onChange={(e) => mettreAJourLigne(cat.id, c.id, "quantity", parseInt(e.target.value) || 0)} className={`w-full p-1.5 rounded-lg outline-none font-bold text-center border focus:border-slate-300 ${c.quantity > 0 ? 'bg-black text-white' : 'bg-slate-100 border-transparent text-black'}`} />
                              </div>

                              <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-lg truncate">{c.nom || "Nouveau jeu..."}</span>
                                  {estVide && <span className="bg-orange-200 text-orange-800 text-[10px] px-2 py-0.5 rounded-full font-bold">À REMPLIR</span>}
                                </div>
                                {!c.isOpen && (
                                  <p className="text-sm text-slate-500 opacity-70 truncate mt-0.5">
                                    {estVide ? "Aucun contenu renseigné..." : c.elements.replace(/\n/g, " / ")}
                                  </p>
                                )}
                              </div>

                              <div className="shrink-0 font-bold text-slate-400 px-4">
                                {c.isOpen ? "▲" : "▼"}
                              </div>
                            </div>

                            {c.isOpen && (
                              <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 flex gap-4 items-start">
                                <div className="flex-1 flex flex-col gap-3 mt-4">
                                  <div className="flex gap-2">
                                    <input type="text" value={c.ean} onChange={(e) => mettreAJourLigne(cat.id, c.id, "ean", e.target.value)} onBlur={() => sauvegarderJeuDansBDD(c, cat.id)} placeholder="EAN..." className="w-1/3 bg-white p-2.5 rounded-lg outline-none text-sm border border-slate-200 focus:border-black shadow-sm" />
                                    <input type="text" value={c.nom} onChange={(e) => mettreAJourLigne(cat.id, c.id, "nom", e.target.value)} onBlur={() => sauvegarderJeuDansBDD(c, cat.id)} placeholder="Nom du jeu..." className="w-2/3 bg-white p-2.5 rounded-lg outline-none font-bold border border-slate-200 focus:border-black shadow-sm text-lg" />
                                  </div>
                                  <textarea 
                                    value={c.elements} 
                                    onChange={(e) => mettreAJourLigne(cat.id, c.id, "elements", e.target.value)} 
                                    onBlur={() => gererBlur(cat.id, c)} 
                                    placeholder="EXTENSION :&#10;  - 1 plateau&#10;  - 50 cartes&#10;&#10;- 1 règle du jeu" 
                                    style={{ 
                                      lineHeight: '24px', 
                                      backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, #e2e8f0 23px, #e2e8f0 24px)',
                                      backgroundAttachment: 'local',
                                      backgroundPosition: '0 12px'
                                    }}
                                    className="w-full bg-white p-3 rounded-lg outline-none border border-slate-200 focus:border-black shadow-sm min-h-[144px] resize-y font-mono text-sm" 
                                  />
                                </div>
                                <button onClick={() => supprimerLigne(cat.id, c.id)} className="text-red-500 hover:bg-red-50 p-3 rounded-lg transition-colors mt-4">🗑️</button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                    <button onClick={() => ajouterLigne(cat.id)} className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-black hover:bg-slate-200 w-full py-3 rounded-xl transition-colors mt-2 border-2 border-dashed border-slate-300">
                      ➕ Ajouter une fiche {cat.nom}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </main>

        <aside className="w-[350px] bg-white rounded-[2rem] shadow-md flex flex-col h-[calc(100vh-8rem)] sticky top-8 shrink-0 overflow-hidden border-2 border-slate-100">
          <div className="p-6 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-black text-slate-800 mb-4">Générateur de fiches</h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
              <input type="text" placeholder="Rechercher un jeu..." value={recherche} onChange={(e) => setRecherche(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-black transition-colors" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {CATEGORIES.map(cat => {
              const items = contenus[cat.id].filter(c => c.nom.toLowerCase().includes(recherche.toLowerCase()));
              if (items.length === 0) return null;

              return (
                <div key={`side-${cat.id}`} className="flex flex-col gap-2">
                  <div className="flex justify-between items-center px-2">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">{cat.nom}</h3>
                  </div>
                  {items.map(c => (
                    <div key={`side-item-${c.id}`} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <span className="text-sm font-bold text-slate-700 truncate mr-2 flex-1">{c.nom || "Sans nom"}</span>
                      <div className="flex items-center bg-white rounded-lg border border-slate-200 shadow-sm shrink-0">
                        <button onClick={() => modifierQuantite(cat.id, c.id, -1)} className="px-2.5 py-1 text-slate-500 hover:text-black font-bold text-lg hover:bg-slate-50 rounded-l-lg">−</button>
                        <span className="w-8 text-center font-bold text-sm border-x border-slate-100">{c.quantity}</span>
                        <button onClick={() => modifierQuantite(cat.id, c.id, 1)} className="px-2.5 py-1 text-slate-500 hover:text-black font-bold text-lg hover:bg-slate-50 rounded-r-lg">+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="p-6 border-t border-slate-100 bg-white shadow-[0_-10px_15px_-3px_rgba(0,0,0,0.05)] relative z-10">
            <p className="text-center text-sm font-bold text-slate-500 mb-4">{totalContenus} fiche(s)</p>
            {isClient ? (
              <PDFDownloadLink document={<ContenuPDF contenus={contenus} />} fileName="contenu_ludo.pdf">
                {({ loading }) => (
                  // NOUVEAU : Ajout de l'événement onClick={genererPDF}
                  <button onClick={genererPDF} disabled={totalContenus === 0 || loading} className="w-full bg-[#d63031] hover:bg-[#b02627] disabled:bg-slate-200 disabled:text-slate-400 text-white font-black py-4 rounded-xl transition-colors shadow-md">
                    {loading ? 'PRÉPARATION PDF...' : 'GÉNÉRER LES FICHES'}
                  </button>
                )}
              </PDFDownloadLink>
            ) : (
              <button disabled className="w-full bg-slate-200 text-slate-400 font-black py-4 rounded-xl">CHARGEMENT...</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}