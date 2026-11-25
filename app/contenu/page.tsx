"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useIsMobile } from "../../lib/useIsMobile";
import BoutonScan from "../../components/ScanCodeBarre";
import { ETAPES_A_ZERO, ETAPES_ATELIER, COLONNES_ETAPES, etapeCourante } from "../../lib/etapesAtelier";
import EnteteImpression, { CaseImpressionDouble } from "../../components/EnteteImpression";
import {
  chargerCodesSyracuse, correspondance, eanDuCode, etiquettesPour, lireImpressionDouble, ecrireImpressionDouble,
  validerEtapeImpression, type JeuChoisi, type LigneCatalogue,
} from "../../lib/impression";

// react-pdf uniquement côté navigateur : jamais dans le bundle serveur du worker
const BoutonImpression = dynamic(() => import("../../components/BoutonImpression"), { ssr: false });

const CATEGORIES = [
  { id: "vert",  nom: "Vert",  hex: "#a8e063" },
  { id: "rose",  nom: "Rose",  hex: "#f472b6" },
  { id: "bleu",  nom: "Bleu",  hex: "#60a5fa" },
  { id: "rouge", nom: "Rouge", hex: "#f87171" },
  { id: "jaune", nom: "Jaune", hex: "#fb923c" },
];

/** Étape 3 de l'atelier : vérification des pièces et création du contenu sur LudoTool. */
const ETAPE_CONTENU = ETAPES_ATELIER.find(e => e.id === "etape_verification")!;

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
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const [isClient, setIsClient] = useState(false);

  const [contenus, setContenus] = useState<Record<string, ContenuType[]>>({
    vert: [], rose: [], bleu: [], rouge: [], jaune: []
  });

  const [sectionsOuvertes, setSectionsOuvertes] = useState<Record<string, boolean>>({
    vert: false, rose: false, bleu: false, rouge: false, jaune: false
  });

  const [recherche, setRecherche] = useState(searchParams.get("nom") ?? "");
  // Catalogue tel que chargé (pour imprimer aussi les étiquettes) et codes Syracuse par EAN (recherche).
  const [catalogue, setCatalogue] = useState<Map<string, LigneCatalogue>>(new Map());
  const [codesSyracuse, setCodesSyracuse] = useState<Record<string, string[]>>({});
  const [impressionDouble, setImpressionDouble] = useState(false);
  // Filtre des lignes des tableaux (distinct de la recherche du générateur, à droite).
  const [filtre, setFiltre] = useState("");
  // Jeux de l'atelier arrivés à l'étape « Vérification et contenu » : leur fiche est à faire ici.
  const [jeuxEtapeContenu, setJeuxEtapeContenu] = useState<{ ean: string; nom: string }[]>([]);

  useEffect(() => {
    setIsClient(true);
    chargerCatalogue();
    chargerCodesSyracuse().then(setCodesSyracuse);
    setImpressionDouble(lireImpressionDouble());
    const champs = ['ean', 'nom', 'is_double', ...COLONNES_ETAPES].join(',');
    fetch(`/api/jeux?statut=${encodeURIComponent('En préparation')}&fields=${champs}`, { cache: 'no-store' })
      .then(r => r.json() as Promise<Record<string, unknown>[]>).catch(() => null)
      .then(data => {
        if (!Array.isArray(data)) return;
        const vus = new Set<string>();
        setJeuxEtapeContenu(data
          .filter(j => j.ean && etapeCourante(j)?.id === ETAPE_CONTENU.id)
          .filter(j => !vus.has(String(j.ean)) && !!vus.add(String(j.ean)))
          .map(j => ({ ean: String(j.ean), nom: String(j.nom || j.ean) })));
      });
  }, []);

  const chargerCatalogue = async () => {
    const data = await fetch('/api/catalogue', { cache: 'no-store' }).then(r => r.json() as Promise<any>).catch(() => null);
    if (Array.isArray(data)) {
      setCatalogue(new Map((data as LigneCatalogue[]).filter(c => c.ean).map(c => [c.ean, c])));
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
    await fetch(`/api/catalogue/${encodeURIComponent(jeu.ean)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nom: jeu.nom, contenu: jeu.elements, couleur: couleurId })
    }).catch(async () => {
      await fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ ean: jeu.ean, nom: jeu.nom, contenu: jeu.elements, couleur: couleurId }]) });
    });

    const jeuxExistants = await fetch(`/api/jeux?ean=${encodeURIComponent(jeu.ean)}&fields=id&limit=1`).then(r => r.json() as Promise<any>).catch(() => []);
    if (!Array.isArray(jeuxExistants) || jeuxExistants.length === 0) {
      await fetch('/api/jeux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ean: jeu.ean, nom: jeu.nom, statut: 'En préparation', is_double: 0,
        ...ETAPES_A_ZERO
      }) }).catch(console.error);
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
          if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 56, behavior: 'smooth' });
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


  // Scan (caméra ou douchette + Entrée) : le jeu reconnu est ajouté à la liste.
  const [ajoutScan, setAjoutScan] = useState<{ texte: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!ajoutScan) return;
    const t = setTimeout(() => setAjoutScan(null), 3500);
    return () => clearTimeout(t);
  }, [ajoutScan]);
  const ajouterParScan = (code: string) => {
    const ean = eanDuCode(code, Object.values(contenus).flat().map(x => x.ean).filter(Boolean), codesSyracuse);
    const trouve = ean ? Object.entries(contenus).flatMap(([couleur, l]) => l.filter(x => x.ean === ean).map(x => ({ couleur, x }))) : [];
    if (!trouve.length) {
      // Un nom tapé puis Entrée reste une simple recherche ; un code inconnu est signalé.
      setRecherche(code);
      if (/^\d+$/.test(code.trim())) setAjoutScan({ texte: `Aucun jeu pour le code ${code.trim()} : recherche affichée.`, ok: false });
      return;
    }
    const { couleur, x } = trouve[0];
    modifierQuantite(couleur, x.id, 1);
    setRecherche("");
    setAjoutScan({ texte: `✓ ${x.nom || ean} ajouté (×${x.quantity + 1})`, ok: true });
  };

  /** Ouvre la fiche d'un jeu (section et ligne) et la fait défiler à l'écran. */
  const allerALaFiche = (couleurId: string, id: string | number) => {
    setFiltre("");
    setSectionsOuvertes(prev => ({ ...prev, [couleurId]: true }));
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].map(c => c.id === id ? { ...c, isOpen: true } : c) }));
    setTimeout(() => {
      document.querySelector(`[data-fiche="${CSS.escape(String(id))}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 150);
  };

  /** Jeu de l'atelier sans fiche au catalogue : on la crée dans la couleur choisie, déjà ouverte. */
  const creerFiche = (couleurId: string, jeu: { ean: string; nom: string }) => {
    const id = `nouveau-${jeu.ean}`;
    setContenus(prev => ({ ...prev, [couleurId]: [{ id, ean: jeu.ean, nom: jeu.nom, elements: "", quantity: 0, isOpen: true }, ...prev[couleurId]] }));
    allerALaFiche(couleurId, id);
  };

  const supprimerLigne = (couleurId: string, id: string | number) => {
    setContenus(prev => ({ ...prev, [couleurId]: prev[couleurId].filter(c => c.id !== id) }));
  };

  /** Jeux choisis pour l'impression (quantité au-dessus de 0). */
  const choisis = (): JeuChoisi[] => Object.entries(contenus).flatMap(([couleur, liste]) =>
    liste.filter(c => c.quantity > 0 && c.ean).map(c => ({ ean: c.ean, nom: c.nom, quantity: c.quantity, couleur })));

  /** Étiquettes des mêmes jeux, si l'impression double est cochée. */
  const etiquettesAussi = () => etiquettesPour(choisis(), catalogue);

  /** Impression du contenu : étape 4 des jeux en préparation (et étape 5 si les étiquettes suivent). */
  const genererPDF = async () => {
    const eansCompletsAImprimer: string[] = [];
    Object.values(contenus).forEach(liste => {
      liste.forEach(c => {
        if (!((!c.elements || c.elements.trim() === "")) && c.nom && c.ean && c.quantity > 0) eansCompletsAImprimer.push(c.ean);
      });
    });
    await validerEtapeImpression("contenu", eansCompletsAImprimer);
    if (impressionDouble) {
      const { parCouleur } = etiquettesAussi();
      await validerEtapeImpression("etiquettes", Object.values(parCouleur).flat().map(e => e.ean));
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

  /** Lignes d'une couleur qui passent le filtre (une fiche toute neuve, sans nom ni EAN, reste visible). */
  const lignesFiltrees = (couleurId: string) => contenus[couleurId].filter(c =>
    (!c.nom && !c.ean) || correspondance(filtre, c.nom, c.ean, codesSyracuse[c.ean]).ok);

  const totalContenus = Object.values(contenus).flat().reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div style={{ minHeight: '100dvh' }}>
      <EnteteImpression actuelle="contenu" recherche={recherche} isMobile={isMobile} />

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, padding: 'var(--page-pad-y) var(--page-pad-x)', alignItems: isMobile ? 'stretch' : 'flex-start' }}>

        {/* ── MAIN ── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <input type="text" value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="🔍 Filtrer les fiches : nom, EAN ou code Syracuse…"
              className="pop-input" style={{ width: '100%', fontSize: 15, paddingRight: filtre ? 40 : undefined }} />
            {filtre && <button onClick={() => setFiltre("")} title="Effacer le filtre" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 16, fontWeight: 900, cursor: 'pointer' }}>✕</button>}
          </div>

          {/* Jeux à l'étape 3 de l'atelier dont le contenu reste à écrire */}
          {(() => {
            const parEan = new Map(Object.entries(contenus).flatMap(([couleur, l]) => l.filter(c => c.ean).map(c => [c.ean, { couleur, c }] as const)));
            const aFaire = jeuxEtapeContenu
              .map(j => ({ j, fiche: parEan.get(j.ean) }))
              .filter(({ fiche }) => !fiche || !fiche.c.elements || fiche.c.elements.trim() === "");
            if (!aFaire.length) return null;
            return (
              <div style={{ background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '4px 4px 0 var(--ink)', overflow: 'hidden' }}>
                <div style={{ background: ETAPE_CONTENU.hex, borderBottom: '2.5px solid var(--ink)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span className="bc" style={{ fontSize: 18, textTransform: 'uppercase' }}>Contenu à créer</span>
                  <span className="pop-sticker" style={{ background: 'var(--white)', fontSize: 12, boxShadow: 'none' }}>{aFaire.length} jeu{aFaire.length > 1 ? 'x' : ''}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Atelier · étape {ETAPE_CONTENU.num} « {ETAPE_CONTENU.nom} »</span>
                </div>
                <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {aFaire.map(({ j, fiche }) => {
                    const cat = fiche ? CATEGORIES.find(k => k.id === fiche.couleur) : null;
                    return fiche ? (
                      <button key={j.ean} onClick={() => allerALaFiche(fiche.couleur, fiche.c.id)} title="Ouvrir la fiche pour écrire le contenu"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff7ed', border: '2px solid var(--ink)', borderRadius: 8, padding: '6px 10px', boxShadow: '2px 2px 0 var(--ink)', cursor: 'pointer', fontWeight: 700, fontSize: 14, fontFamily: 'inherit' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cat?.hex, border: '1.5px solid var(--ink)', flexShrink: 0 }} />
                        {fiche.c.nom || j.nom} <span style={{ opacity: 0.45 }}>✎</span>
                      </button>
                    ) : (
                      <span key={j.ean} title="Pas encore de fiche : choisir sa couleur pour la créer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--white)', border: '2px dashed var(--ink)', borderRadius: 8, padding: '5px 8px 5px 10px', fontWeight: 700, fontSize: 14 }}>
                        {j.nom}
                        <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.5 }}>créer en</span>
                        {CATEGORIES.map(k => (
                          <button key={k.id} onClick={() => creerFiche(k.id, j)} title={`Créer la fiche en ${k.nom}`} aria-label={`Créer la fiche en ${k.nom}`}
                            style={{ width: 16, height: 16, borderRadius: '50%', background: k.hex, border: '1.5px solid var(--ink)', cursor: 'pointer', padding: 0 }} />
                        ))}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {filtre.trim() && CATEGORIES.every(cat => lignesFiltrees(cat.id).length === 0) && (
            <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.45)', padding: '16px 0', fontSize: 15, fontWeight: 700 }}>Aucune fiche ne correspond à « {filtre.trim()} ».</p>
          )}

          {CATEGORIES.map(cat => {
            const lignes = lignesFiltrees(cat.id);
            const filtreActif = !!filtre.trim();
            if (filtreActif && lignes.length === 0) return null;
            const nbIncomplets = lignes.filter(c => !c.elements || c.elements.trim() === "").length;
            const isOpen = sectionsOuvertes[cat.id] || filtreActif;
            return (
              <div key={cat.id} id={`category-${cat.id}`} style={{ borderRadius: 10, position: 'relative', zIndex: 20 }}>

                {/* Accordion header */}
                <div onClick={() => toggleSection(cat.id)} style={{ position: 'sticky', top: 56, zIndex: 40, background: cat.hex, border: '2.5px solid var(--ink)', borderRadius: isOpen ? '10px 10px 0 0' : 10, boxShadow: isOpen ? 'none' : '4px 4px 0 var(--ink)', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="bc" style={{ fontSize: 22, textTransform: 'uppercase' }}>{cat.nom}</span>
                    <span className="pop-sticker" style={{ background: 'rgba(0,0,0,0.15)', border: '2px solid rgba(0,0,0,0.2)', boxShadow: 'none', fontSize: 12 }}>{filtreActif ? `${lignes.length} / ${contenus[cat.id].length}` : contenus[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && <span className="pop-sticker" style={{ background: 'var(--rouge)', color: 'var(--white)', boxShadow: 'none', fontSize: 12 }}>{nbIncomplets} incomplet(s)</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isOpen && <button onClick={e => { e.stopPropagation(); ajouterLigne(cat.id); }} style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(0,0,0,0.15)', border: '2px solid rgba(0,0,0,0.2)', fontWeight: 900, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>}
                    <span style={{ fontWeight: 700, fontSize: 22, width: 20, textAlign: 'center' }}>{isOpen ? '−' : '+'}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ background: 'var(--cream2)', padding: isMobile ? 10 : 16, display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: '2.5px solid var(--ink)', borderRight: '2.5px solid var(--ink)', borderBottom: '2.5px solid var(--ink)', borderRadius: '0 0 10px 10px' }}>

                    {/* Alpha scroll — retiré sur téléphone : 22px de large
                        pour 26 lettres, ce n'est pas visable au doigt et ça
                        prend une colonne sur une largeur déjà comptée. */}
                    {!isMobile && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 112, height: 'calc(100dvh - 160px)', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 20, padding: '6px 3px', boxShadow: '2px 2px 0 var(--ink)', width: 22, flexShrink: 0 }}>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                        <button key={l} onClick={() => scrollToLetter(l, cat.id)} style={{ fontSize: 8, fontWeight: 900, color: 'rgba(0,0,0,0.35)', background: 'none', border: 'none', cursor: 'pointer', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--ink)')} onMouseLeave={e => (e.currentTarget.style.color = 'rgba(0,0,0,0.35)')}>
                          {l}
                        </button>
                      ))}
                    </div>
                    )}

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                      <button onClick={() => ajouterLigne(cat.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.45)', background: 'transparent', border: '2px dashed rgba(0,0,0,0.2)', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', width: 'max-content', margin: '0 auto 4px' }}>
                        ➕ Ajouter une fiche {cat.nom}
                      </button>

                      {lignes.length === 0 ? (
                        <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.35)', padding: '20px 0', fontSize: 15 }}>Aucune fiche.</p>
                      ) : lignes.map(c => {
                        const estVide = !c.elements || c.elements.trim() === "";
                        const startLetter = c.nom ? c.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
                        return (
                          <div key={c.id} data-letter={startLetter} data-category={cat.id} data-fiche={String(c.id)}
                            style={{ background: estVide && !c.isOpen ? '#fff7ed' : 'var(--white)', border: `2.5px solid ${c.quantity > 0 ? 'var(--ink)' : 'rgba(0,0,0,0.12)'}`, borderRadius: 8, overflow: 'hidden', boxShadow: c.quantity > 0 ? '3px 3px 0 var(--ink)' : 'none', scrollMarginTop: 116 }}>
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
        <aside style={{ width: isMobile ? '100%' : 300, border: '2.5px solid var(--ink)', borderRadius: 10, boxShadow: '4px 4px 0 var(--ink)', display: 'flex', flexDirection: 'column', height: isMobile ? 420 : 'calc(100dvh - 80px)', position: isMobile ? 'static' : 'sticky', top: 68, flexShrink: 0, overflow: 'hidden', background: 'var(--white)' }}>
          <div style={{ padding: '16px 18px', borderBottom: '2.5px solid var(--ink)', background: 'var(--cream2)' }}>
            <div className="bc" style={{ fontSize: 20, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 10 }}>Générateur de fiches</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="text" placeholder="🔍 Nom, EAN ou code Syracuse..." value={recherche} onChange={e => setRecherche(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && recherche.trim()) { e.preventDefault(); ajouterParScan(recherche); } }}
                title="Entrée (ou douchette) : ajoute le jeu dont c'est l'EAN ou le code Syracuse" className="pop-input" style={{ flex: 1, minWidth: 0, fontSize: 14 }} />
              <BoutonScan onScan={ajouterParScan} />
            </div>
            {ajoutScan && (
              <div role="status" style={{ marginTop: 8, fontSize: 13, fontWeight: 800, borderRadius: 8, padding: '6px 10px', border: '2px solid var(--ink)', background: ajoutScan.ok ? 'var(--vert)' : 'var(--white)' }}>{ajoutScan.texte}</div>
            )}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {CATEGORIES.map(cat => {
              const items = contenus[cat.id]
                .map(c => ({ c, m: correspondance(recherche, c.nom, c.ean, codesSyracuse[c.ean]) }))
                .filter(x => x.m.ok);
              if (items.length === 0) return null;
              return (
                <div key={`side-${cat.id}`} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: cat.hex, border: '1.5px solid var(--ink)', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)' }}>{cat.nom}</span>
                  </div>
                  {items.map(({ c, m }) => (
                    <div key={`side-${c.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 10px', boxShadow: '2px 2px 0 var(--ink)' }}>
                      <span style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nom || "Sans nom"}</span>
                        {m.code && <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)', fontFamily: 'monospace' }}>Syracuse {m.code}</span>}
                      </span>
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
            <CaseImpressionDouble actuelle="contenu" coche={impressionDouble}
              onChange={v => { setImpressionDouble(v); ecrireImpressionDouble(v); }}
              resume={(() => {
                if (!totalContenus) return null;
                const { parCouleur, ignores } = etiquettesAussi();
                const n = Object.values(parCouleur).flat().reduce((s, e) => s + e.quantity, 0);
                return `${n} étiquette${n > 1 ? 's' : ''}${ignores.length ? ` · ${ignores.length} incomplète${ignores.length > 1 ? 's' : ''}, non imprimée${ignores.length > 1 ? 's' : ''} (${ignores.slice(0, 3).join(', ')}${ignores.length > 3 ? '…' : ''})` : ''}`;
              })()} />
            {isClient ? (
              <BoutonImpression desactive={totalContenus === 0} avant={genererPDF}
                libelle={impressionDouble ? 'GÉNÉRER FICHES + ÉTIQUETTES →' : 'GÉNÉRER LES FICHES →'}
                documents={() => [
                  { type: 'contenu', fileName: 'contenu_ludo.pdf', contenus },
                  ...(impressionDouble ? [{ type: 'etiquettes' as const, fileName: 'etiquettes_ludo.pdf', etiquettesParCouleur: etiquettesAussi().parCouleur }] : []),
                ]} />
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
