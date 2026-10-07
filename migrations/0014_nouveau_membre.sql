-- Nouveau membre de l'équipe (groupe B), avec son compte de connexion.
--
-- Nom provisoire « Nouveau membre » : le prénom, le rôle, les horaires et les
-- soldes se complètent ensuite depuis l'agenda. Attention, l'identifiant de
-- connexion (`nouveau`) ne suit pas un renommage dans `equipe` : il se change
-- à la main dans `utilisateurs` si besoin.
--
-- Mot de passe par défaut « ludo92 », à changer à la première connexion,
-- comme pour les comptes de 0008_utilisateurs.sql.

INSERT INTO equipe (id, nom, groupe, heures_hebdo_base, solde_conges, solde_rtt, solde_recup, horaires, absences_hs)
  SELECT lower(hex(randomblob(16))), 'Nouveau membre', 'B', 0, 0, 0, 0, '{}', '[]'
  WHERE NOT EXISTS (SELECT 1 FROM equipe WHERE nom = 'Nouveau membre');

INSERT OR IGNORE INTO utilisateurs (id, equipe_id, identifiant, mot_de_passe_hash)
  SELECT lower(hex(randomblob(16))), id, 'nouveau',
         'pbkdf2$50000$g+kG5cJYWXizdqIhBeJX4g==$uNGQlFq7fEIiSrn+W4Vt/YMfXIBwNYXlYDBEIXIkWpc='
  FROM equipe WHERE nom = 'Nouveau membre';
