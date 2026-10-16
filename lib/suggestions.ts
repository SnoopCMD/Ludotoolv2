import type { Compte } from './auth';

/** Seul ce compte reçoit la pastille des nouvelles suggestions. */
export const IDENTIFIANT_SUIVI_SUGGESTIONS = 'timothe';

export const suitLesSuggestions = (compte: Pick<Compte, 'identifiant'> | null | undefined) =>
  compte?.identifiant === IDENTIFIANT_SUIVI_SUGGESTIONS;

/** Auteur et statut « vue » sont fixés par le serveur : on ignore ce qu'en dit
 *  le client (ainsi que le nom d'auteur, calculé à la lecture). */
export function sansChampsServeur(body: unknown): Record<string, unknown> {
  const copie = { ...(body as Record<string, unknown>) };
  delete copie.auteur_id;
  delete copie.vue;
  delete copie.auteur_nom;
  delete copie.nb_commentaires;
  delete copie.nb_non_lus;
  return copie;
}
