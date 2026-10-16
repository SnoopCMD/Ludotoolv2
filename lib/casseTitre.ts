// Les boutiques (Trader Games) écrivent leurs titres en capitales :
// « MOVING OUT 2 » doit devenir « Moving Out 2 », comme dans le catalogue.

const PETITS_MOTS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'of', 'the', 'and', 'a', 'an', 'in', 'on', 'to', 'for', 'à', 'en', 'au', 'aux']);

/** Mot à laisser en capitales : chiffres romains (II, IV) ou sigle mêlé de
 *  chiffres (2K26, 3D, FC25). */
/** Sigles courants des titres de jeux, à garder tels quels. */
const SIGLES = new Set(['NBA', 'NFL', 'NHL', 'MLB', 'PGA', 'WWE', 'UFC', 'WRC', 'EA', 'FC', 'FIFA', 'LEGO', 'GTA', 'RPG', 'DLC', 'HD', 'VR', 'XL', 'DX', 'GOTY', 'TMNT', 'USA', 'UK']);

const resteEnCapitales = (mot: string) =>
  /^[IVX]+$/.test(mot) || SIGLES.has(mot) || (/\d/.test(mot) && /[A-Z]/.test(mot));

/** Casse de titre pour un texte entièrement en capitales ; un titre déjà en
 *  minuscules/majuscules mêlées est rendu tel quel. */
export function casseTitre(t: string): string {
  if (!t || t !== t.toUpperCase() || !/\p{Lu}/u.test(t)) return t;
  let debut = true;
  return t.split(/(\s+|[:\-–/(])/).map(part => {
    if (!part || /^\s+$/.test(part) || /^[:\-–/(]$/.test(part)) {
      if (part && part.trim()) debut = true; // après « : » ou « - », majuscule
      return part;
    }
    const mot = part;
    let out: string;
    if (resteEnCapitales(mot)) out = mot;
    else {
      const bas = mot.toLowerCase();
      out = !debut && PETITS_MOTS.has(bas) ? bas : bas.replace(/^(['’"«]*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
    }
    debut = false;
    return out;
  }).join('');
}
