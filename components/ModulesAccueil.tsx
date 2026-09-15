"use client";
import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

// ─── Types partagés avec la page d'accueil ────────────────────────────────────

export type Nouveaute = {
  id: string | number;
  nom: string;
  ean: string;
  couleur?: string;
  date_sortie?: string | null;
  image_url?: string;
};

/** Données déjà chargées par la page et réutilisées par les modules : les
 *  nouveautés servent aussi aux alertes de rotation, inutile de les recharger. */
export type ContexteAccueil = {
  isMobile: boolean;
  /** Connecté : les modules vides s'affichent quand même, avec leur en-tête,
   *  pour que l'utilisateur voie ce qu'il a activé. Hors connexion on garde
   *  la présentation historique, où une section vide disparaît. */
  connecte: boolean;
  nouveautes: Nouveaute[];
  dateProchaineRotation: Date | null;
};

type DefinitionModule = {
  id: string;
  titre: string;
  icone: string;
  description: string;
  Composant: (props: { ctx: ContexteAccueil }) => React.ReactElement | null;
};

// ─── Catalogue ────────────────────────────────────────────────────────────────

/** Présentation hors connexion, et point de départ d'un compte qui n'a encore
 *  rien personnalisé : les nouveautés, comme avant l'arrivée des modules. */
export const MODULES_PAR_DEFAUT = ["nouveautes"];

const COULEURS_JEU: Record<string, string> = {
  vert: "#a8e063", rose: "#f472b6", bleu: "#60a5fa", rouge: "#f87171", jaune: "#fb923c",
};

const toArr = (d: any) => (Array.isArray(d) ? d : []);
const charger = (url: string) =>
  fetch(url).then(r => r.json() as Promise<any>).then(toArr).catch(() => [] as any[]);

// ─── Habillage commun ─────────────────────────────────────────────────────────

function EnTeteModule({ titre, compteur, lien, libelleLien, children }: {
  titre: string; compteur?: number; lien: string; libelleLien?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <span className="bc" style={{ fontSize: 18 }}>
        {titre}
        {compteur !== undefined && (
          <span style={{ fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,0.4)", marginLeft: 10 }}>({compteur})</span>
        )}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {children}
        <a href={lien} className="pop-btn pop-btn-outline" style={{ fontSize: 12, padding: "4px 12px", textDecoration: "none" }}>
          {libelleLien ?? "Gérer"} →
        </a>
      </div>
    </div>
  );
}

function Vide({ texte }: { texte: string }) {
  return (
    <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.35)", padding: "14px 0", textAlign: "center" }}>{texte}</p>
  );
}

