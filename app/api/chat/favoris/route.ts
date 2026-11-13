import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';
import { FAVORIS_MAX, pieceValide, type FavoriChat } from '../../../../lib/chat';

export const dynamic = 'force-dynamic';

/** Les favoris du compte connecté (GIF et stickers), les plus récents d'abord. */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const db = await getDB();
    const { results } = await db.prepare(
      'SELECT media FROM chat_favoris WHERE utilisateur_id = ? ORDER BY cree_le DESC'
    ).bind(compte.id).all<{ media: string }>();
    const favoris: FavoriChat[] = [];
    for (const r of results) {
      try { const p = pieceValide(JSON.parse(r.media)); if (p) favoris.push(p); } catch { /* ligne abîmée : ignorée */ }
    }
    return NextResponse.json({ favoris }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * Ajoute ou retire un favori (bascule). Corps : `{ piece }`, la pièce telle
 * qu'elle s'enverrait (GIF ou sticker). Renvoie `{ favori: true|false }`.
 */
export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Connecte-toi.' }, { status: 401 });
    const { piece: brute } = await request.json().catch(() => ({})) as { piece?: unknown };
    const piece = pieceValide(brute);
    if (!piece) return NextResponse.json({ error: 'GIF ou sticker invalide.' }, { status: 400 });

    const db = await getDB();
    const retrait = await db.prepare('DELETE FROM chat_favoris WHERE utilisateur_id = ? AND type = ? AND ref_id = ?')
      .bind(compte.id, piece.type, piece.id).run();
    if (retrait.meta.changes) return NextResponse.json({ favori: false });

    if (piece.type === 'sticker') {
      const existe = await db.prepare('SELECT 1 FROM chat_stickers WHERE id = ?').bind(piece.id).first();
      if (!existe) return NextResponse.json({ error: 'Ce sticker n’existe pas.' }, { status: 404 });
    }
    const { n } = await db.prepare('SELECT COUNT(*) AS n FROM chat_favoris WHERE utilisateur_id = ?').bind(compte.id).first<{ n: number }>() ?? { n: 0 };
    if (n >= FAVORIS_MAX) return NextResponse.json({ error: `${FAVORIS_MAX} favoris au plus : retire-en quelques-uns.` }, { status: 409 });

    await db.prepare('INSERT OR IGNORE INTO chat_favoris (utilisateur_id, type, ref_id, media) VALUES (?, ?, ?, ?)')
      .bind(compte.id, piece.type, piece.id, JSON.stringify(piece)).run();
    return NextResponse.json({ favori: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
