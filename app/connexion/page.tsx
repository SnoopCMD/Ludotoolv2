"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NavBar from "../../components/NavBar";
import { useCompte } from "../../components/AuthProvider";

export default function ConnexionPage() {
  const router = useRouter();
  const { compte, chargement, connexion } = useCompte();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  // Déjà connecté : rien à faire ici. Le changement de mot de passe imposé à la
  // première connexion, lui, est géré par AuthProvider, par-dessus la page.
  useEffect(() => {
    if (compte && !compte.doit_changer_mdp) router.replace("/");
  }, [compte, router]);

  const valider = async () => {
    setErreur(null);
    setEnCours(true);
    try {
      await connexion(identifiant, motDePasse);
      router.replace("/");
    } catch (e: any) {
      setErreur(e.message);
      setMotDePasse("");
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar />
      <main style={{ paddingTop: 64, display: "flex", alignItems: "flex-start", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 400, padding: "48px 16px" }}>
          <div className="pop-card" style={{ overflow: "hidden" }}>
            <div style={{ background: "var(--ink)", padding: "18px 22px" }}>
              <h1 className="bc" style={{ fontSize: 26, color: "var(--cream)", margin: 0 }}>Connexion</h1>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "4px 0 0", fontWeight: 600 }}>
                Ton compte sert à te reconnaître dans l&apos;outil.
              </p>
            </div>

            <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Identifiant</label>
                <input className="pop-input" autoFocus autoComplete="username"
                  placeholder="ton prénom" value={identifiant}
                  onChange={e => setIdentifiant(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") valider(); }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label className="bc" style={{ fontSize: 10, letterSpacing: "0.08em" }}>Mot de passe</label>
                <input className="pop-input" type="password" autoComplete="current-password"
                  value={motDePasse}
                  onChange={e => setMotDePasse(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") valider(); }} />
              </div>

              {erreur && (
                <div style={{ background: "var(--rose)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>
                  {erreur}
                </div>
              )}

              <button onClick={valider} disabled={enCours || chargement} className="pop-btn pop-btn-dark"
                style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "12px 0", opacity: enCours ? 0.6 : 1 }}>
                {enCours ? "Connexion…" : "Se connecter"}
              </button>

              <Link href="/" style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.45)", textDecoration: "underline" }}>
                Continuer sans se connecter
              </Link>
            </div>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, fontWeight: 600, color: "rgba(0,0,0,0.4)", marginTop: 16, lineHeight: 1.5 }}>
            Première connexion : mot de passe <strong>ludo92</strong>,<br />
            à remplacer juste après.
          </p>
        </div>
      </main>
    </div>
  );
}
