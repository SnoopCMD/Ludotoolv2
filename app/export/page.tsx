"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogueEntry = {
  ean: string;
  nom: string;
  auteurs?: string;
  editeur?: string;
  description?: string;
  contenu?: string;
  couleur?: string;
  mecanique?: string;
  nb_de_joueurs?: string;
  temps_de_jeu?: string;
  etoiles?: string;
  coop_versus?: string;
  image_url?: string;
};

// ─── Correspondances WIKILUDO ─────────────────────────────────────────────────

function parseJoueurs(str?: string): { min: number; max: number } | null {
  if (!str) return null;
  const range = str.match(/(\d+)\s*[-–àa]\s*(\d+)/);
  if (range) return { min: parseInt(range[1]), max: parseInt(range[2]) };
  const single = str.match(/(\d+)/);
  if (single) { const n = parseInt(single[1]); return { min: n, max: n }; }
  return null;
}

function minJoueursCode(min: number): string {
  if (min === 1) return "AP1";
  if (min === 2) return "AP2";
  if (min >= 3 && min <= 8) return `AP${min}`;
  return "AP8";
}

function maxJoueursCode(max: number): string {
  if (max <= 1) return "JQ2";
  if (max <= 13) return `JQ${max}`;
  return "JQ13";
}

function tempsCode(str?: string): string | null {
  if (!str) return null;
  let mins = 0;
  const hMatch = str.match(/(\d+)\s*[hH]/);
  const mMatch = str.match(/(\d+)\s*[mM]/);
  if (hMatch) mins += parseInt(hMatch[1]) * 60;
  if (mMatch) mins += parseInt(mMatch[1]);
  if (!mins) {
    const raw = str.match(/^(\d+)$/);
    if (raw) mins = parseInt(raw[1]);
  }
  if (!mins) return null;
  if (mins <= 7) return "5M";
  if (mins <= 15) return "10M";
  if (mins <= 25) return "20M";
  if (mins <= 37) return "30M";
  if (mins <= 52) return "45M";
  if (mins <= 90) return "1H";
  if (mins <= 180) return "2H";
  return "4H";
}

// Couleur + étoiles → code âge WIKILUDO ($b)
const AGE_MAP: Record<string, Record<number, string>> = {
  vert:  { 1: "2A",  2: "3A",  3: "5A"  },
  rose:  { 1: "6A",  2: "7A"              },
  bleu:  { 1: "8A",  2: "10A"             },
  rouge: { 1: "12A", 2: "14A"             },
};

function ageCode(couleur?: string, etoiles?: string): string | null {
  const c = couleur?.toLowerCase().trim();
  const e = parseInt(etoiles || "1") || 1;
  return AGE_MAP[c ?? ""]?.[e] ?? null;
}

// Couleur + étoiles → code niveau WIKILUDO ($e)
// rose → Jaune (le Jaune WIKILUDO = rose Ludotool)
const NIVEAU_COULEUR: Record<string, string> = {
  vert:  "Vert",
  rose:  "Jaune",
  bleu:  "Bleu",
  rouge: "Rouge",
};

function niveauCode(couleur?: string, etoiles?: string): string | null {
  const c = couleur?.toLowerCase().trim();
  const wikiludo = NIVEAU_COULEUR[c ?? ""];
  if (!wikiludo) return null;
  const e = parseInt(etoiles || "1") || 1;
  return `${wikiludo} ${e}`;
}

// ─── Constructeur ISO2709 ─────────────────────────────────────────────────────

type SubfieldEntry = { code: string; value: string };
type UnimarcField = { tag: string; ind1: string; ind2: string; subfields: SubfieldEntry[] };

function makeField(tag: string, ind1: string, ind2: string, subfields: SubfieldEntry[]): UnimarcField {
  return { tag, ind1, ind2, subfields };
}

