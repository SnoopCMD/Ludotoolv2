-- EAN custom unique pour les jeux saisis sans code-barres.
--
-- Avant : tous les jeux ajoutés « à la main » dans l'atelier avaient
-- `ean = 'Manuel'`. Ce n'est pas un identifiant : ils se mélangeaient entre
-- eux et n'avaient pas de ligne dans `catalogue`, donc ils n'apparaissaient
-- ni dans les tables de contenus ni dans celles des étiquettes.
--
-- Désormais chaque jeu sans EAN reçoit un code unique `CUST-…` (voir
-- lib/eanCustom.ts). Cette migration convertit l'existant : chaque ligne de
-- `jeux` en 'Manuel' prend `CUST-<id sur 6 chiffres>`, unique par construction,
-- et obtient sa ligne dans `catalogue` pour redevenir visible partout.
--
-- Les réceptions déjà loguées dans `commandes` avec 'Manuel' sont laissées
-- telles quelles : c'est un historique, et on ne peut pas les rattacher de
-- façon fiable à un jeu précis.

UPDATE jeux
SET ean = 'CUST-' || printf('%06d', id)
WHERE ean = 'Manuel';

INSERT OR IGNORE INTO catalogue (ean, nom)
SELECT ean, nom
FROM jeux
WHERE ean LIKE 'CUST-%'
  AND ean NOT IN (SELECT ean FROM catalogue);
