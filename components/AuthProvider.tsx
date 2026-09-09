"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type Compte = {
  id: string;
  equipe_id: string;
  identifiant: string;
  nom: string;
  role: string | null;
  groupe: string | null;
  doit_changer_mdp: boolean;
};

type AuthContextValue = {
  compte: Compte | null;
  chargement: boolean;
  connexion: (identifiant: string, motDePasse: string) => Promise<void>;
  deconnexion: () => Promise<void>;
  changerMotDePasse: (nouveau: string, ancien?: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Compte connecté, ou null. L'application reste entièrement utilisable hors
 * connexion : aucun écran n'est bloqué tant qu'une page ne l'exige pas
 * explicitement.
 */
export function useCompte() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useCompte doit être utilisé dans <AuthProvider>");
  return ctx;
}

async function poster(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await r.json().catch(() => ({})) as { compte?: Compte; error?: string };
  if (!r.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [compte, setCompte] = useState<Compte | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" })
      .then(r => r.json() as Promise<{ compte: Compte | null }>)
      .then(d => setCompte(d.compte ?? null))
      .catch(() => setCompte(null))
      .finally(() => setChargement(false));
  }, []);

  const connexion = useCallback(async (identifiant: string, motDePasse: string) => {
    const d = await poster("/api/auth/connexion", { identifiant, mot_de_passe: motDePasse });
    setCompte(d.compte ?? null);
  }, []);

  const deconnexion = useCallback(async () => {
    await poster("/api/auth/deconnexion");
    setCompte(null);
  }, []);

  const changerMotDePasse = useCallback(async (nouveau: string, ancien?: string) => {
    const d = await poster("/api/auth/mot-de-passe", {
      nouveau_mot_de_passe: nouveau,
      ancien_mot_de_passe: ancien,
    });
    setCompte(d.compte ?? null);
  }, []);

  return (
    <AuthContext.Provider value={{ compte, chargement, connexion, deconnexion, changerMotDePasse }}>
      {children}
      {compte?.doit_changer_mdp && <PremierMotDePasse />}
    </AuthContext.Provider>
  );
}

/**
 * Imposé après une connexion avec le mot de passe par défaut. Pas de bouton
 * pour fermer : la seule sortie est un nouveau mot de passe, ou la déconnexion.
 */
function PremierMotDePasse() {
  const { changerMotDePasse, deconnexion } = useCompte();
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const valider = async () => {
    setErreur(null);
    if (nouveau !== confirmation) { setErreur("Les deux mots de passe ne sont pas identiques."); return; }
    if (nouveau.length < 6) { setErreur("Le mot de passe doit faire au moins 6 caractères."); return; }
    setEnCours(true);
    try { await changerMotDePasse(nouveau); }
    catch (e: any) { setErreur(e.message); }
    finally { setEnCours(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 420, overflow: "hidden" }}>
        <div style={{ background: "var(--ink)", padding: "16px 22px" }}>
          <h2 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>Choisis ton mot de passe</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontWeight: 600 }}>
            Première connexion : le mot de passe par défaut doit être remplacé.
          </p>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Nouveau mot de passe</label>
            <input type="password" className="pop-input" autoFocus value={nouveau}
              onChange={e => setNouveau(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") valider(); }} />
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
            style={{ width: "100%", justifyContent: "center", fontSize: 14, padding: "11px 0", opacity: enCours ? 0.6 : 1 }}>
            {enCours ? "Enregistrement…" : "Valider"}
          </button>
          <button onClick={() => deconnexion()} className="pop-btn pop-btn-outline"
            style={{ width: "100%", justifyContent: "center", fontSize: 12 }}>
            Se déconnecter
          </button>
        </div>
      </div>
    </div>
  );
}
