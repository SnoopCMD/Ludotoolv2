"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";

type Page = "accueil" | "inventaire" | "atelier" | "agenda" | "store" | "catalogage" | "jv";

const NAV_ITEMS: { href: string; label: string; page: Page; color: string }[] = [
  { href: "/",           label: "Accueil",    page: "accueil",    color: "#facc15" },
  { href: "/inventaire", label: "Inventaire", page: "inventaire", color: "#60a5fa" },
  { href: "/atelier",    label: "Atelier",    page: "atelier",    color: "#a8e063" },
  { href: "/agenda",     label: "Agenda",     page: "agenda",     color: "#c084fc" },
  { href: "/store",      label: "Store",      page: "store",      color: "#f472b6" },
  { href: "/catalogage", label: "Catalogage", page: "catalogage", color: "#fb923c" },
  { href: "/jv",         label: "Jeux Vidéo", page: "jv",         color: "#f87171" },
];

// The 6-color rainbow strip (matches nav items order)
const RAINBOW = NAV_ITEMS.map(i => i.color).join(", ");

export default function NavBar({ current }: { current?: Page }) {
  const pathname = usePathname();
  const [alertCount, setAlertCount] = useState(0);
  const [hoveredPage, setHoveredPage] = useState<Page | null>(null);

  // Derive active page from prop or pathname
  const activePage: Page = current ?? (
    NAV_ITEMS.find(i => i.href !== "/" && pathname.startsWith(i.href))?.page ??
    (pathname === "/" ? "accueil" : "accueil")
  );

  useEffect(() => {
    const fetchCount = async () => {
      const [{ count: alertes }, { count: rappels }, { data: nouveautes }] = await Promise.all([
        supabase.from("alertes").select("*", { count: "exact", head: true }).eq("statut", "active"),
        supabase.from("jeux").select("*", { count: "exact", head: true }).eq("notes_rappel", true),
        supabase.from("jeux").select("date_sortie").eq("etape_nouveaute", true).eq("statut", "En stock").not("date_sortie", "is", null),
      ]);
      const today = new Date();
      const expiredCount = (nouveautes ?? []).filter((j: any) => new Date(j.date_sortie) <= today).length;
      setAlertCount((alertes ?? 0) + (rappels ?? 0) + expiredCount);
    };
    fetchCount();
  }, []);

  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--cream)",
        borderBottom: "3px solid var(--ink)",
        padding: "0 28px",
        display: "flex",
        alignItems: "center",
        height: 64,
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
        <span className="bc" style={{ fontSize: 16, letterSpacing: "0.05em" }}>LUDOTOOL</span>
      </Link>

      <div style={{ width: 2, height: 26, background: "rgba(0,0,0,0.1)", marginRight: 16, borderRadius: 1, flexShrink: 0 }} />

      {/* Nav items — style C+A: per-color stickers */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, flexWrap: "nowrap" }}>
        {NAV_ITEMS.map(item => {
          const isActive = item.page === activePage;
          const isHovered = item.page === hoveredPage;

          return (
            <Link
              key={item.page}
              href={item.href}
              onMouseEnter={() => setHoveredPage(item.page)}
              onMouseLeave={() => setHoveredPage(null)}
              style={{
                position: "relative",
                background: isActive
                  ? item.color
                  : isHovered
                  ? item.color + "55"
                  : "rgba(0,0,0,0.04)",
                color: isActive || isHovered ? "#0d0d0d" : "rgba(0,0,0,0.52)",
                border: isActive ? "2px solid var(--ink)" : "2px solid transparent",
                borderRadius: 6,
                padding: "5px 12px",
                fontWeight: isActive ? 700 : 500,
                fontSize: 13,
                cursor: "pointer",
                boxShadow: isActive ? "2px 2px 0 var(--ink)" : "none",
                transform: isActive ? "rotate(-1deg) translateY(-1px)" : "none",
                transition: "background 0.12s, color 0.12s, transform 0.12s, box-shadow 0.12s",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
            >
              {item.label}
              {/* Alert badge on Accueil */}
              {item.page === "accueil" && alertCount > 0 && (
                <span style={{
                  minWidth: 17,
                  height: 17,
                  background: "#f87171",
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 900,
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 3px",
                  border: "1.5px solid var(--ink)",
                  boxShadow: "1px 1px 0 var(--ink)",
                  marginLeft: 2,
                }}>
                  {alertCount > 99 ? "99+" : alertCount}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Right — new game button + avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button
          className="pop-btn pop-btn-yellow"
          style={{ padding: "6px 12px", fontSize: 18, lineHeight: 1 }}
          onMouseEnter={e => (e.currentTarget.style.transform = "translate(-1px,-1px) rotate(-8deg)")}
          onMouseLeave={e => (e.currentTarget.style.transform = "")}
          title="Nouveau jeu"
        >
          +
        </button>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "var(--bleu)", border: "2.5px solid var(--ink)",
          boxShadow: "2px 2px 0 var(--ink)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span className="bc" style={{ fontSize: 14 }}>T</span>
        </div>
      </div>

      {/* Rainbow strip (style A) at bottom */}
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0,
        height: 3,
        background: `linear-gradient(90deg, ${NAV_ITEMS.map((item, i, arr) => {
          const pct = (100 / arr.length);
          const start = i * pct;
          const end = (i + 1) * pct;
          return `${item.color} ${start}%, ${item.color} ${end}%`;
        }).join(", ")})`,
        pointerEvents: "none",
      }} />
    </nav>
  );
}
