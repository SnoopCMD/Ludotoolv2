import { NextRequest, NextResponse } from 'next/server';
import { chercherJvc, completerDepuisJvc, ficheJvc, type FicheJvc } from '../../../../lib/jeuxvideo';
import { chercherTraderGames, titreSansPlateforme } from '../../../../lib/tradergames';
import { choisirConsole, consoleDepuisPlateforme } from '../../../../lib/consolesJv';

export const dynamic = 'force-dynamic';

/** Fiche jeuxvideo.com mise au format du formulaire d'ajout. */
function versFormulaire(f: FicheJvc, console: string | null) {
  return {
    titre: f.titre,
    description: f.description,
    image_url: f.image_url,
    annee: f.annee,
    editeur: f.editeur,
    genre: f.genres.length ? f.genres.join(', ') : null,
    pegi: f.pegi,
    console: choisirConsole(f.plateformes, console),
    url_source: f.url,
  };
}

/**
 * Sources françaises pour l'ajout d'un jeu vidéo :
 *  - `?q=titre`           recherche jeuxvideo.com + Trader Games
 *  - `?fiche=url`         fiche jeuxvideo.com d'un résultat
 *  - `?completer=titre`   meilleure fiche jeuxvideo.com pour un titre
 * `console` (facultatif) départage les plateformes d'une fiche.
 * Les deux sites refusent parfois les requêtes automatiques : `bloque` le dit,
 * l'interface se rabat alors sur IGDB.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const console = sp.get('console');
  try {
    const fiche = sp.get('fiche');
    if (fiche) {
      const r = await ficheJvc(fiche);
      return NextResponse.json({ fiche: r.fiche ? versFormulaire(r.fiche, console) : null, bloque: r.bloque });
    }

    const completer = sp.get('completer')?.trim();
    if (completer) {
      const r = await completerDepuisJvc(completer);
      return NextResponse.json({ fiche: r.fiche ? versFormulaire(r.fiche, console) : null, bloque: r.bloque });
    }

    const q = sp.get('q')?.trim();
    if (!q || q.length < 2) return NextResponse.json({ error: 'Paramètre q manquant' }, { status: 400 });

    const [jvc, tg] = await Promise.all([chercherJvc(q), chercherTraderGames(q)]);
    // Trader Games vend toutes les générations : on ne garde que nos consoles.
    const tgJeux = tg.resultats
      .map(r => ({ ...r, console: consoleDepuisPlateforme(r.plateforme) }))
      .filter(r => r.console && (!console || r.console === console))
      .map(r => ({ titre: r.nom, titre_jeu: titreSansPlateforme(r.nom), image_url: r.image_url, console: r.console, url: r.url_source, etat: r.etat ?? null }));

    return NextResponse.json({
      jeuxvideo: { resultats: jvc.resultats, bloque: jvc.bloque },
      tradergames: { resultats: tgJeux, bloque: tg.bloque },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Erreur serveur' }, { status: 502 });
  }
}
