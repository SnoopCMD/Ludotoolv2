-- Qui présente un point en réunion : un membre de l'équipe (son id `equipe`)
-- ou une personne extérieure (son nom tel quel). Les comptes rendus le
-- mettaient jusqu'ici dans le titre (« RH par Ariane ») ; c'est aussi ce que
-- l'import de comptes rendus remplit.
ALTER TABLE reunion_fiches ADD COLUMN intervenant TEXT;
