// Les règles sont volumineuses (scans, 20-40 Mo courants) : trop pour D1,
// d'où le bucket R2 dédié. Un seul PDF par EAN, écrasé à chaque envoi.
export const TAILLE_MAX = 80 * 1024 * 1024;

export const cleR2 = (ean: string) => `regles/${ean}.pdf`;

// L'URL enregistrée en base est celle de la route de lecture : le bucket reste privé.
export const urlRegle = (ean: string) => `/api/regles/${encodeURIComponent(ean)}`;
