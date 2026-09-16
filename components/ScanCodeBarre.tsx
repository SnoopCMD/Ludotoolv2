"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "../lib/useIsMobile";

/** Vrai une fois le rendu passé côté navigateur.
 *
 *  Sert à ne toucher ni `navigator` ni `document.body` pendant le rendu
 *  serveur. Un `useEffect` qui poserait un état ferait un rendu en cascade ;
 *  ici React lit l'instantané serveur (false) pour l'hydratation, puis
 *  l'instantané client (true). Le store ne notifie jamais.
 */
const NE_RIEN_ECOUTER = () => () => {};
function useEstClient(): boolean {
  return useSyncExternalStore(NE_RIEN_ECOUTER, () => true, () => false);
}

/** Formats lus : les codes produit du commerce (EAN/UPC) et les codes
 *  linéaires utilisés par les étiquettes internes (Syracuse). */
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] as const;

type Detecteur = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Charge le lecteur à la demande.
 *
 *  `BarcodeDetector` est natif sur Chrome/Edge Android : là, rien n'est
 *  téléchargé. Ailleurs (Safari iOS, Firefox) le ponyfill retombe sur
 *  zxing-wasm, dont le binaire d'environ 1 Mo est servi depuis `public/`
 *  et non depuis le CDN jsDelivr que la bibliothèque vise par défaut —
 *  l'outil doit marcher sans dépendre d'un tiers.
 *
 *  L'import est dynamique pour que rien de tout ça n'entre dans le bundle
 *  initial des pages.
 */
async function chargerDetecteur(): Promise<Detecteur> {
  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  prepareZXingModule({
    overrides: {
      locateFile: (chemin: string, prefixe: string) =>
        chemin.endsWith(".wasm") ? "/zxing_reader.wasm" : prefixe + chemin,
    },
  });
  return new BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detecteur;
}

/** Retour affiché dans la caméra en mode continu, après chaque lecture. */
export type RetourScan = { texte: string; ton: "ok" | "alerte" | "erreur" | "attente" };

const COULEUR_TON: Record<RetourScan["ton"], string> = {
  ok: "var(--vert)", alerte: "#ff9f1c", erreur: "var(--rouge)", attente: "var(--yellow)",
};

/** Bouton caméra à coller contre un champ de saisie de code.
 *
 *  Ne s'affiche que sur téléphone et seulement si le navigateur expose une
 *  caméra : `navigator.mediaDevices` est absent hors contexte sécurisé, donc
 *  en HTTP le bouton disparaît de lui-même plutôt que d'échouer au clic.
 *
 *  En mode `continu`, la caméra reste ouverte après chaque lecture (pour
 *  enchaîner les boîtes) et affiche `retour`, le verdict que le parent a tiré
 *  du dernier code, pour qu'on n'ait pas à quitter la caméra pour le voir.
 */
export default function BoutonScan({ onScan, titre = "Scanner un code-barres", continu = false, retour = null }: {
  onScan: (code: string) => void;
  titre?: string;
  continu?: boolean;
  retour?: RetourScan | null;
}) {
  const isMobile = useIsMobile();
  const estClient = useEstClient();
  const [ouvert, setOuvert] = useState(false);

  if (!isMobile || !estClient || !navigator.mediaDevices?.getUserMedia) return null;

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} title={titre} aria-label={titre}
        style={{
          flexShrink: 0, width: 44, height: 44, borderRadius: 8,
          background: "var(--white)", border: "2px solid var(--ink)",
          boxShadow: "2px 2px 0 var(--ink)", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
        }}>
        <svg width="22" height="16" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="2" y1="2" x2="2" y2="16" /><line x1="5" y1="2" x2="5" y2="16" />
          <line x1="8" y1="2" x2="8" y2="16" strokeWidth="2.8" /><line x1="12" y1="2" x2="12" y2="16" />
          <line x1="15" y1="2" x2="15" y2="16" /><line x1="18" y1="2" x2="18" y2="16" strokeWidth="2.8" />
          <line x1="22" y1="2" x2="22" y2="16" />
        </svg>
      </button>
      {ouvert && (
        <VueCamera
          onFermer={() => setOuvert(false)}
          onCode={code => { if (!continu) setOuvert(false); onScan(code); }}
          continu={continu}
          retour={retour}
        />
      )}
    </>
  );
}

type PropsCamera = {
  onCode: (code: string) => void;
  onFermer: () => void;
  continu: boolean;
  retour: RetourScan | null;
};

/** Le plein écran de la caméra est monté directement sous `<body>`.
 *
 *  Sans ça, son `z-index` resterait enfermé dans le contexte d'empilement du
 *  bloc qui contient le bouton — l'en-tête collant de l'inventaire est en
 *  `z-index: 40`, la barre de navigation en 100 : le bandeau du scanner, et
 *  donc son bouton de fermeture, passaient dessous.
 */
