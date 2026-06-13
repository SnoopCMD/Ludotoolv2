import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const db = await getDB();
    const { searchParams } = new URL(request.url);
    const panier_id = searchParams.get('panier_id');
    let sql = 'SELECT * FROM panier_lignes WHERE 1=1';
    const params: string[] = [];
    if (panier_id) { sql += ' AND panier_id = ?'; params.push(panier_id); }
    sql += ' ORDER BY created_at DESC';
    const stmt = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
    const result = await stmt.all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json() as any;
    const { panier_id, nom, editeur = null, image_url = null, ean = null,
      prix_unitaire = null, quantite = 1, notes = null, tags = null } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO panier_lignes (id,panier_id,nom,editeur,image_url,ean,prix_unitaire,quantite,notes,tags)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id, panier_id, nom, editeur, image_url, ean, prix_unitaire, quantite, notes, tags).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
