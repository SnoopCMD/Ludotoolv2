import { NextResponse } from 'next/server';
import { getDB } from '../../../../../lib/db';
import { FICHES, modifier } from '../../../../../lib/reunion';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json() as any;
    // fait_le suit le statut : c'est lui qui date le « terminé depuis la
    // dernière réunion » des suggestions d'ordre du jour.
    if ('statut' in body) body.fait_le = body.statut === 'fait' ? new Date().toISOString() : null;
    // Rouvrir une mission terminée remet les validations personnelles à zéro :
    // sinon elle resterait invisible à l'accueil de ceux qui avaient validé.
    if ('statut' in body && body.statut !== 'fait' && !('valide_par' in body)) {
      const avant = await (await getDB()).prepare('SELECT statut FROM reunion_fiches WHERE id = ?').bind(id).first<{ statut: string }>();
      if (avant?.statut === 'fait') body.valide_par = [];
    }
    const fiche = await modifier(FICHES, id, body);
    if (!fiche) return NextResponse.json({ error: 'Fiche introuvable.' }, { status: 404 });
    return NextResponse.json(fiche);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM reunion_fiches WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
