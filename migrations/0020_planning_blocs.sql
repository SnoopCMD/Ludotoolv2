-- Blocs spéciaux du planning : jeux vidéo, animations… Des modèles qui
-- reviennent selon une répétition et se placent dans les semaines du planning
-- à côté de la salle principale.
--
-- `creneaux` : tableau JSON de { jour, debut, fin }, un par jour de la semaine
-- (`jour` comme Date.getDay() : 0 dimanche … 6 samedi). Pour une date unique
-- (`repetition` = 'ponctuel'), `date_debut` est cette date et le créneau de son
-- jour donne les horaires.
--
-- Les semaines du planning (`planning_semaine.slots`) gardent leurs créneaux :
-- un bloc y a `room` = id du bloc. Modifier un modèle met à jour les semaines
-- en cours et à venir quand on les ouvre, jamais les semaines passées.

CREATE TABLE IF NOT EXISTS planning_blocs (
  id           TEXT PRIMARY KEY,
  nom          TEXT NOT NULL,
  icone        TEXT,
  couleur      TEXT,
  -- Personnes nécessaires : en dessous, le créneau est signalé.
  nb_personnes INTEGER NOT NULL DEFAULT 1,
  -- hebdo | semaineA | semaineB | ponctuel
  repetition   TEXT NOT NULL DEFAULT 'hebdo',
  date_debut   TEXT,
  date_fin     TEXT,
  creneaux     TEXT NOT NULL DEFAULT '[]',
  ordre        INTEGER NOT NULL DEFAULT 0,
  cree_le      TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Le bloc jeux vidéo existait déjà en dur : il devient le premier modèle,
-- avec les mêmes horaires. Son id reste 'jv', celui des créneaux déjà saisis.
INSERT OR IGNORE INTO planning_blocs (id, nom, icone, couleur, nb_personnes, repetition, creneaux, ordre) VALUES
  ('jv', 'Jeux vidéo', '🎮', '#a8e063', 1, 'hebdo',
   '[{"jour":2,"debut":"16:00","fin":"18:00"},{"jour":3,"debut":"15:00","fin":"17:00"},{"jour":4,"debut":"15:00","fin":"17:00"},{"jour":5,"debut":"16:00","fin":"18:00"}]', 0);

-- planning_blocs → agenda
CREATE TRIGGER IF NOT EXISTS maj_planning_blocs_insert AFTER INSERT ON planning_blocs
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
CREATE TRIGGER IF NOT EXISTS maj_planning_blocs_update AFTER UPDATE ON planning_blocs
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
CREATE TRIGGER IF NOT EXISTS maj_planning_blocs_delete AFTER DELETE ON planning_blocs
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'agenda'; END;
