"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import CompteMenu from "./CompteMenu";

type Page = "accueil" | "inventaire" | "atelier" | "agenda" | "store" | "catalogage" | "jv" | "suggestions";

const NAV_ITEMS: { href: string; label: string; page: Page; color: string }[] = [
  { href: "/",             label: "Accueil",      page: "accueil",     color: "#facc15" },
  { href: "/inventaire",   label: "Inventaire",   page: "inventaire",  color: "#60a5fa" },
  { href: "/atelier",      label: "Atelier",      page: "atelier",     color: "#a8e063" },
  { href: "/agenda",       label: "Agenda",       page: "agenda",      color: "#c084fc" },
  { href: "/store",        label: "Store",        page: "store",       color: "#f472b6" },
  { href: "/catalogage",   label: "Catalogage",   page: "catalogage",  color: "#fb923c" },
  { href: "/jv",           label: "Jeux Vidéo",   page: "jv",          color: "#f87171" },
];

const SUGG_ITEM = { href: "/suggestions", label: "💡 Suggestions", page: "suggestions" as Page, color: "#a78bfa" };

export default function NavBar({ current }: { current?: Page }) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);
  const [hoveredPage, setHoveredPage] = useState<Page | null>(null);
  const [menuOuvert, setMenuOuvert] = useState(false);

  // Derive active page from prop or pathname
  const activePage: Page = current ?? (
    NAV_ITEMS.find(i => i.href !== "/" && pathname.startsWith(i.href))?.page ??
    (pathname === "/" ? "accueil" : "accueil")
  );

  useEffect(() => {
    const fetchCount = async () => {
      const data = await fetch('/api/navbar-counts', { cache: 'no-store' }).then(r => r.json() as Promise<{ total: number }>).catch(() => ({ total: 0 }));
      setAlertCount(data.total ?? 0);
    };
    fetchCount();
  }, []);

  // Tiroir ouvert : on bloque le défilement du fond, sinon le doigt fait
  // glisser la page derrière le panneau.
  useEffect(() => {
    if (!menuOuvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = precedent; };
  }, [menuOuvert]);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: "var(--cream)",
        borderBottom: "3px solid var(--ink)",
        padding: "0 var(--page-pad-x)",
        display: "flex",
        alignItems: "center",
        height: "var(--nav-h)",
        gap: 0,
        isolation: "isolate",
      }}
    >
      {/* Logo stamp */}
      <Link
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginRight: 20,
          padding: "5px 12px",
          background: "var(--ink)",
          color: "var(--white)",
          borderRadius: 6,
          border: "2px solid var(--ink)",
          boxShadow: "3px 3px 0 rgba(0,0,0,0.25)",
          flexShrink: 0,
          textDecoration: "none",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="1" width="14" height="14" rx="3" fill="#a8e063" />
          <rect x="4" y="5" width="8" height="2" rx="1" fill="#0d0d0d" />
          <rect x="4" y="9" width="5" height="2" rx="1" fill="#0d0d0d" />
        </svg>
        <span className="bc" style={{ fontSize: 20, letterSpacing: "0.05em" }}>LUDOTOOL</span>
      </Link>

      <div className="desktop-only" style={{ width: 2, height: 26, background: "rgba(0,0,0,0.1)", marginRight: 16, borderRadius: 1, flexShrink: 0 }} />

      {/* Nav items principaux */}
      <div className="desktop-only" style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, flexWrap: "nowrap" }}>
        {NAV_ITEMS.map(item => {
          const isActive = item.page === activePage;
          const isHovered = item.page === hoveredPage;
          return (
            <Link key={item.page} href={item.href}
              onMouseEnter={() => setHoveredPage(item.page)}
              onMouseLeave={() => setHoveredPage(null)}
              style={{
                position: "relative",
                background: isActive ? item.color : isHovered ? item.color + "55" : "rgba(0,0,0,0.04)",
                color: isActive || isHovered ? "#0d0d0d" : "rgba(0,0,0,0.52)",
                border: isActive ? "2px solid var(--ink)" : "2px solid transparent",
                borderRadius: 6, padding: "5px 12px", fontWeight: isActive ? 700 : 500, fontSize: 15,
                cursor: "pointer", boxShadow: isActive ? "2px 2px 0 var(--ink)" : "none",
                transform: isActive ? "rotate(-1deg) translateY(-1px)" : "none",
                transition: "background 0.12s, color 0.12s, transform 0.12s, box-shadow 0.12s",
                textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5,
                whiteSpace: "nowrap", fontFamily: "inherit",
              }}>
              {item.label}
              {item.page === "accueil" && alertCount > 0 && <Pastille n={alertCount} />}
            </Link>
          );
        })}
      </div>

      {/* Séparateur + Suggestions isolée à droite */}
      <div className="desktop-only" style={{ width: 1, height: 22, background: "rgba(0,0,0,0.1)", marginLeft: 8, marginRight: 8, flexShrink: 0 }} />
      <div className="desktop-only">
        {(() => {
          const item = SUGG_ITEM;
          const isActive = item.page === activePage;
          const isHovered = item.page === hoveredPage;
          return (
            <Link href={item.href}
              onMouseEnter={() => setHoveredPage(item.page)}
              onMouseLeave={() => setHoveredPage(null)}
              style={{
                background: isActive ? item.color : isHovered ? item.color + "55" : "rgba(0,0,0,0.04)",
                color: isActive || isHovered ? "#0d0d0d" : "rgba(0,0,0,0.45)",
                border: isActive ? "1.5px solid var(--ink)" : "1.5px solid transparent",
                borderRadius: 6, padding: "4px 10px", fontWeight: isActive ? 700 : 500, fontSize: 12,
                cursor: "pointer", boxShadow: isActive ? "2px 2px 0 var(--ink)" : "none",
                transform: isActive ? "rotate(-1deg) translateY(-1px)" : "none",
                transition: "background 0.12s, color 0.12s, transform 0.12s, box-shadow 0.12s",
                textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
                whiteSpace: "nowrap", fontFamily: "inherit", flexShrink: 0,
              }}>
              {item.label}
            </Link>
          );
        })()}
      </div>

      {/* Sur téléphone les onglets disparaissent : on pousse compte + burger à droite. */}
      <div className="mobile-only" style={{ flex: 1 }} />

      <CompteMenu />

      {/* Burger — visible seulement sur téléphone */}
      <button
        className="mobile-only"
        aria-label={menuOuvert ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={menuOuvert}
        onClick={() => setMenuOuvert(o => !o)}
        style={{
          marginLeft: 8, flexShrink: 0,
          width: 40, height: 40, borderRadius: 8,
          background: menuOuvert ? "var(--ink)" : "rgba(0,0,0,0.04)",
          color: menuOuvert ? "var(--cream)" : "var(--ink)",
          border: "2px solid var(--ink)",
          boxShadow: "2px 2px 0 var(--ink)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, position: "relative",
        }}
      >
        <span style={{ display: "flex", flexDirection: "column", gap: 3, width: 18 }}>
          {[0, 1, 2].map(i => (
            <span key={i} style={{ height: 2.5, borderRadius: 2, background: "currentColor" }} />
          ))}
        </span>
        {/* La pastille d'alertes doit rester visible même menu fermé. */}
        {!menuOuvert && alertCount > 0 && (
          <span style={{ position: "absolute", top: -7, right: -7, display: "flex" }}>
            <Pastille n={alertCount} />
          </span>
        )}
      </button>

      {menuOuvert && <TiroirMobile activePage={activePage} alertCount={alertCount} onFermer={() => setMenuOuvert(false)} />}

      {/* Rainbow strip */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(90deg, ${NAV_ITEMS.map((item, i, arr) => {
          const pct = (100 / arr.length);
          return `${item.color} ${i * pct}%, ${item.color} ${(i + 1) * pct}%`;
        }).join(", ")})`,
        pointerEvents: "none",
      }} />
    </nav>
  );
}

/** Compteur d'alertes rouge, partagé entre l'onglet Accueil et le burger. */
function Pastille({ n }: { n: number }) {
  return (
    <span style={{
      minWidth: 17, height: 17, background: "#f87171", color: "#fff", fontSize: 9, fontWeight: 900,
      borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: "0 3px", border: "1.5px solid var(--ink)", boxShadow: "1px 1px 0 var(--ink)", marginLeft: 2,
    }}>
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** Panneau de navigation plein écran, sous la barre, sur téléphone. */
function TiroirMobile({ activePage, alertCount, onFermer }: {
  activePage: Page; alertCount: number; onFermer: () => void;
}) {
  const items = [...NAV_ITEMS, SUGG_ITEM];
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onFermer(); }}
      style={{
        position: "fixed", top: "var(--nav-h)", left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.45)", zIndex: 90,
      }}
    >
      <div style={{
        background: "var(--cream)",
        borderBottom: "3px solid var(--ink)",
        padding: "12px var(--page-pad-x) calc(14px + env(safe-area-inset-bottom))",
        display: "flex", flexDirection: "column", gap: 8,
        maxHeight: "100%", overflowY: "auto",
        animation: "fadeInUp 0.15s ease-out",
      }}>
        {items.map(item => {
          const isActive = item.page === activePage;
          return (
            <Link key={item.page} href={item.href} onClick={onFermer}
              style={{
                background: isActive ? item.color : "var(--white)",
                color: "var(--ink)",
                border: "2px solid var(--ink)",
                borderRadius: 8,
                padding: "0 14px",
                minHeight: "var(--tap)",
                fontWeight: isActive ? 800 : 600,
                fontSize: 16,
                boxShadow: isActive ? "3px 3px 0 var(--ink)" : "2px 2px 0 rgba(0,0,0,0.18)",
                textDecoration: "none",
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: "inherit",
              }}>
              {/* Pastille de couleur : garde le repère visuel du desktop même
                  quand l'onglet n'est pas actif. */}
              <span style={{
                width: 10, height: 10, borderRadius: 3, flexShrink: 0,
                background: item.color, border: "1.5px solid var(--ink)",
                opacity: isActive ? 0 : 1,
              }} />
              {item.label}
              {item.page === "accueil" && alertCount > 0 && <Pastille n={alertCount} />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
