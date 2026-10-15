-- Suggestions : auteur et suivi des nouveautés.
--
-- `auteur_id` : compte connecté au moment de la création (NULL hors connexion,
-- et pour toutes les suggestions antérieures). Renseigné par l'API à partir de
-- la session, jamais par le client.
--
-- `vue` : 0 tant que Timothé n'a pas ouvert la page Suggestions depuis la
-- création. Alimente la pastille rouge de la barre de navigation, visible de lui
-- seul. Les suggestions existantes sont considérées comme déjà vues.

ALTER TABLE suggestions ADD COLUMN auteur_id TEXT REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE suggestions ADD COLUMN vue INTEGER NOT NULL DEFAULT 1;
