import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';

const LONGUEUR_MAX = 1000;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const result = await db.prepare(
      `SELECT c.id, c.utilisateur_id, c.texte, c.cree_le, e.nom
         FROM paniers_communs_commentaires c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         JOIN equipe e       ON e.id = u.equipe_id
        WHERE c.ligne_id = ?
        ORDER BY c.cree_le ASC`
    ).bind(id).all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const compte = await compteCourant();
    if (!compte) {
      return NextResponse.json({ error: 'Connecte-toi pour commenter.' }, { status: 401 });
    }

    const { id } = await params;
    const { texte } = await request.json() as { texte?: string };
    const contenu = (texte ?? '').trim();
    if (!contenu) return NextResponse.json({ error: 'Commentaire vide.' }, { status: 400 });
    if (contenu.length > LONGUEUR_MAX) {
      return NextResponse.json({ error: `Commentaire trop long (max ${LONGUEUR_MAX} caractères).` }, { status: 400 });
    }

    const db = await getDB();
    const ligne = await db.prepare('SELECT id FROM paniers_communs_lignes WHERE id = ?')
      .bind(id).first<any>();
    if (!ligne) return NextResponse.json({ error: 'Ligne introuvable.' }, { status: 404 });

    const commentaireId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO paniers_communs_commentaires (id, ligne_id, utilisateur_id, texte) VALUES (?, ?, ?, ?)'
    ).bind(commentaireId, id, compte.id, contenu).run();

    const cree = await db.prepare('SELECT cree_le FROM paniers_communs_commentaires WHERE id = ?')
      .bind(commentaireId).first<any>();

    return NextResponse.json({
      id: commentaireId, utilisateur_id: compte.id, nom: compte.nom,
      texte: contenu, cree_le: cree?.cree_le ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
