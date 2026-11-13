"use client";

import { useEffect, useRef, useState } from "react";
import { useCompte } from "../AuthProvider";
import { STICKER_COTE_MAX, STICKER_POIDS_MAX, STICKER_TYPES, urlSticker, type PieceSticker, type StickerChat } from "../../lib/chat";
import EtoileFavori from "./EtoileFavori";
import { useFavoris } from "./favoris";

/**
 * Bibliothèque de stickers de l'équipe : ses favoris d'abord, puis tous ;
 * choisir, importer une image, retirer les siens, mettre en favori. Sert à l'envoi dans une discussion comme aux réactions volantes.
 */
export default function ChoixSticker({ onChoisir, hauteur = 260 }: { onChoisir: (s: StickerChat | PieceSticker) => void; hauteur?: number }) {
  const { compte } = useCompte();
  const { favoris } = useFavoris();
  const favorisSticker = favoris.filter((f): f is PieceSticker => f.type === "sticker");
  const [stickers, setStickers] = useState<StickerChat[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [aRetirer, setARetirer] = useState<string | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/chat/stickers", { cache: "no-store" })
      .then(async r => { const d = await r.json() as { stickers?: StickerChat[]; error?: string }; if (!r.ok) throw new Error(d.error); return d.stickers ?? []; })
      .then(setStickers)
      .catch(e => { setStickers([]); setErreur((e as Error).message || "Bibliothèque indisponible."); });
  }, []);

  const importer = async (f: File) => {
    setErreur(null);
    if (!STICKER_TYPES.includes(f.type)) { setErreur("Format accepté : PNG, JPEG, WebP ou GIF."); return; }
    setEnvoi(true);
    try {
      const pret = await preparer(f);
      const form = new FormData();
      form.set("fichier", pret.fichier);
      form.set("largeur", String(pret.largeur));
      form.set("hauteur", String(pret.hauteur));
      const r = await fetch("/api/chat/stickers", { method: "POST", body: form });
      const d = await r.json() as StickerChat & { error?: string };
      if (!r.ok) throw new Error(d.error || "Import impossible.");
      setStickers(s => [d, ...(s ?? [])]);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
      if (fichier.current) fichier.current.value = "";
    }
  };

  const retirer = async (id: string) => {
    setARetirer(null);
    const r = await fetch(`/api/chat/stickers/${id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setStickers(s => (s ?? []).filter(x => x.id !== id));
    else setErreur("Impossible de retirer ce sticker.");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ height: hauteur, overflowY: "auto" }}>
        {favorisSticker.length > 0 && (
          <>
            <div className="chat-section-titre">★ Mes favoris</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginBottom: 10 }}>
              {favorisSticker.map(f => (
                <div key={f.id} className="chat-media-case" style={{ position: "relative", aspectRatio: "1" }}>
                  <button onClick={() => onChoisir(f)} aria-label="Sticker favori" className="chat-sticker-choix" style={caseSticker}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={urlSticker(f.id)} alt="" loading="lazy" style={imageSticker} />
                  </button>
                  <EtoileFavori piece={f} />
                </div>
              ))}
            </div>
            <div className="chat-section-titre">Bibliothèque de l&apos;équipe</div>
          </>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {/* Première case : importer une image. */}
          <button onClick={() => fichier.current?.click()} disabled={envoi} aria-label="Importer un sticker" title="Importer une image"
            style={{
              aspectRatio: "1", borderRadius: 10, cursor: envoi ? "wait" : "pointer", fontFamily: "inherit",
              border: "2px dashed rgba(0,0,0,0.3)", background: "var(--cream)", color: "rgba(0,0,0,0.55)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2,
              fontSize: 10, fontWeight: 800,
            }}>
            <span style={{ fontSize: 20, lineHeight: 1 }}>{envoi ? "…" : "+"}</span>
            {envoi ? "Envoi" : "Importer"}
          </button>
          {(stickers ?? []).map(s => {
            const mien = s.auteur_id === compte?.id;
            return (
              <div key={s.id} className="chat-sticker-case chat-media-case" style={{ position: "relative", aspectRatio: "1" }}>
                <button onClick={() => onChoisir(s)} title={`Importé par ${mien ? "toi" : s.auteur_nom}`} aria-label="Sticker"
                  className="chat-sticker-choix" style={caseSticker}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urlSticker(s.id)} alt="" loading="lazy" style={imageSticker} />
                </button>
                <EtoileFavori piece={{ type: "sticker", id: s.id, largeur: s.largeur, hauteur: s.hauteur }} />
                {mien && (
                  aRetirer === s.id
                    ? <button onClick={() => retirer(s.id)} className="chat-sticker-retirer confirmer">Retirer ?</button>
                    : <button onClick={() => setARetirer(s.id)} aria-label="Retirer ce sticker" title="Retirer de la bibliothèque" className="chat-sticker-retirer">×</button>
                )}
              </div>
            );
          })}
        </div>
        {stickers?.length === 0 && !erreur && (
          <div style={{ padding: "12px 8px", fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)", textAlign: "center" }}>
            Aucun sticker pour l&apos;instant : importe une image pour lancer la collection.
          </div>
        )}
      </div>
      {erreur && <div style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c" }}>{erreur}</div>}
      <input ref={fichier} type="file" accept={STICKER_TYPES.join(",")} hidden
        onChange={e => { const f = e.target.files?.[0]; if (f) importer(f); }} />
      <div style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>
        Bibliothèque commune à l&apos;équipe · PNG, JPEG, WebP ou GIF animé
      </div>
    </div>
  );
}

const caseSticker: React.CSSProperties = {
  width: "100%", height: "100%", padding: 4, borderRadius: 10, cursor: "pointer",
  border: "2px solid transparent", background: "transparent",
};
const imageSticker: React.CSSProperties = { width: "100%", height: "100%", objectFit: "contain", display: "block" };

/**
 * Prépare une image avant l'envoi : les images fixes sont réduites
 * (côté le plus long à STICKER_COTE_MAX) et converties en WebP, transparence
 * comprise ; un GIF part tel quel pour rester animé.
 */
async function preparer(f: File): Promise<{ fichier: Blob; largeur: number; hauteur: number }> {
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Image illisible."));
      i.src = url;
    });
    const { naturalWidth: l, naturalHeight: h } = img;
    if (!l || !h) throw new Error("Image illisible.");
    if (f.type === "image/gif") {
      if (f.size > STICKER_POIDS_MAX) throw new Error("GIF trop lourd (2 Mo au plus).");
      return { fichier: f, largeur: Math.min(l, 2000), hauteur: Math.min(h, 2000) };
    }
    const echelle = Math.min(1, STICKER_COTE_MAX / Math.max(l, h));
    const largeur = Math.max(1, Math.round(l * echelle)), hauteur = Math.max(1, Math.round(h * echelle));
    const toile = document.createElement("canvas");
    toile.width = largeur; toile.height = hauteur;
    toile.getContext("2d")!.drawImage(img, 0, 0, largeur, hauteur);
    const blob = await new Promise<Blob | null>(ok => toile.toBlob(ok, "image/webp", 0.9));
    // Navigateur sans WebP : PNG, transparence comprise.
    const fichier = blob?.type === "image/webp" ? blob : await new Promise<Blob | null>(ok => toile.toBlob(ok, "image/png"));
    if (!fichier) throw new Error("Conversion impossible.");
    if (fichier.size > STICKER_POIDS_MAX) throw new Error("Image trop lourde, même réduite.");
    return { fichier, largeur, hauteur };
  } finally {
    URL.revokeObjectURL(url);
  }
}
