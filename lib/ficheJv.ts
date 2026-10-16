// Assemblage d'une fiche de jeu vidéo à partir de toutes les sources.
//
// Chaque source a ses forces : IGDB pour le titre officiel, l'éditeur, l'année,
// le nombre de joueurs et une jaquette propre ; jeuxvideo.com pour le synopsis,
// les genres et le PEGI en français ; les boutiques des plateformes (PlayStation
// Store, eShop, Steam) pour la description française et le PEGI ; Trader Games
// et l'EAN pour la console exacte de la boîte. On les interroge en parallèle et
// on prend chaque champ à la meilleure source disponible.

import { chercherIgdb, type ResultatIgdb } from './igdb';
import { completerDepuisJvc, type FicheJvc } from './jeuxvideo';
import { chercherBoutiques, type GameResult } from './boutiquesJv';
import { choisirConsole, type ConsoleJv } from './consolesJv';
import { casseTitre } from './casseTitre';

export type ChampFiche = 'titre' | 'console' | 'description' | 'image_url' | 'annee' | 'editeur' | 'genre' | 'pegi' | 'nb_joueurs';

export type FicheAssemblee = {
  titre: string;
  console: ConsoleJv | null;
  description: string | null;
  image_url: string | null;
  annee: number | null;
  editeur: string | null;
  genre: string | null;
  pegi: number | null;
  nb_joueurs: string | null;
  igdb_id: number | null;
  /** Source retenue pour chaque champ rempli, pour l'afficher à la relecture. */
  sources: Partial<Record<ChampFiche, string>>;
  /** Sources qui ont refusé la requête automatique. */
  indisponibles: string[];
};

export type DemandeFiche = {
  titre: string;
  /** Console imposée (boîte scannée, résultat Trader Games, filtre choisi). */
  console?: ConsoleJv | null;
  /** Résultat IGDB choisi dans la liste : il fait foi pour le jeu. */
  igdbId?: number | null;
  /** Jaquette de l'article Trader Games, à défaut d'une meilleure. */
  imageSecours?: string | null;
};

