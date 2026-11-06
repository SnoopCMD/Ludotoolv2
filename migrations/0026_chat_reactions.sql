-- Messagerie : réactions aux messages (une émote posée sur un message).
--
-- Une ligne par (message, compte, émote) : on peut mettre plusieurs émotes
-- différentes sur un même message, mais chacune une seule fois. Recliquer
-- l'enlève.
--
-- Poser ou retirer une réaction avance `chat_messages.modifie_le` : le
-- message, réactions comprises, repart alors aux autres postes par le même
-- chemin qu'une suppression (direct, ou `depuis` pour ceux qui sondent).

CREATE TABLE IF NOT EXISTS chat_reactions (
  message_id     INTEGER NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  emoji          TEXT NOT NULL,
  cree_le        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (message_id, utilisateur_id, emoji)
);
