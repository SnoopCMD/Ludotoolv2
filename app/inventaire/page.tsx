"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import NavBar from "../../components/NavBar";

type JeuNote = { texte: string; rappel: boolean };

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
  notes?: JeuNote[] | null;
  notes_rappel?: boolean;
};

type SelectionThematique = {
  id: string;
  titre: string;
  is_permanent: boolean;
  date_fin: string | null;
  jeux: JeuType[];
};

type Alerte = {
  id: string;
  titre: string;
  description: string | null;
  type: "urgent" | "info" | "jeu";
  jeu_nom: string | null;
  statut: "active" | "resolue";
  created_at: string;
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

type TempEanItem = {
  tempEan: string;
  nom: string;
  copies: JeuType[];
  tempCat: Record<string, string | null> | null;
  match: Record<string, string | null> | null;
  newEan: string;
  status: "pending" | "done" | "skipped";
  processing: boolean;
};

const COULEURS = [
  { id: 'vert', bg: 'bg-[#baff29]', text: 'text-black', border: 'border-[#baff29]', shadow: 'shadow-[#baff29]/50', label: 'Vert', hex: '#a8e063' },
  { id: 'rose', bg: 'bg-[#f45be0]', text: 'text-white', border: 'border-[#f45be0]', shadow: 'shadow-[#f45be0]/50', label: 'Rose', hex: '#f472b6' },
  { id: 'bleu', bg: 'bg-[#6ba4ff]', text: 'text-white', border: 'border-[#6ba4ff]', shadow: 'shadow-[#6ba4ff]/50', label: 'Bleu', hex: '#60a5fa' },
  { id: 'rouge', bg: 'bg-[#ff4d79]', text: 'text-white', border: 'border-[#ff4d79]', shadow: 'shadow-[#ff4d79]/50', label: 'Rouge', hex: '#f87171' },
  { id: 'jaune', bg: 'bg-[#ffa600]', text: 'text-black', border: 'border-[#ffa600]', shadow: 'shadow-[#ffa600]/50', label: 'Jaune', hex: '#fb923c' }
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
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--cream2)", padding: "2px 8px", borderRadius: 20, border: "1.5px solid var(--ink)", flexShrink: 0 }} title={`Durée: ${duree}`}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 12 }}>
        <div style={{ width: 4, borderRadius: 2, height: 6, background: level >= 1 ? "var(--vert)" : "rgba(0,0,0,0.12)" }}></div>
        <div style={{ width: 4, borderRadius: 2, height: 9, background: level >= 2 ? "var(--yellow)" : "rgba(0,0,0,0.12)" }}></div>
        <div style={{ width: 4, borderRadius: 2, height: 12, background: level >= 3 ? "var(--rouge)" : "rgba(0,0,0,0.12)" }}></div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Outil vignettes
  const [isVignettesOpen, setIsVignettesOpen] = useState(false);
  type VignetteItem = { ean: string; nom: string };
  const [vignettesQueue, setVignettesQueue] = useState<VignetteItem[]>([]);
  const [vignettesIdx, setVignettesIdx] = useState(0);
  const [vignettesManualUrl, setVignettesManualUrl] = useState("");
  const [vignettesDone, setVignettesDone] = useState(0);

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
  const [ficheAlertes, setFicheAlertes] = useState<Alerte[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteRappel, setNewNoteRappel] = useState(false);

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

  const [isTempEanModalOpen, setIsTempEanModalOpen] = useState(false);
  const [tempEanItems, setTempEanItems] = useState<TempEanItem[]>([]);
  const [isTempLoading, setIsTempLoading] = useState(false);

  const fetchInventaire = async () => {
    setIsLoading(true);
    const { data: jeuxData, error: jeuxError } = await supabase
      .from('jeux')
      .select('id, nom, ean, code_syracuse, statut, is_double, etape_nouveaute, date_entree, date_sortie, etape_plastifier, etape_contenu, etape_etiquette, etape_equiper, etape_encoder, etape_notice, notes, notes_rappel')
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

  // --- OUTIL VIGNETTES ---
  const ouvrirVignettes = async () => {
    setIsSettingsOpen(false);
    // Trouver tous les EAN sans image (un par titre dédupliqué)
    const manquants: VignetteItem[] = [];
    const seen = new Set<string>();
    for (const j of jeux) {
      if (seen.has(j.ean)) continue;
      seen.add(j.ean);
      if (!catalogueImages[j.ean]) {
        manquants.push({ ean: j.ean, nom: j.nom });
      }
    }
    if (manquants.length === 0) {
      alert("Tous les jeux ont déjà une vignette !");
      return;
    }
    setVignettesQueue(manquants);
    setVignettesIdx(0);
    setVignettesManualUrl("");
    setVignettesDone(0);
    setIsVignettesOpen(true);
  };

  const validerVignette = async () => {
    const item = vignettesQueue[vignettesIdx];
    if (!item || !vignettesManualUrl.trim()) return;
    const url = vignettesManualUrl.trim();
    // Tenter d'abord un update (la ligne existe probablement déjà)
    const { error: errUpdate } = await supabase.from('catalogue').update({ image_url: url }).eq('ean', item.ean);
    if (errUpdate) {
      // Si update échoue, tenter un insert
      const { error: errInsert } = await supabase.from('catalogue').insert({ ean: item.ean, image_url: url });
      if (errInsert) {
        console.error('Erreur vignette:', errUpdate, errInsert);
        alert(`Erreur lors de l'enregistrement : ${errInsert.message}`);
        return;
      }
    }
    setCatalogueImages(prev => ({ ...prev, [item.ean]: url }));
    setVignettesDone(d => d + 1);
    avancerVignette();
  };

  const avancerVignette = () => {
    const nextIdx = vignettesIdx + 1;
    setVignettesManualUrl("");
    setVignettesIdx(nextIdx);
  };

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

  const detecterTempEans = async () => {
    setIsTempLoading(true);
    setIsTempEanModalOpen(true);
    setIsSettingsOpen(false);

    const isTempEan = (e: string) => /^(TEMP|SYR)-/i.test(e);

    const { data: jeuxData } = await supabase.from('jeux').select('*');
    const { data: catData } = await supabase.from('catalogue').select('*');
    if (!jeuxData || !catData) { setIsTempLoading(false); return; }

    const allCat = catData as Record<string, string | null>[];
    const realCat = allCat.filter(c => !isTempEan(c.ean ?? ""));
    const tempEans = [...new Set(jeuxData.filter(j => isTempEan(j.ean)).map(j => j.ean))];

    const items: TempEanItem[] = tempEans.map(tempEan => {
      const copies = jeuxData.filter(j => j.ean === tempEan);
      const tempCat = allCat.find(c => c.ean === tempEan) ?? null;
      const nom: string = (tempCat?.nom ?? copies[0]?.nom ?? tempEan) as string;
      const normNom = normalizeStr(nom);
      const match = realCat.find(g => {
        const n = normalizeStr(g.nom as string ?? "");
        return n === normNom || (n.length > 4 && normNom.includes(n)) || (normNom.length > 4 && n.includes(normNom));
      }) ?? null;
      return { tempEan, nom, copies, tempCat, match, newEan: (match?.ean ?? "") as string, status: "pending", processing: false };
    });

    setTempEanItems(items);
    setIsTempLoading(false);
  };

  const mergeCatFields = (real: Record<string, string | null> | null, temp: Record<string, string | null> | null) => {
    const fields = ["description", "resume", "auteurs", "auteurs_json", "boite_format", "contenu", "editeur", "couleur", "mecanique", "nb_de_joueurs", "temps_de_jeu", "etoiles", "coop_versus", "image_url"];
    const merged: Record<string, string | null> = {};
    for (const f of fields) {
      merged[f] = (real?.[f] || null) ?? (temp?.[f] || null);
    }
    return merged;
  };

  const appliquerTempAction = async (tempEan: string, realEan: string) => {
    setTempEanItems(prev => prev.map(i => i.tempEan === tempEan ? { ...i, processing: true } : i));

    const item = tempEanItems.find(i => i.tempEan === tempEan);
    if (!item) return;

    // 1. Mettre à jour les copies dans jeux
    await supabase.from('jeux').update({ ean: realEan }).eq('ean', tempEan);

    // 2. Récupérer la notice réelle existante (si elle existe)
    const { data: realCatRow } = await supabase.from('catalogue').select('*').eq('ean', realEan).maybeSingle();

    // 3. Merger ou créer la notice
    const merged = mergeCatFields(realCatRow as Record<string, string | null> | null, item.tempCat);
    const { data: existingReal } = await supabase.from('catalogue').select('ean').eq('ean', realEan).maybeSingle();
    if (existingReal) {
      await supabase.from('catalogue').update({ ...merged, nom: item.nom }).eq('ean', realEan);
    } else {
      await supabase.from('catalogue').insert([{ ...merged, ean: realEan, nom: item.nom }]);
    }

    // 4. Supprimer l'entrée catalogue temp
    await supabase.from('catalogue').delete().eq('ean', tempEan);

    setTempEanItems(prev => prev.map(i => i.tempEan === tempEan ? { ...i, status: "done", processing: false } : i));
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
    setFicheAlertes([]);
    setNewNoteText("");
    setNewNoteRappel(false);

    const copies = jeux.filter(j => j.ean === jeu.ean).sort((a, b) => Number(a.id) - Number(b.id));
    const activeIndex = copies.findIndex(c => c.id === jeu.id);

    setFicheJeu({ ...jeu, copies, activeCopyIndex: activeIndex >= 0 ? activeIndex : 0 });

    try {
      const [{ data: catData }, { data: manqData }, { data: repData }, { data: alertesData }] = await Promise.all([
        supabase.from('catalogue').select('*').eq('ean', jeu.ean).maybeSingle(),
        supabase.from('pieces_manquantes').select('*').eq('ean', jeu.ean).order('id', { ascending: false }),
        supabase.from('reparations').select('*').eq('nom_jeu', jeu.nom).order('id', { ascending: false }),
        supabase.from('alertes').select('*').eq('jeu_nom', jeu.nom).eq('statut', 'active').order('created_at', { ascending: false }),
      ]);

      setFicheAlertes((alertesData as Alerte[]) || []);
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
          pdf_url: catData?.pdf_url || "",
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

  const supprimerNote = async (index: number) => {
    if (!ficheJeu) return;
    const activeCopy = ficheJeu.copies[ficheJeu.activeCopyIndex];
    const current: JeuNote[] = (activeCopy?.notes as JeuNote[]) || [];
    const newNotes = current.filter((_, i) => i !== index);
    const newRappel = newNotes.some(n => n.rappel);
    await supabase.from('jeux').update({ notes: newNotes, notes_rappel: newRappel }).eq('id', activeCopy.id);
    const newCopies = ficheJeu.copies.map((c, i) =>
      i === ficheJeu.activeCopyIndex ? { ...c, notes: newNotes, notes_rappel: newRappel } : c
    );
    setFicheJeu({ ...ficheJeu, notes: newNotes, notes_rappel: newRappel, copies: newCopies });
  };

  const ajouterNote = async (texte: string, rappel: boolean) => {
    if (!ficheJeu || !texte.trim()) return;
    const activeCopy = ficheJeu.copies[ficheJeu.activeCopyIndex];
    const current: JeuNote[] = (activeCopy?.notes as JeuNote[]) || [];
    const newNotes = [...current, { texte: texte.trim(), rappel }];
    const newRappel = newNotes.some(n => n.rappel);
    await supabase.from('jeux').update({ notes: newNotes, notes_rappel: newRappel }).eq('id', activeCopy.id);
    const newCopies = ficheJeu.copies.map((c, i) =>
      i === ficheJeu.activeCopyIndex ? { ...c, notes: newNotes, notes_rappel: newRappel } : c
    );
    setFicheJeu({ ...ficheJeu, notes: newNotes, notes_rappel: newRappel, copies: newCopies });
  };

  const sauvegarderFicheJeu = async () => {
    if (!editedFiche) return;

    const { error: errJeux } = await supabase.from('jeux').update({
      nom: editedFiche.nom,
      ean: editedFiche.ean,
      code_syracuse: editedFiche.code_syracuse || null,
      statut: editedFiche.statut,
      is_double: editedFiche.is_double,
      etape_nouveaute: editedFiche.etape_nouveaute,
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
      pdf_url: editedFiche.pdf_url || null,
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

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 14,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>
      <NavBar current="inventaire" />

      {/* ── Sticky header ── */}
      <header style={{
        position: "sticky", top: 56, zIndex: 40, background: "var(--cream)",
        borderBottom: "2.5px solid var(--ink)",
        display: "flex", alignItems: "center", flexWrap: "wrap",
        padding: "10px 24px", gap: 12,
      }}>
        {/* Titre */}
        <div style={{ display: "flex", flexDirection: "column", marginRight: 8 }}>
          <h1 className="bc" style={{
            fontSize: 36, margin: 0, letterSpacing: "0.02em",
            background: "linear-gradient(90deg, var(--bleu), var(--purple))",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>Inventaire</h1>
          <span style={{ fontSize: 13, color: "rgba(0,0,0,0.45)", fontWeight: 600, marginTop: -2 }}>
            {jeuxEnStock.length} jeux en stock
          </span>
        </div>

        {/* Searchbar */}
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 360 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4, fontSize: 14 }}>🔍</span>
          <input
            type="text" placeholder="Chercher un jeu, code..." value={recherche}
            onChange={e => setRecherche(e.target.value)}
            style={{ ...inp, paddingLeft: 36, paddingRight: recherche ? 36 : 14, width: "100%" }}
          />
          {recherche && (
            <button onClick={() => setRecherche("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "var(--cream2)", border: "none", borderRadius: "50%",
              width: 20, height: 20, fontSize: 11, fontWeight: 800, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
          )}
        </div>

        {/* Settings button */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className="pop-btn"
            style={{
              background: isSettingsOpen ? "var(--ink)" : "var(--white)",
              color: isSettingsOpen ? "var(--white)" : "var(--ink)",
              padding: "8px 14px", fontSize: 18,
            }}
            title="Outils de maintenance"
          >
            ⚙️
          </button>
          {isSettingsOpen && (
            <div className="pop-card" style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)",
              zIndex: 50, minWidth: 240, overflow: "hidden",
            }}>
              <div style={{ padding: "8px 14px 4px", borderBottom: "1.5px solid var(--cream2)" }}>
                <span className="bc" style={{ fontSize: 11, letterSpacing: "0.08em", color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>Maintenance</span>
              </div>
              {[
                { icon: "📥", label: "Importer Syracuse", action: () => { setImportStep('upload'); setIsImportModalOpen(true); setIsSettingsOpen(false); } },
                { icon: "🧽", label: "Nettoyer Mécaniques", action: () => { nettoyerMecaniques(); } },
                { icon: "🛠️", label: "Corriger Couleurs", action: () => { setIsColorFixOpen(true); setIsSettingsOpen(false); } },
                { icon: "🔍", label: "Nettoyer Doublons", action: () => detecterDoublons() },
                { icon: "🔖", label: "EAN temporaires", action: () => detecterTempEans() },
                { icon: "🖼️", label: "Enrichir Vignettes", action: () => ouvrirVignettes() },
              ].map((item, i) => (
                <button key={i} onClick={item.action}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "10px 16px", border: "none",
                    background: "transparent", cursor: "pointer", fontFamily: "inherit",
                    fontWeight: 700, fontSize: 13, textAlign: "left",
                    borderBottom: i < 5 ? "1px solid var(--cream2)" : "none",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span>{item.icon}</span> {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: "24px 24px", display: "flex", flexDirection: "column", gap: 24, flex: 1, position: "relative", zIndex: 1 }}>

        {isLoading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <p className="bc" style={{ fontSize: 22, color: "rgba(0,0,0,0.3)", letterSpacing: "0.04em" }}>Chargement de l'inventaire…</p>
          </div>
        ) : !isListView ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

            {/* ── KPI Couleurs ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14 }}>
              {COULEURS.map(c => {
                const count = jeuxEnStock.filter(j => j.couleur === c.id).length;
                return (
                  <div key={c.id} onClick={() => setCouleurFiltre(c.id)}
                    style={{
                      background: c.hex, border: "2.5px solid var(--ink)",
                      borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)",
                      padding: "20px 12px", display: "flex", flexDirection: "column",
                      alignItems: "center", justifyContent: "center", cursor: "pointer",
                      transition: "transform 0.12s, box-shadow 0.12s",
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLElement).style.boxShadow = "6px 6px 0 var(--ink)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ""; (e.currentTarget as HTMLElement).style.boxShadow = "4px 4px 0 var(--ink)"; }}
                  >
                    <span className="bc" style={{ fontSize: 48, lineHeight: 1, color: c.id === 'vert' || c.id === 'jaune' ? "var(--ink)" : "var(--white)" }}>{count}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.08em", color: c.id === 'vert' || c.id === 'jaune' ? "var(--ink)" : "var(--white)", marginTop: 4, opacity: 0.8 }}>{c.label}</span>
                  </div>
                );
              })}
            </div>

            {/* ── 3 colonnes ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>

              {/* Nouveautés */}
              <div className="pop-card" style={{ display: "flex", flexDirection: "column", borderTop: "4px solid var(--yellow)", maxHeight: 520, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "2px solid var(--cream2)", flexShrink: 0 }}>
                  <span className="bc" style={{ fontSize: 20, letterSpacing: "0.02em" }}>Nouveautés</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {dateProchaineRotation && (
                      <span style={{ fontSize: 11, fontWeight: 800, background: "var(--rose)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 8px", boxShadow: "1px 1px 0 var(--ink)" }}>⏳ {dateProchaineRotation}</span>
                    )}
                    <Link href="/nouveautes" className="pop-btn" style={{ padding: "5px 12px", fontSize: 12, background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)" }}>Gérer</Link>
                  </div>
                </div>

                <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {nouveautesEnSalle.length === 0 ? (
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 700, fontSize: 14, textAlign: "center", padding: "20px 0" }}>Aucune nouveauté en salle.</p>
                  ) : (
                    <>
                      {/* Salle Jeux */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span className="bc" style={{ fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Salle Jeux</span>
                          <span style={{ fontSize: 11, fontWeight: 800, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{nouveautesSalleJeux.length}/12</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {Array.from({ length: 12 }).map((_, i) => {
                            const jeu = nouveautesSalleJeux[i];
                            if (jeu) {
                              const cObj = COULEURS.find(c => c.id === jeu.couleur);
                              return (
                                <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                                    border: `2px solid ${cObj ? cObj.hex : "var(--cream2)"}`,
                                    background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)",
                                  }}
                                >
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cObj ? cObj.hex : "var(--cream2)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={`empty-salle-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "2px dashed var(--cream2)", opacity: 0.5 }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--cream2)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Place disponible</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Premiers Jeux */}
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span className="bc" style={{ fontSize: 13, letterSpacing: "0.05em", textTransform: "uppercase" }}>Premiers Jeux</span>
                          <span style={{ fontSize: 11, fontWeight: 800, background: "var(--vert)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{nouveautesPremiersJeux.length}/10</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {Array.from({ length: 10 }).map((_, i) => {
                            const jeu = nouveautesPremiersJeux[i];
                            if (jeu) {
                              const cObj = COULEURS.find(c => c.id === jeu.couleur);
                              return (
                                <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 10,
                                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                                    border: `2px solid ${cObj ? cObj.hex : "var(--vert)"}`,
                                    background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)",
                                  }}
                                >
                                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: cObj ? cObj.hex : "var(--vert)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                                  <span style={{ fontWeight: 700, fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</span>
                                </div>
                              );
                            }
                            return (
                              <div key={`empty-prem-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, border: "2px dashed var(--vert)", opacity: 0.5 }}>
                                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--vert)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                                <span style={{ fontWeight: 700, fontSize: 13, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Place disponible</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Sélection */}
              <div className="pop-card" style={{ display: "flex", flexDirection: "column", borderTop: "4px solid var(--rose)", maxHeight: 520, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "2px solid var(--cream2)", flexShrink: 0 }}>
                  <span className="bc" style={{ fontSize: 20, letterSpacing: "0.02em" }}>Sélection</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    {selections.length > 0 && (
                      <button onClick={() => setIsAgrandirOpen(true)} className="pop-btn" style={{ padding: "5px 12px", fontSize: 12, background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)" }}>Agrandir</button>
                    )}
                    <button onClick={ouvrirCreationSelection} className="pop-btn pop-btn-dark" style={{ padding: "5px 12px", fontSize: 12 }}>+</button>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {selections.length === 0 ? (
                    <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", border: "2px dashed var(--cream2)", borderRadius: 10, padding: 24, textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 14 }}>
                      Créez des sélections thématiques
                    </div>
                  ) : (
                    selections.map(sel => (
                      <div key={sel.id} onClick={() => ouvrirModificationSelection(sel)}
                        style={{
                          border: "2px solid var(--ink)", borderRadius: 10,
                          background: "var(--white)", boxShadow: "3px 3px 0 var(--ink)",
                          padding: "12px 14px", cursor: "pointer",
                          display: "flex", flexDirection: "column", gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontWeight: 800, fontSize: 14, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.titre}</p>
                            <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>
                              {sel.is_permanent ? "Permanente" : `Jusqu'au ${sel.date_fin ? new Date(sel.date_fin).toLocaleDateString('fr-FR') : '?'}`}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 800, background: "var(--rose)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px", flexShrink: 0 }}>{sel.jeux?.length || 0}</span>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {sel.jeux?.slice(0, 4).map(j => {
                            const c = COULEURS.find(col => col.id === j.couleur);
                            return (
                              <div key={j.id} onClick={e => { e.stopPropagation(); ouvrirFicheJeu(j); }}
                                style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: "var(--cream2)", borderRadius: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: "50%", background: c ? c.hex : "var(--cream2)", border: "1px solid var(--ink)", flexShrink: 0 }}></div>
                                <span style={{ fontSize: 11, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.nom}</span>
                              </div>
                            );
                          })}
                          {(sel.jeux?.length || 0) > 4 && <span style={{ fontSize: 10, color: "rgba(0,0,0,0.4)", fontWeight: 700, paddingLeft: 8 }}>+{(sel.jeux?.length || 0) - 4} autres</span>}
                          {(!sel.jeux || sel.jeux.length === 0) && <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Sélection vide</span>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Atelier */}
              <div className="pop-card" style={{ display: "flex", flexDirection: "column", borderTop: "4px solid var(--orange)", maxHeight: 520, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 12px", borderBottom: "2px solid var(--cream2)", flexShrink: 0 }}>
                  <span className="bc" style={{ fontSize: 20, letterSpacing: "0.02em" }}>Atelier</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, background: "var(--orange)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px", boxShadow: "1px 1px 0 var(--ink)" }}>Total: {totalAtelier}</span>
                    <Link href="/atelier" className="pop-btn" style={{ padding: "5px 12px", fontSize: 12, background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)" }}>Voir tout</Link>
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {atelierEnPrepa.length === 0 && <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 700, fontSize: 14 }}>Aucun jeu en préparation.</p>}
                  {atelierEnPrepa.map(jeu => {
                    const cObj = COULEURS.find(c => c.id === jeu.couleur);
                    return (
                      <div key={jeu.id} onClick={() => ouvrirFicheJeu(jeu)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          border: `2px solid ${cObj ? cObj.hex : "var(--ink)"}`,
                          background: "var(--white)", boxShadow: "2px 2px 0 var(--ink)",
                        }}
                      >
                        <div style={{ width: 12, height: 12, borderRadius: "50%", background: cObj ? cObj.hex : "var(--cream2)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", flex: 1 }}>
                          <span style={{ fontWeight: 700, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</span>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "var(--orange)", textTransform: "uppercase", letterSpacing: "0.05em" }}>En prépa</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

        ) : (
          /* ── LIST VIEW ── */
          <div className="pop-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", borderTop: couleurFiltre ? `4px solid ${COULEURS.find(c => c.id === couleurFiltre)?.hex || "var(--ink)"}` : "4px solid var(--ink)" }}>

            {/* Barre filtres */}
            <div style={{ background: "var(--cream2)", borderBottom: "2.5px solid var(--ink)", padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
              {couleurFiltre && (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.55)" }}>Filtré :</span>
                    <span style={{
                      fontSize: 12, fontWeight: 800, textTransform: "uppercase",
                      background: COULEURS.find(c => c.id === couleurFiltre)?.hex || "var(--cream2)",
                      color: couleurFiltre === 'vert' || couleurFiltre === 'jaune' ? "var(--ink)" : "var(--white)",
                      border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px", boxShadow: "1px 1px 0 var(--ink)",
                    }}>{couleurFiltre}</span>
                  </div>
                  <button onClick={() => setCouleurFiltre(null)} className="pop-btn" style={{ padding: "5px 12px", fontSize: 12 }}>✕ Retirer</button>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <button onClick={() => setTri(tri === "A-Z" ? "Z-A" : "A-Z")} className="pop-btn" style={{ padding: "6px 14px", fontSize: 13 }}>
                  Nom {tri === "A-Z" ? "↓" : "↑"}
                </button>
                <input type="number" min="1" max="99" placeholder="👥 Joueurs" value={filtreJoueurs} onChange={e => setFiltreJoueurs(e.target.value)} style={{ ...inp, width: 110 }} />
                <select value={filtreType} onChange={e => setFiltreType(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  <option value="">⚔️ Type</option><option value="Coop">🤝 Coop</option><option value="Versus">⚔️ Versus</option><option value="Solo">👤 Solo</option>
                </select>
                <select value={filtreMeca} onChange={e => setFiltreMeca(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  <option value="">⚙️ Méca.</option>
                  {mecasDispos.map(m => <option key={m as string} value={m as string}>{m}</option>)}
                </select>
                <select value={filtreTemps} onChange={e => setFiltreTemps(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  <option value="">⏳ Durée</option><option value="Rapide">Rapide (&lt;30m)</option><option value="Moyen">Moyen (30-60m)</option><option value="Long">Long (&gt;60m)</option>
                </select>
                <select value={filtreEtoiles} onChange={e => setFiltreEtoiles(e.target.value)} style={{ ...inp, width: "auto", cursor: "pointer" }}>
                  <option value="">⭐ Étoiles</option><option value="1">1 Étoile</option><option value="2">2 Étoiles</option><option value="3">3 Étoiles</option>
                </select>
                {(filtreJoueurs || filtreMeca || filtreTemps || filtreEtoiles || filtreType) && (
                  <button onClick={clearAllFilters} className="pop-btn" style={{ padding: "6px 10px", fontSize: 12, background: "var(--rouge)", color: "var(--white)" }}>✕ Reset</button>
                )}
                <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{jeuxGroupes.length} résultat{jeuxGroupes.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Rows */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px" }}>
              {jeuxGroupes.length === 0 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", color: "rgba(0,0,0,0.3)" }}>
                  <span style={{ fontSize: 40, marginBottom: 12 }}>🤔</span>
                  <p style={{ fontWeight: 700, fontSize: 16 }}>Aucun jeu ne correspond à vos filtres.</p>
                </div>
              ) : (
                jeuxGroupes.map(groupe => {
                  const jeu = groupe[0];
                  const couleurObj = COULEURS.find(c => c.id === jeu.couleur);
                  const estDeplie = groupesDeplies[jeu.ean];
                  const hasCopies = groupe.length > 1;
                  const hasNotes = groupe.some(j => j.notes && (j.notes as any[]).length > 0);

                  return (
                    <div key={jeu.ean} style={{ marginBottom: 10, border: "2.5px solid var(--ink)", borderRadius: 10, background: "var(--white)", boxShadow: "3px 3px 0 var(--ink)", overflow: "hidden" }}>
                      <div
                        onClick={() => ouvrirFicheJeu(jeu)}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}
                      >
                        {/* Vignette */}
                        <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", flexShrink: 0, border: "2px solid var(--ink)", background: couleurObj ? couleurObj.hex : "var(--cream2)" }}>
                          {catalogueImages[jeu.ean]
                            ? <img src={catalogueImages[jeu.ean]} alt={jeu.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                            : null
                          }
                        </div>

                        {/* Info principale */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: couleurObj ? couleurObj.hex : "var(--cream2)", border: "1.5px solid var(--ink)", flexShrink: 0 }}></div>
                            <span style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</span>
                            {hasCopies && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{groupe.length} EX</span>}
                            {hasNotes && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--yellow)", border: "1px solid var(--ink)", flexShrink: 0 }} title="Commentaires"></span>}
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                            {jeu.mecanique && <span className="pop-tag" style={{ background: "var(--cream2)" }}>{jeu.mecanique}</span>}
                            {jeu.coop_versus && <span className="pop-tag" style={{ background: "var(--bleu)", color: "var(--white)" }}>{jeu.coop_versus === 'Coop' ? '🤝 Coop' : jeu.coop_versus === 'Solo' ? '👤 Solo' : '⚔️ Versus'}</span>}
                            {jeu.nb_de_joueurs && <span className="pop-tag" style={{ background: "var(--cream2)" }}>👥 {jeu.nb_de_joueurs}</span>}
                            {jeu.etoiles && <span className="pop-tag" style={{ background: "var(--yellow)" }}>⭐ {jeu.etoiles}</span>}
                            <DureeGauge duree={jeu.temps_de_jeu} />
                          </div>
                        </div>

                        {/* EAN */}
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "rgba(0,0,0,0.35)", flexShrink: 0 }}>{jeu.ean}</span>

                        {/* Statut */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end", flexShrink: 0 }}>
                          {!hasCopies ? (
                            <>
                              <span style={{
                                fontSize: 11, fontWeight: 800, textTransform: "uppercase",
                                background: jeu.statut === 'En stock' ? "var(--vert)" : jeu.statut === 'En préparation' ? "var(--orange)" : "var(--cream2)",
                                color: "var(--ink)", border: "1.5px solid var(--ink)",
                                borderRadius: 20, padding: "2px 8px", boxShadow: "1px 1px 0 var(--ink)",
                              }}>{jeu.statut}</span>
                              {jeu.statut === 'En préparation' && (
                                <div style={{ width: 60, background: "var(--cream2)", borderRadius: 4, height: 5, overflow: "hidden", border: "1px solid var(--ink)" }}>
                                  <div style={{ height: "100%", background: "var(--orange)", borderRadius: 4, width: `${getProgression(jeu)}%` }}></div>
                                </div>
                              )}
                              {jeu.statut === 'En stock' && jeu.etape_nouveaute && (
                                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ink)" }}>🌟 Nouveauté</span>
                              )}
                            </>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: 11, fontWeight: 800 }}>
                              {groupe.filter(g => g.statut === 'En stock').length > 0 && <span style={{ color: "#16a34a" }}>{groupe.filter(g => g.statut === 'En stock').length} en stock</span>}
                              {groupe.filter(g => g.statut === 'En préparation').length > 0 && <span style={{ color: "var(--orange)" }}>{groupe.filter(g => g.statut === 'En préparation').length} en prépa</span>}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {hasCopies && (
                            <button onClick={e => { e.stopPropagation(); toggleGroupe(jeu.ean); }}
                              style={{ padding: "5px 10px", borderRadius: 6, border: "2px solid var(--ink)", background: "var(--cream2)", fontWeight: 800, fontSize: 13, cursor: "pointer", boxShadow: "1px 1px 0 var(--ink)" }}>
                              {estDeplie ? "▲" : "▼"}
                            </button>
                          )}
                          <Link href={`/catalogage?ean=${jeu.ean}`} onClick={e => e.stopPropagation()}
                            style={{ padding: "5px 10px", borderRadius: 6, border: "2px solid var(--ink)", background: "var(--cream2)", fontWeight: 800, fontSize: 13, cursor: "pointer", textDecoration: "none", color: "var(--ink)", boxShadow: "1px 1px 0 var(--ink)" }}>
                            📋
                          </Link>
                        </div>
                      </div>

                      {hasCopies && estDeplie && (
                        <div style={{ background: "var(--cream2)", borderTop: "2px solid var(--ink)", padding: 12, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 8 }}>
                          {groupe.map((copy, idx) => (
                            <div key={copy.id} onClick={() => ouvrirFicheJeu(copy)}
                              style={{ background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 8, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontWeight: 800, fontSize: 13 }}>Ex. {idx + 1}</span>
                                {copy.code_syracuse && <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,0,0,0.4)" }}>{copy.code_syracuse}</span>}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", background: copy.statut === 'En stock' ? "var(--vert)" : "var(--orange)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{copy.statut}</span>
                                {copy.statut === 'En préparation' && (
                                  <div style={{ width: 40, background: "var(--cream2)", borderRadius: 4, height: 4, overflow: "hidden", border: "1px solid var(--ink)" }}>
                                    <div style={{ height: "100%", background: "var(--orange)", width: `${getProgression(copy)}%` }}></div>
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

      {/* --- MODAL COLORFIX --- */}
      {isColorFixOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 560, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Scanner Correctif Couleurs</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>Attribue rapidement une couleur à des EAN.</p>
              </div>
              <button onClick={() => setIsColorFixOpen(false)} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <p className="bc" style={{ fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>1. Choisir la couleur</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {COULEURS.map(c => (
                    <button key={c.id}
                      onClick={() => { setColorFixSelected(c.id); document.getElementById('color-fix-scanner')?.focus(); }}
                      style={{
                        padding: "8px 16px", borderRadius: 8, fontWeight: 800, textTransform: "uppercase", fontSize: 13,
                        border: "2.5px solid var(--ink)", cursor: "pointer", fontFamily: "inherit",
                        background: colorFixSelected === c.id ? c.hex : "var(--white)",
                        boxShadow: colorFixSelected === c.id ? "3px 3px 0 var(--ink)" : "none",
                        transform: colorFixSelected === c.id ? "translate(-1px,-1px)" : "none",
                        transition: "all 0.1s",
                      }}>{c.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="bc" style={{ fontSize: 14, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10 }}>2. Scanner les EAN</p>
                <input
                  id="color-fix-scanner" type="text" value={colorFixEan}
                  onChange={e => setColorFixEan(e.target.value)} onKeyDown={handleColorFixScan}
                  placeholder={colorFixSelected ? "Scannez un code-barres..." : "Choisissez une couleur d'abord"}
                  disabled={!colorFixSelected} autoFocus
                  style={{ ...inp, fontSize: 16, fontFamily: "monospace", opacity: !colorFixSelected ? 0.5 : 1 }}
                />
              </div>
              <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 10, padding: 14, minHeight: 120, maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {colorFixLogs.length === 0 ? (
                  <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 700, fontStyle: "italic", textAlign: "center", paddingTop: 24, fontSize: 13 }}>Aucun scan effectué.</p>
                ) : colorFixLogs.map((log, i) => (
                  <div key={i} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700, background: log.isError ? "#fff0f0" : "var(--white)", border: `1.5px solid ${log.isError ? "var(--rouge)" : "var(--ink)"}`, color: log.isError ? "var(--rouge)" : "var(--ink)" }}>
                    {log.msg}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL MÉCANIQUES --- */}
      {isMecaFixModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 720, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Nettoyage des Mécaniques</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>{jeuxMecaInvalides.length} jeux à corriger</p>
              </div>
              <button onClick={() => setIsMecaFixModalOpen(false)} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 10, background: "var(--cream2)" }}>
              {jeuxMecaInvalides.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(0,0,0,0.35)" }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>✨</span>
                  <p style={{ fontWeight: 700, fontSize: 18 }}>Tout est parfait !</p>
                </div>
              ) : jeuxMecaInvalides.map(jeu => (
                <div key={jeu.ean} className="pop-card" style={{ padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 800, fontSize: 15, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</p>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: "3px 0 0" }}>
                      Actuelle : <span style={{ fontWeight: 800, color: "var(--rouge)" }}>{jeu.mecanique || "Vide"}</span>
                    </p>
                  </div>
                  <select value={mecaUpdates[jeu.ean] !== undefined ? mecaUpdates[jeu.ean] : (jeu.mecanique || "")}
                    onChange={e => setMecaUpdates({ ...mecaUpdates, [jeu.ean]: e.target.value })}
                    style={{ ...inp, width: 220, cursor: "pointer" }}>
                    <option value="">-- Conserver --</option>
                    {MECANIQUES_OFFICIELLES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {jeuxMecaInvalides.length > 0 && (
              <div style={{ padding: "14px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => setIsMecaFixModalOpen(false)} disabled={isFixingMeca} className="pop-btn" style={{ background: "var(--cream2)" }}>Annuler</button>
                <button onClick={validerCorrectionsMeca} disabled={isFixingMeca || Object.keys(mecaUpdates).length === 0} className="pop-btn pop-btn-dark" style={{ opacity: (isFixingMeca || Object.keys(mecaUpdates).length === 0) ? 0.4 : 1 }}>
                  <span className="bc" style={{ fontSize: 15 }}>{isFixingMeca ? "Mise à jour…" : `Enregistrer (${Object.values(mecaUpdates).filter(v => v !== "").length})`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL DOUBLONS --- */}
      {isDoublonsModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 800, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Nettoyage des Doublons</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>
                  {doublonGroupes.length === 0 ? "Aucun doublon détecté." : `${doublonGroupes.length} jeu(x) · ${doublonsSelectionnes.length} sélectionné(s) pour suppression`}
                </p>
              </div>
              <button onClick={() => setIsDoublonsModalOpen(false)} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 16, background: "var(--cream2)", display: "flex", flexDirection: "column", gap: 12 }}>
              {doublonGroupes.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(0,0,0,0.35)" }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>✨</span>
                  <p style={{ fontWeight: 700, fontSize: 18 }}>Aucun doublon trouvé !</p>
                </div>
              ) : doublonGroupes.map(groupe => {
                const tousSupprimes = groupe.exemplaires.every(ex => doublonsSelectionnes.includes(ex.id));
                return (
                  <div key={groupe.ean} className="pop-card" style={{ overflow: "hidden" }}>
                    <div style={{ padding: "10px 16px", borderBottom: "2px solid var(--ink)", background: "var(--cream2)" }}>
                      <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>{groupe.nom}</p>
                      <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", margin: "2px 0 0" }}>{groupe.exemplaires.length} exemplaires · EAN {groupe.ean}</p>
                      {tousSupprimes && <p style={{ fontSize: 11, fontWeight: 800, color: "var(--rouge)", margin: "4px 0 0" }}>⚠️ Tous les exemplaires sélectionnés</p>}
                    </div>
                    {groupe.exemplaires.map(ex => {
                      const isSuggere = groupe.suggeresIds.includes(ex.id);
                      const isChecked = doublonsSelectionnes.includes(ex.id);
                      return (
                        <div key={String(ex.id)} onClick={() => {
                          if (isChecked) setDoublonsSelectionnes(prev => prev.filter(id => id !== ex.id));
                          else setDoublonsSelectionnes(prev => [...prev, ex.id]);
                        }}
                          style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 16px", cursor: "pointer", borderBottom: "1px solid var(--cream2)", background: isChecked ? "#fff0f0" : "var(--white)" }}
                          onMouseEnter={e => { if (!isChecked) (e.currentTarget as HTMLElement).style.background = "var(--cream2)"; }}
                          onMouseLeave={e => { if (!isChecked) (e.currentTarget as HTMLElement).style.background = "var(--white)"; }}
                        >
                          <input type="checkbox" checked={isChecked} readOnly style={{ marginTop: 2, flexShrink: 0, accentColor: "var(--rouge)" }} />
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 700, margin: 0 }}>{ex.nom} <span style={{ color: "rgba(0,0,0,0.3)", fontWeight: 400 }}>· #{ex.id}</span></p>
                            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              {ex.code_syracuse
                                ? <span style={{ fontSize: 11, fontWeight: 800, background: "var(--vert)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>✓ {ex.code_syracuse}</span>
                                : <span style={{ fontSize: 11, fontWeight: 800, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>✗ Sans code Syracuse</span>
                              }
                              <span style={{ fontSize: 11, fontWeight: 700, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>{ex.statut}</span>
                              {isSuggere && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--orange)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>Suggéré</span>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            {doublonGroupes.length > 0 && (
              <div style={{ padding: "14px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => setIsDoublonsModalOpen(false)} disabled={isDeletingDoublons} className="pop-btn" style={{ background: "var(--cream2)" }}>Annuler</button>
                <button onClick={supprimerDoublonsSelectionnes} disabled={isDeletingDoublons || doublonsSelectionnes.length === 0} className="pop-btn" style={{ background: "var(--rouge)", color: "var(--white)", opacity: (isDeletingDoublons || doublonsSelectionnes.length === 0) ? 0.4 : 1 }}>
                  <span className="bc" style={{ fontSize: 15 }}>{isDeletingDoublons ? "Suppression…" : `Supprimer (${doublonsSelectionnes.length})`}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL EAN TEMPORAIRES --- */}
      {isTempEanModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 720, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>EAN Temporaires</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>
                  {isTempLoading ? "Analyse en cours…" : `${tempEanItems.filter(i => i.status === "pending").length} jeu(x) à traiter`}
                </p>
              </div>
              <button onClick={() => setIsTempEanModalOpen(false)} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: 16, background: "var(--cream2)", display: "flex", flexDirection: "column", gap: 12 }}>
              {isTempLoading ? (
                <div style={{ textAlign: "center", padding: "60px 0" }}>
                  <p className="bc" style={{ fontSize: 18, color: "rgba(0,0,0,0.3)" }}>Chargement…</p>
                </div>
              ) : tempEanItems.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(0,0,0,0.35)" }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>✨</span>
                  <p style={{ fontWeight: 700, fontSize: 18 }}>Aucun EAN temporaire !</p>
                </div>
              ) : tempEanItems.map(item => (
                <div key={item.tempEan} className="pop-card" style={{ opacity: item.status !== "pending" ? 0.45 : 1, overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "2px solid var(--ink)", background: "var(--cream2)" }}>
                    <div>
                      <p style={{ fontWeight: 800, fontSize: 15, margin: 0 }}>{item.nom}</p>
                      <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,0,0,0.4)", margin: "2px 0 0" }}>{item.tempEan} · {item.copies.length} ex.</p>
                    </div>
                    {item.status === "done" && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--vert)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px" }}>✓ Traité</span>}
                    {item.status === "skipped" && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px" }}>Ignoré</span>}
                  </div>
                  {item.status === "pending" && (
                    <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      {item.match ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: "#f0fff4", border: "2px solid var(--vert)", borderRadius: 8, padding: "10px 14px" }}>
                          <div>
                            <p style={{ fontSize: 11, fontWeight: 800, color: "var(--ink)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>Correspondance</p>
                            <p style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>{item.match.nom as string}</p>
                            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,0,0,0.4)", margin: "2px 0 0" }}>{item.match.ean as string}</p>
                          </div>
                          <button onClick={() => appliquerTempAction(item.tempEan, item.match!.ean as string)} disabled={item.processing} className="pop-btn pop-btn-dark" style={{ flexShrink: 0, opacity: item.processing ? 0.5 : 1 }}>
                            {item.processing ? "…" : "Fusionner"}
                          </button>
                        </div>
                      ) : (
                        <p style={{ fontSize: 12, fontWeight: 700, background: "#fffbeb", border: "2px solid var(--yellow)", borderRadius: 8, padding: "8px 12px", color: "var(--ink)" }}>⚠️ Aucune correspondance — saisir l'EAN manuellement</p>
                      )}
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input type="text" value={item.newEan}
                          onChange={e => setTempEanItems(prev => prev.map(i => i.tempEan === item.tempEan ? { ...i, newEan: e.target.value } : i))}
                          placeholder="EAN réel (ex: 3760146642399)"
                          style={{ ...inp, flex: 1, fontFamily: "monospace" }} />
                        <button onClick={() => appliquerTempAction(item.tempEan, item.newEan)} disabled={item.processing || !item.newEan.trim()} className="pop-btn pop-btn-dark" style={{ flexShrink: 0, opacity: (!item.newEan.trim() || item.processing) ? 0.4 : 1 }}>
                          {item.processing ? "…" : "Réassigner"}
                        </button>
                        <button onClick={() => setTempEanItems(prev => prev.map(i => i.tempEan === item.tempEan ? { ...i, status: "skipped" } : i))} className="pop-btn" style={{ flexShrink: 0, background: "var(--cream2)" }}>
                          Ignorer
                        </button>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {item.copies.map(c => (
                          <span key={String(c.id)} style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: "var(--cream2)", border: "1.5px solid var(--ink)" }}>
                            #{c.id} · {c.statut}{c.code_syracuse ? ` · ${c.code_syracuse}` : ""}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>
                {tempEanItems.filter(i => i.status === "done").length} traité(s) · {tempEanItems.filter(i => i.status === "skipped").length} ignoré(s)
              </span>
              <button onClick={() => setIsTempEanModalOpen(false)} className="pop-btn" style={{ background: "var(--cream2)" }}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL VIGNETTES --- */}
      {isVignettesOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 480, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Enrichir les Vignettes</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>
                  {vignettesIdx < vignettesQueue.length
                    ? `${vignettesIdx + 1} / ${vignettesQueue.length} · ${vignettesDone} validée(s)`
                    : `Terminé · ${vignettesDone} vignette(s) ajoutée(s)`}
                </p>
              </div>
              <button onClick={() => setIsVignettesOpen(false)} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {vignettesIdx >= vignettesQueue.length ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0", textAlign: "center" }}>
                  <span style={{ fontSize: 48 }}>✅</span>
                  <p className="bc" style={{ fontSize: 24, margin: 0 }}>Enrichissement terminé</p>
                  <p style={{ color: "rgba(0,0,0,0.4)", fontWeight: 600, fontSize: 14 }}>
                    {vignettesDone} ajoutée(s) · {vignettesQueue.length - vignettesDone} ignorée(s)
                  </p>
                  <button onClick={() => setIsVignettesOpen(false)} className="pop-btn pop-btn-dark" style={{ marginTop: 8, padding: "10px 24px" }}>Fermer</button>
                </div>
              ) : (
                <>
                  <div style={{ width: "100%", textAlign: "center" }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Jeu en cours</p>
                    <p style={{ fontWeight: 800, fontSize: 18, margin: 0 }}>{vignettesQueue[vignettesIdx]?.nom}</p>
                    <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,0,0,0.4)", marginTop: 3 }}>{vignettesQueue[vignettesIdx]?.ean}</p>
                  </div>
                  <button onClick={() => navigator.clipboard.writeText(vignettesQueue[vignettesIdx]?.ean ?? "")}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", borderRadius: 8, background: "var(--cream2)", border: "2px solid var(--ink)", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)" }}>
                    <span style={{ fontFamily: "monospace" }}>{vignettesQueue[vignettesIdx]?.ean}</span>
                    <span style={{ fontSize: 11, color: "rgba(0,0,0,0.4)" }}>Copier</span>
                  </button>
                  <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 160, height: 160, borderRadius: 10, border: "2.5px solid var(--ink)", background: "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", boxShadow: "3px 3px 0 var(--ink)" }}>
                      {vignettesManualUrl.trim() ? (
                        <img src={vignettesManualUrl.trim()} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "contain" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, opacity: 0.3 }}>
                          <span style={{ fontSize: 32 }}>🖼️</span>
                          <p style={{ fontSize: 11, fontWeight: 700 }}>Colle l'URL</p>
                        </div>
                      )}
                    </div>
                    <input type="url" placeholder="https://s.myludo.fr/images/jeux/…" value={vignettesManualUrl} onChange={e => setVignettesManualUrl(e.target.value)} style={{ ...inp, fontFamily: "monospace" }} />
                    <p style={{ fontSize: 11, color: "rgba(0,0,0,0.4)", fontWeight: 600, textAlign: "center" }}>
                      Sur MyLudo, clic droit sur la cover → <em>Copier le lien de l'image</em>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 10, width: "100%" }}>
                    <button onClick={avancerVignette} className="pop-btn" style={{ flex: 1, background: "var(--cream2)", justifyContent: "center" }}>Ignorer →</button>
                    <button onClick={validerVignette} disabled={!vignettesManualUrl.trim()} className="pop-btn pop-btn-dark" style={{ flex: 1, justifyContent: "center", opacity: !vignettesManualUrl.trim() ? 0.4 : 1 }}>✓ Valider</button>
                  </div>
                </>
              )}
            </div>
            {vignettesQueue.length > 0 && (
              <div style={{ padding: "0 24px 20px", flexShrink: 0 }}>
                <div style={{ width: "100%", background: "var(--cream2)", borderRadius: 4, height: 6, overflow: "hidden", border: "1.5px solid var(--ink)" }}>
                  <div style={{ height: "100%", background: "var(--ink)", borderRadius: 4, transition: "width 0.3s", width: `${(vignettesIdx / vignettesQueue.length) * 100}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL IMPORT SYRACUSE --- */}
      {isImportModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 860, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Importation Syracuse</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>
                  {importStep === 'upload' ? "Fichier UNIMARC ou CSV catalogue/cotes" : `${importData.length} jeux détectés`}
                </p>
              </div>
              <button onClick={() => { setIsImportModalOpen(false); setImportStep('upload'); setImportData([]); }} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "var(--cream2)" }}>
              {importStep === 'upload' && (
                <div
                  onClick={() => document.getElementById('smart-import-file')?.click()}
                  style={{
                    border: "3px dashed var(--ink)", borderRadius: 10, background: "var(--white)",
                    padding: "60px 20px", display: "flex", flexDirection: "column", alignItems: "center",
                    justifyContent: "center", textAlign: "center", cursor: "pointer", minHeight: 280,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}
                >
                  <span style={{ fontSize: 48, marginBottom: 16 }}>📂</span>
                  <h3 className="bc" style={{ fontSize: 24, margin: "0 0 10px" }}>Sélectionnez vos fichiers</h3>
                  <p style={{ color: "rgba(0,0,0,0.55)", fontWeight: 600, fontSize: 14, maxWidth: 420, lineHeight: 1.6 }}>
                    <b>Fichier UNIMARC (.mrc / .iso)</b> pour les étiquettes.<br/>
                    Ou <b>Catalogue CSV</b> + <b>Cotes CSV</b> pour un import standard.
                  </p>
                  <button className="pop-btn pop-btn-dark" style={{ marginTop: 24, padding: "10px 24px" }}>Parcourir les fichiers</button>
                  <input id="smart-import-file" type="file" multiple accept=".csv,.mrc,.iso,.txt" style={{ display: "none" }} onChange={e => { if (e.target.files) handleSmartImport(e.target.files); }} />
                </div>
              )}
              {importStep === 'preview' && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {importData.map((item, idx) => {
                    const colorObj = COULEURS.find(c => c.id === item.couleur);
                    const borderColor = item.matchType === 'conflict' ? "var(--orange)" : item.matchType === 'suggested_link' ? "var(--bleu)" : item.matchType === 'auto_fill' ? "var(--vert)" : "var(--ink)";
                    const bgColor = item.matchType === 'conflict' ? "#fff8f0" : item.matchType === 'auto_fill' ? "#f0fff4" : "var(--white)";
                    return (
                      <div key={idx} style={{ background: bgColor, border: `2px solid ${borderColor}`, borderRadius: 10, padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, boxShadow: "2px 2px 0 var(--ink)" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ width: 44, height: 44, borderRadius: 8, border: "2px solid var(--ink)", background: "var(--cream2)", overflow: "hidden", flexShrink: 0, position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {item.image_url ? <img src={item.image_url} alt="Cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 20 }}>🖼️</span>}
                            {colorObj && <div style={{ position: "absolute", top: -3, right: -3, width: 12, height: 12, borderRadius: "50%", background: colorObj.hex, border: "1.5px solid var(--ink)" }}></div>}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, fontSize: 15 }}>{item.titre}</span>
                              {item.matchType === 'new' && <span style={{ fontSize: 10, fontWeight: 800, background: "var(--ink)", color: "var(--white)", borderRadius: 20, padding: "1px 7px", textTransform: "uppercase" }}>Nouveau</span>}
                              {item.matchType === 'auto_fill' && <span style={{ fontSize: 10, fontWeight: 800, background: "var(--vert)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px", textTransform: "uppercase" }}>Complété</span>}
                            </div>
                            {!item.isUpdateOnly && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", fontWeight: 600, margin: "2px 0 0" }}>{item.editeur} · {item.auteurs}</p>}
                          </div>
                          <div style={{ display: "flex", gap: 14, alignItems: "center", flexShrink: 0 }}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>EAN</span>
                              <span style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 12, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 6, padding: "1px 6px" }}>{item.ean}</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                              <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Syracuse</span>
                              {item.codes.length > 0 ? (
                                <span style={{ fontSize: 12, fontWeight: 800, background: "var(--bleu)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>{item.codes.length} Ex.</span>
                              ) : <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.3)", fontStyle: "italic" }}>Aucun</span>}
                            </div>
                          </div>
                        </div>
                        {item.matchType === 'suggested_link' && (
                          <div style={{ background: "#eff6ff", border: "2px solid var(--bleu)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                              <span style={{ fontWeight: 800, color: "var(--bleu)" }}>Suggestion :</span> &quot;{item.existingNom}&quot; existe. Lier ?
                            </div>
                            <select value={item.userChoice} onChange={e => toggleChoice(idx, e.target.value as any)}
                              style={{ ...inp, width: "auto", cursor: "pointer", border: "2px solid var(--bleu)", fontSize: 13 }}>
                              <option value="link">Oui, lier (EAN: {item.existingEan})</option>
                              <option value="create">Non, créer nouveau</option>
                            </select>
                          </div>
                        )}
                        {item.matchType === 'conflict' && (
                          <div style={{ background: "#fff8f0", border: "2px solid var(--orange)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 13 }}>
                              <span style={{ fontWeight: 800, color: "var(--orange)" }}>⚠️ Conflit :</span>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 5 }}>
                                {item.diffs?.map(d => <span key={d.field} style={{ fontSize: 12, fontWeight: 600 }}><b>{d.label}</b> : &quot;{d.old}&quot; → &quot;{d.new}&quot;</span>)}
                              </div>
                            </div>
                            <select value={item.userChoice} onChange={e => toggleChoice(idx, e.target.value as any)}
                              style={{ ...inp, width: "auto", cursor: "pointer", border: "2px solid var(--orange)", fontSize: 13 }}>
                              <option value="keep_old">Garder l'existant</option>
                              <option value="overwrite">Écraser</option>
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
              <div style={{ padding: "14px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <button onClick={() => { setImportStep('upload'); setImportData([]); }} disabled={isImporting} className="pop-btn" style={{ background: "var(--cream2)" }}>Annuler</button>
                <button onClick={validerImport} disabled={isImporting} className="pop-btn" style={{ background: "var(--yellow)", opacity: isImporting ? 0.5 : 1 }}>
                  <span className="bc" style={{ fontSize: 15 }}>{isImporting ? "Importation…" : "Valider l'importation"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL SÉLECTION --- */}
      {isSelectionModalOpen && editSelection && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 70, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 720, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>
                {editSelection.titre ? "Modifier la sélection" : "Nouvelle sélection"}
              </h2>
              <button onClick={() => setIsSelectionModalOpen(false)} className="pop-btn" style={{ padding: "6px 12px", fontSize: 13 }}>✕ Fermer</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.5)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 6 }}>Titre</label>
                  <input type="text" value={editSelection.titre} onChange={e => setEditSelection({ ...editSelection, titre: e.target.value })}
                    placeholder="Ex: Soirée Frissons..." style={{ ...inp, fontWeight: 700, fontSize: 16 }} />
                </div>
                <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 10, padding: 14, minWidth: 200 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 8, fontWeight: 700 }}>
                    <input type="checkbox" checked={editSelection.is_permanent} onChange={e => setEditSelection({ ...editSelection, is_permanent: e.target.checked, date_fin: e.target.checked ? null : editSelection.date_fin })} style={{ accentColor: "var(--ink)", width: 16, height: 16 }} />
                    Permanente
                  </label>
                  {!editSelection.is_permanent && (
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 4 }}>Date de fin</label>
                      <input type="date" value={editSelection.date_fin || ""} onChange={e => setEditSelection({ ...editSelection, date_fin: e.target.value })} style={{ ...inp, fontSize: 13 }} />
                    </div>
                  )}
                </div>
              </div>

              <div style={{ height: 2, background: "var(--cream2)", borderRadius: 1 }}></div>

              <div>
                <p className="bc" style={{ fontSize: 18, letterSpacing: "0.02em", marginBottom: 14 }}>Ajouter des jeux</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Scanner Syracuse / EAN</label>
                    <input type="text" placeholder="Scanner et Entrée…" value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={handleScanSyracuseList}
                      style={{ ...inp, fontFamily: "monospace", background: "#f4fce3", border: "2px solid var(--vert)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 5 }}>Recherche manuelle</label>
                    <input type="text" placeholder="Chercher par nom…" value={rechercheAjout} onChange={e => setRechercheAjout(e.target.value)} style={inp} />
                    {rechercheAjout && (
                      <div className="pop-card" style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20, overflow: "hidden" }}>
                        {resultatsRechercheAjout.map(j => (
                          <div key={j.id} onClick={() => ajouterJeuSelection(j)}
                            style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--cream2)", cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "var(--white)")}
                          >
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{j.nom}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, background: "var(--ink)", color: "var(--white)", borderRadius: 4, padding: "2px 6px" }}>Ajouter</span>
                          </div>
                        ))}
                        {resultatsRechercheAjout.length === 0 && <div style={{ padding: "10px 14px", fontSize: 13, color: "rgba(0,0,0,0.35)", fontWeight: 700, textAlign: "center" }}>Aucun résultat</div>}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 10, padding: 14, minHeight: 120 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Dans la sélection ({editSelection.jeux?.length || 0})</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {(editSelection.jeux?.length || 0) === 0 ? (
                      <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", fontStyle: "italic", textAlign: "center", padding: "12px 0" }}>Scannez ou cherchez des jeux.</p>
                    ) : editSelection.jeux?.map(j => {
                      const c = COULEURS.find(col => col.id === j.couleur);
                      return (
                        <div key={j.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", boxShadow: "2px 2px 0 var(--ink)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: c ? c.hex : "var(--cream2)", border: "1.5px solid var(--ink)" }}></div>
                            <span style={{ fontWeight: 700, fontSize: 13 }}>{j.nom}</span>
                            {j.code_syracuse && <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,0,0,0.4)" }}>Syr: {j.code_syracuse}</span>}
                          </div>
                          <button onClick={() => retirerJeuSelection(j.id)} style={{ background: "var(--rouge)", color: "var(--white)", border: "none", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>✕</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              {editSelection.titre && editSelection.id && editSelection.id.length > 30 ? (
                <button onClick={() => editSelection.id && supprimerSelection(editSelection.id)} className="pop-btn" style={{ background: "var(--rouge)", color: "var(--white)" }}>Supprimer</button>
              ) : <div></div>}
              <button onClick={sauvegarderSelection} className="pop-btn" style={{ background: "var(--yellow)" }}>
                <span className="bc" style={{ fontSize: 15 }}>Sauvegarder</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL AGRANDIR --- */}
      {isAgrandirOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ width: "100%", maxWidth: 900, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 26, margin: 0, letterSpacing: "0.02em" }}>Toutes les Sélections</h2>
                <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>{selections.length} sélections actives</p>
              </div>
              <button onClick={() => setIsAgrandirOpen(false)} className="pop-btn" style={{ padding: "6px 12px", fontSize: 13 }}>✕ Fermer</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 20, background: "var(--cream2)", display: "flex", flexDirection: "column", gap: 20 }}>
              {selections.length === 0 ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(0,0,0,0.35)" }}>
                  <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>📭</span>
                  <p style={{ fontWeight: 700, fontSize: 18 }}>Aucune sélection.</p>
                </div>
              ) : selections.map(sel => (
                <div key={sel.id} className="pop-card" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "2px solid var(--cream2)", flexWrap: "wrap", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
                        <h3 className="bc" style={{ fontSize: 26, margin: 0, letterSpacing: "0.02em" }}>{sel.titre}</h3>
                        {sel.is_permanent ? (
                          <span style={{ fontSize: 11, fontWeight: 800, background: "var(--vert)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px" }}>Permanente</span>
                        ) : (
                          <span style={{ fontSize: 11, fontWeight: 800, background: "var(--orange)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px" }}>
                            Jusqu'au {sel.date_fin ? new Date(sel.date_fin).toLocaleDateString('fr-FR') : '?'}
                          </span>
                        )}
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.4)", margin: 0 }}>{sel.jeux?.length || 0} jeux</p>
                    </div>
                    <button onClick={() => { setIsAgrandirOpen(false); ouvrirModificationSelection(sel); }} className="pop-btn" style={{ background: "var(--cream2)" }}>✏️ Modifier</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                    {sel.jeux?.map(j => {
                      const c = COULEURS.find(col => col.id === j.couleur);
                      return (
                        <div key={j.id} onClick={() => { setIsAgrandirOpen(false); ouvrirFicheJeu(j); }}
                          style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", background: "var(--cream2)", border: `2px solid ${c ? c.hex : "var(--ink)"}`, borderRadius: 8, cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)" }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: c ? c.hex : "var(--cream2)", border: "1.5px solid var(--ink)", flexShrink: 0, marginTop: 3 }}></div>
                          <div style={{ minWidth: 0 }}>
                            <span style={{ fontWeight: 700, fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.nom}</span>
                            {j.code_syracuse && <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(0,0,0,0.4)" }}>{j.code_syracuse}</span>}
                          </div>
                        </div>
                      );
                    })}
                    {(!sel.jeux || sel.jeux.length === 0) && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Vide.</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL FICHE JEU --- */}
      {ficheJeu && (() => {
        const activeCopy = ficheJeu.copies[ficheJeu.activeCopyIndex];
        const selectionsForCopy = selections.filter(s => s.jeux?.some(j => j.id === activeCopy?.id));
        const couleurFiche = COULEURS.find(c => c.id === (isEditingFiche && editedFiche ? editedFiche.couleur : ficheJeu.couleur));

        return (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px", overflow: "hidden" }}>
          <div style={{ background: "var(--cream)", width: "100%", maxWidth: 1000, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", border: "2.5px solid var(--ink)", borderRadius: 10, boxShadow: "6px 6px 0 var(--ink)", overflow: "hidden" }}>

            {/* Header */}
            <div style={{ background: couleurFiche ? couleurFiche.hex : "var(--bleu)", borderBottom: "2.5px solid var(--ink)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                {isEditingFiche && editedFiche ? (
                  <input type="text" value={editedFiche.nom} onChange={e => setEditedFiche({ ...editedFiche, nom: e.target.value })}
                    style={{ ...inp, fontWeight: 800, fontSize: 20, flex: 1, maxWidth: 320, background: "rgba(255,255,255,0.9)" }} />
                ) : (
                  <h2 className="bc" style={{ fontSize: 26, margin: 0, letterSpacing: "0.02em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: couleurFiche?.id === 'vert' || couleurFiche?.id === 'jaune' ? "var(--ink)" : "var(--white)" }}>{ficheJeu.nom}</h2>
                )}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {isEditingFiche && editedFiche ? (
                    <>
                      <select value={editedFiche.statut || ''} onChange={e => setEditedFiche({ ...editedFiche, statut: e.target.value })} style={{ ...inp, width: "auto", fontSize: 12 }}>
                        <option value="En stock">En stock</option>
                        <option value="En préparation">En préparation</option>
                      </select>
                      <select value={editedFiche.couleur || ''} onChange={e => setEditedFiche({ ...editedFiche, couleur: e.target.value })} style={{ ...inp, width: "auto", fontSize: 12 }}>
                        <option value="">Couleur...</option>
                        {COULEURS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.8)", border: "1.5px solid var(--ink)", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        <input type="checkbox" checked={editedFiche.is_double || false} onChange={e => setEditedFiche({ ...editedFiche, is_double: e.target.checked })} /> Double
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.8)", border: "1.5px solid var(--ink)", borderRadius: 6, padding: "3px 8px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        <input type="checkbox" checked={editedFiche.etape_nouveaute || false} onChange={e => setEditedFiche({ ...editedFiche, etape_nouveaute: e.target.checked })} /> Nouveauté
                      </label>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 11, fontWeight: 800, background: activeCopy?.statut === 'En stock' ? "var(--vert)" : "var(--orange)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 8px" }}>{activeCopy?.statut}</span>
                      {activeCopy?.is_double && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--bleu)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 8px" }}>Double</span>}
                      {activeCopy?.etape_nouveaute && <span style={{ fontSize: 11, fontWeight: 800, background: "var(--yellow)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 8px" }}>🌟 Nouveauté</span>}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                {!isEditingFiche && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", maxWidth: 340 }}>
                    {ficheJeu.copies.map((copy, index) => (
                      <button key={copy.id} onClick={() => changerExemplaire(index)}
                        style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 800, border: "1.5px solid var(--ink)", cursor: "pointer", whiteSpace: "nowrap", background: index === ficheJeu.activeCopyIndex ? "var(--ink)" : "rgba(255,255,255,0.8)", color: index === ficheJeu.activeCopyIndex ? "var(--white)" : "var(--ink)" }}>
                        Ex. {index + 1} {copy.code_syracuse ? `(${copy.code_syracuse})` : ''}
                      </button>
                    ))}
                    <button onClick={creerNouvelExemplaire} title="Ajouter exemplaire"
                      style={{ width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "2px dashed rgba(0,0,0,0.4)", background: "rgba(255,255,255,0.6)", fontWeight: 800, cursor: "pointer", flexShrink: 0, fontSize: 16 }}>
                      +
                    </button>
                  </div>
                )}
                <button onClick={() => setFicheJeu(null)}
                  style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.8)", border: "2px solid var(--ink)", borderRadius: 8, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Corps */}
            <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", gap: 20, flexWrap: "wrap", background: "var(--cream2)" }}>

              {/* Colonne gauche : image */}
              <div style={{ width: 220, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ aspectRatio: "3/4", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {ficheJeu.image_url && !isEditingFiche ? (
                    <img src={ficheJeu.image_url} alt={ficheJeu.nom} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 16, textAlign: "center", width: "100%" }}>
                      <span style={{ fontSize: 40, opacity: 0.2 }}>🖼️</span>
                      {isEditingFiche && editedFiche && (
                        <div style={{ width: "100%" }}>
                          <label style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", display: "block", marginBottom: 5 }}>URL Image</label>
                          <input type="text" value={editedFiche.image_url || ''} onChange={e => setEditedFiche({ ...editedFiche, image_url: e.target.value })} placeholder="https://..." style={{ ...inp, fontSize: 12 }} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <button onClick={() => alert("PDF bientôt disponible")} className="pop-btn" style={{ width: "100%", justifyContent: "center", background: "var(--white)" }}>📖 Règles (PDF)</button>
              </div>

              {/* Colonne droite : infos */}
              <div style={{ flex: 1, minWidth: 300, display: "flex", flexDirection: "column", gap: 16 }}>

                {/* Infos grille */}
                <div className="pop-card" style={{ padding: "18px 20px", borderTop: "4px solid var(--bleu)" }}>
                  <p className="bc" style={{ fontSize: 16, letterSpacing: "0.04em", marginBottom: 14 }}>Informations</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 12 }}>
                    {[
                      { label: "EAN", content: isEditingFiche && editedFiche ? <input type="text" value={editedFiche.ean} onChange={e => setEditedFiche({ ...editedFiche, ean: e.target.value })} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} /> : <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{ficheJeu.ean}</span> },
                      { label: "Syracuse", content: isEditingFiche && editedFiche ? <input type="text" value={editedFiche.code_syracuse || ''} onChange={e => setEditedFiche({ ...editedFiche, code_syracuse: e.target.value })} style={{ ...inp, fontFamily: "monospace", fontSize: 12 }} placeholder="Code..." /> : <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "var(--bleu)" }}>{activeCopy?.code_syracuse || "—"}</span> },
                      { label: "Mécanique", content: isEditingFiche && editedFiche ? <select value={editedFiche.mecanique || ''} onChange={e => setEditedFiche({ ...editedFiche, mecanique: e.target.value })} style={{ ...inp, fontSize: 12, cursor: "pointer" }}><option value="">—</option>{MECANIQUES_OFFICIELLES.map(m => <option key={m} value={m}>{m}</option>)}</select> : <span style={{ fontSize: 12, fontWeight: 700 }}>{ficheJeu.mecanique || "—"}</span> },
                      { label: "Type", content: isEditingFiche && editedFiche ? <select value={editedFiche.coop_versus || ''} onChange={e => setEditedFiche({ ...editedFiche, coop_versus: e.target.value })} style={{ ...inp, fontSize: 12, cursor: "pointer" }}><option value="">—</option><option>Coop</option><option>Versus</option><option>Solo</option></select> : <span style={{ fontSize: 12, fontWeight: 700 }}>{ficheJeu.coop_versus || "—"}</span> },
                      { label: "Joueurs", content: isEditingFiche && editedFiche ? <input type="text" value={editedFiche.nb_de_joueurs || ''} onChange={e => setEditedFiche({ ...editedFiche, nb_de_joueurs: e.target.value })} style={{ ...inp, fontSize: 12 }} placeholder="2-4" /> : <span style={{ fontSize: 12, fontWeight: 700 }}>👥 {ficheJeu.nb_de_joueurs || "—"}</span> },
                      { label: "Temps", content: isEditingFiche && editedFiche ? <input type="text" value={editedFiche.temps_de_jeu || ''} onChange={e => setEditedFiche({ ...editedFiche, temps_de_jeu: e.target.value })} style={{ ...inp, fontSize: 12 }} placeholder="30" /> : <span style={{ fontSize: 12, fontWeight: 700 }}>⏳ {ficheJeu.temps_de_jeu || "—"}</span> },
                      { label: "Difficulté", content: isEditingFiche && editedFiche ? <select value={editedFiche.etoiles || ''} onChange={e => setEditedFiche({ ...editedFiche, etoiles: e.target.value })} style={{ ...inp, fontSize: 12, cursor: "pointer" }}><option value="">—</option><option>1</option><option>2</option><option>3</option></select> : <span style={{ fontSize: 12, fontWeight: 700, color: "var(--yellow)" }}>⭐ {ficheJeu.etoiles || "—"}</span> },
                    ].map(({ label, content }) => (
                      <div key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
                        {content}
                      </div>
                    ))}
                  </div>
                  <div style={{ height: 2, background: "var(--cream2)", margin: "14px 0" }}></div>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Auteurs</span>
                      {isEditingFiche && editedFiche ? <input type="text" value={editedFiche.auteurs || ''} onChange={e => setEditedFiche({ ...editedFiche, auteurs: e.target.value })} style={{ ...inp, fontSize: 13 }} placeholder="Auteurs..." /> : <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.55)", fontStyle: "italic", margin: 0 }}>{ficheJeu.auteurs || "Non renseigné"}</p>}
                    </div>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Éditeur</span>
                      {isEditingFiche && editedFiche ? <input type="text" value={editedFiche.editeur || ''} onChange={e => setEditedFiche({ ...editedFiche, editeur: e.target.value })} style={{ ...inp, fontSize: 13 }} placeholder="Éditeur..." /> : <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.55)", fontStyle: "italic", margin: 0 }}>{ficheJeu.editeur || "Non renseigné"}</p>}
                    </div>
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Description</span>
                    {isEditingFiche && editedFiche ? (
                      <textarea value={editedFiche.description || ''} onChange={e => setEditedFiche({ ...editedFiche, description: e.target.value })} style={{ ...inp, minHeight: 80, resize: "vertical" }} placeholder="Description du jeu..." />
                    ) : (
                      <p style={{ fontSize: 13, fontWeight: 500, color: "rgba(0,0,0,0.55)", lineHeight: 1.6, margin: 0 }}>{ficheJeu.description || "Description à venir."}</p>
                    )}
                  </div>

                  {/* Notes */}
                  <div style={{ marginTop: 14 }}>
                    {(() => {
                      const notes: JeuNote[] = (activeCopy?.notes as JeuNote[]) || [];
                      return (
                        <>
                          <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Commentaires</span>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {notes.map((note, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${note.rappel ? "var(--yellow)" : "var(--ink)"}`, background: note.rappel ? "#fffbeb" : "var(--white)" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                                  {note.rappel && <span style={{ fontSize: 12 }}>🔔</span>}
                                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.texte}</span>
                                </div>
                                <button onClick={() => supprimerNote(i)} style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", fontWeight: 800, fontSize: 11, color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>✕</button>
                              </div>
                            ))}
                            {notes.length === 0 && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucun commentaire.</p>}
                          </div>
                          <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <input type="text" value={newNoteText} onChange={e => setNewNoteText(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && newNoteText.trim()) { ajouterNote(newNoteText, newNoteRappel); setNewNoteText(""); setNewNoteRappel(false); } }}
                              placeholder="Ajouter un commentaire…" style={{ ...inp, flex: 1, fontSize: 13 }} />
                            <button onClick={() => setNewNoteRappel(r => !r)} title="Rappel"
                              style={{ width: 36, height: 36, flexShrink: 0, border: "2px solid var(--ink)", borderRadius: 6, background: newNoteRappel ? "var(--yellow)" : "var(--cream2)", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>🔔</button>
                            <button onClick={() => { if (newNoteText.trim()) { ajouterNote(newNoteText, newNoteRappel); setNewNoteText(""); setNewNoteRappel(false); } }} className="pop-btn pop-btn-dark" style={{ padding: "6px 12px", fontSize: 12 }}>+ Ajouter</button>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Alertes */}
                {ficheAlertes.length > 0 && (
                  <div style={{ background: "#fffbeb", border: "2.5px solid var(--yellow)", borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", padding: "16px 18px" }}>
                    <p className="bc" style={{ fontSize: 16, letterSpacing: "0.03em", marginBottom: 10 }}>🚨 Alertes actives ({ficheAlertes.length})</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {ficheAlertes.map(alerte => (
                        <div key={alerte.id} style={{ background: "var(--white)", border: "1.5px solid var(--yellow)", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                            <span style={{ fontSize: 10, fontWeight: 800, background: alerte.type === 'urgent' ? "var(--rouge)" : "var(--yellow)", color: alerte.type === 'urgent' ? "var(--white)" : "var(--ink)", border: "1px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>
                              {alerte.type === 'urgent' ? '🚨 Urgent' : alerte.type === 'jeu' ? '🎲 Jeu' : '💡 Info'}
                            </span>
                          </div>
                          <p style={{ fontWeight: 700, fontSize: 13, margin: 0 }}>{alerte.titre}</p>
                          {alerte.description && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.5)", margin: "3px 0 0" }}>{alerte.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contenu de la boîte */}
                <div className="pop-card" style={{ padding: "16px 18px", maxHeight: 240, display: "flex", flexDirection: "column", borderTop: "4px solid var(--purple)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexShrink: 0 }}>
                    <p className="bc" style={{ fontSize: 16, letterSpacing: "0.04em", margin: 0 }}>Contenu de la boîte</p>
                    <Link href="/contenu" className="pop-btn" style={{ padding: "4px 10px", fontSize: 12, background: "var(--cream2)" }}>Modifier</Link>
                  </div>
                  <div style={{ overflowY: "auto", flex: 1, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "10px 12px" }}>
                    {isLoadingFiche ? <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", fontWeight: 700 }}>Chargement…</p>
                    : ficheJeu.contenu_boite ? <p style={{ fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap", lineHeight: 1.8, margin: 0 }}>{ficheJeu.contenu_boite}</p>
                    : <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucun contenu renseigné.</p>}
                  </div>
                </div>

                {/* Localisation */}
                <div className="pop-card" style={{ padding: "16px 18px", borderTop: "4px solid var(--vert)" }}>
                  <p className="bc" style={{ fontSize: 16, letterSpacing: "0.04em", marginBottom: 12 }}>Localisation & Suivi</p>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 140, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "10px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Emplacement</span>
                      <span style={{ fontWeight: 800, fontSize: 14 }}>
                        {activeCopy?.statut === 'En préparation' ? "🛠️ Atelier"
                         : activeCopy?.etape_nouveaute ? "🌟 Nouveautés"
                         : "🟢 Salle de jeux"}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 140, background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "10px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 5 }}>Sélections</span>
                      {selectionsForCopy.length > 0 ? (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {selectionsForCopy.map(s => <span key={s.id} style={{ fontSize: 10, fontWeight: 800, background: "var(--rose)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{s.titre}</span>)}
                        </div>
                      ) : <span style={{ fontSize: 13, fontStyle: "italic", color: "rgba(0,0,0,0.35)" }}>Aucune</span>}
                    </div>
                  </div>

                  {activeCopy?.statut === 'En préparation' && (
                    <div style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)", borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase" }}>Avancement</span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: "var(--orange)" }}>{getProgression(activeCopy)}%</span>
                      </div>
                      <div style={{ background: "var(--white)", borderRadius: 4, height: 6, overflow: "hidden", border: "1px solid var(--ink)", marginBottom: 8 }}>
                        <div style={{ height: "100%", background: "var(--orange)", width: `${getProgression(activeCopy)}%`, transition: "width 0.3s" }}></div>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {[{ id: 'etape_plastifier', label: 'Plastification' }, { id: 'etape_contenu', label: 'Contenu' }, { id: 'etape_etiquette', label: 'Étiquette' }, { id: 'etape_equiper', label: 'Équiper' }, { id: 'etape_encoder', label: 'Encoder' }, { id: 'etape_notice', label: 'Notice' }].map(step => (
                          <span key={step.id} style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 20, border: "1.5px solid var(--ink)", background: activeCopy[step.id as keyof typeof activeCopy] ? "var(--vert)" : "var(--white)" }}>
                            {activeCopy[step.id as keyof typeof activeCopy] ? '✓' : '○'} {step.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeCopy?.etape_nouveaute && (
                    <div style={{ display: "flex", gap: 12, background: "#f4fce3", border: "1.5px solid var(--vert)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>Entrée nouveauté</span>
                        <span style={{ fontWeight: 800, fontSize: 13 }}>{activeCopy.date_entree ? new Date(activeCopy.date_entree).toLocaleDateString('fr-FR') : "Non définie"}</span>
                      </div>
                      <div style={{ width: 1, background: "var(--vert)", opacity: 0.5 }}></div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", display: "block", marginBottom: 3 }}>Sortie prévue</span>
                        <span style={{ fontWeight: 800, fontSize: 13, color: "var(--rouge)" }}>{activeCopy.date_sortie ? new Date(activeCopy.date_sortie).toLocaleDateString('fr-FR') : "Non définie"}</span>
                      </div>
                    </div>
                  )}

                  <p className="bc" style={{ fontSize: 15, letterSpacing: "0.03em", marginBottom: 10 }}>Historique incidents</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pièces manquantes</span>
                        <span style={{ fontSize: 10, fontWeight: 800, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{ficheJeu.historique_manquants?.length || 0}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {isLoadingFiche ? <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>Chargement…</p>
                        : (ficheJeu.historique_manquants || []).length === 0 ? <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucun incident.</p>
                        : ficheJeu.historique_manquants!.map((manq: any) => (
                          <div key={manq.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff0f4", border: "1.5px solid var(--rouge)", borderRadius: 6, padding: "5px 8px" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--rouge)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{manq.element_manquant}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, background: "var(--white)", border: "1px solid var(--rouge)", borderRadius: 4, padding: "1px 6px", flexShrink: 0, marginLeft: 6 }}>{manq.statut}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>Réparations</span>
                        <span style={{ fontSize: 10, fontWeight: 800, background: "var(--orange)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 7px" }}>{ficheJeu.historique_reparations?.length || 0}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        {isLoadingFiche ? <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>Chargement…</p>
                        : (ficheJeu.historique_reparations || []).length === 0 ? <p style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontStyle: "italic" }}>Aucune réparation.</p>
                        : ficheJeu.historique_reparations!.map((rep: any) => (
                          <div key={rep.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff8f0", border: "1.5px solid var(--orange)", borderRadius: 6, padding: "5px 8px" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--orange)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 6 }}>{rep.description}</span>
                            <span style={{ fontSize: 10, fontWeight: 800, background: "var(--white)", border: "1px solid var(--orange)", borderRadius: 4, padding: "1px 6px", flexShrink: 0 }}>{rep.statut}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ background: "var(--white)", borderTop: "2.5px solid var(--ink)", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              {!isEditingFiche ? (
                <button onClick={() => supprimerExemplaire(activeCopy?.id)} className="pop-btn" style={{ background: "var(--rouge)", color: "var(--white)" }}>🗑️ Supprimer</button>
              ) : <div></div>}
              <div style={{ display: "flex", gap: 10 }}>
                {isEditingFiche ? (
                  <>
                    <button onClick={() => setIsEditingFiche(false)} className="pop-btn" style={{ background: "var(--cream2)" }}>Annuler</button>
                    <button onClick={sauvegarderFicheJeu} className="pop-btn" style={{ background: "var(--vert)" }}>
                      <span className="bc" style={{ fontSize: 15 }}>Enregistrer</span>
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={activerEditionFiche} className="pop-btn" style={{ background: "var(--cream2)" }}>✏️ Éditer</button>
                    <button className="pop-btn pop-btn-dark">🖨️ Imprimer étiquette</button>
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