"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCompte } from "../AuthProvider";
import { useChat } from "./ChatProvider";
import { useConversation, type MessageAffiche } from "./useConversation";
import { CONVERSATION_GENERALE, LONGUEUR_MAX_MESSAGE, REACTIONS_RAPIDES, REACTIONS_TOUTES, type ResultatGif, type ResumeConversation, type MediaSticker, type PieceChat, urlSticker } from "../../lib/chat";
import { useDirect } from "../../lib/chat-canal";
import { changerMuet, lancerVolante, useVolantesMuettes } from "./CoucheVolantes";
import ChoixGif from "./ChoixGif";
import ChoixSticker from "./ChoixSticker";
import { basculerFavori, useFavoris } from "./favoris";
import MediaGifVue from "./MediaGif";
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
  /** Message dont la barre de réactions est ouverte. */
  const [menu, setMenu] = useState<number | null>(null);
  /** Palette des réactions volantes, au-dessus de la saisie. */
  const [palette, setPalette] = useState(false);
  /** Choix d'un GIF à envoyer. */
  const [choixGif, setChoixGif] = useState(false);

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
            <div ref={liste} onScroll={auDefilement} className="chat-fil" style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "12px 12px 8px", display: "flex", flexDirection: "column" }}>
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
                    <Bulle m={m} moi={m.auteur_id === compte.id} moiId={compte.id} prive={prive} suite={!!suite} couleur={couleurDe(m)}
                      menu={menu === m.id && !m.etat} onMenu={o => setMenu(o ? m.id : null)} onReagir={e => conv.reagir(m, e)}
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
          <div style={{ position: "relative", borderTop: "2.5px solid var(--ink)", background: "var(--white)", padding: "10px 12px calc(10px + env(safe-area-inset-bottom))", flexShrink: 0 }}>
            {/* Réactions volantes : dans la générale seulement. */}
            {palette && !prive && <PaletteVolantes conversation={conversation} onFermer={() => setPalette(false)} />}
            {choixGif && (
              <PanneauMedias onFermer={() => setChoixGif(false)}
                onGif={g => {
                  conv.envoyer("", { type: "gif", id: g.id, titre: g.titre, url: g.url, mp4: g.mp4, largeur: g.largeur, hauteur: g.hauteur });
                  setChoixGif(false);
                  setEnBas(true);
                }}
                onSticker={st => {
                  conv.envoyer("", { type: "sticker", id: st.id, largeur: st.largeur, hauteur: st.hauteur });
                  setChoixGif(false);
                  setEnBas(true);
                }} />
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <button onClick={() => { setChoixGif(o => !o); setPalette(false); }} aria-label="Envoyer un GIF ou un sticker" aria-expanded={choixGif}
                title="GIF et stickers" className="chat-bouton-gif" style={{
                  height: 40, width: 40, flexShrink: 0, borderRadius: 8, cursor: "pointer", padding: 0, fontFamily: "inherit",
                  fontSize: 12, fontWeight: 900, letterSpacing: "0.02em",
                  background: choixGif ? "var(--yellow)" : "transparent",
                  border: "2.5px solid var(--ink)",
                  boxShadow: choixGif ? "2px 2px 0 var(--ink)" : "none",
                }}>GIF</button>
              {!prive && <button onClick={() => { setPalette(p => !p); setChoixGif(false); }} aria-label="Envoyer une réaction volante" aria-expanded={palette}
                title="Réaction volante" className="chat-bouton-palette" style={{
                  height: 40, width: 40, flexShrink: 0, borderRadius: 8, cursor: "pointer", fontSize: 19, padding: 0,
                  background: palette ? "var(--yellow)" : "transparent",
                  border: palette ? "2.5px solid var(--ink)" : "2.5px solid transparent",
                  boxShadow: palette ? "2px 2px 0 var(--ink)" : "none",
                }}>✨</button>}
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

function Bulle({ m, moi, moiId, prive, suite, couleur, menu, onMenu, onReagir, onSupprimer, onReessayer, onAbandonner }: {
  m: MessageAffiche; moi: boolean; moiId: string; suite: boolean; couleur: string;
  /** Discussion à deux : réactions sans compteur, un peu plus grandes. */
  prive: boolean;
  /** Barre de réactions ouverte sur ce message (une seule à la fois dans le fil). */
  menu: boolean; onMenu: (ouvrir: boolean) => void;
  onReagir: (emoji: string) => void;
  onSupprimer: () => void; onReessayer: () => void; onAbandonner: () => void;
}) {
  const [survol, setSurvol] = useState(false);
  const bulle = useRef<HTMLDivElement>(null);
  // Place disponible au-dessus et au-dessous de la bulle, dans le fil : la
  // barre s'ouvre du côté où elle tient (le fil défile et coupe ce qui déborde).
  const [place, setPlace] = useState({ dessus: 999, dessous: 999 });
  const interactif = !m.etat && !m.supprime;
  const gif = !m.supprime && m.piece?.type === "gif" ? m.piece : null;
  // Un sticker s'affiche seul, sans bulle autour.
  const sticker = !m.supprime && m.piece?.type === "sticker" ? m.piece : null;

  const ouvrir = () => {
    if (!interactif) return;
    if (menu) { onMenu(false); return; }
    const el = bulle.current;
    const fil = el?.closest(".chat-fil");
    if (el && fil) {
      const r = el.getBoundingClientRect(), f = fil.getBoundingClientRect();
      setPlace({ dessus: r.top - f.top, dessous: f.bottom - r.bottom });
    }
    onMenu(true);
  };

  const avatar = (
    <span className="bc" style={{
      width: 28, height: 28, borderRadius: "50%", background: couleur, border: "2px solid var(--ink)",
      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0,
      visibility: suite ? "hidden" : "visible", alignSelf: m.reactions.length ? "center" : "flex-end",
    }}>{m.auteur_nom.trim()[0]?.toUpperCase()}</span>
  );

  return (
    <div onMouseEnter={() => setSurvol(true)} onMouseLeave={() => setSurvol(false)}
      style={{ display: "flex", gap: 8, flexDirection: moi ? "row-reverse" : "row", alignItems: "flex-end", marginTop: suite ? 3 : 10 }}>
      {!moi && avatar}
      <div style={{ maxWidth: "78%", display: "flex", flexDirection: "column", alignItems: moi ? "flex-end" : "flex-start" }}>
        {!suite && (
          <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, padding: "0 4px", display: "flex", gap: 6, alignItems: "baseline" }}>
            {!moi && <span>{m.auteur_nom}</span>}
            <span style={{ color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>{heure(m.cree_le)}</span>
          </div>
        )}
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6, flexDirection: moi ? "row-reverse" : "row" }}>
          {/* Cliquer (ou toucher) un message ouvre ses réactions. */}
          <div ref={bulle} title={suite ? heure(m.cree_le) : undefined} onClick={ouvrir}
            role={interactif ? "button" : undefined} aria-label={interactif ? "Réagir à ce message" : undefined} aria-expanded={interactif ? menu : undefined}
            style={{
              background: m.supprime ? "transparent" : moi ? "var(--yellow)" : "var(--white)",
              border: m.etat === "echec" ? "2px solid #dc2626" : m.supprime ? "1.5px dashed rgba(0,0,0,0.25)" : "2px solid var(--ink)",
              borderRadius: 10,
              borderBottomRightRadius: moi && !m.supprime ? 3 : 10,
              borderBottomLeftRadius: !moi && !m.supprime ? 3 : 10,
              boxShadow: m.supprime ? "none" : menu ? "3px 3px 0 var(--ink)" : "2px 2px 0 var(--ink)",
              transform: menu ? "translate(-1px, -1px)" : "none",
              padding: gif ? 0 : "6px 10px", fontSize: 13.5, lineHeight: 1.4,
              whiteSpace: "pre-wrap", overflowWrap: "anywhere",
              overflow: gif ? "hidden" : undefined, maxWidth: "100%",
              ...(gif ? { background: "var(--cream2)", borderBottomRightRadius: 10, borderBottomLeftRadius: 10 } : {}),
              ...(sticker ? { background: "transparent", border: "none", boxShadow: "none", padding: 0 } : {}),
              opacity: m.etat === "envoi" ? 0.55 : 1,
              fontStyle: m.supprime ? "italic" : "normal",
              color: m.supprime ? "rgba(0,0,0,0.45)" : "var(--ink)",
              cursor: interactif ? "pointer" : "default",
              transition: "box-shadow 0.1s, transform 0.1s",
            }}>
            {m.supprime ? "Message supprimé" : sticker ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={urlSticker(sticker.id)} alt="Sticker" className="chat-sticker"
                style={{ width: Math.min(140, sticker.largeur), maxWidth: "100%", height: "auto", aspectRatio: `${sticker.largeur} / ${sticker.hauteur}`, display: "block" }} />
            ) : gif ? (
              <MediaGifVue gif={gif} largeur={220} titre={gif.titre}
                style={{ maxWidth: "100%", height: "auto", aspectRatio: `${gif.largeur} / ${gif.hauteur}` }} />
            ) : <Texte contenu={m.contenu} />}
          </div>
          {/* Au survol (souris), un rappel discret qu'on peut réagir. */}
          {interactif && survol && !menu && (
            <button onClick={ouvrir} aria-label="Ajouter une réaction" title="Réagir" style={petitBouton("transparent", "var(--ink)")}>☺︎+</button>
          )}
          {menu && (
            <BarreReactions moi={moi} cote={moi ? "droite" : "gauche"} place={place} piece={m.piece}
              dejaMises={m.reactions.filter(r => r.comptes.some(c => c.id === moiId)).map(r => r.emoji)}
              onChoisir={e => { onReagir(e); onMenu(false); }}
              onSupprimer={moi ? () => { onMenu(false); onSupprimer(); } : undefined}
              onFermer={() => onMenu(false)} />
          )}
        </div>
        {m.reactions.length > 0 && !m.supprime && (
          // Une seule pastille de verre dépoli pour toutes les émotes, qui mord
          // sur le bas de la bulle : le flou laisse deviner la bulle derrière.
          <div style={{
            display: "flex", marginTop: -8, padding: "0 8px", position: "relative", zIndex: 1,
            justifyContent: moi ? "flex-end" : "flex-start", maxWidth: "100%",
          }}>
            <div className={`chat-reactions${prive ? " seules" : ""}`}>
              {m.reactions.map(r => {
                const mienne = r.comptes.some(c => c.id === moiId);
                const noms = r.comptes.map(c => c.id === moiId ? "toi" : c.nom).join(", ");
                return (
                  <button key={r.emoji} onClick={() => onReagir(r.emoji)}
                    title={`${noms} ${r.comptes.length > 1 ? "ont" : "a"} réagi ${r.emoji}${mienne ? " — cliquer pour retirer" : ""}`}
                    aria-pressed={mienne} aria-label={`${r.emoji} ${r.comptes.length}, ${noms}`}
                    className={`chat-reaction${mienne ? " mienne" : ""}`}>
                    <span>{r.emoji}</span>
                    {/* À deux, le compteur n'apprend rien : l'émote suffit. */}
                    {!prive && r.comptes.length > 1 && <span className="chat-reaction-n">{r.comptes.length}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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

/** Émotes proposées pour les réactions volantes. */
const VOLANTES_PROPOSEES = ["👍", "❤️", "😂", "🎉", "🔥", "👏", "😮", "🎲", "🏆", "🦄"];

/**
 * Palette des réactions volantes : chaque clic lance une émote qui monte au
 * milieu de l'écran de toute l'équipe. Reste ouverte pour qu'on
 * puisse en envoyer une rafale.
 */
function PaletteVolantes({ conversation, onFermer }: { conversation: string; onFermer: () => void }) {
  const boite = useRef<HTMLDivElement>(null);
  const muet = useVolantesMuettes();
  const direct = useDirect();
  const [onglet, setOnglet] = useState<"emotes" | "gif" | "stickers">("emotes");
  useFermerAuClicAilleurs(boite, ".chat-bouton-palette", onFermer);

  return (
    <div ref={boite} role="dialog" aria-label="Réactions volantes" className="pop-card chat-palette-volantes" style={{
      position: "absolute", left: 10, right: 10, bottom: "calc(100% + 8px)", zIndex: 6, padding: "8px 8px 6px",
      boxShadow: "3px 3px 0 var(--ink)", borderRadius: 12,
    }}>
      <Onglets valeur={onglet} onChange={setOnglet} options={[["emotes", "Émotes"], ["gif", "GIF"], ["stickers", "Stickers"]]} />
      {onglet === "stickers" ? (
        <ChoixSticker hauteur={200} onChoisir={st => lancerVolante(conversation, { sticker: { id: st.id, largeur: st.largeur, hauteur: st.hauteur } })} />
      ) : onglet === "emotes" ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "space-between" }}>
          {VOLANTES_PROPOSEES.map(e => (
            <button key={e} onClick={() => lancerVolante(conversation, { emoji: e })} aria-label={`Lancer ${e}`}
              className="chat-emote" style={{
                width: 32, height: 32, borderRadius: 8, cursor: "pointer", padding: 0, fontSize: 21, lineHeight: 1,
                background: "transparent", border: "2px solid transparent",
              }}>{e}</button>
          ))}
        </div>
      ) : (
        <ChoixGif hauteur={200} onChoisir={g => lancerVolante(conversation, { gif: { url: g.url, mp4: g.mp4, largeur: g.largeur, hauteur: g.hauteur } })} />
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, paddingTop: 6, borderTop: "1.5px solid rgba(0,0,0,0.08)", fontSize: 11, fontWeight: 600, color: "rgba(0,0,0,0.5)" }}>
        <span style={{ flex: 1 }}>{direct ? "Elles montent sur l'écran de toute l'équipe." : "Direct coupé : toi seul les vois."}</span>
        <button onClick={() => changerMuet(!muet)} style={{ ...lienBouton, fontSize: 11, color: "rgba(0,0,0,0.6)" }}>
          {muet ? "🔕 Réactivées chez moi" : "🔔 Les couper chez moi"}
        </button>
      </div>
    </div>
  );
}

/** Choix d'un GIF ou d'un sticker à envoyer dans la discussion, au-dessus de la saisie. */
function PanneauMedias({ onGif, onSticker, onFermer }: {
  onGif: (g: ResultatGif) => void; onSticker: (s: MediaSticker) => void; onFermer: () => void;
}) {
  const boite = useRef<HTMLDivElement>(null);
  const [onglet, setOnglet] = useState<"gif" | "stickers">("gif");
  useFermerAuClicAilleurs(boite, ".chat-bouton-gif", onFermer);
  return (
    <div ref={boite} role="dialog" aria-label="Envoyer un GIF ou un sticker" className="pop-card chat-palette-volantes" style={{
      position: "absolute", left: 10, right: 10, bottom: "calc(100% + 8px)", zIndex: 6, padding: 8,
      boxShadow: "3px 3px 0 var(--ink)", borderRadius: 12,
    }}>
      <Onglets valeur={onglet} onChange={setOnglet} options={[["gif", "GIF"], ["stickers", "Stickers"]]} />
      {onglet === "gif" ? <ChoixGif onChoisir={onGif} /> : <ChoixSticker onChoisir={onSticker} />}
    </div>
  );
}

/** Referme un menu flottant au clic ailleurs (hors de son bouton) ou sur Échap. */
function useFermerAuClicAilleurs(boite: React.RefObject<HTMLDivElement | null>, bouton: string, onFermer: () => void) {
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      const cible = e.target as HTMLElement;
      if (boite.current?.contains(cible) || cible.closest?.(bouton)) return;
      onFermer();
    };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onFermer(); } };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche, true);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche, true); };
  }, [boite, bouton, onFermer]);
}

