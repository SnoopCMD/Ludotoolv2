-- Banque de correspondances : libellé MyLudo (mécanisme, catégorie…) → une de
-- nos mécaniques d'étiquette (lib/etiquetteJeu.ts, MECANIQUES).
--
-- Remplie depuis la modal vignette / étiquette de l'atelier quand un libellé
-- MyLudo n'a pas d'équivalent connu ; /api/myludo s'en sert ensuite pour
-- proposer la mécanique des jeux suivants. `cle` est le libellé normalisé
-- (minuscules, sans accents ni ponctuation), `libelle` tel que MyLudo l'écrit.

CREATE TABLE IF NOT EXISTS mecaniques_correspondances (
  cle         TEXT PRIMARY KEY,
  libelle     TEXT NOT NULL,
  mecanique   TEXT NOT NULL,
  cree_par    TEXT,
  modifie_le  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
