import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Compte } from './auth';
import { CONVERSATION_GENERALE, type EvenementDirect } from './chat';

/**
 * Messagerie, côté serveur : droits d'accès aux conversations et diffusion
 * en direct. Les routes `/api/chat/*` passent toutes par ici.
 */

type Conversation = { id: string; type: string };

/**
 * La conversation si le compte y a accès, sinon null. La générale est ouverte
 * à tous les comptes ; une privée, à ses membres seulement. Une conversation
 * inaccessible répond comme une conversation inexistante : on ne révèle pas
 * qu'une discussion privée existe.
 */
export async function conversationAccessible(db: D1Database, compte: Compte, conversation: string): Promise<Conversation | null> {
  return db.prepare(
    `SELECT c.id, c.type FROM chat_conversations c
      WHERE c.id = ?1 AND (c.type = 'general'
        OR EXISTS (SELECT 1 FROM chat_membres m WHERE m.conversation_id = c.id AND m.utilisateur_id = ?2))`
  ).bind(conversation, compte.id).first<Conversation>();
}

/** Comptes à prévenir pour une conversation ; null = tout le monde. */
export async function destinataires(db: D1Database, conversation: Conversation): Promise<string[] | null> {
  if (conversation.type === 'general' || conversation.id === CONVERSATION_GENERALE) return null;
  const { results } = await db.prepare('SELECT utilisateur_id FROM chat_membres WHERE conversation_id = ?')
    .bind(conversation.id).all<{ utilisateur_id: string }>();
  return results.map(r => r.utilisateur_id);
}

/** Identifiant stable d'une conversation à deux. */
export const idConversationPrivee = (a: string, b: string) => `prive-${[a, b].sort().join('-')}`;

/**
 * Pousse un événement aux postes connectés en direct. Sous `next dev`, le
 * Durable Object n'existe pas (la liaison est là mais ne mène nulle part) :
 * on ne tente rien, les postes sondent et verront l'écriture au tour suivant.
 * Une panne du direct ne doit jamais faire échouer l'écriture.
 */
export async function diffuser(evenement: EvenementDirect, pour: string[] | null): Promise<void> {
  if (process.env.NODE_ENV === 'development') return;
  try {
    const { env } = await getCloudflareContext({ async: true });
    const ns = (env as Partial<CloudflareEnv>).CHAT;
    if (!ns) return;
    await ns.get(ns.idFromName('equipe')).diffuser(evenement, pour);
  } catch (e) {
    console.error('Diffusion messagerie impossible', e);
  }
}
