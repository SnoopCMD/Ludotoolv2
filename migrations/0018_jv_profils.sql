-- Profils des usagers du pôle jeux vidéo.
--
-- On scanne la carte de l'usager (ou on cherche son prénom) pour remplir une
-- réservation en un geste, au lieu de ressaisir prénom, sexe et tranche d'âge à
-- chaque venue. Les tranches et les sexes sont ceux des réservations
-- (`jv_reservations.joueurs_details`), pour que les statistiques restent
-- comparables.
--
-- `recherche` est le prénom en minuscules sans accents, rempli par l'API : la
-- recherche de SQLite ne sait pas ignorer les accents toute seule.
-- `utilise_le` remonte en tête de la recherche les habitués du moment.

CREATE TABLE IF NOT EXISTS jv_profils (
  id           TEXT PRIMARY KEY,
  prenom       TEXT NOT NULL,
  numero_carte TEXT UNIQUE,
  -- H | F | N
  sexe         TEXT,
  -- 11-16 | 16-18 | 18+ | parent
  age          TEXT,
  recherche    TEXT NOT NULL DEFAULT '',
  cree_le      TEXT NOT NULL DEFAULT (datetime('now')),
  utilise_le   TEXT
);

CREATE INDEX IF NOT EXISTS idx_jv_profils_recherche ON jv_profils(recherche);
