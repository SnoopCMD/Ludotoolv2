"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Link from "next/link";
import NavBar from "../../components/NavBar";

// ─── Types ────────────────────────────────────────────────────────────────────

type Role = "auteur" | "illustrateur" | "scenariste";

type JeuCopie = {
  ean: string;
  code_syracuse: string | null;
};

type AuteurStructure = {
  prenom: string;
  nom: string;
  role: Role;
};

type CatalogueEntry = {
  ean: string;
  nom: string;
  auteurs?: string;
  auteurs_json?: string;
  editeur?: string;
  description?: string;
  resume?: string;
  contenu?: string;
  boite_format?: string;
  couleur?: string;
  mecanique?: string;
  nb_de_joueurs?: string;
  temps_de_jeu?: string;
  etoiles?: string;
  coop_versus?: string;
  image_url?: string;
};

// ─── Constantes ───────────────────────────────────────────────────────────────

const ROLES: { value: Role; label: string; code: string }[] = [
  { value: "auteur",       label: "Auteur",       code: "070" },
  { value: "illustrateur", label: "Illustrateur", code: "440" },
  { value: "scenariste",   label: "Scénariste",   code: "275" },
];

const FORMATS_BOITE = ["XS", "S", "M", "L", "XL"];

const WIKILUDO_TEMPS = ["4H", "2H", "1H", "45M", "30M", "20M", "10M", "5M"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const normalizeStr = (s: string) =>
  s?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "") ?? "";

