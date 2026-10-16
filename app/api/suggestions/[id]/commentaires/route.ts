import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { compteCourant } from '../../../../../lib/auth';

const LONGUEUR_MAX = 2000;

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const result = await db.prepare(
      `SELECT c.id, c.utilisateur_id, c.texte, c.cree_le, c.lu_par_auteur, e.nom
         FROM suggestions_commentaires c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         JOIN equipe e       ON e.id = u.equipe_id
        WHERE c.suggestion_id = ?
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
    if (!compte) return NextResponse.json({ error: 'Connecte-toi pour commenter.' }, { status: 401 });

    const { id } = await params;
    const { texte } = await request.json() as { texte?: string };
    const contenu = (texte ?? '').trim();
    if (!contenu) return NextResponse.json({ error: 'Commentaire vide.' }, { status: 400 });
    if (contenu.length > LONGUEUR_MAX) {
      return NextResponse.json({ error: `Commentaire trop long (max ${LONGUEUR_MAX} caractères).` }, { status: 400 });
    }

    const db = await getDB();
    const suggestion = await db.prepare('SELECT auteur_id FROM suggestions WHERE id = ?')
      .bind(id).first<{ auteur_id: string | null }>();
    if (!suggestion) return NextResponse.json({ error: 'Suggestion introuvable.' }, { status: 404 });

    // Rien à signaler si personne n'est à prévenir, ou si l'auteur se répond.
    const dejaLu = !suggestion.auteur_id || suggestion.auteur_id === compte.id ? 1 : 0;
    const commentaireId = crypto.randomUUID();
    await db.prepare(
      'INSERT INTO suggestions_commentaires (id, suggestion_id, utilisateur_id, texte, lu_par_auteur) VALUES (?, ?, ?, ?, ?)'
    ).bind(commentaireId, id, compte.id, contenu, dejaLu).run();

    const cree = await db.prepare('SELECT cree_le FROM suggestions_commentaires WHERE id = ?')
      .bind(commentaireId).first<{ cree_le: string }>();

    return NextResponse.json({
      id: commentaireId, utilisateur_id: compte.id, nom: compte.nom,
      texte: contenu, cree_le: cree?.cree_le ?? null, lu_par_auteur: dejaLu,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