function Chargement() {
  return <p style={{ fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,0.3)", padding: "14px 0", textAlign: "center" }}>Chargement…</p>;
}

// ─── Module : nouveautés en salle ─────────────────────────────────────────────

function ModuleNouveautes({ ctx }: { ctx: ContexteAccueil }) {
  const { nouveautes, dateProchaineRotation } = ctx;
  const maintenant = new Date();
  if (!ctx.connecte && nouveautes.length === 0) return null;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="Nouveautés en salle" compteur={nouveautes.length} lien="/nouveautes">
        {dateProchaineRotation && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(0,0,0,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Prochaine rotation</span>
            <span className="pop-sticker" style={{ background: dateProchaineRotation <= maintenant ? "var(--rouge)" : "var(--orange)", color: dateProchaineRotation <= maintenant ? "var(--white)" : "var(--ink)", fontSize: 12 }}>
              {dateProchaineRotation <= maintenant ? "⚠️ " : "⏳ "}
              {format(dateProchaineRotation, "d MMM yyyy", { locale: fr })}
            </span>
          </div>
        )}
      </EnTeteModule>
      {nouveautes.length === 0 ? <Vide texte="Aucune nouveauté en salle" /> : (
        <div className="pop-scroll-x" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {nouveautes.map(jeu => {
            const couleur = COULEURS_JEU[jeu.couleur ?? ""] ?? null;
            const estExpire = jeu.date_sortie && new Date(jeu.date_sortie) <= maintenant;
            return (
              <div key={jeu.id} style={{ flexShrink: 0, display: "flex", flexDirection: "column", gap: 6, width: 90 }} title={jeu.nom}>
                <div style={{ width: 90, height: 90, borderRadius: 10, overflow: "hidden", border: "2.5px solid var(--ink)", boxShadow: "2px 2px 0 var(--ink)", position: "relative" }}>
                  {jeu.image_url
                    ? <img src={jeu.image_url} alt={jeu.nom} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                    : <div style={{ width: "100%", height: "100%", background: couleur ?? "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🎲</div>}
                  {estExpire && (
                    <div style={{ position: "absolute", inset: 0, background: "rgba(248,113,113,0.25)", display: "flex", alignItems: "flex-end", justifyContent: "center", paddingBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 900, background: "var(--rouge)", color: "var(--white)", padding: "1px 6px", borderRadius: 4 }}>À sortir</span>
                    </div>
                  )}
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "var(--ink)", textAlign: "center", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>{jeu.nom}</p>
                {jeu.date_sortie && <p style={{ fontSize: 10, fontWeight: 700, textAlign: "center", color: estExpire ? "var(--rouge)" : "rgba(0,0,0,0.4)" }}>{format(new Date(jeu.date_sortie), "d MMM", { locale: fr })}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ─── Module : réservations jeux vidéo ─────────────────────────────────────────

// Repris de app/jv/page.tsx : libellés et couleurs des postes.
const POSTES_JV: Record<string, { label: string; couleur: string }> = {
  ps5:          { label: "PS5",          couleur: "var(--bleu)" },
  switch_multi: { label: "Switch Multi", couleur: "var(--rouge)" },
  switch_solo:  { label: "Switch Solo",  couleur: "var(--rose)" },
  pc1:          { label: "PC 1",         couleur: "var(--cream2)" },
  pc2:          { label: "PC 2",         couleur: "var(--cream2)" },
};

type ReservationJv = {
  id: string; jeu_id: string; jeu2_id: string | null; poste: string; date_creneau: string;
  heure_debut: string | null; heure_fin: string | null; creneau?: string | null;
  adherent_nom: string; nb_joueurs: number; statut: string;
};

const MAX_RESERVATIONS = 8;

function ModuleReservationsJv({ ctx }: { ctx: ContexteAccueil }) {
  const [reservations, setReservations] = useState<ReservationJv[] | null>(null);
  const [titres, setTitres] = useState<Record<string, { titre: string; image_url: string | null }>>({});

  useEffect(() => {
    Promise.all([charger("/api/jv-reservations"), charger("/api/jv-jeux")]).then(([resas, jeux]) => {
      const map: typeof titres = {};
      for (const j of jeux) map[j.id] = { titre: j.titre, image_url: j.image_url ?? null };
      setTitres(map);
      setReservations(resas as ReservationJv[]);
    });
  }, []);

  const aujourdhui = format(new Date(), "yyyy-MM-dd");
  const aVenir = useMemo(() => (reservations ?? [])
    .filter(r => r.statut !== "annulee" && r.date_creneau >= aujourdhui)
    .sort((a, b) => a.date_creneau.localeCompare(b.date_creneau) || (a.heure_debut ?? a.creneau ?? "").localeCompare(b.heure_debut ?? b.creneau ?? "")),
  [reservations, aujourdhui]);

  const total = aVenir.length;
  const visibles = aVenir.slice(0, MAX_RESERVATIONS);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="Réservations jeux vidéo" compteur={reservations ? total : undefined} lien="/jv" libelleLien="Jeux vidéo" />
      {reservations === null ? <Chargement /> : total === 0 ? <Vide texte="Aucune réservation à venir" /> : (
        <div style={{ display: "grid", gridTemplateColumns: ctx.isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {visibles.map(r => {
            const poste = POSTES_JV[r.poste] ?? { label: r.poste, couleur: "var(--cream2)" };
            const jeu = titres[r.jeu_id];
            const jeu2 = r.jeu2_id ? titres[r.jeu2_id] : null;
            const estAujourdhui = r.date_creneau === aujourdhui;
            const horaire = r.heure_debut && r.heure_fin ? `${r.heure_debut}–${r.heure_fin}` : (r.creneau ?? "");
            return (
              <div key={r.id} className="pop-card" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center", background: estAujourdhui ? "#fef9c3" : "var(--white)" }}>
                <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", border: "2px solid var(--ink)", flexShrink: 0, background: "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  {jeu?.image_url ? <img src={jeu.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" /> : "🎮"}
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span className="pop-sticker" style={{ background: poste.couleur, fontSize: 10 }}>{poste.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: estAujourdhui ? "var(--ink)" : "rgba(0,0,0,0.55)" }}>
                      {estAujourdhui ? "Aujourd'hui" : format(parseISO(r.date_creneau), "EEE d MMM", { locale: fr })}
                      {horaire && ` · ${horaire}`}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {jeu?.titre ?? "Jeu inconnu"}{jeu2 ? ` + ${jeu2.titre}` : ""}
                  </p>
                  <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", fontWeight: 600 }}>
                    {r.adherent_nom} · {r.nb_joueurs} joueur{r.nb_joueurs > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {total > visibles.length && (
        <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>+ {total - visibles.length} autre{total - visibles.length > 1 ? "s" : ""} à venir</p>
      )}
    </section>
  );
}

// ─── Module : jeux en préparation dans l'atelier ──────────────────────────────

// Mêmes étapes et couleurs que app/atelier/page.tsx.
const ETAPES_ATELIER = [
  { id: "etape_plastifier", nom: "Plastification", hex: "#a8e063" },
  { id: "etape_contenu",    nom: "Contenu",        hex: "#60a5fa" },
  { id: "etape_etiquette",  nom: "Étiquette",      hex: "#c084fc" },
  { id: "etape_equiper",    nom: "Équiper",        hex: "#f472b6" },
  { id: "etape_encoder",    nom: "Encoder",        hex: "#f87171" },
  { id: "etape_notice",     nom: "Notice",         hex: "#fb923c" },
] as const;

type JeuAtelier = { id: number; nom: string; ean: string; date_entree: string | null; image_url?: string } & Record<string, any>;

const MAX_ATELIER = 12;

function ModuleAtelier({ ctx }: { ctx: ContexteAccueil }) {
  const [jeux, setJeux] = useState<JeuAtelier[] | null>(null);

  useEffect(() => {
    (async () => {
      const champs = ["id", "nom", "ean", "date_entree", ...ETAPES_ATELIER.map(e => e.id)].join(",");
      const liste = await charger(`/api/jeux?fields=${champs}&statut=${encodeURIComponent("En préparation")}`) as JeuAtelier[];
      const eans = [...new Set(liste.map(j => j.ean).filter(Boolean))];
      const cat = eans.length ? await charger(`/api/catalogue?eans=${encodeURIComponent(eans.join(","))}&fields=ean,image_url`) : [];
      const images: Record<string, string> = {};
      for (const c of cat) if (c.image_url) images[c.ean] = c.image_url;
      setJeux(liste.map(j => ({ ...j, image_url: images[j.ean] })));
    })();
  }, []);

  // Les plus avancés d'abord : ce sont ceux qui sont près de sortir de l'atelier.
  const tries = useMemo(() => (jeux ?? [])
    .map(j => ({ jeu: j, faites: ETAPES_ATELIER.filter(e => j[e.id]).length }))
    .sort((a, b) => b.faites - a.faites || a.jeu.nom.localeCompare(b.jeu.nom)),
  [jeux]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="En préparation dans l'atelier" compteur={jeux ? jeux.length : undefined} lien="/atelier" libelleLien="Atelier" />
      {jeux === null ? <Chargement /> : jeux.length === 0 ? <Vide texte="Aucun jeu en préparation" /> : (
        <div style={{ display: "grid", gridTemplateColumns: ctx.isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {tries.slice(0, MAX_ATELIER).map(({ jeu, faites }) => (
            <div key={jeu.id} className="pop-card" style={{ padding: "10px 12px", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, overflow: "hidden", border: "2px solid var(--ink)", flexShrink: 0, background: "var(--cream2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                {jeu.image_url ? <img src={jeu.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" /> : "🧰"}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                <p style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={jeu.nom}>{jeu.nom}</p>
                <div style={{ display: "flex", gap: 3 }} title={ETAPES_ATELIER.filter(e => !jeu[e.id]).map(e => e.nom).join(", ") || "Toutes les étapes faites"}>
                  {ETAPES_ATELIER.map(e => (
                    <span key={e.id} style={{ flex: 1, height: 8, borderRadius: 3, border: "1.5px solid var(--ink)", background: jeu[e.id] ? e.hex : "transparent" }} />
                  ))}
                </div>
                <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(0,0,0,0.45)" }}>{faites}/{ETAPES_ATELIER.length} étapes</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {jeux && jeux.length > MAX_ATELIER && (
        <p style={{ fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,0.4)" }}>+ {jeux.length - MAX_ATELIER} autre{jeux.length - MAX_ATELIER > 1 ? "s" : ""} dans l'atelier</p>
      )}
    </section>
  );
}

// ─── Module : réparations à faire ─────────────────────────────────────────────

type Reparation = { id: number; nom: string; type_reparation: string; description: string | null; statut: string };

function ModuleReparations({ ctx }: { ctx: ContexteAccueil }) {
  const [reparations, setReparations] = useState<Reparation[] | null>(null);
  useEffect(() => { charger("/api/reparations").then(l => setReparations(l as Reparation[])); }, []);
  const aFaire = (reparations ?? []).filter(r => r.statut === "À faire");
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="Réparations à faire" compteur={reparations ? aFaire.length : undefined} lien="/reparations" libelleLien="Réparations" />
      {reparations === null ? <Chargement /> : aFaire.length === 0 ? <Vide texte="Aucune réparation en attente" /> : (
        <div style={{ display: "grid", gridTemplateColumns: ctx.isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {aFaire.slice(0, 8).map(r => (
            <div key={r.id} className="pop-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span className="pop-sticker" style={{ background: "var(--orange)", fontSize: 10 }}>🔧 {r.type_reparation}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 800 }}>{r.nom}</p>
              {r.description && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", lineHeight: 1.4 }}>{r.description}</p>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Module : pièces manquantes ───────────────────────────────────────────────

type PieceManquante = { id: number; nom: string; element_manquant: string; statut: string };

function ModulePiecesManquantes({ ctx }: { ctx: ContexteAccueil }) {
  const [pieces, setPieces] = useState<PieceManquante[] | null>(null);
  useEffect(() => { charger("/api/pieces-manquantes").then(l => setPieces(l as PieceManquante[])); }, []);
  const ouvertes = (pieces ?? []).filter(p => p.statut === "Manquant" || p.statut === "Commandé");
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="Pièces manquantes" compteur={pieces ? ouvertes.length : undefined} lien="/pieces" libelleLien="Pièces" />
      {pieces === null ? <Chargement /> : ouvertes.length === 0 ? <Vide texte="Aucune pièce manquante" /> : (
        <div style={{ display: "grid", gridTemplateColumns: ctx.isMobile ? "1fr" : "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
          {ouvertes.slice(0, 8).map(p => (
            <div key={p.id} className="pop-card" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className="pop-sticker" style={{ background: p.statut === "Commandé" ? "var(--bleu)" : "var(--rouge)", color: p.statut === "Commandé" ? "var(--ink)" : "var(--white)", fontSize: 10 }}>{p.statut}</span>
              </div>
              <p style={{ fontSize: 13, fontWeight: 800 }}>{p.nom}</p>
              <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)" }}>{p.element_manquant}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Module : boîte à idées ───────────────────────────────────────────────────

type Suggestion = { id: string; titre: string; contenu: string | null; couleur: string; updated_at: string };

const COULEURS_SUGGESTION: Record<string, string> = {
  yellow: "#fef9c3", green: "#dcfce7", blue: "#dbeafe", pink: "#fce7f3", purple: "#ede9fe", orange: "#ffedd5",
};

function ModuleSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  useEffect(() => { charger("/api/suggestions").then(l => setSuggestions(l as Suggestion[])); }, []);
  const recentes = (suggestions ?? []).slice(0, 6);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <EnTeteModule titre="Boîte à idées" compteur={suggestions ? suggestions.length : undefined} lien="/suggestions" libelleLien="Suggestions" />
      {suggestions === null ? <Chargement /> : recentes.length === 0 ? <Vide texte="Aucune suggestion pour l'instant" /> : (
        <div className="pop-scroll-x" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6 }}>
          {recentes.map(s => (
            <div key={s.id} className="pop-card" style={{ width: 200, flexShrink: 0, padding: "10px 12px", background: COULEURS_SUGGESTION[s.couleur] ?? "#fef9c3", display: "flex", flexDirection: "column", gap: 4 }}>
              <p style={{ fontSize: 13, fontWeight: 800 }}>{s.titre}</p>
              {s.contenu && <p style={{ fontSize: 12, color: "rgba(0,0,0,0.55)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" as any }}>{s.contenu}</p>}
              <p style={{ fontSize: 10, fontWeight: 600, color: "rgba(0,0,0,0.35)", marginTop: "auto" }}>{format(new Date(s.updated_at), "d MMM yyyy", { locale: fr })}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Registre ─────────────────────────────────────────────────────────────────

export const MODULES: DefinitionModule[] = [
  { id: "nouveautes",        titre: "Nouveautés en salle",        icone: "✨", description: "Les jeux mis en avant et la prochaine rotation.", Composant: ModuleNouveautes },
  { id: "jv_reservations",   titre: "Réservations jeux vidéo",    icone: "🎮", description: "Les prochains créneaux réservés sur les postes.", Composant: ModuleReservationsJv },
  { id: "atelier",           titre: "Jeux en préparation",        icone: "🧰", description: "L'avancement des jeux dans l'atelier.", Composant: ModuleAtelier },
  { id: "reparations",       titre: "Réparations à faire",        icone: "🔧", description: "Les réparations en attente.", Composant: ModuleReparations },
  { id: "pieces_manquantes", titre: "Pièces manquantes",          icone: "🧩", description: "Les pièces manquantes ou commandées.", Composant: ModulePiecesManquantes },
  { id: "suggestions",       titre: "Boîte à idées",              icone: "💡", description: "Les dernières suggestions de l'équipe.", Composant: ModuleSuggestions },
];

const MODULE_PAR_ID = Object.fromEntries(MODULES.map(m => [m.id, m]));

/** Garde l'ordre demandé, en ignorant les identifiants qui ne correspondent
 *  plus à rien (module retiré du code depuis l'enregistrement). */
export function modulesValides(ids: string[]): string[] {
  return ids.filter(id => MODULE_PAR_ID[id]);
}

export function ListeModules({ ids, ctx }: { ids: string[]; ctx: ContexteAccueil }) {
  return (
    <>
      {modulesValides(ids).map(id => {
        const { Composant } = MODULE_PAR_ID[id];
        return <Composant key={id} ctx={ctx} />;
      })}
    </>
  );
}

// ─── Modal de personnalisation ────────────────────────────────────────────────

export function ModalPersonnaliser({ actifs, onFermer, onEnregistrer }: {
  actifs: string[];
  onFermer: () => void;
  onEnregistrer: (ids: string[]) => Promise<void>;
}) {
  const [choix, setChoix] = useState<string[]>(() => modulesValides(actifs));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const basculer = (id: string) =>
    setChoix(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);

  const deplacer = (id: string, sens: -1 | 1) => setChoix(c => {
    const i = c.indexOf(id);
    const j = i + sens;
    if (i < 0 || j < 0 || j >= c.length) return c;
    const copie = [...c];
    [copie[i], copie[j]] = [copie[j], copie[i]];
    return copie;
  });

  const valider = async () => {
    setEnCours(true); setErreur(null);
    try { await onEnregistrer(choix); onFermer(); }
    catch (e: any) { setErreur(e?.message || "Impossible d'enregistrer."); }
    finally { setEnCours(false); }
  };

  // Les modules actifs d'abord, dans leur ordre d'affichage, puis les autres.
  const ordonnes = [...choix.map(id => MODULE_PAR_ID[id]), ...MODULES.filter(m => !choix.includes(m.id))];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 80, display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 16px 16px" }}
      onClick={e => { if (e.target === e.currentTarget) onFermer(); }}>
      <div className="pop-card" style={{ width: "100%", maxWidth: 520, maxHeight: "calc(100dvh - 96px)", overflow: "auto" }}>
        <div style={{ background: "var(--ink)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h3 className="bc" style={{ fontSize: 22, color: "var(--cream)", margin: 0 }}>Personnaliser l'accueil</h3>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "2px 0 0", fontWeight: 600 }}>L'agenda et les alertes restent toujours affichés.</p>
          </div>
          <button onClick={onFermer} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,255,255,0.12)", border: "none", cursor: "pointer", color: "var(--cream)", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {ordonnes.map(m => {
            const actif = choix.includes(m.id);
            const position = choix.indexOf(m.id);
            return (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "2px solid var(--ink)", background: actif ? "var(--white)" : "var(--cream2)", opacity: actif ? 1 : 0.7 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, cursor: "pointer" }}>
                  <input type="checkbox" checked={actif} onChange={() => basculer(m.id)} style={{ width: 18, height: 18, accentColor: "var(--ink)", flexShrink: 0 }} />
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{m.icone}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>{m.titre}</span>
                    <span style={{ display: "block", fontSize: 12, color: "rgba(0,0,0,0.5)", fontWeight: 500 }}>{m.description}</span>
                  </span>
                </label>
                {actif && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                    <button onClick={() => deplacer(m.id, -1)} disabled={position === 0} title="Monter"
                      style={{ width: 26, height: 22, border: "1.5px solid var(--ink)", borderRadius: 5, background: "var(--white)", cursor: position === 0 ? "default" : "pointer", opacity: position === 0 ? 0.3 : 1, fontSize: 11, lineHeight: 1 }}>▲</button>
                    <button onClick={() => deplacer(m.id, 1)} disabled={position === choix.length - 1} title="Descendre"
                      style={{ width: 26, height: 22, border: "1.5px solid var(--ink)", borderRadius: 5, background: "var(--white)", cursor: position === choix.length - 1 ? "default" : "pointer", opacity: position === choix.length - 1 ? 0.3 : 1, fontSize: 11, lineHeight: 1 }}>▼</button>
                  </div>
                )}
              </div>
            );
          })}
          {erreur && (
            <div style={{ background: "var(--rose)", border: "2px solid var(--ink)", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700 }}>{erreur}</div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button onClick={() => setChoix(MODULES_PAR_DEFAUT)} className="pop-btn pop-btn-outline" style={{ fontSize: 12 }}>Par défaut</button>
            <div style={{ flex: 1 }} />
            <button onClick={onFermer} className="pop-btn pop-btn-outline">Annuler</button>
            <button onClick={valider} disabled={enCours} className="pop-btn pop-btn-dark" style={{ opacity: enCours ? 0.5 : 1 }}>
              {enCours ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
