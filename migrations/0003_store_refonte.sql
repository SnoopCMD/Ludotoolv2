-- Migration: refonte Store — type/tags/profil sur paniers + paniers communs avec upvotes

ALTER TABLE paniers ADD COLUMN type TEXT NOT NULL DEFAULT 'JdS';
ALTER TABLE paniers ADD COLUMN tags TEXT;
ALTER TABLE paniers ADD COLUMN profil TEXT;

CREATE TABLE IF NOT EXISTS paniers_communs (
  id         TEXT PRIMARY KEY,
  type       TEXT NOT NULL,
  nom        TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS paniers_communs_lignes (
  id                TEXT    PRIMARY KEY,
  panier_commun_id  TEXT    NOT NULL REFERENCES paniers_communs(id) ON DELETE CASCADE,
  nom               TEXT    NOT NULL,
  editeur           TEXT,
  image_url         TEXT,
  ean               TEXT,
  prix_unitaire     REAL,
  quantite          INTEGER NOT NULL DEFAULT 1,
  notes             TEXT,
  profil            TEXT,
  votes             INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT    DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO paniers_communs (id, type, nom) VALUES
  ('commun-jds',   'JdS',   'Commande commune JdS'),
  ('commun-jv',    'JV',    'Commande commune JV'),
  ('commun-jouet', 'jouet', 'Commande commune Jouets');

CREATE INDEX IF NOT EXISTS idx_paniers_communs_lignes ON paniers_communs_lignes(panier_commun_id);
