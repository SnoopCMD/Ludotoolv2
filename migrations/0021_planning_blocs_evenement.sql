-- Un bloc spécial peut être lié à un événement de l'agenda (animation, soirée
-- jeux…) : il en suit alors les dates et les horaires au lieu de sa propre
-- répétition. Pour une série récurrente, c'est l'identifiant de la série
-- (`evenements.parent_id`) qui est retenu, pour suivre toutes ses dates même
-- quand l'agenda recrée les occurrences.
ALTER TABLE planning_blocs ADD COLUMN evenement_id TEXT;
