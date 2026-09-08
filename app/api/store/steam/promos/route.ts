import { NextResponse } from "next/server";
import { getDB } from "../../../../../lib/db";
import { chercherSteam } from "../../../../../lib/steam";

export const dynamic = "force-dynamic";

// Les alertes promo sont des alertes normales : elles remontent donc dans le
// compteur de la barre de navigation et sur le tableau de bord, sans table
// dédiée. Ce marqueur, présent dans la description, permet de les retrouver
// pour les mettre à jour ou les clore quand la promo se termine.
const MARQUEUR = "· promo Steam ·";

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

type LigneWishlist = { nom: string };
type AlerteRow = { id: string; titre: string; description: string | null; jeu_nom: string | null };

/**
 * Compare les jeux PC du panier commun aux prix Steam du jour :
 * ouvre une alerte pour chaque promo qui démarre, met à jour celles dont la
 * remise a changé, et clôt celles dont la promo est terminée.
 * Conçue pour être appelée une fois par jour (voir .github/workflows/promos-steam.yml)
 * mais rejouable sans risque : rien n'est dupliqué.
 */
export async function GET() {
  try {
    const db = await getDB();

    const lignes = await db.prepare(`
      SELECT DISTINCT nom FROM paniers_communs_lignes
      WHERE panier_commun_id = 'commun-jv' AND COALESCE(console, '') = 'PC'
      ORDER BY nom
    `).all();
    const noms = (lignes.results as LigneWishlist[]).map(l => l.nom).filter(Boolean);

    const alertesRows = await db.prepare(`
      SELECT id, titre, description, jeu_nom FROM alertes
      WHERE statut = 'active' AND description LIKE ?
    `).bind(`%${MARQUEUR}%`).all();
    const alertesOuvertes = new Map<string, AlerteRow>();
    for (const a of alertesRows.results as AlerteRow[]) {
      if (a.jeu_nom) alertesOuvertes.set(a.jeu_nom, a);
    }

    if (noms.length === 0) {
      // Plus aucun jeu PC en wishlist : on ne laisse pas traîner d'alerte.
      for (const a of alertesOuvertes.values()) {
        await db.prepare(`UPDATE alertes SET statut = 'resolue' WHERE id = ?`).bind(a.id).run();
      }
      return NextResponse.json({ verifies: 0, promos: 0, creees: 0, majs: 0, resolues: alertesOuvertes.size, details: [] });
    }

    const fiches = await Promise.all(noms.map(chercherSteam));

    let creees = 0, majs = 0, resolues = 0;
    const details: Array<{ nom: string; remise: number | null; prix: number | null; action: string }> = [];

    for (const f of fiches) {
      const nom = f.nom_recherche;
      const existante = alertesOuvertes.get(nom);
      alertesOuvertes.delete(nom);

      if (!f.remise || f.prix == null) {
        if (existante) {
          await db.prepare(`UPDATE alertes SET statut = 'resolue' WHERE id = ?`).bind(existante.id).run();
          resolues++;
          details.push({ nom, remise: null, prix: f.prix, action: "promo terminée" });
        }
        continue;
      }

      const titre = `${f.titre ?? nom} à -${f.remise} % sur Steam`;
      const description = [
        euros(f.prix),
        f.prix_initial != null ? `au lieu de ${euros(f.prix_initial)}` : null,
        MARQUEUR,
        f.url,
      ].filter(Boolean).join(" ");

      if (!existante) {
        await db.prepare(`
          INSERT INTO alertes (id, titre, description, type, jeu_nom, statut)
          VALUES (?, ?, ?, 'info', ?, 'active')
        `).bind(crypto.randomUUID(), titre, description, nom).run();
        creees++;
        details.push({ nom, remise: f.remise, prix: f.prix, action: "nouvelle promo" });
      } else if (existante.titre !== titre || existante.description !== description) {
        await db.prepare(`UPDATE alertes SET titre = ?, description = ? WHERE id = ?`)
          .bind(titre, description, existante.id).run();
        majs++;
        details.push({ nom, remise: f.remise, prix: f.prix, action: "remise modifiée" });
      } else {
        details.push({ nom, remise: f.remise, prix: f.prix, action: "déjà signalée" });
      }
    }

    // Alertes restantes : le jeu n'est plus dans la wishlist.
    for (const a of alertesOuvertes.values()) {
      await db.prepare(`UPDATE alertes SET statut = 'resolue' WHERE id = ?`).bind(a.id).run();
      resolues++;
    }

    return NextResponse.json({
      verifies: noms.length,
      promos: fiches.filter(f => f.remise).length,
      creees, majs, resolues,
      details,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
