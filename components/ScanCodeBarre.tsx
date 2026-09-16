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
 *  Chrome/Opera Android les gèrent, Safari iOS presque pas. Tout est donc
 *  optionnel et vérifié via `getCapabilities()` avant usage. */
type Capacites = MediaTrackCapabilities & {
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step: number };
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};
type Reglages = MediaTrackConstraintSet & {
  focusMode?: string;
  focusDistance?: number;
  pointsOfInterest?: { x: number; y: number }[];
  torch?: boolean;
  zoom?: number;
};
type ReglagesLus = MediaTrackSettings & {
  focusMode?: string;
  focusDistance?: number;
  zoom?: number;
};

/** Préférences retenues d'un scan à l'autre : les étiquettes se lisent
 *  toujours à peu près à la même distance, avec la même caméra. */
const CLE_CAMERA = "scan.cameraId";
const CLE_NETTETE = "scan.focusDistance";
function lirePref(cle: string): string | null {
  try { return localStorage.getItem(cle); } catch { return null; }
}
function ecrirePref(cle: string, valeur: string | null) {
  try {
    if (valeur === null) localStorage.removeItem(cle);
    else localStorage.setItem(cle, valeur);
  } catch {}
}

/** Caméras arrière candidates : on écarte celles dont le libellé dit
 *  « avant », le reste (principale, grand-angle, macro…) est proposé au
 *  choix, car `facingMode: environment` tombe parfois sur un capteur sans
 *  autofocus. */
