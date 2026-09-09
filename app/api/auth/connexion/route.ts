import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { creerSession, normaliserIdentifiant, verifierMotDePasse, compteCourant } from '../../../../lib/auth';

export async function POST(request: Request) {
  try {
    const { identifiant, mot_de_passe } = await request.json() as
      { identifiant?: string; mot_de_passe?: string };

    const login = normaliserIdentifiant(identifiant ?? '');
    if (!login || !mot_de_passe) {
      return NextResponse.json({ error: 'Identifiant et mot de passe requis.' }, { status: 400 });
    }

    const db = await getDB();
    const utilisateur = await db.prepare(
      'SELECT id, mot_de_passe_hash FROM utilisateurs WHERE identifiant = ?'
    ).bind(login).first<any>();

    // Même message dans les deux cas : rien ne doit dire si le compte existe.
    const messageRefus = 'Identifiant ou mot de passe incorrect.';
    if (!utilisateur || !(await verifierMotDePasse(mot_de_passe, utilisateur.mot_de_passe_hash))) {
      return NextResponse.json({ error: messageRefus }, { status: 401 });
    }

    await creerSession(utilisateur.id);
    await db.prepare("UPDATE utilisateurs SET derniere_connexion = datetime('now') WHERE id = ?")
      .bind(utilisateur.id).run();

    return NextResponse.json({ compte: await compteCourant() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
