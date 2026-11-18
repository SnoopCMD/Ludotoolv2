/**
 * Fenêtre MyLudo ouverte à côté de la modal vignette / étiquette, pour comparer
 * la fiche du jeu en remplissant l'étiquette.
 *
 * MyLudo ne peut pas être affiché dans la page même (un site peut interdire
 * d'être intégré ailleurs) : c'est une vraie fenêtre de navigateur, placée sur
 * la droite de l'écran pendant que la modal se range à gauche. Une seule
 * fenêtre, réutilisée d'un jeu à l'autre (même nom).
 *
 * Le navigateur n'autorise l'ouverture qu'au moment d'un clic : on l'ouvre donc
 * tout de suite sur une page d'attente, puis on la fait aller sur la fiche du
 * jeu quand la recherche a répondu. La fenêtre déjà ouverte est réutilisée par
 * sa référence (pas par son nom).
 */

const NOM_FENETRE = "ludotool-myludo";
const CLE_PREFERENCE = "ludotool.myludo-a-cote";

/** Largeur de la modal rangée à gauche, et marge autour (px). */
export const LARGEUR_MODAL = 620;
export const MARGE_MODAL = 24;
const LARGEUR_MIN_FENETRE = 420;

/** Préférence « ouvrir MyLudo à côté » (oui par défaut). */
export function lireComparaison(): boolean {
  try { return localStorage.getItem(CLE_PREFERENCE) !== "0"; } catch { return true; }
}
export function ecrireComparaison(v: boolean) {
  try { localStorage.setItem(CLE_PREFERENCE, v ? "1" : "0"); } catch { /* navigation privée */ }
}

/** Assez de place à l'écran, et pas sur un téléphone ou une tablette (où une fenêtre devient un onglet). */
export function comparaisonPossible(): boolean {
  if (typeof window === "undefined") return false;
  const tactile = window.matchMedia?.("(pointer: coarse)").matches;
  return !tactile && window.innerWidth >= LARGEUR_MODAL + 2 * MARGE_MODAL + LARGEUR_MIN_FENETRE;
}

/**
 * Ouvre (ou réutilise) la fenêtre MyLudo sur la droite de la fenêtre du
 * navigateur. Sans `url`, elle affiche une page d'attente. À appeler pendant un
 * clic. Renvoie null si le navigateur l'a bloquée.
 */
export function ouvrirFenetreMyLudo(url: string | null): Window | null {
  const bordX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
  const hautChrome = Math.max(0, window.outerHeight - window.innerHeight - bordX);
  const gauche = Math.round(window.screenX + bordX + MARGE_MODAL + LARGEUR_MODAL + MARGE_MODAL);
  const largeur = Math.max(LARGEUR_MIN_FENETRE, Math.round(window.screenX + window.outerWidth - bordX - gauche - 8));
  const haut = Math.round(window.screenY + hautChrome);
  const hauteur = Math.round(window.innerHeight);

  const fenetre = window.open("about:blank", NOM_FENETRE, `popup=yes,left=${gauche},top=${haut},width=${largeur},height=${hauteur}`);
  if (!fenetre) return null;
  // On garde le lien entre les deux fenêtres (window.opener) : sans lui, le
  // navigateur interdit à LudoTool de changer la page de cette fenêtre ou de la
  // fermer. En contrepartie, la page MyLudo pourrait rediriger l'onglet LudoTool
  // (sans rien pouvoir y lire) : risque accepté pour un site connu.
  if (url) allerA(fenetre, url);
  else pageAttente(fenetre);
  fenetre.focus();
  return fenetre;
}

/** Fait aller la fenêtre sur une adresse (fiche MyLudo, recherche). */
export function allerA(fenetre: Window | null, url: string) {
  if (!fenetre || fenetre.closed) return;
  try { fenetre.location.href = url; } catch { /* fenêtre fermée entre-temps */ }
}

function pageAttente(fenetre: Window) {
  try {
    const d = fenetre.document;
    d.title = "MyLudo…";
    d.body.style.cssText = "margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font:600 16px system-ui,sans-serif;color:#555;background:#f7f1e6";
    d.body.textContent = "Recherche sur MyLudo…";
  } catch { /* la fenêtre était déjà sur MyLudo : elle y reste jusqu'au résultat */ }
}

export function fermerFenetreMyLudo(fenetre: Window | null) {
  try { if (fenetre && !fenetre.closed) fenetre.close(); } catch { /* rien */ }
}
