"use client";
import { useState, useEffect, Suspense, Fragment } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useIsMobile } from "../../lib/useIsMobile";
import BoutonScan from "../../components/ScanCodeBarre";
import { ETAPES_A_ZERO } from "../../lib/etapesAtelier";
import EnteteImpression, { CaseImpressionDouble } from "../../components/EnteteImpression";
import {
  chargerCodesSyracuse, contenusPour, correspondance, eanDuCode, lireImpressionDouble, ecrireImpressionDouble,
  validerEtapeImpression, type JeuChoisi, type LigneCatalogue,
} from "../../lib/impression";
import { MECANIQUES, TEMPS_DE_JEU_OPTIONS, COOP_VERSUS_OPTIONS, joueursDepuisMyLudo, tempsDepuisMyLudo } from "../../lib/etiquetteJeu";

// react-pdf uniquement côté navigateur : jamais dans le bundle serveur du worker
const BoutonImpression = dynamic(() => import("../../components/BoutonImpression"), { ssr: false });

const CATEGORIES = [
  { id: "vert",  nom: "Vert",  hex: "#a8e063", maxStars: 3 },
  { id: "rose",  nom: "Rose",  hex: "#f472b6", maxStars: 2 },
  { id: "bleu",  nom: "Bleu",  hex: "#60a5fa", maxStars: 2 },
  { id: "rouge", nom: "Rouge", hex: "#f87171", maxStars: 2 },
  { id: "jaune", nom: "Jaune", hex: "#fb923c", maxStars: 3 },
];

type Etiquette = {
  id: string | number;
  ean: string;
  quantity: number;
  nom: string;
  mecanique: string;
  nb_de_joueurs: string;
  coop_versus: "Coop" | "Versus" | "Solo" | "";
  temps_de_jeu: string;
  etoiles: number | "";
};

const S = {
  inp: {
    border: "2px solid var(--ink)",
    borderRadius: 6,
    padding: "6px 10px",
    background: "var(--white)",
    outline: "none",
    fontSize: 15,
    fontFamily: "inherit",
    width: "100%",
  } as React.CSSProperties,
  sel: {
    border: "2px solid var(--ink)",
    borderRadius: 6,
    padding: "6px 8px",
    background: "var(--white)",
    outline: "none",
    fontSize: 14,
    fontFamily: "inherit",
    width: "100%",
    cursor: "pointer",
  } as React.CSSProperties,
  inpErr: {
    border: "2px solid var(--rouge)",
    background: "#fff5f5",
  } as React.CSSProperties,
};

/** Champs de l'étiquette qui manquent encore (le nom compris). */
const estIncomplete = (e: Etiquette) =>
  !e.nom || !e.mecanique || !e.nb_de_joueurs || !e.coop_versus || !e.temps_de_jeu || e.etoiles === "";

/** Nombres de joueurs les plus courants, à choisir d'un clic (la saisie libre reste possible). */
const JOUEURS_COURANTS = ["1-4", "2-4", "2-5", "2-6", "3-6", "2-8", "2", "1-6"];

const choix = (actif: boolean, fond = "var(--yellow)"): React.CSSProperties => ({
  border: "2px solid var(--ink)", borderRadius: 8, padding: "5px 10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
  background: actif ? fond : "var(--white)", boxShadow: actif ? "2px 2px 0 var(--ink)" : "none", lineHeight: 1.2,
});
const groupeManquant = (vide: boolean): React.CSSProperties =>
  vide ? { outline: "2px dashed var(--rouge)", outlineOffset: 3, borderRadius: 8 } : {};

/**
 * Menu de remplissage rapide, déplié sous la ligne d'un jeu : chaque champ de
 * l'étiquette se choisit d'un bouton (comme dans la fiche de l'atelier). Un
 * champ encore vide est entouré de rouge.
 */
