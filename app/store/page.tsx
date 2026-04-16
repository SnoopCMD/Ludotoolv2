"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import type { JeuRecherche } from "../api/store/recherche/route";

// ─── Types ────────────────────────────────────────────────────────────────────

type Panier = {
  id: string;
  nom: string;
  statut: "En cours" | "Commandé" | "Reçu";
  notes: string | null;
  created_at: string;
};

type PanierLigne = {
  id: string;
  panier_id: string;
  nom: string;
  editeur: string | null;
  image_url: string | null;
  ean: string | null;
  prix_unitaire: number | null;
  quantite: number;
  notes: string | null;
};

const STATUTS: Panier["statut"][] = ["En cours", "Commandé", "Reçu"];

const STATUT_STYLES: Record<Panier["statut"], string> = {
  "En cours":  "bg-amber-100 text-amber-700",
  "Commandé":  "bg-blue-100 text-blue-700",
  "Reçu":      "bg-emerald-100 text-emerald-700",
};

// ─── Composant principal ──────────────────────────────────────────────────────

export default function StorePage() {
  const [paniers, setPaniers] = useState<Panier[]>([]);
  const [panierId, setPanierId] = useState<string | null>(null);
  const [lignes, setLignes] = useState<PanierLigne[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Nouveau panier
  const [isNouveauOpen, setIsNouveauOpen] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [isSavingPanier, setIsSavingPanier] = useState(false);

  // Recherche de jeu
  const [recherche, setRecherche] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [resultats, setResultats] = useState<JeuRecherche[]>([]);
  const [showResultats, setShowResultats] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Valeurs locales en cours d'édition (ligneId → valeur)
  const [localPrix, setLocalPrix] = useState<Record<string, string>>({});
  const [localQte, setLocalQte] = useState<Record<string, string>>({});

  // ─── Chargement ──────────────────────────────────────────────────────────────

  const chargerPaniers = async () => {
    const { data } = await supabase.from("paniers").select("*").order("created_at", { ascending: false });
    if (data) setPaniers(data as Panier[]);
    setIsLoading(false);
  };

  const chargerLignes = async (id: string) => {
    const { data } = await supabase.from("panier_lignes").select("*").eq("panier_id", id).order("created_at");
    if (data) setLignes(data as PanierLigne[]);
  };

  useEffect(() => { chargerPaniers(); }, []);

  useEffect(() => {
    if (panierId) chargerLignes(panierId);
    else setLignes([]);
  }, [panierId]);

  // Fermer dropdown recherche au clic extérieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResultats(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ─── Panier CRUD ─────────────────────────────────────────────────────────────

  const creerPanier = async () => {
    if (!nouveauNom.trim()) return;
    setIsSavingPanier(true);
    const { data } = await supabase.from("paniers").insert({ nom: nouveauNom.trim() }).select().single();
    if (data) {
      setPaniers(prev => [data as Panier, ...prev]);
      setPanierId((data as Panier).id);
    }
    setNouveauNom("");
    setIsNouveauOpen(false);
    setIsSavingPanier(false);
  };

  const changerStatut = async (id: string, statut: Panier["statut"]) => {
    await supabase.from("paniers").update({ statut }).eq("id", id);
    setPaniers(prev => prev.map(p => p.id === id ? { ...p, statut } : p));
  };

  const supprimerPanier = async (id: string) => {
    if (!confirm("Supprimer ce panier et toutes ses lignes ?")) return;
    await supabase.from("paniers").delete().eq("id", id);
    setPaniers(prev => prev.filter(p => p.id !== id));
    if (panierId === id) setPanierId(null);
  };

  // ─── Recherche de jeux ───────────────────────────────────────────────────────

  const lancerRecherche = (val: string) => {
    setRecherche(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (val.trim().length < 2) { setResultats([]); setShowResultats(false); return; }
    searchTimer.current = setTimeout(async () => {
      setIsSearching(true);
      setShowResultats(true);
      try {
        const res = await fetch(`/api/store/recherche?nom=${encodeURIComponent(val.trim())}`);
        const data = await res.json();
        setResultats(data.resultats ?? []);
      } catch {
        setResultats([]);
      } finally {
        setIsSearching(false);
      }
    }, 500);
  };

  const ajouterJeu = async (jeu: JeuRecherche) => {
    if (!panierId) return;
    const { data } = await supabase.from("panier_lignes").insert({
      panier_id: panierId,
      nom: jeu.nom,
      editeur: jeu.editeur,
      image_url: jeu.image_url,
      prix_unitaire: jeu.prix,
      quantite: 1,
      notes: jeu.url_source ?? null,
    }).select().single();
    if (data) setLignes(prev => [...prev, data as PanierLigne]);
    setRecherche("");
    setResultats([]);
    setShowResultats(false);
  };

  const ajouterJeuManuel = async () => {
    if (!panierId || !recherche.trim()) return;
    const { data } = await supabase.from("panier_lignes").insert({
      panier_id: panierId,
      nom: recherche.trim(),
      quantite: 1,
    }).select().single();
    if (data) setLignes(prev => [...prev, data as PanierLigne]);
    setRecherche("");
    setResultats([]);
    setShowResultats(false);
  };

  // ─── Lignes CRUD ─────────────────────────────────────────────────────────────

  const supprimerLigne = async (id: string) => {
    await supabase.from("panier_lignes").delete().eq("id", id);
    setLignes(prev => prev.filter(l => l.id !== id));
  };

  const sauvegarderPrix = async (id: string, valeur: string) => {
    const prix = valeur.trim() ? parseFloat(valeur.replace(",", ".")) : null;
    if (isNaN(prix as number) && prix !== null) return;
    await supabase.from("panier_lignes").update({ prix_unitaire: prix }).eq("id", id);
    setLignes(prev => prev.map(l => l.id === id ? { ...l, prix_unitaire: prix } : l));
  };

  const sauvegarderQte = async (id: string, valeur: string) => {
    const qte = Math.max(1, parseInt(valeur) || 1);
    await supabase.from("panier_lignes").update({ quantite: qte }).eq("id", id);
    setLignes(prev => prev.map(l => l.id === id ? { ...l, quantite: qte } : l));
  };

  // ─── PDF ─────────────────────────────────────────────────────────────────────

  const exporterPDF = () => {
    const panier = paniers.find(p => p.id === panierId);
    if (!panier) return;
    const total = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
    const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Devis – ${panier.nom}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 40px; color: #111; font-size: 13px; }
    h1 { font-size: 22px; font-weight: 900; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px 12px; background: #111; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e5e5; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .right { text-align: right; }
    .total-row td { font-weight: 900; font-size: 15px; border-top: 2px solid #111; padding-top: 14px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: bold; background: #f0fdf4; color: #15803d; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Devis – ${panier.nom}</h1>
  <p class="meta">Généré le ${date} · ${lignes.length} article${lignes.length > 1 ? "s" : ""} · Statut : ${panier.statut}</p>
  <table>
    <thead>
      <tr>
        <th>Jeu</th>
        <th>Éditeur</th>
        <th class="right">P.U.</th>
        <th class="right">Qté</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lignes.map(l => `
      <tr>
        <td>${l.nom}${l.notes?.startsWith("http") ? ` <a href="${l.notes}" style="color:#666;font-size:10px;" target="_blank">↗</a>` : ""}</td>
        <td>${l.editeur ?? "—"}</td>
        <td class="right">${l.prix_unitaire != null ? l.prix_unitaire.toFixed(2) + " €" : "—"}</td>
        <td class="right">${l.quantite}</td>
        <td class="right">${l.prix_unitaire != null ? (l.prix_unitaire * l.quantite).toFixed(2) + " €" : "—"}</td>
      </tr>`).join("")}
      <tr class="total-row">
        <td colspan="4">Total estimé</td>
        <td class="right">${total.toFixed(2)} €</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ─── Calculs ─────────────────────────────────────────────────────────────────

  const panierActuel = paniers.find(p => p.id === panierId) ?? null;
  const totalEstime = lignes.reduce((s, l) => s + (l.prix_unitaire ?? 0) * l.quantite, 0);
  const nbSansPrix = lignes.filter(l => l.prix_unitaire == null).length;

  // ─── Rendu ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#e5e5e5] font-sans flex flex-col p-4 sm:p-8">
      {/* Header nav */}
      <header className="flex justify-between items-center mb-6 relative w-full max-w-[96%] mx-auto shrink-0">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="absolute left-1/2 -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
          <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Accueil</Link>
          <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Inventaire</Link>
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Atelier</Link>
          <Link href="/agenda" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Agenda</Link>
          <Link href="/store" className="px-6 py-2.5 rounded-full bg-[#baff29] text-black shadow-sm">Store</Link>
        </nav>
        <div className="flex items-center gap-2">
          <a href="https://www.myludo.fr" target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-xs font-bold text-slate-700 shadow-sm transition-colors">MyLudo</a>
          <a href="https://www.espritjeu.com" target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-xs font-bold text-slate-700 shadow-sm transition-colors">Esprit Jeu</a>
          <a href="https://www.ludifolie.com" target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl bg-white/80 hover:bg-white text-xs font-bold text-slate-700 shadow-sm transition-colors">Ludifolie</a>
        </div>
      </header>

      {/* Contenu */}
      <div className="flex gap-6 w-full max-w-[96%] mx-auto flex-1">

        {/* ── Colonne gauche : liste des paniers ── */}
        <aside className="w-72 shrink-0 flex flex-col gap-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-black text-black">Paniers</h2>
            <button
              onClick={() => setIsNouveauOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-black text-white text-xl font-black hover:bg-slate-800 transition-colors"
            >+</button>
          </div>

          {isLoading ? (
            <p className="text-sm text-slate-400 font-medium">Chargement…</p>
          ) : paniers.length === 0 ? (
            <p className="text-sm text-slate-400 font-medium">Aucun panier. Crée-en un !</p>
          ) : (
            paniers.map(p => (
              <button
                key={p.id}
                onClick={() => setPanierId(p.id)}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  panierId === p.id
                    ? "border-black bg-white shadow-md"
                    : "border-transparent bg-white/60 hover:bg-white hover:border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-sm text-black leading-snug">{p.nom}</p>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${STATUT_STYLES[p.statut]}`}>
                    {p.statut}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 font-medium mt-1">
                  {new Date(p.created_at).toLocaleDateString("fr-FR")}
                </p>
              </button>
            ))
          )}
        </aside>

        {/* ── Zone principale : détail du panier ── */}
        <main className="flex-1 min-w-0">
          {!panierActuel ? (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <span className="text-5xl opacity-30">🛒</span>
              <p className="font-black text-slate-400">Sélectionne ou crée un panier</p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">

              {/* En-tête du panier */}
              <div className="bg-white rounded-3xl p-6 border border-slate-200 flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-black text-black">{panierActuel.nom}</h1>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {STATUTS.map(s => (
                      <button
                        key={s}
                        onClick={() => changerStatut(panierActuel.id, s)}
                        className={`text-xs font-black px-3 py-1 rounded-full transition-all ${
                          panierActuel.statut === s
                            ? STATUT_STYLES[s] + " ring-2 ring-offset-1 ring-current"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={exporterPDF}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 transition-colors flex items-center gap-1.5"
                  >
                    📄 PDF
                  </button>
                  <button
                    onClick={() => supprimerPanier(panierActuel.id)}
                    className="px-4 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-sm font-bold text-red-600 transition-colors"
                  >
                    Supprimer
                  </button>
                </div>
              </div>

              {/* Barre de recherche */}
              <div ref={searchRef} className="relative">
                <input
                  type="text"
                  placeholder="Rechercher un jeu à ajouter…"
                  value={recherche}
                  onChange={e => lancerRecherche(e.target.value)}
                  onFocus={() => resultats.length > 0 && setShowResultats(true)}
                  className="w-full px-5 py-4 rounded-2xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm font-medium bg-white shadow-sm transition-colors"
                />
                {recherche.trim().length >= 2 && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-black rounded-full animate-spin" />
                    ) : (
                      <button
                        onClick={ajouterJeuManuel}
                        className="text-xs font-bold text-slate-500 hover:text-black transition-colors bg-slate-100 px-2 py-1 rounded-lg"
                      >
                        + Ajouter tel quel
                      </button>
                    )}
                  </div>
                )}

                {/* Dropdown résultats */}
                {showResultats && (
                  <div className="absolute z-50 top-full mt-2 w-full bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
                    {isSearching ? (
                      <div className="p-4 text-center text-sm text-slate-400 font-medium">Recherche sur Philibert…</div>
                    ) : resultats.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-sm text-slate-400 font-medium">Aucun résultat trouvé</p>
                        <button onClick={ajouterJeuManuel} className="mt-2 text-xs font-bold text-black underline underline-offset-2">
                          Ajouter &quot;{recherche}&quot; manuellement
                        </button>
                      </div>
                    ) : (
                      <ul>
                        {resultats.map((r, i) => (
                          <li key={i}>
                            <button
                              onClick={() => ajouterJeu(r)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left border-b border-slate-100 last:border-0"
                            >
                              {r.image_url ? (
                                <img src={r.image_url} alt="" className="w-10 h-10 object-contain rounded-lg bg-slate-100 shrink-0" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-sm text-black truncate">{r.nom}</p>
                                {r.editeur && <p className="text-xs text-slate-400">{r.editeur}</p>}
                              </div>
                              {r.prix != null && (
                                <span className="text-sm font-black text-black shrink-0">{r.prix.toFixed(2)} €</span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>

              {/* Tableau des lignes */}
              {lignes.length === 0 ? (
                <div className="bg-white rounded-3xl p-10 border border-slate-200 text-center">
                  <p className="text-slate-400 font-medium text-sm">Panier vide — cherche un jeu ci-dessus pour commencer</p>
                </div>
              ) : (
                <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-100">
                        <th className="text-left px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Jeu</th>
                        <th className="text-left px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wider hidden md:table-cell">Éditeur</th>
                        <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">P.U.</th>
                        <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Qté</th>
                        <th className="text-right px-4 py-3 text-xs font-black text-slate-400 uppercase tracking-wider">Total</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map(ligne => (
                        <tr key={ligne.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors group">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {ligne.image_url ? (
                                <img src={ligne.image_url} alt="" className="w-9 h-9 object-contain rounded-lg bg-slate-100 shrink-0" />
                              ) : (
                                <div className="w-9 h-9 rounded-lg bg-slate-100 shrink-0" />
                              )}
                              <p className="font-bold text-sm text-black">{ligne.nom}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-500 hidden md:table-cell">{ligne.editeur ?? "—"}</td>

                          {/* Prix */}
                          <td className="px-4 py-2 text-right">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={localPrix[ligne.id] ?? (ligne.prix_unitaire != null ? String(ligne.prix_unitaire) : "")}
                              onChange={e => setLocalPrix(p => ({ ...p, [ligne.id]: e.target.value }))}
                              onBlur={e => sauvegarderPrix(ligne.id, e.target.value)}
                              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              placeholder="—"
                              className="w-20 text-right px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-black focus:outline-none text-sm font-bold bg-transparent focus:bg-white transition-colors placeholder:text-slate-300"
                            />
                          </td>

                          {/* Qté */}
                          <td className="px-4 py-2 text-right">
                            <input
                              type="number"
                              min={1}
                              value={localQte[ligne.id] ?? String(ligne.quantite)}
                              onChange={e => setLocalQte(q => ({ ...q, [ligne.id]: e.target.value }))}
                              onBlur={e => sauvegarderQte(ligne.id, e.target.value)}
                              onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                              className="w-14 text-right px-2 py-1 rounded-lg border border-transparent hover:border-slate-200 focus:border-black focus:outline-none text-sm font-bold bg-transparent focus:bg-white transition-colors"
                            />
                          </td>

                          {/* Total */}
                          <td className="px-4 py-2 text-right">
                            <span className="text-sm font-black text-black">
                              {ligne.prix_unitaire != null
                                ? `${(ligne.prix_unitaire * ligne.quantite).toFixed(2)} €`
                                : <span className="text-slate-300">—</span>}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-3 py-2">
                            <div className="flex gap-1 justify-end">
                              {ligne.notes && ligne.notes.startsWith("http") && (
                                <a
                                  href={ligne.notes}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 rounded-lg bg-slate-100 text-slate-400 hover:text-black opacity-0 group-hover:opacity-100 transition-all"
                                  title="Voir la fiche"
                                >↗</a>
                              )}
                              <button
                                onClick={() => supprimerLigne(ligne.id)}
                                className="text-xs font-bold px-2 py-1 rounded-lg bg-slate-100 text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                              >✕</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Total */}
                  <div className="border-t border-slate-200 px-5 py-4 flex items-center justify-between bg-slate-50/50">
                    <p className="text-xs text-slate-400 font-medium">
                      {lignes.length} article{lignes.length > 1 ? "s" : ""}
                      {nbSansPrix > 0 && ` · ${nbSansPrix} sans prix`}
                    </p>
                    <div className="text-right">
                      <p className="text-xs text-slate-400 font-medium uppercase tracking-widest">Total estimé</p>
                      <p className="text-2xl font-black text-black">{totalEstime.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Modal nouveau panier ── */}
      {isNouveauOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-xl font-black text-black mb-5">Nouveau panier</h2>
            <input
              autoFocus
              type="text"
              placeholder="Nom du panier…"
              value={nouveauNom}
              onChange={e => setNouveauNom(e.target.value)}
              onKeyDown={e => e.key === "Enter" && creerPanier()}
              className="w-full px-4 py-3 rounded-2xl border-2 border-slate-200 focus:border-black focus:outline-none text-sm font-medium transition-colors mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setIsNouveauOpen(false); setNouveauNom(""); }}
                className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
              >Annuler</button>
              <button
                onClick={creerPanier}
                disabled={!nouveauNom.trim() || isSavingPanier}
                className="flex-1 px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-40 transition-colors"
              >Créer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
