import { NextResponse } from 'next/server';
import { getDB } from '../../../lib/db';

const SLOTS = ['PS5', 'Switch_Multi', 'Switch_Solo', 'PC'];

export async function GET() {
  try {
    const db = await getDB();
    const result = await db.prepare('SELECT * FROM jv_standby').all();
    return NextResponse.json(result.results.map((r: any) => ({
      ...r,
      jeux_ids: (() => { try { return JSON.parse(r.jeux_ids ?? '[]'); } catch { return []; } })(),
      inclure_permanents: !!r.inclure_permanents,
    })));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Un seul stand-by par emplacement : l'enregistrer remplace le précédent.
export async function PUT(request: Request) {
  try {
    const db = await getDB();
    const b = await request.json() as any;
    if (!SLOTS.includes(b.slot)) return NextResponse.json({ error: 'slot invalide' }, { status: 400 });
    if (!b.date_debut) return NextResponse.json({ error: 'date_debut requise' }, { status: 400 });
    const mode = b.mode === 'selection' ? 'selection' : 'aucun';
    await db.prepare(
      `INSERT OR REPLACE INTO jv_standby (slot, date_debut, date_fin, mode, jeux_ids, inclure_permanents, motif)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      b.slot, b.date_debut, b.date_fin || null, mode,
      JSON.stringify(mode === 'selection' && Array.isArray(b.jeux_ids) ? b.jeux_ids : []),
      mode === 'selection' && b.inclure_permanents ? 1 : 0,
      (b.motif ?? '').trim() || null,
    ).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const db = await getDB();
    const slot = new URL(request.url).searchParams.get('slot');
    if (!slot) return NextResponse.json({ error: 'slot requis' }, { status: 400 });
    await db.prepare('DELETE FROM jv_standby WHERE slot = ?').bind(slot).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
