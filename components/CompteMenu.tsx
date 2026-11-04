"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useCompte } from "./AuthProvider";
import { COULEURS_PROFIL, couleurParDefaut } from "../lib/couleurProfil";

/** Bouton de compte de la barre de navigation : connexion, ou menu du profil. */
export default function CompteMenu() {
  const { compte, chargement, deconnexion, changerCouleur } = useCompte();
  const [ouvert, setOuvert] = useState(false);
  const [erreurCouleur, setErreurCouleur] = useState<string | null>(null);
  const choisirCouleur = async (c: string | null) => {
    setErreurCouleur(null);
    try { await changerCouleur(c); } catch (e: any) { setErreurCouleur(e.message); }
  };
  const [showMdp, setShowMdp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const clic = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", clic);
    return () => document.removeEventListener("mousedown", clic);
  }, [ouvert]);

  // Tant que la session n'est pas connue, on n'affiche rien : évite de faire
  // clignoter « Se connecter » sur chaque chargement de page.
  if (chargement) return <div style={{ width: 96, flexShrink: 0 }} />;

  if (!compte) {
    return (
      <Link href="/connexion" style={{
        marginLeft: 10, flexShrink: 0, textDecoration: "none",
        background: "rgba(0,0,0,0.04)", color: "rgba(0,0,0,0.52)",
        border: "2px solid transparent", borderRadius: 6, padding: "5px 12px",
        fontWeight: 600, fontSize: 13, whiteSpace: "nowrap",
      }}>
        Se connecter
      </Link>
    );
  }

  return (
    <div ref={ref} style={{ position: "relative", marginLeft: 10, flexShrink: 0 }}>
      <button onClick={() => setOuvert(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: 7, cursor: "pointer",
        background: "var(--ink)", color: "var(--cream)", border: "2px solid var(--ink)",
        borderRadius: 6, padding: "4px 10px 4px 5px", fontFamily: "inherit",
        fontWeight: 700, fontSize: 13, boxShadow: "2px 2px 0 rgba(0,0,0,0.25)",
      }}>
        <span className="bc" style={{
          width: 22, height: 22, borderRadius: "50%", background: compte.couleur ?? couleurParDefaut(compte.groupe),
          color: "var(--ink)", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, flexShrink: 0,
        }}>
          {compte.nom.trim()[0].toUpperCase()}
        </span>
        {/* Sur téléphone la place est comptée : l'initiale suffit à identifier
            le compte, le nom complet reste dans le menu déroulant. */}
        <span className="desktop-only">{compte.nom}</span>
      </button>

      {ouvert && (
        <div className="pop-card" style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, width: 230,
          padding: 8, zIndex: 120, display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ padding: "6px 8px 8px", borderBottom: "1.5px solid rgba(0,0,0,0.08)", marginBottom: 2 }}>
            <div className="bc" style={{ fontSize: 15 }}>{compte.nom}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "rgba(0,0,0,0.45)" }}>
              {compte.role || "Compte"}
            </div>
          </div>
          {/* Couleur de profil : avatars et initiales partout (agenda, Bureau, accueil, Store…) */}
          <div style={{ padding: "4px 8px 8px", borderBottom: "1.5px solid rgba(0,0,0,0.08)", marginBottom: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.07em", color: "rgba(0,0,0,0.45)", marginBottom: 6 }}>Ma couleur</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
              {COULEURS_PROFIL.map(c => {
                const actif = (compte.couleur ?? "").toLowerCase() === c;
                return (
                  <button key={c} onClick={() => choisirCouleur(c)} title={c} aria-label={`Couleur ${c}`}
                    style={{
                      width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", padding: 0,
                      border: actif ? "3px solid var(--ink)" : "2px solid var(--ink)",
                      boxShadow: actif ? "2px 2px 0 var(--ink)" : "none", fontSize: 11, fontWeight: 900,
                    }}>{actif ? "✓" : ""}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
              <label title="Autre couleur" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                <input type="color" value={compte.couleur ?? couleurParDefaut(compte.groupe)}
                  onChange={e => choisirCouleur(e.target.value)}
                  style={{ width: 28, height: 24, border: "2px solid var(--ink)", borderRadius: 6, padding: 1, background: "var(--white)", cursor: "pointer" }} />
                Autre…
              </label>
              {compte.couleur && (
                <button onClick={() => choisirCouleur(null)}
                  style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "rgba(0,0,0,0.5)", fontFamily: "inherit" }}>
                  Par défaut
                </button>
              )}
            </div>
            {erreurCouleur && <div style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", marginTop: 4 }}>{erreurCouleur}</div>}
          </div>
          <button onClick={() => { setShowMdp(true); setOuvert(false); }}
            className="pop-btn pop-btn-outline" style={{ justifyContent: "flex-start", fontSize: 12, padding: "7px 10px" }}>
            Changer mon mot de passe
          </button>
          <button onClick={() => { setOuvert(false); deconnexion(); }}
            className="pop-btn pop-btn-outline" style={{ justifyContent: "flex-start", fontSize: 12, padding: "7px 10px" }}>
            Se déconnecter
          </button>
        </div>
      )}

      {showMdp && <ChangerMotDePasse onFermer={() => setShowMdp(false)} />}
    </div>
  );
}

function ChangerMotDePasse({ onFermer }: { onFermer: () => void }) {
  const { changerMotDePasse } = useCompte();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(false);

  const valider = async () => {
    setErreur(null);
    if (nouveau !== confirmation) { setErreur("Les deux mots de passe ne sont pas identiques."); return; }
    setEnCours(true);
    try {
      await changerMotDePasse(nouveau, ancien);
      setFait(true);
      setTimeout(onFermer, 1200);
    } catch (e: any) { setErreur(e.message); }
    finally { setEnCours(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 400, overflow: "hidden" }}>
        <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="bc" style={{ fontSize: 18, color: "var(--cream)", margin: 0 }}>Changer mon mot de passe</h2>
          <button onClick={onFermer} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--cream)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, textAlign: "left" }}>
          {fait ? (
            <div className="bc" style={{ background: "var(--vert)", border: "2.5px solid var(--ink)", borderRadius: 8, padding: "10px 14px", fontSize: 14, boxShadow: "3px 3px 0 var(--ink)" }}>
              Mot de passe modifié ✓
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Mot de passe actuel</label>
                <input type="password" className="pop-input" autoFocus value={ancien} onChange={e => setAncien(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Nouveau mot de passe</label>
                <input type="password" className="pop-input" value={nouveau} onChange={e => setNouveau(e.target.value)} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Confirmation</label>
                <input type="password" className="pop-input" value={confirmation}
                  onChange={e => setConfirmation(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") valider(); }} />
              </div>
              {erreur && (
                <div style={{ background: "var(--rose)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
                  {erreur}
                </div>
              )}
              <button onClick={valider} disabled={enCours} className="pop-btn pop-btn-dark"
                style={{ width: "100%", justifyContent: "center", fontSize: 13, padding: "10px 0", opacity: enCours ? 0.6 : 1 }}>
                {enCours ? "Enregistrement…" : "Valider"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
