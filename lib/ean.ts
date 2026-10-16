// Codes-barres des boîtes de jeux : EAN-13 en Europe, mais beaucoup de jeux
// Nintendo portent un UPC-A à 12 chiffres (préfixe 045496), et certains
// lecteurs renvoient un GTIN-14. On ramène tout à l'EAN-13 (UPC-A = EAN-13
// précédé d'un 0) pour qu'un même jeu ait toujours le même code en base.

/** Chiffres seuls, ramenés à 13 chiffres quand c'est un UPC-A ou un GTIN-14. */
export function normaliserEan(brut: string | null | undefined): string {
  const c = (brut ?? '').replace(/\D/g, '');
  if (c.length === 12) return '0' + c;
  if (c.length === 14 && c.startsWith('0')) return c.slice(1);
  return c;
}

/** EAN-8 ou EAN-13 (une fois normalisé). */
export const estEanValide = (ean: string) => ean.length === 8 || ean.length === 13;

/** Écritures possibles d'un même code chez un tiers (EAN-13 et UPC-A). */
export const variantesEan = (ean: string) => (ean.length === 13 && ean.startsWith('0') ? [ean, ean.slice(1)] : [ean]);
