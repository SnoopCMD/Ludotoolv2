// EAN "custom" pour les jeux sans code-barres.
//
// Avant, ces jeux avaient tous `ean = 'Manuel'` : ce n'est pas un identifiant,
// donc ils se mélangeaient entre eux et n'apparaissaient pas dans le catalogue
// (contenus, étiquettes...). Désormais chaque jeu sans EAN reçoit un code unique
// de la forme `CUST-XXXXXX-YYYY`, utilisable partout comme un vrai EAN.
//
// Les anciens `Manuel` en base sont convertis par la migration 0010 en
// `CUST-<id du jeu sur 6 chiffres>`.

export const EAN_CUSTOM_PREFIX = 'CUST-';

export function genererEanCustom(): string {
  const temps = Date.now().toString(36).toUpperCase();
  const alea = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `${EAN_CUSTOM_PREFIX}${temps}-${alea}`;
}

export function estEanCustom(ean: string | null | undefined): boolean {
  return !!ean && ean.startsWith(EAN_CUSTOM_PREFIX);
}
