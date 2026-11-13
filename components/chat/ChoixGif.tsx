"use client";

import { useEffect, useRef, useState } from "react";
import type { PieceGif, ReponseGifs, ResultatGif } from "../../lib/chat";
import EtoileFavori from "./EtoileFavori";
import { useFavoris } from "./favoris";
import MediaGifVue from "./MediaGif";

/**
 * Recherche et choix d'un GIF (GIPHY, via `GET /api/chat/gifs`). Sans
 * recherche : ses GIF favoris, puis ceux du moment. Une étoile sur chaque GIF
 * l'ajoute aux favoris ou l'en retire. Sert à l'envoi dans une discussion comme aux
 * réactions volantes.
 */
export default function ChoixGif({ onChoisir, hauteur = 260 }: { onChoisir: (g: ResultatGif) => void; hauteur?: number }) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<ResultatGif[]>([]);
  const [suite, setSuite] = useState<number | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const champ = useRef<HTMLInputElement>(null);
  const requete = useRef(0);
  const { favoris } = useFavoris();
  const favorisGif = favoris.filter((f): f is PieceGif => f.type === "gif");
  const enRecherche = q.trim() !== "";

  const charger = async (texte: string, offset: number) => {
    const n = ++requete.current;
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch(`/api/chat/gifs?q=${encodeURIComponent(texte)}&offset=${offset}`);
      const d = await r.json() as ReponseGifs & { error?: string };
      if (n !== requete.current) return; // une frappe plus récente a pris le relais
      if (!r.ok) throw new Error(d.error || "Recherche impossible.");
      setGifs(g => offset ? [...g, ...d.gifs] : d.gifs);
      setSuite(d.suite);
    } catch (e) {
      if (n === requete.current) setErreur((e as Error).message);
    } finally {
      if (n === requete.current) setChargement(false);
    }
  };

  // Recherche au fil de la frappe, une fois qu'on s'arrête de taper.
  useEffect(() => {
    const t = setTimeout(() => charger(q.trim(), 0), q ? 350 : 0);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => { champ.current?.focus(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <input ref={champ} value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher un GIF…"
        className="pop-input" style={{ height: 34, fontSize: 13, padding: "0 10px" }} />
      <div style={{ height: hauteur, overflowY: "auto", borderRadius: 8 }}>
        {erreur ? (
          <div style={{ padding: 12, fontSize: 12, fontWeight: 700, color: "rgba(0,0,0,0.6)", textAlign: "center" }}>{erreur}</div>
        ) : (
          <>
            {!enRecherche && favorisGif.length > 0 && (
              <>
                <div className="chat-section-titre">★ Mes favoris</div>
                <Mosaique gifs={favorisGif} onChoisir={onChoisir} />
                <div className="chat-section-titre" style={{ marginTop: 8 }}>Du moment</div>
              </>
            )}
            <Mosaique gifs={gifs} onChoisir={onChoisir} />
            {!chargement && gifs.length === 0 && (
              <div style={{ padding: 12, fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.5)", textAlign: "center" }}>Aucun GIF trouvé.</div>
            )}
            {chargement && <div style={{ padding: 8, fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.45)", textAlign: "center" }}>Chargement…</div>}
            {!chargement && suite !== null && (
              <button onClick={() => charger(q.trim(), suite)} className="pop-btn pop-btn-outline"
                style={{ display: "block", margin: "4px auto 2px", fontSize: 11, padding: "4px 12px" }}>Plus de GIF</button>
            )}
          </>
        )}
      </div>
      {/* Attribution demandée par les conditions d'utilisation de GIPHY. */}
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(0,0,0,0.4)", textAlign: "right" }}>
        Powered by GIPHY
      </div>
    </div>
  );
}

/** Deux colonnes façon mosaïque : chaque GIF garde ses proportions. */
function Mosaique({ gifs, onChoisir }: { gifs: ResultatGif[]; onChoisir: (g: ResultatGif) => void }) {
  return (
    <div style={{ columnCount: 2, columnGap: 4 }}>
      {gifs.map(g => (
        <div key={g.id} className="chat-media-case" style={{ position: "relative", marginBottom: 4, breakInside: "avoid" }}>
          <button onClick={() => onChoisir(g)} title={g.titre} aria-label={g.titre || "GIF"}
            className="chat-gif-choix" style={{
              display: "block", width: "100%", padding: 0, border: "none", borderRadius: 6,
              overflow: "hidden", cursor: "pointer", background: "var(--cream2)",
            }}>
            <MediaGifVue gif={g} largeur={400} titre={g.titre} style={{ width: "100%", height: "auto", aspectRatio: `${g.largeur} / ${g.hauteur}` }} />
          </button>
          <EtoileFavori piece={{ type: "gif", id: g.id, titre: g.titre, url: g.url, mp4: g.mp4, largeur: g.largeur, hauteur: g.hauteur }} />
        </div>
      ))}
    </div>
  );
}
