"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";

type Page = "accueil" | "inventaire" | "atelier" | "agenda" | "store" | "catalogage";

export default function NavBar({ current }: { current: Page }) {
  const [alertCount, setAlertCount] = useState(0);

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

  const links: { href: string; label: string; page: Page }[] = [
    { href: "/", label: "Accueil", page: "accueil" },
    { href: "/inventaire", label: "Inventaire", page: "inventaire" },
    { href: "/atelier", label: "Atelier", page: "atelier" },
    { href: "/agenda", label: "Agenda", page: "agenda" },
    { href: "/store", label: "Store", page: "store" },
    { href: "/catalogage", label: "Catalogage", page: "catalogage" },
  ];

  return (
    <nav className="absolute left-1/2 transform -translate-x-1/2 bg-[#2d2d2d] text-white p-1.5 rounded-full flex items-center text-sm font-bold shadow-lg z-10 gap-1">
      {links.map(link => (
        <Link
          key={link.page}
          href={link.href}
          className={`relative px-6 py-2.5 rounded-full transition ${
            current === link.page
              ? "bg-[#baff29] text-black shadow-sm"
              : "hover:bg-white/10"
          }`}
        >
          {link.label}
          {link.page === "accueil" && alertCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-rose-500 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1 shadow">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
