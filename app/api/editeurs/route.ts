import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM editeurs ORDER BY nom').all();
    return NextResponse.json(result.results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = await getDB();
    const body = await request.json();
    const { nom, type_commande = 'inconnu', url_formulaire = null, email_contact = null,
      sujet_email = null, corps_email = null, notes = null } = body;
    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO editeurs (id,nom,type_commande,url_formulaire,email_contact,sujet_email,corps_email,notes)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(id, nom, type_commande, url_formulaire, email_contact, sujet_email, corps_email, notes).run();
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
