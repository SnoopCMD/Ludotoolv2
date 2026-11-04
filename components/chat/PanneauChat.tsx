"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCompte } from "../AuthProvider";
import { useChat } from "./ChatProvider";
import { useConversation, type MessageAffiche } from "./useConversation";
import { CONVERSATION_GENERALE, LONGUEUR_MAX_MESSAGE, type ResumeConversation } from "../../lib/chat";
import { useDirect } from "../../lib/chat-canal";
import { couleurParDefaut } from "../../lib/couleurProfil";
import { useCouleurProfil } from "../../lib/useCouleurProfil";

/** Deux messages du même auteur à moins de 5 min se suivent sans en-tête. */
const GROUPE_MS = 5 * 60_000;

const jour = (iso: string) => new Date(iso).toDateString();
const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

function libelleJour(iso: string) {
  const d = new Date(iso);
  const auj = new Date();
  const hier = new Date(); hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", ...(d.getFullYear() !== auj.getFullYear() ? { year: "numeric" } : {}) });
}

/** Rend les liens cliquables, sans jamais injecter de HTML. */
function Texte({ contenu }: { contenu: string }) {
  const morceaux = contenu.split(/(https?:\/\/[^\s<]+)/g);
  return (
    <>
      {morceaux.map((m, i) => i % 2 === 1
        ? <a key={i} href={m} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline", wordBreak: "break-all" }}>{m}</a>
        : <Fragment key={i}>{m}</Fragment>)}
    </>
  );
}

export default function PanneauChat() {
  const { compte, chargement: chargementCompte } = useCompte();
  const { fermer, active, ouvrirConversation, conversations, nonLus } = useChat();
  const direct = useDirect();
  const panneau = useRef<HTMLElement>(null);

  // ── Échap ferme le panneau quand le focus est dedans (les modales de page
  //    gardent leur propre Échap).
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panneau.current?.contains(document.activeElement)) fermer();
    };
    document.addEventListener("keydown", touche);
    return () => document.removeEventListener("keydown", touche);
  }, [fermer]);

  const conv = active ? conversations.find(c => c.id === active) ?? null : null;
  const general = active === CONVERSATION_GENERALE;
  // Non lus ailleurs : pastille sur le bouton retour.
  const ailleurs = nonLus - (conv?.non_lus ?? 0);

  return (
    <aside ref={panneau} aria-label="Messagerie" className="chat-panneau" style={{
      position: "fixed", top: "var(--nav-h)", right: 0, bottom: 0,
      width: "min(400px, 100vw)", zIndex: 95,
      background: "var(--cream)", borderLeft: "3px solid var(--ink)",
      boxShadow: "-6px 0 0 rgba(0,0,0,0.08)",
      display: "flex", flexDirection: "column",
    }}>
      {/* En-tête */}
      <div style={{ background: "var(--ink)", color: "var(--cream)", padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0, minHeight: 58 }}>
        {active && (
          <button onClick={() => ouvrirConversation(null)} aria-label="Toutes les discussions" title="Toutes les discussions" style={{ ...boutonRond, position: "relative" }}>
            ←
            {ailleurs > 0 && <span style={{ position: "absolute", top: -4, right: -4, width: 10, height: 10, borderRadius: "50%", background: "#f87171", border: "1.5px solid var(--ink)" }} />}
          </button>
        )}
        {active && !general && conv?.avec
          ? <Avatar nom={conv.avec.nom} couleur={conv.avec.couleur ?? couleurParDefaut(conv.avec.groupe)} taille={30} />
          : <span style={{ fontSize: 20, width: 30, textAlign: "center" }}>💬</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="bc" style={{ fontSize: 17, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {!active ? "Discussions" : general ? "Général" : conv?.nom ?? "…"}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 5 }}>
            {compte && (
              <span title={direct ? "Les messages arrivent instantanément" : "Direct indisponible : mise à jour toutes les quelques secondes"}
                style={{ width: 7, height: 7, borderRadius: "50%", background: direct ? "#4ade80" : "#a3a3a3", flexShrink: 0 }} />
            )}
            {!active ? (direct ? "En direct" : "Synchronisation…") : general ? "Toute l'équipe" : "Message privé"}
          </div>
        </div>
        <button onClick={fermer} aria-label="Fermer la messagerie" style={boutonRond}>✕</button>
      </div>

      {!compte ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
          {!chargementCompte && <>
            <div style={{ fontSize: 40 }}>🔒</div>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Connecte-toi pour lire et écrire dans la messagerie.</div>
            <Link href="/connexion" onClick={fermer} className="pop-btn pop-btn-dark" style={{ textDecoration: "none" }}>Se connecter</Link>
          </>}
        </div>
      ) : active ? (
        <Fil key={active} conversation={active} prive={!general} nomAutre={conv?.avec?.nom ?? null} />
      ) : (
        <ListeDiscussions />
      )}
    </aside>
  );
}

