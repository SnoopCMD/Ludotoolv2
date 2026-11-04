/**
 * Messagerie interne : types et constantes partagés entre les routes API et le
 * client. Pas d'accès à la base ici (le fichier est importé côté navigateur).
 *
 * Architecture, pensée pour la suite :
 *
 *  - D1 est la source de vérité (`migrations/0024_chat.sql`). Tout message a un
 *    `id` entier croissant qui sert de curseur.
 *  - Le client ne parle jamais directement au transport : il s'abonne à un
 *    canal (`lib/chat-canal.ts`) qui lui livre des `EvenementChat`. Aujourd'hui
 *    le canal sonde `/api/chat/<conversation>/flux` ; demain il pourra ouvrir
 *    un WebSocket (Durable Object) sans que le panneau change.
 *  - Les événements sont typés par `type` : les réactions « qui défilent à
 *    l'écran » seront un nouveau type, éphémère (non stocké), diffusé par le
 *    même canal et affiché par une couche au-dessus de la page.
 */

export const CONVERSATION_GENERALE = "general";
export const LONGUEUR_MAX_MESSAGE = 2000;
/** Messages chargés à l'ouverture, puis par page en remontant l'historique. */
export const TAILLE_PAGE = 50;

export type MessageChat = {
  id: number;
  conversation_id: string;
  auteur_id: string;
  /** Identifiant `equipe` de l'auteur : couleur de profil, avatar. */
  auteur_equipe_id: string;
  auteur_nom: string;
  auteur_couleur: string | null;
  auteur_groupe: string | null;
  contenu: string;
  client_id: string | null;
  cree_le: string;
  modifie_le: string | null;
  supprime: boolean;
};

/** Réponse de `GET /api/chat/<conversation>/flux`. */
export type ReponseFlux = {
  /** Nouveaux messages (id > apres) et messages modifiés depuis `depuis`. */
  messages: MessageChat[];
  /** Horloge du serveur, à renvoyer en `depuis` au tour suivant. */
  maintenant: string;
  /** Vrai s'il reste des messages plus anciens (chargement initial ou `avant`). */
  plus_anciens?: boolean;
};

/**
 * Ce que le canal livre aux abonnés. Ajouter un type ici (réaction éphémère,
 * « est en train d'écrire »…) ne casse pas les abonnés existants : chacun
 * ignore ce qu'il ne connaît pas.
 */
export type EvenementChat =
  | { type: "messages"; messages: MessageChat[] }
  | { type: "etat"; connecte: boolean };

/** Ligne SQL → message. La requête doit joindre utilisateurs et equipe. */
export function versMessage(l: Record<string, unknown>): MessageChat {
  const supprime = !!l.supprime;
  return {
    id: Number(l.id),
    conversation_id: String(l.conversation_id),
    auteur_id: String(l.auteur_id),
    auteur_equipe_id: String(l.auteur_equipe_id ?? ""),
    auteur_nom: String(l.auteur_nom ?? "?"),
    auteur_couleur: (l.auteur_couleur as string | null) ?? null,
    auteur_groupe: (l.auteur_groupe as string | null) ?? null,
    // Le texte d'un message supprimé ne quitte pas le serveur.
    contenu: supprime ? "" : String(l.contenu ?? ""),
    client_id: (l.client_id as string | null) ?? null,
    cree_le: String(l.cree_le),
    modifie_le: (l.modifie_le as string | null) ?? null,
    supprime,
  };
}

export const SELECT_MESSAGE = `
  SELECT m.id, m.conversation_id, m.auteur_id, m.contenu, m.client_id, m.cree_le, m.modifie_le, m.supprime,
         e.id AS auteur_equipe_id, e.nom AS auteur_nom, e.groupe AS auteur_groupe,
         json_extract(e.horaires, '$.couleur') AS auteur_couleur
    FROM chat_messages m
    JOIN utilisateurs u ON u.id = m.auteur_id
    JOIN equipe e       ON e.id = u.equipe_id`;

/** Horodatage ISO au même format que les colonnes (`strftime('%Y-%m-%dT%H:%M:%fZ')`). */
export const maintenantIso = () => new Date().toISOString();
