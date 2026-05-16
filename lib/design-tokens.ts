// Shared design tokens — matches CSS custom properties in globals.css
export const colors = {
  ink:    "#0d0d0d",
  cream:  "#f5f0e6",
  cream2: "#ede7d9",
  white:  "#ffffff",
  vert:   "#a8e063",
  rose:   "#f472b6",
  bleu:   "#60a5fa",
  rouge:  "#f87171",
  orange: "#fb923c",
  yellow: "#facc15",
  purple: "#c084fc",
} as const;

// The 5 game color categories (used for KPI bands, dot indicators, etc.)
export const gameColors = [
  { name: "Vert",   hex: colors.vert   },
  { name: "Rose",   hex: colors.rose   },
  { name: "Bleu",   hex: colors.bleu   },
  { name: "Rouge",  hex: colors.rouge  },
  { name: "Orange", hex: colors.orange },
] as const;

// Nav item definitions (single source of truth)
export const navItems = [
  { href: "/",           label: "Accueil",    page: "accueil",    color: colors.yellow },
  { href: "/inventaire", label: "Inventaire", page: "inventaire", color: colors.bleu   },
  { href: "/atelier",    label: "Atelier",    page: "atelier",    color: colors.vert   },
  { href: "/agenda",     label: "Agenda",     page: "agenda",     color: colors.purple },
  { href: "/store",      label: "Store",      page: "store",      color: colors.rose   },
  { href: "/catalogage", label: "Catalogage", page: "catalogage", color: colors.orange },
  { href: "/jv",         label: "Jeux Vidéo", page: "jv",         color: colors.rouge  },
] as const;

export type PageId = typeof navItems[number]["page"];
