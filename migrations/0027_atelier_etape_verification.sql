-- Atelier : nouvelles étapes de préparation, à faire dans l'ordre.
--
--   1. Plastification + équiper (code-barre, puce RFID) : etape_plastifier ET etape_equiper
--   2. Encoder                                          : etape_encoder
--   3. Vérification des pièces + contenu sur LudoTool   : etape_verification (nouvelle)
--   4. Impression et collage du contenu                 : etape_contenu
--   5. Impression et collage des étiquettes             : etape_etiquette
--   6. Notice Syracuse + exemplaire + piège             : etape_notice
--   7. Étiquette nouveauté + jeu sur place              : etape_nouveaute (pas pour les doubles)
--
-- Voir lib/etapesAtelier.ts.

ALTER TABLE jeux ADD COLUMN etape_verification INTEGER NOT NULL DEFAULT 0;

-- Jeux déjà sortis de l'atelier : l'étape est faite.
UPDATE jeux SET etape_verification = 1 WHERE statut != 'En préparation';

-- Jeux en préparation dont le contenu est déjà imprimé : les pièces ont été vérifiées.
UPDATE jeux SET etape_verification = 1 WHERE statut = 'En préparation' AND etape_contenu = 1;
