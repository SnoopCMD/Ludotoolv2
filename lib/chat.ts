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
  /** GIF (ou sticker) joint au message ; null pour un message texte. */
  piece: PieceChat | null;
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
  | { type: "conversation"; conversation_id: string }
  /** Quelqu'un a réagi à un de MES messages (envoyé à l'auteur seul) : notification. */
  | { type: "reaction"; conversation_id: string; message_id: number; emoji: string; par: CompteChat; extrait: string }
  /**
   * Réaction volante : une émote qui monte au milieu de l'écran, éphémère
   * (rien en base). Générale seulement, relayée par le Durable Object à tous.
   * `cle` est tirée par l'onglet émetteur, qui reconnaît ainsi son propre écho.
   */
  | VolanteChat;

export type VolanteChat = {
  type: "volante"; conversation_id: string; auteur_id: string; cle: string;
  /** Une émote, ou un GIF (l'un ou l'autre). */
  emoji?: string; gif?: MediaGif;
};

/** Ce qu'un poste envoie sur la WebSocket (l'auteur est ajouté par le serveur). */
export type EnvoiDirect = { type: "volante"; conversation_id: string; cle: string; emoji?: string; gif?: MediaGif };

/** Garde-fou du Durable Object : volantes au plus par compte et par fenêtre. */
export const VOLANTES_MAX = 12;
export const VOLANTES_FENETRE_MS = 3000;

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
    piece: supprime ? null : lirePiece(l.piece),
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
  SELECT m.id, m.conversation_id, m.auteur_id, m.contenu, m.piece, m.client_id, m.cree_le, m.modifie_le, m.supprime,
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

// ── Pièces jointes : GIF ──────────────────────────────────────────────────

/** Ce qu'il faut pour afficher un GIF (servi par GIPHY, jamais copié chez nous). */
export type MediaGif = { url: string; mp4: string | null; largeur: number; hauteur: number };

export type PieceGif = MediaGif & { type: "gif"; id: string; titre: string };
/** Ce qu'un message peut porter en plus (ou à la place) du texte. */
export type PieceChat = PieceGif;

/** Un résultat de recherche (`GET /api/chat/gifs`). */
export type ResultatGif = MediaGif & { id: string; titre: string };
export type ReponseGifs = { gifs: ResultatGif[]; suite: number | null };

/** Seuls les fichiers de GIPHY sont acceptés : on n'affiche pas d'image venue de n'importe où. */
const URL_GIPHY = /^https:\/\/(?:media[0-9]?|i)\.giphy\.com\/[^\s"'<>\\]{1,600}$/;
const dimension = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) <= 2000;

/** Un média GIF bien formé et hébergé par GIPHY, ou null. */
export function mediaGifValide(g: unknown): MediaGif | null {
  const o = g as Partial<MediaGif> | null;
  if (!o || typeof o.url !== "string" || !URL_GIPHY.test(o.url)) return null;
  if (o.mp4 != null && (typeof o.mp4 !== "string" || !URL_GIPHY.test(o.mp4))) return null;
  if (!dimension(o.largeur) || !dimension(o.hauteur)) return null;
  return { url: o.url, mp4: o.mp4 ?? null, largeur: o.largeur as number, hauteur: o.hauteur as number };
}

/** Pièce jointe envoyée par un client → version propre, ou null si invalide. */
export function pieceValide(p: unknown): PieceChat | null {
  const o = p as Partial<PieceGif> | null;
  if (!o || o.type !== "gif" || typeof o.id !== "string" || !/^[A-Za-z0-9]{1,64}$/.test(o.id)) return null;
  const media = mediaGifValide(o);
  if (!media) return null;
  return { type: "gif", id: o.id, titre: typeof o.titre === "string" ? o.titre.slice(0, 120) : "", ...media };
}

function lirePiece(brut: unknown): PieceChat | null {
  if (typeof brut !== "string" || !brut) return null;
  try { return pieceValide(JSON.parse(brut)); } catch { return null; }
}

/** Texte de remplacement d'une pièce (aperçus, notifications). */
export function libellePiece(p: PieceChat | null): string {
  return p?.type === "gif" ? "🎞️ GIF" : "";
}
