"use client";
import { useState } from "react";
import { pdf } from "@react-pdf/renderer";
import { ContenuPDF } from "./ContenuPDF";
import { EtiquettesPDF } from "./EtiquettesPDF";

// Chargé via next/dynamic({ ssr: false }) : @react-pdf/renderer ne doit jamais
// entrer dans le bundle serveur du worker (init WASM/fontkit trop coûteuse).
//
// Les PDF sont construits au clic, pas à chaque changement de la sélection : on
// peut en produire deux d'un coup (étiquettes et contenu des mêmes jeux).

export type DocumentImpression =
  | { type: "contenu"; fileName: string; contenus: Record<string, any[]> } // eslint-disable-line @typescript-eslint/no-explicit-any
  | { type: "etiquettes"; fileName: string; etiquettesParCouleur: Parameters<typeof EtiquettesPDF>[0]["etiquettesParCouleur"] };

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function BoutonImpression({ documents, libelle, desactive, avant, style }: {
  /** Les PDF à produire, dans l'ordre. */
  documents: () => DocumentImpression[];
  libelle: React.ReactNode;
  desactive?: boolean;
  /** Appelé avant la génération (enregistrement, validation des étapes). */
  avant?: () => Promise<void> | void;
  style?: React.CSSProperties;
}) {
  const [enCours, setEnCours] = useState(false);

  const generer = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      const docs = documents();
      // La validation ne doit pas bloquer l'impression si le réseau flanche.
      const validation = Promise.resolve(avant?.()).catch(() => {});
      for (const d of docs) {
        const element = d.type === "contenu"
          ? <ContenuPDF contenus={d.contenus} />
          : <EtiquettesPDF etiquettesParCouleur={d.etiquettesParCouleur} />;
        telecharger(await pdf(element).toBlob(), d.fileName);
      }
      await validation;
    } catch (e) {
      alert(`La génération du PDF a échoué : ${(e as Error).message}`);
    } finally {
      setEnCours(false);
    }
  };

  return (
    <button onClick={generer} disabled={desactive || enCours} className="pop-btn pop-btn-dark"
      style={{ width: "100%", justifyContent: "center", opacity: desactive || enCours ? 0.45 : 1, cursor: desactive || enCours ? "not-allowed" : "pointer", ...style }}>
      {enCours ? "PRÉPARATION DU PDF…" : libelle}
    </button>
  );
}
