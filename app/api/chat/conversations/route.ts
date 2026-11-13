import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { diffuser, idConversationPrivee } from '../../../../lib/chat-serveur';
import { libellePiece, pieceValide, type CompteChat, type ReponseConversations, type ResumeConversation } from '../../../../lib/chat';

const lirePieceBrute = (brut: unknown) => {
  try { return typeof brut === 'string' ? pieceValide(JSON.parse(brut)) : null; } catch { return null; }
};

export const dynamic = 'force-dynamic';

const SELECT_COMPTE = `
  SELECT u.id, e.id AS equipe_id, e.nom, e.groupe, json_extract(e.horaires, '$.couleur') AS couleur
    FROM utilisateurs u JOIN equipe e ON e.id = u.equipe_id`;

/**
 * Les discussions du compte connecté (la générale, puis ses messages privés)
 * avec le nombre de non lus et le dernier message de chacune, plus les autres
 * comptes de l'équipe. Sert la liste du panneau et la pastille de la barre.
 */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const db = await getDB();
    const moi = compte.id;

    const [convs, autres, comptes] = await db.batch([
      // Conversations accessibles, avec non lus et dernier message.
      db.prepare(
        `SELECT c.id, c.type,
                (SELECT COUNT(*) FROM chat_messages m
                  WHERE m.conversation_id = c.id AND m.auteur_id <> ?1 AND m.supprime = 0
                    AND m.id > COALESCE((SELECT dernier_lu FROM chat_lectures l WHERE l.utilisateur_id = ?1 AND l.conversation_id = c.id), 0)
                ) AS non_lus,
                d.auteur_id AS d_auteur, d.contenu AS d_contenu, d.piece AS d_piece, d.cree_le AS d_cree_le, d.supprime AS d_supprime
           FROM chat_conversations c
           LEFT JOIN chat_messages d ON d.id = (SELECT MAX(id) FROM chat_messages WHERE conversation_id = c.id)
          WHERE c.type = 'general'
             OR EXISTS (SELECT 1 FROM chat_membres cm WHERE cm.conversation_id = c.id AND cm.utilisateur_id = ?1)`
      ).bind(moi),
      // L'autre membre de chaque conversation privée.
      db.prepare(
        `SELECT cm.conversation_id, u.id, e.id AS equipe_id, e.nom, e.groupe, json_extract(e.horaires, '$.couleur') AS couleur
           FROM chat_membres cm
           JOIN chat_membres moi ON moi.conversation_id = cm.conversation_id AND moi.utilisateur_id = ?1
           JOIN utilisateurs u ON u.id = cm.utilisateur_id
           JOIN equipe e ON e.id = u.equipe_id
          WHERE cm.utilisateur_id <> ?1`
      ).bind(moi),
      db.prepare(`${SELECT_COMPTE} WHERE u.id <> ? ORDER BY e.nom COLLATE NOCASE`).bind(moi),
    ]);

    const versCompte = (r: Record<string, unknown>): CompteChat => ({
      id: String(r.id), equipe_id: String(r.equipe_id), nom: String(r.nom),
      groupe: (r.groupe as string | null) ?? null, couleur: (r.couleur as string | null) ?? null,
    });
    const avecParConv = new Map<string, CompteChat>();
    for (const r of autres.results as Record<string, unknown>[]) avecParConv.set(String(r.conversation_id), versCompte(r));

    const conversations: ResumeConversation[] = (convs.results as Record<string, unknown>[]).map(r => {
      const avec = avecParConv.get(String(r.id)) ?? null;
      const supprime = !!r.d_supprime;
      return {
        id: String(r.id),
        type: r.type === 'general' ? 'general' : 'prive',
        nom: r.type === 'general' ? 'Général' : avec?.nom ?? 'Discussion',
        avec,
        non_lus: Number(r.non_lus ?? 0),
        dernier: r.d_cree_le ? {
          auteur_id: String(r.d_auteur),
          contenu: supprime ? '' : (String(r.d_contenu ?? '') || libellePiece(lirePieceBrute(r.d_piece))).slice(0, 140),
          cree_le: String(r.d_cree_le),
          supprime,
        } : null,
      };
    });
    // La générale d'abord, puis les privées de la plus récente à la plus ancienne.
    conversations.sort((a, b) =>
      (a.type === 'general' ? -1 : 0) - (b.type === 'general' ? -1 : 0)
      || (b.dernier?.cree_le ?? '').localeCompare(a.dernier?.cree_le ?? ''));

    const corps: ReponseConversations = {
      conversations,
      comptes: (comptes.results as Record<string, unknown>[]).map(versCompte),
    };
    return NextResponse.json(corps, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Ouvre (ou retrouve) la discussion privée avec un compte. Corps : `{ avec }`
 * (id du compte). Idempotent : l'identifiant ne dépend que des deux comptes.
 */
export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { avec } = await request.json().catch(() => ({})) as { avec?: unknown };
    if (typeof avec !== 'string' || avec === compte.id) {
      return NextResponse.json({ error: 'Choisis quelqu’un d’autre.' }, { status: 400 });
    }
    const db = await getDB();
    const autre = await db.prepare('SELECT id FROM utilisateurs WHERE id = ?').bind(avec).first();
    if (!autre) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    const id = idConversationPrivee(compte.id, avec);
    const [creation] = await db.batch([
      db.prepare(`INSERT OR IGNORE INTO chat_conversations (id, nom, type) VALUES (?, '', 'prive')`).bind(id),
      db.prepare('INSERT OR IGNORE INTO chat_membres (conversation_id, utilisateur_id) VALUES (?, ?), (?, ?)')
        .bind(id, compte.id, id, avec),
    ]);
    // Nouvelle discussion : la liste de l'autre se met à jour tout de suite.
    if (creation.meta.changes) await diffuser({ type: 'conversation', conversation_id: id }, [compte.id, avec]);
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
