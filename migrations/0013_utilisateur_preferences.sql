-- Préférences d'affichage par compte : les modules choisis sur le tableau de
-- bord. Table à part plutôt qu'une colonne sur `utilisateurs` pour que la
-- requête de session (lib/auth.ts) n'ait pas à changer, et qu'un compte sans
-- préférence enregistrée garde simplement la présentation par défaut.
--
-- `accueil_modules` est un tableau JSON d'identifiants de modules, dans l'ordre
-- d'affichage (voir MODULES dans components/ModulesAccueil.tsx). Un identifiant
-- inconnu est ignoré à la lecture : retirer un module du code ne casse rien.

CREATE TABLE IF NOT EXISTS utilisateur_preferences (
  utilisateur_id  TEXT PRIMARY KEY REFERENCES utilisateurs(id) ON DELETE CASCADE,
  accueil_modules TEXT NOT NULL DEFAULT '[]',
  maj_le          TEXT NOT NULL DEFAULT (datetime('now'))
);
