import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { champsProfil, lireProfil, reponseErreur } from '../../../../lib/jvProfils';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const champs = champsProfil(await request.json(), true);
    const cles = Object.keys(champs);
    if (cles.length) {
      const db = await getDB();
      await db.prepare(`UPDATE jv_profils SET ${cles.map(k => `${k} = ?`).join(', ')} WHERE id = ?`)
        .bind(...cles.map(k => champs[k]), id).run();
    }
    const p = await lireProfil(id);
    return p ? NextResponse.json(p) : NextResponse.json({ error: 'Profil introuvable.' }, { status: 404 });
  } catch (e: any) {
    return reponseErreur(e);
  }
}

/** Les réservations passées gardent prénom, sexe et âge : seule la fiche part. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDB();
    await db.prepare('DELETE FROM jv_profils WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return reponseErreur(e);
  }
}
