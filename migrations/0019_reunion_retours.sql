-- Retours sur événement : le bilan d'une animation une fois passée.
--
-- Un seul retour par événement (`evenement_id` unique), modifiable par toute
-- l'équipe comme le reste du Bureau. Il porte toujours sur une ligne de
-- `reunion_evenements` : un événement saisi directement dans l'agenda y est
-- d'abord importé (statut « terminé », `agenda_id` renseigné) au moment où l'on
-- écrit son retour.

CREATE TABLE IF NOT EXISTS reunion_retours (
  id            TEXT PRIMARY KEY,
  evenement_id  TEXT NOT NULL UNIQUE,
  -- Nombre de personnes accueillies (facultatif).
  frequentation INTEGER,
  -- Ressenti global, de 1 à 5.
  note          INTEGER,
  -- oui | a_voir | non
  a_refaire     TEXT,
  positif       TEXT,
  ameliorer     TEXT,
  idees         TEXT,
  cree_par      TEXT,
  cree_le       TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- reunion_retours → reunion
CREATE TRIGGER IF NOT EXISTS maj_reunion_retours_insert AFTER INSERT ON reunion_retours
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_retours_update AFTER UPDATE ON reunion_retours
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_retours_delete AFTER DELETE ON reunion_retours
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
