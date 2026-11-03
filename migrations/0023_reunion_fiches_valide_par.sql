-- Validation personnelle d'une mission à plusieurs : depuis l'accueil, chaque
-- membre assigné coche sa part sans terminer la mission pour les autres.
-- Tableau JSON d'identifiants `equipe`. Quand tous les assignés ont validé, la
-- mission passe à `fait` ; « Fait » depuis le Bureau la termine pour tout le
-- monde, et la rouvrir remet les validations à zéro.
ALTER TABLE reunion_fiches ADD COLUMN valide_par TEXT NOT NULL DEFAULT '[]';
