-- Fermeture exceptionnelle « jour non travaillé » : la journée compte comme un
-- férié (pas d'horaires d'équipe, pas d'heures attendues, pas décomptée des
-- congés). 0 pour tous les autres événements.
ALTER TABLE evenements ADD COLUMN non_travaille INTEGER NOT NULL DEFAULT 0;
