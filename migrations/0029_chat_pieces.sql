-- Messagerie : pièces jointes aux messages (GIF, et bientôt stickers).
--
-- `piece` est un JSON décrivant ce qu'affiche le message à la place (ou en
-- plus) du texte, par exemple un GIF GIPHY :
--   {"type":"gif","id":"…","url":"https://media.giphy.com/…","mp4":"…",
--    "largeur":200,"hauteur":150,"titre":"…"}
-- NULL pour un message texte. Le format est validé par `pieceValide`
-- (lib/chat.ts) avant d'être écrit.
ALTER TABLE chat_messages ADD COLUMN piece TEXT;
