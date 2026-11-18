"use client";
import Link from "next/link";
import type { TypeImpression } from "../lib/impression";

/**
 * En-tête commun aux pages d'impression : retour à l'atelier, titre, et bascule
 * entre étiquettes et contenu (la recherche en cours suit).
 */

const PAGES: { type: TypeImpression; href: string; label: string; icone: string; degrade: string }[] = [
  { type: "etiquettes", href: "/etiquettes", label: "Étiquettes", icone: "🏷", degrade: "linear-gradient(90deg, var(--rouge), var(--orange))" },
  { type: "contenu", href: "/contenu", label: "Contenu", icone: "📋", degrade: "linear-gradient(135deg,#0d0d0d 40%,#60a5fa)" },
];

export default function EnteteImpression({ actuelle, recherche, isMobile }: { actuelle: TypeImpression; recherche: string; isMobile: boolean }) {
  const page = PAGES.find(p => p.type === actuelle)!;
  const suffixe = recherche.trim() ? `?nom=${encodeURIComponent(recherche.trim())}` : "";
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 200, height: 56, background: "var(--cream)", borderBottom: "2.5px solid var(--ink)", display: "flex", alignItems: "center", padding: "0 var(--page-pad-x)", gap: isMobile ? 8 : 16 }}>
      <Link href="/atelier" className="pop-sticker" style={{ background: "var(--ink)", color: "var(--white)", textDecoration: "none", fontSize: 14, flexShrink: 0 }}>
        ← {isMobile ? "" : "Atelier"}
      </Link>
      {!isMobile && (
        <h1 className="bc" style={{ fontSize: 24, letterSpacing: "0.03em", margin: 0, textTransform: "uppercase", background: page.degrade, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Impression {page.label.toLowerCase()}
        </h1>
      )}
      {/* Bascule entre les deux impressions */}
      <nav aria-label="Impression" style={{ marginLeft: "auto", display: "flex", border: "2.5px solid var(--ink)", borderRadius: 10, overflow: "hidden", boxShadow: "2px 2px 0 var(--ink)", flexShrink: 0 }}>
        {PAGES.map((p, i) => {
          const active = p.type === actuelle;
          return (
            <Link key={p.type} href={`${p.href}${suffixe}`} aria-current={active ? "page" : undefined}
              style={{ padding: isMobile ? "6px 10px" : "6px 14px", fontSize: 13, fontWeight: 800, textDecoration: "none", color: active ? "var(--white)" : "var(--ink)",
                background: active ? "var(--ink)" : "var(--white)", borderLeft: i ? "2px solid var(--ink)" : "none", display: "flex", alignItems: "center", gap: 6 }}>
              <span aria-hidden>{p.icone}</span>{p.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/** Case « générer aussi l'autre impression pour les mêmes jeux ». */
export function CaseImpressionDouble({ actuelle, coche, onChange, resume }: {
  actuelle: TypeImpression; coche: boolean; onChange: (v: boolean) => void;
  /** Ce que donnera l'autre impression (nombre imprimé, incomplets ignorés). */
  resume?: string | null;
}) {
  const autre = actuelle === "contenu" ? "les étiquettes" : "les fiches contenu";
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
        <input type="checkbox" checked={coche} onChange={e => onChange(e.target.checked)} style={{ accentColor: "#0d0d0d", width: 17, height: 17, marginTop: 1, flexShrink: 0, cursor: "pointer" }} />
        <span>Générer aussi {autre} des mêmes jeux</span>
      </label>
      {coche && resume && <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.55)", marginTop: 4, paddingLeft: 25 }}>{resume}</div>}
    </div>
  );
}
