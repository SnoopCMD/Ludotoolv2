"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase"; 
import Link from "next/link";
import NavBar from "../../components/NavBar";

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
  { id: 'vert',   hex: '#a8e063' },
  { id: 'rose',   hex: '#f472b6' },
  { id: 'bleu',   hex: '#60a5fa' },
  { id: 'rouge',  hex: '#f87171' },
  { id: 'orange', hex: '#fb923c' },
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

  // ── Recherche dans les modals d'étape ──
  const [rechercheEtape, setRechercheEtape] = useState("");

  // ── Modal scan codes Syracuse après Équiper ──
  const [isScanOpen,    setIsScanOpen]    = useState(false);
  const [scanQueue,     setScanQueue]     = useState<JeuType[]>([]);
  const [scanIdx,       setScanIdx]       = useState(0);
  const [scanInput,     setScanInput]     = useState("");
  const [scanDone,      setScanDone]      = useState<{ nom: string; code: string }[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

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
    { nom: "Plastification", id: "etape_plastifier", hex: '#a8e063' },
    { nom: "Contenu",        id: "etape_contenu",    hex: '#60a5fa' },
    { nom: "Étiquette",      id: "etape_etiquette",  hex: '#c084fc' },
    { nom: "Équiper",        id: "etape_equiper",    hex: '#f472b6' },
    { nom: "Encoder",        id: "etape_encoder",    hex: '#f87171' },
    { nom: "Notice",         id: "etape_notice",     hex: '#fb923c' },
    { nom: "Nouveauté",      id: "etape_nouveaute",  hex: '#facc15' },
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

    const jeuxValides: JeuType[] = [];
    for (const id of jeuxSelectionnes) {
      const jeuActuel = jeuxEnPrepa.find(j => j.id === id);
      if (!jeuActuel) continue;

      const updatedJeu = { ...jeuActuel, [etapeActive]: true };
      const estFini = verifierSiTermine(updatedJeu);
      const newStatut = estFini ? "En stock" : "En préparation";

      await supabase.from('jeux').update({ [etapeActive]: true, statut: newStatut }).eq('id', id);
      jeuxValides.push(jeuActuel);
    }

    setEtapeActive(null);
    setJeuxSelectionnes([]);
    fetchDashboardData();

    // Ouvrir la modal de scan si étape Équiper
    if (etapeActive === 'etape_equiper' && jeuxValides.length > 0) {
      setScanQueue(jeuxValides);
      setScanIdx(0);
      setScanInput("");
      setScanDone([]);
      setIsScanOpen(true);
    }
  };

  const scannerCode = async () => {
    const code = scanInput.trim();
    const jeu = scanQueue[scanIdx];
    if (!jeu) return;
    if (code) {
      await supabase.from('jeux').update({ code_syracuse: code }).eq('id', jeu.id);
      setScanDone(prev => [...prev, { nom: jeu.nom, code }]);
    }
    const next = scanIdx + 1;
    setScanIdx(next);
    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  const passerScan = () => {
    setScanIdx(prev => prev + 1);
    setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 50);
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

  const S = {
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 } as React.CSSProperties,
    modalBox: { background: 'var(--cream)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '8px 8px 0 var(--ink)', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: '90vh' } as React.CSSProperties,
    closeBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', fontWeight: 700, fontSize: 16, cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <style>{`
        input[type="checkbox"].custom-cb { accent-color: #0d0d0d; width: 1.1rem; height: 1.1rem; cursor: pointer; }
        input[type="checkbox"].custom-cb:disabled { cursor: default; opacity: 0.5; }
      `}</style>

      <NavBar current="atelier" />

      <div className="pop-page">

        {/* ── PAGE HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: 'uppercase', letterSpacing: '-1px', background: 'linear-gradient(135deg, #0d0d0d 40%, #a8e063)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Atelier
            </div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', marginTop: 6 }}>{totalEnPrepa} jeux en préparation</div>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="pop-btn pop-btn-dark">+ Ajouter un jeu</button>
        </div>

        {/* ── MAIN 3-COL GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>

          {/* Compteur — sticker style */}
          <div
            onClick={() => { setIsListeOpen(true); setRechercheJeu(""); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 380, position: 'relative', overflow: 'visible', cursor: 'pointer' }}
            onMouseEnter={e => { const s = e.currentTarget.querySelector<HTMLElement>('.sticker-main'); if (s) s.style.transform = 'rotate(-3deg) scale(1.04)'; }}
            onMouseLeave={e => { const s = e.currentTarget.querySelector<HTMLElement>('.sticker-main'); if (s) s.style.transform = 'rotate(-4deg) scale(1)'; }}
          >
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.06) 1.5px,transparent 1.5px)', backgroundSize: '14px 14px', borderRadius: 10, pointerEvents: 'none' }} />
            <div className="sticker-main" style={{ background: 'var(--yellow)', border: '4px solid var(--ink)', borderRadius: 22, padding: '32px 52px', transform: 'rotate(-4deg) scale(1)', boxShadow: '10px 10px 0 var(--ink)', transition: 'transform .15s ease', textAlign: 'center', position: 'relative', zIndex: 1, userSelect: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.07) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', borderRadius: 18, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 20, padding: '4px 18px', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.1em', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>En préparation</div>
              <div className="bc" style={{ fontSize: 180, lineHeight: 0.88, letterSpacing: '-8px', color: 'var(--ink)', position: 'relative', zIndex: 1, marginTop: 16 }}>{formatNum(totalEnPrepa)}</div>
              <div style={{ fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(0,0,0,0.5)', marginTop: 10, position: 'relative', zIndex: 1 }}>Jeux en préparation</div>
              {/* Recherche */}
              <div style={{ marginTop: 14, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Rechercher un jeu…"
                  value={rechercheJeu}
                  onChange={e => { setRechercheJeu(e.target.value); setIsSearchDropdownOpen(true); }}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.55)', border: '2px solid rgba(0,0,0,0.18)', borderRadius: 20, padding: '6px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                />
                {rechercheJeu && isSearchDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 8, boxShadow: '4px 4px 0 var(--ink)', marginTop: 6, maxHeight: 180, overflowY: 'auto', zIndex: 30, textAlign: 'left' }}>
                    {jeuxEnPrepaFiltres.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>Aucun jeu trouvé</div>
                    ) : jeuxEnPrepaFiltres.map(jeu => (
                      <div key={jeu.id} onClick={() => { setRechercheJeu(jeu.nom); setIsSearchDropdownOpen(false); setIsListeOpen(true); }} style={{ padding: '10px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', borderBottom: '1.5px solid var(--cream2)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--cream2)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        {jeu.nom}<span style={{ display: 'block', fontSize: 12, fontWeight: 400, color: 'rgba(0,0,0,0.4)' }}>EAN: {jeu.ean}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Impression */}
          <div className="pop-card" style={{ background: 'var(--vert)', padding: 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.09) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="bc" style={{ fontSize: 32, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: 20 }}>Impression</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link href="/etiquettes">
                  <button className="pop-btn pop-btn-dark" style={{ width: '100%', justifyContent: 'center' }}>Étiquettes →</button>
                </Link>
                <Link href="/contenu">
                  <button className="pop-btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--white)' }}>Contenu →</button>
                </Link>
              </div>
            </div>
          </div>

          {/* Réparation */}
          <div className="pop-card" style={{ background: 'var(--orange)', padding: 28, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.09) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="bc" style={{ fontSize: 32, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: 16 }}>Réparation</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { href: '/reparations', label: '🛠️ À réparer',      count: nbReparations },
                  { href: '/pieces',      label: '🧩 Jeux incomplets', count: nbManquants   },
                  { href: '/pieces',      label: '🔍 Pièces trouvées', count: nbOrphelines  },
                ].map(item => (
                  <Link key={item.href + item.label} href={item.href}>
                    <div className="pop-card pop-card-hover" style={{ background: 'rgba(255,255,255,0.55)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{item.label}</span>
                      <span className="pop-sticker" style={{ background: 'var(--white)', fontSize: 13 }}>{item.count}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── ÉTAPES ── */}
        <div className="pop-card" style={{ background: 'var(--ink)', padding: '28px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize: '16px 16px', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase', letterSpacing: '.04em', color: 'rgba(255,255,255,0.55)', marginBottom: 18, borderBottom: '3px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>Préparations à faire</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10 }}>
              {etapesVisuelles.map(etape => (
                <div
                  key={etape.id}
                  onClick={() => { setEtapeActive(etape.id); setRechercheEtape(""); setJeuxSelectionnes([]); }}
                  style={{ background: etape.hex, border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '4px 4px 0 rgba(0,0,0,0.4)', padding: '16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', aspectRatio: '1', cursor: 'pointer', transition: 'transform .12s, box-shadow .12s', position: 'relative', overflow: 'hidden' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translate(-2px,-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = '6px 6px 0 rgba(0,0,0,0.4)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = '4px 4px 0 rgba(0,0,0,0.4)'; }}
                >
                  <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.07) 1px,transparent 1px)', backgroundSize: '10px 10px', pointerEvents: 'none' }} />
                  <span style={{ fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '.04em', position: 'relative', zIndex: 1 }}>{etape.nom}</span>
                  <span className="bc" style={{ fontSize: 52, lineHeight: 1, letterSpacing: '-2px', position: 'relative', zIndex: 1 }}>{formatNum(comptesEtapes[etape.id] || 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ MODAL ÉTAPE ══ */}
      {etapeActive && etapeActiveInfo && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 860 }}>
            <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: etapeActiveInfo.hex }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="bc" style={{ fontSize: 24, textTransform: 'uppercase' }}>{etapeActiveInfo.nom}</span>
                <span className="pop-sticker" style={{ background: 'var(--ink)', color: 'var(--white)', fontSize: 13 }}>{jeuxPourEtapeActive.length} jeu(x)</span>
              </div>
              <button style={S.closeBtn} onClick={() => { setEtapeActive(null); setRechercheEtape(""); }}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', borderBottom: '2px solid var(--cream2)' }}>
              <input type="text" placeholder="Rechercher par nom ou EAN…" value={rechercheEtape} onChange={e => setRechercheEtape(e.target.value)} className="pop-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jeuxPourEtapeActive.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.4)', padding: '40px 0', fontSize: 15 }}>Tous les jeux ont validé cette étape !</p>
              ) : jeuxPourEtapeActive
                .filter(j => !rechercheEtape || j.nom.toLowerCase().includes(rechercheEtape.toLowerCase()) || j.ean.includes(rechercheEtape))
                .map(jeu => (
                  <label key={jeu.id} className="pop-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: jeuxSelectionnes.includes(jeu.id) ? 'var(--cream2)' : 'var(--white)', boxShadow: jeuxSelectionnes.includes(jeu.id) ? '4px 4px 0 var(--ink)' : '2px 2px 0 var(--ink)' }}>
                    <input type="checkbox" className="custom-cb" checked={jeuxSelectionnes.includes(jeu.id)} onChange={() => toggleSelection(jeu.id)} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, display: 'block' }}>{jeu.nom}</span>
                      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>EAN: {jeu.ean}</span>
                    </div>
                  </label>
                ))
              }
            </div>
            <div style={{ padding: '16px 24px', borderTop: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <button style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.5)', textDecoration: 'underline' }} onClick={() => setJeuxSelectionnes(jeuxPourEtapeActive.length === jeuxSelectionnes.length ? [] : jeuxPourEtapeActive.map(j => j.id))}>
                {jeuxPourEtapeActive.length === jeuxSelectionnes.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <button className="pop-btn pop-btn-dark" onClick={validerSelectionEtape} disabled={jeuxSelectionnes.length === 0} style={{ opacity: jeuxSelectionnes.length === 0 ? 0.4 : 1 }}>
                ✓ Valider {jeuxSelectionnes.length > 0 ? `(${jeuxSelectionnes.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL SCAN CODES SYRACUSE ══ */}
      {isScanOpen && (
        <div style={{ ...S.modal, zIndex: 70 }}>
          <div style={{ ...S.modalBox, maxWidth: 480 }}>
            <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--rose)' }}>
              <div>
                <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase' }}>Codes Syracuse</div>
                <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.5)', marginTop: 2 }}>
                  {scanIdx < scanQueue.length ? `${scanIdx + 1} / ${scanQueue.length}` : `${scanDone.length} code(s) enregistré(s)`}
                </div>
              </div>
              <button style={S.closeBtn} onClick={() => setIsScanOpen(false)}>✕</button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {scanIdx < scanQueue.length ? (<>
                <div className="pop-card" style={{ background: 'var(--cream2)', padding: '16px 20px', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.1em', color: 'rgba(0,0,0,0.4)', marginBottom: 4 }}>Jeu à équiper</div>
                  <div style={{ fontWeight: 700, fontSize: 20 }}>{scanQueue[scanIdx].nom}</div>
                  <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.35)', fontFamily: 'monospace', marginTop: 2 }}>EAN: {scanQueue[scanIdx].ean}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>Code Syracuse</div>
                  <input ref={scanInputRef} autoFocus type="text" inputMode="numeric" placeholder="Scanner ou saisir le code…" value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => e.key === "Enter" && scannerCode()} className="pop-input" style={{ width: '100%', fontSize: 20, fontFamily: 'monospace' }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="pop-btn pop-btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={passerScan}>Passer →</button>
                  <button className="pop-btn pop-btn-dark" style={{ flex: 1, justifyContent: 'center' }} onClick={scannerCode} disabled={!scanInput.trim()}>Valider ✓</button>
                </div>
                {scanDone.length > 0 && (
                  <div style={{ borderTop: '2px solid var(--cream2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {scanDone.map((d, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                        <span style={{ color: 'rgba(0,0,0,0.6)' }}>{d.nom}</span>
                        <span style={{ fontFamily: 'monospace', color: 'rgba(0,0,0,0.35)' }}>{d.code}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0', textAlign: 'center' }}>
                  <span style={{ fontSize: 48 }}>🎉</span>
                  <div className="bc" style={{ fontSize: 24 }}>{scanDone.length} code(s) enregistré(s)</div>
                  {scanQueue.length - scanDone.length > 0 && <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>{scanQueue.length - scanDone.length} jeu(x) passé(s) sans code</div>}
                  <button className="pop-btn pop-btn-dark" style={{ marginTop: 8 }} onClick={() => setIsScanOpen(false)}>Fermer</button>
                </div>
              )}
            </div>
            <div style={{ height: 4, background: 'var(--cream2)', borderTop: '2px solid var(--ink)' }}>
              <div style={{ height: '100%', background: 'var(--rose)', transition: 'width .2s', width: `${(Math.min(scanIdx, scanQueue.length) / scanQueue.length) * 100}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL LISTE JEUX EN PRÉPA ══ */}
      {isListeOpen && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 1000 }}>
            <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--yellow)' }}>
              <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase' }}>Jeux en préparation</div>
              <button style={S.closeBtn} onClick={() => { setIsListeOpen(false); setRechercheJeu(""); }}>✕</button>
            </div>
            <div style={{ padding: '12px 24px', borderBottom: '2px solid var(--cream2)' }}>
              <input type="text" placeholder="Rechercher dans la liste…" value={rechercheJeu} onChange={e => setRechercheJeu(e.target.value)} className="pop-input" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jeuxEnPrepaFiltres.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.4)', padding: '40px 0', fontSize: 15 }}>Aucun jeu trouvé.</p>
              ) : jeuxEnPrepaFiltres.map(jeu => (
                <div key={jeu.id} className="pop-card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, background: 'var(--white)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 18 }}>{jeu.nom}</span>
                      <div style={{ display: 'flex', gap: 4, background: 'var(--cream2)', padding: '3px 6px', borderRadius: 20, border: '1.5px solid var(--ink)' }}>
                        {COULEURS.map(c => (
                          <button key={c.id} type="button" onClick={() => changerCouleurJeu(jeu.id, jeu.ean, jeu.nom, jeu.couleur === c.id ? "" : c.id)}
                            style={{ width: 14, height: 14, borderRadius: '50%', background: c.hex, border: jeu.couleur === c.id ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transition: 'transform .1s', transform: jeu.couleur === c.id ? 'scale(1.2)' : 'scale(1)' }} title={c.id} />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>
                      <BarcodeIcon />EAN: {jeu.ean}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {etapesVisuelles.map(etape => {
                      const estFait = jeu[etape.id] === true;
                      const isNouv = etape.id === 'etape_nouveaute';
                      const isDouble = isNouv && jeu.is_double;
                      return (
                        <button key={etape.id} disabled={isDouble}
                          onClick={() => !isDouble && toggleEtapeUnique(jeu.id, etape.id, estFait)}
                          style={{ background: estFait ? etape.hex : 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, cursor: isDouble ? 'not-allowed' : 'pointer', opacity: isDouble ? 0.4 : 1, boxShadow: estFait ? '2px 2px 0 var(--ink)' : 'none', transition: 'all .1s' }}>
                          {isDouble ? '🔄 Double' : estFait ? `✓ ${etape.nom}` : etape.nom}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL AJOUT JEUX ══ */}
      {isModalOpen && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 720 }}>
            <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bleu)' }}>
              <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase' }}>Ajouter des jeux</div>
              <button style={S.closeBtn} onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', borderBottom: '2px solid var(--cream2)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>Scanner un EAN</div>
                <input type="text" value={eanInput} onChange={e => setEanInput(e.target.value)} onKeyDown={ajouterEan} className="pop-input" style={{ width: '100%' }} placeholder="Ex: 3770001874241" autoFocus />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>Taper un nom (EAN inconnu)</div>
                <input type="text" value={manuelInput} onChange={e => setManuelInput(e.target.value)} onKeyDown={ajouterManuel} className="pop-input" style={{ width: '100%' }} placeholder="Nom du jeu..." />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, minHeight: 200, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jeuxAttente.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.4)', padding: '40px 0', fontSize: 15 }}>La liste d&apos;attente est vide.</p>
              ) : jeuxAttente.map((jeu, index) => (
                <div key={index} className="pop-card" style={{ background: 'var(--white)', padding: '14px 16px', position: 'relative' }}
                  onMouseEnter={e => { const a = e.currentTarget.querySelector<HTMLElement>('.jeu-actions'); if (a) a.style.opacity = '1'; }}
                  onMouseLeave={e => { const a = e.currentTarget.querySelector<HTMLElement>('.jeu-actions'); if (a) a.style.opacity = '0'; }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    {jeu.nom === "⏳ Recherche en cours..." ? (
                      <span style={{ fontWeight: 700, color: 'rgba(0,0,0,0.4)' }}>{jeu.nom}</span>
                    ) : editingIndex === index || jeu.nom === "" ? (
                      <input type="text" value={jeu.nom} onChange={e => setJeuxAttente(prev => { const l = [...prev]; l[index].nom = e.target.value; return l; })} onBlur={() => setEditingIndex(null)} onKeyDown={e => e.key === "Enter" && setEditingIndex(null)} autoFocus style={{ fontWeight: 700, fontSize: 18, background: 'transparent', borderBottom: '2px solid var(--ink)', outline: 'none', width: 200 }} />
                    ) : (
                      <span style={{ fontWeight: 700, fontSize: 18 }}>{jeu.nom}</span>
                    )}
                    <div style={{ display: 'flex', gap: 4, background: 'var(--cream2)', padding: '3px 6px', borderRadius: 20, border: '1.5px solid var(--ink)' }}>
                      {COULEURS.map(c => (
                        <button key={c.id} type="button" onClick={() => setJeuxAttente(prev => prev.map((j, i) => i === index ? { ...j, couleur: j.couleur === c.id ? "" : c.id } : j))}
                          style={{ width: 14, height: 14, borderRadius: '50%', background: c.hex, border: jeu.couleur === c.id ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transform: jeu.couleur === c.id ? 'scale(1.2)' : 'scale(1)' }} title={c.id} />
                      ))}
                    </div>
                    <div className="jeu-actions" style={{ opacity: 0, transition: 'opacity .15s', display: 'flex', gap: 4, marginLeft: 'auto' }}>
                      <button onClick={() => setEditingEanIndex(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Modifier EAN">🏷️</button>
                      <button onClick={() => setEditingIndex(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Modifier Nom">✏️</button>
                      <button onClick={() => setJeuxAttente(prev => prev.filter((_, i) => i !== index))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Supprimer">🗑️</button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>
                    <BarcodeIcon />
                    {editingEanIndex === index ? (
                      <input type="text" value={jeu.ean === "Manuel" ? "" : jeu.ean} onChange={e => setJeuxAttente(prev => { const l = [...prev]; l[index].ean = e.target.value || "Manuel"; return l; })} onBlur={() => setEditingEanIndex(null)} onKeyDown={e => e.key === "Enter" && setEditingEanIndex(null)} autoFocus style={{ background: 'transparent', borderBottom: '2px solid var(--ink)', outline: 'none', width: 160, fontSize: 13 }} />
                    ) : <span>EAN: {jeu.ean}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                    {(['nouveaute', 'double', 'existant'] as const).map(type => {
                      const labels = { nouveaute: '🌟 Nouveauté', double: '🔄 Double', existant: '✅ Existant' };
                      const colors = { nouveaute: 'var(--yellow)', double: 'var(--bleu)', existant: 'var(--vert)' };
                      const active = jeu.typeAjout === type;
                      return (
                        <button key={type} onClick={() => changerTypeAjout(index, type)}
                          style={{ background: active ? colors[type] : 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: active ? '2px 2px 0 var(--ink)' : 'none' }}>
                          {labels[type]}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', borderTop: '2px solid var(--cream2)', paddingTop: 10 }}>
                    {etapesVisuelles.map(etape => {
                      const isExistant = jeu.typeAjout === 'existant';
                      const isNouv = etape.id === 'etape_nouveaute';
                      let disabled = isExistant || isNouv;
                      let checked = jeu.etapes[etape.id];
                      let label = etape.nom;
                      if (isExistant) { checked = !isNouv; label = isNouv ? "🚫 Pas une nouveauté" : etape.nom; }
                      else if (jeu.typeAjout === 'double' && isNouv) { checked = false; label = "🔄 Double"; }
                      else if (isNouv) { checked = false; label = "🌟 Nouveauté (Atelier)"; }
                      return (
                        <label key={etape.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
                          <input type="checkbox" className="custom-cb" disabled={disabled} checked={checked} onChange={() => toggleEtapeAttente(index, etape.id)} />
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '3px solid var(--ink)' }}>
              <button className="pop-btn pop-btn-yellow" style={{ width: '100%', justifyContent: 'center', fontSize: 18 }}
                onClick={validerEtEnvoyer}
                disabled={jeuxAttente.length === 0 || jeuxAttente.some(j => j.nom === "" || j.nom.includes("⏳"))}>
                Valider et envoyer à l&apos;Atelier →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}