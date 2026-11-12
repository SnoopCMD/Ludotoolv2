"use client";
import { useRef, useState } from "react";
import type { EtapeAtelier } from "../lib/etapesAtelier";
import { MAX_GESTES, MAX_TEXTE, MAX_TITRE, type GesteTuto } from "../lib/tutosAtelier";

/**
 * Créer ou modifier le tuto d'une étape : une liste de gestes (illustration,
 * titre, texte) dans l'ordre. Une illustration choisie est réduite dans le
 * navigateur puis envoyée tout de suite ; le tuto n'est enregistré qu'avec
 * « Enregistrer ».
 */

type Brouillon = GesteTuto & { cle: number };

let compteur = 0;
const nouvelleCle = () => ++compteur;

/** Réduit l'image à 900 px de côté au plus, en WebP (JPEG si le navigateur ne sait pas l'écrire). */
async function preparerImage(fichier: File): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image illisible"));
      i.src = url;
    });
    const r = Math.min(1, 900 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * r);
    canvas.height = Math.round(img.height * r);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const versBlob = (type: string) => new Promise<Blob | null>(res => canvas.toBlob(res, type, 0.85));
    const webp = await versBlob("image/webp");
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await versBlob("image/jpeg");
    if (!jpeg) throw new Error("conversion impossible");
    return jpeg;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function ModalEditionTuto({ etape, gestes, isMobile, onFermer, onEnregistre }: {
  etape: EtapeAtelier; gestes: GesteTuto[]; isMobile: boolean;
  onFermer: () => void; onEnregistre: (gestes: GesteTuto[]) => void;
}) {
  const [liste, setListe] = useState<Brouillon[]>(() => gestes.map(g => ({ ...g, texte: g.texte ?? "", cle: nouvelleCle() })));
  const [envois, setEnvois] = useState<Set<number>>(new Set());
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const refFichier = useRef<HTMLInputElement>(null);
  const cibleFichier = useRef<number | null>(null);

  const initial = JSON.stringify(gestes.map(g => ({ titre: g.titre, texte: g.texte ?? "", image: g.image })));
  const actuel = JSON.stringify(liste.map(g => ({ titre: g.titre, texte: g.texte ?? "", image: g.image })));
  const modifie = initial !== actuel;
  const incomplets = liste.filter(g => !g.titre.trim() || !g.image).length;

  const maj = (cle: number, champ: keyof GesteTuto, valeur: string) =>
    setListe(l => l.map(g => (g.cle === cle ? { ...g, [champ]: valeur } : g)));
  const deplacer = (i: number, sens: -1 | 1) => setListe(l => {
    const j = i + sens;
    if (j < 0 || j >= l.length) return l;
    const n = [...l]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const retirer = (cle: number) => setListe(l => l.filter(g => g.cle !== cle));
  const ajouter = () => {
    const cle = nouvelleCle();
    setListe(l => [...l, { cle, titre: "", texte: "", image: "" }]);
    choisirImage(cle);
  };

  const choisirImage = (cle: number) => { cibleFichier.current = cle; refFichier.current?.click(); };

  const surFichier = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    const cle = cibleFichier.current;
    if (!fichier || cle === null) return;
    setErreur(null);
    setEnvois(s => new Set(s).add(cle));
    try {
      const blob = await preparerImage(fichier);
      const form = new FormData();
      form.append("fichier", new File([blob], `tuto.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type }));
      const rep = await fetch("/api/atelier-tutos/image", { method: "POST", body: form });
      const data = await rep.json().catch(() => ({})) as { url?: string; error?: string };
      if (!rep.ok || !data.url) throw new Error(data.error || "envoi impossible");
      maj(cle, "image", data.url);
    } catch (err) {
      setErreur(`L'illustration n'a pas pu être envoyée : ${(err as Error).message}.`);
    } finally {
      setEnvois(s => { const n = new Set(s); n.delete(cle); return n; });
    }
  };

  const fermer = () => { if (!modifie || confirm("Fermer sans enregistrer ?")) onFermer(); };

  const enregistrer = async () => {
    if (incomplets) { setErreur("Chaque geste a besoin d'un titre et d'une illustration."); return; }
    if (!liste.length && !confirm(`Supprimer le tuto de l'étape ${etape.num} ?`)) return;
    setEnregistrement(true); setErreur(null);
    const corps = { gestes: liste.map(g => ({ titre: g.titre.trim(), texte: (g.texte ?? "").trim(), image: g.image })) };
    const rep = await fetch(`/api/atelier-tutos/${etape.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const data = rep ? await rep.json().catch(() => ({})) as { gestes?: GesteTuto[]; error?: string } : {};
    setEnregistrement(false);
    if (!rep?.ok || !data.gestes) { setErreur(data.error || "L'enregistrement a échoué, réessaie."); return; }
    onEnregistre(data.gestes);
    onFermer();
  };

  const cote = isMobile ? 110 : 130;
  const petitBouton: React.CSSProperties = { width: 30, height: 30, border: "2px solid var(--ink)", borderRadius: 6, background: "var(--white)", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "calc(var(--nav-h) + 12px) 12px 12px" }}
      onClick={e => { if (e.target === e.currentTarget) fermer(); }}>
      <div style={{ background: "var(--cream)", border: "3px solid var(--ink)", borderRadius: 12, boxShadow: "8px 8px 0 var(--ink)", width: "100%", maxWidth: 760, display: "flex", flexDirection: "column", maxHeight: "calc(100dvh - var(--nav-h) - 36px)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "3px solid var(--ink)", background: etape.hex, display: "flex", alignItems: "center", gap: 12 }}>
          <span className="bc" style={{ fontSize: 34, lineHeight: 1 }}>{etape.num}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="bc" style={{ fontSize: 22, textTransform: "uppercase", lineHeight: 1.1 }}>✏️ Tuto · {etape.nom}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.55)" }}>Les gestes dans l&apos;ordre, chacun avec son illustration (format carré conseillé).</div>
          </div>
          <button onClick={fermer} style={{ width: 32, height: 32, flexShrink: 0, background: "var(--ink)", color: "var(--white)", border: "2px solid var(--ink)", borderRadius: 6, fontWeight: 700, fontSize: 16, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {liste.length === 0 && (
            <p style={{ textAlign: "center", color: "rgba(0,0,0,0.45)", fontWeight: 600, padding: "24px 0" }}>Pas encore de tuto pour cette étape.</p>
          )}
          {liste.map((g, i) => (
            <div key={g.cle} className="pop-card" style={{ background: "var(--white)", padding: 12, display: "flex", gap: 12, alignItems: "flex-start", flexWrap: isMobile ? "wrap" : "nowrap" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "center", flexShrink: 0 }}>
                <span className="bc" style={{ width: 30, height: 30, borderRadius: "50%", background: etape.hex, border: "2px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{i + 1}</span>
                <button style={{ ...petitBouton, opacity: i === 0 ? 0.3 : 1 }} disabled={i === 0} onClick={() => deplacer(i, -1)} title="Monter">↑</button>
                <button style={{ ...petitBouton, opacity: i === liste.length - 1 ? 0.3 : 1 }} disabled={i === liste.length - 1} onClick={() => deplacer(i, 1)} title="Descendre">↓</button>
              </div>
              <button onClick={() => choisirImage(g.cle)} disabled={envois.has(g.cle)} title={g.image ? "Changer l'illustration" : "Choisir une illustration"}
                style={{ width: cote, height: cote, flexShrink: 0, padding: 0, borderRadius: 10, border: g.image ? "2.5px solid var(--ink)" : "2.5px dashed var(--rouge)", background: "#f7f1e6", cursor: "pointer", overflow: "hidden", position: "relative", fontFamily: "inherit" }}>
                {g.image ? <img src={g.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} /> : (
                  <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(0,0,0,0.55)", padding: 8, display: "block" }}>📷<br />Choisir une illustration</span>
                )}
                {envois.has(g.cle) && <span style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>Envoi…</span>}
                {g.image && !envois.has(g.cle) && <span style={{ position: "absolute", bottom: 4, right: 4, fontSize: 11, fontWeight: 800, background: "var(--white)", border: "1.5px solid var(--ink)", borderRadius: 10, padding: "1px 6px" }}>Changer</span>}
              </button>
              <div style={{ flex: "1 1 220px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <input className="pop-input" placeholder="Ce qu'il faut faire (ex. Coller le code-barre)" value={g.titre} maxLength={MAX_TITRE}
                  onChange={e => maj(g.cle, "titre", e.target.value)} style={{ width: "100%", fontWeight: 700, ...(g.titre.trim() ? {} : { borderColor: "var(--rouge)" }) }} />
                <textarea className="pop-input" placeholder="Précision (facultatif) : où, comment…" value={g.texte ?? ""} maxLength={MAX_TEXTE} rows={2}
                  onChange={e => maj(g.cle, "texte", e.target.value)} style={{ width: "100%", resize: "vertical", fontFamily: "inherit", fontSize: 14 }} />
              </div>
              <button onClick={() => retirer(g.cle)} title="Retirer ce geste" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, padding: 4, flexShrink: 0 }}>🗑️</button>
            </div>
          ))}
          {liste.length < MAX_GESTES && (
            <button className="pop-btn" onClick={ajouter} style={{ alignSelf: "flex-start", background: "var(--white)" }}>+ Ajouter un geste</button>
          )}
          <input ref={refFichier} type="file" accept="image/*" onChange={surFichier} style={{ display: "none" }} />
        </div>

        {erreur && <div style={{ margin: "0 16px 10px", fontSize: 13, fontWeight: 700, background: "#fff5f5", border: "2px solid var(--rouge)", borderRadius: 8, padding: "8px 12px" }}>{erreur}</div>}
        <div style={{ padding: "12px 20px", borderTop: "3px solid var(--ink)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)", flex: "1 1 200px" }}>
            {liste.length} geste{liste.length > 1 ? "s" : ""}{incomplets ? ` · ${incomplets} incomplet${incomplets > 1 ? "s" : ""}` : ""}
          </span>
          <button className="pop-btn pop-btn-outline" onClick={fermer}>Annuler</button>
          <button className="pop-btn pop-btn-dark" onClick={enregistrer} disabled={!modifie || enregistrement || envois.size > 0} style={{ opacity: !modifie || envois.size > 0 ? 0.4 : 1 }}>
            {enregistrement ? "Enregistrement…" : "✓ Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
