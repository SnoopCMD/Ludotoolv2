-- Commentaires sur les suggestions, et notification de l'auteur.
--
-- Écriture réservée aux comptes connectés (comme les commentaires du Store),
-- lecture ouverte à tous. `lu_par_auteur` vaut 0 tant que l'auteur de la
-- suggestion n'a pas ouvert la note depuis le commentaire : ces commentaires
-- s'ajoutent à sa pastille sur le bouton Suggestions. Un commentaire de
-- l'auteur lui-même, ou sur une suggestion sans auteur, est créé déjà lu.

CREATE TABLE IF NOT EXISTS suggestions_commentaires (
  id             TEXT PRIMARY KEY,
  suggestion_id  TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  texte          TEXT NOT NULL,
  lu_par_auteur  INTEGER NOT NULL DEFAULT 0,
  cree_le        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sugg_commentaires_suggestion ON suggestions_commentaires(suggestion_id);
