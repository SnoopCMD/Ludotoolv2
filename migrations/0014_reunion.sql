-- Page Réunion : points à aborder, missions, préparation d'événements et
-- comptes rendus de séance.
--
-- Points et missions partagent une seule table (`reunion_fiches.genre`) : un
-- point abordé en réunion devient souvent une mission, et la conversion ne doit
-- rien perdre (description, deadline, événement lié).
--
-- Les événements préparés ici sont distincts de `evenements` (agenda) : un
-- projet d'animation vit ici tant qu'il n'est pas prêt à figurer au planning.
-- `agenda_id` garde le lien une fois l'événement poussé dans l'agenda.
-- Pas de clé étrangère vers lui : l'agenda peut supprimer sa ligne de son côté,
-- la route de synchronisation recrée alors l'événement.

CREATE TABLE IF NOT EXISTS reunion_evenements (
  id           TEXT PRIMARY KEY,
  titre        TEXT NOT NULL,
  type         TEXT NOT NULL DEFAULT 'Animation',
  -- Facultatives : un projet peut exister avant d'être daté.
  date_debut   TEXT,
  date_fin     TEXT,
  heure_debut  TEXT,
  heure_fin    TEXT,
  lieu         TEXT,
  description  TEXT,
  -- idee | preparation | pret | termine | annule
  statut       TEXT NOT NULL DEFAULT 'idee',
  -- Tableau JSON d'identifiants `equipe`.
  responsables TEXT NOT NULL DEFAULT '[]',
  agenda_id    TEXT,
  cree_par     TEXT,
  cree_le      TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reunion_seances (
  id           TEXT PRIMARY KEY,
  date         TEXT NOT NULL,
  titre        TEXT,
  -- en_cours | terminee. Une seule séance en cours à la fois (vérifié par l'API).
  statut       TEXT NOT NULL DEFAULT 'en_cours',
  participants TEXT NOT NULL DEFAULT '[]',
  compte_rendu TEXT,
  cree_par     TEXT,
  cree_le      TEXT NOT NULL DEFAULT (datetime('now')),
  terminee_le  TEXT
);

CREATE TABLE IF NOT EXISTS reunion_fiches (
  id           TEXT PRIMARY KEY,
  -- point (sujet à aborder en réunion) | mission (tâche à réaliser)
  genre        TEXT NOT NULL DEFAULT 'point',
  titre        TEXT NOT NULL,
  description  TEXT,
  -- a_faire | en_cours | fait. Pour un point, « fait » veut dire « abordé ».
  statut       TEXT NOT NULL DEFAULT 'a_faire',
  -- 0 basse, 1 normale, 2 haute, 3 urgente
  priorite     INTEGER NOT NULL DEFAULT 1,
  deadline     TEXT,
  assignes     TEXT NOT NULL DEFAULT '[]',
  evenement_id TEXT,
  -- Séance où la fiche a été traitée ou créée : alimente le compte rendu.
  seance_id    TEXT,
  decision     TEXT,
  cree_par     TEXT,
  cree_le      TEXT NOT NULL DEFAULT (datetime('now')),
  maj_le       TEXT NOT NULL DEFAULT (datetime('now')),
  fait_le      TEXT
);

CREATE INDEX IF NOT EXISTS idx_reunion_fiches_evenement ON reunion_fiches(evenement_id);
CREATE INDEX IF NOT EXISTS idx_reunion_fiches_seance    ON reunion_fiches(seance_id);
