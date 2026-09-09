"use client";
import { useState, useEffect, useRef } from "react";
import NavBar from "../../components/NavBar";
import { useCompte } from "../../components/AuthProvider";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanierType = "JdS" | "JV" | "jouet";
type View = "dashboard" | "profil" | "basket";

type Panier = {
  id: string; nom: string;
  statut: "En cours" | "Commandé" | "Reçu";
  notes: string | null; created_at: string;
  type: PanierType; tags: string | null; profil: string | null;
};

type PanierLigne = {
  id: string; panier_id: string; nom: string;
  editeur: string | null; image_url: string | null; ean: string | null;
  prix_unitaire: number | null; quantite: number; notes: string | null;
  tags: string | null; console: string | null;
};

type Votant = { utilisateur_id: string; nom: string; valeur: number };
type Commentaire = { id: string; utilisateur_id: string; nom: string; texte: string; cree_le: string };

type PanierCommunLigne = {
  id: string; panier_commun_id: string; nom: string;
  editeur: string | null; image_url: string | null; ean: string | null;
  prix_unitaire: number | null; quantite: number; notes: string | null;
  profil: string | null; votes: number; created_at: string; console: string | null;
  votants?: Votant[]; mon_vote?: number; commentaires?: Commentaire[];
};

/** Recoupement d'une ligne avec les réceptions déjà saisies dans l'atelier. */
type Correspondance = {
  ligne_id: string;
  type: "ean" | "nom" | "proche";
  reception_nom: string;
  date_reception: string | null;
};

type JeuRechercheStore = {
  nom: string; editeur: string | null; image_url: string | null;
  prix: number | null; url_source: string | null; extra?: string;
  etat?: string | null; region?: string | null; reference?: string | null;
  rupture?: boolean;
};

type PanierCommun = { id: string; type: PanierType; nom: string };

type Doublon = { possede: boolean; exemplaires: number; detail: string };

/**
 * Signale un jeu déjà présent dans la ludothèque.
 * Rouge pour les jeux vidéo, qu'on ne rachète pas ; jaune « Double » pour les
 * jeux de société, où le doublon est souvent voulu.
 */
function PastilleDoublon({ doublon, type }: { doublon?: Doublon; type: PanierType }) {
  if (!doublon?.possede) return null;
  const jv = type === "JV";
  return (
    <span className="pop-sticker"
      title={jv
        ? "Déjà au catalogue jeux vidéo" + (doublon.detail ? " (" + doublon.detail + ")" : "")
        : "Déjà en rayon : " + doublon.detail}
      style={{
        background: jv ? "var(--rouge)" : "var(--yellow)",
        color: jv ? "var(--white)" : "var(--ink)",
        border: "1.5px solid var(--ink)", fontSize: 10, flexShrink: 0,
      }}>
      {jv ? "⚠️ déjà au catalogue" : "Double · " + doublon.detail}
    </span>
  );
}

type MembreSummary = { nom: string; couleur: string };

