"use client";
import { useState, useEffect, useMemo, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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

// ─── ISO2709 builder ─────────────────────────────────────────────────────────

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
  fields.push(makeField("694", " ", " ", [{ code: "a", value: "Jeux de société" }]));

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

// ─── ScoreBar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = (score / 10) * 100;
  const color = pct >= 80 ? "var(--vert)" : pct >= 50 ? "var(--orange)" : "var(--rouge)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 56, height: 4, background: "var(--cream2)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.4)" }}>{score}/10</span>
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
      const data = await resp.json() as any;
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
      description: game.description, resume: game.resume,
      boite_format: game.boite_format, editeur: game.editeur,
      auteurs_json: JSON.stringify(filteredAuteurs), auteurs: auteursText,
    };
    const res = await fetch(`/api/catalogue/${encodeURIComponent(game.ean)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) { alert("Erreur de sauvegarde"); setIsSaving(false); return; }
    const jeuxRows = await fetch(`/api/jeux?ean=${encodeURIComponent(game.ean)}&fields=id`).then(r => r.json()).catch(() => []);
    if (Array.isArray(jeuxRows)) {
      for (const j of jeuxRows) await fetch(`/api/jeux/${j.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ etape_notice: 1 }) });
    }
    onSaved({ ...game, ...payload });
    setIsSaving(false);
    onClose();
  };

  const inpStyle: React.CSSProperties = {
    border: "2px solid var(--cream2)", borderRadius: 8, padding: "9px 14px",
    background: "var(--cream)", outline: "none", fontSize: 14,
    fontFamily: "inherit", width: "100%", boxSizing: "border-box",
    transition: "border-color 0.1s",
  };

  const sectionStyle: React.CSSProperties = {
    padding: "18px 20px",
    borderTop: "1px solid var(--cream2)",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)",
    textTransform: "uppercase", letterSpacing: "0.07em",
  };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="pop-card" style={{ width: "100%", maxWidth: 680, maxHeight: "calc(100vh - 96px)", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px", background: "var(--ink)" }}>
          <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", background: "var(--cream2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.15)" }}>
            {game.image_url
              ? <img src={game.image_url} alt={game.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              : <span style={{ fontSize: 22 }}>🎲</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontWeight: 900, fontSize: 18, color: "var(--cream)", margin: 0, lineHeight: 1.2 }}>{game.nom}</h2>
            <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
              {game.editeur && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500 }}>{game.editeur}</span>}
              <span style={{ fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.3)" }}>{game.ean}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", fontSize: 16, color: "var(--cream)", flexShrink: 0 }}>✕</button>
        </div>

        {/* Corps scrollable */}
        <div style={{ overflow: "auto", flex: 1 }}>

          {/* Éditeur */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={labelStyle}>Éditeur (champ 210 $c)</span>
              {espritData?.editeur && (
                <button onClick={() => setGame(g => ({ ...g, editeur: espritData.editeur! }))}
                  className="pop-btn pop-btn-yellow" style={{ fontSize: 12, padding: "4px 12px" }}>
                  Importer « {espritData.editeur} » →
                </button>
              )}
            </div>
            <input type="text" value={game.editeur ?? ""} onChange={e => setGame(g => ({ ...g, editeur: e.target.value }))}
              placeholder="Nom de l'éditeur…" style={inpStyle} />
          </div>

          {/* Esprit Jeu + Description */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={labelStyle}>Recherche Esprit Jeu</span>
              <button onClick={searchEspritJeu} disabled={isSearching} className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "6px 14px", opacity: isSearching ? 0.5 : 1 }}>
                {isSearching ? "Recherche…" : "Chercher sur Esprit Jeu"}
              </button>
            </div>
            {searchError && <p style={{ fontSize: 13, fontWeight: 700, color: "var(--rouge)" }}>{searchError}</p>}
            {espritData && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {espritData.url && (
                  <a href={espritData.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", textDecoration: "underline", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {espritData.url}
                  </a>
                )}
                {espritData.resume && (
                  <div style={{ border: "2px solid var(--cream2)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Résumé (court)</span>
                      <button onClick={() => setGame(g => ({ ...g, description: espritData.resume! }))}
                        className="pop-btn pop-btn-yellow" style={{ fontSize: 11, padding: "3px 10px" }}>Utiliser →</button>
                    </div>
                    <p style={{ padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "rgba(0,0,0,0.6)" }}>{espritData.resume}</p>
                  </div>
                )}
                {espritData.description && (
                  <div style={{ border: "2px solid var(--cream2)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Description (longue)</span>
                      <button onClick={() => setGame(g => ({ ...g, description: espritData.description! }))}
                        className="pop-btn pop-btn-yellow" style={{ fontSize: 11, padding: "3px 10px" }}>Utiliser →</button>
                    </div>
                    <p style={{ padding: "10px 14px", fontSize: 12, lineHeight: 1.6, color: "rgba(0,0,0,0.6)" }}>{espritData.description}</p>
                  </div>
                )}
                {((espritData.auteurs?.length ?? 0) > 0 || (espritData.illustrateurs?.length ?? 0) > 0) && (
                  <div style={{ border: "2px solid var(--cream2)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--cream)", borderBottom: "1px solid var(--cream2)" }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>Auteurs trouvés</span>
                      <button onClick={() => importAuteursEspritJeu(espritData)}
                        className="pop-btn pop-btn-yellow" style={{ fontSize: 11, padding: "3px 10px" }}>Importer →</button>
                    </div>
                    <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                      {espritData.auteurs?.map((a, i) => (
                        <span key={i} style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}><strong>Auteur</strong> — {a}</span>
                      ))}
                      {espritData.illustrateurs?.map((a, i) => (
                        <span key={i} style={{ fontSize: 12, color: "rgba(0,0,0,0.6)" }}><strong>Illustrateur</strong> — {a}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={labelStyle}>Texte utilisé dans la notice (champ 330)</label>
              <textarea value={game.description ?? ""} onChange={e => setGame(g => ({ ...g, description: e.target.value }))}
                rows={5} placeholder="Résumé ou description du jeu…"
                style={{ ...inpStyle, resize: "vertical" }} />
            </div>
          </div>

          {/* Auteurs */}
          <div style={sectionStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={labelStyle}>Auteurs (champs 700/701/702)</span>
              <button onClick={addAuteur} className="pop-btn pop-btn-dark" style={{ fontSize: 12, padding: "5px 12px" }}>+ Ajouter</button>
            </div>
            {auteurs.length === 0 && (
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.35)", fontWeight: 500 }}>Aucun auteur renseigné</p>
            )}
            {auteurs.map((a, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--cream)", borderRadius: 8, border: "1.5px solid var(--cream2)" }}>
                <select value={a.role} onChange={e => updateAuteur(i, "role", e.target.value)}
                  style={{ fontSize: 12, fontWeight: 700, background: "var(--white)", border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 8px", outline: "none", flexShrink: 0, fontFamily: "inherit" }}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <input type="text" value={a.prenom} onChange={e => updateAuteur(i, "prenom", e.target.value)} placeholder="Prénom"
                  style={{ flex: 1, fontSize: 13, background: "var(--white)", border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 10px", outline: "none", fontFamily: "inherit" }} />
                <input type="text" value={a.nom} onChange={e => updateAuteur(i, "nom", e.target.value)} placeholder="NOM"
                  style={{ flex: 1, fontSize: 13, fontWeight: 700, textTransform: "uppercase", background: "var(--white)", border: "2px solid var(--cream2)", borderRadius: 6, padding: "6px 10px", outline: "none", fontFamily: "inherit" }} />
                <button onClick={() => removeAuteur(i)}
                  style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", border: "none", background: "none", cursor: "pointer", fontSize: 16, color: "rgba(0,0,0,0.4)", flexShrink: 0 }}>✕</button>
              </div>
            ))}
            {auteurs.length > 0 && (
              <p style={{ fontSize: 11, color: "rgba(0,0,0,0.35)", fontWeight: 500, borderTop: "1px solid var(--cream2)", paddingTop: 8 }}>
                Auteur → 700/701 $4 070 · Illustrateur → 702 $4 440 · Scénariste → 702 $4 275
              </p>
            )}
          </div>

          {/* Format boîte */}
          <div style={sectionStyle}>
            <span style={labelStyle}>Format boîte (champ 215 $d)</span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {FORMATS_BOITE.map(f => (
                <button key={f}
                  onClick={() => setGame(g => ({ ...g, boite_format: g.boite_format === f ? undefined : f }))}
                  style={{
                    width: 60, height: 60, borderRadius: 10, fontWeight: 900, fontSize: 16,
                    border: "2.5px solid var(--ink)", cursor: "pointer",
                    background: game.boite_format === f ? "var(--yellow)" : "var(--white)",
                    color: "var(--ink)", boxShadow: game.boite_format === f ? "3px 3px 0 var(--ink)" : "none",
                    transition: "all 0.1s", fontFamily: "inherit",
                  }}>
                  {f}
                </button>
              ))}
            </div>
            {game.boite_format && (
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>
                Format sélectionné : <strong style={{ color: "var(--ink)" }}>{game.boite_format}</strong> → 215 $d « {game.boite_format} »
              </p>
            )}
            <div style={{ paddingTop: 12, borderTop: "1px solid var(--cream2)", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={labelStyle}>Contenu boîte (215 $a)</span>
                <Link href={`/contenu?nom=${encodeURIComponent(game.nom)}`} target="_blank"
                  style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.5)", textDecoration: "underline" }}>
                  Modifier →
                </Link>
              </div>
              <p style={{ fontSize: 13, color: "rgba(0,0,0,0.55)", background: "var(--cream)", padding: "10px 14px", borderRadius: 8, lineHeight: 1.6 }}>
                {game.contenu?.trim() || <span style={{ fontStyle: "italic", color: "rgba(0,0,0,0.25)" }}>Non renseigné — sera exporté comme « 1 boîte de jeu »</span>}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", gap: 10, padding: "14px 20px", borderTop: "2.5px solid var(--ink)" }}>
          <button onClick={onClose} className="pop-btn pop-btn-outline" style={{ flex: 1 }}>Annuler</button>
          <button onClick={saveGame} disabled={isSaving} className="pop-btn pop-btn-dark" style={{ flex: 1, opacity: isSaving ? 0.5 : 1 }}>
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
  const [codesMap, setCodesMap] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [editGame, setEditGame] = useState<CatalogueEntry | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [exportInfo, setExportInfo] = useState<string | null>(null);
  const [filterComplet, setFilterComplet] = useState(false);

  useEffect(() => { loadCatalogue(); }, []);

  useEffect(() => {
    const eanParam = searchParams.get("ean");
    if (eanParam && catalogue.length > 0 && !editGame) {
      const game = catalogue.find(g => g.ean === eanParam);
      if (game) setEditGame(game);
    }
  }, [catalogue, searchParams]);

  const loadCatalogue = async () => {
    setIsLoading(true);
    const [catData, jeuxData]: [any[], any[]] = await Promise.all([
      fetch('/api/catalogue?fields=ean,nom,auteurs,auteurs_json,editeur,description,resume,contenu,boite_format,couleur,mecanique,nb_de_joueurs,temps_de_jeu,etoiles,coop_versus,image_url').then(r => r.json()).catch(() => []),
      fetch('/api/jeux?code_syracuse=notnull&fields=ean,code_syracuse').then(r => r.json()).catch(() => []),
    ]);
    if (Array.isArray(catData)) setCatalogue(catData as CatalogueEntry[]);
    if (Array.isArray(jeuxData)) {
      const map: Record<string, string[]> = {};
      for (const j of jeuxData) { if (!map[j.ean]) map[j.ean] = []; map[j.ean].push(j.code_syracuse); }
      setCodesMap(map);
    }
    setIsLoading(false);
  };

  const filtered = useMemo(() => {
    const q = normalizeStr(recherche);
    const result = catalogue.filter(g => {
      if (filterComplet && completenessScore(g) < 7) return false;
      if (!q) return true;
      const codes = codesMap[g.ean] ?? [];
      return normalizeStr(g.nom).includes(q) || normalizeStr(g.editeur ?? "").includes(q) || codes.some(c => normalizeStr(c).includes(q));
    });
    return result.sort((a, b) => {
      const aS = selected.has(a.ean) ? 0 : 1;
      const bS = selected.has(b.ean) ? 0 : 1;
      if (aS !== bS) return aS - bS;
      return a.nom.localeCompare(b.nom);
    });
  }, [catalogue, recherche, filterComplet, codesMap, selected]);

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
      const jeux = await fetch(`/api/jeux?eans=${encodeURIComponent(eans.join(','))}&code_syracuse=notnull&fields=ean,code_syracuse`).then(r => r.json()).catch(() => []);
      const copiesMap: Record<string, JeuCopie[]> = {};
      for (const j of (Array.isArray(jeux) ? jeux : [])) { if (!copiesMap[j.ean]) copiesMap[j.ean] = []; copiesMap[j.ean].push(j as JeuCopie); }
      const totalExemplaires = Object.values(copiesMap).reduce((s, arr) => s + arr.length, 0);
      setExportInfo(`${selectedGames.length} notice${selectedGames.length > 1 ? "s" : ""} · ${totalExemplaires} exemplaire${totalExemplaires > 1 ? "s" : ""} inclus`);
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
    <div style={{ minHeight: "100vh", background: "var(--cream)" }}>
      <NavBar current="catalogage" />

      <div className="pop-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

        {/* Titre + export */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div className="bc" style={{ fontSize: 80, lineHeight: 0.9, textTransform: "uppercase", letterSpacing: "-1px", background: "linear-gradient(135deg, #0d0d0d 40%, var(--orange))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Catalogage</div>
            <p style={{ color: "rgba(0,0,0,0.4)", fontWeight: 500, marginTop: 6, fontSize: 15 }}>Enrichis les notices et exporte-les pour Syracuse</p>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            <button onClick={exportMrc} disabled={selected.size === 0 || isExporting}
              className="pop-btn pop-btn-dark"
              style={{ opacity: selected.size === 0 || isExporting ? 0.4 : 1, cursor: selected.size === 0 || isExporting ? "not-allowed" : "pointer" }}>
              {isExporting ? "Génération…" : `⬇ Exporter ${selected.size > 0 ? `(${selected.size})` : ""} notices .mrc`}
            </button>
            {exportInfo && <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.4)" }}>{exportInfo}</span>}
          </div>
        </div>

        {/* Sélection résumé */}
        {selected.size > 0 && (
          <div style={{ background: "var(--cream2)", border: "2.5px solid var(--ink)", borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>{selected.size} notice{selected.size > 1 ? "s" : ""} sélectionnée{selected.size > 1 ? "s" : ""}</span>
              <button onClick={() => setSelected(new Set())} className="pop-btn pop-btn-outline" style={{ marginLeft: "auto", fontSize: 12, padding: "4px 12px" }}>
                Tout désélectionner
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {selectedGames.map(g => {
                const codes = codesMap[g.ean] ?? [];
                return (
                  <span key={g.ean} className="pop-sticker" style={{ background: "var(--white)", fontSize: 11 }}>
                    {g.nom}
                    {codes.length > 0 && <span style={{ fontWeight: 400, color: "rgba(0,0,0,0.4)", marginLeft: 4 }}>· {codes.join(", ")}</span>}
                    <button onClick={() => toggleSelect(g.ean)} style={{ marginLeft: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "rgba(0,0,0,0.4)", padding: 0 }}>✕</button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Filtres */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
            <input type="text" value={recherche} onChange={e => setRecherche(e.target.value)}
              placeholder="Rechercher un jeu ou éditeur…"
              className="pop-input" style={{ width: "100%", paddingLeft: 36 }} />
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }}>🔍</span>
          </div>
          <button onClick={() => setFilterComplet(v => !v)} className="pop-btn"
            style={{ background: filterComplet ? "var(--ink)" : "var(--white)", color: filterComplet ? "var(--cream)" : "var(--ink)" }}>
            Notices complètes (≥ 7/10)
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <span style={{ fontSize: 14, color: "rgba(0,0,0,0.4)", fontWeight: 600 }}>{filtered.length} jeu{filtered.length > 1 ? "x" : ""}</span>
            <button onClick={() => setSelected(new Set(filtered.map(g => g.ean)))}
              style={{ fontSize: 13, fontWeight: 700, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "var(--ink)", fontFamily: "inherit" }}>
              Tout sélectionner
            </button>
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 0", gap: 12 }}>
            <div style={{ width: 32, height: 32, border: "3px solid var(--cream2)", borderTopColor: "var(--ink)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <p style={{ color: "rgba(0,0,0,0.4)", fontWeight: 600, fontSize: 15 }}>Chargement…</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, overflow: "auto", maxHeight: "calc(100vh - 360px)" }}>
            {filtered.map(game => {
              const isSelected = selected.has(game.ean);
              const score = completenessScore(game);
              const auteurs = parseAuteurs(game.auteurs_json);
              const hasDesc = !!(game.description?.trim() || game.resume?.trim());
              const codes = codesMap[game.ean] ?? [];
              return (
                <div key={game.ean}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    background: isSelected ? "var(--yellow)" : "var(--white)",
                    border: `2.5px solid ${isSelected ? "var(--ink)" : "var(--cream2)"}`,
                    borderRadius: 10, boxShadow: isSelected ? "3px 3px 0 var(--ink)" : "none",
                    transition: "all 0.1s",
                  }}>
                  {/* Checkbox */}
                  <div onClick={() => toggleSelect(game.ean)}
                    style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0, cursor: "pointer",
                      border: "2.5px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center",
                      background: isSelected ? "var(--ink)" : "transparent", transition: "all 0.1s",
                    }}>
                    {isSelected && <span style={{ color: "var(--yellow)", fontSize: 12, fontWeight: 900 }}>✓</span>}
                  </div>
                  {/* Image */}
                  <div style={{ width: 40, height: 40, borderRadius: 8, overflow: "hidden", background: "var(--cream2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {game.image_url
                      ? <img src={game.image_url} alt={game.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      : <span style={{ fontSize: 18, opacity: 0.4 }}>🎲</span>}
                  </div>
                  {/* Infos */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{game.nom}</span>
                      {game.editeur && <span style={{ fontSize: 12, color: "rgba(0,0,0,0.4)", fontWeight: 500 }}>{game.editeur}</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                      <ScoreBar score={score} />
                      {hasDesc && <span className="pop-sticker" style={{ background: "var(--vert)", fontSize: 10 }}>Desc ✓</span>}
                      {game.boite_format && <span className="pop-sticker" style={{ background: "var(--bleu)", fontSize: 10 }}>{game.boite_format}</span>}
                      {auteurs.length > 0 && <span className="pop-sticker" style={{ background: "var(--purple)", fontSize: 10 }}>{auteurs.length} auteur{auteurs.length > 1 ? "s" : ""}</span>}
                      {codes.map(c => (
                        <span key={c} className="pop-sticker" style={{ background: "var(--cream2)", fontSize: 10, fontFamily: "monospace" }}>{c}</span>
                      ))}
                    </div>
                  </div>
                  {/* Bouton */}
                  <button onClick={() => setEditGame(game)} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "5px 12px", flexShrink: 0 }}>
                    ✏️ Cataloguer
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
