import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';
import { conversationAccessible } from '../../../../../lib/chat-serveur';
import { SELECT_MESSAGE, TAILLE_PAGE, maintenantIso, versMessage, type ReponseFlux } from '../../../../../lib/chat';

export const dynamic = 'force-dynamic';

// Marge sur `depuis` : une modification enregistrée pendant la lecture précédente
// ne doit pas passer entre deux tours. Les doublons sont fusionnés par id côté client.
const MARGE_MS = 15_000;

/**
 * Flux d'une conversation, réservé aux comptes qui y ont accès.
 *
 *  - sans paramètre : les `TAILLE_PAGE` derniers messages (ouverture du panneau) ;
 *  - `?avant=<id>` : la page précédente (on remonte l'historique) ;
 *  - `?apres=<id>&depuis=<iso>` : les nouveaux messages, plus ceux modifiés ou
 *    supprimés depuis le dernier tour. C'est l'appel répété par le canal.
 */
export async function GET(request: Request, { params }: { params: Promise<{ conversation: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour lire la messagerie.' }, { status: 401 });
    const { conversation } = await params;
    const url = new URL(request.url);
    const apres = url.searchParams.get('apres');
    const avant = url.searchParams.get('avant');
    const depuis = url.searchParams.get('depuis');
    const db = await getDB();
    if (!await conversationAccessible(db, compte, conversation)) {
      return NextResponse.json({ error: 'Conversation introuvable.' }, { status: 404 });
    }
    const maintenant = maintenantIso();
    const entetes = { 'Cache-Control': 'no-store' };

    if (apres !== null) {
      const borne = depuis ? new Date(Date.parse(depuis) - MARGE_MS).toISOString() : maintenant;
      const { results } = await db.prepare(
        `${SELECT_MESSAGE}
          WHERE m.conversation_id = ?1 AND (m.id > ?2 OR (m.modifie_le IS NOT NULL AND m.modifie_le > ?3))
          ORDER BY m.id ASC LIMIT 500`
      ).bind(conversation, Number(apres) || 0, borne).all<Record<string, unknown>>();
      const corps: ReponseFlux = { messages: results.map(versMessage), maintenant };
      return NextResponse.json(corps, { headers: entetes });
    }

    // Une ligne de plus que demandé : dit s'il reste de l'historique à charger.
    const { results } = await db.prepare(
      `${SELECT_MESSAGE}
        WHERE m.conversation_id = ?1 ${avant ? 'AND m.id < ?3' : ''}
        ORDER BY m.id DESC LIMIT ?2`
    ).bind(conversation, TAILLE_PAGE + 1, ...(avant ? [Number(avant) || 0] : [])).all<Record<string, unknown>>();
    const plus_anciens = results.length > TAILLE_PAGE;
    const corps: ReponseFlux = {
      messages: results.slice(0, TAILLE_PAGE).reverse().map(versMessage),
      maintenant,
      plus_anciens,
    };
    return NextResponse.json(corps, { headers: entetes });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