function buildISO2709Record(fields: UnimarcField[]): Uint8Array {
  const enc = new TextEncoder(); // UTF-8

  // Trier les champs par tag numérique
  const sorted = [...fields].sort((a, b) => parseInt(a.tag) - parseInt(b.tag));

  const encodedFields: { tag: string; bytes: Uint8Array }[] = sorted.map(f => {
    const tagNum = parseInt(f.tag, 10);
    let data: string;
    if (tagNum >= 1 && tagNum <= 9) {
      // Champ de contrôle : données brutes + terminateur
      data = f.subfields.map(sf => sf.value).join("") + "\x1E";
    } else {
      // Champ variable : indicateurs + sous-champs + terminateur
      data = f.ind1 + f.ind2;
      for (const sf of f.subfields) data += "\x1F" + sf.code + sf.value;
      data += "\x1E";
    }
    return { tag: f.tag, bytes: enc.encode(data) };
  });

  // Répertoire (12 octets par entrée)
  let offset = 0;
  let directory = "";
  for (const ef of encodedFields) {
    directory +=
      ef.tag.padStart(3, "0") +
      String(ef.bytes.length).padStart(4, "0") +
      String(offset).padStart(5, "0");
    offset += ef.bytes.length;
  }
  directory += "\x1E"; // terminateur de répertoire

  const dirBytes = enc.encode(directory);
  const baseAddress = 24 + dirBytes.length;
  const totalLength = baseAddress + offset + 1; // +1 pour terminateur d'enregistrement

  // En-tête (Leader, 24 octets)
  const leader =
    String(totalLength).padStart(5, "0") + // 0-4: longueur totale
    "n" +                                   // 5: statut (nouveau)
    "r" +                                   // 6: type (artefact 3D = jeu)
    "m" +                                   // 7: niveau bibliographique (monographie)
    " " +                                   // 8: type de contrôle
    "a" +                                   // 9: encodage (a = Unicode/UTF-8)
    "22" +                                  // 10-11: nb indicateurs / nb codes sous-champ
    String(baseAddress).padStart(5, "0") +  // 12-16: adresse de base des données
    " " +                                   // 17: niveau de codage
    " " +                                   // 18: forme de catalogage
    " " +                                   // 19: niveau notice multi-parties
    "4500";                                 // 20-23: longueurs dans le répertoire

  const leaderBytes = enc.encode(leader);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  result.set(leaderBytes, pos); pos += leaderBytes.length;
  result.set(dirBytes, pos); pos += dirBytes.length;
  for (const ef of encodedFields) { result.set(ef.bytes, pos); pos += ef.bytes.length; }
  result[pos] = 0x1D; // terminateur d'enregistrement

  return result;
}

// Construit le champ 100 $a (36 caractères : date + codes)
function buildField100a(pubYear?: number): string {
  const today = new Date();
  const dateEntry =
    String(today.getFullYear()) +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const year = pubYear ? String(pubYear).padEnd(4) : "    ";
  // Structure 36 chars :
  // 0-7 : date entrée (8), 8 : type date (1), 9-12 : date1 (4), 13-16 : date2 (4),
  // 17-19 : audience (3), 20-21 : pub gouv (2), 22-24 : conférence (3),
  // 25-26 : notice modifiée (2), 27-29 : langue catalogage (3), 30-35 : jeu de car. (6)
  return (
    dateEntry +   // 0-7
    "a" +         // 8
    year.slice(0, 4) + // 9-12
    "    " +      // 13-16
    "   " +       // 17-19
    "  " +        // 20-21
    "   " +       // 22-24
    "  " +        // 25-26
    "fre" +       // 27-29
    "50    "      // 30-35
  );
}