function Onglets<T extends string>({ valeur, onChange, options }: { valeur: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
      {options.map(([v, libelle]) => (
        <button key={v} role="tab" aria-selected={valeur === v} onClick={() => onChange(v)} style={{
          flex: 1, height: 26, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 800,
          background: valeur === v ? "var(--ink)" : "transparent", color: valeur === v ? "var(--cream)" : "rgba(0,0,0,0.55)",
          border: "2px solid var(--ink)",
        }}>{libelle}</button>
      ))}
    </div>
  );
}

/** Hauteurs approximatives, pour choisir de quel côté ouvrir la barre. */
const HAUTEUR_BARRE = 52;
const HAUTEUR_GRILLE = 230;

/**
 * Barre flottante au-dessus (ou au-dessous) d'une bulle : réactions rapides,
 * « + » pour tout le choix, et la corbeille sur ses propres messages.
 */
function BarreReactions({ moi, cote, place, piece, dejaMises, onChoisir, onSupprimer, onFermer }: {
  moi: boolean; cote: "gauche" | "droite"; place: { dessus: number; dessous: number };
  /** GIF ou sticker du message : on peut le mettre en favori d'ici. */
  piece: PieceChat | null;
  dejaMises: string[]; onChoisir: (emoji: string) => void; onSupprimer?: () => void; onFermer: () => void;
}) {
  const [grille, setGrille] = useState(false);
  const [confirmer, setConfirmer] = useState(false);
  const boite = useRef<HTMLDivElement>(null);
  const { estFavori } = useFavoris();
  const [erreurFavori, setErreurFavori] = useState<string | null>(null);

  // Clic ailleurs ou Échap : on referme (Échap ne ferme pas tout le panneau).
  useEffect(() => {
    const clic = (e: MouseEvent) => {
      const cible = e.target as Node;
      if (boite.current?.contains(cible)) return;
      // Un clic sur la bulle elle-même est géré par la bulle (bascule).
      if ((cible as HTMLElement).closest?.("[aria-expanded='true']")) return;
      onFermer();
    };
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onFermer(); } };
    document.addEventListener("mousedown", clic);
    document.addEventListener("keydown", touche, true);
    return () => { document.removeEventListener("mousedown", clic); document.removeEventListener("keydown", touche, true); };
  }, [onFermer]);

  const hauteur = grille ? HAUTEUR_GRILLE : HAUTEUR_BARRE;
  const dessous = place.dessus < hauteur + 8 && place.dessous > place.dessus;

  const bouton = (e: string, taille: number) => {
    const deja = dejaMises.includes(e);
    return (
      <button key={e} onClick={() => onChoisir(e)} aria-label={`${deja ? "Retirer" : "Réagir"} ${e}`} title={deja ? "Retirer" : undefined}
        className="chat-emote" style={{
          width: taille, height: taille, borderRadius: 8, cursor: "pointer", padding: 0, flexShrink: 0,
          fontSize: Math.round(taille * 0.6), lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center",
          background: deja ? "var(--yellow)" : "transparent",
          border: deja ? "2px solid var(--ink)" : "2px solid transparent",
        }}>{e}</button>
    );
  };

  return (
    <div ref={boite} role="dialog" aria-label="Réactions" className="pop-card chat-barre-reactions" style={{
      position: "absolute", zIndex: 5,
      [cote === "droite" ? "right" : "left"]: 0,
      ...(dessous ? { top: "calc(100% + 6px)" } : { bottom: "calc(100% + 6px)" }),
      padding: 5, boxShadow: "3px 3px 0 var(--ink)", borderRadius: 12,
      width: grille ? 262 : "max-content",
    }}>
      {grille ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 2 }}>
          {REACTIONS_TOUTES.map(e => bouton(e, 30))}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {REACTIONS_RAPIDES.map(e => bouton(e, 34))}
          <button onClick={() => setGrille(true)} aria-label="Plus d'émotes" title="Plus d'émotes" style={{
            width: 34, height: 34, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontFamily: "inherit",
            background: "var(--cream)", border: "2px solid var(--ink)", fontSize: 18, fontWeight: 900, lineHeight: 1,
          }}>+</button>
          {piece && (
            <>
              <span style={{ width: 1.5, height: 24, background: "rgba(0,0,0,0.12)", margin: "0 3px" }} />
              <button onClick={() => { setErreurFavori(null); basculerFavori(piece).then(onFermer, e => setErreurFavori((e as Error).message)); }}
                aria-pressed={estFavori(piece)}
                aria-label={estFavori(piece) ? "Retirer des favoris" : `Ajouter ce ${piece.type === "gif" ? "GIF" : "sticker"} aux favoris`}
                title={erreurFavori ?? (estFavori(piece) ? "Retirer des favoris" : "Ajouter aux favoris")}
                style={{
                  width: 34, height: 34, borderRadius: 8, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0,
                  background: estFavori(piece) ? "var(--yellow)" : "transparent",
                  border: estFavori(piece) ? "2px solid var(--ink)" : "2px solid transparent",
                  color: erreurFavori ? "#dc2626" : "var(--ink)",
                }}>{estFavori(piece) ? "★" : "☆"}</button>
            </>
          )}
          {moi && onSupprimer && (
            <>
              <span style={{ width: 1.5, height: 24, background: "rgba(0,0,0,0.12)", margin: "0 3px" }} />
              {confirmer
                ? <button onClick={onSupprimer} style={{ ...petitBouton("#dc2626", "#fff"), height: 30 }}>Supprimer ?</button>
                : <button onClick={() => setConfirmer(true)} aria-label="Supprimer le message" title="Supprimer" style={{
                    width: 34, height: 34, borderRadius: 8, cursor: "pointer", background: "transparent", border: "2px solid transparent", fontSize: 16,
                  }}>🗑</button>}
            </>
          )}
        </div>
      )}
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