function VueCamera(props: PropsCamera) {
  if (typeof document === "undefined") return null;
  return createPortal(<PleinEcranCamera {...props} />, document.body);
}

/** Réglages caméra que les navigateurs exposent sans être au standard :
 *  Chrome Android les gère, Safari iOS presque pas. Tout est donc optionnel
 *  et vérifié via `getCapabilities()` avant usage. */
type Capacites = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};
type Reglages = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
  zoom?: number;
};

function PleinEcranCamera({ onCode, onFermer, continu, retour }: PropsCamera) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pisteRef = useRef<MediaStreamTrack | null>(null);
  /** `onCode` est lu via une ref : le parent le recrée à chaque rendu, et en
   *  mode continu il se re-rend à chaque lecture. Le mettre en dépendance de
   *  l'effet relancerait la caméra à chaque code. */
  const onCodeRef = useRef(onCode);
  useEffect(() => { onCodeRef.current = onCode; }, [onCode]);
  const [etat, setEtat] = useState<"demarrage" | "lecture" | "erreur">("demarrage");
  const [erreur, setErreur] = useState("");
  const [capacites, setCapacites] = useState<Capacites | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [torche, setTorche] = useState(false);
  const [diagnostic, setDiagnostic] = useState("");

  /** Redemande une mise au point.
   *
   *  Beaucoup d'appareils ne refont le point que sur changement de
   *  contrainte : on repasse donc par `manual` avant de revenir en continu,
   *  sinon l'image reste figée sur le point choisi à l'ouverture.
   */
  const refaireLePoint = async () => {
    const piste = pisteRef.current;
    const modes = (piste?.getCapabilities?.() as Capacites | undefined)?.focusMode;
    if (!piste || !modes?.length) return;
    try {
      if (modes.includes("manual") && modes.includes("continuous")) {
        await piste.applyConstraints({ advanced: [{ focusMode: "manual" } as Reglages] });
        await new Promise(r => setTimeout(r, 80));
      }
      const vise = modes.includes("continuous") ? "continuous" : modes[0];
      await piste.applyConstraints({ advanced: [{ focusMode: vise } as Reglages] });
    } catch {
      // Un appareil peut annoncer un mode puis le refuser : sans gravité.
    }
  };

  useEffect(() => {
    let flux: MediaStream | null = null;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    let annule = false;
    let enCours = false;

    (async () => {
      try {
        // Résolution la plus haute acceptée : un code-barres occupe peu de
        // pixels, et c'est souvent ça qui fait échouer la lecture avant même
        // la question de la netteté. `facingMode` demande la caméra arrière.
        flux = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" } as Reglages],
          },
          audio: false,
        });
        if (annule) { flux.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = flux;
        await video.play();

        const piste = flux.getVideoTracks()[0];
        pisteRef.current = piste;
        const caps = (piste.getCapabilities?.() ?? {}) as Capacites;
        setCapacites(caps);
        await refaireLePoint();

        // Un léger zoom permet de cadrer le code de plus loin, au-delà de la
        // distance minimale de mise au point de l'objectif : c'est souvent ça
        // qui débloque une image floue de près.
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const depart = Math.min(caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.25, caps.zoom.max);
          setZoom(depart);
          try { await piste.applyConstraints({ advanced: [{ zoom: depart } as Reglages] }); } catch {}
        }

        const detecteur = await chargerDetecteur();
        if (annule) return;
        setEtat("lecture");

        const reglages = piste.getSettings();
        setDiagnostic([
          `${reglages.width ?? "?"}x${reglages.height ?? "?"}`,
          caps.focusMode?.length ? `focus ${caps.focusMode.join("/")}` : "focus non reglable",
          caps.zoom ? `zoom ${caps.zoom.min}-${caps.zoom.max}` : "zoom non reglable",
          caps.torch ? "torche" : "sans torche",
        ].join(" · "));

        // En continu, le même code reste dans le champ tant que la boîte
        // n'a pas bougé : on le retient pour ne pas le renvoyer en boucle,
        // et on laisse un court délai avant toute nouvelle lecture.
        let dernierCode = "";
        let lisibleApres = 0;
        let imagesVides = 0;

        minuteur = setInterval(async () => {
          // Le repli WASM peut dépasser 300 ms par image : sans ce verrou les
          // lectures s'empileraient et bloqueraient le rendu.
          if (enCours || Date.now() < lisibleApres) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2) return;
          enCours = true;
          try {
            const trouves = await detecteur.detect(v);
            const code = trouves[0]?.rawValue?.trim();
            if (code && !continu) {
              if (minuteur) clearInterval(minuteur);
              navigator.vibrate?.(60);
              onCodeRef.current(code);
            } else if (code && code !== dernierCode) {
              dernierCode = code;
              imagesVides = 0;
              lisibleApres = Date.now() + 1200;
              navigator.vibrate?.(60);
              onCodeRef.current(code);
            } else if (code) {
              imagesVides = 0;
            } else if (++imagesVides >= 5) {
              // Plus rien devant l'objectif depuis ~1,5 s : le prochain code
              // peut être le même (une autre boîte du même jeu). Une image
              // floue isolée ne suffit pas, sinon on relirait la même boîte.
              dernierCode = "";
            }
          } catch {
            // Une image illisible n'est pas une erreur : on retente.
          } finally {
            enCours = false;
          }
        }, 300);
      } catch (e: unknown) {
        if (annule) return;
        const nom = (e as { name?: string })?.name;
        setErreur(
          nom === "NotAllowedError" ? "Accès à la caméra refusé. Autorise-le dans les réglages du navigateur."
          : nom === "NotFoundError" ? "Aucune caméra détectée sur cet appareil."
          : "Impossible d'ouvrir la caméra."
        );
        setEtat("erreur");
      }
    })();

    return () => {
      annule = true;
      if (minuteur) clearInterval(minuteur);
      flux?.getTracks().forEach(t => t.stop());
      pisteRef.current = null;
    };
  }, [continu]);

  const changerZoom = async (v: number) => {
    setZoom(v);
    try { await pisteRef.current?.applyConstraints({ advanced: [{ zoom: v } as Reglages] }); } catch {}
  };

  const basculerTorche = async () => {
    const suivant = !torche;
    setTorche(suivant);
    try { await pisteRef.current?.applyConstraints({ advanced: [{ torch: suivant } as Reglages] }); } catch {}
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top) + 10px) 14px 10px",
        background: "var(--ink)", color: "var(--cream)", flexShrink: 0, gap: 10,
      }}>
        <span className="bc" style={{ fontSize: 16, letterSpacing: "0.04em" }}>SCANNER UN CODE</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {capacites?.torch && (
            <button type="button" onClick={basculerTorche} aria-label="Torche"
              style={{
                width: 40, height: 40, borderRadius: 8,
                background: torche ? "var(--yellow)" : "rgba(255,255,255,0.14)",
                border: "none", color: torche ? "var(--ink)" : "var(--cream)",
                fontSize: 18, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>🔦</button>
          )}
          <button type="button" onClick={onFermer} aria-label="Fermer le scanner"
            style={{
              width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.14)",
              border: "none", color: "var(--cream)", fontSize: 18, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>✕</button>
        </div>
      </div>

      {/* Taper l'image redemande le point : c'est le geste attendu quand la
          scène reste floue, et le seul recours là où le focus continu n'est
          pas exposé. */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }} onClick={refaireLePoint}>
        {/* `playsInline` et `muted` sont indispensables sur iOS : sans eux
            Safari ouvre la vidéo en plein écran natif au lieu de l'incruster. */}
        <video ref={videoRef} playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />

        {/* Verdict du dernier scan, par-dessus l'image : en continu on ne
            quitte pas la caméra, c'est ici qu'on lit le résultat. */}
        {continu && retour && (
          <div key={retour.texte} style={{
            position: "absolute", top: 12, left: 12, right: 12, zIndex: 2,
            background: COULEUR_TON[retour.ton], color: retour.ton === "erreur" ? "#fff" : "var(--ink)",
            border: "2.5px solid var(--ink)", borderRadius: 10, padding: "10px 14px",
            fontWeight: 800, fontSize: 14, lineHeight: 1.3, boxShadow: "3px 3px 0 var(--ink)",
          }}>
            {retour.texte}
          </div>
        )}

        {etat === "lecture" && (
          <div style={{
            position: "absolute", top: "50%", left: "8%", right: "8%",
            transform: "translateY(-50%)", height: 150,
            border: "3px solid var(--yellow)", borderRadius: 12,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)", pointerEvents: "none",
          }} />
        )}

        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          padding: "14px 18px calc(env(safe-area-inset-bottom) + 16px)",
          background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
          color: "#fff", display: "flex", flexDirection: "column", gap: 10,
        }}>
          {etat === "lecture" && capacites?.zoom && zoom !== null && (
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 700 }}
              onClick={e => e.stopPropagation()}>
              <span>Zoom</span>
              <input type="range" style={{ flex: 1 }}
                min={capacites.zoom.min} max={capacites.zoom.max} step={capacites.zoom.step || 0.1}
                value={zoom} onChange={e => changerZoom(Number(e.target.value))} />
            </label>
          )}
          <p style={{ textAlign: "center", fontWeight: 600, fontSize: 14, margin: 0 }}>
            {etat === "demarrage" && "Ouverture de la caméra…"}
            {etat === "lecture" && "Recule un peu, cadre le code, puis tape l'écran pour refaire le point"}
            {etat === "erreur" && erreur}
          </p>
          {etat === "lecture" && diagnostic && (
            <p style={{ textAlign: "center", fontSize: 10, opacity: 0.55, margin: 0, fontFamily: "monospace" }}>
              {diagnostic}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
