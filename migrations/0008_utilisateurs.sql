-- Comptes utilisateurs : un compte par membre de l'équipe.
--
-- Mot de passe par défaut « ludo92 », à changer à la première connexion
-- (doit_changer_mdp = 1). Le hash est un PBKDF2-SHA256 précalculé, au format
-- pbkdf2$<iterations>$<sel base64>$<empreinte base64> — voir lib/auth.ts.
-- Le sel commun n'a pas d'importance ici : ce mot de passe est temporaire et
-- chaque changement génère un sel aléatoire.

CREATE TABLE IF NOT EXISTS utilisateurs (
  id                TEXT PRIMARY KEY,
  equipe_id         TEXT NOT NULL UNIQUE REFERENCES equipe(id) ON DELETE CASCADE,
  identifiant       TEXT NOT NULL UNIQUE,
  mot_de_passe_hash TEXT NOT NULL,
  doit_changer_mdp  INTEGER NOT NULL DEFAULT 1,
  cree_le           TEXT NOT NULL DEFAULT (datetime('now')),
  derniere_connexion TEXT
);

-- Sessions : le cookie ne porte qu'un jeton opaque, tout l'état est ici.
CREATE TABLE IF NOT EXISTS utilisateur_sessions (
  token          TEXT PRIMARY KEY,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  cree_le        TEXT NOT NULL DEFAULT (datetime('now')),
  expire_le      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_utilisateur ON utilisateur_sessions(utilisateur_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expire ON utilisateur_sessions(expire_le);

-- Les 5 comptes, rattachés aux membres déjà présents dans `equipe`.
-- Le rattachement se fait par nom : sur une base locale vide, les INSERT ne
-- créent simplement rien.
INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'bernard',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Bernard';

INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'elisabeth',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Elisabeth';

INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'lea',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Léa';

INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'pierre',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Pierre';

INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'timothe',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Timothé';
