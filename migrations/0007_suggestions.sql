-- Suggestions d'amélioration du logiciel
CREATE TABLE IF NOT EXISTS suggestions (
  id         TEXT PRIMARY KEY,
  titre      TEXT NOT NULL DEFAULT 'Sans titre',
  contenu    TEXT,
  couleur    TEXT NOT NULL DEFAULT 'yellow',
  tags       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
