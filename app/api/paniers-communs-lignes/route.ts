import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const url = new URL(request.url);
    const panierCommunId = url.searchParams.get('panier_commun_id');
    if (!panierCommunId) return NextResponse.json({ error: 'panier_commun_id manquant' }, { status: 400 });
    const result = await db.prepare(
      'SELECT * FROM paniers_communs_lignes WHERE panier_commun_id = ? ORDER BY votes DESC, created_at DESC'
    ).bind(panierCommunId).all();
    return NextResponse.json(result.results);
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
      ean = null, prix_unitaire = null, quantite = 1, notes = null, profil = null,
    } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO paniers_communs_lignes (id,panier_commun_id,nom,editeur,image_url,ean,prix_unitaire,quantite,notes,profil)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, panier_commun_id, nom, editeur, image_url, ean, prix_unitaire, quantite, notes, profil).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
