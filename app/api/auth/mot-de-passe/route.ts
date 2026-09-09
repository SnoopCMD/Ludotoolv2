import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';
import { compteCourant, hacherMotDePasse, verifierMotDePasse } from '../../../../lib/auth';

const MDP_PAR_DEFAUT = 'ludo92';
const LONGUEUR_MIN = 6;

export async function POST(request: Request) {
  try {
    const compte = await compteCourant();
    if (!compte) return NextResponse.json({ error: 'Non connecté.' }, { status: 401 });

    const { ancien_mot_de_passe, nouveau_mot_de_passe } = await request.json() as
      { ancien_mot_de_passe?: string; nouveau_mot_de_passe?: string };

    const nouveau = nouveau_mot_de_passe ?? '';
    if (nouveau.length < LONGUEUR_MIN) {
      return NextResponse.json(
        { error: `Le mot de passe doit faire au moins ${LONGUEUR_MIN} caractères.` }, { status: 400 }
      );
    }
    if (nouveau === MDP_PAR_DEFAUT) {
      return NextResponse.json(
        { error: 'Choisis un mot de passe différent de celui par défaut.' }, { status: 400 }
      );
    }

    const db = await getDB();
    const ligne = await db.prepare('SELECT mot_de_passe_hash FROM utilisateurs WHERE id = ?')
      .bind(compte.id).first<any>();
    if (!ligne) return NextResponse.json({ error: 'Compte introuvable.' }, { status: 404 });

    // Le changement imposé à la première connexion se fait sans redemander
    // l'ancien mot de passe : il vient d'être saisi pour ouvrir la session.
    if (!compte.doit_changer_mdp) {
      if (!ancien_mot_de_passe || !(await verifierMotDePasse(ancien_mot_de_passe, ligne.mot_de_passe_hash))) {
        return NextResponse.json({ error: 'Ancien mot de passe incorrect.' }, { status: 401 });
      }
    }

    await db.prepare(
      'UPDATE utilisateurs SET mot_de_passe_hash = ?, doit_changer_mdp = 0 WHERE id = ?'
    ).bind(await hacherMotDePasse(nouveau), compte.id).run();

    return NextResponse.json({ compte: await compteCourant() });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
