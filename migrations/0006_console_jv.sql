-- Ajout du champ console sur les lignes de paniers (JV)
ALTER TABLE panier_lignes ADD COLUMN console TEXT;
ALTER TABLE paniers_communs_lignes ADD COLUMN console TEXT;
