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
  { id: "jaune", nom: "Jaune", color: "bg-[#ffa600] text-black" }
];

export type ContenuType = {
  id: string | number;
  ean: string;
  nom: string;
  elements: string;
  quantity: number;
  isOpen: boolean; 
  sansRegle?: boolean; // <-- AJOUT ICI
};

export default function ContenuPage() {
  const [isClient, setIsClient] = useState(false); 

  const [contenus, setContenus] = useState<Record<string, ContenuType[]>>({
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
      Object.keys(dbContenus).forEach(k => {
        dbContenus[k].sort((a, b) => a.nom.localeCompare(b.nom));
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
    if (error) console.error("Erreur auto-save catalogue:", error);

    const { data: jeuxExistants } = await supabase.from('jeux').select('id').eq('ean', jeu.ean).limit(1);
    if (!jeuxExistants || jeuxExistants.length === 0) {
      const { error: errJeu } = await supabase.from('jeux').insert([{
        ean: jeu.ean,
        nom: jeu.nom,
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

  const formaterTexte = (texte: string, sansRegle?: boolean) => {
    if (!texte || texte.trim() === "") return sansRegle ? "" : "- 1 règle du jeu";

    let lignes = texte.split('\n').map(l => {
      if (l.trim() === '') return ''; 
      if (l.trim().endsWith(':')) return l.trim(); 
      if (l.match(/^\s+[-*•]/)) return l; 
      if (l.trim().match(/^[-*•]\s*/)) return '- ' + l.trim().replace(/^[-*•]\s*/, ''); 
      return '- ' + l.trim(); 
    }).filter(l => l !== ''); // Supprime les lignes vides

    if (sansRegle) {
      // Nettoie si la case est cochée
      lignes = lignes.filter(l => !l.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/(regle|livret|notice)/));
    } else {
      const texteNormalise = lignes.join(' ').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const aRegle = texteNormalise.match(/(regle|livret|notice)/);
      // Ajout direct sans le saut de ligne vide !
      if (!aRegle) lignes.push('- 1 règle du jeu'); 
    }

    return lignes.join('\n');
  };

  // Auto-scroll
  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => {
      const isOpening = !prev[id];
      if (isOpening) {
        setTimeout(() => {
          const el = document.getElementById(`category-${id}`);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 20;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 100);
      }
      return { ...prev, [id]: isOpening };
    });
  };

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
    const texteFormate = formaterTexte(jeu.elements, jeu.sansRegle);
    mettreAJourLigne(couleurId, jeu.id, "elements", texteFormate);
    sauvegarderJeuDansBDD({ ...jeu, elements: texteFormate }, couleurId);
  };

  const modifierQuantite = (couleurId: string, id: string | number, delta: number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, quantity: Math.max(0, c.quantity + delta) } : c) }));
  };

  const supprimerLigne = (couleurId: string, id: string | number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].filter(c => c.id !== id) }));
  };

  const genererPDF = async () => {
    const eansCompletsAImprimer: string[] = [];

    Object.values(contenus).forEach((liste) => {
      liste.forEach(c => {
        const estVide = !c.elements || c.elements.trim() === "";
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

  const scrollToLetter = (letter: string, catId: string) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const startIndex = letters.indexOf(letter);
    
    for (let i = startIndex; i < letters.length; i++) {
      const target = document.querySelector(`div[data-category="${catId}"][data-letter="${letters[i]}"]`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
  };

  const totalContenus = Object.values(contenus).flat().reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8">
      <header className="flex justify-between items-center mb-6 w-full max-w-screen-2xl mx-auto shrink-0 relative z-30">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic cursor-pointer">+</div>
        <nav className="bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg gap-1">
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10"></div>
      </header>

      <div className="flex gap-4 w-full max-w-screen-2xl mx-auto items-start relative z-0">
        
        <main className="bg-white rounded-[3rem] p-6 lg:p-10 flex-1 shadow-md flex flex-col gap-6 overflow-visible border-2 border-slate-100 relative z-0 min-w-0">
          <h1 className="text-4xl font-black text-black mb-2">Impression du contenu</h1>

          <div className="flex flex-col gap-6">
            {CATEGORIES.map((cat) => {
              const nbIncomplets = contenus[cat.id].filter(c => !c.elements || c.elements.trim() === "").length;

              return (
              <div key={cat.id} id={`category-${cat.id}`} className="border-2 border-slate-100 rounded-[1.5rem] shadow-sm bg-slate-50 relative z-20">
                
                <div 
                  onClick={() => toggleSection(cat.id)} 
                  className={`sticky top-0 z-40 ${cat.color} p-5 flex justify-between items-center cursor-pointer select-none shadow-md ${sectionsOuvertes[cat.id] ? 'rounded-t-[1.5rem]' : 'rounded-[1.5rem]'}`}
                >
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    {cat.nom} 
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">{contenus[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && (
                      <span className="bg-red-500 text-white px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-red-600">
                         {nbIncomplets} incomplet(s)
                      </span>
                    )}
                  </h2>
                  <div className="flex items-center gap-4">
                    {sectionsOuvertes[cat.id] && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); ajouterLigne(cat.id); }}
                        className="w-8 h-8 flex items-center justify-center bg-black/10 hover:bg-black/20 rounded-full font-black text-xl transition-colors"
                        title="Ajouter une fiche"
                      >
                        +
                      </button>
                    )}
                    <span className="font-bold text-xl w-6 text-center">{sectionsOuvertes[cat.id] ? "−" : "+"}</span>
                  </div>
                </div>

                {sectionsOuvertes[cat.id] && (
                  <div className="p-4 sm:p-6 bg-slate-50 rounded-b-[1.5rem] flex gap-4 items-start">
                    
                    <div className="hidden sm:flex flex-col items-center justify-between sticky top-[90px] h-[calc(100vh-140px)] bg-white rounded-full py-2 px-1 shadow-sm border border-slate-200 z-30 w-8 shrink-0">
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

                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                      <button 
                        onClick={() => ajouterLigne(cat.id)} 
                        className="flex items-center justify-center gap-2 text-sm font-bold text-slate-500 hover:text-black hover:bg-slate-200 px-4 py-2.5 rounded-xl transition-colors mb-2 border-2 border-dashed border-slate-300 w-full lg:w-max mx-auto"
                      >
                        ➕ Ajouter une fiche {cat.nom}
                      </button>

                      {contenus[cat.id].length === 0 ? (
                        <p className="text-slate-400 font-medium text-center py-4">Aucune fiche.</p>
                      ) : (
                        contenus[cat.id].map((c) => {
                          const estVide = !c.elements || c.elements.trim() === "";
                          const startLetter = c.nom ? c.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

                          return (
                            <div 
                              key={c.id} 
                              data-letter={startLetter}
                              data-category={cat.id}
                              className={`flex flex-col rounded-xl border-2 transition-colors overflow-hidden scroll-mt-[90px] ${c.quantity > 0 ? 'border-black' : 'border-slate-200'} ${estVide && !c.isOpen ? 'bg-orange-50' : 'bg-white'}`}
                            >
                              
                              <div className="flex items-center gap-4 p-3 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => toggleLigne(cat.id, c.id)}>
                                <div className="flex flex-col items-center gap-1 w-16 shrink-0" onClick={e => e.stopPropagation()}>
                                  <span className="text-[10px] font-bold text-slate-400">QTE</span>
                                  <input type="number" min="0" value={c.quantity} onChange={(e) => mettreAJourLigne(cat.id, c.id, "quantity", parseInt(e.target.value) || 0)} className={`w-full p-1.5 rounded-lg outline-none font-bold text-center border focus:border-slate-300 ${c.quantity > 0 ? 'bg-black text-white' : 'bg-slate-100 border-transparent text-black'}`} />
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col justify-center">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-lg truncate">{c.nom || "Nouveau jeu..."}</span>
                                    {estVide && <span className="bg-orange-200 text-orange-800 text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0">À REMPLIR</span>}
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
                                  </div >
                                  <div className="flex flex-col gap-2 mt-4 shrink-0">
                                    <button onClick={() => supprimerLigne(cat.id, c.id)} className="text-red-500 hover:bg-red-50 p-3 rounded-lg transition-colors" title="Supprimer">🗑️</button>
                                    <button 
                                      onClick={() => {
                                        const newVal = !c.sansRegle;
                                        mettreAJourLigne(cat.id, c.id, "sansRegle", newVal);
                                        const newText = formaterTexte(c.elements, newVal);
                                        mettreAJourLigne(cat.id, c.id, "elements", newText);
                                        sauvegarderJeuDansBDD({ ...c, elements: newText }, cat.id);
                                      }} 
                                      className={`p-2 rounded-lg transition-colors flex flex-col items-center justify-center text-xs font-bold border ${c.sansRegle ? 'bg-orange-50 text-orange-500 border-orange-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}
                                      title={c.sansRegle ? "Ajouter la règle" : "Retirer la règle"}
                                    >
                                      <span className="text-lg">{c.sansRegle ? '🚫' : '📖'}</span>
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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