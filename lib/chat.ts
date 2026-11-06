/**
 * Messagerie interne : types et constantes partagés entre les routes API et le
 * client. Pas d'accès à la base ici (le fichier est importé côté navigateur).
 *
 * Architecture :
 *
 *  - D1 est la source de vérité (`migrations/0024_chat.sql`, `0025_chat_prive.sql`).
 *    Tout message a un `id` entier croissant qui sert de curseur.
 *  - Le direct passe par un Durable Object (`worker/MessagerieDO.ts`) : les
 *    routes écrivent en base puis lui demandent de pousser un `EvenementDirect`
 *    aux comptes concernés, par WebSocket.
 *  - Côté navigateur, une seule connexion par onglet (`lib/chat-canal.ts`)
 *    distribue les événements à qui s'y abonne. Sans direct (coupure, `next
 *    dev`), les abonnés reviennent au sondage HTTP ; à la reconnexion, ils
 *    rattrapent ce qu'ils ont manqué avec le curseur.
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
  /** Dernier changement : suppression, ou réaction posée ou retirée. */
  modifie_le: string | null;
  supprime: boolean;
  /** Par émote, dans l'ordre où elle a été posée la première fois. */
  reactions: ReactionChat[];
};

export type ReactionChat = {
  emoji: string;
  /** Qui l'a posée (ids de comptes et prénoms, pour l'infobulle). */
  comptes: { id: string; nom: string }[];
};

/** Proposées en un clic sous un message. */
export const REACTIONS_RAPIDES = ["👍", "❤️", "😂", "😮", "😢", "🎉"];

/** Le choix complet, quand on clique sur « + ». */
export const REACTIONS_TOUTES = [
  "👍", "👎", "❤️", "😂", "🤣", "😮", "😢", "😡", "🎉", "🔥",
  "👏", "🙏", "💪", "🤝", "👀", "🤔", "😅", "😎", "🥳", "😴",
  "✅", "❌", "⭐", "💯", "🚀", "☕", "🍕", "🍰", "🎂", "🎁",
  "🎲", "♟️", "🃏", "🧩", "🎮", "🕹️", "🏆", "🦄", "🐉", "👻",
];

/** Émotes différentes au plus sur un message (garde-fou). */
export const REACTIONS_MAX_PAR_MESSAGE = 20;

/** Une seule émote : un caractère pictographique, avec ses variantes (peau, ZWJ…). */
export function emojiValide(e: unknown): e is string {
  if (typeof e !== "string" || e.length === 0 || e.length > 16 || /\s/.test(e)) return false;
  if (!/\p{Extended_Pictographic}/u.test(e)) return false;
  // Pas de texte autour : seulement pictogrammes, modificateurs, ZWJ et sélecteurs.
  return /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|\u200D|\uFE0F|\u20E3)+$/u.test(e);
}

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
 * Ce que le serveur pousse en direct. Ajouter un type ici (réaction éphémère,
 * « est en train d'écrire »…) ne casse pas les postes existants : chacun
 * ignore ce qu'il ne connaît pas.
 */
export type EvenementDirect =
  /** Message nouveau, ou modifié / supprimé (même id). */
  | { type: "message"; message: MessageChat }
  /** Une conversation vient d'être créée avec ce compte parmi les membres. */
  | { type: "conversation"; conversation_id: string };

/** Ligne de la liste des discussions (`GET /api/chat/conversations`). */
export type ResumeConversation = {
  id: string;
  type: "general" | "prive";
  /** « Général », ou le prénom de l'autre personne. */
  nom: string;
  /** Message privé : l'autre membre. */
  avec: CompteChat | null;
  non_lus: number;
  dernier: { auteur_id: string; contenu: string; cree_le: string; supprime: boolean } | null;
};

/** Un compte de l'équipe, tel que la messagerie l'affiche. */
export type CompteChat = {
  id: string;
  equipe_id: string;
  nom: string;
  groupe: string | null;
  couleur: string | null;
};

export type ReponseConversations = {
  conversations: ResumeConversation[];
  /** Les autres comptes : on peut ouvrir une discussion privée avec chacun. */
  comptes: CompteChat[];
};

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
    reactions: supprime ? [] : grouperReactions(l.reactions),
  };
}

/** `[{e, u, n}, …]` (JSON de la requête, triés par date) → par émote. */
function grouperReactions(brut: unknown): ReactionChat[] {
  let lignes: { e: string; u: string; n: string }[] = [];
  try { lignes = typeof brut === "string" ? JSON.parse(brut) : []; } catch { /* JSON abîmé : aucune réaction */ }
  const parEmoji = new Map<string, ReactionChat>();
  for (const r of lignes) {
    if (!r?.e) continue;
    if (!parEmoji.has(r.e)) parEmoji.set(r.e, { emoji: r.e, comptes: [] });
    parEmoji.get(r.e)!.comptes.push({ id: String(r.u), nom: String(r.n ?? "?") });
  }
  return [...parEmoji.values()];
}

export const SELECT_MESSAGE = `
  SELECT m.id, m.conversation_id, m.auteur_id, m.contenu, m.client_id, m.cree_le, m.modifie_le, m.supprime,
         e.id AS auteur_equipe_id, e.nom AS auteur_nom, e.groupe AS auteur_groupe,
         json_extract(e.horaires, '$.couleur') AS auteur_couleur,
         (SELECT json_group_array(json_object('e', x.emoji, 'u', x.utilisateur_id, 'n', x.nom))
            FROM (SELECT r.emoji, r.utilisateur_id, re.nom
                    FROM chat_reactions r
                    JOIN utilisateurs ru ON ru.id = r.utilisateur_id
                    JOIN equipe re ON re.id = ru.equipe_id
                   WHERE r.message_id = m.id
                   ORDER BY r.cree_le) x) AS reactions
    FROM chat_messages m
    JOIN utilisateurs u ON u.id = m.auteur_id
    JOIN equipe e       ON e.id = u.equipe_id`;

/** Horodatage ISO au même format que les colonnes (`strftime('%Y-%m-%dT%H:%M:%fZ')`). */
export const maintenantIso = () => new Date().toISOString();
