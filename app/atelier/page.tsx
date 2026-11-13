"use client";
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import NavBar from "../../components/NavBar";
import { useIsMobile } from "../../lib/useIsMobile";
import { genererEanCustom } from "../../lib/eanCustom";
import BoutonScan from "../../components/ScanCodeBarre";
import ModalFicheAtelier, { type FocusFiche } from "../../components/ModalFicheAtelier";
import ModalEditionTuto from "../../components/ModalEditionTuto";
import { useCompte } from "../../components/AuthProvider";
import { peutModifierTutos, type GesteTuto, type TutosAtelier } from "../../lib/tutosAtelier";
import {
  ETAPES_ATELIER, CHAMPS_ETIQUETTE, type EtapeAtelier,
  etapeCourante, etapeConcerne, etapeFaite, etapesEnAvance, etiquetteComplete, jeuTermine, colonnesEtape, statutApres,
} from "../../lib/etapesAtelier";

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
  etape_verification: boolean;
  couleur?: string;
  /** Vignette (jaquette) au catalogue. */
  image_url?: string | null;
  /** Les champs de l'étiquette sont-ils tous remplis au catalogue ? */
  etiquette_ok?: boolean;
  [key: string]: string | number | boolean | null | undefined;
};

type JeuAttenteType = {
  uid: number;
  ean: string;
  nom: string;
  typeAjout: "nouveaute" | "double" | "existant";
  etapes: Record<string, boolean>;
  couleur: string;
  doublesExistants?: number;
};

// Historique des jeux reçus (enregistrés lors d'une réception)
type ReceptionEntreeType = {
  id: number;
  ean: string;
  nom: string;
  quantite: number;
  statut: string;
  notes: string | null;
  date_commande: string;
  date_reception: string | null;
};

// Étapes cochables à l'ajout, par identifiant d'étape (la nouveauté se fait dans l'atelier).
const defaultEtapes: Record<string, boolean> = Object.fromEntries(
  ETAPES_ATELIER.filter(e => !e.nouveauteSeulement).map(e => [e.id, false])
);

// Couleurs de pastille du catalogue (mêmes identifiants que l'inventaire et
// lib/couleursJeux.ts) : « jaune » est la pastille orangée, il n'y a pas d'« orange ».
const COULEURS = [
  { id: 'vert',   hex: '#a8e063', label: 'Vert' },
  { id: 'rose',   hex: '#f472b6', label: 'Rose' },
  { id: 'bleu',   hex: '#60a5fa', label: 'Bleu' },
  { id: 'rouge',  hex: '#f87171', label: 'Rouge' },
  { id: 'jaune',  hex: '#fb923c', label: 'Jaune' },
];
// L'atelier enregistrait autrefois « orange » pour la pastille jaune : on le lit comme « jaune ».
const couleurNormalisee = (id: string | null | undefined) => (id === 'orange' ? 'jaune' : id ?? '');
const hexCouleur = (id: string | null | undefined) => COULEURS.find(c => c.id === couleurNormalisee(id))?.hex ?? null;

/** Une réception = les lignes `commandes` enregistrées ensemble (même horodatage). */
type Reception = { cle: string; date: string; notes: string | null; entrees: ReceptionEntreeType[] };
type InfoCatalogue = { couleur: string; image_url: string | null };

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

let uidCounter = 0;
const nextUid = () => ++uidCounter;

