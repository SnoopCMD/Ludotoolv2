"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type PieceManquante = { id: number; ean: string; nom: string; element_manquant: string; statut: string; };
type PieceTrouvee   = { id: number; description: string; nom_suppose: string; statut: string; };

type Editeur = {
  id: string;
  nom: string;
  type_commande: "formulaire" | "email" | "inconnu" | "impossible";
  url_formulaire: string | null;
  email_contact:  string | null;
  sujet_email:    string | null;
  corps_email:    string | null;
  notes:          string | null;
};

type CommandeGroupe = {
  nomEditeur:  string;
  editeur:     Editeur | null;
  pieces:      PieceManquante[];
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const TYPES_PIECES = [
  { id: "carte",   label: "🃏 Cartes",   keywords: ["carte", "cartes"] },
  { id: "pion",    label: "♟️ Pions",    keywords: ["pion", "pions", "meeple", "figurine", "personnage", "jeton personnage"] },
  { id: "jeton",   label: "🪙 Jetons",   keywords: ["jeton", "jetons", "pièce", "piece", "ressource", "marqueur"] },
  { id: "de",      label: "🎲 Dés",      keywords: ["dé", "dés", "de", "des"] },
  { id: "plateau", label: "🗺️ Plateaux", keywords: ["plateau", "plateaux", "support", "tuile", "tuiles", "planche"] },
  { id: "regle",   label: "📖 Règles",   keywords: ["règle", "regle", "livret", "notice"] },
  { id: "cube",    label: "🧊 Cubes",    keywords: ["cube", "cubes", "bloc"] },
  { id: "bille",   label: "🔮 Billes",   keywords: ["bille", "billes", "boule"] },
];

const TYPE_LABELS: Record<Editeur["type_commande"], string> = {
  formulaire: "Formulaire",
  email:      "Email",
  inconnu:    "Non configuré",
  impossible: "Commande impossible",
};

const TYPE_COLORS: Record<Editeur["type_commande"], string> = {
  formulaire: "bg-blue-100 text-blue-700",
  email:      "bg-violet-100 text-violet-700",
  inconnu:    "bg-slate-100 text-slate-500",
  impossible: "bg-red-100 text-red-600",
};

const CORPS_EMAIL_DEFAUT = `Bonjour,

Nous sommes une ludothèque et souhaitons commander des pièces manquantes pour les jeux suivants :

{pieces_liste}

Pourriez-vous nous indiquer la procédure à suivre ou directement traiter cette demande ?

Merci d'avance,
La Ludothèque`;

const normaliser = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/s$/, "").trim();

const normaliserEditeur = (str: string) =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// ─── Composant ────────────────────────────────────────────────────────────────

