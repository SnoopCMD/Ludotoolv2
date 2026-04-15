"use client";
import { useState, useEffect, useMemo, useRef } from "react";
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
  etape_plastifier?: boolean;
  etape_contenu?: boolean;
  etape_etiquette?: boolean;
  etape_equiper?: boolean;
  etape_encoder?: boolean;
  etape_notice?: boolean;
  couleur?: string;
  mecanique?: string;
  nb_de_joueurs?: string;
  etoiles?: string;
  temps_de_jeu?: string;
  coop_versus?: string;
  image_url?: string;
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
  copies: JeuType[];
  activeCopyIndex: number;
  contenu_boite?: string;
  historique_manquants?: any[];
  historique_reparations?: any[];
  image_url?: string;
  pdf_url?: string;
  description?: string;
  auteurs?: string;
  editeur?: string;
};

type ImportItem = {
  titre: string;
  auteurs: string;
  editeur: string;
  description: string;
  contenu: string;
  ean: string;
  image_url: string;
  codes: string[];
  couleur: string | null;
  mecanique: string | null;
  nb_de_joueurs: string | null;
  temps_de_jeu: string | null;
  etoiles: string | null;
  coop_versus: string | null;
  matchType: 'new' | 'auto_fill' | 'conflict' | 'suggested_link' | 'color_only';
  existingEan?: string;
  existingNom?: string;
  diffs?: { field: string, label: string, old: any, new: any }[];
  userChoice: 'create' | 'link' | 'overwrite' | 'keep_old' | 'update_color';
  isUpdateOnly?: boolean;
};

type DoublonGroupe = { ean: string; nom: string; exemplaires: JeuType[]; suggeresIds: (string | number)[]; };

const COULEURS = [
  { id: 'vert', bg: 'bg-[#baff29]', text: 'text-black', border: 'border-[#baff29]', shadow: 'shadow-[#baff29]/50', label: 'Vert' },
  { id: 'rose', bg: 'bg-[#f45be0]', text: 'text-white', border: 'border-[#f45be0]', shadow: 'shadow-[#f45be0]/50', label: 'Rose' },
  { id: 'bleu', bg: 'bg-[#6ba4ff]', text: 'text-white', border: 'border-[#6ba4ff]', shadow: 'shadow-[#6ba4ff]/50', label: 'Bleu' },
  { id: 'rouge', bg: 'bg-[#ff4d79]', text: 'text-white', border: 'border-[#ff4d79]', shadow: 'shadow-[#ff4d79]/50', label: 'Rouge' },
  { id: 'jaune', bg: 'bg-[#ffa600]', text: 'text-black', border: 'border-[#ffa600]', shadow: 'shadow-[#ffa600]/50', label: 'Jaune' }
];

// LISTE OFFICIELLE DES MÉCANIQUES
const MECANIQUES_OFFICIELLES = [
  "(Dé)placement", "Adresse", "Bluff", "Casse-tête", "Collection", 
  "Combinaison", "Communication", "Connaissances", "Conquête", "Course", 
  "Deck building", "Déduction", "Dominos", "Draft", "Exploration", 
  "Gestion", "Gestion de main", "Gestion de ressources", "Imagination", 
  "Lancé de dés", "Livre-aventure", "Loto", "Manipulation", "Mémoire", 
  "Multijeux", "Négociation", "Observation", "Paris", "Placement de cartes", 
  "Placement de dés", "Placement de tuiles", "Placement d'ouvriers", "Plis", 
  "Programmation", "Puzzle", "Rapidité", "Rôles cachés", "Roll & write", 
  "Stop ou encore"
].sort();

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

const getProgression = (jeu: Partial<JeuType>) => {
  const steps = [
    jeu.etape_plastifier, jeu.etape_contenu, jeu.etape_etiquette,
    jeu.etape_equiper, jeu.etape_encoder, jeu.etape_notice
  ];
  const done = steps.filter(Boolean).length;
  return Math.round((done / 6) * 100);
};

const normalizeStr = (str: string) => {
  if (!str) return "";
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
};

// --- OUTILS DE PARSING CSV ET UNIMARC BINAIRE / TEXTE ---
function parseCSV(text: string) {
  const result: string[][] = [];
  let currentLine: string[] = [];
  let currentVal = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { currentVal += '"'; i++; } else { inQuotes = false; }
      } else { currentVal += char; }
    } else {
      if (char === '"') { inQuotes = true; } else if (char === ';') { currentLine.push(currentVal); currentVal = ''; } else if (char === '\n' || char === '\r') {
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') { i++; }
        currentLine.push(currentVal); result.push(currentLine); currentLine = []; currentVal = '';
      } else { currentVal += char; }
    }
  }
  if (currentVal !== '' || currentLine.length > 0) { currentLine.push(currentVal); result.push(currentLine); }
  return result;
}

// Parseur Binaire ISO-2709
function parseISO2709Buffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const records = [];
  let start = 0;
  
  while (start < bytes.length) {
    let end = start;
    while (end < bytes.length && bytes[end] !== 29) { end++; }
    if (end === start) { start++; continue; }
    
    const recBytes = bytes.subarray(start, end);
    start = end + 1;
    
    if (recBytes.length < 24) continue;
    
    const leader = new TextDecoder('ascii').decode(recBytes.subarray(0, 24));
    const baseAddress = parseInt(leader.substring(12, 17), 10);
    if (isNaN(baseAddress)) continue;
    
    let dirEnd = 24;
    while (dirEnd < recBytes.length && recBytes[dirEnd] !== 30) { dirEnd++; }
    
    const dirBytes = recBytes.subarray(24, dirEnd);
    const directoryStr = new TextDecoder('ascii').decode(dirBytes);
    
    const fields = [];
    for (let i = 0; i < directoryStr.length; i += 12) {
      if (i + 12 > directoryStr.length) break;
      const tag = directoryStr.substring(i, i + 3);
      const length = parseInt(directoryStr.substring(i + 3, i + 7), 10);
      const fStart = parseInt(directoryStr.substring(i + 7, i + 12), 10);
      
      const absoluteStart = baseAddress + fStart;
      const fieldBytes = recBytes.subarray(absoluteStart, absoluteStart + length - 1); 
      
      const fieldData = new TextDecoder('utf-8').decode(fieldBytes); 
      
      if (parseInt(tag, 10) >= 10 || isNaN(parseInt(tag, 10))) {
         const subfields: Record<string, string[]> = {};
         const sfParts = fieldData.split('\x1F');
         for (let j = 1; j < sfParts.length; j++) {
           const sf = sfParts[j];
           if (sf.length > 0) {
             const code = sf.charAt(0);
             const val = sf.substring(1);
             if (!subfields[code]) subfields[code] = [];
             subfields[code].push(val);
           }
         }
         fields.push({ tag, subfields });
      } else {
         fields.push({ tag, value: fieldData });
      }
    }
    records.push(fields);
  }
  return records;
}

// Parseur de secours pour "UNIMARC Texte"
function parseTextMARC(text: string) {
  const records = [];
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const fields = [];
    for (let line of lines) {
      line = line.trim();
      if (!line) continue;
      const match = line.match(/^(\d{3})\s+(.*)$/);
      if (match) {
        const tag = match[1];
        const content = match[2];
        if (parseInt(tag, 10) >= 10 || isNaN(parseInt(tag, 10))) {
          const subfields: Record<string, string[]> = {};
          const parts = content.split(/[\$|]([a-z0-9])/i);
          for (let j = 1; j < parts.length; j += 2) {
            const code = parts[j].toLowerCase();
            const val = parts[j+1] ? parts[j+1].trim() : '';
            if (!subfields[code]) subfields[code] = [];
            subfields[code].push(val);
          }
          fields.push({ tag, subfields });
        } else {
          fields.push({ tag, value: content });
        }
      }
    }
    if (fields.length > 0) records.push(fields);
  }
  return records;
}

function extractSubfield(record: any[], tag: string, code: string) {
  for (const field of record) {
    if (field.tag === tag && field.subfields && field.subfields[code]) return field.subfields[code][0];
  }
  return null;
}

function extractAllSubfields(record: any[], tag: string, code: string) {
  const results = [];
  for (const field of record) {
    if (field.tag === tag && field.subfields && field.subfields[code]) results.push(...field.subfields[code]);
  }
  return results;
}

const getCouleurFromCote = (cote: string) => {
  if (!cote) return null;
  const c = cote.toUpperCase();
  if (c.includes('VR')) return 'vert';
  if (c.includes('RS')) return 'rose';
  if (c.includes('BL')) return 'bleu';
  if (c.includes('RG')) return 'rouge';
  if (c.includes('JN')) return 'jaune';
  return null;
};

const formatContenuSyracuse = (rawContenu: string) => {
  if (!rawContenu) return "";
  let cleaned = rawContenu.replace(/^["']*/, '').replace(/["']*$/, '').replace(/[;,]?\s*Format\s+[a-zA-Z0-9]+\s*$/i, '').trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/(?:\s+-\s+)|(?:\s*\.\s+)|(?:^-\s*)/).map(p => p.trim()).filter(p => p.length > 0);
  if (parts.length === 1 && !cleaned.includes('-')) {
    const numberParts = cleaned.split(/\s+(?=\d+\s)/).map(p => p.trim()).filter(Boolean);
    if (numberParts.length > 1) return numberParts.map(p => `- ${p}`).join('\n');
  }
  return parts.map(p => `- ${p}`).join('\n');
};

const readFileAsync = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.readAsText(file, 'windows-1252');
  });
};

