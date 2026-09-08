-- Migration: créer la table de notes pour la section Jeux Vidéo

CREATE TABLE IF NOT EXISTS jv_notes (
  id         TEXT PRIMARY KEY,
  titre      TEXT NOT NULL DEFAULT 'Sans titre',
  contenu    TEXT,
  couleur    TEXT NOT NULL DEFAULT 'yellow',
  tags       TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
