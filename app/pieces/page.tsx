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
  type_commande: "formulaire" | "email" | "inconnu";
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
};

const TYPE_COLORS: Record<Editeur["type_commande"], string> = {
  formulaire: "bg-blue-100 text-blue-700",
  email:      "bg-violet-100 text-violet-700",
  inconnu:    "bg-slate-100 text-slate-500",
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

  // ── Modal Commander ──────────────────────────────────────────────────────
  const [isCommandeOpen,   setIsCommandeOpen]   = useState(false);
  const [commandeGroupes,  setCommandeGroupes]  = useState<CommandeGroupe[]>([]);
  const [commandeLoading,  setCommandeLoading]  = useState(false);
  const [emailGroupeIdx,   setEmailGroupeIdx]   = useState<number | null>(null);
  const [emailSujet,       setEmailSujet]       = useState("");
  const [emailCorps,       setEmailCorps]       = useState("");

  // ── Modal Éditeurs CRUD ──────────────────────────────────────────────────
  const [isEditeursOpen,   setIsEditeursOpen]   = useState(false);
  const [editeurs,         setEditeurs]         = useState<Editeur[]>([]);
  const [editeurEdit,      setEditeurEdit]      = useState<Partial<Editeur> | null>(null);
  const [isSavingEditeur,  setIsSavingEditeur]  = useState(false);

  // ─── Chargement ──────────────────────────────────────────────────────────

  useEffect(() => { chargerDonnees(); }, []);

  const chargerDonnees = async () => {
    const { data: d1 } = await supabase.from("pieces_manquantes").select("*").in("statut", ["Manquant", "Commandé"]).order("id", { ascending: false });
    const { data: d2 } = await supabase.from("pieces_trouvees").select("*").eq("statut", "En attente").order("id", { ascending: false });
    if (d1) setManquantes(d1);
    if (d2) setTrouvees(d2);
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

  // ─── CRUD éditeurs ────────────────────────────────────────────────────────

  const sauvegarderEditeur = async () => {
    if (!editeurEdit?.nom?.trim()) return;
    setIsSavingEditeur(true);
    if (editeurEdit.id) {
      await supabase.from("editeurs").update({
        nom: editeurEdit.nom, type_commande: editeurEdit.type_commande,
        url_formulaire: editeurEdit.url_formulaire || null,
        email_contact: editeurEdit.email_contact || null,
        sujet_email: editeurEdit.sujet_email || null,
        corps_email: editeurEdit.corps_email || null,
        notes: editeurEdit.notes || null,
      }).eq("id", editeurEdit.id);
    } else {
      await supabase.from("editeurs").insert({
        nom: editeurEdit.nom, type_commande: editeurEdit.type_commande ?? "inconnu",
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
  };

  const supprimerEditeur = async (id: string) => {
    if (!confirm("Supprimer cet éditeur ?")) return;
    await supabase.from("editeurs").delete().eq("id", id);
    chargerEditeurs();
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
      const { data } = await supabase.from("jeux").select("nom, code_syracuse, ean").ilike("nom", `%${text}%`).limit(5);
      if (data) setSuggestionsNom(data.filter((v, i, a) => a.findIndex(t => t.nom === v.nom) === i));
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

  const commanderPiece = async (id: number) => {
    await supabase.from("pieces_manquantes").update({ statut: "Commandé" }).eq("id", id);
    if (selectedManquant === id) setSelectedManquant(null);
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

  const lierElements = async () => {
    if (!selectedManquant || selectedTrouvees.length === 0) return;
    await supabase.from("pieces_manquantes").update({ statut: "Résolu" }).eq("id", selectedManquant);
    for (const tId of selectedTrouvees) await supabase.from("pieces_trouvees").update({ statut: "Réaffecté" }).eq("id", tId);
    setSelectedManquant(null); setSelectedTrouvees([]); chargerDonnees();
  };

  const nbManquant = manquantes.filter(m => m.statut === "Manquant").length;

  // ─── Rendu ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen p-4 sm:p-8 bg-[#e5e5e5] font-sans relative">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>

      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="absolute left-1/2 -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Retour Atelier</Link>
        </nav>
        <div className="w-10" />
      </header>

      <main className="w-full max-w-[96%] mx-auto flex flex-col lg:flex-row gap-6 pb-24">

        {/* ── JEUX INCOMPLETS ── */}
        <div className="bg-white rounded-[3rem] p-8 lg:p-10 flex-1 shadow-md border-t-8 border-[#ff4d79] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-black text-black">Jeux incomplets</h1>
            {nbManquant > 0 && (
              <button
                onClick={ouvrirCommande}
                className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-black text-white text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm"
              >
                📬 Commander ({nbManquant})
              </button>
            )}
          </div>

          {/* Formulaire ajout */}
          <div className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl mb-4 flex flex-col gap-3 shrink-0">
            <div className="flex gap-3 relative">
              <input type="text" placeholder="Code Syracuse..." value={codeManq} onChange={e => setCodeManq(e.target.value)} onBlur={() => chercherNom(codeManq)} className="w-1/3 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black" />
              <div className="relative w-2/3">
                <input type="text" placeholder="Nom du jeu..." value={nomManq} onChange={e => handleRechercheNom(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold" />
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
            </div>
            <div className="flex gap-3">
              {contenuJeu.length > 0 && !saisieManuelle ? (
                <>
                  <input type="number" placeholder="Qté" value={qteManq} onChange={e => setQteManq(Number(e.target.value))} className="w-20 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold text-center" min="1" />
                  <select value={itemManq} onChange={e => setItemManq(e.target.value)} className="flex-1 min-w-0 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-semibold bg-white truncate">
                    {contenuJeu.map((item, idx) => <option key={idx} value={item}>{item}</option>)}
                  </select>
                  <button onClick={() => setSaisieManuelle(true)} className="px-3 text-sm text-slate-400 hover:text-black underline shrink-0">Manuel</button>
                </>
              ) : (
                <input type="text" placeholder="Pièce (ex: 1 dé rouge)..." value={elemManqManuel} onChange={e => setElemManqManuel(e.target.value)} onKeyDown={e => e.key === "Enter" && ajouterManquant()} className="flex-1 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black" />
              )}
              <button onClick={ajouterManquant} disabled={!nomManq || (saisieManuelle ? !elemManqManuel : !qteManq)} className="bg-[#ff4d79] hover:bg-[#e03a64] disabled:bg-slate-200 text-white font-black px-6 rounded-xl transition-colors">Ajouter</button>
            </div>
          </div>

          {/* Liste */}
          <div className="flex flex-col gap-3 overflow-y-auto custom-scroll pr-2 flex-1 min-h-[300px] max-h-[600px]">
            {manquantesTriees.map(m => {
              const isSelected  = selectedManquant === m.id;
              const isSuggestion = m.isSuggestion && selectedTrouvees.length > 0 && !isSelected;
              const isCommande  = m.statut === "Commandé";
              return (
                <div key={m.id} onClick={() => !isCommande && setSelectedManquant(isSelected ? null : m.id)}
                  className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all relative
                    ${isCommande ? "bg-slate-50 border-slate-200 opacity-80" :
                      isSelected ? "bg-white border-[#ff4d79] ring-4 ring-[#ff4d79]/30 shadow-md cursor-pointer" :
                      isSuggestion ? "bg-rose-50 border-[#ff4d79] border-dashed shadow-sm cursor-pointer" :
                      "bg-white border-slate-100 hover:border-slate-300 cursor-pointer"}`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg leading-tight flex items-center gap-2 flex-wrap">
                      <span className="truncate">{m.nom}</span>
                      {isCommande && <span className="text-orange-500 text-xs font-black bg-orange-100 px-2.5 py-1 rounded-md uppercase tracking-wide border border-orange-200 shrink-0">📦 Commandé</span>}
                      {m.hasMatch && !isSuggestion && !isCommande && <span title="Une pièce correspondante a été trouvée !" className="text-xl animate-pulse">💡</span>}
                      {isSuggestion && !isCommande && <span className="text-[#ff4d79] text-xs font-black bg-white px-2 py-0.5 rounded-full border border-[#ff4d79] shrink-0">✨ Suggestion</span>}
                    </h3>
                    <p className={`${isCommande ? "text-slate-500" : "text-[#ff4d79]"} font-bold text-sm mt-2 line-clamp-2`}>{m.element_manquant}</p>
                  </div>
                  <div className="flex gap-2 shrink-0 self-end sm:self-center">
                    {isCommande ? (
                      <button onClick={e => { e.stopPropagation(); resoudreManquant(m.id); }} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">📦 Reçue ✓</button>
                    ) : (
                      <button onClick={e => { e.stopPropagation(); commanderPiece(m.id); }} className="bg-orange-100 hover:bg-orange-200 text-orange-700 px-4 py-2 rounded-xl text-sm font-bold transition-colors shadow-sm">🛒 Commander</button>
                    )}
                    <button onClick={e => { e.stopPropagation(); resoudreManquant(m.id); }} className="bg-slate-100 hover:bg-slate-200 text-slate-500 px-4 py-2 rounded-xl text-sm font-bold transition-colors">✕</button>
                  </div>
                </div>
              );
            })}
            {manquantes.length === 0 && <p className="text-slate-400 text-center py-4">Aucun jeu incomplet !</p>}
          </div>
        </div>

        {/* ── PIÈCES ORPHELINES ── */}
        <div className="bg-white rounded-[3rem] p-8 lg:p-10 flex-1 shadow-md border-t-8 border-[#baff29] overflow-hidden flex flex-col">
          <h1 className="text-3xl font-black text-black mb-6">Pièces orphelines</h1>
          <div className="bg-slate-50 border-2 border-slate-100 p-5 rounded-3xl mb-4 flex flex-col gap-3 shrink-0">
            <input type="text" placeholder="Description (ex: 1 bille noire)..." value={descTrouvee} onChange={e => setDescTrouvee(e.target.value)} className="w-full border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black font-bold" />
            <div className="flex gap-3">
              <input type="text" placeholder="Jeu supposé (optionnel)..." value={nomSuppo} onChange={e => setNomSuppo(e.target.value)} onKeyDown={e => e.key === "Enter" && ajouterTrouve()} className="flex-1 border-2 border-slate-200 p-3 rounded-xl outline-none focus:border-black text-sm" />
              <button onClick={ajouterTrouve} disabled={!descTrouvee} className="bg-[#baff29] hover:bg-[#a1e619] disabled:bg-slate-200 text-black font-black px-6 rounded-xl transition-colors">Ajouter</button>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 custom-scroll shrink-0 mb-4">
            <button onClick={() => setFiltreType(null)} className={`whitespace-nowrap px-3 py-1.5 rounded-xl font-bold text-xs transition-colors border-2 ${filtreType === null ? "bg-[#baff29] text-black border-[#baff29]" : "bg-white text-slate-600 border-slate-200 hover:border-[#baff29]"}`}>Tous</button>
            {TYPES_PIECES.map(type => (
              <button key={type.id} onClick={() => setFiltreType(type.id === filtreType ? null : type.id)} className={`whitespace-nowrap px-3 py-1.5 rounded-xl font-bold text-xs transition-colors border-2 ${filtreType === type.id ? "bg-[#baff29] text-black border-[#baff29]" : "bg-white text-slate-600 border-slate-200 hover:border-[#baff29]"}`}>{type.label}</button>
            ))}
          </div>
          <div className="flex flex-col gap-3 overflow-y-auto custom-scroll pr-2 flex-1 min-h-[300px] max-h-[600px]">
            {trouveesTriees.map(t => {
              const isSelected   = selectedTrouvees.includes(t.id);
              const isSuggestion = t.isSuggestion && selectedManquant !== null && !isSelected;
              return (
                <div key={t.id} onClick={() => setSelectedTrouvees(prev => isSelected ? prev.filter(id => id !== t.id) : [...prev, t.id])}
                  className={`p-4 rounded-2xl border-2 cursor-pointer flex flex-col sm:flex-row justify-between sm:items-center gap-4 transition-all
                    ${isSelected ? "bg-white border-[#baff29] ring-4 ring-[#baff29]/50 shadow-md" :
                      isSuggestion ? "bg-[#f4fce3] border-[#baff29] border-dashed shadow-sm" :
                      "bg-white border-slate-100 hover:border-slate-300"}`}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg leading-tight flex items-center gap-2 flex-wrap line-clamp-2">
                      {t.description}
                      {isSuggestion && <span className="text-[#84b506] text-xs font-black bg-white px-2 py-0.5 rounded-full border border-[#baff29] shrink-0 ml-1">✨ Suggestion</span>}
                    </h3>
                    {t.nom_suppose && <p className="text-slate-500 text-sm mt-1 truncate">Peut-être : <span className="italic">{t.nom_suppose}</span></p>}
                  </div>
                  <button onClick={e => { e.stopPropagation(); resoudreTrouve(t.id); }} className="shrink-0 bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-xl text-sm font-bold transition-colors self-end sm:self-center">Retirer seule ✕</button>
                </div>
              );
            })}
            {trouvees.length === 0 && <p className="text-slate-400 text-center py-4">Le bac des pièces seules est vide !</p>}
            {trouvees.length > 0 && trouveesTriees.length === 0 && <p className="text-slate-400 text-center py-4">Aucune pièce ne correspond à ce filtre.</p>}
          </div>
        </div>
      </main>

      {/* ── Barre fusion flottante ── */}
      {selectedManquant !== null && selectedTrouvees.length > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-black text-white px-8 py-5 rounded-full shadow-2xl flex items-center gap-6 z-50">
          <span className="font-bold text-lg whitespace-nowrap">🔗 Lier 1 jeu et {selectedTrouvees.length} pièce(s) ?</span>
          <button onClick={lierElements} className="bg-[#baff29] text-black px-6 py-2.5 rounded-xl font-black hover:scale-105 transition-transform shadow-[0_0_15px_rgba(186,255,41,0.5)] whitespace-nowrap">Valider la fusion ✓</button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL COMMANDER
      ══════════════════════════════════════════════════════════════════════ */}
      {isCommandeOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-2xl font-black text-black">Commander les pièces</h2>
                <p className="text-sm text-slate-400 font-medium mt-0.5">Groupé par éditeur</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { chargerEditeurs(); setIsEditeursOpen(true); }}
                  className="px-3 py-2 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                >⚙️ Gérer éditeurs</button>
                <button onClick={() => { setIsCommandeOpen(false); setEmailGroupeIdx(null); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 font-black text-slate-600 transition-colors">✕</button>
              </div>
            </div>

            {/* Corps */}
            <div className="overflow-y-auto custom-scroll flex-1 p-6 flex flex-col gap-4">
              {commandeLoading ? (
                <div className="flex flex-col items-center gap-3 py-12">
                  <div className="w-8 h-8 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
                  <p className="text-sm text-slate-400 font-medium">Recherche des éditeurs…</p>
                </div>
              ) : commandeGroupes.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Aucune pièce à commander.</p>
              ) : (
                commandeGroupes.map((groupe, idx) => {
                  const tc = groupe.editeur?.type_commande ?? "inconnu";
                  const toutCommande = groupe.pieces.every(p => p.statut === "Commandé");
                  return (
                    <div key={idx} className={`rounded-2xl border-2 overflow-hidden transition-all ${toutCommande ? "opacity-50 border-slate-100" : "border-slate-200"}`}>
                      {/* En-tête groupe */}
                      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-black text-sm">{groupe.nomEditeur}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${TYPE_COLORS[tc]}`}>{TYPE_LABELS[tc]}</span>
                          {toutCommande && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Commandé</span>}
                        </div>
                        <span className="text-xs text-slate-400 font-medium">{groupe.pieces.length} pièce{groupe.pieces.length > 1 ? "s" : ""}</span>
                      </div>

                      {/* Liste des pièces */}
                      <ul className="px-5 py-3 flex flex-col gap-1">
                        {groupe.pieces.map(p => (
                          <li key={p.id} className="text-sm flex items-baseline gap-2">
                            <span className="font-bold text-black truncate">{p.nom}</span>
                            <span className="text-slate-400 shrink-0">→ {p.element_manquant}</span>
                            {p.statut === "Commandé" && <span className="text-[10px] font-black text-orange-500 bg-orange-50 px-1.5 rounded shrink-0">Commandé</span>}
                          </li>
                        ))}
                      </ul>

                      {/* Actions groupe */}
                      {!toutCommande && (
                        <div className="px-5 pb-4 flex flex-wrap gap-2">
                          {tc === "formulaire" && groupe.editeur?.url_formulaire && (
                            <a href={groupe.editeur.url_formulaire} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors">
                              🔗 Ouvrir le formulaire ↗
                            </a>
                          )}
                          {tc === "email" && (
                            <button onClick={() => emailGroupeIdx === idx ? setEmailGroupeIdx(null) : ouvrirEmail(idx)}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors">
                              ✉️ {emailGroupeIdx === idx ? "Masquer l'email" : "Rédiger l'email"}
                            </button>
                          )}
                          {tc === "inconnu" && (
                            <span className="text-xs text-slate-400 italic py-2">Éditeur non configuré — <button onClick={() => { chargerEditeurs(); setIsEditeursOpen(true); }} className="underline hover:text-black">Configurer ↗</button></span>
                          )}
                          <button onClick={() => marquerGroupeCommande(groupe)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-colors ml-auto">
                            Marquer commandé ✓
                          </button>
                        </div>
                      )}

                      {/* Zone email dépliable */}
                      {emailGroupeIdx === idx && (
                        <div className="border-t border-slate-100 px-5 pb-5 pt-4 flex flex-col gap-3 bg-violet-50/40">
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1 block">À</label>
                            <input readOnly value={groupe.editeur?.email_contact ?? ""} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white font-mono text-slate-600" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1 block">Objet</label>
                            <input value={emailSujet} onChange={e => setEmailSujet(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-black" />
                          </div>
                          <div>
                            <label className="text-xs font-black text-slate-500 uppercase tracking-wider mb-1 block">Corps</label>
                            <textarea value={emailCorps} onChange={e => setEmailCorps(e.target.value)} rows={8} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:border-black font-mono resize-y" />
                          </div>
                          <div className="flex gap-2">
                            <a href={buildMailto(groupe)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors">
                              ✉️ Ouvrir dans Outlook
                            </a>
                            <button onClick={() => marquerGroupeCommande(groupe)} className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors">
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

      {/* ══════════════════════════════════════════════════════════════════════
          MODAL ÉDITEURS CRUD
      ══════════════════════════════════════════════════════════════════════ */}
      {isEditeursOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-100 shrink-0">
              <h2 className="text-2xl font-black text-black">Éditeurs</h2>
              <div className="flex gap-2">
                <button onClick={() => setEditeurEdit({ type_commande: "inconnu" })} className="px-4 py-2 rounded-xl bg-black text-white text-sm font-bold hover:bg-slate-800 transition-colors">+ Ajouter</button>
                <button onClick={() => { setIsEditeursOpen(false); setEditeurEdit(null); }} className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 font-black text-slate-600">✕</button>
              </div>
            </div>

            <div className="overflow-y-auto custom-scroll flex-1 p-6 flex flex-col gap-3">
              {editeurs.length === 0 && !editeurEdit && <p className="text-center text-slate-400 py-8 text-sm">Aucun éditeur configuré.</p>}

              {editeurs.map(e => (
                <div key={e.id} className="flex items-center gap-3 p-4 rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white transition-colors group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-black text-sm">{e.nom}</span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${TYPE_COLORS[e.type_commande]}`}>{TYPE_LABELS[e.type_commande]}</span>
                    </div>
                    {e.type_commande === "email" && e.email_contact && <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{e.email_contact}</p>}
                    {e.type_commande === "formulaire" && e.url_formulaire && <p className="text-xs text-slate-400 mt-0.5 truncate">{e.url_formulaire}</p>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => setEditeurEdit(e)} className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs font-bold text-slate-600 transition-colors">✏️</button>
                    <button onClick={() => supprimerEditeur(e.id)} className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-xs font-bold text-red-500 transition-colors">✕</button>
                  </div>
                </div>
              ))}

              {/* Formulaire ajout/édition */}
              {editeurEdit && (
                <div className="border-2 border-black rounded-2xl p-5 flex flex-col gap-3 mt-2">
                  <p className="text-sm font-black text-black">{editeurEdit.id ? "Modifier" : "Nouvel éditeur"}</p>
                  <input placeholder="Nom de l'éditeur *" value={editeurEdit.nom ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, nom: e.target.value }))} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm font-bold transition-colors" />

                  <div className="flex gap-2">
                    {(["formulaire", "email", "inconnu"] as const).map(t => (
                      <button key={t} onClick={() => setEditeurEdit(p => ({ ...p, type_commande: t }))}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${editeurEdit.type_commande === t ? "bg-black text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                        {TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>

                  {editeurEdit.type_commande === "formulaire" && (
                    <input placeholder="URL du formulaire" value={editeurEdit.url_formulaire ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, url_formulaire: e.target.value }))} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm transition-colors" />
                  )}

                  {editeurEdit.type_commande === "email" && (
                    <>
                      <input placeholder="Email de contact" value={editeurEdit.email_contact ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, email_contact: e.target.value }))} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm font-mono transition-colors" />
                      <input placeholder="Objet de l'email (optionnel)" value={editeurEdit.sujet_email ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, sujet_email: e.target.value }))} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm transition-colors" />
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-1">Variables : <code className="bg-slate-100 px-1 rounded">{"{pieces_liste}"}</code> <code className="bg-slate-100 px-1 rounded">{"{date}"}</code> <code className="bg-slate-100 px-1 rounded">{"{editeur}"}</code></p>
                        <textarea placeholder={`Corps de l'email (optionnel)\n${CORPS_EMAIL_DEFAUT}`} value={editeurEdit.corps_email ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, corps_email: e.target.value }))} rows={6} className="w-full px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm font-mono resize-y transition-colors" />
                      </div>
                    </>
                  )}

                  <input placeholder="Notes internes (optionnel)" value={editeurEdit.notes ?? ""} onChange={e => setEditeurEdit(p => ({ ...p, notes: e.target.value }))} className="px-3 py-2.5 rounded-xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm transition-colors" />

                  <div className="flex gap-2">
                    <button onClick={() => setEditeurEdit(null)} className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors">Annuler</button>
                    <button onClick={sauvegarderEditeur} disabled={!editeurEdit.nom?.trim() || isSavingEditeur} className="flex-1 py-2.5 rounded-xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 transition-colors">
                      {isSavingEditeur ? "…" : "Sauvegarder"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