function estCameraAvant(d: MediaDeviceInfo): boolean {
  return /front|avant|face|user|selfie/i.test(d.label);
}

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
  /** `null` = autofocus continu ; sinon distance fixée par le curseur. */
  const [nettete, setNettete] = useState<number | null>(null);
  const netteteRef = useRef<number | null>(null);
  useEffect(() => { netteteRef.current = nettete; }, [nettete]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(() => lirePref(CLE_CAMERA));
  const [diagnostic, setDiagnostic] = useState("");
  const [reglagesLus, setReglagesLus] = useState("");

  /** Applique un réglage sur la piste et relit ce que l'appareil a
   *  effectivement retenu : c'est la seule façon de savoir si le focus a
   *  vraiment bougé, un appareil pouvant accepter la contrainte sans en tenir
   *  compte. */
  const appliquer = async (reglages: Reglages): Promise<boolean> => {
    const piste = pisteRef.current;
    if (!piste) return false;
    let ok = true;
    try { await piste.applyConstraints({ advanced: [reglages] }); } catch { ok = false; }
    const lus = piste.getSettings() as ReglagesLus;
    setReglagesLus([
      lus.focusMode ? `focus ${lus.focusMode}` : null,
      lus.focusDistance !== undefined ? `dist ${lus.focusDistance}` : null,
      lus.zoom !== undefined ? `zoom ${lus.zoom}` : null,
    ].filter(Boolean).join(" · "));
    return ok;
  };

  /** Mise au point manuelle à une distance donnée (mémorisée), ou retour
   *  à l'autofocus continu si `distance` est null. */
  const reglerNettete = async (distance: number | null) => {
    setNettete(distance);
    netteteRef.current = distance;
    ecrirePref(CLE_NETTETE, distance === null ? null : String(distance));
    if (distance === null) await appliquer({ focusMode: "continuous" });
    else await appliquer({ focusMode: "manual", focusDistance: distance });
  };

  /** Tap sur l'image : refait le point à l'endroit touché.
   *
   *  `single-shot` + `pointsOfInterest` est le vrai « tap to focus » de
   *  Chromium ; à défaut on repasse par `manual` avant de revenir en continu,
   *  car beaucoup d'appareils ne refont le point que sur changement de mode.
   *  En netteté manuelle (curseur), le tap ne fait rien : c'est le curseur
   *  qui commande.
   */
  const refaireLePoint = async (e?: React.MouseEvent<HTMLElement>) => {
    const piste = pisteRef.current;
    const modes = (piste?.getCapabilities?.() as Capacites | undefined)?.focusMode;
    if (!piste || !modes?.length || netteteRef.current !== null) return;
    let point: { x: number; y: number } | undefined;
    if (e) {
      const r = e.currentTarget.getBoundingClientRect();
      point = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    }
    if (modes.includes("single-shot")) {
      await appliquer({ focusMode: "single-shot", ...(point ? { pointsOfInterest: [point] } : {}) });
      if (modes.includes("continuous")) {
        await new Promise(r => setTimeout(r, 1500));
        if (pisteRef.current === piste && netteteRef.current === null) await appliquer({ focusMode: "continuous" });
      }
      return;
    }
    if (modes.includes("manual") && modes.includes("continuous")) {
      await appliquer({ focusMode: "manual" });
      await new Promise(r => setTimeout(r, 80));
    }
    await appliquer({ focusMode: modes.includes("continuous") ? "continuous" : modes[0] });
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
        // la question de la netteté. Une caméra choisie précédemment prime
        // sur `facingMode` ; si elle n'existe plus, on retombe sur l'arrière.
        const base = {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" } as Reglages],
        };
        try {
          flux = await navigator.mediaDevices.getUserMedia({
            video: cameraId ? { ...base, deviceId: { exact: cameraId } } : { ...base, facingMode: { ideal: "environment" } },
            audio: false,
          });
        } catch (e) {
          if (!cameraId) throw e;
          ecrirePref(CLE_CAMERA, null);
          flux = await navigator.mediaDevices.getUserMedia({
            video: { ...base, facingMode: { ideal: "environment" } },
            audio: false,
          });
        }
        if (annule) { flux.getTracks().forEach(t => t.stop()); return; }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = flux;
        await video.play();

        const piste = flux.getVideoTracks()[0];
        pisteRef.current = piste;
        const caps = (piste.getCapabilities?.() ?? {}) as Capacites;
        setCapacites(caps);

        // Les libellés ne sont lisibles qu'une fois la permission accordée,
        // d'où l'énumération après `getUserMedia`.
        try {
          const tous = await navigator.mediaDevices.enumerateDevices();
          setCameras(tous.filter(d => d.kind === "videoinput" && !estCameraAvant(d)));
        } catch {}

        // Netteté : distance mémorisée si l'appareil sait la fixer, sinon
        // autofocus continu relancé.
        const memo = Number(lirePref(CLE_NETTETE));
        if (caps.focusDistance && memo > 0 && caps.focusMode?.includes("manual")) {
          const d = Math.min(Math.max(memo, caps.focusDistance.min), caps.focusDistance.max);
          setNettete(d);
          netteteRef.current = d;
          await appliquer({ focusMode: "manual", focusDistance: d });
        } else {
          await refaireLePoint();
        }

        // Un léger zoom permet de cadrer le code de plus loin, au-delà de la
        // distance minimale de mise au point de l'objectif : c'est souvent ça
        // qui débloque une image floue de près.
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          const depart = Math.min(caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.25, caps.zoom.max);
          setZoom(depart);
          await appliquer({ zoom: depart });
        }

        const detecteur = await chargerDetecteur();
        if (annule) return;
        setEtat("lecture");

        const reglages = piste.getSettings();
        setDiagnostic([
          piste.label || "caméra",
          `${reglages.width ?? "?"}x${reglages.height ?? "?"}`,
          caps.focusMode?.length ? `focus ${caps.focusMode.join("/")}` : "focus non reglable",
          caps.focusDistance ? `dist ${caps.focusDistance.min}-${caps.focusDistance.max}` : "dist non reglable",
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [continu, cameraId]);

  const changerZoom = async (v: number) => {
    setZoom(v);
    await appliquer({ zoom: v });
  };

  const basculerTorche = async () => {
    const suivant = !torche;
    setTorche(suivant);
    await appliquer({ torch: suivant });
  };

  /** Passe à la caméra arrière suivante ; l'effet relance le flux. */
  const cameraSuivante = () => {
    if (cameras.length < 2) return;
    const actuelle = pisteRef.current?.getSettings().deviceId;
    const i = cameras.findIndex(c => c.deviceId === actuelle);
    const suivante = cameras[(i + 1) % cameras.length].deviceId;
    ecrirePref(CLE_CAMERA, suivante);
    setEtat("demarrage");
    setCapacites(null);
    setZoom(null);
    setTorche(false);
    setCameraId(suivante);
  };

  const boutonEntete: React.CSSProperties = {
    width: 40, height: 40, borderRadius: 8, background: "rgba(255,255,255,0.14)",
    border: "none", color: "var(--cream)", fontSize: 18, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
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
          {cameras.length > 1 && (
            <button type="button" onClick={cameraSuivante} aria-label="Changer de caméra" title="Changer de caméra"
              style={boutonEntete}>🔄</button>
          )}
          {capacites?.torch && (
            <button type="button" onClick={basculerTorche} aria-label="Torche"
              style={{ ...boutonEntete, background: torche ? "var(--yellow)" : boutonEntete.background, color: torche ? "var(--ink)" : boutonEntete.color }}>🔦</button>
          )}
          <button type="button" onClick={onFermer} aria-label="Fermer le scanner" style={boutonEntete}>✕</button>
        </div>
      </div>

      {/* Taper l'image redemande le point à l'endroit touché : c'est le geste
          attendu quand la scène reste floue. */}
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
          {/* Netteté manuelle : seulement si l'appareil sait fixer une
              distance. « Auto » rend la main à l'autofocus continu. */}
          {etat === "lecture" && capacites?.focusDistance && capacites.focusMode?.includes("manual") && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, fontWeight: 700 }}
              onClick={e => e.stopPropagation()}>
              <span>Netteté</span>
              <span style={{ opacity: 0.7, fontWeight: 500 }}>près</span>
              <input type="range" style={{ flex: 1 }}
                min={capacites.focusDistance.min} max={capacites.focusDistance.max}
                step={capacites.focusDistance.step || 0.01}
                value={nettete ?? capacites.focusDistance.min}
                onChange={e => reglerNettete(Number(e.target.value))} />
              <span style={{ opacity: 0.7, fontWeight: 500 }}>loin</span>
              <button type="button" onClick={() => reglerNettete(null)}
                style={{
                  padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer",
                  background: nettete === null ? "var(--yellow)" : "rgba(255,255,255,0.2)",
                  color: nettete === null ? "var(--ink)" : "#fff", fontWeight: 800, fontSize: 12,
                }}>Auto</button>
            </div>
          )}
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
            {etat === "lecture" && (nettete === null
              ? "Cadre le code, puis tape dessus pour refaire le point"
              : "Netteté fixe : avance ou recule jusqu'à ce que le code soit net")}
            {etat === "erreur" && erreur}
          </p>
          {etat === "lecture" && diagnostic && (
            <p style={{ textAlign: "center", fontSize: 10, opacity: 0.55, margin: 0, fontFamily: "monospace" }}>
              {diagnostic}{reglagesLus ? ` — ${reglagesLus}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