export default function PiecesPage() {
  const [manquantes,     setManquantes]     = useState<PieceManquante[]>([]);
  const [trouvees,       setTrouvees]       = useState<PieceTrouvee[]>([]);
  const [filtreType,     setFiltreType]     = useState<string | null>(null);

  // Ajout pièce manquante
  const [codeManq,       setCodeManq]       = useState("");
  const [nomManq,        setNomManq]        = useState("");
  const [contenuJeu,     setContenuJeu]     = useState<string[]>([]);
  const [qteManq,        setQteManq]        = useState<number | "">("");
  const [itemManq,       setItemManq]       = useState("");
  const [elemManqManuel, setElemManqManuel] = useState("");
  const [saisieManuelle, setSaisieManuelle] = useState(false);
  const [suggestionsNom, setSuggestionsNom] = useState<{nom: string; code_syracuse: string; ean: string}[]>([]);

  // Ajout pièce trouvée
  const [descTrouvee, setDescTrouvee] = useState("");
  const [nomSuppo,    setNomSuppo]    = useState("");

  // Sélection / fusion
  const [selectedManquant, setSelectedManquant]   = useState<number | null>(null);
  const [selectedTrouvees, setSelectedTrouvees]   = useState<number[]>([]);

  // Confirmation après commande
  const [pendingConfirmId, setPendingConfirmId]   = useState<number | null>(null);

  // Confirmation de liaison partielle/totale
  const [lienConfirm, setLienConfirm] = useState<{
    qteManquante: number;
    qteTrouvee: number;
    nomPiece: string;
  } | null>(null);

  // Type d'éditeur par pièce (résolu au chargement pour griser les boutons)
  const [editeurTypeParPiece, setEditeurTypeParPiece] = useState<Record<number, Editeur["type_commande"] | null>>({});

  // ── Modal Commander ──────────────────────────────────────────────────────
  const [isCommandeOpen,   setIsCommandeOpen]   = useState(false);
  const [commandeGroupes,  setCommandeGroupes]  = useState<CommandeGroupe[]>([]);
  const [commandeLoading,  setCommandeLoading]  = useState(false);
  const [emailGroupeIdx,   setEmailGroupeIdx]   = useState<number | null>(null);
  const [emailSujet,       setEmailSujet]       = useState("");
  const [emailCorps,       setEmailCorps]       = useState("");

  // ── Modal Éditeurs CRUD ──────────────────────────────────────────────────
  const [isEditeursOpen,    setIsEditeursOpen]    = useState(false);
  const [editeurs,          setEditeurs]          = useState<Editeur[]>([]);
  const [editeurEdit,       setEditeurEdit]       = useState<Partial<Editeur> & { _nomOriginal?: string } | null>(null);
  const [isSavingEditeur,   setIsSavingEditeur]   = useState(false);
  const [filtreEditeur,     setFiltreEditeur]     = useState("");
  const [fusionSourceId,    setFusionSourceId]    = useState<string | null>(null);
  const [fusionCibleId,     setFusionCibleId]     = useState<string>("");
  const [isFusioning,       setIsFusioning]       = useState(false);

  // ─── Chargement ──────────────────────────────────────────────────────────

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    const { data: d1 } = await supabase.from("pieces_manquantes").select("*").in("statut", ["Manquant", "Commandé"]).order("id", { ascending: false });
    const { data: d2 } = await supabase.from("pieces_trouvees").select("*").eq("statut", "En attente").order("id", { ascending: false });
    if (d1) setManquantes(d1);
    if (d2) setTrouvees(d2);
    if (d1) resoudreTypesEditeurs(d1);
  };

  const resoudreTypesEditeurs = async (pieces: PieceManquante[]) => {
    const { data: editeursData } = await supabase.from("editeurs").select("*");
    const listeEditeurs = (editeursData ?? []) as Editeur[];
    const types: Record<number, Editeur["type_commande"] | null> = {};
    await Promise.all(pieces.filter(p => p.statut === "Manquant").map(async p => {
      const nomCat = await trouverEditeurPourPiece(p);
      const ed = nomCat ? matcherEditeur(nomCat, listeEditeurs) : null;
      types[p.id] = ed?.type_commande ?? null;
    }));
    setEditeurTypeParPiece(types);
  };

  const chargerEditeurs = async () => {
    const { data } = await supabase.from("editeurs").select("*").order("nom");
    if (data) setEditeurs(data as Editeur[]);
  };

  // ─── Recherche éditeur pour une pièce ────────────────────────────────────

  const trouverEditeurPourPiece = async (piece: PieceManquante): Promise<string | null> => {
    // 1. Via code_syracuse stocké dans piece.ean
    if (piece.ean) {
      const { data: jeu } = await supabase.from("jeux").select("ean").eq("code_syracuse", piece.ean).limit(1).maybeSingle();
      if (jeu?.ean) {
        const { data: cat } = await supabase.from("catalogue").select("editeur").eq("ean", jeu.ean).maybeSingle();
        if (cat?.editeur) return cat.editeur;
      }
    }
    // 2. Fallback via nom du jeu
    const { data: jeuParNom } = await supabase.from("jeux").select("ean").ilike("nom", piece.nom).limit(1).maybeSingle();
    if (jeuParNom?.ean) {
      const { data: cat } = await supabase.from("catalogue").select("editeur").eq("ean", jeuParNom.ean).maybeSingle();
      if (cat?.editeur) return cat.editeur;
    }
    return null;
  };

  const matcherEditeur = (nomEditeurCat: string, listeEditeurs: Editeur[]): Editeur | null => {
    const norm = normaliserEditeur(nomEditeurCat);
    return listeEditeurs.find(e => normaliserEditeur(e.nom) === norm) ?? null;
  };

  // ─── Ouverture modal commander ────────────────────────────────────────────

  const ouvrirCommande = async () => {
    setCommandeLoading(true);
    setIsCommandeOpen(true);
    setEmailGroupeIdx(null);

    const piecesMandantes = manquantes.filter(m => m.statut === "Manquant");
    const { data: editeursData } = await supabase.from("editeurs").select("*").order("nom");
    const listeEditeurs = (editeursData ?? []) as Editeur[];

    // Résoudre l'éditeur pour chaque pièce
    const resolved: { piece: PieceManquante; nomEditeur: string; editeur: Editeur | null }[] = [];
    await Promise.all(piecesMandantes.map(async piece => {
      const nomEditeurCat = await trouverEditeurPourPiece(piece);
      const nomEditeur = nomEditeurCat ?? "Éditeur inconnu";
      const editeur = nomEditeurCat ? matcherEditeur(nomEditeurCat, listeEditeurs) : null;
      resolved.push({ piece, nomEditeur, editeur });
    }));

    // Grouper par éditeur
    const groupMap = new Map<string, CommandeGroupe>();
    for (const { piece, nomEditeur, editeur } of resolved) {
      const key = nomEditeur;
      if (!groupMap.has(key)) groupMap.set(key, { nomEditeur, editeur, pieces: [] });
      groupMap.get(key)!.pieces.push(piece);
    }

    // Trier : configurés en premier, inconnus à la fin
    const groupes = [...groupMap.values()].sort((a, b) => {
      const scoreA = a.editeur ? (a.editeur.type_commande === "inconnu" ? 1 : 0) : 2;
      const scoreB = b.editeur ? (b.editeur.type_commande === "inconnu" ? 1 : 0) : 2;
      return scoreA - scoreB;
    });

    setCommandeGroupes(groupes);
    setCommandeLoading(false);
  };

  // ─── Email ────────────────────────────────────────────────────────────────

  const interpolerTemplate = (template: string, groupe: CommandeGroupe): string => {
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const piecesListe = groupe.pieces.map(p => `- ${p.nom} : ${p.element_manquant}`).join("\n");
    return template
      .replace(/{pieces_liste}/g, piecesListe)
      .replace(/{date}/g, date)
      .replace(/{editeur}/g, groupe.nomEditeur);
  };

  const ouvrirEmail = (idx: number) => {
    const groupe = commandeGroupes[idx];
    const sujetDefaut = `Commande de pièces manquantes – ${groupe.nomEditeur}`;
    const corpsDefaut = CORPS_EMAIL_DEFAUT;
    setEmailSujet(groupe.editeur?.sujet_email ?? sujetDefaut);
    setEmailCorps(interpolerTemplate(groupe.editeur?.corps_email ?? corpsDefaut, groupe));
    setEmailGroupeIdx(idx);
  };

  const buildMailto = (groupe: CommandeGroupe): string => {
    const to      = groupe.editeur?.email_contact ?? "";
    const subject = encodeURIComponent(emailSujet);
    const body    = encodeURIComponent(emailCorps);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  const marquerGroupeCommande = async (groupe: CommandeGroupe) => {
    for (const piece of groupe.pieces) {
      await supabase.from("pieces_manquantes").update({ statut: "Commandé" }).eq("id", piece.id);
    }
    setCommandeGroupes(prev => prev.map(g =>
      g.nomEditeur === groupe.nomEditeur
        ? { ...g, pieces: g.pieces.map(p => ({ ...p, statut: "Commandé" })) }
        : g
    ));
    chargerDonnees();
  };

  // ─── Ouvrir config éditeur depuis modal Commander ─────────────────────────

  const ouvrirConfigEditeur = async (groupe: CommandeGroupe) => {
    const { data } = await supabase.from("editeurs").select("*").order("nom");
    const liste = (data ?? []) as Editeur[];
    setEditeurs(liste);
    if (groupe.editeur) {
      setEditeurEdit({ ...groupe.editeur, _nomOriginal: groupe.editeur.nom });
    } else {
      setEditeurEdit({ nom: groupe.nomEditeur, type_commande: "inconnu" });
    }
    setIsEditeursOpen(true);
  };

  // ─── CRUD éditeurs ────────────────────────────────────────────────────────

  const sauvegarderEditeur = async () => {
    if (!editeurEdit?.nom?.trim()) return;
    setIsSavingEditeur(true);
    const nomOriginal = editeurEdit._nomOriginal;
    const nomNouveau  = editeurEdit.nom.trim();
    if (editeurEdit.id) {
      await supabase.from("editeurs").update({
        nom: nomNouveau, type_commande: editeurEdit.type_commande,
        url_formulaire: editeurEdit.url_formulaire || null,
        email_contact: editeurEdit.email_contact || null,
        sujet_email: editeurEdit.sujet_email || null,
        corps_email: editeurEdit.corps_email || null,
        notes: editeurEdit.notes || null,
      }).eq("id", editeurEdit.id);
      // Propager le renommage dans le catalogue
      if (nomOriginal && nomOriginal !== nomNouveau) {
        await supabase.from("catalogue").update({ editeur: nomNouveau }).eq("editeur", nomOriginal);
      }
    } else {
      await supabase.from("editeurs").insert({
        nom: nomNouveau, type_commande: editeurEdit.type_commande ?? "inconnu",
        url_formulaire: editeurEdit.url_formulaire || null,
        email_contact: editeurEdit.email_contact || null,
        sujet_email: editeurEdit.sujet_email || null,
        corps_email: editeurEdit.corps_email || null,
        notes: editeurEdit.notes || null,
      });
    }
    await chargerEditeurs();
    setEditeurEdit(null);
    setIsSavingEditeur(false);
    if (isCommandeOpen) ouvrirCommande();
  };

  const fusionnerEditeur = async () => {
    if (!fusionSourceId || !fusionCibleId || fusionSourceId === fusionCibleId) return;
    const source = editeurs.find(e => e.id === fusionSourceId);
    const cible  = editeurs.find(e => e.id === fusionCibleId);
    if (!source || !cible) return;
    if (!confirm(`Fusionner "${source.nom}" → "${cible.nom}" ?\nToutes les fiches catalogue seront mises à jour.`)) return;
    setIsFusioning(true);
    // Mettre à jour le catalogue
    await supabase.from("catalogue").update({ editeur: cible.nom }).eq("editeur", source.nom);
    // Supprimer l'éditeur source
    await supabase.from("editeurs").delete().eq("id", fusionSourceId);
    setFusionSourceId(null);
    setFusionCibleId("");
    await chargerEditeurs();
    setIsFusioning(false);
  };

  const supprimerEditeur = async (id: string) => {
    if (!confirm("Supprimer cet éditeur ?")) return;
    await supabase.from("editeurs").delete().eq("id", id);
    chargerEditeurs();
  };

  const [isImporting, setIsImporting] = useState(false);

  const importerEditeursDepuisCatalogue = async () => {
    setIsImporting(true);
    // 1. Récupérer tous les éditeurs du catalogue
    const { data: catData } = await supabase.from("catalogue").select("editeur").not("editeur", "is", null).neq("editeur", "");
    // 2. Récupérer les éditeurs déjà en base
    const { data: existants } = await supabase.from("editeurs").select("nom");
    const nomsExistants = new Set((existants ?? []).map((e: { nom: string }) => normaliserEditeur(e.nom)));

    // 3. Dédupliquer : normaliser, garder la première occurrence "propre" de chaque nom
    const vus = new Map<string, string>(); // normalisé → nom affiché
    for (const row of (catData ?? [])) {
      const raw: string = row.editeur ?? "";
      // Nettoyer la casse : capitalize first letter of each word
      const propre = raw.trim().replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(\w)/g, (_m, c) => c);
      const norm = normaliserEditeur(raw);
      if (!vus.has(norm)) vus.set(norm, propre);
    }

    // 4. Filtrer ceux qui n'existent pas encore
    const aInserer = [...vus.entries()]
      .filter(([norm]) => !nomsExistants.has(norm))
      .map(([, nom]) => ({ nom, type_commande: "inconnu" as const }));

    if (aInserer.length > 0) {
      await supabase.from("editeurs").insert(aInserer);
    }

    await chargerEditeurs();
    setIsImporting(false);
    alert(`${aInserer.length} éditeur(s) importé(s).`);
  };

  // ─── Helpers existants ────────────────────────────────────────────────────

  const verifierMatch = (m: PieceManquante, t: PieceTrouvee) => {
    const matchNom  = t.nom_suppose && normaliser(m.nom).includes(normaliser(t.nom_suppose));
    const mNum = parseInt(m.element_manquant) || 0;
    const tNum = parseInt(t.description) || 0;
    const mTexte = normaliser(m.element_manquant.replace(/^\d+\s*/, ""));
    const tTexte = normaliser(t.description.replace(/^\d+\s*/, ""));
    const matchPiece = (mNum === tNum) && mNum > 0 && (mTexte.includes(tTexte) || tTexte.includes(mTexte));
    return matchNom || matchPiece;
  };

  const manquantesTriees = useMemo(() => {
    return manquantes.map(m => {
      const aUnMatchGeneral = trouvees.some(t => verifierMatch(m, t));
      const isSuggestion = selectedTrouvees.length > 0
        ? selectedTrouvees.some(tId => { const t = trouvees.find(tr => tr.id === tId); return t ? verifierMatch(m, t) : false; })
        : false;
      return { ...m, hasMatch: aUnMatchGeneral, isSuggestion };
    }).sort((a, b) => {
      if (a.statut === "Commandé" && b.statut !== "Commandé") return 1;
      if (a.statut !== "Commandé" && b.statut === "Commandé") return -1;
      if (selectedTrouvees.length > 0) return Number(b.isSuggestion) - Number(a.isSuggestion);
      return 0;
    });
  }, [manquantes, trouvees, selectedTrouvees]);

  const trouveesTriees = useMemo(() => {
    let liste = [...trouvees];
    if (filtreType) {
      const cat = TYPES_PIECES.find(t => t.id === filtreType);
      if (cat) liste = liste.filter(t => cat.keywords.some(kw => normaliser(t.description).includes(kw)));
    }
    return liste.map(t => {
      const isSuggestion = selectedManquant
        ? (() => { const m = manquantes.find(ma => ma.id === selectedManquant); return m ? verifierMatch(m, t) : false; })()
        : false;
      return { ...t, isSuggestion };
    }).sort((a, b) => selectedManquant ? Number(b.isSuggestion) - Number(a.isSuggestion) : 0);
  }, [trouvees, manquantes, selectedManquant, filtreType]);

  const fetchContenuJeu = async (ean: string) => {
    if (!ean) { setContenuJeu([]); return; }
    const { data } = await supabase.from("catalogue").select("contenu").eq("ean", ean).maybeSingle();
    if (data?.contenu) {
      const items = data.contenu.split("\n").map((l: string) => l.replace(/^[\s\-\*\u2022]*\d*\s*/, "").trim()).filter((l: string) => l.length > 0);
      setContenuJeu(items);
      if (items.length > 0) { setItemManq(items[0]); setSaisieManuelle(false); }
    } else { setContenuJeu([]); setSaisieManuelle(true); }
  };

  const chercherNom = async (code: string) => {
    if (!code) return;
    let codeF = code.trim();
    if (/^\d+$/.test(codeF) && codeF.length < 8) codeF = codeF.padStart(8, "0");
    const { data } = await supabase.from("jeux").select("nom, ean").eq("code_syracuse", codeF).limit(1).maybeSingle();
    if (data?.nom) { setNomManq(data.nom); if (data.ean) fetchContenuJeu(data.ean); }
  };

  const handleRechercheNom = async (text: string) => {
    setNomManq(text);
    if (text.length > 2) {
      const { data } = await supabase.from("jeux").select("nom, code_syracuse, ean").ilike("nom", `%${text}%`).order("nom").limit(20);
      if (data) setSuggestionsNom(data);
    } else setSuggestionsNom([]);
  };

  const selectionnerSuggestion = (jeu: {nom: string; code_syracuse: string; ean: string}) => {
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
    await supabase.from("pieces_manquantes").insert([{ ean: codeManq, nom: nomManq, element_manquant: pieceFinale }]);
    setCodeManq(""); setNomManq(""); setElemManqManuel(""); setQteManq(""); setContenuJeu([]); setSuggestionsNom([]);
    chargerDonnees();
  };

  const ajouterTrouve = async () => {
    if (!descTrouvee) return;
    if (!/^\d+/.test(descTrouvee.trim())) { alert("⚠️ La description doit commencer par un chiffre."); return; }
    await supabase.from("pieces_trouvees").insert([{ description: descTrouvee, nom_suppose: nomSuppo }]);
    setDescTrouvee(""); setNomSuppo(""); chargerDonnees();
  };

  const commanderPieceDirecte = async (piece: PieceManquante) => {
    const { data: editeursData } = await supabase.from("editeurs").select("*").order("nom");
    const listeEditeurs = (editeursData ?? []) as Editeur[];
    const nomEditeurCat = await trouverEditeurPourPiece(piece);
    const editeur = nomEditeurCat ? matcherEditeur(nomEditeurCat, listeEditeurs) : null;

    if (editeur?.type_commande === "impossible") {
      return; // bouton grisé, ne devrait pas arriver
    } else if (editeur?.type_commande === "formulaire" && editeur.url_formulaire) {
      window.open(editeur.url_formulaire, "_blank");
      setPendingConfirmId(piece.id);
    } else {
      ouvrirCommande();
    }
  };

  const confirmerCommande = async (id: number, confirme: boolean) => {
    if (confirme) {
      await supabase.from("pieces_manquantes").update({ statut: "Commandé" }).eq("id", id);
      chargerDonnees();
    }
    setPendingConfirmId(null);
  };

  const annulerCommande = async (id: number) => {
    await supabase.from("pieces_manquantes").update({ statut: "Manquant" }).eq("id", id);
    chargerDonnees();
  };

  const resoudreManquant = async (id: number) => {
    await supabase.from("pieces_manquantes").update({ statut: "Résolu" }).eq("id", id);
    if (selectedManquant === id) setSelectedManquant(null);
    chargerDonnees();
  };

  const resoudreTrouve = async (id: number) => {
    await supabase.from("pieces_trouvees").update({ statut: "Réaffecté" }).eq("id", id);
    setSelectedTrouvees(prev => prev.filter(tId => tId !== id));
    chargerDonnees();
  };

  const extraireQte = (texte: string): { qte: number; nom: string } => {
    const m = texte.trim().match(/^(\d+)\s*(.*)/);
    return m ? { qte: parseInt(m[1]), nom: m[2].trim() } : { qte: 1, nom: texte.trim() };
  };

  const lierElements = () => {
    if (!selectedManquant || selectedTrouvees.length === 0) return;
    const pieceManq = manquantes.find(m => m.id === selectedManquant);
    if (!pieceManq) return;

    const { qte: qteManquante, nom: nomPiece } = extraireQte(pieceManq.element_manquant);
    const qteTrouvee = selectedTrouvees.reduce((sum, tId) => {
      const t = trouvees.find(tr => tr.id === tId);
      return sum + (t ? extraireQte(t.description).qte : 0);
    }, 0);

    setLienConfirm({ qteManquante, qteTrouvee, nomPiece });
  };

  const confirmerLien = async (total: boolean) => {
    if (!selectedManquant || !lienConfirm) return;
    for (const tId of selectedTrouvees) {
      await supabase.from("pieces_trouvees").update({ statut: "Réaffecté" }).eq("id", tId);
    }
    if (total) {
      await supabase.from("pieces_manquantes").update({ statut: "Résolu" }).eq("id", selectedManquant);
    } else {
      const reste = lienConfirm.qteManquante - lienConfirm.qteTrouvee;
      const nouveauTexte = `${Math.max(reste, 1)} ${lienConfirm.nomPiece}`;
      await supabase.from("pieces_manquantes").update({ element_manquant: nouveauTexte }).eq("id", selectedManquant);
    }
    setLienConfirm(null);
    setSelectedManquant(null);
    setSelectedTrouvees([]);
    chargerDonnees();
  };

  const nbManquant = manquantes.filter(m => m.statut === "Manquant").length;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 15,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };

  const pillBtn = (active: boolean, color: string): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 20, fontSize: 13, fontWeight: 700,
    border: "2px solid var(--ink)", cursor: "pointer", fontFamily: "inherit",
    whiteSpace: "nowrap",
    background: active ? color : "var(--white)",
    color: "var(--ink)", boxShadow: active ? "2px 2px 0 var(--ink)" : "none",
    transition: "all 0.1s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>

      {/* Mini sticky header */}
      <header style={{
        position: "sticky", top: 0, zIndex: 200, height: 56,
        background: "var(--cream)", borderBottom: "2.5px solid var(--ink)",
        display: "flex", alignItems: "center", padding: "0 24px", gap: 16,
      }}>
        <Link href="/atelier" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: "var(--ink)", color: "var(--cream)",
          border: "2px solid var(--ink)", borderRadius: 6, padding: "4px 12px",
          fontWeight: 700, fontSize: 14, textDecoration: "none",
          boxShadow: "2px 2px 0 rgba(0,0,0,0.3)", fontFamily: "inherit",
        }}>← Atelier</Link>
        <h1 className="bc" style={{
          fontSize: 24, letterSpacing: "0.03em", margin: 0,
          background: "linear-gradient(90deg, var(--rouge), var(--vert))",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
        }}>Pièces manquantes</h1>
        {nbManquant > 0 && (
          <button onClick={ouvrirCommande}
            className="pop-btn pop-btn-dark"
            style={{ marginLeft: "auto", padding: "5px 14px", fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <span className="bc" style={{ fontSize: 15 }}>📬 Commander ({nbManquant})</span>
          </button>
        )}
        <button onClick={() => { chargerEditeurs(); setIsEditeursOpen(true); }}
          style={{
            ...(nbManquant > 0 ? {} : { marginLeft: "auto" }),
            background: "var(--cream2)", border: "2px solid var(--ink)",
            borderRadius: 6, padding: "5px 12px", fontSize: 14, fontWeight: 700,
            cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)", fontFamily: "inherit",
          }}>
          ⚙️ Éditeurs
        </button>
      </header>

      <main style={{ padding: "20px 24px", display: "flex", gap: 20, alignItems: "flex-start", flex: 1, flexWrap: "wrap" }}>

        {/* ── JEUX INCOMPLETS ── */}
        <div className="pop-card" style={{
          flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 16,
          borderTop: "4px solid var(--rouge)", padding: "20px 22px",
        }}>
          <p className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Jeux incomplets</p>

          {/* Formulaire ajout */}
          <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 10 }}>
              <input type="text" placeholder="Code Syracuse..." value={codeManq}
                onChange={e => setCodeManq(e.target.value)} onBlur={() => chercherNom(codeManq)}
                style={{ ...inp, width: 140, flexShrink: 0 }} />
              <div style={{ flex: 1, position: "relative" }}>
                <input type="text" placeholder="Nom du jeu..." value={nomManq}
                  onChange={e => handleRechercheNom(e.target.value)}
                  style={{ ...inp, fontWeight: 700 }} />
                {suggestionsNom.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4,
                    background: "var(--white)", border: "2px solid var(--ink)",
                    borderRadius: 8, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden",
                  }}>
                    {suggestionsNom.map((jeu, i) => (
                      <div key={i} onClick={() => selectionnerSuggestion(jeu)}
                        style={{ padding: "9px 14px", cursor: "pointer", fontWeight: 700, fontSize: 15, borderBottom: "1px solid var(--cream2)", display: "flex", justifyContent: "space-between" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--cream2)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jeu.nom}</span>
                        {jeu.code_syracuse && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", flexShrink: 0, marginLeft: 8 }}>…{jeu.code_syracuse.slice(-4)}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {contenuJeu.length > 0 && !saisieManuelle ? (
                <>
                  <input type="number" placeholder="Qté" value={qteManq}
                    onChange={e => setQteManq(Number(e.target.value))}
                    style={{ ...inp, width: 64, textAlign: "center", fontWeight: 700 }} min="1" />
                  <select value={itemManq} onChange={e => setItemManq(e.target.value)}
                    style={{ ...inp, flex: 1 }}>
                    {contenuJeu.map((item, idx) => <option key={idx} value={item}>{item}</option>)}
                  </select>
                  <button onClick={() => setSaisieManuelle(true)}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.4)", textDecoration: "underline", fontFamily: "inherit" }}>
                    Manuel
                  </button>
                </>
              ) : (
                <input type="text" placeholder="Pièce (ex: 1 dé rouge)..." value={elemManqManuel}
                  onChange={e => setElemManqManuel(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && ajouterManquant()}
                  style={{ ...inp, flex: 1 }} />
              )}
              <button onClick={ajouterManquant}
                disabled={!nomManq || (saisieManuelle ? !elemManqManuel : !qteManq)}
                className="pop-btn"
                style={{ background: "var(--rouge)", border: "2px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", padding: "8px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: (!nomManq || (saisieManuelle ? !elemManqManuel : !qteManq)) ? 0.4 : 1 }}>
                Ajouter
              </button>
            </div>
          </div>

          {/* Liste */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 520 }}>
            {manquantesTriees.map(m => {
              const isSelected   = selectedManquant === m.id;
              const isSuggestion = m.isSuggestion && selectedTrouvees.length > 0 && !isSelected;
              const isCommande   = m.statut === "Commandé";
              const isImpossible = editeurTypeParPiece[m.id] === "impossible";
              return (
                <div key={m.id}
                  onClick={() => !isCommande && setSelectedManquant(isSelected ? null : m.id)}
                  style={{
                    padding: "12px 16px", borderRadius: 8, cursor: isCommande ? "default" : "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap",
                    border: `2px solid ${isSelected ? "var(--rouge)" : isSuggestion ? "var(--rouge)" : isCommande ? "var(--cream2)" : "var(--ink)"}`,
                    background: isSelected ? "#fff0f4" : isSuggestion ? "#fff5f7" : isCommande ? "var(--cream2)" : "var(--white)",
                    boxShadow: isSelected ? "3px 3px 0 var(--rouge)" : isCommande ? "none" : "2px 2px 0 var(--ink)",
                    borderStyle: isSuggestion && !isSelected ? "dashed" : "solid",
                    opacity: isCommande ? 0.7 : 1,
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, fontSize: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.nom}</span>
                      {m.ean && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.35)" }}>{m.ean.slice(-4)}</span>}
                      {isImpossible && <span style={{ fontSize: 12, fontWeight: 800, background: "#fff0f0", color: "var(--rouge)", border: "1.5px solid var(--rouge)", borderRadius: 6, padding: "1px 7px" }}>🚫 Indisponible</span>}
                      {isCommande && <span style={{ fontSize: 12, fontWeight: 800, background: "var(--orange)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 6, padding: "1px 7px", boxShadow: "1px 1px 0 var(--ink)" }}>📦 Commandé</span>}
                      {m.hasMatch && !isSuggestion && !isCommande && <span title="Une pièce correspondante a été trouvée !">💡</span>}
                      {isSuggestion && !isCommande && <span style={{ fontSize: 12, fontWeight: 800, background: "var(--white)", color: "var(--rouge)", border: "1.5px solid var(--rouge)", borderRadius: 20, padding: "1px 8px" }}>✨ Suggestion</span>}
                    </div>
                    <p style={{ color: isCommande ? "rgba(0,0,0,0.4)" : "var(--rouge)", fontWeight: 700, fontSize: 14, margin: 0 }}>{m.element_manquant}</p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap" }}>
                    {pendingConfirmId === m.id ? (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)", alignSelf: "center" }}>Commande envoyée ?</span>
                        <button onClick={e => { e.stopPropagation(); confirmerCommande(m.id, true); }} style={{ background: "var(--vert)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Oui ✓</button>
                        <button onClick={e => { e.stopPropagation(); confirmerCommande(m.id, false); }} style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Non</button>
                      </>
                    ) : isCommande ? (
                      <>
                        <button onClick={e => { e.stopPropagation(); resoudreManquant(m.id); }} style={{ background: "var(--vert)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "1px 1px 0 var(--ink)" }}>📦 Reçue ✓</button>
                        <button onClick={e => { e.stopPropagation(); annulerCommande(m.id); }} style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Annuler</button>
                      </>
                    ) : (
                      <>
                        <button onClick={e => { e.stopPropagation(); if (!isImpossible) commanderPieceDirecte(m); }}
                          disabled={isImpossible}
                          style={{ background: isImpossible ? "var(--cream2)" : "var(--orange)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 700, cursor: isImpossible ? "not-allowed" : "pointer", fontFamily: "inherit", boxShadow: isImpossible ? "none" : "1px 1px 0 var(--ink)", opacity: isImpossible ? 0.5 : 1 }}>
                          {isImpossible ? "🚫 Indisponible" : "🛒 Commander"}
                        </button>
                        <button onClick={e => { e.stopPropagation(); resoudreManquant(m.id); }} style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 10px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>✕</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            {manquantes.length === 0 && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "24px 0" }}>Aucun jeu incomplet !</p>}
          </div>
        </div>

        {/* ── PIÈCES ORPHELINES ── */}
        <div className="pop-card" style={{
          flex: 1, minWidth: 340, display: "flex", flexDirection: "column", gap: 16,
          borderTop: "4px solid var(--vert)", padding: "20px 22px",
        }}>
          <p className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Pièces orphelines</p>

          {/* Formulaire ajout */}
          <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 10, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <input type="text" placeholder="Description (ex: 1 bille noire)..." value={descTrouvee}
              onChange={e => setDescTrouvee(e.target.value)} style={{ ...inp, fontWeight: 700 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" placeholder="Jeu supposé (optionnel)..." value={nomSuppo}
                onChange={e => setNomSuppo(e.target.value)}
                onKeyDown={e => e.key === "Enter" && ajouterTrouve()}
                style={{ ...inp, flex: 1 }} />
              <button onClick={ajouterTrouve} disabled={!descTrouvee}
                className="pop-btn"
                style={{ background: "var(--vert)", border: "2px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", padding: "8px 18px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: !descTrouvee ? 0.4 : 1 }}>
                Ajouter
              </button>
            </div>
          </div>

          {/* Filtres type */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button onClick={() => setFiltreType(null)} style={pillBtn(filtreType === null, "var(--vert)")}>Tous</button>
            {TYPES_PIECES.map(type => (
              <button key={type.id} onClick={() => setFiltreType(type.id === filtreType ? null : type.id)}
                style={pillBtn(filtreType === type.id, "var(--vert)")}>
                {type.label}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", maxHeight: 520 }}>
            {trouveesTriees.map(t => {
              const isSelected   = selectedTrouvees.includes(t.id);
              const isSuggestion = t.isSuggestion && selectedManquant !== null && !isSelected;
              return (
                <div key={t.id}
                  onClick={() => setSelectedTrouvees(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                  style={{
                    padding: "12px 16px", borderRadius: 8, cursor: "pointer",
                    display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
                    border: `2px solid ${isSelected ? "var(--vert)" : isSuggestion ? "var(--vert)" : "var(--ink)"}`,
                    background: isSelected ? "#f0fff4" : isSuggestion ? "#f6fff0" : "var(--white)",
                    boxShadow: isSelected ? "3px 3px 0 var(--vert)" : "2px 2px 0 var(--ink)",
                    borderStyle: isSuggestion && !isSelected ? "dashed" : "solid",
                  }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 16 }}>{t.description}</span>
                      {isSuggestion && <span style={{ fontSize: 12, fontWeight: 800, background: "var(--white)", color: "var(--vert)", border: "1.5px solid var(--vert)", borderRadius: 20, padding: "1px 8px" }}>✨ Suggestion</span>}
                    </div>
                    {t.nom_suppose && <p style={{ color: "rgba(0,0,0,0.45)", fontSize: 14, margin: "3px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Peut-être : <em>{t.nom_suppose}</em></p>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); resoudreTrouve(t.id); }}
                    style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 6, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                    Retirer ✕
                  </button>
                </div>
              );
            })}
            {trouvees.length === 0 && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "24px 0" }}>Le bac des pièces seules est vide !</p>}
            {trouvees.length > 0 && trouveesTriees.length === 0 && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "24px 0" }}>Aucune pièce ne correspond à ce filtre.</p>}
          </div>
        </div>
      </main>

      {/* ── Barre fusion flottante ── */}
      {selectedManquant !== null && selectedTrouvees.length > 0 && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "var(--ink)", color: "var(--white)",
          padding: "16px 32px", borderRadius: 40,
          boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          display: "flex", alignItems: "center", gap: 20, zIndex: 50,
          border: "2.5px solid var(--ink)",
        }}>
          <span style={{ fontWeight: 700, fontSize: 18, whiteSpace: "nowrap" }}>🔗 Lier 1 jeu et {selectedTrouvees.length} pièce(s) ?</span>
          <button onClick={lierElements}
            style={{ background: "var(--vert)", color: "var(--ink)", border: "2px solid var(--vert)", borderRadius: 10, padding: "8px 20px", fontWeight: 900, fontSize: 15, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            Valider la fusion ✓
          </button>
        </div>
      )}

      {/* ── Popup confirmation liaison partielle/totale ── */}
      {lienConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ background: "var(--white)", width: "100%", maxWidth: 440, padding: 32, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ textAlign: "center" }}>
              <p className="bc" style={{ fontSize: 24, margin: "0 0 4px", letterSpacing: "0.02em" }}>Liaison des pièces</p>
              <p style={{ fontSize: 15, color: "rgba(0,0,0,0.45)", margin: 0 }}>
                {lienConfirm.qteTrouvee} trouvée{lienConfirm.qteTrouvee > 1 ? "s" : ""} sur {lienConfirm.qteManquante} manquante{lienConfirm.qteManquante > 1 ? "s" : ""} · <strong>{lienConfirm.nomPiece}</strong>
              </p>
            </div>

            {/* Résumé visuel */}
            <div style={{ background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: "var(--vert)", margin: 0 }}>{lienConfirm.qteTrouvee}</p>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: 0, fontWeight: 700 }}>trouvée{lienConfirm.qteTrouvee > 1 ? "s" : ""}</p>
              </div>
              <span style={{ fontSize: 24, color: "rgba(0,0,0,0.2)", fontWeight: 900 }}>/</span>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 28, fontWeight: 900, color: "var(--ink)", margin: 0 }}>{lienConfirm.qteManquante}</p>
                <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: 0, fontWeight: 700 }}>manquante{lienConfirm.qteManquante > 1 ? "s" : ""}</p>
              </div>
              {lienConfirm.qteManquante - lienConfirm.qteTrouvee > 0 && (
                <>
                  <span style={{ fontSize: 24, color: "rgba(0,0,0,0.2)", fontWeight: 900 }}>=</span>
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: 28, fontWeight: 900, color: "var(--rouge)", margin: 0 }}>{lienConfirm.qteManquante - lienConfirm.qteTrouvee}</p>
                    <p style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", margin: 0, fontWeight: 700 }}>restante{lienConfirm.qteManquante - lienConfirm.qteTrouvee > 1 ? "s" : ""}</p>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lienConfirm.qteManquante - lienConfirm.qteTrouvee > 0 && (
                <button onClick={() => confirmerLien(false)}
                  style={{ width: "100%", padding: "12px 20px", borderRadius: 10, background: "var(--rouge)", color: "var(--white)", border: "2.5px solid var(--ink)", boxShadow: "3px 3px 0 var(--ink)", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                  Résolution partielle — garder le jeu ({lienConfirm.qteManquante - lienConfirm.qteTrouvee} restante{lienConfirm.qteManquante - lienConfirm.qteTrouvee > 1 ? "s" : ""})
                </button>
              )}
              <button onClick={() => confirmerLien(true)}
                style={{ width: "100%", padding: "12px 20px", borderRadius: 10, background: "var(--ink)", color: "var(--white)", border: "2.5px solid var(--ink)", boxShadow: "3px 3px 0 rgba(0,0,0,0.3)", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                Résolution totale — retirer le jeu ✓
              </button>
              <button onClick={() => setLienConfirm(null)}
                style={{ width: "100%", padding: "10px 20px", borderRadius: 10, background: "var(--cream2)", color: "var(--ink)", border: "2px solid var(--ink)", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Commander ── */}
      {isCommandeOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ background: "var(--white)", width: "100%", maxWidth: 640, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>Commander les pièces</h2>
                <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", margin: "2px 0 0", fontWeight: 600 }}>Groupé par éditeur</p>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { chargerEditeurs(); setIsEditeursOpen(true); }}
                  style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)" }}>
                  ⚙️ Gérer éditeurs
                </button>
                <button onClick={() => { setIsCommandeOpen(false); setEmailGroupeIdx(null); }}
                  style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, fontWeight: 900, cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)", fontFamily: "inherit" }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Corps */}
            <div style={{ overflowY: "auto", flex: 1, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              {commandeLoading ? (
                <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", padding: "48px 0", fontWeight: 700 }}>Recherche des éditeurs…</p>
              ) : commandeGroupes.length === 0 ? (
                <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", padding: "48px 0", fontWeight: 700 }}>Aucune pièce à commander.</p>
              ) : (
                commandeGroupes.map((groupe, idx) => {
                  const tc = groupe.editeur?.type_commande ?? "inconnu";
                  const toutCommande = groupe.pieces.every(p => p.statut === "Commandé");
                  const tcBg: Record<string, string> = { formulaire: "var(--bleu)", email: "var(--purple)", inconnu: "var(--cream2)", impossible: "var(--rouge)" };
                  const tcColor: Record<string, string> = { formulaire: "var(--white)", email: "var(--white)", inconnu: "var(--ink)", impossible: "var(--white)" };
                  return (
                    <div key={idx} style={{ border: `2px solid ${toutCommande ? "var(--cream2)" : "var(--ink)"}`, borderRadius: 12, overflow: "hidden", opacity: toutCommande ? 0.6 : 1, boxShadow: toutCommande ? "none" : "3px 3px 0 var(--ink)" }}>
                      {/* En-tête groupe */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", background: "var(--cream2)", borderBottom: "1.5px solid var(--ink)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 15 }}>{groupe.nomEditeur}</span>
                          <span style={{ fontSize: 12, fontWeight: 800, background: tcBg[tc] ?? "var(--cream2)", color: tcColor[tc] ?? "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>{TYPE_LABELS[tc]}</span>
                          {toutCommande && <span style={{ fontSize: 12, fontWeight: 800, background: "var(--vert)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>✓ Commandé</span>}
                        </div>
                        <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>{groupe.pieces.length} pièce{groupe.pieces.length > 1 ? "s" : ""}</span>
                      </div>

                      {/* Liste des pièces */}
                      <ul style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 4, margin: 0, listStyle: "none" }}>
                        {groupe.pieces.map(p => (
                          <li key={p.id} style={{ fontSize: 15, display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
                            <span style={{ color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>→ {p.element_manquant}</span>
                            {p.statut === "Commandé" && <span style={{ fontSize: 12, fontWeight: 800, background: "var(--orange)", color: "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>Commandé</span>}
                          </li>
                        ))}
                      </ul>

                      {/* Actions groupe */}
                      {!toutCommande && (
                        <div style={{ padding: "0 16px 14px", display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {tc === "formulaire" && groupe.editeur?.url_formulaire && (
                            <a href={groupe.editeur.url_formulaire} target="_blank" rel="noopener noreferrer"
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "var(--bleu)", color: "var(--white)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700, textDecoration: "none", boxShadow: "2px 2px 0 var(--ink)" }}>
                              🔗 Ouvrir le formulaire ↗
                            </a>
                          )}
                          {tc === "email" && (
                            <button onClick={() => emailGroupeIdx === idx ? setEmailGroupeIdx(null) : ouvrirEmail(idx)}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, background: "var(--purple)", color: "var(--white)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)" }}>
                              ✉️ {emailGroupeIdx === idx ? "Masquer l'email" : "Rédiger l'email"}
                            </button>
                          )}
                          {tc === "inconnu" && (
                            <span style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontStyle: "italic", alignSelf: "center" }}>
                              Éditeur non configuré — <button onClick={() => ouvrirConfigEditeur(groupe)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, textDecoration: "underline", fontFamily: "inherit", fontSize: 13 }}>Configurer ↗</button>
                            </span>
                          )}
                          {tc === "impossible" && (
                            <span style={{ fontSize: 13, color: "var(--rouge)", fontStyle: "italic", alignSelf: "center", display: "flex", gap: 4 }}>
                              🚫 Cet éditeur ne fournit plus de pièces — <button onClick={() => ouvrirConfigEditeur(groupe)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, textDecoration: "underline", fontFamily: "inherit", fontSize: 13, color: "var(--rouge)" }}>Modifier ↗</button>
                            </span>
                          )}
                          <button onClick={() => marquerGroupeCommande(groupe)}
                            style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, background: "var(--cream2)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                            Marquer commandé ✓
                          </button>
                        </div>
                      )}

                      {/* Zone email dépliable */}
                      {emailGroupeIdx === idx && (
                        <div style={{ borderTop: "2px solid var(--ink)", padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 12, background: "#f3f0ff" }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>À</label>
                            <input readOnly value={groupe.editeur?.email_contact ?? ""} style={{ ...inp, fontFamily: "monospace", color: "rgba(0,0,0,0.55)", background: "var(--cream2)" }} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Objet</label>
                            <input value={emailSujet} onChange={e => setEmailSujet(e.target.value)} style={inp} />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Corps</label>
                            <textarea value={emailCorps} onChange={e => setEmailCorps(e.target.value)} rows={8}
                              style={{ ...inp, fontFamily: "monospace", resize: "vertical" }} />
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <a href={buildMailto(groupe)}
                              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: "var(--purple)", color: "var(--white)", border: "2px solid var(--ink)", fontSize: 14, fontWeight: 700, textDecoration: "none", boxShadow: "2px 2px 0 var(--ink)" }}>
                              ✉️ Ouvrir dans Outlook
                            </a>
                            <button onClick={() => marquerGroupeCommande(groupe)}
                              style={{ padding: "8px 16px", borderRadius: 8, background: "var(--cream2)", border: "2px solid var(--ink)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              Marquer commandé ✓
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
        </div>
      )}

      {/* ── Modal Éditeurs CRUD ── */}
      {isEditeursOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}>
          <div className="pop-card" style={{ background: "var(--white)", width: "100%", maxWidth: 640, maxHeight: "calc(100vh - 96px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>
                  Éditeurs <span style={{ fontSize: 16, fontWeight: 400, color: "rgba(0,0,0,0.35)" }}>({editeurs.length})</span>
                </h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={importerEditeursDepuisCatalogue} disabled={isImporting}
                    style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)", opacity: isImporting ? 0.5 : 1 }}>
                    {isImporting ? "…" : "⬇ Importer catalogue"}
                  </button>
                  <button onClick={() => setEditeurEdit({ type_commande: "inconnu" })}
                    style={{ padding: "6px 14px", fontSize: 13, fontWeight: 700, background: "var(--ink)", color: "var(--white)", border: "2px solid var(--ink)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 rgba(0,0,0,0.3)" }}>
                    + Ajouter
                  </button>
                  <button onClick={() => { setIsEditeursOpen(false); setEditeurEdit(null); setFiltreEditeur(""); }}
                    style={{ width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, fontWeight: 900, cursor: "pointer", boxShadow: "2px 2px 0 var(--ink)", fontFamily: "inherit" }}>
                    ✕
                  </button>
                </div>
              </div>
              <input placeholder="Rechercher un éditeur…" value={filtreEditeur} onChange={e => setFiltreEditeur(e.target.value)} style={inp} />
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: 20 }}>

              {/* Mode édition */}
              {editeurEdit ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <button onClick={() => setEditeurEdit(null)}
                      style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, fontWeight: 900, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)" }}>
                      ←
                    </button>
                    <p style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{editeurEdit.id ? `Modifier : ${editeurEdit._nomOriginal}` : "Nouvel éditeur"}</p>
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Nom *</label>
                    <input placeholder="Nom de l'éditeur" value={editeurEdit.nom ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, nom: e.target.value }))} style={{ ...inp, fontWeight: 700 }} />
                  </div>

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Type de commande</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(["formulaire", "email", "inconnu", "impossible"] as const).map(t => {
                        const isActive = editeurEdit.type_commande === t;
                        const activeBg = t === "impossible" ? "var(--rouge)" : "var(--ink)";
                        return (
                          <button key={t} onClick={() => setEditeurEdit(p => ({ ...p, type_commande: t }))}
                            style={{ flex: 1, minWidth: 90, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "2px solid var(--ink)", background: isActive ? activeBg : "var(--cream2)", color: isActive ? "var(--white)" : "var(--ink)", boxShadow: isActive ? "2px 2px 0 rgba(0,0,0,0.3)" : "none" }}>
                            {TYPE_LABELS[t]}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {editeurEdit.type_commande === "formulaire" && (
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>URL du formulaire</label>
                      <input placeholder="https://…" value={editeurEdit.url_formulaire ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, url_formulaire: e.target.value }))} style={inp} />
                    </div>
                  )}

                  {editeurEdit.type_commande === "email" && (
                    <>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Email de contact</label>
                        <input placeholder="sav@editeur.fr" value={editeurEdit.email_contact ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, email_contact: e.target.value }))} style={{ ...inp, fontFamily: "monospace" }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Objet du mail <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></label>
                        <input placeholder="Commande de pièces manquantes – {editeur}" value={editeurEdit.sujet_email ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, sujet_email: e.target.value }))} style={inp} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>
                          Corps du mail <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(variables : {"{pieces_liste}"} {"{date}"} {"{editeur}"})</span>
                        </label>
                        <textarea placeholder={CORPS_EMAIL_DEFAUT} value={editeurEdit.corps_email ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, corps_email: e.target.value }))} rows={8}
                          style={{ ...inp, fontFamily: "monospace", resize: "vertical" }} />
                      </div>
                    </>
                  )}

                  <div>
                    <label style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.45)", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 4 }}>Notes internes <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optionnel)</span></label>
                    <input placeholder="Ex : contacter le distributeur Asmodee" value={editeurEdit.notes ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, notes: e.target.value }))} style={inp} />
                  </div>

                  <div style={{ display: "flex", gap: 10, paddingTop: 8 }}>
                    <button onClick={() => setEditeurEdit(null)}
                      style={{ flex: 1, padding: "10px 20px", borderRadius: 8, background: "var(--cream2)", color: "var(--ink)", border: "2px solid var(--ink)", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>
                      Annuler
                    </button>
                    <button onClick={sauvegarderEditeur} disabled={!editeurEdit.nom?.trim() || isSavingEditeur}
                      style={{ flex: 1, padding: "10px 20px", borderRadius: 8, background: "var(--ink)", color: "var(--white)", border: "2px solid var(--ink)", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 rgba(0,0,0,0.3)", opacity: (!editeurEdit.nom?.trim() || isSavingEditeur) ? 0.4 : 1 }}>
                      {isSavingEditeur ? "…" : "Sauvegarder"}
                    </button>
                  </div>
                </div>

              ) : (
                /* Mode liste */
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {editeurs.length === 0 && <p style={{ textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 700, padding: "32px 0" }}>Aucun éditeur configuré.</p>}

                  {editeurs.filter(e => !filtreEditeur || normaliserEditeur(e.nom).includes(normaliserEditeur(filtreEditeur))).map(e => {
                    const tcBg2: Record<string, string> = { formulaire: "var(--bleu)", email: "var(--purple)", inconnu: "var(--cream2)", impossible: "var(--rouge)" };
                    const tcCol2: Record<string, string> = { formulaire: "var(--white)", email: "var(--white)", inconnu: "var(--ink)", impossible: "var(--white)" };
                    return (
                      <div key={e.id} style={{ border: "2px solid var(--ink)", borderRadius: 10, background: "var(--white)", overflow: "hidden", boxShadow: "2px 2px 0 var(--ink)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontWeight: 800, fontSize: 15 }}>{e.nom}</span>
                              <span style={{ fontSize: 12, fontWeight: 800, background: tcBg2[e.type_commande] ?? "var(--cream2)", color: tcCol2[e.type_commande] ?? "var(--ink)", border: "1.5px solid var(--ink)", borderRadius: 20, padding: "1px 8px" }}>{TYPE_LABELS[e.type_commande]}</span>
                            </div>
                            {e.type_commande === "email" && e.email_contact && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", margin: "2px 0 0", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.email_contact}</p>}
                            {e.type_commande === "formulaire" && e.url_formulaire && <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.url_formulaire}</p>}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button onClick={() => setFusionSourceId(fusionSourceId === e.id ? null : e.id)}
                              style={{ padding: "5px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "2px solid var(--ink)", background: fusionSourceId === e.id ? "var(--orange)" : "var(--cream2)", boxShadow: fusionSourceId === e.id ? "2px 2px 0 var(--ink)" : "none" }}>
                              ⇄
                            </button>
                            <button onClick={() => setEditeurEdit({ ...e, _nomOriginal: e.nom })}
                              style={{ padding: "5px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "2px solid var(--ink)", background: "var(--cream2)" }}>
                              ✏️
                            </button>
                            <button onClick={() => supprimerEditeur(e.id)}
                              style={{ padding: "5px 10px", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: "2px solid var(--rouge)", background: "#fff0f4", color: "var(--rouge)" }}>
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Panneau fusion */}
                        {fusionSourceId === e.id && (
                          <div style={{ borderTop: "2px solid var(--orange)", background: "#fff8f0", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)", flexShrink: 0 }}>Fusionner vers →</span>
                            <select value={fusionCibleId} onChange={ev => setFusionCibleId(ev.target.value)}
                              style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "2px solid var(--ink)", fontSize: 13, background: "var(--white)", fontFamily: "inherit" }}>
                              <option value="">Choisir l&apos;éditeur cible…</option>
                              {editeurs.filter(x => x.id !== e.id).map(x => (
                                <option key={x.id} value={x.id}>{x.nom}</option>
                              ))}
                            </select>
                            <button onClick={fusionnerEditeur} disabled={!fusionCibleId || isFusioning}
                              style={{ padding: "6px 12px", borderRadius: 6, background: "var(--orange)", color: "var(--ink)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", boxShadow: "2px 2px 0 var(--ink)", opacity: (!fusionCibleId || isFusioning) ? 0.4 : 1, flexShrink: 0 }}>
                              {isFusioning ? "…" : "Fusionner"}
                            </button>
                            <button onClick={() => { setFusionSourceId(null); setFusionCibleId(""); }}
                              style={{ padding: "6px 10px", borderRadius: 6, background: "var(--cream2)", border: "2px solid var(--ink)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
