import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const body = await request.json() as any;
    const normalized = { ...body };
    if ('membres' in normalized && typeof normalized.membres !== 'string') {
      normalized.membres = JSON.stringify(normalized.membres ?? []);
    }
    const keys = Object.keys(normalized);
    const sets = keys.map(k => `${k} = ?`).join(', ');
    await db.prepare(`UPDATE evenements SET ${sets} WHERE id = ?`).bind(...keys.map(k => normalized[k]), id).run();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * Lundi de la semaine d'une date : la clé de `planning_semaine`.
 */
function lundiDe(date: string) {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Supprimer depuis l'agenda des heures supp. posées par le planning
 * (`hs-<créneau>-<membre>-<n>`) retire aussi le membre du créneau, et ses
 * autres heures supp. sur ce créneau. Le planning, lui, supprime avec
 * `?depuis=planning` : il ajuste ses heures supp. sans toucher aux placements.
 */
async function retirerDuPlanning(db: D1Database, id: string, ev: { date_debut: string; membres: string }) {
  let membres: string[] = [];
  try { membres = JSON.parse(ev.membres ?? '[]'); } catch { /* vide */ }
  const cle = lundiDe(ev.date_debut);
  const ligne = await db.prepare('SELECT slots FROM planning_semaine WHERE semaine_key = ?').bind(cle).first<{ slots: string }>();
  if (!ligne) return;
  const slots: { id: string; membreIds: string[] }[] = JSON.parse(ligne.slots ?? '[]');
  for (const slot of slots) {
    const prefixe = `hs-${slot.id}-`;
    if (!id.startsWith(prefixe)) continue;
    const mid = membres.find(m => slot.membreIds.includes(m) && id.slice(prefixe.length).startsWith(`${m}-`));
    if (!mid) continue;
    slot.membreIds = slot.membreIds.filter(m => m !== mid);
    const autres = `${prefixe}${mid}-`;
    await db.batch([
      db.prepare('UPDATE planning_semaine SET slots = ?, updated_at = ? WHERE semaine_key = ?')
        .bind(JSON.stringify(slots), new Date().toISOString(), cle),
      db.prepare('DELETE FROM evenements WHERE substr(id, 1, ?) = ?').bind(autres.length, autres),
    ]);
    return;
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const db = await getDB();
    const { id } = await params;
    const depuisPlanning = new URL(request.url).searchParams.get('depuis') === 'planning';
    const hs = !depuisPlanning && id.startsWith('hs-')
      ? await db.prepare('SELECT date_debut, membres FROM evenements WHERE id = ?').bind(id).first<{ date_debut: string; membres: string }>()
      : null;
    await db.prepare('DELETE FROM evenements WHERE id = ?').bind(id).run();
    if (hs) await retirerDuPlanning(db, id, hs);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
