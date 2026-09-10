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

/** Bouton caméra à coller contre un champ de saisie de code.
 *
 *  Ne s'affiche que sur téléphone et seulement si le navigateur expose une
 *  caméra : `navigator.mediaDevices` est absent hors contexte sécurisé, donc
 *  en HTTP le bouton disparaît de lui-même plutôt que d'échouer au clic.
 */
export default function BoutonScan({ onScan, titre = "Scanner un code-barres" }: {
  onScan: (code: string) => void;
  titre?: string;
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
          onCode={code => { setOuvert(false); onScan(code); }}
        />
      )}
    </>
  );
}

/** Le plein écran de la caméra est monté directement sous `<body>`.
 *
 *  Sans ça, son `z-index` resterait enfermé dans le contexte d'empilement du
 *  bloc qui contient le bouton — l'en-tête collant de l'inventaire est en
 *  `z-index: 40`, la barre de navigation en 100 : le bandeau du scanner, et
 *  donc son bouton de fermeture, passaient dessous.
 */
function VueCamera(props: { onCode: (code: string) => void; onFermer: () => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(<PleinEcranCamera {...props} />, document.body);
}

function PleinEcranCamera({ onCode, onFermer }: { onCode: (code: string) => void; onFermer: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [etat, setEtat] = useState<"demarrage" | "lecture" | "erreur">("demarrage");
  const [erreur, setErreur] = useState<string>("");

  useEffect(() => {
    let flux: MediaStream | null = null;
    let minuteur: ReturnType<typeof setInterval> | null = null;
    let annule = false;

    (async () => {
      try {
        // `facingMode: environment` demande la caméra arrière ; sur un
        // appareil qui n'en a qu'une, le navigateur prend celle-là.
        flux = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
          audio: false,
        });
        if (annule) { flux.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = flux;
        await video.play();

        const detecteur = await chargerDetecteur();
        if (annule) return;
        setEtat("lecture");

        minuteur = setInterval(async () => {
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            const trouves = await detecteur.detect(videoRef.current);
            const code = trouves[0]?.rawValue?.trim();
            if (code) {
              if (minuteur) clearInterval(minuteur);
              navigator.vibrate?.(60);
              onCode(code);
            }
          } catch {
            // Une image illisible n'est pas une erreur : on retente.
          }
        }, 250);
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
    };
  }, [onCode]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999, background: "#000",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "calc(env(safe-area-inset-top) + 10px) 14px 10px",
        background: "var(--ink)", color: "var(--cream)", flexShrink: 0,
      }}>
        <span className="bc" style={{ fontSize: 16, letterSpacing: "0.04em" }}>SCANNER UN CODE</span>
        <button type="button" onClick={onFermer} aria-label="Fermer le scanner"
          style={{
            width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.14)",
            border: "none", color: "var(--cream)", fontSize: 18, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* `playsInline` et `muted` sont indispensables sur iOS : sans eux
            Safari ouvre la vidéo en plein écran natif au lieu de l'incruster. */}
        <video ref={videoRef} playsInline muted
          style={{ width: "100%", height: "100%", objectFit: "cover" }} />

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
          padding: "16px 18px calc(env(safe-area-inset-bottom) + 18px)",
          background: "linear-gradient(transparent, rgba(0,0,0,0.75))",
          color: "#fff", textAlign: "center", fontWeight: 600, fontSize: 14,
        }}>
          {etat === "demarrage" && "Ouverture de la caméra…"}
          {etat === "lecture" && "Cadre le code-barres dans le rectangle"}
          {etat === "erreur" && erreur}
        </div>
      </div>
    </div>
  );
}
