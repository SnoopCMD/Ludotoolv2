"use client";
import { useEffect, useRef, useState } from "react";
import { COULEURS_JEU } from "../lib/couleursJeux";
import {
  MECANIQUES, TEMPS_DE_JEU_OPTIONS, COOP_VERSUS_OPTIONS,
  etoilesMax, ageMinDepuisMyLudo, couleurEtEtoilesDepuisAge, joueursDepuisMyLudo, tempsDepuisMyLudo, urlRechercheMyLudo,
} from "../lib/etiquetteJeu";
import {
  LARGEUR_MODAL, MARGE_MODAL, allerA, comparaisonPossible, ecrireComparaison, fermerFenetreMyLudo, lireComparaison, ouvrirFenetreMyLudo,
} from "../lib/fenetreMyLudo";

/**
 * Compléter, depuis l'atelier, ce qui se fait à côté des étapes : la vignette
 * (jaquette) du jeu et les infos de son étiquette. Tout est enregistré au
 * catalogue, donc vaut pour tous les exemplaires du jeu.
 */

export type JeuFiche = { ean: string; nom: string };
export type FocusFiche = "vignette" | "etiquette";

type Fiche = {
  image_url: string;
  couleur: string;
  mecanique: string;
  nb_de_joueurs: string;
  coop_versus: string;
  temps_de_jeu: string;
  etoiles: string;
};

const FICHE_VIDE: Fiche = { image_url: "", couleur: "", mecanique: "", nb_de_joueurs: "", coop_versus: "", temps_de_jeu: "", etoiles: "" };

const COULEURS = [
  { id: "vert", label: "Vert" }, { id: "rose", label: "Rose" }, { id: "bleu", label: "Bleu" },
  { id: "rouge", label: "Rouge" }, { id: "jaune", label: "Jaune" },
];

/** Un jeu proposé par la recherche MyLudo. */
type CandidatMyLudo = { id: string; code: string; title: string; edition: number | null; image: string | null; url: string };

/** Réponse de /api/myludo. */
type ResultatMyLudo = {
  notFound?: boolean; error?: string;
  id?: string; url?: string | null; title?: string; edition?: number | null; image?: string | null;
  age?: string | null; players?: string | null; players_min?: number | string | null; players_max?: number | string | null;
  duration?: unknown; duree_max?: number | null; note?: string | null; temps_de_jeu?: string | null;
  trouve_par?: "code-barres" | "nom" | "choix" | null;
  candidats?: CandidatMyLudo[];
  /** Onglet « Infos » de MyLudo : description et étiquettes (type, mécaniques, thèmes). */
  description?: string | null;
  etiquettes?: string[];
  /** Nos mécaniques reconnues parmi les étiquettes, la plus probable d'abord. */
  mecaniques?: string[];
  type_partie?: { valeur: "Coop" | "Versus" | "Solo"; sur: boolean } | null;
  complexite?: { note: number; votes: number } | null;
};

/** Champs que MyLudo peut proposer. */
type ChampMyLudo = "image_url" | "nb_de_joueurs" | "temps_de_jeu" | "mecanique" | "coop_versus" | "couleur" | "etoiles";
const NOMS_CHAMPS: Record<ChampMyLudo, string> = {
  image_url: "vignette", nb_de_joueurs: "joueurs", temps_de_jeu: "temps",
  mecanique: "mécanique", coop_versus: "type de partie", couleur: "couleur", etoiles: "difficulté",
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Réduit une photo à 480 px de côté au plus, en JPEG : assez pour une vignette, léger en base. */
function photoEnDataUrl(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const max = 480;
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * r);
      canvas.height = Math.round(img.height * r);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image illisible")); };
    img.src = url;
  });
}