const normaliser = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Proximité de deux titres, de 0 à 1 : égalité, puis inclusion des mots. */
function proximite(a: string, b: string): number {
  const x = normaliser(a), y = normaliser(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const mx = x.split(' '), my = new Set(y.split(' '));
  const communs = mx.filter(m => my.has(m)).length;
  // Les mots en trop (« Bundle », « Season Pass ») pénalisent : on veut le jeu lui-même.
  return communs / Math.max(mx.length, my.size);
}

function meilleur<T>(liste: T[], titre: (t: T) => string, cible: string, seuil = 0.6): T | null {
  let best: T | null = null, score = seuil;
  for (const e of liste) {
    const s = proximite(titre(e), cible);
    if (s > score) { best = e; score = s; }
  }
  return best;
}

/** Les genres IGDB sont en anglais ; on garde le français du catalogue. */
const GENRES_FR: Record<string, string> = {
  'Adventure': 'Aventure', 'Arcade': 'Arcade', 'Card & Board Game': 'Jeu de cartes / plateau',
  'Fighting': 'Combat', "Hack and slash/Beat 'em up": "Beat'em all", 'Indie': 'Indépendant',
  'MOBA': 'MOBA', 'Music': 'Musique', 'Pinball': 'Flipper', 'Platform': 'Plateforme',
  'Point-and-click': 'Point & click', 'Puzzle': 'Puzzle', 'Quiz/Trivia': 'Quiz',
  'Racing': 'Course', 'Real Time Strategy (RTS)': 'Stratégie temps réel', 'Role-playing (RPG)': 'RPG',
  'Shooter': 'Tir', 'Simulator': 'Simulation', 'Sport': 'Sport', 'Strategy': 'Stratégie',
  'Tactical': 'Tactique', 'Turn-based strategy (TBS)': 'Stratégie tour par tour',
  'Visual Novel': 'Visual novel',
};
const genresEnFrancais = (genres: string[]) => [...new Set(genres.map(g => GENRES_FR[g] ?? g))];

const premier = <T>(...valeurs: [T | null | undefined, string][]): [T, string] | null => {
  for (const [v, src] of valeurs) if (v !== null && v !== undefined && v !== '') return [v, src];
  return null;
};

const NOM_BOUTIQUE: Record<string, string> = { PS5: 'PlayStation Store', Switch: 'Nintendo eShop', PC: 'Steam' };

export async function assemblerFiche(d: DemandeFiche): Promise<FicheAssemblee> {
  const titre = d.titre.trim();
  const indisponibles: string[] = [];

  // 1. IGDB et jeuxvideo.com en parallèle : ils identifient le jeu.
  const [igdbListe, jvc] = await Promise.all([
    // IGDB ne liste pas toujours toutes les plateformes d'un jeu : sans
    // résultat sur la console demandée, on cherche sur tout le parc.
    chercherIgdb(titre, d.console ?? '')
      .then(l => (l.length || !d.console ? l : chercherIgdb(titre)))
      .catch(() => [] as ResultatIgdb[]),
    completerDepuisJvc(titre).catch(() => ({ fiche: null as FicheJvc | null, bloque: false })),
  ]);
  if (jvc.bloque) indisponibles.push('jeuxvideo.com');

  const igdb = (d.igdbId ? igdbListe.find(g => g.igdb_id === d.igdbId) : null)
    ?? meilleur(igdbListe, g => g.titre, titre);
  // Une fiche jeuxvideo.com qui ne ressemble pas au jeu cherché est écartée.
  const fJvc = jvc.fiche && proximite(jvc.fiche.titre, igdb?.titre ?? titre) >= 0.6 ? jvc.fiche : null;

  const console = d.console
    ?? (fJvc ? choisirConsole(fJvc.plateformes, igdb?.console) : null)
    ?? (igdb?.console as ConsoleJv | null) ?? null;

  // 2. La boutique de la console : description française et PEGI officiels.
  const titreOfficiel = igdb?.titre ?? fJvc?.titre ?? casseTitre(titre);
  const boutique = console
    ? meilleur(await chercherBoutiques(titreOfficiel, console).catch(() => [] as GameResult[]), b => b.titre, titreOfficiel)
    : null;
  const nomBoutique = console ? NOM_BOUTIQUE[console] : 'boutique';

  const sources: FicheAssemblee['sources'] = {};
  const prendre = <T>(champ: ChampFiche, choix: [T, string] | null): T | null => {
    if (!choix) return null;
    sources[champ] = choix[1];
    return choix[0];
  };

  const genresIgdb = igdb?.genres?.length ? genresEnFrancais(igdb.genres).join(', ') : null;

  const fiche: FicheAssemblee = {
    titre: prendre('titre', premier([igdb?.titre, 'IGDB'], [fJvc?.titre, 'jeuxvideo.com'], [casseTitre(titre), 'saisie'])) ?? titre,
    console,
    // Le français d'abord : jeuxvideo.com, puis la boutique ; IGDB (anglais) en dernier recours.
    description: prendre('description', premier([fJvc?.description, 'jeuxvideo.com'], [boutique?.description, nomBoutique], [igdb?.description, 'IGDB (anglais)'])),
    image_url: prendre('image_url', premier([igdb?.image_url, 'IGDB'], [fJvc?.image_url, 'jeuxvideo.com'], [d.imageSecours, 'Trader Games'], [boutique?.image_url, nomBoutique])),
    annee: prendre('annee', premier([igdb?.annee, 'IGDB'], [fJvc?.annee, 'jeuxvideo.com'], [boutique?.annee, nomBoutique])),
    editeur: prendre('editeur', premier([igdb?.editeur, 'IGDB'], [fJvc?.editeur, 'jeuxvideo.com'], [boutique?.editeur, nomBoutique])),
    genre: prendre('genre', premier([fJvc?.genres.length ? fJvc.genres.join(', ') : null, 'jeuxvideo.com'], [genresIgdb, 'IGDB (traduit)'], [boutique?.genre, nomBoutique])),
    pegi: prendre('pegi', premier([boutique?.pegi, nomBoutique], [fJvc?.pegi, 'jeuxvideo.com'], [igdb?.pegi, 'IGDB'])),
    nb_joueurs: prendre('nb_joueurs', premier([igdb?.nb_joueurs, 'IGDB'])),
    igdb_id: igdb?.igdb_id ?? null,
    sources,
    indisponibles,
  };
  if (console) sources.console = d.console ? 'boîte / choix' : (fJvc ? 'jeuxvideo.com' : 'IGDB');
  return fiche;
}
