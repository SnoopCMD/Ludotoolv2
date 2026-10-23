import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { modifierBloc } from '../../../../lib/planningBlocs';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bloc = await modifierBloc(id, await request.json());
    if (!bloc) return NextResponse.json({ error: 'Bloc introuvable.' }, { status: 404 });
    return NextResponse.json(bloc);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/** Les créneaux déjà remplis dans les semaines restent : seuls les vides disparaissent à la réouverture. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    await db.prepare('DELETE FROM planning_blocs WHERE id = ?').bind(id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