export default function ModalFicheAtelier({ jeu, focus, onFermer, onEnregistre }: {
  jeu: JeuFiche; focus: FocusFiche; onFermer: () => void; onEnregistre: () => void;
}) {
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [initiale, setInitiale] = useState<Fiche>(FICHE_VIDE);
  const [enCours, setEnCours] = useState<"myludo" | "photo" | "enregistrer" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [imageCassee, setImageCassee] = useState(false);
  // MyLudo : le jeu trouvé, les autres résultats, et les champs qu'il a remplis
  // (ceux-là, choisir un autre jeu les remplace ; les autres ne sont que suggérés).
  const [ml, setMl] = useState<ResultatMyLudo | null>(null);
  const [candidats, setCandidats] = useState<CandidatMyLudo[]>([]);
  const [voirCandidats, setVoirCandidats] = useState(false);
  const [remplisParMl, setRemplisParMl] = useState<Set<ChampMyLudo>>(new Set());
  // Fenêtre MyLudo à côté de la modal, pour comparer (voir lib/fenetreMyLudo.ts).
  const [comparaison, setComparaison] = useState(false);
  const [fenetreActive, setFenetreActive] = useState(false);
  const fenetreMl = useRef<Window | null>(null);
  const refEtiquette = useRef<HTMLDivElement>(null);
  const refPhoto = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/catalogue/${encodeURIComponent(jeu.ean)}`).then(r => r.json() as Promise<any>).catch(() => null).then(cat => {
      if (annule) return;
      const f: Fiche = {
        image_url: str(cat?.image_url),
        couleur: str(cat?.couleur) === "orange" ? "jaune" : str(cat?.couleur),
        mecanique: str(cat?.mecanique),
        nb_de_joueurs: str(cat?.nb_de_joueurs),
        coop_versus: str(cat?.coop_versus),
        temps_de_jeu: str(cat?.temps_de_jeu),
        etoiles: cat?.etoiles === null || cat?.etoiles === undefined || cat?.etoiles === "" ? "" : String(Math.round(Number(cat.etoiles))),
      };
      setFiche(f); setInitiale(f);
      if (focus === "etiquette") setTimeout(() => refEtiquette.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
    return () => { annule = true; };
  }, [jeu.ean, focus]);

  const maj = (champ: keyof Fiche, valeur: string) => setFiche(f => (f ? { ...f, [champ]: valeur } : f));
  const modifie = !!fiche && (Object.keys(FICHE_VIDE) as (keyof Fiche)[]).some(k => fiche[k] !== initiale[k]);
  const fermer = () => { if (!modifie || confirm("Fermer sans enregistrer ?")) onFermer(); };

  useEffect(() => { setComparaison(lireComparaison() && comparaisonPossible()); }, []);
  // La fenêtre MyLudo se ferme avec la modal ; fermée à la main, la modal se recentre.
  useEffect(() => {
    if (!fenetreActive) return;
    const t = setInterval(() => { if (!fenetreMl.current || fenetreMl.current.closed) setFenetreActive(false); }, 800);
    return () => clearInterval(t);
  }, [fenetreActive]);
  useEffect(() => () => fermerFenetreMyLudo(fenetreMl.current), []);

  /** Ouvre la fenêtre MyLudo à côté (pendant un clic). Faux si elle n'est pas voulue ou a été bloquée. */
  const ouvrirComparaison = (url: string | null): boolean => {
    if (!comparaison || !comparaisonPossible()) return false;
    // Déjà ouverte : on la réutilise (une fois coupée de LudoTool, le navigateur
    // ne la retrouve plus par son nom et en ouvrirait une seconde).
    const ouverte = fenetreMl.current;
    if (ouverte && !ouverte.closed) {
      if (url) allerA(ouverte, url);
      try { ouverte.focus(); } catch { /* rien */ }
      setFenetreActive(true);
      return true;
    }
    const f = ouvrirFenetreMyLudo(url);
    if (!f) { setMessage("Le navigateur a bloqué la fenêtre MyLudo : autorise les fenêtres surgissantes pour LudoTool."); return false; }
    fenetreMl.current = f;
    setFenetreActive(true);
    return true;
  };
  const changerComparaison = (v: boolean) => {
    setComparaison(v); ecrireComparaison(v);
    if (!v) { fermerFenetreMyLudo(fenetreMl.current); setFenetreActive(false); }
  };
  /** Lien vers MyLudo : dans la fenêtre d'à côté si elle est voulue, sinon dans un nouvel onglet. */
  const ouvrirLien = (e: React.MouseEvent, url: string) => { if (ouvrirComparaison(url)) e.preventDefault(); };

  /** Ce que MyLudo propose pour chaque champ. */
  /** Couleur et étoiles selon l'âge minimum, la durée et les joueurs (règle de lib/etiquetteJeu.ts). */
  const classement = (data: ResultatMyLudo | null) =>
    data ? couleurEtEtoilesDepuisAge(ageMinDepuisMyLudo(data), Number(data.duree_max) || null,
      { min: Number(data.players_min) || null, max: Number(data.players_max) || null }) : null;

  const propositions = (data: ResultatMyLudo | null): Partial<Record<ChampMyLudo, string>> => {
    if (!data || data.notFound || data.error) return {};
    const c = classement(data);
    return {
      image_url: data.image ?? "",
      nb_de_joueurs: joueursDepuisMyLudo(Number(data.players_min) || null, Number(data.players_max) || null),
      temps_de_jeu: tempsDepuisMyLudo(data),
      mecanique: data.mecaniques?.[0] ?? "",
      coop_versus: data.type_partie?.valeur ?? "",
      couleur: c?.couleur ?? "",
      etoiles: c ? String(c.etoiles) : "",
    };
  };

  /**
   * Cherche le jeu sur MyLudo (par code-barres puis par nom), ou charge un jeu
   * choisi parmi les résultats. Remplit les champs vides, et ceux que MyLudo
   * avait remplis pour un autre jeu ; les autres valeurs ne sont que suggérées.
   */
  const chercherMyLudo = async (choix?: CandidatMyLudo) => {
    if (!fiche) return;
    setEnCours("myludo"); setMessage(null);
    // Ouverte tout de suite (le navigateur l'exige pendant le clic) : sur le jeu choisi, ou en attente du résultat.
    const fenetre = ouvrirComparaison(choix ? choix.url : null);
    const params = choix ? new URLSearchParams({ id: choix.id, code: choix.code }) : new URLSearchParams({ ean: jeu.ean, nom: jeu.nom });
    const data = await fetch(`/api/myludo?${params}`).then(r => r.json() as Promise<ResultatMyLudo>).catch(() => null);
    setEnCours(null);
    setVoirCandidats(false);
    if (!choix) setCandidats(data?.candidats ?? []);
    if (fenetre && !choix) {
      const url = data?.url || (data?.notFound ? urlRechercheMyLudo(jeu.nom) : null);
      if (url) allerA(fenetreMl.current, url); else { fermerFenetreMyLudo(fenetreMl.current); setFenetreActive(false); }
    }
    if (!data || data.error) { setMl(null); setMessage("MyLudo ne répond pas, réessaie dans un moment."); return; }
    setMl(data);
    if (data.notFound) return;

    const props = propositions(data);
    const n = { ...fiche };
    const remplis = new Set<ChampMyLudo>();
    for (const champ of Object.keys(props) as ChampMyLudo[]) {
      const v = props[champ];
      if (!v) continue;
      // Les étoiles de la règle valent pour sa couleur : pas de remplissage si la fiche en garde une autre.
      if (champ === "etoiles" && props.couleur && (n.couleur || fiche.couleur) !== props.couleur && !remplis.has("couleur")) continue;
      const vide = !fiche[champ].trim() || (champ === "image_url" && imageCassee);
      if (vide || remplisParMl.has(champ)) { n[champ] = v; remplis.add(champ); }
    }
    if (remplis.has("image_url")) setImageCassee(false);
    setFiche(n);
    setRemplisParMl(remplis);
    const notes: string[] = [];
    if (remplis.has("coop_versus") && data.type_partie && !data.type_partie.sur) notes.push("type de partie « Versus » déduit : rien n'indique un jeu coopératif");
    if (!props.etoiles) notes.push("couleur et difficulté à choisir : pas d'âge sur MyLudo");
    if (!props.mecanique) notes.push("mécanique à choisir : aucune étiquette MyLudo ne correspond à la liste");
    setMessage((remplis.size ? `Complété depuis MyLudo : ${[...remplis].map(c => NOMS_CHAMPS[c]).join(", ")}.` : "Rien de vide à compléter : les valeurs de MyLudo qui diffèrent sont proposées sous les champs.")
      + (notes.length ? ` (${notes.join(" ; ")})` : ""));
  };

  /** Valeur de MyLudo pour un champ, quand elle diffère de la saisie. */
  const suggestion = (champ: ChampMyLudo) => {
    const v = propositions(ml)[champ];
    return v && fiche && v !== fiche[champ] ? v : null;
  };
  const utiliserSuggestion = (champ: ChampMyLudo) => {
    const v = suggestion(champ);
    if (!v) return;
    maj(champ, v);
    // La couleur et les étoiles vont ensemble : prendre la couleur prend aussi les étoiles.
    if (champ === "couleur") { const e = propositions(ml).etoiles; if (e) maj("etoiles", e); }
    if (champ === "image_url") setImageCassee(false);
  };

  const choisirPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setEnCours("photo");
    try { maj("image_url", await photoEnDataUrl(fichier)); setImageCassee(false); }
    catch { setMessage("Cette image n'a pas pu être lue."); }
    finally { setEnCours(null); }
  };

  const enregistrer = async () => {
    if (!fiche) return;
    setEnCours("enregistrer");
    const ligne = {
      ean: jeu.ean, nom: jeu.nom,
      image_url: fiche.image_url.trim() || null,
      couleur: fiche.couleur || null,
      mecanique: fiche.mecanique || null,
      nb_de_joueurs: fiche.nb_de_joueurs.trim() || null,
      coop_versus: fiche.coop_versus || null,
      temps_de_jeu: fiche.temps_de_jeu || null,
      etoiles: fiche.etoiles === "" ? null : Number(fiche.etoiles),
    };
    const ok = await fetch("/api/catalogue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([ligne]) })
      .then(r => r.ok).catch(() => false);
    setEnCours(null);
    if (!ok) { setMessage("L'enregistrement a échoué, réessaie."); return; }
    onEnregistre();
    onFermer();
  };

  const maxEtoiles = etoilesMax(fiche?.couleur);
  // Une 3e étoile n'existe pas pour les couleurs à 2 étoiles.
  useEffect(() => {
    if (fiche && fiche.etoiles !== "" && Number(fiche.etoiles) > maxEtoiles) maj("etoiles", String(maxEtoiles));
  }, [maxEtoiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const titreSection: React.CSSProperties = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", color: "rgba(0,0,0,0.5)", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 };
  const libelle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.55)", marginBottom: 5, display: "block" };
  const choix = (actif: boolean, fond = "var(--yellow)"): React.CSSProperties => ({
    border: "2px solid var(--ink)", borderRadius: 8, padding: "7px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
    background: actif ? fond : "var(--white)", boxShadow: actif ? "2px 2px 0 var(--ink)" : "none",
  });
  const manque = (vide: boolean): React.CSSProperties => (vide ? { borderColor: "var(--rouge)", background: "#fff5f5" } : {});

  const hex = fiche?.couleur ? COULEURS_JEU[fiche.couleur] : undefined;
  const etiquetteComplete = !!fiche && !!(fiche.mecanique && fiche.nb_de_joueurs.trim() && fiche.coop_versus && fiche.temps_de_jeu && fiche.etoiles !== "");

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80, display: "flex", alignItems: "center",
      // Fenêtre MyLudo ouverte à droite : la modal se range à gauche.
      justifyContent: fenetreActive ? "flex-start" : "center",
      padding: fenetreActive ? `calc(var(--nav-h) + 12px) 12px 12px ${MARGE_MODAL}px` : "calc(var(--nav-h) + 12px) 12px 12px", transition: "padding .2s" }}
      onClick={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 12, boxShadow: "8px 8px 0 var(--ink)", width: "100%", maxWidth: LARGEUR_MODAL, display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - var(--nav-h) - 36px)", overflow: "hidden" }}>
        {/* En-tête */}
        <div style={{ padding: "16px 20px", borderBottom: "3px solid var(--ink)", background: hex ?? "var(--yellow)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc" style={{ fontSize: 22, textTransform: "uppercase", lineHeight: 1.1 }}>{jeu.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.55)" }}>Vignette et étiquette · EAN {jeu.ean}</div>
          </div>
          <button onClick={fermer} style={{ width: 32, height: 32, flexShrink: 0, background: "var(--ink)", color: "var(--white)", border: "2px solid var(--ink)", borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        {!fiche ? (
          <p style={{ padding: 40, textAlign: "center", color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Chargement…</p>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 22 }}>
            <PanneauMyLudo nom={jeu.nom} ml={ml} candidats={candidats} voirCandidats={voirCandidats} enCours={enCours === "myludo"} desactive={enCours !== null}
              onChercher={() => chercherMyLudo()} onChoisir={c => chercherMyLudo(c)} onVoirCandidats={() => setVoirCandidats(v => !v)}
              onLien={ouvrirLien} comparaison={comparaison} onComparaison={comparaisonPossible() ? changerComparaison : undefined} />
            {message && <div style={{ fontSize: 13, fontWeight: 700, background: "var(--cream2)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px" }}>{message}</div>}

            {/* ── Vignette ── */}
            <section>
              <div style={titreSection}>🖼 Vignette {fiche.image_url && !imageCassee && <span style={{ color: "#3f7d0e" }}>✓</span>}</div>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ width: 110, height: 140, flexShrink: 0, border: "2.5px solid var(--ink)", borderRadius: 6, overflow: "hidden", background: hex ?? "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
                  {fiche.image_url && !imageCassee ? (
                    <img src={fiche.image_url} alt="" onError={() => setImageCassee(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 11, fontWeight: 800, padding: 6, color: "rgba(0,0,0,0.6)" }}>{imageCassee ? "Image introuvable" : "Pas de vignette"}</span>
                  )}
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={libelle}>Adresse de l&apos;image</label>
                  <input className="pop-input" type="url" placeholder="https://…" value={fiche.image_url.startsWith("data:") ? "" : fiche.image_url}
                    onChange={e => { maj("image_url", e.target.value); setImageCassee(false); }} style={{ width: "100%" }} />
                  {fiche.image_url.startsWith("data:") && <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)" }}>Photo importée depuis l&apos;appareil.</span>}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="pop-btn" style={{ background: "var(--white)", fontSize: 13 }} disabled={enCours !== null} onClick={() => refPhoto.current?.click()}>
                      {enCours === "photo" ? "Lecture…" : "📷 Photo / fichier"}
                    </button>
                    {fiche.image_url && (
                      <button className="pop-btn" style={{ background: "var(--white)", fontSize: 13 }} onClick={() => { maj("image_url", ""); setImageCassee(false); }}>Retirer</button>
                    )}
                  </div>
                  <input ref={refPhoto} type="file" accept="image/*" capture="environment" onChange={choisirPhoto} style={{ display: "none" }} />
                  {suggestion("image_url") && (
                    <Suggestion onUtiliser={() => utiliserSuggestion("image_url")}>
                      <img src={suggestion("image_url")!} alt="" style={{ width: 28, height: 28, objectFit: "contain", borderRadius: 4, border: "1.5px solid var(--ink)", background: "var(--white)" }} /> vignette de MyLudo
                    </Suggestion>
                  )}
                </div>
              </div>
            </section>

            {/* ── Étiquette ── */}
            <section ref={refEtiquette} style={{ scrollMarginTop: 10 }}>
              <div style={titreSection}>🏷 Étiquette {etiquetteComplete && <span style={{ color: "#3f7d0e" }}>✓ complète</span>}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <span style={libelle}>Couleur</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {COULEURS.map(c => {
                      const actif = fiche.couleur === c.id;
                      return (
                        <button key={c.id} onClick={() => maj("couleur", actif ? "" : c.id)} title={c.label}
                          style={{ ...choix(actif, COULEURS_JEU[c.id]), display: "flex", alignItems: "center", gap: 6, padding: "6px 10px" }}>
                          <span style={{ width: 14, height: 14, borderRadius: "50%", background: COULEURS_JEU[c.id], border: "1.5px solid var(--ink)" }} />{c.label}
                        </button>
                      );
                    })}
                  </div>
                  {suggestion("couleur") && (
                    <Suggestion onUtiliser={() => utiliserSuggestion("couleur")}>
                      <span style={{ width: 12, height: 12, borderRadius: "50%", background: COULEURS_JEU[suggestion("couleur")!], border: "1.5px solid var(--ink)" }} />
                      {COULEURS.find(c => c.id === suggestion("couleur"))?.label} {"★".repeat(Number(propositions(ml).etoiles) || 0)} ({suggestion("couleur") === "jaune" ? "2 joueurs, " : ""}{ml?.age ?? "âge"}{Number(ml?.duree_max) ? `, ${ml?.duree_max} min` : ""})
                    </Suggestion>
                  )}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={libelle}>Mécanique</label>
                    <select className="pop-input" value={fiche.mecanique} onChange={e => maj("mecanique", e.target.value)} style={{ width: "100%", ...manque(!fiche.mecanique) }}>
                      <option value="">Sélectionner…</option>
                      {MECANIQUES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    {suggestion("mecanique") && <Suggestion onUtiliser={() => utiliserSuggestion("mecanique")}>{suggestion("mecanique")}</Suggestion>}
                    {/* Autres mécaniques reconnues sur MyLudo, à choisir d'un clic */}
                    {(ml?.mecaniques?.length ?? 0) > 1 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                        {ml!.mecaniques!.filter(m => m !== fiche.mecanique).map(m => (
                          <button key={m} onClick={() => maj("mecanique", m)} title="Mécanique repérée sur MyLudo"
                            style={{ fontFamily: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "1.5px solid var(--ink)", borderRadius: 12, padding: "1px 8px", background: "var(--white)" }}>{m}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={libelle}>Joueurs</label>
                    <input className="pop-input" type="text" placeholder="2-6" value={fiche.nb_de_joueurs} onChange={e => maj("nb_de_joueurs", e.target.value)}
                      style={{ width: "100%", fontWeight: 700, ...manque(!fiche.nb_de_joueurs.trim()) }} />
                    {suggestion("nb_de_joueurs") && <Suggestion onUtiliser={() => utiliserSuggestion("nb_de_joueurs")}>{suggestion("nb_de_joueurs")}</Suggestion>}
                  </div>
                </div>

                <div>
                  <span style={libelle}>Type de partie</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(fiche.coop_versus ? {} : { outline: "2px dashed var(--rouge)", outlineOffset: 3, borderRadius: 8, width: "fit-content" }) }}>
                    {COOP_VERSUS_OPTIONS.map(o => (
                      <button key={o.id} onClick={() => maj("coop_versus", fiche.coop_versus === o.id ? "" : o.id)} style={choix(fiche.coop_versus === o.id)}>{o.label}</button>
                    ))}
                  </div>
                  {suggestion("coop_versus") && <Suggestion onUtiliser={() => utiliserSuggestion("coop_versus")}>{suggestion("coop_versus")}{ml?.type_partie && !ml.type_partie.sur ? " (déduit)" : ""}</Suggestion>}
                </div>

                <div>
                  <span style={libelle}>Temps de jeu (min)</span>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", ...(fiche.temps_de_jeu ? {} : { outline: "2px dashed var(--rouge)", outlineOffset: 3, borderRadius: 8, width: "fit-content" }) }}>
                    {TEMPS_DE_JEU_OPTIONS.map(t => (
                      <button key={t} onClick={() => maj("temps_de_jeu", fiche.temps_de_jeu === t ? "" : t)} style={{ ...choix(fiche.temps_de_jeu === t), padding: "6px 10px", fontSize: 13 }}>{t}</button>
                    ))}
                  </div>
                  {suggestion("temps_de_jeu") && <Suggestion onUtiliser={() => utiliserSuggestion("temps_de_jeu")}>{suggestion("temps_de_jeu")} min</Suggestion>}
                </div>

                <div>
                  <span style={libelle}>Difficulté{!fiche.couleur && " (choisir la couleur : 3 étoiles possibles en vert et jaune)"}</span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", ...(fiche.etoiles !== "" ? {} : { outline: "2px dashed var(--rouge)", outlineOffset: 3, borderRadius: 8, width: "fit-content" }) }}>
                    {Array.from({ length: maxEtoiles }, (_, i) => String(i + 1)).map(n => (
                      <button key={n} onClick={() => maj("etoiles", fiche.etoiles === n ? "" : n)} style={{ ...choix(fiche.etoiles === n), fontSize: 16, letterSpacing: 2 }}>{"★".repeat(Number(n))}</button>
                    ))}
                  </div>
                  {suggestion("etoiles") && <Suggestion onUtiliser={() => utiliserSuggestion("etoiles")}>{"★".repeat(Number(suggestion("etoiles")))} ({ml?.age ?? "âge"}{Number(ml?.duree_max) ? `, ${ml?.duree_max} min` : ""})</Suggestion>}
                </div>
              </div>
            </section>
          </div>
        )}

        <div style={{ padding: "12px 20px", borderTop: "3px solid var(--ink)", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)", flex: 1 }}>Enregistré au catalogue : vaut pour tous les exemplaires du jeu.</span>
          <button className="pop-btn pop-btn-outline" onClick={fermer}>Annuler</button>
          <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!fiche || !modifie || enCours !== null} style={{ opacity: !fiche || !modifie ? 0.4 : 1 }}>
            {enCours === "enregistrer" ? "Enregistrement…" : "✓ Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Valeur de MyLudo proposée sous un champ qui en a déjà une autre. */
function Suggestion({ children, onUtiliser }: { children: React.ReactNode; onUtiliser: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.6)", flexWrap: "wrap" }}>
      <span>MyLudo :</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</span>
      <button onClick={onUtiliser} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 800, cursor: "pointer", border: "1.5px solid var(--ink)", borderRadius: 12, padding: "1px 9px", background: "var(--white)" }}>Utiliser</button>
    </div>
  );
}

/**
 * Le bouton MyLudo et ce qu'il a trouvé : le jeu retenu (et comment), un lien
 * vers sa fiche, les autres résultats si ce n'est pas le bon, et une recherche
 * sur le site quand MyLudo ne l'a pas trouvé.
 */
function PanneauMyLudo({ nom, ml, candidats, voirCandidats, enCours, desactive, onChercher, onChoisir, onVoirCandidats, onLien, comparaison, onComparaison }: {
  nom: string; ml: ResultatMyLudo | null; candidats: CandidatMyLudo[]; voirCandidats: boolean; enCours: boolean; desactive: boolean;
  onChercher: () => void; onChoisir: (c: CandidatMyLudo) => void; onVoirCandidats: () => void;
  /** Clic sur un lien MyLudo : l'ouvre dans la fenêtre d'à côté si elle est voulue. */
  onLien: (e: React.MouseEvent, url: string) => void;
  comparaison: boolean;
  /** Absent quand l'écran est trop petit pour la fenêtre d'à côté. */
  onComparaison?: (v: boolean) => void;
}) {
  const lien: React.CSSProperties = { fontSize: 12, fontWeight: 800, color: "var(--ink)", border: "2px solid var(--ink)", borderRadius: 14, padding: "3px 10px", background: "var(--white)", textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 };
  const autres = candidats.filter(c => c.id !== ml?.id);
  const trouve = ml && !ml.notFound && !ml.error;
  const confiance = ml?.trouve_par === "code-barres"
    ? { texte: "✓ Trouvé par le code-barre", fond: "var(--vert)" }
    : ml?.trouve_par === "choix"
      ? { texte: "Jeu choisi", fond: "var(--bleu)" }
      : { texte: "Trouvé par le nom : vérifie que c'est le bon jeu", fond: "var(--orange)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={onChercher} disabled={desactive} className="pop-btn" style={{ background: "var(--white)", fontSize: 13 }}>
          {enCours ? "Recherche sur MyLudo…" : trouve ? "↻ Relancer MyLudo" : "✨ Compléter avec MyLudo"}
        </button>
        {!trouve && <a href={urlRechercheMyLudo(nom)} target="_blank" rel="noopener noreferrer" onClick={e => onLien(e, urlRechercheMyLudo(nom))} style={lien} title="Recherche Google limitée à myludo.fr">🔎 Chercher sur MyLudo ↗</a>}
      </div>
      {onComparaison && (
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.6)", cursor: "pointer", width: "fit-content" }}>
          <input type="checkbox" checked={comparaison} onChange={e => onComparaison(e.target.checked)} style={{ accentColor: "#0d0d0d", width: 15, height: 15, cursor: "pointer" }} />
          Ouvrir la page MyLudo à côté pour comparer
        </label>
      )}

      {ml?.notFound && (
        <div style={{ fontSize: 13, fontWeight: 700, background: "#fff5f5", border: "2px solid var(--rouge)", borderRadius: 8, padding: "8px 12px" }}>
          {`MyLudo ne trouve pas « ${nom} ». Essaie le lien de recherche${autres.length ? ", ou un des jeux ci-dessous" : ""}.`}
        </div>
      )}

      {trouve && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 10, padding: 10, flexWrap: "wrap" }}>
          <div style={{ width: 54, height: 54, flexShrink: 0, borderRadius: 6, border: "1.5px solid var(--ink)", overflow: "hidden", background: "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {ml.image ? <img src={ml.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "🎲"}
          </div>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{ml.title}{ml.edition ? <span style={{ fontWeight: 600, color: "rgba(0,0,0,0.5)" }}> · {ml.edition}</span> : null}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.6)", marginTop: 2 }}>
              {[ml.players && `👥 ${ml.players}`, ml.duration != null && ml.duration !== "" && `⏱ ${ml.duration} min`, ml.age && `🎂 ${ml.age}`, ml.note && `★ ${ml.note}`].filter(Boolean).join("  ·  ")}
            </div>
            <span style={{ display: "inline-block", marginTop: 5, fontSize: 11, fontWeight: 800, background: confiance.fond, border: "1.5px solid var(--ink)", borderRadius: 10, padding: "1px 8px" }}>{confiance.texte}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
            {ml.url && <a href={ml.url} target="_blank" rel="noopener noreferrer" onClick={e => onLien(e, ml.url!)} style={lien}>Voir sur MyLudo ↗</a>}
            <button onClick={onVoirCandidats} style={{ ...lien, cursor: "pointer", fontFamily: "inherit", background: voirCandidats ? "var(--cream2)" : "var(--white)" }}>
              {voirCandidats ? "Fermer" : "Pas le bon jeu ?"}
            </button>
          </div>
        </div>
      )}

      {trouve && (ml.etiquettes?.length || ml.description) ? <InfosMyLudo ml={ml} /> : null}

      {(voirCandidats || ml?.notFound) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {autres.map(c => (
            <button key={c.id} onClick={() => onChoisir(c)} disabled={desactive}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
              <span style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 4, overflow: "hidden", background: "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {c.image ? <img src={c.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : "🎲"}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13 }}>{c.title}{c.edition ? <span style={{ fontWeight: 600, color: "rgba(0,0,0,0.5)" }}> · {c.edition}</span> : null}</span>
              <span style={{ fontSize: 12, fontWeight: 800 }}>Choisir</span>
            </button>
          ))}
          {voirCandidats && !autres.length && <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)" }}>MyLudo ne propose pas d&apos;autre jeu pour ce nom.</span>}
          {trouve && <a href={urlRechercheMyLudo(nom)} target="_blank" rel="noopener noreferrer" onClick={e => onLien(e, urlRechercheMyLudo(nom))} style={{ ...lien, alignSelf: "flex-start" }} title="Recherche Google limitée à myludo.fr">🔎 Chercher sur MyLudo ↗</a>}
        </div>
      )}
    </div>
  );
}

/** Étiquettes et description de l'onglet « Infos » de MyLudo, pour comparer sans quitter la modal. */
function InfosMyLudo({ ml }: { ml: ResultatMyLudo }) {
  const [voirDescription, setVoirDescription] = useState(false);
  const reconnues = new Set(ml.mecaniques ?? []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 10, padding: 10 }}>
      {!!ml.etiquettes?.length && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "rgba(0,0,0,0.45)", marginRight: 2 }}>MyLudo</span>
          {ml.etiquettes.map(e => {
            const mecanique = [...reconnues].some(m => m.toLowerCase() === e.toLowerCase());
            return (
              <span key={e} title={mecanique ? "Mécanique de la liste" : undefined}
                style={{ fontSize: 12, fontWeight: 700, borderRadius: 12, padding: "2px 9px", border: mecanique ? "2px solid var(--ink)" : "1.5px solid rgba(0,0,0,0.25)", background: mecanique ? "var(--yellow)" : "var(--cream2)" }}>{e}</span>
            );
          })}
        </div>
      )}
      {ml.description && (
        <div>
          <button onClick={() => setVoirDescription(v => !v)} style={{ fontFamily: "inherit", fontSize: 12, fontWeight: 800, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--ink)" }}>
            {voirDescription ? "▾" : "▸"} Description
          </button>
          {voirDescription && <p style={{ margin: "6px 0 0", fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-line", color: "rgba(0,0,0,0.75)", maxHeight: 220, overflowY: "auto" }}>{ml.description}</p>}
        </div>
      )}
    </div>
  );
}