function PanneauRemplissage({ eti, maxStars, hex, onChoisir, onMyLudo, mlEnCours, onFermer }: {
  eti: Etiquette; maxStars: number; hex: string;
  onChoisir: (champ: keyof Etiquette, valeur: string | number) => void;
  onMyLudo: () => void; mlEnCours: boolean; onFermer: () => void;
}) {
  const libelle: React.CSSProperties = { fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.5)", marginBottom: 6, display: "block" };
  const ligne: React.CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", width: "fit-content", maxWidth: "100%" };
  return (
    <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14, background: "var(--cream)", borderTop: `3px solid ${hex}`, borderBottom: "2px solid var(--ink)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="bc" style={{ fontSize: 16 }}>✎ {eti.nom || "Jeu sans nom"}</span>
        {estIncomplete(eti)
          ? <span style={{ fontSize: 12, fontWeight: 800, color: "var(--rouge)" }}>à compléter</span>
          : <span style={{ fontSize: 12, fontWeight: 800, color: "#3f7d0e" }}>✓ étiquette complète</span>}
        <span style={{ flex: 1 }} />
        <button onClick={onMyLudo} disabled={mlEnCours || (!eti.ean && !eti.nom)} style={{ ...choix(false), opacity: mlEnCours ? 0.5 : 1 }}
          title="Compléter joueurs et temps depuis MyLudo">{mlEnCours ? "MyLudo…" : "Joueurs et temps depuis MyLudo"}</button>
        <button onClick={onFermer} style={{ ...choix(false), background: "var(--ink)", color: "var(--white)" }}>Fermer ▲</button>
      </div>

      <div>
        <span style={libelle}>Mécanique</span>
        <div style={{ ...ligne, ...groupeManquant(!eti.mecanique) }}>
          {MECANIQUES.map(m => (
            <button key={m} onClick={() => onChoisir("mecanique", eti.mecanique === m ? "" : m)} style={{ ...choix(eti.mecanique === m), padding: "3px 8px", fontSize: 12 }}>{m}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <span style={libelle}>Joueurs</span>
          <div style={{ ...ligne, alignItems: "center", ...groupeManquant(!eti.nb_de_joueurs) }}>
            {JOUEURS_COURANTS.map(j => (
              <button key={j} onClick={() => onChoisir("nb_de_joueurs", eti.nb_de_joueurs === j ? "" : j)} style={choix(eti.nb_de_joueurs === j)}>{j}</button>
            ))}
            <input type="text" placeholder="autre" defaultValue={JOUEURS_COURANTS.includes(eti.nb_de_joueurs) ? "" : eti.nb_de_joueurs}
              key={eti.nb_de_joueurs}
              onBlur={e => { const v = e.target.value.trim(); if (v && v !== eti.nb_de_joueurs) onChoisir("nb_de_joueurs", v); }}
              onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              style={{ ...S.inp, width: 70, padding: "4px 8px", fontSize: 13, fontWeight: 700, textAlign: "center" }} />
          </div>
        </div>
        <div>
          <span style={libelle}>Type de partie</span>
          <div style={{ ...ligne, ...groupeManquant(!eti.coop_versus) }}>
            {COOP_VERSUS_OPTIONS.map(o => (
              <button key={o.id} onClick={() => onChoisir("coop_versus", eti.coop_versus === o.id ? "" : o.id)} style={choix(eti.coop_versus === o.id)}>{o.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div>
          <span style={libelle}>Temps de jeu (min)</span>
          <div style={{ ...ligne, ...groupeManquant(!eti.temps_de_jeu) }}>
            {TEMPS_DE_JEU_OPTIONS.map(t => (
              <button key={t} onClick={() => onChoisir("temps_de_jeu", eti.temps_de_jeu === t ? "" : t)} style={choix(eti.temps_de_jeu === t)}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <span style={libelle}>Difficulté</span>
          <div style={{ ...ligne, ...groupeManquant(eti.etoiles === "") }}>
            {Array.from({ length: maxStars }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => onChoisir("etoiles", eti.etoiles === n ? "" : n)} style={{ ...choix(eti.etoiles === n), fontSize: 15, letterSpacing: 2 }}>{"★".repeat(n)}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EtiquettesPage() {
  return (
    <Suspense>
      <EtiquettesPageInner />
    </Suspense>
  );
}

function EtiquettesPageInner() {
  const isMobile = useIsMobile();
  const searchParams = useSearchParams();
  const [isClient, setIsClient] = useState(false);

  const [etiquettes, setEtiquettes] = useState<Record<string, Etiquette[]>>({
    vert: [], rose: [], bleu: [], rouge: [], jaune: []
  });
  const [sectionsOuvertes, setSectionsOuvertes] = useState<Record<string, boolean>>({
    vert: false, rose: false, bleu: false, rouge: false, jaune: false
  });
  const [recherche, setRecherche] = useState(searchParams.get("nom") ?? "");
  // Filtre des lignes des tableaux (distinct de la recherche du générateur, à droite).
  const [filtre, setFiltre] = useState("");
  // Catalogue tel que chargé (pour imprimer aussi le contenu) et codes Syracuse par EAN (recherche).
  const [catalogue, setCatalogue] = useState<Map<string, LigneCatalogue>>(new Map());
  const [codesSyracuse, setCodesSyracuse] = useState<Record<string, string[]>>({});
  const [impressionDouble, setImpressionDouble] = useState(false);
  const [mlLoading, setMlLoading] = useState<Set<string | number>>(new Set());
  // Ligne dont le menu de remplissage rapide est déplié.
  const [ligneOuverte, setLigneOuverte] = useState<string | number | null>(null);

  useEffect(() => {
    setIsClient(true);
    chargerCatalogue();
    chargerCodesSyracuse().then(setCodesSyracuse);
    setImpressionDouble(lireImpressionDouble());
  }, []);

  const chargerCatalogue = async () => {
    const data = await fetch('/api/catalogue').then(r => r.json() as Promise<any>).catch(() => null);
    if (Array.isArray(data)) {
      setCatalogue(new Map((data as LigneCatalogue[]).filter(c => c.ean).map(c => [c.ean, c])));
      const dbEtiquettes: Record<string, Etiquette[]> = { vert: [], rose: [], bleu: [], rouge: [], jaune: [] };
      data.forEach(item => {
        const couleur = item.couleur && dbEtiquettes[item.couleur] ? item.couleur : "vert";
        dbEtiquettes[couleur].push({
          id: item.ean || Date.now() + Math.random(),
          ean: item.ean || "",
          quantity: 0,
          nom: item.nom || "",
          mecanique: item.mecanique || "",
          nb_de_joueurs: item.nb_de_joueurs || "",
          coop_versus: (item.coop_versus as "Coop" | "Versus" | "Solo" | "") || "",
          temps_de_jeu: item.temps_de_jeu || "",
          etoiles: item.etoiles || ""
        });
      });
      Object.keys(dbEtiquettes).forEach(k => dbEtiquettes[k].sort((a, b) => a.nom.localeCompare(b.nom)));
      setEtiquettes(dbEtiquettes);
    }
  };

  const toggleSection = (id: string) => {
    setSectionsOuvertes(prev => {
      const isOpening = !prev[id];
      if (isOpening) {
        setTimeout(() => {
          const el = document.getElementById(`category-${id}`);
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 56;
            window.scrollTo({ top: y, behavior: 'smooth' });
          }
        }, 50);
      }
      return { ...prev, [id]: isOpening };
    });
  };

  const ajouterLigne = (couleurId: string) => {
    const nouvelleEtiquette: Etiquette = { id: Date.now(), ean: "", quantity: 1, nom: "", mecanique: "", nb_de_joueurs: "", coop_versus: "", temps_de_jeu: "", etoiles: "" };
    setEtiquettes(prev => ({ ...prev, [couleurId]: [nouvelleEtiquette, ...prev[couleurId]] }));
    if (!sectionsOuvertes[couleurId]) toggleSection(couleurId);
  };

  const sauvegarderLigneEnBase = async (eti: Etiquette, couleurId: string) => {
    if (!eti.ean || !eti.nom) return;
    const dataToSave = {
      ean: eti.ean, nom: eti.nom, mecanique: eti.mecanique, nb_de_joueurs: eti.nb_de_joueurs,
      coop_versus: eti.coop_versus === "" ? null : eti.coop_versus,
      temps_de_jeu: eti.temps_de_jeu, etoiles: eti.etoiles === "" ? null : eti.etoiles, couleur: couleurId
    };
    await fetch(`/api/catalogue/${encodeURIComponent(eti.ean)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSave)
    }).catch(() => fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify([dataToSave]) }));

    const jeuxExistants = await fetch(`/api/jeux?ean=${encodeURIComponent(eti.ean)}&fields=id&limit=1`).then(r => r.json() as Promise<any>).catch(() => []);
    if (!Array.isArray(jeuxExistants) || jeuxExistants.length === 0) {
      await fetch('/api/jeux', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ean: eti.ean, nom: eti.nom, statut: 'En préparation', is_double: 0,
        ...ETAPES_A_ZERO
      }) }).catch(console.error);
    }
  };

  const mettreAJourLigne = (couleurId: string, id: string | number, champ: keyof Etiquette, valeur: string | number) => {
    setEtiquettes(prev => ({
      ...prev, [couleurId]: prev[couleurId].map(eti => {
        if (eti.id === id) {
          const updated = { ...eti, [champ]: valeur };
          if (['mecanique', 'coop_versus', 'etoiles', 'temps_de_jeu'].includes(champ as string)) sauvegarderLigneEnBase(updated, couleurId);
          return updated;
        }
        return eti;
      })
    }));
  };

  /** Choix depuis le menu rapide : la ligne est mise à jour et enregistrée au catalogue. */
  const remplir = (couleurId: string, id: string | number, champ: keyof Etiquette, valeur: string | number) => {
    const eti = etiquettes[couleurId].find(e => e.id === id);
    if (!eti) return;
    const updated = { ...eti, [champ]: valeur } as Etiquette;
    setEtiquettes(prev => ({ ...prev, [couleurId]: prev[couleurId].map(e => e.id === id ? updated : e) }));
    sauvegarderLigneEnBase(updated, couleurId);
  };

  /** Va à la ligne d'un jeu (section ouverte, filtre effacé) et déplie son menu de remplissage. */
  const allerAuJeu = (couleurId: string, id: string | number) => {
    setFiltre("");
    setSectionsOuvertes(prev => ({ ...prev, [couleurId]: true }));
    setLigneOuverte(id);
    setTimeout(() => {
      document.querySelector(`tr[data-eti="${CSS.escape(String(id))}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  };

  const modifierQuantite = (couleurId: string, id: string | number, delta: number) => {
    setEtiquettes(prev => ({ ...prev, [couleurId]: prev[couleurId].map(eti => eti.id === id ? { ...eti, quantity: Math.max(0, eti.quantity + delta) } : eti) }));
  };

  // Scan (caméra ou douchette + Entrée) : le jeu reconnu est ajouté à la liste.
  const [ajoutScan, setAjoutScan] = useState<{ texte: string; ok: boolean } | null>(null);
  useEffect(() => {
    if (!ajoutScan) return;
    const t = setTimeout(() => setAjoutScan(null), 3500);
    return () => clearTimeout(t);
  }, [ajoutScan]);
  const ajouterParScan = (code: string) => {
    const ean = eanDuCode(code, Object.values(etiquettes).flat().map(x => x.ean).filter(Boolean), codesSyracuse);
    const trouve = ean ? Object.entries(etiquettes).flatMap(([couleur, l]) => l.filter(x => x.ean === ean).map(x => ({ couleur, x }))) : [];
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


  const supprimerLigne = (couleurId: string, id: string | number) => {
    setEtiquettes(prev => ({ ...prev, [couleurId]: prev[couleurId].filter(eti => eti.id !== id) }));
  };

  const chercherEan = async (couleurId: string, id: string | number, ean: string) => {
    if (!ean) return;
    let nomTrouve = "";
    let dataCatalogue = null;

    const catRow = await fetch(`/api/catalogue/${encodeURIComponent(ean)}`).then(r => r.json() as Promise<any>).catch(() => null);
    if (catRow && !catRow.error) { dataCatalogue = catRow; nomTrouve = catRow.nom; }
    else {
      const jeuxRows = await fetch(`/api/jeux?ean=${encodeURIComponent(ean)}&fields=nom&limit=1`).then(r => r.json() as Promise<any>).catch(() => []);
      if (Array.isArray(jeuxRows) && jeuxRows[0]) nomTrouve = jeuxRows[0].nom;
    }

    setEtiquettes(prev => ({
      ...prev, [couleurId]: prev[couleurId].map(eti => {
        if (eti.id === id) {
          const updated: Etiquette = {
            ...eti, nom: nomTrouve || eti.nom, mecanique: dataCatalogue?.mecanique || eti.mecanique,
            nb_de_joueurs: dataCatalogue?.nb_de_joueurs || eti.nb_de_joueurs,
            coop_versus: (dataCatalogue?.coop_versus || eti.coop_versus || "") as any,
            temps_de_jeu: dataCatalogue?.temps_de_jeu || eti.temps_de_jeu,
            etoiles: dataCatalogue?.etoiles || eti.etoiles || ""
          };
          sauvegarderLigneEnBase(updated, couleurId);
          return updated;
        }
        return eti;
      })
    }));
  };

  // Complète les joueurs / le temps depuis MyLudo (source d'appoint)
  const completerDepuisMyLudo = async (couleurId: string, eti: Etiquette) => {
    if (mlLoading.has(eti.id)) return;
    if (!eti.ean && !eti.nom) return;
    setMlLoading(prev => new Set(prev).add(eti.id));
    try {
      const params = new URLSearchParams();
      if (eti.ean) params.set("ean", eti.ean);
      if (eti.nom) params.set("nom", eti.nom);
      const data = await fetch(`/api/myludo?${params}`).then(r => r.json() as Promise<any>).catch(() => null);
      if (!data || data.notFound || data.error) return;

      const joueurs = joueursDepuisMyLudo(data.players_min, data.players_max);
      const temps = tempsDepuisMyLudo(data);

      setEtiquettes(prev => ({
        ...prev, [couleurId]: prev[couleurId].map(e => {
          if (e.id !== eti.id) return e;
          const updated: Etiquette = {
            ...e,
            nb_de_joueurs: joueurs || e.nb_de_joueurs,
            temps_de_jeu: temps || e.temps_de_jeu,
          };
          sauvegarderLigneEnBase(updated, couleurId);
          return updated;
        })
      }));
    } finally {
      setMlLoading(prev => { const n = new Set(prev); n.delete(eti.id); return n; });
    }
  };

  const genererPDF = async () => {
    const catalogueData: any[] = [];
    const eansCompletsAImprimer: string[] = [];

    Object.entries(etiquettes).forEach(([couleurId, liste]) => {
      liste.forEach(e => {
        if (e.ean && e.nom) {
          catalogueData.push({
            ean: e.ean, nom: e.nom, mecanique: e.mecanique, nb_de_joueurs: e.nb_de_joueurs,
            coop_versus: e.coop_versus === "" ? null : e.coop_versus,
            temps_de_jeu: e.temps_de_jeu, etoiles: e.etoiles === "" ? null : e.etoiles, couleur: couleurId
          });
          const isIncomplet = !e.nom || !e.mecanique || !e.nb_de_joueurs || !e.coop_versus || !e.temps_de_jeu || e.etoiles === "";
          if (!isIncomplet && e.quantity > 0) eansCompletsAImprimer.push(e.ean);
        }
      });
    });

    const uniqueCatalogue = Array.from(new Map(catalogueData.map(item => [item.ean, item])).values());
    if (uniqueCatalogue.length > 0) {
      await fetch('/api/catalogue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(uniqueCatalogue) });
    }

    await validerEtapeImpression("etiquettes", eansCompletsAImprimer);
    if (impressionDouble) {
      const { parCouleur } = contenuAussi();
      await validerEtapeImpression("contenu", Object.values(parCouleur).flat().map(c => c.ean));
    }
  };

  /** Jeux choisis pour l'impression (quantité au-dessus de 0). */
  const choisis = (): JeuChoisi[] => Object.entries(etiquettes).flatMap(([couleur, liste]) =>
    liste.filter(e => e.quantity > 0 && e.ean).map(e => ({ ean: e.ean, nom: e.nom, quantity: e.quantity, couleur })));

  /** Fiches contenu des mêmes jeux, si l'impression double est cochée. */
  const contenuAussi = () => contenusPour(choisis(), catalogue);

  const scrollToLetter = (letter: string, catId: string) => {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const startIndex = letters.indexOf(letter);
    for (let i = startIndex; i < letters.length; i++) {
      const target = document.querySelector(`tr[data-category="${catId}"][data-letter="${letters[i]}"]`);
      if (target) { target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" }); return; }
    }
  };

  const totalEtiquettes = Object.values(etiquettes).flat().reduce((sum, eti) => sum + eti.quantity, 0);

  /** Lignes d'une couleur qui passent le filtre (une étiquette toute neuve, sans nom ni EAN, reste visible). */
  const lignesFiltrees = (couleurId: string) => etiquettes[couleurId].filter(e =>
    (!e.nom && !e.ean) || correspondance(filtre, e.nom, e.ean, codesSyracuse[e.ean]).ok);

  return (
    <div style={{ minHeight: "100dvh", background: "var(--cream)", display: "flex", flexDirection: "column" }}>

      <EnteteImpression actuelle="etiquettes" recherche={recherche} isMobile={isMobile} />

      {/* Main layout */}
      <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 20, padding: "var(--page-pad-y) var(--page-pad-x)", alignItems: isMobile ? "stretch" : "flex-start", flex: 1 }}>

        {/* Accordions */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div style={{ position: "relative" }}>
            <input type="text" value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="🔍 Filtrer les étiquettes : nom, EAN ou code Syracuse…"
              className="pop-input" style={{ width: "100%", fontSize: 15, paddingRight: filtre ? 40 : undefined }} />
            {filtre && <button onClick={() => setFiltre("")} title="Effacer le filtre" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", fontSize: 16, fontWeight: 900, cursor: "pointer" }}>✕</button>}
          </div>

          {filtre.trim() && CATEGORIES.every(cat => lignesFiltrees(cat.id).length === 0) && (
            <p style={{ textAlign: "center", color: "rgba(0,0,0,0.45)", padding: "16px 0", fontSize: 15, fontWeight: 700 }}>Aucune étiquette ne correspond à « {filtre.trim()} ».</p>
          )}

          {/* Étiquettes incomplètes : un clic mène au jeu et ouvre son menu de remplissage */}
          {(() => {
            const aCompleter = CATEGORIES.flatMap(cat => etiquettes[cat.id].filter(e => (e.nom || e.ean) && estIncomplete(e)).map(e => ({ cat, e })));
            if (!aCompleter.length) return null;
            return (
              <div style={{ background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden" }}>
                <div style={{ background: "#c084fc", borderBottom: "2.5px solid var(--ink)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="bc" style={{ fontSize: 18, textTransform: "uppercase" }}>Étiquettes à compléter</span>
                  <span style={{ background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 20, padding: "1px 10px", fontSize: 12, fontWeight: 800 }}>{aCompleter.length} jeu{aCompleter.length > 1 ? "x" : ""}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.7 }}>Un clic ouvre le jeu et son menu de remplissage</span>
                </div>
                <div style={{ padding: 12, display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 180, overflowY: "auto" }}>
                  {aCompleter.map(({ cat, e }) => (
                    <button key={`${cat.id}-${e.id}`} onClick={() => allerAuJeu(cat.id, e.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fff0f0", border: "2px solid var(--ink)", borderRadius: 8, padding: "6px 10px", boxShadow: "2px 2px 0 var(--ink)", cursor: "pointer", fontWeight: 700, fontSize: 14, fontFamily: "inherit" }}>
                      <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.hex, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
                      {e.nom || e.ean} <span style={{ opacity: 0.45 }}>✎</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {CATEGORIES.map((cat) => {
            const lignes = lignesFiltrees(cat.id);
            const filtreActif = !!filtre.trim();
            if (filtreActif && lignes.length === 0) return null;
            const nbIncomplets = lignes.filter(eti =>
              !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === ""
            ).length;
            const isOpen = sectionsOuvertes[cat.id] || filtreActif;

            return (
              <div key={cat.id} id={`category-${cat.id}`} className="pop-card" style={{ borderRadius: 10, overflow: "visible", position: "relative", zIndex: 20 }}>

                {/* Category header */}
                <div
                  onClick={() => toggleSection(cat.id)}
                  style={{
                    position: "sticky", top: 56, zIndex: 40,
                    background: cat.hex,
                    border: "2.5px solid var(--ink)",
                    borderRadius: isOpen ? "10px 10px 0 0" : 10,
                    padding: "12px 18px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: "pointer", userSelect: "none",
                    boxShadow: isOpen ? "none" : "4px 4px 0 var(--ink)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="bc" style={{ fontSize: 22, color: "var(--ink)", letterSpacing: "0.02em" }}>{cat.nom}</span>
                    <span style={{
                      background: "rgba(0,0,0,0.12)", color: "var(--ink)",
                      borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700,
                    }}>{filtreActif ? `${lignes.length} / ${etiquettes[cat.id].length}` : etiquettes[cat.id].length} jeu(x)</span>
                    {nbIncomplets > 0 && (
                      <span style={{
                        background: "var(--rouge)", color: "var(--white)",
                        borderRadius: 20, padding: "2px 10px", fontSize: 13, fontWeight: 700,
                        border: "1.5px solid var(--ink)", boxShadow: "1px 1px 0 var(--ink)",
                      }}>{nbIncomplets} incomplet(s)</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {isOpen && (
                      <button
                        onClick={(e) => { e.stopPropagation(); ajouterLigne(cat.id); }}
                        style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: "rgba(0,0,0,0.15)", border: "1.5px solid rgba(0,0,0,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 22, fontWeight: 900, cursor: "pointer", lineHeight: 1,
                        }}
                        title="Ajouter une étiquette"
                      >+</button>
                    )}
                    <span className="bc" style={{ fontSize: 22, width: 24, textAlign: "center" }}>{isOpen ? "−" : "+"}</span>
                  </div>
                </div>

                {isOpen && (
                  <div style={{
                    background: "var(--white)",
                    borderLeft: "2.5px solid var(--ink)",
                    borderRight: "2.5px solid var(--ink)",
                    borderBottom: "2.5px solid var(--ink)",
                    borderRadius: "0 0 10px 10px",
                    display: "flex", gap: 0, alignItems: "flex-start",
                    position: "relative",
                  }}>

                    {/* Alpha scroll sidebar — masquée sur téléphone : 28px de
                        large pour 26 lettres, ce n'est pas visable au doigt. */}
                    {!isMobile && !filtreActif && (
                    <div style={{
                      display: "flex", flexDirection: "column", alignItems: "center",
                      justifyContent: "space-between",
                      position: "sticky", top: 112,
                      height: "calc(100dvh - 160px)",
                      background: "var(--cream2)",
                      borderRight: "2px solid var(--ink)",
                      borderRadius: "0 0 0 10px",
                      padding: "6px 0", width: 28, flexShrink: 0,
                    }}>
                      {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(l => (
                        <button
                          key={l}
                          onClick={() => scrollToLetter(l, cat.id)}
                          style={{
                            fontSize: 8, fontWeight: 900, color: "rgba(0,0,0,0.4)",
                            background: "none", border: "none", cursor: "pointer",
                            flex: 1, width: "100%", display: "flex",
                            alignItems: "center", justifyContent: "center",
                            transition: "color 0.1s, transform 0.1s",
                            fontFamily: "inherit",
                          }}
                          onMouseEnter={e => { (e.target as HTMLElement).style.color = "var(--ink)"; (e.target as HTMLElement).style.transform = "scale(1.5)"; }}
                          onMouseLeave={e => { (e.target as HTMLElement).style.color = "rgba(0,0,0,0.4)"; (e.target as HTMLElement).style.transform = "scale(1)"; }}
                        >{l}</button>
                      ))}
                    </div>
                    )}

                    {/* Table */}
                    <div style={{ flex: 1, overflowX: "auto", paddingBottom: 8 }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
                        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                          <tr style={{ background: "var(--cream2)", borderBottom: "2.5px solid var(--ink)" }}>
                            {["Qte", "EAN", "Nom", "Mécanique", "Joueurs", "Coop/VS", "Temps", "Étoiles", ""].map((h, i) => (
                              <th key={i} className="bc" style={{
                                padding: "10px 12px", textAlign: i === 0 || i >= 4 ? "center" : "left",
                                fontSize: 14, letterSpacing: "0.05em", color: "var(--ink)",
                                whiteSpace: "nowrap",
                                width: [64, 128, 180, 140, 90, 110, 90, 80, 110][i],
                              }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {lignes.length === 0 ? (
                            <tr>
                              <td colSpan={9} style={{ textAlign: "center", padding: "32px 0", color: "rgba(0,0,0,0.35)", fontWeight: 700, fontSize: 15 }}>
                                Aucune étiquette — appuyez sur + dans l'en-tête.
                              </td>
                            </tr>
                          ) : (
                            lignes.map((eti) => {
                              const isIncomplet = !eti.nom || !eti.mecanique || !eti.nb_de_joueurs || !eti.coop_versus || !eti.temps_de_jeu || eti.etoiles === "";
                              const startLetter = eti.nom ? eti.nom.charAt(0).toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : "";
                              const rowBg = eti.quantity > 0
                                ? (isIncomplet ? "#fff0f0" : "#f0fff4")
                                : "var(--white)";
                              const rowBorder = eti.quantity > 0
                                ? (isIncomplet ? "3px solid var(--rouge)" : "3px solid var(--vert)")
                                : "3px solid transparent";

                              const ouverte = ligneOuverte === eti.id;
                              return (
                                <Fragment key={eti.id}>
                                <tr
                                  data-eti={String(eti.id)}
                                  data-letter={startLetter}
                                  data-category={cat.id}
                                  style={{
                                    borderBottom: "1px solid var(--cream2)",
                                    borderLeft: rowBorder,
                                    background: rowBg,
                                    scrollMarginTop: 116,
                                  }}
                                >
                                  {/* Qte */}
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <input
                                      type="number" min="0" value={eti.quantity}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "quantity", parseInt(e.target.value) || 0)}
                                      style={{
                                        ...S.inp, width: 52, textAlign: "center", fontWeight: 700,
                                        background: eti.quantity > 0 ? "var(--ink)" : "var(--cream2)",
                                        color: eti.quantity > 0 ? "var(--white)" : "var(--ink)",
                                      }}
                                    />
                                  </td>
                                  {/* EAN */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      type="text" value={eti.ean}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "ean", e.target.value)}
                                      onBlur={(e) => chercherEan(cat.id, eti.id, e.target.value)}
                                      placeholder="Code-barres..."
                                      style={{ ...S.inp, fontSize: 13 }}
                                    />
                                  </td>
                                  {/* Nom */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <input
                                      type="text" value={eti.nom}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nom", e.target.value)}
                                      onBlur={() => sauvegarderLigneEnBase(eti, cat.id)}
                                      placeholder="Nom du jeu..."
                                      style={{ ...S.inp, fontWeight: 700, ...(!eti.nom ? S.inpErr : {}) }}
                                    />
                                  </td>
                                  {/* Mécanique */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.mecanique}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "mecanique", e.target.value)}
                                      style={{ ...S.sel, ...(!eti.mecanique ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélectionner...</option>
                                      {MECANIQUES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                  </td>
                                  {/* Joueurs */}
                                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                    <input
                                      type="text" value={eti.nb_de_joueurs}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "nb_de_joueurs", e.target.value)}
                                      onBlur={() => sauvegarderLigneEnBase(eti, cat.id)}
                                      placeholder="2-6"
                                      style={{ ...S.inp, textAlign: "center", fontWeight: 700, ...(!eti.nb_de_joueurs ? S.inpErr : {}) }}
                                    />
                                  </td>
                                  {/* Coop/VS */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.coop_versus}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "coop_versus", e.target.value)}
                                      style={{ ...S.sel, fontWeight: 700, ...(!eti.coop_versus ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélect...</option>
                                      <option value="Coop">🤝 Coop</option>
                                      <option value="Versus">⚔️ Versus</option>
                                      <option value="Solo">👍 Solo</option>
                                    </select>
                                  </td>
                                  {/* Temps */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.temps_de_jeu}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "temps_de_jeu", e.target.value)}
                                      style={{ ...S.sel, textAlign: "center", fontWeight: 700, ...(!eti.temps_de_jeu ? S.inpErr : {}) }}
                                    >
                                      <option value="">Sélect...</option>
                                      {TEMPS_DE_JEU_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                  </td>
                                  {/* Étoiles */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <select
                                      value={eti.etoiles}
                                      onChange={(e) => mettreAJourLigne(cat.id, eti.id, "etoiles", e.target.value === "" ? "" : Number(e.target.value))}
                                      style={{ ...S.sel, textAlign: "center", fontWeight: 700, fontSize: 16, letterSpacing: 2, ...(eti.etoiles === "" ? S.inpErr : {}) }}
                                    >
                                      <option value="">-</option>
                                      <option value={1}>★</option>
                                      <option value={2}>★★</option>
                                      {cat.maxStars === 3 && <option value={3}>★★★</option>}
                                    </select>
                                  </td>
                                  {/* Actions */}
                                  <td style={{ padding: "6px 8px" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                      <button
                                        onClick={() => setLigneOuverte(ouverte ? null : eti.id)}
                                        title={ouverte ? "Replier le menu de remplissage" : "Remplir l'étiquette avec le menu rapide"}
                                        style={{
                                          background: ouverte ? "var(--ink)" : isIncomplet ? "var(--yellow)" : "var(--white)",
                                          color: ouverte ? "var(--white)" : "var(--ink)",
                                          border: "2px solid var(--ink)", borderRadius: 6, cursor: "pointer",
                                          fontSize: 12, fontWeight: 800, padding: "4px 7px", lineHeight: 1, fontFamily: "inherit",
                                        }}
                                      >{ouverte ? "▲" : "✎"}</button>
                                      <button
                                        onClick={() => completerDepuisMyLudo(cat.id, eti)}
                                        disabled={mlLoading.has(eti.id) || (!eti.ean && !eti.nom)}
                                        title="Compléter joueurs et temps depuis MyLudo"
                                        style={{
                                          background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 6,
                                          cursor: (mlLoading.has(eti.id) || (!eti.ean && !eti.nom)) ? "not-allowed" : "pointer",
                                          fontSize: 11, fontWeight: 800, padding: "4px 6px", lineHeight: 1,
                                          opacity: (!eti.ean && !eti.nom) ? 0.4 : 1, fontFamily: "inherit",
                                        }}
                                      >{mlLoading.has(eti.id) ? "…" : "ML"}</button>
                                      <button
                                        onClick={() => supprimerLigne(cat.id, eti.id)}
                                        title="Supprimer la ligne"
                                        style={{
                                          background: "none", border: "none", cursor: "pointer",
                                          fontSize: 20, padding: "4px 4px", borderRadius: 4,
                                          transition: "background 0.1s",
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = "#fff0f0")}
                                        onMouseLeave={e => (e.currentTarget.style.background = "none")}
                                      >🗑️</button>
                                    </div>
                                  </td>
                                </tr>
                                {ouverte && (
                                  <tr>
                                    <td colSpan={9} style={{ padding: 0 }}>
                                      <PanneauRemplissage eti={eti} maxStars={cat.maxStars} hex={cat.hex}
                                        onChoisir={(champ, v) => remplir(cat.id, eti.id, champ, v)}
                                        onMyLudo={() => completerDepuisMyLudo(cat.id, eti)} mlEnCours={mlLoading.has(eti.id)}
                                        onFermer={() => setLigneOuverte(null)} />
                                    </td>
                                  </tr>
                                )}
                                </Fragment>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </main>

        {/* Aside */}
        <aside className="pop-card" style={{
          width: isMobile ? "100%" : 300, borderRadius: 10,
          display: "flex", flexDirection: "column",
          height: isMobile ? 420 : "calc(100dvh - 96px)",
          position: isMobile ? "static" : "sticky", top: 76,
          flexShrink: 0, overflow: "hidden",
        }}>
          {/* Aside header */}
          <div style={{ padding: "16px 18px", borderBottom: "2.5px solid var(--ink)", background: "var(--cream2)" }}>
            <h2 className="bc" style={{ fontSize: 20, margin: "0 0 12px", letterSpacing: "0.03em" }}>Générateur d&apos;étiquettes</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                placeholder="🔍  Nom, EAN ou code Syracuse..."
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && recherche.trim()) { e.preventDefault(); ajouterParScan(recherche); } }}
                title="Entrée (ou douchette) : ajoute le jeu dont c'est l'EAN ou le code Syracuse"
                className="pop-input"
                style={{ flex: 1, minWidth: 0, fontSize: 15, boxSizing: "border-box" }}
              />
              <BoutonScan onScan={ajouterParScan} />
            </div>
            {ajoutScan && (
              <div role="status" style={{ marginTop: 8, fontSize: 13, fontWeight: 800, borderRadius: 8, padding: '6px 10px', border: '2px solid var(--ink)', background: ajoutScan.ok ? 'var(--vert)' : 'var(--white)' }}>{ajoutScan.texte}</div>
            )}
          </div>

          {/* Game list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
            {CATEGORIES.map(cat => {
              const items = etiquettes[cat.id]
                .map(eti => ({ eti, m: correspondance(recherche, eti.nom, eti.ean, codesSyracuse[eti.ean]) }))
                .filter(x => x.m.ok);
              if (items.length === 0) return null;
              return (
                <div key={`side-${cat.id}`} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Category label */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: cat.hex, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cat.nom}</span>
                    <span style={{ fontSize: 12, color: "rgba(0,0,0,0.35)", fontWeight: 600 }}>({items.length})</span>
                  </div>
                  {items.map(({ eti, m }) => (
                    <div key={`side-item-${eti.id}`} style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      background: "var(--cream2)", padding: "8px 10px",
                      borderRadius: 7, border: "2px solid var(--ink)",
                      boxShadow: "2px 2px 0 var(--ink)",
                    }}>
                      <span style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {eti.nom || <span style={{ fontStyle: "italic", color: "rgba(0,0,0,0.35)" }}>Sans nom</span>}
                        </span>
                        {m.code && <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.5)", fontFamily: "monospace" }}>Syracuse {m.code}</span>}
                      </span>
                      <div style={{ display: "flex", alignItems: "center", border: "2px solid var(--ink)", borderRadius: 6, background: "var(--white)", flexShrink: 0 }}>
                        <button onClick={() => modifierQuantite(cat.id, eti.id, -1)} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 16, lineHeight: 1, borderRight: "1.5px solid var(--ink)" }}>−</button>
                        <span style={{ width: 28, textAlign: "center", fontWeight: 700, fontSize: 15 }}>{eti.quantity}</span>
                        <button onClick={() => modifierQuantite(cat.id, eti.id, 1)} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", fontWeight: 900, fontSize: 16, lineHeight: 1, borderLeft: "1.5px solid var(--ink)" }}>+</button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* PDF footer */}
          <div style={{ padding: "14px 16px", borderTop: "2.5px solid var(--ink)", background: "var(--cream2)" }}>
            <p style={{ textAlign: "center", fontSize: 14, fontWeight: 700, color: "rgba(0,0,0,0.5)", margin: "0 0 10px" }}>
              {totalEtiquettes} étiquette(s)
            </p>
            <CaseImpressionDouble actuelle="etiquettes" coche={impressionDouble}
              onChange={v => { setImpressionDouble(v); ecrireImpressionDouble(v); }}
              resume={(() => {
                if (!totalEtiquettes) return null;
                const { parCouleur, ignores } = contenuAussi();
                const n = Object.values(parCouleur).flat().reduce((s, c) => s + c.quantity, 0);
                return `${n} fiche${n > 1 ? "s" : ""} contenu${ignores.length ? ` · ${ignores.length} sans contenu, non imprimée${ignores.length > 1 ? "s" : ""} (${ignores.slice(0, 3).join(", ")}${ignores.length > 3 ? "…" : ""})` : ""}`;
              })()} />
            {isClient ? (
              <BoutonImpression desactive={totalEtiquettes === 0} avant={genererPDF} style={{ padding: "12px 0" }}
                libelle={<span className="bc" style={{ fontSize: 16 }}>{impressionDouble ? "GÉNÉRER ÉTIQUETTES + CONTENU" : "GÉNÉRER LES ÉTIQUETTES"}</span>}
                documents={() => [
                  { type: "etiquettes", fileName: "etiquettes_ludo.pdf", etiquettesParCouleur: etiquettes },
                  ...(impressionDouble ? [{ type: "contenu" as const, fileName: "contenu_ludo.pdf", contenus: contenuAussi().parCouleur }] : []),
                ]} />
            ) : (
              <button disabled className="pop-btn pop-btn-dark" style={{ width: "100%", padding: "12px 0", opacity: 0.45, cursor: "not-allowed" }}>
                <span className="bc" style={{ fontSize: 16 }}>CHARGEMENT...</span>
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
