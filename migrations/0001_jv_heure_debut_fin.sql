-- Migration: ajouter heure_debut et heure_fin aux réservations JV
-- Remplace le champ creneau (ex: "16h-17h") par des horaires précis (ex: "16:00", "16:45")

ALTER TABLE jv_reservations ADD COLUMN heure_debut TEXT;
ALTER TABLE jv_reservations ADD COLUMN heure_fin   TEXT;

-- Rétro-compatibilité : remplir heure_debut/heure_fin depuis les anciennes valeurs creneau
UPDATE jv_reservations
SET
  heure_debut = CASE
    WHEN creneau = '15h-16h' THEN '15:00'
    WHEN creneau = '16h-17h' THEN '16:00'
    WHEN creneau = '17h-18h' THEN '17:00'
    ELSE '16:00'
  END,
  heure_fin = CASE
    WHEN creneau = '15h-16h' THEN '16:00'
    WHEN creneau = '16h-17h' THEN '17:00'
    WHEN creneau = '17h-18h' THEN '18:00'
    ELSE '17:00'
  END
WHERE heure_debut IS NULL;
