-- Mises à jour en temps réel.
--
-- Chaque écriture sur une table suivie incrémente le compteur de son domaine
-- (alertes, jv, suggestions, reunion, agenda). Les pages ouvertes interrogent
-- `/api/maj` toutes les quelques secondes : une seule petite table à lire, et
-- elles ne rechargent leurs données que si le compteur de leur domaine a bougé.
-- Les déclencheurs couvrent toutes les routes d'écriture, présentes et futures,
-- sans avoir à y penser dans chacune.

CREATE TABLE IF NOT EXISTS maj_versions (
  domaine TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO maj_versions (domaine, version) VALUES
  ('alertes', 0), ('jv', 0), ('suggestions', 0), ('reunion', 0), ('agenda', 0);

-- alertes → alertes
CREATE TRIGGER IF NOT EXISTS maj_alertes_insert AFTER INSERT ON alertes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;
CREATE TRIGGER IF NOT EXISTS maj_alertes_update AFTER UPDATE ON alertes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;
CREATE TRIGGER IF NOT EXISTS maj_alertes_delete AFTER DELETE ON alertes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;

-- jeux → alertes
CREATE TRIGGER IF NOT EXISTS maj_jeux_insert AFTER INSERT ON jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;
CREATE TRIGGER IF NOT EXISTS maj_jeux_update AFTER UPDATE OF notes_rappel, notes, etape_nouveaute, statut, date_sortie ON jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;
CREATE TRIGGER IF NOT EXISTS maj_jeux_delete AFTER DELETE ON jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'alertes'; END;

-- jv_reservations → jv
CREATE TRIGGER IF NOT EXISTS maj_jv_reservations_insert AFTER INSERT ON jv_reservations
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_reservations_update AFTER UPDATE ON jv_reservations
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_reservations_delete AFTER DELETE ON jv_reservations
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;

-- jv_notes → jv
CREATE TRIGGER IF NOT EXISTS maj_jv_notes_insert AFTER INSERT ON jv_notes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_notes_update AFTER UPDATE ON jv_notes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_notes_delete AFTER DELETE ON jv_notes
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;

-- jv_selections → jv
CREATE TRIGGER IF NOT EXISTS maj_jv_selections_insert AFTER INSERT ON jv_selections
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_selections_update AFTER UPDATE ON jv_selections
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_selections_delete AFTER DELETE ON jv_selections
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;

-- jv_jeux → jv
CREATE TRIGGER IF NOT EXISTS maj_jv_jeux_insert AFTER INSERT ON jv_jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_jeux_update AFTER UPDATE ON jv_jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_jeux_delete AFTER DELETE ON jv_jeux
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;

-- jv_rotation_config → jv
CREATE TRIGGER IF NOT EXISTS maj_jv_rotation_config_insert AFTER INSERT ON jv_rotation_config
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_rotation_config_update AFTER UPDATE ON jv_rotation_config
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;
CREATE TRIGGER IF NOT EXISTS maj_jv_rotation_config_delete AFTER DELETE ON jv_rotation_config
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'jv'; END;

-- suggestions → suggestions
CREATE TRIGGER IF NOT EXISTS maj_suggestions_insert AFTER INSERT ON suggestions
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;
CREATE TRIGGER IF NOT EXISTS maj_suggestions_update AFTER UPDATE ON suggestions
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;
CREATE TRIGGER IF NOT EXISTS maj_suggestions_delete AFTER DELETE ON suggestions
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;

-- suggestions_commentaires → suggestions
CREATE TRIGGER IF NOT EXISTS maj_suggestions_commentaires_insert AFTER INSERT ON suggestions_commentaires
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;
CREATE TRIGGER IF NOT EXISTS maj_suggestions_commentaires_update AFTER UPDATE ON suggestions_commentaires
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;
CREATE TRIGGER IF NOT EXISTS maj_suggestions_commentaires_delete AFTER DELETE ON suggestions_commentaires
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'suggestions'; END;

-- reunion_fiches → reunion
CREATE TRIGGER IF NOT EXISTS maj_reunion_fiches_insert AFTER INSERT ON reunion_fiches
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_fiches_update AFTER UPDATE ON reunion_fiches
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_fiches_delete AFTER DELETE ON reunion_fiches
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;

-- reunion_evenements → reunion
CREATE TRIGGER IF NOT EXISTS maj_reunion_evenements_insert AFTER INSERT ON reunion_evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_evenements_update AFTER UPDATE ON reunion_evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_evenements_delete AFTER DELETE ON reunion_evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;

-- reunion_seances → reunion
CREATE TRIGGER IF NOT EXISTS maj_reunion_seances_insert AFTER INSERT ON reunion_seances
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_seances_update AFTER UPDATE ON reunion_seances
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;
CREATE TRIGGER IF NOT EXISTS maj_reunion_seances_delete AFTER DELETE ON reunion_seances
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'reunion'; END;

-- evenements → agenda
CREATE TRIGGER IF NOT EXISTS maj_evenements_insert AFTER INSERT ON evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
CREATE TRIGGER IF NOT EXISTS maj_evenements_update AFTER UPDATE ON evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
CREATE TRIGGER IF NOT EXISTS maj_evenements_delete AFTER DELETE ON evenements
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
