import { NextResponse } from 'next/server';
import { getDB } from '../../../../lib/db';

/**
 * Recoupe les lignes d'un panier commun avec les réceptions déjà enregistrées
 * dans l'atelier (table `commandes`). Lecture seule : rien n'est modifié ici,
 * ni côté panier, ni côté atelier.
 *
 * Trois niveaux de certitude, du plus sûr au plus douteux :
 *   - `ean`  : même code-barres. Sans ambiguïté.
 *   - `nom`  : noms identiques une fois normalisés (casse, accents, ponctuation).
 *   - `proche` : l'un des deux noms contient l'autre (« Dixit » / « Dixit
 *     Odyssey »). Signalé, mais jamais coché d'office — c'est souvent une autre
 *     édition ou une extension.
 */

const normaliser = (v: string) =>
  (v ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const panierCommunId = url.searchParams.get('panier_commun_id');
    if (!panierCommunId) return NextResponse.json({ error: 'panier_commun_id manquant' }, { status: 400 });

    const db = await getDB();
    const [lignes, receptions] = await Promise.all([
      db.prepare('SELECT id, nom, ean FROM paniers_communs_lignes WHERE panier_commun_id = ?')
        .bind(panierCommunId).all(),
      db.prepare("SELECT id, ean, nom, date_commande FROM commandes WHERE statut = 'Reçu' ORDER BY date_commande DESC")
        .all(),
    ]);

    const recues = (receptions.results as any[]).map(r => ({ ...r, nomNormalise: normaliser(r.nom) }));
    // `ean` vaut 'Manuel' pour les saisies sans code-barres : ce n'est pas un
    // identifiant, il ne doit jamais servir à rapprocher deux jeux.
    const parEan = new Map<string, any>();
    for (const r of recues) {
      if (r.ean && r.ean !== 'Manuel' && !parEan.has(r.ean)) parEan.set(r.ean, r);
    }

    const correspondances = (lignes.results as any[]).map(ligne => {
      if (ligne.ean && ligne.ean !== 'Manuel' && parEan.has(ligne.ean)) {
        const r = parEan.get(ligne.ean);
        return { ligne_id: ligne.id, type: 'ean', reception_nom: r.nom, date_reception: r.date_commande };
      }

      const cible = normaliser(ligne.nom);
      if (!cible) return { ligne_id: ligne.id, type: null };

      const exact = recues.find(r => r.nomNormalise === cible);
      if (exact) {
        return { ligne_id: ligne.id, type: 'nom', reception_nom: exact.nom, date_reception: exact.date_commande };
      }

      // Un fragment trop court rapprocherait n'importe quoi (« Uno » dans
      // « Communication »), d'où le seuil.
      const proche = cible.length >= 5
        ? recues.find(r => r.nomNormalise.includes(cible) || (r.nomNormalise.length >= 5 && cible.includes(r.nomNormalise)))
        : undefined;
      if (proche) {
        return { ligne_id: ligne.id, type: 'proche', reception_nom: proche.nom, date_reception: proche.date_commande };
      }

      return { ligne_id: ligne.id, type: null };
    });

    return NextResponse.json(correspondances.filter(c => c.type !== null));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
