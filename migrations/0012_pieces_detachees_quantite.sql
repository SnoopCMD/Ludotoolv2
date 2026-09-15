-- Quantité réelle sur les pièces détachées.
--
-- Avant : « 6 cartes » était un texte libre, donc impossible d'en prélever 2
-- sans réécrire la ligne. On sépare la quantité (colonne `quantite`) de la
-- nature de la pièce (`description`), pour pouvoir décrémenter le stock.
--
-- Conversion de l'existant : si la description commence par un nombre, il
-- devient la quantité et disparaît du texte (« 19 grosses billes noires » →
-- 19 × « grosses billes noires »). CAST(... AS INTEGER) en SQLite lit le
-- préfixe numérique et renvoie 0 s'il n'y en a pas — ces lignes gardent 1.

ALTER TABLE pieces_detachees ADD COLUMN quantite INTEGER NOT NULL DEFAULT 1;

UPDATE pieces_detachees
SET quantite    = CAST(description AS INTEGER),
    description = ltrim(substr(description, length(CAST(CAST(description AS INTEGER) AS TEXT)) + 1))
WHERE CAST(description AS INTEGER) > 0
  AND substr(description, 1, 1) BETWEEN '1' AND '9';
