-- Messagerie : stickers importés par l'équipe.
--
-- Une bibliothèque commune : chacun importe une image (PNG, JPEG, WebP ou
-- GIF animé), tout le monde peut l'envoyer. Le fichier est dans R2 (bucket
-- `ludotool-regles`, binding REGLES, sous `chat/stickers/<id>`), servi par
-- `/api/chat/stickers/<id>/image`.
--
-- Retirer un sticker le cache de la bibliothèque (`supprime = 1`) sans
-- effacer le fichier : les messages qui l'ont déjà envoyé l'affichent encore.
CREATE TABLE IF NOT EXISTS chat_stickers (
  id         TEXT PRIMARY KEY,
  auteur_id  TEXT NOT NULL REFERENCES utilisateurs(id),
  type_mime  TEXT NOT NULL,
  largeur    INTEGER NOT NULL,
  hauteur    INTEGER NOT NULL,
  taille     INTEGER NOT NULL,
  cree_le    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  supprime   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_chat_stickers_cree ON chat_stickers (supprime, cree_le);