const boutonRond: React.CSSProperties = {
  width: 30, height: 30, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", flexShrink: 0,
  cursor: "pointer", color: "var(--cream)", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: "inherit", fontWeight: 800,
};

function Avatar({ nom, couleur, taille = 28 }: { nom: string; couleur: string; taille?: number }) {
  return (
    <span className="bc" style={{
      width: taille, height: taille, borderRadius: "50%", background: couleur, border: "2px solid var(--ink)", color: "var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(taille * 0.46), flexShrink: 0,
    }}>{nom.trim()[0]?.toUpperCase()}</span>
  );
}

function heureCourte(iso: string) {
  const d = new Date(iso);
  if (d.toDateString() === new Date().toDateString()) return heure(iso);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Liste des discussions : la générale, puis une ligne par collègue (qu'une
 * discussion existe déjà ou pas), les plus récentes en haut.
 */
function ListeDiscussions() {
  const { compte } = useCompte();
  const { conversations, comptes, ouvrirConversation, ouvrirPrivee } = useChat();
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverture, setOuverture] = useState<string | null>(null);

  const generale = conversations.find(c => c.type === "general");
  const privees = new Map(conversations.filter(c => c.type === "prive" && c.avec).map(c => [c.avec!.id, c]));
  const personnes = [...comptes].sort((a, b) => {
    const da = privees.get(a.id)?.dernier?.cree_le ?? "", db = privees.get(b.id)?.dernier?.cree_le ?? "";
    return db.localeCompare(da) || a.nom.localeCompare(b.nom, "fr");
  });

  const ouvrir = async (avec: string) => {
    setErreur(null);
    setOuverture(avec);
    try { await ouvrirPrivee(avec); } catch (e) { setErreur((e as Error).message); } finally { setOuverture(null); }
  };

  const apercu = (c?: ResumeConversation) => {
    if (!c?.dernier) return null;
    const d = c.dernier;
    const qui = d.auteur_id === compte?.id ? "Toi : " : "";
    return d.supprime ? <i>Message supprimé</i> : `${qui}${d.contenu}`;
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "10px 10px 16px" }}>
      <Ligne titre="Général" sousTitre={apercu(generale) ?? "Toute l'équipe"} heure={generale?.dernier?.cree_le}
        nonLus={generale?.non_lus ?? 0} icone={<span style={{ fontSize: 20, width: 34, textAlign: "center" }}>💬</span>}
        onClick={() => ouvrirConversation(CONVERSATION_GENERALE)} />
      <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.45)", margin: "16px 6px 6px" }}>
        Messages privés
      </div>
      {personnes.map(p => {
        const c = privees.get(p.id);
        return (
          <Ligne key={p.id} titre={p.nom} sousTitre={ouverture === p.id ? "Ouverture…" : apercu(c) ?? <span style={{ color: "rgba(0,0,0,0.35)" }}>Écrire un message privé</span>}
            heure={c?.dernier?.cree_le} nonLus={c?.non_lus ?? 0}
            icone={<Avatar nom={p.nom} couleur={p.couleur ?? couleurParDefaut(p.groupe)} taille={34} />}
            onClick={() => c ? ouvrirConversation(c.id) : ouvrir(p.id)} />
        );
      })}
      {personnes.length === 0 && <div style={{ fontSize: 12, color: "rgba(0,0,0,0.45)", padding: "4px 6px" }}>Personne d&apos;autre n&apos;a de compte pour l&apos;instant.</div>}
      {erreur && <div style={{ marginTop: 10, background: "var(--rose)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{erreur}</div>}
    </div>
  );
}

function Ligne({ titre, sousTitre, heure: h, nonLus, icone, onClick }: {
  titre: string; sousTitre: React.ReactNode; heure?: string; nonLus: number; icone: React.ReactNode; onClick: () => void;
}) {
  const [survol, setSurvol] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: 10, textAlign: "left", fontFamily: "inherit",
      padding: "8px 10px", marginBottom: 4, borderRadius: 10, cursor: "pointer", color: "var(--ink)",
      background: survol ? "var(--white)" : "transparent",
      border: survol ? "2px solid var(--ink)" : "2px solid transparent",
      boxShadow: survol ? "2px 2px 0 var(--ink)" : "none",
      transition: "background 0.1s, box-shadow 0.1s",
    }}>
      {icone}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: nonLus ? 900 : 700, fontSize: 14, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titre}</span>
          {h && <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>{heureCourte(h)}</span>}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: nonLus ? "var(--ink)" : "rgba(0,0,0,0.55)", fontWeight: nonLus ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sousTitre}</span>
          {nonLus > 0 && (
            <span style={{ minWidth: 18, height: 18, padding: "0 5px", borderRadius: 9, background: "#f87171", color: "#fff", border: "1.5px solid var(--ink)", fontSize: 10, fontWeight: 900, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {nonLus > 99 ? "99+" : nonLus}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Brouillons par conversation, le temps de la session de l'onglet. */
const brouillons = new Map<string, string>();

function Fil({ conversation, prive, nomAutre }: { conversation: string; prive: boolean; nomAutre: string | null }) {
  const { compte } = useCompte();
  const { rafraichir } = useChat();
  const moi = compte ? { id: compte.id, equipe_id: compte.equipe_id, nom: compte.nom, couleur: compte.couleur, groupe: compte.groupe } : null;
  const conv = useConversation(conversation, moi);

  // Couleurs de profil changées pendant que le panneau est ouvert.
  const [couleurs, setCouleurs] = useState<Record<string, string | null>>({});
  useCouleurProfil(d => setCouleurs(c => ({ ...c, [d.equipe_id]: d.couleur })));
  const couleurDe = (m: MessageAffiche) =>
    (m.auteur_equipe_id in couleurs ? couleurs[m.auteur_equipe_id] : m.auteur_couleur) ?? couleurParDefaut(m.auteur_groupe);

  const liste = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLTextAreaElement>(null);
  const [texte, setTexteBrut] = useState(() => brouillons.get(conversation) ?? "");
  const setTexte = (v: string) => { setTexteBrut(v); brouillons.set(conversation, v); };
  const [enBas, setEnBas] = useState(true);
  const [nouveaux, setNouveaux] = useState(0);
  const [chargeHistorique, setChargeHistorique] = useState(false);

  // ── Défilement : on suit le bas tant qu'on y est ; sinon, une pastille
  //    « nouveaux messages ». Charger l'historique garde la position de lecture.
  const hauteurAvant = useRef<number | null>(null);
  const dernierId = useRef<number>(0);
  useLayoutEffect(() => {
    const el = liste.current;
    if (!el) return;
    if (hauteurAvant.current !== null) {
      el.scrollTop += el.scrollHeight - hauteurAvant.current;
      hauteurAvant.current = null;
      return;
    }
    const dernier = conv.messages[conv.messages.length - 1];
    const idDernier = dernier ? (dernier.etat ? Number.MAX_SAFE_INTEGER : dernier.id) : 0;
    const nouveau = idDernier !== dernierId.current;
    const premierChargement = dernierId.current === 0;
    dernierId.current = idDernier;
    if (!nouveau) return;
    const deMoi = dernier?.auteur_id === compte?.id;
    if (enBas || deMoi || premierChargement) {
      el.scrollTop = el.scrollHeight;
      setNouveaux(0);
    } else {
      setNouveaux(n => n + 1);
    }
  }, [conv.messages, enBas, compte?.id]);

  const auDefilement = () => {
    const el = liste.current;
    if (!el) return;
    const bas = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setEnBas(bas);
    if (bas) setNouveaux(0);
  };
  const descendre = () => {
    liste.current?.scrollTo({ top: liste.current.scrollHeight, behavior: "smooth" });
    setNouveaux(0);
  };

  const plusAnciens = async () => {
    if (!liste.current || chargeHistorique) return;
    setChargeHistorique(true);
    hauteurAvant.current = liste.current.scrollHeight;
    try { await conv.chargerPlusAnciens(); } finally { setChargeHistorique(false); }
  };

  // ── Lu : tout ce qui est affiché, onglet visible et bas de liste atteint.
  const dernierLu = useRef(0);
  const { marquerLu } = conv;
  useEffect(() => {
    if (!enBas || document.visibilityState !== "visible") return;
    const max = conv.messages.reduce((acc, m) => (!m.etat && m.id > acc ? m.id : acc), 0);
    if (max <= dernierLu.current) return;
    dernierLu.current = max;
    marquerLu(max).then(rafraichir);
  }, [conv.messages, enBas, marquerLu, rafraichir]);

  useEffect(() => { if (compte) champ.current?.focus(); }, [compte]);

  // Zone de saisie qui grandit avec le texte, jusqu'à ~6 lignes.
  useLayoutEffect(() => {
    const el = champ.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [texte]);

  const envoyer = () => {
    const contenu = texte.trim();
    if (!contenu || contenu.length > LONGUEUR_MAX_MESSAGE) return;
    conv.envoyer(contenu);
    setTexte("");
    setEnBas(true);
  };

  if (!compte) return null;
  return (
        <>
          {/* Fil */}
          <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
            <div ref={liste} onScroll={auDefilement} style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "12px 12px 8px", display: "flex", flexDirection: "column" }}>
              {conv.plusAnciens && (
                <button onClick={plusAnciens} disabled={chargeHistorique} className="pop-btn pop-btn-outline"
                  style={{ alignSelf: "center", fontSize: 11, padding: "5px 12px", marginBottom: 10 }}>
                  {chargeHistorique ? "Chargement…" : "↑ Messages précédents"}
                </button>
              )}
              {conv.chargement && <div style={{ margin: "auto", fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>Chargement…</div>}
              {conv.erreur && (
                <div style={{ margin: "auto", background: "var(--rose)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{conv.erreur}</div>
              )}
              {!conv.chargement && !conv.erreur && conv.messages.length === 0 && (
                <div style={{ margin: "auto", textAlign: "center", color: "rgba(0,0,0,0.5)" }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>👋</div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{prive ? `Ta discussion privée avec ${nomAutre ?? "ce collègue"}.` : "Personne n\u2019a encore rien dit."}</div>
                  <div style={{ fontSize: 12 }}>{prive ? "Vous seuls la voyez." : "Lance la conversation !"}</div>
                </div>
              )}
              {conv.messages.map((m, i) => {
                const prec = conv.messages[i - 1];
                const nouveauJour = !prec || jour(prec.cree_le) !== jour(m.cree_le);
                const suite = !nouveauJour && prec && prec.auteur_id === m.auteur_id
                  && Date.parse(m.cree_le) - Date.parse(prec.cree_le) < GROUPE_MS;
                return (
                  <Fragment key={m.etat ? `c-${m.client_id}` : m.id}>
                    {nouveauJour && <SeparateurJour iso={m.cree_le} />}
                    <Bulle m={m} moi={m.auteur_id === compte.id} suite={!!suite} couleur={couleurDe(m)}
                      onSupprimer={() => conv.supprimer(m)} onReessayer={() => conv.reessayer(m)} onAbandonner={() => conv.abandonner(m)} />
                  </Fragment>
                );
              })}
            </div>
            {nouveaux > 0 && (
              <button onClick={descendre} className="pop-btn pop-btn-yellow" style={{
                position: "absolute", bottom: 10, left: "50%", transform: "translateX(-50%)",
                fontSize: 12, padding: "5px 12px", animation: "fadeInUp 0.15s ease-out",
              }}>
                ↓ {nouveaux > 1 ? `${nouveaux} nouveaux messages` : "Nouveau message"}
              </button>
            )}
          </div>

          {/* Saisie */}
          <div style={{ borderTop: "2.5px solid var(--ink)", background: "var(--white)", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea ref={champ} value={texte} rows={1} maxLength={LONGUEUR_MAX_MESSAGE}
                placeholder={prive ? `Écrire à ${nomAutre ?? "…"}…` : "Écrire à l'équipe…"}
                onChange={e => setTexte(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); envoyer(); }
                }}
                className="pop-input"
                style={{ flex: 1, resize: "none", minHeight: 40, maxHeight: 140, lineHeight: 1.4, fontFamily: "inherit" }} />
              <button onClick={envoyer} disabled={!texte.trim()} aria-label="Envoyer" className="pop-btn pop-btn-dark"
                style={{ height: 40, padding: "0 14px", opacity: texte.trim() ? 1 : 0.4, flexShrink: 0 }}>
                ➤
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.4)", marginTop: 5 }}>
              <span className="desktop-only">Entrée pour envoyer · Maj+Entrée pour aller à la ligne</span>
              {texte.length > LONGUEUR_MAX_MESSAGE - 200 && <span style={{ marginLeft: "auto" }}>{texte.length}/{LONGUEUR_MAX_MESSAGE}</span>}
            </div>
          </div>
        </>
  );
}

function SeparateurJour({ iso }: { iso: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0 6px" }}>
      <div style={{ flex: 1, height: 1.5, background: "rgba(0,0,0,0.12)" }} />
      <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.45)" }}>{libelleJour(iso)}</span>
      <div style={{ flex: 1, height: 1.5, background: "rgba(0,0,0,0.12)" }} />
    </div>
  );
}

function Bulle({ m, moi, suite, couleur, onSupprimer, onReessayer, onAbandonner }: {
  m: MessageAffiche; moi: boolean; suite: boolean; couleur: string;
  onSupprimer: () => void; onReessayer: () => void; onAbandonner: () => void;
}) {
  const [survol, setSurvol] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const avatar = (
    <span className="bc" style={{
      width: 28, height: 28, borderRadius: "50%", background: couleur, border: "2px solid var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
      visibility: suite ? "hidden" : "visible",
    }}>{m.auteur_nom.trim()[0]?.toUpperCase()}</span>
  );

  return (
    <div onMouseEnter={() => setSurvol(true)} onMouseLeave={() => { setSurvol(false); setConfirmer(false); }}
      style={{ display: "flex", gap: 8, flexDirection: moi ? "row-reverse" : "row", alignItems: "flex-end", marginTop: suite ? 3 : 10 }}>
      {!moi && avatar}
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: moi ? "flex-end" : "flex-start" }}>
        {!suite && (
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, padding: "0 4px", display: "flex", gap: 6, alignItems: "baseline" }}>
            {!moi && <span>{m.auteur_nom}</span>}
            <span style={{ color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>{heure(m.cree_le)}</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: moi ? "row-reverse" : "row" }}>
          {/* Au doigt, pas de survol : toucher sa bulle montre la corbeille. */}
          <div title={suite ? heure(m.cree_le) : undefined} onClick={() => { if (moi) setSurvol(v => !v); }} style={{
            background: m.supprime ? "transparent" : moi ? "var(--yellow)" : "var(--white)",
            border: m.etat === "echec" ? "2px solid #dc2626" : m.supprime ? "1.5px dashed rgba(0,0,0,0.25)" : "2px solid var(--ink)",
            borderRadius: 10,
            borderBottomRightRadius: moi && !m.supprime ? 3 : 10,
            borderBottomLeftRadius: !moi && !m.supprime ? 3 : 10,
            boxShadow: m.supprime ? "none" : "2px 2px 0 var(--ink)",
            padding: "6px 10px", fontSize: 13.5, lineHeight: 1.4,
            whiteSpace: "pre-wrap", overflowWrap: "anywhere",
            opacity: m.etat === "envoi" ? 0.55 : 1,
            fontStyle: m.supprime ? "italic" : "normal",
            color: m.supprime ? "rgba(0,0,0,0.45)" : "var(--ink)",
          }}>
            {m.supprime ? "Message supprimé" : <Texte contenu={m.contenu} />}
          </div>
          {moi && !m.etat && !m.supprime && survol && (
            confirmer
              ? <button onClick={onSupprimer} style={petitBouton("#dc2626", "#fff")}>Supprimer ?</button>
              : <button onClick={() => setConfirmer(true)} aria-label="Supprimer le message" title="Supprimer" style={petitBouton("transparent", "var(--ink)")}>🗑</button>
          )}
        </div>
        {m.etat === "echec" && (
          <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", marginTop: 3, display: "flex", gap: 8 }}>
            Pas envoyé.
            <button onClick={onReessayer} style={lienBouton}>Réessayer</button>
            <button onClick={onAbandonner} style={lienBouton}>Effacer</button>
          </div>
        )}
      </div>
    </div>
  );
}

const petitBouton = (bg: string, fg: string): React.CSSProperties => ({
  background: bg, color: fg, border: bg === "transparent" ? "none" : "2px solid var(--ink)", borderRadius: 6,
  fontSize: 11, fontWeight: 800, padding: "2px 6px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0,
});
const lienBouton: React.CSSProperties = {
  background: "none", border: "none", padding: 0, color: "inherit", textDecoration: "underline",
  fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
};