// Construit une notice UNIMARC complète pour un jeu
function buildRecord(game: CatalogueEntry): Uint8Array {
  const fields: UnimarcField[] = [];

  // 001 : Identifiant d'enregistrement (obligatoire pour l'import Syracuse)
  // On utilise l'EAN comme identifiant unique de la notice
  fields.push(makeField("001", " ", " ", [{ code: "", value: game.ean }]));

  // 073 : EAN (International Article Number)
  if (game.ean) {
    fields.push(makeField("073", " ", " ", [{ code: "a", value: game.ean }]));
  }

  // 100 : Données de traitement général
  fields.push(makeField("100", " ", " ", [{ code: "a", value: buildField100a() }]));

  // 200 : Titre (sans mention de responsabilité — auteurs gérés manuellement dans Syracuse)
  fields.push(makeField("200", "1", " ", [{ code: "a", value: game.nom }]));

  // 210 : Publication, distribution, etc.
  const sf210: SubfieldEntry[] = [];
  if (game.editeur) sf210.push({ code: "c", value: game.editeur });
  sf210.push({ code: "d", value: String(new Date().getFullYear()) });
  fields.push(makeField("210", " ", " ", sf210));

  // 215 : Description physique — contenu de la boîte
  const contenu215 = game.contenu?.trim()
    ? "1 boîte de jeu : " + game.contenu.trim()
    : "1 boîte de jeu";
  fields.push(makeField("215", " ", " ", [{ code: "a", value: contenu215 }]));

  // 330 : Résumé
  if (game.description?.trim()) {
    fields.push(makeField("330", " ", " ", [{ code: "a", value: game.description.trim() }]));
  }

  // 694 : Champ déclencheur type notice "JEUS" (Jeux de société) dans Syracuse
  fields.push(makeField("694", " ", " ", [{ code: "a", value: "Jeux de société" }]));

  // 801 : Source de catalogage
  fields.push(makeField("801", " ", "0", [{ code: "b", value: "Médiathèque de Châtillon" }]));

  // 856 : Vignette (URL image)
  if (game.image_url?.trim()) {
    fields.push(makeField("856", " ", " ", [
      { code: "u", value: game.image_url.trim() },
      { code: "x", value: "vignette" },
    ]));
  }

  // 941 : Données WIKILUDO
  const sf941: SubfieldEntry[] = [];

  const joueurs = parseJoueurs(game.nb_de_joueurs);
  if (joueurs) {
    sf941.push({ code: "a", value: minJoueursCode(joueurs.min) }); // nb joueurs min
    sf941.push({ code: "f", value: maxJoueursCode(joueurs.max) }); // nb joueurs max
  }

  const age = ageCode(game.couleur, game.etoiles);
  if (age) sf941.push({ code: "b", value: age });

  const temps = tempsCode(game.temps_de_jeu);
  if (temps) sf941.push({ code: "d", value: temps });

  if (game.mecanique?.trim()) sf941.push({ code: "c", value: game.mecanique.trim() });

  const niveau = niveauCode(game.couleur, game.etoiles);
  if (niveau) sf941.push({ code: "e", value: niveau });

  if (sf941.length > 0) {
    fields.push(makeField("941", " ", " ", sf941));
  }

  return buildISO2709Record(fields);
}

// Assemble plusieurs notices en un fichier .mrc
function buildMrcFile(games: CatalogueEntry[]): Blob {
  const parts: Uint8Array[] = games.map(buildRecord);
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) { result.set(p, offset); offset += p.length; }
  return new Blob([result], { type: "application/octet-stream" });
}

// ─── Helpers UI ──────────────────────────────────────────────────────────────

function completenessScore(g: CatalogueEntry): number {
  let score = 0;
  if (g.nom) score++;
  if (g.ean) score++;
  if (g.editeur) score++;
  if (g.description) score++;
  if (g.auteurs) score++;
  if (g.couleur) score++;
  if (g.nb_de_joueurs) score++;
  if (g.temps_de_jeu) score++;
  if (g.mecanique) score++;
  if (g.image_url) score++;
  return score; // sur 10
}

function CompletenessBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-400">{score}/10</span>
    </div>
  );
}