function parseAuteurs(json?: string): AuteurStructure[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function completenessScore(g: CatalogueEntry): number {
  let s = 0;
  if (g.nom) s++; if (g.ean) s++; if (g.editeur) s++;
  if (g.description || g.resume) s++;
  if (g.auteurs_json && parseAuteurs(g.auteurs_json).length > 0) s++;
  if (g.couleur) s++; if (g.nb_de_joueurs) s++;
  if (g.temps_de_jeu) s++; if (g.mecanique) s++; if (g.image_url) s++;
  return s;
}

function parseJoueurs(str?: string) {
  if (!str) return null;
  const r = str.match(/(\d+)\s*[-–àa]\s*(\d+)/);
  if (r) return { min: parseInt(r[1]), max: parseInt(r[2]) };
  const s = str.match(/(\d+)/);
  if (s) { const n = parseInt(s[1]); return { min: n, max: n }; }
  return null;
}
function tempsCode(str?: string): string | null {
  if (!str) return null;
  for (const c of WIKILUDO_TEMPS) if (str.startsWith(c)) return c;
  let m = 0;
  const h = str.match(/(\d+)\s*[hH]/);
  if (h) { m += parseInt(h[1]) * 60; const r = str.slice(str.indexOf(h[0]) + h[0].length); const mh = r.match(/^\s*(\d+)/); if (mh) m += parseInt(mh[1]); }
  if (!h) { const mm = str.match(/(\d+)\s*[mM]/); if (mm) m += parseInt(mm[1]); }
  if (!m) { const n = str.match(/(\d+)/); if (n) m = parseInt(n[1]); }
  if (!m) return null;
  if (m <= 7) return "5M"; if (m <= 15) return "10M"; if (m <= 25) return "20M";
  if (m <= 37) return "30M"; if (m <= 52) return "45M"; if (m <= 90) return "1H";
  if (m <= 180) return "2H"; return "4H";
}

const COULEUR_CODE: Record<string, string> = {
  vert: "VR", rose: "RS", bleu: "BL", rouge: "RG", jaune: "JN",
};

const AGE_MAP: Record<string, Record<number, string>> = {
  vert: {1:"2A",2:"3A",3:"5A"}, rose: {1:"6A",2:"7A"},
  bleu: {1:"8A",2:"10A"}, rouge: {1:"12A",2:"14A"},
};
const NIVEAU_COULEUR: Record<string, string> = { vert:"Vert", rose:"Jaune", bleu:"Bleu", rouge:"Rouge" };
function ageCode(c?: string, e?: string) { return AGE_MAP[c?.toLowerCase()??'']?.[parseInt(e||'1')||1] ?? null; }
function niveauCode(c?: string, e?: string) { const w = NIVEAU_COULEUR[c?.toLowerCase()??'']; return w ? `${w} ${parseInt(e||'1')||1}` : null; }
function minJoueursCode(n: number) { return n <= 8 ? `AP${n}` : "AP8"; }
function maxJoueursCode(n: number) { return n <= 13 ? `JQ${n}` : "JQ13"; }

// ─── ISO2709 builder (identique à /export) ───────────────────────────────────

type SubfieldEntry = { code: string; value: string };
type UnimarcField = { tag: string; ind1: string; ind2: string; subfields: SubfieldEntry[] };
const makeField = (tag: string, ind1: string, ind2: string, subfields: SubfieldEntry[]): UnimarcField => ({ tag, ind1, ind2, subfields });

function buildISO2709Record(fields: UnimarcField[]): Uint8Array {
  const enc = new TextEncoder();
  const sorted = [...fields].sort((a, b) => parseInt(a.tag) - parseInt(b.tag));
  const ef = sorted.map(f => {
    const n = parseInt(f.tag, 10);
    let data = n >= 1 && n <= 9
      ? f.subfields.map(s => s.value).join("") + "\x1E"
      : f.ind1 + f.ind2 + f.subfields.map(s => "\x1F" + s.code + s.value).join("") + "\x1E";
    return { tag: f.tag, bytes: enc.encode(data) };
  });
  let offset = 0, dir = "";
  for (const e of ef) { dir += e.tag.padStart(3,"0") + String(e.bytes.length).padStart(4,"0") + String(offset).padStart(5,"0"); offset += e.bytes.length; }
  dir += "\x1E";
  const db = enc.encode(dir), base = 24 + db.length, total = base + offset + 1;
  const leader = String(total).padStart(5,"0") + "nam a22" + String(base).padStart(5,"0") + "   4500";
  const res = new Uint8Array(total);
  let pos = 0;
  res.set(enc.encode(leader), pos); pos += 24;
  res.set(db, pos); pos += db.length;
  for (const e of ef) { res.set(e.bytes, pos); pos += e.bytes.length; }
  res[pos] = 0x1D;
  return res;
}

function buildField100a(): string {
  const t = new Date();
  const d = String(t.getFullYear()) + String(t.getMonth()+1).padStart(2,"0") + String(t.getDate()).padStart(2,"0");
  return d + "a" + "    " + "    " + "   " + "  " + "   " + "  " + "fre" + "50    ";
}

function buildRecord(game: CatalogueEntry, copies: JeuCopie[] = []): Uint8Array {
  const fields: UnimarcField[] = [];
  if (process.env.NODE_ENV !== "production") {
    console.log(`[buildRecord] ${game.nom} | boite_format=${game.boite_format ?? "–"} | copies=${copies.length}`, copies.map(c => c.code_syracuse));
  }

  fields.push(makeField("001", " ", " ", [{ code: "", value: game.ean }]));
  if (game.ean) fields.push(makeField("073", " ", " ", [{ code: "a", value: game.ean }]));
  fields.push(makeField("100", " ", " ", [{ code: "a", value: buildField100a() }]));
  fields.push(makeField("200", "1", " ", [{ code: "a", value: game.nom }]));

  const sf210: SubfieldEntry[] = [];
  if (game.editeur) sf210.push({ code: "c", value: game.editeur });
  sf210.push({ code: "d", value: String(new Date().getFullYear()) });
  fields.push(makeField("210", " ", " ", sf210));

  const sf215: SubfieldEntry[] = [{ code: "a", value: game.contenu?.trim() || "1 boîte de jeu" }];
  if (game.boite_format) sf215.push({ code: "d", value: `Format ${game.boite_format}` });
  fields.push(makeField("215", " ", " ", sf215));

  const desc = game.description?.trim() || game.resume?.trim();
  if (desc) fields.push(makeField("330", " ", " ", [{ code: "a", value: desc }]));

  // 694 → type JEUS
  fields.push(makeField("694", " ", " ", [{ code: "a", value: "Jeux de société" }]));

  // 700/701/702 : auteurs structurés
  const auteurs = parseAuteurs(game.auteurs_json);
  let auteurIdx = 0;
  for (const a of auteurs) {
    const roleInfo = ROLES.find(r => r.value === a.role);
    const code = roleInfo?.code ?? "070";
    let tag: string;
    if (a.role === "auteur") { tag = auteurIdx === 0 ? "700" : "701"; auteurIdx++; }
    else { tag = "702"; }
    fields.push(makeField(tag, "1", " ", [
      { code: "a", value: a.nom.toUpperCase() },
      { code: "b", value: a.prenom },
      { code: "4", value: code },
    ]));
  }

  fields.push(makeField("801", " ", "0", [{ code: "b", value: "Médiathèque de Châtillon" }]));
  if (game.image_url?.trim()) fields.push(makeField("856", " ", " ", [{ code: "u", value: game.image_url.trim() }, { code: "x", value: "vignette" }]));

  const sf941: SubfieldEntry[] = [];
  const j = parseJoueurs(game.nb_de_joueurs);
  if (j) { sf941.push({ code: "a", value: minJoueursCode(j.min) }); sf941.push({ code: "f", value: maxJoueursCode(j.max) }); }
  const age = ageCode(game.couleur, game.etoiles); if (age) sf941.push({ code: "b", value: age });
  const tps = tempsCode(game.temps_de_jeu); if (tps) sf941.push({ code: "d", value: tps });
  if (game.mecanique?.trim()) sf941.push({ code: "c", value: game.mecanique.trim() });
  const niv = niveauCode(game.couleur, game.etoiles); if (niv) sf941.push({ code: "e", value: niv });
  if (sf941.length) fields.push(makeField("941", " ", " ", sf941));

  // Exemplaires (915/920/930/921 par copie physique)
  const couleurLow = (game.couleur ?? "").toLowerCase();
  const couleurCode = COULEUR_CODE[couleurLow] ?? "";
  const emplacement = couleurLow === "vert" ? "PJ" : "JE";
  const etoilesVal = game.etoiles ?? "1";
  for (const copie of copies) {
    if (!copie.code_syracuse) continue;
    fields.push(makeField("915", " ", " ", [{ code: "b", value: copie.code_syracuse }]));
    const sf920: SubfieldEntry[] = [{ code: "e", value: emplacement }, { code: "t", value: "JS" }];
    fields.push(makeField("920", " ", " ", sf920));
    const sf930: SubfieldEntry[] = [
      { code: "d", value: "L" },
      { code: "g", value: "JE" },
      ...(couleurCode ? [{ code: "h", value: couleurCode }] : []),
      { code: "i", value: etoilesVal },
    ];
    fields.push(makeField("930", " ", " ", sf930));
    fields.push(makeField("921", " ", " ", [{ code: "a", value: "2" }, { code: "b", value: "EXC" }]));
  }

  return buildISO2709Record(fields);
}

function buildMrcFile(games: CatalogueEntry[], copiesMap: Record<string, JeuCopie[]> = {}): Blob {
  const parts = games.map(g => buildRecord(g, copiesMap[g.ean] ?? []));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const res = new Uint8Array(total);
  let off = 0; for (const p of parts) { res.set(p, off); off += p.length; }
  return new Blob([res], { type: "application/octet-stream" });
}

// ─── Composants UI ────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-slate-400">{score}/10</span>
    </div>
  );
}

