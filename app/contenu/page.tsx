"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ContenuPDF } from "../../components/ContenuPDF";

const CATEGORIES = [
  { id: "vert",  nom: "Vert",  hex: "#a8e063" },
  { id: "rose",  nom: "Rose",  hex: "#f472b6" },
  { id: "bleu",  nom: "Bleu",  hex: "#60a5fa" },
  { id: "rouge", nom: "Rouge", hex: "#f87171" },
  { id: "jaune", nom: "Jaune", hex: "#fb923c" },
];

export type ContenuType = {
  id: string | number;
  ean: string;
  nom: string;
  elements: string;
  quantity: number;
  isOpen: boolean;
  sansRegle?: boolean;
};

function ContenuPageInner() {
  const searchParams = useSearchParams();
  const [isClient, setIsClient] = useState(false);

  const [contenus, setContenus] = useState<Record<string, ContenuType[]>>({
    vert: [], rose: [], bleu: [], rouge: [], jaune: []
  });

  const [sectionsOuvertes, setSectionsOuvertes] = useState<Record<string, boolean>>({
    vert: false, rose: false, bleu: false, rouge: false, jaune: false
  });

  const [recherche, setRecherche] = useState(searchParams.get("nom") ?? "");

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
      ean: jeu.ean, nom: jeu.nom, contenu: jeu.elements, couleur: couleurId
    });
    if (error) console.error("Erreur auto-save catalogue:", error);

    const { data: jeuxExistants } = await supabase.from('jeux').select('id').eq('ean', jeu.ean).limit(1);
    if (!jeuxExistants || jeuxExistants.length === 0) {
      const { error: errJeu } = await supabase.from('jeux').insert([{
        ean: jeu.ean, nom: jeu.nom, statut: 'En préparation', is_double: false,
        etape_nouveaute: false, etape_plastifier: false, etape_contenu: false,
        etape_etiquette: false, etape_equiper: false, etape_encoder: false, etape_notice: false
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
    }).filter(l => l !== '');
    if (sansRegle) {
      lignes = lignes.filter(l => !l.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/(regle|livret|notice)/));
    } else {
      const texteNormalise = lignes.join(' ').toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      if (!texteNormalise.match(/(regle|livret|notice)/)) lignes.push('- 1 règle du jeu');
    }
    return lignes.join('\n');
  };

  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => {
      const isOpening = !prev[id];
      if (isOpening) {
        setTimeout(() => {
          const el = document.getElementById(`category-${id}`);
          if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 20, behavior: 'smooth' });
        }, 100);
      }
      return { ...prev, [id]: isOpening };
    });
  };

  const toggleLigne = (couleurId: string, id: string | number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, isOpen: !c.isOpen } : c) }));
  };

  const ajouterLigne = (couleurId: string) => {
    setContenus(prev => ({ ...prev, [couleurId]: [{ id: Date.now(), ean: "", nom: "", elements: "", quantity: 1, isOpen: true }, ...prev[couleurId]] }));
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
    Object.values(contenus).forEach(liste => {
      liste.forEach(c => {
        if (!((!c.elements || c.elements.trim() === "")) && c.nom && c.ean && c.quantity > 0) eansCompletsAImprimer.push(c.ean);
      });
    });
    if (eansCompletsAImprimer.length > 0) {
      const { data: jeuxEnPrepa } = await supabase.from('jeux').select('*').in('ean', eansCompletsAImprimer).eq('statut', 'En préparation');
      if (jeuxEnPrepa && jeuxEnPrepa.length > 0) {
        for (const jeu of jeuxEnPrepa) {
          const isTermine = jeu.etape_plastifier && true && jeu.etape_etiquette && jeu.etape_equiper && jeu.etape_encoder && jeu.etape_notice && jeu.etape_nouveaute;
          await supabase.from('jeux').update({ etape_contenu: true, statut: isTermine ? 'En stock' : 'En préparation' }).eq('id', jeu.id);
        }
      }
    }
  };

  const scrollToLetter = (letter: string, catId: string) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const startIndex = letters.indexOf(letter);
    for (let i = startIndex; i < letters.length; i++) {
      const target = document.querySelector(`div[data-category="${catId}"][data-letter="${letters[i]}"]`);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
  };

  const totalContenus = Object.values(contenus).flat().reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Mini header retour */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'var(--cream)', borderBottom: '3px solid var(--ink)', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link href="/atelier" className="pop-sticker" style={{ background: 'var(--ink)', color: 'var(--white)', textDecoration: 'none', fontSize: 14 }}>← Atelier</Link>
        <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase', letterSpacing: '.04em', background: 'linear-gradient(135deg,#0d0d0d 40%,#60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Impression contenu</div>
        <div style={{ width: 80 }} />
      </div>

      <div style={{ display: 'flex', gap: 16, padding: '24px 28px', alignItems: 'flex-start' }}>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          {CATEGORIES.map(cat => {
            const nbIncomplets = contenus[cat.id].filter(c => !c.elements || c.elements.trim() === "").length;
            const isOpen = sectionsOuvertes[cat.id];
            return (
              <div key={cat.id} id={`category-${cat.id}`} style={{ border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '4px 4px 0 var(--ink)', overflow: 'hidden', position: 'relative', zIndex: 20 }}>

                {/* Accordion header */}
                <div onClick={() => toggleSection(cat.id)} style={{ position: 'sticky', top: 56, zIndex: 40, background: cat.hex, borderBottom: isOpen ? '2.5px solid var(--ink)' : 'none', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="bc" style={{ fontSize: 22, textTransform: 'uppercase' }}>{cat.nom}</span>
                    <span className="pop-sticker" style={{ background: 'rgba(0,0,0,0.15)', border: '2px solid rgba(0,0,0,0.2)', boxShadow: 'none', fontSize: 12 }}>{contenus[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && <span className="pop-sticker" style={{ background: 'var(--rouge)', color: 'var(--white)', boxShadow: 'none', fontSize: 12 }}>{nbIncomplets} incomplet(s)</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isOpen && <button onClick={e => { e.stopPropagation(); ajouterLigne(cat.id); }} style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(0,0,0,0.15)', border: '2px solid rgba(0,0,0,0.2)', fontWeight: 900, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>}
                    <span style={{ fontWeight: 700, fontSize: 22, width: 20, textAlign: 'center' }}>{isOpen ? '−' : '+'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ background: 'var(--cream2)', padding: 16, display: 'flex', gap: 12, alignItems: 'flex-start' }}>

                    {/* Alpha scroll */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 72, height: 'calc(100vh - 120px)', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 20, padding: '6px 3px', boxShadow: '2px 2px 0 var(--ink)', width: 22, flexShrink: 0 }}>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                        <button key={l} onClick={() => scrollToLetter(l, cat.id)} style={{ fontSize: 8, fontWeight: 900, color: 'rgba(0,0,0,0.35)', background: 'none', border: 'none', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.35)')}>
                          {l}
                        </button>
                      ))}
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <button onClick={() => ajouterLigne(cat.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.45)', background: 'transparent', border: '2px dashed rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: 'max-content', margin: '0 auto 4px' }}>
                        ➕ Ajouter une fiche {cat.nom}
                      </button>

                      {contenus[cat.id].length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.35)', padding: '20px 0', fontSize: 15 }}>Aucune fiche.</p>
                      ) : contenus[cat.id].map(c => {
                        const estVide = !c.elements || c.elements.trim() === "";
                        const startLetter = c.nom ? c.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
                        return (
                          <div key={c.id} data-letter={startLetter} data-category={cat.id}
                            style={{ background: estVide && !c.isOpen ? '#fff7ed' : 'var(--white)', border: `2.5px solid ${c.quantity > 0 ? 'var(--ink)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 8, overflow: 'hidden', boxShadow: c.quantity > 0 ? '3px 3px 0 var(--ink)' : 'none', scrollMarginTop: 100 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer' }} onClick={() => toggleLigne(cat.id, c.id)}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, width: 52, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(0,0,0,0.35)', textTransform: 'uppercase', letterSpacing: '.06em' }}>QTE</span>
                                <input type="number" min="0" value={c.quantity} onChange={e => mettreAJourLigne(cat.id, c.id, "quantity", parseInt(e.target.value) || 0)}
                                  style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '2px solid var(--ink)', fontWeight: 700, textAlign: 'center', fontSize: 15, background: c.quantity > 0 ? 'var(--ink)' : 'var(--cream2)', color: c.quantity > 0 ? 'var(--white)' : 'var(--ink)', outline: 'none' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span style={{ fontWeight: 700, fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom || "Nouveau jeu..."}</span>
                                  {estVide && <span className="pop-sticker" style={{ background: 'var(--orange)', fontSize: 9, boxShadow: 'none', flexShrink: 0 }}>À REMPLIR</span>}
                                </div>
                                {!c.isOpen && <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{estVide ? "Aucun contenu renseigné..." : c.elements.replace(/\n/g, " / ")}</p>}
                              </div>
                              <span style={{ fontWeight: 700, color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>{c.isOpen ? '▲' : '▼'}</span>
                            </div>

                            {c.isOpen && (
                              <div style={{ padding: '12px 14px', borderTop: '2px solid var(--cream2)', background: 'var(--cream2)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ display: 'flex', gap: 8 }}>
                                    <input type="text" value={c.ean} onChange={e => mettreAJourLigne(cat.id, c.id, "ean", e.target.value)} onBlur={() => sauvegarderJeuDansBDD(c, cat.id)} placeholder="EAN..." className="pop-input" style={{ width: '33%', fontSize: 14 }} />
                                    <input type="text" value={c.nom} onChange={e => mettreAJourLigne(cat.id, c.id, "nom", e.target.value)} onBlur={() => sauvegarderJeuDansBDD(c, cat.id)} placeholder="Nom du jeu..." className="pop-input" style={{ flex: 1, fontWeight: 700 }} />
                                  </div>
                                  <textarea value={c.elements} onChange={e => mettreAJourLigne(cat.id, c.id, "elements", e.target.value)} onBlur={() => gererBlur(cat.id, c)}
                                    placeholder={"EXTENSION :\n  - 1 plateau\n  - 50 cartes\n\n- 1 règle du jeu"}
                                    style={{ lineHeight: '24px', backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, rgba(0,0,0,0.07) 23px, rgba(0,0,0,0.07) 24px)', backgroundAttachment: 'local', backgroundPosition: '0 12px', width: '100%', background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 8, padding: '10px 12px', outline: 'none', minHeight: 140, resize: 'vertical', fontFamily: 'monospace', fontSize: 15, boxShadow: '2px 2px 0 var(--ink)' }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                                  <button onClick={() => supprimerLigne(cat.id, c.id)} style={{ background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 16, boxShadow: '2px 2px 0 var(--ink)' }} title="Supprimer">🗑️</button>
                                  <button onClick={() => { const v = !c.sansRegle; mettreAJourLigne(cat.id, c.id, "sansRegle", v); const t = formaterTexte(c.elements, v); mettreAJourLigne(cat.id, c.id, "elements", t); sauvegarderJeuDansBDD({ ...c, elements: t }, cat.id); }}
                                    style={{ background: c.sansRegle ? '#fff7ed' : 'var(--white)', border: `2px solid ${c.sansRegle ? 'var(--orange)' : 'var(--ink)'}`, borderRadius: 6, padding: '8px 10px', cursor: 'pointer', fontSize: 16, boxShadow: '2px 2px 0 var(--ink)' }} title={c.sansRegle ? "Ajouter la règle" : "Retirer la règle"}>
                                    {c.sansRegle ? '🚫' : '📖'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </main>

        {/* ── ASIDE ── */}
        <aside style={{ width: 300, border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '4px 4px 0 var(--ink)', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 80px)', position: 'sticky', top: 68, flexShrink: 0, overflow: 'hidden', background: 'var(--white)' }}>
          <div style={{ padding: '16px 18px', borderBottom: '2.5px solid var(--ink)', background: 'var(--cream2)' }}>
            <div className="bc" style={{ fontSize: 20, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Générateur de fiches</div>
            <input type="text" placeholder="🔍 Rechercher un jeu..." value={recherche} onChange={e => setRecherche(e.target.value)} className="pop-input" style={{ width: '100%', fontSize: 14 }} />
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CATEGORIES.map(cat => {
              const items = contenus[cat.id].filter(c => c.nom.toLowerCase().includes(recherche.toLowerCase()));
              if (items.length === 0) return null;
              return (
                <div key={`side-${cat.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cat.hex, border: '1.5px solid var(--ink)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)' }}>{cat.nom}</span>
                  </div>
                  {items.map(c => (
                    <div key={`side-${c.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 10px', boxShadow: '2px 2px 0 var(--ink)' }}>
                      <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: 8 }}>{c.nom || "Sans nom"}</span>
                      <div style={{ display: 'flex', alignItems: 'center', border: '2px solid var(--ink)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                        <button onClick={() => modifierQuantite(cat.id, c.id, -1)} style={{ padding: '2px 8px', fontWeight: 700, fontSize: 16, background: 'var(--white)', border: 'none', borderRight: '1.5px solid var(--ink)', cursor: 'pointer' }}>−</button>
                        <span style={{ width: 28, textAlign: 'center', fontWeight: 700, fontSize: 14 }}>{c.quantity}</span>
                        <button onClick={() => modifierQuantite(cat.id, c.id, 1)} style={{ padding: '2px 8px', fontWeight: 700, fontSize: 16, background: 'var(--white)', border: 'none', borderLeft: '1.5px solid var(--ink)', cursor: 'pointer' }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '16px 18px', borderTop: '2.5px solid var(--ink)', background: 'var(--cream2)' }}>
            <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.45)', marginBottom: 10 }}>{totalContenus} fiche(s) sélectionnée(s)</div>
            {isClient ? (
              <PDFDownloadLink document={<ContenuPDF contenus={contenus} />} fileName="contenu_ludo.pdf">
                {({ loading }) => (
                  <button onClick={genererPDF} disabled={totalContenus === 0 || loading} className="pop-btn pop-btn-dark" style={{ width: '100%', justifyContent: 'center', opacity: totalContenus === 0 ? 0.4 : 1 }}>
                    {loading ? 'PRÉPARATION...' : 'GÉNÉRER LES FICHES →'}
                  </button>
                )}
              </PDFDownloadLink>
            ) : (
              <button disabled className="pop-btn" style={{ width: '100%', justifyContent: 'center', opacity: 0.4 }}>CHARGEMENT...</button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ContenuPage() {
  return (
    <Suspense>
      <ContenuPageInner />
    </Suspense>
  );
}
