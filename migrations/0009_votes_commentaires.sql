-- Votes nominatifs et commentaires sur les lignes des paniers communs.
--
-- Avant : `paniers_communs_lignes.votes` était un simple compteur, incrémenté
-- par n'importe qui, sans trace de l'auteur. Désormais chaque voix appartient à
-- un compte (voir migration 0008) et la colonne `votes` n'est plus qu'un cache
-- de la somme, tenu à jour par l'API — elle reste la clé de tri et alimente
-- /api/store/summary.

CREATE TABLE IF NOT EXISTS paniers_communs_votes (
  ligne_id       TEXT NOT NULL REFERENCES paniers_communs_lignes(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  valeur         INTEGER NOT NULL CHECK (valeur IN (-1, 1)),
  cree_le        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (ligne_id, utilisateur_id)
);

CREATE INDEX IF NOT EXISTS idx_pc_votes_ligne ON paniers_communs_votes(ligne_id);

CREATE TABLE IF NOT EXISTS paniers_communs_commentaires (
  id             TEXT PRIMARY KEY,
  ligne_id       TEXT NOT NULL REFERENCES paniers_communs_lignes(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  texte          TEXT NOT NULL,
  cree_le        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pc_commentaires_ligne ON paniers_communs_commentaires(ligne_id);

-- Les compteurs existants sont anonymes : impossible de savoir qui a voté quoi,
-- donc impossible de les convertir en votes nominatifs. On repart de zéro.
UPDATE paniers_communs_lignes SET votes = 0;
