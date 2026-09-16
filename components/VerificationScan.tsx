"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import BoutonScan, { type RetourScan } from "./ScanCodeBarre";

/** Le strict nécessaire pour recouper un scan avec le parc. */
export type JeuVerif = {
  id: string | number;
  nom: string;
  ean: string;
  code_syracuse?: string | null;
  statut: string;
};

/** Ce que le contrôle a conclu pour une boîte.
 *
 *  - `attente`       : un seul code scanné, on attend l'autre (ou « Boîte suivante »)
 *  - `ok`            : le jeu est en base et l'étiquette Syracuse scannée lui correspond
 *  - `non_verifie`   : le jeu est en base, tous ses exemplaires sont codés, mais l'étiquette n'a pas été scannée
 *  - `sans_syracuse` : le jeu est en base, mais l'exemplaire n'a pas de code Syracuse (ou l'étiquette scannée est inconnue)
 *  - `absent`        : ni l'EAN ni l'étiquette ne sont en base
 *  - `conflit`       : l'étiquette scannée est enregistrée sur un autre jeu
 *  - `corrige`       : une action (association, création) a été appliquée
 */
type Verdict = "attente" | "ok" | "non_verifie" | "sans_syracuse" | "absent" | "conflit" | "corrige";

type Boite = {
  id: string;
  ean: string | null;
  syracuse: string | null;
  /** Exemplaires du jeu identifié par l'EAN. */
  copies: JeuVerif[];
  /** Exemplaire (d'un autre jeu, ou du même) qui porte déjà l'étiquette scannée. */
  porteur: JeuVerif | null;
  /** Nom connu du catalogue quand aucun exemplaire n'existe (permet de créer). */
  nomCatalogue: string | null;
  verdict: Verdict;
  message: string;
  enCours: boolean;
};

const EST_PROBLEME: Record<Verdict, boolean> = {
  attente: false, ok: false, non_verifie: false, corrige: false,
  sans_syracuse: true, absent: true, conflit: true,
};

const LIBELLE: Record<Verdict, string> = {
  attente: "En attente",
  ok: "✓ Enregistré",
  non_verifie: "✓ En base · étiquette non vérifiée",
  sans_syracuse: "⚠ Code Syracuse manquant",
  absent: "✗ Absent de la base",
  conflit: "✗ Conflit",
  corrige: "✓ Corrigé",
};

/** Couleur de fond des cartes et des pastilles, et ton du retour caméra. */
const TON: Record<Verdict, RetourScan["ton"]> = {
  attente: "attente", ok: "ok", non_verifie: "ok", corrige: "ok",
  sans_syracuse: "alerte", absent: "erreur", conflit: "erreur",
};
const COULEUR: Record<RetourScan["ton"], { fond: string; vif: string; texte: string }> = {
  ok:      { fond: "#f0fff4", vif: "var(--vert)", texte: "var(--ink)" },
  attente: { fond: "#fffbeb", vif: "var(--yellow)", texte: "var(--ink)" },
  alerte:  { fond: "#fff4e5", vif: "#ff9f1c", texte: "var(--ink)" },
  erreur:  { fond: "#fff0f3", vif: "var(--rouge)", texte: "var(--white)" },
};

/** Un code produit du commerce fait 12 ou 13 chiffres ; les codes Syracuse
 *  sont plus courts (complétés à 8 chiffres comme partout dans l'outil). */
const ressembleAUnEan = (code: string) => /^\d{12,13}$/.test(code);

const normaliserCode = (brut: string) => {
  let code = brut.trim();
  if (/^\d+$/.test(code) && code.length < 8) code = code.padStart(8, "0");
  return code;
};

const ETAPES_FAITES = { etape_nouveaute: 0, etape_plastifier: 1, etape_contenu: 1, etape_etiquette: 1, etape_equiper: 1, etape_encoder: 1, etape_notice: 1 };

