"use client";
import { useEffect, useRef, useState } from "react";
import BoutonScan, { type RetourScan } from "./ScanCodeBarre";

export type JeuScanNouveaute = {
  id: string | number;
  nom: string;
  ean: string;
  code_syracuse?: string | null;
  couleur?: string;
  etape_nouveaute?: number | boolean | null;
  date_entree?: string | null;
  date_sortie?: string | null;
};

type Salle = { titre: string; max: number; contient: (j: JeuScanNouveaute) => boolean };

type Mouvement = { jeu: JeuScanNouveaute; sens: "ajout" | "retrait" };

type Ligne = RetourScan & { id: number; forcer?: JeuScanNouveaute };

const formaterDate = (dateStr?: string | null) =>
  dateStr ? new Date(dateStr).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "";

const estDepassee = (dateStr?: string | null) => {
  if (!dateStr) return false;
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  return new Date(dateStr) <= aujourdhui;
};

const estEnSalle = (j: JeuScanNouveaute) => !!j.etape_nouveaute && !!j.date_entree;

/** Dates d'une entrée en salle faite aujourd'hui, pour 14 jours. */
export function datesEntreeSalle() {
  const aujourdhui = new Date();
  const sortie = new Date();
  sortie.setDate(aujourdhui.getDate() + 14);
  return {
    date_entree: aujourdhui.toISOString().split("T")[0],
    date_sortie: sortie.toISOString().split("T")[0],
  };
}

const COULEUR_LIGNE: Record<RetourScan["ton"], string> = {
  ok: "var(--vert)", alerte: "#ff9f1c", erreur: "var(--rouge)", attente: "var(--yellow)",
};

/** Renouvellement de la sélection par scan des étiquettes Syracuse.
 *
 *  Chaque code lu fait une seule chose, déduite de l'état de la salle du jeu :
 *  - jeu en salle dont la date est passée → il sort ;
 *  - jeu hors salle → il entre, mais seulement s'il reste une place et
 *    qu'aucun jeu terminé n'attend d'être retiré (on vide avant de remplir).
 *  Un jeu encore dans ses 14 jours n'est pas retiré d'office : on propose
 *  « Retirer quand même ».
 *
 *  À la fin, un rappel liste les mouvements à reporter sur Syracuse.
 */
