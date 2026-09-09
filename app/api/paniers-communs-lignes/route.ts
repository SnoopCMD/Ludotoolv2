import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { compteCourant } from '../../../lib/auth';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const panierCommunId = url.searchParams.get('panier_commun_id');
    if (!panierCommunId) return NextResponse.json({ error: 'panier_commun_id manquant' }, { status: 400 });

    const compte = await compteCourant();

    // Trois requêtes bornées au panier demandé, plutôt qu'une liste d'ids en
    // paramètres : D1 plafonne à 100 paramètres liés par requête.
    const [lignes, votes, commentaires] = await Promise.all([
      db.prepare(
        'SELECT * FROM paniers_communs_lignes WHERE panier_commun_id = ? ORDER BY votes DESC, created_at DESC'
      ).bind(panierCommunId).all(),
      db.prepare(
        `SELECT v.ligne_id, v.utilisateur_id, v.valeur, e.nom
           FROM paniers_communs_votes v
           JOIN paniers_communs_lignes l ON l.id = v.ligne_id
           JOIN utilisateurs u ON u.id = v.utilisateur_id
           JOIN equipe e       ON e.id = u.equipe_id
          WHERE l.panier_commun_id = ?`
      ).bind(panierCommunId).all(),
      db.prepare(
        `SELECT c.id, c.ligne_id, c.utilisateur_id, c.texte, c.cree_le, e.nom
           FROM paniers_communs_commentaires c
           JOIN paniers_communs_lignes l ON l.id = c.ligne_id
           JOIN utilisateurs u ON u.id = c.utilisateur_id
           JOIN equipe e       ON e.id = u.equipe_id
          WHERE l.panier_commun_id = ?
          ORDER BY c.cree_le ASC`
      ).bind(panierCommunId).all(),
    ]);

    const votesParLigne = new Map<string, any[]>();
    for (const v of votes.results as any[]) {
      if (!votesParLigne.has(v.ligne_id)) votesParLigne.set(v.ligne_id, []);
      votesParLigne.get(v.ligne_id)!.push(v);
    }
    const commParLigne = new Map<string, any[]>();
    for (const c of commentaires.results as any[]) {
      if (!commParLigne.has(c.ligne_id)) commParLigne.set(c.ligne_id, []);
      commParLigne.get(c.ligne_id)!.push(c);
    }

    return NextResponse.json((lignes.results as any[]).map(l => {
      const v = votesParLigne.get(l.id) ?? [];
      return {
        ...l,
        votants: v.map(x => ({ utilisateur_id: x.utilisateur_id, nom: x.nom, valeur: x.valeur })),
        mon_vote: compte ? (v.find(x => x.utilisateur_id === compte.id)?.valeur ?? 0) : 0,
        commentaires: (commParLigne.get(l.id) ?? []).map(c => ({
          id: c.id, utilisateur_id: c.utilisateur_id, nom: c.nom, texte: c.texte, cree_le: c.cree_le,
        })),
      };
    }));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const {
      panier_commun_id, nom, editeur = null, image_url = null,
      ean = null, prix_unitaire = null, quantite = 1, notes = null, profil = null, console: console_ = null,
    } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO paniers_communs_lignes (id,panier_commun_id,nom,editeur,image_url,ean,prix_unitaire,quantite,notes,profil,console)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, panier_commun_id, nom, editeur, image_url, ean, prix_unitaire, quantite, notes, profil, console_).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