/** Signal sonore + vibration selon le verdict, pour qu'on n'ait pas à
 *  regarder l'écran entre deux boîtes : un bip bref si tout va bien, deux
 *  bips graves sur une anomalie. Tout est facultatif (le navigateur peut
 *  refuser l'audio tant qu'on n'a pas interagi avec la page). */
let contexteAudio: AudioContext | null = null;
function alerter(ton: RetourScan["ton"]) {
  const erreur = ton === "alerte" || ton === "erreur";
  try {
    if (erreur) navigator.vibrate?.([120, 60, 120]);
    contexteAudio ??= new AudioContext();
    const ctx = contexteAudio;
    const jouer = (freq: number, debut: number, duree: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + debut);
      osc.stop(ctx.currentTime + debut + duree);
    };
    if (ton === "ok") jouer(1400, 0, 0.08);
    else if (ton === "attente") jouer(900, 0, 0.06);
    else { jouer(330, 0, 0.16); jouer(330, 0.22, 0.16); }
  } catch {
    // Pas de son : le retour visuel reste.
  }
}

/** Contrôle d'inventaire par scan.
 *
 *  On prend les boîtes une par une et on scanne ce qu'elles portent : le
 *  code-barres du commerce (EAN) et/ou l'étiquette interne (code Syracuse).
 *  Chaque boîte est recoupée avec le parc pour dire si elle est bien
 *  enregistrée, si l'exemplaire n'a pas de code Syracuse, ou si le jeu manque
 *  carrément en base. Les corrections simples (associer une étiquette, créer
 *  l'exemplaire quand la fiche catalogue existe) se font sur place ; le reste
 *  renvoie vers l'atelier. « Terminer » affiche le compte rendu de la session.
 *
 *  Le recoupement se fait sur la liste déjà chargée par l'inventaire : pas
 *  d'aller-retour serveur par scan, sauf pour lire la fiche catalogue d'un
 *  EAN inconnu du parc.
 */
