import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant } from '../../../../lib/auth';

export const dynamic = 'force-dynamic';

const MAX_MODULES = 20;

type Preferences = { accueil_modules: string[] | null };

/** Préférences du compte connecté. `accueil_modules` vaut null tant que le
 *  compte n'a rien personnalisé : le client applique alors la présentation par
 *  défaut, la même qu'hors connexion. */
export async function GET() {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

    const db = await getDB();
    const ligne = await db.prepare(
      'SELECT accueil_modules FROM utilisateur_preferences WHERE utilisateur_id = ?'
    ).bind(compte.id).first<{ accueil_modules: string }>();

    let modules: string[] | null = null;
    if (ligne) {
      try { modules = JSON.parse(ligne.accueil_modules); } catch { modules = null; }
      if (!Array.isArray(modules)) modules = null;
    }
    return NextResponse.json({ accueil_modules: modules } satisfies Preferences);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

    const body = await request.json() as { accueil_modules?: unknown };
    const brut = body.accueil_modules;
    if (!Array.isArray(brut) || brut.some(m => typeof m !== 'string') || brut.length > MAX_MODULES) {
      return NextResponse.json({ error: 'Liste de modules invalide.' }, { status: 400 });
    }
    // Un module ne peut apparaître qu'une fois : l'ordre est celui de l'affichage.
    const modules = [...new Set(brut as string[])];

    const db = await getDB();
    await db.prepare(
      `INSERT INTO utilisateur_preferences (utilisateur_id, accueil_modules, maj_le)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(utilisateur_id) DO UPDATE SET
         accueil_modules = excluded.accueil_modules,
         maj_le = excluded.maj_le`
    ).bind(compte.id, JSON.stringify(modules)).run();

    return NextResponse.json({ accueil_modules: modules } satisfies Preferences);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
