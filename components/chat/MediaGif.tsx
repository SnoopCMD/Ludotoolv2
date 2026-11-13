"use client";

import { useState } from "react";
import type { MediaGif } from "../../lib/chat";

/**
 * Un GIF GIPHY. La version vidéo (mp4) est bien plus légère que le .gif :
 * on la préfère, muette et en boucle. Si le navigateur ne sait pas la lire,
 * on repasse sur l'image animée.
 */
export default function MediaGifVue({ gif, largeur, titre, className, style }: {
  gif: MediaGif; largeur: number; titre?: string; className?: string; style?: React.CSSProperties;
}) {
  const [sansVideo, setSansVideo] = useState(false);
  const l = Math.min(largeur, gif.largeur * 2);
  const h = Math.round(l * gif.hauteur / gif.largeur);
  const commun = { width: l, height: h, display: "block", objectFit: "cover" as const, ...style };
  return gif.mp4 && !sansVideo
    ? <video src={gif.mp4} poster={gif.url} autoPlay loop muted playsInline aria-label={titre || "GIF"}
        onError={() => setSansVideo(true)} className={className} style={commun} />
    // eslint-disable-next-line @next/next/no-img-element
    : <img src={gif.url} alt={titre || "GIF"} loading="lazy" className={className} style={commun} />;
}