export default function VerificationScan({ jeux, onFermer, onModifie }: {
  jeux: JeuVerif[];
  onFermer: () => void;
  /** Appelé après chaque écriture en base, pour que l'inventaire se recharge. */
  onModifie: () => void;
}) {
  const [saisie, setSaisie] = useState("");
  const [boites, setBoites] = useState<Boite[]>([]);
  const [retour, setRetour] = useState<RetourScan | null>(null);
  const [vue, setVue] = useState<"scan" | "bilan">("scan");
  const [copie, setCopie] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);
  /** Copie locale du parc, mise à jour après chaque correction pour que les
   *  scans suivants voient tout de suite le nouvel état, sans attendre le
   *  rechargement de l'inventaire. */
  const parcRef = useRef<JeuVerif[]>(jeux);
  useEffect(() => { parcRef.current = jeux; }, [jeux]);

  useEffect(() => { if (vue === "scan") champRef.current?.focus(); }, [vue]);

  const refocus = () => setTimeout(() => champRef.current?.focus(), 50);

  const majBoite = (id: string, patch: Partial<Boite>) =>
    setBoites(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));

  /** Recharge le nom catalogue d'un EAN inconnu du parc : c'est ce qui
   *  distingue « fiche présente mais aucun exemplaire » de « rien du tout ». */
  const chercherNomCatalogue = async (id: string, ean: string) => {
    const fiche = await fetch(`/api/catalogue/${encodeURIComponent(ean)}`)
      .then(r => r.json() as Promise<{ nom?: string } | null>)
      .catch(() => null);
    if (!fiche?.nom) return;
    setBoites(prev => prev.map(b => b.id === id ? {
      ...b, nomCatalogue: fiche.nom!,
      message: b.verdict === "absent" ? messageAbsent(fiche.nom!) : b.message,
    } : b));
  };

  const messageAbsent = (nomCatalogue: string | null) => nomCatalogue
    ? `Fiche catalogue « ${nomCatalogue} » présente, mais aucun exemplaire dans le parc.`
    : "Cet EAN n'est ni dans le parc ni dans le catalogue.";

  /** Ferme une boîte restée en attente d'un second code. */
  const conclureAttente = (b: Boite): Boite => {
    if (b.verdict !== "attente") return b;
    if (b.ean && b.copies.length) {
      const sansCode = b.copies.filter(c => !c.code_syracuse);
      if (sansCode.length) return { ...b, verdict: "sans_syracuse", message: `${sansCode.length} exemplaire(s) sans code Syracuse. Scanne l'étiquette pour l'associer.` };
      return { ...b, verdict: "non_verifie", message: `${b.copies.length} exemplaire(s) codé(s). L'étiquette de cette boîte n'a pas été scannée.` };
    }
    if (b.ean) return { ...b, verdict: "absent", message: messageAbsent(b.nomCatalogue) };
    // Étiquette seule, inconnue : sans l'EAN on ne peut rien recouper.
    return { ...b, verdict: "absent", message: "Étiquette Syracuse inconnue et EAN non scanné : impossible de savoir à quel jeu elle appartient." };
  };

  /** Recoupe une boîte dont on connaît l'EAN avec l'étiquette qu'on vient de lire. */
  const completerAvecSyracuse = (b: Boite, code: string, porteur: JeuVerif | null): Boite => {
    if (porteur && b.copies.some(c => c.id === porteur.id)) {
      return { ...b, syracuse: code, porteur, verdict: "ok", message: `« ${porteur.nom} » · exemplaire #${porteur.id} (${porteur.statut}).` };
    }
    if (porteur) {
      return { ...b, syracuse: code, porteur, verdict: "conflit", message: `Cette étiquette est enregistrée sur « ${porteur.nom} » (EAN ${porteur.ean}), pas sur ce jeu.` };
    }
    if (b.copies.length) {
      const sansCode = b.copies.filter(c => !c.code_syracuse);
      return {
        ...b, syracuse: code, verdict: "sans_syracuse",
        message: sansCode.length
          ? `Étiquette inconnue. ${sansCode.length} exemplaire(s) de « ${b.copies[0].nom} » sans code : on peut l'associer.`
          : `Étiquette inconnue, et les ${b.copies.length} exemplaire(s) de « ${b.copies[0].nom} » ont déjà un code.`,
      };
    }
    return { ...b, syracuse: code, verdict: "absent", message: b.nomCatalogue ? messageAbsent(b.nomCatalogue) : "Ni l'EAN ni l'étiquette ne sont en base." };
  };

  /** Cœur du contrôle : reçoit un code (clavier, douchette ou caméra),
   *  décide s'il complète la boîte en attente ou en ouvre une nouvelle. */
  const traiterCode = (brut: string) => {
    const code = normaliserCode(brut);
    if (!code) return;
    const parc = parcRef.current;
    const parEan = parc.filter(j => j.ean === code);
    const porteur = parc.find(j => j.code_syracuse === code) ?? null;
    const estEan = parEan.length > 0 || (!porteur && ressembleAUnEan(code));

    const enAttente = boites[0]?.verdict === "attente" ? boites[0] : null;
    // Double lecture caméra ou Entrée répété : on ignore.
    if (enAttente && (enAttente.ean === code || enAttente.syracuse === code)) { setSaisie(""); return; }
    const reste = enAttente ? boites.slice(1) : boites;

    let suivantes: Boite[];
    let eanACherche: { id: string; ean: string } | null = null;

    if (enAttente && estEan && !enAttente.ean && enAttente.syracuse) {
      // Second code d'une boîte ouverte par son étiquette (forcément inconnue,
      // sinon la boîte serait déjà close).
      if (!parEan.length) eanACherche = { id: enAttente.id, ean: code };
      suivantes = [completerAvecSyracuse({ ...enAttente, ean: code, copies: parEan }, enAttente.syracuse, null), ...reste];
    } else if (enAttente && !estEan && !enAttente.syracuse && enAttente.ean) {
      // Second code d'une boîte ouverte par son EAN.
      suivantes = [completerAvecSyracuse(enAttente, code, porteur), ...reste];
    } else {
      // Sinon la boîte en attente est close en l'état et on en ouvre une autre.
      const closes = enAttente ? [conclureAttente(enAttente)] : [];
      const id = crypto.randomUUID();
      let neuve: Boite;
      if (estEan) {
        neuve = {
          id, ean: code, syracuse: null, copies: parEan, porteur: null, nomCatalogue: null, enCours: false,
          verdict: "attente",
          message: parEan.length
            ? `« ${parEan[0].nom} » · ${parEan.length} exemplaire(s). Scanne l'étiquette Syracuse pour vérifier.`
            : "EAN inconnu du parc. Scanne l'étiquette Syracuse si la boîte en a une.",
        };
        if (!parEan.length) eanACherche = { id, ean: code };
      } else if (porteur) {
        // Une étiquette connue suffit : l'exemplaire existe, avec ce code.
        neuve = {
          id, ean: porteur.ean, syracuse: code, copies: parc.filter(j => j.ean === porteur.ean), porteur, nomCatalogue: null, enCours: false,
          verdict: "ok", message: `« ${porteur.nom} » · exemplaire #${porteur.id} (${porteur.statut}).`,
        };
      } else {
        neuve = {
          id, ean: null, syracuse: code, copies: [], porteur: null, nomCatalogue: null, enCours: false,
          verdict: "attente", message: "Étiquette inconnue du parc. Scanne le code-barres EAN de la boîte pour identifier le jeu.",
        };
      }
      suivantes = [neuve, ...closes, ...reste];
    }

    setBoites(suivantes);
    // La boîte qu'on vient de clore sans second code compte aussi comme
    // anomalie à signaler, sinon un EAN absent scanné à la chaîne passerait
    // en silence.
    const close = suivantes[1] && suivantes[1].id === enAttente?.id ? suivantes[1] : null;
    const aSignaler = close && EST_PROBLEME[close.verdict] ? close : suivantes[0];
    const ton = TON[aSignaler.verdict];
    alerter(ton);
    setRetour({ ton, texte: `${LIBELLE[aSignaler.verdict]} — ${aSignaler.message}` });
    if (eanACherche) void chercherNomCatalogue(eanACherche.id, eanACherche.ean);
    setSaisie("");
    refocus();
  };

  const boiteSuivante = () => {
    setBoites(prev => prev[0]?.verdict === "attente" ? [conclureAttente(prev[0]), ...prev.slice(1)] : prev);
    refocus();
  };

  const terminer = () => {
    // Une boîte encore en attente est conclue en l'état pour figurer au bilan.
    setBoites(prev => prev.map(conclureAttente));
    setVue("bilan");
  };

  // ── Corrections ─────────────────────────────────────────────────────────

  const ecrire = async (b: Boite, action: () => Promise<{ ok: boolean; message: string; parc: JeuVerif[] }>) => {
    majBoite(b.id, { enCours: true });
    const res = await action();
    if (res.ok) parcRef.current = res.parc;
    majBoite(b.id, { enCours: false, ...(res.ok ? { verdict: "corrige", message: res.message } : { message: res.message }) });
    if (res.ok) onModifie();
    refocus();
  };

  const associer = (b: Boite, exemplaire: JeuVerif) => ecrire(b, async () => {
    const r = await fetch(`/api/jeux/${exemplaire.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code_syracuse: b.syracuse }),
    }).then(r => r.json() as Promise<{ error?: string }>).catch((): { error?: string } => ({ error: "réseau" }));
    if (r.error) return { ok: false, message: `Échec de l'association : ${r.error}`, parc: parcRef.current };
    return {
      ok: true, message: `Code ${b.syracuse} associé à « ${exemplaire.nom} » (exemplaire #${exemplaire.id}).`,
      parc: parcRef.current.map(j => j.id === exemplaire.id ? { ...j, code_syracuse: b.syracuse } : j),
    };
  });

  const creerExemplaire = (b: Boite, nom: string, isDouble: boolean) => ecrire(b, async () => {
    const r = await fetch("/api/jeux", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ean: b.ean, nom, statut: "En stock", code_syracuse: b.syracuse, is_double: isDouble ? 1 : 0, ...ETAPES_FAITES }),
    }).then(r => r.json() as Promise<{ id?: number; error?: string }>).catch((): { id?: number; error?: string } => ({ error: "réseau" }));
    if (r.error || r.id === undefined) return { ok: false, message: `Échec de la création : ${r.error ?? "?"}`, parc: parcRef.current };
    return {
      ok: true, message: `Exemplaire #${r.id} de « ${nom} » créé en stock${b.syracuse ? ` avec le code ${b.syracuse}` : ""}.`,
      parc: [...parcRef.current, { id: r.id, nom, ean: b.ean!, code_syracuse: b.syracuse, statut: "En stock" }],
    };
  });

  // ── Compte rendu ────────────────────────────────────────────────────────

  const compte = (v: Verdict) => boites.filter(b => b.verdict === v).length;
  const nbOk = compte("ok") + compte("non_verifie") + compte("corrige");
  const nbProblemes = boites.filter(b => EST_PROBLEME[b.verdict]).length;
  const enAttente = boites[0]?.verdict === "attente";
  const nomBoite = (b: Boite) => b.copies[0]?.nom ?? b.porteur?.nom ?? b.nomCatalogue ?? "Jeu non identifié";

  /** Sections du bilan, dans l'ordre où on veut les lire : les problèmes d'abord. */
  const SECTIONS: { verdicts: Verdict[]; titre: string; ton: RetourScan["ton"] }[] = [
    { verdicts: ["absent"], titre: "Absents de la base", ton: "erreur" },
    { verdicts: ["conflit"], titre: "Conflits d'étiquette", ton: "erreur" },
    { verdicts: ["sans_syracuse"], titre: "Sans code Syracuse", ton: "alerte" },
    { verdicts: ["non_verifie"], titre: "En base, étiquette non vérifiée", ton: "ok" },
    { verdicts: ["ok", "corrige"], titre: "Enregistrés", ton: "ok" },
  ];

  const copierBilan = async () => {
    const lignes = [`Contrôle par scan — ${new Date().toLocaleString("fr-FR")}`, `${boites.length} boîte(s) · ${nbOk} ok · ${nbProblemes} à traiter`, ""];
    for (const s of SECTIONS) {
      const liste = boites.filter(b => s.verdicts.includes(b.verdict));
      if (!liste.length) continue;
      lignes.push(`${s.titre} (${liste.length})`);
      for (const b of liste) lignes.push(`  - ${nomBoite(b)} · EAN ${b.ean ?? "—"} · Syracuse ${b.syracuse ?? "—"} · ${b.message}`);
      lignes.push("");
    }
    try {
      await navigator.clipboard.writeText(lignes.join("\n"));
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers indisponible (HTTP, permissions) : le bilan reste à l'écran.
    }
  };

  // ── Rendu ───────────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    border: "2px solid var(--ink)", borderRadius: 8, padding: "9px 14px",
    background: "var(--white)", outline: "none", fontSize: 14,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  };
  const pastille = (fond: string, couleur = "var(--ink)"): React.CSSProperties => ({
    fontSize: 11, fontWeight: 800, background: fond, color: couleur,
    border: "1.5px solid var(--ink)", borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
  });

  const compteurs = () => (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      <span style={pastille("var(--cream2)")}>{boites.length} boîte(s)</span>
      <span style={pastille("var(--vert)")}>✓ {nbOk} ok</span>
      {compte("sans_syracuse") > 0 && <span style={pastille(COULEUR.alerte.vif)}>⚠ {compte("sans_syracuse")} sans code</span>}
      {compte("absent") > 0 && <span style={pastille(COULEUR.erreur.vif, COULEUR.erreur.texte)}>✗ {compte("absent")} absent(s)</span>}
      {compte("conflit") > 0 && <span style={pastille(COULEUR.erreur.vif, COULEUR.erreur.texte)}>✗ {compte("conflit")} conflit(s)</span>}
    </div>
  );

  const carteBoite = (b: Boite) => {
    const ton = TON[b.verdict];
    const c = COULEUR[ton];
    const sansCode = b.copies.filter(x => !x.code_syracuse);
    return (
      <div key={b.id} className="pop-card" style={{ overflow: "hidden", background: c.fond, borderColor: c.vif, opacity: b.enCours ? 0.6 : 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1.5px solid rgba(0,0,0,0.12)" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: 800, fontSize: 15, margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nomBoite(b)}</p>
            <p style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(0,0,0,0.5)", margin: "2px 0 0" }}>
              EAN {b.ean ?? "—"} · Syracuse {b.syracuse ?? "—"}
            </p>
          </div>
          <span style={pastille(b.verdict === "corrige" ? "var(--bleu)" : c.vif, b.verdict === "corrige" ? "var(--white)" : c.texte)}>{LIBELLE[b.verdict]}</span>
        </div>
        <div style={{ padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>{b.message}</p>

          {b.copies.length > 0 && b.verdict !== "corrige" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {b.copies.map(x => (
                <span key={String(x.id)} style={pastille(x.id === b.porteur?.id ? "var(--vert)" : x.code_syracuse ? "var(--white)" : COULEUR.alerte.vif)}>
                  #{x.id} · {x.statut} · {x.code_syracuse || "sans code"}
                </span>
              ))}
            </div>
          )}

          {/* Étiquette inconnue + jeu en base : on l'associe à un exemplaire sans code,
              ou on crée un nouvel exemplaire si tous sont déjà codés. */}
          {b.verdict === "sans_syracuse" && b.syracuse && b.copies.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {sansCode.map(x => (
                <button key={String(x.id)} onClick={() => associer(b, x)} disabled={b.enCours} className="pop-btn pop-btn-dark" style={{ fontSize: 13 }}>
                  Associer à l&apos;exemplaire #{x.id}
                </button>
              ))}
              {sansCode.length === 0 && (
                <button onClick={() => creerExemplaire(b, b.copies[0].nom, true)} disabled={b.enCours} className="pop-btn pop-btn-dark" style={{ fontSize: 13 }}>
                  Créer un nouvel exemplaire (double)
                </button>
              )}
            </div>
          )}

          {/* Aucun exemplaire : création directe si le catalogue connaît le jeu,
              sinon l'atelier reste la porte d'entrée (il faut nommer le jeu). */}
          {b.verdict === "absent" && b.ean && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {b.nomCatalogue ? (
                <button onClick={() => creerExemplaire(b, b.nomCatalogue!, false)} disabled={b.enCours} className="pop-btn pop-btn-dark" style={{ fontSize: 13 }}>
                  Créer l&apos;exemplaire en stock
                </button>
              ) : (
                <Link href="/atelier" className="pop-btn pop-btn-dark" style={{ fontSize: 13, textDecoration: "none" }}>
                  Ajouter dans l&apos;atelier →
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 90, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(var(--nav-h) + 12px) 12px 12px" }}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 720, maxHeight: "calc(100dvh - var(--nav-h) - 36px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "18px 24px", borderBottom: "2px solid var(--ink)", flexShrink: 0 }}>
          <div>
            <h2 className="bc" style={{ fontSize: 22, margin: 0, letterSpacing: "0.02em" }}>
              {vue === "scan" ? "Contrôle par scan" : "Compte rendu du contrôle"}
            </h2>
            <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, margin: "3px 0 0" }}>
              {vue === "scan"
                ? "Scanne l'EAN et l'étiquette Syracuse de chaque boîte pour vérifier qu'elle est bien enregistrée"
                : `${boites.length} boîte(s) contrôlée(s) · ${nbOk} ok · ${nbProblemes} à traiter`}
            </p>
          </div>
          <button onClick={onFermer} className="pop-btn" style={{ padding: "6px 10px", fontSize: 14 }}>✕</button>
        </div>

        {vue === "scan" && (
          <div style={{ padding: "14px 24px", borderBottom: "2px solid var(--ink)", background: "var(--white)", flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={champRef} type="text" value={saisie} inputMode="numeric" autoComplete="off"
                placeholder={enAttente ? "Scanne le second code… (ou Boîte suivante)" : "Scanner un EAN ou une étiquette Syracuse, puis Entrée"}
                onChange={e => setSaisie(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") traiterCode(saisie); }}
                style={{ ...inp, flex: 1, minWidth: 0, fontFamily: "monospace", background: enAttente ? COULEUR.attente.fond : "#f4fce3", border: `2px solid ${enAttente ? COULEUR.attente.vif : "var(--vert)"}` }} />
              <BoutonScan onScan={traiterCode} continu retour={retour} titre="Scanner à la chaîne" />
              {enAttente && (
                <button onClick={boiteSuivante} className="pop-btn" style={{ flexShrink: 0, background: "var(--cream2)", whiteSpace: "nowrap" }}>Boîte suivante →</button>
              )}
            </div>
            {boites.length > 0 && compteurs()}
          </div>
        )}

        <div style={{ overflowY: "auto", flex: 1, padding: 16, background: "var(--cream2)", display: "flex", flexDirection: "column", gap: 12 }}>
          {boites.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "rgba(0,0,0,0.35)" }}>
              <span style={{ fontSize: 40, display: "block", marginBottom: 12 }}>📦</span>
              <p style={{ fontWeight: 700, fontSize: 18, margin: 0 }}>Prends une boîte et scanne-la</p>
              <p style={{ fontSize: 13, fontWeight: 600, margin: "6px 0 0" }}>EAN d&apos;abord ou étiquette d&apos;abord, peu importe : les deux codes d&apos;une même boîte sont recoupés ensemble. Enchaîne les boîtes, puis « Terminer » pour le compte rendu.</p>
            </div>
          ) : vue === "scan" ? (
            boites.map(carteBoite)
          ) : (
            SECTIONS.map(s => {
              const liste = boites.filter(b => s.verdicts.includes(b.verdict));
              if (!liste.length) return null;
              return (
                <div key={s.titre} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ width: 12, height: 12, borderRadius: "50%", background: COULEUR[s.ton].vif, border: "1.5px solid var(--ink)", flexShrink: 0 }} />
                    <p className="bc" style={{ fontSize: 15, margin: 0, letterSpacing: "0.02em" }}>{s.titre} · {liste.length}</p>
                  </div>
                  {liste.map(carteBoite)}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "12px 24px", borderTop: "2px solid var(--ink)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>
            {boites.length === 0 ? "Rien de scanné pour l'instant" : nbProblemes === 0 ? "Aucun problème détecté" : `${nbProblemes} boîte(s) à traiter`}
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {vue === "scan" ? (
              <>
                {boites.length > 0 && (
                  <button onClick={() => { setBoites([]); setRetour(null); refocus(); }} className="pop-btn" style={{ background: "var(--cream2)" }}>Vider</button>
                )}
                <button onClick={onFermer} className="pop-btn" style={{ background: "var(--cream2)" }}>Fermer</button>
                <button onClick={terminer} disabled={boites.length === 0} className="pop-btn pop-btn-dark" style={{ opacity: boites.length === 0 ? 0.4 : 1 }}>
                  Terminer · compte rendu
                </button>
              </>
            ) : (
              <>
                <button onClick={copierBilan} className="pop-btn" style={{ background: copie ? "var(--vert)" : "var(--cream2)" }}>{copie ? "✓ Copié" : "📋 Copier"}</button>
                <button onClick={() => setVue("scan")} className="pop-btn" style={{ background: "var(--cream2)" }}>← Reprendre le scan</button>
                <button onClick={onFermer} className="pop-btn pop-btn-dark">Fermer</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