const normalizeStr = (str: string) =>
  str?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") ?? "";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ExportPage() {
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [filterComplet, setFilterComplet] = useState(false);

  useEffect(() => {
    loadCatalogue();
  }, []);

  const loadCatalogue = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("catalogue")
      .select("ean, nom, auteurs, editeur, description, contenu, couleur, mecanique, nb_de_joueurs, temps_de_jeu, etoiles, coop_versus, image_url")
      .order("nom");
    if (data) setCatalogue(data as CatalogueEntry[]);
    setIsLoading(false);
  };

  const filtered = useMemo(() => {
    const q = normalizeStr(recherche);
    return catalogue.filter(g => {
      if (q && !normalizeStr(g.nom).includes(q) && !normalizeStr(g.editeur ?? "").includes(q)) return false;
      if (filterComplet && completenessScore(g) < 7) return false;
      return true;
    });
  }, [catalogue, recherche, filterComplet]);

  const toggleSelect = (ean: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(ean)) next.delete(ean);
      else next.add(ean);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(g => g.ean)));
  const deselectAll = () => setSelected(new Set());

  const selectedGames = useMemo(
    () => catalogue.filter(g => selected.has(g.ean)),
    [catalogue, selected]
  );

  const exportMrc = async () => {
    if (selectedGames.length === 0) return;
    setIsExporting(true);
    try {
      const blob = buildMrcFile(selectedGames);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.download = `notices_syracuse_${date}.mrc`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  const avgScore = useMemo(() => {
    if (!selectedGames.length) return 0;
    return Math.round(selectedGames.reduce((s, g) => s + completenessScore(g), 0) / selectedGames.length * 10) / 10;
  }, [selectedGames]);

  return (
    <div className="min-h-screen bg-[#e5e5e5] flex flex-col items-center p-4 sm:p-8 gap-6">
      <style>{`
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 999px; }
      `}</style>

      {/* ── Navigation ── */}
      <header className="flex justify-between items-center w-full max-w-[96%] mx-auto shrink-0 relative">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <nav className="absolute left-1/2 -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
          <Link href="/" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Accueil</Link>
          <Link href="/inventaire" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Inventaire</Link>
          <Link href="/atelier" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Atelier</Link>
          <Link href="/agenda" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Agenda</Link>
          <Link href="/store" className="px-6 py-2.5 rounded-full hover:bg-white/10 transition">Store</Link>
          <Link href="/export" className="px-6 py-2.5 rounded-full bg-[#baff29] text-black shadow-sm">Export</Link>
        </nav>
        <div className="w-10" />
      </header>

      {/* ── Contenu principal ── */}
      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">

        {/* Titre */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-black text-black">Export notices Syracuse</h1>
            <p className="text-slate-400 font-medium mt-1">
              Génère un fichier .mrc au format ISO2709 / UNIMARC compatible WIKILUDO
            </p>
          </div>

          {/* Bouton export */}
          <button
            onClick={exportMrc}
            disabled={selected.size === 0 || isExporting}
            className="flex items-center gap-2 px-6 py-3.5 bg-black text-white rounded-2xl font-bold text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {isExporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Génération…
              </>
            ) : (
              <>
                ⬇ Exporter {selected.size > 0 ? `(${selected.size})` : ""} notices
              </>
            )}
          </button>
        </div>

        {/* Résumé sélection */}
        {selected.size > 0 && (
          <div className="flex items-center gap-4 px-5 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl flex-wrap">
            <span className="text-sm font-bold text-black">
              {selected.size} notice{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-sm font-medium text-slate-500">
              Complétude moyenne : <span className={`font-bold ${avgScore >= 8 ? "text-emerald-600" : avgScore >= 5 ? "text-amber-600" : "text-rose-500"}`}>{avgScore}/10</span>
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={deselectAll}
                className="text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
              >
                Tout désélectionner
              </button>
            </div>
          </div>
        )}

        {/* Filtres */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <input
              type="text"
              value={recherche}
              onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher un jeu ou éditeur…"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-2.5 pl-10 font-medium text-sm outline-none focus:border-black transition-colors"
            />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          </div>

          <button
            onClick={() => setFilterComplet(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border-2 transition-colors ${
              filterComplet ? "bg-black text-white border-black" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            Notices complètes (≥ 7/10)
          </button>

          <div className="flex items-center gap-2 text-sm text-slate-400 font-medium ml-auto">
            <span>{filtered.length} jeu{filtered.length > 1 ? "x" : ""}</span>
            <span className="text-slate-200">·</span>
            <button
              onClick={selectAll}
              className="font-bold text-slate-600 hover:text-black transition-colors"
            >
              Tout sélectionner
            </button>
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-black rounded-full animate-spin" />
            <p className="text-slate-400 font-medium text-sm">Chargement du catalogue…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <span className="text-3xl">🔍</span>
            <p className="font-bold text-slate-400">Aucun jeu trouvé</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto custom-scroll" style={{ maxHeight: "calc(100vh - 380px)" }}>
            {filtered.map(game => {
              const isSelected = selected.has(game.ean);
              const score = completenessScore(game);
              const joueurs = parseJoueurs(game.nb_de_joueurs);
              const temps = tempsCode(game.temps_de_jeu);
              const age = ageCode(game.couleur, game.etoiles);
              const niveau = niveauCode(game.couleur, game.etoiles);

              return (
                <div
                  key={game.ean}
                  onClick={() => toggleSelect(game.ean)}
                  className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-black bg-slate-50"
                      : "border-slate-100 hover:border-slate-300 bg-white"
                  }`}
                >
                  {/* Checkbox */}
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                    isSelected ? "bg-black border-black" : "border-slate-300"
                  }`}>
                    {isSelected && <span className="text-white text-xs font-black">✓</span>}
                  </div>

                  {/* Image */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                    {game.image_url
                      ? <img src={game.image_url} alt={game.nom} className="w-full h-full object-cover" loading="lazy" />
                      : <span className="text-slate-300 text-lg">🎲</span>
                    }
                  </div>

                  {/* Infos principales */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-black truncate">{game.nom}</span>
                      {game.editeur && (
                        <span className="text-xs text-slate-400 font-medium shrink-0">{game.editeur}</span>
                      )}
                    </div>
                    <CompletenessBar score={score} />
                  </div>

                  {/* Aperçu des champs WIKILUDO */}
                  <div className="hidden lg:flex items-center gap-1.5 flex-wrap justify-end max-w-[320px]">
                    {joueurs && (
                      <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">
                        {minJoueursCode(joueurs.min)}–{maxJoueursCode(joueurs.max)}
                      </span>
                    )}
                    {age && (
                      <span className="text-[10px] font-bold bg-amber-50 text-amber-600 px-2 py-0.5 rounded-lg">
                        {age}
                      </span>
                    )}
                    {temps && (
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-lg">
                        {temps}
                      </span>
                    )}
                    {niveau && (
                      <span className="text-[10px] font-bold bg-purple-50 text-purple-600 px-2 py-0.5 rounded-lg">
                        {niveau}
                      </span>
                    )}
                    {game.mecanique && (
                      <span className="text-[10px] font-bold bg-slate-50 text-slate-500 px-2 py-0.5 rounded-lg truncate max-w-[100px]">
                        {game.mecanique}
                      </span>
                    )}
                  </div>

                  {/* EAN */}
                  <span className="text-[10px] font-mono text-slate-300 shrink-0 hidden xl:block">
                    {game.ean}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Légende des champs 941 */}
        <div className="pt-4 border-t border-slate-100 flex flex-col gap-3">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Champs WIKILUDO générés (941)</p>
          <div className="flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="bg-blue-50 text-blue-600 font-bold px-2 py-1 rounded-lg">$a/$f Nb joueurs (AP1–AP8 / JQ2–JQ13)</span>
            <span className="bg-amber-50 text-amber-600 font-bold px-2 py-1 rounded-lg">$b Âge (2A–14A depuis couleur+étoiles)</span>
            <span className="bg-emerald-50 text-emerald-600 font-bold px-2 py-1 rounded-lg">$d Temps (5M–4H)</span>
            <span className="bg-purple-50 text-purple-600 font-bold px-2 py-1 rounded-lg">$e Niveau (Vert/Jaune/Bleu/Rouge + étoiles)</span>
            <span className="bg-slate-50 text-slate-500 font-bold px-2 py-1 rounded-lg">$c Mécanique</span>
          </div>
          <p className="text-xs text-slate-400">
            Le fichier .mrc généré contient également : <strong>073</strong> EAN · <strong>100</strong> Données générales · <strong>200</strong> Titre + auteurs · <strong>210</strong> Éditeur · <strong>215</strong> Description physique · <strong>330</strong> Résumé · <strong>801</strong> Source catalogage · <strong>856</strong> Vignette URL
          </p>
        </div>
      </main>
    </div>
  );
}