type StoreSummary = {
  communStats: Record<string, { nb: number; total: number; nb_pc?: number }>;
  profilStats: Record<string, { paniers: number; jeux: number }>;
  membres: MembreSummary[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(",").map(t => t.trim()).filter(Boolean);
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const STATUTS: Panier["statut"][] = ["En cours", "Commandé", "Reçu"];

const STATUT_STYLE: Record<Panier["statut"], React.CSSProperties> = {
  "En cours": { background: "var(--yellow)", color: "var(--ink)" },
  "Commandé": { background: "var(--bleu)",   color: "var(--ink)" },
  "Reçu":     { background: "var(--vert)",   color: "var(--ink)" },
};

const TYPE_INFO: Record<PanierType, { emoji: string; bg: string }> = {
  JdS:   { emoji: "🎲", bg: "var(--bleu)" },
  JV:    { emoji: "🎮", bg: "var(--purple)" },
  jouet: { emoji: "🧸", bg: "var(--rose)" },
};

const CONSOLES_JV = ["PS5", "Switch", "PC"] as const;

const PANIERS_COMMUNS: PanierCommun[] = [
  { id: "commun-jds",   type: "JdS",   nom: "Commande commune JdS" },
  { id: "commun-jv",    type: "JV",    nom: "Commande commune JV" },
  { id: "commun-jouet", type: "jouet", nom: "Commande commune Jouets" },
];

// ─── ModalPanier ──────────────────────────────────────────────────────────────

function ModalPanier({
  initial, defaultProfil, onClose, onSaved,
}: {
  initial?: Panier | null;
  defaultProfil?: string;
  onClose: () => void;
  onSaved: (p: Panier) => void;
}) {
  const isEdit = !!initial;
  const [nom, setNom] = useState(initial?.nom ?? "");
  const [type, setType] = useState<PanierType>(initial?.type ?? "JdS");
  const [profil, setProfil] = useState(initial?.profil ?? defaultProfil ?? "");
  const [tags, setTags] = useState(initial?.tags ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!nom.trim()) return;
    setSaving(true);
    const payload = {
      nom: nom.trim(), type,
      profil: profil.trim() || null,
      tags: tags.trim() || null,
      notes: notes.trim() || null,
    };
    if (isEdit) {
      await fetch(`/api/paniers/${initial!.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      onSaved({ ...initial!, ...payload });
    } else {
      const res = await fetch("/api/paniers", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, statut: "En cours" }),
      }).then(r => r.json() as Promise<any>).catch(() => null);
      if (res?.id) onSaved({ id: res.id, statut: "En cours", created_at: new Date().toISOString(), ...payload } as Panier);
    }
    setSaving(false);
    onClose();
  };

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", display: "block", marginBottom: 4 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 96px)", overflowY: "auto" }}>
        <div style={{ background: "var(--ink)", padding: "16px 20px" }}>
          <h2 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>{isEdit ? "Modifier le panier" : "Nouveau panier"}</h2>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={lbl}>Nom</label>
            <input autoFocus type="text" placeholder="Nom du panier…" value={nom}
              onChange={e => setNom(e.target.value)} onKeyDown={e => e.key === "Enter" && save()}
              className="pop-input" style={{ width: "100%" }} /></div>
          <div><label style={lbl}>Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["JdS", "JV", "jouet"] as PanierType[]).map(t => (
                <button key={t} onClick={() => setType(t)}
                  style={{ flex: 1, padding: "8px 4px", fontSize: 13, fontWeight: 800, fontFamily: "inherit",
                    background: type === t ? TYPE_INFO[t].bg : "var(--cream)",
                    border: type === t ? "2.5px solid var(--ink)" : "2px solid var(--cream2)",
                    borderRadius: 8, cursor: "pointer", boxShadow: type === t ? "3px 3px 0 var(--ink)" : "none" }}>
                  {TYPE_INFO[t].emoji} {t}
                </button>
              ))}
            </div></div>
          <div><label style={lbl}>Profil</label>
            <input type="text" placeholder="Nom de la personne…" value={profil}
              onChange={e => setProfil(e.target.value)} className="pop-input" style={{ width: "100%" }} /></div>
          <div><label style={lbl}>Tags</label>
            <input type="text" placeholder="tag1, tag2, tag3…" value={tags}
              onChange={e => setTags(e.target.value)} className="pop-input" style={{ width: "100%" }} />
            {parseTags(tags).length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                {parseTags(tags).map(t => <span key={t} className="pop-sticker" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)", fontSize: 12 }}>{t}</span>)}
              </div>
            )}</div>
          <div><label style={lbl}>Notes</label>
            <textarea placeholder="Informations complémentaires…" value={notes}
              onChange={e => setNotes(e.target.value)} className="pop-input" rows={3}
              style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }} /></div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
            <button onClick={save} disabled={!nom.trim() || saving}
              className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: (!nom.trim() || saving) ? 0.4 : 1 }}>
              {saving ? "Enregistrement…" : isEdit ? "Sauvegarder" : "Créer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ModalEnvoiCommun ─────────────────────────────────────────────────────────

function ModalEnvoiCommun({
  ligne, panierType, panierProfil, communLignes, onClose, onSent, onUpvoted,
}: {
  ligne: PanierLigne; panierType: PanierType; panierProfil: string | null;
  communLignes: Record<string, PanierCommunLigne[]>;
  onClose: () => void;
  onSent: (panierCommunId: string, newLigne: PanierCommunLigne) => void;
  onUpvoted: (panierCommunId: string, ligneId: string, res: { votes: number; mon_vote: number; votants: Votant[] }) => void;
}) {
  const [targetId, setTargetId] = useState(PANIERS_COMMUNS.find(p => p.type === panierType)?.id ?? PANIERS_COMMUNS[0].id);
  const [profil, setProfil] = useState(panierProfil ?? "");
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    let existing: PanierCommunLigne[] = communLignes[targetId] ?? [];
    if (!communLignes[targetId]) {
      existing = await fetch(`/api/paniers-communs-lignes?panier_commun_id=${targetId}`)
        .then(r => r.json() as Promise<any[]>).catch(() => []);
    }
    const duplicate = existing.find(e =>
      (ligne.ean && e.ean === ligne.ean) ||
      e.nom.toLowerCase() === ligne.nom.toLowerCase()
    );
    if (duplicate) {
      // Renvoyer un jeu déjà présent vaut un vote « pour » — silencieux si
      // l'expéditeur n'est pas connecté, l'envoi lui-même reste possible.
      const res = await fetch(`/api/paniers-communs-lignes/${duplicate.id}/vote`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeur: 1 }),
      }).then(r => r.ok ? r.json() as Promise<any> : null).catch(() => null);
      if (res) onUpvoted(targetId, duplicate.id, res);
    } else {
      const payload = {
        panier_commun_id: targetId, nom: ligne.nom, editeur: ligne.editeur,
        image_url: ligne.image_url, ean: ligne.ean, prix_unitaire: ligne.prix_unitaire,
        quantite: ligne.quantite, profil: profil.trim() || null,
      };
      const res = await fetch("/api/paniers-communs-lignes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(r => r.json() as Promise<any>).catch(() => null);
      if (res?.id) onSent(targetId, { ...payload, id: res.id, notes: null, votes: 0, created_at: new Date().toISOString() } as PanierCommunLigne);
    }
    setSending(false);
    onClose();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ background: "var(--ink)", padding: "16px 20px" }}>
          <h2 className="bc" style={{ fontSize: 20, color: "var(--cream)", margin: 0 }}>Envoyer vers panier commun</h2>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ padding: "10px 14px", background: "var(--cream2)", borderRadius: 8, fontWeight: 700, fontSize: 14 }}>{ligne.nom}</div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", marginBottom: 6 }}>Panier cible</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {PANIERS_COMMUNS.map(p => (
                <button key={p.id} onClick={() => setTargetId(p.id)}
                  style={{ padding: "10px 14px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit", fontWeight: 700, fontSize: 14,
                    background: targetId === p.id ? TYPE_INFO[p.type].bg : "var(--cream)",
                    border: targetId === p.id ? "2.5px solid var(--ink)" : "2px solid var(--cream2)",
                    boxShadow: targetId === p.id ? "3px 3px 0 var(--ink)" : "none" }}>
                  {TYPE_INFO[p.type].emoji} {p.nom}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)", marginBottom: 4 }}>Profil</p>
            <input type="text" placeholder="Qui fait cette demande ?" value={profil}
              onChange={e => setProfil(e.target.value)} className="pop-input" style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
            <button onClick={send} disabled={sending} className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: sending ? 0.4 : 1 }}>
              {sending ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ModalWishlistSteam ───────────────────────────────────────────────────────
// Les jeux PC ne se commandent pas : ils s'achètent sur Steam. Ils sont donc
// sortis du panier commun et regroupés ici, avec leur prix boutique du moment.

type FicheSteam = {
  nom_recherche: string;
  appid: number | null;
  titre: string | null;
  image_url: string | null;
  prix: number | null;
  prix_initial: number | null;
  remise: number | null;
  url: string;
};

function ModalWishlistSteam({
  lignes, doublons, connecte, onClose, onSupprimer, onVote,
}: {
  lignes: PanierCommunLigne[];
  doublons: Record<string, Doublon>;
  connecte: boolean;
  onClose: () => void;
  onSupprimer: (ligne: PanierCommunLigne) => void;
  onVote: (ligne: PanierCommunLigne, valeur: 1 | -1) => void;
}) {
  const [fiches, setFiches] = useState<Record<string, FicheSteam>>({});
  const [chargement, setChargement] = useState(false);
  const [verif, setVerif] = useState<string | null>(null);

  // Rejoue à la demande le contrôle quotidien : les promos en cours deviennent
  // des alertes sur le tableau de bord.
  const verifierPromos = async () => {
    setVerif("…");
    const r = await fetch("/api/store/steam/promos")
      .then(x => x.json() as Promise<{ promos?: number; creees?: number; error?: string }>)
      .catch(() => null);
    if (!r || r.error) setVerif("échec de la vérification");
    else if ((r.creees ?? 0) > 0) { const c = r.creees ?? 0; setVerif(`${c} nouvelle${c > 1 ? "s" : ""} alerte${c > 1 ? "s" : ""} · ${r.promos ?? 0} en promo`); }
    else setVerif(`${r.promos ?? 0} en promo · rien de nouveau`);
  };

  const noms = lignes.map(l => l.nom).join("|");

  useEffect(() => {
    if (!noms) return;
    let annule = false;
    setChargement(true);
    fetch(`/api/store/steam?noms=${encodeURIComponent(noms)}`)
      .then(r => r.json() as Promise<{ fiches?: FicheSteam[] }>)
      .then(d => {
        if (annule) return;
        const map: Record<string, FicheSteam> = {};
        (d.fiches ?? []).forEach(f => { map[f.nom_recherche] = f; });
        setFiches(map);
      })
      .catch(() => {})
      .finally(() => { if (!annule) setChargement(false); });
    return () => { annule = true; };
  }, [noms]);

  const total = lignes.reduce((s, l) => {
    const f = fiches[l.nom];
    return s + (f?.prix ?? l.prix_unitaire ?? 0) * l.quantite;
  }, 0);

  const enPromo = lignes.filter(l => fiches[l.nom]?.remise);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 16px 16px", overflowY: "auto" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pop-card" style={{ background: "var(--cream)", width: "100%", maxWidth: 780, display: "flex", flexDirection: "column", overflow: "hidden", marginBottom: 32 }}>

        {/* Header */}
        <div style={{ background: "#1b2838", padding: "18px 22px", display: "flex", alignItems: "center", gap: 12, borderBottom: "2.5px solid var(--ink)" }}>
          <span style={{ fontSize: 30 }}>🖥️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="bc" style={{ fontSize: 24, color: "#ffffff", margin: 0, lineHeight: 1 }}>Wishlist Steam</h2>
            <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
              Les jeux PC ne se commandent pas — ils s&apos;achètent sur Steam
            </p>
          </div>
          <button onClick={onClose} style={{ width: 34, height: 34, border: "2.5px solid var(--ink)", borderRadius: 8, background: "var(--white)", fontWeight: 900, fontSize: 14, cursor: "pointer", flexShrink: 0 }}>✕</button>
        </div>

        {/* Résumé */}
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "12px 22px", background: "var(--cream2)", borderBottom: "2.5px solid var(--ink)", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 800 }}>{lignes.length} jeu{lignes.length !== 1 ? "x" : ""}</span>
          <span style={{ fontSize: 13, fontWeight: 800 }}>
            Total {chargement ? "…" : `${total.toFixed(2)} €`}
          </span>
          {enPromo.length > 0 && (
            <span className="pop-sticker" style={{ background: "var(--vert)", border: "2px solid var(--ink)", fontSize: 11 }}>
              🔥 {enPromo.length} en promo
            </span>
          )}
          {chargement && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Prix Steam en cours de récupération…</span>}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {verif && <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.45)" }}>{verif}</span>}
            <button onClick={verifierPromos} disabled={verif === "…"} className="pop-btn pop-btn-outline"
              title="Ouvre une alerte sur le tableau de bord pour chaque promo en cours. Fait automatiquement une fois par jour."
              style={{ fontSize: 11, padding: "4px 10px" }}>
              {verif === "…" ? "Vérification…" : "🔔 Signaler les promos"}
            </button>
          </div>
        </div>

        {/* Liste */}
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {lignes.length === 0 ? (
            <p style={{ textAlign: "center", padding: "28px 0", color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 14 }}>
              Aucun jeu PC pour l&apos;instant — passe la console d&apos;une ligne sur « PC » et elle atterrira ici.
            </p>
          ) : lignes.map(ligne => {
            const f = fiches[ligne.nom];
            const trouve = !!f?.appid;
            return (
              <div key={ligne.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 10 }}>
                {(f?.image_url ?? ligne.image_url) ? (
                  <img src={f?.image_url ?? ligne.image_url!} alt="" style={{ width: 62, height: 30, objectFit: "cover", borderRadius: 4, background: "var(--cream2)", flexShrink: 0, border: "1.5px solid var(--ink)" }} />
                ) : (
                  <div style={{ width: 62, height: 30, borderRadius: 4, background: "var(--cream2)", flexShrink: 0, border: "1.5px solid var(--ink)" }} />
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ligne.nom}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    {ligne.profil && <span style={{ fontSize: 11, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "1px 6px", fontWeight: 700 }}>{ligne.profil}</span>}
                    <PastilleDoublon doublon={doublons[ligne.nom]} type="JV" />
                    {!chargement && !trouve && (
                      <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 600 }}>non identifié sur Steam</span>
                    )}
                    {trouve && f!.titre && f!.titre.toLowerCase() !== ligne.nom.toLowerCase() && (
                      <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 600 }}>≈ {f!.titre}</span>
                    )}
                  </div>
                </div>

                {/* Votes */}
                <div style={{ flexShrink: 0 }}>
                  <CelluleVotes ligne={ligne} connecte={connecte} onVote={onVote} />
                </div>

                {/* Prix */}
                <div style={{ textAlign: "right", flexShrink: 0, minWidth: 78 }}>
                  {f?.prix != null ? (
                    <>
                      <span className="bc" style={{ fontSize: 16 }}>{f.prix.toFixed(2)} €</span>
                      {f.remise && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: "var(--ink)" }}>
                          <span style={{ background: "var(--vert)", border: "1px solid var(--ink)", borderRadius: 4, padding: "0 4px" }}>-{f.remise}%</span>
                          {f.prix_initial != null && <span style={{ textDecoration: "line-through", color: "rgba(0,0,0,0.35)", marginLeft: 4 }}>{f.prix_initial.toFixed(2)}</span>}
                        </div>
                      )}
                    </>
                  ) : (
                    <span style={{ fontSize: 13, color: "rgba(0,0,0,0.3)", fontWeight: 700 }}>—</span>
                  )}
                </div>

                <a href={f?.url ?? `https://store.steampowered.com/search/?term=${encodeURIComponent(ligne.nom)}`}
                  target="_blank" rel="noopener noreferrer"
                  title={trouve ? "Ouvrir la fiche Steam pour l'ajouter à la wishlist" : "Chercher sur Steam"}
                  className="pop-btn" style={{ flexShrink: 0, fontSize: 12, padding: "6px 12px", background: "#1b2838", color: "#ffffff", textDecoration: "none" }}>
                  {trouve ? "Steam ↗" : "Chercher ↗"}
                </a>

                <button onClick={() => onSupprimer(ligne)}
                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer", flexShrink: 0 }}>✕</button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "14px 20px", borderTop: "2.5px solid var(--ink)" }}>
          <button onClick={onClose} className="pop-btn pop-btn-dark" style={{ width: "100%" }}>Fermer</button>
        </div>
      </div>
    </div>
  );
}


// ─── Votes, commentaires, vérification ────────────────────────────────────────

const initiale = (nom: string) => (nom.trim()[0] ?? "?").toUpperCase();

const dateCourte = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
};

/**
 * Score et bascule de vote. Le vote est nominatif : les initiales des votants
 * sont affichées sous le score, en vert pour un « pour », en rouge pour un
 * « contre ». Hors connexion, les flèches sont inertes et le disent.
 */
function CelluleVotes({ ligne, connecte, onVote }: {
  ligne: PanierCommunLigne;
  connecte: boolean;
  onVote: (ligne: PanierCommunLigne, valeur: 1 | -1) => void;
}) {
  const monVote = ligne.mon_vote ?? 0;
  const votants = ligne.votants ?? [];
  const titre = connecte ? undefined : "Connecte-toi pour voter";

  const fleche = (valeur: 1 | -1, actif: boolean) => ({
    padding: "4px 10px",
    cursor: connecte ? "pointer" : "not-allowed",
    background: actif ? (valeur === 1 ? "var(--vert)" : "var(--rouge)") : "var(--cream2)",
    border: "none", fontWeight: 900, fontSize: 13, fontFamily: "inherit",
    opacity: connecte ? 1 : 0.4,
    color: "var(--ink)",
  } as React.CSSProperties);

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div title={titre} style={{ display: "inline-flex", alignItems: "center", border: "2px solid var(--ink)", borderRadius: 20, overflow: "hidden" }}>
        <button disabled={!connecte} onClick={() => onVote(ligne, 1)} style={fleche(1, monVote === 1)}>▲</button>
        <span className="bc" style={{ fontSize: 15, padding: "0 8px", minWidth: 26, textAlign: "center" }}>
          {ligne.votes > 0 ? "+" : ""}{ligne.votes}
        </span>
        <button disabled={!connecte} onClick={() => onVote(ligne, -1)} style={fleche(-1, monVote === -1)}>▼</button>
      </div>
      {votants.length > 0 && (
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap", justifyContent: "center", maxWidth: 96 }}>
          {votants.map(v => (
            <span key={v.utilisateur_id} title={`${v.nom} — ${v.valeur === 1 ? "pour" : "contre"}`}
              style={{
                width: 16, height: 16, borderRadius: "50%", fontSize: 9, fontWeight: 900,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: v.valeur === 1 ? "var(--vert)" : "var(--rouge)",
                border: "1.5px solid var(--ink)", color: "var(--ink)",
              }}>
              {initiale(v.nom)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function BoutonCommentaires({ ligne, onOuvrir }: { ligne: PanierCommunLigne; onOuvrir: () => void }) {
  const n = (ligne.commentaires ?? []).length;
  return (
    <button onClick={onOuvrir} title={n > 0 ? `${n} commentaire${n > 1 ? "s" : ""}` : "Ajouter un commentaire"}
      style={{
        display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit",
        background: n > 0 ? "var(--yellow)" : "transparent",
        border: n > 0 ? "2px solid var(--ink)" : "2px solid var(--cream2)",
        borderRadius: 20, padding: "3px 9px", fontWeight: 800, fontSize: 12,
      }}>
      💬{n > 0 ? ` ${n}` : ""}
    </button>
  );
}

/** Rappel visuel d'une réception déjà enregistrée dans l'atelier. */
function PastilleReception({ corr }: { corr: Correspondance | undefined }) {
  if (!corr) return null;
  const sur = corr.type === "proche";
  const date = dateCourte(corr.date_reception);
  return (
    <span title={`Atelier : « ${corr.reception_nom} »${date ? ` reçu le ${date}` : ""}`}
      style={{
        fontSize: 10, fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0,
        background: sur ? "var(--cream2)" : "var(--vert)",
        border: "1.5px solid var(--ink)", borderRadius: 4, padding: "1px 6px",
      }}>
      {sur ? "≈ nom proche" : `reçu${date ? " " + date : ""}`}
    </span>
  );
}

/** Fil de commentaires d'une ligne. Lecture ouverte à tous, écriture aux comptes. */
function PanneauCommentaires({ ligne, compteId, onFermer, onAjouter, onSupprimer }: {
  ligne: PanierCommunLigne;
  compteId: string | null;
  onFermer: () => void;
  onAjouter: (ligne: PanierCommunLigne, texte: string) => Promise<void>;
  onSupprimer: (ligne: PanierCommunLigne, commentaireId: string) => Promise<void>;
}) {
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const commentaires = ligne.commentaires ?? [];

  const envoyer = async () => {
    const contenu = texte.trim();
    if (!contenu) return;
    setEnvoi(true);
    await onAjouter(ligne, contenu);
    setTexte("");
    setEnvoi(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => e.target === e.currentTarget && onFermer()}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 440, maxHeight: "calc(100vh - 120px)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexShrink: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="bc" style={{ fontSize: 18, color: "var(--cream)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ligne.nom}</h2>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700, margin: "2px 0 0" }}>
              {commentaires.length} commentaire{commentaires.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button onClick={onFermer} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--cream)", fontSize: 16, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          {commentaires.length === 0 && (
            <p style={{ textAlign: "center", padding: "18px 0", color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 13 }}>
              Aucun commentaire — dis ce que tu en penses.
            </p>
          )}
          {commentaires.map((c, idx) => (
            <div key={c.id} style={{ background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 10, padding: "9px 12px", boxShadow: "2px 2px 0 var(--ink)", transform: `rotate(${idx % 2 === 0 ? -0.4 : 0.4}deg)` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                <span className="bc" style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--yellow)", border: "1.5px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                  {initiale(c.nom)}
                </span>
                <span style={{ fontWeight: 800, fontSize: 12 }}>{c.nom}</span>
                <span style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 600 }}>{dateCourte(c.cree_le)}</span>
                {c.utilisateur_id === compteId && (
                  <button onClick={() => onSupprimer(ligne, c.id)} title="Supprimer mon commentaire"
                    style={{ marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(0,0,0,0.4)", fontFamily: "inherit" }}>✕</button>
                )}
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.texte}</p>
            </div>
          ))}
        </div>

        <div style={{ padding: 16, borderTop: "2.5px solid var(--ink)", flexShrink: 0 }}>
          {compteId ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={3}
                placeholder="Ton avis sur ce jeu…" className="pop-input"
                onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) envoyer(); }}
                style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 13 }} />
              <button onClick={envoyer} disabled={envoi || !texte.trim()} className="pop-btn pop-btn-dark"
                style={{ justifyContent: "center", fontSize: 13, opacity: envoi || !texte.trim() ? 0.5 : 1 }}>
                {envoi ? "Envoi…" : "Commenter"}
              </button>
            </div>
          ) : (
            <p style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.45)" }}>
              Connecte-toi pour commenter.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function StorePage() {
  const [view, setView] = useState<View>("dashboard");
  const [activeProfil, setActiveProfil] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { compte } = useCompte();

  const [paniers, setPaniers] = useState<Panier[]>([]);
  const [communLignes, setCommunLignes] = useState<Record<string, PanierCommunLigne[]>>({});

  // Commentaires ouverts sur une ligne, mode vérification et son état de cochage
  const [ligneCommentee, setLigneCommentee] = useState<string | null>(null);
  const [modeVerification, setModeVerification] = useState(false);
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [correspondances, setCorrespondances] = useState<Correspondance[]>([]);
  const [lignes, setLignes] = useState<PanierLigne[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [summary, setSummary] = useState<StoreSummary>({ communStats: {}, profilStats: {}, membres: [] as MembreSummary[] });

  const [modalCreate, setModalCreate] = useState(false);
  const [modalEdit, setModalEdit] = useState<Panier | null>(null);
  const [modalEnvoi, setModalEnvoi] = useState<PanierLigne | null>(null);

  const [recherche, setRecherche] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [resultats, setResultats] = useState<JeuRechercheStore[]>([]);
  const [sourceBloquee, setSourceBloquee] = useState(false);
  const [showResultats, setShowResultats] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedCommunIds = useRef<Set<string>>(new Set());

  const [localPrix, setLocalPrix] = useState<Record<string, string>>({});
  const [localQte, setLocalQte] = useState<Record<string, string>>({});
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [tagEdit, setTagEdit] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagHover, setTagHover] = useState<string | null>(null);
  const [nomEdit, setNomEdit] = useState<string | null>(null);
  const [filterConsole, setFilterConsole] = useState<string | null>(null);
  const [localPrixCommun, setLocalPrixCommun] = useState<Record<string, string>>({});
  const [modalPDF, setModalPDF] = useState(false);
  const [modalWishlist, setModalWishlist] = useState(false);
  // Jeux déjà présents dans la ludothèque, indexés par nom de ligne
  const [doublons, setDoublons] = useState<Record<string, Doublon>>({});
  const [pdfConsoles, setPdfConsoles] = useState<string[]>([]);

  // ─── Dérivés ──────────────────────────────────────────────────────────────────

  const isCommun = selectedId?.startsWith("commun-") ?? false;
  const panierActuel = (view === "basket" && !isCommun) ? (paniers.find(p => p.id === selectedId) ?? null) : null;
  const panierCommunActuel = (view === "basket" && isCommun) ? (PANIERS_COMMUNS.find(p => p.id === selectedId) ?? null) : null;
  const lignesCommun = (isCommun && selectedId) ? (communLignes[selectedId] ?? []) : [];
  // Les jeux PC s'achètent sur Steam, pas en commande : ils sortent du panier et
  // alimentent la wishlist. Rien à migrer, c'est un simple aiguillage à l'affichage.
  const estWishlist = (l: PanierCommunLigne) => panierCommunActuel?.type === "JV" && l.console === "PC";
  const lignesWishlist = lignesCommun.filter(estWishlist);
  const lignesCommande = lignesCommun.filter(l => !estWishlist(l));
  const profilPaniers = activeProfil ? paniers.filter(p => p.profil === activeProfil) : [];

  const totalEstime = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
  const nbSansPrix = lignes.filter(l => l.prix_unitaire == null).length;

  // ─── Chargement ───────────────────────────────────────────────────────────────

  const chargerPaniers = async () => {
    const data = await fetch("/api/paniers").then(r => r.json() as Promise<any>)
      .then(d => Array.isArray(d) ? d : []).catch(() => []);
    setPaniers(data as Panier[]);
    setIsLoading(false);
  };

  const chargerSummary = async () => {
    const data = await fetch("/api/store/summary").then(r => r.json() as Promise<StoreSummary>).catch(() => null);
    // La route peut répondre { error } : sans ce garde-fou, la page plante au
    // premier accès à communStats.
    if (data && data.communStats) setSummary(data);
  };

  const chargerLignes = async (id: string) => {
    const data = await fetch(`/api/panier-lignes?panier_id=${id}`).then(r => r.json() as Promise<any>)
      .then(d => Array.isArray(d) ? d : []).catch(() => []);
    setLignes(data as PanierLigne[]);
  };

  const chargerCommunLignes = async (id: string) => {
    if (loadedCommunIds.current.has(id)) return;
    loadedCommunIds.current.add(id);
    const data = await fetch(`/api/paniers-communs-lignes?panier_commun_id=${id}`)
      .then(r => r.json() as Promise<any>).then(d => Array.isArray(d) ? d : []).catch(() => []);
    setCommunLignes(prev => ({ ...prev, [id]: data as PanierCommunLigne[] }));
  };

  useEffect(() => { chargerPaniers(); chargerSummary(); }, []);

  // `mon_vote` dépend de qui regarde : se connecter ou se déconnecter rend le
  // cache des lignes obsolète, il faut le vider et recharger le panier ouvert.
  const compteId = compte?.id ?? null;
  const compteIdPrecedent = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (compteIdPrecedent.current === undefined) { compteIdPrecedent.current = compteId; return; }
    if (compteIdPrecedent.current === compteId) return;
    compteIdPrecedent.current = compteId;
    loadedCommunIds.current.clear();
    setCommunLignes({});
    if (view === "basket" && isCommun && selectedId) chargerCommunLignes(selectedId);
  }, [compteId]);

  useEffect(() => {
    setFilterTag(null);
    setFilterConsole(null);
    setTagEdit(null);
    // Changer de panier referme la vérification et son état de cochage.
    setModeVerification(false);
    setCoches(new Set());
    setCorrespondances([]);
    setLigneCommentee(null);
    if (view !== "basket" || !selectedId) { setLignes([]); return; }
    if (isCommun) { setLignes([]); chargerCommunLignes(selectedId); }
    else chargerLignes(selectedId);
  }, [view, selectedId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResultats(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Navigation ───────────────────────────────────────────────────────────────

  const goToDashboard = () => { setView("dashboard"); setSelectedId(null); setActiveProfil(null); setLignes([]); };
  const goToProfil = (p: string) => { setView("profil"); setActiveProfil(p); setSelectedId(null); setLignes([]); };
  const goToBasket = (id: string) => { setView("basket"); setSelectedId(id); };

  const handleBack = () => {
    if (view === "basket") {
      if (isCommun) goToDashboard();
      else if (activeProfil) goToProfil(activeProfil);
      else goToDashboard();
    } else if (view === "profil") {
      goToDashboard();
    }
  };

  // ─── CRUD Paniers ─────────────────────────────────────────────────────────────

  const handlePanierSaved = (p: Panier) => {
    setPaniers(prev => {
      const exists = prev.find(x => x.id === p.id);
      return exists ? prev.map(x => x.id === p.id ? p : x) : [p, ...prev];
    });
    goToBasket(p.id);
    chargerSummary();
  };

  const changerStatut = async (id: string, statut: Panier["statut"]) => {
    await fetch(`/api/paniers/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statut }),
    });
    setPaniers(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
  };

  const supprimerPanier = async (id: string) => {
    if (!confirm("Supprimer ce panier et toutes ses lignes ?")) return;
    await fetch(`/api/paniers/${id}`, { method: "DELETE" });
    setPaniers(prev => prev.filter(p => p.id !== id));
    if (activeProfil) goToProfil(activeProfil); else goToDashboard();
    chargerSummary();
  };

  // ─── Doublons ──────────────────────────────────────────────────────────────

  /** Interroge la ludothèque pour savoir lesquels de ces jeux sont déjà possédés. */
  const verifierDoublons = async (noms: string[], type: PanierType): Promise<Record<string, Doublon>> => {
    const aChercher = [...new Set(noms.filter(Boolean))];
    if (aChercher.length === 0) return {};
    const data = await fetch(`/api/store/doublons?type=${type === "JV" ? "JV" : "JdS"}&noms=${encodeURIComponent(aChercher.join("|"))}`)
      .then(r => r.json() as Promise<{ doublons?: Record<string, Doublon> }>)
      .catch(() => null);
    return data?.doublons ?? {};
  };

  // Les lignes visibles sont confrontées au catalogue à chaque changement de panier.
  useEffect(() => {
    const type = panierActuel?.type ?? panierCommunActuel?.type;
    if (!type) return;
    const noms = [...lignes.map(l => l.nom), ...lignesCommun.map(l => l.nom)];
    if (noms.length === 0) { setDoublons({}); return; }
    let annule = false;
    verifierDoublons(noms, type).then(d => { if (!annule) setDoublons(d); });
    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, lignes.length, lignesCommun.length]);

  // ─── Recherche ────────────────────────────────────────────────────────────────

  const lancerRecherche = (val: string) => {
    setRecherche(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setResultats([]); setShowResultats(false); return; }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true); setShowResultats(true);
      try {
        const type = panierActuel?.type ?? "JdS";
        const data = await fetch(`/api/store/recherche?nom=${encodeURIComponent(val.trim())}&type=${type}`).then(r => r.json() as Promise<any>);
        const trouves = (data.resultats ?? []).map((r: any) => ({
          nom: r.nom, editeur: r.editeur, image_url: r.image_url, prix: r.prix,
          url_source: r.url_source ?? null, extra: r.plateforme ?? undefined,
          etat: r.etat ?? null, region: r.region ?? null, reference: r.reference ?? null,
          rupture: !!r.rupture,
        }));

        // Trader Games protège son site contre les requêtes automatiques : si la
        // recherche est refusée, on retombe sur le catalogue jeux vidéo habituel
        // (titres et jaquettes, mais sans prix) plutôt que de ne rien proposer.
        if (type === "JV" && data.bloque) {
          const secours = await fetch(`/api/jv/search?q=${encodeURIComponent(val.trim())}`)
            .then(r => r.json() as Promise<any[]>).catch(() => []);
          const liste = (Array.isArray(secours) ? secours : []).map((g: any) => ({
            nom: g.titre, editeur: g.editeur, image_url: g.image_url, prix: null,
            url_source: null, extra: g.console, etat: null, region: null, reference: null,
          }));
          setSourceBloquee(liste.length === 0);
          setResultats(liste);
        } else {
          setSourceBloquee(!!data.bloque);
          setResultats(trouves);
        }
      } catch { setResultats([]); setSourceBloquee(false); }
      finally { setIsSearching(false); }
    }, 500);
  };

  const ajouterJeu = async (jeu: JeuRechercheStore) => {
    if (!panierActuel) return;

    // Déjà en rayon ? Les jeux vidéo ne se rachètent pas — les jeux de société
    // si (on assume les doublons), ils sont simplement marqués comme tels.
    const dejaPossede = (await verifierDoublons([jeu.nom], panierActuel.type))[jeu.nom];
    if (dejaPossede?.possede && panierActuel.type === "JV") {
      const ok = confirm(`« ${jeu.nom} » est déjà au catalogue jeux vidéo${dejaPossede.detail ? ` (${dejaPossede.detail})` : ""}.\n\nL'ajouter quand même au panier ?`);
      if (!ok) { setRecherche(""); setResultats([]); setShowResultats(false); return; }
    }
    const tagsAuto = dejaPossede?.possede && panierActuel.type !== "JV" ? "double" : null;

    const payload = { panier_id: panierActuel.id, nom: jeu.nom, editeur: jeu.editeur ?? null,
      image_url: jeu.image_url ?? null, prix_unitaire: jeu.prix ?? null, quantite: 1,
      notes: jeu.url_source ?? null, console: jeu.extra ?? null, tags: tagsAuto };
    const res = await fetch("/api/panier-lignes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) {
      setLignes(prev => [{ ...payload, id: res.id, ean: null } as PanierLigne, ...prev]);
      if (dejaPossede) setDoublons(prev => ({ ...prev, [jeu.nom]: dejaPossede }));
    }
    setRecherche(""); setResultats([]); setShowResultats(false);
    chargerSummary();
  };

  const ajouterJeuManuel = async () => {
    if (!panierActuel || !recherche.trim()) return;
    const payload = { panier_id: panierActuel.id, nom: recherche.trim(), quantite: 1 };
    const res = await fetch("/api/panier-lignes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
    }).then(r => r.json() as Promise<any>).catch(() => null);
    if (res?.id) setLignes(prev => [{ ...payload, id: res.id, editeur: null, image_url: null, ean: null, prix_unitaire: null, notes: null } as PanierLigne, ...prev]);
    setRecherche(""); setResultats([]); setShowResultats(false);
    chargerSummary();
  };

  // ─── CRUD Lignes ──────────────────────────────────────────────────────────────

  const supprimerLigne = async (id: string) => {
    await fetch(`/api/panier-lignes/${id}`, { method: "DELETE" });
    setLignes(prev => prev.filter(l => l.id !== id));
    chargerSummary();
  };

  const sauvegarderPrix = async (id: string, valeur: string) => {
    const prix = valeur.trim() ? parseFloat(valeur.replace(",", ".")) : null;
    if (isNaN(prix as number) && prix !== null) return;
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prix_unitaire: prix }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, prix_unitaire: prix } : l));
    const ligne = lignes.find(l => l.id === id);
    if (ligne) syncToCommunLignes(ligne, { prix_unitaire: prix });
  };

  const sauvegarderConsole = async (id: string, console_: string | null) => {
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ console: console_ }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, console: console_ } : l));
    const ligne = lignes.find(l => l.id === id);
    if (ligne) syncToCommunLignes(ligne, { console: console_ });
  };

  const sauvegarderQte = async (id: string, valeur: string) => {
    const qte = Math.max(1, parseInt(valeur) || 1);
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantite: qte }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, quantite: qte } : l));
  };

  const syncToCommunLignes = async (ligne: PanierLigne, updates: Partial<PanierCommunLigne>) => {
    for (const [communId, comLines] of Object.entries(communLignes)) {
      const match = comLines.find(cl =>
        (ligne.ean && cl.ean === ligne.ean) ||
        cl.nom.toLowerCase() === ligne.nom.toLowerCase()
      );
      if (!match) continue;
      await fetch(`/api/paniers-communs-lignes/${match.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
      });
      setCommunLignes(prev => ({
        ...prev,
        [communId]: (prev[communId] ?? []).map(cl => cl.id === match.id ? { ...cl, ...updates } : cl),
      }));
    }
  };

  const sauvegarderNom = async (id: string, valeur: string) => {
    const trimmed = valeur.trim();
    setNomEdit(null);
    if (!trimmed) return;
    await fetch(`/api/panier-lignes/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nom: trimmed }),
    });
    setLignes(prev => prev.map(l => l.id === id ? { ...l, nom: trimmed } : l));
  };

  const ajouterTag = async (ligneId: string, tag: string) => {
    const t = tag.trim().toLowerCase();
    if (!t) return;
    const ligne = lignes.find(l => l.id === ligneId);
    if (!ligne) return;
    const existing = parseTags(ligne.tags);
    if (existing.includes(t)) return;
    const newTags = [...existing, t].join(",");
    await fetch(`/api/panier-lignes/${ligneId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }),
    });
    setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, tags: newTags } : l));
  };

  const supprimerTag = async (ligneId: string, tag: string) => {
    const ligne = lignes.find(l => l.id === ligneId);
    if (!ligne) return;
    const newTags = parseTags(ligne.tags).filter(t => t !== tag).join(",") || null;
    await fetch(`/api/panier-lignes/${ligneId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tags: newTags }),
    });
    setLignes(prev => prev.map(l => l.id === ligneId ? { ...l, tags: newTags } : l));
  };

  const allTags = [...new Set(lignes.flatMap(l => parseTags(l.tags)))].sort();
  const lignesFiltrees = filterTag ? lignes.filter(l => parseTags(l.tags).includes(filterTag)) : lignes;

  // ─── CRUD Commun ──────────────────────────────────────────────────────────────

  const handleEnvoiCommun = (panierCommunId: string, newLigne: PanierCommunLigne) => {
    setCommunLignes(prev => ({ ...prev, [panierCommunId]: [newLigne, ...(prev[panierCommunId] ?? [])].sort((a, b) => b.votes - a.votes) }));
    chargerSummary();
  };

  const appliquerVote = (panierCommunId: string, ligneId: string, res: { votes: number; mon_vote: number; votants: Votant[] }) => {
    setCommunLignes(prev => ({
      ...prev,
      [panierCommunId]: (prev[panierCommunId] ?? [])
        .map(l => l.id === ligneId ? { ...l, votes: res.votes, mon_vote: res.mon_vote, votants: res.votants } : l)
        .sort((a, b) => b.votes - a.votes),
    }));
    chargerSummary();
  };

  const handleUpvoteCommun = appliquerVote;

  /**
   * Le serveur fait autorité sur le score : on n'anticipe pas l'affichage, une
   * bascule (revoter la même valeur retire la voix) se lit mal en optimiste.
   */
  const voterLigne = async (ligne: PanierCommunLigne, valeur: 1 | -1) => {
    if (!compte) return;
    const res = await fetch(`/api/paniers-communs-lignes/${ligne.id}/vote`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valeur }),
    }).then(r => r.ok ? r.json() as Promise<any> : null).catch(() => null);
    if (res) appliquerVote(ligne.panier_commun_id, ligne.id, res);
  };

  // ─── Commentaires ─────────────────────────────────────────────────────────────

  const ajouterCommentaire = async (ligne: PanierCommunLigne, texte: string) => {
    const res = await fetch(`/api/paniers-communs-lignes/${ligne.id}/commentaires`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texte }),
    }).then(r => r.ok ? r.json() as Promise<any> : null).catch(() => null);
    if (!res) return;
    setCommunLignes(prev => ({
      ...prev,
      [ligne.panier_commun_id]: (prev[ligne.panier_commun_id] ?? [])
        .map(l => l.id === ligne.id ? { ...l, commentaires: [...(l.commentaires ?? []), res] } : l),
    }));
  };

  const supprimerCommentaire = async (ligne: PanierCommunLigne, commentaireId: string) => {
    await fetch(`/api/paniers-communs-lignes/${ligne.id}/commentaires/${commentaireId}`, { method: "DELETE" });
    setCommunLignes(prev => ({
      ...prev,
      [ligne.panier_commun_id]: (prev[ligne.panier_commun_id] ?? [])
        .map(l => l.id === ligne.id ? { ...l, commentaires: (l.commentaires ?? []).filter(c => c.id !== commentaireId) } : l),
    }));
  };

  // ─── Mode vérification ────────────────────────────────────────────────────────

  const ouvrirVerification = async () => {
    if (!selectedId) return;
    setModeVerification(true);
    const corrs = await fetch(`/api/paniers-communs-lignes/verification?panier_commun_id=${selectedId}`)
      .then(r => r.ok ? r.json() as Promise<Correspondance[]> : []).catch(() => []);
    setCorrespondances(corrs);
    // Les rapprochements sûrs sont cochés d'office ; « proche » est trop
    // incertain pour ça, il est seulement signalé.
    setCoches(new Set(corrs.filter(c => c.type === "ean" || c.type === "nom").map(c => c.ligne_id)));
  };

  const fermerVerification = () => {
    setModeVerification(false);
    setCoches(new Set());
    setCorrespondances([]);
  };

  const validerVerification = async () => {
    const ids = [...coches];
    if (ids.length === 0) return;
    const communId = selectedId!;
    for (const id of ids) {
      await fetch(`/api/paniers-communs-lignes/${id}`, { method: "DELETE" });
    }
    setCommunLignes(prev => ({
      ...prev,
      [communId]: (prev[communId] ?? []).filter(l => !coches.has(l.id)),
    }));
    fermerVerification();
    chargerSummary();
  };

  const supprimerCommunLigne = async (ligne: PanierCommunLigne) => {
    await fetch(`/api/paniers-communs-lignes/${ligne.id}`, { method: "DELETE" });
    setCommunLignes(prev => ({
      ...prev,
      [ligne.panier_commun_id]: (prev[ligne.panier_commun_id] ?? []).filter(l => l.id !== ligne.id),
    }));
    chargerSummary();
  };

  // ─── PDF ──────────────────────────────────────────────────────────────────────

  const exporterPDF = () => {
    if (!panierActuel) return;
    const total = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Devis – ${panierActuel.nom}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
h1{font-size:22px;font-weight:900;margin-bottom:4px}.meta{color:#666;font-size:12px;margin-bottom:32px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#111;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #e5e5e5;vertical-align:middle}.right{text-align:right}
.total-row td{font-weight:900;font-size:15px;border-top:2px solid #111;padding-top:14px}
@media print{body{padding:20px}}</style></head><body>
<h1>Devis – ${panierActuel.nom}</h1>
<p class="meta">Généré le ${date} · ${lignes.length} article${lignes.length > 1 ? "s" : ""} · Statut : ${panierActuel.statut}</p>
<table><thead><tr><th>Jeu</th><th>Éditeur</th><th class="right">P.U.</th><th class="right">Qté</th><th class="right">Total</th></tr></thead>
<tbody>${lignes.map(l => `<tr>
  <td>${l.nom}${l.notes?.startsWith("http") ? ` <a href="${l.notes}" style="color:#666;font-size:10px;" target="_blank">↗</a>` : ""}</td>
  <td>${l.editeur ?? "—"}</td><td class="right">${l.prix_unitaire != null ? l.prix_unitaire.toFixed(2) + " €" : "—"}</td>
  <td class="right">${l.quantite}</td><td class="right">${l.prix_unitaire != null ? (l.prix_unitaire * l.quantite).toFixed(2) + " €" : "—"}</td>
</tr>`).join("")}
<tr class="total-row"><td colspan="4">Total estimé</td><td class="right">${total.toFixed(2)} €</td></tr>
</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  const sauvegarderPrixCommun = async (id: string, valeur: string) => {
    const prix = parseFloat(valeur.replace(",", "."));
    const communId = selectedId!;
    if (isNaN(prix) || prix < 0) {
      setCommunLignes(prev => ({ ...prev, [communId]: (prev[communId] ?? []).map(l => l.id === id ? { ...l, prix_unitaire: null } : l) }));
      await fetch(`/api/paniers-communs-lignes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prix_unitaire: null }) });
    } else {
      setCommunLignes(prev => ({ ...prev, [communId]: (prev[communId] ?? []).map(l => l.id === id ? { ...l, prix_unitaire: prix } : l) }));
      await fetch(`/api/paniers-communs-lignes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prix_unitaire: prix }) });
    }
  };

  const sauvegarderConsoleCommun = async (id: string, console_: string | null) => {
    const communId = selectedId!;
    setCommunLignes(prev => ({ ...prev, [communId]: (prev[communId] ?? []).map(l => l.id === id ? { ...l, console: console_ } : l) }));
    await fetch(`/api/paniers-communs-lignes/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ console: console_ }) });
  };

  const exporterPDFCommun = (consolesFiltre: string[] = []) => {
    if (!panierCommunActuel) return;
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const isJV = panierCommunActuel.type === "JV";
    const filtered = (isJV && consolesFiltre.length > 0)
      ? lignesCommande.filter(l => consolesFiltre.includes(l.console ?? ""))
      : lignesCommande;
    const total = filtered.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const consoleTitre = consolesFiltre.length > 0 ? ` — ${consolesFiltre.join(", ")}` : "";
    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>${panierCommunActuel.nom}${consoleTitre}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:40px;color:#111;font-size:13px}
h1{font-size:22px;font-weight:900;margin-bottom:4px}.meta{color:#666;font-size:12px;margin-bottom:28px}
table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;background:#111;color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
td{padding:10px 12px;border-bottom:1px solid #e5e5e5;vertical-align:middle}.right{text-align:right}
.badge{display:inline-block;padding:2px 8px;border-radius:4px;background:#eee;font-size:11px;font-weight:700}
.total-row td{font-weight:900;font-size:15px;border-top:2px solid #111;padding-top:14px}
@media print{body{padding:20px}}</style></head><body>
<h1>${panierCommunActuel.nom}${consoleTitre}</h1>
<p class="meta">Généré le ${date} · ${filtered.length} article${filtered.length !== 1 ? "s" : ""}</p>
<table><thead><tr>
  <th>Jeu</th>
  ${isJV ? "<th>Console</th>" : ""}
  <th class="right">Qté</th>
  <th class="right">Prix approx.</th>
</tr></thead><tbody>
${filtered.map(l => `<tr>
  <td style="font-weight:700">${l.nom}</td>
  ${isJV ? `<td><span class="badge">${l.console ?? "—"}</span></td>` : ""}
  <td class="right">${l.quantite}</td>
  <td class="right">${l.prix_unitaire != null ? l.prix_unitaire.toFixed(2) + " €" : "—"}</td>
</tr>`).join("")}
<tr class="total-row"><td colspan="${isJV ? 3 : 2}">Total estimé</td><td class="right">${total.toFixed(2)} €</td></tr>
</tbody></table></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  const telechargerPDFCommun = async (consolesFiltre: string[] = []) => {
    if (!panierCommunActuel) return;
    const { jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const isJV = panierCommunActuel.type === "JV";
    const filtered = (isJV && consolesFiltre.length > 0)
      ? lignesCommande.filter(l => consolesFiltre.includes(l.console ?? ""))
      : lignesCommande;
    const total = filtered.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const consoleTitre = consolesFiltre.length > 0 ? ` — ${consolesFiltre.join(", ")}` : "";
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
    const doc = new jsPDF();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text(`${panierCommunActuel.nom}${consoleTitre}`, 14, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Généré le ${date} · ${filtered.length} article${filtered.length !== 1 ? "s" : ""}`, 14, 28);
    doc.setTextColor(0);
    const head = [["Jeu", ...(isJV ? ["Console"] : []), "Qté", "Prix approx."]];
    const body: string[][] = [
      ...filtered.map(l => [l.nom, ...(isJV ? [l.console ?? "—"] : []), String(l.quantite), l.prix_unitaire != null ? `${l.prix_unitaire.toFixed(2)} EUR` : "—"]),
      ["Total estimé", ...(isJV ? [""] : []), "", `${total.toFixed(2)} EUR`],
    ];
    autoTable(doc, {
      head,
      body,
      startY: 34,
      styles: { fontSize: 12, cellPadding: 5 },
      headStyles: { fillColor: [17, 17, 17] },
      bodyStyles: { valign: "middle" },
    });
    const filename = `${panierCommunActuel.nom}${consoleTitre}.pdf`.replace(/[/\\?%*:|"<>]/g, "-");
    doc.save(filename);
  };

  // ─── Styles communs ───────────────────────────────────────────────────────────

  const inp: React.CSSProperties = {
    border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 10px",
    background: "var(--white)", outline: "none", fontSize: 14, fontFamily: "inherit", textAlign: "right",
  };

  const backBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 14px",
    background: "var(--cream)", border: "2px solid var(--ink)", borderRadius: 8,
    fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer",
    marginBottom: 20,
  };

  // ─── Rendu ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar current="store" />

      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Titre */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: "uppercase", letterSpacing: "-1px", background: "linear-gradient(135deg, #0d0d0d 40%, var(--rose))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Store</div>
            <div style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 6 }}>Devis et recherche de jeux</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {[{ href: "https://www.myludo.fr", label: "MyLudo" }, { href: "https://www.espritjeu.com", label: "Esprit Jeu" }, { href: "https://www.ludifolie.com", label: "Ludifolie" }]
              .map(({ href, label }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>{label} ↗</a>
              ))}
          </div>
        </div>

        {/* ── VUE DASHBOARD ── */}
        {view === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>

            {/* Paniers communs */}
            <div>
              <h2 className="bc" style={{ fontSize: 22, marginBottom: 16 }}>Paniers communs</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                {PANIERS_COMMUNS.map(p => {
                  const stats = summary.communStats[p.id];
                  return (
                    <button key={p.id} onClick={() => goToBasket(p.id)}
                      style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 14, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden", transition: "transform 0.1s, box-shadow 0.1s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "6px 6px 0 var(--ink)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "4px 4px 0 var(--ink)"; }}>
                      <div style={{ background: TYPE_INFO[p.type].bg, padding: "20px 22px", display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 36 }}>{TYPE_INFO[p.type].emoji}</span>
                        <span className="bc" style={{ fontSize: 20 }}>{p.nom}</span>
                      </div>
                      <div style={{ padding: "16px 22px", display: "flex", gap: 28 }}>
                        <div>
                          <p className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{stats?.nb ?? 0}</p>
                          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>article{(stats?.nb ?? 0) !== 1 ? "s" : ""}</p>
                        </div>
                        <div>
                          <p className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{(stats?.total ?? 0).toFixed(0)} €</p>
                          <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>estimé</p>
                        </div>
                        {(stats?.nb_pc ?? 0) > 0 && (
                          <div>
                            <p className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{stats!.nb_pc}</p>
                            <p style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 700, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.06em" }}>🖥️ sur Steam</p>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Équipe */}
            {(summary.membres.length > 0 || !isLoading) && (
              <div>
                <h2 className="bc" style={{ fontSize: 22, marginBottom: 16 }}>Équipe</h2>
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(summary.membres.length, 1)}, 1fr)`, gap: 16 }}>
                  {summary.membres.map(membre => {
                    const stats = summary.profilStats[membre.nom];
                    return (
                      <button key={membre.nom} onClick={() => goToProfil(membre.nom)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 16px", gap: 10, cursor: "pointer", fontFamily: "inherit", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 14, boxShadow: "3px 3px 0 var(--ink)", transition: "transform 0.1s, box-shadow 0.1s" }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--ink)"; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)"; }}>
                        <div style={{ width: 76, height: 76, borderRadius: "50%", background: membre.couleur, border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span className="bc" style={{ fontSize: 34, color: "var(--ink)" }}>{membre.nom[0].toUpperCase()}</span>
                        </div>
                        <p style={{ fontWeight: 900, fontSize: 17, color: "var(--ink)" }}>{membre.nom}</p>
                        <div style={{ textAlign: "center", display: "flex", flexDirection: "column", gap: 2 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>
                            {stats?.paniers ?? 0} panier{(stats?.paniers ?? 0) !== 1 ? "s" : ""}
                          </p>
                          <p style={{ fontSize: 13, fontWeight: 700, color: "rgba(0,0,0,0.5)" }}>
                            {stats?.jeux ?? 0} jeu{(stats?.jeux ?? 0) > 1 ? "x" : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── VUE PROFIL ── */}
        {view === "profil" && activeProfil && (() => {
          const membreInfo = summary.membres.find(m => m.nom === activeProfil);
          const profilColor = membreInfo?.couleur ?? "#ccc";
          return (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <button onClick={handleBack} style={backBtn}>← Retour</button>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: profilColor, border: "3px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span className="bc" style={{ fontSize: 24 }}>{activeProfil[0].toUpperCase()}</span>
                </div>
                <h2 className="bc" style={{ fontSize: 28, margin: 0 }}>{activeProfil}</h2>
                <span style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>
                  {profilPaniers.length} panier{profilPaniers.length !== 1 ? "s" : ""}
                </span>
              </div>
              <button onClick={() => setModalCreate(true)} className="pop-btn pop-btn-dark" style={{ fontSize: 14 }}>+ Nouveau panier</button>
            </div>

            {profilPaniers.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 20px" }}>
                <span style={{ fontSize: 40, opacity: 0.2 }}>🛒</span>
                <p style={{ fontWeight: 700, color: "rgba(0,0,0,0.3)", marginTop: 12 }}>Aucun panier — crée-en un !</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
                {profilPaniers.map(p => {
                  const ptype = (p.type || "JdS") as PanierType;
                  return (
                    <button key={p.id} onClick={() => goToBasket(p.id)}
                      style={{ textAlign: "left", fontFamily: "inherit", cursor: "pointer", background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 12, boxShadow: "3px 3px 0 var(--ink)", overflow: "hidden", transition: "transform 0.1s, box-shadow 0.1s" }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = "translate(-2px,-2px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = "5px 5px 0 var(--ink)"; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ""; (e.currentTarget as HTMLButtonElement).style.boxShadow = "3px 3px 0 var(--ink)"; }}>
                      <div style={{ background: TYPE_INFO[ptype].bg, padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 22 }}>{TYPE_INFO[ptype].emoji}</span>
                        <span style={{ fontWeight: 900, fontSize: 15, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nom}</span>
                      </div>
                      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                        <span className="pop-sticker" style={{ ...STATUT_STYLE[p.statut], border: "1.5px solid var(--ink)", fontSize: 11, alignSelf: "flex-start" }}>{p.statut}</span>
                        {parseTags(p.tags).length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {parseTags(p.tags).slice(0, 3).map(t => (
                              <span key={t} style={{ fontSize: 10, background: "var(--cream2)", border: "1px solid rgba(0,0,0,0.15)", borderRadius: 4, padding: "1px 5px", fontWeight: 600 }}>{t}</span>
                            ))}
                          </div>
                        )}
                        <p style={{ fontSize: 11, color: "rgba(0,0,0,0.3)", fontWeight: 600, marginTop: "auto" }}>{new Date(p.created_at).toLocaleDateString("fr-FR")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── VUE BASKET ── */}
        {view === "basket" && selectedId && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <button onClick={handleBack} style={backBtn}>
                ← {isCommun ? "Store" : (activeProfil ?? "Store")}
              </button>
            </div>

            {isCommun ? (() => {
              const isJV = panierCommunActuel?.type === "JV";
              const consolesPresentes = isJV ? [...new Set(lignesCommande.map(l => l.console).filter(Boolean))] as string[] : [];
              const lignesCommunFiltrees = filterConsole ? lignesCommande.filter(l => l.console === filterConsole) : lignesCommande;
              return (
              /* Panier commun */
              <>
                <div className="pop-card" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 30 }}>{panierCommunActuel ? TYPE_INFO[panierCommunActuel.type].emoji : ""}</span>
                    <div>
                      <h1 className="bc" style={{ fontSize: 24, margin: 0 }}>{panierCommunActuel?.nom}</h1>
                      <p style={{ fontSize: 13, color: "rgba(0,0,0,0.4)", fontWeight: 600, marginTop: 2 }}>
                        {lignesCommande.length} article{lignesCommande.length !== 1 ? "s" : ""} à commander · classé par votes
                      </p>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {isJV && (
                      <button onClick={() => setModalWishlist(true)} className="pop-btn"
                        style={{ fontSize: 13, background: "#1b2838", color: "#ffffff" }}>
                        🖥️ Wishlist Steam{lignesWishlist.length > 0 ? ` (${lignesWishlist.length})` : ""}
                      </button>
                    )}
                    <button onClick={() => modeVerification ? fermerVerification() : ouvrirVerification()} className="pop-btn"
                      title="Cocher les jeux reçus pour les retirer de la liste"
                      style={{ fontSize: 13, background: modeVerification ? "var(--vert)" : "transparent", border: modeVerification ? "2.5px solid var(--ink)" : "2px solid var(--cream2)" }}>
                      ☑️ {modeVerification ? "Quitter la vérification" : "Vérification"}
                    </button>
                    <button onClick={() => { setPdfConsoles([]); setModalPDF(true); }} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>
                      📄 PDF
                    </button>
                    <span className="pop-sticker" style={{ background: TYPE_INFO[panierCommunActuel!.type].bg, border: "2px solid var(--ink)", fontSize: 13 }}>{panierCommunActuel?.type}</span>
                  </div>
                </div>

                {modeVerification && (
                  <div className="pop-card" style={{ padding: "12px 18px", background: "var(--vert)", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                      <p style={{ fontWeight: 800, fontSize: 13 }}>
                        Coche les jeux réceptionnés, puis retire-les de la liste.
                      </p>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.55)", marginTop: 2 }}>
                        {correspondances.filter(c => c.type !== "proche").length > 0
                          ? `${correspondances.filter(c => c.type !== "proche").length} ligne(s) déjà cochée(s) d'après les réceptions de l'atelier`
                          : "Aucune correspondance avec les réceptions de l'atelier"}
                        {correspondances.some(c => c.type === "proche") && " · les « nom proche » sont à vérifier à la main"}
                      </p>
                    </div>
                    <button onClick={validerVerification} disabled={coches.size === 0} className="pop-btn pop-btn-dark"
                      style={{ fontSize: 13, opacity: coches.size === 0 ? 0.45 : 1 }}>
                      Retirer {coches.size} ligne{coches.size !== 1 ? "s" : ""}
                    </button>
                    <button onClick={fermerVerification} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>
                      Annuler
                    </button>
                  </div>
                )}

                {/* Filtre console (JV uniquement) */}
                {isJV && consolesPresentes.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Console</span>
                    <button onClick={() => setFilterConsole(null)}
                      style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                        background: filterConsole === null ? "var(--ink)" : "var(--cream2)",
                        color: filterConsole === null ? "var(--cream)" : "var(--ink)",
                        border: "2px solid var(--ink)" }}>Toutes ({lignesCommande.length})</button>
                    {consolesPresentes.map(c => (
                      <button key={c} onClick={() => setFilterConsole(filterConsole === c ? null : c)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                          background: filterConsole === c ? "var(--purple)" : "var(--cream2)",
                          color: filterConsole === c ? "var(--cream)" : "var(--ink)",
                          border: "2px solid var(--ink)" }}>
                        {c} ({lignesCommande.filter(l => l.console === c).length})
                      </button>
                    ))}
                  </div>
                )}

                {lignesCommande.length === 0 ? (
                  <div className="pop-card" style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 15 }}>
                      {lignesWishlist.length > 0
                        ? `Rien à commander — les ${lignesWishlist.length} jeu${lignesWishlist.length > 1 ? "x" : ""} PC sont dans la wishlist Steam`
                        : "Panier commun vide — envoie des jeux depuis tes paniers personnels"}
                    </p>
                  </div>
                ) : (
                  <div className="pop-card" style={{ overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--ink)", color: "var(--cream)" }}>
                          {modeVerification && (
                            <th style={{ width: 44, padding: "10px 12px" }}>
                              <input type="checkbox"
                                checked={coches.size === lignesCommunFiltrees.length && lignesCommunFiltrees.length > 0}
                                onChange={e => setCoches(e.target.checked ? new Set(lignesCommunFiltrees.map(l => l.id)) : new Set())}
                                style={{ width: 17, height: 17, cursor: "pointer", accentColor: "var(--vert)" }} />
                            </th>
                          )}
                          {["Jeu", ...(isJV ? ["Console"] : []), "Éditeur", "Profil", "Qté", "Prix", "Votes", "💬", ""].map((h, i, arr) => (
                            <th key={i} style={{ textAlign: i >= arr.length - 5 ? "center" : "left", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", width: i === arr.length - 1 ? 40 : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lignesCommunFiltrees.map((ligne, i) => (
                          <tr key={ligne.id} style={{ borderBottom: "1px solid var(--cream2)", background: modeVerification && coches.has(ligne.id) ? "rgba(168,224,99,0.18)" : "transparent" }}
                            onMouseEnter={e => { if (!(modeVerification && coches.has(ligne.id))) e.currentTarget.style.background = "var(--cream)"; }}
                            onMouseLeave={e => (e.currentTarget.style.background = modeVerification && coches.has(ligne.id) ? "rgba(168,224,99,0.18)" : "transparent")}>
                            {modeVerification && (
                              <td style={{ padding: "10px 12px", textAlign: "center" }}>
                                <input type="checkbox" checked={coches.has(ligne.id)}
                                  onChange={e => setCoches(prev => {
                                    const n = new Set(prev);
                                    if (e.target.checked) n.add(ligne.id); else n.delete(ligne.id);
                                    return n;
                                  })}
                                  style={{ width: 17, height: 17, cursor: "pointer", accentColor: "var(--vert)" }} />
                              </td>
                            )}
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {i < 3 && !filterConsole && !modeVerification && <span style={{ fontSize: 14, flexShrink: 0 }}>{["🥇", "🥈", "🥉"][i]}</span>}
                                {ligne.image_url ? <img src={ligne.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{ligne.nom}</p>
                                <PastilleDoublon doublon={doublons[ligne.nom]} type={panierCommunActuel!.type} />
                                {modeVerification && <PastilleReception corr={correspondances.find(c => c.ligne_id === ligne.id)} />}
                              </div>
                            </td>
                            {isJV && (
                              <td style={{ padding: "6px 10px" }}>
                                <select value={ligne.console ?? ""}
                                  onChange={e => sauvegarderConsoleCommun(ligne.id, e.target.value || null)}
                                  style={{ ...inp, width: 90, fontSize: 12, padding: "4px 6px" }}>
                                  <option value="">—</option>
                                  {CONSOLES_JV.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </td>
                            )}
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{ligne.editeur ?? "—"}</td>
                            <td style={{ padding: "10px 16px" }}>
                              {ligne.profil && <span style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>{ligne.profil}</span>}
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "center" }}>
                              <span className="bc" style={{ fontSize: 15 }}>{ligne.quantite}</span>
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "right" }}>
                              <input type="text" inputMode="decimal"
                                value={localPrixCommun[ligne.id] ?? (ligne.prix_unitaire != null ? String(ligne.prix_unitaire) : "")}
                                onChange={e => setLocalPrixCommun(p => ({ ...p, [ligne.id]: e.target.value }))}
                                onBlur={e => { sauvegarderPrixCommun(ligne.id, e.target.value); setLocalPrixCommun(p => { const n = { ...p }; delete n[ligne.id]; return n; }); }}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                placeholder="—" style={{ ...inp, width: 80, fontSize: 13 }} />
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              <CelluleVotes ligne={ligne} connecte={!!compte} onVote={voterLigne} />
                            </td>
                            <td style={{ padding: "6px 10px", textAlign: "center" }}>
                              <BoutonCommentaires ligne={ligne} onOuvrir={() => setLigneCommentee(ligne.id)} />
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <button onClick={() => supprimerCommunLigne(ligne)}
                                style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>✕</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })() : (
              /* Panier personnel */
              <>
                <div className="pop-card" style={{ padding: "16px 20px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                      <h1 className="bc" style={{ fontSize: 24, margin: 0 }}>{panierActuel?.nom}</h1>
                      {panierActuel && (
                        <span className="pop-sticker" style={{ background: TYPE_INFO[(panierActuel.type || "JdS") as PanierType].bg, border: "1.5px solid var(--ink)", fontSize: 12 }}>
                          {TYPE_INFO[(panierActuel.type || "JdS") as PanierType].emoji} {panierActuel.type ?? "JdS"}
                        </span>
                      )}
                      {panierActuel?.profil && (
                        <span style={{ fontSize: 12, background: "rgba(0,0,0,0.06)", borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}>{panierActuel.profil}</span>
                      )}
                    </div>
                    {parseTags(panierActuel?.tags).length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                        {parseTags(panierActuel?.tags).map(t => (
                          <span key={t} className="pop-sticker" style={{ background: "var(--cream2)", border: "1.5px solid var(--ink)", fontSize: 11 }}>{t}</span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {STATUTS.map(s => (
                        <button key={s} onClick={() => changerStatut(panierActuel!.id, s)} className="pop-btn"
                          style={{ padding: "5px 14px", fontSize: 13, ...STATUT_STYLE[s], boxShadow: panierActuel!.statut === s ? "3px 3px 0 var(--ink)" : "none", border: panierActuel!.statut === s ? "2.5px solid var(--ink)" : "2px solid var(--cream2)", opacity: panierActuel!.statut === s ? 1 : 0.5 }}>{s}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setModalEdit(panierActuel)} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>✏️ Modifier</button>
                    <button onClick={exporterPDF} className="pop-btn pop-btn-outline" style={{ fontSize: 13 }}>📄 PDF</button>
                    <button onClick={() => supprimerPanier(panierActuel!.id)} className="pop-btn" style={{ fontSize: 13, background: "var(--rouge)", color: "var(--white)" }}>Supprimer</button>
                  </div>
                </div>

                {/* Recherche */}
                <div ref={searchRef} style={{ position: "relative" }}>
                  <input type="text" placeholder={panierActuel?.type === "JV" ? "Rechercher un jeu vidéo…" : "Rechercher un jeu à ajouter…"}
                    value={recherche} onChange={e => lancerRecherche(e.target.value)}
                    onFocus={() => resultats.length > 0 && setShowResultats(true)}
                    className="pop-input" style={{ width: "100%" }} />
                  {recherche.trim().length >= 2 && !isSearching && (
                    <button onClick={ajouterJeuManuel} className="pop-btn pop-btn-outline"
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 12, padding: "4px 10px" }}>+ Ajouter tel quel</button>
                  )}
                  {isSearching && <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", width: 18, height: 18, border: "2px solid var(--cream2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />}
                  {showResultats && (
                    <div style={{ position: "absolute", zIndex: 50, top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--white)", border: "2.5px solid var(--ink)", borderRadius: 10, boxShadow: "4px 4px 0 var(--ink)", overflow: "hidden" }}>
                      {isSearching ? (
                        <div style={{ padding: 14, textAlign: "center", fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>Recherche{panierActuel?.type === "JV" ? " sur Trader Games" : " sur Ludifolie"}…</div>
                      ) : resultats.length === 0 ? (
                        <div style={{ padding: 14, textAlign: "center" }}>
                          <p style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>
                            {sourceBloquee ? "Trader Games a refusé la recherche automatique" : "Aucun résultat trouvé"}
                          </p>
                          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 8, flexWrap: "wrap" }}>
                            <button onClick={ajouterJeuManuel} className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "5px 12px" }}>Ajouter « {recherche} »</button>
                            {panierActuel?.type === "JV" && (
                              <a href={`https://www.tradergames.fr/fr/recherche?controller=search&s=${encodeURIComponent(recherche.trim())}`}
                                target="_blank" rel="noopener noreferrer"
                                className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "5px 12px", textDecoration: "none" }}>
                                🔎 Chercher sur Trader Games ↗
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                          {resultats.map((r, i) => (
                            <li key={i}>
                              <button onClick={() => ajouterJeu(r)}
                                style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", cursor: "pointer", background: "none", border: "none", borderBottom: "1px solid var(--cream2)", textAlign: "left", fontFamily: "inherit" }}
                                onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                                {r.image_url ? <img src={r.image_url} alt="" style={{ width: 40, height: 40, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{r.nom}</p>
                                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                                    {r.extra && <span className="pop-sticker" style={{ background: "var(--bleu)", border: "1px solid var(--ink)", fontSize: 10 }}>{r.extra}</span>}
                                    {r.etat && <span className="pop-sticker" style={{ background: r.etat === "Neuf" ? "var(--vert)" : "var(--yellow)", border: "1px solid var(--ink)", fontSize: 10 }}>{r.etat}</span>}
                                    {r.rupture && <span className="pop-sticker" style={{ background: "var(--rouge)", color: "var(--white)", border: "1px solid var(--ink)", fontSize: 10 }}>Rupture</span>}
                                    {r.region && <span style={{ fontSize: 11, color: "rgba(0,0,0,0.45)", fontWeight: 600 }}>{r.region}</span>}
                                    {!r.extra && !r.etat && r.editeur && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.45)" }}>{r.editeur}</p>}
                                  </div>
                                </div>
                                {r.prix != null && <span className="bc" style={{ fontSize: 16, flexShrink: 0 }}>{r.prix.toFixed(2)} €</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>

                {/* Barre de filtres par tag */}
                {allTags.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Tags</span>
                    <button onClick={() => setFilterTag(null)}
                      style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                        background: filterTag === null ? "var(--ink)" : "var(--cream2)",
                        color: filterTag === null ? "var(--cream)" : "var(--ink)",
                        border: "2px solid var(--ink)" }}>Tous ({lignes.length})</button>
                    {allTags.map(tag => (
                      <button key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                        style={{ padding: "4px 12px", borderRadius: 20, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer",
                          background: filterTag === tag ? "var(--ink)" : "var(--cream2)",
                          color: filterTag === tag ? "var(--cream)" : "var(--ink)",
                          border: "2px solid var(--ink)" }}>
                        #{tag} ({lignes.filter(l => parseTags(l.tags).includes(tag)).length})
                      </button>
                    ))}
                  </div>
                )}

                {/* Lignes */}
                {lignes.length === 0 ? (
                  <div className="pop-card" style={{ padding: "40px 20px", textAlign: "center" }}>
                    <p style={{ color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 15 }}>Panier vide — cherche un jeu ci-dessus</p>
                  </div>
                ) : (
                  <div className="pop-card" style={{ overflow: "hidden" }}>
                    {lignesFiltrees.length === 0 && (
                      <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(0,0,0,0.35)", fontWeight: 600, fontSize: 14 }}>
                        Aucun jeu avec le tag #{filterTag}
                      </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--ink)", color: "var(--cream)" }}>
                          {["Jeu", "Éditeur", ...(panierActuel?.type === "JV" ? ["Console"] : []), "P.U.", "Qté", "Total", ""].map((h, i, arr) => (
                            <th key={i} style={{ textAlign: i >= arr.length - 4 && i <= arr.length - 2 ? "right" : "left", padding: "10px 16px", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", width: i === arr.length - 1 ? 100 : undefined }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lignesFiltrees.map(ligne => {
                          const lTags = parseTags(ligne.tags);
                          const isEditingTag = tagEdit === ligne.id;
                          return (
                          <tr key={ligne.id} style={{ borderBottom: "1px solid var(--cream2)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "var(--cream)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                            <td style={{ padding: "10px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                {ligne.image_url ? <img src={ligne.image_url} alt="" style={{ width: 36, height: 36, objectFit: "contain", borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />
                                  : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--cream2)", flexShrink: 0 }} />}
                                <div>
                                  {nomEdit === ligne.id ? (
                                    <input autoFocus type="text" defaultValue={ligne.nom}
                                      onBlur={e => sauvegarderNom(ligne.id, e.target.value)}
                                      onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setNomEdit(null); }}
                                      style={{ fontWeight: 700, fontSize: 14, border: "1.5px solid var(--ink)", borderRadius: 4, padding: "2px 6px", outline: "none", fontFamily: "inherit", minWidth: 180 }} />
                                  ) : (
                                    <p onClick={() => setNomEdit(ligne.id)} title="Cliquer pour modifier"
                                      style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", cursor: "text" }}>{ligne.nom}</p>
                                  )}
                                  <PastilleDoublon doublon={doublons[ligne.nom]} type={panierActuel?.type ?? "JdS"} />
                                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: lTags.length > 0 || isEditingTag ? 4 : 0 }}>
                                    {lTags.map(t => (
                                      <button key={t} onClick={() => supprimerTag(ligne.id, t)}
                                        title="Retirer ce tag"
                                        style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: filterTag === t ? "var(--ink)" : "var(--cream2)", color: filterTag === t ? "var(--cream)" : "var(--ink)", border: "1.5px solid var(--ink)", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                                        #{t} ×
                                      </button>
                                    ))}
                                    {isEditingTag ? (
                                      <input autoFocus type="text" placeholder="nouveau tag…"
                                        value={tagInput} onChange={e => setTagInput(e.target.value)}
                                        onKeyDown={async e => {
                                          if (e.key === "Enter" && tagInput.trim()) {
                                            await ajouterTag(ligne.id, tagInput);
                                            setTagInput("");
                                          }
                                          if (e.key === "Escape") { setTagEdit(null); setTagInput(""); }
                                        }}
                                        onBlur={() => { setTagEdit(null); setTagInput(""); }}
                                        style={{ fontSize: 11, padding: "1px 6px", border: "1.5px solid var(--ink)", borderRadius: 10, outline: "none", width: 100, fontFamily: "inherit" }} />
                                    ) : (
                                      <div style={{ position: "relative", display: "inline-block" }}
                                        onMouseEnter={() => setTagHover(ligne.id)}
                                        onMouseLeave={() => setTagHover(null)}>
                                        <button onClick={() => { setTagEdit(ligne.id); setTagInput(""); }}
                                          style={{ fontSize: 10, padding: "1px 6px", borderRadius: 10, background: "transparent", color: "rgba(0,0,0,0.3)", border: "1.5px dashed rgba(0,0,0,0.2)", cursor: "pointer", fontFamily: "inherit" }}>
                                          + tag
                                        </button>
                                        {tagHover === ligne.id && allTags.filter(t => !lTags.includes(t)).length > 0 && (
                                          <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, zIndex: 50, background: "var(--white)", border: "2px solid var(--ink)", borderRadius: 8, boxShadow: "3px 3px 0 var(--ink)", padding: 4, display: "flex", flexDirection: "column", gap: 2, minWidth: 110 }}>
                                            {allTags.filter(t => !lTags.includes(t)).map(t => (
                                              <button key={t} onMouseDown={() => ajouterTag(ligne.id, t)}
                                                style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: "var(--cream2)", color: "var(--ink)", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap" }}
                                                onMouseEnter={e => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.color = "var(--cream)"; }}
                                                onMouseLeave={e => { e.currentTarget.style.background = "var(--cream2)"; e.currentTarget.style.color = "var(--ink)"; }}>
                                                #{t}
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: "10px 16px", fontSize: 13, color: "rgba(0,0,0,0.45)" }}>{ligne.editeur ?? "—"}</td>
                            {panierActuel?.type === "JV" && (
                              <td style={{ padding: "8px 12px" }}>
                                <select value={ligne.console ?? ""}
                                  onChange={e => sauvegarderConsole(ligne.id, e.target.value || null)}
                                  style={{ ...inp, width: 120, fontSize: 12 }}>
                                  <option value="">—</option>
                                  {CONSOLES_JV.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                              </td>
                            )}
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input type="text" inputMode="decimal"
                                value={localPrix[ligne.id] ?? (ligne.prix_unitaire != null ? String(ligne.prix_unitaire) : "")}
                                onChange={e => setLocalPrix(p => ({ ...p, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderPrix(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                placeholder="—" style={{ ...inp, width: 80 }} />
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <input type="number" min={1}
                                value={localQte[ligne.id] ?? String(ligne.quantite)}
                                onChange={e => setLocalQte(q => ({ ...q, [ligne.id]: e.target.value }))}
                                onBlur={e => sauvegarderQte(ligne.id, e.target.value)}
                                onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                                style={{ ...inp, width: 60 }} />
                            </td>
                            <td style={{ padding: "10px 16px", textAlign: "right" }}>
                              <span className="bc" style={{ fontSize: 16 }}>
                                {ligne.prix_unitaire != null ? `${(ligne.prix_unitaire * ligne.quantite).toFixed(2)} €` : <span style={{ color: "var(--cream2)" }}>—</span>}
                              </span>
                            </td>
                            <td style={{ padding: "8px 12px", textAlign: "right" }}>
                              <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                                {ligne.notes && ligne.notes.startsWith("http") && (
                                  <a href={ligne.notes} target="_blank" rel="noopener noreferrer"
                                    style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--cream2)", color: "var(--ink)", textDecoration: "none", border: "1.5px solid var(--ink)" }}>↗</a>
                                )}
                                <button onClick={() => setModalEnvoi(ligne)} title="Envoyer vers panier commun"
                                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--cream2)", color: "var(--ink)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>→</button>
                                <button onClick={() => supprimerLigne(ligne.id)}
                                  style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, background: "var(--rouge)", color: "var(--white)", border: "1.5px solid var(--ink)", cursor: "pointer" }}>✕</button>
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div style={{ borderTop: "2.5px solid var(--ink)", padding: "12px 16px 14px", background: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p style={{ fontSize: 13, color: "var(--cream2)", fontWeight: 600 }}>
                        {lignes.length} article{lignes.length > 1 ? "s" : ""}{nbSansPrix > 0 && ` · ${nbSansPrix} sans prix`}
                      </p>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: 11, color: "var(--cream2)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Total estimé</p>
                        <p className="bc" style={{ fontSize: 28, color: "var(--yellow)", lineHeight: 1 }}>{totalEstime.toFixed(2)} €</p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modalCreate && (
        <ModalPanier defaultProfil={activeProfil ?? undefined} onClose={() => setModalCreate(false)} onSaved={handlePanierSaved} />
      )}
      {modalEdit && (
        <ModalPanier initial={modalEdit} onClose={() => setModalEdit(null)} onSaved={handlePanierSaved} />
      )}
      {modalEnvoi && panierActuel && (
        <ModalEnvoiCommun ligne={modalEnvoi} panierType={(panierActuel.type || "JdS") as PanierType}
          panierProfil={panierActuel.profil ?? null} communLignes={communLignes}
          onClose={() => setModalEnvoi(null)} onSent={handleEnvoiCommun} onUpvoted={handleUpvoteCommun} />
      )}

      {ligneCommentee && (() => {
        const ligne = lignesCommun.find(l => l.id === ligneCommentee);
        if (!ligne) return null;
        return (
          <PanneauCommentaires
            ligne={ligne}
            compteId={compte?.id ?? null}
            onFermer={() => setLigneCommentee(null)}
            onAjouter={ajouterCommentaire}
            onSupprimer={supprimerCommentaire}
          />
        );
      })()}

      {/* Modal PDF */}
      {modalWishlist && (
        <ModalWishlistSteam
          lignes={lignesWishlist}
          doublons={doublons}
          connecte={!!compte}
          onClose={() => setModalWishlist(false)}
          onSupprimer={supprimerCommunLigne}
          onVote={voterLigne}
        />
      )}
      {modalPDF && panierCommunActuel && (() => {
        const isJV = panierCommunActuel.type === "JV";
        const consolesDispos = isJV ? [...new Set(lignesCommande.map(l => l.console).filter(Boolean))] as string[] : [];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={e => e.target === e.currentTarget && setModalPDF(false)}>
            <div className="pop-card" style={{ width: 420, maxWidth: "90vw", padding: 28, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 className="bc" style={{ fontSize: 20, margin: 0 }}>Exporter en PDF</h2>
                <button onClick={() => setModalPDF(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
              </div>

              {isJV && consolesDispos.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(0,0,0,0.45)" }}>Filtrer par console</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 700, fontSize: 14 }}>
                      <input type="checkbox"
                        checked={pdfConsoles.length === 0}
                        onChange={() => setPdfConsoles([])}
                        style={{ width: 18, height: 18, cursor: "pointer" }} />
                      Toutes les consoles ({lignesCommande.length} jeux)
                    </label>
                    {consolesDispos.map(c => (
                      <label key={c} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                        <input type="checkbox"
                          checked={pdfConsoles.includes(c)}
                          onChange={() => setPdfConsoles(prev =>
                            prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]
                          )}
                          style={{ width: 18, height: 18, cursor: "pointer" }} />
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 6, background: "var(--purple)", color: "var(--cream)", fontWeight: 700, fontSize: 12 }}>{c}</span>
                        {lignesCommande.filter(l => l.console === c).length} jeux
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                <button onClick={() => setModalPDF(false)} className="pop-btn pop-btn-outline" style={{ fontSize: 14 }}>Annuler</button>
                <button onClick={() => { setModalPDF(false); exporterPDFCommun(pdfConsoles); }}
                  className="pop-btn pop-btn-outline" style={{ fontSize: 14 }}>
                  🖨️ Imprimer
                </button>
                <button onClick={() => { setModalPDF(false); telechargerPDFCommun(pdfConsoles); }}
                  className="pop-btn pop-btn-dark" style={{ fontSize: 14 }}>
                  ⬇️ Télécharger
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
