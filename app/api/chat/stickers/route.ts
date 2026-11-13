import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { cleR2Sticker } from '../../../../lib/chat-serveur';
import { STICKER_POIDS_MAX, STICKER_TYPES, type StickerChat } from '../../../../lib/chat';

export const dynamic = 'force-dynamic';

/** Stickers de l'équipe au plus (garde-fou de stockage). */
const STICKERS_MAX = 500;

/** La bibliothèque de stickers de l'équipe, les plus récents d'abord. */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const db = await getDB();
    const { results } = await db.prepare(
      `SELECT s.id, s.largeur, s.hauteur, s.auteur_id, s.cree_le, e.nom AS auteur_nom
         FROM chat_stickers s
         JOIN utilisateurs u ON u.id = s.auteur_id
         JOIN equipe e ON e.id = u.equipe_id
        WHERE s.supprime = 0
        ORDER BY s.cree_le DESC`
    ).all<StickerChat>();
    return NextResponse.json({ stickers: results }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Importe un sticker. Formulaire : `fichier` (déjà préparé par le navigateur :
 * redimensionné, sauf les GIF animés), `largeur`, `hauteur`.
 */
export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour importer un sticker.' }, { status: 401 });
    const form = await request.formData();
    const fichier = form.get('fichier');
    const largeur = Number(form.get('largeur')), hauteur = Number(form.get('hauteur'));
    if (!(fichier instanceof File)) return NextResponse.json({ error: 'Fichier manquant.' }, { status: 400 });
    if (!STICKER_TYPES.includes(fichier.type)) return NextResponse.json({ error: 'Format accepté : PNG, JPEG, WebP ou GIF.' }, { status: 400 });
    if (fichier.size > STICKER_POIDS_MAX) return NextResponse.json({ error: 'Image trop lourde (2 Mo au plus).' }, { status: 413 });
    const dimOk = (n: number) => Number.isInteger(n) && n > 0 && n <= 2000;
    if (!dimOk(largeur) || !dimOk(hauteur)) return NextResponse.json({ error: 'Dimensions invalides.' }, { status: 400 });

    const db = await getDB();
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM chat_stickers WHERE supprime = 0').first<{ n: number }>() ?? { n: 0 };
    if (n >= STICKERS_MAX) return NextResponse.json({ error: 'La bibliothèque est pleine : retirez-en quelques-uns.' }, { status: 409 });

    const id = crypto.randomUUID();
    const { env } = await getCloudflareContext({ async: true });
    await env.REGLES.put(cleR2Sticker(id), await fichier.arrayBuffer(), {
      httpMetadata: { contentType: fichier.type, cacheControl: 'private, max-age=31536000, immutable' },
      customMetadata: { auteur_id: compte.id },
    });
    await db.prepare(
      'INSERT INTO chat_stickers (id, auteur_id, type_mime, largeur, hauteur, taille) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, compte.id, fichier.type, largeur, hauteur, fichier.size).run();

    const sticker: StickerChat = { id, largeur, hauteur, auteur_id: compte.id, auteur_nom: compte.nom, cree_le: new Date().toISOString() };
    return NextResponse.json(sticker);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
