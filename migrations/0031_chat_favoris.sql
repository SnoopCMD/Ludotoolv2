-- Messagerie : GIF et stickers favoris, par compte.
--
-- `media` garde de quoi afficher le favori sans rien redemander : pour un GIF
-- (qui vit chez GIPHY, pas chez nous), la pièce complète ; pour un sticker,
-- ses dimensions (le fichier reste dans R2 même si le sticker est retiré de
-- la bibliothèque, donc un favori ne casse pas).
CREATE TABLE IF NOT EXISTS chat_favoris (
  utilisateur_id TEXT NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('gif', 'sticker')),
  ref_id         TEXT NOT NULL,
  media          TEXT NOT NULL,
  cree_le        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (utilisateur_id, type, ref_id)
);