export default function ScanNouveautes({ jeux, salles, onFermer, onModifie }: {
  /** Tous les jeux en stock (nouveautés ou non). */
  jeux: JeuScanNouveaute[];
  salles: Salle[];
  onFermer: () => void;
  /** Appelé après chaque modification, pour que la page se recharge. */
  onModifie: () => void;
}) {
  // Copie locale tenue à jour à chaque scan : les codes s'enchaînent plus
  // vite que le rechargement de la page.
  // La ref sert au traitement des scans, l'état au rendu.
  const etatRef = useRef<JeuScanNouveaute[]>(jeux);
  const [etat, setEtat] = useState<JeuScanNouveaute[]>(jeux);
  const [saisie, setSaisie] = useState("");
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [rappel, setRappel] = useState(false);
  const champRef = useRef<HTMLInputElement>(null);
  const compteur = useRef(0);

  useEffect(() => { champRef.current?.focus(); }, []);

  const salleDe = (j: JeuScanNouveaute) => salles.find(s => s.contient(j)) ?? salles[0];

  const noter = (l: Omit<Ligne, "id">) =>
    setLignes(prev => [{ ...l, id: ++compteur.current }, ...prev].slice(0, 30));

  const majLocale = (id: JeuScanNouveaute["id"], champs: Partial<JeuScanNouveaute>) => {
    etatRef.current = etatRef.current.map(j => j.id === id ? { ...j, ...champs } : j);
    setEtat(etatRef.current);
  };

  const enregistrer = async (jeu: JeuScanNouveaute, champs: Partial<JeuScanNouveaute>) => {
    const r = await fetch(`/api/jeux/${jeu.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(champs),
    });
    if (!r.ok) throw new Error();
    majLocale(jeu.id, champs);
    onModifie();
  };

  const retirer = async (jeu: JeuScanNouveaute) => {
    try {
      await enregistrer(jeu, { etape_nouveaute: 0, date_entree: null, date_sortie: null });
    } catch {
      noter({ ton: "erreur", texte: `Échec de l'enregistrement pour « ${jeu.nom} ».` });
      return;
    }
    // Un jeu ajouté puis retiré dans la même session ne laisse rien à reporter.
    setMouvements(prev => prev.some(m => m.jeu.id === jeu.id && m.sens === "ajout")
      ? prev.filter(m => m.jeu.id !== jeu.id)
      : [...prev, { jeu, sens: "retrait" }]);
    noter({ ton: "ok", texte: `↩ « ${jeu.nom} » retiré de la sélection.` });
  };

  const ajouter = async (jeu: JeuScanNouveaute) => {
    const dates = datesEntreeSalle();
    try {
      await enregistrer(jeu, { etape_nouveaute: 1, ...dates });
    } catch {
      noter({ ton: "erreur", texte: `Échec de l'enregistrement pour « ${jeu.nom} ».` });
      return;
    }
    setMouvements(prev => prev.some(m => m.jeu.id === jeu.id && m.sens === "retrait")
      ? prev.filter(m => m.jeu.id !== jeu.id)
      : [...prev, { jeu, sens: "ajout" }]);
    noter({ ton: "ok", texte: `✓ « ${jeu.nom} » ajouté en salle jusqu'au ${formaterDate(dates.date_sortie)}.` });
  };

  const trouver = (code: string): JeuScanNouveaute | null | "ambigu" => {
    const c = code.toLowerCase();
    const parSyracuse = etatRef.current.find(j => (j.code_syracuse ?? "").trim().toLowerCase() === c);
    if (parSyracuse) return parSyracuse;
    // Repli sur l'EAN quand il désigne un seul exemplaire en stock.
    const parEan = etatRef.current.filter(j => j.ean === code);
    if (parEan.length === 1) return parEan[0];
    return parEan.length > 1 ? "ambigu" : null;
  };

  // Les scans sont traités un par un : avec une douchette, le code suivant
  // arrive avant que le précédent soit enregistré, et la place restante
  // serait comptée deux fois.
  const file = useRef<Promise<void>>(Promise.resolve());
  const traiter = (brut: string) => {
    file.current = file.current.then(() => traiterUn(brut)).catch(() => {});
  };

  const traiterUn = async (brut: string) => {
    const code = brut.trim();
    if (!code) return;
    const jeu = trouver(code);
    if (jeu === "ambigu") {
      noter({ ton: "alerte", texte: `EAN ${code} : plusieurs exemplaires en stock. Scanne l'étiquette Syracuse.` });
      return;
    }
    if (!jeu) {
      noter({ ton: "erreur", texte: `Code ${code} inconnu ou jeu pas en stock.` });
      return;
    }

    const salle = salleDe(jeu);
    const enSalle = etatRef.current.filter(j => salle.contient(j) && estEnSalle(j));

    if (estEnSalle(jeu)) {
      if (estDepassee(jeu.date_sortie)) { await retirer(jeu); return; }
      noter({
        ton: "alerte", forcer: jeu,
        texte: `« ${jeu.nom} » est en salle jusqu'au ${formaterDate(jeu.date_sortie)}, pas encore à retirer.`,
      });
      return;
    }

    const aRetirer = enSalle.filter(j => estDepassee(j.date_sortie));
    if (aRetirer.length) {
      noter({
        ton: "alerte",
        texte: `${salle.titre} : retire d'abord ${aRetirer.length > 1 ? `les ${aRetirer.length} jeux terminés` : "le jeu terminé"} (${aRetirer.map(j => j.nom).join(", ")}) avant d'ajouter « ${jeu.nom} ».`,
      });
      return;
    }
    if (enSalle.length >= salle.max) {
      noter({ ton: "alerte", texte: `${salle.titre} pleine (${salle.max}/${salle.max}) : « ${jeu.nom} » n'est pas ajouté.` });
      return;
    }
    await ajouter(jeu);
  };

  const valider = (e: React.FormEvent) => {
    e.preventDefault();
    const code = saisie;
    setSaisie("");
    traiter(code);
  };

  const terminer = () => {
    if (mouvements.length) setRappel(true);
    else onFermer();
  };

  const etatSalles = salles.map(s => {
    const enSalle = etat.filter(j => s.contient(j) && estEnSalle(j));
    return {
      titre: s.titre,
      aRetirer: enSalle.filter(j => estDepassee(j.date_sortie)).length,
      libres: Math.max(0, s.max - enSalle.length),
    };
  });

  const ajouts = mouvements.filter(m => m.sens === "ajout");
  const retraits = mouvements.filter(m => m.sens === "retrait");

  const listeMouvements = (titre: string, liste: Mouvement[]) => liste.length > 0 && (
    <div>
      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 4 }}>{titre} ({liste.length})</div>
      <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14 }}>
        {liste.map(m => (
          <li key={m.jeu.id}>
            {m.jeu.nom}
            {m.jeu.code_syracuse && <span style={{ color: "rgba(0,0,0,0.5)", fontFamily: "monospace" }}> · {m.jeu.code_syracuse}</span>}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300,
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "calc(var(--nav-h, 0px) + 12px) 12px 12px", overflowY: "auto",
    }}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 560, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        {rappel ? (
          <>
            <span className="bc" style={{ fontSize: 18 }}>⚠️ À reporter sur Syracuse</span>
            <div style={{
              background: "var(--yellow)", border: "2.5px solid var(--ink)", borderRadius: 10,
              padding: "12px 14px", fontWeight: 700, fontSize: 14, lineHeight: 1.4,
            }}>
              Pense à bien modifier les exemplaires et les pièges sur Syracuse pour les jeux ci-dessous.
              {retraits.length > 0 && (
                <> Et retire l&apos;étiquette « À jouer sur place » de la boîte des jeux retirés de la sélection.</>
              )}
            </div>
            {listeMouvements("Entrés en salle", ajouts)}
            {listeMouvements("Retirés de la sélection", retraits)}
            <button type="button" onClick={onFermer} className="pop-btn pop-btn-dark" style={{ alignSelf: "flex-end" }}>
              C&apos;est noté
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span className="bc" style={{ fontSize: 18 }}>Scanner la sélection</span>
              <button type="button" onClick={terminer} className="pop-btn pop-btn-dark" style={{ padding: "6px 14px", fontSize: 14 }}>
                Terminer
              </button>
            </div>

            <p style={{ margin: 0, fontSize: 13, color: "rgba(0,0,0,0.6)", fontWeight: 600, lineHeight: 1.4 }}>
              Scanne l&apos;étiquette Syracuse : un jeu terminé est retiré, un nouveau jeu entre en salle s&apos;il reste
              de la place et qu&apos;aucun jeu n&apos;est à retirer.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {etatSalles.map(s => (
                <span key={s.titre} className="pop-sticker" style={{
                  background: s.aRetirer ? "var(--rouge)" : s.libres ? "var(--vert)" : "var(--cream2)",
                  color: s.aRetirer ? "var(--white)" : "var(--ink)", fontSize: 12,
                }}>
                  {s.titre} · {s.aRetirer ? `${s.aRetirer} à retirer` : s.libres ? `${s.libres} place${s.libres > 1 ? "s" : ""}` : "pleine"}
                </span>
              ))}
            </div>

            <form onSubmit={valider} style={{ display: "flex", gap: 8 }}>
              <input
                ref={champRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                placeholder="Code Syracuse…"
                value={saisie}
                onChange={e => setSaisie(e.target.value)}
                className="pop-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              <BoutonScan onScan={traiter} continu retour={lignes[0] ?? null} titre="Scanner les étiquettes Syracuse" />
              <button type="submit" className="pop-btn pop-btn-green" style={{ padding: "6px 14px" }}>OK</button>
            </form>

            {lignes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {lignes.map(l => (
                  <div key={l.id} style={{
                    borderLeft: `5px solid ${COULEUR_LIGNE[l.ton]}`, background: "var(--cream)",
                    borderRadius: 6, padding: "8px 10px", fontSize: 13, fontWeight: 700,
                    display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between",
                  }}>
                    <span>{l.texte}</span>
                    {l.forcer && estEnSalle(etat.find(j => j.id === l.forcer!.id) ?? l.forcer) && (
                      <button type="button" onClick={() => retirer(l.forcer!)} className="pop-btn pop-btn-outline"
                        style={{ padding: "4px 10px", fontSize: 12, flexShrink: 0 }}>
                        Retirer quand même
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {mouvements.length > 0 && (
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>
                {ajouts.length} ajouté{ajouts.length > 1 ? "s" : ""} · {retraits.length} retiré{retraits.length > 1 ? "s" : ""} — à reporter sur Syracuse en fin de scan
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