export default function InventairePage() {
  const [jeux, setJeux] = useState<JeuType[]>([]);
  const [selections, setSelections] = useState<SelectionThematique[]>([]);
  const [catalogueImages, setCatalogueImages] = useState<Record<string, string>>({});
  
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

  const [ficheJeu, setFicheJeu] = useState<FicheJeuData | null>(null);
  const [isLoadingFiche, setIsLoadingFiche] = useState(false);
  const [isEditingFiche, setIsEditingFiche] = useState(false);
  const [editedFiche, setEditedFiche] = useState<FicheJeuData | null>(null);

  const [groupesDeplies, setGroupesDeplies] = useState<Record<string, boolean>>({});

  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload');
  const [importData, setImportData] = useState<ImportItem[]>([]);
  const [isImporting, setIsImporting] = useState(false);

  const [isColorFixOpen, setIsColorFixOpen] = useState(false);
  const [colorFixSelected, setColorFixSelected] = useState<string | null>(null);
  const [colorFixEan, setColorFixEan] = useState("");
  const [colorFixLogs, setColorFixLogs] = useState<{msg: string, isError: boolean}[]>([]);

  // --- OUTIL NETTOYAGE MÉCANIQUES ---
  const [isMecaFixModalOpen, setIsMecaFixModalOpen] = useState(false);
  const [jeuxMecaInvalides, setJeuxMecaInvalides] = useState<JeuType[]>([]);
  const [mecaUpdates, setMecaUpdates] = useState<Record<string, string>>({});
  const [isFixingMeca, setIsFixingMeca] = useState(false);

  // --- OUTIL NETTOYAGE DOUBLONS ---
  const [isDoublonsModalOpen, setIsDoublonsModalOpen] = useState(false);
  const [doublonGroupes, setDoublonGroupes] = useState<DoublonGroupe[]>([]);
  const [doublonsSelectionnes, setDoublonsSelectionnes] = useState<(string | number)[]>([]);
  const [isDeletingDoublons, setIsDeletingDoublons] = useState(false);

  const fetchInventaire = async () => {
    setIsLoading(true);
    const { data: jeuxData, error: jeuxError } = await supabase
      .from('jeux')
      .select('id, nom, ean, code_syracuse, statut, is_double, etape_nouveaute, date_entree, date_sortie, etape_plastifier, etape_contenu, etape_etiquette, etape_equiper, etape_encoder, etape_notice')
      .order('id', { ascending: false });

    const { count: countRep } = await supabase.from('reparations').select('*', { count: 'exact', head: true }).eq('statut', 'À faire');
    const { count: countManq } = await supabase.from('pieces_manquantes').select('*', { count: 'exact', head: true }).eq('statut', 'Manquant');
    setNbReparations(countRep || 0);
    setNbManquants(countManq || 0);

    const { data: selData } = await supabase.from('selections').select('*').order('is_permanent', { ascending: false });

    if (jeuxError) {
      console.error("Erreur chargement:", jeuxError);
      setIsLoading(false);
      return;
    }

    const jeuxBruts = jeuxData as JeuType[];
    const { data: catData } = await supabase.from('catalogue').select('ean, couleur, mecanique, nb_de_joueurs, etoiles, temps_de_jeu, coop_versus, image_url');

    let jeuxFrais = jeuxBruts;

    if (catData) {
      const catMap = new Map();
      catData.forEach(c => catMap.set(c.ean, c));

      // Map EAN → image_url accessible directement dans le rendu
      const imgMap: Record<string, string> = {};
      catData.forEach(c => { if (c.image_url) imgMap[c.ean] = c.image_url; });
      setCatalogueImages(imgMap);

      jeuxFrais = jeuxBruts.map(j => {
        const catInfo = catMap.get(j.ean);
        return {
          ...j,
          couleur: catInfo?.couleur || "",
          mecanique: catInfo?.mecanique || "",
          nb_de_joueurs: catInfo?.nb_de_joueurs || "",
          etoiles: catInfo?.etoiles || "",
          temps_de_jeu: catInfo?.temps_de_jeu || "",
          coop_versus: catInfo?.coop_versus || "",
          image_url: catInfo?.image_url || "",
        };
      });
    } 

    setJeux(jeuxFrais);

    if (selData) {
      const selectionsAjour = (selData as SelectionThematique[]).map(sel => ({
        ...sel,
        jeux: sel.jeux.map(jSel => {
          const fresh = jeuxFrais.find(jFresh => String(jFresh.id) === String(jSel.id));
          return fresh ? { ...jSel, ...fresh } : jSel;
        })
      }));
      setSelections(selectionsAjour);
    }

    setIsLoading(false);
  };

  useEffect(() => {
    fetchInventaire();
  }, []);

  const synchroniserBase = async () => { /* ... */ };
  
  // --- OUTIL DE NETTOYAGE MÉCANIQUES ---
  const nettoyerMecaniques = () => {
    const invalides = jeux.filter(j => !j.mecanique || !MECANIQUES_OFFICIELLES.includes(j.mecanique));
    const uniqueInvalides = Array.from(new Map(invalides.map(item => [item.ean, item])).values());
    setJeuxMecaInvalides(uniqueInvalides);
    setMecaUpdates({});
    setIsMecaFixModalOpen(true);
    setIsSettingsOpen(false);
  };

  const detecterDoublons = () => {
    const map = new Map<string, JeuType[]>();
    jeux.forEach(j => {
      if (!map.has(j.ean)) map.set(j.ean, []);
      map.get(j.ean)!.push(j);
    });

    const groupes: DoublonGroupe[] = [];
    map.forEach((exemplaires, ean) => {
      if (exemplaires.length < 2) return;
      const sansSyracuse = exemplaires.filter(j => !j.code_syracuse);
      if (sansSyracuse.length === 0) return;

      const avecSyracuse = exemplaires.filter(j => !!j.code_syracuse);
      let suggeresIds: (string | number)[];
      if (avecSyracuse.length > 0) {
        suggeresIds = sansSyracuse.map(j => j.id);
      } else {
        suggeresIds = sansSyracuse.slice(1).map(j => j.id);
      }

      groupes.push({ ean, nom: exemplaires[0].nom, exemplaires, suggeresIds });
    });

    groupes.sort((a, b) => a.nom.localeCompare(b.nom));

    const initialSelection: (string | number)[] = [];
    groupes.forEach(g => g.suggeresIds.forEach(id => initialSelection.push(id)));

    setDoublonGroupes(groupes);
    setDoublonsSelectionnes(initialSelection);
    setIsDoublonsModalOpen(true);
    setIsSettingsOpen(false);
  };

  const supprimerDoublonsSelectionnes = async () => {
    if (doublonsSelectionnes.length === 0) return;
    setIsDeletingDoublons(true);
    await supabase.from('jeux').delete().in('id', doublonsSelectionnes);
    setIsDeletingDoublons(false);
    setIsDoublonsModalOpen(false);
    setDoublonGroupes([]);
    setDoublonsSelectionnes([]);
    fetchInventaire();
  };

  const validerCorrectionsMeca = async () => {
    setIsFixingMeca(true);
    const updates = Object.entries(mecaUpdates).filter(([ean, meca]) => meca !== "");
    
    for (const [ean, meca] of updates) {
      await supabase.from('catalogue').update({ mecanique: meca }).eq('ean', ean);
    }
    
    setIsFixingMeca(false);
    setIsMecaFixModalOpen(false);
    setMecaUpdates({});
    fetchInventaire();
  };

  const handleColorFixScan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && colorFixEan.trim() !== "") {
      const scannedEan = colorFixEan.trim();
      setColorFixEan(""); 

      if (!colorFixSelected) {
        setColorFixLogs(prev => [{msg: `❌ EAN scanné (${scannedEan}) mais aucune couleur n'est sélectionnée.`, isError: true}, ...prev]);
        return;
      }

      const { data: jeuData } = await supabase.from('jeux').select('nom').eq('ean', scannedEan).limit(1).maybeSingle();
      const nomJeu = jeuData ? jeuData.nom : "Jeu Inconnu";

      const { error } = await supabase.from('catalogue').upsert({
        ean: scannedEan,
        nom: nomJeu,
        couleur: colorFixSelected
      }, { onConflict: 'ean' });

      if (error) {
        setColorFixLogs(prev => [{msg: `❌ Erreur pour ${scannedEan}: ${error.message}`, isError: true}, ...prev]);
      } else {
        setColorFixLogs(prev => [{msg: `✅ ${nomJeu} (${scannedEan}) assigné à la couleur ${colorFixSelected}.`, isError: false}, ...prev]);
        setJeux(prev => prev.map(j => j.ean === scannedEan ? { ...j, couleur: colorFixSelected } : j));
      }
    }
  };

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

  const mecasDispos = useMemo(() => [...new Set(jeux.map(j => j.mecanique).filter(Boolean))].sort(), [jeux]);

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
      filtrés = filtrés.filter(j => 
        j.nom.toLowerCase().includes(term) || 
        j.ean.includes(term) || 
        (j.code_syracuse && j.code_syracuse.toLowerCase().includes(term))
      );
    }
    
    if (tri === "A-Z") filtrés.sort((a,b) => a.nom.localeCompare(b.nom));
    else if (tri === "Z-A") filtrés.sort((a,b) => b.nom.localeCompare(a.nom));
    return filtrés;
  }, [jeux, recherche, couleurFiltre, tri, filtreMeca, filtreJoueurs, filtreEtoiles, filtreTemps, filtreType]);

  const jeuxGroupes = useMemo(() => {
    const map = new Map<string, JeuType[]>();
    jeuxFiltres.forEach(j => {
      if (!map.has(j.ean)) map.set(j.ean, []);
      map.get(j.ean)!.push(j);
    });
    return Array.from(map.values());
  }, [jeuxFiltres]);

  const toggleGroupe = (ean: string) => {
    setGroupesDeplies(prev => ({ ...prev, [ean]: !prev[ean] }));
  };

  const clearAllFilters = () => {
    setRecherche(""); setCouleurFiltre(null); setFiltreMeca(""); 
    setFiltreJoueurs(""); setFiltreEtoiles(""); setFiltreTemps(""); setFiltreType(""); setTri("A-Z");
  };

  const isListView = recherche !== "" || couleurFiltre !== null || filtreMeca !== "" || filtreJoueurs !== "" || filtreEtoiles !== "" || filtreTemps !== "" || filtreType !== "" || tri !== "A-Z";

  const jeuxEnStock = useMemo(() => jeux.filter(j => j.statut === 'En stock'), [jeux]);
  const atelierEnPrepa = useMemo(() => jeux.filter(j => j.statut === 'En préparation'), [jeux]);
  const totalAtelier = atelierEnPrepa.length + nbReparations + nbManquants;

  const nouveautesEnSalle = useMemo(() => jeuxEnStock.filter(j => j.etape_nouveaute), [jeuxEnStock]);
  const nouveautesSalleJeux = useMemo(() => nouveautesEnSalle.filter(j => j.couleur !== 'vert').slice(0, 12), [nouveautesEnSalle]);
  const nouveautesPremiersJeux = useMemo(() => nouveautesEnSalle.filter(j => j.couleur === 'vert').slice(0, 10), [nouveautesEnSalle]);

  const dateProchaineRotation = useMemo(() => {
    const datesSorties = nouveautesEnSalle.filter(j => j.date_sortie).map(j => new Date(j.date_sortie!).getTime());
    if (datesSorties.length === 0) return null;
    return new Date(Math.min(...datesSorties)).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }, [nouveautesEnSalle]);

  const resultatsRechercheAjout = useMemo(() => {
    if (!rechercheAjout) return [];
    const term = rechercheAjout.toLowerCase();
    return jeux.filter(j => j.nom.toLowerCase().includes(term) || j.code_syracuse?.includes(term)).slice(0, 5);
  }, [rechercheAjout, jeux]);

  const handleSmartImport = async (files: FileList | File[]) => {
    if (files.length === 0) return;

    let catData: string[][] | null = null;
    let coteData: string[][] | null = null;
    let unimarcRecords: any[] | null = null;

    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      if (bytes.includes(29)) {
        unimarcRecords = parseISO2709Buffer(buffer);
      } else {
        const text = new TextDecoder('windows-1252').decode(bytes); 
        if (text.includes('200 ') && (text.includes('$a') || text.includes('|a'))) {
          unimarcRecords = parseTextMARC(text);
        } else {
          const rows = parseCSV(text);
          if (rows.length > 0) {
            const headers = rows[0].map(h => h.trim().toLowerCase());
            if (headers.includes('cote')) coteData = rows;
            else if (headers.includes('titre')) catData = rows;
          }
        }
      }
    }

    if (!catData && !coteData && !unimarcRecords) {
      alert("Fichiers non reconnus. Assurez-vous d'avoir exporté au bon format.");
      return;
    }

    const newImportData: ImportItem[] = [];
    const { data: fullCatData } = await supabase.from('catalogue').select('*');
    const existingCatalogue = fullCatData || [];
    const existingJeuxNorm = existingCatalogue.map(c => ({ ean: c.ean, nom: c.nom, norm: normalizeStr(c.nom) }));

    const compareWithExisting = (
      ean: string, titre: string, auteurs: string, editeur: string, 
      description: string, contenu: string, mecanique: string, 
      nb_de_joueurs: string, temps_de_jeu: string, etoiles: string, 
      coop_versus: string, couleur: string | null, imageUrl: string, codesSyracuse: string[], isTempEan: boolean
    ) => {
      let matchType: ImportItem['matchType'] = 'new';
      let existingEan, existingNom;
      let userChoice: ImportItem['userChoice'] = 'create';
      const diffs: { field: string, label: string, old: any, new: any }[] = [];

      if (!isTempEan) {
        const existingCat = existingCatalogue.find(c => c.ean === ean);
        if (existingCat) {
          if (auteurs && existingCat.auteurs && auteurs !== existingCat.auteurs) diffs.push({ field: 'auteurs', label: 'Auteurs', old: existingCat.auteurs, new: auteurs });
          if (editeur && existingCat.editeur && editeur !== existingCat.editeur) diffs.push({ field: 'editeur', label: 'Éditeur', old: existingCat.editeur, new: editeur });
          if (mecanique && existingCat.mecanique && mecanique !== existingCat.mecanique) diffs.push({ field: 'mecanique', label: 'Mécanique', old: existingCat.mecanique, new: mecanique });
          if (temps_de_jeu && existingCat.temps_de_jeu && temps_de_jeu !== existingCat.temps_de_jeu) diffs.push({ field: 'temps_de_jeu', label: 'Temps', old: existingCat.temps_de_jeu, new: temps_de_jeu });
          if (coop_versus && existingCat.coop_versus && coop_versus !== existingCat.coop_versus) diffs.push({ field: 'coop_versus', label: 'Type', old: existingCat.coop_versus, new: coop_versus });
          
          if (description && existingCat.description && description !== existingCat.description) diffs.push({ field: 'description', label: 'Description', old: 'Texte existant', new: 'Nouveau texte' });
          if (contenu && existingCat.contenu && contenu !== existingCat.contenu) diffs.push({ field: 'contenu', label: 'Contenu', old: 'Contenu existant', new: 'Nouveau contenu' });
          if (imageUrl && existingCat.image_url && imageUrl !== existingCat.image_url) diffs.push({ field: 'image_url', label: 'Image', old: 'Image existante', new: 'Nouvelle image' });

          if (diffs.length > 0) {
            matchType = 'conflict';
            userChoice = 'keep_old'; 
          } else {
            matchType = 'auto_fill';
            userChoice = 'overwrite'; 
          }
        }
      } else {
        const normTitre = normalizeStr(titre);
        const match = existingJeuxNorm.find(j => j.norm === normTitre);
        if (match) {
          matchType = 'suggested_link';
          existingEan = match.ean;
          existingNom = match.nom;
          userChoice = 'link'; 
        }
      }

      newImportData.push({
        titre, auteurs, editeur, description, contenu,
        ean, image_url: imageUrl, codes: codesSyracuse, couleur,
        mecanique, nb_de_joueurs, temps_de_jeu, etoiles, coop_versus,
        matchType, existingEan, existingNom, diffs, userChoice, isUpdateOnly: false
      });
    };

    if (unimarcRecords) {
      for (let i = 0; i < unimarcRecords.length; i++) {
        const rec = unimarcRecords[i];
        
        const titre = extractSubfield(rec, '200', 'a');
        if (!titre) continue;

        let ean = extractSubfield(rec, '073', 'a');
        const isTempEan = !ean;
        if (!ean) ean = `SYR-${Date.now()}-${i}`;

        const codesSyracuse = extractAllSubfields(rec, '995', 'f');

        const mecanique = extractSubfield(rec, '941', 'c') || "";
        
        let minJ = extractSubfield(rec, '941', 'a');
        let maxJ = extractSubfield(rec, '941', 'f');
        let nb_de_joueurs = "";
        let coop_versus = "";
        let isSolo = false;
        let isDuo = false;
        
        if (minJ) {
          if (minJ.toUpperCase() === 'S') { minJ = '1'; isSolo = true; coop_versus = 'Solo'; }
          else if (minJ.toUpperCase() === 'D') { minJ = '2'; isDuo = true; }
          else { const m = minJ.match(/\d+/); minJ = m ? m[0] : ''; }
        }
        if (maxJ) { const m = maxJ.match(/\d+/); maxJ = m ? m[0] : ''; }
        
        if (minJ && maxJ) {
            if (minJ === maxJ) nb_de_joueurs = minJ;
            else nb_de_joueurs = `${minJ}-${maxJ}`;
        }
        else if (minJ) {
            nb_de_joueurs = (isSolo || isDuo) ? minJ : `${minJ}+`;
        }
        else if (maxJ) {
            nb_de_joueurs = `Jusqu'à ${maxJ}`;
        }

        let tempsBrut = extractSubfield(rec, '941', 'd');
        const mapTemps: Record<string,string> = {'5M':'5-10', '10M':'10-20', '20M':'20-30', '30M':'30-45', '45M':'45-60', '1H':'1h30', '2H':'2h', '4H':'4h+'};
        let temps_de_jeu = tempsBrut ? (mapTemps[tempsBrut.toUpperCase()] || tempsBrut) : "";

        let ce = extractSubfield(rec, '941', 'e');
        let couleur = null;
        let etoiles = "";
        if (ce) {
           const cMatch = ce.match(/(Vert|Rose|Bleu|Rouge|Jaune)/i);
           if (cMatch) couleur = cMatch[1].toLowerCase();
           const eMatch = ce.match(/\d/);
           if (eMatch) etoiles = eMatch[0];
        }

        compareWithExisting(ean, titre, "", "", "", "", mecanique, nb_de_joueurs, temps_de_jeu, etoiles, coop_versus, couleur, "", codesSyracuse, isTempEan);
      }
      
      if (newImportData.length === 0) {
         alert("L'import a échoué. Le fichier UNIMARC semble valide, mais aucun Titre (champ 200 $a) n'a été trouvé.");
         return;
      }
    } 
    else {
      const cotesMap = new Map<string, string>();
      if (coteData) {
        const headers = coteData[0].map(h => h.trim().toLowerCase());
        const idxCode = headers.findIndex(h => h.includes('code-barres exemplaire'));
        const idxCote = headers.findIndex(h => h.includes('cote'));
        if (idxCode !== -1 && idxCote !== -1) {
          for (let i = 1; i < coteData.length; i++) {
            const code = coteData[i][idxCode]?.trim();
            const color = getCouleurFromCote(coteData[i][idxCote]?.trim());
            if (code && color) cotesMap.set(code, color);
          }
        }
      }

      if (catData) {
        const headers = catData[0].map(h => h.trim().toLowerCase());
        const getIdx = (name: string) => headers.findIndex(h => h.includes(name.toLowerCase()));
        
        const idxTitre = getIdx("titre");
        const idxAuteur = getIdx("auteur");
        const idxEditeur = getIdx("editeur");
        const idxCode = getIdx("code-barres exemplaire");
        const idxDesc = getIdx("description du contenu");
        const idxMat = getIdx("description matérielle");
        const idxEan = getIdx("ean");
        const idxLien = getIdx("lien 856");

        for (let i = 1; i < catData.length; i++) {
          const row = catData[i];
          if (row.length < 2 || !row[idxTitre]) continue;

          const titre = row[idxTitre]?.trim();
          let ean = idxEan !== -1 ? row[idxEan]?.trim() : "";
          const isTempEan = !ean;
          if (!ean) ean = `SYR-${Date.now()}-${i}`;

          const codesSyracuse = idxCode !== -1 && row[idxCode] ? row[idxCode].split(',').map(c => c.trim()).filter(Boolean) : [];
          let imageUrl = idxLien !== -1 ? row[idxLien]?.trim() : "";
          if (imageUrl) {
            const match = imageUrl.match(/(https?:\/\/[^\s()]+)/);
            if (match) imageUrl = match[1];
          }

          let resolvedColor = null;
          for (const c of codesSyracuse) {
            if (cotesMap.has(c)) { resolvedColor = cotesMap.get(c)!; break; }
          }

          const contenuFormate = formatContenuSyracuse(idxMat !== -1 ? row[idxMat]?.trim() : "");
          const auteurs = idxAuteur !== -1 ? row[idxAuteur]?.trim() : "";
          const editeur = idxEditeur !== -1 ? row[idxEditeur]?.trim() : "";
          const description = idxDesc !== -1 ? row[idxDesc]?.trim() : "";

          compareWithExisting(ean, titre, auteurs, editeur, description, contenuFormate, "", "", "", "", "", resolvedColor, imageUrl, codesSyracuse, isTempEan);
        }
      } else if (coteData) {
        const processedEans = new Set<string>();
        for (const [code, color] of Array.from(cotesMap.entries())) {
          const existingJeu = jeux.find(j => j.code_syracuse === code);
          if (existingJeu && existingJeu.ean && !processedEans.has(existingJeu.ean)) {
            processedEans.add(existingJeu.ean);
            newImportData.push({
              titre: existingJeu.nom, auteurs: "", editeur: "", description: "", contenu: "",
              ean: existingJeu.ean, image_url: "", codes: [code], couleur: color,
              mecanique: "", nb_de_joueurs: "", temps_de_jeu: "", etoiles: "", coop_versus: "",
              matchType: 'color_only', userChoice: 'update_color', isUpdateOnly: true
            });
          }
        }
      }
    }

    setImportData(newImportData);
    setImportStep('preview');
  };

  const toggleChoice = (index: number, choice: ImportItem['userChoice']) => {
    setImportData(prev => prev.map((item, i) => i === index ? { ...item, userChoice: choice } : item));
  };

  const validerImport = async () => {
    setIsImporting(true);
    let errorCount = 0;

    for (let i = 0; i < importData.length; i++) {
      const item = importData[i];
      let targetEan = item.ean;

      if (item.matchType === 'suggested_link' && item.userChoice === 'link' && item.existingEan) {
        targetEan = item.existingEan; 
      }

      if (item.isUpdateOnly) {
        if (item.couleur) await supabase.from('catalogue').update({ couleur: item.couleur }).eq('ean', targetEan);
      } else {
        const catPayload: any = { ean: targetEan, nom: item.titre };
        
        const conflicts = item.diffs?.map(d => d.field) || [];
        const shouldKeep = (field: string) => item.userChoice === 'overwrite' || !conflicts.includes(field);

        if (item.userChoice === 'create' || item.userChoice === 'overwrite' || item.userChoice === 'link' || item.userChoice === 'keep_old') {
          if (item.auteurs && shouldKeep('auteurs')) catPayload.auteurs = item.auteurs;
          if (item.editeur && shouldKeep('editeur')) catPayload.editeur = item.editeur;
          if (item.description && shouldKeep('description')) catPayload.description = item.description;
          if (item.contenu && shouldKeep('contenu')) catPayload.contenu = item.contenu;
          if (item.image_url && shouldKeep('image_url')) catPayload.image_url = item.image_url;
          if (item.couleur && shouldKeep('couleur')) catPayload.couleur = item.couleur;
          if (item.mecanique && shouldKeep('mecanique')) catPayload.mecanique = item.mecanique;
          if (item.nb_de_joueurs && shouldKeep('nb_de_joueurs')) catPayload.nb_de_joueurs = item.nb_de_joueurs;
          if (item.temps_de_jeu && shouldKeep('temps_de_jeu')) catPayload.temps_de_jeu = item.temps_de_jeu;
          if (item.etoiles && shouldKeep('etoiles')) catPayload.etoiles = item.etoiles;
          if (item.coop_versus && shouldKeep('coop_versus')) catPayload.coop_versus = item.coop_versus;
          
          const { error: catErr } = await supabase.from('catalogue').upsert(catPayload, { onConflict: 'ean' });
          if (catErr) { console.error("Erreur Catalogue:", catErr); errorCount++; continue; }
        }
      }

      if (!item.isUpdateOnly) {
        if (item.codes.length > 0) {
          for (let cIdx = 0; cIdx < item.codes.length; cIdx++) {
            const code = item.codes[cIdx];
            const { data: ex } = await supabase.from('jeux').select('id').eq('code_syracuse', code).maybeSingle();
            if (!ex) {
              await supabase.from('jeux').insert({
                ean: targetEan, nom: item.titre, code_syracuse: code, statut: 'En stock', 
                is_double: cIdx > 0 || item.userChoice === 'link',
                etape_nouveaute: false, etape_plastifier: true, etape_contenu: true,
                etape_etiquette: true, etape_equiper: true, etape_encoder: true, etape_notice: true
              });
            }
          }
        } else {
          const { data: ex } = await supabase.from('jeux').select('id').eq('ean', targetEan).limit(1);
          if (!ex || ex.length === 0) {
            await supabase.from('jeux').insert({
              ean: targetEan, nom: item.titre, statut: 'En stock', is_double: false,
              etape_nouveaute: false, etape_plastifier: true, etape_contenu: true,
              etape_etiquette: true, etape_equiper: true, etape_encoder: true, etape_notice: true
            });
          }
        }
      }
    }

    setIsImporting(false);
    setIsImportModalOpen(false);
    setImportData([]);
    setImportStep('upload');
    if (errorCount > 0) alert(`Import terminé avec ${errorCount} erreurs ignorées.`);
    else alert("Import réussi et synchronisé ! 🎉");
    fetchInventaire();
  };

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
  const handleScanSyracuseList = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && scanInput.trim() !== "") {
      let codeF = scanInput.trim();
      if (/^\d+$/.test(codeF) && codeF.length < 8) codeF = codeF.padStart(8, '0');
      const jeuTrouve = jeux.find(j => j.code_syracuse === codeF || j.ean === codeF);
      if (jeuTrouve) ajouterJeuSelection(jeuTrouve);
      else alert("Aucun jeu trouvé avec ce code Syracuse / EAN.");
    }
  };

  const ouvrirFicheJeu = async (jeu: JeuType) => {
    setIsLoadingFiche(true);
    setIsEditingFiche(false);

    const copies = jeux.filter(j => j.ean === jeu.ean).sort((a, b) => Number(a.id) - Number(b.id));
    const activeIndex = copies.findIndex(c => c.id === jeu.id);

    setFicheJeu({ ...jeu, copies, activeCopyIndex: activeIndex >= 0 ? activeIndex : 0 }); 
    
    try {
      const { data: catData } = await supabase.from('catalogue').select('*').eq('ean', jeu.ean).maybeSingle();
      const { data: manqData } = await supabase.from('pieces_manquantes').select('*').eq('ean', jeu.ean).order('id', { ascending: false });
      const { data: repData } = await supabase.from('reparations').select('*').eq('nom_jeu', jeu.nom).order('id', { ascending: false });

      setFicheJeu(prev => {
        if (!prev) return null;
        return {
          ...prev,
          contenu_boite: catData?.contenu || "",
          historique_manquants: manqData || [],
          historique_reparations: repData || [],
          image_url: catData?.image_url || "",
          auteurs: catData?.auteurs || "",
          editeur: catData?.editeur || "",
          description: catData?.description || "",
          pdf_url: catData?.pdf_url || ""
        };
      });
    } catch (error) {
      console.error("Erreur détails du jeu:", error);
    } finally {
      setIsLoadingFiche(false);
    }
  };

  const activerEditionFiche = () => {
    if (!ficheJeu) return;
    setEditedFiche({ ...ficheJeu });
    setIsEditingFiche(true);
  };

  const changerExemplaire = (index: number) => {
    if (!ficheJeu) return;
    const copy = ficheJeu.copies[index];
    setFicheJeu({
      ...ficheJeu,
      ...copy,
      activeCopyIndex: index,
    });
  };

  const creerNouvelExemplaire = async () => {
    if (!ficheJeu) return;
    if (!confirm("Voulez-vous créer un nouvel exemplaire de ce jeu ?")) return;

    const newJeu = {
      nom: ficheJeu.nom,
      ean: ficheJeu.ean,
      code_syracuse: "", 
      statut: "En préparation",
      is_double: true,
      etape_nouveaute: false, 
      etape_plastifier: false,
      etape_contenu: false,
      etape_etiquette: false,
      etape_equiper: false,
      etape_encoder: false,
      etape_notice: false
    };

    const { data, error } = await supabase.from('jeux').insert([newJeu]).select().single();
    if (error) {
      alert("Erreur: " + error.message);
    } else if (data) {
      fetchInventaire();
      const updatedCopies = [...ficheJeu.copies, data];
      setFicheJeu({
        ...ficheJeu,
        copies: updatedCopies,
        activeCopyIndex: updatedCopies.length - 1,
        ...data 
      });
      alert("Nouvel exemplaire créé !");
    }
  };

  const supprimerExemplaire = async (idJeu: string | number) => {
    if (!ficheJeu) return;
    if (!confirm("Voulez-vous vraiment supprimer cet exemplaire de l'inventaire ? Cette action est irréversible.")) return;

    const { error } = await supabase.from('jeux').delete().eq('id', idJeu);
    if (error) {
      alert("Erreur lors de la suppression : " + error.message);
      return;
    }

    const nouvellesCopies = ficheJeu.copies.filter(c => c.id !== idJeu);
    
    if (nouvellesCopies.length === 0) {
      setFicheJeu(null); 
    } else {
      setFicheJeu({
        ...ficheJeu,
        ...nouvellesCopies[0],
        copies: nouvellesCopies,
        activeCopyIndex: 0
      });
    }
    
    fetchInventaire();
  };

  const sauvegarderFicheJeu = async () => {
    if (!editedFiche) return;

    const { error: errJeux } = await supabase.from('jeux').update({
      nom: editedFiche.nom, 
      ean: editedFiche.ean,
      code_syracuse: editedFiche.code_syracuse || null,
      statut: editedFiche.statut,
      is_double: editedFiche.is_double,
      etape_nouveaute: editedFiche.etape_nouveaute
    }).eq('id', editedFiche.id);

    const catalogueData = {
      ean: editedFiche.ean,
      nom: editedFiche.nom,
      couleur: editedFiche.couleur || null,
      mecanique: editedFiche.mecanique || null,
      nb_de_joueurs: editedFiche.nb_de_joueurs || null,
      etoiles: editedFiche.etoiles || null,
      temps_de_jeu: editedFiche.temps_de_jeu || null,
      coop_versus: editedFiche.coop_versus || null,
      image_url: editedFiche.image_url || null,
      auteurs: editedFiche.auteurs || null,
      editeur: editedFiche.editeur || null,
      description: editedFiche.description || null,
      pdf_url: editedFiche.pdf_url || null
    };

    const { data: existingCat } = await supabase.from('catalogue').select('ean').eq('ean', editedFiche.ean).maybeSingle();
    
    let errCat: any = null;
    if (existingCat) {
      const { error } = await supabase.from('catalogue').update(catalogueData).eq('ean', editedFiche.ean);
      errCat = error;
    } else {
      const { error } = await supabase.from('catalogue').insert([catalogueData]);
      errCat = error;
    }

    const hasJeuxError = errJeux && Object.keys(errJeux).length > 0;
    const hasCatError = errCat && Object.keys(errCat).length > 0;

    if (hasJeuxError || hasCatError) {
      alert("Erreur lors de la sauvegarde. Consultez la console.");
      console.error("Jeux Error:", errJeux, "Catalogue Error:", errCat);
    } else {
      const newCopies = [...editedFiche.copies];
      newCopies[editedFiche.activeCopyIndex] = { ...newCopies[editedFiche.activeCopyIndex], ...editedFiche };
      
      setFicheJeu({ ...editedFiche, copies: newCopies });
      setIsEditingFiche(false);
      fetchInventaire(); 
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#e5e5e5] font-sans p-4 sm:p-8 relative">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      
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

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-4xl font-black text-black">📦 Inventaire</h1>
              <p className="text-slate-500 font-medium mt-1">{jeuxEnStock.length} jeux actuellement en stock</p>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto items-center flex-wrap">
              <div className="relative flex-1 min-w-[200px] md:w-80">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 opacity-50">🔍</span>
                <input 
                  type="text" placeholder="Chercher un jeu, code..." value={recherche} onChange={(e) => setRecherche(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-10 pr-4 py-3.5 font-bold outline-none focus:border-black transition-colors"
                />
                {recherche && <button onClick={() => setRecherche("")} className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 bg-slate-200 text-slate-600 rounded-full font-bold text-xs hover:bg-slate-300">✕</button>}
              </div>
              <div className="relative">
                <button onClick={() => setIsSettingsOpen(!isSettingsOpen)} className={`w-12 h-12 flex items-center justify-center rounded-2xl border-2 transition-colors ${isSettingsOpen ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-100 hover:border-slate-300'}`} title="Outils de maintenance">
                  <span className={`text-xl transition-transform duration-300 ${isSettingsOpen ? 'rotate-90' : ''}`}>⚙️</span>
                </button>
                {isSettingsOpen && (
                  <div className="absolute right-0 top-full mt-3 bg-white shadow-xl rounded-2xl border border-slate-100 p-2 flex flex-col gap-1 z-50 min-w-[240px] animate-fade-in">
                    <span className="text-xs font-black text-slate-400 uppercase px-3 py-2">Maintenance</span>
                    <button onClick={() => { setImportStep('upload'); setIsImportModalOpen(true); setIsSettingsOpen(false); }} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">📥 Importer Syracuse</button>
                    <button onClick={() => { nettoyerMecaniques(); }} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🧽 Nettoyer Mécaniques</button>
                    <button onClick={() => { setIsColorFixOpen(true); setIsSettingsOpen(false); }} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🛠️ Corriger Couleurs (Scanner)</button>
                    <button onClick={detecterDoublons} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🔍 Nettoyer les Doublons</button>
                    <button onClick={() => { synchroniserBase(); setIsSettingsOpen(false); }} disabled={isSyncing} className="text-left w-full px-4 py-3 hover:bg-slate-50 rounded-xl font-bold text-sm text-black transition-colors flex items-center gap-2">🧹 Synchroniser Catalogue</button>
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
              {jeuxGroupes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 mt-10"><span className="text-4xl mb-2">🤔</span><p className="font-bold">Aucun jeu ne correspond à vos filtres.</p></div>
              ) : (
                jeuxGroupes.map(groupe => {
                  const jeu = groupe[0];
                  const couleurObj = COULEURS.find(c => c.id === jeu.couleur);
                  const estDeplie = groupesDeplies[jeu.ean];
                  const hasCopies = groupe.length > 1;

                  return (
                    <div key={jeu.ean} className="mb-3 bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all border-slate-100 overflow-hidden">
                      <div
                        onClick={() => ouvrirFicheJeu(jeu)}
                        className="grid grid-cols-12 gap-4 p-4 items-center hover:bg-slate-50 cursor-pointer group relative"
                      >
                        <div className="col-span-12 md:col-span-7 lg:col-span-6 font-bold text-black flex flex-col gap-1.5">
                          <div className="flex items-center gap-3">
                            {/* Vignette */}
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-slate-100 border border-slate-200 flex items-center justify-center">
                              {catalogueImages[jeu.ean]
                                ? <img src={catalogueImages[jeu.ean]} alt={jeu.nom} className="w-full h-full object-cover" loading="lazy" />
                                : <div className={`w-full h-full ${couleurObj ? couleurObj.bg : 'bg-slate-200'}`} title={jeu.couleur || 'Aucune couleur'} />
                              }
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`w-3 h-3 rounded-full shadow-inner shrink-0 ${couleurObj ? couleurObj.bg : 'bg-slate-200'}`} title={jeu.couleur || 'Aucune couleur'} />
                              <span className="truncate text-base group-hover:text-blue-600 transition-colors">{jeu.nom}</span>
                              {hasCopies && (
                                <span className="bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-0.5 rounded-md border border-slate-200 shrink-0">
                                  {groupe.length} EX
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-14 mt-0.5 flex-wrap">
                            {jeu.mecanique && <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">{jeu.mecanique}</span>}
                            {jeu.coop_versus && <span className="bg-blue-50 text-blue-600 border border-blue-100 text-[10px] font-bold px-2 py-0.5 rounded">{jeu.coop_versus === 'Coop' ? '🤝 Coop' : jeu.coop_versus === 'Solo' ? '👤 Solo' : '⚔️ Versus'}</span>}
                            {jeu.nb_de_joueurs && <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded">👥 {jeu.nb_de_joueurs}</span>}
                            {jeu.etoiles && <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded shadow-sm">⭐ {jeu.etoiles}</span>}
                            <DureeGauge duree={jeu.temps_de_jeu} />
                          </div>
                        </div>
                        
                        <div className="col-span-6 md:col-span-3 lg:col-span-3 font-medium text-slate-500 font-mono text-sm">
                          {jeu.ean}
                        </div>
                        
                        <div className="col-span-6 md:col-span-2 lg:col-span-2 flex flex-col gap-1.5 items-start">
                          {!hasCopies ? (
                            <>
                              <span className={`text-[10px] font-black px-2.5 py-1.5 rounded-md uppercase ${jeu.statut === 'En stock' ? 'bg-emerald-100 text-emerald-700' : jeu.statut === 'En préparation' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                {jeu.statut}
                              </span>
                              {jeu.statut === 'En préparation' && (
                                <div className="flex items-center gap-1.5 w-full max-w-[100px]" title={`${getProgression(jeu)}%`}>
                                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                                    <div className="bg-amber-500 h-1.5 rounded-full" style={{ width: `${getProgression(jeu)}%` }}></div>
                                  </div>
                                </div>
                              )}
                              {jeu.statut === 'En stock' && jeu.etape_nouveaute && (
                                <span className="text-[9px] font-bold text-slate-500">🌟 Nouveauté</span>
                              )}
                            </>
                          ) : (
                            <div className="flex flex-col gap-1 text-xs font-bold">
                              {groupe.filter(g => g.statut === 'En stock').length > 0 && <span className="text-emerald-600">{groupe.filter(g => g.statut === 'En stock').length} en stock</span>}
                              {groupe.filter(g => g.statut === 'En préparation').length > 0 && <span className="text-amber-500">{groupe.filter(g => g.statut === 'En préparation').length} en prépa</span>}
                            </div>
                          )}
                        </div>

                        <div className="col-span-12 lg:col-span-1 flex justify-end gap-2">
                           {hasCopies ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); toggleGroupe(jeu.ean); }} 
                               className="text-slate-500 hover:bg-slate-200 bg-slate-100 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors flex items-center justify-center min-w-[40px] shadow-sm"
                             >
                               {estDeplie ? '▲' : '▼'}
                             </button>
                           ) : (
                             <button onClick={(e) => { e.stopPropagation(); ouvrirFicheJeu(jeu); }} className="text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold text-xs transition-colors opacity-0 group-hover:opacity-100">✏️</button>
                           )}
                        </div>
                      </div>

                      {hasCopies && estDeplie && (
                        <div className="bg-slate-50 border-t border-slate-100 p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {groupe.map((copy, idx) => (
                            <div key={copy.id} onClick={() => ouvrirFicheJeu(copy)} className="bg-white border border-slate-200 p-3 rounded-xl flex justify-between items-center cursor-pointer hover:border-slate-400 shadow-sm transition-colors">
                              <div className="flex flex-col gap-1">
                                <span className="font-bold text-sm text-slate-800">Ex. {idx + 1}</span>
                                {copy.code_syracuse && <span className="text-[10px] font-mono text-slate-500">Syr: {copy.code_syracuse}</span>}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase ${copy.statut === 'En stock' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                  {copy.statut}
                                </span>
                                {copy.statut === 'En préparation' && (
                                  <div className="w-12 bg-slate-200 rounded-full h-1 mt-1 overflow-hidden">
                                    <div className="bg-amber-500 h-1 rounded-full" style={{ width: `${getProgression(copy)}%` }}></div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* --- NOUVEAU: OUTIL DE SCAN CORRECTION RAPIDE --- */}
      {isColorFixOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl flex flex-col shadow-2xl overflow-hidden border-2 border-slate-200">
            <div className="p-6 md:p-8 border-b-2 border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800">🚑 Scanner Correctif Couleurs</h2>
                <p className="text-slate-500 font-bold mt-1 text-sm">Attribue rapidement une couleur à des EAN existants.</p>
              </div>
              <button onClick={() => setIsColorFixOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black font-black transition-colors shrink-0">✕</button>
            </div>

            <div className="p-6 md:p-8 flex flex-col gap-6">
              
              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">1. Choisir la couleur à appliquer</h3>
                <div className="flex gap-3 flex-wrap">
                  {COULEURS.map(c => (
                    <button 
                      key={c.id}
                      onClick={() => { setColorFixSelected(c.id); document.getElementById('color-fix-scanner')?.focus(); }}
                      className={`px-4 py-2.5 rounded-xl font-black uppercase text-sm border-2 transition-all ${colorFixSelected === c.id ? `${c.bg} ${c.text} border-transparent shadow-md scale-105` : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-3">2. Scanner les EAN à la suite</h3>
                <input 
                  id="color-fix-scanner"
                  type="text" 
                  value={colorFixEan}
                  onChange={(e) => setColorFixEan(e.target.value)}
                  onKeyDown={handleColorFixScan}
                  placeholder={colorFixSelected ? "Scannez un code-barres ici..." : "Veuillez choisir une couleur d'abord ☝️"}
                  disabled={!colorFixSelected}
                  autoFocus
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-4 text-lg font-mono font-bold outline-none focus:border-black disabled:opacity-50 transition-colors"
                />
              </div>

              <div className="bg-slate-100 rounded-xl p-4 min-h-[150px] max-h-[250px] overflow-y-auto flex flex-col gap-2 custom-scroll border border-slate-200 shadow-inner">
                {colorFixLogs.length === 0 ? (
                  <p className="text-slate-400 font-bold text-center mt-10 italic text-sm">Aucun scan effectué pour le moment.</p>
                ) : (
                  colorFixLogs.map((log, i) => (
                    <div key={i} className={`p-2 rounded-lg text-sm font-bold border ${log.isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-700'}`}>
                      {log.msg}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- NOUVEAU: OUTIL DE NETTOYAGE DES MÉCANIQUES --- */}
      {isMecaFixModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-2 border-slate-200">
            <div className="p-6 md:p-8 border-b-2 border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800">🧽 Nettoyage des Mécaniques</h2>
                <p className="text-slate-500 font-bold mt-1 text-sm">{jeuxMecaInvalides.length} jeux ont une mécanique vide ou non standard.</p>
              </div>
              <button onClick={() => setIsMecaFixModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black font-black transition-colors shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#e5e5e5] custom-scroll flex flex-col gap-4">
              {jeuxMecaInvalides.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <span className="text-5xl mb-4 block">✨</span>
                  <p className="font-bold text-xl">Tout est parfait ! Aucune mécanique à nettoyer.</p>
                </div>
              ) : (
                jeuxMecaInvalides.map((jeu) => (
                  <div key={jeu.ean} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-black text-lg text-slate-800 truncate">{jeu.nom}</h4>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        Mécanique actuelle : <span className="text-red-500 bg-red-50 px-2 py-0.5 rounded border border-red-100">{jeu.mecanique || "Vide"}</span>
                      </p>
                    </div>
                    
                    <div className="shrink-0 w-full sm:w-64">
                      <select 
                        value={mecaUpdates[jeu.ean] !== undefined ? mecaUpdates[jeu.ean] : (jeu.mecanique || "")}
                        onChange={(e) => setMecaUpdates({ ...mecaUpdates, [jeu.ean]: e.target.value })}
                        className="w-full bg-slate-50 border-2 border-slate-200 font-bold text-slate-700 text-sm rounded-xl px-3 py-2 outline-none focus:border-black cursor-pointer shadow-sm"
                      >
                        <option value="">-- Conserver tel quel --</option>
                        {MECANIQUES_OFFICIELLES.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>

            {jeuxMecaInvalides.length > 0 && (
              <div className="p-6 border-t-2 border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <button 
                  onClick={() => setIsMecaFixModalOpen(false)} 
                  disabled={isFixingMeca}
                  className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors border border-slate-200 shadow-sm"
                >
                  Annuler
                </button>
                <button 
                  onClick={validerCorrectionsMeca} 
                  disabled={isFixingMeca || Object.keys(mecaUpdates).length === 0}
                  className="bg-black hover:bg-slate-800 disabled:bg-slate-400 text-white font-black px-8 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  {isFixingMeca ? "⏳ Mise à jour..." : `💾 Enregistrer (${Object.values(mecaUpdates).filter(v => v !== "").length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- OUTIL NETTOYAGE DOUBLONS --- */}
      {isDoublonsModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-2 sm:p-4 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-6xl flex flex-col shadow-2xl overflow-hidden border-2 border-slate-200" style={{ height: '95vh' }}>
            <div className="p-6 md:p-8 border-b-2 border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-2xl font-black text-slate-800">🔍 Nettoyage des Doublons</h2>
                <p className="text-slate-500 font-bold mt-1 text-sm">
                  {doublonGroupes.length === 0
                    ? "Aucun doublon détecté."
                    : `${doublonGroupes.length} jeu${doublonGroupes.length > 1 ? 'x' : ''} avec des exemplaires sans code Syracuse. ${doublonsSelectionnes.length} exemplaire${doublonsSelectionnes.length > 1 ? 's' : ''} sélectionné${doublonsSelectionnes.length > 1 ? 's' : ''} pour suppression.`}
                </p>
              </div>
              <button onClick={() => setIsDoublonsModalOpen(false)} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black font-black transition-colors shrink-0">✕</button>
            </div>

            <div className="overflow-y-auto p-6 bg-[#e5e5e5] custom-scroll" style={{flex: '1 1 0', minHeight: 0}}>
              {doublonGroupes.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <span className="text-5xl mb-4 block">✨</span>
                  <p className="font-bold text-xl">Aucun doublon trouvé. L&apos;inventaire est propre !</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {doublonGroupes.map((groupe) => {
                    const tousSupprimes = groupe.exemplaires.every(ex => doublonsSelectionnes.includes(ex.id));
                    return (
                      <div key={groupe.ean} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
                        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 rounded-t-2xl">
                          <p className="font-black text-slate-900 text-base">{groupe.nom}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{groupe.exemplaires.length} exemplaires · EAN {groupe.ean}</p>
                          {tousSupprimes && <p className="text-xs text-red-500 font-bold mt-1">⚠️ Tous les exemplaires sélectionnés</p>}
                        </div>
                        {groupe.exemplaires.map((ex) => {
                          const isSuggere = groupe.suggeresIds.includes(ex.id);
                          const isChecked = doublonsSelectionnes.includes(ex.id);
                          return (
                            <div
                              key={String(ex.id)}
                              onClick={() => {
                                if (isChecked) {
                                  setDoublonsSelectionnes(prev => prev.filter(id => id !== ex.id));
                                } else {
                                  setDoublonsSelectionnes(prev => [...prev, ex.id]);
                                }
                              }}
                              className={`flex items-start gap-3 px-5 py-3 cursor-pointer border-b border-slate-100 last:border-b-0 last:rounded-b-2xl ${isChecked ? 'bg-red-50' : 'hover:bg-slate-50'}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                readOnly
                                className="mt-0.5 w-4 h-4 accent-red-500 shrink-0"
                              />
                              <div>
                                <p className="text-sm font-bold text-slate-800">
                                  {ex.nom} <span className="text-slate-400 font-normal">· #{ex.id}</span>
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {ex.code_syracuse
                                    ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 border border-green-200 font-bold">✓ {ex.code_syracuse}</span>
                                    : <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-600 border border-red-200 font-bold">✗ Pas de code Syracuse</span>
                                  }
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">{ex.statut}</span>
                                  {isSuggere && <span className="text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-600 border border-orange-200 font-bold">Suggéré</span>}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {doublonGroupes.length > 0 && (
              <div className="p-6 border-t-2 border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <button onClick={() => setIsDoublonsModalOpen(false)} disabled={isDeletingDoublons} className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors border border-slate-200 shadow-sm">
                  Annuler
                </button>
                <button
                  onClick={supprimerDoublonsSelectionnes}
                  disabled={isDeletingDoublons || doublonsSelectionnes.length === 0}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-slate-400 text-white font-black px-8 py-3 rounded-xl shadow-md transition-all flex items-center gap-2"
                >
                  {isDeletingDoublons ? "⏳ Suppression..." : `🗑️ Supprimer (${doublonsSelectionnes.length})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL SMART IMPORT SYRACUSE --- */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 sm:p-8 animate-fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden border-2 border-slate-200">
            
            <div className="p-6 md:p-8 border-b-2 border-slate-100 bg-slate-50 flex justify-between items-start shrink-0">
              <div>
                <h2 className="text-3xl font-black text-slate-800">📥 Importation Syracuse</h2>
                <p className="text-slate-500 font-bold mt-1">
                  {importStep === 'upload' ? 'Mise à jour des étiquettes (UNIMARC) ou du catalogue.' : `${importData.length} jeux détectés.`}
                </p>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportStep('upload'); setImportData([]); }} className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-slate-300 hover:text-black font-black transition-colors shrink-0">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#e5e5e5] custom-scroll">
              
              {importStep === 'upload' && (
                <div 
                  className="border-4 border-dashed border-slate-300 bg-white rounded-[2rem] p-10 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors h-full min-h-[300px]"
                  onClick={() => document.getElementById('smart-import-file')?.click()}
                >
                  <span className="text-6xl mb-6">📂</span>
                  <h3 className="text-2xl font-black text-slate-800 mb-2">Sélectionnez vos fichiers</h3>
                  <p className="text-slate-500 font-medium max-w-md">
                    Glissez le <b>Fichier UNIMARC (.mrc / .iso)</b> pour importer uniquement les données d'étiquettes (Mécanique, Joueurs, Temps...).<br/><br/>Ou les fichiers <b>Catalogue CSV</b> et/ou <b>Cotes CSV</b> pour un import standard.
                  </p>
                  <button className="mt-8 bg-black text-white px-8 py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">
                    Parcourir les fichiers
                  </button>
                  <input 
                    id="smart-import-file" 
                    type="file" 
                    multiple 
                    accept=".csv, .mrc, .iso, .txt" 
                    className="hidden" 
                    onChange={(e) => { if (e.target.files) handleSmartImport(e.target.files); }} 
                  />
                </div>
              )}

              {importStep === 'preview' && (
                <div className="flex flex-col gap-4">
                  {importData.map((item, idx) => {
                     const colorObj = COULEURS.find(c => c.id === item.couleur);
                     
                     let borderClass = 'border-slate-200';
                     let bgClass = 'bg-white';
                     if (item.matchType === 'conflict') { borderClass = 'border-orange-400'; bgClass = 'bg-orange-50'; }
                     if (item.matchType === 'suggested_link') borderClass = 'border-blue-400';
                     if (item.matchType === 'auto_fill') { borderClass = 'border-emerald-300'; bgClass = 'bg-emerald-50/50'; }

                     return (
                      <div key={idx} className={`${bgClass} rounded-2xl p-5 shadow-sm border-2 flex flex-col gap-4 ${borderClass}`}>
                        
                        <div className="flex flex-col sm:flex-row gap-4 sm:items-center">
                          <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center relative">
                            {item.image_url ? <img src={item.image_url} alt="Cover" className="w-full h-full object-cover" /> : <span className="text-xl">🖼️</span>}
                            {colorObj && <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${colorObj.bg}`}></div>}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-lg text-slate-800 truncate flex items-center gap-2">
                              {item.titre}
                              {item.matchType === 'new' && <span className="bg-slate-800 text-white text-[10px] uppercase px-2 py-0.5 rounded">Nouveau</span>}
                              {item.matchType === 'auto_fill' && <span className="bg-emerald-100 text-emerald-700 text-[10px] uppercase px-2 py-0.5 rounded">Complété</span>}
                            </h4>
                            {!item.isUpdateOnly && <p className="text-xs font-bold text-slate-500 truncate mt-0.5">{item.editeur} • {item.auteurs}</p>}
                          </div>

                          <div className="flex gap-6 items-center shrink-0">
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">EAN</span>
                              <span className="font-mono font-bold bg-white px-2 py-1 rounded border border-slate-200 text-sm text-slate-700">{item.ean}</span>
                            </div>
                            <div className="w-px h-8 bg-slate-200 hidden sm:block"></div>
                            <div className="flex flex-col items-end gap-1 w-16">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Syracuse</span>
                              {item.codes.length > 0 ? (
                                <span className="font-black bg-blue-100 text-blue-700 px-2 py-1 rounded text-sm">{item.codes.length} Ex.</span>
                              ) : <span className="font-bold text-slate-300 italic text-sm">Aucun</span>}
                            </div>
                          </div>
                        </div>

                        {item.matchType === 'suggested_link' && (
                          <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div className="text-sm">
                              <span className="text-blue-700 font-bold">💡 Suggestion :</span> Un jeu nommé <b>"{item.existingNom}"</b> existe. Lier le code Syracuse à ce jeu ?
                            </div>
                            <select 
                              value={item.userChoice} 
                              onChange={(e) => toggleChoice(idx, e.target.value as any)}
                              className="bg-white border border-blue-200 font-bold text-blue-800 text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer shadow-sm"
                            >
                              <option value="link">Oui, lier (EAN: {item.existingEan})</option>
                              <option value="create">Non, créer un nouveau jeu</option>
                            </select>
                          </div>
                        )}

                        {item.matchType === 'conflict' && (
                          <div className="bg-orange-100 border border-orange-300 p-3 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                            <div className="text-sm flex flex-col gap-1">
                              <span className="text-orange-800 font-bold">⚠️ Conflit de données détecté :</span>
                              <div className="flex flex-wrap gap-3 text-xs text-orange-700 mt-1">
                                {item.diffs?.map(d => (
                                  <span key={d.field}><b>{d.label} :</b> "{d.old}" ➔ "{d.new}"</span>
                                ))}
                              </div>
                            </div>
                            <select 
                              value={item.userChoice} 
                              onChange={(e) => toggleChoice(idx, e.target.value as any)}
                              className="bg-white border border-orange-300 font-bold text-orange-900 text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer shadow-sm"
                            >
                              <option value="keep_old">Garder les infos actuelles</option>
                              <option value="overwrite">Écraser avec le fichier</option>
                            </select>
                          </div>
                        )}

                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {importStep === 'preview' && (
              <div className="p-6 border-t-2 border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <button 
                  onClick={() => { setImportStep('upload'); setImportData([]); }} 
                  disabled={isImporting}
                  className="px-6 py-3 bg-white hover:bg-slate-100 text-slate-600 font-bold rounded-xl transition-colors border border-slate-200 shadow-sm"
                >
                  Annuler
                </button>
                <button 
                  onClick={validerImport} 
                  disabled={isImporting}
                  className="bg-[#baff29] hover:bg-[#a0dc1b] text-black font-black px-8 py-3 rounded-xl shadow-md transition-transform hover:scale-105 flex items-center gap-2"
                >
                  {isImporting ? "⏳ Importation..." : "💾 Valider l'importation"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL GESTIONNAIRE DE SÉLECTION --- */}
      {isSelectionModalOpen && editSelection && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-center justify-center p-4 sm:p-8">
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
                      onChange={e => setScanInput(e.target.value)} onKeyDown={handleScanSyracuseList}
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
              {editSelection.titre && editSelection.id && editSelection.id.length > 30 ? (
                <button onClick={() => editSelection.id && supprimerSelection(editSelection.id)} className="text-rose-500 font-bold hover:bg-rose-50 px-4 py-2 rounded-xl transition-colors">
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
      {ficheJeu && (() => {
        const activeCopy = ficheJeu.copies[ficheJeu.activeCopyIndex];
        const selectionsForCopy = selections.filter(s => s.jeux?.some(j => j.id === activeCopy?.id));

        return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 sm:p-8 animate-fade-in overflow-hidden">
          <div className="bg-[#e5e5e5] rounded-[2.5rem] w-full max-w-6xl max-h-[95vh] flex flex-col shadow-2xl overflow-hidden relative border border-slate-200">
            
            {/* Header de la Fiche */}
            <div className="bg-white p-4 md:px-6 md:py-4 flex justify-between items-center border-b-2 border-slate-100 shrink-0 gap-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className={`w-7 h-7 rounded-full shadow-inner border-2 border-slate-100 shrink-0 ${COULEURS.find(c => c.id === (isEditingFiche && editedFiche ? editedFiche.couleur : ficheJeu.couleur))?.bg || 'bg-slate-300'}`}></div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {isEditingFiche && editedFiche ? (
                    <input 
                      type="text" 
                      value={editedFiche.nom} 
                      onChange={e => setEditedFiche({...editedFiche, nom: e.target.value})} 
                      className="text-2xl sm:text-3xl font-black text-slate-800 leading-none bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-1 outline-none focus:border-blue-500 w-full md:w-[300px]"
                    />
                  ) : (
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-800 leading-none truncate pr-4">{ficheJeu.nom}</h2>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1 shrink-0">
                    {isEditingFiche && editedFiche ? (
                      <select value={editedFiche.statut || ''} onChange={e => setEditedFiche({...editedFiche, statut: e.target.value})} className="text-xs font-bold bg-white border-2 border-slate-200 rounded-lg px-2 py-0.5 outline-none">
                        <option value="En stock">En stock</option>
                        <option value="En préparation">En préparation</option>
                      </select>
                    ) : (
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${activeCopy?.statut === 'En stock' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {activeCopy?.statut}
                      </span>
                    )}

                    {isEditingFiche && editedFiche ? (
                      <label className="flex items-center gap-1 cursor-pointer bg-blue-50 px-2 py-0.5 rounded text-xs font-bold text-blue-700">
                        <input type="checkbox" checked={editedFiche.is_double || false} onChange={e => setEditedFiche({...editedFiche, is_double: e.target.checked})} className="accent-blue-600"/> Double
                      </label>
                    ) : (
                      activeCopy?.is_double && <span className="text-[10px] font-black px-2 py-0.5 bg-blue-100 text-blue-700 rounded uppercase tracking-wider">Double</span>
                    )}

                    {isEditingFiche && editedFiche ? (
                      <label className="flex items-center gap-1 cursor-pointer bg-[#baff29]/30 px-2 py-0.5 rounded text-xs font-bold text-black">
                        <input type="checkbox" checked={editedFiche.etape_nouveaute || false} onChange={e => setEditedFiche({...editedFiche, etape_nouveaute: e.target.checked})} className="accent-black"/> Nouveauté
                      </label>
                    ) : (
                      activeCopy?.etape_nouveaute && <span className="text-[10px] font-black px-2 py-0.5 bg-[#baff29] text-black rounded uppercase tracking-wider shadow-sm">Nouveauté</span>
                    )}
                    
                    {isEditingFiche && editedFiche && (
                      <select 
                        value={editedFiche.couleur || ''} 
                        onChange={e => setEditedFiche({...editedFiche, couleur: e.target.value})}
                        className="text-xs font-bold bg-white border-2 border-slate-200 rounded-lg px-2 py-0.5 outline-none ml-1"
                      >
                        <option value="">Couleur...</option>
                        {COULEURS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {!isEditingFiche && (
                  <div className="hidden md:flex items-center gap-2 overflow-x-auto hide-scrollbar max-w-[250px] lg:max-w-[400px] border-r-2 border-slate-100 pr-4">
                    {ficheJeu.copies.map((copy, index) => (
                      <button 
                        key={copy.id}
                        onClick={() => changerExemplaire(index)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shadow-sm border ${index === ficheJeu.activeCopyIndex ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 hover:bg-slate-100 border-slate-200'}`}
                      >
                        Ex. {index + 1} {copy.code_syracuse ? `(${copy.code_syracuse})` : ''}
                      </button>
                    ))}
                    <button 
                      onClick={creerNouvelExemplaire}
                      className="w-7 h-7 flex items-center justify-center rounded-full text-lg font-black bg-white border-2 border-dashed border-slate-300 text-slate-400 hover:border-black hover:text-black hover:bg-slate-50 transition-colors shrink-0"
                      title="Ajouter un nouvel exemplaire"
                    >
                      +
                    </button>
                  </div>
                )}
                <button onClick={() => setFicheJeu(null)} className="text-slate-400 hover:text-black font-black text-xl w-10 h-10 flex items-center justify-center bg-slate-100 hover:bg-slate-200 rounded-full transition-colors shrink-0">✕</button>
              </div>
            </div>

            {!isEditingFiche && (
              <div className="md:hidden flex items-center gap-2 overflow-x-auto hide-scrollbar px-4 py-2 bg-white border-b border-slate-100 shrink-0">
                {ficheJeu.copies.map((copy, index) => (
                  <button 
                    key={copy.id}
                    onClick={() => changerExemplaire(index)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap shadow-sm border ${index === ficheJeu.activeCopyIndex ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 hover:bg-slate-100 border-slate-200'}`}
                  >
                    Ex. {index + 1} {copy.code_syracuse ? `(${copy.code_syracuse})` : ''}
                  </button>
                ))}
                <button 
                  onClick={creerNouvelExemplaire}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-lg font-black bg-white border-2 border-dashed border-slate-300 text-slate-400 hover:border-black hover:text-black hover:bg-slate-50 transition-colors shrink-0"
                >
                  +
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scroll flex flex-col lg:flex-row gap-6 md:gap-8 bg-[#e5e5e5]">
              
              <div className="w-full lg:w-1/3 flex flex-col gap-6 shrink-0 lg:max-w-[340px]">
                <div className="aspect-[3/4] bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm flex flex-col items-center justify-center overflow-hidden relative group p-3">
                  {ficheJeu.image_url && !isEditingFiche ? (
                    <img src={ficheJeu.image_url} alt={`Cover de ${ficheJeu.nom}`} className="w-full h-full object-contain" />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-300 gap-4 p-6 text-center w-full h-full border-2 border-dashed border-slate-200 rounded-2xl">
                      <span className="text-6xl">🖼️</span>
                      {isEditingFiche && editedFiche ? (
                        <div className="w-full mt-4">
                          <label className="text-xs font-bold text-slate-500 mb-1 block">URL de l'image (MyLudo/BGG)</label>
                          <input 
                            type="text" 
                            value={editedFiche.image_url || ''} 
                            onChange={e => setEditedFiche({...editedFiche, image_url: e.target.value})} 
                            className="w-full text-black bg-white border-2 border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-blue-500 font-sans" 
                            placeholder="https://..." 
                          />
                        </div>
                      ) : (
                        <p className="font-bold text-sm">Image à venir</p>
                      )}
                    </div>
                  )}
                </div>
                
                <button onClick={() => alert("Récupération du PDF via API (BGG/Philibert) bientôt disponible !")} className="w-full py-3 bg-white border-2 border-slate-200 rounded-2xl font-bold text-slate-700 hover:border-black hover:text-black transition-colors shadow-sm flex items-center justify-center gap-3">
                  <span className="text-xl">📖</span> Voir les règles (PDF)
                </button>
              </div>

              <div className="w-full lg:w-2/3 flex flex-col gap-6 flex-1">
                
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
                        activeCopy?.code_syracuse ? <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded w-max border border-blue-100">{activeCopy.code_syracuse}</span> : <span className="text-slate-300 font-bold">—</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mécanique</span>
                      {isEditingFiche && editedFiche ? (
                        <select 
                          value={editedFiche.mecanique || ''} 
                          onChange={e => setEditedFiche({...editedFiche, mecanique: e.target.value})} 
                          className="font-bold text-slate-700 bg-slate-50 px-2 py-1 rounded border-2 border-slate-200 outline-none w-full cursor-pointer"
                        >
                          <option value="">—</option>
                          {MECANIQUES_OFFICIELLES.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="font-bold text-slate-700 truncate block" title={ficheJeu.mecanique || ""}>{ficheJeu.mecanique || "—"}</span>
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
                      <textarea value={editedFiche.description || ''} onChange={e => setEditedFiche({...editedFiche, description: e.target.value})} className="w-full bg-slate-50 border-2 border-slate-200 rounded-lg p-3 text-sm outline-none min-h-[100px] custom-scroll" placeholder="Description du jeu..." />
                    ) : (
                      <p className="font-medium text-slate-600 text-sm leading-relaxed">
                        {ficheJeu.description || "La description textuelle sera importée depuis la base de données Syracuse ou BGG."}
                      </p>
                    )}
                  </div>
                </div>

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

                <div className="bg-white rounded-[2rem] p-6 md:p-8 border-2 border-slate-100 shadow-sm">
                  <h3 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">📍 Localisation & Suivi</h3>

                  <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Emplacement actuel</span>
                      {activeCopy?.statut === 'En préparation' ? (
                        <div className="flex items-center gap-2 text-amber-600 font-black"><span className="text-xl">🛠️</span> Atelier</div>
                      ) : activeCopy?.etape_nouveaute ? (
                        <div className="flex items-center gap-2 text-black font-black"><span className="text-xl">🌟</span> Pôle Nouveautés</div>
                      ) : (
                        <div className="flex items-center gap-2 text-emerald-600 font-black"><span className="text-xl">🟢</span> Salle de jeux (Rayon)</div>
                      )}
                    </div>

                    <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">Sélections actives</span>
                      {selectionsForCopy.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectionsForCopy.map(s => <span key={s.id} className="bg-[#ff4d79] text-white text-[10px] uppercase font-black px-2 py-1 rounded shadow-sm">{s.titre}</span>)}
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-slate-400 italic">Aucune sélection</span>
                      )}
                    </div>
                  </div>

                  {activeCopy?.statut === 'En préparation' && (
                    <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
                       <div className="flex justify-between items-end mb-2">
                         <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avancement Préparation</span>
                         <span className="text-sm font-black text-amber-600">{getProgression(activeCopy)}%</span>
                       </div>
                       <div className="w-full bg-slate-200 rounded-full h-2 mb-3 overflow-hidden">
                         <div className="bg-amber-500 h-2 rounded-full transition-all duration-500" style={{ width: `${getProgression(activeCopy)}%` }}></div>
                       </div>
                       <div className="flex flex-wrap gap-2 mt-2">
                         {[
                           { id: 'etape_plastifier', label: 'Plastification' },
                           { id: 'etape_contenu', label: 'Contenu' },
                           { id: 'etape_etiquette', label: 'Étiquette' },
                           { id: 'etape_equiper', label: 'Équiper' },
                           { id: 'etape_encoder', label: 'Encoder' },
                           { id: 'etape_notice', label: 'Notice' }
                         ].map(step => (
                           <span key={step.id} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${activeCopy[step.id as keyof typeof activeCopy] ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-slate-400 border-slate-200'}`}>
                             {activeCopy[step.id as keyof typeof activeCopy] ? '✓' : '○'} {step.label}
                           </span>
                         ))}
                       </div>
                    </div>
                  )}

                  {activeCopy?.etape_nouveaute && (
                    <div className="flex gap-4 mb-6 bg-[#baff29]/20 p-4 rounded-xl border border-[#baff29]/50">
                      <div className="flex-1">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Entrée nouveauté</span>
                        <span className="font-black text-black">{activeCopy.date_entree ? new Date(activeCopy.date_entree).toLocaleDateString('fr-FR') : "Non définie"}</span>
                      </div>
                      <div className="w-px bg-[#baff29]/50"></div>
                      <div className="flex-1">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider block mb-1">Sortie prévue</span>
                        <span className="font-black text-rose-500">{activeCopy.date_sortie ? new Date(activeCopy.date_sortie).toLocaleDateString('fr-FR') : "Non définie"}</span>
                      </div>
                    </div>
                  )}

                  <h4 className="text-lg font-black text-slate-800 mb-4 mt-2">🕰️ Historique d'incidents</h4>
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
                            <div key={manq.id} className="bg-rose-50 border border-rose-100 p-2 rounded-lg flex justify-between items-center hover:border-rose-300 cursor-pointer">
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
                            <div key={rep.id} className="bg-amber-50 border border-amber-100 p-2 rounded-lg flex justify-between items-center hover:border-amber-300 cursor-pointer">
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

            <div className="bg-white p-5 md:p-6 border-t-2 border-slate-100 flex justify-between items-center shrink-0">
              {!isEditingFiche ? (
                 <button onClick={() => supprimerExemplaire(activeCopy?.id)} className="text-red-500 hover:bg-red-50 px-4 py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center gap-2">
                   🗑️ <span className="hidden sm:inline">Supprimer cet exemplaire</span>
                 </button>
              ) : <div></div>}
              
              <div className="flex gap-3">
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
        </div>
        );
      })()}
    </div>
  );
}