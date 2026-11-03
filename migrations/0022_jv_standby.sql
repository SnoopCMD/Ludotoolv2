-- Stand-by d'une sélection jeux vidéo (un emplacement de rotation : PS5,
-- Switch Multi, Switch Solo, PC).
--
-- Pendant un stand-by, la sélection de l'emplacement est gelée : elle n'est
-- ni affichée aux réservations ni remplacée par la rotation (la file d'attente
-- reste intacte et reprend à la fin). À la place, on propose :
--   - `mode = 'aucun'`     : poste fermé, aucun jeu réservable ;
--   - `mode = 'selection'` : les jeux de `jeux_ids` (composés à la main ou repris
--                            d'un groupe), plus les permanents si
--                            `inclure_permanents` vaut 1.
-- `date_fin` NULL = durée indéterminée. Un stand-by dont `date_fin` est passée
-- n'a plus d'effet ; il est remplacé au prochain enregistrement.
CREATE TABLE IF NOT EXISTS jv_standby (
  slot               TEXT PRIMARY KEY,
  date_debut         TEXT NOT NULL,
  date_fin           TEXT,
  mode               TEXT NOT NULL DEFAULT 'aucun' CHECK (mode IN ('aucun', 'selection')),
  jeux_ids           TEXT NOT NULL DEFAULT '[]',
  inclure_permanents INTEGER NOT NULL DEFAULT 0,
  motif              TEXT,
  cree_le            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS maj_jv_standby_insert AFTER INSERT ON jv_standby
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_standby_update AFTER UPDATE ON jv_standby
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_standby_delete AFTER DELETE ON jv_standby
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
