import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';
import { insererBloc, lireBloc } from '../../../lib/planningBlocs';

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM planning_blocs ORDER BY ordre, cree_le').all();
    return NextResponse.json(result.results.map(lireBloc));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as any;
    if (!String(body.nom ?? '').trim()) return NextResponse.json({ error: 'Nom obligatoire.' }, { status: 400 });
    return NextResponse.json(await insererBloc(body));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
