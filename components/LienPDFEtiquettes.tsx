"use client";
import type { ComponentProps } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { EtiquettesPDF } from "./EtiquettesPDF";

// Chargé via next/dynamic({ ssr: false }) : @react-pdf/renderer ne doit jamais
// entrer dans le bundle serveur du worker (init WASM/fontkit trop coûteuse).
type Props = {
  etiquettesParCouleur: ComponentProps<typeof EtiquettesPDF>["etiquettesParCouleur"];
  fileName: string;
  children: ComponentProps<typeof PDFDownloadLink>["children"];
};

export default function LienPDFEtiquettes({ etiquettesParCouleur, fileName, children }: Props) {
  return (
    <PDFDownloadLink document={<EtiquettesPDF etiquettesParCouleur={etiquettesParCouleur} />} fileName={fileName}>
      {children}
    </PDFDownloadLink>
  );
}