export default function Home() {
  const isMobile = useIsMobile();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isListeOpen, setIsListeOpen] = useState(false);
  const [etapeActive, setEtapeActive] = useState<string | null>(null);

  const [nbReparations, setNbReparations] = useState(0);
  const [nbManquants, setNbManquants] = useState(0);
  const [nbOrphelines, setNbOrphelines] = useState(0);
  const [nbDetachees, setNbDetachees] = useState(0);

  const [jeuxAttente, setJeuxAttente] = useState<JeuAttenteType[]>([]);
  const [jeuxEnPrepa, setJeuxEnPrepa] = useState<JeuType[]>([]);
  const [jeuxSelectionnes, setJeuxSelectionnes] = useState<(string | number)[]>([]);

  const [rechercheEtape, setRechercheEtape] = useState("");
  // Vignette / étiquette à compléter (pastilles 🖼 et 🏷)
  const [ficheOuverte, setFicheOuverte] = useState<{ jeu: JeuType; focus: FocusFiche } | null>(null);
  const ouvrirFiche = (jeu: JeuType, focus: FocusFiche) => setFicheOuverte({ jeu, focus });
  // Validation groupée : on choisit des boîtes sur l'étagère, puis les étapes faites sur ces jeux.
  const [modeGroupe, setModeGroupe] = useState(false);
  const [groupe, setGroupe] = useState<(string | number)[]>([]);
  const [isGroupeOpen, setIsGroupeOpen] = useState(false);
  // Tutos des étapes (en base) ; seuls certains comptes peuvent les modifier.
  const { compte } = useCompte();
  const editeurTutos = peutModifierTutos(compte);
  const [tutos, setTutos] = useState<TutosAtelier>({});
  const [tutoEdite, setTutoEdite] = useState<EtapeAtelier | null>(null);

  const [isScanOpen,  setIsScanOpen]  = useState(false);
  const [scanQueue,   setScanQueue]   = useState<JeuType[]>([]);
  const [scanIdx,     setScanIdx]     = useState(0);
  const [scanInput,   setScanInput]   = useState("");
  const [scanDone,    setScanDone]    = useState<{ nom: string; code: string }[]>([]);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const [eanInput, setEanInput] = useState("");
  const [manuelInput, setManuelInput] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingEanIndex, setEditingEanIndex] = useState<number | null>(null);

  const [totalEnPrepa, setTotalEnPrepa] = useState(0);

  const [rechercheJeu, setRechercheJeu] = useState("");
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);

  // ── Réception / historique des commandes ──
  const [isCommandesOpen,   setIsCommandesOpen]   = useState(false);
  const [jeuxReception,     setJeuxReception]     = useState<JeuAttenteType[]>([]);
  const [historiqueEntrees, setHistoriqueEntrees] = useState<ReceptionEntreeType[]>([]);
  const [eanReceptionInput, setEanReceptionInput] = useState("");
  const [manuelReceptionInput, setManuelReceptionInput] = useState("");
  const [editingReceptionIndex,    setEditingReceptionIndex]    = useState<number | null>(null);
  const [editingReceptionEanIndex, setEditingReceptionEanIndex] = useState<number | null>(null);

  // Couleur et jaquette des jeux reçus (catalogue), par EAN
  const [infosCatalogue, setInfosCatalogue] = useState<Record<string, InfoCatalogue>>({});
  const [receptionCouleurs, setReceptionCouleurs] = useState<string | null>(null);
  const [receptionsOuvertes, setReceptionsOuvertes] = useState<Record<string, boolean>>({});

  // Une réception validée partage un même horodatage : c'est ce qui la délimite.
  const receptions: Reception[] = (() => {
    const map = new Map<string, Reception>();
    for (const e of historiqueEntrees) {
      const cle = e.date_commande;
      if (!map.has(cle)) map.set(cle, { cle, date: e.date_commande, notes: e.notes, entrees: [] });
      const r = map.get(cle)!;
      r.entrees.push(e);
      if (!r.notes && e.notes) r.notes = e.notes;
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  })();

  const fetchHistorique = async () => {
    const data = await fetch('/api/commandes').then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    const entrees = data as ReceptionEntreeType[];
    setHistoriqueEntrees(entrees);
    const eans = [...new Set(entrees.map(e => e.ean).filter(e => e && e !== 'Manuel'))];
    if (!eans.length) return;
    const cat = await fetch(`/api/catalogue?eans=${encodeURIComponent(eans.join(','))}&fields=ean,couleur,image_url`)
      .then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    const infos: Record<string, InfoCatalogue> = {};
    for (const c of cat as any[]) infos[c.ean] = { couleur: c.couleur || "", image_url: c.image_url || null };
    setInfosCatalogue(infos);
  };

  /** Couleur d'un jeu au catalogue : vaut pour tous ses exemplaires (doubles compris). */
  const changerCouleurCatalogue = async (ean: string, nom: string, couleur: string) => {
    setInfosCatalogue(prev => ({ ...prev, [ean]: { image_url: prev[ean]?.image_url ?? null, couleur } }));
    const ok = await fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([{ ean, nom, couleur }]) })
      .then(r => r.ok).catch(() => false);
    if (!ok) { alert(`La couleur de « ${nom} » n'a pas pu être enregistrée.`); fetchHistorique(); }
  };

  const supprimerReception = async (r: Reception) => {
    if (!confirm(`Retirer toute la réception du ${formatDate(r.date)} de l'historique (${r.entrees.length} ligne${r.entrees.length > 1 ? 's' : ''}) ? Les jeux restent dans l'atelier.`)) return;
    for (let i = 0; i < r.entrees.length; i += 10) {
      await Promise.all(r.entrees.slice(i, i + 10).map(e => fetch(`/api/commandes/${e.id}`, { method: 'DELETE' })));
    }
    fetchHistorique();
  };

  const fetchDashboardData = async () => {
    const jeuxData = await fetch(`/api/jeux?statut=${encodeURIComponent('En préparation')}`).then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    const jeuxBruts = (jeuxData as JeuType[]).sort((a, b) => a.nom.localeCompare(b.nom));
    const eans = [...new Set(jeuxBruts.map(j => j.ean))];

    const catMap: Record<string, Record<string, any>> = {};
    if (eans.length > 0) {
      const champs = ['ean', 'couleur', 'image_url', ...CHAMPS_ETIQUETTE].join(',');
      const catData = await fetch(`/api/catalogue?eans=${encodeURIComponent(eans.join(','))}&fields=${champs}`).then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
      (catData as any[]).forEach(item => { catMap[item.ean] = item; });
    }

    const jeux = jeuxBruts.map(j => ({
      ...j,
      couleur: couleurNormalisee(catMap[j.ean]?.couleur),
      image_url: catMap[j.ean]?.image_url || null,
      etiquette_ok: etiquetteComplete(catMap[j.ean]),
    }));
    setJeuxEnPrepa(jeux);
    setTotalEnPrepa(jeux.length);

    const toArr = (d: any) => Array.isArray(d) ? d : [];
    const [repsData, manqData, orphData, detData] = await Promise.all([
      fetch('/api/reparations').then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
      fetch('/api/pieces-manquantes').then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
      fetch('/api/pieces-trouvees').then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
      fetch('/api/pieces-detachees').then(r => r.json() as Promise<any>).then(toArr).catch(() => []),
    ]);
    setNbReparations((repsData as any[]).filter(r => r.statut === 'À faire').length);
    setNbManquants((manqData as any[]).filter(m => ['Manquant', 'Commandé'].includes(m.statut)).length);
    setNbOrphelines((orphData as any[]).filter(o => o.statut === 'En attente').length);
    // Compté par jeu et non par ligne : c'est le nombre de jeux pour lesquels on a du rab.
    setNbDetachees(new Set((detData as any[]).map(d => String(d.nom_jeu ?? '').toLowerCase().trim())).size);
  };

  useEffect(() => {
    fetchDashboardData(); fetchHistorique();
    fetch('/api/atelier-tutos').then(r => r.json() as Promise<any>).then(d => { if (d && !d.error) setTutos(d as TutosAtelier); }).catch(() => {});
  }, []);

  const etapesVisuelles = ETAPES_ATELIER;

  // L'étagère : chaque jeu est posé à sa première étape non faite.
  const jeuxParEtape: Record<string, JeuType[]> = Object.fromEntries(ETAPES_ATELIER.map(e => [e.id, [] as JeuType[]]));
  const jeuxPrets: JeuType[] = [];
  for (const j of jeuxEnPrepa) {
    const e = etapeCourante(j);
    if (e) jeuxParEtape[e.id].push(j); else jeuxPrets.push(j);
  }

  const formatNum = (num: number) => num < 10 ? `0${num}` : num;

  // ── Helper : scan EAN avec détection de double ──
  const scanEanAvecDouble = async (
    codeScan: string,
    setter: React.Dispatch<React.SetStateAction<JeuAttenteType[]>>
  ) => {
    const uid = nextUid();
    setter(prev => [{ uid, ean: codeScan, nom: "⏳ Recherche en cours...", typeAjout: "nouveaute", etapes: { ...defaultEtapes }, couleur: "" }, ...prev]);

    const [apiData, jeuxData, catData] = await Promise.all([
      fetch(`/api/recherche?ean=${codeScan}`).then(r => r.json() as Promise<any>).catch(() => ({ nom: null })),
      fetch(`/api/jeux?fields=nom&ean=${encodeURIComponent(codeScan)}`).then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []),
      fetch(`/api/catalogue?ean=${encodeURIComponent(codeScan)}&fields=nom,couleur`).then(r => r.json() as Promise<any>).then((d: any[]) => d[0] ?? null).catch(() => null),
    ]);

    const doublesCount = (jeuxData as any[]).length;
    const nomFromDb  = (jeuxData as any[])[0]?.nom ?? null;
    const nomFromCat = catData?.nom ?? null;
    const couleurFromCat = catData?.couleur ?? "";
    setter(prev => prev.map(j => j.uid === uid ? {
      ...j,
      nom: (apiData as { nom?: string | null })?.nom || nomFromCat || nomFromDb || "",
      couleur: couleurFromCat,
      typeAjout: doublesCount > 0 ? "double" : "nouveaute",
      doublesExistants: doublesCount > 0 ? doublesCount : undefined,
    } : j));
  };

  // ── Modal ajout jeu ──
  const ajouterEan = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !eanInput.trim()) return;
    const code = eanInput.trim(); setEanInput("");
    await scanEanAvecDouble(code, setJeuxAttente);
  };

  const ajouterManuel = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !manuelInput.trim()) return;
    setJeuxAttente(prev => [{ uid: nextUid(), ean: genererEanCustom(), nom: manuelInput.trim(), typeAjout: "nouveaute", etapes: { ...defaultEtapes }, couleur: "" }, ...prev]);
    setManuelInput("");
  };

  // ── Modal réception ──
  const ajouterEanReception = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !eanReceptionInput.trim()) return;
    const code = eanReceptionInput.trim(); setEanReceptionInput("");
    await scanEanAvecDouble(code, setJeuxReception);
  };

  const ajouterManuelReception = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !manuelReceptionInput.trim()) return;
    setJeuxReception(prev => [{ uid: nextUid(), ean: genererEanCustom(), nom: manuelReceptionInput.trim(), typeAjout: "nouveaute", etapes: { ...defaultEtapes }, couleur: "" }, ...prev]);
    setManuelReceptionInput("");
  };

  const changerTypeAjoutListe = (
    setter: React.Dispatch<React.SetStateAction<JeuAttenteType[]>>,
    index: number,
    nouveauType: "nouveaute" | "double" | "existant"
  ) => {
    setter(prev => prev.map((jeu, i) => {
      if (i !== index) return jeu;
      let nouvellesEtapes = { ...jeu.etapes };
      if (nouveauType === "existant") {
        nouvellesEtapes = Object.fromEntries(Object.keys(defaultEtapes).map(k => [k, true]));
      } else if (jeu.typeAjout === "existant") {
        nouvellesEtapes = { ...defaultEtapes };
      }
      return { ...jeu, typeAjout: nouveauType, etapes: nouvellesEtapes };
    }));
  };

  const toggleEtapeAttenteListe = (
    setter: React.Dispatch<React.SetStateAction<JeuAttenteType[]>>,
    index: number,
    etapeId: string
  ) => {
    if (etapeId === 'etape_nouveaute') return;
    setter(prev => prev.map((jeu, i) => i === index ? { ...jeu, etapes: { ...jeu.etapes, [etapeId]: !jeu.etapes[etapeId] } } : jeu));
  };

  // ── Construit les rows jeux à insérer depuis une liste d'attente ──
  const construireJeuxAInserer = (liste: JeuAttenteType[]) => liste.map(jeu => {
    const isExistant = jeu.typeAjout === "existant";
    const isDouble   = jeu.typeAjout === "double";
    const colonnes: Record<string, number> = {};
    for (const e of ETAPES_ATELIER) {
      Object.assign(colonnes, colonnesEtape(e, !e.nouveauteSeulement && (isExistant || !!jeu.etapes[e.id])));
    }
    const is_double = isDouble || isExistant ? 1 : 0;
    // Un existant est en stock d'office ; un double l'est s'il a déjà tout fait.
    const statut = isExistant ? "En stock" : statutApres({ is_double, ...colonnes });
    return { nom: jeu.nom, ean: jeu.ean, statut, is_double, ...colonnes };
  });

  const validerEtEnvoyer = async () => {
    for (const row of construireJeuxAInserer(jeuxAttente)) {
      const res = await fetch('/api/jeux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
      if (res.error) { alert("Erreur : " + res.error); return; }
    }

    const catMap = new Map<string, { ean: string; nom: string; couleur: string }>();
    jeuxAttente.forEach(j => catMap.set(j.ean, { ean: j.ean, nom: j.nom, couleur: j.couleur }));
    const catUpdates = [...catMap.values()];
    if (catUpdates.length > 0) {
      await fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catUpdates) });
    }

    setJeuxAttente([]); setIsModalOpen(false); fetchDashboardData();
  };

  // ── Valider une réception : ajoute dans jeux ET log dans commandes ──
  const validerReception = async () => {
    if (jeuxReception.length === 0) return;

    for (const row of construireJeuxAInserer(jeuxReception)) {
      const res = await fetch('/api/jeux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
      if (res.error) { alert("Erreur : " + res.error); return; }
    }

    const maintenant = new Date().toISOString();
    for (const j of jeuxReception) {
      await fetch('/api/commandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ean: j.ean, nom: j.nom, quantite: 1, statut: 'Reçu', date_commande: maintenant }),
      });
    }

    const catMap = new Map<string, { ean: string; nom: string; couleur: string }>();
    jeuxReception.forEach(j => catMap.set(j.ean, { ean: j.ean, nom: j.nom, couleur: j.couleur }));
    const catUpdates = [...catMap.values()];
    if (catUpdates.length > 0) {
      await fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(catUpdates) });
    }

    setJeuxReception([]);
    fetchDashboardData();
    fetchHistorique();
  };

  const supprimerEntreeHistorique = async (id: number) => {
    await fetch(`/api/commandes/${id}`, { method: 'DELETE' });
    fetchHistorique();
  };

  const toggleEtapeUnique = async (id: string | number, etape: EtapeAtelier, valeurActuelle: boolean) => {
    const jeuActuel = jeuxEnPrepa.find(j => j.id === id);
    if (!jeuActuel) return;
    if (!etapeConcerne(jeuActuel, etape)) return;

    const updatedVal = !valeurActuelle;
    const maj = colonnesEtape(etape, updatedVal);
    const updatedJeu = { ...jeuActuel, ...Object.fromEntries(Object.keys(maj).map(k => [k, updatedVal])) } as JeuType;
    const estFini = jeuTermine(updatedJeu);
    const newStatut = estFini ? "En stock" : "En préparation";

    if (estFini) { setJeuxEnPrepa(prev => prev.filter(j => j.id !== id)); setTotalEnPrepa(prev => prev - 1); }
    else { setJeuxEnPrepa(prev => prev.map(j => j.id === id ? updatedJeu : j)); }

    const res = await fetch(`/api/jeux/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...maj, statut: newStatut }),
    }).then(r => r.json() as Promise<any>).catch(() => ({ error: 'réseau' }));
    if (res.error) alert("Erreur de synchronisation !");
    fetchDashboardData();
  };

  const validerSelectionEtape = async () => {
    const etape = ETAPES_ATELIER.find(e => e.id === etapeActive);
    if (!etape || jeuxSelectionnes.length === 0) return;
    const maj = colonnesEtape(etape, true);
    const jeuxValides: JeuType[] = [];
    for (const id of jeuxSelectionnes) {
      const jeuActuel = jeuxEnPrepa.find(j => j.id === id);
      if (!jeuActuel) continue;
      await fetch(`/api/jeux/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...maj, statut: statutApres(jeuActuel, maj) }),
      });
      jeuxValides.push(jeuActuel);
    }
    setEtapeActive(null); setJeuxSelectionnes([]); fetchDashboardData();
    // Étape 1 : le code-barre vient d'être collé, on scanne les codes Syracuse.
    if (etape.num === 1 && jeuxValides.length > 0) {
      setScanQueue(jeuxValides); setScanIdx(0); setScanInput(""); setScanDone([]); setIsScanOpen(true);
    }
  };

  const scannerCode = async () => {
    const code = scanInput.trim();
    const jeu = scanQueue[scanIdx];
    if (!jeu) return;
    if (code) {
      await fetch(`/api/jeux/${jeu.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code_syracuse: code }),
      });
      setScanDone(prev => [...prev, { nom: jeu.nom, code }]);
    }
    setScanIdx(prev => prev + 1); setScanInput("");
    setTimeout(() => scanInputRef.current?.focus(), 50);
  };

  const passerScan = () => { setScanIdx(prev => prev + 1); setScanInput(""); setTimeout(() => scanInputRef.current?.focus(), 50); };
  const toggleSelection = (id: string | number) => setJeuxSelectionnes(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const etapeActiveInfo = etapesVisuelles.find(e => e.id === etapeActive);
  // Les étapes se font dans l'ordre : seuls les jeux arrivés à cette étape la proposent.
  const jeuxPourEtapeActive = etapeActive ? jeuxParEtape[etapeActive] ?? [] : [];

  const ouvrirEtape = (etapeId: string, jeuId?: string | number) => {
    setEtapeActive(etapeId); setRechercheEtape(""); setJeuxSelectionnes(jeuId !== undefined ? [jeuId] : []);
  };

  /** Un jeu a tout fait mais est resté « En préparation » (étape cochée depuis une autre page). */
  const mettreEnStock = async (jeu: JeuType) => {
    setJeuxEnPrepa(prev => prev.filter(j => j.id !== jeu.id)); setTotalEnPrepa(prev => prev - 1);
    await fetch(`/api/jeux/${jeu.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statut: 'En stock' }) });
    fetchDashboardData();
  };

  // ── Validation groupée ──
  const quitterModeGroupe = () => { setModeGroupe(false); setGroupe([]); setIsGroupeOpen(false); };
  const basculerDansGroupe = (id: string | number) =>
    setGroupe(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  /** Clic sur une boîte : en mode sélection (ou Ctrl/⌘ + clic), elle rejoint le groupe ; sinon on ouvre son étape. */
  const clicBoite = (jeu: JeuType, etapeId: string, e: React.MouseEvent) => {
    if (modeGroupe || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setModeGroupe(true);
      basculerDansGroupe(jeu.id);
    } else ouvrirEtape(etapeId, jeu.id);
  };

  /** En mode sélection, l'en-tête d'une étagère prend (ou retire) toutes ses boîtes. */
  const clicEnteteEtagere = (etapeId: string) => {
    if (!modeGroupe) { ouvrirEtape(etapeId); return; }
    const ids = (jeuxParEtape[etapeId] ?? []).map(j => j.id);
    const tous = ids.length > 0 && ids.every(id => groupe.includes(id));
    setGroupe(prev => tous ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  const boutonGroupe = () => {
    if (!modeGroupe) { setModeGroupe(true); return; }
    if (groupe.length > 0) setIsGroupeOpen(true);
  };

  // Entrée ouvre la validation du groupe, Échap quitte le mode sélection.
  useEffect(() => {
    if (!modeGroupe || isGroupeOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Enter' && groupe.length > 0) { e.preventDefault(); setIsGroupeOpen(true); }
      else if (e.key === 'Escape') quitterModeGroupe();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modeGroupe, isGroupeOpen, groupe.length]);

  /** Enregistre les étapes cochées / décochées dans la modal de validation groupée. */
  const enregistrerGroupe = async (etats: Record<string, Record<string, boolean>>) => {
    const aScanner: JeuType[] = [];
    let erreurs = 0;
    for (const jeu of jeuxEnPrepa.filter(j => groupe.includes(j.id))) {
      const voulu = etats[String(jeu.id)];
      if (!voulu) continue;
      const maj: Record<string, number> = {};
      for (const e of ETAPES_ATELIER) {
        if (!etapeConcerne(jeu, e) || voulu[e.id] === undefined || voulu[e.id] === etapeFaite(jeu, e)) continue;
        Object.assign(maj, colonnesEtape(e, voulu[e.id]));
        if (e.num === 1 && voulu[e.id]) aScanner.push(jeu);
      }
      if (!Object.keys(maj).length) continue;
      const ok = await fetch(`/api/jeux/${jeu.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...maj, statut: statutApres(jeu, maj) }),
      }).then(r => r.ok).catch(() => false);
      if (!ok) erreurs++;
    }
    quitterModeGroupe();
    await fetchDashboardData();
    if (erreurs) alert(`${erreurs} jeu${erreurs > 1 ? 'x n\'ont' : ' n\'a'} pas pu être enregistré${erreurs > 1 ? 's' : ''}.`);
    // Étape 1 faite : le code-barre vient d'être collé, on scanne les codes Syracuse.
    if (aScanner.length) { setScanQueue(aScanner); setScanIdx(0); setScanInput(""); setScanDone([]); setIsScanOpen(true); }
  };

  const changerCouleurJeu = async (idJeu: string | number, ean: string, nom: string, nouvelleCouleur: string) => {
    setJeuxEnPrepa(prev => prev.map(j => j.id === idJeu ? { ...j, couleur: nouvelleCouleur } : j));
    await fetch('/api/catalogue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ean, nom, couleur: nouvelleCouleur }),
    });
  };

  const jeuxEnPrepaFiltres = jeuxEnPrepa.filter(jeu =>
    jeu.nom.toLowerCase().includes(rechercheJeu.toLowerCase()) || jeu.ean.includes(rechercheJeu)
  );

  // ── Composant réutilisable : carte d'un jeu en attente ──
  const CarteJeuAttente = ({
    jeu, index, setter, editingIdx, setEditingIdx, editingEanIdx, setEditingEanIdx
  }: {
    jeu: JeuAttenteType; index: number;
    setter: React.Dispatch<React.SetStateAction<JeuAttenteType[]>>;
    editingIdx: number | null; setEditingIdx: (i: number | null) => void;
    editingEanIdx: number | null; setEditingEanIdx: (i: number | null) => void;
  }) => (
    <div className="pop-card" style={{ background: 'var(--white)', padding: '14px 16px', position: 'relative' }}
      onMouseEnter={e => { const a = e.currentTarget.querySelector<HTMLElement>('.jeu-actions'); if (a) a.style.opacity = '1'; }}
      onMouseLeave={e => { const a = e.currentTarget.querySelector<HTMLElement>('.jeu-actions'); if (a) a.style.opacity = '0'; }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        {jeu.nom === "⏳ Recherche en cours..." ? (
          <span style={{ fontWeight: 700, color: 'rgba(0,0,0,0.4)' }}>{jeu.nom}</span>
        ) : editingIdx === index || jeu.nom === "" ? (
          <input type="text" value={jeu.nom}
            onChange={e => setter(prev => { const l = [...prev]; l[index] = { ...l[index], nom: e.target.value }; return l; })}
            onBlur={() => setEditingIdx(null)} onKeyDown={e => e.key === "Enter" && setEditingIdx(null)}
            autoFocus style={{ fontWeight: 700, fontSize: 18, background: 'transparent', borderBottom: '2px solid var(--ink)', outline: 'none', width: 200, maxWidth: '100%' }} />
        ) : (
          <span style={{ fontWeight: 700, fontSize: 18 }}>{jeu.nom}</span>
        )}
        {jeu.doublesExistants && jeu.doublesExistants > 0 && (
          <span style={{ background: 'var(--orange)', border: '2px solid var(--ink)', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
            ⚠️ {jeu.doublesExistants} déjà en inventaire
          </span>
        )}
        <div style={{ display: 'flex', gap: 4, background: 'var(--cream2)', padding: '3px 6px', borderRadius: 20, border: '1.5px solid var(--ink)' }}>
          {COULEURS.map(c => (
            <button key={c.id} type="button"
              onClick={() => setter(prev => prev.map((j, i) => i === index ? { ...j, couleur: j.couleur === c.id ? "" : c.id } : j))}
              style={{ width: 14, height: 14, borderRadius: '50%', background: c.hex, border: jeu.couleur === c.id ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transform: jeu.couleur === c.id ? 'scale(1.2)' : 'scale(1)' }} title={c.id} />
          ))}
        </div>
        <div className="jeu-actions" style={{ opacity: 0, transition: 'opacity .15s', display: 'flex', gap: 4, marginLeft: 'auto' }}>
          <button onClick={() => setEditingEanIdx(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Modifier EAN">🏷️</button>
          <button onClick={() => setEditingIdx(index)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Modifier Nom">✏️</button>
          <button onClick={() => setter(prev => prev.filter((_, i) => i !== index))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }} title="Supprimer">🗑️</button>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>
        <BarcodeIcon />
        {editingEanIdx === index ? (
          <input type="text" value={jeu.ean}
            onChange={e => setter(prev => { const l = [...prev]; l[index] = { ...l[index], ean: e.target.value }; return l; })}
            onBlur={() => { setter(prev => { const l = [...prev]; if (!l[index].ean.trim()) l[index] = { ...l[index], ean: genererEanCustom() }; return l; }); setEditingEanIdx(null); }} onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            autoFocus style={{ background: 'transparent', borderBottom: '2px solid var(--ink)', outline: 'none', width: 160, maxWidth: '100%', fontSize: 13 }} />
        ) : <span>EAN : {jeu.ean}</span>}
      </div>
      <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
        {(['nouveaute', 'double', 'existant'] as const).map(type => {
          const labels = { nouveaute: '🌟 Nouveauté', double: '🔄 Double', existant: '✅ Existant' };
          const colors = { nouveaute: 'var(--yellow)', double: 'var(--bleu)', existant: 'var(--vert)' };
          const active = jeu.typeAjout === type;
          return (
            <button key={type} onClick={() => changerTypeAjoutListe(setter, index, type)}
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
          const disabled = isExistant || isNouv;
          let checked = jeu.etapes[etape.id];
          let label = `${etape.num}. ${etape.nom}`;
          if (isExistant) { checked = !isNouv; label = isNouv ? "🚫 Pas une nouveauté" : label; }
          else if (jeu.typeAjout === 'double' && isNouv) { checked = false; label = "🔄 Double"; }
          else if (isNouv) { checked = false; label = "🌟 Nouveauté (Atelier)"; }
          return (
            <label key={etape.id} style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
              <input type="checkbox" className="custom-cb" disabled={disabled} checked={checked} onChange={() => toggleEtapeAttenteListe(setter, index, etape.id)} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );

  const S = {
    modal:    { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(var(--nav-h) + 12px) 12px 12px' } as React.CSSProperties,
    modalBox: { background: 'var(--cream)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '8px 8px 0 var(--ink)', width: '100%', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - var(--nav-h) - 36px)', overflow: 'hidden' } as React.CSSProperties,
    closeBtn: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', fontWeight: 700, fontSize: 16, cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  };

  return (
    <div style={{ minHeight: '100dvh' }}>
      <style>{`
        input[type="checkbox"].custom-cb { accent-color: #0d0d0d; width: 1.1rem; height: 1.1rem; cursor: pointer; }
        input[type="checkbox"].custom-cb:disabled { cursor: default; opacity: 0.5; }
        .boite-jeu-choisie .boite-jeu-3d { transform: rotateX(-22deg) rotateY(-16deg) translateY(-10px) !important; filter: drop-shadow(0 0 0 var(--ink)) drop-shadow(0 6px 0 rgba(0,0,0,0.35)); }
        .boite-jeu-choisie .boite-jeu-3d > span { outline: 3px solid var(--yellow); outline-offset: 0; }
        .pastille-fiche { transition: transform .12s; }
        .bouton-tuto { opacity: .45; transition: opacity .15s, background .15s, color .15s; }
        .bouton-tuto:hover, .bouton-tuto:focus-visible, .bouton-tuto.ouvert { opacity: 1; }
        .tuto-bulle { transform-origin: calc(100% - 60px) 0; animation: tuto-pop .18s ease-out; }
        .tuto-bulle.vers-le-haut { transform-origin: calc(100% - 60px) 100%; }
        @keyframes tuto-pop { from { opacity: 0; transform: scale(.92) translateY(-6px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .tuto-bulle { animation: none; } }
        .pastille-fiche:hover { transform: scale(1.25); box-shadow: 1px 1px 0 var(--ink); }
        .boite-jeu:hover .boite-jeu-3d { transform: rotateX(-22deg) rotateY(-16deg) translateY(-6px) !important; }
        .reception-tuile .reception-retirer { opacity: 0; transition: opacity .15s; }
        .reception-tuile:hover .reception-retirer { opacity: 1; }
      `}</style>

      <NavBar current="atelier" />

      <div className="pop-page">

        {/* ── PAGE HEADER ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: isMobile ? 18 : 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="bc" style={{ fontSize: isMobile ? 44 : 80, lineHeight: 0.9, textTransform: 'uppercase', letterSpacing: '-1px', background: 'linear-gradient(135deg, #0d0d0d 40%, #a8e063)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Atelier
            </div>
            <div style={{ fontSize: 14, color: 'rgba(0,0,0,0.4)', marginTop: 6 }}>{totalEnPrepa} jeux en préparation</div>
          </div>
          <div style={{ display: 'flex', gap: 10, flex: isMobile ? '1 1 100%' : undefined }}>
            <button onClick={() => { setIsCommandesOpen(true); fetchHistorique(); }} className="pop-btn pop-btn-outline" style={{ flex: isMobile ? 1 : undefined, justifyContent: 'center' }}>
              📦 Réceptions
              {historiqueEntrees.length > 0 && (
                <span style={{ background: 'var(--bleu)', color: 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 20, padding: '1px 7px', fontSize: 12, fontWeight: 700, marginLeft: 4 }}>
                  {historiqueEntrees.length}
                </span>
              )}
            </button>
            <button onClick={() => setIsModalOpen(true)} className="pop-btn pop-btn-dark" style={{ flex: isMobile ? 1 : undefined, justifyContent: 'center' }}>+ Ajouter un jeu</button>
          </div>
        </div>

        {/* ── MAIN 3-COL GRID ── */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>

          {/* Compteur */}
          <div
            onClick={() => { setIsListeOpen(true); setRechercheJeu(""); }}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: isMobile ? 250 : 380, position: 'relative', overflow: 'visible', cursor: 'pointer' }}
            onMouseEnter={e => { const s = e.currentTarget.querySelector<HTMLElement>('.sticker-main'); if (s) s.style.transform = 'rotate(-3deg) scale(1.04)'; }}
            onMouseLeave={e => { const s = e.currentTarget.querySelector<HTMLElement>('.sticker-main'); if (s) s.style.transform = 'rotate(-4deg) scale(1)'; }}
          >
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.06) 1.5px,transparent 1.5px)', backgroundSize: '14px 14px', borderRadius: 10, pointerEvents: 'none' }} />
            {/* Le gros chiffre jaune : à 180px il déborderait largement d'un
                écran de téléphone, gros comme il est déjà penché de 4°. */}
            <div className="sticker-main" style={{ background: 'var(--yellow)', border: '4px solid var(--ink)', borderRadius: 22, padding: isMobile ? '20px 28px' : '32px 52px', transform: 'rotate(-4deg) scale(1)', boxShadow: isMobile ? '6px 6px 0 var(--ink)' : '10px 10px 0 var(--ink)', transition: 'transform .15s ease', textAlign: 'center', position: 'relative', zIndex: 1, userSelect: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.07) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', borderRadius: 18, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', background: 'var(--ink)', color: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 20, padding: '4px 18px', fontWeight: 700, fontSize: 14, textTransform: 'uppercase', letterSpacing: '.1em', boxShadow: '2px 2px 0 rgba(0,0,0,0.3)', whiteSpace: 'nowrap' }}>En préparation</div>
              <div className="bc" style={{ fontSize: isMobile ? 92 : 180, lineHeight: 0.88, letterSpacing: isMobile ? '-4px' : '-8px', color: 'var(--ink)', position: 'relative', zIndex: 1, marginTop: 16 }}>{formatNum(totalEnPrepa)}</div>
              <div style={{ fontSize: isMobile ? 12 : 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.12em', color: 'rgba(0,0,0,0.5)', marginTop: 10, position: 'relative', zIndex: 1 }}>Jeux en préparation</div>
              <div style={{ marginTop: 14, position: 'relative', zIndex: 1 }} onClick={e => e.stopPropagation()}>
                <input type="text" placeholder="Rechercher un jeu…" value={rechercheJeu}
                  onChange={e => { setRechercheJeu(e.target.value); setIsSearchDropdownOpen(true); }}
                  onFocus={() => setIsSearchDropdownOpen(true)}
                  style={{ width: '100%', background: 'rgba(255,255,255,0.55)', border: '2px solid rgba(0,0,0,0.18)', borderRadius: 20, padding: '6px 14px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
                {rechercheJeu && isSearchDropdownOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--white)', border: '2.5px solid var(--ink)', borderRadius: 8, boxShadow: '4px 4px 0 var(--ink)', marginTop: 6, maxHeight: 180, overflowY: 'auto', zIndex: 30, textAlign: 'left' }}>
                    {jeuxEnPrepaFiltres.length === 0 ? (
                      <div style={{ padding: '12px 14px', fontSize: 14, color: 'rgba(0,0,0,0.4)' }}>Aucun jeu trouvé</div>
                    ) : jeuxEnPrepaFiltres.map(jeu => (
                      <div key={jeu.id} onClick={() => { setRechercheJeu(jeu.nom); setIsSearchDropdownOpen(false); setIsListeOpen(true); }}
                        style={{ padding: '10px 14px', fontSize: 15, fontWeight: 600, cursor: 'pointer', borderBottom: '1.5px solid var(--cream2)' }}
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
          <div className="pop-card" style={{ background: 'var(--vert)', padding: isMobile ? 18 : 28, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.09) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="bc" style={{ fontSize: isMobile ? 24 : 32, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: isMobile ? 14 : 20 }}>Impression</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <Link href="/etiquettes"><button className="pop-btn pop-btn-dark" style={{ width: '100%', justifyContent: 'center' }}>Étiquettes →</button></Link>
                <Link href="/contenu"><button className="pop-btn" style={{ width: '100%', justifyContent: 'center', background: 'var(--white)' }}>Contenu →</button></Link>
              </div>
            </div>
          </div>

          {/* Réparation */}
          <div className="pop-card" style={{ background: 'var(--orange)', padding: isMobile ? 18 : 28, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.09) 1.2px,transparent 1.2px)', backgroundSize: '12px 12px', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div className="bc" style={{ fontSize: isMobile ? 24 : 32, textTransform: 'uppercase', letterSpacing: '.02em', marginBottom: isMobile ? 12 : 16 }}>Réparation</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { href: '/reparations', label: '🛠️ À réparer',      count: nbReparations },
                  { href: '/pieces',      label: '🧩 Jeux incomplets', count: nbManquants   },
                  { href: '/pieces',      label: '🔍 Pièces trouvées', count: nbOrphelines  },
                  { href: '/pieces-detachees', label: '🔩 Pièces détachées', count: nbDetachees },
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

        {/* ── ÉTAGÈRE DES PRÉPARATIONS ── */}
        <div className="pop-card" style={{ background: 'var(--ink)', padding: isMobile ? '18px 14px' : '28px 32px', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.05) 1px,transparent 1px)', backgroundSize: '16px 16px', pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18, borderBottom: '3px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>
              <div className="bc" style={{ fontSize: 24, textTransform: 'uppercase', letterSpacing: '.04em', color: 'rgba(255,255,255,0.55)' }}>Préparations à faire</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end', marginLeft: 'auto' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: modeGroupe ? 'var(--yellow)' : 'rgba(255,255,255,0.45)' }}>
                  {modeGroupe
                    ? `${groupe.length} jeu${groupe.length > 1 ? 'x' : ''} sélectionné${groupe.length > 1 ? 's' : ''} · clique sur les boîtes ou un en-tête d'étagère${isMobile ? '' : ', Entrée pour valider, Échap pour annuler'}`
                    : `Dans l'ordre : chaque jeu attend sur l'étagère de sa prochaine étape.${isMobile ? '' : ' Ctrl + clic pour sélectionner.'}`}
                </span>
                {modeGroupe && (
                  <button className="pop-btn" onClick={quitterModeGroupe} style={{ background: 'var(--white)', fontSize: 13, padding: '6px 12px' }}>Annuler</button>
                )}
                <button className="pop-btn" onClick={boutonGroupe} disabled={modeGroupe && groupe.length === 0}
                  style={{ background: modeGroupe ? 'var(--yellow)' : 'var(--white)', fontSize: 13, padding: '6px 14px', opacity: modeGroupe && groupe.length === 0 ? 0.5 : 1 }}>
                  {modeGroupe ? `✓ Valider (${groupe.length})` : '☑ Validation'}
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? 12 : 14 }}>
              {etapesVisuelles.map(etape => (
                <Etagere key={etape.id} etape={etape} jeux={jeuxParEtape[etape.id]} isMobile={isMobile}
                  modeGroupe={modeGroupe} groupe={groupe}
                  tuto={tutos[etape.id]} editeurTutos={editeurTutos} onEditerTuto={() => setTutoEdite(etape)}
                  onEntete={() => clicEnteteEtagere(etape.id)} onBoite={(j, e) => clicBoite(j, etape.id, e)} onFiche={ouvrirFiche} />
              ))}
              {jeuxPrets.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, background: 'rgba(168,224,99,0.15)', border: '2px dashed var(--vert)', borderRadius: 10, padding: '10px 12px' }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--vert)', textTransform: 'uppercase', letterSpacing: '.05em' }}>✓ Prêts à sortir</span>
                  {jeuxPrets.map(j => (
                    <button key={j.id} onClick={() => mettreEnStock(j)} className="pop-btn" title="Toutes les étapes sont faites : passer en stock"
                      style={{ background: 'var(--white)', fontSize: 12, padding: '4px 10px' }}>{j.nom} → En stock</button>
                  ))}
                </div>
              )}
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
                <span className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{etapeActiveInfo.num}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="bc" style={{ fontSize: 22, textTransform: 'uppercase', lineHeight: 1.1 }}>{etapeActiveInfo.nom}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(0,0,0,0.6)' }}>{etapeActiveInfo.detail}</div>
                </div>
                <span className="pop-sticker" style={{ background: 'var(--ink)', color: 'var(--white)', fontSize: 13, flexShrink: 0 }}>{jeuxPourEtapeActive.length} jeu(x)</span>
              </div>
              <button style={S.closeBtn} onClick={() => { setEtapeActive(null); setRechercheEtape(""); }}>✕</button>
            </div>
            <div style={{ padding: '16px 24px', borderBottom: '2px solid var(--cream2)' }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="text" placeholder="Rechercher par nom ou EAN…" value={rechercheEtape} onChange={e => setRechercheEtape(e.target.value)} className="pop-input" style={{ flex: 1, minWidth: 0 }} />
                <BoutonScan onScan={code => setRechercheEtape(code)} />
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {jeuxPourEtapeActive.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.4)', padding: '40px 0', fontSize: 15 }}>Aucun jeu n&apos;est arrivé à cette étape.</p>
              ) : jeuxPourEtapeActive
                .filter(j => !rechercheEtape || j.nom.toLowerCase().includes(rechercheEtape.toLowerCase()) || j.ean.includes(rechercheEtape))
                .map(jeu => (
                  <label key={jeu.id} className="pop-card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: jeuxSelectionnes.includes(jeu.id) ? 'var(--cream2)' : 'var(--white)', boxShadow: jeuxSelectionnes.includes(jeu.id) ? '4px 4px 0 var(--ink)' : '2px 2px 0 var(--ink)' }}>
                    <input type="checkbox" className="custom-cb" checked={jeuxSelectionnes.includes(jeu.id)} onChange={() => toggleSelection(jeu.id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, display: 'block' }}>{jeu.nom}</span>
                      <span style={{ fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>EAN: {jeu.ean}</span>
                    </div>
                    <PastillesJeu jeu={jeu} onFiche={ouvrirFiche} />
                  </label>
                ))
              }
            </div>
            <div style={{ padding: '16px 24px', borderTop: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button style={{ fontWeight: 700, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(0,0,0,0.5)', textDecoration: 'underline' }}
                onClick={() => setJeuxSelectionnes(jeuxPourEtapeActive.length === jeuxSelectionnes.length ? [] : jeuxPourEtapeActive.map(j => j.id))}>
                {jeuxPourEtapeActive.length === jeuxSelectionnes.length ? "Tout désélectionner" : "Tout sélectionner"}
              </button>
              <button className="pop-btn pop-btn-dark" onClick={validerSelectionEtape} disabled={jeuxSelectionnes.length === 0} style={{ opacity: jeuxSelectionnes.length === 0 ? 0.4 : 1 }}>
                ✓ Valider {jeuxSelectionnes.length > 0 ? `(${jeuxSelectionnes.length})` : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL VALIDATION GROUPÉE ══ */}
      {isGroupeOpen && (
        <ModalValidationGroupe jeux={jeuxEnPrepa.filter(j => groupe.includes(j.id))} isMobile={isMobile}
          onFermer={() => setIsGroupeOpen(false)} onEnregistrer={enregistrerGroupe} />
      )}

      {/* ══ MODAL ÉDITION D'UN TUTO ══ */}
      {tutoEdite && (
        <ModalEditionTuto etape={tutoEdite} gestes={tutos[tutoEdite.id] ?? []} isMobile={isMobile}
          onFermer={() => setTutoEdite(null)}
          onEnregistre={gestes => setTutos(prev => {
            const n = { ...prev };
            if (gestes.length) n[tutoEdite.id] = gestes; else delete n[tutoEdite.id];
            return n;
          })} />
      )}

      {/* ══ MODAL VIGNETTE / ÉTIQUETTE ══ */}
      {ficheOuverte && (
        <ModalFicheAtelier jeu={ficheOuverte.jeu} focus={ficheOuverte.focus}
          onFermer={() => setFicheOuverte(null)} onEnregistre={fetchDashboardData} />
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
                  <div style={{ display: "flex", gap: 8 }}>
                    <input ref={scanInputRef} autoFocus type="text" inputMode="numeric" placeholder="Scanner ou saisir le code…" value={scanInput} onChange={e => setScanInput(e.target.value)} onKeyDown={e => e.key === "Enter" && scannerCode()} className="pop-input" style={{ flex: 1, minWidth: 0, fontSize: 20, fontFamily: "monospace" }} />
                    <BoutonScan onScan={code => setScanInput(code)} />
                  </div>
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
                            style={{ width: 14, height: 14, borderRadius: '50%', background: c.hex, border: jeu.couleur === c.id ? '2px solid var(--ink)' : '2px solid transparent', cursor: 'pointer', transform: jeu.couleur === c.id ? 'scale(1.2)' : 'scale(1)' }} title={c.id} />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: 'rgba(0,0,0,0.4)' }}>
                      <BarcodeIcon />EAN: {jeu.ean}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {etapesVisuelles.map(etape => {
                      const estFait = etapeFaite(jeu, etape);
                      const isDouble = !etapeConcerne(jeu, etape);
                      return (
                        <button key={etape.id} disabled={isDouble} title={etape.detail}
                          onClick={() => !isDouble && toggleEtapeUnique(jeu.id, etape, estFait)}
                          style={{ background: estFait ? etape.hex : 'var(--cream2)', border: '2px solid var(--ink)', borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700, cursor: isDouble ? 'not-allowed' : 'pointer', opacity: isDouble ? 0.4 : 1, boxShadow: estFait ? '2px 2px 0 var(--ink)' : 'none', transition: 'all .1s' }}>
                          {isDouble ? '🔄 Double' : `${estFait ? '✓' : etape.num + '.'} ${etape.nom}`}
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
            <div style={{ padding: '16px 24px', borderBottom: '2px solid var(--cream2)', display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.45)', marginBottom: 6 }}>Scanner un EAN</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={eanInput} onChange={e => setEanInput(e.target.value)} onKeyDown={ajouterEan} className="pop-input" style={{ flex: 1, minWidth: 0 }} placeholder="Ex: 3770001874241" autoFocus />
                  <BoutonScan onScan={code => setEanInput(code)} />
                </div>
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
                <CarteJeuAttente key={jeu.uid} jeu={jeu} index={index} setter={setJeuxAttente}
                  editingIdx={editingIndex} setEditingIdx={setEditingIndex}
                  editingEanIdx={editingEanIndex} setEditingEanIdx={setEditingEanIndex} />
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

      {/* ══ MODAL RÉCEPTIONS ══ */}
      {isCommandesOpen && (
        <div style={S.modal}>
          <div style={{ ...S.modalBox, maxWidth: 860 }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--vert)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="bc" style={{ fontSize: 24, textTransform: 'uppercase' }}>Réceptions</span>
                <span style={{ fontSize: 14, color: 'rgba(0,0,0,0.5)', fontWeight: 600 }}>Enregistrer une commande reçue</span>
              </div>
              <button style={S.closeBtn} onClick={() => setIsCommandesOpen(false)}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>

              {/* ── Formulaire réception ── */}
              <div style={{ padding: '20px 24px', borderBottom: '3px solid var(--ink)', background: 'rgba(168,224,99,0.08)' }}>
                <div className="bc" style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(0,0,0,0.4)', marginBottom: 12 }}>
                  Jeux reçus aujourd&apos;hui — {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginBottom: 5 }}>Scanner un EAN</div>
                    <input type="text" value={eanReceptionInput} onChange={e => setEanReceptionInput(e.target.value)} onKeyDown={ajouterEanReception} className="pop-input" style={{ width: '100%' }} placeholder="Ex: 3770001874241" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'rgba(0,0,0,0.4)', marginBottom: 5 }}>Nom manuel</div>
                    <input type="text" value={manuelReceptionInput} onChange={e => setManuelReceptionInput(e.target.value)} onKeyDown={ajouterManuelReception} className="pop-input" style={{ width: '100%' }} placeholder="Nom du jeu..." />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: jeuxReception.length > 0 ? 12 : 0 }}>
                  {jeuxReception.map((jeu, index) => (
                    <CarteJeuAttente key={jeu.uid} jeu={jeu} index={index} setter={setJeuxReception}
                      editingIdx={editingReceptionIndex} setEditingIdx={setEditingReceptionIndex}
                      editingEanIdx={editingReceptionEanIndex} setEditingEanIdx={setEditingReceptionEanIndex} />
                  ))}
                </div>
                <button className="pop-btn pop-btn-dark" style={{ width: '100%', justifyContent: 'center', fontSize: 16 }}
                  onClick={validerReception}
                  disabled={jeuxReception.length === 0 || jeuxReception.some(j => j.nom.includes("⏳"))}>
                  📦 Enregistrer la réception et ajouter à l&apos;Atelier ({jeuxReception.length} jeu{jeuxReception.length > 1 ? 'x' : ''})
                </button>
              </div>

              {/* ── Historique ── */}
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="bc" style={{ fontSize: 15, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(0,0,0,0.4)' }}>Historique des réceptions</div>
                {receptions.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.3)', padding: '24px 0', fontSize: 15 }}>Aucune réception enregistrée.</p>
                ) : receptions.map((r, ri) => {
                  const ouverte = receptionsOuvertes[r.cle] ?? ri === 0;
                  const eansUniques = [...new Set(r.entrees.map(e => e.ean))];
                  const sansCouleur = eansUniques.filter(ean => ean !== 'Manuel' && !hexCouleur(infosCatalogue[ean]?.couleur)).length;
                  return (
                    <div key={r.cle} className="pop-card" style={{ padding: 0, overflow: 'hidden', background: 'var(--white)', flexShrink: 0 }}>
                      {/* En-tête de la réception */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--cream2)', borderBottom: ouverte ? '2.5px solid var(--ink)' : 'none', flexWrap: 'wrap' }}>
                        <button onClick={() => setReceptionsOuvertes(prev => ({ ...prev, [r.cle]: !ouverte }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 220px', minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', padding: 0 }}>
                          <span style={{ fontSize: 15, width: 14 }}>{ouverte ? '▾' : '▸'}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontWeight: 800, fontSize: 15, textTransform: 'capitalize' }}>{formatDate(r.date)}</span>
                            {r.notes && <span style={{ display: 'block', fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: 600 }}>{r.notes}</span>}
                          </span>
                        </button>
                        <span className="pop-sticker" style={{ fontSize: 12, background: 'var(--vert)' }}>{r.entrees.length} jeu{r.entrees.length > 1 ? 'x' : ''}</span>
                        {sansCouleur > 0 && (
                          <span className="pop-sticker" style={{ fontSize: 12, background: 'var(--white)' }} title="Jeux sans couleur au catalogue">⚪ {sansCouleur} sans couleur</span>
                        )}
                        <button className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => setReceptionCouleurs(r.cle)}>🎨 Couleurs</button>
                        <button onClick={() => supprimerReception(r)} title="Retirer cette réception de l'historique"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'rgba(0,0,0,0.35)' }}>✕</button>
                      </div>
                      {/* Grille des jeux */}
                      {ouverte && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(auto-fill, minmax(190px, 1fr))', gap: 8, padding: 12 }}>
                          {r.entrees.map(e => {
                            const info = infosCatalogue[e.ean];
                            const hex = hexCouleur(info?.couleur);
                            return (
                              <div key={e.id} className="reception-tuile" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 8, padding: '6px 8px 6px 0', overflow: 'hidden' }}>
                                <span title={info?.couleur || 'Sans couleur'} style={{ alignSelf: 'stretch', width: 7, flexShrink: 0, margin: '-6px 0', background: hex ?? 'repeating-linear-gradient(45deg, var(--cream2) 0 4px, var(--white) 4px 8px)', borderRight: '2px solid var(--ink)' }} />
                                <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 5, background: 'var(--cream2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {info?.image_url ? <img src={info.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 14 }}>🎲</span>}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div title={e.nom} style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{e.nom}</div>
                                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.ean !== 'Manuel' ? e.ean : 'saisie manuelle'}</div>
                                </div>
                                <button className="reception-retirer" onClick={() => supprimerEntreeHistorique(e.id)} title="Retirer de l'historique"
                                  style={{ position: 'absolute', top: 2, right: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'rgba(0,0,0,0.35)', padding: 0, lineHeight: 1 }}>✕</button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL COULEURS D'UNE RÉCEPTION ══ */}
      {receptionCouleurs && (() => {
        const r = receptions.find(x => x.cle === receptionCouleurs);
        if (!r) return null;
        return (
          <ModalCouleursReception reception={r} infos={infosCatalogue} isMobile={isMobile}
            onChanger={changerCouleurCatalogue}
            onFermer={() => { setReceptionCouleurs(null); fetchDashboardData(); }} />
        );
      })()}
    </div>
  );
}

/**
 * Attribuer les couleurs d'une réception : un jeu par ligne (les exemplaires
 * d'un même EAN sont regroupés, la couleur étant au catalogue), et un clic sur
 * une pastille l'enregistre tout de suite.
 */
function ModalCouleursReception({ reception, infos, isMobile, onChanger, onFermer }: {
  reception: Reception; infos: Record<string, InfoCatalogue>; isMobile: boolean;
  onChanger: (ean: string, nom: string, couleur: string) => void; onFermer: () => void;
}) {
  const [filtre, setFiltre] = useState<'tous' | 'sans' | string>('tous');
  const jeux = (() => {
    const map = new Map<string, { ean: string; nom: string; n: number }>();
    for (const e of reception.entrees) {
      if (e.ean === 'Manuel') continue;
      const x = map.get(e.ean);
      if (x) x.n++; else map.set(e.ean, { ean: e.ean, nom: e.nom, n: 1 });
    }
    return [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  })();
  const couleurDe = (ean: string) => (hexCouleur(infos[ean]?.couleur) ? couleurNormalisee(infos[ean].couleur) : '');
  const visibles = jeux.filter(j => filtre === 'tous' || (filtre === 'sans' ? !couleurDe(j.ean) : couleurDe(j.ean) === filtre));
  const compte = (c: string) => jeux.filter(j => couleurDe(j.ean) === c).length;
  const puce = (actif: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
    fontSize: 12, fontWeight: actif ? 800 : 600, border: actif ? '2px solid var(--ink)' : '2px solid rgba(0,0,0,0.15)',
    background: actif ? 'var(--yellow)' : 'var(--white)',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(var(--nav-h) + 12px) 12px 12px' }}
      onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div style={{ background: 'var(--cream)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '8px 8px 0 var(--ink)', width: '100%', maxWidth: 760, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - var(--nav-h) - 36px)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '3px solid var(--ink)', background: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc" style={{ fontSize: 22, textTransform: 'uppercase' }}>🎨 Couleurs</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.55)', textTransform: 'capitalize' }}>
              Réception du {formatDate(reception.date)} · {jeux.length} jeu{jeux.length > 1 ? 'x' : ''}
            </div>
          </div>
          <button onClick={onFermer} style={{ width: 32, height: 32, background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ padding: '10px 20px', borderBottom: '2px solid var(--ink)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={puce(filtre === 'tous')} onClick={() => setFiltre('tous')}>Tous ({jeux.length})</button>
          <button style={puce(filtre === 'sans')} onClick={() => setFiltre('sans')}>⚪ Sans couleur ({jeux.filter(j => !couleurDe(j.ean)).length})</button>
          {COULEURS.map(c => (
            <button key={c.id} style={puce(filtre === c.id)} onClick={() => setFiltre(c.id)}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: c.hex, border: '1.5px solid var(--ink)' }} />{c.label} ({compte(c.id)})
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {visibles.length === 0 && <p style={{ textAlign: 'center', color: 'rgba(0,0,0,0.35)', padding: '24px 0', fontWeight: 600 }}>Aucun jeu dans ce filtre.</p>}
          {visibles.map(j => {
            const actuelle = couleurDe(j.ean);
            return (
              <div key={j.ean} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 6, background: 'var(--cream2)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${hexCouleur(actuelle) ?? 'var(--cream2)'}` }}>
                  {infos[j.ean]?.image_url ? <img src={infos[j.ean].image_url!} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span>🎲</span>}
                </div>
                <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.25 }}>{j.nom}{j.n > 1 && <span style={{ fontWeight: 600, color: 'rgba(0,0,0,0.45)' }}> ×{j.n}</span>}</div>
                  <div style={{ fontSize: 10, color: 'rgba(0,0,0,0.35)', fontFamily: 'monospace' }}>{j.ean}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {COULEURS.map(c => {
                    const actif = actuelle === c.id;
                    return (
                      <button key={c.id} onClick={() => onChanger(j.ean, j.nom, actif ? '' : c.id)} title={actif ? `${c.label} (cliquer pour retirer)` : c.label}
                        style={{ width: 28, height: 28, borderRadius: '50%', background: c.hex, cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 900,
                          border: actif ? '3px solid var(--ink)' : '2px solid rgba(0,0,0,0.25)', boxShadow: actif ? '2px 2px 0 var(--ink)' : 'none',
                          transform: actif ? 'scale(1.1)' : 'none', opacity: actuelle && !actif ? 0.45 : 1 }}>{actif ? '✓' : ''}</button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: '12px 20px', borderTop: '3px solid var(--ink)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.5)', flex: 1 }}>Chaque clic est enregistré tout de suite, pour tous les exemplaires du jeu.</span>
          <button className="pop-btn pop-btn-dark" onClick={onFermer}>Terminé</button>
        </div>
      </div>
    </div>
  );
}

// ─── Étagère des préparations ────────────────────────────────────────────────

/**
 * Une étagère par étape : un bloc de la couleur de l'étape, sur toute la
 * largeur, avec son numéro et son nom en tête et les boîtes des jeux qui en sont
 * à cette étape posées sur sa planche. Cliquer sur l'en-tête ouvre la
 * validation ; cliquer sur une boîte l'ouvre avec ce jeu déjà coché.
 */
function Etagere({ etape, jeux, isMobile, modeGroupe, groupe, onEntete, onBoite, onFiche, tuto, editeurTutos, onEditerTuto }: {
  etape: EtapeAtelier; jeux: JeuType[]; isMobile: boolean;
  modeGroupe: boolean; groupe: (string | number)[];
  tuto?: GesteTuto[]; editeurTutos: boolean; onEditerTuto: () => void;
  onEntete: () => void; onBoite: (jeu: JeuType, e: React.MouseEvent) => void;
  onFiche: (jeu: JeuType, focus: FocusFiche) => void;
}) {
  const vide = jeux.length === 0;
  const tousPris = !vide && jeux.every(j => groupe.includes(j.id));
  const [tutoOuvert, setTutoOuvert] = useState(false);
  // La bulle couvre une partie de la page : un clic ailleurs ou Échap la referme.
  const bulleRef = useRef<HTMLDivElement>(null);
  const boutonTutoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!tutoOuvert) return;
    const clic = (e: PointerEvent) => {
      const cible = e.target as Node;
      if (!bulleRef.current?.contains(cible) && !boutonTutoRef.current?.contains(cible)) setTutoOuvert(false);
    };
    const touche = (e: KeyboardEvent) => { if (e.key === 'Escape') setTutoOuvert(false); };
    document.addEventListener('pointerdown', clic);
    document.addEventListener('keydown', touche);
    return () => { document.removeEventListener('pointerdown', clic); document.removeEventListener('keydown', touche); };
  }, [tutoOuvert]);
  // En bas de la liste, la bulle déborderait du cadre noir qui la rogne : elle
  // s'ouvre alors au-dessus de l'étagère, la queue vers le bas.
  const [versLeHaut, setVersLeHaut] = useState(false);
  useLayoutEffect(() => {
    if (!tutoOuvert) { setVersLeHaut(false); return; }
    const bulle = bulleRef.current, etagere = bulle?.parentElement;
    const cadre = etagere?.closest('.pop-card') ?? null;
    if (!bulle || !etagere) return;
    const h = bulle.offsetHeight;
    const r = etagere.getBoundingClientRect();
    const bas = cadre ? cadre.getBoundingClientRect().bottom : window.innerHeight;
    const haut = cadre ? cadre.getBoundingClientRect().top : 0;
    const placeDessous = bas - (r.top + (isMobile ? 46 : 54)) - 8;
    const placeDessus = r.top - haut - 8;
    setVersLeHaut(h > placeDessous && placeDessus > placeDessous);
  }, [tutoOuvert, isMobile]);
  return (
    <div style={{ background: etape.hex, border: '2.5px solid var(--ink)', borderRadius: 12, boxShadow: '4px 4px 0 rgba(0,0,0,0.4)', position: 'relative', zIndex: tutoOuvert ? 5 : undefined }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 10, backgroundImage: 'radial-gradient(circle,rgba(0,0,0,0.07) 1px,transparent 1px)', backgroundSize: '10px 10px', pointerEvents: 'none' }} />

      {/* En-tête de l'étagère */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, padding: isMobile ? '8px 12px 0' : '10px 16px 0' }}>
        <button onClick={onEntete} title={modeGroupe ? (tousPris ? 'Retirer toute l\'étagère de la sélection' : 'Sélectionner toute l\'étagère') : `Valider l'étape ${etape.num} : ${etape.detail}`}
          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: 0,
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', color: 'var(--ink)' }}>
          <span className="bc" style={{ fontSize: isMobile ? 28 : 36, lineHeight: 1, flexShrink: 0 }}>{etape.num}</span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: isMobile ? 13 : 15, textTransform: 'uppercase', letterSpacing: '.03em', lineHeight: 1.15 }}>{etape.nom}</span>
            <span style={{ display: 'block', fontSize: isMobile ? 11 : 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)', lineHeight: 1.2 }}>{etape.detail}</span>
          </span>
          {modeGroupe && !vide && (
            <span style={{ fontSize: 12, fontWeight: 800, flexShrink: 0, background: tousPris ? 'var(--ink)' : 'rgba(255,255,255,0.6)', color: tousPris ? 'var(--white)' : 'var(--ink)', border: '2px solid var(--ink)', borderRadius: 20, padding: '3px 10px' }}>
              {tousPris ? '✓ Toute l\'étagère' : '+ Toute l\'étagère'}
            </span>
          )}
        </button>
        {editeurTutos && (
          <button onClick={onEditerTuto} title={tuto?.length ? `Modifier le tuto de l'étape ${etape.num}` : `Ajouter un tuto à l'étape ${etape.num}`}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: '2px dashed var(--ink)', borderRadius: 20, padding: '4px 11px', color: 'var(--ink)', background: 'rgba(255,255,255,0.45)' }}>
            ✏️ {isMobile ? '' : (tuto?.length ? 'Modifier' : 'Ajouter un tuto')}
          </button>
        )}
        {!!tuto?.length && (
          <button ref={boutonTutoRef} onClick={() => setTutoOuvert(o => !o)} aria-expanded={tutoOuvert} className={`bouton-tuto${tutoOuvert ? ' ouvert' : ''}`}
            title={tutoOuvert ? 'Replier le tuto' : `Comment faire l'étape ${etape.num}`} aria-label={tutoOuvert ? 'Replier le tuto' : `Tuto de l'étape ${etape.num}`}
            style={{ flexShrink: 0, width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--ink)', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 15, fontWeight: 900, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: tutoOuvert ? 'var(--ink)' : 'transparent', color: tutoOuvert ? 'var(--white)' : 'var(--ink)' }}>?</button>
        )}
        <span className="pop-sticker" style={{ background: 'var(--ink)', color: 'var(--white)', fontSize: 13, flexShrink: 0 }}>{jeux.length}</span>
      </div>

      {/* Le tuto flotte par-dessus l'étagère (et la suivante) sans la faire grandir. */}
      {!!tuto?.length && tutoOuvert && (
        <div ref={bulleRef} className={`tuto-bulle${versLeHaut ? ' vers-le-haut' : ''}`} style={{ position: 'absolute', ...(versLeHaut ? { bottom: 'calc(100% - 6px)' } : { top: isMobile ? 46 : 54 }), right: isMobile ? 8 : 16, zIndex: 30, maxWidth: isMobile ? 'calc(100% - 16px)' : 'calc(100% - 32px)' }}>
          <TutoEtape etape={etape} gestes={tuto} isMobile={isMobile} versLeHaut={versLeHaut} onFermer={() => setTutoOuvert(false)} />
        </div>
      )}

      {/* Les boîtes, posées sur la planche (estompée quand elle est vide) */}
      <div style={{ position: 'relative', opacity: vide ? 0.6 : 1 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 14, background: 'rgba(0,0,0,0.22)', borderTop: '2.5px solid var(--ink)', borderRadius: '0 0 10px 10px' }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: isMobile ? 14 : 20, overflowX: 'auto', overflowY: 'hidden', padding: isMobile ? '14px 14px 10px' : '16px 22px 10px', minHeight: vide ? 56 : (isMobile ? 120 : 146), position: 'relative' }}>
          {vide ? (
            <span style={{ alignSelf: 'center', fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.4)', fontStyle: 'italic' }}>Étagère vide</span>
          ) : jeux.map(j => (
            <BoiteJeu key={j.id} jeu={j} isMobile={isMobile} onClick={e => onBoite(j, e)} onFiche={onFiche}
              modeGroupe={modeGroupe} selectionne={groupe.includes(j.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Le tuto d'une étape, déplié dans son étagère : les gestes dans l'ordre, chacun
 * avec son illustration.
 */
function TutoEtape({ etape, gestes, isMobile, versLeHaut = false, onFermer }: { etape: EtapeAtelier; gestes: GesteTuto[]; isMobile: boolean; versLeHaut?: boolean; onFermer: () => void }) {
  // Illustrations carrées (1:1) ; une image d'un autre format y tient entière.
  const cote = isMobile ? 160 : 210;
  return (
    <div style={{ position: 'relative', width: 'fit-content', maxWidth: '100%', minWidth: 0, background: 'var(--cream)', border: '2.5px solid var(--ink)', borderRadius: 16, boxShadow: '4px 4px 0 rgba(0,0,0,0.35)', padding: isMobile ? '10px 10px 12px' : '12px 16px 14px' }}>
      {/* Queue de la bulle, vers le bouton « ? » (dessus ou dessous selon le sens) */}
      {versLeHaut ? (<>
        <span aria-hidden style={{ position: 'absolute', bottom: -13, right: isMobile ? 40 : 50, width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent', borderTop: '13px solid var(--ink)' }} />
        <span aria-hidden style={{ position: 'absolute', bottom: -8.5, right: isMobile ? 43 : 53, width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: '9.5px solid var(--cream)' }} />
      </>) : (<>
        <span aria-hidden style={{ position: 'absolute', top: -13, right: isMobile ? 40 : 50, width: 0, height: 0, borderLeft: '11px solid transparent', borderRight: '11px solid transparent', borderBottom: '13px solid var(--ink)' }} />
        <span aria-hidden style={{ position: 'absolute', top: -8.5, right: isMobile ? 43 : 53, width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: '9.5px solid var(--cream)' }} />
      </>)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
        <span className="bc" style={{ fontSize: isMobile ? 15 : 17, textTransform: 'uppercase', flex: 1, minWidth: 0 }}>📖 Tuto · étape {etape.num}</span>
        <button onClick={onFermer} title="Replier le tuto" style={{ width: 24, height: 24, flexShrink: 0, background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>✕</button>
      </div>
      <ol style={{ listStyle: 'none', margin: 0, display: 'flex', alignItems: 'stretch', gap: isMobile ? 8 : 12, overflowX: 'auto', padding: '12px 4px 4px 12px' }}>
        {gestes.map((g, i) => (
          <li key={g.image} style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, flex: '0 0 auto' }}>
            <figure style={{ margin: 0, width: cote, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <img src={g.image} alt={g.titre} loading="lazy" style={{ width: cote, height: cote, objectFit: 'contain', display: 'block', borderRadius: 14, border: '2.5px solid var(--ink)', background: '#f7f1e6' }} />
                <span className="bc" style={{ position: 'absolute', top: -9, left: -9, width: 34, height: 34, borderRadius: '50%', background: etape.hex, border: '2.5px solid var(--ink)', boxShadow: '2px 2px 0 var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{i + 1}</span>
              </div>
              <figcaption style={{ maxWidth: cote }}>
                <span style={{ display: 'block', fontWeight: 800, fontSize: isMobile ? 13 : 15, lineHeight: 1.2 }}>{g.titre}</span>
                {g.texte && <span style={{ display: 'block', fontSize: isMobile ? 11 : 12, fontWeight: 600, color: 'rgba(0,0,0,0.55)', marginTop: 2 }}>{g.texte}</span>}
              </figcaption>
            </figure>
            {i < gestes.length - 1 && <span aria-hidden style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>→</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * La boîte d'un jeu, en 3D : face avant (vignette, ou boîte vierge de la couleur
 * du jeu avec son nom), tranche droite et dessus. Les pastilles restent à plat
 * par-dessus pour rester lisibles.
 */
function BoiteJeu({ jeu, isMobile, onClick, onFiche, modeGroupe = false, selectionne = false }: {
  jeu: JeuType; isMobile: boolean; onClick: (e: React.MouseEvent) => void; onFiche: (jeu: JeuType, focus: FocusFiche) => void;
  modeGroupe?: boolean; selectionne?: boolean;
}) {
  const hex = hexCouleur(jeu.couleur);
  const fond = hex ?? '#e9e4d8';
  const w = isMobile ? 64 : 78, h = isMobile ? 82 : 100, d = isMobile ? 18 : 24;
  const face: React.CSSProperties = { position: 'absolute', border: '2px solid var(--ink)', boxSizing: 'border-box', backfaceVisibility: 'hidden' };
  return (
    <button onClick={onClick} title={`${jeu.nom}${jeu.is_double ? ' (double)' : ''}`} className={`boite-jeu${selectionne ? ' boite-jeu-choisie' : ''}`}
      aria-pressed={modeGroupe ? selectionne : undefined}
      style={{ position: 'relative', flexShrink: 0, width: w + d * 0.6, height: h + d * 0.4, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', perspective: 700,
        opacity: modeGroupe && !selectionne ? 0.7 : 1, transition: 'opacity .15s' }}>
      <span className="boite-jeu-3d" style={{ position: 'absolute', left: 0, bottom: 0, width: w, height: h, transformStyle: 'preserve-3d', transform: 'rotateX(-22deg) rotateY(-30deg)', transformOrigin: `50% 100% ${-d / 2}px`, transition: 'transform .18s ease' }}>
        {/* Face avant */}
        <span style={{ ...face, inset: 0, width: w, height: h, transform: `translateZ(${d / 2}px)`, background: jeu.image_url ? 'var(--white)' : fond, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 2 }}>
          {jeu.image_url ? (
            <img src={jeu.image_url} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <span style={{ padding: '4px 5px', fontSize: isMobile ? 10 : 11, fontWeight: 800, lineHeight: 1.15, color: 'var(--ink)', textAlign: 'center', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', hyphens: 'auto', overflowWrap: 'anywhere' }} lang="fr">{jeu.nom}</span>
          )}
          {jeu.image_url && hex && <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, background: hex, borderTop: '1.5px solid var(--ink)' }} />}
        </span>
        {/* Tranche droite */}
        <span style={{ ...face, top: 0, left: (w - d) / 2, width: d, height: h, transform: `rotateY(90deg) translateZ(${w / 2}px)`, background: fond, filter: 'brightness(0.72)' }} />
        {/* Dessus */}
        <span style={{ ...face, backfaceVisibility: 'visible', left: 0, top: 0, width: w, height: d, transformOrigin: '50% 0', transform: `translateZ(${d / 2}px) rotateX(-90deg)`, background: fond, filter: 'brightness(1.12)' }} />
      </span>
      {!!jeu.is_double && <span title="Double" style={{ position: 'absolute', top: 4, left: -6, zIndex: 2, ...pastilleStyle('var(--bleu)') }}>2×</span>}
      <PastillesJeu jeu={jeu} flottantes onFiche={onFiche} />
      {modeGroupe && (
        <span aria-hidden style={{ position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%)', zIndex: 3, width: 22, height: 22, borderRadius: '50%',
          border: '2.5px solid var(--ink)', background: selectionne ? 'var(--ink)' : 'var(--white)', color: 'var(--yellow)', fontSize: 13, fontWeight: 900,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '2px 2px 0 rgba(0,0,0,0.35)' }}>{selectionne ? '✓' : ''}</span>
      )}
    </button>
  );
}

const pastilleStyle = (bg: string): React.CSSProperties => ({
  minWidth: 18, height: 18, padding: '0 4px', borderRadius: 9, background: bg, border: '1.5px solid var(--ink)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 900, lineHeight: 1, color: 'var(--ink)',
});

/**
 * Pastilles d'un jeu : les numéros des étapes déjà faites en avance, et ce qui
 * reste à remplir à côté des étapes (vignette, étiquette).
 */
function PastillesJeu({ jeu, flottantes = false, onFiche }: {
  jeu: JeuType; flottantes?: boolean; onFiche: (jeu: JeuType, focus: FocusFiche) => void;
}) {
  const enAvance = etapesEnAvance(jeu);
  const manques = [
    !jeu.image_url && { cle: 'vignette' as const, icone: '🖼', titre: 'Vignette à ajouter' },
    !jeu.etiquette_ok && { cle: 'etiquette' as const, icone: '🏷', titre: "Infos d'étiquette à compléter" },
  ].filter(Boolean) as { cle: FocusFiche; icone: string; titre: string }[];
  if (!enAvance.length && !manques.length) return null;

  const avance = enAvance.length > 0 && (
    <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end', ...(flottantes ? { position: 'absolute', top: 4, right: -4, zIndex: 2 } : {}) }}>
      {enAvance.map(e => <span key={e.id} title={`Étape ${e.num} déjà faite : ${e.nom}`} style={pastilleStyle(e.hex)}>{e.num}</span>)}
    </span>
  );
  const aFaire = manques.length > 0 && (
    <span style={{ display: 'flex', gap: 2, ...(flottantes ? { position: 'absolute', bottom: -6, right: -6, zIndex: 2 } : {}) }}>
      {manques.map(m => (
        <span key={m.cle} role="button" tabIndex={0} title={`${m.titre} (cliquer pour remplir)`} className="pastille-fiche"
          onClick={e => { e.preventDefault(); e.stopPropagation(); onFiche(jeu, m.cle); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onFiche(jeu, m.cle); } }}
          style={{ ...pastilleStyle('var(--white)'), fontSize: 10, cursor: 'pointer' }}>{m.icone}</span>
      ))}
    </span>
  );
  if (flottantes) return <>{avance}{aFaire}</>;
  return <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{avance}{aFaire}</span>;
}

// ─── Validation groupée ──────────────────────────────────────────────────────

/**
 * Les jeux choisis sur l'étagère, en lignes, et les étapes en colonnes. Chaque
 * case se coche à la main ; l'en-tête d'une colonne valide cette étape et toutes
 * les précédentes pour tous les jeux (un second clic, la colonne déjà pleine,
 * la décoche). Rien n'est enregistré avant « Enregistrer ».
 */
function ModalValidationGroupe({ jeux, isMobile, onFermer, onEnregistrer }: {
  jeux: JeuType[]; isMobile: boolean; onFermer: () => void;
  onEnregistrer: (etats: Record<string, Record<string, boolean>>) => Promise<void>;
}) {
  const initial = () => Object.fromEntries(jeux.map(j => [String(j.id), Object.fromEntries(ETAPES_ATELIER.filter(e => etapeConcerne(j, e)).map(e => [e.id, etapeFaite(j, e)]))]));
  const [etats, setEtats] = useState<Record<string, Record<string, boolean>>>(initial);
  const [enCours, setEnCours] = useState(false);

  const fait = (j: JeuType, e: EtapeAtelier) => !!etats[String(j.id)]?.[e.id];
  const change = (j: JeuType, e: EtapeAtelier) => etapeConcerne(j, e) && fait(j, e) !== etapeFaite(j, e);
  const nbChangements = jeux.reduce((n, j) => n + ETAPES_ATELIER.filter(e => change(j, e)).length, 0);

  const basculer = (j: JeuType, e: EtapeAtelier) =>
    setEtats(prev => ({ ...prev, [String(j.id)]: { ...prev[String(j.id)], [e.id]: !prev[String(j.id)]?.[e.id] } }));

  const colonnePleine = (e: EtapeAtelier) => {
    const concernes = jeux.filter(j => etapeConcerne(j, e));
    return concernes.length > 0 && concernes.every(j => fait(j, e));
  };

  /** En-tête de colonne : l'étape et les précédentes pour tous ; colonne déjà pleine → on la décoche. */
  const clicColonne = (e: EtapeAtelier) => {
    const decocher = colonnePleine(e);
    setEtats(prev => {
      const n = { ...prev };
      for (const j of jeux) {
        const ligne = { ...n[String(j.id)] };
        for (const x of ETAPES_ATELIER) {
          if (!etapeConcerne(j, x)) continue;
          if (decocher) { if (x.id === e.id) ligne[x.id] = false; }
          else if (x.num <= e.num) ligne[x.id] = true;
        }
        n[String(j.id)] = ligne;
      }
      return n;
    });
  };

  const fermer = () => { if (!nbChangements || confirm('Fermer sans enregistrer ?')) onFermer(); };
  const enregistrer = async () => { setEnCours(true); await onEnregistrer(etats); setEnCours(false); };

  const caseW = isMobile ? 40 : 64;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'calc(var(--nav-h) + 12px) 12px 12px' }}
      onClick={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div style={{ background: 'var(--cream)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '8px 8px 0 var(--ink)', width: '100%', maxWidth: 1000, display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - var(--nav-h) - 36px)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '3px solid var(--ink)', background: 'var(--yellow)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc" style={{ fontSize: 22, textTransform: 'uppercase' }}>Validation groupée</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(0,0,0,0.55)' }}>
              {jeux.length} jeu{jeux.length > 1 ? 'x' : ''} · coche les étapes faites, ou clique sur une colonne pour la valider avec les précédentes
            </div>
          </div>
          <button onClick={fermer} style={{ width: 32, height: 32, flexShrink: 0, background: 'var(--ink)', color: 'var(--white)', border: '2px solid var(--ink)', borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? 8 : 16 }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', minWidth: (isMobile ? 130 : 220) + caseW * ETAPES_ATELIER.length }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 3, background: 'var(--cream)', textAlign: 'left', padding: '0 8px 8px 4px', fontSize: 12, fontWeight: 800, textTransform: 'uppercase', color: 'rgba(0,0,0,0.45)', verticalAlign: 'bottom' }}>Jeu</th>
                {ETAPES_ATELIER.map(e => {
                  const pleine = colonnePleine(e);
                  return (
                    <th key={e.id} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--cream)', padding: '0 3px 8px', width: caseW, verticalAlign: 'bottom' }}>
                      <button onClick={() => clicColonne(e)}
                        title={pleine ? `Décocher l'étape ${e.num} pour tous` : `Valider les étapes 1 à ${e.num} pour tous : ${e.detail}`}
                        style={{ width: '100%', minHeight: isMobile ? 44 : 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
                          background: e.hex, border: '2.5px solid var(--ink)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)', padding: '4px 2px',
                          boxShadow: pleine ? 'inset 0 0 0 2px var(--ink)' : '2px 2px 0 var(--ink)' }}>
                        <span className="bc" style={{ fontSize: isMobile ? 18 : 22, lineHeight: 1 }}>{e.num}</span>
                        {!isMobile && <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.1, textAlign: 'center' }}>{e.nom}</span>}
                        <span style={{ fontSize: 10, fontWeight: 900 }}>{pleine ? '✓ tous' : '→ tous'}</span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {jeux.map(j => (
                <tr key={j.id}>
                  <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'var(--cream)', padding: '5px 8px 5px 4px', borderTop: '1.5px solid var(--cream2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 28, height: 36, flexShrink: 0, borderRadius: 3, border: '2px solid var(--ink)', overflow: 'hidden', background: hexCouleur(j.couleur) ?? '#e9e4d8', display: 'flex' }}>
                        {j.image_url && <img src={j.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      </span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontWeight: 700, fontSize: isMobile ? 12 : 14, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: isMobile ? 'normal' : 'nowrap', maxWidth: isMobile ? 110 : 260 }}>{j.nom}</span>
                        {!!j.is_double && <span style={{ fontSize: 10, fontWeight: 800, color: 'rgba(0,0,0,0.45)' }}>Double</span>}
                      </span>
                    </div>
                  </td>
                  {ETAPES_ATELIER.map(e => {
                    if (!etapeConcerne(j, e)) {
                      return <td key={e.id} title="Pas pour un double" style={{ textAlign: 'center', borderTop: '1.5px solid var(--cream2)', color: 'rgba(0,0,0,0.25)', fontSize: 12, fontWeight: 800 }}>—</td>;
                    }
                    const coche = fait(j, e), modifie = change(j, e);
                    return (
                      <td key={e.id} style={{ textAlign: 'center', padding: '5px 3px', borderTop: '1.5px solid var(--cream2)' }}>
                        <button onClick={() => basculer(j, e)} aria-pressed={coche}
                          title={`${e.num}. ${e.nom}${modifie ? (coche ? ' : sera validée' : ' : sera décochée') : coche ? ' : déjà faite' : ''}`}
                          style={{ width: isMobile ? 30 : 34, height: isMobile ? 30 : 34, borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 900,
                            border: modifie ? '2.5px dashed var(--ink)' : '2px solid var(--ink)',
                            background: coche ? e.hex : 'var(--white)', color: 'var(--ink)',
                            opacity: coche && !modifie ? 0.55 : 1, boxShadow: modifie ? '2px 2px 0 var(--ink)' : 'none' }}>
                          {coche ? '✓' : ''}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ padding: '12px 20px', borderTop: '3px solid var(--ink)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(0,0,0,0.5)', flex: '1 1 220px' }}>
            Cases pâles : déjà faites · cases en pointillés : modifiées.{nbChangements ? ` ${nbChangements} changement${nbChangements > 1 ? 's' : ''}.` : ''}
          </span>
          <button className="pop-btn pop-btn-outline" onClick={fermer}>Retour</button>
          <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!nbChangements || enCours} style={{ opacity: !nbChangements ? 0.4 : 1 }}>
            {enCours ? 'Enregistrement…' : '✓ Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
