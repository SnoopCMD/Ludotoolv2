-- Messagerie : conversations privées.
--
-- Une conversation privée (`type = 'prive'`) a ses membres dans
-- `chat_membres` ; seule eux la voient. La conversation générale n'a pas de
-- membres : tous les comptes y ont accès. La table servira aussi aux groupes.
--
-- Identifiant d'une conversation à deux : `prive-<id1>-<id2>`, ids des
-- comptes triés. Ouvrir la discussion avec quelqu'un est donc idempotent.

CREATE TABLE IF NOT EXISTS chat_membres (
  conversation_id TEXT NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  utilisateur_id  TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  ajoute_le       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (conversation_id, utilisateur_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_membres_utilisateur ON chat_membres (utilisateur_id);
