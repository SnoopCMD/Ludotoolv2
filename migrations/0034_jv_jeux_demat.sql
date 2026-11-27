-- Jeux vidéo : support du jeu. 1 = dématérialisé (pas de boîte, pas d'EAN),
-- 0 = physique. Les jeux existants restent physiques.
ALTER TABLE jv_jeux ADD COLUMN demat INTEGER NOT NULL DEFAULT 0;
