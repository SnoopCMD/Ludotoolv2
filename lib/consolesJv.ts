/** Consoles du parc jeux vidéo. */
export type ConsoleJv = 'PS5' | 'Switch' | 'PC';

/** Plateforme annoncée par une source (jeuxvideo.com, Trader Games) → console
 *  du parc, ou null quand le jeu n'existe pas sur une console qu'on a. Les jeux
 *  Switch 2 restent rangés en Switch, comme dans le catalogue. */
export function consoleDepuisPlateforme(plateforme: string | null | undefined): ConsoleJv | null {
  const p = (plateforme ?? '').trim().toLowerCase();
  if (p === 'ps5' || p === 'playstation 5') return 'PS5';
  if (p === 'switch' || p === 'switch 2' || p === 'nintendo switch' || p === 'nintendo switch 2') return 'Switch';
  if (p === 'pc' || p === 'windows') return 'PC';
  return null;
}

/** Première console du parc parmi celles annoncées, en privilégiant `prefere`. */
export function choisirConsole(plateformes: string[], prefere?: string | null): ConsoleJv | null {
  const dispo = plateformes.map(consoleDepuisPlateforme).filter((c): c is ConsoleJv => !!c);
  if (prefere && dispo.includes(prefere as ConsoleJv)) return prefere as ConsoleJv;
  return dispo[0] ?? null;
}
