-- Messagerie interne (premier jet : une conversation générale).
--
-- Pensé pour la suite : plusieurs conversations (groupes, messages privés),
-- réactions, et un transport en direct (WebSocket) à la place du sondage.
--
-- `chat_messages.id` est un entier croissant : c'est le curseur du flux
-- (« donne-moi tout ce qui est après 1234 »), le même que le transport soit un
-- sondage ou une connexion ouverte. Ne pas le remplacer par un UUID.

CREATE TABLE IF NOT EXISTS chat_conversations (
  id         TEXT PRIMARY KEY,
  nom        TEXT NOT NULL,
  -- 'general' pour l'instant ; 'groupe' et 'prive' viendront avec les membres.
  type       TEXT NOT NULL DEFAULT 'general',
  cree_le    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO chat_conversations (id, nom, type) VALUES ('general', 'Général', 'general');

CREATE TABLE IF NOT EXISTS chat_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  auteur_id       TEXT NOT NULL REFERENCES utilisateurs(id),
  contenu         TEXT NOT NULL,
  -- Identifiant tiré par le client à l'envoi : un renvoi après une coupure
  -- réseau ne crée pas de doublon, et le message « en cours d'envoi » affiché
  -- tout de suite est reconnu quand il revient du serveur.
  client_id       TEXT,
  cree_le         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  modifie_le      TEXT,
  -- Suppression douce : le message reste dans le flux (« message supprimé »)
  -- pour que les curseurs et les futures réactions ne pointent pas dans le vide.
  supprime        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON chat_messages (conversation_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_client ON chat_messages (auteur_id, client_id);

-- Dernier message lu par compte et par conversation : sert la pastille.
CREATE TABLE IF NOT EXISTS chat_lectures (
  utilisateur_id  TEXT NOT NULL REFERENCES utilisateurs(id),
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id),
  dernier_lu      INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (utilisateur_id, conversation_id)
);

-- Pastille de la barre : le domaine « chat » de /api/maj bouge à chaque message.
INSERT OR IGNORE INTO maj_versions (domaine, version) VALUES ('chat', 0);

CREATE TRIGGER IF NOT EXISTS maj_chat_messages_insert AFTER INSERT ON chat_messages
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'chat'; END;
CREATE TRIGGER IF NOT EXISTS maj_chat_messages_update AFTER UPDATE ON chat_messages
BEGIN UPDATE maj_versions SET version = version + 1 WHERE domaine = 'chat'; END;