// ─── Modal Catalogage ─────────────────────────────────────────────────────────

function ModalCatalogage({ game: initGame, onClose, onSaved }: {
  game: CatalogueEntry;
  onClose: () => void;
  onSaved: (g: CatalogueEntry) => void;
}) {
  const [game, setGame] = useState<CatalogueEntry>(initGame);
  const [auteurs, setAuteurs] = useState<AuteurStructure[]>(parseAuteurs(initGame.auteurs_json));
  const [isSaving, setIsSaving] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [espritData, setEspritData] = useState<{
    resume: string | null;
    description: string | null;
    url: string;
    auteurs?: string[];
    illustrateurs?: string[];
    editeur?: string | null;
  } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const searchEspritJeu = async () => {
    setIsSearching(true); setSearchError(null); setEspritData(null);
    try {
      const params = new URLSearchParams();
      if (game.ean) params.set("ean", game.ean);
      params.set("nom", game.nom);
      const resp = await fetch(`/api/espritjeu?${params}`);
      const data = await resp.json();
      if (data.notFound) { setSearchError("Jeu introuvable sur Esprit Jeu"); return; }
      if (data.error) { setSearchError(data.error); return; }
      setEspritData(data);
    } catch { setSearchError("Erreur de connexion"); }
    finally { setIsSearching(false); }
  };

  const importAuteursEspritJeu = (data: NonNullable<typeof espritData>) => {
    const toStructure = (names: string[], role: Role): AuteurStructure[] =>
      (names ?? []).map(name => {
        const parts = name.trim().split(/\s+/);
        const nom = parts.pop() ?? "";
        const prenom = parts.join(" ");
        return { prenom, nom, role };
      });
    const imported = [
      ...toStructure(data.auteurs ?? [], "auteur"),
      ...toStructure(data.illustrateurs ?? [], "illustrateur"),
    ];
    if (imported.length) setAuteurs(imported);
  };

  const addAuteur = () => setAuteurs(a => [...a, { prenom: "", nom: "", role: "auteur" }]);
  const removeAuteur = (i: number) => setAuteurs(a => a.filter((_, idx) => idx !== i));
  const updateAuteur = (i: number, field: keyof AuteurStructure, value: string) =>
    setAuteurs(a => a.map((au, idx) => idx === i ? { ...au, [field]: value } : au));

  const saveGame = async () => {
    setIsSaving(true);
    const filteredAuteurs = auteurs.filter(a => a.nom.trim() || a.prenom.trim());
    const auteursText = filteredAuteurs.map(a => [a.prenom, a.nom].filter(Boolean).join(" ")).join(", ");
    const payload: Partial<CatalogueEntry> & { auteurs_json: string; auteurs: string } = {
      description: game.description,
      resume: game.resume,
      boite_format: game.boite_format,
      editeur: game.editeur,
      auteurs_json: JSON.stringify(filteredAuteurs),
      auteurs: auteursText,
    };
    const { error } = await supabase.from("catalogue").update(payload).eq("ean", game.ean);
    if (error) { alert("Erreur de sauvegarde : " + error.message); setIsSaving(false); return; }
    await supabase.from("jeux").update({ etape_notice: true }).eq("ean", game.ean);
    onSaved({ ...game, ...payload });
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col gap-0 overflow-hidden mb-8">

        {/* Header */}
        <div className="flex items-center gap-4 p-6 border-b border-slate-100">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
            {game.image_url
              ? <img src={game.image_url} alt={game.nom} className="w-full h-full object-cover" />
              : <span className="text-2xl">🎲</span>}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-xl text-black leading-tight truncate">{game.nom}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {game.editeur && <span className="text-xs text-slate-400 font-medium">{game.editeur}</span>}
              {game.editeur && game.ean && <span className="text-slate-200">·</span>}
              <span className="text-[10px] font-mono text-slate-300">{game.ean}</span>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold shrink-0">✕</button>
        </div>

        {/* Corps scrollable */}
        <div className="overflow-y-auto flex flex-col divide-y divide-slate-100" style={{ maxHeight: "70vh" }}>

          {/* Section Éditeur */}
          <div className="p-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Éditeur (champ 210 $c)
              </span>
              {espritData?.editeur && (
                <button onClick={() => setGame(g => ({ ...g, editeur: espritData.editeur! }))}
                  className="text-xs font-bold text-black bg-[#baff29] px-3 py-1 rounded-lg hover:bg-[#a8e820] transition-colors">
                  Importer "{espritData.editeur}" →
                </button>
              )}
            </div>
            <input
              type="text"
              value={game.editeur ?? ""}
              onChange={e => setGame(g => ({ ...g, editeur: e.target.value }))}
              placeholder="Nom de l'éditeur…"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors"
            />
          </div>

          {/* Section Description */}
          <div className="p-6 flex flex-col gap-5">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Recherche Esprit Jeu</span>
                <button onClick={searchEspritJeu} disabled={isSearching}
                  className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 disabled:opacity-50 transition-colors">
                  {isSearching
                    ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Recherche…</>
                    : "🔍 Chercher sur Esprit Jeu"}
                </button>
              </div>
              {searchError && <p className="text-xs font-bold text-rose-500">{searchError}</p>}
              {espritData && (
                <div className="flex flex-col gap-3">
                  {espritData.url && (
                    <a href={espritData.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-black underline truncate">
                      {espritData.url}
                    </a>
                  )}
                  {espritData.resume && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-600">Résumé (court)</span>
                        <button onClick={() => setGame(g => ({ ...g, description: espritData.resume! }))}
                          className="text-xs font-bold text-black bg-[#baff29] px-3 py-1 rounded-lg hover:bg-[#a8e820] transition-colors">
                          Utiliser →
                        </button>
                      </div>
                      <p className="px-4 py-3 text-xs text-slate-600 leading-relaxed">{espritData.resume}</p>
                    </div>
                  )}
                  {espritData.description && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-600">Description (longue)</span>
                        <button onClick={() => setGame(g => ({ ...g, description: espritData.description! }))}
                          className="text-xs font-bold text-black bg-[#baff29] px-3 py-1 rounded-lg hover:bg-[#a8e820] transition-colors">
                          Utiliser →
                        </button>
                      </div>
                      <p className="px-4 py-3 text-xs text-slate-600 leading-relaxed">{espritData.description}</p>
                    </div>
                  )}
                  {((espritData.auteurs?.length ?? 0) > 0 || (espritData.illustrateurs?.length ?? 0) > 0) && (
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-600">Auteurs trouvés</span>
                        <button onClick={() => importAuteursEspritJeu(espritData)}
                          className="text-xs font-bold text-black bg-[#baff29] px-3 py-1 rounded-lg hover:bg-[#a8e820] transition-colors">
                          Importer →
                        </button>
                      </div>
                      <div className="px-4 py-3 flex flex-col gap-1">
                        {espritData.auteurs?.map((a, i) => (
                          <span key={i} className="text-xs text-slate-600"><span className="font-bold">Auteur</span> — {a}</span>
                        ))}
                        {espritData.illustrateurs?.map((a, i) => (
                          <span key={i} className="text-xs text-slate-600"><span className="font-bold">Illustrateur</span> — {a}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Texte utilisé dans la notice (champ 330)
              </label>
              <textarea
                value={game.description ?? ""}
                onChange={e => setGame(g => ({ ...g, description: e.target.value }))}
                rows={5}
                placeholder="Résumé ou description du jeu…"
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:border-black transition-colors resize-none"
              />
            </div>
          </div>

          {/* Section Auteurs */}
          <div className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                Auteurs (champs 700/701/702)
              </span>
              <button onClick={addAuteur}
                className="flex items-center gap-1.5 px-3 py-2 bg-black text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors">
                + Ajouter
              </button>
            </div>
            {auteurs.length === 0 && (
              <p className="text-xs text-slate-400 font-medium py-2">Aucun auteur renseigné</p>
            )}
            {auteurs.map((a, i) => (
              <div key={i} className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl">
                <select
                  value={a.role}
                  onChange={e => updateAuteur(i, "role", e.target.value)}
                  className="text-xs font-bold bg-white border-2 border-slate-200 rounded-xl px-2 py-2 outline-none focus:border-black transition-colors shrink-0">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <input type="text" value={a.prenom} onChange={e => updateAuteur(i, "prenom", e.target.value)}
                  placeholder="Prénom"
                  className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:border-black transition-colors" />
                <input type="text" value={a.nom} onChange={e => updateAuteur(i, "nom", e.target.value)}
                  placeholder="NOM"
                  className="flex-1 bg-white border-2 border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase outline-none focus:border-black transition-colors" />
                <button onClick={() => removeAuteur(i)}
                  className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-rose-500 hover:bg-white transition-colors text-sm shrink-0">✕</button>
              </div>
            ))}
            {auteurs.length > 0 && (
              <p className="text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-100">
                Auteur → 700/701 $4 070 · Illustrateur → 702 $4 440 · Scénariste → 702 $4 275
              </p>
            )}
          </div>

          {/* Section Format boîte */}
          <div className="p-6 flex flex-col gap-4">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Format boîte (champ 215 $d)
            </span>
            <div className="flex gap-3 flex-wrap">
              {FORMATS_BOITE.map(f => (
                <button key={f}
                  onClick={() => setGame(g => ({ ...g, boite_format: g.boite_format === f ? undefined : f }))}
                  className={`w-16 h-16 rounded-2xl border-2 font-black text-lg transition-all ${
                    game.boite_format === f
                      ? "bg-black text-white border-black"
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
                  }`}>
                  {f}
                </button>
              ))}
            </div>
            {game.boite_format && (
              <p className="text-xs text-slate-400 font-medium">
                Format sélectionné : <strong className="text-black">{game.boite_format}</strong> → 215 $d "{game.boite_format}"
              </p>
            )}
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Contenu boîte (215 $a)
                </span>
                <Link
                  href={`/contenu?nom=${encodeURIComponent(game.nom)}`}
                  target="_blank"
                  className="text-xs font-bold text-slate-500 hover:text-black underline transition-colors">
                  Modifier →
                </Link>
              </div>
              <p className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl leading-relaxed">
                {game.contenu?.trim() || <span className="text-slate-300 italic">Non renseigné — sera exporté comme "1 boîte de jeu"</span>}
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-100">
          <button onClick={onClose}
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-sm transition-colors">
            Annuler
          </button>
          <button onClick={saveGame} disabled={isSaving}
            className="flex-1 px-4 py-3 rounded-2xl bg-black text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 transition-colors">
            {isSaving ? "Sauvegarde…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

function CataloguePageInner() {
  const searchParams = useSearchParams();
  const [catalogue, setCatalogue] = useState<CatalogueEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [editGame, setEditGame] = useState<CatalogueEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState<string | null>(null);
  const [filterComplet, setFilterComplet] = useState(false);

  useEffect(() => { loadCatalogue(); }, []);

  // Auto-ouverture du modal si ?ean= dans l'URL (depuis inventaire)
  useEffect(() => {
    const eanParam = searchParams.get("ean");
    if (eanParam && catalogue.length > 0 && !editGame) {
      const game = catalogue.find(g => g.ean === eanParam);
      if (game) setEditGame(game);
    }
  }, [catalogue, searchParams]);

  const loadCatalogue = async () => {
    setIsLoading(true);
    const { data } = await supabase
      .from("catalogue")
      .select("ean, nom, auteurs, auteurs_json, editeur, description, resume, contenu, boite_format, couleur, mecanique, nb_de_joueurs, temps_de_jeu, etoiles, coop_versus, image_url")
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

  const handleSaved = useCallback((updated: CatalogueEntry) => {
    setCatalogue(prev => prev.map(g => g.ean === updated.ean ? { ...g, ...updated } : g));
  }, []);

  const toggleSelect = (ean: string) => setSelected(prev => {
    const n = new Set(prev); n.has(ean) ? n.delete(ean) : n.add(ean); return n;
  });

  const selectedGames = useMemo(() => catalogue.filter(g => selected.has(g.ean)), [catalogue, selected]);

  const exportMrc = async () => {
    if (!selectedGames.length) return;
    setIsExporting(true);
    try {
      const eans = selectedGames.map(g => g.ean);
      const { data: jeux } = await supabase
        .from("jeux")
        .select("ean, code_syracuse")
        .in("ean", eans)
        .not("code_syracuse", "is", null)
        .neq("code_syracuse", "");
      const copiesMap: Record<string, JeuCopie[]> = {};
      for (const j of (jeux ?? [])) {
        if (!copiesMap[j.ean]) copiesMap[j.ean] = [];
        copiesMap[j.ean].push(j as JeuCopie);
      }
      const totalExemplaires = Object.values(copiesMap).reduce((s, arr) => s + arr.length, 0);
      setExportInfo(`${selectedGames.length} notice${selectedGames.length > 1 ? "s" : ""} · ${totalExemplaires} exemplaire${totalExemplaires > 1 ? "s" : ""} inclus`);
      console.log("[export mrc] copies map:", copiesMap);
      const blob = buildMrcFile(selectedGames, copiesMap);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `notices_syracuse_${new Date().toISOString().slice(0,10).replace(/-/g,"")}.mrc`;
      a.click();
      URL.revokeObjectURL(url);
    } finally { setIsExporting(false); }
  };

  return (
    <div className="min-h-screen bg-[#e5e5e5] flex flex-col items-center p-4 sm:p-8 gap-6">
      <style>{`
        .custom-scroll::-webkit-scrollbar{width:4px}
        .custom-scroll::-webkit-scrollbar-track{background:transparent}
        .custom-scroll::-webkit-scrollbar-thumb{background:#d1d5db;border-radius:999px}
      `}</style>

      {/* Nav */}
      <header className="flex justify-between items-center w-full max-w-[96%] mx-auto shrink-0 relative">
        <div className="w-10 h-10 bg-black rounded flex items-center justify-center text-white font-black text-xl italic">+</div>
        <NavBar current="catalogage" />
        <div className="w-10" />
      </header>

      <main className="bg-white rounded-[3rem] p-8 lg:p-10 w-full max-w-[96%] mx-auto flex-1 shadow-md flex flex-col gap-6">

        {/* Titre + export */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-black text-black">Catalogage</h1>
            <p className="text-slate-400 font-medium mt-1">Enrichis les notices et exporte-les pour Syracuse</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <button onClick={exportMrc} disabled={selected.size === 0 || isExporting}
              className="flex items-center gap-2 px-6 py-3.5 bg-black text-white rounded-2xl font-bold text-sm hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {isExporting
                ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Génération…</>
                : <>⬇ Exporter {selected.size > 0 ? `(${selected.size})` : ""} notices .mrc</>}
            </button>
            {exportInfo && (
              <span className="text-[11px] font-bold text-slate-400">{exportInfo}</span>
            )}
          </div>
        </div>

        {/* Sélection */}
        {selected.size > 0 && (
          <div className="flex items-center gap-3 px-5 py-3 bg-slate-50 border border-slate-100 rounded-2xl flex-wrap">
            <span className="text-sm font-bold text-black">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
            <button onClick={() => setSelected(new Set())}
              className="ml-auto text-xs font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors">
              Tout désélectionner
            </button>
          </div>
        )}

        {/* Filtres */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher un jeu ou éditeur…"
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-2.5 pl-10 font-medium text-sm outline-none focus:border-black transition-colors" />
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          </div>
          <button onClick={() => setFilterComplet(v => !v)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold border-2 transition-colors ${
              filterComplet ? "bg-black text-white border-black" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}>
            Notices complètes (≥ 7/10)
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-400 font-medium ml-auto">
            <span>{filtered.length} jeu{filtered.length > 1 ? "x" : ""}</span>
            <span className="text-slate-200">·</span>
            <button onClick={() => setSelected(new Set(filtered.map(g => g.ean)))}
              className="font-bold text-slate-600 hover:text-black transition-colors">Tout sélectionner</button>
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-black rounded-full animate-spin" />
            <p className="text-slate-400 font-medium text-sm">Chargement…</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 overflow-y-auto custom-scroll" style={{ maxHeight: "calc(100vh - 360px)" }}>
            {filtered.map(game => {
              const isSelected = selected.has(game.ean);
              const score = completenessScore(game);
              const auteurs = parseAuteurs(game.auteurs_json);
              const hasDesc = !!(game.description?.trim() || game.resume?.trim());
              return (
                <div key={game.ean}
                  className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                    isSelected ? "border-black bg-slate-50" : "border-slate-100 hover:border-slate-200 bg-white"}`}>
                  {/* Checkbox */}
                  <div onClick={() => toggleSelect(game.ean)}
                    className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                      isSelected ? "bg-black border-black" : "border-slate-300 hover:border-slate-500"}`}>
                    {isSelected && <span className="text-white text-xs font-black">✓</span>}
                  </div>
                  {/* Image */}
                  <div className="w-10 h-10 rounded-xl overflow-hidden bg-slate-100 shrink-0 flex items-center justify-center">
                    {game.image_url
                      ? <img src={game.image_url} alt={game.nom} className="w-full h-full object-cover" loading="lazy" />
                      : <span className="text-slate-300 text-lg">🎲</span>}
                  </div>
                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-black truncate">{game.nom}</span>
                      {game.editeur && <span className="text-xs text-slate-400 font-medium shrink-0">{game.editeur}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <ScoreBar score={score} />
                      {hasDesc && <span className="text-[10px] bg-emerald-50 text-emerald-600 font-bold px-1.5 py-0.5 rounded">Description ✓</span>}
                      {game.boite_format && <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded">{game.boite_format}</span>}
                      {auteurs.length > 0 && <span className="text-[10px] bg-purple-50 text-purple-600 font-bold px-1.5 py-0.5 rounded">{auteurs.length} auteur{auteurs.length > 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  {/* Bouton cataloguer */}
                  <button onClick={() => setEditGame(game)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-black hover:text-white text-slate-600 rounded-xl text-xs font-bold transition-colors shrink-0">
                    ✏️ Cataloguer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Modal */}
      {editGame && (
        <ModalCatalogage
          game={editGame}
          onClose={() => setEditGame(null)}
          onSaved={updated => { handleSaved(updated); setEditGame(null); }}
        />
      )}
    </div>
  );
}

export default function CataloguePage() {
  return (
    <Suspense>
      <CataloguePageInner />
    </Suspense>
  );
}
