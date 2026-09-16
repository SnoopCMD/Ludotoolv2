"use client";
import type { ComponentProps } from "react";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ContenuPDF } from "./ContenuPDF";

// Chargé via next/dynamic({ ssr: false }) : @react-pdf/renderer ne doit jamais
// entrer dans le bundle serveur du worker (init WASM/fontkit trop coûteuse).
type Props = {
  contenus: ComponentProps<typeof ContenuPDF>["contenus"];
  fileName: string;
  children: ComponentProps<typeof PDFDownloadLink>["children"];
};

export default function LienPDFContenu({ contenus, fileName, children }: Props) {
  return (
    <PDFDownloadLink document={<ContenuPDF contenus={contenus} />} fileName={fileName}>
      {children}
    </PDFDownloadLink>
  );
}
